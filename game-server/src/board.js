// The class leaderboard (Donny, 2026-10-08): one Durable Object, "main", that
// keeps the roster, the students' Class Pass sign-ins and every result that
// counts, in its own small SQLite database.
//
// Nobody reaches it from the internet. The Pages site (site/server/worker.js)
// asks it things through a LiveGame named "_board", which passes the request
// on (so the site needs no binding beyond LIVE), and a finished live game
// reports its results here itself.
//
// Students are known by their school email, which only the teacher ever sees.
// Leaderboards show "First L." (more letters of the last name when two
// students in the class would look the same).
//
// What is kept:
//   roster    one row per student: email, first name, last name, period
//   sessions  a Class Pass sign-in on one device (only a hash of its key)
//   handoff   a sign-in waiting to be picked up by the page that asked for it
//   events    one row per result: a live game a student played, a practice
//             Match finished, a practice test, a Learn set mastered
import { DurableObject } from 'cloudflare:workers';

const SESSION_DAYS = 120;
const HANDOFF_MS = 10 * 60 * 1000;
// A student can send at most this many practice results an hour.
const REPORTS_PER_HOUR = 120;
const TOP = 10;
const TEACHER_TOP = 200;

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const randomKey = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function sha(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const int = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};
const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
const SET_ID = /^[A-Za-z0-9_-]{1,60}$/;
const GAMES = ['volley', 'blast', 'match'];
// The day in California, for "once a day" counting.
const dayOf = (ms) => new Date(ms - 7 * 3600 * 1000).toISOString().slice(0, 10);

