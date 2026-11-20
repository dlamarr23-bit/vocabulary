// Mole Hunt (Donny, 2026-11-15): a hidden-role review game, like Gimkit's
// "Trust No One" but with its own name and look. Most of the class are
// Scientists; a few secret Moles try to sabotage the lab without being caught.
//
// Everyone answers the question set on their own screen, one question after
// another. A right answer is worth 1 energy (a Second Chance question 2, plus
// streak bonuses); a wrong one costs 1 only when the teacher switches that on.
// Energy buys lab tools:
// - Scientists: a private scan (Clear or Not sure, only they see it), a public
//   scan (a Clear result puts that student on the projector's Clear list),
//   peeking at someone's notes, and calling a Lab Meeting.
// - Moles: a fake scan (it looks like a real one on the Lab log), cutting the
//   class's scans, a smudge (that student never comes up Clear again), a
//   disguise (the next scan on them says Clear), a power cut and a lab alarm.
// A scan on a Mole always says Not sure (unless disguised); a scan on a
// Scientist says Clear most of the time (the teacher sets how often).
// At a Lab Meeting the class talks, then votes; the top vote leaves the lab
// and everyone finds out whether that was a Mole. Scientists win when every
// Mole is voted out or the Lab Power bar fills. Moles win when the clock runs
// out, when there are fewer meetings left than Moles, or when there are as
// many Moles as Scientists still in the lab.
//
// The 10 extras from the mockups (Desktop\code\Mole Hunt game ideas
// (2026.11.15)), each a switch in setup except 1, 7 and 10:
//  1 Evidence Board (the student's screen; the board is kept here for peeks)
//  2 Lab Power (a second way to win)       6 Ghost Lab (voted out players help)
//  3 Lab Emergencies (class-wide alarms)   7 Meeting reasons and the reveal
//  4 Secret Missions                       8 Rumor Drops (always true clues)
//  5 Special Roles (Detective, Medic,      9 Second Chance questions and streaks
//    Lab Tech, Hacker)                    10 Case File and awards at the end
// Teacher controls: setup (A), the projector's control bar (B), the Teacher
// Remote on a phone (C, a host connection with ?remote=1 that alone is sent
// who the Moles are), and the report at the end (D).
//
// These methods are added to LiveGame (index.js) and run when g.kind is
// 'molehunt'. Students join and pick a superhero exactly like Battle Royale.
import { cleanName } from './names.js';
import { HEROES, royaleQuestions } from './royale.js';

const MAX_PLAYERS = 80;
const DEMO_STUDENTS = 40;
const DEMO_JOIN_PER_TICK = 4;
const TICK_MS = 1000;
const SWEEP_MS = 15 * 1000;
const IDLE_MS = 5 * 60 * 1000;
const STORY_MS = 16 * 1000;
// The reveal (Donny, 2026-11-15: slower, "show who the class voted for and
// then wait to build suspense"): the votes first, then a drum roll on the
// student with the most votes, then whether they were a Mole, which then
// stays up. The answer is only sent to screens when the drum roll ends.
const REVEAL_TALLY_MS = 5000;
const REVEAL_DRUM_MS = 4000;
const REVEAL_MS = REVEAL_TALLY_MS + REVEAL_DRUM_MS + 9000;
const EMERGENCY_MS = 45 * 1000;
const EMERGENCY_GAP_MS = 90 * 1000;
const POWERCUT_GAP_MS = 60 * 1000;
// Cutting the class's scans: at most once every 45 seconds, whichever Mole does it.
const CUT_GAP_MS = 45 * 1000;
const DETECTIVE_MS = 2 * 60 * 1000;
const FREEZE_MS = 30 * 1000;
// Slow down (like the other games' rule): 3 wrong answers within 12 seconds
// pause that student for 5 seconds, so guessing earns less than reading. And
// the next question opens a moment after an answer (longer after a wrong one).
const SLOW_WRONGS = 3;
const SLOW_WINDOW_MS = 12 * 1000;
const SLOW_MS = 5000;
const NEXT_AFTER_RIGHT_MS = 600;
const NEXT_AFTER_WRONG_MS = 1000;
const JAR_MAX = 30;
const SAVE_DELAY_MS = 700;
const HOST_DELAY_MS = 350;
const LOG_KEEP = 120;
const NOTES_KEEP = 60;
// Minutes on the clock (0: no clock), how many scans each student brings to
// the class's pool, how many meetings (0: two more than the Moles), and the
// seconds of talking and of voting at a meeting.
const CLOCK = [0, 5, 10, 15, 20, 25, 30];
const SCANS = [3, 5, 10, 15, 20];
const MEETINGS = [0, 3, 4, 5, 6, 7, 9];
const TALK = [30, 60, 90, 120, 180];
const VOTE = [20, 30, 45, 60];
const RUMOR_EVERY = [60, 90, 120, 180];
const MOLES = [0, 1, 2, 3, 4, 5, 6];
// How often a scan on a Scientist comes back Clear.
const RELIABLE = { always: 1, usually: 0.85, normal: 0.7, shaky: 0.5 };
const PRICE = { cheap: 0.7, normal: 1, pricey: 1.4 };
const BASE = { scan: 7, public: 15, peek: 7, meeting: 10, fake: 6, cut: 10, smudge: 15, disguise: 15, powercut: 10, alarm: 12, protect: 0 };
const SCI_TOOLS = ['scan', 'public', 'peek', 'meeting'];
const MOLE_TOOLS = ['fake', 'cut', 'smudge', 'disguise', 'powercut', 'alarm'];
const TOOL_SWITCH = { scan: 'scan', public: 'public', peek: 'peek', meeting: 'studentMeetings', fake: 'fake', cut: 'cut', smudge: 'smudge', disguise: 'disguise' };
const EMERGENCIES = {
  spill: 'Chemical spill',
  power: 'Power outage',
  gas: 'Gas leak'
};
// A student's notes, made with taps (2026-11-18): what they think of a
// classmate and why. The words are in site/public/assets/molehunt-common.js.
const NOTE_WHY = {
  mole: ['scanNo', 'quiet', 'fake', 'noClear', 'vote', 'rumor', 'hunch'],
  sci: ['scanYes', 'onClear', 'busy', 'vote', 'hunch'],
  unsure: ['scanNo', 'notScanned', 'rumor', 'hunch']
};
// Tell the class: how many notes a student can share at each meeting.
const CLAIMS_EACH = 2;
const REASONS = { scanned: 'I scanned them', fake: 'Fake scan?', quiet: 'Not answering', hunch: 'Just a hunch', clear: 'Not on the Clear list' };
const DEMO_FIRST = ['Ava', 'Liam', 'Sofia', 'Noah', 'Mia', 'Mateo', 'Zoe', 'Ethan', 'Aaliyah', 'Lucas',
  'Isabella', 'Jayden', 'Emma', 'Diego', 'Chloe', 'Aiden', 'Priya', 'Elijah', 'Layla', 'Caleb',
  'Nora', 'Julian', 'Maya', 'Omar', 'Hana', 'Leo', 'Grace', 'Kai', 'Ruby', 'Andre',
  'Lily', 'Marcus', 'Camila', 'Owen', 'Stella', 'Ezra', 'Amara', 'Felix', 'Iris', 'Wyatt'];

// Secret Missions (idea 4): three each round (a round is the time between
// meetings). need: how many; reward: energy; badge: a badge too.
const MISSIONS = {
  sci: [
    { key: 'streak4', text: 'Get 4 right in a row', need: 4, reward: 3, badge: 'On Fire' },
    { key: 'right8', text: 'Get 8 questions right this round', need: 8, reward: 3 },
    { key: 'scan', text: 'Scan a classmate', need: 1, reward: 2, tool: 'scan' },
    { key: 'public', text: 'Run a public scan', need: 1, reward: 2, tool: 'public' },
    { key: 'second', text: 'Get a Second Chance question right', need: 1, reward: 2, opt: 'second' },
    { key: 'voteMole', text: 'Vote for a real Mole at the next meeting', need: 1, reward: 3, badge: 'Sharp Eye' },
    { key: 'peek', text: 'Peek at a classmate\'s notes', need: 1, reward: 2, tool: 'peek' },
    { key: 'board', text: 'Sort 5 classmates on your Evidence Board', need: 5, reward: 2 }
  ],
  mole: [
    { key: 'blend10', text: 'Get 10 questions right to blend in', need: 10, reward: 2, badge: 'Blending In' },
    { key: 'fakeClear', text: 'Fake a scan on someone on the Clear list', need: 1, reward: 3, tool: 'fake' },
    { key: 'fake2', text: 'Run 2 fake scans', need: 2, reward: 3, tool: 'fake' },
    { key: 'survive3', text: 'Get through a meeting with 3 or more votes on you', need: 1, reward: 3, badge: 'Smooth Talker' },
    { key: 'cut', text: 'Cut the class\'s scans', need: 1, reward: 2, tool: 'cut' },
    { key: 'alarm', text: 'Sound a lab alarm', need: 1, reward: 2, opt: 'emergencies' },
    { key: 'streak4', text: 'Get 4 right in a row', need: 4, reward: 2, badge: 'On Fire' }
  ]
};

