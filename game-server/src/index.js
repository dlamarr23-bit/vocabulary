// The live game server for the online textbook: a Quizlet Live style race.
//
// Each game is one Durable Object, found by its six letter join code. Everyone
// in the game (the teacher's board and every student) holds a WebSocket to it,
// so the whole class sees the same game at the same moment. The Pages site
// (textbook/server/worker.js) creates games for a signed in teacher and passes
// every /api/live/<code>/ws connection straight through to the right game.
//
// Nothing here is kept for long: a game deletes itself after 5 minutes with
// nothing happening (no one joining, answering or pressing a teacher button),
// when the teacher ends it, or three hours after it was made at the latest. Student nicknames exist only inside that one game.
//
// Three games share this server (g.kind):
// - Vocab Live ('volley'), like Quizlet Live: everyone on a team sees the
//   same question, but the answers are split across their screens and only
//   one teammate has the right one, so the team has to talk. A wrong answer
//   sends the team back to zero, unless fast mode is on.
// - Blast ('blast'), like Quizlet Blast: teams of up to 4 share an asteroid
//   field, each player with a ship in a corner. A definition shows; blast the
//   asteroid with its term. Most right answers when the time runs out wins.
// - Match ('match'), like Quizlet's multiplayer Match: everyone gets the same
//   cards and races to match every term to its definition. First done wins.
//   "Hidden cards" turns it into a memory game.
import { DurableObject } from 'cloudflare:workers';
import { cleanName, rudeName, aiSaysRude } from './names.js';
export { Leaderboard } from './board.js';

const LIFETIME_MS = 3 * 60 * 60 * 1000;
const IDLE_MS = 5 * 60 * 1000;
// The idle clock is pushed back at most this often, to save storage writes.
const TOUCH_EVERY_MS = 20 * 1000;
const MAX_PLAYERS = 80;
// How long the right answer stays up after a wrong one, unless every
// student on the team presses Continue first. The teacher picks it.
const PAUSES = [3, 5, 10, 15];
const DEFAULT_PAUSE = 10;
const KINDS = ['volley', 'blast', 'match'];
// Blast's time: any whole number of minutes the teacher types, 1 to 30 (default 5).
const blastMinutes = (m, dflt) => { const n = Math.round(Number(m)); return Number.isFinite(n) && n >= 1 && n <= 30 ? n : dflt; };
const BLAST_ROCKS = 6;
// A wrong asteroid stops that player's ship for a moment.
const BLAST_STUN_MS = 2000;
const MATCH_PAIRS = [4, 6, 8];
// Students pick their teams (Gennaro, 2026-09-29): the host picks how many
// teams, students tap one in the lobby and can switch until the host's
// countdown runs out, then everyone is locked in.
const PICK_TEAMS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const PICK_SECONDS = [15, 30, 45, 60, 90, 120];
// Demo mode (Gennaro, 2026-09-29): pretend students, so the teacher can try
// a game alone. They join a few at a time, then play on a tick: each has a
// skill (how often they are right), and the teacher's "Make a team win"
// button ends the game.
// The countdown before a game: two seconds of "Get ready!" (2026-09-30),
// then 3, 2 and 1 a second each; answers open at GO.
const GO_MS = 5000;
// A student whose screen has not been heard from in this long counts as gone
// (a closed laptop or a phone put away often leaves the connection looking
// open). Their teammates get their answers and the game goes on; their name
// stays on the team, shown as gone, until they come back (Gennaro, 2026-09-30).
const STALE_MS = 40 * 1000;
const SWEEP_MS = 15 * 1000;
// Vocab Live's optional time limit, in minutes (0: none).
const LIMITS = [0, 2, 3, 5, 7, 10, 15, 20, 30];
const DEMO_STUDENTS = 40;
const DEMO_TICK_MS = 900;
const DEMO_JOIN_PER_TICK = 4;
const DEMO_FIRST = ['Ava', 'Liam', 'Sofia', 'Noah', 'Mia', 'Mateo', 'Zoe', 'Ethan', 'Aaliyah', 'Lucas',
  'Isabella', 'Jayden', 'Emma', 'Diego', 'Chloe', 'Aiden', 'Priya', 'Elijah', 'Layla', 'Caleb',
  'Nora', 'Julian', 'Maya', 'Omar', 'Hana', 'Leo', 'Grace', 'Kai', 'Ruby', 'Andre',
  'Lily', 'Marcus', 'Camila', 'Owen', 'Stella', 'Ezra', 'Amara', 'Felix', 'Iris', 'Wyatt'];

// Power-ups in Vocab Live (Gennaro, 2026-09-30), teams and individuals,
// switched on in setup. Every 3 right answers in a row fill a mystery box
// with one random power-up; a team holds one at a time. Teams near the back
// are dealt the strong ones more often, teams in front the gentle ones. On a
// team, one player proposes using it and most of the team who are online
// must tap yes within VOTE_MS. An attack hits one team, and a team can be
// hit at most once every HIT_GAP_MS. Glitch only wobbles and blurs: nothing
// on any screen flashes.
const POWERS = ['shield', 'strike', 'freeze', 'glitch', 'swap', 'double', 'fifty', 'mirror'];
const ATTACKS = ['strike', 'freeze', 'glitch', 'swap'];
const POWER_EVERY = 3;
const VOTE_MS = 8000;
const HIT_GAP_MS = 10000;
const FREEZE_MS = 5000;
const GLITCH_MS = 8000;
const SWAP_WAIT_MS = 5000;
const GUARD_MS = 30000;
// How often each is dealt: to a team in front, in the middle, at the back.
const POWER_ODDS = {
  shield: [3, 2, 1], fifty: [3, 2, 2], double: [2, 2, 2], mirror: [2, 1, 1],
  glitch: [1, 2, 2], freeze: [1, 2, 2], strike: [1, 2, 3], swap: [0, 1, 3]
};

// Dark enough for white text on every one.
const COLORS = [
  ['Red', '#c92a2a'], ['Orange', '#d9480f'], ['Gold', '#9c6400'], ['Lime', '#5c940d'],
  ['Green', '#2b8a3e'], ['Teal', '#0b7285'], ['Blue', '#1864ab'], ['Indigo', '#364fc7'],
  ['Purple', '#6741d9'], ['Pink', '#c2255c'], ['Navy', '#1b3a6b'], ['Silver', '#5f6b76'],
  ['Brown', '#7a4b20'], ['Mint', '#087f5b'], ['Crimson', '#a61e4d'], ['Sky', '#1971c2']
];
const ANIMALS = [
  ['Rhino', 'Rhinos', '\u{1F98F}'], ['Otter', 'Otters', '\u{1F9A6}'], ['Panda', 'Pandas', '\u{1F43C}'],
  ['Fox', 'Foxes', '\u{1F98A}'], ['Owl', 'Owls', '\u{1F989}'], ['Tiger', 'Tigers', '\u{1F42F}'],
  ['Koala', 'Koalas', '\u{1F428}'], ['Dolphin', 'Dolphins', '\u{1F42C}'], ['Penguin', 'Penguins', '\u{1F427}'],
  ['Llama', 'Llamas', '\u{1F999}'], ['Hedgehog', 'Hedgehogs', '\u{1F994}'], ['Octopus', 'Octopuses', '\u{1F419}'],
  ['Turtle', 'Turtles', '\u{1F422}'], ['Wolf', 'Wolves', '\u{1F43A}'], ['Sloth', 'Sloths', '\u{1F9A5}'],
  ['Flamingo', 'Flamingos', '\u{1F9A9}'], ['Giraffe', 'Giraffes', '\u{1F992}'], ['Zebra', 'Zebras', '\u{1F993}'],
  ['Bear', 'Bears', '\u{1F43B}'], ['Lion', 'Lions', '\u{1F981}'], ['Frog', 'Frogs', '\u{1F438}'],
  ['Shark', 'Sharks', '\u{1F988}'], ['Whale', 'Whales', '\u{1F433}'], ['Parrot', 'Parrots', '\u{1F99C}'],
  ['Bunny', 'Bunnies', '\u{1F430}'], ['Elephant', 'Elephants', '\u{1F418}'],
  ['Crab', 'Crabs', '\u{1F980}'], ['Butterfly', 'Butterflies', '\u{1F98B}'], ['Kangaroo', 'Kangaroos', '\u{1F998}']
];
const ADJECTIVES = [
  'Brave', 'Bright', 'Bouncy', 'Clever', 'Cosmic', 'Curious', 'Daring', 'Dazzling', 'Fuzzy', 'Gentle',
  'Happy', 'Jolly', 'Lucky', 'Mighty', 'Nimble', 'Quick', 'Radiant', 'Shiny', 'Sneaky', 'Speedy',
  'Sunny', 'Swift', 'Witty', 'Zippy', 'Calm', 'Cheerful', 'Friendly', 'Fearless', 'Groovy', 'Snappy'
];

