// Battle Royale (Donny, 2026-10-29), like Blooket's Battle Royale, with
// superhero avatars and a clock the teacher can add at any time.
//
// Every student starts with the same energy (the teacher picks 1 to 10).
// Each round pairs everyone still in at random and shows one multiple choice
// question to all of them. In each pair:
// - both right: the slower one loses 1 energy;
// - one right: the other loses 1;
// - both wrong (or no answer): both lose 1.
// With an odd number left, one player sits out the pairing (whoever has sat
// out least): they answer alone and lose 1 only if they miss it.
// At 0 energy a student is out, but keeps answering every round to practice.
// The last one standing wins. If a round would knock out everyone still in,
// nobody is out that round (sudden death goes on).
//
// Two extras, each on unless the teacher switches it off (Donny, 2026-10-29):
// - Comeback: a student who is out and gets 3 practice questions right in a
//   row is back in the next round with 1 energy, once a game.
// - Shield: 3 match wins in a row earn a shield, which blocks the next
//   energy the student would lose. One shield at a time.
// Every answer is kept per student and question, so the teacher can download
// the results at the end.
//
// The clock (Donny: "sometimes we are short on time"): the teacher can set
// one in setup, or add, change or remove one at any time. When it runs out,
// the round being played finishes and the game ends: most energy left wins,
// then most matches won, then most right answers, then the fastest average.
//
// Students must be signed in with Class Pass (unless the teacher turns that
// off), so their name comes from the class list and nothing is typed. Each
// picks a hero avatar from one list of 50 (Donny: not split into boys and
// girls); a hero is one student's at a time until all 50 are taken.
//
// These methods are added to LiveGame (index.js) and run when g.kind is
// 'royale'. The questions are kept where the other games keep their cards
// (g.cards), so loading and saving work the same.
import { cleanName } from './names.js';

// The heroes in assets/heroes.js, by key.
export const HEROES = ['batman', 'superman', 'spider-man', 'iron-man', 'captain-america', 'hulk', 'thor', 'black-panther', 'miles-morales',
  'flash', 'wolverine', 'aquaman', 'green-lantern', 'robin', 'cyborg', 'deadpool', 'doctor-strange', 'groot',
  'hawkeye', 'ant-man', 'falcon', 'nightwing', 'green-arrow', 'shazam', 'beast-boy',
  'wonder-woman', 'supergirl', 'spider-gwen', 'captain-marvel', 'black-widow', 'she-hulk', 'scarlet-witch', 'shuri',
  'ms-marvel', 'batgirl', 'storm', 'catwoman', 'jean-grey', 'starfire', 'raven', 'harley-quinn', 'wasp', 'squirrel-girl',
  'invisible-woman', 'hawkgirl', 'gamora', 'rogue', 'okoye', 'zatanna', 'ironheart'];

const ENERGY = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
// Right practice answers in a row for a comeback, and match wins in a row for a shield.
const COMEBACK_RUN = 3;
const SHIELD_RUN = 3;
const SECONDS = [10, 15, 20, 30, 45, 60];
// Minutes on the clock (0: no clock).
const CLOCK = [0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30];
// "Round 3 starts in 4": the matchups show this long before the question.
const VS_MS = 4000;
// The match results stay up this long before the next round.
const RESULTS_MS = 6000;
const MAX_PLAYERS = 80;
const DEMO_STUDENTS = 40;
const DEMO_JOIN_PER_TICK = 4;
const DEMO_TICK_MS = 900;
const SWEEP_MS = 15 * 1000;
const DEMO_FIRST = ['Ava', 'Liam', 'Sofia', 'Noah', 'Mia', 'Mateo', 'Zoe', 'Ethan', 'Aaliyah', 'Lucas',
  'Isabella', 'Jayden', 'Emma', 'Diego', 'Chloe', 'Aiden', 'Priya', 'Elijah', 'Layla', 'Caleb',
  'Nora', 'Julian', 'Maya', 'Omar', 'Hana', 'Leo', 'Grace', 'Kai', 'Ruby', 'Andre',
  'Lily', 'Marcus', 'Camila', 'Owen', 'Stella', 'Ezra', 'Amara', 'Felix', 'Iris', 'Wyatt'];

const rand = (n) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const token = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');
const pickFrom = (list, dflt, v) => (list.includes(Number(v)) ? Number(v) : dflt);
const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
// A picture is a path on this site or an https link.
const pic = (v) => { const s = String(v || '').trim().slice(0, 500); return /^(\/|https:\/\/)/.test(s) ? s : ''; };

// The questions, from a question set ({ q, a, w: [wrong...], img }) or, for a
// flashcard set, made from its cards: the definition, then pick the term
// (wrong answers are three other terms from the set).
export function royaleQuestions(body) {
  const out = [];
  if (Array.isArray(body.questions)) {
    for (const x of body.questions.slice(0, 500)) {
      const q = str(x && x.q, 600);
      const a = str(x && x.a, 200);
      if (!q || !a) continue;
      const seen = new Set([a.toLowerCase()]);
      const w = [];
      (Array.isArray(x.w) ? x.w : []).forEach((v) => {
        const t = str(v, 200);
        if (t && !seen.has(t.toLowerCase()) && w.length < 3) { seen.add(t.toLowerCase()); w.push(t); }
      });
      if (!w.length) continue;
      out.push({ q, a, w, img: pic(x.img) });
    }
    return out;
  }
  const cards = (Array.isArray(body.cards) ? body.cards : [])
    .map((c) => ({ term: str(c && c.term, 200), def: str(c && c.def, 600), img: pic(c && c.img) }))
    .filter((c) => c.term && c.def)
    .slice(0, 400);
  const terms = [...new Set(cards.map((c) => c.term))];
  for (const c of cards) {
    const w = shuffle(terms.filter((t) => t.toLowerCase() !== c.term.toLowerCase())).slice(0, 3);
    if (w.length) out.push({ q: c.def, a: c.term, w, img: c.img });
  }
  return out;
}

