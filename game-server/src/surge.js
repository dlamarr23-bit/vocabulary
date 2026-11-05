// Surge Showdown (Donny, 2026-11-04): the team battle quiz that used to run
// on its own site (surge-showdown.pages.dev), moved onto this game server so
// it works like Battle Royale: the teacher hosts it from the Host a game page
// with a question set or flashcard set, students join at /join/ with the same
// six letter codes, sign in with Class Pass (or join as guests when the
// teacher allows it), and the winning team goes on the class leaderboard.
//
// How it plays (the same rules as before): students answer questions on their
// own screens to earn energy, then spend it on upgrades, on attacks against
// other teams, or on healing and shielding their own team. Every team shares
// one health bar. As the clock runs down every power-up gets stronger (the
// "surge"). Extras the teacher can switch off: Double or Nothing, a bounty on
// the leader, comebacks for fallen teams, supply drops and a final showdown.
// When time runs out the top 3 teams go on the podium.
//
// A SurgeRoom is a helper the LiveGame (index.js) makes when the game in it is
// kind 'surge'. The game's state is LiveGame's this.game, so it is saved and
// loaded like every other game ('game', and its questions apart under 'cards'),
// and LiveGame's 3 hour limit still closes it.
import { cleanName } from './names.js';
import { royaleQuestions } from './royale.js';

export const RULES = {
  upgrades: {
    gain: {
      name: 'Energy per Question',
      desc: 'Earn more energy for every correct answer.',
      levels: [10, 20, 35, 60, 100, 160],
      costs: [0, 60, 180, 450, 1100, 2600]
    },
    streak: {
      name: 'Streak Bonus',
      desc: 'Bonus energy for each answer in a row you get right (up to 10).',
      levels: [0, 2, 5, 9, 15],
      costs: [0, 80, 240, 600, 1400]
    }
  },
  powers: {
    strike: { name: 'Strike', icon: '⚔️', cost: 40, base: 30, target: 'enemy', desc: 'Hit one team.' },
    siphon: { name: 'Siphon', icon: '🌀', cost: 90, base: 25, target: 'enemy', desc: 'Hit one team and heal yours by the same amount.' },
    barrage: { name: 'Barrage', icon: '☄️', cost: 150, base: 18, target: 'all', desc: 'Hit every other team still standing.' },
    mend: { name: 'Mend', icon: '💚', cost: 60, base: 45, target: 'self', desc: 'Heal your team.' },
    shield: { name: 'Shield', icon: '🛡️', cost: 70, base: 50, target: 'self', desc: 'Add a shield that absorbs damage.' }
  },
  gamble: {
    name: 'Double or Nothing', icon: '🎲', cost: 30, base: 60, cooldownSec: 60,
    desc: 'Bet on your next question. Right: your team gains health. Wrong: your team loses it (never knocks you out).'
  },
  bountyEnergy: 0.5,
  comebackHp: 0.3,
  showdownSec: 60,
  drop: { need: 5, perPlayer: 2.5, firstSec: 90, everySec: 120, expireSec: 75, minLeftSec: 45, share: 0.35, energy: 100 }
};

const TEAMS = [['Fire', '🔥', '#ef4444'], ['Water', '💧', '#3b82f6'], ['Earth', '🪨', '#b7791f'], ['Air', '🌪️', '#e2e8f0'], ['Lightning', '⚡', '#facc15'],
  ['Ice', '❄️', '#67e8f9'], ['Nature', '🌿', '#22c55e'], ['Metal', '⚙️', '#f97316'], ['Light', '✨', '#f472b6'], ['Shadow', '🌑', '#8b5cf6']]
  .map(([name, icon, color]) => ({ name, icon, color }));

const DEFAULT_SETTINGS = {
  title: 'Surge Showdown',
  theme: 'elements',
  teamCount: 4,
  teams: TEAMS,
  durationMin: 10,
  hpAmount: 300,
  hpMode: 'perPlayer',
  surgeMax: 5,
  surgeCurve: 4,
  powerScale: 1,
  energyScale: 1,
  fallenCanAttack: true,
  sizeBoost: true,
  lastTeamEnds: false,
  teamPick: 'auto',
  lateJoin: true,
  wrongPenalty: 5,
  ptsCorrect: 10,
  ptsDamage: 1,
  survivalBonus: 300,
  koBonus: 200,
  koPenalty: 0,
  feedNames: true,
  demo: false,
  gamble: true,
  bounty: true,
  comeback: 10,
  supplyDrops: true,
  showdown: true
};

const DEMO_COUNT = 40;
const MAX_SURGE_PLAYERS = 120;
// A game that is not running closes after this long with nothing happening.
const IDLE_MS = 30 * 60 * 1000;
const LIFETIME_MS = 3 * 60 * 60 * 1000;
const BOT_NAMES = ['Ava M.', 'Liam R.', 'Mia T.', 'Noah G.', 'Sofia L.', 'Ethan P.', 'Isabella C.', 'Mason K.', 'Zoe H.', 'Lucas B.',
  'Chloe W.', 'Elijah D.', 'Aria S.', 'James F.', 'Layla N.', 'Daniel V.', 'Nora J.', 'Mateo A.', 'Lily E.', 'Henry O.',
  'Camila Q.', 'Jack Y.', 'Hazel Z.', 'Leo U.', 'Ellie I.', 'Owen X.', 'Stella R.', 'Gabriel M.', 'Ruby T.', 'Julian G.',
  'Violet L.', 'Wyatt P.', 'Aurora C.', 'Ezra K.', 'Penelope H.', 'Kai B.', 'Naomi W.', 'Diego D.', 'Maya S.', 'Isaac F.'];

const rid = (n = 16) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
};
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? clamp(x, lo, hi) : d; };
const periodOf = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);

export function sanitizeSettings(input, prev = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...prev };
  const i = input || {};
  s.title = String(i.title ?? s.title).replace(/[<>]/g, '').slice(0, 40) || 'Surge Showdown';
  s.theme = String(i.theme ?? s.theme).slice(0, 20);
  s.teamCount = Math.round(num(i.teamCount, s.teamCount, 2, 10));
  if (Array.isArray(i.teams) && i.teams.length) {
    s.teams = i.teams.slice(0, 10).map((t, k) => ({
      name: String((t && t.name) || `Team ${k + 1}`).replace(/[<>]/g, '').slice(0, 20),
      icon: String((t && t.icon) || '⭐').slice(0, 4),
      color: /^#[0-9a-f]{6}$/i.test(t && t.color) ? t.color : '#888888'
    }));
  }
  s.teams = s.teams.slice();
  while (s.teams.length < 10) s.teams.push({ name: `Team ${s.teams.length + 1}`, icon: '⭐', color: '#888888' });
  s.durationMin = num(i.durationMin, s.durationMin, 1, 90);
  s.hpAmount = Math.round(num(i.hpAmount, s.hpAmount, 50, 100000));
  s.hpMode = i.hpMode === 'flat' ? 'flat' : i.hpMode === 'perPlayer' ? 'perPlayer' : s.hpMode;
  s.surgeMax = num(i.surgeMax, s.surgeMax, 1, 20);
  s.surgeCurve = num(i.surgeCurve, s.surgeCurve, 0.5, 10);
  s.powerScale = num(i.powerScale, s.powerScale, 0.25, 5);
  s.energyScale = num(i.energyScale, s.energyScale, 0.25, 5);
  for (const k of ['fallenCanAttack', 'sizeBoost', 'lastTeamEnds', 'lateJoin', 'feedNames', 'demo', 'gamble', 'bounty', 'supplyDrops', 'showdown']) {
    if (typeof i[k] === 'boolean') s[k] = i[k];
    else if (i[k] === 'true' || i[k] === 'false') s[k] = i[k] === 'true';
  }
  s.teamPick = i.teamPick === 'choose' ? 'choose' : i.teamPick === 'auto' ? 'auto' : s.teamPick;
  s.wrongPenalty = Math.round(num(i.wrongPenalty, s.wrongPenalty, 0, 1000));
  s.ptsCorrect = Math.round(num(i.ptsCorrect, s.ptsCorrect, 0, 1000));
  s.ptsDamage = num(i.ptsDamage, s.ptsDamage, 0, 100);
  s.survivalBonus = Math.round(num(i.survivalBonus, s.survivalBonus, 0, 100000));
  s.koBonus = Math.round(num(i.koBonus, s.koBonus, 0, 100000));
  s.koPenalty = Math.round(num(i.koPenalty, s.koPenalty, 0, 100000));
  s.comeback = Math.round(num(i.comeback, s.comeback, 0, 100));
  return s;
}