const rand = (n) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};
const pick = (list) => list[rand(list.length)];
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// The power-ups the teacher left ticked (all of them unless a list is given).
function powerKinds(list) {
  if (!Array.isArray(list)) return POWERS.slice();
  const k = POWERS.filter((x) => list.includes(x));
  return k.length ? k : POWERS.slice();
}
// Who a Class Pass student is, from the header the site adds after checking
// the sign-in: { email, name }, or null.
function passStudent(request) {
  try {
    const v = JSON.parse((request && request.headers.get('X-Pass-Student')) || 'null');
    return v && typeof v.email === 'string' && v.email.includes('@') ? { email: v.email.toLowerCase().slice(0, 120), name: String(v.name || '').slice(0, 40) } : null;
  } catch { return null; }
}
const token = () => [...crypto.getRandomValues(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');

export class LiveGame extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.game = null;
    this.checking = new WeakSet();
    this.aiSeen = new Map();
    // Keep-alive pings are answered without waking the game up.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // The cards are saved once, apart from the game, so each answer only
  // writes the small part that changes.
  async load() {
    if (!this.game) {
      const g = (await this.ctx.storage.get('game')) || null;
      if (g) g.cards = (await this.ctx.storage.get('cards')) || [];
      this.game = g;
      // When the game closes for being quiet (kept apart, since demo mode
      // wakes the game every second).
      if (g) this.idleAt = (await this.ctx.storage.get('idleAt')) || g.created + IDLE_MS;
    }
    return this.game;
  }
  async save() {
    const { cards, ...rest } = this.game;
    await this.ctx.storage.put('game', rest);
  }

  async fetch(request) {
    const url = new URL(request.url);
    // The class leaderboard (board.js) is reached through here, so the site
    // needs no binding of its own for it: the site asks the LiveGame named
    // "_board", which only ever passes these requests on.
    if (url.pathname.startsWith('/board/')) return this.env.BOARD.get(this.env.BOARD.idFromName('main')).fetch(request);
    if (url.pathname === '/init' && request.method === 'POST') return this.init(await request.json());
    if (request.headers.get('Upgrade') === 'websocket') return this.connect(url, request);
    return new Response('Not found', { status: 404 });
  }

  /* ---------------- making a game ---------------- */

  async init(body) {
    const old = await this.load();
    if (old && Date.now() - old.created < LIFETIME_MS) return new Response('taken', { status: 409 });
    const o = body.opts || {};
    const cards = (Array.isArray(body.cards) ? body.cards : [])
      .map((c) => ({ term: String(c.term || '').slice(0, 300), def: String(c.def || '').slice(0, 1200), img: String(c.img || '').slice(0, 300) }))
      .filter((c) => c.term.trim() && c.def.trim())
      .slice(0, 400);
    if (cards.length < 2) return new Response('That set needs at least 2 cards with a term and a definition.', { status: 400 });
    const kind = KINDS.includes(body.kind) ? body.kind : 'volley';
    this.game = {
      kind,
      code: String(body.code),
      created: Date.now(),
      hostKey: String(body.hostKey),
      title: String(body.title || 'Flashcards').slice(0, 120),
      setId: String(body.setId || ''),
      // Results go to the class leaderboard only from a game the teacher
      // hosts (signed in with the teacher password), and never in demo mode.
      counts: body.counts === true,
      cards,
      opts: {
        // Blast is always teams, Match always one player each; Blast always
        // shows the definition, since terms are what fit on an asteroid.
        teams: kind === 'blast' ? true : kind === 'match' ? false : o.teams !== false,
        typedNames: o.typedNames === true,
        promptDef: kind === 'blast' ? true : o.promptDef !== false,
        minutes: blastMinutes(o.minutes, 5),
        limit: kind === 'volley' && LIMITS.includes(Number(o.limit)) ? Number(o.limit) : 0,
        pairs: Math.min(MATCH_PAIRS.includes(Number(o.pairs)) ? Number(o.pairs) : 6, cards.length),
        hidden: o.hidden === true,
        fast: o.fast === true,
        pause: PAUSES.includes(Number(o.pause)) ? Number(o.pause) : DEFAULT_PAUSE,
        target: Math.min(30, Math.max(3, Number(o.target) || 12)),
        winners: Math.min(3, Math.max(1, Number(o.winners) || 1)),
        // Up to 6 a team in Vocab Live (Gennaro, 2026-09-30); Blast has four ships.
        teamSize: Math.min(kind === 'blast' ? 4 : 6, Math.max(2, Number(o.teamSize) || (kind === 'blast' ? 4 : 3))),
        demo: o.demo === true,
        pick: kind === 'volley' && o.teams !== false && o.pick === true,
        pickTeams: PICK_TEAMS.includes(Number(o.pickTeams)) ? Number(o.pickTeams) : 4,
        // Power-ups in Vocab Live and Blast (Blast has no Swap and no vote).
        powers: (kind === 'volley' || kind === 'blast') && o.powers === true,
        // The drawing pad on students' waiting screens (on unless switched off).
        doodle: o.doodle !== false,
        powerKinds: powerKinds(o.powerKinds)
      },
      phase: 'lobby',
      players: {},
      order: [],
      teams: {},
      teamOrder: [],
      places: 0,
      missed: {},
      stats: {}
    };
    if (this.game.opts.pick) this.pickTeamsReady();
    await this.ctx.storage.put('cards', cards);
    await this.save();
    this.touched = Date.now();
    this.idleAt = this.touched + IDLE_MS;
    await this.ctx.storage.put('idleAt', this.idleAt);
    await this.ctx.storage.setAlarm(this.nextAlarm(this.touched));
    return Response.json({ ok: true });
  }

  async alarm() {
    const g = await this.load();
    if (!g) return;
    const now = Date.now();
    if (now >= g.created + LIFETIME_MS) {
      const msg = 'This game closed after 3 hours.';
      await this.close(msg, msg);
      return;
    }
    // A Blast round, or a Vocab Live game with a time limit, ends on time;
    // the game itself stays open.
    if (g.phase === 'play' && g.endsAt && now >= g.endsAt - 250) await this.timeUp();
    else if (this.pickDue()) await this.pickLock();
    else if (this.demoBusy()) await this.demoTick();
    if (this.game && this.game.phase === 'play') await this.sweep();
    if (this.game && this.pickDue()) await this.pickLock();
    if (!this.game) return;
    if (Date.now() >= this.idleAt - 250) {
      const msg = 'This game closed after 5 minutes with nothing happening.';
      await this.close(msg, msg);
      return;
    }
    await this.ctx.storage.setAlarm(this.nextAlarm(Date.now()));
  }

  // The next wake-up: 5 minutes of quiet, the 3 hour limit, the end of a
  // Blast round, or demo mode's next tick, whichever comes first.
  nextAlarm(now) {
    const g = this.game;
    let at = Math.min(this.idleAt || now + IDLE_MS, g.created + LIFETIME_MS);
    if (g.phase === 'play' && g.endsAt) at = Math.min(at, g.endsAt);
    // During a game, a look every 15 seconds for students who have gone.
    if (g.phase === 'play') at = Math.min(at, now + SWEEP_MS);
    if (this.demoBusy()) at = Math.min(at, now + DEMO_TICK_MS);
    if (g.phase === 'lobby' && g.pickEndsAt && !g.pickLocked) at = Math.min(at, g.pickEndsAt);
    return at;
  }

  // Tells everyone the game is over, then deletes it.
  async close(msg, hostMsg) {
    for (const ws of this.ctx.getWebSockets()) {
      let a;
      try { a = ws.deserializeAttachment() || {}; } catch { a = {}; }
      try { ws.send(JSON.stringify({ t: 'over', msg: a.role === 'host' ? hostMsg : msg })); ws.close(1000, 'Game over'); } catch { /* already gone */ }
    }
    this.game = null;
    await this.ctx.storage.deleteAll();
  }

  // Something happened: start the 5 minute idle clock again.
  async touch(force) {
    const g = this.game;
    const now = Date.now();
    if (!g || (!force && now - (this.touched || 0) < TOUCH_EVERY_MS)) return;
    this.touched = now;
    this.idleAt = now + IDLE_MS;
    await this.ctx.storage.put('idleAt', this.idleAt);
    await this.ctx.storage.setAlarm(this.nextAlarm(now));
  }

  /* ---------------- connections ---------------- */

  async connect(url, request) {
    const g = await this.load();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const key = url.searchParams.get('host');
    if (!g) {
      server.accept();
      server.send(JSON.stringify({ t: 'error', code: 'nogame', msg: 'There is no game with that code. Check the code on the board.' }));
      server.close(1000, 'No game');
      return new Response(null, { status: 101, webSocket: client });
    }
    await this.touch();
    if (key) {
      if (key !== g.hostKey) {
        server.accept();
        server.send(JSON.stringify({ t: 'error', code: 'nohost', msg: 'This screen is no longer the host of that game.' }));
        server.close(1000, 'Not host');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role: 'host' });
      server.send(JSON.stringify(this.board()));
    } else {
      this.ctx.acceptWebSocket(server);
      // A student signed in with Class Pass: the site checked the sign-in and
      // says who it is (students can never send this themselves).
      server.serializeAttachment({ role: 'guest', stu: passStudent(request) });
      server.send(JSON.stringify({ t: 'hello', kind: g.kind, title: g.title, phase: g.phase, typedNames: g.opts.typedNames, counts: !!g.counts && !g.opts.demo }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // Open connections only: one that is closing no longer counts as online.
  sockets(test) {
    return this.ctx.getWebSockets().filter((ws) => {
      if (ws.readyState !== 1) return false;
      let a;
      try { a = ws.deserializeAttachment() || {}; } catch { a = {}; }
      return test(a);
    });
  }
  online(pid) {
    // A demo mode student is always there.
    const p = this.game && this.game.players[pid];
    if (p && p.bot) return true;
    const now = Date.now();
    return this.sockets((a) => a.pid === pid && !a.away).some((ws) => this.fresh(ws, now));
  }
  // Heard from lately: a message, a keep-alive ping (answered without waking
  // the game, but its time is kept) or joining.
  fresh(ws, now) {
    let at = 0;
    try { const d = this.ctx.getWebSocketAutoResponseTimestamp(ws); if (d) at = d.getTime(); } catch { /* none yet */ }
    let a;
    try { a = ws.deserializeAttachment() || {}; } catch { a = {}; }
    return now - Math.max(at, a.seen || 0, a.at || 0) < STALE_MS;
  }

  // Every 15 seconds in a game: a student who has gone quiet stops holding
  // answers, so the rest of the team can carry on, and screens show it.
  async sweep() {
    const g = this.game;
    this.onWas = this.onWas || {};
    let changed = false;
    for (const tid of g.teamOrder) {
      const t = g.teams[tid];
      if (!t) continue;
      const on = t.members.map((id) => (this.online(id) ? 1 : 0)).join('');
      if (this.onWas[tid] === on) continue;
      this.onWas[tid] = on;
      changed = true;
      if (g.kind === 'volley' && t.q && !t.place) {
        const holders = Object.keys(t.q.deal || {});
        if (holders.some((id) => !this.online(id)) || t.members.some((id) => this.online(id) && !holders.includes(id))) this.deal(t);
      }
      this.toTeam(tid);
    }
    if (changed) { await this.save(); this.toHost(); }
  }
  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
  }
  toHost() {
    const b = this.board();
    this.sockets((a) => a.role === 'host').forEach((ws) => this.send(ws, b));
  }
  toPlayer(pid) {
    const p = this.game.players[pid];
    if (p && p.bot) return;
    const v = this.view(pid);
    this.sockets((a) => a.pid === pid).forEach((ws) => this.send(ws, v));
  }
  toTeam(tid) {
    const t = this.game.teams[tid];
    if (t) t.members.forEach((pid) => this.toPlayer(pid));
  }
  toEveryone() {
    this.toHost();
    this.game.order.forEach((pid) => this.toPlayer(pid));
  }

  async webSocketMessage(ws, raw) {
    const g = await this.load();
    if (!g || typeof raw !== 'string' || raw.length > 2000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    let a;
    try { a = ws.deserializeAttachment() || {}; } catch { a = {}; }
    // Aiming is only passed on to teammates: nothing is saved.
    if (m.t === 'aim' && a.pid) return this.aim(a.pid, m);
    await this.touch();
    // A student's screen went to the background, or came back.
    if (a.pid && (m.t === 'away' || m.t === 'back')) {
      a.away = m.t === 'away';
      a.seen = Date.now();
      try { ws.serializeAttachment(a); } catch { /* closing */ }
      return this.presence(a.pid);
    }
    if (a.pid && Date.now() - (a.seen || 0) > 5000) {
      a.seen = Date.now();
      try { ws.serializeAttachment(a); } catch { /* closing */ }
    }
    if (g.phase === 'play' && g.endsAt && Date.now() >= g.endsAt) {
      await this.timeUp();
      return;
    }
    if (a.role === 'host') await this.fromHost(m);
    else await this.fromPlayer(ws, a, m);
  }

  // Someone left or came back: their team's answers are dealt again.
  async presence(pid) {
    const g = this.game;
    const tid = g.players[pid] && g.players[pid].team;
    if (g.kind === 'volley' && g.phase === 'play' && tid && g.teams[tid] && g.teams[tid].q) {
      this.deal(g.teams[tid]);
      await this.save();
    }
    if (tid && g.teams[tid]) this.toTeam(tid);
    this.toHost();
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'Bye'); } catch { /* already closed */ }
    const g = await this.load();
    if (!g) return;
    let a;
    try { a = ws.deserializeAttachment() || {}; } catch { a = {}; }
    if (!a.pid || !g.players[a.pid]) return;
    // Give the rest of a team this player's answers.
    const tid = g.players[a.pid].team;
    if (g.kind === 'volley' && g.phase === 'play' && tid && g.teams[tid] && g.teams[tid].q) {
      this.deal(g.teams[tid]);
      await this.save();
      this.toTeam(tid);
    } else if (tid && g.teams[tid]) {
      this.toTeam(tid);
    }
    this.toHost();
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  /* ---------------- players ---------------- */

  isBlocked(dev, name) {
    return (this.game.blocked || []).some((x) => (dev && x.dev === dev) || (name && x.typed && x.name.toLowerCase() === name.toLowerCase()));
  }

  uniqueName(base) {
    const taken = new Set(Object.values(this.game.players).map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; n < 200; n++) if (!taken.has((base + ' ' + n).toLowerCase())) return base + ' ' + n;
    return base + ' ' + token().slice(0, 3);
  }
  // The AI's answer for each name is remembered for the rest of the game.
  async aiCheck(name) {
    const k = name.toLowerCase();
    if (!this.aiSeen.has(k)) this.aiSeen.set(k, await aiSaysRude(this.env, name));
    return this.aiSeen.get(k);
  }
  randomName() {
    for (let i = 0; i < 40; i++) {
      const name = pick(ADJECTIVES) + ' ' + pick(ANIMALS)[0];
      if (!Object.values(this.game.players).some((p) => p.name === name)) return name;
    }
    return this.uniqueName(pick(ADJECTIVES) + ' ' + pick(ANIMALS)[0]);
  }

  async fromPlayer(ws, a, m) {
    const g = this.game;
    if (m.t === 'join') {
      if (a.pid) return;
      if (g.phase === 'done') return this.send(ws, { t: 'error', msg: 'This game is over. Wait for your teacher to start a new one.' });
      // Removed and blocked by the teacher: not back into this game on this
      // device (or, when students type names, under that name).
      const dev = String(m.dev || '').replace(/[^0-9a-f]/g, '').slice(0, 32);
      if (this.isBlocked(dev, g.opts.typedNames ? cleanName(m.name) : '')) return this.send(ws, { t: 'error', code: 'blocked', msg: 'Your teacher removed you from this game.' });
      if (g.order.length >= MAX_PLAYERS) return this.send(ws, { t: 'error', msg: 'This game is full.' });
      const stu = a.stu && a.stu.email ? a.stu : null;
      // Signed in with Class Pass and already in this game (another tab or
      // device): back in as the same player.
      const again = stu && Object.values(g.players).find((p) => p.stu === stu.email);
      if (again) return this.fromPlayer(ws, a, { t: 'rejoin', id: again.id, secret: again.secret });
      let name;
      if (stu && g.opts.typedNames) {
        // Their name from the class list, so there is nothing to type or check.
        name = this.uniqueName(cleanName(stu.name) || 'Student');
      } else if (g.opts.typedNames) {
        name = cleanName(m.name);
        if (name.length < 2) return this.send(ws, { t: 'nameError', msg: 'Type your first name and last initial.' });
        const taken = () => Object.values(this.game.players).some((p) => p.name.toLowerCase() === name.toLowerCase());
        if (taken()) return this.send(ws, { t: 'nameError', msg: 'Someone already has that name. Add the next letter of your last name.' });
        if (this.checking.has(ws)) return;
        this.checking.add(ws);
        let rude;
        try {
          // Look at what they typed too, before symbols were taken out ("b!tch").
          rude = rudeName(name) || rudeName(String(m.name || '').slice(0, 40)) || (await this.aiCheck(name));
        } finally {
          this.checking.delete(ws);
        }
        if (rude) return this.send(ws, { t: 'nameError', msg: 'That name cannot be used. Type your first name and last initial.' });
        // Other messages may have come in during the AI check.
        if (ws.readyState !== 1 || !this.game || this.game !== g) return;
        try { if ((ws.deserializeAttachment() || {}).pid) return; } catch { /* no attachment yet */ }
        if (g.phase === 'done') return this.send(ws, { t: 'error', msg: 'This game is over. Wait for your teacher to start a new one.' });
        if (g.order.length >= MAX_PLAYERS) return this.send(ws, { t: 'error', msg: 'This game is full.' });
        if (taken()) return this.send(ws, { t: 'nameError', msg: 'Someone already has that name. Add the next letter of your last name.' });
      } else {
        name = this.randomName();
      }
      const pid = token().slice(0, 10);
      g.players[pid] = { id: pid, name, secret: token(), team: null, dev };
      if (stu) g.players[pid].stu = stu.email;
      g.order.push(pid);
      if (g.phase !== 'lobby') this.placeLatecomer(pid);
      ws.serializeAttachment({ role: 'player', pid, at: Date.now() });
      await this.save();
      this.send(ws, { t: 'me', id: pid, secret: g.players[pid].secret, name, code: g.code });
      this.toPlayer(pid);
      if (g.players[pid].team) this.toTeam(g.players[pid].team);
      this.toHost();
      return;
    }
    if (m.t === 'rejoin') {
      const p = g.players[String(m.id || '')];
      if (!p || p.secret !== m.secret) return this.send(ws, { t: 'rejoinFailed', msg: 'You are not in this game anymore. Join again.' });
      // Signed in with Class Pass since joining (before this round is over): from now on this player counts.
      if (a.stu && a.stu.email && !p.stu && g.phase !== 'done' && !Object.values(g.players).some((x) => x.stu === a.stu.email)) { p.stu = a.stu.email; await this.save(); }
      ws.serializeAttachment({ role: 'player', pid: p.id, at: Date.now() });
      this.send(ws, { t: 'me', id: p.id, secret: p.secret, name: p.name, code: g.code });
      if (g.kind === 'volley' && g.phase === 'play' && p.team && g.teams[p.team] && g.teams[p.team].q) {
        this.deal(g.teams[p.team]);
        await this.save();
        this.toTeam(p.team);
      } else if (p.team && g.teams[p.team]) {
        this.toTeam(p.team);
      } else {
        this.toPlayer(p.id);
      }
      this.toHost();
      return;
    }
    if (!a.pid) return;
    if (m.t === 'pickTeam') return this.pickTeam(a.pid, String(m.tid || ''));
    if (g.kind === 'volley' && m.t === 'answer') await this.answer(a.pid, m);
    if (g.kind === 'volley' && m.t === 'ready') await this.ready(a.pid);
    if ((g.kind === 'volley' || g.kind === 'blast') && m.t === 'power') await this.propose(a.pid, m);
    if (g.kind === 'volley' && m.t === 'vote') await this.vote(a.pid, m);
    if (g.kind === 'blast' && m.t === 'shoot') await this.shoot(a.pid, m);
    if (g.kind === 'match' && m.t === 'matched') await this.matched(a.pid, m);
    if (g.kind === 'match' && m.t === 'miss') await this.mismatched(a.pid, m);
  }

  // Someone joining after teams are made goes to the smallest team; in an
  // individual game they get their own lane.
  placeLatecomer(pid) {
    const g = this.game;
    if (!g.opts.teams) {
      const tid = this.makeSoloTeam(pid);
      if (g.phase === 'play') this.startTeam(g.teams[tid]);
      return;
    }
    // Blast teams hold four ships at most; a full class gets a new team.
    const cap = g.kind === 'blast' ? 4 : 99;
    const open = g.teamOrder.map((id) => g.teams[id]).filter((t) => !t.place && t.members.length < cap).sort((x, y) => x.members.length - y.members.length);
    if (!open.length) {
      if (g.kind !== 'blast') return;
      const look = this.teamLooks(1)[0];
      const tid = 't' + (g.teamOrder.length + 1) + token().slice(0, 3);
      g.teams[tid] = { id: tid, name: look.color[0] + ' ' + look.animal[1], color: look.color[1], emoji: look.animal[2], members: [pid] };
      g.teamOrder.push(tid);
      g.players[pid].team = tid;
      if (g.phase === 'play') this.startTeam(g.teams[tid]);
      return;
    }
    const t = open[0];
    t.members.push(pid);
    g.players[pid].team = t.id;
    if (g.kind === 'volley' && t.q) this.deal(t);
  }

  /* ---------------- teams ---------------- */

  teamLooks(count) {
    const colors = shuffle(COLORS);
    const animals = shuffle(ANIMALS);
    return Array.from({ length: count }, (_, i) => ({ color: colors[i % colors.length], animal: animals[i % animals.length] }));
  }

  makeTeams() {
    const g = this.game;
    g.teams = {};
    g.teamOrder = [];
    const ids = shuffle(g.order);
    if (!ids.length) return;
    // As many teams as it takes to keep each one at the chosen size or under,
    // without leaving anyone on a team of one.
    const size = g.kind === 'blast' ? Math.min(4, g.opts.teamSize) : g.opts.teamSize;
    let count = Math.max(1, Math.ceil(ids.length / size));
    if (count > 1 && Math.floor(ids.length / count) < 2) count = Math.max(1, Math.floor(ids.length / 2));
    const looks = this.teamLooks(count);
    for (let i = 0; i < count; i++) {
      const tid = 't' + (i + 1);
      const look = looks[i];
      g.teams[tid] = { id: tid, name: look.color[0] + ' ' + look.animal[1], color: look.color[1], emoji: look.animal[2], members: [] };
      g.teamOrder.push(tid);
    }
    ids.forEach((pid, i) => {
      const tid = g.teamOrder[i % count];
      g.teams[tid].members.push(pid);
      g.players[pid].team = tid;
    });
  }

  makeSoloTeam(pid) {
    const g = this.game;
    const tid = 's' + pid;
    const animal = ANIMALS.find((x) => g.players[pid].name.endsWith(' ' + x[0])) || pick(ANIMALS);
    g.teams[tid] = { id: tid, name: g.players[pid].name, color: pick(COLORS)[1], emoji: animal[2], members: [pid] };
    g.teamOrder.push(tid);
    g.players[pid].team = tid;
    return tid;
  }

  /* ---------------- questions ---------------- */

  answerOf(i) { return this.game.opts.promptDef ? this.game.cards[i].term : this.game.cards[i].def; }

  startTeam(t) {
    t.progress = 0;
    t.place = 0;
    // The team's misses and answer times, for breaking ties.
    t.sw = 0;
    t.sms = 0;
    t.sn = 0;
    t.lockUntil = 0;
    t.last = null;
    t.deck = shuffle(this.game.cards.map((_, i) => i));
    t.pos = 0;
    t.seq = 0;
    if (this.game.kind === 'match') {
      t.found = [];
      t.foundAt = 0;
      t.finishMs = 0;
      t.startedAt = Math.max(Date.now(), this.game.goAt || 0);
      t.q = null;
      return;
    }
    t.scoredAt = 0;
    t.streak = 0;
    t.item = null;
    t.vote = null;
    t.fx = {};
    this.nextQuestion(t);
    // Before GO the first question waits: Blast's rocks hold still and the
    // answer clock starts at GO.
    if (t.q && this.game.goAt > Date.now()) { t.q.at = this.game.goAt; t.q.from = this.game.goAt; }
  }

  nextQuestion(t) {
    const n = this.game.cards.length;
    if (t.pos >= t.deck.length) {
      const prev = t.deck[t.deck.length - 1];
      t.deck = shuffle(this.game.cards.map((_, i) => i));
      if (n > 1 && t.deck[0] === prev) t.deck.push(t.deck.shift());
      t.pos = 0;
    }
    t.seq += 1;
    t.q = { seq: t.seq, card: t.deck[t.pos], at: Date.now() };
    t.pos += 1;
    if (this.game.kind === 'blast') this.rocks(t);
    else this.deal(t);
  }

  /* ---------------- Blast ---------------- */

  // The asteroids for a team's question: its term and five others. The seed
  // lets every teammate's screen fly them along the same paths.
  rocks(t) {
    const g = this.game;
    const q = t.q;
    const right = g.cards[q.card].term.trim().toLowerCase();
    const seen = new Set([right]);
    const list = [q.card];
    for (const i of shuffle(g.cards.map((_, k) => k))) {
      if (list.length >= Math.min(BLAST_ROCKS, g.cards.length)) break;
      const text = g.cards[i].term.trim().toLowerCase();
      if (seen.has(text)) continue;
      seen.add(text);
      list.push(i);
    }
    q.rocks = shuffle(list);
    q.gone = [];
    q.seed = rand(2147483646) + 1;
    q.at = Date.now();
  }

  aim(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    if (g.kind !== 'blast' || g.phase !== 'play' || !p || !p.team || !g.teams[p.team]) return;
    const a = Number(m.a);
    if (!Number.isFinite(a)) return;
    const msg = { t: 'aim', pid, a: Math.round(a * 100) / 100 };
    g.teams[p.team].members.forEach((id) => {
      if (id !== pid) this.sockets((x) => x.pid === id).forEach((ws) => this.send(ws, msg));
    });
  }

  async shoot(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    if (g.phase !== 'play' || !p || !p.team) return;
    if (Date.now() < (g.goAt || 0)) return;
    const t = g.teams[p.team];
    if (!t || !t.q || t.q.seq !== m.seq) return;
    this.stun = this.stun || {};
    if (Date.now() < (this.stun[pid] || 0)) return;
    // Frozen: the shot does not count, and the screen is sent again.
    if (t.fx && Date.now() < (t.fx.holdUntil || 0)) { this.toPlayer(pid); return; }
    const k = Number(m.k);
    if (!t.q.rocks.includes(k) || t.q.gone.includes(k)) return;
    const card = t.q.card;
    const ok = k === card;
    t.last = { seq: t.q.seq, ok, by: p.name, pid, k, right: g.cards[card].term, prompt: g.cards[card].def, at: Date.now() };
    this.tally(card, ok, t.q.at, p.name, pid);
    if (ok) {
      const twice = g.opts.powers && t.fx && t.fx.double > 0;
      t.progress += twice ? 2 : 1;
      if (twice) t.fx.double -= 1;
      t.scoredAt = Date.now();
      t.streak = (t.streak || 0) + 1;
      if (g.opts.powers) this.earn(t);
      this.nextQuestion(t);
    } else {
      t.streak = 0;
      t.q.gone.push(k);
      this.stun[pid] = Date.now() + BLAST_STUN_MS;
      t.last.stunMs = BLAST_STUN_MS;
    }
    await this.save();
    this.toTeam(t.id);
    this.toHost();
  }

  // Time is up (Blast, or Vocab Live with a time limit): every team is
  // placed by its score at that moment.
  async timeUp() {
    const g = this.game;
    if (!g || g.phase !== 'play') return;
    this.finish();
    await this.save();
    this.toEveryone();
  }
  async endBlast() { return this.timeUp(); }

  // The game is over, however it ended (Gennaro, 2026-09-30): teams that
  // finished keep their places, and everyone else is placed after them by
  // score at that moment. A tie goes to the team that missed fewer, then to
  // the faster average right answer, then to whoever got there first.
  finish() {
    const g = this.game;
    const all = g.teamOrder.map((id) => g.teams[id]).filter(Boolean);
    const placed = all.filter((t) => t.place).sort((x, y) => x.place - y.place);
    const avg = (t) => (t.sn ? t.sms / t.sn : Infinity);
    const rest = all.filter((t) => !t.place).sort((x, y) => ((y.progress || 0) - (x.progress || 0))
      || ((x.sw || 0) - (y.sw || 0)) || (avg(x) - avg(y)) || ((x.scoredAt || x.foundAt || 0) - (y.scoredAt || y.foundAt || 0)));
    rest.forEach((t, i) => { t.place = placed.length + i + 1; });
    all.forEach((t) => { t.q = null; t.vote = null; });
    g.places = all.length;
    g.phase = 'done';
    this.reportResults();
  }

  // The class leaderboard (board.js): a result for every student who played
  // signed in with Class Pass. Once per round, only in a game the teacher
  // hosts, never in demo mode, and only when at least two teams (or players)
  // took part. A team "wins" by coming first with at least one right answer.
  reportResults() {
    const g = this.game;
    if (!g.counts || g.opts.demo || !this.env.BOARD || g.reported === g.startedAt) return;
    g.reported = g.startedAt;
    const teams = g.teamOrder.map((id) => g.teams[id]).filter((t) => t && t.members.some((pid) => g.players[pid] && !g.players[pid].bot));
    if (teams.length < 2) return;
    const team = g.kind !== 'match' && g.opts.teams;
    const pairs = g.round ? g.round.cards.length : 0;
    const rows = [];
    teams.forEach((t) => {
      t.members.forEach((pid) => {
        const p = g.players[pid];
        if (!p || !p.stu || p.bot) return;
        const mine = (g.pstats || {})[pid];
        rows.push({
          email: p.stu,
          team,
          place: t.place || 0,
          win: t.place === 1 && (t.progress || 0) > 0,
          right: mine ? mine.r : 0,
          // Match: the finish time, for fastest times (not a hidden-card game).
          ms: g.kind === 'match' && t.finishMs && !g.opts.hidden ? t.finishMs : null,
          pairs: g.kind === 'match' && !g.opts.hidden ? pairs : null
        });
      });
    });
    if (!rows.length) return;
    const send = this.env.BOARD.get(this.env.BOARD.idFromName('main')).fetch('https://board/board/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: g.kind, setId: g.setId, teams: teams.length, rows })
    }).catch(() => {});
    try { this.ctx.waitUntil(send); } catch { /* the game stays awake for its players anyway */ }
  }

  /* ---------------- Match ---------------- */

  async matched(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    if (g.phase !== 'play' || !p || !p.team) return;
    if (Date.now() < (g.goAt || 0)) return;
    const t = g.teams[p.team];
    const k = Number(m.k);
    if (!t || t.place || !g.round || !g.round.cards.includes(k) || t.found.includes(k)) return;
    t.found.push(k);
    t.progress = t.found.length;
    this.tally(k, true, t.foundAt || t.startedAt || g.round.startedAt, p.name, pid);
    t.foundAt = Date.now();
    if (t.found.length >= g.round.cards.length) {
      t.finishMs = Date.now() - (t.startedAt || g.round.startedAt);
      g.places += 1;
      t.place = g.places;
      const open = g.teamOrder.filter((id) => !g.teams[id].place && g.teams[id].members.some((x) => this.online(x))).length;
      if (open === 0) this.finish();
    }
    await this.save();
    if (g.phase === 'done') this.toEveryone();
    else { this.toTeam(t.id); this.toHost(); }
  }

  // A wrong pair in Match: both cards count as missed. A player's screen
  // waits a second after a wrong pair, so more often than that is ignored.
  async mismatched(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    if (g.phase !== 'play' || !p || !p.team || !g.round) return;
    if (Date.now() < (g.goAt || 0)) return;
    this.missAt = this.missAt || {};
    if (Date.now() - (this.missAt[pid] || 0) < 700) return;
    this.missAt[pid] = Date.now();
    const ks = [...new Set((Array.isArray(m.k) ? m.k : []).slice(0, 2).map(Number))].filter((k) => g.round.cards.includes(k));
    if (!ks.length) return;
    ks.forEach((k, i) => this.tally(k, false, 0, '', i ? '' : pid));
    await this.save();
  }

  // Answer statistics for the end of the game (Gennaro, 2026-09-29): for each
  // card, right and wrong answers, and how long right answers took, counted
  // from when the question showed. A few numbers per card, so no slowdown.
  // Each player's own numbers are kept too, for their results screen.
  tally(card, ok, from, name, pid) {
    const g = this.game;
    g.stats = g.stats || {};
    g.pstats = g.pstats || {};
    const s = g.stats[card] || (g.stats[card] = { r: 0, w: 0, ms: 0, n: 0, best: 0, by: '' });
    const me = pid ? g.pstats[pid] || (g.pstats[pid] = { r: 0, w: 0, ms: 0, n: 0, best: 0, term: '' }) : null;
    // The team's own misses and times break ties on the podium.
    const tm = pid && g.players[pid] && g.teams[g.players[pid].team];
    if (!ok) {
      s.w += 1;
      if (me) me.w += 1;
      if (tm) tm.sw = (tm.sw || 0) + 1;
      g.missed[card] = (g.missed[card] || 0) + 1;
      return;
    }
    s.r += 1;
    if (me) me.r += 1;
    const ms = from ? Date.now() - from : 0;
    // A right answer after more than 5 minutes is someone who walked away.
    if (ms > 0 && ms < 5 * 60 * 1000) {
      s.ms += ms;
      s.n += 1;
      if (!s.best || ms < s.best) { s.best = ms; s.by = name || ''; }
      if (tm) { tm.sms = (tm.sms || 0) + ms; tm.sn = (tm.sn || 0) + 1; }
      if (me) {
        me.ms += ms;
        me.n += 1;
        if (!me.best || ms < me.best) { me.best = ms; me.term = g.cards[card].term; }
      }
    }
  }

  // The summary once the game is over: worked out once and kept, since
  // every screen gets it and nothing changes after the end.
  doneSummary() {
    if (!this.doneStats || this.doneStats.at !== this.game.startedAt) this.doneStats = { at: this.game.startedAt, s: this.summary() };
    return this.doneStats.s;
  }

  // The numbers for the winners screen, only once the game is over.
  summary() {
    const g = this.game;
    const rows = Object.keys(g.stats || {}).map((i) => {
      const s = g.stats[i];
      return { term: g.cards[i].term, def: g.cards[i].def, n: s.w, right: s.r, avg: s.n ? Math.round(s.ms / s.n) : 0, best: s.best, by: s.by };
    });
    const right = rows.reduce((a, r) => a + r.right, 0);
    const wrong = rows.reduce((a, r) => a + r.n, 0);
    const timed = rows.filter((r) => r.avg);
    const n = Object.values(g.stats || {}).reduce((a, s) => a + s.n, 0);
    const ms = Object.values(g.stats || {}).reduce((a, s) => a + s.ms, 0);
    const best = timed.slice().sort((x, y) => x.best - y.best)[0];
    const byAvg = timed.slice().sort((x, y) => x.avg - y.avg);
    const half = Math.min(5, Math.floor(byAvg.length / 2));
    const row = (r) => ({ term: r.term, avg: r.avg, best: r.best, by: r.by, right: r.right, n: r.n });
    return {
      right,
      wrong,
      avg: n ? Math.round(ms / n) : 0,
      best: best ? { term: best.term, ms: best.best, by: best.by } : null,
      terms: rows.length,
      // Fastest and slowest never share a term: with few terms each gets half.
      fastest: byAvg.slice(0, half).map(row),
      slowest: byAvg.slice(byAvg.length - half).reverse().map(row),
      missed: rows.filter((r) => r.n).sort((x, y) => y.n - x.n || x.right - y.right).slice(0, 8)
        .map((r) => ({ term: r.term, def: r.def, n: r.n, right: r.right, avg: r.avg }))
    };
  }

  // Split the answer choices across the team's screens, with the right one on
  // exactly one screen. One player alone gets four choices.
  deal(t) {
    const g = this.game;
    const q = t.q;
    if (!q) return;
    const online = t.members.filter((pid) => this.online(pid));
    const hands = online.length ? online : t.members.slice(0, 1);
    const per = hands.length === 1 ? 4 : 3;
    const want = Math.min(g.cards.length, per * hands.length);
    const right = this.answerOf(q.card).trim().toLowerCase();
    const seen = new Set([right]);
    const others = [];
    for (const i of shuffle(g.cards.map((_, k) => k))) {
      if (others.length >= want - 1) break;
      const text = this.answerOf(i).trim().toLowerCase();
      if (i === q.card || seen.has(text)) continue;
      seen.add(text);
      others.push(i);
    }
    const deal = {};
    hands.forEach((pid) => { deal[pid] = []; });
    const owner = hands[rand(hands.length)];
    deal[owner].push(q.card);
    let h = 0;
    for (const i of others) {
      for (let tries = 0; tries < hands.length; tries++) {
        const pid = hands[(h + tries) % hands.length];
        if (deal[pid].length < per) {
          deal[pid].push(i);
          h = (h + tries + 1) % hands.length;
          break;
        }
      }
    }
    hands.forEach((pid) => { deal[pid] = shuffle(deal[pid]); });
    q.deal = deal;
    q.owner = owner;
  }

  async answer(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    if (g.phase !== 'play' || !p || !p.team) return;
    if (Date.now() < (g.goAt || 0)) return;
    const t = g.teams[p.team];
    if (!t || t.place || !t.q || t.q.seq !== m.seq) return;
    if (Date.now() < t.lockUntil) return;
    // Frozen, or waiting after a swap: the answer does not count, and the
    // screen is sent again so its buttons come back.
    if (t.fx && Date.now() < (t.fx.holdUntil || 0)) { this.toPlayer(pid); return; }
    const hand = (t.q.deal && t.q.deal[pid]) || [];
    const k = Number(m.k);
    if (!hand.includes(k)) return;
    const card = t.q.card;
    const ok = k === card;
    const owner = g.players[t.q.owner];
    t.last = {
      seq: t.q.seq,
      ok,
      by: p.name,
      picked: this.answerOf(k),
      right: this.answerOf(card),
      prompt: g.opts.promptDef ? g.cards[card].def : g.cards[card].term,
      owner: owner ? owner.name : '',
      at: Date.now()
    };
    this.tally(card, ok, Math.max(t.q.at || 0, t.q.from || 0), p.name, pid);
    if (ok) {
      const twice = g.opts.powers && t.fx && t.fx.double > 0;
      t.progress += twice ? 2 : 1;
      if (twice) t.fx.double -= 1;
      t.lockUntil = 0;
      // Right answers in a row: the flame beside a team's name, and the power-up box.
      t.streak = (t.streak || 0) + 1;
      if (g.opts.powers) this.earn(t);
      if (t.progress >= g.opts.target) {
        g.places += 1;
        t.place = g.places;
        t.q = null;
        const open = g.teamOrder.filter((id) => !g.teams[id].place).length;
        if (g.places >= g.opts.winners || open === 0) this.finish();
      } else {
        this.nextQuestion(t);
      }
    } else {
      // Back to 0, or stay put below it after a strike.
      if (!g.opts.fast) t.progress = Math.min(0, t.progress);
      t.streak = 0;
      t.lockUntil = Date.now() + (g.opts.pause || DEFAULT_PAUSE) * 1000;
      t.ready = [];
      this.nextQuestion(t);
      // The clock for the next question starts when the pause ends.
      if (t.q) t.q.from = t.lockUntil;
    }
    await this.save();
    if (g.phase === 'done') this.toEveryone();
    else { this.toTeam(t.id); this.toHost(); }
  }

  /* ---------------- power-ups (Vocab Live) ---------------- */

  // A right answer: every POWER_EVERY in a row fill the box, if it is empty.
  earn(t) {
    if (t.streak % POWER_EVERY || t.item) return;
    t.item = this.dealPower(t);
    if (t.item) this.feed({ kind: 'got', power: t.item, from: t, quiet: true });
  }

  // A random power-up, weighted by where the team is in the race.
  dealPower(t) {
    const g = this.game;
    const open = g.teamOrder.map((id) => g.teams[id]).filter((x) => !x.place);
    const rivals = open.filter((x) => x.id !== t.id);
    const ahead = rivals.filter((x) => (x.progress || 0) > (t.progress || 0)).length;
    const behind = rivals.filter((x) => (x.progress || 0) < (t.progress || 0)).length;
    // Level with everyone (the start of a game) counts as the middle.
    const spot = ahead + behind ? ahead / (ahead + behind) : 0.5;
    const band = spot <= 0.34 ? 0 : spot < 0.67 ? 1 : 2;
    const kinds = g.opts.powerKinds.filter((k) => {
      if (!rivals.length && ATTACKS.includes(k)) return false;
      if (k === 'swap' && (!ahead || g.kind === 'blast')) return false;
      return true;
    });
    const bag = [];
    kinds.forEach((k) => { for (let i = 0; i < POWER_ODDS[k][band]; i++) bag.push(k); });
    return bag.length ? pick(bag) : (kinds.length ? pick(kinds) : null);
  }

  // The teams this one could aim at, and whether each can be hit right now.
  targets(t, kind) {
    const g = this.game;
    const now = Date.now();
    return g.teamOrder.map((id) => g.teams[id]).filter((x) => x.id !== t.id && !x.place && (kind !== 'swap' || (x.progress || 0) > (t.progress || 0)))
      .map((x) => ({ x, ready: now >= ((x.fx && x.fx.hitAt) || 0) + HIT_GAP_MS }));
  }

  voters(t) { return t.members.filter((id) => this.online(id)); }
  needed(t) { return Math.floor(this.voters(t).length / 2) + 1; }

  // Someone taps their team's power-up (and, for an attack, a team).
  async propose(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    const t = p && p.team && g.teams[p.team];
    if (!g.opts.powers || g.phase !== 'play' || Date.now() < (g.goAt || 0) || !t || t.place || !t.item) return;
    const now = Date.now();
    if (t.vote && now < t.vote.until) return;
    const kind = t.item;
    let target = '';
    if (ATTACKS.includes(kind)) {
      const aim = this.targets(t, kind).find((o) => o.x.id === String(m.target || ''));
      if (!aim) return this.notice(pid, 'That team cannot be picked. Pick another one.');
      if (!aim.ready) return this.notice(pid, aim.x.name + ' was just hit. Pick another team, or wait a few seconds.');
      target = aim.x.id;
    }
    // Blast moves too fast for a vote: anyone on the team uses it at once.
    if (g.kind === 'blast') {
      this.usePower(t, kind, target);
      await this.save();
      this.toEveryone();
      return;
    }
    t.vote = { id: token().slice(0, 6), kind, target, by: pid, yes: [pid], no: [], until: now + VOTE_MS };
    await this.settleVote(t);
  }

  async vote(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    const t = p && p.team && g.teams[p.team];
    if (!t || !t.vote || t.vote.id !== m.id || Date.now() >= t.vote.until) return;
    const v = t.vote;
    v.yes = v.yes.filter((x) => x !== pid);
    v.no = v.no.filter((x) => x !== pid);
    (m.yes ? v.yes : v.no).push(pid);
    await this.settleVote(t);
  }

  // Enough yes votes: use it. Too many no votes: put it back.
  async settleVote(t) {
    const g = this.game;
    const v = t.vote;
    const on = this.voters(t);
    const need = this.needed(t);
    const yes = v.yes.filter((id) => on.includes(id) || !g.players[id] || g.players[id].bot).length;
    if (yes >= need) {
      t.vote = null;
      this.usePower(t, v.kind, v.target);
    } else if (v.no.length > on.length - need) {
      t.vote = null;
      this.feed({ kind: 'nope', power: v.kind, from: t, quiet: true });
    }
    await this.save();
    this.toEveryone();
  }

  usePower(t, kind, targetId) {
    const g = this.game;
    const now = Date.now();
    t.item = null;
    t.fx = t.fx || {};
    if (kind === 'shield') { t.fx.shieldUntil = now + GUARD_MS; return this.feed({ kind, from: t }); }
    if (kind === 'mirror') { t.fx.mirrorUntil = now + GUARD_MS; return this.feed({ kind, from: t }); }
    if (kind === 'double') { t.fx.double = 2; return this.feed({ kind, from: t }); }
    if (kind === 'fifty') {
      // Hide half of the wrong answers on the team's screens, this question.
      if (t.q && g.kind === 'blast') {
        // Blast: half of the wrong asteroids break apart.
        const wrong = t.q.rocks.filter((k) => k !== t.q.card && !t.q.gone.includes(k));
        t.q.gone = t.q.gone.concat(shuffle(wrong).slice(0, Math.ceil(wrong.length / 2)));
      } else if (t.q) {
        const wrong = Object.values(t.q.deal || {}).flat().filter((k) => k !== t.q.card);
        t.q.hide = shuffle(wrong).slice(0, Math.floor(wrong.length / 2));
      }
      return this.feed({ kind, from: t });
    }
    const target = g.teams[targetId];
    if (!target || target.place) return;
    this.hit(t, target, kind, false);
  }

  // An attack lands, unless a shield stops it or a mirror sends it back.
  hit(from, to, kind, bounced) {
    const now = Date.now();
    to.fx = to.fx || {};
    from.fx = from.fx || {};
    if (now < (to.fx.shieldUntil || 0)) {
      to.fx.shieldUntil = 0;
      return this.feed({ kind, from, to, blocked: true, bounced });
    }
    if (!bounced && now < (to.fx.mirrorUntil || 0)) {
      to.fx.mirrorUntil = 0;
      this.feed({ kind: 'bounce', power: kind, from: to, to: from });
      return this.hit(to, from, kind, true);
    }
    to.fx.hitAt = now;
    if (kind === 'strike') to.progress = (to.progress || 0) - 1;
    if (kind === 'freeze') { to.fx.holdUntil = now + FREEZE_MS; to.fx.hold = 'freeze'; to.fx.holdBy = from.name; }
    if (kind === 'glitch') { to.fx.glitchUntil = now + GLITCH_MS; to.fx.glitchBy = from.name; }
    if (kind === 'swap') {
      const a = from.progress || 0;
      from.progress = to.progress || 0;
      to.progress = a;
      from.fx.holdUntil = now + SWAP_WAIT_MS;
      from.fx.hold = 'swap';
      from.fx.holdBy = to.name;
    }
    this.feed({ kind, from, to, bounced });
  }

  // What just happened, for the big screen and the teams involved.
  feed(e) {
    const g = this.game;
    const one = (t) => (t ? { id: t.id, name: t.name, emoji: t.emoji, color: t.color } : null);
    g.feed = (g.feed || []).concat([{ id: token().slice(0, 6), at: Date.now(), kind: e.kind, power: e.power || e.kind, from: one(e.from), to: one(e.to), blocked: !!e.blocked, bounced: !!e.bounced, quiet: !!e.quiet }]).slice(-12);
  }

  notice(pid, msg) {
    this.sockets((a) => a.pid === pid).forEach((ws) => this.send(ws, { t: 'notice', msg }));
  }

  // The power-up part of a team's screens.
  powerView(t, pid) {
    const g = this.game;
    const now = Date.now();
    const fx = t.fx || {};
    const left = (at) => Math.max(0, (at || 0) - now);
    const out = {
      item: t.item || null,
      streak: (t.streak || 0) % POWER_EVERY,
      every: POWER_EVERY,
      shieldMs: left(fx.shieldUntil),
      mirrorMs: left(fx.mirrorUntil),
      double: fx.double || 0,
      holdMs: left(fx.holdUntil),
      hold: fx.hold || '',
      holdBy: fx.holdBy || '',
      glitchMs: left(fx.glitchUntil),
      glitchBy: fx.glitchBy || '',
      events: (g.feed || []).filter((e) => now - e.at < 6000 && ((e.from && e.from.id === t.id) || (e.to && e.to.id === t.id)))
    };
    if (t.item && ATTACKS.includes(t.item)) {
      out.targets = this.targets(t, t.item).map((o) => ({ id: o.x.id, name: o.x.name, emoji: o.x.emoji, color: o.x.color, progress: o.x.progress || 0, ready: o.ready, shield: now < ((o.x.fx && o.x.fx.shieldUntil) || 0) }));
    }
    const v = t.vote;
    if (v && now < v.until) {
      const target = v.target && g.teams[v.target];
      out.vote = { id: v.id, kind: v.kind, target: target ? target.name : '', by: g.players[v.by] ? g.players[v.by].name : '', mine: v.by === pid, yes: v.yes.length, need: this.needed(t), voted: v.yes.includes(pid) ? 'yes' : v.no.includes(pid) ? 'no' : '', ms: v.until - now };
    }
    return out;
  }

  // Continue after a wrong answer: the pause ends early once everyone on the
  // team who is still connected has pressed it.
  async ready(pid) {
    const g = this.game;
    const p = g.players[pid];
    const t = p && p.team && g.teams[p.team];
    if (g.phase !== 'play' || !t || !t.q || Date.now() >= (t.lockUntil || 0)) return;
    t.ready = t.ready || [];
    if (!t.ready.includes(pid)) t.ready.push(pid);
    const online = t.members.filter((id) => this.online(id));
    if (online.every((id) => t.ready.includes(id))) {
      t.lockUntil = 0;
      t.q.from = Date.now();
    }
    await this.save();
    this.toTeam(t.id);
  }

  /* ---------------- students pick their teams ---------------- */

  picking() { const g = this.game; return !!(g && g.opts.teams && g.opts.pick && g.phase === 'lobby'); }
  // A team is full at one more than an even share of the class, so no team
  // runs away with everyone.
  pickCap() {
    const g = this.game;
    return Math.max(2, Math.ceil(Math.max(g.order.length, 1) / g.opts.pickTeams) + 1);
  }
  // The team shells for the lobby: as many as the host asked for, keeping
  // anyone already on one that stays.
  pickTeamsReady() {
    const g = this.game;
    const want = g.opts.pickTeams;
    if (g.teamOrder.length === want && g.teamOrder.every((id) => g.teams[id])) return;
    const keep = g.teamOrder.slice(0, want).map((id) => g.teams[id]).filter(Boolean);
    const dropped = g.teamOrder.slice(want);
    dropped.forEach((id) => (g.teams[id] ? g.teams[id].members : []).forEach((pid) => { if (g.players[pid]) g.players[pid].team = null; }));
    const looks = this.teamLooks(want);
    const used = new Set(keep.map((t) => t.name));
    const teams = {};
    const order = [];
    keep.forEach((t) => { teams[t.id] = t; order.push(t.id); });
    let n = 0;
    while (order.length < want) {
      const look = looks[n++ % looks.length];
      const name = look.color[0] + ' ' + look.animal[1];
      if (used.has(name) && n < 64) continue;
      used.add(name);
      const tid = 'p' + (order.length + 1) + token().slice(0, 3);
      teams[tid] = { id: tid, name, color: look.color[1], emoji: look.animal[2], members: [] };
      order.push(tid);
    }
    g.teams = teams;
    g.teamOrder = order;
    g.order.forEach((pid) => { const p = g.players[pid]; if (p.team && !teams[p.team]) p.team = null; });
  }
  async pickTeam(pid, tid) {
    const g = this.game;
    if (!this.picking() || g.pickLocked) return;
    const p = g.players[pid];
    const t = g.teams[tid];
    if (!p || !t || p.team === tid) return;
    if (t.members.length >= this.pickCap()) return this.send(this.sockets((a) => a.pid === pid)[0], { t: 'notice', msg: 'That team is full. Pick another one.' });
    const old = p.team && g.teams[p.team];
    if (old) old.members = old.members.filter((x) => x !== pid);
    t.members.push(pid);
    p.team = tid;
    await this.save();
    this.toEveryone();
  }
  // Anyone who has not picked goes to the smallest team.
  pickFillIn() {
    const g = this.game;
    g.order.forEach((pid) => {
      const p = g.players[pid];
      if (p.team && g.teams[p.team]) return;
      const t = g.teamOrder.map((id) => g.teams[id]).sort((x, y) => x.members.length - y.members.length)[0];
      if (!t) return;
      t.members.push(pid);
      p.team = t.id;
    });
  }
  pickDue() {
    const g = this.game;
    return !!(g && this.picking() && g.pickEndsAt && !g.pickLocked && Date.now() >= g.pickEndsAt - 150);
  }
  async pickLock() {
    const g = this.game;
    g.pickLocked = true;
    g.pickEndsAt = 0;
    this.pickFillIn();
    await this.save();
    this.toEveryone();
  }

  /* ---------------- demo mode ---------------- */

  // Demo students still to join, or a game on for them to play.
  demoBusy() {
    const g = this.game;
    if (!g || !g.opts.demo) return false;
    if (g.phase === 'play') return true;
    if (this.picking() && !g.pickLocked && Object.values(g.players).some((p) => p.bot && !p.team)) return true;
    return (g.phase === 'lobby' || g.phase === 'teams') && this.demoCount() < DEMO_STUDENTS;
  }
  demoCount() { return Object.values(this.game.players).filter((p) => p.bot).length; }

  // Up to `n` more pretend students, named the way the game names students:
  // a first name and last initial when students type names, otherwise a
  // random fun name. Each one is right about 70 to 95 times in 100.
  demoJoin(n) {
    const g = this.game;
    let added = 0;
    while (added < n && this.demoCount() < DEMO_STUDENTS && g.order.length < MAX_PLAYERS) {
      let name;
      if (g.opts.typedNames) {
        const used = new Set(Object.values(g.players).map((p) => p.name));
        const free = DEMO_FIRST.filter((f) => ![...used].some((u) => u.startsWith(f + ' ')));
        name = this.uniqueName(pick(free.length ? free : DEMO_FIRST) + ' ' + 'ABCDEFGHJKLMNPRSTVW'[rand(19)] + '.');
      } else {
        name = this.randomName();
      }
      const pid = 'd' + token().slice(0, 9);
      g.players[pid] = { id: pid, name, secret: token(), team: null, bot: true, skill: 0.7 + rand(26) / 100 };
      g.order.push(pid);
      if (g.phase !== 'lobby') this.placeLatecomer(pid);
      added += 1;
    }
    return added;
  }

  // One tick: students join in the lobby, or take their turns in the game.
  async demoTick() {
    const g = this.game;
    // Still arriving: in the lobby, or onto the smallest team once teams are made.
    if (g.phase === 'lobby' || g.phase === 'teams') {
      let changed = this.demoJoin(1 + rand(DEMO_JOIN_PER_TICK)) > 0;
      // Picking teams: pretend students pick one, and now and then switch.
      if (this.picking() && !g.pickLocked) {
        const cap = this.pickCap();
        for (const pid of g.order) {
          const p = g.players[pid];
          if (!p.bot || Math.random() > (p.team ? 0.03 : 0.25)) continue;
          const open = g.teamOrder.filter((id) => id !== p.team && g.teams[id].members.length < cap);
          if (!open.length) continue;
          const tid = pick(open);
          if (p.team && g.teams[p.team]) g.teams[p.team].members = g.teams[p.team].members.filter((x) => x !== pid);
          g.teams[tid].members.push(pid);
          p.team = tid;
          changed = true;
        }
      }
      if (changed) {
        await this.save();
        this.toEveryone();
      }
      return;
    }
    if (g.phase !== 'play' || Date.now() < (g.goAt || 0)) return;
    const bots = (t) => t.members.filter((id) => g.players[id] && g.players[id].bot);
    const skill = (ids) => ids.reduce((sum, id) => sum + g.players[id].skill, 0) / ids.length;
    for (const tid of g.teamOrder.slice()) {
      if (g.phase !== 'play') break;
      const t = g.teams[tid];
      if (!t || t.place) continue;
      const mine = bots(t);
      if (!mine.length) continue;
      const right = Math.random() < skill(mine);
      if (g.kind === 'volley') {
        if (!t.q) continue;
        // After a wrong answer they press Continue, one by one.
        if (Date.now() < (t.lockUntil || 0)) {
          const waiting = mine.filter((id) => !(t.ready || []).includes(id));
          if (waiting.length && Math.random() < 0.5) await this.ready(pick(waiting));
          continue;
        }
        // Power-ups: vote on a teammate's idea, or now and then use one.
        if (g.opts.powers) {
          if (t.vote && Date.now() < t.vote.until) {
            const undecided = mine.filter((id) => !t.vote.yes.includes(id) && !t.vote.no.includes(id));
            if (undecided.length && Math.random() < 0.6) await this.vote(pick(undecided), { id: t.vote.id, yes: Math.random() < 0.9 });
          } else if (t.item && Math.random() < 0.3) {
            const choices = ATTACKS.includes(t.item) ? this.targets(t, t.item).filter((o) => o.ready) : [null];
            // Aim at the real student's team half the time, so the teacher
            // sees an attack land in the split screen.
            const real = choices.filter((o) => o && o.x.members.some((id) => g.players[id] && !g.players[id].bot));
            const aim = real.length && Math.random() < 0.5 ? pick(real) : pick(choices.length ? choices : [undefined]);
            if (aim !== undefined) await this.propose(pick(mine), { target: aim ? aim.x.id : '' });
          }
          if (!t.q || g.phase !== 'play') continue;
        }
        if (Math.random() > 0.4) continue;
        const owner = t.q.owner;
        if (right && g.players[owner] && g.players[owner].bot) {
          await this.answer(owner, { seq: t.q.seq, k: t.q.card });
        } else if (!right) {
          const wrong = mine.map((id) => ({ id, ks: ((t.q.deal && t.q.deal[id]) || []).filter((k) => k !== t.q.card) })).filter((x) => x.ks.length);
          if (wrong.length) { const w = pick(wrong); await this.answer(w.id, { seq: t.q.seq, k: pick(w.ks) }); }
        }
      } else if (g.kind === 'blast') {
        // Now and then a pretend student uses the team's power-up, aiming at
        // the real student's team half the time.
        if (g.opts.powers && t.item && Math.random() < 0.3) {
          const choices = ATTACKS.includes(t.item) ? this.targets(t, t.item).filter((o) => o.ready) : [null];
          const real = choices.filter((o) => o && o.x.members.some((id) => g.players[id] && !g.players[id].bot));
          const aim = real.length && Math.random() < 0.5 ? pick(real) : pick(choices.length ? choices : [undefined]);
          if (aim !== undefined) await this.propose(pick(mine), { target: aim ? aim.x.id : '' });
          continue;
        }
        if (!t.q || Math.random() > 0.45) continue;
        this.stun = this.stun || {};
        const ready = mine.filter((id) => Date.now() >= (this.stun[id] || 0));
        if (!ready.length) continue;
        const k = right ? t.q.card : pick(t.q.rocks.filter((x) => x !== t.q.card && !t.q.gone.includes(x)).concat(t.q.card));
        await this.shoot(pick(ready), { seq: t.q.seq, k });
      } else if (g.kind === 'match') {
        // A wrong pair costs a Match player a moment, so a miss is a slower turn.
        if (!g.round || Math.random() > (right ? 0.4 : 0.1)) continue;
        const left = g.round.cards.filter((k) => !(t.found || []).includes(k));
        if (!right && left.length > 1) {
          const a = pick(left);
          const b = pick(left.filter((k) => k !== a));
          this.tally(a, false);
          this.tally(b, false);
          continue;
        }
        if (left.length) await this.matched(mine[0], { k: left[0] });
      }
    }
    // Pretend students playing count as something happening.
    if (g.phase === 'play') await this.touch();
  }

  // The teacher's "Make a team win to end game": the teams furthest along
  // win, as many as the game has winners, and the game is over.
  async demoWin() {
    const g = this.game;
    if (g.kind === 'blast') return this.timeUp();
    const open = g.teamOrder.map((id) => g.teams[id]).filter((t) => !t.place)
      .sort((x, y) => (y.progress || 0) - (x.progress || 0) || rand(3) - 1);
    const need = g.kind === 'volley' ? Math.max(1, g.opts.winners - g.places) : 3;
    open.slice(0, need).forEach((t, i) => {
      g.places += 1;
      t.place = g.places;
      if (g.kind === 'volley') { t.progress = g.opts.target; t.q = null; }
      if (g.kind === 'match' && i === 0 && g.round) {
        t.found = g.round.cards.slice();
        t.progress = t.found.length;
        t.finishMs = Date.now() - (t.startedAt || g.round.startedAt);
      }
    });
    this.finish();
    await this.save();
    this.toEveryone();
  }

  /* ---------------- the teacher's controls ---------------- */

  async fromHost(m) {
    const g = this.game;
    if (m.t === 'close') return this.close('Your teacher ended this game.', 'Game ended.');
    // The host can change the game's settings while students are joining
    // (Gennaro, 2026-09-29). Blast is always teams showing the definition and
    // Match always one player each, so those two stay as they are there.
    if (m.t === 'settings' && g.phase === 'lobby' && m.opts) {
      const o = m.opts;
      if (g.kind === 'volley' && typeof o.teams === 'boolean') g.opts.teams = o.teams;
      if (g.kind === 'volley' && typeof o.promptDef === 'boolean') g.opts.promptDef = o.promptDef;
      if (MATCH_PAIRS.includes(Number(o.pairs))) g.opts.pairs = Math.min(Number(o.pairs), g.cards.length);
      if (typeof o.fast === 'boolean') g.opts.fast = o.fast;
      if (o.minutes !== undefined) g.opts.minutes = blastMinutes(o.minutes, g.opts.minutes);
      if (typeof o.hidden === 'boolean') g.opts.hidden = o.hidden;
      if (PAUSES.includes(Number(o.pause))) g.opts.pause = Number(o.pause);
      if (o.target) g.opts.target = Math.min(30, Math.max(3, Number(o.target) || 12));
      if (o.winners) g.opts.winners = Math.min(3, Math.max(1, Number(o.winners) || 1));
      if (o.teamSize) g.opts.teamSize = Math.min(g.kind === 'blast' ? 4 : 6, Math.max(2, Number(o.teamSize) || 3));
      if (g.kind === 'volley' && typeof o.pick === 'boolean') g.opts.pick = o.pick;
      if (PICK_TEAMS.includes(Number(o.pickTeams))) g.opts.pickTeams = Number(o.pickTeams);
      if ((g.kind === 'volley' || g.kind === 'blast') && typeof o.powers === 'boolean') g.opts.powers = o.powers;
      if (typeof o.doodle === 'boolean') g.opts.doodle = o.doodle;
      if (g.kind === 'volley' && LIMITS.includes(Number(o.limit))) g.opts.limit = Number(o.limit);
      // Switching how teams are made clears the lobby's teams.
      if (g.opts.teams && g.opts.pick) this.pickTeamsReady();
      else if (!g.teamOrder.length || g.teamOrder[0][0] === 'p') {
        g.teams = {}; g.teamOrder = []; g.pickEndsAt = 0; g.pickLocked = false;
        g.order.forEach((pid) => { g.players[pid].team = null; });
      }
    } else if (m.t === 'pickTimer' && this.picking()) {
      // Start the countdown (or, with 0, stop it and let students pick again).
      const secs = Number(m.seconds);
      if (secs === 0) { g.pickEndsAt = 0; g.pickLocked = false; }
      else if (PICK_SECONDS.includes(secs)) { g.pickEndsAt = Date.now() + secs * 1000; g.pickLocked = false; }
      else return;
    } else if (m.t === 'makeTeams' && (g.phase === 'lobby' || g.phase === 'teams')) {
      if (!g.order.length) return;
      if (g.opts.teams) {
        this.makeTeams();
        g.phase = 'teams';
      }
    } else if (m.t === 'backToLobby' && g.phase === 'teams') {
      g.teams = {};
      g.teamOrder = [];
      g.order.forEach((pid) => { g.players[pid].team = null; });
      g.phase = 'lobby';
    } else if (m.t === 'demoWin' && g.opts.demo && g.phase === 'play') {
      return this.demoWin();
    } else if (m.t === 'start' && (g.phase === 'lobby' || g.phase === 'teams')) {
      // Demo mode: anyone still to arrive joins now.
      if (g.opts.demo) this.demoJoin(DEMO_STUDENTS);
      if (!g.order.length) return;
      if (g.opts.teams && g.opts.pick && g.phase === 'lobby') {
        // Students picked: fill in anyone who did not, and drop empty teams.
        this.pickFillIn();
        g.teamOrder = g.teamOrder.filter((id) => g.teams[id].members.length);
        Object.keys(g.teams).forEach((id) => { if (!g.teamOrder.includes(id)) delete g.teams[id]; });
        g.pickLocked = true;
        g.pickEndsAt = 0;
      } else if (g.opts.teams && g.phase === 'lobby') this.makeTeams();
      if (!g.opts.teams) {
        g.teams = {};
        g.teamOrder = [];
        g.order.forEach((pid) => this.makeSoloTeam(pid));
      }
      g.places = 0;
      g.missed = {};
      g.stats = {};
      g.pstats = {};
      g.feed = [];
      this.doneStats = null;
      if (g.kind === 'match') {
        g.round = { cards: shuffle(g.cards.map((_, i) => i)).slice(0, g.opts.pairs), startedAt: Date.now() + GO_MS };
      }
      // A giant 3, 2, 1, GO! on every screen first (Gennaro, 2026-09-29):
      // nobody can answer until goAt, and the clocks start then.
      g.goAt = Date.now() + GO_MS;
      g.teamOrder.forEach((tid) => this.startTeam(g.teams[tid]));
      g.phase = 'play';
      g.startedAt = g.goAt;
      g.endsAt = g.kind === 'blast' ? g.startedAt + g.opts.minutes * 60 * 1000
        : g.kind === 'volley' && g.opts.limit ? g.startedAt + g.opts.limit * 60 * 1000 : 0;
      await this.ctx.storage.setAlarm(this.nextAlarm(Date.now()));
    } else if (m.t === 'end' && g.phase === 'play') {
      // Ended early: the podium is the scores right now.
      this.finish();
    } else if (m.t === 'time' && g.phase === 'play' && (g.kind === 'volley' || g.kind === 'blast')) {
      // Add or take away time mid-game; in Vocab Live this can also start a
      // clock on a game that had none. Never less than 10 seconds left.
      const add = Math.max(-600, Math.min(600, Math.round(Number(m.seconds) || 0))) * 1000;
      if (!add) return;
      const now = Date.now();
      if (g.endsAt) g.endsAt = Math.max(now + 10000, g.endsAt + add);
      else if (add > 0) g.endsAt = Math.max(now, g.goAt || 0) + add;
      else return;
      await this.ctx.storage.setAlarm(this.nextAlarm(now));
    } else if (m.t === 'fast' && g.kind === 'volley' && (g.phase === 'play' || g.phase === 'lobby' || g.phase === 'teams')) {
      // Fast mode (no going back to 0) can be switched mid-game.
      g.opts.fast = !!m.on;
    } else if (m.t === 'again' && g.phase === 'done') {
      g.teams = {};
      g.teamOrder = [];
      g.order.forEach((pid) => { g.players[pid].team = null; });
      g.places = 0;
      g.missed = {};
      g.stats = {};
      g.pstats = {};
      this.doneStats = null;
      g.phase = 'lobby';
      g.pickEndsAt = 0;
      g.pickLocked = false;
      if (g.opts.teams && g.opts.pick) this.pickTeamsReady();
    } else if (m.t === 'unblock') {
      g.blocked = (g.blocked || []).filter((x) => x.id !== String(m.id || ''));
    } else if (m.t === 'kick') {
      const pid = String(m.id || '');
      const p = g.players[pid];
      if (!p) return;
      // Remove and block (Gennaro, 2026-09-30): only for this game, which
      // forgets it when it closes. "Let back in" undoes it.
      if (m.block) {
        g.blocked = (g.blocked || []).concat([{ id: token().slice(0, 8), name: p.name, dev: p.dev || '', typed: !!g.opts.typedNames }]).slice(-60);
      }
      delete g.players[pid];
      g.order = g.order.filter((x) => x !== pid);
      const t = p.team && g.teams[p.team];
      if (t) {
        t.members = t.members.filter((x) => x !== pid);
        // A team students pick from stays, even with no one on it yet.
        if (!t.members.length && !this.picking()) {
          delete g.teams[t.id];
          g.teamOrder = g.teamOrder.filter((x) => x !== t.id);
        } else if (g.kind === 'volley' && t.q) {
          this.deal(t);
        }
      }
      this.sockets((a) => a.pid === pid).forEach((ws) => {
        this.send(ws, m.block
          ? { t: 'removed', blocked: true, msg: 'Your teacher removed you from this game.' }
          : { t: 'removed', msg: 'Your teacher took you out of this game. You can join again.' });
        try { ws.close(1000, 'Removed'); } catch { /* gone */ }
      });
      // Everyone still playing may have finished now.
      if (g.phase === 'play' && g.teamOrder.length && g.teamOrder.every((id) => g.teams[id].place)) this.finish();
      await this.save();
      if (g.phase === 'done') { this.toEveryone(); return; }
      if (t && g.teams[t.id]) this.toTeam(t.id);
      this.toHost();
      return;
    } else if (m.t === 'rename') {
      const p = g.players[String(m.id || '')];
      if (!p) return;
      p.name = this.randomName();
      const t = p.team && g.teams[p.team];
      if (t && !g.opts.teams) t.name = p.name;
      this.sockets((a) => a.pid === p.id).forEach((ws) => this.send(ws, { t: 'me', id: p.id, secret: p.secret, name: p.name, code: g.code }));
      await this.save();
      if (t) this.toTeam(t.id); else this.toPlayer(p.id);
      this.toHost();
      return;
    } else {
      return;
    }
    await this.save();
    this.toEveryone();
    if (this.demoBusy()) await this.ctx.storage.setAlarm(this.nextAlarm(Date.now()));
  }

  /* ---------------- what each screen is sent ---------------- */

  teamSummary(t) {
    const g = this.game;
    return {
      id: t.id,
      name: t.name,
      // The team's number, 1 up, for finding seats.
      num: g.teamOrder.indexOf(t.id) + 1,
      color: t.color,
      emoji: t.emoji,
      members: t.members.map((pid) => ({ id: pid, name: g.players[pid] ? g.players[pid].name : '?', on: this.online(pid) })),
      progress: t.progress || 0,
      place: t.place || 0,
      finishMs: t.finishMs || 0,
      streak: t.streak || 0,
      pu: this.game.opts.powers && this.game.kind !== 'match' ? this.hostPower(t) : null
    };
  }

  // The icons beside a team's lane on the big screen.
  hostPower(t) {
    const now = Date.now();
    const fx = t.fx || {};
    return {
      item: t.item || null,
      voting: !!(t.vote && now < t.vote.until),
      shield: now < (fx.shieldUntil || 0),
      mirror: now < (fx.mirrorUntil || 0),
      frozen: now < (fx.holdUntil || 0) ? fx.hold : '',
      glitch: now < (fx.glitchUntil || 0),
      double: fx.double || 0
    };
  }

  board() {
    const g = this.game;
    const missed = Object.keys(g.missed)
      .map((i) => ({ term: g.cards[i].term, def: g.cards[i].def, n: g.missed[i] }))
      .sort((x, y) => y.n - x.n)
      .slice(0, 8);
    return {
      t: 'board',
      kind: g.kind,
      now: Date.now(),
      endsAt: g.endsAt || 0,
      goAt: g.phase === 'play' ? g.goAt || 0 : 0,
      pairs: g.round ? g.round.cards.length : g.opts.pairs,
      code: g.code,
      phase: g.phase,
      title: g.title,
      setId: g.setId,
      cardCount: g.cards.length,
      opts: g.opts,
      players: g.order.map((pid) => ({ id: pid, name: g.players[pid].name, on: this.online(pid), team: g.players[pid].team, bot: !!g.players[pid].bot, pass: !!g.players[pid].stu })),
      counts: !!g.counts && !g.opts.demo,
      teams: g.teamOrder.map((tid) => this.teamSummary(g.teams[tid])),
      pick: this.picking() ? { endsAt: g.pickEndsAt || 0, locked: !!g.pickLocked, cap: this.pickCap() } : null,
      missed,
      blocked: (g.blocked || []).map((x) => ({ id: x.id, name: x.name })),
      feed: g.opts.powers && g.phase === 'play' ? (g.feed || []).filter((e) => !e.quiet && Date.now() - e.at < 8000) : [],
      stats: g.phase === 'done' ? this.doneSummary() : null
    };
  }

  view(pid) {
    const g = this.game;
    const p = g.players[pid];
    if (!p) return { t: 'removed', msg: 'You are not in this game.' };
    const t = p.team && g.teams[p.team];
    const out = { t: 'view', kind: g.kind, now: Date.now(), goAt: g.phase === 'play' ? g.goAt || 0 : 0, phase: g.phase, title: g.title, name: p.name, me: pid, teamsMode: g.opts.teams, target: g.opts.target, fast: g.opts.fast, doodle: g.opts.doodle !== false, endsAt: g.phase === 'play' ? g.endsAt || 0 : 0 };
    if (t) out.team = this.teamSummary(t);
    if (this.picking()) {
      out.pick = {
        endsAt: g.pickEndsAt || 0,
        locked: !!g.pickLocked,
        cap: this.pickCap(),
        mine: p.team || '',
        teams: g.teamOrder.map((id, i) => { const x = g.teams[id]; return { id, num: i + 1, name: x.name, color: x.color, emoji: x.emoji, members: x.members.map((m) => (g.players[m] ? g.players[m].name : '?')) }; })
      };
    }
    if (g.kind === 'blast' && g.phase === 'play' && t && t.q) {
      const c = g.cards[t.q.card];
      out.blast = {
        seq: t.q.seq,
        prompt: c.def,
        img: c.img,
        rocks: t.q.rocks.map((k) => ({ k, text: g.cards[k].term })),
        gone: t.q.gone,
        seed: t.q.seed,
        at: t.q.at,
        endsAt: g.endsAt,
        score: t.progress || 0,
        ships: t.members.map((id) => ({ id, name: g.players[id] ? g.players[id].name : '?', on: this.online(id) })),
        stunMs: Math.max(0, ((this.stun || {})[pid] || 0) - Date.now()),
        streak: t.streak || 0,
        others: g.teamOrder.filter((id) => id !== t.id).map((id) => ({ name: g.teams[id].name, emoji: g.teams[id].emoji, score: g.teams[id].progress || 0 }))
      };
      if (g.opts.powers) out.pu = this.powerView(t, pid);
    }
    if (g.kind === 'match' && g.phase === 'play' && t && g.round) {
      out.match = {
        cards: g.round.cards.map((k) => ({ k, term: g.cards[k].term, def: g.cards[k].def, img: g.cards[k].img })),
        found: t.found || [],
        hidden: g.opts.hidden,
        startedAt: t.startedAt || g.round.startedAt,
        finishMs: t.finishMs || 0,
        place: t.place || 0,
        finished: g.teamOrder.filter((id) => g.teams[id].place).length,
        players: g.teamOrder.length
      };
    }
    if (g.kind === 'volley' && g.phase === 'play' && t && t.q && !t.place) {
      const c = g.cards[t.q.card];
      out.q = {
        seq: t.q.seq,
        prompt: g.opts.promptDef ? c.def : c.term,
        img: g.opts.promptDef ? c.img : '',
        promptIs: g.opts.promptDef ? 'definition' : 'term',
        options: ((t.q.deal && t.q.deal[pid]) || []).filter((k) => !(t.q.hide || []).includes(k)).map((k) => ({ k, text: this.answerOf(k) })),
        // Teammates still here: someone who has gone holds no answers.
        teammates: t.members.filter((id) => id !== pid && this.online(id)).length
      };
      out.lockMs = Math.max(0, (t.lockUntil || 0) - Date.now());
      if (g.opts.powers) out.pu = this.powerView(t, pid);
      if (out.lockMs) {
        const ready = t.ready || [];
        out.wait = { me: ready.includes(pid), ready: ready.length, of: t.members.filter((id) => this.online(id)).length };
      }
    }
    if (t && t.last) out.last = t.last;
    if (g.phase === 'done') {
      let ranked = g.teamOrder.map((id) => g.teams[id]).filter((x) => x.place).sort((x, y) => x.place - y.place).map((x) => ({ x, place: x.place }));
      // Ended early: the teams furthest along stand on the podium, as on the host screen.
      if (!ranked.length) {
        ranked = g.teamOrder.map((id) => g.teams[id]).sort((x, y) => (y.progress || 0) - (x.progress || 0)).slice(0, 3)
          .map((x, i) => ({ x, place: i + 1 }));
      }
      const mine = t ? ranked.find((r) => r.x.id === t.id) : null;
      out.done = {
        place: t ? t.place || (mine ? mine.place : 0) : 0,
        score: t ? t.progress || 0 : 0,
        finishMs: t ? t.finishMs || 0 : 0,
        stats: this.doneSummary(),
        mine: (() => {
          const m = (g.pstats || {})[pid];
          return m ? { right: m.r, wrong: m.w, avg: m.n ? Math.round(m.ms / m.n) : 0, best: m.best, term: m.term } : null;
        })(),
        winners: ranked.slice(0, 3).map((r) => ({ name: r.x.name, emoji: r.x.emoji, color: r.x.color, place: r.place, mine: !!(t && r.x.id === t.id), score: r.x.progress || 0, finishMs: r.x.finishMs || 0 }))
      };
    }
    return out;
  }
}

// This Worker has no pages of its own. The Pages site reaches the games
// through its LIVE binding.
export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  }
};