export const royale = {
  /* ---------------- making a game ---------------- */

  async rInit(body) {
    const old = await this.load();
    if (old && Date.now() - old.created < 3 * 60 * 60 * 1000) return new Response('taken', { status: 409 });
    const questions = royaleQuestions(body);
    if (!questions.length) return new Response('That set needs at least 1 question with a right answer and a wrong one.', { status: 400 });
    const o = body.opts || {};
    this.game = {
      kind: 'royale',
      code: String(body.code),
      created: Date.now(),
      hostKey: String(body.hostKey),
      title: String(body.title || 'Battle Royale').slice(0, 120),
      setId: String(body.setId || ''),
      counts: body.counts === true,
      cards: questions,
      opts: {
        energy: pickFrom(ENERGY, 3, o.energy),
        seconds: pickFrom(SECONDS, 20, o.seconds),
        limit: pickFrom(CLOCK, 0, o.limit),
        // Class Pass is needed to play unless the teacher switches it off.
        pass: o.pass !== false,
        comeback: o.comeback !== false,
        shield: o.shield !== false,
        demo: o.demo === true
      },
      phase: 'lobby',
      players: {},
      order: [],
      deck: [],
      round: null,
      rounds: 0,
      endsAt: 0,
      missed: {},
      blocked: []
    };
    await this.ctx.storage.put('cards', questions);
    await this.save();
    this.touched = Date.now();
    this.idleAt = this.touched + 5 * 60 * 1000;
    await this.ctx.storage.put('idleAt', this.idleAt);
    await this.ctx.storage.setAlarm(this.rNextAlarm(this.touched));
    return Response.json({ ok: true });
  },

  /* ---------------- the clock that runs the rounds ---------------- */

  rNextAlarm(now) {
    const g = this.game;
    let at = Math.min(this.idleAt || now + 5 * 60 * 1000, g.created + 3 * 60 * 60 * 1000);
    if (g.phase === 'lobby' && g.opts.demo && this.rBots() < DEMO_STUDENTS) at = Math.min(at, now + DEMO_TICK_MS);
    if (g.phase === 'play' && !g.paused) {
      const r = g.round;
      if (r && r.stage === 'vs') at = Math.min(at, r.qAt);
      if (r && r.stage === 'question') {
        at = Math.min(at, r.endsAt);
        // Pretend students answer on their own clocks: wake for the next one.
        const next = Object.values(r.bot || {}).map((b) => r.qAt + b.ms).filter((t) => t > now);
        if (next.length) at = Math.min(at, Math.min(...next) + 20);
      }
      if (r && r.stage === 'results') at = Math.min(at, r.nextAt);
      if (g.endsAt && !g.timeUp) at = Math.min(at, g.endsAt);
      at = Math.min(at, now + SWEEP_MS);
    }
    return Math.max(at, now + 20);
  },

  async rAlarm() {
    const g = this.game;
    const now = Date.now();
    if (g.phase === 'lobby' && g.opts.demo && this.rBots() < DEMO_STUDENTS) {
      this.rDemoJoin(DEMO_JOIN_PER_TICK);
      await this.save();
      this.toHost();
    }
    if (g.phase === 'play' && !g.paused) await this.rStep(now);
    if (!this.game) return;
    if (Date.now() >= this.idleAt - 250) {
      const msg = 'This game closed after 5 minutes with nothing happening.';
      await this.close(msg, msg);
      return;
    }
    await this.ctx.storage.setAlarm(this.rNextAlarm(Date.now()));
  },

  // Moves the game on if it is time: the question opens, the round is
  // settled, the next round starts, the clock runs out.
  async rStep(now) {
    const g = this.game;
    const r = g.round;
    let changed = false;
    if (g.endsAt && !g.timeUp && now >= g.endsAt - 250) { g.timeUp = true; changed = true; }
    if (r && r.stage === 'vs' && now >= r.qAt - 50) { r.stage = 'question'; changed = true; }
    if (r && r.stage === 'question' && (now >= r.endsAt - 50 || this.rAllIn())) { this.rSettle(); changed = true; }
    if (r && r.stage === 'results' && now >= r.nextAt - 50) {
      if (r.last || g.timeUp) this.rFinish();
      else this.rNextRound();
      changed = true;
    }
    if (changed) {
      await this.save();
      this.toEveryone();
      // Students answering and moving on is something happening.
      await this.touch();
    } else if (r && r.stage === 'question' && r.bot && Object.keys(r.bot).length) {
      // Pretend students answering: only the count on the board changes.
      this.toHost();
    }
  },

  /* ---------------- messages ---------------- */

  async rMessage(ws, a, m) {
    const g = this.game;
    if (a.pid && (m.t === 'away' || m.t === 'back')) {
      a.away = m.t === 'away';
      a.seen = Date.now();
      try { ws.serializeAttachment(a); } catch { /* closing */ }
      this.toHost();
      return;
    }
    if (a.pid && Date.now() - (a.seen || 0) > 5000) {
      a.seen = Date.now();
      try { ws.serializeAttachment(a); } catch { /* closing */ }
    }
    // A late message can still find the clock or a round due.
    if (g.phase === 'play' && !g.paused) await this.rStep(Date.now());
    if (!this.game) return;
    if (a.role === 'host') return this.rHost(m);
    return this.rPlayer(ws, a, m);
  },

  async rPlayer(ws, a, m) {
    const g = this.game;
    if (m.t === 'join') {
      if (a.pid) return;
      if (g.phase === 'done') return this.send(ws, { t: 'error', msg: 'This game is over. Wait for your teacher to start a new one.' });
      const dev = String(m.dev || '').replace(/[^0-9a-f]/g, '').slice(0, 32);
      if (this.isBlocked(dev, '')) return this.send(ws, { t: 'error', code: 'blocked', msg: 'Your teacher removed you from this game.' });
      const stu = a.stu && a.stu.email ? a.stu : null;
      if (g.opts.pass && !stu) return this.send(ws, { t: 'error', code: 'needPass', msg: 'Sign in with Class Pass to play.' });
      const again = stu && Object.values(g.players).find((p) => p.stu === stu.email);
      if (again) return this.rPlayer(ws, a, { t: 'rejoin', id: again.id, secret: again.secret });
      if (g.order.length >= MAX_PLAYERS) return this.send(ws, { t: 'error', msg: 'This game is full.' });
      const name = stu ? this.uniqueName(cleanName(stu.name) || 'Student') : this.randomName();
      const pid = token().slice(0, 10);
      const p = { id: pid, name, secret: token(), dev, hero: '', energy: g.opts.energy, wins: 0, losses: 0, right: 0, wrong: 0, ms: 0, sat: 0, out: 0 };
      if (stu) p.stu = stu.email;
      // Joining once the game is on: in from the next round, with as much
      // energy as whoever has least, so a late arrival is not ahead.
      if (g.phase === 'play') {
        const left = this.rAlive().map((x) => x.energy);
        p.energy = Math.max(1, Math.min(g.opts.energy, ...(left.length ? left : [g.opts.energy])));
        p.late = true;
      }
      const want = String(m.hero || '');
      if (this.rHeroFree(want, pid)) p.hero = want;
      g.players[pid] = p;
      g.order.push(pid);
      ws.serializeAttachment({ role: 'player', pid, at: Date.now() });
      await this.save();
      this.send(ws, { t: 'me', id: pid, secret: p.secret, name, code: g.code });
      this.toEveryone();
      return;
    }
    if (m.t === 'rejoin') {
      const p = g.players[String(m.id || '')];
      if (!p || p.secret !== m.secret) return this.send(ws, { t: 'rejoinFailed', msg: 'You are not in this game anymore. Join again.' });
      ws.serializeAttachment({ role: 'player', pid: p.id, at: Date.now() });
      this.send(ws, { t: 'me', id: p.id, secret: p.secret, name: p.name, code: g.code });
      this.toPlayer(p.id);
      this.toHost();
      return;
    }
    if (!a.pid || !g.players[a.pid]) return;
    if (m.t === 'hero') return this.rPickHero(a.pid, String(m.key || ''));
    if (m.t === 'answer') return this.rAnswer(a.pid, m);
  },

  // A hero is free unless someone else has it, or all 50 are taken (then two
  // students may share).
  rHeroFree(key, pid) {
    if (!HEROES.includes(key)) return false;
    const held = new Set(Object.values(this.game.players).filter((p) => p.id !== pid && p.hero).map((p) => p.hero));
    return !held.has(key) || HEROES.every((k) => held.has(k));
  },
  rFreeHero(pid) {
    const free = HEROES.filter((k) => this.rHeroFree(k, pid));
    return free.length ? free[rand(free.length)] : HEROES[rand(HEROES.length)];
  },
  async rPickHero(pid, key) {
    const g = this.game;
    const p = g.players[pid];
    if (g.phase === 'done') return;
    if (!this.rHeroFree(key, pid)) {
      this.notice(pid, 'Someone just picked that hero. Pick another one.');
      this.toPlayer(pid);
      return;
    }
    p.hero = key;
    await this.save();
    // Everyone's picker shows it taken.
    this.toEveryone();
  },
  // Anyone who never picked gets a free hero at random when the game starts.
  rGiveHeroes() {
    const g = this.game;
    g.order.forEach((pid) => {
      const p = g.players[pid];
      if (!p.hero) p.hero = this.rFreeHero(pid);
    });
  },

  async rAnswer(pid, m) {
    const g = this.game;
    const r = g.round;
    const now = Date.now();
    if (g.phase !== 'play' || g.paused || !r || r.stage !== 'question' || now < r.qAt) return;
    if (Number(m.round) !== r.n || r.ans[pid]) return;
    const k = Number(m.k);
    if (!Number.isInteger(k) || k < 0 || k >= r.opts.length) return;
    const p = g.players[pid];
    // Players who are out, or who joined mid-round, answer for practice.
    const inPlay = r.match.some((x) => x.a === pid || x.b === pid) || r.sat === pid;
    r.ans[pid] = { k, ms: Math.max(1, now - r.qAt), practice: !inPlay };
    if (!inPlay) {
      p.practice = p.practice || { right: 0, wrong: 0 };
      if (k === r.c) p.practice.right += 1; else p.practice.wrong += 1;
    }
    if (this.rAllIn()) this.rSettle();
    await this.save();
    if (r.stage === 'results') { this.toEveryone(); return; }
    this.toPlayer(pid);
    this.toHost();
  },

  /* ---------------- rounds ---------------- */

  rAlive() { const g = this.game; return g.order.map((id) => g.players[id]).filter((p) => p && !p.out); },
  rBots() { const g = this.game; return g.order.filter((id) => g.players[id] && g.players[id].bot).length; },
  rNextQuestion() {
    const g = this.game;
    if (!g.deck || !g.deck.length) g.deck = shuffle(g.cards.map((_, i) => i));
    return g.deck.shift();
  },

  // Everyone in a match (or sitting out) who is here has answered, and every
  // pretend student's answer is in.
  rAllIn() {
    const r = this.game.round;
    if (!r || r.stage !== 'question') return false;
    const now = Date.now();
    const need = [];
    r.match.forEach((x) => { need.push(x.a); if (x.b) need.push(x.b); });
    if (r.sat) need.push(r.sat);
    return need.every((pid) => {
      const p = this.game.players[pid];
      if (!p) return true;
      if (p.bot) return now >= r.qAt + ((r.bot || {})[pid] || { ms: 0 }).ms;
      return !!r.ans[pid] || !this.online(pid);
    }) && need.some((pid) => this.game.players[pid] && !this.game.players[pid].bot ? !!r.ans[pid] : true);
  },

  rNextRound() {
    const g = this.game;
    const now = Date.now();
    g.order.forEach((pid) => { if (g.players[pid]) g.players[pid].late = false; });
    const alive = this.rAlive();
    if (alive.length <= 1) return this.rFinish();
    const qi = this.rNextQuestion();
    const q = g.cards[qi];
    const opts = shuffle([q.a, ...q.w]);
    // Whoever has sat out least sits out (an odd number left).
    let pool = shuffle(alive.map((p) => p.id));
    let sat = '';
    if (pool.length % 2) {
      const least = Math.min(...pool.map((id) => g.players[id].sat || 0));
      sat = pool.find((id) => (g.players[id].sat || 0) === least);
      pool = pool.filter((id) => id !== sat);
      g.players[sat].sat = (g.players[sat].sat || 0) + 1;
    }
    // Not the same pair as last round, when there is any other way.
    const last = new Set(((g.round && g.round.match) || []).map((x) => [x.a, x.b].sort().join('|')));
    let match = [];
    for (let tries = 0; tries < 12; tries++) {
      match = [];
      for (let i = 0; i < pool.length; i += 2) match.push({ a: pool[i], b: pool[i + 1] });
      if (!match.some((x) => last.has([x.a, x.b].sort().join('|'))) || pool.length <= 2) break;
      pool = shuffle(pool);
    }
    g.rounds = (g.rounds || 0) + 1;
    g.round = {
      n: g.rounds,
      qi,
      opts,
      c: opts.indexOf(q.a),
      stage: 'vs',
      at: now,
      qAt: now + VS_MS,
      endsAt: now + VS_MS + g.opts.seconds * 1000,
      nextAt: 0,
      match,
      sat,
      ans: {}
    };
    this.rBotAnswers();
  },

  // Pretend students: each has a skill (how often they are right) and
  // answers somewhere inside the time. The ones who are out practice too,
  // so comebacks happen in demo mode.
  rBotAnswers() {
    const g = this.game;
    const r = g.round;
    const bots = {};
    const limit = g.opts.seconds * 1000;
    const playing = [];
    r.match.forEach((x) => { playing.push(x.a); if (x.b) playing.push(x.b); });
    if (r.sat) playing.push(r.sat);
    if (g.opts.comeback) g.order.forEach((pid) => { const p = g.players[pid]; if (p && p.bot && p.out && !p.back) playing.push(pid); });
    playing.forEach((pid) => {
      const p = g.players[pid];
      if (!p || !p.bot) return;
      const ok = rand(100) < p.skill;
      const wrong = [...Array(r.opts.length).keys()].filter((k) => k !== r.c);
      const ms = 1200 + rand(Math.max(1000, Math.round(limit * 0.75)));
      // A few miss the time altogether.
      if (rand(100) < 4) return;
      bots[pid] = { k: ok ? r.c : wrong[rand(wrong.length)], ms };
    });
    r.bot = bots;
  },

  rSettle() {
    const g = this.game;
    const r = g.round;
    if (!r || r.stage !== 'question') return;
    const now = Date.now();
    const inPlay = (pid) => r.match.some((x) => x.a === pid || x.b === pid) || r.sat === pid;
    // The pretend students' answers that came in before the end.
    Object.keys(r.bot || {}).forEach((pid) => {
      const b = r.bot[pid];
      if (!r.ans[pid] && r.qAt + b.ms <= Math.max(now, r.qAt)) r.ans[pid] = { k: b.k, ms: b.ms, practice: !inPlay(pid) };
    });
    const ok = (pid) => !!r.ans[pid] && r.ans[pid].k === r.c;
    const ms = (pid) => (r.ans[pid] ? r.ans[pid].ms : 0);
    const before = {};
    this.rAlive().forEach((p) => { before[p.id] = p.energy; });
    r.blocked = [];
    r.earned = [];
    r.back = [];
    // Losing 1 energy, unless a shield takes it instead.
    const lose = (pid) => {
      const p = g.players[pid];
      if (!p) return;
      p.losses += 1;
      p.streak = 0;
      if (p.shield) { p.shield = false; r.blocked.push(pid); return; }
      p.energy = Math.max(0, p.energy - 1);
    };
    const won = (pid) => {
      const p = g.players[pid];
      if (!p) return;
      p.wins += 1;
      p.streak = (p.streak || 0) + 1;
      if (g.opts.shield && p.streak >= SHIELD_RUN && !p.shield) { p.shield = true; p.streak = 0; r.earned.push(pid); }
    };
    // Every answer, for the results download: R right, W wrong, N no answer.
    const mark = (pid, letter) => {
      const p = g.players[pid];
      if (!p) return;
      p.qa = p.qa || {};
      p.qa[r.qi] = (p.qa[r.qi] || '') + letter;
    };
    const tally = (pid) => {
      const p = g.players[pid];
      if (!p) return;
      if (ok(pid)) { p.right += 1; p.ms += ms(pid); } else p.wrong += 1;
      mark(pid, ok(pid) ? 'R' : r.ans[pid] ? 'W' : 'N');
    };
    r.match.forEach((x) => {
      const A = g.players[x.a], B = g.players[x.b];
      tally(x.a); tally(x.b);
      let win = '';
      let losers = [];
      if (A && B) {
        if (ok(x.a) && ok(x.b)) { win = ms(x.a) <= ms(x.b) ? x.a : x.b; losers = [win === x.a ? x.b : x.a]; }
        else if (ok(x.a)) { win = x.a; losers = [x.b]; }
        else if (ok(x.b)) { win = x.b; losers = [x.a]; }
        else losers = [x.a, x.b];
      } else {
        // The other player was taken out of the game mid-round.
        const here = A ? x.a : x.b;
        if (here && !ok(here)) losers = [here];
      }
      losers.forEach(lose);
      if (win) won(win);
      x.win = win;
      x.lost = losers;
    });
    if (r.sat) {
      tally(r.sat);
      if (!ok(r.sat)) lose(r.sat);
    }
    // Practice answers: they count in the download, and 3 right in a row
    // bring a student who is out back for the next round (once a game).
    Object.keys(r.ans).forEach((pid) => {
      const p = g.players[pid];
      if (!p || inPlay(pid)) return;
      mark(pid, ok(pid) ? 'R' : 'W');
      if (!p.out || p.back || !g.opts.comeback) return;
      p.run = ok(pid) ? (p.run || 0) + 1 : 0;
      if (p.run >= COMEBACK_RUN) {
        Object.assign(p, { out: 0, energy: 1, back: r.n, late: true, run: 0, place: 0 });
        r.back.push(pid);
      }
    });
    // Missed questions, for the stats at the end.
    const miss = g.missed[r.qi] || { r: 0, w: 0 };
    Object.keys(r.ans).forEach((pid) => { if (r.ans[pid].k === r.c) miss.r += 1; else miss.w += 1; });
    g.missed[r.qi] = miss;
    // Sudden death: a round never knocks out everyone still in (a comeback
    // this round does not count as still in).
    const stillIn = this.rAlive().filter((p) => p.energy > 0 && !r.back.includes(p.id));
    if (!stillIn.length) {
      this.rAlive().forEach((p) => { if (before[p.id] > 0 && p.energy === 0) p.energy = 1; });
      r.sudden = true;
    }
    r.out = [];
    this.rAlive().forEach((p) => {
      if (p.energy <= 0) { p.out = r.n; r.out.push(p.id); }
    });
    r.stage = 'results';
    r.nextAt = now + RESULTS_MS;
    r.last = this.rAlive().length <= 1;
  },

  // The places: everyone still in by energy, then wins, right answers and
  // speed; then the ones who are out, the last to go first.
  rRanked() {
    const g = this.game;
    const avg = (p) => (p.right ? p.ms / p.right : Infinity);
    const tie = (x, y) => (y.wins - x.wins) || (y.right - x.right) || (avg(x) - avg(y));
    const all = g.order.map((id) => g.players[id]).filter(Boolean);
    const alive = all.filter((p) => !p.out).sort((x, y) => (y.energy - x.energy) || tie(x, y));
    const out = all.filter((p) => p.out).sort((x, y) => (y.out - x.out) || tie(x, y));
    return alive.concat(out);
  },

  rFinish() {
    const g = this.game;
    if (g.phase !== 'play') return;
    this.rRanked().forEach((p, i) => { p.place = i + 1; });
    if (g.round) { g.round.stage = 'over'; g.round.bot = null; }
    g.phase = 'done';
    g.paused = false;
    this.rReport();
  },

  // The class leaderboard: like the other games, once per game, only when
  // the teacher hosts, never in demo mode, and only with 2 or more players.
  rReport() {
    const g = this.game;
    if (!g.counts || g.opts.demo || !this.env.BOARD || g.reported === g.startedAt) return;
    g.reported = g.startedAt;
    const people = g.order.map((id) => g.players[id]).filter((p) => p && !p.bot);
    if (people.length < 2) return;
    const rows = people.filter((p) => p.stu).map((p) => ({ email: p.stu, team: false, place: p.place || 0, win: p.place === 1, right: p.right }));
    if (!rows.length) return;
    const send = this.env.BOARD.get(this.env.BOARD.idFromName('main')).fetch('https://board/board/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: 'royale', setId: g.setId, teams: people.length, rows })
    }).catch(() => {});
    try { this.ctx.waitUntil(send); } catch { /* the game stays awake for its players anyway */ }
  },

  /* ---------------- demo mode ---------------- */

  rDemoJoin(n) {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const count = this.rBots();
      if (count >= DEMO_STUDENTS || g.order.length >= MAX_PLAYERS) return;
      const first = DEMO_FIRST[count % DEMO_FIRST.length];
      const pid = 'bot' + token().slice(0, 7);
      const p = {
        id: pid, name: this.uniqueName(first + ' ' + 'ABCDEFGHJKLMNPRSTW'[rand(18)] + '.'), secret: token(), dev: '', hero: '',
        energy: g.opts.energy, wins: 0, losses: 0, right: 0, wrong: 0, ms: 0, sat: 0, out: 0, bot: true, skill: 45 + rand(50)
      };
      p.hero = this.rFreeHero(pid);
      g.players[pid] = p;
      g.order.push(pid);
    }
  },

  /* ---------------- the teacher's controls ---------------- */

  async rHost(m) {
    const g = this.game;
    const now = Date.now();
    if (m.t === 'close') return this.close('Your teacher ended this game.', 'Game ended.');
    if (m.t === 'settings' && m.opts) {
      const o = m.opts;
      if (g.phase === 'lobby') {
        if (o.energy !== undefined) {
          g.opts.energy = pickFrom(ENERGY, g.opts.energy, o.energy);
          g.order.forEach((pid) => { g.players[pid].energy = g.opts.energy; });
        }
        if (typeof o.pass === 'boolean') g.opts.pass = o.pass;
      }
      if (o.seconds !== undefined && g.phase !== 'done') g.opts.seconds = pickFrom(SECONDS, g.opts.seconds, o.seconds);
      if (typeof o.comeback === 'boolean') g.opts.comeback = o.comeback;
      if (typeof o.shield === 'boolean') g.opts.shield = o.shield;
    } else if (m.t === 'clock') {
      // Set the clock to this many minutes from now (0 takes it away). In
      // the lobby it starts with the game.
      const mins = pickFrom(CLOCK, -1, m.minutes);
      if (mins < 0) return;
      if (g.phase === 'lobby') g.opts.limit = mins;
      else if (g.phase === 'play') {
        g.endsAt = mins ? now + mins * 60 * 1000 : 0;
        g.timeUp = false;
        if (g.paused) g.pausedLeft = mins ? mins * 60 * 1000 : 0;
      } else return;
    } else if (m.t === 'time' && g.phase === 'play' && g.endsAt) {
      // A minute more or less; never under 10 seconds left.
      const add = Math.max(-600, Math.min(600, Math.round(Number(m.seconds) || 0))) * 1000;
      if (!add) return;
      if (g.paused) g.pausedLeft = Math.max(10000, (g.pausedLeft || 0) + add);
      else g.endsAt = Math.max(now + 10000, g.endsAt + add);
      g.timeUp = false;
    } else if (m.t === 'start' && g.phase === 'lobby') {
      if (g.opts.demo) this.rDemoJoin(DEMO_STUDENTS);
      if (g.order.length < 2) return;
      g.order.forEach((pid) => {
        Object.assign(g.players[pid], { energy: g.opts.energy, wins: 0, losses: 0, right: 0, wrong: 0, ms: 0, sat: 0, out: 0, place: 0, late: false, practice: null,
          streak: 0, shield: false, run: 0, back: 0, qa: {} });
      });
      this.rGiveHeroes();
      g.phase = 'play';
      g.startedAt = now;
      g.rounds = 0;
      g.round = null;
      g.missed = {};
      g.deck = [];
      g.timeUp = false;
      g.paused = false;
      g.endsAt = g.opts.limit ? now + VS_MS + g.opts.limit * 60 * 1000 : 0;
      this.rNextRound();
    } else if (m.t === 'pause' && g.phase === 'play' && !g.paused) {
      g.paused = true;
      g.pausedAt = now;
      g.pausedLeft = g.endsAt ? Math.max(0, g.endsAt - now) : 0;
    } else if (m.t === 'resume' && g.phase === 'play' && g.paused) {
      // Everything waiting moves on by the time it was paused.
      const gap = now - (g.pausedAt || now);
      const r = g.round;
      if (r) { r.qAt += gap; r.endsAt += gap; if (r.nextAt) r.nextAt += gap; }
      if (g.endsAt) g.endsAt = now + Math.max(g.pausedLeft || 0, g.timeUp ? 0 : 1000);
      g.paused = false;
    } else if (m.t === 'skip' && g.phase === 'play' && !g.paused && g.round) {
      // Don't wait: the question opens, closes, or the next round starts.
      const r = g.round;
      if (r.stage === 'vs') { const gap = r.qAt - now; r.qAt = now; r.endsAt -= gap; r.stage = 'question'; }
      else if (r.stage === 'question') this.rSettle();
      else if (r.stage === 'results') { if (r.last || g.timeUp) this.rFinish(); else this.rNextRound(); }
    } else if (m.t === 'end' && g.phase === 'play') {
      if (g.round && g.round.stage === 'question') this.rSettle();
      this.rFinish();
    } else if (m.t === 'again' && g.phase === 'done') {
      g.phase = 'lobby';
      g.round = null;
      g.rounds = 0;
      g.endsAt = 0;
      g.timeUp = false;
      g.reported = 0;
      g.order.forEach((pid) => {
        Object.assign(g.players[pid], { energy: g.opts.energy, wins: 0, losses: 0, right: 0, wrong: 0, ms: 0, sat: 0, out: 0, place: 0, late: false, practice: null,
          streak: 0, shield: false, run: 0, back: 0, qa: {} });
      });
    } else if (m.t === 'unblock') {
      g.blocked = (g.blocked || []).filter((x) => x.id !== String(m.id || ''));
    } else if (m.t === 'kick') {
      const pid = String(m.id || '');
      const p = g.players[pid];
      if (!p) return;
      if (m.block) g.blocked = (g.blocked || []).concat([{ id: token().slice(0, 8), name: p.name, dev: p.dev || '', typed: false }]).slice(-60);
      delete g.players[pid];
      g.order = g.order.filter((x) => x !== pid);
      this.sockets((a) => a.pid === pid).forEach((ws) => {
        this.send(ws, m.block
          ? { t: 'removed', blocked: true, msg: 'Your teacher removed you from this game.' }
          : { t: 'removed', msg: 'Your teacher took you out of this game. You can join again.' });
        try { ws.close(1000, 'Removed'); } catch { /* gone */ }
      });
      if (g.phase === 'play' && g.round && g.round.stage === 'question' && this.rAllIn()) this.rSettle();
    } else {
      return;
    }
    await this.save();
    this.toEveryone();
    await this.ctx.storage.setAlarm(this.rNextAlarm(Date.now()));
  },

  /* ---------------- what each screen is sent ---------------- */

  rPerson(pid) {
    const p = this.game.players[pid];
    return p ? { id: p.id, name: p.name, hero: p.hero, energy: p.energy, wins: p.wins, out: p.out, shield: !!p.shield } : null;
  },

  // The round as everyone may see it: the right answer only once it is settled.
  rRoundView() {
    const g = this.game;
    const r = g.round;
    if (!r) return null;
    const q = g.cards[r.qi] || { q: '', img: '' };
    const settled = r.stage === 'results' || r.stage === 'over';
    const now = Date.now();
    const answered = Object.keys(r.ans).filter((pid) => !r.ans[pid].practice).length +
      Object.keys(r.bot || {}).filter((pid) => !r.ans[pid] && now >= r.qAt + r.bot[pid].ms).length;
    let of = r.match.reduce((n, x) => n + (x.b ? 2 : 1), 0) + (r.sat ? 1 : 0);
    const out = {
      n: r.n,
      stage: r.stage,
      qAt: r.qAt,
      endsAt: r.endsAt,
      nextAt: r.nextAt,
      seconds: g.opts.seconds,
      answered: Math.min(answered, of),
      of,
      q: r.stage === 'vs' ? null : { text: q.q, img: q.img, opts: r.opts },
      c: settled ? r.c : -1,
      sudden: !!r.sudden,
      last: !!r.last,
      out: settled ? (r.out || []).map((id) => this.rPerson(id)).filter(Boolean) : [],
      // Shields that blocked a loss or were earned, and comebacks, this round.
      blocked: settled ? r.blocked || [] : [],
      earned: settled ? r.earned || [] : [],
      back: settled ? (r.back || []).map((id) => this.rPerson(id)).filter(Boolean) : []
    };
    out.match = r.match.map((x) => ({
      a: this.rPerson(x.a),
      b: this.rPerson(x.b),
      win: settled ? x.win || '' : '',
      lost: settled ? x.lost || [] : [],
      ms: settled ? { [x.a]: r.ans[x.a] ? r.ans[x.a].ms : 0, [x.b]: r.ans[x.b] ? r.ans[x.b].ms : 0 } : null,
      ok: settled ? { [x.a]: !!r.ans[x.a] && r.ans[x.a].k === r.c, [x.b]: !!r.ans[x.b] && r.ans[x.b].k === r.c } : null
    }));
    out.sat = r.sat ? this.rPerson(r.sat) : null;
    if (settled && r.sat) out.satOk = !!r.ans[r.sat] && r.ans[r.sat].k === r.c;
    if (settled) {
      // How the class answered, for the bar chart on the board.
      const counts = r.opts.map(() => 0);
      Object.values(r.ans).forEach((x) => { if (!x.practice && counts[x.k] !== undefined) counts[x.k] += 1; });
      out.counts = counts;
    }
    return out;
  },

  rBoard() {
    const g = this.game;
    const missed = Object.keys(g.missed || {})
      .map((i) => ({ q: (g.cards[i] || {}).q || '', a: (g.cards[i] || {}).a || '', r: g.missed[i].r, w: g.missed[i].w }))
      .filter((x) => x.w > 0)
      .sort((x, y) => (y.w / (x.r + x.w || 1)) - (x.w / (y.r + y.w || 1)) || y.w - x.w)
      .slice(0, 8);
    return {
      t: 'board',
      kind: 'royale',
      now: Date.now(),
      code: g.code,
      phase: g.phase,
      title: g.title,
      setId: g.setId,
      questions: g.cards.length,
      opts: g.opts,
      counts: !!g.counts && !g.opts.demo,
      endsAt: g.endsAt || 0,
      timeUp: !!g.timeUp,
      paused: !!g.paused,
      pausedLeft: g.paused ? g.pausedLeft || 0 : 0,
      players: g.order.map((pid) => {
        const p = g.players[pid];
        return { id: pid, name: p.name, hero: p.hero, on: this.online(pid), bot: !!p.bot, pass: !!p.stu, energy: p.energy, wins: p.wins, right: p.right, out: p.out, late: !!p.late, place: p.place || 0, shield: !!p.shield, back: p.back || 0 };
      }),
      round: g.phase === 'lobby' ? null : this.rRoundView(),
      blocked: (g.blocked || []).map((x) => ({ id: x.id, name: x.name })),
      missed: g.phase === 'done' ? missed : [],
      results: g.phase === 'done' ? this.rResults() : null
    };
  },

  // Everything for the teacher's download: each question that came up, and
  // every student's answers to it (R right, W wrong, N no answer).
  rResults() {
    const g = this.game;
    const asked = new Set();
    g.order.forEach((pid) => Object.keys(g.players[pid].qa || {}).forEach((i) => asked.add(Number(i))));
    const qs = [...asked].sort((x, y) => x - y);
    return {
      title: g.title,
      at: g.startedAt || g.created,
      questions: qs.map((i) => ({ i, q: (g.cards[i] || {}).q || '', a: (g.cards[i] || {}).a || '' })),
      rows: this.rRanked().map((p) => ({
        name: p.name, email: p.stu || '', bot: !!p.bot, place: p.place || 0, energy: p.energy, out: p.out, wins: p.wins,
        right: p.right, wrong: p.wrong, avg: p.right ? Math.round(p.ms / p.right) : 0, back: p.back || 0,
        qa: qs.map((i) => (p.qa || {})[i] || '')
      }))
    };
  },

  rView(pid) {
    const g = this.game;
    const p = g.players[pid];
    if (!p) return { t: 'removed', msg: 'You are not in this game.' };
    const out = {
      t: 'view',
      kind: 'royale',
      now: Date.now(),
      phase: g.phase,
      title: g.title,
      me: pid,
      name: p.name,
      hero: p.hero,
      energy: p.energy,
      start: g.opts.energy,
      wins: p.wins,
      out: p.out,
      late: !!p.late,
      paused: !!g.paused,
      endsAt: g.phase === 'play' ? g.endsAt || 0 : 0,
      timeUp: !!g.timeUp,
      left: this.rAlive().length,
      players: g.order.length,
      shield: !!p.shield,
      shieldOn: !!g.opts.shield,
      streak: p.streak || 0,
      shieldRun: SHIELD_RUN,
      // How close a student who is out is to coming back.
      comeback: g.opts.comeback && p.out && !p.back ? { run: p.run || 0, need: COMEBACK_RUN } : null
    };
    if (g.phase !== 'done') {
      out.taken = g.order.filter((id) => id !== pid && g.players[id] && g.players[id].hero).map((id) => g.players[id].hero);
    }
    const r = g.round;
    if (g.phase === 'play' && r) {
      const rv = this.rRoundView();
      const mine = r.match.find((x) => x.a === pid || x.b === pid);
      const opp = mine ? (mine.a === pid ? mine.b : mine.a) : '';
      const you = {
        n: rv.n, stage: rv.stage, qAt: rv.qAt, endsAt: rv.endsAt, nextAt: rv.nextAt, seconds: rv.seconds,
        q: rv.q, c: rv.c, sudden: rv.sudden, last: rv.last,
        role: mine ? 'match' : r.sat === pid ? 'sat' : 'practice',
        opp: opp ? this.rPerson(opp) : null,
        mine: r.ans[pid] ? { k: r.ans[pid].k, ms: r.ans[pid].ms } : null
      };
      if (rv.c >= 0) {
        const ok = (id) => !!r.ans[id] && r.ans[id].k === r.c;
        you.ok = ok(pid);
        you.oppOk = opp ? ok(opp) : false;
        you.oppMs = opp && r.ans[opp] ? r.ans[opp].ms : 0;
        you.won = mine ? mine.win === pid : false;
        you.lost = mine ? (mine.lost || []).includes(pid) : (r.sat === pid && !you.ok);
        you.knockedOut = (r.out || []).includes(pid);
        you.blocked = (r.blocked || []).includes(pid);
        you.earned = (r.earned || []).includes(pid);
        you.back = (r.back || []).includes(pid);
      }
      out.round = you;
    }
    if (g.phase === 'done') {
      const ranked = this.rRanked();
      out.done = {
        place: p.place || 0,
        of: ranked.length,
        right: p.right,
        wrong: p.wrong,
        avg: p.right ? Math.round(p.ms / p.right) : 0,
        practice: p.practice || null,
        podium: ranked.slice(0, 3).map((x) => ({ name: x.name, hero: x.hero, place: x.place, wins: x.wins, energy: x.energy, mine: x.id === pid }))
      };
    }
    return out;
  }
};