// The site's question sets ({ q, a, w, img, ai, wi }) or flashcards, checked
// the way Battle Royale checks them, kept as { q, img, ans: [right, wrong...] }.
function surgeQuestions(body) {
  return royaleQuestions(body).map((x) => ({
    q: x.q, img: x.img || '',
    ans: [{ t: x.a, img: x.ai || '' }, ...x.w.map((t, i) => ({ t, img: (x.wi || [])[i] || '' }))]
  }));
}

export class SurgeRoom {
  constructor(lg) {
    this.lg = lg;
    this.saveTimer = null;
    this.bcastTimer = null;
    this.botTimer = null;
  }
  get s() { return this.lg.game && this.lg.game.kind === 'surge' ? this.lg.game : null; }
  get ctx() { return this.lg.ctx; }
  get env() { return this.lg.env; }

  /* ---------------- saving and telling everyone ---------------- */

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      if (this.s) await this.lg.save();
    }, 400);
  }
  async saveNow() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.s) await this.lg.save();
  }
  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* closed */ }
  }
  att(ws) {
    try { return ws.deserializeAttachment() || {}; } catch { return {}; }
  }
  sockets(pid) {
    return this.ctx.getWebSockets().filter((w) => this.att(w).pid === pid);
  }
  sendToPlayer(pid, msg) {
    if (this.s && this.s.players[pid] && this.s.players[pid].bot) return;
    for (const ws of this.sockets(pid)) this.send(ws, msg);
  }
  broadcast() {
    if (!this.s) return;
    this.updateBounty();
    this.save();
    if (this.bcastTimer) return;
    this.bcastTimer = setTimeout(() => {
      this.bcastTimer = null;
      if (!this.s) return;
      const pub = JSON.stringify({ t: 'state', state: this.publicState(false) });
      const host = JSON.stringify({ t: 'state', state: this.publicState(true) });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(this.att(ws).role === 'host' ? host : pub); } catch { /* closed */ }
      }
    }, 200);
  }

  /* ---------------- the clock and the surge ---------------- */

  elapsedMs(now = Date.now()) {
    const s = this.s;
    return s.elapsedBase + (s.runStartedAt ? now - s.runStartedAt : 0);
  }
  remainingMs(now = Date.now()) {
    return Math.max(0, this.s.totalMs - this.elapsedMs(now));
  }
  surge(now = Date.now()) {
    const s = this.s;
    if (s.status === 'lobby') return 1;
    const p = clamp(this.elapsedMs(now) / s.totalMs, 0, 1);
    const k = s.settings.surgeCurve, M = s.settings.surgeMax;
    return (1 + (M - 1) * (Math.exp(k * p) - 1) / (Math.exp(k) - 1)) * (this.inShowdown(now) ? 2 : 1);
  }
  // The final showdown: the last minute of a game at least 2 minutes long.
  inShowdown(now = Date.now()) {
    const s = this.s;
    return !!(s.settings.showdown && (s.status === 'running' || s.status === 'paused') && s.totalMs >= 120000 && this.remainingMs(now) <= RULES.showdownSec * 1000);
  }
  // When the game needs waking next: the end of the clock, the showdown,
  // supply drops, pretend students; otherwise to close it once it has been
  // quiet for half an hour. Never after the 3 hour limit.
  nextAt(now = Date.now()) {
    const s = this.s;
    let at;
    if (s.status === 'running') {
      at = now + this.remainingMs(now) + 50;
      const sdIn = this.remainingMs(now) - RULES.showdownSec * 1000;
      if (s.settings.showdown && !s.sdOn && sdIn > 0) at = Math.min(at, now + sdIn + 50);
      if (s.drop || s.settings.supplyDrops) at = Math.min(at, now + 10000);
      if (s.settings.demo) at = Math.min(at, now + 15000);
    } else {
      at = Math.max(now + 60000, (s.touchedAt || s.created) + IDLE_MS);
    }
    return Math.min(at, s.created + LIFETIME_MS);
  }
  async scheduleAlarm() {
    if (this.s) await this.ctx.storage.setAlarm(this.nextAt());
  }
  async alarm() {
    const s = this.s;
    if (!s) return;
    if (s.status === 'running') {
      if (this.remainingMs() <= 0) { this.endGame('time'); await this.saveNow(); }
      else if (this.events()) this.broadcast();
      this.ensureBotTimer();
      await this.scheduleAlarm();
      return;
    }
    if (Date.now() - (s.touchedAt || s.created) >= IDLE_MS - 1000) {
      this.stopBotTimer();
      const msg = 'This game closed after 30 minutes with nothing happening.';
      await this.lg.close(msg, msg);
      return;
    }
    await this.scheduleAlarm();
  }

  /* ---------------- making a game ---------------- */

  async init(body) {
    const old = await this.lg.load();
    if (old && Date.now() - old.created < LIFETIME_MS) return new Response('taken', { status: 409 });
    const cards = surgeQuestions(body);
    if (!cards.length) return new Response('That set needs at least 1 question with a right answer and a wrong one.', { status: 400 });
    const o = body.opts || {};
    const settings = sanitizeSettings(o.settings);
    if (o.demo === true) settings.demo = true;
    const who = o.who === 'guests' ? 'guests' : 'pass';
    const now = Date.now();
    this.lg.game = {
      kind: 'surge',
      code: String(body.code),
      created: now,
      hostKey: String(body.hostKey),
      title: String(body.title || 'Surge Showdown').slice(0, 120),
      setId: String(body.setId || ''),
      counts: body.counts === true,
      // Who can join and the class period (index.js reads who through needPass()).
      opts: { who, typedNames: who === 'guests', period: periodOf(o.period), demo: settings.demo },
      cards,
      status: 'lobby',
      settings,
      teams: [],
      players: {},
      feed: [],
      botsToAdd: 0,
      totalMs: 0, elapsedBase: 0, runStartedAt: null,
      endReason: null, results: null,
      touchedAt: now
    };
    this.buildTeams();
    if (settings.demo) this.s.botsToAdd = DEMO_COUNT;
    await this.ctx.storage.put('cards', cards);
    await this.saveNow();
    await this.scheduleAlarm();
    this.ensureBotTimer();
    return Response.json({ ok: true });
  }

  /* ---------------- connections ---------------- */

  // The teacher's screen comes with ?host=<key>; a student's with the
  // Class Pass student the site checked (stu), or none.
  connect(url, stu) {
    const s = this.s;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const key = url.searchParams.get('host');
    s.touchedAt = Date.now();
    if (key) {
      if (key !== s.hostKey) {
        server.accept();
        server.send(JSON.stringify({ t: 'error', code: 'nohost', msg: 'This screen is no longer the host of that game.' }));
        server.close(1000, 'Not host');
        return new Response(null, { status: 101, webSocket: client });
      }
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role: 'host' });
      this.send(server, { t: 'hello', role: 'host', rules: RULES, state: this.publicState(true) });
    } else {
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ role: 'anon', stu: stu || null });
      this.send(server, {
        t: 'hello', kind: 'surge', role: 'anon', rules: RULES, state: this.publicState(false),
        title: s.settings.title, needPass: this.lg.needPass(), guests: s.opts.who === 'guests', signedIn: !!stu
      });
    }
    this.ensureBotTimer();
    return new Response(null, { status: 101, webSocket: client });
  }

  async message(ws, raw) {
    const s = this.s;
    if (!s || typeof raw !== 'string' || raw.length > 1000000) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const a = this.att(ws);
    this.ensureBotTimer();
    if (m.t === 'ping') return this.send(ws, { t: 'pong', now: Date.now() });
    s.touchedAt = Date.now();
    if (a.role === 'host') return this.onHost(ws, m);
    if ((a.role === 'anon' || a.role === 'player') && m.t === 'join') return this.onJoin(ws, a, m);
    if (a.role === 'player') return this.onPlayer(ws, a.pid, m);
  }

  wsClosed(ws) {
    const s = this.s;
    if (!s) return;
    const a = this.att(ws);
    if (a.pid && s.players[a.pid]) {
      const still = this.sockets(a.pid).filter((w) => w !== ws && w.readyState === 1);
      if (!still.length) { s.players[a.pid].online = false; this.broadcast(); }
    }
  }

  /* ---------------- teams ---------------- */

  buildTeams() {
    const s = this.s;
    s.teams = [];
    for (let i = 0; i < s.settings.teamCount; i++) {
      const t = s.settings.teams[i];
      s.teams.push({ id: i, name: t.name, icon: t.icon, color: t.color, hp: 0, maxHp: 0, shield: 0, alive: true, active: true, bonus: 0, kos: 0, fellAt: null, rank: null });
    }
    for (const p of Object.values(s.players)) if (p.team >= s.teams.length) p.team = this.smallestTeam();
  }
  teamSize(id) { return Object.values(this.s.players).filter((p) => p.team === id && !p.kicked).length; }
  // Smaller teams get stronger power-ups: biggest team size / this team size.
  teamBoost(id) {
    const s = this.s;
    if (!s.settings.sizeBoost) return 1;
    const n = this.teamSize(id);
    if (n <= 0) return 1;
    let big = 0;
    for (const t of s.teams) if (s.status === 'lobby' || t.active) big = Math.max(big, this.teamSize(t.id));
    return Math.max(1, big / n);
  }
  smallestTeam(onlyAlive = false) {
    let best = -1, bestN = Infinity;
    const order = shuffle(this.s.teams.map((t) => t.id));
    for (const id of order) {
      const t = this.s.teams[id];
      if (onlyAlive && (!t.alive || !t.active)) continue;
      const n = this.teamSize(id);
      if (n < bestN) { best = id; bestN = n; }
    }
    if (best < 0) return onlyAlive ? this.smallestTeam(false) : 0;
    return best;
  }
  teamScore(t) {
    let sc = t.bonus;
    for (const p of Object.values(this.s.players)) if (p.team === t.id && !p.kicked) sc += p.points;
    return Math.round(sc);
  }
  // A player joining (or let back in) during a game.
  placeLive(p, team) {
    const s = this.s, t = s.teams[team];
    if (s.status === 'lobby' || s.status === 'ended') return;
    if (!t.active) {
      t.active = true; t.alive = true; t.shield = 0; t.fellAt = null;
      t.maxHp = s.settings.hpAmount; t.hp = t.maxHp;
      return;
    }
    this.recalcPerPlayerHp(team, +1);
  }

  /* ---------------- what the screens see ---------------- */

  // The teacher's screen also gets each player's school email (to tick off
  // the class list), whether they are a guest, and their energy.
  publicState(isHost) {
    const s = this.s, now = Date.now();
    const players = Object.values(s.players).filter((p) => !p.kicked).map((p) => ({
      id: p.id, name: p.name, team: p.team, online: p.online, bot: !!p.bot, watch: !!p.watch,
      points: Math.round(p.points), correct: p.correct, dmg: Math.round(p.dmg),
      ...(isHost ? { wrong: p.wrong, energy: Math.floor(p.energy), email: p.stu || '', guest: !!p.guest, pass: !!p.stu } : {})
    }));
    return {
      code: s.code, status: s.status, settings: { ...s.settings }, qCount: s.cards.length, setTitle: s.title,
      teams: s.teams.map((t) => ({ ...t, hp: Math.round(t.hp), shield: Math.round(t.shield), score: this.teamScore(t), size: this.teamSize(t.id), boost: this.teamBoost(t.id) })),
      players, feed: s.feed.slice(-25),
      ...(isHost ? {
        removed: Object.values(s.players).filter((p) => p.kicked && !p.bot && !p.watch).map((p) => ({ id: p.id, name: p.name, team: p.team })),
        who: s.opts.who, period: s.opts.period, counts: !!s.counts
      } : {}),
      totalMs: s.totalMs, elapsedBase: s.elapsedBase, runStartedAt: s.runStartedAt, serverNow: now,
      surge: this.surge(now), endReason: s.endReason, results: s.results,
      bounty: s.bountyId ?? null, showdown: this.inShowdown(now), calls: (s.calls || []).slice(-8),
      drop: s.drop ? { id: s.drop.id, prize: s.drop.prize, need: s.drop.need, prog: s.drop.prog, ends: s.drop.ends } : null
    };
  }

  /* ---------------- the teacher ---------------- */

  async onHost(ws, m) {
    const s = this.s;
    switch (m.t) {
      case 'close':
        this.stopBotTimer();
        return this.lg.close('Your teacher ended this game.', 'Game ended.');
      // Who can join and the class period, any time (the same messages as the other games).
      case 'period':
        s.opts.period = periodOf(m.period);
        break;
      case 'who':
        s.opts.who = m.who === 'guests' ? 'guests' : 'pass';
        s.opts.typedNames = s.opts.who === 'guests';
        break;
      case 'settings': {
        if (s.status !== 'lobby') return;
        const wasDemo = s.settings.demo;
        s.settings = sanitizeSettings(m.settings, s.settings);
        this.buildTeams();
        if (s.settings.demo !== wasDemo) this.setDemo(s.settings.demo);
        break;
      }
      // Another question set (from the site's sets, or a flashcard set made
      // into multiple choice on the teacher's screen).
      case 'questions': {
        const q = surgeQuestions({ questions: m.questions });
        if (q.length) {
          s.cards = q;
          if (m.title) s.title = String(m.title).slice(0, 120);
          if (typeof m.setId === 'string') s.setId = m.setId.slice(0, 60);
          for (const p of Object.values(s.players)) p.order = [];
          await this.ctx.storage.put('cards', q);
          this.send(ws, { t: 'toast', msg: q.length + (q.length === 1 ? ' question' : ' questions') + ' loaded.' });
        }
        break;
      }
      case 'lateJoin':
        s.settings.lateJoin = !!m.on;
        if (s.status !== 'lobby') this.feed(m.on ? '🚪 Joining is open. New players can jump in' : '🔒 Joining is locked', 'sys');
        break;
      case 'demo':
        if (s.status === 'ended') return;
        this.setDemo(!!m.on);
        break;
      case 'autopilot': {
        const p = s.players[m.pid];
        if (!p || p.bot || !s.settings.demo) return;
        p.watch = true; p.auto = !!m.on;
        if (p.auto) { p.skill ||= 0.75; p.speed ||= 0.8; p.nextAct = Date.now() + 1500; this.ensureBotTimer(); }
        break;
      }
      case 'start': {
        if (s.status !== 'lobby') return;
        const counts = s.teams.map((t) => this.teamSize(t.id));
        if (counts.reduce((x, y) => x + y, 0) < 1) return this.send(ws, { t: 'error', msg: 'No players have joined yet.' });
        for (const t of s.teams) {
          t.active = counts[t.id] > 0;
          t.maxHp = s.settings.hpMode === 'flat' ? s.settings.hpAmount : s.settings.hpAmount * Math.max(1, counts[t.id]);
          t.hp = t.maxHp; t.shield = 0; t.alive = t.active; t.bonus = 0; t.kos = 0; t.fellAt = null;
          t.revive = 0; t.revived = false; t.dangerAt = 0;
        }
        s.drop = null; s.nextDrop = RULES.drop.firstSec * 1000; s.sdOn = false; s.bountyId = null; s.bountyCallAt = 0; s.calls = [];
        s.totalMs = Math.round(s.settings.durationMin * 60000);
        s.elapsedBase = 0; s.runStartedAt = Date.now(); s.startedAt = s.runStartedAt; s.status = 'running';
        s.feed = [];
        this.feed('🚀 The battle has begun!', 'sys');
        for (const p of Object.values(s.players)) if (!p.kicked) { this.nextQuestion(p); if (p.bot || p.auto) p.nextAct = Date.now() + 1500 + Math.random() * 5000; }
        await this.scheduleAlarm();
        break;
      }
      case 'pause':
        if (s.status !== 'running') return;
        s.elapsedBase = this.elapsedMs(); s.runStartedAt = null; s.status = 'paused';
        this.feed('⏸️ Game paused by the teacher', 'sys');
        await this.scheduleAlarm();
        break;
      case 'resume':
        if (s.status !== 'paused') return;
        s.runStartedAt = Date.now(); s.status = 'running';
        this.feed('▶️ Game resumed', 'sys');
        await this.scheduleAlarm();
        break;
      case 'addTime': {
        if (s.status !== 'running' && s.status !== 'paused') return;
        const sec = clamp(Number(m.sec) || 0, -3600, 3600);
        s.totalMs = Math.max(this.elapsedMs() + 5000, s.totalMs + sec * 1000);
        this.feed(sec >= 0 ? `⏱️ ${Math.round(sec / 60 * 10) / 10} min added to the clock` : `⏱️ ${Math.round(-sec / 60 * 10) / 10} min taken off the clock`, 'sys');
        await this.scheduleAlarm();
        break;
      }
      case 'end':
        if (s.status !== 'running' && s.status !== 'paused') return;
        this.endGame('host');
        await this.scheduleAlarm();
        break;
      case 'kick': {
        const p = s.players[m.pid];
        if (!p || p.kicked) return;
        this.removePlayer(p);
        if (s.status !== 'lobby' && s.status !== 'ended') this.feed(`👋 ${p.name} left the game`, 'sys');
        break;
      }
      case 'readmit': {
        const p = s.players[m.pid];
        if (!p || !p.kicked) return;
        p.kicked = false;
        if (s.status === 'running' || s.status === 'paused') {
          const t = s.teams[p.team];
          if (!t || !t.active || !t.alive) p.team = this.smallestTeam(true);
          this.placeLive(p, p.team);
          this.feed(`🚪 ${p.name} is back in the game`, 'sys');
        } else if (!s.teams[p.team]) p.team = this.smallestTeam();
        this.sendToPlayer(p.id, { t: 'readmitted' });
        this.sendMe(p);
        if (s.status === 'running' || s.status === 'paused') this.nextQuestion(p);
        break;
      }
      case 'shuffle': {
        if (s.status !== 'lobby') return;
        const ps = shuffle(Object.values(s.players).filter((p) => !p.kicked));
        ps.forEach((p, i) => { p.team = i % s.teams.length; this.sendMe(p); });
        break;
      }
      case 'move': {
        const p = s.players[m.pid];
        const to = Number(m.team);
        if (!p || !s.teams[to] || p.team === to) return;
        if (s.status !== 'lobby' && !s.teams[to].active) return;
        const from = p.team;
        p.team = to;
        this.recalcPerPlayerHp(from, -1); this.recalcPerPlayerHp(to, +1);
        this.sendMe(p);
        break;
      }
      case 'rematch': {
        if (s.status !== 'ended') return;
        s.status = 'lobby'; s.results = null; s.endReason = null; s.feed = []; s.drop = null; s.calls = []; s.bountyId = null; s.sdOn = false;
        s.totalMs = 0; s.elapsedBase = 0; s.runStartedAt = null;
        for (const [id, p] of Object.entries(s.players)) {
          if (p.kicked) { delete s.players[id]; continue; }
          Object.assign(p, this.freshStats());
          this.sendMe(p);
          this.sendToPlayer(p.id, { t: 'q', q: null });
        }
        this.buildTeams();
        await this.scheduleAlarm();
        this.ensureBotTimer();
        break;
      }
      default: return;
    }
    this.broadcast();
  }

  removePlayer(p) {
    const s = this.s;
    p.kicked = true;
    this.sendToPlayer(p.id, { t: 'kicked' });
    this.recalcPerPlayerHp(p.team, -1);
    if (p.bot && (s.status === 'lobby' || s.status === 'ended')) delete s.players[p.id];
  }

  setDemo(on) {
    const s = this.s;
    s.settings.demo = on;
    s.opts.demo = on;
    if (on) {
      const have = Object.values(s.players).filter((p) => p.bot && !p.kicked).length;
      s.botsToAdd = Math.max(0, DEMO_COUNT - have);
      this.ensureBotTimer();
    } else {
      s.botsToAdd = 0;
      for (const p of Object.values(s.players)) if ((p.bot || p.watch) && !p.kicked) { p.auto = false; this.removePlayer(p); }
      if (s.status === 'running' || s.status === 'paused') this.feed('🎭 Pretend students left the game', 'sys');
    }
  }

  recalcPerPlayerHp(teamId, delta) {
    const s = this.s, t = s.teams[teamId];
    if (!t || s.status === 'lobby' || s.status === 'ended' || s.settings.hpMode !== 'perPlayer' || !t.alive) return;
    if (delta > 0) { t.maxHp += s.settings.hpAmount; t.hp += s.settings.hpAmount; }
    else if (this.teamSize(teamId) > 0) { t.maxHp = Math.max(s.settings.hpAmount, t.maxHp - s.settings.hpAmount); t.hp = Math.min(t.hp, t.maxHp); }
  }

  freshStats() {
    return { energy: 0, points: 0, correct: 0, wrong: 0, streak: 0, best: 0, dmg: 0, heal: 0, upg: { gain: 0, streak: 0 }, order: [], cur: null, opts: null, lastAns: 0, lastPow: 0, gamble: false, gambleNext: 0, bountyE: 0 };
  }

  /* ---------------- players ---------------- */

  newPlayer(name, team, extra = {}) {
    const s = this.s;
    const taken = new Set(Object.values(s.players).map((x) => x.name.toLowerCase()));
    let base = name, k = 2;
    while (taken.has(name.toLowerCase())) name = `${base.slice(0, 15)} ${k++}`;
    const p = { id: rid(8), token: rid(20), name, team, online: true, kicked: false, joinedAt: Date.now(), ...this.freshStats(), ...extra };
    s.players[p.id] = p;
    if (s.status === 'running' || s.status === 'paused') this.placeLive(p, team);
    return p;
  }

  // Joining (Donny, 2026-11-04): a Class Pass student plays under the name on
  // the class list and is found again by their email on any device; a guest
  // (only when the teacher allows guests) types a name, checked for rude
  // words (index.js guestName). The teacher's own player view in demo mode
  // proves it is the teacher with the host key.
  async onJoin(ws, a, m) {
    const s = this.s;
    const stu = a.stu && a.stu.email ? a.stu : null;
    let p = m.token ? Object.values(s.players).find((x) => x.token === m.token) : null;
    if (!p && stu) p = Object.values(s.players).find((x) => x.stu === stu.email) || null;
    if (p && p.kicked) {
      // Stays connected, so the teacher can let them back in.
      ws.serializeAttachment({ role: 'player', pid: p.id });
      this.send(ws, { t: 'kicked' });
      return;
    }
    if (!p) {
      const watch = !!(s.settings.demo && typeof m.host === 'string' && m.host === s.hostKey);
      const closed = () => {
        if (s.status === 'ended') return 'This game has ended. Wait for your teacher to start a new one.';
        if (s.status !== 'lobby' && !s.settings.lateJoin) return 'Joining is locked right now. Ask your teacher to open it.';
        if (Object.keys(s.players).length >= MAX_SURGE_PLAYERS) return 'This game is full.';
        return '';
      };
      if (closed()) return this.send(ws, { t: 'error', msg: closed() });
      if (!stu && !watch && this.lg.needPass()) return this.send(ws, { t: 'error', code: 'needPass', msg: 'Sign in with Class Pass to play.' });
      let name, extra;
      if (watch) { name = 'Teacher View'; extra = { watch: true }; }
      else if (stu) { name = this.lg.uniqueName(cleanName(stu.name) || 'Student'); extra = { stu: stu.email }; }
      else {
        name = await this.lg.guestName(ws, m);
        if (!name || this.s !== s) return;
        if (closed()) return this.send(ws, { t: 'error', msg: closed() });
        extra = { guest: true };
      }
      let team;
      const want = Number(m.team);
      const choose = s.settings.teamPick === 'choose' && m.team != null && m.team !== '';
      if (s.status === 'lobby') team = choose && s.teams[want] ? want : this.smallestTeam();
      else team = choose && s.teams[want] && s.teams[want].active && s.teams[want].alive ? want : this.smallestTeam(true);
      p = this.newPlayer(name, team, extra);
      if (s.status !== 'lobby') this.feed(`🚪 ${p.name} joined ${s.teams[team].icon} ${s.teams[team].name}`, 'sys');
    }
    p.online = true;
    ws.serializeAttachment({ role: 'player', pid: p.id });
    this.send(ws, { t: 'joined', pid: p.id, token: p.token });
    this.sendMe(p, ws);
    if (s.status === 'running' || s.status === 'paused') {
      if (p.cur == null) this.nextQuestion(p);
      else this.sendQuestion(p, ws);
    }
    this.broadcast();
  }

  meMsg(p) {
    return { t: 'me', me: { id: p.id, name: p.name, team: p.team, energy: Math.floor(p.energy), points: Math.round(p.points), correct: p.correct, wrong: p.wrong, streak: p.streak, best: p.best, dmg: Math.round(p.dmg), heal: Math.round(p.heal), upg: p.upg, gamble: !!p.gamble, gambleNext: p.gambleNext || 0 } };
  }
  sendMe(p, ws) {
    if (p.bot) return;
    const msg = this.meMsg(p);
    if (ws) this.send(ws, msg); else this.sendToPlayer(p.id, msg);
  }

  nextQuestion(p) {
    const s = this.s;
    if (!p.order || !p.order.length) {
      const order = shuffle(s.cards.map((_, i) => i));
      if (order.length > 1 && order[0] === p.cur) order.push(order.shift());
      p.order = order;
    }
    p.cur = p.order.shift();
    this.sendQuestion(p);
  }
  sendQuestion(p, ws) {
    const q = this.s.cards[p.cur];
    if (!q) return;
    p.opts = shuffle(q.ans.map((_, i) => i));
    if (p.bot) return;
    const msg = { t: 'q', q: { id: p.cur, text: q.q, img: q.img || '', options: p.opts.map((i) => ({ t: q.ans[i].t, img: q.ans[i].img || '' })) } };
    if (ws) this.send(ws, msg); else this.sendToPlayer(p.id, msg);
  }

  // Shared by real players and pretend students.
  applyAnswer(p, ok) {
    const s = this.s;
    let gained;
    if (ok) {
      p.streak++; p.best = Math.max(p.best, p.streak); p.correct++;
      const U = RULES.upgrades;
      gained = Math.round((U.gain.levels[p.upg.gain] + U.streak.levels[p.upg.streak] * Math.min(p.streak - 1, 10)) * s.settings.energyScale);
      p.energy += gained; p.points += s.settings.ptsCorrect;
      if (p.streak >= 10 && p.streak % 5 === 0) this.callout(`🔥 ${this.who(p)} ${p.streak >= 20 ? 'is UNSTOPPABLE:' : 'is on'} a ${p.streak}-answer streak!`, 'streak');
    } else {
      p.streak = 0; p.wrong++;
      gained = -Math.min(Math.floor(p.energy), s.settings.wrongPenalty);
      p.energy += gained;
    }
    p.gres = p.gamble ? this.resolveGamble(p, ok) : null;
    const t = s.teams[p.team];
    // Comeback: a fallen team answers its way back in (once a game).
    if (t && t.active && !t.alive && s.settings.comeback > 0 && !t.revived && s.status === 'running') {
      t.revive = ok ? (t.revive || 0) + 1 : Math.max(0, (t.revive || 0) - 1);
      if (t.revive >= s.settings.comeback) {
        t.alive = true; t.revived = true; t.fellAt = null; t.shield = 0;
        t.hp = Math.max(1, Math.round(t.maxHp * RULES.comebackHp));
        this.feed(`🔄 ${t.icon} ${t.name} answered their way back! They return with ${Math.round(t.hp)} health`, 'comeback');
        this.callout(`🔄 ${t.icon} ${t.name} is BACK in the fight!`, 'comeback');
      }
    }
    // Supply drop: the first team to N correct answers wins it.
    if (ok && s.drop && t && t.active) {
      const d = s.drop;
      d.prog[t.id] = (d.prog[t.id] || 0) + 1;
      if (d.prog[t.id] >= d.need) this.claimDrop(t);
    }
    this.events();
    return gained;
  }
  who(p) { const t = this.s.teams[p.team]; return this.s.settings.feedNames ? `${p.name} (${t.icon} ${t.name})` : `A player on ${t.icon} ${t.name}`; }
  callout(text, kind) {
    const s = this.s;
    (s.calls ||= []).push({ id: rid(6), text, kind, at: Date.now() });
    if (s.calls.length > 12) s.calls.splice(0, s.calls.length - 12);
  }
  // Heal, or (during the showdown, or when health is full) add shield instead.
  boostTeam(t, amt) {
    const healed = this.inShowdown() ? 0 : this.heal(t, amt);
    const rest = amt - healed, before = t.shield;
    if (rest > 0.5) t.shield = Math.min(t.maxHp * 0.5, t.shield + rest);
    return { heal: healed, shield: t.shield - before };
  }
  boostText(r) { return [r.heal >= 1 ? `+${Math.round(r.heal)} health` : '', r.shield >= 1 ? `+${Math.round(r.shield)} shield` : ''].filter(Boolean).join(' and ') || 'nothing (already maxed)'; }

  // Double or Nothing.
  startGamble(p, now = Date.now()) {
    const s = this.s, G = RULES.gamble, t = s.teams[p.team];
    if (!s.settings.gamble) return 'Double or Nothing is turned off.';
    if (!t.alive) return 'Your team has fallen. Double or Nothing needs a team that is still standing.';
    if (p.gamble) return 'You already have a bet on your next question!';
    if (now < (p.gambleNext || 0)) return `Wait ${Math.ceil((p.gambleNext - now) / 1000)}s to bet again.`;
    if (p.energy < G.cost) return 'Not enough energy.';
    p.energy -= G.cost; p.gamble = true; p.gambleNext = now + G.cooldownSec * 1000;
    return null;
  }
  gambleAmt(p) { const s = this.s; return RULES.gamble.base * s.settings.powerScale * this.surge() * this.teamBoost(p.team); }
  resolveGamble(p, ok) {
    const s = this.s, t = s.teams[p.team];
    p.gamble = false;
    if (!t.alive) { p.energy += RULES.gamble.cost; return { refund: true }; }
    const amt = this.gambleAmt(p);
    if (ok) {
      const r = this.boostTeam(t, amt);
      this.feed(`🎲 ${this.who(p)} WON Double or Nothing: ${this.boostText(r)}!`, 'gamble-win');
      if (amt >= 100) this.callout(`🎲 ${this.who(p)} WON the bet!`, 'gamble');
      return { win: true, amt: Math.round(r.heal + r.shield) };
    }
    let left = amt;
    const fromShield = Math.min(t.shield, left); t.shield -= fromShield; left -= fromShield;
    const fromHp = Math.min(Math.max(0, t.hp - 1), left); t.hp -= fromHp;
    const lost = Math.round(fromShield + fromHp);
    this.feed(`🎲 ${this.who(p)} lost Double or Nothing: -${lost}`, 'gamble-lose');
    return { win: false, amt: lost };
  }

  // Bounty: the team in 1st place (while 2 or more teams are standing).
  updateBounty() {
    const s = this.s;
    if (!s || !s.settings.bounty || (s.status !== 'running' && s.status !== 'paused')) { if (s) s.bountyId = null; return; }
    const alive = s.teams.filter((t) => t.active && t.alive);
    let id = null;
    if (alive.length >= 2) {
      const r = alive.map((t) => [t.id, this.teamScore(t)]).sort((a, b) => b[1] - a[1]);
      id = r[0][1] > r[1][1] ? r[0][0] : (alive.some((t) => t.id === s.bountyId) && r.find((x) => x[0] === s.bountyId)[1] === r[0][1] ? s.bountyId : r[0][0]);
    }
    if (id !== s.bountyId) {
      s.bountyId = id;
      if (id != null && Date.now() - (s.bountyCallAt || 0) > 45000) {
        const t = s.teams[id];
        s.bountyCallAt = Date.now();
        this.callout(`🎯 Bounty on ${t.icon} ${t.name}! Hit them for bonus energy`, 'bounty');
      }
    }
  }

  // Timed events: the showdown starting, supply drops. True if something changed.
  events() {
    const s = this.s;
    if (s.status !== 'running') return false;
    let changed = false;
    const sd = this.inShowdown();
    if (sd && !s.sdOn) {
      s.sdOn = true; changed = true;
      this.feed('⚔️ FINAL SHOWDOWN! Surge is doubled and healing is off!', 'showdown');
      this.callout('⚔️ FINAL SHOWDOWN! Surge ×2 · No healing!', 'showdown');
    } else if (!sd && s.sdOn) s.sdOn = false;
    const el = this.elapsedMs(), D = RULES.drop;
    if (s.drop && el >= s.drop.ends) { s.drop = null; changed = true; this.feed('📦 Nobody grabbed the supply drop in time. It is gone!', 'sys'); }
    if (!s.drop && s.settings.supplyDrops && s.nextDrop != null && el >= s.nextDrop) {
      s.nextDrop = el + D.everySec * 1000;
      if (this.remainingMs() > D.minLeftSec * 1000) {
        const prize = ['heal', 'shield', 'energy'][Math.floor(Math.random() * 3)];
        // Bigger teams answer faster, so the target grows with team size.
        const big = Math.max(1, ...s.teams.filter((t) => t.active).map((t) => this.teamSize(t.id)));
        const need = Math.max(D.need, Math.round(big * D.perPlayer));
        s.drop = { id: rid(6), prize, need, prog: {}, ends: el + D.expireSec * 1000 };
        const label = { heal: '❤️ Big heal', shield: '🛡️ Mega shield', energy: '⚡ Energy for the whole team' }[prize];
        this.feed(`📦 SUPPLY DROP! First team to ${need} correct answers wins: ${label}`, 'drop');
        this.callout(`📦 SUPPLY DROP! First team to ${need} correct answers wins ${label}`, 'drop');
        changed = true;
      }
    }
    return changed;
  }
  claimDrop(t) {
    const s = this.s, d = s.drop, D = RULES.drop;
    s.drop = null;
    let what;
    if (d.prize === 'energy' || !t.alive) {
      const e = Math.round(D.energy * s.settings.energyScale);
      for (const p of Object.values(s.players)) if (p.team === t.id && !p.kicked) { p.energy += e; this.sendMe(p); }
      what = `+${e} ⚡ for every player`;
    } else if (d.prize === 'heal') what = this.boostText(this.boostTeam(t, t.maxHp * D.share));
    else { const b = t.shield; t.shield = Math.min(t.maxHp * 0.5, t.shield + t.maxHp * D.share); what = `+${Math.round(t.shield - b)} shield`; }
    this.feed(`📦 ${t.icon} ${t.name} grabbed the supply drop: ${what}!`, 'drop');
    this.callout(`📦 ${t.icon} ${t.name} grabbed the supply drop!`, 'drop');
  }
  doUpgrade(p, key) {
    const U = RULES.upgrades[key];
    if (!U) return 'Unknown upgrade.';
    const lvl = p.upg[key];
    if (lvl >= U.levels.length - 1) return 'Already maxed.';
    const cost = U.costs[lvl + 1];
    if (p.energy < cost) return 'Not enough energy.';
    p.energy -= cost; p.upg[key] = lvl + 1;
    return null;
  }
  doPower(p, key, target, now = Date.now()) {
    const s = this.s;
    const P = RULES.powers[key];
    if (!P) return 'Unknown power-up.';
    const mine = s.teams[p.team];
    if (p.energy < P.cost) return 'Not enough energy.';
    if (!mine.alive && P.target === 'self') return 'Your team has fallen. You cannot heal or shield, but you can still attack!';
    if (!mine.alive && !s.settings.fallenCanAttack) return 'Your team has fallen.';
    if (key === 'mend' && this.inShowdown(now)) return 'No healing during the Final Showdown!';
    const amt = P.base * s.settings.powerScale * this.surge(now) * this.teamBoost(mine.id);
    const tag = s.settings.feedNames ? `${p.name} (${mine.icon} ${mine.name})` : `${mine.icon} ${mine.name}`;
    let msg = '';
    p.bountyE = 0;
    if (P.target === 'enemy') {
      const t = s.teams[Number(target)];
      if (!t || t.id === mine.id || !t.alive || !t.active) return 'Pick a team that is still standing.';
      p.energy -= P.cost; p.lastPow = now;
      const dealt = this.damage(t, amt, p);
      if (key === 'siphon' && mine.alive && !this.inShowdown(now)) { const h = this.heal(mine, dealt); p.heal += h; }
      msg = `${P.icon} ${tag} used ${P.name} on ${t.icon} ${t.name} for ${Math.round(dealt)}`;
      if (p.bountyE) msg += ` 🎯 +${p.bountyE} bounty ⚡`;
    } else if (P.target === 'all') {
      const targets = s.teams.filter((t) => t.alive && t.active && t.id !== mine.id);
      if (!targets.length) return 'No teams left to hit.';
      p.energy -= P.cost; p.lastPow = now;
      for (const t of targets) this.damage(t, amt, p);
      msg = `${P.icon} ${tag} launched a Barrage hitting ${targets.length} teams for ${Math.round(amt)} each`;
      if (p.bountyE) msg += ` 🎯 +${p.bountyE} bounty ⚡`;
    } else {
      p.energy -= P.cost; p.lastPow = now;
      if (key === 'mend') { const h = this.heal(mine, amt); p.heal += h; msg = `${P.icon} ${tag} healed their team for ${Math.round(h)}`; }
      if (key === 'shield') { const cap = mine.maxHp * 0.5; const before = mine.shield; mine.shield = Math.min(cap, mine.shield + amt); msg = `${P.icon} ${tag} raised a shield (+${Math.round(mine.shield - before)})`; }
    }
    this.feed(msg, key);
    this.flushKOs();
    this.checkLastTeam();
    return null;
  }

  onPlayer(ws, pid, m) {
    const s = this.s, p = s.players[pid];
    if (!p || p.kicked) return;
    const now = Date.now();
    if (m.t === 'leave') {
      this.removePlayer(p);
      if (s.status !== 'lobby' && s.status !== 'ended') this.feed(`👋 ${p.name} left the game`, 'sys');
      this.broadcast();
      return;
    }
    if (m.t === 'answer') {
      if (s.status !== 'running') return this.send(ws, { t: 'error', msg: s.status === 'paused' ? 'The game is paused.' : 'The game is not running.' });
      if (now - p.lastAns < 350 || Number(m.qid) !== p.cur) return;
      p.lastAns = now;
      const q = s.cards[p.cur];
      const pick = Number(m.pick);
      const right = (p.opts || []).indexOf(0);
      const ok = Number.isInteger(pick) && !!p.opts && p.opts[pick] === 0;
      const gained = this.applyAnswer(p, ok);
      this.send(ws, { t: 'result', correct: ok, gained, answer: q.ans[0].t, answerImg: q.ans[0].img || '', right, streak: p.streak, gamble: p.gres });
      this.sendMe(p);
      this.nextQuestion(p);
      this.broadcast();
      return;
    }
    if (m.t === 'gamble') {
      if (s.status !== 'running') return this.send(ws, { t: 'error', msg: s.status === 'paused' ? 'The game is paused.' : 'The game is not running.' });
      const err = this.startGamble(p, now);
      if (err) return this.send(ws, { t: 'error', msg: err });
      this.send(ws, { t: 'toast', msg: '🎲 Bet placed! Your next answer decides it.' });
      this.sendMe(p);
      this.broadcast();
      return;
    }
    if (m.t === 'upgrade') {
      if (s.status !== 'running') return this.send(ws, { t: 'error', msg: 'You can shop once the game is running.' });
      const err = this.doUpgrade(p, m.key);
      if (err) return this.send(ws, { t: 'error', msg: err });
      this.send(ws, { t: 'toast', msg: `${RULES.upgrades[m.key].name} upgraded to level ${p.upg[m.key] + 1}!` });
      this.sendMe(p);
      this.broadcast();
      return;
    }
    if (m.t === 'power') {
      if (s.status !== 'running') return this.send(ws, { t: 'error', msg: s.status === 'paused' ? 'The game is paused.' : 'The game is not running.' });
      if (now - p.lastPow < 300) return;
      const err = this.doPower(p, m.key, m.target, now);
      if (err) return this.send(ws, { t: 'error', msg: err });
      if (p.bountyE) this.send(ws, { t: 'toast', msg: `🎯 Bounty hit! +${p.bountyE} bonus energy` });
      this.sendMe(p);
      this.broadcast();
    }
  }

  /* ---------------- demo mode: pretend students ---------------- */

  ensureBotTimer() {
    const s = this.s;
    const need = s && s.status !== 'ended' && (s.botsToAdd > 0 || (s.settings.demo && Object.values(s.players).some((p) => (p.bot || p.auto) && !p.kicked)));
    if (need && !this.botTimer) this.botTimer = setInterval(() => this.botTick(), 1000);
    else if (!need) this.stopBotTimer();
  }
  stopBotTimer() { if (this.botTimer) { clearInterval(this.botTimer); this.botTimer = null; } }

  botTick() {
    const s = this.s;
    if (!s || s.status === 'ended') return this.stopBotTimer();
    let changed = false;
    // A few pretend students each second, so the lobby fills up like a real class.
    if (s.botsToAdd > 0) {
      const n = Math.min(s.botsToAdd, 2 + Math.floor(Math.random() * 3));
      for (let i = 0; i < n; i++) {
        const used = new Set(Object.values(s.players).map((p) => p.name));
        const name = BOT_NAMES.find((x) => !used.has(x)) || `Student ${Object.keys(s.players).length + 1}`;
        const team = s.status === 'lobby' ? (s.settings.teamPick === 'choose' ? Math.floor(Math.random() * s.teams.length) : this.smallestTeam()) : this.smallestTeam(true);
        const p = this.newPlayer(name, team, { bot: true, skill: 0.55 + Math.random() * 0.35, speed: 0.7 + Math.random() * 0.9, nextAct: Date.now() + 2000 + Math.random() * 4000 });
        if (s.status === 'running' || s.status === 'paused') this.nextQuestion(p);
      }
      s.botsToAdd -= n; changed = true;
    }
    if (s.status === 'running') {
      const now = Date.now();
      for (const p of Object.values(s.players)) {
        if (!(p.bot || p.auto) || p.kicked || now < (p.nextAct || 0)) continue;
        if (p.cur == null) this.nextQuestion(p);
        const ok = Math.random() < p.skill;
        const q = s.cards[p.cur], right = p.opts ? p.opts.indexOf(0) : -1;
        const gained = this.applyAnswer(p, ok);
        if (p.auto) {
          // Show the pick on the teacher's player view.
          let pick = right;
          if (!ok && p.opts) { const others = p.opts.map((_, i) => i).filter((i) => i !== right); pick = others[Math.floor(Math.random() * others.length)]; }
          this.sendToPlayer(p.id, { t: 'result', auto: true, pick, correct: ok, gained, answer: q.ans[0].t, answerImg: q.ans[0].img || '', right, streak: p.streak });
        }
        this.nextQuestion(p);
        p.nextAct = now + (3000 + Math.random() * 6000) * p.speed + (ok ? 0 : 1500);
        if (Math.random() < 0.6) this.botSpend(p, now);
        if (p.auto) this.sendMe(p);
        changed = true;
        if (s.status !== 'running') break;
      }
    }
    if (changed) this.broadcast();
    if (!s.botsToAdd && !s.settings.demo) this.stopBotTimer();
  }

  botSpend(p, now) {
    const s = this.s, mine = s.teams[p.team], U = RULES.upgrades, P = RULES.powers;
    if (p.upg.gain < 3 && p.energy >= U.gain.costs[p.upg.gain + 1] && Math.random() < 0.55) return this.doUpgrade(p, 'gain');
    if (p.upg.streak < 2 && p.energy >= U.streak.costs[p.upg.streak + 1] && Math.random() < 0.25) return this.doUpgrade(p, 'streak');
    if (s.settings.gamble && mine.alive && !p.gamble && Math.random() < 0.12 && !this.startGamble(p, now)) return;
    const enemies = s.teams.filter((t) => t.active && t.alive && t.id !== p.team);
    const choices = [];
    if (enemies.length) { choices.push(['strike', 5], ['siphon', 2]); if (enemies.length > 1) choices.push(['barrage', 1]); }
    if (mine.alive && mine.hp < mine.maxHp * 0.7) choices.push(['mend', 4]);
    if (mine.alive && mine.shield < mine.maxHp * 0.15) choices.push(['shield', 1]);
    const ok = choices.filter(([k]) => p.energy >= P[k].cost);
    if (!ok.length) return;
    let r = Math.random() * ok.reduce((a, [, w]) => a + w, 0), key = ok[0][0];
    for (const [k, w] of ok) { if ((r -= w) <= 0) { key = k; break; } }
    let target = null;
    if (P[key].target === 'enemy') {
      const leader = enemies.slice().sort((a, b) => this.teamScore(b) - this.teamScore(a))[0];
      target = (Math.random() < 0.4 ? leader : enemies[Math.floor(Math.random() * enemies.length)]).id;
    }
    this.doPower(p, key, target, now);
  }

  damage(t, amt, attacker) {
    const s = this.s;
    let left = amt;
    const absorbed = Math.min(t.shield, left); t.shield -= absorbed; left -= absorbed;
    const hpHit = Math.min(t.hp, left); t.hp -= hpHit;
    const dealt = absorbed + hpHit;
    attacker.dmg += dealt; attacker.points += dealt * s.settings.ptsDamage;
    if (s.settings.bounty && t.id === s.bountyId && dealt > 0) { const e = Math.round(dealt * RULES.bountyEnergy); attacker.energy += e; attacker.bountyE = (attacker.bountyE || 0) + e; }
    if (t.hp <= 0.0001 && t.alive) {
      t.hp = 0; t.shield = 0; t.alive = false; t.fellAt = Date.now();
      const at = s.teams[attacker.team];
      at.bonus += s.settings.koBonus; at.kos++;
      t.bonus -= s.settings.koPenalty || 0;
      this.callout(`💀 ${t.icon} ${t.name} has fallen!`, 'ko');
      (this.pendingKO ||= []).push(`💀 ${t.icon} ${t.name} has fallen!${s.settings.koPenalty ? ` (-${s.settings.koPenalty} pts)` : ''} Final blow: ${s.settings.feedNames ? attacker.name + ' of ' : ''}${at.icon} ${at.name}`);
    } else if (t.alive && t.hp < t.maxHp * 0.25 && Date.now() - (t.dangerAt || 0) > 30000) {
      t.dangerAt = Date.now();
      this.callout(`⚠️ ${t.icon} ${t.name} is UNDER ATTACK and low on health!`, 'danger');
    }
    return dealt;
  }
  heal(t, amt) {
    const h = Math.min(amt, t.maxHp - t.hp);
    t.hp += h;
    return h;
  }
  flushKOs() {
    if (!this.pendingKO) return;
    for (const m of this.pendingKO) this.feed(m, 'ko');
    this.pendingKO = null;
  }
  checkLastTeam() {
    const s = this.s;
    if (s.status !== 'running') return;
    const alive = s.teams.filter((t) => t.active && t.alive);
    if (alive.length === 0) this.endGame('allFallen');
    else if (alive.length === 1 && s.settings.lastTeamEnds) this.endGame('lastTeam');
  }
  feed(text, kind) {
    this.s.feed.push({ id: rid(6), text, kind, at: Date.now() });
    if (this.s.feed.length > 60) this.s.feed.splice(0, this.s.feed.length - 60);
  }

  endGame(reason) {
    const s = this.s;
    if (s.status === 'ended') return;
    s.elapsedBase = Math.min(s.totalMs, this.elapsedMs()); s.runStartedAt = null;
    s.status = 'ended'; s.endReason = reason;
    for (const t of s.teams) if (t.active && t.alive) t.bonus += s.settings.survivalBonus;
    if (reason === 'allFallen') {
      // The last team to fall earns the survival bonus.
      const last = s.teams.filter((t) => t.active && t.fellAt).sort((a, b) => b.fellAt - a.fellAt)[0];
      if (last) { last.bonus += s.settings.survivalBonus; last.lastStanding = true; }
    }
    const ranked = s.teams.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, score: this.teamScore(t), alive: t.alive, hp: Math.round(t.hp), kos: t.kos, size: this.teamSize(t.id) }))
      .sort((a, b) => b.score - a.score || b.hp - a.hp);
    ranked.forEach((r, i) => { r.rank = i + 1; });
    const ps = Object.values(s.players).filter((p) => !p.kicked);
    const top = (f) => { const p = ps.slice().sort((a, b) => f(b) - f(a))[0]; return p && f(p) > 0 ? { name: p.name, team: p.team, value: Math.round(f(p)) } : null; };
    s.results = {
      ranked,
      awards: {
        mvp: top((p) => p.points),
        damage: top((p) => p.dmg),
        correct: top((p) => p.correct),
        streak: top((p) => p.best),
        healer: top((p) => p.heal)
      }
    };
    const msg = { time: '⏰ Time is up!', host: '🏁 The teacher ended the game.', allFallen: '💀 Every team has fallen!', lastTeam: '👑 Only one team remains!' }[reason] || 'Game over';
    this.feed(msg, 'sys');
    for (const p of ps) this.sendMe(p);
    this.stopBotTimer();
    this.report();
    this.broadcast();
  }

  // The class leaderboard (board.js): once a game, only when the teacher
  // hosts, never with pretend students, and only with 2 or more teams. Each
  // signed in student gets their team's place; 1st place is a win.
  report() {
    const s = this.s;
    if (!s.counts || s.settings.demo || !this.env.BOARD || !s.startedAt || s.reported === s.startedAt) return;
    if (Object.values(s.players).some((p) => p.bot)) return;
    s.reported = s.startedAt;
    const ranked = (s.results && s.results.ranked) || [];
    if (ranked.length < 2) return;
    const rank = Object.fromEntries(ranked.map((r) => [r.id, r.rank]));
    const rows = Object.values(s.players)
      .filter((p) => p.stu && !p.kicked && rank[p.team])
      .map((p) => ({ email: p.stu, team: true, place: rank[p.team], win: rank[p.team] === 1, right: p.correct }));
    if (!rows.length) return;
    const send = this.env.BOARD.get(this.env.BOARD.idFromName('main')).fetch('https://board/board/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: 'surge', setId: s.setId, teams: ranked.length, rows })
    }).catch(() => {});
    try { this.ctx.waitUntil(send); } catch { /* the game stays awake for its players anyway */ }
  }
}