// "Maya R." for each student, with more of the last name where two would match.
export function displayNames(rows) {
  const out = {};
  const groups = {};
  rows.forEach((r) => {
    const first = clean(r.first, 40) || 'Student';
    (groups[first.toLowerCase()] = groups[first.toLowerCase()] || []).push(r);
  });
  Object.values(groups).forEach((list) => {
    list.forEach((r) => {
      const first = clean(r.first, 40) || 'Student';
      const last = clean(r.last, 60);
      if (!last) { out[r.email] = first; return; }
      let n = 1;
      const key = (x, k) => clean(x.last, 60).slice(0, k).toLowerCase();
      while (n < last.length && list.some((o) => o !== r && key(o, n) === key(r, n))) n += 1;
      out[r.email] = first + ' ' + last.slice(0, n) + '.';
    });
  });
  return out;
}

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS roster (email TEXT PRIMARY KEY, first TEXT, last TEXT, period TEXT, added INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (key TEXT PRIMARY KEY, email TEXT, created INTEGER, expires INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS handoff (nonce TEXT PRIMARY KEY, token TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, at INTEGER, day TEXT, kind TEXT,
      game TEXT, set_id TEXT, team INTEGER, place INTEGER, win INTEGER, correct INTEGER, ms INTEGER, pairs INTEGER, score INTEGER, total INTEGER, full INTEGER)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS events_email ON events (email)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS events_at ON events (at)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email)`);
  }

  all(q, ...args) { return this.sql.exec(q, ...args).toArray(); }

  async fetch(request) {
    const op = new URL(request.url).pathname.replace(/^\/board\//, '');
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    try {
      const out = await this.handle(op, body || {});
      return Response.json(out);
    } catch (err) {
      return Response.json({ error: String((err && err.message) || err) }, { status: err && err.status ? err.status : 500 });
    }
  }

  async handle(op, b) {
    switch (op) {
      case 'roster': return this.roster();
      case 'roster-put': return this.rosterPut(b);
      case 'roster-remove': return this.rosterRemove(b);
      case 'student-reset': return this.studentReset(b);
      case 'signin': return this.signIn(b);
      case 'claim': return this.claim(b);
      case 'check': return { me: await this.check(b.token) };
      case 'signout': return this.signOut(b);
      case 'report': return this.report(b);
      case 'live': return this.live(b);
      case 'boards': return this.boards(b);
      default: throw Object.assign(new Error('Not found.'), { status: 404 });
    }
  }

  /* ---------------- the roster ---------------- */

  rosterRows() { return this.all('SELECT email, first, last, period FROM roster'); }

  roster() {
    const rows = this.rosterRows();
    const names = displayNames(rows);
    const counts = {};
    this.all('SELECT email, COUNT(*) AS n FROM events GROUP BY email').forEach((r) => { counts[r.email] = r.n; });
    const signedIn = new Set(this.all('SELECT DISTINCT email FROM sessions WHERE expires > ?', Date.now()).map((r) => r.email));
    const students = rows.map((r) => ({ ...r, name: names[r.email], results: counts[r.email] || 0, signedIn: signedIn.has(r.email) }))
      .sort((x, y) => periodSort(x.period, y.period) || x.last.localeCompare(y.last) || x.first.localeCompare(y.first));
    return { students, periods: periodsOf(rows) };
  }

  // The teacher pastes the class list: the roster becomes exactly that list
  // (replace) or the list is added to what is there (add). Results are never
  // deleted here; a student taken off the roster just stops showing.
  rosterPut(b) {
    const list = Array.isArray(b.students) ? b.students.slice(0, 2000) : [];
    const rows = [];
    const seen = new Set();
    for (const s of list) {
      const email = clean(s && s.email, 120).toLowerCase();
      if (!EMAIL.test(email) || seen.has(email)) continue;
      seen.add(email);
      rows.push({ email, first: clean(s.first, 40), last: clean(s.last, 60), period: clean(s.period, 20) });
    }
    if (!rows.length) throw Object.assign(new Error('No student emails were found in that list.'), { status: 400 });
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      if (b.mode === 'replace') this.sql.exec('DELETE FROM roster');
      rows.forEach((r) => this.sql.exec(`INSERT INTO roster (email, first, last, period, added) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET first = excluded.first, last = excluded.last, period = excluded.period`, r.email, r.first, r.last, r.period, now));
      // Anyone no longer on the roster is signed out.
      this.sql.exec('DELETE FROM sessions WHERE email NOT IN (SELECT email FROM roster)');
    });
    return { saved: rows.length, ...this.roster() };
  }

  rosterRemove(b) {
    const email = clean(b.email, 120).toLowerCase();
    this.sql.exec('DELETE FROM roster WHERE email = ?', email);
    this.sql.exec('DELETE FROM sessions WHERE email = ?', email);
    return this.roster();
  }

  studentReset(b) {
    const email = clean(b.email, 120).toLowerCase();
    this.sql.exec('DELETE FROM events WHERE email = ?', email);
    return this.roster();
  }

  /* ---------------- Class Pass sign-in ---------------- */

  // The site has already had Google confirm who signed in (and that the
  // sign-in was made for this site). The student must be on the roster.
  async signIn(b) {
    const email = clean(b.email, 120).toLowerCase();
    const nonce = clean(b.nonce, 100);
    const row = this.all('SELECT email, first, last, period FROM roster WHERE email = ?', email)[0];
    if (!row) {
      const err = new Error(email + ' is not on the class list for this site. Check that you picked your school account. If you did, ask your teacher to add you.');
      err.status = 403;
      throw err;
    }
    const token = randomKey();
    const now = Date.now();
    this.sql.exec('INSERT INTO sessions (key, email, created, expires) VALUES (?, ?, ?, ?)', await sha(token), email, now, now + SESSION_DAYS * 86400000);
    // Keep only the newest 8 devices for one student.
    this.sql.exec(`DELETE FROM sessions WHERE email = ? AND key NOT IN (SELECT key FROM sessions WHERE email = ? ORDER BY created DESC LIMIT 8)`, email, email);
    this.sql.exec('DELETE FROM sessions WHERE expires < ?', now);
    this.sql.exec('DELETE FROM handoff WHERE created < ?', now - HANDOFF_MS);
    if (/^[0-9a-f]{32,64}$/.test(nonce)) this.sql.exec('INSERT OR REPLACE INTO handoff (nonce, token, created) VALUES (?, ?, ?)', nonce, token, now);
    return { token, me: this.meOf(row) };
  }

  // The page that opened the sign-in window picks up the sign-in, once.
  async claim(b) {
    const nonce = clean(b.nonce, 100);
    const row = this.all('SELECT token, created FROM handoff WHERE nonce = ?', nonce)[0];
    if (!row || Date.now() - row.created > HANDOFF_MS) return { waiting: true };
    this.sql.exec('DELETE FROM handoff WHERE nonce = ?', nonce);
    const me = await this.check(row.token);
    return me ? { token: row.token, me } : { waiting: true };
  }

  meOf(row) {
    const names = displayNames(this.rosterRows());
    return { email: row.email, name: names[row.email] || row.first, first: row.first, period: row.period };
  }

  // A sign-in key -> the student, or null. Each use keeps it going.
  async check(token) {
    if (!/^[0-9a-f]{64}$/.test(String(token || ''))) return null;
    const key = await sha(token);
    const now = Date.now();
    const s = this.all('SELECT email, expires FROM sessions WHERE key = ?', key)[0];
    if (!s || s.expires < now) return null;
    const row = this.all('SELECT email, first, last, period FROM roster WHERE email = ?', s.email)[0];
    if (!row) return null;
    if (s.expires - now < (SESSION_DAYS - 1) * 86400000) this.sql.exec('UPDATE sessions SET expires = ? WHERE key = ?', now + SESSION_DAYS * 86400000, key);
    return this.meOf(row);
  }

  async signOut(b) {
    if (/^[0-9a-f]{64}$/.test(String(b.token || ''))) this.sql.exec('DELETE FROM sessions WHERE key = ?', await sha(b.token));
    return { ok: true };
  }

  /* ---------------- results ---------------- */

  // A practice result from a set page: Match finished, a test, or Learn
  // mastered. The site checks the set exists and passes how many cards it has.
  async report(b) {
    const me = await this.check(b.token);
    if (!me) throw Object.assign(new Error('Sign in with Class Pass again.'), { status: 401 });
    const now = Date.now();
    const recent = this.all('SELECT COUNT(*) AS n FROM events WHERE email = ? AND at > ? AND kind != ?', me.email, now - 3600000, 'live')[0].n;
    if (recent >= REPORTS_PER_HOUR) return { counted: false, why: 'busy' };
    const setId = clean(b.setId, 60);
    if (!SET_ID.test(setId)) throw Object.assign(new Error('Unknown set.'), { status: 400 });
    const cards = int(b.cards, 0, 1000) || 0;
    const row = { kind: '', ms: null, pairs: null, score: null, total: null, full: true };
    if (b.kind === 'match') {
      row.kind = 'match';
      row.pairs = int(b.pairs, 2, 12);
      row.ms = int(b.ms, 0, 30 * 60 * 1000);
      // Faster than a third of a second a pair is not a person playing.
      if (!row.pairs || row.ms == null || row.ms < row.pairs * 330 || (cards && row.pairs > cards)) return { counted: false };
    } else if (b.kind === 'test') {
      row.kind = 'test';
      row.total = int(b.total, 1, 400);
      row.score = int(b.score, 0, 400);
      if (!row.total || row.score == null || row.score > row.total) return { counted: false };
      // A perfect test counts only with 10 or more questions, or the whole set.
      row.full = row.total >= Math.min(10, cards || 10);
    } else if (b.kind === 'learn') {
      row.kind = 'learn';
      row.total = int(b.total, 1, 1000);
      if (!row.total) return { counted: false };
    } else {
      return { counted: false };
    }
    this.sql.exec(`INSERT INTO events (email, at, day, kind, game, set_id, team, place, win, correct, ms, pairs, score, total, full)
      VALUES (?, ?, ?, ?, '', ?, 0, 0, 0, 0, ?, ?, ?, ?, ?)`, me.email, now, dayOf(now), row.kind, setId, row.ms, row.pairs, row.score, row.total, row.full ? 1 : 0);
    return { counted: true };
  }

  // A live game hosted by the teacher has ended: one row for each signed in
  // student who played.
  live(b) {
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 120) : [];
    const game = GAMES.includes(b.game) ? b.game : '';
    const setId = clean(b.setId, 60);
    // How many teams (or players) took part, kept in "total".
    const teams = int(b.teams, 2, 500) || 2;
    if (!game || !rows.length) return { saved: 0 };
    const onRoster = new Set(this.rosterRows().map((r) => r.email));
    const now = Date.now();
    let saved = 0;
    const seen = new Set();
    this.ctx.storage.transactionSync(() => {
      for (const r of rows) {
        const email = clean(r && r.email, 120).toLowerCase();
        if (!onRoster.has(email) || seen.has(email)) continue;
        seen.add(email);
        const place = int(r.place, 0, 200) || 0;
        this.sql.exec(`INSERT INTO events (email, at, day, kind, game, set_id, team, place, win, correct, ms, pairs, score, total, full)
          VALUES (?, ?, ?, 'live', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`,
        email, now, dayOf(now), game, SET_ID.test(setId) ? setId : '', r.team ? 1 : 0, place, r.win ? 1 : 0,
        int(r.right, 0, 100000) || 0, int(r.ms, 1, 3 * 3600 * 1000), int(r.pairs, 1, 50), teams);
        saved += 1;
      }
    });
    return { saved };
  }

  /* ---------------- the leaderboards ---------------- */

  // b: { since (ms, 0 = all time), period ('' = every class), sets (null =
  //      every set, or a list), single (one set: the fastest times show),
  //      token (the student looking), teacher (true: longer lists, emails) }
  async boards(b) {
    const me = b.teacher ? null : await this.check(b.token);
    if (!b.teacher && !me) throw Object.assign(new Error('Sign in with Class Pass to see the leaderboards.'), { status: 401 });
    const roster = this.rosterRows();
    const names = displayNames(roster);
    const period = clean(b.period, 20);
    const students = roster.filter((r) => !period || r.period === period);
    const allowed = new Map(students.map((r) => [r.email, r]));
    const since = Number(b.since) || 0;
    const sets = Array.isArray(b.sets) ? b.sets.filter((x) => SET_ID.test(String(x))).slice(0, 500) : null;
    // Every event that counts for this view, read once and counted here: a
    // class's results are thousands of rows at most.
    let q = 'SELECT email, at, day, kind, game, set_id, team, place, win, correct, ms, pairs, score, total, full FROM events WHERE at >= ?';
    const args = [since];
    if (sets) {
      if (!sets.length) return { boards: [], periods: periodsOf(roster), me: me && { name: me.name, period: me.period } };
      q += ' AND set_id IN (' + sets.map(() => '?').join(',') + ')';
      args.push(...sets);
    }
    const events = this.all(q, ...args).filter((e) => allowed.has(e.email));
    const tally = (test, value) => {
      const m = new Map();
      events.forEach((e) => { if (test(e)) m.set(e.email, (m.get(e.email) || 0) + value(e)); });
      return m;
    };
    const distinct = (test, keyOf) => {
      const m = new Map();
      events.forEach((e) => {
        if (!test(e)) return;
        if (!m.has(e.email)) m.set(e.email, new Set());
        m.get(e.email).add(keyOf(e));
      });
      return new Map([...m].map(([k, v]) => [k, v.size]));
    };
    const one = () => 1;
    const live = (e) => e.kind === 'live';
    const boards = [
      { id: 'teamWins', group: 'Class champions', title: 'Team game wins', blurb: 'Vocab Live and Blast games won by your team.', unit: 'win', data: tally((e) => live(e) && e.team && e.win, one) },
      { id: 'soloWins', group: 'Class champions', title: 'Solo game wins', blurb: 'Multiplayer Match and solo Vocab Live games won on your own.', unit: 'win', data: tally((e) => live(e) && !e.team && e.win, one) },
      { id: 'podiums', group: 'Class champions', title: 'Top 3 finishes', blurb: 'Live games where you or your team came 1st, 2nd or 3rd (last place never counts).', unit: 'finish', data: tally((e) => live(e) && e.place >= 1 && e.place <= 3 && e.place < (e.total || 2), one) },
      { id: 'right', group: 'Class champions', title: 'Correct answers in games', blurb: 'Right answers you gave in live games.', unit: 'answer', data: tally(live, (e) => e.correct || 0) },
      { id: 'volley', group: 'Wins by game', title: 'Vocab Live wins', blurb: 'Team and solo.', unit: 'win', data: tally((e) => live(e) && e.game === 'volley' && e.win, one) },
      { id: 'blast', group: 'Wins by game', title: 'Blast wins', blurb: 'Games your team won.', unit: 'win', data: tally((e) => live(e) && e.game === 'blast' && e.win, one) },
      { id: 'mmatch', group: 'Wins by game', title: 'Multiplayer Match wins', blurb: 'First to match every card.', unit: 'win', data: tally((e) => live(e) && e.game === 'match' && e.win, one) },
      { id: 'practice', group: 'Studying', title: 'Practice sessions', blurb: 'Match, Test or Learn finished on your own. Each set counts once per mode, per day.', unit: 'session', data: distinct((e) => e.kind !== 'live', (e) => e.set_id + '|' + e.kind + '|' + e.day) },
      { id: 'perfect', group: 'Studying', title: 'Perfect tests', blurb: '100% on a practice test of 10 or more questions (or the whole set). Each set counts once a day.', unit: 'test', data: distinct((e) => e.kind === 'test' && e.full && e.score === e.total, (e) => e.set_id + '|' + e.day) },
      { id: 'mastered', group: 'Studying', title: 'Sets mastered in Learn', blurb: 'Every term mastered in Learn mode. Each set counts once.', unit: 'set', data: distinct((e) => e.kind === 'learn', (e) => e.set_id) }
    ];
    // Fastest times only mean something for one set at a time.
    const fastest = [];
    if (b.single) {
      // Ranked by time a pair, so a 4 pair game and an 8 pair game compare fairly.
      const best = (test) => {
        const m = new Map();
        events.forEach((e) => {
          if (!test(e) || !e.ms || !e.pairs) return;
          const cur = m.get(e.email);
          const rate = e.ms / e.pairs;
          if (!cur || rate < cur.rate) m.set(e.email, { ms: e.ms, pairs: e.pairs, rate });
        });
        return m;
      };
      fastest.push({ id: 'fastMatch', group: 'Fastest times', title: 'Fastest Match (practice)', blurb: 'Best time in Match mode on this set, wrong-match seconds included.', unit: 'ms', low: true, data: best((e) => e.kind === 'match') });
      fastest.push({ id: 'fastLive', group: 'Fastest times', title: 'Fastest Multiplayer Match', blurb: 'Best finish in a live Match game on this set, ranked by time per pair (hidden-card games not counted).', unit: 'ms', low: true, data: best((e) => live(e) && e.game === 'match') });
    }
    const limit = b.teacher ? TEACHER_TOP : TOP;
    const out = boards.concat(fastest).map((bd) => {
      const list = [...bd.data].map(([email, v]) => (typeof v === 'object' ? { email, value: v.ms, pairs: v.pairs, rank: v.rate } : { email, value: v, rank: v }))
        .filter((r) => r.value > 0)
        .sort((x, y) => (bd.low ? x.rank - y.rank : y.rank - x.rank) || names[x.email].localeCompare(names[y.email]));
      // Equal values share a place: 1, 2, 2, 4.
      let place = 0;
      list.forEach((r, i) => { if (i === 0 || r.rank !== list[i - 1].rank) place = i + 1; r.place = place; });
      const row = (r) => {
        const s = allowed.get(r.email);
        const x = { place: r.place, name: names[r.email], period: s.period, value: r.value, me: !!(me && me.email === r.email) };
        if (r.pairs) x.pairs = r.pairs;
        if (b.teacher) x.email = r.email;
        return x;
      };
      const top = list.filter((r) => r.place <= limit).slice(0, limit + 20).map(row);
      const mine = me && list.find((r) => r.email === me.email);
      return { id: bd.id, group: bd.group, title: bd.title, blurb: bd.blurb, unit: bd.unit, low: !!bd.low, rows: top, mine: mine && !top.some((x) => x.me) ? row(mine) : null, players: list.length };
    });
    return { boards: out, periods: periodsOf(roster), me: me && { name: me.name, period: me.period } };
  }
}

function periodSort(a, b) {
  const na = parseFloat(a), nb = parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}
function periodsOf(rows) {
  return [...new Set(rows.map((r) => r.period).filter(Boolean))].sort(periodSort);
}
