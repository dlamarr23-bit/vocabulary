// Battle Royale (Donny, 2026-10-29), like Blooket's Battle Royale, with
// superhero avatars and a clock the teacher can add at any time.
//
// Every student starts with the same HP, health points (the teacher picks 1
// to 10; kept as g.opts.energy and p.energy). Each round puts everyone still
// in into random groups (2 by default; the teacher can make it 3, 4 or 5 at
// any time) and shows one multiple choice question to all of them. In each
// group the fastest right answer wins and everyone else loses 1 HP; if nobody
// is right, they all lose 1.
// When the numbers do not split evenly into pairs, one student is left on
// their own: they battle the ghost of another student, that student's own
// answer this round. Beating the ghost is a win; the ghost loses nothing.
// At 0 HP a student is eliminated, but keeps answering every round to
// practice. The last one standing wins. If a round would eliminate everyone
// still in, nobody is eliminated that round (sudden death goes on).
//
// Two extras, each on unless the teacher switches it off:
// - Revive: a student who is eliminated and gets 3 practice questions right
//   in a row is back in the next round with 1 HP, once a game.
// - Shield: 3 wins in a row earn a shield, which blocks the next HP the
//   student would lose. One shield at a time.
// After each round the board picks 3 to 5 highlights: revivals, whoever broke
// a perfect record, the fastest right answers, long win streaks, knockouts.
// Every answer is kept per student and question, so the teacher can download
// the results at the end.
//
// The clock (Donny: "sometimes we are short on time"): the teacher can set
// one in setup, or add, change or remove one at any time. When it runs out,
// the round being played finishes and the game ends: most HP left wins, then
// most wins, then most right answers, then the fastest average.
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
// Players in each face-off.
const SIZES = [2, 3, 4, 5];
// Right practice answers in a row to be revived, and wins in a row for a shield.
const COMEBACK_RUN = 3;
const SHIELD_RUN = 3;
const SECONDS = [10, 15, 20, 30, 45, 60];
// Minutes on the clock (0: no clock).
const CLOCK = [0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30];
// "Round 3 starts in 4": the matchups show this long before the question.
const VS_MS = 4000;
// The results stay up this long before the next round.
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
const fresh = (g) => ({ energy: g.opts.energy, wins: 0, losses: 0, right: 0, wrong: 0, ms: 0, solo: 0, out: 0, place: 0, late: false, practice: null,
  streak: 0, chain: 0, shield: false, run: 0, back: 0, qa: {} });

