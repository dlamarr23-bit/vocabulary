/* ============================================================
   Battle Royale: the students' screen (royale/play/#CODE), Donny 2026-10-29.

   Students arrive from the join page (join/ sends a Battle Royale code
   here). They sign in with Class Pass if the teacher needs it, pick a hero
   while the class joins, then each round see who they face (one classmate,
   or up to four, or the ghost of a classmate when they are on their own),
   answer the question on four colored buttons, and see whether they won.
   A student who is eliminated keeps answering to practice, and can be
   revived.

   The game code, the player number it was given and the last hero picked
   are kept in this browser (is8-royale-play-v1), so a student who closes the
   tab gets back in as the same player.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var AV = window.SuperAvatars;
  var STEPS = ['rpCode', 'rpPass', 'rpLobby', 'rpVs', 'rpQ', 'rpResult', 'rpPaused', 'rpDone', 'rpGone'];
  var CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  var COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#e03131'];
  var ws = null, code = '', me = null, leaving = false, retries = 0, pingTimer = null, hello = null, view = null, skew = null;

  function show(id) { STEPS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function status(text) { $('rpStatus').textContent = text || ''; }
  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast(text) {
    var t = $('rpToast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3000);
  }
  function readSaved() {
    try { return JSON.parse(localStorage.getItem('is8-royale-play-v1')) || {}; } catch (e) { return {}; }
  }
  function keep(fn) {
    var s = readSaved();
    fn(s);
    try { localStorage.setItem('is8-royale-play-v1', JSON.stringify(s)); } catch (e) { /* private window */ }
  }
  // A random number for this device, so the teacher's "Remove and block" can
  // keep it out of that one game. It says nothing about the student.
  function device() {
    var s = readSaved();
    if (!/^[0-9a-f]{16,32}$/.test(s.device || '')) {
      var d = [].map.call(crypto.getRandomValues(new Uint8Array(12)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      keep(function (v) { v.device = d; });
      return d;
    }
    return s.device;
  }

  /* ---------------- heroes and HP ---------------- */

  var heroByKey = {};
  (AV ? AV.list : []).forEach(function (h) { heroByKey[h.key] = h; });
  var heroSrc = {};
  function heroURL(key) {
    if (!heroByKey[key]) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="16" y="28" width="168" height="164" rx="30" fill="#c5c9d6"/><text x="100" y="135" font-family="Arial" font-weight="700" font-size="80" fill="#fff" text-anchor="middle">?</text></svg>');
    if (!heroSrc[key]) heroSrc[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(AV.render(heroByKey[key]));
    return heroSrc[key];
  }
  // An eliminated student's hero is grayed out.
  function heroImg(key, cls, gone) {
    var img = mk('img', 'rb-hero' + (cls ? ' ' + cls : '') + (gone ? ' gray' : ''));
    img.alt = heroByKey[key] ? heroByKey[key].name : '';
    img.src = heroURL(key);
    return img;
  }
  // HP as hearts (a number past 6), with the shield beside it when there is one.
  function hp(n, of, shield) {
    var line = mk('span', 'rb-hp-line');
    var box = mk('span', 'rb-hp');
    box.setAttribute('aria-label', n + ' HP');
    if (of > 6 || n > 6) box.textContent = '❤️ ' + n + ' HP';
    else for (var i = 0; i < Math.max(n, of || 0); i++) box.appendChild(mk('span', i < n ? 'on' : 'off', '❤️'));
    line.appendChild(box);
    if (shield) { var s = mk('span', 'rb-shield', '🛡️'); s.title = 'Shield: blocks the next HP you would lose'; line.appendChild(s); }
    return line;
  }
  function fill(el, node) { el.textContent = ''; if (node) el.appendChild(node); }
  function secs(ms) { return (ms / 1000).toFixed(2) + 's'; }
  function ordinal(n) { var t = n % 100, o = n % 10; return n + (t > 10 && t < 14 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); }

  /* ---------------- the code and Class Pass ---------------- */

  function passToken() { return window.IS8Pass ? window.IS8Pass.token() : ''; }

  $('rpCodeInput').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('rpCodeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('rpCodeInput').value.trim().toUpperCase();
    $('rpCodeError').textContent = '';
    if (!CODE.test(c)) { $('rpCodeError').textContent = 'The code is 6 letters and numbers. Check the board and try again.'; return; }
    history.replaceState(null, '', '#' + c);
    start(c);
  });
  $('rpPassBtn').addEventListener('click', function () {
    if (!window.IS8Pass) return;
    var btn = this;
    btn.disabled = true;
    $('rpPassError').textContent = '';
    window.IS8Pass.signIn().then(function () { btn.disabled = false; open(code); }, function (err) {
      btn.disabled = false;
      $('rpPassError').textContent = err.message;
    });
  });

  function start(c) {
    code = c;
    var p = readSaved().player;
    me = p && p.code === c && Date.now() - p.at < 3 * 60 * 60 * 1000 ? { id: p.id, secret: p.secret } : null;
    open(c);
  }

  /* ---------------- the connection ---------------- */

  function open(c) {
    clearInterval(pingTimer);
    if (ws) { var old = ws; old.onopen = old.onmessage = old.onclose = null; try { old.close(); } catch (e) { /* closed */ } }
    leaving = false;
    status('Connecting...');
    var pass = passToken();
    var sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live/' + c + '/ws' + (pass ? '?pass=' + pass : ''));
    ws.onopen = function () {
      if (sock !== ws) return;
      retries = 0;
      status('');
      pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('ping'); }, 15000);
    };
    ws.onmessage = function (e) {
      if (sock !== ws || e.data === 'pong') return;
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      handle(m);
    };
    ws.onclose = function () {
      if (sock !== ws) return;
      clearInterval(pingTimer);
      if (leaving) return;
      retries += 1;
      if (retries > 6 && !me) { status(''); show('rpCode'); $('rpCodeError').textContent = 'Could not reach the game. Check the internet connection.'; return; }
      status('Lost the connection. Trying again...');
      setTimeout(function () { if (!leaving) open(code); }, Math.min(6000, 700 * retries));
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function stop(text) {
    leaving = true;
    if (ws) try { ws.close(); } catch (e) { /* closed */ }
    $('rpGoneText').textContent = text;
    show('rpGone');
  }
  document.addEventListener('visibilitychange', function () { if (me && me.id) send({ t: document.hidden ? 'away' : 'back' }); });

  function heard(serverNow) { var d = serverNow - Date.now(); if (skew === null || d > skew) skew = d; }
  function local(t) { return t - (skew || 0); }

  function handle(m) {
    if (m.t === 'hello') {
      hello = m;
      if (m.kind !== 'royale') { location.replace('../../join/#' + code); return; }
      if (me && me.id) { send({ t: 'rejoin', id: me.id, secret: me.secret }); return; }
      if (m.phase === 'done') { stop('That game is over. Wait for your teacher to start a new one.'); return; }
      if (m.needPass && !passToken()) { show('rpPass'); return; }
      send({ t: 'join', dev: device(), hero: readSaved().hero || '' });
    } else if (m.t === 'me') {
      me = { id: m.id, secret: m.secret, name: m.name };
      keep(function (s) { s.player = { code: m.code, id: m.id, secret: m.secret, at: Date.now() }; });
    } else if (m.t === 'view') {
      heard(m.now);
      keep(function (s) { if (s.player && me && s.player.id === me.id) s.player.at = Date.now(); });
      draw(m);
    } else if (m.t === 'notice') {
      toast(m.msg || '');
      $('rpPickMsg').textContent = m.msg || '';
    } else if (m.t === 'rejoinFailed') {
      keep(function (s) { delete s.player; });
      me = null;
      if (hello) handle(hello);
    } else if (m.t === 'removed' || m.t === 'over') {
      keep(function (s) { delete s.player; });
      stop(m.msg);
    } else if (m.t === 'error') {
      if (m.code === 'needPass') { show('rpPass'); return; }
      leaving = true;
      show('rpCode');
      $('rpCodeError').textContent = m.msg;
    }
  }

  /* ---------------- what the student sees ---------------- */

  var tickTimer = null;
  function draw(v) {
    var was = view;
    view = v;
    clearInterval(tickTimer);
    if (v.phase === 'lobby') { show('rpLobby'); drawLobby(v); return; }
    if (v.phase === 'done') { show('rpDone'); drawDone(v, was); return; }
    if (v.paused) { show('rpPaused'); return; }
    var r = v.round;
    if (!r) { show('rpLobby'); drawLobby(v); return; }
    if (r.stage === 'vs') drawVs(v, r);
    else if (r.stage === 'question') drawQuestion(v, r);
    else if (r.stage === 'results') drawResult(v, r);
    tickTimer = setInterval(tick, 200);
    tick();
  }

  function tick() {
    var v = view;
    if (!v || !v.round || v.paused) return;
    var r = v.round;
    var to = r.stage === 'vs' ? r.qAt : r.stage === 'question' ? r.endsAt : r.nextAt;
    var n = Math.max(0, Math.ceil((local(to) - Date.now()) / 1000));
    if (r.stage === 'vs') $('rpVsRound').textContent = 'Round ' + r.n + ' starts in ' + n;
    if (r.stage === 'question') {
      $('rpTimer').textContent = n;
      $('rpTimer').classList.toggle('low', n <= 5);
    }
  }

  /* -------- picking a hero -------- */

  function drawLobby(v) {
    fill($('rpMeHero'), heroImg(v.hero, 'big'));
    $('rpMeName').textContent = v.name;
    fill($('rpMeEnergy'), hp(v.energy, v.start));
    $('rpWaitText').textContent = v.phase === 'play'
      ? 'The game has started. You join in at the next round.'
      : v.hero ? 'Nice pick! Your teacher will start the game soon. You can still change your hero.' : 'Pick your hero! If you don’t, you get one at random.';
    drawPicker(v);
  }
  // All 50 heroes in one grid (Donny: not split into boys and girls).
  function drawPicker(v) {
    var grid = $('rpGrid');
    grid.textContent = '';
    var taken = v.taken || [];
    var list = AV ? AV.list : [];
    var free = list.filter(function (h) { return taken.indexOf(h.key) < 0; }).length;
    list.forEach(function (h) {
      var mine = v.hero === h.key;
      // Every hero taken: then two may share one.
      var gone = !mine && taken.indexOf(h.key) >= 0 && free > 0;
      var b = mk('button', 'rp-pick' + (mine ? ' mine' : '') + (gone ? ' taken' : ''));
      b.type = 'button';
      b.disabled = gone;
      b.setAttribute('aria-pressed', String(mine));
      b.appendChild(heroImg(h.key));
      b.appendChild(mk('span', 'rp-pick-name', h.name));
      if (gone) b.appendChild(mk('span', 'rp-lock', '🔒'));
      b.addEventListener('click', function () {
        $('rpPickMsg').textContent = '';
        keep(function (s) { s.hero = h.key; });
        send({ t: 'hero', key: h.key });
      });
      grid.appendChild(b);
    });
  }

  /* -------- a round -------- */

  function side(p, energyOf, cls, label) {
    var box = mk('div', 'rp-fighter' + (cls ? ' ' + cls : ''));
    if (!p) { box.appendChild(mk('p', 'rp-fighter-name', label || '')); return box; }
    box.appendChild(heroImg(p.hero, 'big', !!p.out));
    box.appendChild(mk('p', 'rp-fighter-name', label || p.name));
    if (!/ghost/.test(cls || '')) box.appendChild(hp(p.energy, energyOf, p.shield));
    return box;
  }
  function meAsPerson(v) { return { name: v.name, hero: v.hero, energy: v.energy, shield: v.shield, out: v.out }; }
  // An eliminated student: how close they are to being revived.
  function reviveNote(v) {
    if (!v.comeback) return v.out ? 'You are eliminated, but keep answering to practice!' : '';
    return 'You are eliminated. Get ' + v.comeback.need + ' practice questions right in a row to be revived: ' + v.comeback.run + ' of ' + v.comeback.need + ' so far!';
  }
  // Who I face: one classmate big, several smaller, or a ghost.
  function drawFoes(box, v, r) {
    box.textContent = '';
    if (r.role === 'ghost' && r.ghost) { box.appendChild(side(r.ghost, v.start, 'ghost', '👻 Ghost of ' + r.ghost.name)); return; }
    if (r.role !== 'match') return;
    var many = r.others.length > 1;
    box.classList.toggle('rp-many', many);
    r.others.forEach(function (p) { box.appendChild(side(p, v.start, many ? 'small' : '')); });
  }

  function drawVs(v, r) {
    show('rpVs');
    var screen = $('rpVs');
    screen.classList.toggle('practice', r.role === 'practice');
    fill($('rpVsMe'), side(meAsPerson(v), v.start));
    drawFoes($('rpVsThem'), v, r);
    var note = '';
    if (r.role === 'ghost') note = 'You battle a ghost this round: beat ' + (r.ghost ? r.ghost.name + '’s' : 'their') + ' answer to win.';
    else if (r.role === 'match' && r.others.length > 1) note = (r.others.length + 1) + ' heroes face off: the fastest right answer wins!';
    else if (r.role === 'practice') note = v.out ? reviveNote(v) : 'You join the battle next round. Practice this one!';
    screen.querySelector('.rp-vs-word').hidden = r.role === 'practice';
    if (!note && v.shieldOn && !v.shield && v.streak) note = 'Win ' + (v.shieldRun - v.streak) + ' more in a row for a shield!';
    $('rpVsNote').textContent = note || (r.last ? '' : v.left + ' heroes left');
  }

  var shownQ = '';
  function drawQuestion(v, r) {
    show('rpQ');
    $('rpQTag').textContent = r.role === 'practice' ? 'Practice'
      : r.role === 'ghost' ? 'Round ' + r.n + ' vs a ghost'
        : 'Round ' + r.n + ' vs ' + (r.others.length > 1 ? r.others.length + ' heroes' : r.others[0] ? r.others[0].name : '');
    fill($('rpQEnergy'), r.role === 'practice' ? null : hp(v.energy, v.start, v.shield));
    var key = r.n + '|' + r.q.text;
    if (shownQ !== key) {
      shownQ = key;
      $('rpQText').textContent = r.q.text;
      var img = $('rpQImg');
      img.hidden = !r.q.img;
      if (r.q.img) img.src = r.q.img; else img.removeAttribute('src');
      var box = $('rpAnswers');
      box.textContent = '';
      r.q.opts.forEach(function (o, i) {
        var pic = (r.q.imgs || [])[i];
        var b = mk('button', 'rp-answer' + (pic ? ' has-img' : ''));
        b.type = 'button';
        b.style.setProperty('--tile', COLORS[i % 4]);
        if (pic) { var im = mk('img', 'rp-answer-img'); im.alt = o || 'Answer ' + (i + 1); im.src = pic; im.referrerPolicy = 'no-referrer'; b.appendChild(im); }
        if (o) b.appendChild(mk('span', 'rp-answer-text', o));
        b.addEventListener('click', function () {
          if (view && view.round && view.round.mine) return;
          [].forEach.call(box.querySelectorAll('button'), function (x) { x.disabled = true; });
          b.classList.add('picked');
          send({ t: 'answer', k: i, round: r.n });
        });
        box.appendChild(b);
      });
    }
    var answered = !!r.mine;
    [].forEach.call($('rpAnswers').querySelectorAll('button'), function (b, i) {
      b.disabled = answered || Date.now() < local(r.qAt);
      b.classList.toggle('picked', answered && r.mine.k === i);
    });
    $('rpSent').hidden = !answered;
    $('rpSentNote').textContent = r.role === 'match' && r.others.length === 1 ? 'Waiting for ' + r.others[0].name + '...' : 'Waiting for the others...';
  }

  function drawResult(v, r) {
    show('rpResult');
    var banner = $('rpBanner');
    var word, cls;
    if (r.back) { word = 'Revived!'; cls = 'win'; }
    else if (r.role === 'practice') { word = r.ok ? 'Correct!' : 'Not this time'; cls = r.ok ? 'win' : 'lose'; }
    else if (r.knockedOut) { word = 'Eliminated'; cls = 'out'; }
    else if (r.blocked) { word = 'Shield saved you!'; cls = 'win'; }
    else if (r.won) { word = 'Victory!'; cls = 'win'; }
    else if (r.lost && r.role === 'match' && !r.anyRight) { word = r.others.length > 1 ? 'Nobody got it' : 'Both missed'; cls = 'lose'; }
    else if (r.lost) { word = 'Defeated'; cls = 'lose'; }
    else { word = 'Safe'; cls = 'win'; }
    banner.textContent = word;
    banner.className = 'rp-banner ' + cls;
    var vs = $('rpResultVs');
    vs.textContent = '';
    var how = function (ok, ms, answered) { return ok ? '✔ ' + secs(ms) : answered ? '✖ wrong' : '✖ no answer'; };
    var mine = mk('div', 'rp-res-side' + (r.won || (r.role === 'practice' && r.ok) ? ' won' : r.lost ? ' lost' : ''));
    mine.appendChild(heroImg(v.hero, '', !!v.out));
    mine.appendChild(mk('span', 'rp-res-name', 'You'));
    mine.appendChild(mk('span', 'rp-res-how', how(r.ok, r.mine ? r.mine.ms : 0, !!r.mine)));
    vs.appendChild(mine);
    var foes = r.role === 'ghost' && r.ghost ? [r.ghost] : r.role === 'match' ? r.others : [];
    if (foes.length) vs.appendChild(mk('span', 'rp-vs-small', 'VS'));
    foes.forEach(function (p) {
      var ghost = r.role === 'ghost';
      var them = mk('div', 'rp-res-side' + (ghost ? ' ghost' : '') + (!r.won && p.ok ? ' won' : ' lost'));
      them.appendChild(heroImg(p.hero, '', !ghost && !!p.out));
      them.appendChild(mk('span', 'rp-res-name', ghost ? '👻 Ghost of ' + p.name : p.name));
      them.appendChild(mk('span', 'rp-res-how', how(p.ok, p.ms, p.answered)));
      vs.appendChild(them);
    });
    var right = r.c >= 0 && r.q ? (r.q.opts[r.c] || 'the picture answer') : '';
    $('rpAnswerWas').textContent = right ? 'The answer was: ' + right : '';
    fill($('rpResultEnergy'), r.role === 'practice' && v.out ? null : hp(v.energy, v.start, v.shield));
    $('rpResultNote').textContent = r.back ? '3 right in a row! You are revived and back in the battle next round with 1 HP.'
      : r.knockedOut || (v.out && r.role === 'practice') ? reviveNote(v)
        : r.earned ? 'You won 3 in a row and earned a shield! It blocks the next HP you would lose.'
          : r.blocked ? 'Your shield blocked the lost HP. It is used up now.'
            : r.sudden ? 'Sudden death: nobody is eliminated this round.'
              : r.last ? 'That was the last round.' : v.left + ' heroes left.';
  }

  /* -------- the end -------- */

  function drawDone(v, was) {
    var d = v.done || {};
    fill($('rpDoneHero'), heroImg(v.hero, 'big'));
    $('rpDoneText').textContent = d.place === 1 ? 'You won! 1st place!' : d.place ? 'You came ' + ordinal(d.place) + ' of ' + d.of + '.' : 'The game is over.';
    var pod = $('rpPodium');
    pod.textContent = '';
    (d.podium || []).forEach(function (p) {
      var li = mk('li', 'rb-step rb-step-' + p.place + (p.mine ? ' mine' : ''));
      li.appendChild(heroImg(p.hero));
      li.appendChild(mk('span', 'rb-step-name', p.name));
      li.appendChild(mk('span', 'rb-step-wins', p.wins + (p.wins === 1 ? ' win' : ' wins')));
      li.appendChild(mk('span', 'rb-step-place', ordinal(p.place)));
      pod.appendChild(li);
    });
    var more = d.right + (d.right === 1 ? ' right answer' : ' right answers') + ' and ' + v.wins + (v.wins === 1 ? ' win.' : ' wins.');
    if (d.avg) more += ' Your average right answer took ' + secs(d.avg) + '.';
    if (d.practice && (d.practice.right || d.practice.wrong)) more += ' After you were eliminated you got ' + d.practice.right + ' of ' + (d.practice.right + d.practice.wrong) + ' practice questions right.';
    $('rpDoneMore').textContent = more;
    if (was && was.phase === 'play' && d.place === 1 && window.IS8Celebrate) try { IS8Celebrate.start({}); } catch (e) { /* only confetti */ }
  }

  /* ---------------- off we go ---------------- */

  var c0 = location.hash.slice(1).toUpperCase();
  if (CODE.test(c0)) start(c0);
  else show('rpCode');
  // A new game's link opened on this same page: join that game.
  window.addEventListener('hashchange', function () {
    var c = location.hash.slice(1).toUpperCase();
    if (CODE.test(c) && c !== code) start(c);
  });
})();
