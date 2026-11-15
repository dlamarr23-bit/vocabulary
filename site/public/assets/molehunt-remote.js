/* ============================================================
   Mole Hunt: the Teacher Remote (molehunt/remote/#CODE), Donny 2026-11-15.

   The teacher scans the QR code on the projector (the Remote button) with a
   phone and signs in with the teacher password. The site then hands this
   page the game's host key (api/live/<code>/remote), and it joins the game
   as a second teacher screen that alone is sent who the Moles are and the
   true log (fake scans marked). It has the projector's controls, plus +5
   energy, freeze and remove for one student.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var M = window.MH;
  var mk = M.mk;
  var ED = window.IS8Editor;
  var CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  var ws = null, code = '', key = '', board = null, retries = 0, pingTimer = null, skew = null, leaving = false;
  var tab = 'players', openId = '';

  function toast(text) {
    var t = $('mrToast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3000);
  }
  function status(text) { $('mrStatus').textContent = text || ''; }
  function heard(serverNow) { var d = serverNow - Date.now(); if (skew === null || d > skew) skew = d; }
  function local(t) { return t - (skew || 0); }

  function gate() {
    if (!ED) { $('mrGateText').textContent = 'This page did not load properly. Reload it to try again.'; return; }
    ED.session().then(function (s) {
      if (!s.editor) {
        $('mrGateText').textContent = 'Sign in with the teacher password. Only the teacher can open the remote.';
        ED.signInForm($('mrSignIn'), function () { $('mrSignIn').textContent = ''; pickCode(); });
      } else pickCode();
    });
  }
  function pickCode() {
    var c = location.hash.slice(1).toUpperCase();
    if (CODE.test(c)) { begin(c); return; }
    $('mrGateText').textContent = 'Type the game code from the board.';
    $('mrCodeForm').hidden = false;
  }
  $('mrCodeInput').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('mrCodeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('mrCodeInput').value.trim().toUpperCase();
    if (!CODE.test(c)) { $('mrError').textContent = 'The code is 6 letters and numbers.'; return; }
    history.replaceState(null, '', '#' + c);
    begin(c);
  });
  function begin(c) {
    code = c;
    $('mrError').textContent = '';
    $('mrGateText').textContent = 'Opening the remote...';
    fetch('/api/live/' + c + '/remote', { headers: { 'X-IS8-Editor': '1' }, credentials: 'same-origin' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.hostKey) throw new Error(d.error || 'That game could not be found.');
        if (d.kind !== 'molehunt') throw new Error('That code is not a Mole Hunt game.');
        return d;
      });
    }).then(function (d) {
      key = d.hostKey;
      connect();
    }, function (err) {
      $('mrGateText').textContent = 'Type the game code from the board.';
      $('mrCodeForm').hidden = false;
      $('mrError').textContent = err.message;
    });
  }

  function connect() {
    clearInterval(pingTimer);
    if (ws) { var old = ws; old.onopen = old.onmessage = old.onclose = null; try { old.close(); } catch (e) { /* closed */ } }
    status('Connecting...');
    var sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live/' + code + '/ws?host=' + encodeURIComponent(key) + '&remote=1');
    ws.onopen = function () { if (sock !== ws) return; retries = 0; status(''); pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000); };
    ws.onmessage = function (e) {
      if (sock !== ws || e.data === 'pong') return;
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'board') draw(m);
      else if (m.t === 'over' || m.t === 'error') { leaving = true; $('mrMain').hidden = true; $('mrGate').hidden = false; $('mrGateText').textContent = m.msg || 'The game is over.'; }
    };
    ws.onclose = function () {
      if (sock !== ws || leaving) return;
      clearInterval(pingTimer);
      retries += 1;
      status('Lost the connection. Trying again...');
      setTimeout(connect, Math.min(6000, 700 * retries));
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function twice(btn, ask, go) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('armed')) { btn.classList.remove('armed'); go(); return; }
      var was = btn.innerHTML;
      btn.classList.add('armed');
      btn.textContent = ask;
      setTimeout(function () { if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.innerHTML = was; } }, 3500);
    });
  }

  var tickTimer = null;
  function draw(b) {
    board = b;
    heard(b.now);
    $('mrGate').hidden = true;
    $('mrMain').hidden = false;
    var st = b.stats || {};
    var stats = $('mrStats');
    stats.textContent = '';
    if (b.phase === 'lobby') stats.appendChild(mk('p', 'lv-small', 'Waiting in the lobby: ' + M.plural(b.players.length, 'student') + ' joined. Start the game on the big screen.'));
    else [['red', st.molesLeft, 'Moles'], ['', st.meetingsLeft, 'Meetings'], ['mint', st.scansLeft, 'Scans'], ['', st.alive, 'In the lab']].forEach(function (x) {
      var s = mk('div', 'mh-stat ' + x[0]);
      s.appendChild(mk('b', '', String(x[1])));
      s.appendChild(mk('span', '', x[2]));
      stats.appendChild(s);
    });
    drawClock(b);
    drawCtrl(b);
    drawTabs();
    drawBody(b);
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 500);
    tick();
  }
  function drawClock(b) {
    var box = $('mrClock');
    if (box.dataset.key === String(!!b.endsAt) + b.phase) return;
    box.dataset.key = String(!!b.endsAt) + b.phase;
    box.textContent = '';
    if (b.phase !== 'play') return;
    if (b.endsAt) {
      var minus = mk('button', 'mh-tb', '−1 min');
      minus.type = 'button';
      minus.addEventListener('click', function () { send({ t: 'time', seconds: -60 }); });
      var plus = mk('button', 'mh-tb', '+1 min');
      plus.type = 'button';
      plus.addEventListener('click', function () { send({ t: 'time', seconds: 60 }); });
      box.appendChild(minus);
      box.appendChild(mk('span', 'mh-clock mr-clock', ''));
      box.appendChild(plus);
    } else {
      box.appendChild(mk('span', 'mh-clock none', 'No time limit'));
      var sel = mk('select');
      [['', 'Set the clock...'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes']].forEach(function (x) { var o = mk('option', '', x[1]); o.value = String(x[0]); sel.appendChild(o); });
      sel.addEventListener('change', function () { if (sel.value) send({ t: 'clock', minutes: Number(sel.value) }); });
      box.appendChild(sel);
    }
  }
  function drawCtrl(b) {
    var box = $('mrCtrl');
    var m = b.meeting;
    var k = JSON.stringify([b.phase, b.stage, b.paused, m && m.step]);
    if (box.dataset.key === k) return;
    box.dataset.key = k;
    box.textContent = '';
    if (b.phase !== 'play') return;
    var work = b.stage === 'work' && !b.paused;
    function btn(icon, label, cls, enabled, fn) {
      var x = mk('button', 'mh-cb ' + (cls || ''));
      x.type = 'button';
      x.innerHTML = '<span aria-hidden="true">' + icon + '</span>' + label;
      x.disabled = !enabled;
      if (fn) x.addEventListener('click', fn);
      box.appendChild(x);
      return x;
    }
    btn('🔔', 'Meeting', 'hot', work, function () { send({ t: 'meeting' }); });
    btn(b.paused ? '▶️' : '⏸️', b.paused ? 'Resume' : 'Pause', '', true, function () { send({ t: b.paused ? 'resume' : 'pause' }); });
    btn('📡', 'Rumor', 'hot', work, function () { send({ t: 'rumor', kind: '' }); toast('Rumor dropped!'); });
    btn('⚡', '+5 all', '', !b.paused, function () { send({ t: 'boost' }); toast('+5 energy for everyone!'); });
    btn('➕', '+1 meeting', 'on', true, function () { send({ t: 'addMeeting' }); toast('Added a meeting.'); });
    if (b.stage === 'story') btn('⏭️', 'Skip story', '', true, function () { send({ t: 'skipStory' }); });
    else btn(m && m.step === 'vote' ? '⏭️' : m && m.step === 'reveal' ? '▶️' : '🗳️', m && m.step === 'vote' ? 'End vote' : m && m.step === 'reveal' ? 'Back to lab' : 'Start vote', '', !!m && !b.paused, function () {
      var mm = board.meeting;
      if (mm) send({ t: mm.step === 'talk' ? 'startVote' : mm.step === 'vote' ? 'endVote' : 'nextReveal' });
    });
    var end = btn('🏁', 'End now', 'red', true);
    twice(end, 'Tap again', function () { send({ t: 'end' }); });
  }
  function drawTabs() {
    var box = $('mrTabs');
    box.textContent = '';
    [['players', 'Players'], ['log', 'True log']].forEach(function (x) {
      var b = mk('button', 'mh-tab', x[1]);
      b.type = 'button';
      b.setAttribute('aria-selected', String(tab === x[0]));
      b.addEventListener('click', function () { tab = x[0]; drawTabs(); drawBody(board); });
      box.appendChild(b);
    });
  }
  function drawBody(b) {
    var body = $('mrBody');
    body.textContent = '';
    if (tab === 'log') {
      var ul = mk('ul', 'mh-truth');
      (b.truth || []).slice().reverse().forEach(function (x) {
        var li = mk('li', x.secret ? 'secret' : '');
        li.appendChild(mk('span', 'lv-small', M.clock(x.at) + ' '));
        li.appendChild(document.createTextNode(x.text));
        if (/FAKE/.test(x.text)) li.appendChild(mk('span', 'mh-tag', 'FAKE'));
        else if (x.secret) li.appendChild(mk('span', 'mh-tag', 'secret'));
        ul.appendChild(li);
      });
      if (!(b.truth || []).length) ul.appendChild(mk('li', '', 'Nothing yet.'));
      body.appendChild(ul);
      return;
    }
    var list = b.players.slice().sort(function (x, y) { return (x.role === 'mole' ? 0 : 1) - (y.role === 'mole' ? 0 : 1) || (y.alive ? 1 : 0) - (x.alive ? 1 : 0) || x.name.localeCompare(y.name); });
    list.forEach(function (p) {
      var row = mk('div', 'mh-prow' + (p.alive === false ? ' out' : ''));
      row.appendChild(M.heroImg(p.hero, '', p.alive === false));
      row.appendChild(mk('span', 'nm', p.name));
      if (p.role) row.appendChild(mk('span', 'mh-badge ' + (p.role === 'mole' ? 'm' : 's'), (p.job && M.JOBS[p.job] ? M.JOBS[p.job].name : p.role === 'mole' ? 'Mole' : 'Scientist')));
      if (p.ghost) row.appendChild(mk('span', 'mh-badge', '👻'));
      if (p.smudged) row.appendChild(mk('span', 'mh-badge m', 'smudged'));
      if (p.disguise) row.appendChild(mk('span', 'mh-badge m', 'disguised'));
      if (p.frozen) row.appendChild(mk('span', 'mh-badge', '🧊'));
      if (p.slow) row.appendChild(mk('span', 'mh-badge', '🐢'));
      else if (p.slowed) row.appendChild(mk('span', 'lv-small', '🐢' + p.slowed));
      if (!p.on && !p.bot) row.appendChild(mk('span', 'lv-small', '(away)'));
      if (p.energy != null) row.appendChild(mk('span', 'e', p.alive ? '⚡ ' + p.energy : p.ghost ? 'jar ' + p.jar : ''));
      row.addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') return; openId = openId === p.id ? '' : p.id; drawBody(board); });
      if (openId === p.id && b.phase === 'play') {
        var acts = mk('div', 'mh-acts');
        var give = mk('button', 'y', '+5 ⚡');
        give.type = 'button';
        give.addEventListener('click', function () { send({ t: 'give', id: p.id }); toast('Gave ' + p.name + ' 5 energy.'); });
        var fr = mk('button', 'f', p.frozen ? 'Unfreeze' : 'Freeze 30 s');
        fr.type = 'button';
        fr.setAttribute('aria-pressed', String(!!p.frozen));
        fr.addEventListener('click', function () { send({ t: 'freeze', id: p.id }); });
        var rm = mk('button', 'r', 'Remove');
        rm.type = 'button';
        twice(rm, 'Sure?', function () { send({ t: 'kick', id: p.id }); });
        acts.appendChild(give);
        acts.appendChild(fr);
        acts.appendChild(rm);
        row.appendChild(acts);
      }
      body.appendChild(row);
    });
  }
  function tick() {
    var b = board;
    var c = document.querySelector('.mr-clock');
    if (!b || !c || !b.endsAt) return;
    var now = b.paused ? local(b.pausedAt) : Date.now();
    c.textContent = M.clock(b.stage === 'story' && b.storyEndsAt ? b.endsAt - b.storyEndsAt : local(b.endsAt) - now);
  }

  gate();
})();