// The questions, from a question set ({ q, a, w: [wrong...], img, and
// pictures for the answers: ai for the right one, wi for each wrong one})
// or, for a flashcard set, made from its cards: the definition, then pick the
// term (wrong answers are three other terms from the set).
export function royaleQuestions(body) {
  const out = [];
  if (Array.isArray(body.questions)) {
    for (const x of body.questions.slice(0, 500)) {
      const q = str(x && x.q, 600);
      const img = pic(x && x.img);
      const a = str(x && x.a, 200);
      const ai = pic(x && x.ai);
      if ((!q && !img) || (!a && !ai)) continue;
      // An answer is its words, its picture, or both.
      const key = (t, p) => (t ? t.toLowerCase() : 'img:' + p);
      const seen = new Set([key(a, ai)]);
      const w = [];
      const wi = [];
      const pics = Array.isArray(x.wi) ? x.wi : [];
      (Array.isArray(x.w) ? x.w : []).forEach((v, i) => {
        const t = str(v, 200);
        const p = pic(pics[i]);
        if ((t || p) && !seen.has(key(t, p)) && w.length < 3) { seen.add(key(t, p)); w.push(t); wi.push(p); }
      });
      if (!w.length) continue;
      out.push({ q, a, w, img, ai, wi });
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
    if (w.length) out.push({ q: c.def, a: c.term, w, img: c.img, ai: '', wi: w.map(() => '') });
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
        size: pickFrom(SIZES, 2, o.size),
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
      spot: [],
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
  // settled (at the end of the time, or as soon as everyone has answered),
  // the next round starts, the clock runs out.
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
      const p = { id: pid, name, secret: token(), dev, hero: '', ...fresh(g) };
      if (stu) p.stu = stu.email;
      // Joining once the game is on: in from the next round, with as much
      // HP as whoever has least, so a late arrival is not ahead.
      if (g.phase === 'play') {
        const left = this.rAlive().map((x) => x.energy);
        p.energy = Math.max(1, Math.min(g.opts.energy, ...(left.length ? left : [g.opts.energy])));
        p.late = true;
        p.hero = this.rFreeHero(pid);
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
    // Players who are eliminated, or who joined mid-round, answer for practice.
    const inPlay = this.rInPlay(pid);
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
  rInPlay(pid) { const r = this.game.round; return !!r && r.groups.some((x) => x.ids.includes(pid)); },
  rNextQuestion() {
    const g = this.game;
    if (!g.deck || !g.deck.length) g.deck = shuffle(g.cards.map((_, i) => i));
    return g.deck.shift();
  },

  // Everyone in a group who is here has answered, and every pretend
  // student's answer is in. Then the round ends at once.
  rAllIn() {
    const r = this.game.round;
    if (!r || r.stage !== 'question') return false;
    const now = Date.now();
    const need = [];
    r.groups.forEach((x) => need.push(...x.ids));
    return need.every((pid) => {
      const p = this.game.players[pid];
      if (!p) return true;
      if (p.bot) return now >= r.qAt + ((r.bot || {})[pid] || { ms: 0 }).ms;
      return !!r.ans[pid] || !this.online(pid);
    }) && need.some((pid) => this.game.players[pid] && !this.game.players[pid].bot ? !!r.ans[pid] : true);
  },

  // The groups for a round: as close to the chosen size as the numbers allow,
  // never more than 5, and a student on their own only when pairs do not
  // split evenly (whoever has been on their own least).
  rGroups(alive) {
    const g = this.game;
    const n = alive.length;
    const size = g.opts.size || 2;
    const k = Math.min(n, Math.max(Math.round(n / size), Math.ceil(n / 5), 1));
    const base = Math.floor(n / k);
    const extra = n % k;
    const sizes = Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
    let pool = shuffle(alive.map((p) => p.id));
    let solo = '';
    if (sizes.includes(1)) {
      const least = Math.min(...pool.map((id) => g.players[id].solo || 0));
      solo = shuffle(pool.filter((id) => (g.players[id].solo || 0) === least))[0];
      pool = pool.filter((id) => id !== solo);
      g.players[solo].solo = (g.players[solo].solo || 0) + 1;
    }
    // Not the same pairs as last round, when there is any other way.
    const last = new Set(((g.round && g.round.groups) || []).filter((x) => x.ids.length === 2).map((x) => x.ids.slice().sort().join('|')));
    let groups = [];
    for (let tries = 0; tries < 12; tries++) {
      groups = [];
      let at = 0;
      sizes.filter((s) => s > 1).forEach((s) => { groups.push({ ids: pool.slice(at, at + s), ghost: '' }); at += s; });
      if (!groups.some((x) => x.ids.length === 2 && last.has(x.ids.slice().sort().join('|'))) || pool.length <= 2) break;
      pool = shuffle(pool);
    }
    if (solo) {
      // The ghost: another student's own answer this round.
      const others = groups.flatMap((x) => x.ids);
      groups.push({ ids: [solo], ghost: others.length ? others[rand(others.length)] : '' });
    }
    return groups;
  },

  rNextRound() {
    const g = this.game;
    const now = Date.now();
    g.order.forEach((pid) => { if (g.players[pid]) g.players[pid].late = false; });
    const alive = this.rAlive();
    if (alive.length <= 1) return this.rFinish();
    const qi = this.rNextQuestion();
    const q = g.cards[qi];
    // The answers in a random order, each with its picture.
    const order = shuffle([0, ...q.w.map((_, i) => i + 1)]);
    const opts = order.map((i) => (i ? q.w[i - 1] : q.a));
    const oimg = order.map((i) => (i ? (q.wi || [])[i - 1] || '' : q.ai || ''));
    g.rounds = (g.rounds || 0) + 1;
    g.round = {
      n: g.rounds,
      qi,
      opts,
      oimg,
      c: order.indexOf(0),
      stage: 'vs',
      at: now,
      qAt: now + VS_MS,
      endsAt: now + VS_MS + g.opts.seconds * 1000,
      nextAt: 0,
      groups: this.rGroups(alive),
      ans: {}
    };
    this.rBotAnswers();
  },

  // Pretend students: each has a skill (how often they are right) and
  // answers somewhere inside the time. The ones who are eliminated practice
  // too, so revivals happen in demo mode.
  rBotAnswers() {
    const g = this.game;
    const r = g.round;
    const bots = {};
    const limit = g.opts.seconds * 1000;
    const playing = [];
    r.groups.forEach((x) => playing.push(...x.ids));
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
    // The pretend students' answers that came in before the end.
    Object.keys(r.bot || {}).forEach((pid) => {
      const b = r.bot[pid];
      if (!r.ans[pid] && r.qAt + b.ms <= Math.max(now, r.qAt)) r.ans[pid] = { k: b.k, ms: b.ms, practice: !this.rInPlay(pid) };
    });
    const ok = (pid) => !!r.ans[pid] && r.ans[pid].k === r.c;
    const ms = (pid) => (r.ans[pid] ? r.ans[pid].ms : 0);
    const before = {};
    // Who had a perfect record (a win and no loss yet), for the highlights.
    const perfect = new Set();
    this.rAlive().forEach((p) => { before[p.id] = p.energy; if (!p.losses && p.wins) perfect.add(p.id); });
    r.blocked = [];
    r.earned = [];
    r.back = [];
    const broke = {};
    // Losing 1 HP, unless a shield takes it instead.
    const lose = (pid) => {
      const p = g.players[pid];
      if (!p) return;
      p.losses += 1;
      p.streak = 0;
      p.chain = 0;
      if (p.shield) { p.shield = false; r.blocked.push(pid); return; }
      p.energy = Math.max(0, p.energy - 1);
    };
    const won = (pid) => {
      const p = g.players[pid];
      if (!p) return;
      p.wins += 1;
      p.chain = (p.chain || 0) + 1;
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
    r.groups.forEach((x) => {
      x.ids.forEach(tally);
      const here = x.ids.filter((pid) => g.players[pid]);
      let win = '';
      let losers = [];
      if (x.ghost !== undefined && x.ids.length === 1) {
        // On their own against a ghost: beat its answer (right, and no
        // slower) to win; the ghost's own student loses nothing.
        const me = here[0];
        if (me) {
          const ghostOk = !!g.players[x.ghost] && ok(x.ghost);
          if (ok(me) && (!ghostOk || ms(me) <= ms(x.ghost))) win = me;
          else losers = [me];
        }
      } else {
        // The fastest right answer wins; everyone else in the group loses 1.
        const right = here.filter(ok).sort((a, b) => ms(a) - ms(b));
        win = right[0] || '';
        losers = here.filter((pid) => pid !== win);
      }
      losers.forEach(lose);
      if (win) won(win);
      if (win) { const spoiled = losers.filter((pid) => perfect.has(pid)); if (spoiled.length) broke[win] = spoiled; }
      x.win = win;
      x.lost = losers;
    });
    // Practice answers: they count in the download, and 3 right in a row
    // revive a student who is eliminated, for the next round (once a game).
    Object.keys(r.ans).forEach((pid) => {
      const p = g.players[pid];
      if (!p || this.rInPlay(pid)) return;
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
    // Sudden death: a round never eliminates everyone still in (a revival
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
    r.spot = this.rHighlights(broke);
    g.spot = r.spot;
    r.stage = 'results';
    r.nextAt = now + RESULTS_MS;
    r.last = this.rAlive().length <= 1;
  },

  // 3 to 5 students to show off after a round, one line each: revived,
  // broke a perfect record, fastest right answer, a long win streak, a
  // knockout, a new shield. Each student shows once.
  rHighlights(broke) {
    const g = this.game;
    const r = g.round;
    const out = [];
    const add = (id, what) => { if (out.length < 5 && g.players[id] && !out.some((x) => x.id === id)) out.push({ id, what }); };
    r.back.slice(0, 2).forEach((id) => add(id, 'Revived!'));
    Object.keys(broke).slice(0, 2).forEach((id) => add(id, 'Perfect breaker'));
    const fast = Object.keys(r.ans).filter((id) => this.rInPlay(id) && r.ans[id].k === r.c).sort((a, b) => r.ans[a].ms - r.ans[b].ms);
    if (fast[0]) add(fast[0], 'Fastest: ' + (r.ans[fast[0]].ms / 1000).toFixed(2) + 's');
    this.rAlive().filter((p) => (p.chain || 0) >= 3).sort((a, b) => b.chain - a.chain).slice(0, 2).forEach((p) => add(p.id, p.chain + '-win streak'));
    r.groups.forEach((x) => { if (x.win && x.lost.some((id) => r.out.includes(id))) add(x.win, 'Knockout!'); });
    r.earned.forEach((id) => add(id, 'Shield earned'));
    // At least 3 when there are that many right answers.
    fast.slice(1).forEach((id) => { if (out.length < 3) add(id, 'Quick: ' + (r.ans[id].ms / 1000).toFixed(2) + 's'); });
    return out;
  },

  // The places: everyone still in by HP, then wins, right answers and speed;
  // then the ones who are eliminated, the last to go first.
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
        ...fresh(g), bot: true, skill: 45 + rand(50)
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
      // The group size can change any time; it counts from the next round.
      if (o.size !== undefined) g.opts.size = pickFrom(SIZES, g.opts.size || 2, o.size);
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
      g.order.forEach((pid) => { Object.assign(g.players[pid], fresh(g)); });
      this.rGiveHeroes();
      g.phase = 'play';
      g.startedAt = now;
      g.rounds = 0;
      g.round = null;
      g.missed = {};
      g.spot = [];
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
      g.spot = [];
      g.order.forEach((pid) => { Object.assign(g.players[pid], fresh(g)); });
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
      Object.keys(r.bot || {}).filter((pid) => !r.ans[pid] && this.rInPlay(pid) && now >= r.qAt + r.bot[pid].ms).length;
    const of = r.groups.reduce((n, x) => n + x.ids.length, 0);
    const how = (pid) => ({ ok: !!r.ans[pid] && r.ans[pid].k === r.c, ms: r.ans[pid] ? r.ans[pid].ms : 0, answered: !!r.ans[pid] });
    return {
      n: r.n,
      stage: r.stage,
      qAt: r.qAt,
      endsAt: r.endsAt,
      nextAt: r.nextAt,
      seconds: g.opts.seconds,
      size: g.opts.size || 2,
      answered: Math.min(answered, of),
      of,
      q: r.stage === 'vs' ? null : { text: q.q, img: q.img, opts: r.opts, imgs: r.oimg || [] },
      c: settled ? r.c : -1,
      sudden: !!r.sudden,
      last: !!r.last,
      groups: r.groups.map((x) => ({
        people: x.ids.map((id) => ({ ...this.rPerson(id), ...(settled ? how(id) : {}) })).filter((p) => p.id),
        ghost: x.ghost ? { ...this.rPerson(x.ghost), ...(settled ? how(x.ghost) : {}) } : null,
        win: settled ? x.win || '' : '',
        lost: settled ? x.lost || [] : []
      })),
      out: settled ? (r.out || []) : [],
      // Shields that blocked a loss or were earned, and revivals, this round.
      blocked: settled ? r.blocked || [] : [],
      earned: settled ? r.earned || [] : [],
      back: settled ? (r.back || []).map((id) => this.rPerson(id)).filter(Boolean) : [],
      // How the class answered, for the bars on the board.
      counts: settled ? r.opts.map((_, k) => Object.values(r.ans).filter((x) => !x.practice && x.k === k).length) : null
    };
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
      // The last round's highlights, shown beside the game until the next ones.
      spot: (g.spot || []).map((x) => ({ ...this.rPerson(x.id), what: x.what })).filter((x) => x.id),
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
      // How close an eliminated student is to being revived.
      comeback: g.opts.comeback && p.out && !p.back ? { run: p.run || 0, need: COMEBACK_RUN } : null
    };
    if (g.phase !== 'done') {
      out.taken = g.order.filter((id) => id !== pid && g.players[id] && g.players[id].hero).map((id) => g.players[id].hero);
    }
    const r = g.round;
    if (g.phase === 'play' && r) {
      const rv = this.rRoundView();
      const gi = r.groups.findIndex((x) => x.ids.includes(pid));
      const grp = gi >= 0 ? rv.groups[gi] : null;
      const you = {
        n: rv.n, stage: rv.stage, qAt: rv.qAt, endsAt: rv.endsAt, nextAt: rv.nextAt, seconds: rv.seconds,
        q: rv.q, c: rv.c, sudden: rv.sudden, last: rv.last,
        role: !grp ? 'practice' : grp.ghost ? 'ghost' : 'match',
        // Everyone else in my group, and the ghost when I am on my own.
        others: grp ? grp.people.filter((x) => x.id !== pid) : [],
        ghost: grp ? grp.ghost : null,
        mine: r.ans[pid] ? { k: r.ans[pid].k, ms: r.ans[pid].ms } : null
      };
      if (rv.c >= 0) {
        you.ok = !!r.ans[pid] && r.ans[pid].k === r.c;
        you.won = !!grp && grp.win === pid;
        you.lost = !!grp && grp.lost.includes(pid);
        you.knockedOut = (r.out || []).includes(pid);
        you.blocked = (r.blocked || []).includes(pid);
        you.earned = (r.earned || []).includes(pid);
        you.back = (r.back || []).includes(pid);
        you.anyRight = !!grp && grp.people.some((x) => x.ok);
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
