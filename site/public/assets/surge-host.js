/* ============================================================
   Surge Showdown: the teacher's screen (surge/), Donny 2026-11-04.

   Surge Showdown used to be its own site with its own teacher accounts and
   question editor. Now it runs on this site like Battle Royale: the teacher
   signs in with the teacher password, picks one of the site's question sets
   (made on the Battle Royale page) or a flashcard set, who can join (Class
   Pass only, or guests too) and the class period, and the game settings.
   Students join at /join/ with the code.

   Then the board: the lobby (the code, a QR code, the teams, the period's
   class list), the battle (team health, the surge meter, the feed, every
   player's stats), and the podium. Music plays on this screen only
   (surge-music.js); the how-to-play slides are surge-intro.js.

   The game runs on the game server (game-server/src/surge.js).
   Address extras from the Host a game page: #qset=<id> or #set=<id>.
   ============================================================ */
(function () {
  'use strict';

  const { $, esc, store, toast, connect, timing, fmtTime, hpBar, podiumHTML, confetti } = window.SG;
  const ED = window.IS8Editor;
  const KEY = 'is8-surge-v1';
  const VIEWS = ['sgGate', 'sgSetup', 'sgLobby', 'sgLive', 'sgResults'];

  // The power-ups, for the setup screen's "at a glance" (the game server has the real rules).
  const RULES = {
    upgrades: { gain: { levels: [10, 20, 35, 60, 100, 160] } },
    powers: {
      strike: { name: 'Strike', icon: '⚔️', cost: 40, base: 30, desc: 'Hit one team.' },
      siphon: { name: 'Siphon', icon: '🌀', cost: 90, base: 25, desc: 'Hit one team and heal yours by the same amount.' },
      barrage: { name: 'Barrage', icon: '☄️', cost: 150, base: 18, desc: 'Hit every other team still standing.' },
      mend: { name: 'Mend', icon: '💚', cost: 60, base: 45, desc: 'Heal your team.' },
      shield: { name: 'Shield', icon: '🛡️', cost: 70, base: 50, desc: 'Add a shield that absorbs damage.' }
    },
    gamble: { name: 'Double or Nothing', icon: '🎲', cost: 30, base: 60 }
  };
  const THEMES = {
    elements: { label: 'Elemental Kingdoms', teams: [['Fire', '🔥', '#ef4444'], ['Water', '💧', '#3b82f6'], ['Earth', '🪨', '#b7791f'], ['Air', '🌪️', '#e2e8f0'], ['Lightning', '⚡', '#facc15'], ['Ice', '❄️', '#67e8f9'], ['Nature', '🌿', '#22c55e'], ['Metal', '⚙️', '#f97316'], ['Light', '✨', '#f472b6'], ['Shadow', '🌑', '#8b5cf6']] },
    solar: { label: 'Solar System', teams: [['Sun', '☀️', '#facc15'], ['Mercury', '🌑', '#a8a29e'], ['Venus', '✨', '#f59e0b'], ['Earth', '🌍', '#3b82f6'], ['Mars', '🔴', '#ef4444'], ['Jupiter', '🟠', '#f97316'], ['Saturn', '🪐', '#d6b37a'], ['Uranus', '🧊', '#67e8f9'], ['Neptune', '🔵', '#6366f1'], ['Pluto', '❄️', '#f472b6']] },
    beasts: { label: 'Mythic Beasts', teams: [['Dragon', '🐉', '#ef4444'], ['Phoenix', '🦅', '#f97316'], ['Kraken', '🐙', '#8b5cf6'], ['Griffin', '🦁', '#eab308'], ['Unicorn', '🦄', '#f472b6'], ['Hydra', '🐍', '#22c55e'], ['Minotaur', '🐂', '#b7791f'], ['Yeti', '🏔️', '#e2e8f0'], ['Sphinx', '🐈', '#67e8f9'], ['Thunderbird', '⚡', '#3b82f6']] },
    gems: { label: 'Gemstone Clans', teams: [['Ruby', '❤️', '#e11d48'], ['Sapphire', '💙', '#2563eb'], ['Emerald', '💚', '#10b981'], ['Topaz', '🧡', '#f59e0b'], ['Amethyst', '💜', '#9333ea'], ['Diamond', '💎', '#e0f2fe'], ['Onyx', '🖤', '#71717a'], ['Opal', '🩷', '#f9a8d4'], ['Citrine', '💛', '#facc15'], ['Jade', '🍀', '#84cc16']] }
  };
  const themeTeams = (key) => (THEMES[key] || THEMES.elements).teams.map(([name, icon, color]) => ({ name, icon, color }));
  const DEFAULTS = {
    title: 'Surge Showdown', theme: 'elements', teamCount: 4, teams: themeTeams('elements'),
    durationMin: 10, hpAmount: 300, hpMode: 'perPlayer', surgeMax: 5, surgeCurve: 4,
    powerScale: 1, energyScale: 1, fallenCanAttack: true, sizeBoost: true, lastTeamEnds: false, teamPick: 'auto',
    lateJoin: true, wrongPenalty: 5, ptsCorrect: 10, ptsDamage: 1, survivalBonus: 300, koBonus: 200, koPenalty: 0, feedNames: true, demo: false, intro: 'auto',
    gamble: true, bounty: true, comeback: 10, supplyDrops: true, showdown: true, announcer: true
  };

  const saved = store.get(KEY, {}) || {};
  let cfg = { ...DEFAULTS, ...(saved.cfg || {}) };
  if (!Array.isArray(cfg.teams) || cfg.teams.length < 10) cfg.teams = themeTeams(cfg.theme);
  let conn = null, S = null, game = null, editing = false, sortKey = 'points', lastHp = {}, lastStatus = null, qrFor = '';
  // The question set this game is playing ('q:<id>' or 'f:<id>'), so Save changes knows when it changed.
  let playing = '';

  function keep(fn) { const s = store.get(KEY, {}) || {}; fn(s); store.set(KEY, s); }
  function persist() { keep((s) => { s.cfg = cfg; }); }
  function show(v) { VIEWS.forEach((x) => { $('#' + x).hidden = x !== v; }); }
  function status(text) { $('#sgStatus').textContent = text || ''; }

  function call(path, method, body) {
    const headers = { 'X-IS8-Editor': '1' };
    if (body) headers['content-type'] = 'application/json';
    return fetch('/api/' + path, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then((res) => res.json().catch(() => null).then((d) => {
        if (!res.ok || !d) throw new Error((d && d.error) || 'The site did not answer. Check the internet connection and try again.');
        return d;
      }));
  }

  /* ---------------- getting in ---------------- */

  function gate() {
    if (!ED) { $('#sgGateText').textContent = 'This page did not load properly. Reload it to try again.'; return; }
    ED.session().then((s) => {
      if (!s.cloud) $('#sgGateText').textContent = 'Saving to the site is not switched on, so games cannot run yet.';
      else if (!s.live) $('#sgGateText').textContent = 'Games need one more Cloudflare setting. The steps are in the README, steps 4 and 5.';
      else if (!s.editor) {
        if (ED.forgetHint) ED.forgetHint();
        $('#sgGateText').textContent = 'Only your teacher can host a game. Teacher: sign in with the teacher password.';
        ED.signInForm($('#sgSignIn'), () => { $('#sgSignIn').textContent = ''; setup(); });
      } else {
        if (ED.rememberHint) ED.rememberHint();
        setup();
      }
    });
  }

  /* ---------------- setup ---------------- */

  const yesNo = [[true, 'Yes'], [false, 'No']];
  const range = (arr, fmt) => arr.map((v) => [v, fmt(v)]);
  const times = (v) => '×' + v;
  const SETTINGS = [
    { g: 'game', k: 'durationMin', label: 'Game length', desc: 'How long the battle lasts. You can add or take away time during the game.', opts: range([3, 5, 8, 10, 12, 15, 20, 25, 30, 45], (v) => `${v} min`) },
    { g: 'game', k: 'intro', label: 'How-to-play slides', desc: 'Slides on this screen explain the game when you click Start. The clock waits until they finish. Skip any time.', opts: [['auto', 'Yes, they move on by themselves'], ['manual', 'Yes, I click Next'], ['off', 'No slides']] },
    { g: 'teams', k: 'teamCount', label: 'Number of teams', desc: 'Teams with no players sit out.', opts: range([2, 3, 4, 5, 6, 7, 8, 9, 10], String) },
    { g: 'teams', k: 'theme', label: 'Team theme', desc: 'Names, icons and colors for the teams.', opts: null },
    { g: 'teams', k: 'teamPick', label: 'How students join a team', desc: 'Even teams keeps the teams the same size.', opts: [['auto', 'Even teams'], ['choose', 'Students choose']] },
    { g: 'teams', k: 'lateJoin', label: 'Join after the game starts', desc: 'New students can jump in during the game. You can also open or lock joining during the game.', opts: yesNo },
    { g: 'battle', k: 'hpAmount', label: 'Team health', desc: 'Starting health. Teams fall when it reaches zero.', opts: range([100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000], String) },
    { g: 'battle', k: 'hpMode', label: 'Health is counted', desc: 'Per player gives bigger teams more health.', opts: [['perPlayer', 'Per player'], ['flat', 'Per team']] },
    { g: 'battle', k: 'wrongPenalty', label: 'Energy lost on a wrong answer', desc: 'Keeps students from guessing.', opts: range([0, 2, 5, 10, 15, 20, 25, 50], String) },
    { g: 'battle', k: 'powerScale', label: 'Power-up strength', desc: 'Bigger means faster, more dramatic battles.', opts: range([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3], times) },
    { g: 'battle', k: 'energyScale', label: 'Energy earned per answer', desc: 'How fast students can afford power-ups.', opts: range([0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3], times) },
    { g: 'battle', k: 'fallenCanAttack', label: 'Fallen teams can still attack', desc: 'Knocked out teams keep answering and attacking.', opts: yesNo },
    { g: 'battle', k: 'sizeBoost', label: 'Boost smaller teams', desc: 'Smaller teams get stronger power-ups to even things out. A team of 3 against a team of 4 gets power-ups 33% stronger.', opts: yesNo },
    { g: 'battle', k: 'lastTeamEnds', label: 'End when one team is left', desc: 'Otherwise the game runs until time is up.', opts: yesNo },
    { g: 'battle', k: 'feedNames', label: 'Show names in the battle feed', desc: 'No shows team names only.', opts: yesNo },
    { g: 'surge', k: 'surgeMax', label: 'Most surge at the end', desc: 'How much stronger power-ups are in the final second.', opts: range([1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15], times) },
    { g: 'surge', k: 'surgeCurve', label: 'Surge curve', desc: 'Steeper curves save the big jump for the last minutes.', opts: [[2, 'Gentle'], [4, 'Steep'], [7, 'Extreme']] },
    { g: 'scoring', k: 'ptsCorrect', label: 'Points per correct answer', desc: '', opts: range([0, 5, 10, 15, 20, 25, 50, 100], String) },
    { g: 'scoring', k: 'ptsDamage', label: 'Points per 1 damage dealt', desc: '', opts: range([0, 0.25, 0.5, 1, 2, 3, 5], String) },
    { g: 'scoring', k: 'survivalBonus', label: 'Survival bonus', desc: 'For each team still standing at the end.', opts: range([0, 100, 200, 300, 500, 750, 1000, 2000], String) },
    { g: 'scoring', k: 'koBonus', label: 'Knockout bonus', desc: 'For the team that lands the final blow.', opts: range([0, 100, 200, 300, 500, 750, 1000, 2000], String) },
    { g: 'scoring', k: 'koPenalty', label: 'Knockout penalty', desc: 'Points a team loses when it is knocked out. Its score can go below zero, and players can still earn points back.', opts: range([0, 100, 200, 300, 500, 750, 1000, 2000], (v) => v ? `-${v}` : 'None') },
    { g: 'events', k: 'gamble', label: '🎲 Double or Nothing', desc: 'In the shop: bet on your next question. Right gives your team health, wrong takes it away (it can never knock your own team out).', opts: yesNo },
    { g: 'events', k: 'bounty', label: '🎯 Bounty on the leader', desc: 'The team in 1st place gets a target on it. Hitting them earns bonus energy.', opts: yesNo },
    { g: 'events', k: 'comeback', label: '🔄 Comeback', desc: 'A fallen team that gets this many correct answers (wrong answers set them back 1) returns with 30% health. Once per team.', opts: [[0, 'Off'], [5, '5 correct'], [8, '8 correct'], [10, '10 correct'], [15, '15 correct'], [20, '20 correct']] },
    { g: 'events', k: 'supplyDrops', label: '📦 Supply drops', desc: 'Every 2 minutes a prize appears. The first team to reach a number of correct answers (about 2 and a half per player) wins a heal, a shield or energy.', opts: yesNo },
    { g: 'events', k: 'showdown', label: '⚔️ Final showdown', desc: 'In the last minute, the surge doubles and healing turns off. Games of 2 minutes or more.', opts: yesNo },
    { g: 'events', k: 'announcer', label: '📣 Announcer pop-ups', desc: 'Big pop-ups on this screen for streaks, attacks, knockouts, comebacks and drops.', opts: yesNo }
  ];
  const SPEC = Object.fromEntries(SETTINGS.map((x) => [x.k, x]));

  function optionsFor(spec) {
    if (spec.k === 'theme') return [...Object.entries(THEMES).map(([k, t]) => [k, t.label]), ['custom', 'Custom']];
    const opts = spec.opts.slice();
    const cur = cfg[spec.k];
    if (!opts.some(([v]) => String(v) === String(cur))) {
      opts.push([cur, String(cur)]);
      if (typeof cur === 'number') opts.sort((a, b) => a[0] - b[0]);
    }
    return opts;
  }
  function readVal(k, raw) {
    const d = DEFAULTS[k];
    if (typeof d === 'boolean') return raw === 'true';
    if (typeof d === 'number') return Number(raw);
    return raw;
  }

  function initSetup() {
    document.querySelectorAll('#sgSetup [data-group]').forEach((box) => {
      box.innerHTML = SETTINGS.filter((x) => x.g === box.dataset.group).map((x) => `
        <label class="lv-opt"><span><strong>${x.label}</strong>${x.desc ? `<span class="lv-opt-note">${x.desc}</span>` : ''}</span>
        <select data-k="${x.k}" aria-label="${esc(x.label.replace(/^\W+\s/, ''))}"></select></label>`).join('');
    });
    document.querySelectorAll('select[data-k]').forEach((sel) => sel.addEventListener('change', () => {
      const k = sel.dataset.k;
      if (k === 'theme') { if (sel.value !== 'custom') { cfg.theme = sel.value; cfg.teams = themeTeams(cfg.theme); } }
      else cfg[k] = readVal(k, sel.value);
      paintSetup();
    }));
    $('#sgDemo').addEventListener('change', (e) => { cfg.demo = e.target.checked; persist(); });
    $('#sgTitle').addEventListener('input', (e) => { cfg.title = e.target.value; persist(); });
    document.querySelectorAll('input[name="sgSource"]').forEach((r) => r.addEventListener('change', syncSource));
    $('#sgCreate').addEventListener('click', createOrSave);
    $('#sgCancelEdit').addEventListener('click', () => { editing = false; render(); });
    paintSetup();
  }
  function paintSetup() {
    $('#sgTitle').value = cfg.title;
    document.querySelectorAll('select[data-k]').forEach((sel) => {
      const spec = SPEC[sel.dataset.k];
      sel.innerHTML = optionsFor(spec).map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
      sel.value = spec.k === 'theme' ? (THEMES[cfg.theme] ? cfg.theme : 'custom') : String(cfg[spec.k]);
    });
    $('#sgDemo').checked = !!cfg.demo;
    const te = $('#sgTeamEdit');
    te.innerHTML = cfg.teams.map((t, i) => `
      <div class="te ${i >= cfg.teamCount ? 'off' : ''}" data-i="${i}">
        <input class="ic" type="text" value="${esc(t.icon)}" data-f="icon" maxlength="4" aria-label="Icon for team ${i + 1}">
        <input type="text" value="${esc(t.name)}" data-f="name" maxlength="20" aria-label="Name of team ${i + 1}">
        <input type="color" value="${esc(t.color)}" data-f="color" aria-label="Color of team ${i + 1}">
      </div>`).join('');
    te.oninput = (e) => {
      const row = e.target.closest('.te');
      if (!row) return;
      const i = +row.dataset.i, f = e.target.dataset.f;
      cfg.teams[i] = { ...cfg.teams[i], [f]: e.target.value };
      cfg.theme = 'custom';
      $('select[data-k="theme"]').value = 'custom';
      persist();
    };
    drawCurve();
    paintPowerInfo();
    persist();
  }
  function drawCurve() {
    const M = cfg.surgeMax, k = cfg.surgeCurve, W = 400, H = 120, pad = 10;
    const f = (p) => 1 + (M - 1) * (Math.exp(k * p) - 1) / (Math.exp(k) - 1);
    let d = '';
    for (let i = 0; i <= 80; i++) {
      const p = i / 80, y = H - pad - ((f(p) - 1) / Math.max(0.0001, M - 1)) * (H - pad * 2);
      d += (i ? 'L' : 'M') + (p * W).toFixed(1) + ',' + (M === 1 ? H - pad : y).toFixed(1);
    }
    $('#sgCurve').innerHTML = `
      <defs><linearGradient id="sgCurveG" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".6" stop-color="#facc15"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>
      <path d="${d} L${W},${H} L0,${H} Z" fill="url(#sgCurveG)" opacity=".18"/>
      <path d="${d}" fill="none" stroke="url(#sgCurveG)" stroke-width="4" vector-effect="non-scaling-stroke"/>
      <text x="${W - 6}" y="20" text-anchor="end" class="sg-curve-max" font-size="16" font-weight="700">×${M}</text>`;
    $('#sgCurveMid').textContent = `Halfway: ×${f(0.5).toFixed(1)} · 90%: ×${f(0.9).toFixed(1)}`;
  }
  function paintPowerInfo() {
    const sc = cfg.powerScale;
    const G = RULES.gamble;
    $('#sgPowerInfo').innerHTML = Object.values(RULES.powers).map((p) =>
      `${p.icon} <b>${p.name}</b> (${p.cost} energy): ${p.desc} Starts at <b>${Math.round(p.base * sc)}</b>, ends at <b>${Math.round(p.base * sc * cfg.surgeMax)}</b>.`
    ).join('<br>') + `<br><br>Upgrades: <b>Energy per Question</b> (10 to 160) and <b>Streak Bonus</b>. Fallen teams cannot heal or shield${cfg.fallenCanAttack ? ', but they can still attack' : ' and cannot attack'}.` +
      (cfg.gamble ? `<br>${G.icon} <b>${G.name}</b> (${G.cost} energy, once a minute): a right answer gives your team up to <b>${Math.round(G.base * sc)}</b> to <b>${Math.round(G.base * sc * cfg.surgeMax * (cfg.showdown ? 2 : 1))}</b> health, a wrong one takes the same amount.` : '') +
      (cfg.sizeBoost ? ' Smaller teams get a <b>size boost</b>: power-ups times (biggest team ÷ their team), so 3 players against 4 means 33% stronger.' : '');
  }

  /* ---------------- the questions: one of the site's sets ---------------- */

  let qsets = [], flashSets = [];
  function source() { const r = document.querySelector('input[name="sgSource"]:checked'); return r ? r.value : 'qset'; }
  function syncSource() {
    const q = source() === 'qset';
    $('#sgQsetRow').hidden = !q;
    $('#sgQsetNote').hidden = !q;
    $('#sgFlashRow').hidden = q;
    $('#sgFlashNote').hidden = q;
  }
  function loadSets(wantQ, wantF) {
    call('qsets').then((r) => {
      qsets = r.sets || [];
      const sel = $('#sgQset');
      sel.textContent = '';
      if (!qsets.length) sel.innerHTML = '<option value="">No question sets yet</option>';
      qsets.forEach((s) => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.title + ' (' + s.count + (s.count === 1 ? ' question)' : ' questions)');
        sel.appendChild(o);
      });
      if (wantQ && qsets.some((s) => s.id === wantQ)) sel.value = wantQ;
      $('#sgQsetNote').textContent = qsets.length ? '' : 'Make a question set on the Battle Royale page (Make or edit question sets). You can import a Wayground quiz or a Google Sheet there.';
    }, (err) => { $('#sgQsetNote').textContent = err.message; });
    call('sets').then((r) => {
      flashSets = (r.list || []).filter((s) => s && s.id);
      const sel = $('#sgFlash');
      sel.textContent = '';
      flashSets.forEach((s) => {
        const o = document.createElement('option');
        o.value = s.id;
        o.textContent = s.title + (s.count ? ' (' + s.count + ' terms)' : '');
        sel.appendChild(o);
      });
      if (wantF && flashSets.some((s) => s.id === wantF)) sel.value = wantF;
    }, () => { /* only needed for that choice */ });
  }
  function picked() { return source() === 'qset' ? 'q:' + $('#sgQset').value : 'f:' + $('#sgFlash').value; }
  // The questions of the set picked now, the way a question set keeps them,
  // for changing the set of a game already made.
  function pickedQuestions() {
    const p = picked();
    if (p.startsWith('q:')) return call('qsets/' + encodeURIComponent(p.slice(2))).then((s) => ({ title: s.title, setId: '', questions: s.questions }));
    const id = p.slice(2);
    return call('sets/' + encodeURIComponent(id)).then((s) => {
      const cards = (s.cards || []).filter((c) => c.term && c.def);
      const terms = [...new Set(cards.map((c) => c.term))];
      const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const questions = cards.map((c) => {
        const w = shuffle(terms.filter((t) => t.toLowerCase() !== c.term.toLowerCase())).slice(0, 3);
        const img = String(c.img || '').replace(/^(\.\.\/)+assets\//, '/assets/');
        return { q: c.def, a: c.term, w, img: /^\//.test(img) ? img : '' };
      }).filter((q) => q.w.length);
      return { title: s.title, setId: id, questions };
    });
  }

  function whoPicked() { const r = document.querySelector('input[name="sgWho"]:checked'); return r && r.value === 'guests' ? 'guests' : 'pass'; }

  function setup() {
    show('sgSetup');
    const s = store.get(KEY, {}) || {};
    const hash = location.hash;
    const wantQ = (hash.match(/[#&]qset=([\w-]+)/) || [])[1] || s.qset;
    const wantF = (hash.match(/[#&]set=([\w-]+)/) || [])[1] || s.flash;
    if (/[#&]qset=/.test(hash)) document.querySelector('input[name="sgSource"][value="qset"]').checked = true;
    else if (/[#&]set=/.test(hash)) document.querySelector('input[name="sgSource"][value="flash"]').checked = true;
    else if (s.source === 'flash') document.querySelector('input[name="sgSource"][value="flash"]').checked = true;
    if (s.who === 'guests') document.querySelector('input[name="sgWho"][value="guests"]').checked = true;
    syncSource();
    loadSets(wantQ, wantF);
    if (window.IS8Roster) window.IS8Roster.fillPeriods($('#sgPeriod'), window.IS8Roster.last());
    // The game this computer was hosting, if it may still be running.
    if (s.host && Date.now() - s.host.at < 3 * 60 * 60 * 1000) {
      $('#sgResumeText').textContent = 'Your game ' + s.host.code + ' may still be running.';
      $('#sgResume').hidden = false;
    }
    render();
  }

  function settingsPayload() { return { ...cfg, teams: cfg.teams }; }

  function createOrSave() {
    $('#sgSetupError').textContent = '';
    const p = picked();
    if (p === 'q:' || p === 'f:') { $('#sgSetupError').textContent = source() === 'qset' ? 'Pick a question set (or make one on the Battle Royale page).' : 'Pick a flashcard set.'; return; }
    keep((s) => { s.source = source(); s.qset = $('#sgQset').value; s.flash = $('#sgFlash').value; s.who = whoPicked(); });
    if (window.IS8Roster) window.IS8Roster.remember($('#sgPeriod').value);
    if (editing && game && conn) {
      conn.send({ t: 'settings', settings: settingsPayload() });
      if (whoPicked() !== S.who) conn.send({ t: 'who', who: whoPicked() });
      if ($('#sgPeriod').value !== (S.period || '')) conn.send({ t: 'period', period: $('#sgPeriod').value });
      const done = () => { editing = false; toast('Settings saved', 'good'); render(); };
      if (p !== playing) {
        pickedQuestions().then((q) => {
          if (!q.questions.length) throw new Error('That set has no questions this game can use.');
          conn.send({ t: 'questions', questions: q.questions, title: q.title, setId: q.setId });
          playing = p;
          keep((s) => { if (s.host) s.host.playing = p; });
          done();
        }).catch((err) => { $('#sgSetupError').textContent = err.message; });
      } else done();
      return;
    }
    const btn = $('#sgCreate');
    btn.disabled = true;
    btn.textContent = 'Making the game...';
    const body = { kind: 'surge', opts: { who: whoPicked(), period: $('#sgPeriod').value, settings: settingsPayload(), demo: !!cfg.demo } };
    if (p.startsWith('q:')) body.qsetId = p.slice(2); else body.setId = p.slice(2);
    call('live/create', 'POST', body).then((r) => {
      game = { code: r.code, key: r.hostKey };
      playing = p;
      keep((s) => { s.host = { code: r.code, key: r.hostKey, at: Date.now(), playing: p }; });
      $('#sgResume').hidden = true;
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      startConn();
    }, (err) => { $('#sgSetupError').textContent = err.message; }).then(() => {
      btn.disabled = false;
      btn.textContent = editing ? 'Save changes' : 'Create game';
    });
  }
  $('#sgResumeBtn').addEventListener('click', () => {
    const h = (store.get(KEY, {}) || {}).host;
    if (!h) return;
    game = { code: h.code, key: h.key };
    playing = h.playing || '';
    $('#sgResume').hidden = true;
    startConn();
  });

  /* ---------------- the connection ---------------- */

  function startConn() {
    if (conn) conn.close();
    status('Connecting...');
    conn = connect(() => '/api/live/' + game.code + '/ws?host=' + encodeURIComponent(game.key), {
      onMessage,
      queue: true,
      onStatus: (st) => { status(st === 'online' ? '' : st === 'offline' ? 'Lost the connection. Trying again... The game keeps running.' : ''); }
    });
  }
  function onMessage(m) {
    if (m.t === 'hello' || m.t === 'state') {
      S = m.state;
      keep((s) => { if (s.host && game && s.host.code === game.code) s.host.at = Date.now(); });
      render();
    } else if (m.t === 'toast') toast(m.msg, 'good');
    else if (m.t === 'error' && !m.code) toast(m.msg, 'bad');
    else if (m.t === 'over' || m.t === 'error') {
      // The game closed (or this screen is no longer its host).
      newGame();
      if (m.msg) toast(m.msg);
    }
  }
  function newGame() {
    if (conn) conn.close();
    conn = null; S = null; game = null; editing = false; playing = '';
    keep((s) => { delete s.host; });
    $('#sgResume').hidden = true;
    render();
  }

  /* ---------------- demo mode: one student's screen beside the board ---------------- */

  let watch = { code: null, pid: null, hidden: false };
  function renderWatch() {
    const on = !!(S && S.settings.demo && !editing);
    document.body.classList.toggle('sg-split', on && !watch.hidden);
    $('#sgWatch').classList.toggle('hidden', !on || watch.hidden);
    $('#sgWpShow').classList.toggle('hidden', !on || !watch.hidden);
    if (!on) return;
    const gone = watch.pid && !S.players.some((p) => p.id === watch.pid);
    if (watch.code !== S.code || (gone && S.status !== 'ended')) {
      watch = { code: S.code, pid: null, hidden: watch.hidden };
      store.del('is8-surge-w-' + S.code);
      $('#sgWpFrame').src = 'play/?embed=1#' + S.code;
    }
    const me = S.players.find((p) => p.id === watch.pid);
    if (me) { const t = S.teams[me.team]; $('#sgWpWho').textContent = `${me.name} · ${t ? t.icon + ' ' + t.name : ''} · ${me.points} pts`; }
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || !e.data.surgeWatch || !S || e.data.code !== S.code) return;
    watch.pid = e.data.pid;
    conn.send({ t: 'autopilot', pid: watch.pid, on: $('#sgWpAuto').value === 'true' });
  });
  $('#sgWpAuto').onchange = () => { if (watch.pid) conn.send({ t: 'autopilot', pid: watch.pid, on: $('#sgWpAuto').value === 'true' }); };
  $('#sgWpHide').onclick = () => { watch.hidden = true; renderWatch(); };
  $('#sgWpShow').onclick = () => { watch.hidden = false; renderWatch(); };

  /* ---------------- drawing the board ---------------- */

  function joinLink() { return location.origin + '/join/#' + S.code; }
  function render() {
    renderWatch();
    if (!S || editing) {
      if (!$('#sgGate').hidden && !ED) return;
      if ($('#sgGate').hidden || S) show('sgSetup');
      $('#sgCreate').textContent = editing ? 'Save changes' : 'Create game';
      $('#sgCancelEdit').hidden = !editing;
      $('#sgSetupTitle').textContent = editing ? 'Change this game' : 'Surge Showdown';
      return;
    }
    $('#sgBrand').textContent = S.settings.title;
    $('#sgPaused').classList.toggle('hidden', S.status !== 'paused');
    const url = location.host + '/join';
    paintJoinBits(url);
    if (S.status === 'ended') $('#sgJoinModal').classList.add('hidden');
    if (S.status === 'lobby') { show('sgLobby'); renderLobby(url); }
    else if (S.status === 'running' || S.status === 'paused') { show('sgLive'); renderLive(url); queueCallouts(); }
    else if (S.status === 'ended') { show('sgResults'); renderResults(lastStatus !== 'ended'); }
    lastStatus = S.status;
  }
  function teamOptions(sel, onlyActive) {
    return S.teams.filter((t) => !onlyActive || t.active).map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.icon)} ${esc(t.name)}</option>`).join('');
  }
  function tags(p) {
    return p.bot ? '<span class="bot-tag" title="Pretend student">🎭</span>'
      : p.watch ? '<span class="bot-tag" title="Your player view">👀</span>'
        : p.pass ? '<span class="sg-pass-tick" title="Signed in with Class Pass">✓</span>'
          : p.guest ? '<span class="sg-guest-tag">Guest</span>' : '';
  }
  const pickingMove = () => document.activeElement && document.activeElement.matches && document.activeElement.matches('select[data-move]');
  function renderLobby(url) {
    $('#sgJoinUrl').textContent = url;
    $('#sgJoinCode').textContent = S.code;
    $('#sgCount').textContent = S.players.length + (S.players.length === 1 ? ' player' : ' players');
    $('#sgStart').disabled = S.players.length === 0;
    $('#sgDemoLobby').textContent = S.settings.demo ? '🎭 Take out pretend students' : '🎭 Add 40 pretend students';
    $('#sgRemovedLobby').innerHTML = removedHTML();
    if (qrFor !== S.code && window.qrcode) {
      try {
        const qr = window.qrcode(0, 'M');
        qr.addData(joinLink());
        qr.make();
        $('#sgQr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        qrFor = S.code;
      } catch { $('#sgQr').hidden = true; }
    }
    drawRoll();
    if (pickingMove()) return;
    $('#sgLobbyTeams').innerHTML = S.teams.map((t) => {
      const ps = S.players.filter((p) => p.team === t.id);
      return `<div class="tcol" style="--tc:${t.color}">
        <div class="th"><span>${esc(t.icon)}</span>${esc(t.name)}${boostTag(t)}<span class="n">${ps.length}</span></div>
        <ul>${ps.map((p) => `<li><span class="${p.online ? '' : 'off'}">${esc(p.name)}${tags(p)}</span>
          <select data-move="${p.id}" title="Move to another team" aria-label="Move ${esc(p.name)} to another team">${teamOptions(t.id)}</select>
          <button type="button" class="xbtn" data-kick="${p.id}" title="Remove ${esc(p.name)}" aria-label="Remove ${esc(p.name)}">✕</button></li>`).join('') || '<li class="muted">Waiting...</li>'}</ul>
      </div>`;
    }).join('');
  }
  // Who can join, the class period, and the period's class list (who has
  // joined and who has not), the same as the other games' lobbies.
  let rollPeriods = false;
  function drawRoll() {
    if (document.activeElement !== $('#sgLobbyWho')) $('#sgLobbyWho').value = S.who || 'pass';
    const sel = $('#sgLobbyPeriod');
    if (!window.IS8Roster) return;
    if (!rollPeriods) { rollPeriods = true; window.IS8Roster.fillPeriods(sel, S.period || ''); }
    else if (document.activeElement !== sel && sel.value !== (S.period || '') && [].some.call(sel.options, (x) => x.value === (S.period || ''))) sel.value = S.period || '';
    // The teacher's own player view (demo mode) is not a student.
    window.IS8Roster.draw($('#sgRoll'), S.period || '', S.players.filter((p) => !p.watch));
  }
  $('#sgLobbyWho').addEventListener('change', function () { if (conn) conn.send({ t: 'who', who: this.value }); });
  $('#sgLobbyPeriod').addEventListener('change', function () {
    if (window.IS8Roster) window.IS8Roster.remember(this.value);
    if (conn) conn.send({ t: 'period', period: this.value });
  });
  function boostTag(t) {
    const bp = Math.round(((t.boost || 1) - 1) * 100);
    return bp > 0 ? `<span class="boost-tag" title="Smaller team: power-ups are ${bp}% stronger">💪 +${bp}%</span>` : '';
  }
  function removedHTML() {
    const r = S.removed || [];
    if (!r.length) return '';
    return `<div class="removed"><div class="lbl">Removed students (${r.length})</div>${r.map((p) => `<div class="rm"><span>${esc(p.name)}</span><button type="button" class="sbtn sm ghost" data-readmit="${p.id}">Let back in</button></div>`).join('')}</div>`;
  }
  function paintJoinBits(url) {
    $('#sgJmUrl').textContent = url;
    $('#sgJmCode').textContent = S.code;
    ['#sgLateJoinLive', '#sgLateJoinModal'].forEach((id) => { if (document.activeElement !== $(id)) $(id).value = String(!!S.settings.lateJoin); });
    if (document.activeElement !== $('#sgDemoLive')) $('#sgDemoLive').value = String(!!S.settings.demo);
    $('#sgJmNote').textContent = S.settings.lateJoin
      ? (S.status === 'lobby' ? 'Students join a team right away.' : 'New students go to the smallest team that is still standing, and that team gets extra health for them.')
      : 'Joining is locked. Students who were already in the game can still come back.';
  }
  function renderLive(url) {
    $('#sgLiveCode').textContent = S.code;
    $('#sgLiveUrl').textContent = url;
    $('#sgRemovedLive').innerHTML = removedHTML();
    $('#sgPause').textContent = S.status === 'paused' ? '▶ Resume' : '⏸ Pause';
    renderDrop();
    const ranked = S.teams.filter((t) => t.active).slice().sort((a, b) => b.score - a.score);
    const rankOf = Object.fromEntries(ranked.map((t, i) => [t.id, i + 1]));
    $('#sgBattle').innerHTML = S.teams.filter((t) => t.active).map((t) => {
      const wasHit = lastHp[t.id] != null && t.hp + t.shield < lastHp[t.id];
      lastHp[t.id] = t.hp + t.shield;
      return `<div class="tcard ${t.alive ? '' : 'dead'} ${wasHit ? 'hit' : ''}" style="--tc:${t.color}">
        ${t.alive ? '' : '<div class="fallen-tag">FALLEN</div>'}
        ${S.bounty === t.id ? '<div class="bounty-tag" title="Hit this team for bonus energy">🎯 BOUNTY</div>' : ''}
        <div class="tc-top"><div class="tc-icon">${esc(t.icon)}</div><div><div class="tc-name">${esc(t.name)}</div><div class="muted sg-small sg-strong">#${rankOf[t.id]} · ${t.size} player${t.size === 1 ? '' : 's'}${boostTag(t)}</div></div>
          <div class="tc-score ${t.score < 0 ? 'neg' : ''}">${t.score.toLocaleString()}<small>points</small></div></div>
        <div class="tc-hp">${hpBar(t)}</div>
        <div class="tc-meta"><span>❤️ ${t.hp} / ${t.maxHp}${t.shield ? ` · 🛡️ ${t.shield}` : ''}</span><span>${t.revived ? '🔄 ' : ''}${t.kos ? `💀×${t.kos}` : ''}</span></div>
        ${!t.alive && S.settings.comeback > 0 && !t.revived ? `<div class="tc-comeback"><span>🔄 Comeback ${t.revive || 0} / ${S.settings.comeback}</span><div class="cb-bar"><i style="width:${Math.min(100, ((t.revive || 0) / S.settings.comeback) * 100)}%"></i></div></div>` : ''}
        <div class="tc-players">${S.players.filter((p) => p.team === t.id).sort((a, b) => b.points - a.points).map((p) =>
          `<span class="tc-p ${p.online ? '' : 'off'}" title="${esc(p.name)}: ${p.points} pts">${esc(p.name)}<b>${Math.round(p.points)}</b></span>`).join('') || '<span class="muted">No players</span>'}</div>
      </div>`;
    }).join('');
    $('#sgFeed').innerHTML = S.feed.slice().reverse().map((e) => `<div class="ev ${esc(e.kind)}">${esc(e.text)}</div>`).join('');
    renderPlayers();
  }
  function renderDrop() {
    const d = S.drop, box = $('#sgDropBox');
    box.classList.toggle('hidden', !d);
    if (!d) return;
    const label = { heal: '❤️ Big heal', shield: '🛡️ Mega shield', energy: '⚡ Energy for the whole team' }[d.prize];
    const teams = S.teams.filter((t) => t.active).map((t) => ({ t, n: d.prog[t.id] || 0 })).sort((a, b) => b.n - a.n);
    box.innerHTML = `<div class="db-head"><span class="db-ic">📦</span><div><b>SUPPLY DROP!</b> First team to <b>${d.need} correct answers</b> wins <b>${label}</b></div><span class="db-left" id="sgDropLeft"></span></div>
      <div class="db-teams">${teams.map(({ t, n }) => `<div class="db-t" style="--tc:${t.color}"><span>${esc(t.icon)} ${esc(t.name)}</span><div class="cb-bar"><i style="width:${(n / d.need) * 100}%"></i></div><b>${n}/${d.need}</b></div>`).join('')}</div>`;
  }
  // The announcer's pop-ups (this screen only).
  let seenCalls = null, callQ = [], callBusy = false;
  function queueCallouts() {
    const calls = S.calls || [];
    if (seenCalls == null) { seenCalls = new Set(calls.map((c) => c.id)); return; }
    for (const c of calls) {
      if (seenCalls.has(c.id)) continue;
      seenCalls.add(c.id);
      if (cfg.announcer !== false && S.status === 'running' && Date.now() + ((conn && conn.offset) || 0) - c.at < 12000) callQ.push(c);
    }
    if (callQ.length > 4) callQ = callQ.filter((c) => ['showdown', 'ko', 'comeback', 'drop'].includes(c.kind)).slice(-3).concat(callQ.slice(-1));
    showNextCall();
  }
  function showNextCall() {
    if (callBusy) return;
    const now = Date.now() + ((conn && conn.offset) || 0);
    while (callQ.length && now - callQ[0].at > 7000 && callQ[0].kind !== 'showdown') callQ.shift();
    if (!callQ.length) return;
    const c = callQ.shift();
    callBusy = true;
    const el = document.createElement('div');
    el.className = `callout c-${c.kind}`;
    el.textContent = c.text;
    $('#sgCallouts').appendChild(el);
    const ms = c.kind === 'showdown' ? 3600 : 2600;
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); callBusy = false; showNextCall(); }, 350); }, ms);
  }
  function renderPlayers() {
    if (pickingMove()) return;
    const cols = [['name', 'Player'], ['team', 'Team'], ['correct', '✓'], ['wrong', '✗'], ['acc', 'Right'], ['energy', '⚡'], ['dmg', 'Damage'], ['points', 'Points']];
    const ps = S.players.map((p) => ({ ...p, acc: p.correct + p.wrong ? Math.round((p.correct / (p.correct + p.wrong)) * 100) : 0 }));
    ps.sort((a, b) => (sortKey === 'name' ? a.name.localeCompare(b.name) : sortKey === 'team' ? a.team - b.team : (b[sortKey] ?? 0) - (a[sortKey] ?? 0)));
    $('#sgPtable').innerHTML = `<thead><tr>${cols.map(([k, l]) => `<th data-sort="${k}" scope="col"${k === 'name' || k === 'team' ? '' : ' class="num"'}>${sortKey === k ? '▾ ' : ''}${l}</th>`).join('')}<th><span class="sg-sr">Remove</span></th></tr></thead><tbody>` +
      ps.map((p) => `<tr>
        <td><span class="${p.online ? '' : 'off'}">${esc(p.name)}</span>${tags(p)}</td>
        <td><select data-move="${p.id}" aria-label="Team for ${esc(p.name)}">${teamOptions(p.team, true)}</select></td>
        <td class="num">${p.correct}</td><td class="num">${p.wrong}</td><td class="num">${p.acc}%</td><td class="num">${p.energy}</td><td class="num">${p.dmg}</td><td class="num"><b>${p.points}</b></td>
        <td><button type="button" class="xbtn" data-kick="${p.id}" title="Remove ${esc(p.name)}" aria-label="Remove ${esc(p.name)}">✕</button></td></tr>`).join('') + '</tbody>';
  }
  const AWARDS = [['mvp', '🌟', 'MVP (most points)'], ['damage', '💥', 'Most damage'], ['correct', '🧠', 'Most correct'], ['streak', '🔥', 'Longest streak'], ['healer', '💚', 'Top healer']];
  function renderResults(fresh) {
    const R = S.results;
    if (!R) return;
    const reasons = { time: 'Time ran out!', host: 'The teacher ended the game.', allFallen: 'Every team fell!', lastTeam: 'Only one team was left standing!' };
    $('#sgEndReason').textContent = (reasons[S.endReason] || '') + (S.counts && !S.settings.demo ? ' Class Pass students\' wins go on the class leaderboard.' : '');
    $('#sgPodium').innerHTML = podiumHTML(R);
    $('#sgAwards').innerHTML = AWARDS.map(([k, ic, label]) => {
      const a = R.awards[k];
      if (!a) return '';
      const t = S.teams[a.team];
      return `<div class="award"><div class="a-ic">${ic}</div><div class="a-t">${label}</div><div class="a-n">${esc(a.name)}</div><div class="muted">${esc((t && t.icon) || '')} ${esc((t && t.name) || '')} · ${a.value.toLocaleString()}</div></div>`;
    }).join('');
    $('#sgRankList').innerHTML = R.ranked.map((t) => `<div class="rank-row" style="--tc:${t.color}"><span class="r">${t.rank}</span><span class="rank-ic">${esc(t.icon)}</span><b>${esc(t.name)}</b>
      <span class="muted">${t.alive ? 'Survived ❤️ ' + t.hp : 'Fallen 💀'}${t.kos ? ` · ${t.kos} KO` : ''}</span><span class="s">${t.score.toLocaleString()} pts</span></div>`).join('');
    if (fresh) setTimeout(confetti, 1300);
  }

  // The clock and the surge meter, between updates.
  setInterval(() => {
    if (!S || !conn || (S.status !== 'running' && S.status !== 'paused')) { document.body.classList.remove('sg-showdown'); return; }
    const tm = timing(S, conn.offset);
    $('#sgTimer').textContent = fmtTime(tm.remaining);
    $('#sgTimer').classList.toggle('low', tm.remaining < 30000 && S.status === 'running');
    $('#sgSurgeX').textContent = '×' + tm.surge.toFixed(1);
    $('#sgSurgeX').style.setProperty('--glow', Math.min(1, (tm.surge - 1) / Math.max(1, S.settings.surgeMax - 1)));
    $('#sgSurgeFill').style.width = Math.min(100, S.settings.surgeMax > 1 ? ((tm.surge - 1) / (S.settings.surgeMax - 1)) * 100 : tm.showdown ? 100 : 0) + '%';
    document.body.classList.toggle('sg-showdown', tm.showdown);
    $('#sgShowdownBar').classList.toggle('hidden', !tm.showdown);
    if (S.drop && $('#sgDropLeft')) $('#sgDropLeft').textContent = fmtTime(Math.max(0, S.drop.ends - tm.elapsed)) + ' left';
  }, 250);

  /* ---------------- buttons ---------------- */

  document.addEventListener('click', (e) => {
    if (!S || !conn) return;
    const k = e.target.closest('[data-kick]');
    if (k) {
      const p = S.players.find((x) => x.id === k.dataset.kick);
      if (p && (p.bot || confirm(`Remove ${p.name} from the game? You can let them back in later.`))) conn.send({ t: 'kick', pid: p.id });
      return;
    }
    const ra = e.target.closest('[data-readmit]');
    if (ra) { conn.send({ t: 'readmit', pid: ra.dataset.readmit }); return; }
    const th = e.target.closest('th[data-sort]');
    if (th) { sortKey = th.dataset.sort; renderPlayers(); return; }
    const cl = e.target.closest('[data-copylink]');
    if (cl) copyJoinLink(cl);
  });
  function copyJoinLink(btn) {
    const link = joinLink();
    const done = (ok) => {
      if (!ok) { prompt('Copy this link and share it with students:', link); return; }
      toast('Join link copied. Paste it in Google Classroom.', 'good');
      btn.dataset.label = btn.dataset.label || btn.textContent;
      btn.textContent = '✓ Copied!';
      clearTimeout(btn.sgT);
      btn.sgT = setTimeout(() => { btn.textContent = btn.dataset.label; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => done(true), () => done(false));
    else done(false);
  }
  document.addEventListener('change', (e) => {
    const m = e.target.closest && e.target.closest('select[data-move]');
    if (m && conn) conn.send({ t: 'move', pid: m.dataset.move, team: Number(m.value) });
  });
  $('#sgStart').onclick = () => {
    const go = () => { if (S && S.status === 'lobby') conn.send({ t: 'start' }); };
    if (cfg.intro === 'off') go(); else window.SGIntro.play(S, null, cfg.intro, go);
  };
  $('#sgIntroBtn').onclick = () => window.SGIntro.play(S, null, cfg.intro === 'off' ? 'auto' : cfg.intro);
  $('#sgPause').onclick = () => conn.send({ t: S.status === 'paused' ? 'resume' : 'pause' });
  $('#sgPlus').onclick = () => conn.send({ t: 'addTime', sec: 60 });
  $('#sgMinus').onclick = () => conn.send({ t: 'addTime', sec: -60 });
  $('#sgEnd').onclick = () => { if (confirm('End the game now and show the podium?')) conn.send({ t: 'end' }); };
  $('#sgRematch').onclick = () => conn.send({ t: 'rematch' });
  $('#sgNew').onclick = () => {
    if (!confirm('Start a brand-new game? Students will need the new code.')) return;
    if (conn) conn.send({ t: 'close' });
    newGame();
  };
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('End this game for everyone? Students will see that it is over.')) return;
    if (conn) conn.send({ t: 'close' });
    newGame();
  }));
  $('#sgEditBtn').onclick = () => {
    cfg = { ...cfg, ...S.settings };
    editing = true;
    if (playing.startsWith('q:')) { document.querySelector('input[name="sgSource"][value="qset"]').checked = true; $('#sgQset').value = playing.slice(2); }
    else if (playing.startsWith('f:')) { document.querySelector('input[name="sgSource"][value="flash"]').checked = true; $('#sgFlash').value = playing.slice(2); }
    document.querySelector(`input[name="sgWho"][value="${S.who === 'guests' ? 'guests' : 'pass'}"]`).checked = true;
    if ([].some.call($('#sgPeriod').options, (o) => o.value === (S.period || ''))) $('#sgPeriod').value = S.period || '';
    syncSource();
    paintSetup();
    render();
    window.scrollTo(0, 0);
  };
  $('#sgShuffle').onclick = () => conn.send({ t: 'shuffle' });
  $('#sgDemoLobby').onclick = () => conn.send({ t: 'demo', on: !S.settings.demo });
  const openJoin = () => $('#sgJoinModal').classList.remove('hidden');
  $('#sgAddBtn').onclick = openJoin;
  $('#sgAddBtn2').onclick = openJoin;
  $('#sgJmClose').onclick = () => $('#sgJoinModal').classList.add('hidden');
  $('#sgJoinModal').onclick = (e) => { if (e.target.id === 'sgJoinModal') $('#sgJoinModal').classList.add('hidden'); };
  ['#sgLateJoinLive', '#sgLateJoinModal'].forEach((id) => { $(id).onchange = (e) => conn.send({ t: 'lateJoin', on: e.target.value === 'true' }); });
  $('#sgDemoLive').onchange = (e) => conn.send({ t: 'demo', on: e.target.value === 'true' });
  // Full screen, for projecting.
  document.querySelectorAll('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }));

  // For the music (surge-music.js) and the player view in demo mode.
  window.SGHost = { state: () => S, editing: () => editing, key: () => (game ? game.key : '') };

  initSetup();
  gate();
})();
