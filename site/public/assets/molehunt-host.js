/* ============================================================
   Mole Hunt: the teacher's screen (molehunt/), Donny 2026-11-15.

   1. Setup (A): the question set and every choice from the mockups.
   2. The lobby: the join code and QR code, students pick heroes.
   3. The projector: Moles left, meetings, scans, the Clear list, the Lab log,
      Lab Power, rumors, lab alarms, the story, Lab Meetings and the reveal,
      and the control bar along the bottom (B). It is never sent who the
      Moles are; the Teacher Remote on a phone is (molehunt/remote/, C).
   4. The end: who won, the Moles, the Case File, awards and the report (D),
      which opens in Google Sheets.
   The game runs on the game server (game-server/src/molehunt.js).
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var M = window.MH;
  var mk = M.mk;
  var ED = window.IS8Editor;
  var STEPS = ['mhGate', 'mhSetup', 'mhLobby', 'mhPlay', 'mhDone'];
  var SAVE_KEY = 'is8-molehunt-v1';
  var ws = null, game = null, board = null, leaving = false, retries = 0, pingTimer = null, qrFor = '', skew = null;

  function show(id) {
    STEPS.forEach(function (s) { $(s).hidden = s !== id; });
    document.body.setAttribute('data-mh-step', id);
    // The projector (Donny, 2026-11-19: "the bottom gets cut off and the sides
    // of the screen are not used"): during the game the board fills the whole
    // window and everything grows with it. The music buttons ride along in its
    // top bar.
    var playing = id === 'mhPlay';
    document.documentElement.classList.toggle('mh-projecting', playing);
    var mu = $('mhMusic'), spot = playing ? $('mhBarRight') : $('mhMusicHome');
    if (mu && spot && mu.parentNode !== spot) spot.appendChild(mu);
  }
  function status(text) { $('mhStatus').textContent = text || ''; }
  function toast(text) {
    var t = $('mhToast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }
  function readSaved() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
  function writeSaved(v) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (e) { /* private window */ } }
  function keep(fn) { var s = readSaved(); fn(s); writeSaved(s); }
  function call(path, method, body) {
    var headers = { 'X-IS8-Editor': '1' };
    if (body) headers['content-type'] = 'application/json';
    return fetch('/api/' + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (d) {
          if (!res.ok || !d) throw new Error((d && d.error) || 'The site did not answer. Check the internet connection and try again.');
          return d;
        });
      });
  }
  // A button that needs a second click to be sure.
  function twice(btn, ask, go) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.dataset.label && (btn.innerHTML = btn.dataset.label); go(); return; }
      btn.dataset.label = btn.innerHTML;
      btn.classList.add('armed');
      btn.textContent = ask;
      setTimeout(function () { if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.innerHTML = btn.dataset.label; } }, 3500);
    });
  }
  function ago(ms) { return M.clock(ms); }

  /* ---------------- getting in ---------------- */

  function gate() {
    if (!ED) { $('mhGateText').textContent = 'This page did not load properly. Reload it to try again.'; return; }
    ED.session().then(function (s) {
      if (!s.cloud) $('mhGateText').textContent = 'Saving to the site is not switched on, so games cannot run yet.';
      else if (!s.live) $('mhGateText').textContent = 'Games need one more Cloudflare setting. The steps are in the README, steps 4 and 5.';
      else if (!s.editor) {
        ED.forgetHint();
        $('mhGateText').textContent = 'Only your teacher can host a game. Teacher: sign in with the teacher password.';
        ED.signInForm($('mhSignIn'), function () { $('mhSignIn').textContent = ''; setup(); });
      } else {
        ED.rememberHint();
        setup();
      }
    });
  }

  /* ---------------- setup (A) ---------------- */

  var SELECTS = ['mhMoles', 'mhMeetings', 'mhTalk', 'mhVote', 'mhLimit', 'mhScans', 'mhReliable', 'mhPrices', 'mhRumorEvery'];
  var TOOL_KEYS = ['scan', 'public', 'peek', 'studentMeetings', 'fake', 'cut', 'smudge', 'disguise'];
  var EXTRA_KEYS = ['power', 'emergencies', 'missions', 'roles', 'ghosts', 'rumors', 'second'];
  var JOB_KEYS = ['detective', 'medic', 'tech', 'hacker'];
  var CHECKS = ['mhShowVoters', 'mhClaims', 'mhWrongCost', 'mhShowAnswer', 'mhJoinLate', 'mhSlow']
    .concat(TOOL_KEYS.map(function (k) { return 'mhT-' + k; }), EXTRA_KEYS.map(function (k) { return 'mhX-' + k; }), JOB_KEYS.map(function (k) { return 'mhJ-' + k; }));

  function source() { var r = document.querySelector('input[name="mhSource"]:checked'); return r ? r.value : 'qset'; }
  function syncSource() {
    var q = source() === 'qset';
    $('mhQsetRow').hidden = !q;
    $('mhFlashRow').hidden = q;
    $('mhSourceNote').textContent = q ? 'Question sets are shared with Battle Royale and Surge Showdown.' : 'Students see each definition and pick its term. The wrong answers are other terms from the set.';
  }
  document.querySelectorAll('input[name="mhSource"]').forEach(function (r) { r.addEventListener('change', syncSource); });
  function syncSubs() {
    $('mhRolesSub').hidden = !$('mhX-roles').checked;
    $('mhRumorSub').hidden = !$('mhX-rumors').checked;
  }
  $('mhX-roles').addEventListener('change', syncSubs);
  $('mhX-rumors').addEventListener('change', syncSubs);

  function setup() {
    show('mhSetup');
    musicFor('');
    var saved = readSaved();
    var d = saved.defaults;
    if (d) {
      SELECTS.forEach(function (id) { if (d[id] != null && [].some.call($(id).options, function (o) { return o.value === String(d[id]); })) $(id).value = String(d[id]); });
      CHECKS.forEach(function (id) { if (typeof d[id] === 'boolean') $(id).checked = d[id]; });
      if (d.source) document.querySelector('input[name="mhSource"][value="' + d.source + '"]').checked = true;
      if (d.who === 'guests') document.querySelector('input[name="mhWho"][value="guests"]').checked = true;
    }
    if (window.IS8Roster) window.IS8Roster.fillPeriods($('mhPeriod'), window.IS8Roster.last());
    $('mhSaveDefault').checked = !!d;
    var hash = location.hash;
    var wantQ = (hash.match(/[#&]qset=([\w-]+)/) || [])[1] || (d && d.qset);
    var wantF = (hash.match(/[#&]set=([\w-]+)/) || [])[1] || (d && d.flash);
    if (/[#&]qset=/.test(hash)) document.querySelector('input[name="mhSource"][value="qset"]').checked = true;
    if (/[#&]set=/.test(hash)) document.querySelector('input[name="mhSource"][value="flash"]').checked = true;
    syncSource();
    syncSubs();
    if (saved.host && Date.now() - saved.host.at < 6 * 60 * 1000) {
      $('mhResumeText').textContent = 'Your game ' + saved.host.code + ' may still be running.';
      $('mhResume').hidden = false;
    }
    call('qsets').then(function (r) {
      var sets = r.sets || [];
      var sel = $('mhQset');
      sel.textContent = '';
      if (!sets.length) { var none = mk('option', '', 'No question sets yet'); none.value = ''; sel.appendChild(none); }
      sets.forEach(function (s) { var o = mk('option', '', s.title + ' (' + M.plural(s.count, 'question') + ')'); o.value = s.id; sel.appendChild(o); });
      if (wantQ && sets.some(function (s) { return s.id === wantQ; })) sel.value = wantQ;
    }, function (err) { $('mhSourceNote').textContent = err.message; });
    call('sets').then(function (r) {
      var sel = $('mhFlash');
      sel.textContent = '';
      (r.list || []).filter(function (s) { return s && s.id; }).forEach(function (s) {
        var o = mk('option', '', s.title + (s.count ? ' (' + s.count + ' terms)' : ''));
        o.value = s.id;
        sel.appendChild(o);
      });
      if (wantF && [].some.call(sel.options, function (o) { return o.value === wantF; })) sel.value = wantF;
    }, function () { /* only needed for that choice */ });
  }

  function whoPicked() { var r = document.querySelector('input[name="mhWho"]:checked'); return r && r.value === 'guests' ? 'guests' : 'pass'; }
  function opts() {
    var o = {
      who: whoPicked(),
      period: $('mhPeriod').value,
      moles: Number($('mhMoles').value),
      meetings: Number($('mhMeetings').value),
      talk: Number($('mhTalk').value),
      vote: Number($('mhVote').value),
      limit: Number($('mhLimit').value),
      scans: Number($('mhScans').value),
      reliable: $('mhReliable').value,
      prices: $('mhPrices').value,
      rumorEvery: Number($('mhRumorEvery').value),
      showVoters: $('mhShowVoters').checked,
      claims: $('mhClaims').checked,
      wrongCost: $('mhWrongCost').checked,
      showAnswer: $('mhShowAnswer').checked,
      joinLate: $('mhJoinLate').checked,
      slow: $('mhSlow').checked,
      demo: $('mhDemo').checked
    };
    TOOL_KEYS.forEach(function (k) { o[k] = $('mhT-' + k).checked; });
    EXTRA_KEYS.forEach(function (k) { o[k] = $('mhX-' + k).checked; });
    JOB_KEYS.forEach(function (k) { o[k] = $('mhJ-' + k).checked; });
    return o;
  }
  $('mhCreate').addEventListener('click', function () {
    var q = source() === 'qset';
    var body = { kind: 'molehunt', opts: opts() };
    if (window.IS8Roster) window.IS8Roster.remember(body.opts.period);
    if (q) body.qsetId = $('mhQset').value; else body.setId = $('mhFlash').value;
    $('mhSetupError').textContent = '';
    if (q && !body.qsetId) { $('mhSetupError').textContent = 'Make a question set first (New or edit question sets), or pick a flashcard set.'; return; }
    if (!q && !body.setId) { $('mhSetupError').textContent = 'Pick a flashcard set.'; return; }
    keep(function (s) {
      if ($('mhSaveDefault').checked) {
        var d = { source: source(), qset: $('mhQset').value, flash: $('mhFlash').value, who: whoPicked() };
        SELECTS.forEach(function (id) { d[id] = $(id).value; });
        CHECKS.forEach(function (id) { d[id] = $(id).checked; });
        s.defaults = d;
      } else delete s.defaults;
    });
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Making the game...';
    call('live/create', 'POST', body).then(function (r) {
      game = { code: r.code, key: r.hostKey };
      keep(function (s) { s.host = { code: r.code, key: r.hostKey, at: Date.now() }; });
      $('mhResume').hidden = true;
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      connect();
    }, function (err) { $('mhSetupError').textContent = err.message; }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Create game';
    });
  });
  $('mhResumeBtn').addEventListener('click', function () {
    var h = readSaved().host;
    if (!h) return;
    game = { code: h.code, key: h.key };
    $('mhResume').hidden = true;
    connect();
  });

  /* ---------------- the connection ---------------- */

  function retire() {
    clearInterval(pingTimer);
    if (ws) { var old = ws; old.onopen = old.onmessage = old.onclose = null; try { old.close(); } catch (e) { /* closed */ } }
    ws = null;
  }
  function connect() {
    retire();
    leaving = false;
    status('Connecting...');
    var sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live/' + game.code + '/ws?host=' + encodeURIComponent(game.key));
    ws.onopen = function () {
      if (sock !== ws) return;
      retries = 0;
      status('');
      pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000);
    };
    ws.onmessage = function (e) {
      if (sock !== ws || e.data === 'pong') return;
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'board') {
        keep(function (s) { if (s.host && s.host.code === game.code) s.host.at = Date.now(); });
        draw(m);
      } else if (m.t === 'over' || m.t === 'error') {
        leaving = true;
        retire();
        keep(function (s) { delete s.host; });
        game = null;
        board = null;
        setup();
        $('mhResume').hidden = true;
        if (m.msg) toast(m.msg);
      }
    };
    ws.onclose = function () {
      if (sock !== ws || leaving) return;
      clearInterval(pingTimer);
      retries += 1;
      status('Lost the connection. Trying again...');
      setTimeout(function () { if (game && !leaving) connect(); }, Math.min(6000, 700 * retries));
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function heard(serverNow) { var d = serverNow - Date.now(); if (skew === null || d > skew) skew = d; }
  function local(t) { return t - (skew || 0); }

  /* ---------------- drawing ---------------- */

  function draw(b) {
    var was = board;
    board = b;
    heard(b.now);
    [].forEach.call(document.querySelectorAll('.mh-mini-code'), function (n) { n.textContent = b.code; });
    [].forEach.call(document.querySelectorAll('.mh-join-url'), function (n) { n.textContent = location.host + '/join'; });
    if (b.phase === 'lobby') { show('mhLobby'); drawLobby(b); }
    else if (b.phase === 'play') { show('mhPlay'); drawPlay(b, was); }
    else if (b.phase === 'done') { show('mhDone'); drawDone(b, was); }
    musicFor(b.phase);
    if (rosterOpen) drawRoster(b);
  }

  /* -------- the lobby -------- */

  function joinLink(code) { return location.origin + '/join/#' + code; }
  var seen = {};
  function drawLobby(b) {
    $('mhCode').textContent = b.code;
    if (qrFor !== b.code && window.qrcode) {
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(joinLink(b.code));
        qr.make();
        $('mhQr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        qrFor = b.code;
      } catch (e) { /* the code is enough */ }
    }
    var n = b.players.length;
    var picking = b.players.filter(function (p) { return !p.hero; }).length;
    $('mhCount').textContent = n ? M.plural(n, 'student has joined.', 'students have joined.') + (picking ? ' ' + picking + ' still picking a hero.' : '') : 'Waiting for students to join...';
    $('mhStart').disabled = n < 3;
    $('mhStart').title = n < 3 ? 'Mole Hunt needs at least 3 players.' : '';
    drawLobbyOpts(b);
    var list = $('mhPlayers');
    list.textContent = '';
    b.players.forEach(function (p) {
      var li = mk('li', 'rb-player' + (p.on || p.bot ? '' : ' gone') + (seen[p.id] ? '' : ' new'));
      seen[p.id] = true;
      li.appendChild(M.heroImg(p.hero));
      li.appendChild(mk('span', 'rb-player-name', p.name));
      if (p.guest) li.appendChild(mk('span', 'lv-guest-tag', 'Guest'));
      if (!p.hero) li.appendChild(mk('span', 'rb-picking', 'picking a hero'));
      var x = mk('button', 'rb-x', '×');
      x.type = 'button';
      x.title = 'Take ' + p.name + ' out of the game';
      x.setAttribute('aria-label', x.title);
      x.addEventListener('click', function () { send({ t: 'kick', id: p.id }); });
      li.appendChild(x);
      list.appendChild(li);
    });
  }
  // The choices that can still change while students join.
  function drawLobbyOpts(b) {
    var box = $('mhLobbyOpts');
    drawRoll(b);
    var o = b.opts;
    var key = JSON.stringify([o.moles, o.limit, o.meetings, o.prices, o.reliable]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.textContent = '';
    function row(label, values, now, name) {
      var l = mk('label', 'rb-lo');
      l.appendChild(mk('span', '', label));
      var sel = mk('select');
      values.forEach(function (v) { var op = mk('option', '', v[1]); op.value = String(v[0]); sel.appendChild(op); });
      sel.value = String(now);
      sel.addEventListener('change', function () { var x = {}; x[name] = isNaN(Number(sel.value)) ? sel.value : Number(sel.value); send({ t: 'settings', opts: x }); });
      l.appendChild(sel);
      box.appendChild(l);
    }
    row('Moles', [[0, 'Auto (1 for every 10)'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], o.moles, 'moles');
    row('Game length', [[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [25, '25 minutes'], [30, '30 minutes'], [0, 'No time limit']], o.limit, 'limit');
    row('Meetings', [[0, '2 more than the Moles'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [9, '9']], o.meetings, 'meetings');
    row('Prices', [['cheap', 'Cheap'], ['normal', 'Normal'], ['pricey', 'Pricey']], o.prices, 'prices');
    row('Scans', [['always', 'Always right'], ['usually', 'Usually right'], ['normal', 'Normal'], ['shaky', 'Shaky']], o.reliable, 'reliable');
  }
  var rollPeriods = false;
  function drawRoll(b) {
    var o = b.opts || {};
    if (document.activeElement !== $('mhLobbyWho')) $('mhLobbyWho').value = o.who || 'pass';
    var sel = $('mhLobbyPeriod');
    if (!window.IS8Roster) return;
    if (!rollPeriods) { rollPeriods = true; window.IS8Roster.fillPeriods(sel, o.period || ''); }
    else if (document.activeElement !== sel && sel.value !== (o.period || '') && [].some.call(sel.options, function (x) { return x.value === (o.period || ''); })) sel.value = o.period || '';
    window.IS8Roster.draw($('mhRoll'), o.period || '', b.players);
  }
  $('mhLobbyWho').addEventListener('change', function () { send({ t: 'who', who: this.value }); });
  $('mhLobbyPeriod').addEventListener('change', function () {
    if (window.IS8Roster) window.IS8Roster.remember(this.value);
    send({ t: 'period', period: this.value });
  });
  $('mhStart').addEventListener('click', function () { send({ t: 'start' }); });
  $('mhCopy').addEventListener('click', function () {
    if (!board) return;
    var link = joinLink(board.code);
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Copied the join link.'); }, function () { toast(link); });
  });

  /* -------- the projector -------- */

  var tickTimer = null;
  var parts = {};
  function part(name, key, build) {
    // Each part of the board is drawn again only when what it shows changes.
    var stage = $('mhStage');
    var el = parts[name];
    if (!el || !stage.contains(el)) { el = parts[name] = mk('div', 'mh-part mh-part-' + name); el.dataset.key = ''; }
    if (el.dataset.key !== key) { el.dataset.key = key; el.textContent = ''; build(el); }
    return el;
  }
  function names(ids, b) {
    var by = {};
    b.players.forEach(function (p) { by[p.id] = p; });
    return ids.map(function (id) { return by[id]; }).filter(Boolean);
  }

  function drawPlay(b, was) {
    var st = b.stats || {};
    var stage = $('mhStage');
    var phase = b.paused ? 'Paused' : b.stage === 'story' ? 'The story' : b.stage === 'meeting' && b.meeting ? 'Lab Meeting ' + b.meeting.n : 'Lab work: answer, scan and watch the log';
    $('mhPhase').textContent = phase;
    drawClock(b);
    var order = [];
    // The four big numbers, each with its doodle: built once, then only the
    // numbers change.
    var SV = [['red', st.molesLeft, 'Moles left', '🕳️'], ['', st.meetingsLeft, 'Meetings left', '🔔'], ['mint', st.scansLeft, 'Scans left', '🔍'], ['', st.alive + (st.alive !== st.players ? ' / ' + st.players : ''), 'In the lab', '🧪']];
    var sp = part('stats', 'four', function (el) {
      el.className = 'mh-part mh-stats';
      SV.forEach(function (x) {
        var s = mk('div', 'mh-stat ' + x[0]);
        s.appendChild(mk('span', 'mh-stat-ic', x[3]));
        s.appendChild(mk('b', '', ''));
        s.appendChild(mk('span', '', x[2]));
        el.appendChild(s);
      });
    });
    [].forEach.call(sp.querySelectorAll('.mh-stat > b'), function (n, i) { var v = String(SV[i][1]); if (n.textContent !== v) n.textContent = v; });
    order.push(sp);
    // The alarm, Lab Power and the three panels are built once and then
    // changed in place, so they never flash or lose their place.
    if (b.emergency) {
      var em = b.emergency;
      var al = part('alarm', em.kind + '|' + em.need, function (el) {
        el.className = 'mh-part mh-alarm';
        el.appendChild(mk('span', 'big', (M.EMERGENCY[em.kind] || '⚠️') + ' ' + em.name.toUpperCase() + '!'));
        el.appendChild(mk('span', '', 'Answer together: ' + em.need + ' right answers.'));
        var bar = mk('span', 'bar');
        bar.appendChild(mk('i'));
        el.appendChild(bar);
        el.appendChild(mk('span', 'n mh-alarm-got', ''));
        el.appendChild(mk('span', 'n mh-alarm-left', ''));
      });
      al.querySelector('.bar i').style.width = Math.min(100, Math.round(100 * em.got / em.need)) + '%';
      al.querySelector('.mh-alarm-got').textContent = em.got + ' / ' + em.need;
      order.push(al);
    }
    if (b.power) {
      var pw = part('power', 'bar', function (el) {
        el.className = 'mh-part mh-power';
        var h = mk('div', 'mh-pw-head');
        h.appendChild(mk('b', '', '⚡ LAB POWER'));
        h.appendChild(mk('span', '', 'Every right answer from a Scientist fills it. Fill it to the flag and the Scientists win!'));
        el.appendChild(h);
        var bar = mk('div', 'mh-pw-bar');
        bar.appendChild(mk('div', 'mh-pw-fill'));
        bar.appendChild(mk('span', 'mh-pw-pct', ''));
        bar.appendChild(mk('span', 'mh-pw-flag', '🏁'));
        el.appendChild(bar);
      });
      var pct = Math.round(100 * b.power.got / Math.max(1, b.power.goal));
      pw.querySelector('.mh-pw-fill').style.width = 'calc(' + Math.min(100, pct) + '% - 6px)';
      pw.querySelector('.mh-pw-pct').textContent = pct + '%';
      order.push(pw);
    }
    var main = part('main', 'panels', function (el) {
      el.className = 'mh-part mh-main';
      [['clear', '✅ Clear list', 'div', 'mh-chips'], ['log', '🧪 Lab log', 'ul', 'mh-log'], ['radio', '📡 Lab radio', 'div', 'mh-rumors']].forEach(function (x) {
        var s = mk('section', 'mh-panel mh-p-' + x[0]);
        s.appendChild(mk('h3', '', x[1]));
        s.appendChild(mk('p', 'mh-empty', ''));
        s.appendChild(mk(x[2], x[3]));
        if (x[0] === 'radio') s.appendChild(mk('p', 'mh-next', ''));
        el.appendChild(s);
      });
    });
    fillPanels(main, b);
    order.push(main);
    var cover = drawCover(b);
    if (cover) order.push(cover);
    // Put the parts in order, and take away the ones not showing now. A part
    // already in its place is left alone: moving it would start its
    // animation again, and the board would flash.
    [].slice.call(stage.children).forEach(function (n) { if (order.indexOf(n) < 0) n.remove(); });
    order.forEach(function (n, i) { if (stage.children[i] !== n) stage.insertBefore(n, stage.children[i] || null); });
    drawControls(b);
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 250);
    tick();
    // The drum roll plays when the reveal reaches it (tick()).
  }

  // The Clear list, the Lab log and the Lab radio: a new name, line or rumor
  // slides in; everything already showing stays where it is (and the log
  // keeps its place if the teacher scrolled it).
  function fillPanels(el, b) {
    function panel(name) { return el.querySelector('.mh-p-' + name); }
    function empty(sec, text) { var e = sec.querySelector('.mh-empty'); e.textContent = text || ''; e.hidden = !text; }
    var c = panel('clear');
    var clear = b.players.filter(function (p) { return p.clear; });
    M.syncList(c.querySelector('.mh-chips'), clear, function (p) { return p.id + '|' + (p.alive !== false) + '|' + p.hero; }, function (p) { return M.chip(p); });
    empty(c, clear.length ? '' : 'Nobody yet. A public scan that comes back Clear puts a name here.');
    var l = panel('log');
    var log = (b.log || []).slice(-60).reverse();
    M.syncList(l.querySelector('.mh-log'), log, function (x) { return x.at + '|' + x.text; }, function (x) {
      var li = mk('li');
      li.appendChild(mk('span', 't', ago(x.at)));
      var cls = /ALARM|lost|Power cut|A MOLE/.test(x.text) ? 'alarm' : /Clear|Fixed|Not a Mole/.test(x.text) ? 'good' : /teacher/i.test(x.text) ? 'teach' : '';
      li.appendChild(mk('span', cls, (cls === 'alarm' ? '⚠️ ' : '') + x.text + (cls === 'good' ? ' ✔️' : '')));
      return li;
    });
    empty(l, log.length ? '' : 'Scans and sabotage show up here as they happen.');
    var r = panel('radio');
    var rumors = (b.rumors || []).slice().reverse();
    M.syncList(r.querySelector('.mh-rumors'), rumors, function (x) { return x.n + '|' + x.at + '|' + x.text; }, function (x) {
      var d = mk('div', 'mh-rumor' + (x.by ? ' ghost' : ''));
      d.appendChild(mk('b', '', x.by ? '👻 A ghost whispers' : 'Rumor ' + x.n));
      d.appendChild(document.createTextNode(x.text));
      return d;
    });
    empty(r, rumors.length ? '' : b.opts.rumors ? 'The first rumor comes soon. Rumors are always true.' : 'Drop a rumor from the bar below. Rumors are always true.');
  }

  // The story, a meeting, the reveal, or paused: over the whole board.
  function drawCover(b) {
    if (b.paused) {
      return part('cover', 'paused', function (el) {
        el.className = 'mh-part mh-cover';
        el.appendChild(mk('div', 'ring', '⏸️'));
        el.appendChild(mk('h2', '', 'Paused'));
        el.appendChild(mk('p', '', 'Eyes up here. Every screen is paused.'));
      });
    }
    if (b.stage === 'story') {
      return part('cover', 'story', function (el) {
        el.className = 'mh-part mh-cover mh-story';
        var who = mk('div', 'who');
        who.appendChild(M.mole());
        who.appendChild(mk('span', '', 'Urgent message from the lab director'));
        el.appendChild(who);
        var line = mk('p', 'line');
        line.innerHTML = 'Scientists, we\'re in trouble. <i>' + M.plural(b.stats.molesLeft, 'Mole has', 'Moles have') + '</i> snuck into the lab to steal our research. Answer questions for energy, scan your classmates, and vote the Moles out at Lab Meetings. The lab is counting on you!';
        el.appendChild(line);
        el.appendChild(mk('p', '', 'Look at your own screen: cover it, then tap to see your secret role.'));
        var skip = mk('button', 'btn', 'Skip the story');
        skip.type = 'button';
        skip.addEventListener('click', function () { send({ t: 'skipStory' }); });
        el.appendChild(skip);
        el.appendChild(mk('p', 'mh-timer-pill mh-story-left', ''));
      });
    }
    var m = b.meeting;
    if (!m) return null;
    // Talking and voting (Donny, 2026-11-19: "the screen keeps flashing when
    // something new is added... you can't see older notes when newer notes
    // get posted"): the screen is built once for each step, then a new vote
    // only changes the count and a new note slides in at the end of the list.
    // Every note stays, oldest first, and Names on the table adds them all up.
    if (m.step === 'talk' || m.step === 'vote') {
      var claimsOn = !!(b.opts && b.opts.claims);
      var cv = part('cover', 'meet' + m.n + '|' + m.step + '|' + claimsOn, function (el) { buildMeeting(el, m, claimsOn); });
      fillMeeting(cv, m, claimsOn);
      return cv;
    }
    // The reveal, in three parts (Donny, 2026-11-15): who the class voted
    // for, a drum roll on the student with the most votes, then the answer.
    var r = m.result || {};
    var ph = revealPhase(m);
    return part('cover', 'reveal' + m.n + ph, function (el) {
      el.className = 'mh-part mh-cover mh-reveal mh-reveal-' + ph;
      if (ph === 'tally') {
        el.appendChild(mk('h2', '', '🗳️ The votes are in!'));
        el.appendChild(mk('p', '', M.plural(r.votes || 0, 'student', 'students') + ' voted' + (r.skip ? ', ' + r.skip + ' skipped' : '') + '.'));
        el.appendChild(voteBars(r));
        if ((r.reasons || []).length) {
          var rs0 = mk('div', 'mh-reasons');
          r.reasons.slice(0, 4).forEach(function (x) { rs0.appendChild(mk('span', 'mh-reason', x.text + ' ×' + x.n)); });
          el.appendChild(rs0);
        }
        return;
      }
      if (r.out) {
        el.appendChild(M.heroImg(r.out.hero, 'big'));
        el.appendChild(mk('p', 'was', r.out.name + ' got ' + M.plural(r.outVotes || (r.tally && r.tally[0] ? r.tally[0].n : 0), 'vote') + ' and leaves the lab.'));
        el.appendChild(mk('p', 'was', r.out.name + ' was...'));
        if (ph === 'drum') { el.appendChild(mk('p', 'res mh-dots', '...')); return; }
        el.appendChild(mk('p', 'res ' + (r.wasMole ? 'mole' : 'sci'), r.wasMole ? 'A MOLE!' : 'NOT a Mole.'));
      } else {
        el.appendChild(mk('p', 'was', r.tie ? 'It was a tie...' : 'Most of the class skipped...'));
        if (ph === 'drum') { el.appendChild(mk('p', 'res mh-dots', '...')); return; }
        el.appendChild(mk('p', 'res sci', 'Nobody leaves the lab.'));
      }
      el.appendChild(mk('p', 'left', r.molesLeft ? M.plural(r.molesLeft, 'Mole is', 'Moles are') + ' still in the lab · ' + M.plural(r.meetingsLeft, 'meeting') + ' left' : 'Every Mole has been caught!'));
      if (r.meetingsLeft < r.molesLeft) {
        el.appendChild(mk('p', 'mh-warn', board && board.power ? 'Not enough meetings left to vote out every Mole! Fill the Lab Power bar, or add a meeting (+1 meeting).' : 'Not enough meetings left to vote out every Mole! Add a meeting (+1 meeting) now, or the Moles win.'));
      }
      var t = mk('div', 'mh-tally');
      (r.tally || []).slice(0, 6).forEach(function (x) { var c = M.chip(x); c.appendChild(mk('b', '', String(x.n))); t.appendChild(c); });
      if (r.skip) t.appendChild(mk('span', 'mh-chip', 'Skip ' + r.skip));
      el.appendChild(t);
      if ((r.reasons || []).length) {
        var rs = mk('div', 'mh-reasons');
        r.reasons.slice(0, 4).forEach(function (x) { rs.appendChild(mk('span', 'mh-reason', x.text + ' ×' + x.n)); });
        el.appendChild(rs);
      }
      if (r.voters && r.voters.length) {
        var by = {};
        board.players.forEach(function (p) { by[p.id] = p.name; });
        var v = mk('div', 'mh-voters');
        r.voters.forEach(function (x) { v.appendChild(mk('span', '', (by[x.id] || '?') + ' → ' + (x.to === 'skip' ? 'skip' : by[x.to] || '?'))); });
        el.appendChild(v);
      }
    });
  }

  function buildMeeting(el, m, claimsOn) {
    var talk = m.step === 'talk';
    el.className = 'mh-part mh-cover mh-meeting-cover' + (claimsOn ? ' mh-with-claims' : '');
    function voteMeter(row) {
      row.appendChild(mk('p', 'mh-vote-count', ''));
      var bar = mk('span', 'mh-vote-bar');
      bar.appendChild(mk('i'));
      row.appendChild(bar);
    }
    if (!claimsOn) {
      el.appendChild(mk('div', 'ring', talk ? '🔔' : '🗳️'));
      el.appendChild(mk('h2', '', talk ? 'Lab Meeting ' + m.n : 'Vote on your screen!'));
      if (talk) el.appendChild(mk('p', '', 'Called by ' + m.by + '. Talk it over: who is a Mole? Look at the Clear list and the Lab log.'));
      else voteMeter(el);
      el.appendChild(mk('p', 'mh-timer-pill mh-meet-left', ''));
      if (talk) el.appendChild(mk('p', '', 'Voting opens when the time is up, or press Start voting.'));
      return;
    }
    var head = mk('div', 'mh-meet-head');
    head.appendChild(mk('h2', '', talk ? '🔔 Lab Meeting ' + m.n : '🗳️ Vote on your screen!'));
    if (!talk) voteMeter(head);
    head.appendChild(mk('p', 'mh-timer-pill mh-meet-left', ''));
    el.appendChild(head);
    el.appendChild(mk('p', 'mh-meet-sub', talk ? 'Called by ' + m.by + '. Talk it over: who is a Mole?' : 'Lab Meeting ' + m.n + ': everyone votes on their own screen. The notes stay up.'));
    var body = mk('div', 'mh-meet-body');
    var said = mk('section', 'mh-claims');
    var h = mk('h3', '', '📣 What the lab is saying ');
    h.appendChild(mk('span', 'mh-claims-n', ''));
    said.appendChild(h);
    said.appendChild(mk('p', 'mh-empty', 'Nothing yet. On their own screens, students tap 📣 Tell the class on one of their notes to share it here.'));
    var feed = mk('div', 'mh-claim-feed');
    said.appendChild(feed);
    var more = mk('button', 'mh-feed-more', 'New notes below ↓');
    more.type = 'button';
    more.hidden = true;
    more.addEventListener('click', function () { feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' }); });
    said.appendChild(more);
    // Scrolled to the bottom: new notes keep it there. Scrolled up to read
    // older notes: it stays put, and a button says there is more below.
    feed.addEventListener('scroll', function () {
      feed.dataset.pinned = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 24 ? '1' : '0';
      if (feed.dataset.pinned === '1') more.hidden = true;
    });
    feed.dataset.pinned = '1';
    body.appendChild(said);
    var named = mk('section', 'mh-named');
    named.appendChild(mk('h3', '', '🧾 Names on the table'));
    named.appendChild(mk('p', 'mh-empty', 'Every classmate the notes name shows up here once, with how many said Mole and how many said Scientist.'));
    named.appendChild(mk('div', 'mh-named-list'));
    body.appendChild(named);
    el.appendChild(body);
  }

  function fillMeeting(el, m, claimsOn) {
    var vc = el.querySelector('.mh-vote-count');
    if (vc) {
      vc.textContent = m.votesIn + ' of ' + m.of + ' votes in';
      el.querySelector('.mh-vote-bar i').style.width = Math.round(100 * m.votesIn / Math.max(1, m.of)) + '%';
    }
    if (!claimsOn) return;
    var list = m.claims || [];
    var feed = el.querySelector('.mh-claim-feed');
    el.querySelector('.mh-claims-n').textContent = list.length ? '(' + list.length + ')' : '';
    el.querySelector('.mh-claims .mh-empty').hidden = !!list.length;
    var made = M.syncList(feed, list, function (c) { return c.by.id + '|' + c.who.id + '|' + c.at; }, function (c) {
      var it = mk('div', 'mh-claim ' + c.v);
      it.appendChild(M.heroImg(c.by.hero, 'small'));
      var t = mk('div', 'txt');
      t.appendChild(mk('b', '', c.by.name));
      t.appendChild(mk('span', '', M.noteText(c.who.name, c.v, c.why)));
      it.appendChild(t);
      return it;
    });
    [].forEach.call(feed.children, function (n, i) { n.classList.toggle('newest', i === feed.children.length - 1 && list.length > 1); });
    feed.setAttribute('data-n', list.length > 8 ? 'many' : list.length > 4 ? 'some' : 'few');
    if (made.length) {
      if (feed.dataset.pinned !== '0') feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      else el.querySelector('.mh-feed-more').hidden = false;
    }
    // Names on the table: each classmate the notes name, once, most
    // suspected first.
    var by = {}, order = [];
    list.forEach(function (c) {
      var x = by[c.who.id];
      if (!x) { x = by[c.who.id] = { who: c.who, mole: 0, sci: 0, unsure: 0 }; order.push(x); }
      x[c.v] = (x[c.v] || 0) + 1;
    });
    order.sort(function (a, b2) { return (b2.mole * 2 + b2.unsure - b2.sci) - (a.mole * 2 + a.unsure - a.sci) || b2.mole + b2.sci + b2.unsure - a.mole - a.sci - a.unsure; });
    var box = el.querySelector('.mh-named-list');
    el.querySelector('.mh-named .mh-empty').hidden = !!order.length;
    M.syncList(box, order, function (x) { return x.who.id + '|' + x.mole + '|' + x.sci + '|' + x.unsure; }, function (x) {
      var row = mk('div', 'mh-nrow');
      row.dataset.total = x.mole + x.sci + x.unsure;
      row.appendChild(M.heroImg(x.who.hero, 'small'));
      var t = mk('div', 'txt');
      t.appendChild(mk('b', '', x.who.name));
      var says = mk('span', 'says');
      if (x.mole) says.appendChild(mk('span', 'mole', x.mole + (x.mole === 1 ? ' says' : ' say') + ' Mole'));
      if (x.unsure) says.appendChild(mk('span', 'unsure', x.unsure + (x.unsure === 1 ? ' says' : ' say') + ' might be'));
      if (x.sci) says.appendChild(mk('span', 'sci', x.sci + (x.sci === 1 ? ' says' : ' say') + ' Scientist'));
      t.appendChild(says);
      row.appendChild(t);
      var bar = mk('span', 'tally');
      [['mole', x.mole], ['unsure', x.unsure], ['sci', x.sci]].forEach(function (s) { if (s[1]) { var i = mk('i', s[0]); i.style.flexGrow = s[1]; bar.appendChild(i); } });
      row.appendChild(bar);
      return row;
    });
    // Each bar is as long as that classmate's share of the most-named one.
    var most = Math.max.apply(null, [1].concat([].map.call(box.children, function (r) { return Number(r.dataset.total) || 0; })));
    [].forEach.call(box.children, function (r) { r.querySelector('.tally').style.width = Math.max(12, Math.round(100 * (Number(r.dataset.total) || 0) / most)) + '%'; });
  }

  // Which part of the reveal is showing: 'tally', 'drum' or 'result'. The
  // answer waits for the drum roll's last hit on this screen's speakers
  // (Donny, 2026-11-19: "the reveal happens before the end of the
  // drumroll"), however late the sound comes out.
  var heardAt = { n: '', at: 0 };
  function revealPhase(m) {
    var now = Date.now();
    if (now < local(m.drumAt || 0) && !m.shown) return 'tally';
    if (m.shown && now >= revealAt(m)) return 'result';
    return 'drum';
  }
  function revealAt(m) {
    var at = local(m.resultAt || 0);
    if (heardAt.n === m.n + '|' + code0()) at = Math.max(at, Math.min(heardAt.at, at + 2500));
    return at;
  }
  // Who the class voted for: a bar for each student with votes, and Skip.
  function voteBars(r) {
    var box = mk('div', 'mh-bars');
    var list = (r.tally || []).slice(0, 7);
    var most = Math.max.apply(null, list.map(function (x) { return x.n; }).concat([r.skip || 0, 1]));
    list.forEach(function (x, i) {
      var row = mk('div', 'mh-bar-row' + (i === 0 && !r.tie ? ' top' : ''));
      row.style.animationDelay = (i * 0.25) + 's';
      row.appendChild(M.heroImg(x.hero, 'small'));
      row.appendChild(mk('span', 'nm', x.name));
      var bar = mk('span', 'bar');
      var fill = mk('i');
      fill.style.width = Math.round(100 * x.n / most) + '%';
      fill.style.animationDelay = (i * 0.25) + 's';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(mk('b', '', String(x.n)));
      box.appendChild(row);
    });
    if (r.skip) {
      var sk = mk('div', 'mh-bar-row skip');
      sk.appendChild(mk('span', 'nm', 'Skipped'));
      var b2 = mk('span', 'bar');
      var f2 = mk('i');
      f2.style.width = Math.round(100 * r.skip / most) + '%';
      b2.appendChild(f2);
      sk.appendChild(b2);
      sk.appendChild(mk('b', '', String(r.skip)));
      box.appendChild(sk);
    }
    if (!list.length && !r.skip) box.appendChild(mk('p', '', 'Nobody voted.'));
    return box;
  }
  // The sound for the drum roll. It is made on the teacher's first click, so
  // it is awake and on time when the first reveal comes.
  function audio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { drum.ac = drum.ac || new AC(); } catch (e) { return null; }
    if (drum.ac.state === 'suspended' && drum.ac.resume) drum.ac.resume().catch(function () { /* needs a click */ });
    return drum.ac;
  }
  document.addEventListener('pointerdown', function () { audio(); }, { once: true });
  // A drum roll that speeds up through the suspense, then a hit and a crash
  // right as the answer shows (Donny, 2026-11-19: "the reveal happens before
  // the end of the drumroll"). Speakers play sound a little after it is made
  // (more with Bluetooth or a projector), so the roll is timed by when the
  // sound really comes out, and heardAt tells revealPhase() to hold the answer
  // until the last hit is heard.
  function drum(m) {
    if (music.muted) return;
    var ac = audio();
    if (!ac) return;
    try {
      // How long after now a sound made now is heard.
      var lagMs = ((ac.outputLatency || 0) + (ac.baseLatency || 0)) * 1000 || 60;
      var ts = ac.getOutputTimestamp ? ac.getOutputTimestamp() : null;
      if (ts && ts.performanceTime > 0 && ts.contextTime > 0) lagMs = ts.performanceTime + (ac.currentTime - ts.contextTime) * 1000 - performance.now();
      if (!(lagMs >= 0 && lagMs < 1500)) lagMs = 60;
      var t0 = ac.currentTime + 0.02;
      var len = Math.max(0.6, (local(m.resultAt) - Date.now() - lagMs) / 1000 - 0.02);
      heardAt = { n: m.n + '|' + code0(), at: Date.now() + (len + 0.02) * 1000 + lagMs };
      var vol = music.volume / 100;
      var t = 0, gap = 0.2;
      while (t < len - 0.14) {
        hit(ac, t0 + t, 95 + t * 12, vol * (0.12 + 0.2 * t / len), 0.1);
        t += gap;
        gap = Math.max(0.045, gap * 0.92);
      }
      hit(ac, t0 + len, 210, vol * 0.55, 0.6);
      crash(ac, t0 + len, vol * 0.3);
    } catch (e) { /* no sound */ }
  }
  function crash(ac, at, vol) {
    var n = Math.round(ac.sampleRate * 1.4);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf;
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
    src.connect(hp); hp.connect(g); g.connect(ac.destination);
    src.start(at); src.stop(at + 1.4);
  }
  function hit(ac, at, freq, vol, len) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g); g.connect(ac.destination);
    o.start(at); o.stop(at + len + 0.05);
  }
  var drummed = '';

  function tick() {
    var b = board;
    if (!b || b.phase !== 'play') return;
    // Paused: every clock stands still where it was.
    var now = b.paused ? local(b.pausedAt || b.now) : Date.now();
    var c = $('mhClock');
    if (b.endsAt) {
      // During the story the game clock waits: it starts when the story ends.
      var left = b.stage === 'story' && b.storyEndsAt ? b.endsAt - b.storyEndsAt : local(b.endsAt) - now;
      c.textContent = b.timeUp ? '0:00' : M.clock(left);
      c.classList.toggle('low', left < 60000);
    }
    var q = function (sel) { return document.querySelector(sel); };
    var m = b.meeting;
    var ml = q('.mh-meet-left');
    if (ml && m) ml.textContent = M.clock(local(m.endsAt) - now) + (m.step === 'talk' ? ' to talk' : ' to vote');
    var sl = q('.mh-story-left');
    if (sl && b.storyEndsAt) sl.textContent = 'Starting in ' + M.clock(local(b.storyEndsAt) - now);
    var al = q('.mh-alarm-left');
    if (al && b.emergency) al.textContent = '⏱ ' + M.clock(local(b.emergency.endsAt) - now);
    var nx = q('.mh-next');
    if (nx) nx.textContent = b.nextRumorAt ? 'Next rumor in ' + M.clock(local(b.nextRumorAt) - now) : '';
    // The reveal moves from the votes to the drum roll on this screen's clock.
    if (m && m.step === 'reveal' && !b.paused) {
      var ph = revealPhase(m);
      var cover = parts.cover;
      if (cover && cover.dataset.key !== 'reveal' + m.n + ph) drawPlay(b);
      if (ph === 'drum' && drummed !== m.n + '|' + code0()) {
        drummed = m.n + '|' + code0();
        drum(m);
        // Show the answer right on the last hit, not at the next tick.
        setTimeout(tick, Math.max(0, revealAt(m) - Date.now()) + 5);
      }
    }
  }
  function code0() { return board ? board.code : ''; }

  var CLOCKS = [['', 'Set the clock...'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [25, '25 minutes'], [30, '30 minutes'], [0, 'No clock']];
  (function () {
    var sel = $('mhClockSet');
    CLOCKS.forEach(function (x) { var o = mk('option', '', x[1]); o.value = String(x[0]); sel.appendChild(o); });
    sel.addEventListener('change', function () {
      if (sel.value === '') return;
      send({ t: 'clock', minutes: Number(sel.value) });
      sel.value = '';
    });
  })();
  function drawClock(b) {
    var has = !!b.endsAt;
    $('mhMinus').hidden = $('mhPlus').hidden = !has;
    $('mhClock').classList.toggle('none', !has);
    if (!has) $('mhClock').textContent = 'No time limit';
  }
  $('mhMinus').addEventListener('click', function () { send({ t: 'time', seconds: -60 }); });
  $('mhPlus').addEventListener('click', function () { send({ t: 'time', seconds: 60 }); });

  /* -------- the control bar (B) -------- */

  function drawControls(b) {
    var work = b.stage === 'work' && !b.paused;
    var m = b.meeting;
    $('mhPause').innerHTML = b.paused ? '<span aria-hidden="true">▶️</span>Resume<small>the game</small>' : '<span aria-hidden="true">⏸️</span>Pause all<small>screens</small>';
    $('mhCallMeeting').disabled = !work;
    $('mhCallMeeting').title = work ? '' : 'Meetings start between rounds of lab work.';
    $('mhRumorBtn').disabled = !work;
    $('mhBoost').disabled = !!b.paused;
    var vb = $('mhVoteBtn');
    vb.disabled = !m || !!b.paused;
    vb.innerHTML = !m || m.step === 'talk' ? '<span aria-hidden="true">🗳️</span>Start<small>voting</small>'
      : m.step === 'vote' ? '<span aria-hidden="true">⏭️</span>End voting<small>early</small>'
        : '<span aria-hidden="true">▶️</span>Back to<small>the lab</small>';
    if (!$('mhEnd').classList.contains('armed')) $('mhEnd').innerHTML = '<span aria-hidden="true">🏁</span>End game<small>now</small>';
    if (!work) openPop('', false);
  }
  $('mhCallMeeting').addEventListener('click', function () { send({ t: 'meeting' }); });
  $('mhPause').addEventListener('click', function () { if (board) send({ t: board.paused ? 'resume' : 'pause' }); });
  $('mhBoost').addEventListener('click', function () { send({ t: 'boost' }); toast('+5 energy for everyone!'); });
  $('mhAddMeeting').addEventListener('click', function () { send({ t: 'addMeeting' }); toast('Added a meeting.'); });
  $('mhVoteBtn').addEventListener('click', function () {
    var m = board && board.meeting;
    if (!m) return;
    send({ t: m.step === 'talk' ? 'startVote' : m.step === 'vote' ? 'endVote' : 'nextReveal' });
  });
  twice($('mhEnd'), 'Click again: the Moles still hiding win', function () { send({ t: 'end' }); });

  function openPop(which, yes) {
    [['rumor', 'mhRumorPop', 'mhRumorBtn'], ['remote', 'mhRemotePop', 'mhRemoteBtn']].forEach(function (x) {
      var on = x[0] === which && yes;
      $(x[1]).hidden = !on;
      $(x[2]).setAttribute('aria-expanded', String(on));
    });
  }
  $('mhRumorBtn').addEventListener('click', function () { openPop('rumor', $('mhRumorPop').hidden); });
  [].forEach.call(document.querySelectorAll('[data-rumor]'), function (b) {
    b.addEventListener('click', function () { send({ t: 'rumor', kind: b.getAttribute('data-rumor') }); openPop('', false); toast('Rumor dropped!'); });
  });
  $('mhRemoteBtn').addEventListener('click', function () {
    var open = $('mhRemotePop').hidden;
    openPop('remote', open);
    if (!open || !board) return;
    var link = location.origin + '/molehunt/remote/#' + board.code;
    $('mhRemoteLink').textContent = link;
    if (window.qrcode && $('mhRemoteQr').dataset.code !== board.code) {
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(link);
        qr.make();
        $('mhRemoteQr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        $('mhRemoteQr').dataset.code = board.code;
      } catch (e) { /* the link is enough */ }
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') openPop('', false); });

  /* -------- players -------- */

  var rosterOpen = false;
  function openRoster(yes) {
    rosterOpen = yes;
    $('mhRoster').hidden = $('mhRosterBack').hidden = !yes;
    $('mhRosterBtn').setAttribute('aria-expanded', String(yes));
    if (yes && board) drawRoster(board);
  }
  $('mhRosterBtn').addEventListener('click', function () { openRoster(!rosterOpen); });
  $('mhRosterClose').addEventListener('click', function () { openRoster(false); });
  $('mhRosterBack').addEventListener('click', function () { openRoster(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && rosterOpen) openRoster(false); });
  function drawRoster(b) {
    var body = $('mhRosterBody');
    var key = JSON.stringify([b.players.map(function (p) { return [p.id, p.alive, p.on]; }), b.blocked]);
    if (body.dataset.key === key) return;
    body.dataset.key = key;
    body.textContent = '';
    var list = mk('ul', 'rb-roster-list');
    b.players.forEach(function (p) {
      var li = mk('li', 'rb-roster-row' + (p.alive === false ? ' out' : ''));
      li.appendChild(M.heroImg(p.hero, '', p.alive === false));
      li.appendChild(mk('span', 'rb-player-name', p.name + (p.on || p.bot ? '' : ' (away)')));
      if (p.alive === false) li.appendChild(mk('span', 'rb-out-tag', p.ghost ? 'ghost' : 'voted out'));
      var x = mk('button', 'btn secondary fc-small', 'Remove');
      x.type = 'button';
      twice(x, 'Sure?', function () { send({ t: 'kick', id: p.id }); });
      var blk = mk('button', 'btn secondary fc-small rb-danger', 'Remove and block');
      blk.type = 'button';
      twice(blk, 'Sure?', function () { send({ t: 'kick', id: p.id, block: true }); });
      li.appendChild(x);
      li.appendChild(blk);
      list.appendChild(li);
    });
    body.appendChild(list);
    if (b.blocked.length) {
      body.appendChild(mk('h3', '', 'Blocked'));
      b.blocked.forEach(function (x) {
        var row = mk('p', 'rb-roster-row');
        row.appendChild(mk('span', 'rb-player-name', x.name));
        var un = mk('button', 'btn secondary fc-small', 'Let back in');
        un.type = 'button';
        un.addEventListener('click', function () { send({ t: 'unblock', id: x.id }); });
        row.appendChild(un);
        body.appendChild(row);
      });
    }
  }

  /* -------- the end (idea 10) and the report (D) -------- */

  function drawDone(b, was) {
    clearInterval(tickTimer);
    openPop('', false);
    var head = $('mhDoneHead');
    head.className = 'mh-done-head ' + b.winner;
    head.textContent = '';
    var h2 = mk('h2', '', b.winner === 'sci' ? '🧪 SCIENTISTS WIN!' : ' THE MOLES WIN!');
    if (b.winner !== 'sci') h2.insertBefore(M.mole(), h2.firstChild);
    head.appendChild(h2);
    head.appendChild(mk('p', '', b.why || ''));
    var row = $('mhDoneMoles');
    row.textContent = '';
    row.appendChild(mk('p', 'mh-empty', 'The Moles were:'));
    b.players.filter(function (p) { return p.role === 'mole'; }).forEach(function (p) {
      var c = mk('span', 'mh-mcap');
      c.appendChild(M.heroImg(p.hero));
      var t = mk('span');
      t.appendChild(mk('b', '', p.name + (p.job === 'hacker' ? ' (Hacker)' : '')));
      t.appendChild(mk('span', '', p.outAt ? 'Caught at meeting ' + p.outAt : 'Never caught'));
      c.appendChild(t);
      row.appendChild(c);
    });
    var cf = $('mhCaseFile');
    cf.textContent = '';
    (b.casefile || []).forEach(function (x) {
      var li = mk('li');
      li.appendChild(mk('i', '', ago(x.at)));
      li.appendChild(mk('span', '', x.text));
      cf.appendChild(li);
    });
    if (!(b.casefile || []).length) cf.appendChild(mk('li', '', 'The Moles did not use any tools.'));
    var aw = $('mhAwards');
    aw.textContent = '';
    var icon = { detective: '🕵️', sneaky: '🥸', answers: '🎯', ghost: '👻', missions: '🎖️' };
    (b.awards || []).forEach(function (a) {
      var d = mk('div', 'mh-aw');
      d.appendChild(M.heroImg(a.hero));
      var t = mk('div');
      t.appendChild(mk('b', '', (icon[a.key] || '🏆') + ' ' + a.title));
      t.appendChild(mk('strong', '', a.name));
      t.appendChild(mk('small', '', a.note));
      d.appendChild(t);
      aw.appendChild(d);
    });
    $('mhLbNote').textContent = b.counts ? '🏆 Wins were added to the class leaderboard.' : b.opts.demo ? 'Demo games do not count on the leaderboard.' : '';
    drawReport(b);
    if (was && was.phase === 'play') celebrate();
  }

  // The report's rows: pretend students are left out, unless only they played.
  function reportRows(b) {
    var res = b.results;
    if (!res) return [];
    var rows = res.rows.filter(function (p) { return !p.bot; });
    return rows.length ? rows : res.rows;
  }
  function pct(r, w) { return r + w ? Math.round(100 * r / (r + w)) : 0; }
  function drawReport(b) {
    var t = $('mhTable');
    t.textContent = '';
    var rows = reportRows(b).slice().sort(function (x, y) { return y.right - x.right; });
    var head = mk('tr');
    ['Student', 'Role', 'Right', 'Accuracy', 'Energy earned', 'Scans', 'Voted for a real Mole', 'Missions', 'Badges'].forEach(function (h) { head.appendChild(mk('th', '', h)); });
    var thead = mk('thead');
    thead.appendChild(head);
    t.appendChild(thead);
    var tb = mk('tbody');
    rows.forEach(function (p) {
      var tr = mk('tr');
      tr.appendChild(mk('td', '', p.name));
      var role = mk('td');
      role.appendChild(mk('span', 'mh-badge ' + (p.role === 'Mole' ? 'm' : 's'), p.job || p.role));
      tr.appendChild(role);
      tr.appendChild(mk('td', '', String(p.right)));
      var acc = mk('td');
      var bar = mk('span', 'mh-acc');
      var fill = mk('i');
      fill.style.width = pct(p.right, p.wrong) + '%';
      bar.appendChild(fill);
      acc.appendChild(bar);
      acc.appendChild(document.createTextNode(pct(p.right, p.wrong) + '%'));
      tr.appendChild(acc);
      tr.appendChild(mk('td', '', String(p.earned)));
      tr.appendChild(mk('td', '', String(p.scans)));
      tr.appendChild(mk('td', '', p.role === 'Mole' ? 'n/a' : p.votesRight + ' of ' + p.votesMade));
      tr.appendChild(mk('td', '', String(p.missions)));
      tr.appendChild(mk('td', '', (p.badges || []).join(', ')));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    var missed = $('mhMissed');
    missed.textContent = '';
    $('mhMissedBox').hidden = !(b.missed || []).length;
    (b.missed || []).forEach(function (x) {
      var li = mk('li');
      li.appendChild(mk('span', 'pct', pct(x.r, x.w) + '% right'));
      li.appendChild(document.createTextNode(x.q + ' '));
      li.appendChild(mk('span', 'ans', '(answer: ' + x.a + ')'));
      missed.appendChild(li);
    });
  }
  $('mhAgain').addEventListener('click', function () { send({ t: 'again' }); });
  $('mhNew').addEventListener('click', function () {
    send({ t: 'close' });
    leaving = true;
    retire();
    keep(function (s) { delete s.host; });
    game = null;
    qrFor = '';
    setup();
    $('mhResume').hidden = true;
  });

  /* -------- Google Sheets (D) -------- */
  // Donny, 2026-11-15: "instead of an excel sheet, create a google sheet."
  // The teacher signs in with Google in a small window (the site's own
  // sign-in page, signin/, asks Google for permission to make files in their
  // Drive: drive.file, which only reaches files this site makes). The report
  // becomes a new Google Sheet with three tabs, and that window opens it.

  function reportTables(b) {
    var res = b.results;
    var word = { R: 'right', W: 'wrong' };
    var rows = reportRows(b);
    var students = [['Student', 'Email', 'Role', 'Special role', 'Team won', 'Right', 'Wrong', 'Percent right', 'Energy earned', 'Scans', 'Public scans', 'Fake scans', 'Votes for a real Mole', 'Votes made', 'Votes received', 'Voted out at meeting', 'Missions done', 'Badges', 'Best streak', 'Energy given as a ghost', 'Times told to slow down']
      .concat(res.questions.map(function (q, i) { return 'Q' + (i + 1) + ': ' + q.q; }))];
    rows.forEach(function (p) {
      students.push([p.name, p.email, p.role, p.job, p.won ? 'yes' : 'no', p.right, p.wrong, pct(p.right, p.wrong) / 100, p.earned, p.scans, p.pubs, p.fakes, p.role === 'Mole' ? '' : p.votesRight, p.votesMade, p.votesGot, p.out || '', p.missions, (p.badges || []).join(', '), p.best, p.given, p.slowed || 0]
        .concat(p.qa.map(function (s) { return s.split('').map(function (c) { return word[c] || c; }).join(', '); })));
    });
    var questions = [['Question', 'Answer', 'Right', 'Wrong', 'Percent right']];
    res.questions.forEach(function (q, i) {
      var r = 0, w = 0;
      rows.forEach(function (p) { (p.qa[i] || '').split('').forEach(function (c) { if (c === 'R') r += 1; else w += 1; }); });
      questions.push([q.q, q.a, r, w, r + w ? r / (r + w) : '']);
    });
    var cases = [['Time', 'What happened']];
    (b.casefile || []).forEach(function (x) { cases.push([ago(x.at), x.text]); });
    cases.push(['', '']);
    cases.push(['Winner', b.winner === 'sci' ? 'Scientists' : 'Moles']);
    cases.push(['Why', b.why || '']);
    (b.awards || []).forEach(function (a) { cases.push([a.title, a.name + ': ' + a.note]); });
    return { students: students, questions: questions, cases: cases };
  }
  function sheetTitle(b) {
    var d = new Date(b.results.at || Date.now());
    return 'Mole Hunt: ' + b.results.title + ' (' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ')';
  }
  function cell(v, head) {
    var c = {};
    if (typeof v === 'number') c.userEnteredValue = { numberValue: v };
    else c.userEnteredValue = { stringValue: String(v == null ? '' : v) };
    if (head) c.userEnteredFormat = { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.07, green: 0.2, blue: 0.4 }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' };
    return c;
  }
  function sheet(title, rows, pctCols) {
    return {
      properties: { title: title, gridProperties: { frozenRowCount: 1, rowCount: Math.max(rows.length + 5, 20), columnCount: Math.max(rows[0].length + 2, 10) } },
      data: [{ startRow: 0, startColumn: 0, rowData: rows.map(function (r, i) {
        return { values: r.map(function (v, j) {
          var c = cell(v, i === 0);
          if (i > 0 && pctCols.indexOf(j) >= 0 && typeof v === 'number') c.userEnteredFormat = { numberFormat: { type: 'PERCENT', pattern: '0%' } };
          return c;
        }) };
      }) }]
    };
  }
  function makeSheet(token, b) {
    var t = reportTables(b);
    var body = {
      properties: { title: sheetTitle(b) },
      sheets: [sheet('Students', t.students, [7]), sheet('Questions', t.questions, [4]), sheet('Case File', t.cases, [])]
    };
    return fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.spreadsheetUrl) {
          var msg = (d.error && d.error.message) || 'Google did not make the sheet.';
          var err = new Error(msg);
          err.disabled = /has not been used|is disabled|SERVICE_DISABLED/i.test(msg + JSON.stringify(d.error || {}));
          throw err;
        }
        return d.spreadsheetUrl;
      });
    });
  }
  var sheetWin = null;
  $('mhSheet').addEventListener('click', function () {
    if (!board || !board.results) return;
    var b = board;
    var nonce = [].map.call(crypto.getRandomValues(new Uint8Array(12)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    var note = $('mhSheetNote');
    note.textContent = 'Sign in with Google in the small window. It makes the sheet and opens it.';
    // Opened right away, inside the click, so the browser does not block it.
    sheetWin = window.open('/signin/?sheet=' + nonce, 'is8sheet', 'width=520,height=680');
    if (!sheetWin) { fallback(b, 'The browser blocked the sign-in window. Allow pop-ups for this site, or copy the report instead.'); return; }
    function onMsg(e) {
      if (e.origin !== location.origin || !e.data || e.data.is8sheet !== nonce) return;
      window.removeEventListener('message', onMsg);
      if (e.data.error || !e.data.token) { fallback(b, 'Google sign-in did not finish' + (e.data.error ? ': ' + e.data.error : '.')); try { sheetWin.close(); } catch (x) { /* closed */ } return; }
      note.textContent = 'Making your Google Sheet...';
      makeSheet(e.data.token, b).then(function (url) {
        try { sheetWin.location.replace(url); } catch (x) { window.open(url, '_blank'); }
        note.textContent = '';
        var a = mk('a', '', 'Your Google Sheet is ready: open it');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        note.appendChild(a);
      }, function (err) {
        try { sheetWin.close(); } catch (x) { /* closed */ }
        fallback(b, err.disabled
          ? 'Google Sheets is not switched on for this site yet (one time, in Google Cloud: the Class Pass project > APIs & Services > Library > Google Sheets API > Enable).'
          : 'Google said: ' + err.message);
      });
    }
    window.addEventListener('message', onMsg);
  });
  // When Google cannot make the sheet: copy the report and paste it into a new one.
  function fallback(b, why) {
    var note = $('mhSheetNote');
    note.textContent = why + ' Instead: ';
    var copy = mk('button', 'btn secondary fc-small', '1. Copy the report');
    copy.type = 'button';
    copy.addEventListener('click', function () { copyReport(b); });
    var open = mk('a', 'btn secondary fc-small', '2. Open a new Google Sheet');
    open.href = 'https://sheets.new';
    open.target = '_blank';
    open.rel = 'noopener';
    note.appendChild(copy);
    note.appendChild(document.createTextNode(' '));
    note.appendChild(open);
    note.appendChild(document.createTextNode(' 3. In the new sheet, press Ctrl+V.'));
  }
  function copyReport(b) {
    var t = reportTables(b);
    var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var html = '<table><tr>' + t.students[0].map(function (h) { return '<th style="background:#12376e;color:#fff;font-weight:bold">' + esc(h) + '</th>'; }).join('') + '</tr>' +
      t.students.slice(1).map(function (r) { return '<tr>' + r.map(function (v, j) { return '<td>' + esc(j === 7 ? Math.round(v * 100) + '%' : v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    var text = t.students.map(function (r) { return r.map(function (v, j) { return String(j === 7 && typeof v === 'number' && t.students[0][7] !== v ? Math.round(v * 100) + '%' : v).replace(/[\t\n]/g, ' '); }).join('\t'); }).join('\n');
    var done = function () { toast('Copied! Now paste it into the new Google Sheet with Ctrl+V.'); };
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).then(done, function () {
        navigator.clipboard.writeText(text).then(done, function () { toast('The browser would not copy. Try again.'); });
      });
    } else if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { toast('The browser would not copy. Try again.'); });
  }

  /* ---------------- music (this screen only) ---------------- */

  var SONGS = {
    lobby: [['competition-briefing', 'Competition Briefing'], ['cartoon-lobby-music-3', 'Cartoon Lobby Music 3'], ['cartoon-lobby-music-10', 'Cartoon Lobby Music 10'],
      ['video-game-music', 'Video Game Music'], ['elevator-music', 'Elevator Music'], ['lounge-jazz', 'Lounge Jazz'], ['waiting-room-calm', 'Waiting Room (Calm)']],
    game: [['game-quiz-master', 'Quiz Master'], ['game-heroic-battle-orchestra', 'Heroic Battle Orchestra'], ['game-pixel-chiptune', 'Pixel Chiptune'],
      ['game-retro-game-arcade', 'Retro Game Arcade'], ['game-arcadia', 'Arcadia'], ['game-rise-above', 'Rise Above'], ['game-airland-jazz', 'Airland Jazz']]
  };
  var saved0 = readSaved();
  var music = { lobby: saved0.lobbyMusic || '', game: saved0.gameMusic || '', volume: typeof saved0.volume === 'number' ? saved0.volume : 60, muted: !!saved0.muted, player: null };
  [['lobby', 'mhLobbyMusic'], ['game', 'mhGameMusic']].forEach(function (x) {
    var sel = $(x[1]);
    var off = mk('option', '', 'No music');
    off.value = '';
    sel.appendChild(off);
    SONGS[x[0]].forEach(function (s) { var o = mk('option', '', s[1]); o.value = s[0]; sel.appendChild(o); });
    sel.value = music[x[0]];
    sel.addEventListener('change', function () {
      music[x[0]] = sel.value;
      keep(function (s) { s[x[0] + 'Music'] = sel.value; });
    });
  });
  $('mhVolume').value = music.volume;
  function musicFor(phase) {
    var part0 = phase === 'lobby' ? 'lobby' : phase === 'play' ? 'game' : '';
    $('mhMusic').hidden = !part0 || !music[part0];
    $('mhMusicLabel').textContent = part0 === 'game' ? 'Game music' : 'Lobby music';
    $('mhMute').textContent = music.muted ? 'Unmute' : 'Mute';
    $('mhMute').setAttribute('aria-pressed', String(music.muted));
    if (!part0 || !music[part0] || music.muted) { if (music.player) music.player.pause(); return; }
    if (!music.player) { music.player = new Audio(); music.player.loop = true; }
    var src = '../assets/music/' + music[part0] + '.mp3';
    if (music.player.getAttribute('src') !== src) music.player.setAttribute('src', src);
    music.player.volume = music.volume / 100;
    if (music.player.paused) {
      var go = music.player.play();
      if (go && go.catch) go.catch(function () { /* the browser wants a click first */ });
    }
  }
  $('mhMute').addEventListener('click', function () {
    music.muted = !music.muted;
    keep(function (s) { s.muted = music.muted; });
    musicFor(board ? board.phase : '');
  });
  $('mhVolume').addEventListener('input', function () {
    music.volume = Number(this.value);
    if (music.player) music.player.volume = music.volume / 100;
    keep(function (s) { s.volume = music.volume; });
  });
  function celebrate() {
    if (window.IS8Celebrate) try { IS8Celebrate.start({}); } catch (e) { /* only confetti */ }
    if (music.muted) return;
    var win = new Audio('../assets/music/winning.mp3');
    win.volume = music.volume / 100;
    var go = win.play();
    if (go && go.catch) go.catch(function () { /* the browser blocked it */ });
  }

  /* ---------------- full screen and ending ---------------- */

  var fsButtons = [].slice.call(document.querySelectorAll('[data-fullscreen]'));
  var canFull = !!(document.documentElement.requestFullscreen && document.fullscreenEnabled !== false);
  fsButtons.forEach(function (btn) {
    btn.hidden = !canFull;
    btn.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () { /* already out */ });
      else document.documentElement.requestFullscreen().catch(function () { toast('This browser would not go full screen. Try pressing F11.'); });
    });
  });
  document.addEventListener('fullscreenchange', function () {
    document.body.classList.toggle('mh-full', !!document.fullscreenElement);
    fsButtons.forEach(function (btn) { btn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
  });
  [].forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
    twice(btn, 'Click again to end', function () {
      if (ws && ws.readyState === 1) send({ t: 'close' });
      else { keep(function (s) { delete s.host; }); location.reload(); }
    });
  });

  gate();
})();
