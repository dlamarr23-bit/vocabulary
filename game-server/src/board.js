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
//             Match finished, a practice test, a Learn set mastered, and one
//             row per student per review game (kind 'review', set_id = the
//             game's Google Sheet id, score = their top points, correct and
//             total = right answers and questions in their best try, full =
//             full credit), kept up to date by that sheet (Donny, 2026-10-26)
//   past      a student who left the roster (a new school year's class list,
//             or Remove): their name and period, so their results stay on
//             the All time leaderboards for later classes to beat (Donny,
//             2026-11-10). Back on the roster, they leave this list.
import { DurableObject } from 'cloudflare:workers';

const SESSION_DAYS = 120;
const HANDOFF_MS = 10 * 60 * 1000;
// A student can send at most this many practice results an hour.
const REPORTS_PER_HOUR = 120;
// Each leaderboard shows its top 10, to the teacher too (Donny, 2026-10-14).
// Ties past the 10th are left off; a student below them still sees their own row.
const TOP = 10;

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
const PRACTICE = ['match', 'test', 'learn'];
// Surge Showdown moved onto this site on 2026-11-04 (Donny), so its games count too.
const GAMES = ['volley', 'blast', 'match', 'royale', 'surge'];
// The day in California, for "once a day" counting.
const dayOf = (ms) => new Date(ms - 7 * 3600 * 1000).toISOString().slice(0, 10);
// The school year a time falls in (it starts August 1 in California), like "2026–27".
function yearOf(ms) {
  const d = new Date(ms - 7 * 3600 * 1000);
  const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return y + '–' + String(y + 1).slice(2);
}

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
    // Each review game's title, which says which topic it belongs to (Donny, 2026-10-27).
    this.sql.exec(`CREATE TABLE IF NOT EXISTS review_games (id TEXT PRIMARY KEY, title TEXT, updated INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS past (email TEXT PRIMARY KEY, first TEXT, last TEXT, period TEXT, left INTEGER)`);
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
      case 'roster-edit': return this.rosterEdit(b);
      case 'roster-remove': return this.rosterRemove(b);
      case 'student-reset': return this.studentReset(b);
      case 'signin': return this.signIn(b);
      case 'claim': return this.claim(b);
      case 'check': return { me: await this.check(b.token) };
      case 'signout': return this.signOut(b);
      case 'report': return this.report(b);
      case 'live': return this.live(b);
      case 'review': return this.review(b);
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
      if (b.mode === 'replace') {
        this.rosterRows().forEach((r) => { if (!seen.has(r.email)) this.toPast(r, now); });
        this.sql.exec('DELETE FROM roster');
      }
      rows.forEach((r) => this.sql.exec(`INSERT INTO roster (email, first, last, period, added) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET first = excluded.first, last = excluded.last, period = excluded.period`, r.email, r.first, r.last, r.period, now));
      // Anyone no longer on the roster is signed out; anyone on it is not a past student.
      this.sql.exec('DELETE FROM sessions WHERE email NOT IN (SELECT email FROM roster)');
      this.sql.exec('DELETE FROM past WHERE email IN (SELECT email FROM roster)');
    });
    return { saved: rows.length, ...this.roster() };
  }

  // A student leaving the roster keeps their name for the All time leaderboards.
  toPast(r, now) {
    this.sql.exec(`INSERT INTO past (email, first, last, period, left) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET first = excluded.first, last = excluded.last, period = excluded.period, left = excluded.left`,
    r.email, r.first, r.last, r.period, now);
  }

  // The teacher fixes one student's row (Donny, 2026-10-12): a mistyped email,
  // a name or a period. A new email takes the student's results with it, and
  // their sign-ins end, so Class Pass signs them in again with the right account.
  rosterEdit(b) {
    const old = clean(b.email, 120).toLowerCase();
    const s = b.student || {};
    const row = { email: clean(s.email, 120).toLowerCase(), first: clean(s.first, 40), last: clean(s.last, 60), period: clean(s.period, 20) };
    if (!this.all('SELECT email FROM roster WHERE email = ?', old).length) throw Object.assign(new Error('That student is no longer on the roster. Reload the page.'), { status: 404 });
    if (!EMAIL.test(row.email)) throw Object.assign(new Error('"' + row.email + '" is not a full email address.'), { status: 400 });
    if (!row.first) throw Object.assign(new Error('Type a first name.'), { status: 400 });
    if (row.email !== old && this.all('SELECT email FROM roster WHERE email = ?', row.email).length) {
      throw Object.assign(new Error(row.email + ' is already on the roster.'), { status: 409 });
    }
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('UPDATE roster SET email = ?, first = ?, last = ?, period = ? WHERE email = ?', row.email, row.first, row.last, row.period, old);
      if (row.email !== old) {
        this.sql.exec('UPDATE events SET email = ? WHERE email = ?', row.email, old);
        this.sql.exec('DELETE FROM sessions WHERE email = ?', old);
        this.sql.exec('DELETE FROM past WHERE email = ?', row.email);
      }
    });
    return this.roster();
  }

  rosterRemove(b) {
    const email = clean(b.email, 120).toLowerCase();
    this.ctx.storage.transactionSync(() => {
      this.all('SELECT email, first, last, period FROM roster WHERE email = ?', email).forEach((r) => this.toPast(r, Date.now()));
      this.sql.exec('DELETE FROM roster WHERE email = ?', email);
      this.sql.exec('DELETE FROM sessions WHERE email = ?', email);
    });
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

  // A review game's Google Sheet sends its students' results (the site has
  // already checked the sheet's key). Each student keeps one row per game,
  // replaced each time, so a game counts once however often it is sent.
  review(b) {
    const game = clean(b.game, 60);
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
    if (!SET_ID.test(game)) return { saved: 0 };
    const title = clean(b.title, 200);
    if (title) this.sql.exec('INSERT INTO review_games (id, title, updated) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated = excluded.updated', game, title, Date.now());
    if (!rows.length) return { saved: 0 };
    const onRoster = new Set(this.rosterRows().map((r) => r.email));
    const now = Date.now();
    let saved = 0;
    const seen = new Set();
    this.ctx.storage.transactionSync(() => {
      for (const r of rows) {
        const email = clean(r && r.email, 120).toLowerCase();
        if (!onRoster.has(email) || seen.has(email)) continue;
        seen.add(email);
        const total = int(r.total, 1, 1000);
        const right = int(r.right, 0, 1000);
        const points = int(r.points, 0, 10000000);
        if (!total || right == null || right > total || points == null) continue;
        this.sql.exec("DELETE FROM events WHERE email = ? AND kind = 'review' AND set_id = ?", email, game);
        this.sql.exec(`INSERT INTO events (email, at, day, kind, game, set_id, team, place, win, correct, ms, pairs, score, total, full)
          VALUES (?, ?, ?, 'review', 'review', ?, 0, 0, 0, ?, NULL, NULL, ?, ?, ?)`, email, now, dayOf(now), game, right, points, total, r.passed ? 1 : 0);
        saved += 1;
      }
    });
    return { saved };
  }

  /* ---------------- the leaderboards ---------------- */

  // Every review game the board knows the title of, with the topic it belongs
  // to: the longest topic name (a folder or a set) found, as whole words, in
  // its title ('' when none is). A game's title arrives with its results.
  reviewTopics(topicNames) {
    const byKey = new Map();
    (Array.isArray(topicNames) ? topicNames.slice(0, 1000) : []).forEach((n) => { const k = topicKey(n); if (k && !byKey.has(k)) byKey.set(k, clean(n, 200)); });
    const keys = [...byKey.keys()];
    return this.all('SELECT id, title FROM review_games').map((g) => {
      const t = topicKey(g.title);
      let best = '';
      keys.forEach((k) => { if (k.length > best.length && t.includes(k)) best = k; });
      return { id: g.id, title: g.title, key: best, topic: best ? byKey.get(best) : '' };
    });
  }

  // The review games that belong to the picked topic.
  reviewGamesFor(topicNames, picked) {
    if (!Array.isArray(picked) || !picked.length) return [];
    const want = new Set(picked.slice(0, 1000).map(topicKey).filter(Boolean));
    return this.reviewTopics(topicNames).filter((g) => g.key && want.has(g.key)).map((g) => g.id);
  }

  // For the teacher (Donny, 2026-11-03): each review game and the topic it shows
  // under, and how many games have results but never sent a title (those show
  // under All topics only, until the sheet sends its points again).
  reviewGamesInfo(topicNames) {
    const known = this.reviewTopics(topicNames);
    const titled = new Set(known.map((g) => g.id));
    const played = this.all("SELECT DISTINCT set_id FROM events WHERE kind = 'review'").map((r) => r.set_id);
    return {
      reviewGames: known.map((g) => ({ title: g.title, topic: g.topic })).sort((x, y) => x.title.localeCompare(y.title)),
      reviewUntitled: played.filter((id) => !titled.has(id)).length
    };
  }

  // b: { since (ms, 0 = all time), period ('' = every class), sets (null =
  //      every set, or a list: one unit's), past (true: students who left
  //      the roster count too, with the school year of their last result),
  //      token (the student looking), teacher (true: emails) }
  // Four leaderboards since 2026-11-10 (Donny: "way too many categories"):
  // review game points, live game wins, correct answers and practice.
  async boards(b) {
    const me = b.teacher ? null : await this.check(b.token);
    if (!b.teacher && !me) throw Object.assign(new Error('Sign in with Class Pass to see the leaderboards.'), { status: 401 });
    const roster = this.rosterRows();
    const period = clean(b.period, 20);
    const students = roster.filter((r) => !period || r.period === period);
    const allowed = new Map(students.map((r) => [r.email, r]));
    // Past students have their own "First L." names (the year beside them tells them apart).
    const names = displayNames(roster);
    const past = new Set();
    if (b.past && !period) {
      const gone = this.all('SELECT email, first, last, period FROM past').filter((r) => !allowed.has(r.email));
      const pastNames = displayNames(gone);
      gone.forEach((r) => { allowed.set(r.email, r); past.add(r.email); names[r.email] = pastNames[r.email]; });
    }
    const since = Number(b.since) || 0;
    let sets = Array.isArray(b.sets) ? b.sets.filter((x) => SET_ID.test(String(x))).slice(0, 500) : null;
    // One unit picked: its review games count too (the games whose title names it).
    if (sets) sets = new Set(sets.concat(this.reviewGamesFor(b.topicNames, b.picked)));
    const forTeacher = b.teacher ? this.reviewGamesInfo(b.topicNames) : {};
    // Every event that counts for this view, read once and counted here: a
    // class's results are thousands of rows at most.
    const events = this.all('SELECT email, at, day, kind, game, set_id, team, place, win, correct, ms, pairs, score, total, full FROM events WHERE at >= ?', since)
      .filter((e) => allowed.has(e.email) && (!sets || sets.has(e.set_id)));
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
      { id: 'reviewPoints', title: 'Review game points', blurb: 'Your best try on each review game, added up.', unit: 'point', data: tally((e) => e.kind === 'review', (e) => e.score || 0) },
      { id: 'wins', title: 'Live game wins', blurb: 'Team and solo wins in every live game.', unit: 'win', data: tally((e) => live(e) && e.win, one) },
      { id: 'right', title: 'Correct answers', blurb: 'Right answers you gave in live games.', unit: 'answer', data: tally(live, (e) => e.correct || 0) },
      { id: 'practice', title: 'Practice', blurb: 'Match, Test and Learn on your own. Each set counts once per mode, per day.', unit: 'session', data: distinct((e) => PRACTICE.includes(e.kind), (e) => e.set_id + '|' + e.kind + '|' + e.day) }
    ];
    // A past student's school year: the year of their last result here.
    const lastAt = new Map();
    events.forEach((e) => { if (past.has(e.email) && e.at > (lastAt.get(e.email) || 0)) lastAt.set(e.email, e.at); });
    const out = boards.map((bd) => {
      const list = [...bd.data].map(([email, v]) => ({ email, value: v }))
        .filter((r) => r.value > 0)
        .sort((x, y) => y.value - x.value || names[x.email].localeCompare(names[y.email]));
      // Equal values share a place: 1, 2, 2, 4.
      let place = 0;
      list.forEach((r, i) => { if (i === 0 || r.value !== list[i - 1].value) place = i + 1; r.place = place; });
      const row = (r) => {
        const s = allowed.get(r.email);
        const x = { place: r.place, name: names[r.email], period: s.period, value: r.value, me: !!(me && me.email === r.email) };
        if (past.has(r.email)) { x.year = yearOf(lastAt.get(r.email) || Date.now()); x.period = ''; }
        if (b.teacher) x.email = r.email;
        return x;
      };
      const top = list.slice(0, TOP).map(row);
      const mine = me && list.find((r) => r.email === me.email);
      return { id: bd.id, title: bd.title, blurb: bd.blurb, unit: bd.unit, rows: top, mine: mine && !top.some((x) => x.me) ? row(mine) : null, players: list.length };
    });
    return { boards: out, periods: periodsOf(roster), me: me && { name: me.name, period: me.period }, ...forTeacher };
  }
}

// "🚗💥🚙Mass, Acceleration, and Collisions🚗💥🚙" -> " mass acceleration and collisions "
function topicKey(v) {
  const k = String(v == null ? '' : v).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return k ? ' ' + k + ' ' : '';
}

function periodSort(a, b) {
  const na = parseFloat(a), nb = parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}
function periodsOf(rows) {
  return [...new Set(rows.map((r) => r.period).filter(Boolean))].sort(periodSort);
}