const rand = (n) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % Math.max(1, n);
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
const oneOf = (obj, dflt, v) => (Object.prototype.hasOwnProperty.call(obj, v) ? v : dflt);
const flag = (v, dflt) => (typeof v === 'boolean' ? v : dflt);
const heroName = (key) => String(key || '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

// A fresh player for a new game (everything a game changes).
const fresh = () => ({
  role: 'sci', job: '', alive: true, ghost: false, outAt: 0, energy: 0, earned: 0, jar: 0, given: 0,
  right: 0, wrong: 0, answered: 0, streak: 0, best: 0, qa: {}, q: null, deck: [], retry: [], last: null,
  scans: 0, pubs: 0, scansOnMoles: 0, fakes: 0, votesRight: 0, votesMade: 0, votesGot: 0, survived: 0,
  notesText: '', myNotes: [], board: { trust: [], unsure: [], suspect: [] }, notes: [], pop: null,
  smudged: false, disguise: false, protectedRound: 0, protectRound: 0, freeScanAt: 0, whispered: false,
  missions: [], done: 0, badges: [], frozenUntil: 0, late: false, botAt: 0, sus: {}, scanned: {}, wrongAt: [], slowUntil: 0, slowed: 0
});

export const molehunt = {
  /* ---------------- making a game ---------------- */

  async mhInit(body) {
    const old = await this.load();
    if (old && Date.now() - old.created < 3 * 60 * 60 * 1000) return new Response('taken', { status: 409 });
    const questions = royaleQuestions(body);
    if (!questions.length) return new Response('That set needs at least 1 question with a right answer and a wrong one.', { status: 400 });
    this.game = {
      kind: 'molehunt',
      code: String(body.code),
      created: Date.now(),
      hostKey: String(body.hostKey),
      title: String(body.title || 'Mole Hunt').slice(0, 120),
      setId: String(body.setId || ''),
      counts: body.counts === true,
      cards: questions,
      opts: this.mhOpts(body.opts || {}, null),
      phase: 'lobby',
      stage: '',
      players: {},
      order: [],
      blocked: [],
      missed: {}
    };
    await this.ctx.storage.put('cards', questions);
    await this.save();
    this.touched = Date.now();
    this.idleAt = this.touched + IDLE_MS;
    await this.ctx.storage.put('idleAt', this.idleAt);
    await this.ctx.storage.setAlarm(this.mhNextAlarm(this.touched));
    return Response.json({ ok: true });
  },

  // The teacher's choices (setup A), checked. was: the choices so far, so a
  // change in the lobby only needs the ones that changed.
  mhOpts(o, was) {
    const w = was || {
      who: 'pass', period: '', moles: 0, limit: 15, scans: 10, reliable: 'normal', meetings: 0, prices: 'normal',
      talk: 60, vote: 30, rumorEvery: 90,
      scan: true, public: true, peek: true, studentMeetings: true, fake: true, cut: true, smudge: true, disguise: true,
      wrongCost: false, showAnswer: true, joinLate: true, showVoters: false, slow: true, claims: true,
      power: true, emergencies: true, missions: true, roles: true, ghosts: true, rumors: true, second: true,
      detective: true, medic: true, tech: true, hacker: true, demo: false
    };
    const who = o.who === 'guests' ? 'guests' : o.who === 'pass' ? 'pass' : w.who;
    const out = {
      who,
      pass: who === 'pass',
      typedNames: who === 'guests',
      period: o.period === undefined ? w.period : String(o.period == null ? '' : o.period).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20),
      moles: pickFrom(MOLES, w.moles, o.moles === undefined ? w.moles : o.moles),
      limit: pickFrom(CLOCK, w.limit, o.limit === undefined ? w.limit : o.limit),
      scans: pickFrom(SCANS, w.scans, o.scans === undefined ? w.scans : o.scans),
      reliable: oneOf(RELIABLE, w.reliable, o.reliable === undefined ? w.reliable : o.reliable),
      meetings: pickFrom(MEETINGS, w.meetings, o.meetings === undefined ? w.meetings : o.meetings),
      prices: oneOf(PRICE, w.prices, o.prices === undefined ? w.prices : o.prices),
      talk: pickFrom(TALK, w.talk, o.talk === undefined ? w.talk : o.talk),
      vote: pickFrom(VOTE, w.vote, o.vote === undefined ? w.vote : o.vote),
      rumorEvery: pickFrom(RUMOR_EVERY, w.rumorEvery, o.rumorEvery === undefined ? w.rumorEvery : o.rumorEvery),
      demo: was ? w.demo : o.demo === true
    };
    ['scan', 'public', 'peek', 'studentMeetings', 'fake', 'cut', 'smudge', 'disguise', 'wrongCost', 'showAnswer', 'joinLate', 'showVoters', 'slow', 'claims',
      'power', 'emergencies', 'missions', 'roles', 'ghosts', 'rumors', 'second', 'detective', 'medic', 'tech', 'hacker']
      .forEach((k) => { out[k] = flag(o[k], w[k]); });
    return out;
  },

  /* ---------------- the clock ---------------- */

  mhNextAlarm(now) {
    const g = this.game;
    let at = Math.min(this.idleAt || now + IDLE_MS, g.created + 3 * 60 * 60 * 1000);
    if (g.phase === 'lobby' && g.opts.demo && this.mhBots() < DEMO_STUDENTS) at = Math.min(at, now + 900);
    if (g.phase === 'play' && !g.paused) {
      // Pretend students act every second; otherwise only what is due.
      if (this.mhBots()) at = Math.min(at, now + TICK_MS);
      const due = [g.storyEndsAt, g.endsAt && !g.timeUp ? g.endsAt : 0, g.meeting ? g.meeting.endsAt : 0, g.meeting && !g.meeting.shown ? g.meeting.resultAt : 0,
        g.emergency ? g.emergency.endsAt : 0, g.opts.rumors && g.stage === 'work' ? g.nextRumorAt : 0];
      due.forEach((t) => { if (t && t > 0) at = Math.min(at, t); });
      // Frozen students thaw on time.
      g.order.forEach((id) => { const p = g.players[id]; if (p && p.frozenUntil > now) at = Math.min(at, p.frozenUntil); });
      at = Math.min(at, now + SWEEP_MS);
    }
    return Math.max(at, now + 20);
  },

  async mhAlarm() {
    const g = this.game;
    const now = Date.now();
    if (g.phase === 'lobby' && g.opts.demo && this.mhBots() < DEMO_STUDENTS) {
      this.mhDemoJoin(DEMO_JOIN_PER_TICK);
      await this.save();
      this.toHost();
    }
    if (g.phase === 'play' && !g.paused) await this.mhStep(now);
    if (!this.game) return;
    if (Date.now() >= this.idleAt - 250) {
      const msg = 'This game closed after 5 minutes with nothing happening.';
      await this.close(msg, msg);
      return;
    }
    await this.ctx.storage.setAlarm(this.mhNextAlarm(Date.now()));
  },

  // Moves the game on: the story ends, a meeting goes to voting or to the
  // reveal, an emergency runs out, a rumor is due, the clock runs out, and
  // the pretend students act.
  async mhStep(now) {
    const g = this.game;
    let changed = false;
    if (g.stage === 'story' && now >= g.storyEndsAt - 50) { this.mhBeginWork(now); changed = true; }
    if (g.endsAt && !g.timeUp && now >= g.endsAt - 250) {
      g.timeUp = true;
      changed = true;
      // A meeting finishes first (Donny: "if time runs out during a vote, the vote finishes first").
      if (g.stage !== 'meeting') this.mhFinish('mole', 'Time ran out with Moles still hiding in the lab.');
    }
    const m = g.meeting;
    if (g.phase === 'play' && m && m.step === 'reveal' && !m.shown && now >= m.resultAt - 50) { this.mhRevealShow(); changed = true; }
    if (g.phase === 'play' && m && now >= m.endsAt - 50) {
      if (m.step === 'talk') this.mhStartVote(now);
      else if (m.step === 'vote') this.mhReveal(now);
      else if (m.step === 'reveal') this.mhAfterMeeting(now);
      changed = true;
    }
    if (g.phase === 'play' && g.emergency && now >= g.emergency.endsAt - 50) { this.mhEmergencyOver(false, now); changed = true; }
    if (g.phase === 'play' && g.opts.rumors && g.stage === 'work' && g.nextRumorAt && now >= g.nextRumorAt - 50) {
      this.mhRumor('', '', now);
      g.nextRumorAt = now + g.opts.rumorEvery * 1000;
      changed = true;
    }
    if (g.phase === 'play' && this.mhBots()) { if (this.mhBotTick(now)) changed = true; }
    if (changed) {
      await this.save();
      this.toEveryone();
      await this.touch();
    }
  },

  // Saving after every answer would write the whole game many times a second
  // with a full class, so answers save a moment later, together.
  mhSaveSoon() {
    if (this.mhSaveTimer) return;
    this.mhSaveTimer = setTimeout(() => { this.mhSaveTimer = null; if (this.game) this.save().catch(() => {}); }, SAVE_DELAY_MS);
  },
  mhHostSoon() {
    if (this.mhHostTimer) return;
    this.mhHostTimer = setTimeout(() => { this.mhHostTimer = null; if (this.game) this.toHost(); }, HOST_DELAY_MS);
  },

  /* ---------------- messages ---------------- */

  async mhMessage(ws, a, m) {
    const g = this.game;
    if (a.pid && (m.t === 'away' || m.t === 'back')) {
      a.away = m.t === 'away';
      a.seen = Date.now();
      try { ws.serializeAttachment(a); } catch { /* closing */ }
      this.mhHostSoon();
      return;
    }
    if (a.pid && Date.now() - (a.seen || 0) > 5000) {
      a.seen = Date.now();
      try { ws.serializeAttachment(a); } catch { /* closing */ }
    }
    if (g.phase === 'play' && !g.paused) await this.mhStep(Date.now());
    if (!this.game) return;
    if (a.role === 'host') return this.mhHost(m, a);
    return this.mhPlayer(ws, a, m);
  },

  async mhPlayer(ws, a, m) {
    const g = this.game;
    if (m.t === 'join') {
      if (a.pid) return;
      if (g.phase === 'done') return this.send(ws, { t: 'error', msg: 'This game is over. Wait for your teacher to start a new one.' });
      const dev = String(m.dev || '').replace(/[^0-9a-f]/g, '').slice(0, 32);
      const stu = a.stu && a.stu.email ? a.stu : null;
      if (this.isBlocked(dev, !stu && g.opts.typedNames ? cleanName(m.name) : '')) return this.send(ws, { t: 'error', code: 'blocked', msg: 'Your teacher removed you from this game.' });
      if (this.needPass() && !stu) return this.send(ws, { t: 'error', code: 'needPass', msg: 'Sign in with Class Pass to play.' });
      const again = stu && Object.values(g.players).find((p) => p.stu === stu.email);
      if (again) return this.mhPlayer(ws, a, { t: 'rejoin', id: again.id, secret: again.secret });
      if (g.phase === 'play' && !g.opts.joinLate) return this.send(ws, { t: 'error', msg: 'This game has already started. Wait for the next one.' });
      if (g.order.length >= MAX_PLAYERS) return this.send(ws, { t: 'error', msg: 'This game is full.' });
      let name;
      if (stu) name = this.uniqueName(cleanName(stu.name) || 'Student');
      else if (g.opts.typedNames) {
        name = await this.guestName(ws, m);
        if (!name) return;
      } else name = this.randomName();
      const pid = token().slice(0, 10);
      const p = { id: pid, name, secret: token(), dev, hero: '', ...fresh() };
      if (stu) p.stu = stu.email;
      else if (g.opts.typedNames) p.guest = true;
      const want = String(m.hero || '');
      if (this.mhHeroFree(want, pid)) p.hero = want;
      g.players[pid] = p;
      g.order.push(pid);
      // Joining once the game is on: always a Scientist, with a hero.
      if (g.phase === 'play') {
        p.late = true;
        if (!p.hero) p.hero = this.mhFreeHero(pid);
        this.mhDealMissions(p);
        this.mhNextQuestion(p);
        this.mhNote(p, 'You joined late, so you are a Scientist. Find the Moles!');
      }
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
      this.mhHostSoon();
      return;
    }
    if (!a.pid || !g.players[a.pid]) return;
    const pid = a.pid;
    if (m.t === 'hero') return this.mhPickHero(pid, String(m.key || ''));
    if (m.t === 'notes') return this.mhNotes(pid, m);
    if (g.phase !== 'play' || g.paused) return;
    const p = g.players[pid];
    if (p.frozenUntil > Date.now()) return;
    if (m.t === 'answer') return this.mhAnswer(pid, m);
    if (m.t === 'tool') return this.mhTool(pid, m);
    if (m.t === 'vote') return this.mhVote(pid, m);
    if (m.t === 'claim') return this.mhClaim(pid, m);
    if (m.t === 'give') return this.mhGive(pid, m);
    if (m.t === 'whisper') return this.mhWhisper(pid);
  },

  // Heroes, exactly like Battle Royale: one student's at a time until all 50 are taken.
  mhHeroFree(key, pid) {
    if (!HEROES.includes(key)) return false;
    const held = new Set(Object.values(this.game.players).filter((p) => p.id !== pid && p.hero).map((p) => p.hero));
    return !held.has(key) || HEROES.every((k) => held.has(k));
  },
  mhFreeHero(pid) {
    const free = HEROES.filter((k) => this.mhHeroFree(k, pid));
    return free.length ? free[rand(free.length)] : HEROES[rand(HEROES.length)];
  },
  async mhPickHero(pid, key) {
    const g = this.game;
    const p = g.players[pid];
    if (g.phase === 'done') return;
    if (!this.mhHeroFree(key, pid)) {
      this.notice(pid, 'Someone just picked that hero. Pick another one.');
      this.toPlayer(pid);
      return;
    }
    p.hero = key;
    await this.save();
    this.toEveryone();
  },

  // The student's notes and Evidence Board (idea 1): kept here so a classmate
  // can peek at them.
  async mhNotes(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    if (typeof m.text === 'string') p.notesText = m.text.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').slice(0, 1500);
    // Tapped notes (2026-11-18): one for each classmate, the newest last.
    if (Array.isArray(m.list)) {
      const kept = new Map();
      m.list.slice(-MAX_PLAYERS).forEach((x) => {
        const n = this.mhNoteFrom(pid, x);
        if (!n) return;
        kept.delete(n.who);
        kept.set(n.who, n);
      });
      p.myNotes = [...kept.values()];
    }
    if (m.board && typeof m.board === 'object') {
      const ok = (list) => (Array.isArray(list) ? list.map(String).filter((id) => g.players[id] && id !== pid).slice(0, MAX_PLAYERS) : []);
      const seen = new Set();
      const b = {};
      ['suspect', 'trust', 'unsure'].forEach((k) => { b[k] = ok(m.board[k]).filter((id) => !seen.has(id) && seen.add(id)); });
      p.board = b;
      this.mhMission(p, 'board', b.trust.length + b.suspect.length, true);
    }
    this.mhSaveSoon();
    if (m.board || m.list) this.toPlayer(pid);
  },
  // One tapped note, checked: { who, v, why } or null.
  mhNoteFrom(pid, x) {
    const g = this.game;
    const who = String((x && x.who) || '');
    const v = String((x && x.v) || '');
    if (!g.players[who] || who === pid || !Object.prototype.hasOwnProperty.call(NOTE_WHY, v)) return null;
    const why = NOTE_WHY[v].includes(String(x.why || '')) ? String(x.why) : '';
    return { who, v, why };
  },

  /* ---------------- questions ---------------- */

  mhBots() { const g = this.game; return g.order.filter((id) => g.players[id] && g.players[id].bot).length; },
  mhAlive(role) { const g = this.game; return g.order.map((id) => g.players[id]).filter((p) => p && p.alive && (!role || p.role === role)); },
  mhCost(key, p) {
    const g = this.game;
    if (key === 'protect') return 0;
    let c = Math.max(1, Math.round(BASE[key] * PRICE[g.opts.prices || 'normal']));
    if (key === 'cut' && p && p.job === 'hacker') c = Math.ceil(c / 2);
    return c;
  },

  // The next question for one student: a missed one that is due again
  // (Second Chance, worth 2), else the next from their own shuffled deck.
  // wait: how long before it can be answered.
  mhNextQuestion(p, wait) {
    const g = this.game;
    const n = g.cards.length;
    let qi = -1;
    let second = false;
    if (g.opts.second && p.retry.length) {
      const i = p.retry.findIndex((x) => x.due <= p.answered);
      if (i >= 0) { qi = p.retry[i].qi; second = true; p.retry.splice(i, 1); }
    }
    if (qi < 0) {
      if (!p.deck || !p.deck.length) {
        p.deck = shuffle([...Array(n).keys()]);
        // Not the same question twice in a row across decks.
        if (p.q && n > 1 && p.deck[0] === p.q.qi) p.deck.push(p.deck.shift());
      }
      qi = p.deck.shift();
    }
    const q = g.cards[qi];
    const order = shuffle([0, ...q.w.map((_, i) => i + 1)]);
    p.q = { id: token().slice(0, 8), qi, order, c: order.indexOf(0), second, at: Date.now(), openAt: Date.now() + (wait || 0) };
  },
  mhQuestionView(p) {
    const g = this.game;
    if (!p.q) return null;
    const q = g.cards[p.q.qi] || { q: '', a: '', w: [] };
    return {
      id: p.q.id,
      text: q.q,
      img: q.img || '',
      opts: p.q.order.map((i) => (i ? q.w[i - 1] : q.a)),
      imgs: p.q.order.map((i) => (i ? (q.wi || [])[i - 1] || '' : q.ai || '')),
      second: !!p.q.second,
      openAt: p.q.openAt || 0
    };
  },

  async mhAnswer(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    if (g.stage !== 'work' || !p.q || String(m.id || '') !== p.q.id) return;
    const k = Number(m.k);
    if (!Number.isInteger(k) || k < 0 || k >= p.q.order.length) return;
    // Too soon after the last answer (a screen's clock can be a little off).
    if (Date.now() < (p.q.openAt || 0) - 300) { this.notice(pid, 'Read the question first!'); this.toPlayer(pid); return; }
    this.mhApplyAnswer(p, k, Date.now());
    this.mhSaveSoon();
    this.toPlayer(pid);
    this.mhHostSoon();
  },

  // A student's answer: energy, the streak, missions, Lab Power, an
  // emergency, Second Chance, the report's marks.
  mhApplyAnswer(p, k, now) {
    const g = this.game;
    const q = p.q;
    const ok = k === q.c;
    let gain = 0;
    let bonus = 0;
    p.answered += 1;
    if (ok) {
      p.right += 1;
      p.streak += 1;
      p.best = Math.max(p.best, p.streak);
      gain = q.second ? 2 : 1;
      if (g.opts.second) {
        if (p.streak === 3) bonus = 1;
        else if (p.streak >= 5 && p.streak % 5 === 0) bonus = 2;
      }
      this.mhMission(p, 'streak4', p.streak, true);
      this.mhMission(p, 'right8', 1);
      this.mhMission(p, 'blend10', 1);
      if (q.second) this.mhMission(p, 'second', 1);
      if (p.streak === 5) this.mhBadge(p, 'On Fire');
    } else {
      p.wrong += 1;
      p.streak = 0;
      if (g.opts.wrongCost && p.alive) gain = -1;
      if (g.opts.second && !p.retry.some((x) => x.qi === q.qi) && !q.second) p.retry.push({ qi: q.qi, due: p.answered + 4 + rand(3) });
      if (g.opts.slow && !p.bot) {
        p.wrongAt = (p.wrongAt || []).concat([now]).filter((t) => now - t < SLOW_WINDOW_MS);
        if (p.wrongAt.length >= SLOW_WRONGS) {
          p.wrongAt = [];
          p.slowUntil = now + SLOW_MS;
          p.frozenUntil = Math.max(p.frozenUntil || 0, p.slowUntil);
          p.slowed = (p.slowed || 0) + 1;
        }
      }
    }
    this.mhGain(p, gain + bonus);
    p.qa[q.qi] = (p.qa[q.qi] || '') + (ok ? 'R' : 'W');
    const miss = g.missed[q.qi] || { r: 0, w: 0 };
    if (ok) miss.r += 1; else miss.w += 1;
    g.missed[q.qi] = miss;
    p.last = { ok, k, c: q.c, gain, bonus, second: q.second, id: q.id, at: now };
    if (ok && p.role === 'sci') {
      // Lab Power (idea 2): Scientists' right answers fill the bar, ghosts' too.
      if (g.opts.power && g.power && g.stage === 'work') {
        g.power.got = Math.min(g.power.goal, g.power.got + 1);
        if (g.power.got >= g.power.goal) this.mhFinish('sci', 'The Scientists filled the Lab Power bar!');
      }
      const e = g.emergency;
      if (e && g.phase === 'play') {
        e.got += p.job === 'tech' && p.alive ? 2 : 1;
        if (e.got >= e.need) this.mhEmergencyOver(true, now);
      }
    }
    this.mhNextQuestion(p, ok ? NEXT_AFTER_RIGHT_MS : NEXT_AFTER_WRONG_MS);
  },

  // Energy goes to a student in the lab, or to a ghost's jar.
  mhGain(p, n) {
    if (!n) return;
    if (p.alive) {
      p.energy = Math.max(0, p.energy + n);
      if (n > 0) p.earned += n;
    } else if (p.ghost && n > 0) {
      p.jar = Math.min(JAR_MAX, p.jar + n);
      p.earned += n;
    }
  },

  /* ---------------- lab tools ---------------- */

  async mhTool(pid, m) {
    this.mhToolFor = pid;
    let r;
    try { r = this.mhUseTool(pid, String(m.key || ''), String(m.target || ''), Date.now()); } finally { this.mhToolFor = ''; }
    if (r) this.notice(pid, r);
    await this.save();
    this.toEveryone();
    await this.ctx.storage.setAlarm(this.mhNextAlarm(Date.now()));
  },

  // Uses a tool. Gives back what went wrong, or '' when it worked.
  mhUseTool(pid, key, target, now) {
    const g = this.game;
    const p = g.players[pid];
    if (g.stage !== 'work') return 'Tools work between meetings.';
    if (!p.alive) return 'You are out of the lab. Help your team from the ghost jar instead.';
    const mole = p.role === 'mole';
    // The lab tools are everyone's, Moles too (so their screens look the same);
    // the sabotage tools are only the Moles'.
    const sciTool = SCI_TOOLS.includes(key) || key === 'protect';
    if ((mole && !MOLE_TOOLS.includes(key) && !SCI_TOOLS.includes(key)) || (!mole && !sciTool)) return 'That tool is not yours.';
    if (TOOL_SWITCH[key] && !g.opts[TOOL_SWITCH[key]]) return 'Your teacher switched that tool off.';
    if (key === 'powercut' && !g.opts.power) return 'Lab Power is off in this game.';
    if (key === 'alarm' && !g.opts.emergencies) return 'Lab alarms are off in this game.';
    if (key === 'protect' && p.job !== 'medic') return 'Only the Medic can protect.';
    const free = key === 'scan' && p.job === 'detective' && now >= (p.freeScanAt || 0);
    const cost = free ? 0 : this.mhCost(key, p);
    if (p.energy < cost) return 'You need ' + cost + ' energy for that. Answer more questions!';
    const t = g.players[target];
    const needsTarget = ['scan', 'public', 'peek', 'fake', 'smudge', 'protect'].includes(key);
    if (needsTarget && (!t || t.id === pid || !t.alive)) return 'Pick a classmate who is still in the lab.';
    // secret: only on the remote; both: the projector's line, and what
    // really happened on the remote.
    const secret = (text) => this.mhLog(text, true);
    const both = (text, truth) => this.mhLog(text, false, truth);
    const file = (text) => this.mhCase(text, pid);
    if (key === 'scan' || key === 'public') {
      if (!free && g.scansLeft <= 0) return 'The class has no scans left.';
      if (key === 'scan' && !free) g.scansLeft -= 1;
      if (key === 'public') g.scansLeft -= 1;
      const clear = this.mhScanResult(t);
      p.scans += 1;
      if (t.role === 'mole') p.scansOnMoles += 1;
      p.scanned[t.id] = clear ? 'clear' : 'unsure';
      p.sus[t.id] = (p.sus[t.id] || 0) + (clear ? -5 : 2);
      if (free) p.freeScanAt = now + DETECTIVE_MS;
      const word = clear ? 'Clear' : 'Not sure';
      if (key === 'public') {
        p.pubs += 1;
        const truth = p.name + ' public scan on ' + t.name + ': ' + word + (t.role === 'mole' ? ' (Mole' + (clear ? ', disguised' : '') + ')' : '');
        if (clear) {
          if (!g.clear.includes(t.id)) g.clear.push(t.id);
          both(p.name + ' ran a public scan: ' + t.name + ' is Clear', truth);
        } else both(p.name + ' ran a public scan on ' + t.name, truth);
        this.mhMission(p, 'public', 1);
        this.mhNote(p, 'Your public scan: ' + t.name + ' is ' + word + '.', 'scan', t.id, clear);
      } else {
        both(p.name + ' scanned ' + t.name, p.name + (free ? ' (free Detective scan)' : '') + ' scanned ' + t.name + ': ' + word + (t.role === 'mole' ? ' (Mole' + (clear ? ', disguised' : '') + ')' : ''));
        this.mhNote(p, 'Your scan: ' + t.name + ' is ' + word + '.', 'scan', t.id, clear);
      }
      this.mhMission(p, 'scan', 1);
      this.mhNote(t, p.name + ' scanned you.', 'scanned', p.id);
      this.mhSetPop(p, { t: 'scan', name: t.name, hero: t.hero, clear, pub: key === 'public', at: now });
    } else if (key === 'peek') {
      const names = (list) => (list || []).map((id) => (g.players[id] ? g.players[id].name : '')).filter(Boolean);
      this.mhSetPop(p, { t: 'peek', name: t.name, hero: t.hero, text: t.notesText || '', notes: (t.myNotes || []).filter((n) => g.players[n.who]).map((n) => ({ name: g.players[n.who].name, v: n.v, why: n.why })), board: { trust: names(t.board.trust), unsure: names(t.board.unsure), suspect: names(t.board.suspect) }, at: now });
      this.mhNote(t, 'Someone peeked at your notes.', 'peeked');
      this.mhNote(p, 'You peeked at ' + t.name + '\'s notes.', 'peek', t.id);
      secret(p.name + ' peeked at ' + t.name + '\'s notes');
      this.mhMission(p, 'peek', 1);
    } else if (key === 'meeting') {
      if (g.meetingsLeft <= 0) return 'There are no meetings left.';
      p.energy -= cost;
      this.mhStartMeeting(p.name, now);
      return '';
    } else if (key === 'protect') {
      if (p.protectRound === g.round) return 'You already protected someone this round.';
      p.protectRound = g.round;
      t.protectedRound = g.round;
      const was = t.smudged;
      t.smudged = false;
      secret(p.name + ' (Medic) protected ' + t.name + (was ? ' and wiped off a smudge' : ''));
      this.mhNote(p, 'You protected ' + t.name + ' for this round.', 'tool', t.id);
      this.mhSetPop(p, { t: 'protect', name: t.name, hero: t.hero, at: now });
    } else if (key === 'fake') {
      both(p.name + ' scanned ' + t.name, p.name + ' FAKE scan on ' + t.name);
      file(p.name + ' faked a scan on ' + t.name);
      this.mhNote(t, p.name + ' scanned you.', 'scanned', p.id);
      p.fakes += 1;
      this.mhMission(p, 'fake2', 1);
      if (g.clear.includes(t.id)) this.mhMission(p, 'fakeClear', 1);
      this.mhSetPop(p, { t: 'done', text: 'Your fake scan on ' + t.name + ' is on the Lab log.', at: now });
    } else if (key === 'cut') {
      if (g.scansLeft <= 0) return 'The class has no scans left to cut.';
      if (now - (g.cutAt || 0) < CUT_GAP_MS) return 'The scans were just cut. Try again in a little while.';
      const n = Math.min(g.scansLeft, g.cutSize);
      g.scansLeft -= n;
      g.cutAt = now;
      both('The class lost ' + plural(n, 'scan') + '!', p.name + (p.job === 'hacker' ? ' (Hacker)' : '') + ' cut ' + plural(n, 'scan'));
      file(p.name + ' cut ' + plural(n, 'scan'));
      this.mhMission(p, 'cut', 1);
      this.mhSetPop(p, { t: 'done', text: 'You cut ' + plural(n, 'scan') + ' from the class.', at: now });
    } else if (key === 'smudge') {
      if (t.protectedRound === g.round) {
        p.energy -= cost;
        secret(p.name + ' tried to smudge ' + t.name + ' (protected by the Medic)');
        this.mhSetPop(p, { t: 'done', text: t.name + ' is protected by the Medic this round. Your smudge did not stick.', at: now });
        return '';
      }
      t.smudged = true;
      secret(p.name + ' smudged ' + t.name);
      file(p.name + ' smudged ' + t.name);
      this.mhSetPop(p, { t: 'done', text: t.name + ' will never come up Clear now.', at: now });
    } else if (key === 'disguise') {
      if (p.disguise) return 'You already have a disguise on.';
      p.disguise = true;
      secret(p.name + ' put on a disguise');
      file(p.name + ' put on a disguise');
      this.mhSetPop(p, { t: 'done', text: 'Disguised! The next scan on you says Clear.', at: now });
    } else if (key === 'powercut') {
      if (!g.power) return 'Lab Power is off in this game.';
      if (now - (g.powerCutAt || 0) < POWERCUT_GAP_MS) return 'The power was just cut. Try again in a minute.';
      const n = Math.min(g.power.got, Math.round(g.power.goal * 0.1));
      g.power.got -= n;
      g.powerCutAt = now;
      both('Power cut! A Mole drained 10% of the Lab Power.', p.name + ' cut the power (-' + n + ')');
      file(p.name + ' cut the Lab Power');
      this.mhSetPop(p, { t: 'done', text: 'You drained the Lab Power.', at: now });
    } else if (key === 'alarm') {
      if (g.emergency) return 'An alarm is already going.';
      if (now - (g.emergencyEndedAt || 0) < EMERGENCY_GAP_MS) return 'The lab just had an emergency. Try again in a little while.';
      this.mhEmergency(p, now);
      this.mhMission(p, 'alarm', 1);
    }
    p.energy -= cost;
    return '';
  },

  // Clear or Not sure. A Mole is never Clear unless disguised (the disguise
  // is used up); a smudged student never is; a Scientist is Clear as often as
  // the teacher picked.
  mhScanResult(t) {
    const g = this.game;
    if (t.role === 'mole') {
      if (t.disguise) { t.disguise = false; return true; }
      return false;
    }
    if (t.smudged) return false;
    return Math.random() < RELIABLE[g.opts.reliable || 'normal'];
  },

  /* ---------------- meetings (idea 7: reasons and the reveal) ---------------- */

  mhStartMeeting(by, now) {
    const g = this.game;
    if (g.phase !== 'play' || g.stage !== 'work' || g.meetingsLeft <= 0) return false;
    g.meetingsLeft -= 1;
    g.meetingsUsed = (g.meetingsUsed || 0) + 1;
    if (g.emergency) {
      this.mhLog('The meeting stopped the ' + EMERGENCIES[g.emergency.kind].toLowerCase() + ' alarm.', false);
      g.emergency = null;
      g.emergencyEndedAt = now;
    }
    g.stage = 'meeting';
    g.workPausedAt = now;
    g.meeting = { n: g.meetingsUsed, by, step: 'talk', at: now, endsAt: now + g.opts.talk * 1000, votes: {}, reasons: {}, result: null, claims: [] };
    this.mhLog('Lab Meeting ' + g.meetingsUsed + ', called by ' + by + '.', false);
    this.mhBotClaims(now);
    return true;
  },
  // Tell the class (Donny, 2026-11-18): at a meeting a student shares one of
  // their tapped notes, and it shows on the projector and on every screen.
  // CLAIMS_EACH at each meeting; a new one about the same classmate takes the
  // old one's place. Moles can fib.
  async mhClaim(pid, m) {
    const g = this.game;
    const mt = g.meeting;
    const p = g.players[pid];
    if (!g.opts.claims || !mt || (mt.step !== 'talk' && mt.step !== 'vote') || !p.alive) return;
    const n = this.mhNoteFrom(pid, m);
    if (!n || !g.players[n.who].alive) return;
    if (!this.mhAddClaim(mt, pid, n, Date.now())) {
      this.notice(pid, 'You already told the class ' + CLAIMS_EACH + ' notes at this meeting.');
      return;
    }
    // It is one of their notes too.
    p.myNotes = (p.myNotes || []).filter((x) => x.who !== n.who).concat([n]);
    await this.save();
    this.toEveryone();
  },
  mhAddClaim(mt, pid, n, now) {
    mt.claims = mt.claims || [];
    const same = mt.claims.findIndex((c) => c.by === pid && c.who === n.who);
    if (same < 0 && mt.claims.filter((c) => c.by === pid).length >= CLAIMS_EACH) return false;
    if (same >= 0) mt.claims.splice(same, 1);
    mt.claims.push({ by: pid, who: n.who, v: n.v, why: n.why, at: now });
    mt.claims = mt.claims.slice(-80);
    return true;
  },
  // Pretend students (demo mode) tell the class now and then while the class
  // talks: a Scientist what a scan said, a Mole a made-up suspicion.
  mhBotClaims(now) {
    const g = this.game;
    const mt = g.meeting;
    if (!mt || !g.opts.claims) return;
    const alive = this.mhAlive();
    const span = Math.max(4000, g.opts.talk * 1000 - 3000);
    mt.botClaims = [];
    alive.filter((p) => p.bot && rand(100) < 25).forEach((p) => {
      const others = alive.filter((x) => x.id !== p.id);
      let n = null;
      if (p.role === 'mole') {
        const sci = others.filter((x) => x.role === 'sci' && !g.clear.includes(x.id));
        const t = sci[rand(sci.length)];
        if (t) {
          const v = rand(100) < 75 ? 'mole' : 'unsure';
          n = { who: t.id, v, why: NOTE_WHY[v][rand(NOTE_WHY[v].length)] };
        }
      } else {
        const ids = Object.keys(p.scanned || {}).filter((id) => others.some((x) => x.id === id));
        const id = ids[rand(ids.length)];
        if (id) n = p.scanned[id] === 'clear' ? { who: id, v: 'sci', why: 'scanYes' } : { who: id, v: 'mole', why: 'scanNo' };
        else {
          const t = others[rand(others.length)];
          if (t) n = { who: t.id, v: 'unsure', why: 'notScanned' };
        }
      }
      if (n) mt.botClaims.push({ by: p.id, ...n, at: now + 1500 + rand(span) });
    });
  },
  mhStartVote(now) {
    const m = this.game.meeting;
    if (!m || m.step !== 'talk') return;
    m.step = 'vote';
    m.endsAt = now + this.game.opts.vote * 1000;
    this.mhBotVotes(now);
  },
  async mhVote(pid, m) {
    const g = this.game;
    const mt = g.meeting;
    const p = g.players[pid];
    if (!mt || mt.step !== 'vote' || !p.alive || mt.votes[pid]) return;
    const target = String(m.target || '');
    if (target !== 'skip' && (!g.players[target] || !g.players[target].alive)) return;
    mt.votes[pid] = target;
    const reason = String(m.reason || '');
    if (REASONS[reason] && target !== 'skip') mt.reasons[pid] = reason;
    if (this.mhAllVoted()) this.mhReveal(Date.now());
    await this.save();
    this.toEveryone();
    await this.ctx.storage.setAlarm(this.mhNextAlarm(Date.now()));
  },
  // Everyone still in the lab who is here has voted (pretend students once their time comes).
  mhAllVoted() {
    const g = this.game;
    const mt = g.meeting;
    if (!mt || mt.step !== 'vote') return false;
    return this.mhAlive().every((p) => mt.votes[p.id] || (!p.bot && !this.online(p.id)));
  },
  mhReveal(now) {
    const g = this.game;
    const mt = g.meeting;
    if (!mt || mt.step !== 'vote') return;
    // Pretend students' votes that are due.
    Object.keys(mt.botVotes || {}).forEach((pid) => { if (!mt.votes[pid] && g.players[pid] && g.players[pid].alive) { mt.votes[pid] = mt.botVotes[pid].target; if (mt.botVotes[pid].reason) mt.reasons[pid] = mt.botVotes[pid].reason; } });
    mt.botVotes = null;
    const tally = {};
    let skip = 0;
    Object.keys(mt.votes).forEach((pid) => {
      const t = mt.votes[pid];
      if (!g.players[pid]) return;
      if (t === 'skip') skip += 1; else tally[t] = (tally[t] || 0) + 1;
    });
    const ranked = Object.keys(tally).filter((id) => g.players[id]).sort((a, b) => tally[b] - tally[a]);
    const top = ranked[0];
    const tie = ranked.length > 1 && tally[ranked[1]] === tally[top];
    let out = '';
    if (top && !tie && tally[top] > skip) out = top;
    const reasons = {};
    Object.values(mt.reasons).forEach((r) => { reasons[r] = (reasons[r] || 0) + 1; });
    ranked.forEach((id) => { g.players[id].votesGot += tally[id]; });
    let wasMole = false;
    if (out) {
      const p = g.players[out];
      wasMole = p.role === 'mole';
      p.alive = false;
      p.ghost = !!g.opts.ghosts;
      p.outAt = mt.n;
      p.jar = 0;
    }
    mt.step = 'reveal';
    mt.revealAt = now;
    mt.resultAt = now + REVEAL_TALLY_MS + (out ? REVEAL_DRUM_MS : 1500);
    mt.shown = false;
    mt.endsAt = mt.resultAt + 9000;
    mt.result = {
      out,
      wasMole,
      tie,
      skip,
      votes: Object.keys(mt.votes).length,
      tally: ranked.map((id) => ({ id, n: tally[id] })),
      reasons,
      // Who voted for whom, only when the teacher wants it shown.
      voters: g.opts.showVoters ? Object.keys(mt.votes).map((pid) => ({ id: pid, to: mt.votes[pid] })) : null,
      outVotes: out ? tally[out] : 0,
      counts: tally
    };
  },
  // The drum roll is over: everyone may know whether it was a Mole.
  mhRevealShow() {
    const g = this.game;
    const mt = g.meeting;
    if (!mt || !mt.result || mt.shown) return;
    mt.shown = true;
    const { out, wasMole, tie, outVotes } = mt.result;
    const tally = mt.result.counts || {};
    // Each voter's record, for missions, awards and the report.
    Object.keys(mt.votes).forEach((pid) => {
      const v = g.players[pid];
      const t = g.players[mt.votes[pid]];
      if (!v) return;
      v.votesMade += 1;
      if (t && t.role === 'mole' && v.role === 'sci') { v.votesRight += 1; this.mhMission(v, 'voteMole', 1); }
    });
    this.mhAlive('mole').forEach((x) => {
      x.survived += 1;
      if ((tally[x.id] || 0) >= 3) this.mhMission(x, 'survive3', 1);
    });
    const p = out && g.players[out];
    if (p) {
      this.mhLog('Meeting ' + mt.n + ': ' + p.name + ' was voted out. ' + (wasMole ? 'A MOLE!' : 'Not a Mole.'), false);
      this.mhCase('Meeting ' + mt.n + ': ' + p.name + ' voted out (' + (wasMole ? 'a Mole, caught!' : 'not a Mole') + ')', wasMole ? out : '');
      this.mhNote(p, 'You were voted out at meeting ' + mt.n + '.', 'meeting');
    } else {
      this.mhLog('Meeting ' + mt.n + ': nobody was voted out' + (tie ? ' (a tie).' : '.'), false);
      this.mhCase('Meeting ' + mt.n + ': nobody voted out', '');
    }
    g.order.forEach((id) => { const v = g.players[id]; if (v && v.id !== out) this.mhNote(v, p ? 'Meeting ' + mt.n + ': ' + p.name + ' got ' + plural(outVotes, 'vote') + ' and left the lab (' + (wasMole ? 'a Mole' : 'not a Mole') + ').' : 'Meeting ' + mt.n + ': nobody left the lab.', 'meeting', out); });
  },
  mhAfterMeeting(now) {
    const g = this.game;
    const mt = g.meeting;
    if (!mt) return;
    this.mhRevealShow();
    const moles = this.mhAlive('mole').length;
    const sci = this.mhAlive('sci').length;
    g.meeting = null;
    g.lastMeetingAt = now;
    if (!moles) return this.mhFinish('sci', 'Every Mole was caught!');
    if (sci <= moles) return this.mhFinish('mole', 'There are as many Moles as Scientists left in the lab.');
    // Not enough meetings left to vote out every Mole: the Moles win, unless
    // the Lab Power bar can still win it for the Scientists.
    if (g.meetingsLeft < moles && !g.power) return this.mhFinish('mole', 'There are not enough meetings left to catch every Mole.');
    if (g.timeUp) return this.mhFinish('mole', 'Time ran out with Moles still hiding in the lab.');
    // Work picks up where it stopped: the rumor clock moves on by the meeting.
    const gap = now - (g.workPausedAt || now);
    if (g.nextRumorAt) g.nextRumorAt += gap;
    g.stage = 'work';
    g.round = (g.round || 1) + 1;
    this.mhAlive().concat(g.order.map((id) => g.players[id]).filter((p) => p && p.ghost)).forEach((p) => this.mhDealMissions(p));
  },

  /* ---------------- emergencies (idea 3) ---------------- */

  mhEmergency(by, now) {
    const g = this.game;
    const keys = Object.keys(EMERGENCIES);
    const kind = keys[rand(keys.length)];
    const sci = g.order.map((id) => g.players[id]).filter((p) => p && p.role === 'sci' && (p.alive || p.ghost)).length;
    g.emergency = { kind, by: by.id, need: Math.max(5, Math.round(sci * 0.9)), got: 0, at: now, endsAt: now + EMERGENCY_MS };
    this.mhLog('ALARM! ' + EMERGENCIES[kind] + '! Answer together to fix it.', false);
    this.mhLog(by.name + ' sounded the alarm', true);
    this.mhCase(by.name + ' set off a ' + EMERGENCIES[kind].toLowerCase(), by.id);
  },
  mhEmergencyOver(fixed, now) {
    const g = this.game;
    const e = g.emergency;
    if (!e) return;
    g.emergency = null;
    g.emergencyEndedAt = now;
    const what = EMERGENCIES[e.kind];
    if (fixed) {
      this.mhAlive().forEach((p) => this.mhGain(p, 3));
      this.mhLog('Fixed! The class beat the ' + what.toLowerCase() + '. Everyone gets +3 energy.', false);
      this.mhCase('The class fixed the ' + what.toLowerCase(), '');
      g.lastEmergency = { kind: e.kind, fixed: true, at: now };
    } else {
      const n = Math.min(g.scansLeft, g.emergencyLoss);
      g.scansLeft -= n;
      this.mhLog('The ' + what.toLowerCase() + ' was not fixed in time. The class lost ' + plural(n, 'scan') + '.', false);
      this.mhCase('The ' + what.toLowerCase() + ' was not fixed: the class lost ' + plural(n, 'scan'), '');
      g.lastEmergency = { kind: e.kind, fixed: false, lost: n, at: now };
    }
  },

  /* ---------------- rumors (idea 8) ---------------- */

  // A true clue from the game itself. kind: 'names', 'answers', 'sabotage'
  // or '' for any. by: who it comes from ('' for the lab radio).
  mhRumorText(kind) {
    const g = this.game;
    const moles = this.mhAlive('mole');
    if (!moles.length) return '';
    const all = this.mhAlive();
    const out = { names: [], answers: [], sabotage: [] };
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const m = moles[rand(moles.length)];
    const first = (m.name.toUpperCase().match(/[A-Z]/) || [''])[0];
    if (first) {
      const i = L.indexOf(first);
      const span = 9 + rand(5);
      const lo = Math.max(0, Math.min(i - rand(span), 26 - span));
      out.names.push('One Mole\'s name starts with a letter from ' + L[lo] + ' to ' + L[Math.min(25, lo + span - 1)] + '.');
    }
    if (m.hero) {
      const h = heroName(m.hero).toUpperCase().charAt(0);
      const hi = L.indexOf(h);
      const hs = 10 + rand(5);
      const hl = Math.max(0, Math.min(hi - rand(hs), 26 - hs));
      out.names.push('One Mole picked a hero whose name starts with ' + L[hl] + ' to ' + L[Math.min(25, hl + hs - 1)] + '.');
    }
    const least = Math.min(...moles.map((p) => p.right));
    out.answers.push('One Mole has fewer than ' + (least + 1 + rand(3)) + ' right answers.');
    const most = Math.max(...moles.map((p) => p.energy));
    if (most >= 5) out.answers.push('One Mole has more than ' + (Math.floor(most / 5) * 5 - 1) + ' energy right now.');
    const pct = (p) => (p.right + p.wrong ? p.right / (p.right + p.wrong) : 0);
    const best = Math.max(...moles.map(pct));
    if (best > 0 && best < 0.95) out.answers.push('Every Mole is getting fewer than ' + Math.min(100, Math.ceil((best * 100 + 1) / 10) * 10) + '% of their questions right.');
    const fakes = moles.reduce((n, p) => n + p.fakes, 0) + g.order.map((id) => g.players[id]).filter((p) => p && p.role === 'mole' && !p.alive).reduce((n, p) => n + p.fakes, 0);
    out.sabotage.push(fakes ? 'The Moles have faked ' + plural(fakes, 'scan') + ' so far.' : 'No Mole has faked a scan yet.');
    if (moles.some((p) => p.disguise)) out.sabotage.push('A Mole is wearing a disguise right now.');
    const everyone = g.order.map((id) => g.players[id]).filter(Boolean);
    const scanned = moles.some((p) => everyone.some((q) => q.scanned && q.scanned[p.id]));
    out.sabotage.push(scanned ? 'At least one Mole has been scanned by a classmate.' : 'No Mole has been scanned yet.');
    const smudged = all.filter((p) => p.smudged).length;
    if (g.opts.smudge) out.sabotage.push(smudged ? plural(smudged, 'student is', 'students are') + ' smudged right now.' : 'Nobody is smudged right now.');
    let pool = kind && out[kind] && out[kind].length ? out[kind] : [...out.names, ...out.answers, ...out.sabotage];
    const told = new Set((g.rumors || []).map((r) => r.text));
    const fresh = pool.filter((t) => !told.has(t));
    if (fresh.length) pool = fresh;
    else if (!kind) { const any = [...out.names, ...out.answers, ...out.sabotage].filter((t) => !told.has(t)); if (any.length) pool = any; }
    return pool[rand(pool.length)] || '';
  },
  mhRumor(kind, by, now) {
    const g = this.game;
    const text = this.mhRumorText(kind);
    if (!text) return '';
    g.rumorN = (g.rumorN || 0) + 1;
    g.rumors = (g.rumors || []).concat([{ n: g.rumorN, text, by: by || '', at: now }]).slice(-8);
    g.order.forEach((id) => { const p = g.players[id]; if (p) this.mhNote(p, (by ? 'Ghost whisper' : 'Rumor ' + g.rumorN) + ': ' + text, 'rumor'); });
    return text;
  },
  async mhWhisper(pid) {
    const g = this.game;
    const p = g.players[pid];
    if (!p.ghost || p.whispered || p.role !== 'sci' || g.stage !== 'work') return;
    p.whispered = true;
    const text = this.mhRumor('', 'ghost', Date.now());
    if (text) this.mhLog('A ghost whispers: ' + text, false);
    this.mhSetPop(p, { t: 'done', text: text ? 'Your whisper went out: ' + text : 'There was nothing to whisper.', at: Date.now() });
    await this.save();
    this.toEveryone();
  },

  /* ---------------- ghosts (idea 6) ---------------- */

  async mhGive(pid, m) {
    const g = this.game;
    const p = g.players[pid];
    const t = g.players[String(m.target || '')];
    if (!p.ghost || !t || !t.alive || p.jar <= 0) return;
    const n = p.jar;
    t.energy += n;
    t.earned += n;
    p.given += n;
    p.jar = 0;
    this.mhNote(t, 'A ghost gave you ' + n + ' energy!', 'gift');
    this.mhLog('A ghost gave ' + t.name + ' ' + n + ' energy.', true);
    this.mhSetPop(p, { t: 'done', text: 'You gave ' + t.name + ' ' + n + ' energy.', at: Date.now() });
    await this.save();
    this.toEveryone();
  },

  /* ---------------- missions and badges (idea 4) ---------------- */

  mhDealMissions(p) {
    const g = this.game;
    if (!g.opts.missions) { p.missions = []; return; }
    const pool = (p.role === 'mole' ? MISSIONS.mole : MISSIONS.sci).filter((x) =>
      (!x.tool || g.opts[TOOL_SWITCH[x.tool]] !== false) && (!x.opt || g.opts[x.opt]) &&
      // A ghost can only answer questions.
      (p.alive || ['streak4', 'right8', 'blend10', 'second'].includes(x.key)) &&
      !(x.key === 'voteMole' && g.meetingsLeft <= 0) && !(x.key === 'survive3' && g.meetingsLeft <= 0));
    p.missions = shuffle(pool).slice(0, 3).map((x) => ({ key: x.key, text: x.text, need: x.need, got: 0, reward: x.reward, badge: x.badge || '', done: false }));
  },
  // Progress on a mission: n more, or (set) exactly n.
  mhMission(p, key, n, set) {
    (p.missions || []).forEach((x) => {
      if (x.key !== key || x.done) return;
      x.got = set ? Math.max(x.got, Math.min(n, x.need)) : Math.min(x.need, x.got + n);
      if (x.got < x.need) return;
      x.done = true;
      p.done = (p.done || 0) + 1;
      this.mhGain(p, x.reward);
      if (x.badge) this.mhBadge(p, x.badge);
      if (p.done === 3) this.mhBadge(p, 'Lab Hero');
      // A mission finished by a tool rides along on that tool's result, so
      // the result (a scan, a peek) is never hidden behind it.
      const pop0 = p.pop;
      if (pop0 && pop0.t !== 'mission' && this.mhToolFor === p.id) pop0.mission = { text: x.text, reward: x.reward };
      else p.pop = { t: 'mission', text: x.text, reward: x.reward, at: Date.now() };
    });
  },
  // A tool's result for the student's pop-up. A mission that tool just
  // finished (set a moment before) comes along with it.
  mhSetPop(p, pop) {
    const was = p.pop;
    if (was && was.t === 'mission' && this.mhToolFor === p.id && (pop.at || Date.now()) - was.at < 1500) pop.mission = { text: was.text, reward: was.reward };
    p.pop = pop;
  },
  mhBadge(p, name) { if (!p.badges.includes(name)) p.badges.push(name); },

  /* ---------------- the logs ---------------- */

  // The Lab log on the projector (secret: only the teacher's remote sees it).
  // truth: what really happened, when the projector's line hides it (the
  // remote then shows that one line instead of the projector's).
  mhLog(text, secret, truth) {
    const g = this.game;
    const at = Date.now() - (g.startedAt || Date.now());
    if (!secret) g.log = (g.log || []).concat([{ at, text }]).slice(-LOG_KEEP);
    g.truth = (g.truth || []).concat([{ at, text: truth || text, secret: !!(secret || truth) }]).slice(-LOG_KEEP * 2);
  },
  // The Case File (idea 10): what the Moles did, shown at the end.
  mhCase(text, who) {
    const g = this.game;
    g.casefile = (g.casefile || []).concat([{ at: Date.now() - (g.startedAt || Date.now()), text, who: who || '' }]).slice(-80);
  },
  // A line in one student's notes (the Evidence Board's clue cards).
  mhNote(p, text, k, about, clear) {
    const g = this.game;
    p.notes = (p.notes || []).concat([{ at: Date.now() - (g.startedAt || Date.now()), text, k: k || '', about: about || '', clear: !!clear }]).slice(-NOTES_KEEP);
  },

  /* ---------------- starting, working and ending ---------------- */

  mhStart(now) {
    const g = this.game;
    if (g.opts.demo) this.mhDemoJoin(DEMO_STUDENTS);
    const ids = g.order.filter((id) => g.players[id]);
    if (ids.length < 3) return false;
    ids.forEach((id) => { Object.assign(g.players[id], fresh()); if (!g.players[id].hero) g.players[id].hero = this.mhFreeHero(id); });
    const n = ids.length;
    let moles = g.opts.moles || Math.round(n / 10);
    moles = Math.max(1, Math.min(moles, Math.floor((n - 1) / 2), 6));
    const order = shuffle(ids);
    const moleIds = order.slice(0, moles);
    moleIds.forEach((id) => { g.players[id].role = 'mole'; });
    // Special roles (idea 5).
    if (g.opts.roles) {
      const sci = shuffle(order.slice(moles));
      const give = (job, test) => { const p = sci.find((id) => !g.players[id].job && test); if (p) g.players[p].job = job; };
      if (g.opts.detective && n >= 5) give('detective', true);
      if (g.opts.medic && g.opts.smudge && n >= 7) give('medic', true);
      if (g.opts.tech && g.opts.emergencies && n >= 6) give('tech', true);
      if (g.opts.hacker && g.opts.cut && (moles >= 2 || n >= 8)) g.players[moleIds[rand(moleIds.length)]].job = 'hacker';
    }
    g.phase = 'play';
    g.stage = 'story';
    g.startedAt = now;
    g.storyEndsAt = now + STORY_MS;
    g.endsAt = g.opts.limit ? now + STORY_MS + g.opts.limit * 60 * 1000 : 0;
    g.timeUp = false;
    g.paused = false;
    g.molesStart = moles;
    g.scansStart = g.opts.scans * n;
    g.scansLeft = g.scansStart;
    g.cutSize = Math.max(4, Math.round(g.scansStart * 0.04));
    g.cutAt = 0;
    g.emergencyLoss = Math.max(5, Math.round(g.scansStart * 0.08));
    // Never fewer than one more than the Moles, or voting could not win.
    g.meetingsLeft = Math.max(g.opts.meetings || moles + 2, moles + 1);
    g.meetingsStart = g.meetingsLeft;
    g.meetingsUsed = 0;
    g.meeting = null;
    g.emergency = null;
    g.emergencyEndedAt = 0;
    g.powerCutAt = 0;
    g.clear = [];
    g.log = [];
    g.truth = [];
    g.casefile = [];
    g.rumors = [];
    g.rumorN = 0;
    g.nextRumorAt = 0;
    g.round = 1;
    g.winner = '';
    g.why = '';
    g.reported = 0;
    g.missed = {};
    // Lab Power's goal (idea 2): about what the Scientists answer right in
    // the whole game at 3 right answers a minute each (a class that keeps
    // answering fills it near the end; a power cut takes 10% back).
    const minutes = g.opts.limit || 15;
    g.power = g.opts.power ? { got: 0, goal: Math.max(30, Math.round((n - moles) * minutes * 3)) } : null;
    ids.forEach((id) => {
      const p = g.players[id];
      this.mhDealMissions(p);
      this.mhNextQuestion(p);
      if (p.job === 'detective') p.freeScanAt = now + STORY_MS;
    });
    this.mhLog('The game started. ' + plural(moles, 'Mole is', 'Moles are') + ' hiding in the lab.', false);
    return true;
  },
  mhBeginWork(now) {
    const g = this.game;
    if (g.stage !== 'story') return;
    g.stage = 'work';
    if (g.opts.rumors) g.nextRumorAt = now + g.opts.rumorEvery * 1000;
    // The clock starts when the story ends (a skipped story gives its time back).
    if (g.endsAt) g.endsAt = now + Math.max(10000, g.endsAt - g.storyEndsAt);
    g.storyEndsAt = 0;
    g.order.forEach((id) => { const p = g.players[id]; if (p && p.q) p.q.at = now; });
  },
  mhFinish(winner, why) {
    const g = this.game;
    if (g.phase !== 'play') return;
    this.mhRevealShow();
    g.phase = 'done';
    g.stage = '';
    g.winner = winner;
    g.why = why;
    g.paused = false;
    g.meeting = null;
    g.emergency = null;
    g.endedAt = Date.now();
    this.mhLog(why, false);
    this.mhReport();
  },

  // The class leaderboard: a win for everyone on the winning team, like the other games.
  mhReport() {
    const g = this.game;
    if (!g.counts || g.opts.demo || !this.env.BOARD || g.reported === g.startedAt) return;
    g.reported = g.startedAt;
    const people = g.order.map((id) => g.players[id]).filter((p) => p && !p.bot);
    if (people.length < 2) return;
    const rows = people.filter((p) => p.stu).map((p) => ({ email: p.stu, team: true, place: p.role === g.winner ? 1 : 2, win: p.role === g.winner, right: p.right }));
    if (!rows.length) return;
    const send = this.env.BOARD.get(this.env.BOARD.idFromName('main')).fetch('https://board/board/live', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: 'molehunt', setId: g.setId, teams: 2, rows })
    }).catch(() => {});
    try { this.ctx.waitUntil(send); } catch { /* the game stays awake for its players anyway */ }
  },

  /* ---------------- pretend students (demo mode) ---------------- */

  mhDemoJoin(n) {
    const g = this.game;
    for (let i = 0; i < n; i++) {
      const count = this.mhBots();
      if (count >= DEMO_STUDENTS || g.order.length >= MAX_PLAYERS) return;
      const first = DEMO_FIRST[count % DEMO_FIRST.length];
      const pid = 'bot' + token().slice(0, 7);
      const p = {
        id: pid, name: this.uniqueName(first + ' ' + 'ABCDEFGHJKLMNPRSTW'[rand(18)] + '.'), secret: token(), dev: '', hero: '',
        ...fresh(), bot: true, skill: 50 + rand(45), pace: 7000 + rand(8000), caller: rand(100) < 18
      };
      p.hero = this.mhFreeHero(pid);
      g.players[pid] = p;
      g.order.push(pid);
    }
  },

  // One second of pretend students: they answer at their own pace, use their
  // tools now and then, call meetings, and give away ghost jars.
  mhBotTick(now) {
    const g = this.game;
    if (g.phase !== 'play') return false;
    let changed = false;
    const bots = g.order.map((id) => g.players[id]).filter((p) => p && p.bot);
    const mt0 = g.stage === 'meeting' && g.meeting;
    if (mt0 && (mt0.step === 'talk' || mt0.step === 'vote') && (mt0.botClaims || []).length) {
      const due = mt0.botClaims.filter((c) => now >= c.at);
      if (due.length) {
        mt0.botClaims = mt0.botClaims.filter((c) => now < c.at);
        due.forEach((c) => {
          const p = g.players[c.by];
          if (p && p.alive && g.players[c.who] && g.players[c.who].alive && this.mhAddClaim(mt0, c.by, c, now)) changed = true;
        });
      }
    }
    if (g.stage === 'meeting' && g.meeting && g.meeting.step === 'vote') {
      const mt = g.meeting;
      Object.keys(mt.botVotes || {}).forEach((pid) => {
        const b = mt.botVotes[pid];
        if (now >= b.at && !mt.votes[pid] && g.players[pid] && g.players[pid].alive) {
          mt.votes[pid] = b.target;
          if (b.reason) mt.reasons[pid] = b.reason;
          changed = true;
        }
      });
      if (changed && this.mhAllVoted()) this.mhReveal(now);
      return changed;
    }
    if (g.stage !== 'work') return changed;
    let meetingCalled = false;
    for (const p of bots) {
      if (g.phase !== 'play' || g.stage !== 'work') break;
      if (!p.alive && !p.ghost) continue;
      if (p.frozenUntil > now) continue;
      if (!p.botAt) p.botAt = now + rand(p.pace);
      if (now >= p.botAt && p.q) {
        const ok = rand(100) < p.skill;
        const wrong = [...Array(p.q.order.length).keys()].filter((k) => k !== p.q.c);
        this.mhApplyAnswer(p, ok ? p.q.c : wrong[rand(wrong.length)], now);
        p.botAt = now + Math.round(p.pace * (0.6 + Math.random() * 0.8));
        changed = true;
        if (g.phase !== 'play') break;
      }
      if (p.ghost) {
        if (p.jar >= 8 && rand(100) < 25) {
          const mates = this.mhAlive().filter((x) => (p.role === 'mole' ? x.role === 'mole' : g.clear.includes(x.id) || x.role === 'sci' || rand(4) === 0));
          const t = mates[rand(mates.length)];
          if (t) { t.energy += p.jar; t.earned += p.jar; p.given += p.jar; p.jar = 0; changed = true; }
        }
        if (p.role === 'sci' && !p.whispered && rand(1000) < 8) {
          p.whispered = true;
          const text = this.mhRumor('', 'ghost', now);
          if (text) this.mhLog('A ghost whispers: ' + text, false);
          changed = true;
        }
        continue;
      }
      if (rand(100) >= 22) continue;
      const others = this.mhAlive().filter((x) => x.id !== p.id);
      const pickT = (list) => list[rand(list.length)];
      const tryTool = (key, target) => {
        if (TOOL_SWITCH[key] && !g.opts[TOOL_SWITCH[key]]) return false;
        if (this.mhUseTool(p.id, key, target || '', now)) return false;
        changed = true;
        return true;
      };
      if (p.role === 'sci') {
        if (p.job === 'medic' && p.protectRound !== g.round && others.length) tryTool('protect', pickT(others).id);
        if (p.job === 'detective' && now >= p.freeScanAt) {
          const t = pickT(others.filter((x) => !p.scanned[x.id])) || pickT(others);
          if (t) tryTool('scan', t.id);
        }
        const calm = !g.lastMeetingAt || now - g.lastMeetingAt > 70 * 1000;
        const sincePlay = now - (g.startedAt + STORY_MS);
        if (!meetingCalled && calm && sincePlay > 80 * 1000 && g.meetingsLeft > 0 && p.energy >= this.mhCost('meeting', p) && rand(100) < (p.caller ? 45 : 10)) {
          meetingCalled = tryTool('meeting');
          if (meetingCalled) break;
          continue;
        }
        // A caller saves up for meetings instead of scanning.
        if (p.caller && g.opts.studentMeetings && g.meetingsLeft > 0) continue;
        const unscanned = others.filter((x) => !p.scanned[x.id] && !g.clear.includes(x.id));
        if (p.energy >= this.mhCost('public', p) && rand(100) < 35) tryTool('public', (pickT(unscanned) || pickT(others) || {}).id);
        else if (p.energy >= this.mhCost('scan', p)) tryTool('scan', (pickT(unscanned) || pickT(others) || {}).id);
        else if (p.energy >= this.mhCost('peek', p) && rand(100) < 8) tryTool('peek', (pickT(others) || {}).id);
      } else {
        const sci = others.filter((x) => x.role === 'sci');
        const roll = rand(100);
        if (roll < 30 && p.energy >= this.mhCost('fake', p)) tryTool('fake', (pickT(g.clear.length && rand(2) ? sci.filter((x) => g.clear.includes(x.id)) : sci) || pickT(sci) || {}).id);
        else if (roll < 45 && p.energy >= this.mhCost('cut', p)) tryTool('cut');
        else if (roll < 58 && p.energy >= this.mhCost('smudge', p)) tryTool('smudge', (pickT(sci.filter((x) => !x.smudged && !g.clear.includes(x.id))) || {}).id);
        else if (roll < 66 && !p.disguise && p.energy >= this.mhCost('disguise', p)) tryTool('disguise');
        else if (roll < 78 && g.opts.emergencies && p.energy >= this.mhCost('alarm', p)) tryTool('alarm');
        else if (roll < 88 && g.opts.power && p.energy >= this.mhCost('powercut', p)) tryTool('powercut');
      }
    }
    return changed;
  },

  // When voting opens, each pretend student picks a vote and a moment to
  // cast it. A Scientist votes for whoever their scans make most suspicious
  // (never anyone on the Clear list); a Mole votes for a Scientist.
  mhBotVotes(now) {
    const g = this.game;
    const mt = g.meeting;
    if (!mt) return;
    mt.botVotes = {};
    const alive = this.mhAlive();
    const keys = Object.keys(REASONS);
    // The talking part of the meeting: Scientists tell each other what their
    // scans said (so everyone knows a little of what everyone found).
    const told = {};
    g.order.map((id) => g.players[id]).filter((x) => x && x.role === 'sci').forEach((x) => {
      Object.keys(x.scanned || {}).forEach((id) => { told[id] = (told[id] || 0) + (x.scanned[id] === 'clear' ? -3 : 1); });
    });
    // ... and each Mole accuses a Scientist who is not on the Clear list.
    alive.filter((x) => x.role === 'mole').forEach(() => {
      const pool = alive.filter((x) => x.role === 'sci' && !g.clear.includes(x.id));
      const t = pool[rand(pool.length)];
      if (t) told[t.id] = (told[t.id] || 0) + 2;
    });
    alive.filter((p) => p.bot).forEach((p) => {
      const others = alive.filter((x) => x.id !== p.id);
      let target = 'skip';
      let reason = '';
      if (p.role === 'mole') {
        const pool = others.filter((x) => x.role === 'sci' && !g.clear.includes(x.id));
        const t = pool[rand(pool.length)] || others.find((x) => x.role === 'sci');
        if (t && rand(100) < 90) { target = t.id; reason = keys[rand(keys.length)]; }
      } else {
        const pool = others.filter((x) => !g.clear.includes(x.id) && p.scanned[x.id] !== 'clear');
        // Each one heard only part of the talk.
        const heard = {};
        Object.keys(told).forEach((id) => { if (rand(100) < 55) heard[id] = told[id]; });
        const score = (x) => (p.sus[x.id] || 0) * 2 + (heard[x.id] || 0) + Math.random() * 2.5;
        const best = pool.sort((a, b) => score(b) - score(a))[0];
        if (best && rand(100) < 88) { target = best.id; reason = p.sus[best.id] > 0 ? 'scanned' : heard[best.id] > 0 ? 'clear' : keys[rand(keys.length)]; }
      }
      mt.botVotes[p.id] = { target, reason, at: now + 1500 + rand(Math.max(2000, g.opts.vote * 1000 * 0.6)) };
    });
  },

  /* ---------------- the teacher's controls (B and C) ---------------- */

  async mhHost(m, a) {
    const g = this.game;
    const now = Date.now();
    if (m.t === 'close') return this.close('Your teacher ended this game.', 'Game ended.');
    if (m.t === 'settings' && m.opts && g.phase === 'lobby') {
      g.opts = this.mhOpts(m.opts, g.opts);
    } else if (m.t === 'start' && g.phase === 'lobby') {
      if (!this.mhStart(now)) return;
    } else if (m.t === 'skipStory' && g.stage === 'story') {
      this.mhBeginWork(now);
    } else if (m.t === 'pause' && g.phase === 'play' && !g.paused) {
      g.paused = true;
      g.pausedAt = now;
    } else if (m.t === 'resume' && g.phase === 'play' && g.paused) {
      // Everything waiting moves on by the time it was paused.
      const gap = now - (g.pausedAt || now);
      ['storyEndsAt', 'endsAt', 'nextRumorAt', 'workPausedAt', 'powerCutAt', 'cutAt', 'emergencyEndedAt', 'lastMeetingAt'].forEach((k) => { if (g[k]) g[k] += gap; });
      if (g.meeting) { g.meeting.endsAt += gap; Object.values(g.meeting.botVotes || {}).forEach((b) => { b.at += gap; }); }
      if (g.emergency) g.emergency.endsAt += gap;
      g.order.forEach((id) => { const p = g.players[id]; if (!p) return; if (p.frozenUntil > g.pausedAt) p.frozenUntil += gap; if (p.freeScanAt > g.pausedAt) p.freeScanAt += gap; if (p.botAt) p.botAt += gap; });
      g.paused = false;
    } else if (m.t === 'meeting' && g.phase === 'play') {
      // The teacher's meeting is free; with none left, the teacher adds one first.
      if (g.stage !== 'work') return;
      if (g.meetingsLeft <= 0) g.meetingsLeft = 1;
      this.mhStartMeeting('your teacher', now);
    } else if (m.t === 'startVote' && g.meeting && g.meeting.step === 'talk') {
      this.mhStartVote(now);
    } else if (m.t === 'endVote' && g.meeting && g.meeting.step === 'vote') {
      this.mhReveal(now);
    } else if (m.t === 'nextReveal' && g.meeting && g.meeting.step === 'reveal') {
      this.mhAfterMeeting(now);
    } else if (m.t === 'addMeeting' && g.phase === 'play') {
      g.meetingsLeft += 1;
      this.mhLog('Your teacher added a meeting.', false);
    } else if (m.t === 'rumor' && g.phase === 'play' && g.stage === 'work') {
      const text = this.mhRumor(['names', 'answers', 'sabotage'].includes(m.kind) ? m.kind : '', '', now);
      if (text && g.opts.rumors) g.nextRumorAt = now + g.opts.rumorEvery * 1000;
    } else if (m.t === 'boost' && g.phase === 'play') {
      this.mhAlive().forEach((p) => this.mhGain(p, 5));
      g.order.forEach((id) => { const p = g.players[id]; if (p && p.ghost) this.mhGain(p, 5); });
      this.mhLog('Your teacher gave everyone +5 energy!', false);
    } else if (m.t === 'time' && g.phase === 'play') {
      // A minute more or less (Donny, 2026-11-15); never under 10 seconds
      // left. With no clock, the teacher sets one instead ('clock').
      const add = Math.max(-600, Math.min(600, Math.round(Number(m.seconds) || 0))) * 1000;
      if (!add || !g.endsAt) return;
      const base = g.stage === 'story' ? Math.max(now, g.storyEndsAt) : now;
      g.endsAt = Math.max(base + 10000, g.endsAt + add);
      if (g.paused) g.endsAt = Math.max(g.endsAt, (g.pausedAt || now) + 10000);
      g.timeUp = false;
    } else if (m.t === 'clock' && g.phase === 'play') {
      const mins = pickFrom(CLOCK, -1, m.minutes);
      if (mins < 0) return;
      const base = g.stage === 'story' ? Math.max(now, g.storyEndsAt) : now;
      g.endsAt = mins ? base + mins * 60 * 1000 : 0;
      g.timeUp = false;
    } else if (m.t === 'end' && g.phase === 'play') {
      // End game now (B): the Moles still hiding win, and everyone sees them.
      const moles = this.mhAlive('mole').length;
      this.mhFinish(moles ? 'mole' : 'sci', moles ? 'Your teacher ended the game with Moles still hiding.' : 'Every Mole was caught!');
    } else if (m.t === 'again' && g.phase === 'done') {
      g.phase = 'lobby';
      g.stage = '';
      g.endsAt = 0;
      g.timeUp = false;
      g.meeting = null;
      g.order.forEach((id) => { Object.assign(g.players[id], fresh()); });
    } else if (m.t === 'unblock') {
      g.blocked = (g.blocked || []).filter((x) => x.id !== String(m.id || ''));
    } else if (m.t === 'kick') {
      const pid = String(m.id || '');
      const p = g.players[pid];
      if (!p) return;
      if (m.block) g.blocked = (g.blocked || []).concat([{ id: token().slice(0, 8), name: p.name, dev: p.dev || '', typed: !!p.guest }]).slice(-60);
      delete g.players[pid];
      g.order = g.order.filter((x) => x !== pid);
      if (g.clear) g.clear = g.clear.filter((x) => x !== pid);
      this.sockets((x) => x.pid === pid).forEach((ws) => {
        this.send(ws, m.block
          ? { t: 'removed', blocked: true, msg: 'Your teacher removed you from this game.' }
          : { t: 'removed', msg: 'Your teacher took you out of this game. You can join again.' });
        try { ws.close(1000, 'Removed'); } catch { /* gone */ }
      });
      if (g.phase === 'play') {
        if (!this.mhAlive('mole').length) this.mhFinish('sci', 'Every Mole is gone from the lab!');
        else if (g.meeting && g.meeting.step === 'vote' && this.mhAllVoted()) this.mhReveal(now);
      }
    } else if (a.remote && m.t === 'give' && g.players[String(m.id || '')]) {
      // The Teacher Remote (C): +5 energy for one student.
      const p = g.players[String(m.id)];
      this.mhGain(p, 5);
      this.mhNote(p, 'Your teacher gave you 5 energy.', 'gift');
    } else if (a.remote && m.t === 'freeze' && g.players[String(m.id || '')]) {
      const p = g.players[String(m.id)];
      p.frozenUntil = p.frozenUntil > now ? 0 : now + FREEZE_MS;
    } else {
      return;
    }
    await this.save();
    this.toEveryone();
    await this.ctx.storage.setAlarm(this.mhNextAlarm(Date.now()));
  },

  /* ---------------- what each screen is sent ---------------- */

  mhPerson(p) {
    const g = this.game;
    return { id: p.id, name: p.name, hero: p.hero, alive: !!p.alive, ghost: !!p.ghost, clear: !!(g.clear && g.clear.includes(p.id)), outAt: p.outAt || 0 };
  },
  mhMeetingView(secretToo) {
    const g = this.game;
    const mt = g.meeting;
    if (!mt) return null;
    const alive = this.mhAlive();
    const r = mt.result;
    const out = r && r.out && g.players[r.out] ? this.mhPerson(g.players[r.out]) : null;
    const shown = !!mt.shown || !!secretToo;
    return {
      n: mt.n,
      by: mt.by,
      step: mt.step,
      endsAt: mt.endsAt,
      revealAt: mt.revealAt || 0,
      drumAt: mt.revealAt ? mt.revealAt + REVEAL_TALLY_MS : 0,
      resultAt: mt.resultAt || 0,
      shown: !!mt.shown,
      votesIn: Object.keys(mt.votes).filter((id) => g.players[id] && g.players[id].alive).length +
        (mt.step === 'vote' ? Object.keys(mt.botVotes || {}).filter((id) => !mt.votes[id] && mt.botVotes[id].at <= Date.now()).length : 0),
      of: alive.length,
      result: r ? {
        out,
        wasMole: shown ? r.wasMole : null,
        tie: r.tie,
        skip: r.skip,
        votes: r.votes,
        tally: r.tally.map((x) => ({ ...this.mhPerson(g.players[x.id] || { id: x.id, name: '?', hero: '' }), n: x.n })),
        reasons: Object.keys(r.reasons).map((k) => ({ k, text: REASONS[k], n: r.reasons[k] })).sort((x, y) => y.n - x.n),
        voters: r.voters,
        molesLeft: shown ? this.mhAlive('mole').length : null,
        meetingsLeft: g.meetingsLeft
      } : null,
      // Tell the class: what students shared at this meeting (oldest first).
      claims: (mt.claims || []).filter((c) => g.players[c.by] && g.players[c.who]).slice(-30)
        .map((c) => ({ by: this.mhPerson(g.players[c.by]), who: this.mhPerson(g.players[c.who]), v: c.v, why: c.why, at: c.at })),
      claimsEach: CLAIMS_EACH,
      votes: secretToo ? mt.votes : undefined
    };
  },
  mhStats() {
    const g = this.game;
    // Before the drum roll ends, a Mole just voted out still counts.
    const mt = g.meeting;
    const hiding = mt && mt.result && !mt.shown && mt.result.out && g.players[mt.result.out] && g.players[mt.result.out].role === 'mole' ? 1 : 0;
    return {
      molesLeft: this.mhAlive('mole').length + hiding,
      molesStart: g.molesStart || 0,
      meetingsLeft: g.meetingsLeft || 0,
      meetingsStart: g.meetingsStart || 0,
      scansLeft: g.scansLeft || 0,
      scansStart: g.scansStart || 0,
      alive: this.mhAlive().length,
      players: g.order.length
    };
  },

  // The projector (and, with secrets, the Teacher Remote).
  mhBoard(secretToo) {
    const g = this.game;
    const now = Date.now();
    const done = g.phase === 'done';
    const out = {
      t: 'board',
      kind: 'molehunt',
      remote: !!secretToo,
      now,
      code: g.code,
      phase: g.phase,
      stage: g.stage || '',
      title: g.title,
      setId: g.setId,
      questions: g.cards.length,
      opts: g.opts,
      counts: !!g.counts && !g.opts.demo,
      startedAt: g.startedAt || 0,
      endsAt: g.endsAt || 0,
      storyEndsAt: g.storyEndsAt || 0,
      timeUp: !!g.timeUp,
      paused: !!g.paused,
      pausedAt: g.paused ? g.pausedAt : 0,
      stats: g.phase === 'lobby' ? null : this.mhStats(),
      players: g.order.map((pid) => {
        const p = g.players[pid];
        const x = { ...this.mhPerson(p), on: this.online(pid), bot: !!p.bot, pass: !!p.stu, guest: !!p.guest, late: !!p.late };
        if (secretToo || done) Object.assign(x, { role: p.role, job: p.job, energy: p.energy, jar: p.jar, right: p.right, wrong: p.wrong, smudged: !!p.smudged, disguise: !!p.disguise, frozen: p.frozenUntil > now && !(p.slowUntil > now), slow: p.slowUntil > now, slowed: p.slowed || 0, frozenUntil: p.frozenUntil || 0 });
        return x;
      }),
      log: (g.log || []).slice(-40),
      power: g.power ? { got: g.power.got, goal: g.power.goal } : null,
      emergency: g.emergency ? { kind: g.emergency.kind, name: EMERGENCIES[g.emergency.kind], need: g.emergency.need, got: g.emergency.got, endsAt: g.emergency.endsAt } : null,
      lastEmergency: g.lastEmergency || null,
      rumors: (g.rumors || []).slice(-4),
      nextRumorAt: g.opts.rumors && g.stage === 'work' ? g.nextRumorAt || 0 : 0,
      meeting: this.mhMeetingView(secretToo),
      blocked: (g.blocked || []).map((x) => ({ id: x.id, name: x.name }))
    };
    if (secretToo) out.truth = (g.truth || []).slice(-60);
    if (done) {
      out.winner = g.winner;
      out.why = g.why;
      out.casefile = g.casefile || [];
      out.awards = this.mhAwards();
      out.missed = this.mhMissed();
      out.results = this.mhResults();
    }
    return out;
  },
  mhToHost() {
    let open = null;
    let secret = null;
    this.sockets((a) => a.role === 'host').forEach((ws) => {
      let a;
      try { a = ws.deserializeAttachment() || {}; } catch { a = {}; }
      if (a.remote) { secret = secret || this.mhBoard(true); this.send(ws, secret); } else { open = open || this.mhBoard(false); this.send(ws, open); }
    });
  },

  // The awards at the end (idea 10).
  mhAwards() {
    const g = this.game;
    const all = g.order.map((id) => g.players[id]).filter(Boolean);
    const sci = all.filter((p) => p.role === 'sci');
    const moles = all.filter((p) => p.role === 'mole');
    const best = (list, score) => list.slice().sort((a, b) => score(b) - score(a))[0];
    const out = [];
    const det = best(sci, (p) => p.votesRight * 2 + p.scansOnMoles);
    if (det && det.votesRight * 2 + det.scansOnMoles > 0) out.push({ key: 'detective', title: 'Best Detective', id: det.id, name: det.name, hero: det.hero, note: (det.votesRight ? plural(det.votesRight, 'vote') + ' for a real Mole' : '') + (det.votesRight && det.scansOnMoles ? ', ' : '') + (det.scansOnMoles ? plural(det.scansOnMoles, 'scan') + ' on a Mole' : '') });
    const sneaky = best(moles, (p) => (p.alive ? 100 : 0) + p.survived * 10 - p.votesGot);
    if (sneaky) out.push({ key: 'sneaky', title: 'Sneakiest Mole', id: sneaky.id, name: sneaky.name, hero: sneaky.hero, note: sneaky.alive ? 'Never caught' + (sneaky.survived ? ', ' + plural(sneaky.survived, 'meeting') + ' survived' : '') : 'Survived ' + plural(sneaky.survived, 'meeting') });
    const top = best(all, (p) => p.right * 1000 - p.wrong);
    if (top && top.right) out.push({ key: 'answers', title: 'Top Answerer', id: top.id, name: top.name, hero: top.hero, note: top.right + ' right' });
    const ghost = best(all, (p) => p.given);
    if (ghost && ghost.given > 0) out.push({ key: 'ghost', title: 'Best Ghost', id: ghost.id, name: ghost.name, hero: ghost.hero, note: 'Gave ' + ghost.given + ' energy to the team' });
    const ms = best(all, (p) => p.done);
    if (g.opts.missions && ms && ms.done >= 2 && out.length < 5) out.push({ key: 'missions', title: 'Mission Master', id: ms.id, name: ms.name, hero: ms.hero, note: plural(ms.done, 'mission') + ' done' });
    return out;
  },
  mhMissed() {
    const g = this.game;
    return Object.keys(g.missed || {})
      .map((i) => ({ q: (g.cards[i] || {}).q || '', a: (g.cards[i] || {}).a || '', r: g.missed[i].r, w: g.missed[i].w }))
      .filter((x) => x.w > 0)
      .sort((x, y) => (y.w / (y.r + y.w || 1)) - (x.w / (x.r + x.w || 1)) || y.w - x.w)
      .slice(0, 8);
  },
  // Everything for the report (D): each question that came up, and every
  // student's answers to it (R right, W wrong).
  mhResults() {
    const g = this.game;
    const asked = new Set();
    g.order.forEach((pid) => Object.keys(g.players[pid].qa || {}).forEach((i) => asked.add(Number(i))));
    const qs = [...asked].sort((x, y) => x - y);
    const jobs = { detective: 'Detective', medic: 'Medic', tech: 'Lab Tech', hacker: 'Hacker' };
    return {
      title: g.title,
      at: g.startedAt || g.created,
      winner: g.winner,
      questions: qs.map((i) => ({ i, q: (g.cards[i] || {}).q || '', a: (g.cards[i] || {}).a || '' })),
      rows: g.order.map((id) => g.players[id]).filter(Boolean).map((p) => ({
        name: p.name, email: p.stu || '', bot: !!p.bot, role: p.role === 'mole' ? 'Mole' : 'Scientist', job: jobs[p.job] || '',
        won: p.role === g.winner, right: p.right, wrong: p.wrong, earned: p.earned, scans: p.scans, pubs: p.pubs, fakes: p.fakes,
        votesRight: p.votesRight, votesMade: p.votesMade, votesGot: p.votesGot, out: p.outAt || 0, missions: p.done || 0, slowed: p.slowed || 0,
        badges: p.badges || [], best: p.best || 0, given: p.given || 0,
        qa: qs.map((i) => (p.qa || {})[i] || '')
      }))
    };
  },

  // One student's screen.
  mhView(pid) {
    const g = this.game;
    const p = g.players[pid];
    if (!p) return { t: 'removed', msg: 'You are not in this game.' };
    const now = Date.now();
    const out = {
      t: 'view',
      kind: 'molehunt',
      now,
      phase: g.phase,
      stage: g.stage || '',
      title: g.title,
      me: pid,
      name: p.name,
      hero: p.hero,
      late: !!p.late,
      paused: !!g.paused,
      endsAt: g.phase === 'play' ? g.endsAt || 0 : 0,
      storyEndsAt: g.storyEndsAt || 0,
      opts: {
        scan: g.opts.scan, public: g.opts.public, peek: g.opts.peek, studentMeetings: g.opts.studentMeetings, fake: g.opts.fake, cut: g.opts.cut,
        smudge: g.opts.smudge, disguise: g.opts.disguise, power: g.opts.power, emergencies: g.opts.emergencies, missions: g.opts.missions,
        ghosts: g.opts.ghosts, rumors: g.opts.rumors, second: g.opts.second, showAnswer: g.opts.showAnswer, wrongCost: g.opts.wrongCost, reliable: g.opts.reliable, claims: g.opts.claims
      }
    };
    if (g.phase !== 'done') out.taken = g.order.filter((id) => id !== pid && g.players[id] && g.players[id].hero).map((id) => g.players[id].hero);
    if (g.phase === 'lobby') return out;
    const mole = p.role === 'mole';
    Object.assign(out, {
      role: p.role,
      job: p.job,
      mates: mole ? g.order.filter((id) => id !== pid && g.players[id] && g.players[id].role === 'mole').map((id) => this.mhPerson(g.players[id])) : [],
      alive: !!p.alive,
      ghost: !!p.ghost,
      outAt: p.outAt || 0,
      energy: p.energy,
      jar: p.jar,
      jarMax: JAR_MAX,
      streak: p.streak,
      right: p.right,
      wrong: p.wrong,
      frozenUntil: p.frozenUntil > now ? p.frozenUntil : 0,
      slowUntil: p.slowUntil > now ? p.slowUntil : 0,
      stats: this.mhStats(),
      people: g.order.filter((id) => id !== pid && g.players[id]).map((id) => ({ ...this.mhPerson(g.players[id]), mate: mole && g.players[id].role === 'mole' })),
      q: g.phase === 'play' ? this.mhQuestionView(p) : null,
      last: p.last,
      pop: p.pop,
      notes: p.notes,
      notesText: p.notesText,
      myNotes: p.myNotes || [],
      board: p.board,
      missions: p.missions || [],
      badges: p.badges || [],
      log: (g.log || []).slice(-12),
      clear: g.clear || [],
      power: g.power ? { got: g.power.got, goal: g.power.goal } : null,
      emergency: g.emergency ? { kind: g.emergency.kind, name: EMERGENCIES[g.emergency.kind], need: g.emergency.need, got: g.emergency.got, endsAt: g.emergency.endsAt } : null,
      rumors: (g.rumors || []).slice(-8),
      meeting: this.mhMeetingView(false),
      myVote: g.meeting ? g.meeting.votes[pid] || '' : '',
      whisper: p.ghost && p.role === 'sci' && !p.whispered,
      round: g.round || 1
    });
    if (g.phase === 'play') {
      // Everyone gets the same lab tools, so a peek at a screen gives no Mole
      // away (Donny, 2026-11-19); a Mole's sabotage tools come separately, for
      // the Secret tools drawer every screen has.
      const usable = (k) => (!TOOL_SWITCH[k] || g.opts[TOOL_SWITCH[k]]) && (k !== 'powercut' || g.opts.power) && (k !== 'alarm' || g.opts.emergencies);
      out.tools = SCI_TOOLS.filter(usable).map((k) => ({ key: k, cost: this.mhCost(k, p) }));
      out.secret = mole ? MOLE_TOOLS.filter(usable).map((k) => ({ key: k, cost: this.mhCost(k, p) })) : [];
      if (p.job === 'detective') out.freeScanAt = p.freeScanAt;
      if (p.job === 'medic') out.canProtect = p.protectRound !== g.round;
      out.scansLeft = g.scansLeft;
    }
    if (g.phase === 'done') {
      out.done = {
        winner: g.winner,
        why: g.why,
        won: p.role === g.winner,
        moles: g.order.map((id) => g.players[id]).filter((x) => x && x.role === 'mole').map((x) => ({ ...this.mhPerson(x), job: x.job })),
        awards: this.mhAwards(),
        casefile: (g.casefile || []).slice(-14)
      };
    }
    return out;
  }
};
