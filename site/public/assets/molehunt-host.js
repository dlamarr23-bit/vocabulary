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
  var CHECKS = ['mhShowVoters', 'mhWrongCost', 'mhShowAnswer', 'mhJoinLate', 'mhSlow']
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
    order.push(part('stats', JSON.stringify(st), function (el) {
      el.className = 'mh-part mh-stats';
      [['red', st.molesLeft, 'Moles left'], ['', st.meetingsLeft, 'Meetings left'], ['mint', st.scansLeft, 'Scans left'], ['', st.alive + (st.alive !== st.players ? ' / ' + st.players : ''), 'In the lab']].forEach(function (x) {
        var s = mk('div', 'mh-stat ' + x[0]);
        s.appendChild(mk('b', '', String(x[1])));
        s.appendChild(mk('span', '', x[2]));
        el.appendChild(s);
      });
    }));
    if (b.emergency) {
      order.push(part('alarm', JSON.stringify([b.emergency.kind, b.emergency.got, b.emergency.need]), function (el) {
        el.className = 'mh-part mh-alarm';
        el.appendChild(mk('span', 'big', (M.EMERGENCY[b.emergency.kind] || '⚠️') + ' ' + b.emergency.name.toUpperCase() + '!'));
        el.appendChild(mk('span', '', 'Answer together: ' + b.emergency.need + ' right answers.'));
        var bar = mk('span', 'bar');
        var fill = mk('i');
        fill.style.width = Math.min(100, Math.round(100 * b.emergency.got / b.emergency.need)) + '%';
        bar.appendChild(fill);
        el.appendChild(bar);
        el.appendChild(mk('span', 'n', b.emergency.got + ' / ' + b.emergency.need));
        el.appendChild(mk('span', 'n mh-alarm-left', ''));
      }));
    }
    if (b.power) {
      order.push(part('power', JSON.stringify(b.power), function (el) {
        el.className = 'mh-part mh-power';
        var h = mk('div', 'mh-pw-head');
        h.appendChild(mk('b', '', '⚡ LAB POWER'));
        h.appendChild(mk('span', '', 'Every right answer from a Scientist fills it. Fill it to the flag and the Scientists win!'));
        el.appendChild(h);
        var bar = mk('div', 'mh-pw-bar');
        var fill = mk('div', 'mh-pw-fill');
        var pct = Math.round(100 * b.power.got / Math.max(1, b.power.goal));
        fill.style.width = 'calc(' + pct + '% - 6px)';
        bar.appendChild(fill);
        bar.appendChild(mk('span', 'mh-pw-pct', pct + '%'));
        bar.appendChild(mk('span', 'mh-pw-flag', '🏁'));
        el.appendChild(bar);
      }));
    }
    var clearKey = JSON.stringify([(b.players || []).filter(function (p) { return p.clear; }).map(function (p) { return [p.id, p.alive, p.hero]; })]);
    var logKey = JSON.stringify((b.log || []).slice(-30));
    var rumorKey = JSON.stringify([b.rumors, b.opts.rumors]);
    var main = part('main', clearKey + logKey + rumorKey, function (el) {
      el.className = 'mh-part mh-main';
      var c = mk('section', 'mh-panel');
      c.appendChild(mk('h3', '', '✅ Clear list'));
      var clear = b.players.filter(function (p) { return p.clear; });
      if (!clear.length) c.appendChild(mk('p', 'mh-empty', 'Nobody yet. A public scan that comes back Clear puts a name here.'));
      var chips = mk('div', 'mh-chips');
      clear.forEach(function (p) { chips.appendChild(M.chip(p)); });
      c.appendChild(chips);
      el.appendChild(c);
      var l = mk('section', 'mh-panel');
      l.appendChild(mk('h3', '', '🧪 Lab log'));
      var ul = mk('ul', 'mh-log');
      (b.log || []).slice(-30).reverse().forEach(function (x) {
        var li = mk('li');
        li.appendChild(mk('span', 't', ago(x.at)));
        var cls = /ALARM|lost|Power cut|A MOLE/.test(x.text) ? 'alarm' : /Clear|Fixed|Not a Mole/.test(x.text) ? 'good' : /teacher/i.test(x.text) ? 'teach' : '';
        li.appendChild(mk('span', cls, x.text));
        ul.appendChild(li);
      });
      l.appendChild(ul);
      el.appendChild(l);
      var r = mk('section', 'mh-panel');
      r.appendChild(mk('h3', '', '📡 Lab radio'));
      var box = mk('div', 'mh-rumors');
      var rumors = (b.rumors || []).slice().reverse();
      if (!rumors.length) box.appendChild(mk('p', 'mh-empty', b.opts.rumors ? 'The first rumor comes soon. Rumors are always true.' : 'Drop a rumor from the bar below. Rumors are always true.'));
      rumors.forEach(function (x, i) {
        var d = mk('div', 'mh-rumor' + (i === 0 && Date.now() - local(x.at) < 20000 ? ' new' : ''));
        d.appendChild(mk('b', '', x.by ? 'A ghost whispers' : 'Rumor ' + x.n));
        d.appendChild(document.createTextNode(x.text));
        box.appendChild(d);
      });
      r.appendChild(box);
      r.appendChild(mk('p', 'mh-next', ''));
      el.appendChild(r);
    });
    order.push(main);
    var cover = drawCover(b);
    if (cover) order.push(cover);
    // Put the parts in order, and take away the ones not showing now.
    [].slice.call(stage.children).forEach(function (n) { if (order.indexOf(n) < 0) n.remove(); });
    order.forEach(function (n) { stage.appendChild(n); });
    drawControls(b);
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 250);
    tick();
    if (was && was.meeting && b.meeting && was.meeting.step !== 'reveal' && b.meeting.step === 'reveal') drum();
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
    if (m.step === 'talk') {
      return part('cover', 'talk' + m.n, function (el) {
        el.className = 'mh-part mh-cover mh-meeting-cover';
        el.appendChild(mk('div', 'ring', '🔔'));
        el.appendChild(mk('h2', '', 'Lab Meeting ' + m.n));
        el.appendChild(mk('p', '', 'Called by ' + m.by + '. Talk it over: who is a Mole? Look at the Clear list and the Lab log.'));
        el.appendChild(mk('p', 'mh-timer-pill mh-meet-left', ''));
        el.appendChild(mk('p', '', 'Voting opens when the time is up, or press Start voting.'));
      });
    }
    if (m.step === 'vote') {
      return part('cover', 'vote' + m.n + '|' + m.votesIn + '|' + m.of, function (el) {
        el.className = 'mh-part mh-cover mh-meeting-cover';
        el.appendChild(mk('div', 'ring', '🗳️'));
        el.appendChild(mk('h2', '', 'Vote on your screen!'));
        el.appendChild(mk('p', 'mh-vote-count', m.votesIn + ' of ' + m.of + ' votes in'));
        el.appendChild(mk('p', 'mh-timer-pill mh-meet-left', ''));
      });
    }
    var r = m.result || {};
    return part('cover', 'reveal' + m.n, function (el) {
      el.className = 'mh-part mh-cover mh-reveal';
      if (r.out) {
        el.appendChild(M.heroImg(r.out.hero, 'big'));
        el.appendChild(mk('p', 'was', r.out.name + ' was...'));
        el.appendChild(mk('p', 'res ' + (r.wasMole ? 'mole' : 'sci'), r.wasMole ? 'A MOLE!' : 'NOT a Mole.'));
      } else {
        el.appendChild(mk('p', 'was', r.tie ? 'It was a tie...' : 'Most of the class skipped...'));
        el.appendChild(mk('p', 'res sci', 'Nobody leaves the lab.'));
      }
      el.appendChild(mk('p', 'left', M.plural(r.molesLeft, 'Mole is', 'Moles are') + ' still in the lab · ' + M.plural(r.meetingsLeft, 'meeting') + ' left'));
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

  function drum() {
    if (music.muted) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ac = drum.ac = drum.ac || new AC();
      for (var i = 0; i < 9; i++) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle';
        o.frequency.value = i === 8 ? 220 : 90 + i * 4;
        var t = ac.currentTime + i * 0.14 + (i === 8 ? 0.15 : 0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime((music.volume / 100) * (i === 8 ? 0.5 : 0.25), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (i === 8 ? 0.5 : 0.12));
        o.connect(g); g.connect(ac.destination);
        o.start(t); o.stop(t + 0.6);
      }
    } catch (e) { /* no sound */ }
  }

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
  }

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
