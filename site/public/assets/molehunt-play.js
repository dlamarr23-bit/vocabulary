/* ============================================================
   Mole Hunt: the students' screen (molehunt/play/#CODE), Donny 2026-11-15.

   Students arrive from the join page (join/ sends a Mole Hunt code here),
   sign in with Class Pass if the teacher needs it, and pick a superhero, just
   like Battle Royale. When the game starts they cover their screen and tap to
   see their secret role. Then, until a Lab Meeting:
   - Questions: one after another; a right answer is energy. A missed one
     comes back later worth double (Second Chance), streaks earn bonuses.
   - Lab tools: everyone scans, peeks and calls meetings; behind the Secret
     tools button (on every screen) Moles fake scans, cut scans, smudge,
     disguise, cut the power and sound alarms.
   - Evidence Board: drag classmates into Trust, Not sure and Suspect; every
     scan and clue pins itself on as a card; notes made with taps ("I think
     ___ is a Mole because my scan said Not sure"), no typing.
   - Missions: three secret side quests a round, and badges.
   The role, the Lab tools, the Missions and the fellow Moles stay covered
   until the student taps to see them (2026-11-18), so every screen looks
   the same from across the room.
   At a meeting they talk, then vote with a reason. A student voted out
   becomes a ghost: they keep answering to fill a jar of energy for their team.
   The game code, the player number and the hero picked are kept in this
   browser (is8-molehunt-play-v1), so a student who closes the tab gets back in.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var M = window.MH;
  var mk = M.mk;
  var AV = window.SuperAvatars;
  var STEPS = ['mpCode', 'mpPass', 'mpName', 'mpLobby', 'mpGame', 'mpPaused', 'mpDone', 'mpGone'];
  var CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  // Marker colors from the notebook look (no green or red, which mean right and wrong).
  var COLORS = ['#2a60c4', '#0d7f8c', '#7343b8', '#b8327a'];
  var SAVE = 'is8-molehunt-play-v1';
  var ws = null, code = '', me = null, leaving = false, retries = 0, pingTimer = null, hello = null, view = null, skew = null;

  document.body.classList.add('mh-body');
  function show(id) {
    STEPS.forEach(function (s) { $(s).hidden = s !== id; });
    document.body.setAttribute('data-mh-step', id);
  }
  function status(text) { $('mpStatus').textContent = text || ''; }
  function toast(text) {
    var t = $('mpToast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function readSaved() { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch (e) { return {}; } }
  function keep(fn) { var s = readSaved(); fn(s); try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch (e) { /* private window */ } }
  function device() {
    var s = readSaved();
    if (!/^[0-9a-f]{16,32}$/.test(s.device || '')) {
      var d = [].map.call(crypto.getRandomValues(new Uint8Array(12)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      keep(function (v) { v.device = d; });
      return d;
    }
    return s.device;
  }

  /* ---------------- the code and Class Pass ---------------- */

  function passToken() { return window.IS8Pass ? window.IS8Pass.token() : ''; }
  $('mpCodeInput').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('mpCodeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('mpCodeInput').value.trim().toUpperCase();
    $('mpCodeError').textContent = '';
    if (!CODE.test(c)) { $('mpCodeError').textContent = 'The code is 6 letters and numbers. Check the board and try again.'; return; }
    history.replaceState(null, '', '#' + c);
    start(c);
  });
  $('mpPassBtn').addEventListener('click', function () {
    if (!window.IS8Pass) return;
    var btn = this;
    btn.disabled = true;
    $('mpPassError').textContent = '';
    window.IS8Pass.signIn().then(function () { btn.disabled = false; open(code); }, function (err) {
      btn.disabled = false;
      $('mpPassError').textContent = err.message;
    });
  });
  var asGuest = false;
  function passStep() {
    $('mpPassTitle').textContent = 'Mole Hunt';
    $('mpGuestBox').hidden = !(hello && hello.guests);
    show('mpPass');
  }
  function nameStep() {
    $('mpNameError').textContent = '';
    $('mpNameBtn').disabled = false;
    $('mpNameBtn').textContent = 'Join game';
    show('mpName');
    $('mpNick').focus();
  }
  $('mpGuestBtn').addEventListener('click', function () { asGuest = true; nameStep(); });
  $('mpNameForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('mpNameError').textContent = '';
    $('mpNameBtn').disabled = true;
    $('mpNameBtn').textContent = 'Checking your name...';
    send({ t: 'join', dev: device(), hero: readSaved().hero || '', name: $('mpNick').value });
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
      if (retries > 6 && !me) { status(''); show('mpCode'); $('mpCodeError').textContent = 'Could not reach the game. Check the internet connection.'; return; }
      status('Lost the connection. Trying again...');
      setTimeout(function () { if (!leaving) open(code); }, Math.min(6000, 700 * retries));
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }
  function stop(text) {
    leaving = true;
    if (ws) try { ws.close(); } catch (e) { /* closed */ }
    $('mpGoneText').textContent = text;
    show('mpGone');
  }
  document.addEventListener('visibilitychange', function () { if (me && me.id) send({ t: document.hidden ? 'away' : 'back' }); });
  function heard(serverNow) { var d = serverNow - Date.now(); if (skew === null || d > skew) skew = d; }
  function local(t) { return t - (skew || 0); }

  function handle(m) {
    if (m.t === 'hello') {
      hello = m;
      if (m.kind !== 'molehunt') { location.replace('../../join/#' + code); return; }
      if (me && me.id) { send({ t: 'rejoin', id: me.id, secret: me.secret }); return; }
      if (m.phase === 'done') { stop('That game is over. Wait for your teacher to start a new one.'); return; }
      if (!passToken() && (m.needPass || (m.guests && !asGuest))) { passStep(); return; }
      if (!passToken() && m.guests) { nameStep(); return; }
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
      // An answer the game did not take (sent too soon): the buttons work again.
      if (answered) { answered = null; if (view) { pane('q').dataset.key = ''; drawGame(view); } }
      if (view && view.phase === 'lobby') $('mpPickMsg').textContent = m.msg || '';
    } else if (m.t === 'rejoinFailed') {
      keep(function (s) { delete s.player; });
      me = null;
      if (hello) handle(hello);
    } else if (m.t === 'removed' || m.t === 'over') {
      keep(function (s) { delete s.player; });
      stop(m.msg);
    } else if (m.t === 'nameError') {
      nameStep();
      $('mpNameError').textContent = m.msg;
      $('mpNick').select();
    } else if (m.t === 'error') {
      if (m.code === 'needPass') { passStep(); return; }
      leaving = true;
      show('mpCode');
      $('mpCodeError').textContent = m.msg;
    }
  }

  /* ---------------- drawing ---------------- */

  var tickTimer = null;
  var tab = 'q';
  function draw(v) {
    var was = view;
    view = v;
    clearInterval(tickTimer);
    if (v.phase !== 'play' && secretOpen) shut();
    if (v.phase === 'lobby') { show('mpLobby'); drawLobby(v); return; }
    if (v.phase === 'done') { show('mpDone'); drawDone(v, was); return; }
    if (v.paused) { show('mpPaused'); return; }
    show('mpGame');
    drawGame(v, was);
    tickTimer = setInterval(tick, 250);
    tick();
  }

  /* -------- the lobby: picking a hero -------- */

  function drawLobby(v) {
    var hero = $('mpMeHero');
    hero.textContent = '';
    hero.appendChild(M.heroImg(v.hero, 'big'));
    $('mpMeName').textContent = v.name;
    $('mpWaitText').textContent = v.hero ? 'Nice pick! Your teacher will start the game soon. You can still change your hero.' : 'Pick your hero! If you don’t, you get one at random.';
    var grid = $('mpGrid');
    grid.textContent = '';
    var taken = v.taken || [];
    var list = AV ? AV.list : [];
    var free = list.filter(function (h) { return taken.indexOf(h.key) < 0; }).length;
    list.forEach(function (h) {
      var mine = v.hero === h.key;
      var gone = !mine && taken.indexOf(h.key) >= 0 && free > 0;
      var b = mk('button', 'rp-pick' + (mine ? ' mine' : '') + (gone ? ' taken' : ''));
      b.type = 'button';
      b.disabled = gone;
      b.setAttribute('aria-pressed', String(mine));
      b.appendChild(M.heroImg(h.key));
      b.appendChild(mk('span', 'rp-pick-name', h.name));
      if (gone) b.appendChild(mk('span', 'rp-lock', '🔒'));
      b.addEventListener('click', function () {
        $('mpPickMsg').textContent = '';
        keep(function (s) { s.hero = h.key; });
        send({ t: 'hero', key: h.key });
      });
      grid.appendChild(b);
    });
  }

  /* -------- the game -------- */

  // Keyed parts: drawn again only when what they show changes.
  function part(box, key, build) {
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.textContent = '';
    build(box);
  }
  function seenKey() { return code + '|' + (view && view.me) + '|' + (view && view.role) + '|' + (view && view.job); }
  function roleSeen() { return readSaved().seen === seenKey(); }

  // Secrets stay covered until the student taps to see them (Donny,
  // 2026-11-18: "It should be hidden by default and then they can check when
  // they are positioning their computers away from others"): the role, the
  // Lab tools and Missions (a Mole's are different), scan results, and who
  // the fellow Moles are. Until a tap, every student's screen looks the same.
  // They cover again after 20 seconds without a tap, on the Questions tab,
  // and when a meeting starts, moves on to the vote, or ends.
  var SECRET_MS = 20000;
  var secretOpen = false, secretUntil = 0, secretTimer = null, popSecret = false, meetAt = '';
  function armSecret() {
    secretUntil = Date.now() + SECRET_MS;
    clearTimeout(secretTimer);
    secretTimer = setTimeout(closeSecret, SECRET_MS);
  }
  function openSecret() {
    secretOpen = true;
    armSecret();
    redrawAll();
  }
  function shut() {
    clearTimeout(secretTimer);
    secretOpen = false;
    picking = '';
    drawer = false;
    if (popSecret) { $('mpPopBack').hidden = true; popSecret = false; }
  }
  function closeSecret() {
    if (!secretOpen) return;
    shut();
    redrawAll();
  }
  function redrawAll() {
    if (!view || view.phase !== 'play') return;
    Object.keys(panes).forEach(function (k) { panes[k].dataset.key = ''; });
    $('mpBar').dataset.key = '';
    $('mpOverlay').dataset.key = '';
    drawGame(view);
  }
  // Any tap while the secrets show keeps them up a while longer.
  document.addEventListener('click', function () { if (secretOpen) armSecret(); }, true);
  // The same covered box on every student's screen, Scientist or Mole.
  function lockBox(title, btn, note) {
    var box = mk('div', 'mh-lock');
    box.appendChild(mk('div', 'ic', '🔒'));
    box.appendChild(mk('h3', '', title));
    box.appendChild(mk('p', '', 'Turn your screen so nobody else can see it, then tap the button. It covers up again by itself.'));
    var b = mk('button', 'btn lv-big', '👀 ' + btn);
    b.type = 'button';
    b.addEventListener('click', openSecret);
    box.appendChild(b);
    if (note) box.appendChild(mk('p', 'lv-small', note));
    return box;
  }

  function drawGame(v, was) {
    var at = v.meeting ? v.meeting.n + ':' + v.meeting.step : '';
    if (at !== meetAt) { meetAt = at; if (secretOpen) shut(); }
    drawBar(v);
    drawBanners(v);
    drawTabs(v);
    drawPanes(v);
    drawOverlay(v);
    drawPop(v);
    if (was && was.energy != null && v.energy > was.energy) {
      var en = document.querySelector('.mh-en');
      if (en) { en.classList.remove('bump'); void en.offsetWidth; en.classList.add('bump'); }
    }
  }

  function drawBar(v) {
    part($('mpBar'), JSON.stringify([v.name, v.hero, v.role, v.job, v.alive, v.ghost, secretOpen, v.energy, v.jar, v.streak, !!v.endsAt]), function (el) {
      var who = mk('span', 'who');
      who.appendChild(M.heroImg(v.hero, '', !v.alive));
      who.appendChild(mk('span', '', v.name));
      el.appendChild(who);
      var r = mk('button', 'mh-role ' + (secretOpen ? (v.ghost ? 'ghost' : v.role) : 'hidden'));
      r.type = 'button';
      r.title = secretOpen ? 'Tap to cover your role now' : 'Make sure nobody can see your screen, then tap';
      r.textContent = secretOpen ? (v.ghost ? 'Ghost ' : '') + (v.role === 'mole' ? 'Mole (secret)' : 'Scientist') + (v.job && M.JOBS[v.job] ? ' · ' + M.JOBS[v.job].name : '') : '🔒 Tap to see your role';
      if (secretOpen) r.appendChild(mk('span', 'mh-hide-left', ''));
      r.addEventListener('click', function () { if (secretOpen) closeSecret(); else openSecret(); });
      el.appendChild(r);
      el.appendChild(mk('span', 'grow'));
      if (v.streak >= 2 && v.opts.second) el.appendChild(mk('span', 'mh-streak', '🔥 ' + v.streak + ' in a row'));
      el.appendChild(mk('span', 'mh-en', v.alive ? '⚡ ' + v.energy : '👻 Jar ' + v.jar));
      if (v.endsAt) el.appendChild(mk('span', 'mh-mini-clock', ''));
    });
  }

  function drawBanners(v) {
    var e = v.emergency;
    var r = (v.rumors || [])[v.rumors.length - 1];
    var fresh = r && Date.now() - local(r.at) < 40000;
    part($('mpBanners'), JSON.stringify([e && [e.kind, e.got, e.need], fresh && r.n, v.power && Math.round(100 * v.power.got / v.power.goal)]), function (el) {
      if (e) {
        var b = mk('div', 'mh-banner alarm');
        // The same words on every screen, so the banner gives no Mole away.
        b.appendChild(mk('span', '', (M.EMERGENCY[e.kind] || '🚨') + ' ' + e.name + '! Every right answer helps fix it.'));
        var bar = mk('span', 'bar');
        var i = mk('i');
        i.style.width = Math.min(100, Math.round(100 * e.got / e.need)) + '%';
        bar.appendChild(i);
        b.appendChild(bar);
        b.appendChild(mk('span', '', e.got + ' / ' + e.need));
        b.appendChild(mk('span', 'mh-alarm-left', ''));
        el.appendChild(b);
      }
      if (fresh) el.appendChild(mk('div', 'mh-banner rumor', '📡 ' + (r.by ? 'A ghost whispers: ' : 'Rumor ' + r.n + ': ') + r.text));
      if (v.power) {
        var p = mk('div', 'mh-banner power');
        p.appendChild(mk('span', '', '⚡ Lab Power'));
        var bar2 = mk('span', 'bar');
        var f = mk('i');
        f.style.width = Math.round(100 * v.power.got / v.power.goal) + '%';
        bar2.appendChild(f);
        p.appendChild(bar2);
        p.appendChild(mk('span', '', Math.round(100 * v.power.got / v.power.goal) + '%'));
        el.appendChild(p);
      }
    });
  }

  function tabsFor(v) {
    var list = [['q', v.alive ? 'Questions' : 'Questions (fill your jar)']];
    if (v.alive) list.push(['tools', 'Lab tools']);
    else if (v.ghost) list.push(['ghost', 'Ghost Lab']);
    list.push(['board', 'Evidence board']);
    if (v.opts.missions && (v.missions || []).length) list.push(['missions', 'Missions']);
    return list;
  }
  function drawTabs(v) {
    var list = tabsFor(v);
    if (!list.some(function (x) { return x[0] === tab; })) tab = 'q';
    var open = (v.missions || []).filter(function (x) { return !x.done; }).length;
    part($('mpTabs'), JSON.stringify([list, tab, open]), function (el) {
      list.forEach(function (x) {
        var b = mk('button', 'mh-tab', x[1]);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(tab === x[0]));
        if (x[0] === 'missions' && open) b.appendChild(mk('span', 'dot', String(open)));
        b.addEventListener('click', function () {
          tab = x[0];
          picking = '';
          drawer = false;
          // Back to the questions, the screen anyone might see: secrets cover up.
          if (tab === 'q' && secretOpen) { closeSecret(); return; }
          drawGame(view);
        });
        el.appendChild(b);
      });
    });
  }

  var panes = {};
  function pane(name) {
    if (!panes[name]) { panes[name] = mk('div', 'mh-pane mh-pane-' + name); panes[name].dataset.key = ''; }
    return panes[name];
  }
  function drawPanes(v) {
    var box = $('mpPanes');
    var p = tab === 'tools' ? drawTools(v) : tab === 'board' ? drawBoard(v) : tab === 'missions' ? drawMissions(v) : tab === 'ghost' ? drawGhost(v) : drawQuestion(v);
    if (box.firstChild !== p || box.children.length !== 1) { box.textContent = ''; box.appendChild(p); }
  }

  /* -------- questions (and idea 9: Second Chance and streaks) -------- */

  var answered = null; // { id, k, q } the question just answered, waiting for its result
  var feedback = null; // { q, last, until } shown before the next question
  function drawQuestion(v) {
    var el = pane('q');
    var now = Date.now();
    if (answered && v.last && v.last.id === answered.id) {
      feedback = { q: answered.q, last: v.last, until: now + (v.last.ok ? 900 : (v.opts.showAnswer ? 2200 : 1200)) };
      answered = null;
      setTimeout(function () { if (view) drawGame(view); }, feedback.until - now + 20);
    }
    if (feedback && now >= feedback.until) feedback = null;
    var q = feedback ? feedback.q : v.q;
    if (!q) { part(el, 'noq', function (x) { x.appendChild(mk('p', 'mh-empty', 'Waiting for the next question...')); }); return el; }
    var key = JSON.stringify([q.id, feedback && feedback.last.k, answered && answered.id, v.streak, v.stage]);
    part(el, key, function (x) {
      if (q.second) {
        var rib = mk('div', 'mh-ribbon');
        rib.appendChild(document.createTextNode('🔁 Second chance: worth 2 ⚡'));
        rib.appendChild(mk('span', '', 'You missed this one before.'));
        x.appendChild(rib);
      }
      var box = mk('div', 'mh-q');
      if (q.text) box.appendChild(mk('p', '', q.text));
      if (q.img) {
        var z = mk('button', 'rb-zoom');
        z.type = 'button';
        z.setAttribute('aria-label', 'Show the picture full screen');
        var im = mk('img', 'mh-qimg');
        im.alt = '';
        im.src = q.img;
        z.appendChild(im);
        z.addEventListener('click', function () { if (window.rbZoom) rbZoom.open(im.currentSrc || im.src, z); });
        box.appendChild(z);
      }
      x.appendChild(box);
      var grid = mk('div', 'mh-ans');
      var longest = Math.max.apply(null, q.opts.map(function (o) { return String(o || '').length; }).concat([0]));
      grid.style.setProperty('--fit', longest <= 30 ? '1' : longest <= 60 ? '.9' : longest <= 100 ? '.8' : '.7');
      var f = feedback && feedback.last;
      q.opts.forEach(function (o, i) {
        var b = mk('button');
        b.type = 'button';
        b.style.setProperty('--tile', COLORS[i % 4]);
        var pic = (q.imgs || [])[i];
        if (pic) { var pi = mk('img'); pi.alt = o || 'Answer ' + (i + 1); pi.src = pic; pi.referrerPolicy = 'no-referrer'; b.appendChild(pi); }
        if (o) b.appendChild(mk('span', '', o));
        if (f) {
          b.disabled = true;
          if (i === f.k) b.className = f.ok ? 'right' : 'wrong';
          else if (i === f.c && v.opts.showAnswer) b.className = 'right';
          else b.className = 'dim';
        } else if (answered) {
          b.disabled = true;
          if (i === answered.k) b.style.outline = '4px solid #fff';
        } else if (v.stage !== 'work' || v.frozenUntil || (q.openAt && Date.now() < local(q.openAt))) b.disabled = true;
        b.addEventListener('click', function () {
          if (answered || feedback || !view || view.stage !== 'work') return;
          answered = { id: q.id, k: i, q: q };
          send({ t: 'answer', id: q.id, k: i });
          drawGame(view);
        });
        grid.appendChild(b);
      });
      x.appendChild(grid);
      // The question opens a moment after the last answer: the buttons wake up then.
      if (!f && !answered && q.openAt && Date.now() < local(q.openAt)) setTimeout(function () { if (view && view.q && view.q.id === q.id) { pane('q').dataset.key = ''; drawGame(view); } }, local(q.openAt) - Date.now() + 30);
      var fb = mk('p', 'mh-feedback' + (f ? (f.ok ? ' ok' : ' no') : ''));
      if (f) {
        var gain = (f.gain || 0) + (f.bonus || 0);
        fb.textContent = f.ok ? 'Correct! ' + (v.alive ? '+' : 'Jar +') + gain + ' ⚡' : (v.opts.wrongCost && v.alive ? 'Not quite. -1 ⚡' : 'Not quite.');
        if (f.bonus) fb.appendChild(mk('small', '', '+' + f.bonus + ' streak bonus!'));
        if (!f.ok && v.opts.second) fb.appendChild(mk('small', '', 'It comes back later as a Second Chance, worth 2.'));
      }
      x.appendChild(fb);
      if (v.opts.second) {
        var sm = mk('div', 'mh-streak-meter');
        sm.appendChild(document.createTextNode('Streak'));
        var s = v.streak % 5 || (v.streak ? 5 : 0);
        for (var k = 0; k < 5; k++) sm.appendChild(mk('i', k < s ? 'on' : ''));
        sm.appendChild(document.createTextNode(v.streak < 3 ? (3 - v.streak) + ' more for +1 bonus' : (5 - (v.streak % 5)) + ' more for +2 bonus'));
        x.appendChild(sm);
      }
    });
    return el;
  }

  /* -------- lab tools -------- */

  var picking = ''; // the tool waiting for a classmate to be picked ('freescan': the Detective's free scan)
  var drawer = false; // the Secret tools drawer is open
  function toolOf(k) { return k === 'freescan' ? 'scan' : k; }
  function drawTools(v) {
    var el = pane('tools');
    var now = Date.now();
    if (!secretOpen) {
      part(el, JSON.stringify(['lock', v.energy, v.scansLeft, v.stats.meetingsLeft]), function (x) {
        x.appendChild(lockBox('Your lab tools are secret', 'Show my lab tools', 'You have ' + v.energy + ' energy. The class has ' + M.plural(v.scansLeft || 0, 'scan') + ' and ' + M.plural(v.stats.meetingsLeft, 'meeting') + ' left.'));
      });
      return el;
    }
    // Every student's Lab tools look the same (Donny, 2026-11-19: "a moles
    // lab tools are different than a scientist so anyone peeking can figure
    // this out"): the same four tools, the same colors, the same prices, and
    // a Secret tools button on every screen. Only inside that drawer does a
    // Mole find the sabotage tools (and a Medic or Detective their job).
    var freeReady = v.job === 'detective' && v.freeScanAt && now >= local(v.freeScanAt);
    var secret = (v.secret || []).slice();
    if (v.job === 'medic') secret.unshift({ key: 'protect', cost: 0 });
    var key = JSON.stringify([v.tools, secret, v.energy, picking, drawer, freeReady, v.canProtect, v.people.map(function (p) { return [p.id, p.alive, p.clear]; }), v.stats, v.scansLeft]);
    function toolBtn(t, freeNow, pickKey) {
      var d = M.TOOLS[t.key];
      pickKey = pickKey || t.key;
      var cost = freeNow ? 0 : t.cost;
      var can = v.energy >= cost && (t.key !== 'protect' || v.canProtect) && !((t.key === 'scan' || t.key === 'public') && !freeNow && !v.scansLeft) && !(t.key === 'meeting' && !v.stats.meetingsLeft);
      var b = mk('button', 'mh-toolbtn' + (picking === pickKey ? ' picked' : ''));
      b.type = 'button';
      var det = pickKey === 'freescan';
      b.disabled = !can || (det && !freeNow);
      b.appendChild(mk('span', 'ic', det ? M.JOBS.detective.icon : d.icon));
      var tx = mk('span');
      tx.appendChild(mk('b', '', det ? 'Free Detective scan' : d.name));
      tx.appendChild(mk('small', '', t.key === 'protect' && !v.canProtect ? 'Used this round. You can protect again after the next meeting.' : det ? (freeNow ? 'Ready! A private scan that costs nothing.' : 'One every 2 minutes. The next one is on its way.') : d.text));
      b.appendChild(tx);
      b.appendChild(mk('span', 'price', cost ? cost + ' ⚡' : 'Free'));
      b.addEventListener('click', function () {
        if (d.target) { picking = picking === pickKey ? '' : pickKey; drawGame(view); return; }
        send({ t: 'tool', key: t.key });
        picking = '';
        drawer = false;
      });
      return b;
    }
    function picker(markMates) {
      var pk = mk('div', 'mh-pickwho');
      var pt = M.TOOLS[toolOf(picking)];
      pk.appendChild(mk('h4', '', pt.icon + ' ' + (picking === 'freescan' ? 'Free Detective scan' : pt.name) + ': pick a classmate'));
      var ppl = mk('div', 'mh-people');
      v.people.filter(function (p) { return p.alive; }).forEach(function (p) {
        var b = mk('button', 'mh-person' + (p.clear ? ' clear' : '') + (markMates && p.mate ? ' mate' : ''));
        b.type = 'button';
        b.appendChild(M.heroImg(p.hero));
        b.appendChild(mk('span', '', p.name));
        b.addEventListener('click', function () { send({ t: 'tool', key: toolOf(picking), target: p.id }); picking = ''; drawer = false; drawGame(view); });
        ppl.appendChild(b);
      });
      pk.appendChild(ppl);
      var cancel = mk('button', 'btn secondary fc-small', 'Cancel');
      cancel.type = 'button';
      cancel.style.marginTop = '.5rem';
      cancel.addEventListener('click', function () { picking = ''; drawGame(view); });
      pk.appendChild(cancel);
      return pk;
    }
    part(el, key, function (x) {
      var info = mk('p', 'lv-small');
      info.textContent = 'You have ' + v.energy + ' energy. The class has ' + M.plural(v.scansLeft || 0, 'scan') + ' and ' + M.plural(v.stats.meetingsLeft, 'meeting') + ' left.';
      x.appendChild(info);
      var grid = mk('div', 'mh-tools');
      var shared = v.tools || [];
      shared.forEach(function (t) { grid.appendChild(toolBtn(t, false)); });
      var db = mk('button', 'mh-toolbtn mh-drawer-btn' + (drawer ? ' picked' : ''));
      db.type = 'button';
      db.setAttribute('aria-expanded', String(drawer));
      db.appendChild(mk('span', 'ic', '🗝️'));
      var dt = mk('span');
      dt.appendChild(mk('b', '', 'Secret tools'));
      dt.appendChild(mk('small', '', 'Only some players have secret tools. Everyone has this button, so nobody can tell by looking.'));
      db.appendChild(dt);
      db.appendChild(mk('span', 'price', drawer ? 'Close' : 'Open'));
      db.addEventListener('click', function () { drawer = !drawer; picking = ''; drawGame(view); });
      grid.appendChild(db);
      x.appendChild(grid);
      var sharedPick = picking && shared.some(function (t) { return t.key === picking; });
      if (sharedPick && !drawer) x.appendChild(picker(false));
      if (!drawer) return;
      var box = mk('div', 'mh-drawer');
      box.appendChild(mk('h4', '', '🗝️ Your secret tools'));
      if (v.role === 'mole' && v.mates.length) box.appendChild(mk('p', 'mh-mates', '🕳️ Your fellow Moles: ' + v.mates.map(function (m) { return m.name + (m.alive ? '' : ' (caught)'); }).join(', ')));
      var sg = mk('div', 'mh-tools');
      if (v.job === 'detective') sg.appendChild(toolBtn({ key: 'scan', cost: 0 }, freeReady, 'freescan'));
      secret.forEach(function (t) { sg.appendChild(toolBtn(t, false)); });
      if (sg.children.length) box.appendChild(sg);
      if (v.job === 'detective' && !freeReady && v.freeScanAt) box.appendChild(mk('p', 'lv-small mh-free-left', ''));
      if (v.job === 'tech') box.appendChild(mk('p', '', M.JOBS.tech.icon + ' Lab Tech: ' + M.JOBS.tech.text + ' Nothing to tap.'));
      if (!sg.children.length && v.job !== 'tech') box.appendChild(mk('p', '', 'You have no secret tools. Use the lab tools above, answer questions, and keep your eyes open.'));
      if (picking && !sharedPick) box.appendChild(picker(true));
      x.appendChild(box);
    });
    return el;
  }

  /* -------- the Evidence Board (idea 1) -------- */

  var boardSel = '';
  function boardState(v) {
    var b = v.board || {};
    var trust = (b.trust || []).slice(), suspect = (b.suspect || []).slice();
    var placed = trust.concat(suspect);
    var unsure = v.people.map(function (p) { return p.id; }).filter(function (id) { return placed.indexOf(id) < 0; });
    return { trust: trust, unsure: unsure, suspect: suspect };
  }
  function moveTo(id, col) {
    var s = boardState(view);
    ['trust', 'unsure', 'suspect'].forEach(function (k) { s[k] = s[k].filter(function (x) { return x !== id; }); });
    s[col].push(id);
    view.board = s;
    send({ t: 'notes', board: s });
    boardSel = '';
    pane('board').dataset.key = '';
    drawGame(view);
  }
  function drawBoard(v) {
    var el = pane('board');
    var s = boardState(v);
    var key = JSON.stringify([s, boardSel, (v.notes || []).length, v.people.map(function (p) { return [p.id, p.alive, p.clear]; }), secretOpen, v.myNotes || [], nb]);
    part(el, key, function (x) {
      x.appendChild(mk('p', 'mh-board-help', 'Drag a classmate to another column, or tap a name and then tap a column. Your clue cards pin themselves on.'));
      var grid = mk('div', 'mh-board');
      var by = {};
      v.people.forEach(function (p) { by[p.id] = p; });
      [['trust', '✅ Trust'], ['unsure', '🤔 Not sure'], ['suspect', '🚩 Suspect']].forEach(function (c) {
        var col = mk('div', 'mh-col ' + c[0]);
        col.appendChild(mk('h4', '', c[1]));
        s[c[0]].forEach(function (id) {
          var p = by[id];
          if (!p) return;
          var ch = M.chip(p, (boardSel === id ? 'sel' : '') + (secretOpen && p.mate ? ' mole' : ''));
          ch.draggable = true;
          ch.tabIndex = 0;
          ch.setAttribute('role', 'button');
          ch.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', id); });
          ch.addEventListener('click', function (e) { e.stopPropagation(); boardSel = boardSel === id ? '' : id; pane('board').dataset.key = ''; drawGame(view); });
          col.appendChild(ch);
        });
        col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('drop-on'); });
        col.addEventListener('dragleave', function () { col.classList.remove('drop-on'); });
        col.addEventListener('drop', function (e) { e.preventDefault(); var id = e.dataTransfer.getData('text/plain'); if (id) moveTo(id, c[0]); });
        col.addEventListener('click', function () { if (boardSel) moveTo(boardSel, c[0]); });
        grid.appendChild(col);
      });
      var clues = mk('div', 'mh-clues');
      clues.appendChild(mk('h4', '', '📌 Clue cards'));
      var notes = (v.notes || []).slice().reverse().slice(0, 14);
      if (!notes.length) clues.appendChild(mk('p', 'mh-empty', 'Scans, meetings and rumors show up here.'));
      notes.forEach(function (n) {
        var c = mk('div', 'mh-clue');
        c.appendChild(mk('i', '', M.clock(n.at)));
        c.appendChild(document.createTextNode(n.text));
        clues.appendChild(c);
      });
      grid.appendChild(clues);
      x.appendChild(grid);
      x.appendChild(notesPanel(v, true));
    });
    return el;
  }

  // My notes (Donny, 2026-11-18: "I would prefer if they just could click on
  // things instead like 'i think ____ is the mole' because i scanned..."):
  // sentences made with taps, no typing. One note for each classmate; a new
  // one about the same classmate takes the old one's place. Saving a note
  // also moves that classmate to the matching Evidence Board column. A
  // classmate who peeks reads them. On the Evidence Board and at meetings.
  var nb = { open: false, who: '', v: '', why: '' };
  function nbReset() { nb = { open: false, who: '', v: '', why: '' }; }
  function redrawNotes() {
    pane('board').dataset.key = '';
    $('mpOverlay').dataset.key = '';
    if (view) drawGame(view);
  }
  function saveNotes(list, board) {
    view.myNotes = list;
    var m = { t: 'notes', list: list };
    if (board) { view.board = board; m.board = board; }
    send(m);
  }
  // Tell the class (Donny, 2026-11-18): at a meeting, while the class talks
  // or votes, a student can share a note. It shows on the projector and on
  // every screen, a few at each meeting. null when they cannot now.
  function tellNow(v) {
    var m = v.meeting;
    if (!m || (m.step !== 'talk' && m.step !== 'vote') || !v.opts.claims || !v.alive) return null;
    var mine = (m.claims || []).filter(function (c) { return c.by.id === v.me; });
    return { mine: mine, left: Math.max(0, (m.claimsEach || 2) - mine.length) };
  }
  function told(t, n) { return t && t.mine.some(function (c) { return c.who.id === n.who && c.v === n.v && c.why === n.why; }); }
  function canTell(t, who) { return t && (t.left > 0 || t.mine.some(function (c) { return c.who.id === who; })); }
  function tell(n) { send({ t: 'claim', who: n.who, v: n.v, why: n.why }); }
  function notesPanel(v, writer) {
    var box = mk('section', 'mh-mynotes');
    var head = mk('div', 'mh-mynotes-head');
    head.appendChild(mk('h4', '', '📝 My notes'));
    var t = writer ? tellNow(v) : null;
    head.appendChild(mk('span', '', t ? '📣 Tell the class puts a note on the board (' + t.left + ' left at this meeting).' : 'A classmate who peeks can read these.'));
    box.appendChild(head);
    var by = {};
    v.people.forEach(function (p) { by[p.id] = p; });
    var list = (v.myNotes || []).filter(function (n) { return by[n.who]; });
    if (!list.length && !nb.open) box.appendChild(mk('p', 'mh-empty', writer ? 'No notes yet. Tap Write a note: no typing, just tap.' : 'No notes yet.'));
    list.forEach(function (n) {
      var p = by[n.who];
      var row = mk('div', 'mh-note ' + n.v);
      row.appendChild(M.heroImg(p.hero, 'tiny', !p.alive));
      row.appendChild(mk('span', 'txt', M.noteText(p.name, n.v, n.why)));
      if (t && p.alive) {
        if (told(t, n)) row.appendChild(mk('span', 'mh-told', '📣 Told the class'));
        else {
          var tb = mk('button', 'mh-tell', '📣 Tell the class');
          tb.type = 'button';
          tb.disabled = !canTell(t, n.who);
          if (tb.disabled) tb.title = 'You told the class ' + t.mine.length + ' notes at this meeting.';
          tb.addEventListener('click', function () { tb.disabled = true; tell(n); });
          row.appendChild(tb);
        }
      }
      if (writer) {
        var del = mk('button', 'mh-note-x', '✖');
        del.type = 'button';
        del.title = 'Remove this note';
        del.setAttribute('aria-label', 'Remove the note about ' + p.name);
        del.addEventListener('click', function () { saveNotes((view.myNotes || []).filter(function (x) { return x.who !== n.who; })); redrawNotes(); });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
    if (!writer) return box;
    if (!nb.open) {
      var add = mk('button', 'btn fc-small mh-note-add', '➕ Write a note');
      add.type = 'button';
      add.addEventListener('click', function () { nbReset(); nb.open = true; redrawNotes(); });
      box.appendChild(add);
      return box;
    }
    box.appendChild(noteBuilder(v));
    return box;
  }
  // Three taps: who, what you think, and why (the why can be skipped).
  function noteBuilder(v) {
    var w = mk('div', 'mh-nb');
    var who = v.people.filter(function (p) { return p.id === nb.who; })[0];
    w.appendChild(mk('p', 'mh-nb-say', who ? (nb.v ? M.noteText(who.name, nb.v, nb.why) : 'I think ' + who.name + ' ...') : 'I think ...'));
    w.appendChild(mk('p', 'mh-nb-step', '1. Who?'));
    var ppl = mk('div', 'mh-people mh-nb-people');
    v.people.filter(function (p) { return p.alive; }).forEach(function (p) {
      var b = mk('button', 'mh-person' + (p.clear ? ' clear' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(nb.who === p.id));
      b.appendChild(M.heroImg(p.hero));
      b.appendChild(mk('span', '', p.name));
      b.addEventListener('click', function () { nb.who = p.id; redrawNotes(); });
      ppl.appendChild(b);
    });
    w.appendChild(ppl);
    if (nb.who) {
      w.appendChild(mk('p', 'mh-nb-step', '2. What do you think?'));
      var says = mk('div', 'mh-reason-pick');
      ['mole', 'sci', 'unsure'].forEach(function (k) {
        var b = mk('button', '', M.NOTE_SAYS[k].icon + ' ' + M.NOTE_SAYS[k].text);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(nb.v === k));
        b.addEventListener('click', function () { if (nb.v !== k) nb.why = ''; nb.v = k; redrawNotes(); });
        says.appendChild(b);
      });
      w.appendChild(says);
    }
    if (nb.v) {
      w.appendChild(mk('p', 'mh-nb-step', '3. Because... (you can skip this)'));
      var why = mk('div', 'mh-reason-pick');
      M.NOTE_WHY[nb.v].forEach(function (r) {
        var b = mk('button', '', r[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(nb.why === r[0]));
        b.addEventListener('click', function () { nb.why = nb.why === r[0] ? '' : r[0]; redrawNotes(); });
        why.appendChild(b);
      });
      w.appendChild(why);
    }
    var go = mk('div', 'mh-nb-go');
    var ready = !!(nb.who && nb.v);
    function keepNote(andTell) {
      if (!nb.who || !nb.v || !view) return;
      var n = { who: nb.who, v: nb.v, why: nb.why };
      var list = (view.myNotes || []).filter(function (x) { return x.who !== n.who; }).concat([n]);
      var s = boardState(view);
      ['trust', 'unsure', 'suspect'].forEach(function (k) { s[k] = s[k].filter(function (x) { return x !== n.who; }); });
      s[M.NOTE_SAYS[n.v].col].push(n.who);
      saveNotes(list, s);
      if (andTell) tell(n);
      nbReset();
      redrawNotes();
    }
    // At a meeting the note can go straight to the board too.
    var t = tellNow(v);
    if (t) {
      var both = mk('button', 'btn', '📣 Save and tell the class');
      both.type = 'button';
      both.disabled = !ready || !canTell(t, nb.who);
      if (ready && both.disabled) both.title = 'You told the class ' + t.mine.length + ' notes at this meeting.';
      both.addEventListener('click', function () { keepNote(true); });
      go.appendChild(both);
    }
    var save = mk('button', t ? 'btn secondary' : 'btn', 'Save note');
    save.type = 'button';
    save.disabled = !ready;
    save.addEventListener('click', function () { keepNote(false); });
    var cancel = mk('button', 'btn secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', function () { nbReset(); redrawNotes(); });
    go.appendChild(save);
    go.appendChild(cancel);
    w.appendChild(go);
    return w;
  }

  /* -------- missions (idea 4) -------- */

  function drawMissions(v) {
    var el = pane('missions');
    if (!secretOpen) {
      var left = (v.missions || []).filter(function (x) { return !x.done; }).length;
      part(el, JSON.stringify(['lock', left]), function (x) {
        x.appendChild(lockBox('Your missions are secret', 'Show my missions', left ? M.plural(left, 'mission') + ' to go this round.' : 'All done this round! New missions after the next Lab Meeting.'));
      });
      return el;
    }
    part(el, JSON.stringify([v.missions, v.badges, v.round]), function (x) {
      var box = mk('div', 'mh-missions');
      box.appendChild(mk('h4', '', '🎯 Secret missions · round ' + v.round));
      (v.missions || []).forEach(function (m) {
        var r = mk('div', 'mh-mrow' + (m.done ? ' done' : ''));
        r.appendChild(mk('span', 'box'));
        var t = mk('span', 'txt', m.text);
        r.appendChild(t);
        if (!m.done && m.need > 1) r.appendChild(mk('span', 'prog', m.got + ' of ' + m.need));
        r.appendChild(mk('span', 'rw', '+' + m.reward + ' ⚡' + (m.badge ? ' 🏅' : '')));
        box.appendChild(r);
      });
      box.appendChild(mk('p', 'lv-small', 'New missions after every Lab Meeting.'));
      x.appendChild(box);
      var b = mk('div', 'mh-badges');
      (v.badges || []).forEach(function (n) { b.appendChild(mk('span', '', '🏅 ' + n)); });
      if (!(v.badges || []).length) b.appendChild(mk('span', '', 'No badges yet'));
      x.appendChild(b);
    });
    return el;
  }

  /* -------- the Ghost Lab (idea 6) -------- */

  function drawGhost(v) {
    var el = pane('ghost');
    // Fellow Moles are marked (and listed first) only while secrets show.
    var mate = function (p) { return secretOpen && p.mate; };
    part(el, JSON.stringify([v.jar, v.whisper, v.people.map(function (p) { return [p.id, p.alive, p.clear, mate(p)]; }), v.stage, secretOpen]), function (x) {
      var top = mk('div', 'mh-ghost-top');
      top.appendChild(M.heroImg(v.hero, 'big'));
      var t = mk('div');
      t.appendChild(mk('h2', '', '👻 You are a ghost'));
      t.appendChild(mk('p', 'lv-small', 'You were voted out at meeting ' + v.outAt + ', but you can still help your team. Every right answer adds to your jar.'));
      top.appendChild(t);
      var jar = mk('div', 'mh-jar');
      var fill = mk('i');
      fill.style.height = Math.round(100 * v.jar / (v.jarMax || 30)) + '%';
      jar.appendChild(fill);
      jar.appendChild(mk('b', '', v.jar + '/' + (v.jarMax || 30)));
      top.appendChild(jar);
      x.appendChild(top);
      var give = mk('div', 'mh-pickwho');
      give.appendChild(mk('h4', '', v.jar ? 'Give your jar (' + v.jar + ' ⚡) to someone still in the lab' : 'Answer questions to fill your jar, then give it away here.'));
      var ppl = mk('div', 'mh-people');
      v.people.filter(function (p) { return p.alive; }).sort(function (a, b) { return (mate(b) ? 1 : 0) - (mate(a) ? 1 : 0) || (b.clear ? 1 : 0) - (a.clear ? 1 : 0); }).forEach(function (p) {
        var b = mk('button', 'mh-person' + (p.clear ? ' clear' : '') + (mate(p) ? ' mate' : ''));
        b.type = 'button';
        b.disabled = !v.jar || v.stage !== 'work';
        b.appendChild(M.heroImg(p.hero));
        b.appendChild(mk('span', '', p.name));
        b.addEventListener('click', function () { send({ t: 'give', target: p.id }); });
        ppl.appendChild(b);
      });
      give.appendChild(ppl);
      x.appendChild(give);
      if (v.whisper) {
        var w = mk('button', 'btn', '🔮 Ghost Whisper: send the class one true clue (once)');
        w.type = 'button';
        w.disabled = v.stage !== 'work';
        w.addEventListener('click', function () { send({ t: 'whisper' }); });
        x.appendChild(w);
      }
    });
    return el;
  }

  /* -------- full-screen moments: the role, a meeting, frozen -------- */

  var voteFor = '', voteWhy = '';
  function drawOverlay(v) {
    var o = $('mpOverlay');
    var now = Date.now();
    if (v.frozenUntil && local(v.frozenUntil) > now) {
      o.hidden = false;
      var slow = v.slowUntil && local(v.slowUntil) > now;
      part(o, slow ? 'slow' : 'frozen', function (x) {
        x.className = 'mh-overlay';
        var f = mk('div', 'mh-frozen');
        f.appendChild(mk('div', '', slow ? '🐢' : '🧊'));
        f.appendChild(mk('div', '', slow ? 'Slow down and read! Guessing does not earn energy.' : 'Your teacher froze your screen.'));
        f.appendChild(mk('div', 'mh-freeze-left', ''));
        x.appendChild(f);
      });
      return;
    }
    if (v.stage === 'story' || !roleSeen()) { o.hidden = false; drawRole(o, v); return; }
    var m = v.meeting;
    if (m) { o.hidden = false; drawMeeting(o, v, m); return; }
    voteFor = ''; voteWhy = '';
    o.hidden = true;
    o.dataset.key = o.dataset.step = o.dataset.ph = '';
  }

  var revealing = false;
  function drawRole(o, v) {
    part(o, JSON.stringify(['role', revealing, v.role, v.job, v.stage, v.mates.length]), function (x) {
      x.className = 'mh-overlay mh-story';
      if (!revealing) {
        x.appendChild(mk('h2', '', v.stage === 'story' ? 'Look up at the board!' : 'Your secret role'));
        x.appendChild(mk('p', '', 'Your teacher is telling the story. Then cover your screen so nobody can see it, and tap the button.'));
        var b = mk('button', 'mh-cover-btn', '🤫 I covered my screen: show my role');
        b.type = 'button';
        b.addEventListener('click', function () { revealing = true; o.dataset.key = ''; drawOverlay(view); });
        x.appendChild(b);
        return;
      }
      var mole = v.role === 'mole';
      var card = mk('div', 'mh-rolecard ' + (mole ? 'mole' : 'sci'));
      if (mole) { var mi = M.mole('mole-ic'); card.appendChild(mi); }
      card.appendChild(mk('small', '', 'Shh! You are a'));
      card.appendChild(mk('div', 'rn', mole ? 'MOLE' : '🔬 SCIENTIST'));
      var ul = mk('ul');
      var n = v.stats.molesStart;
      (mole ? [
        'Sabotage the lab without getting caught.',
        v.mates.length ? M.stop('Your fellow Moles: ' + v.mates.map(function (m) { return m.name; }).join(', ')) + ' Keep it secret!' : 'You are the only Mole. Good luck!',
        'Answer questions for energy. In Lab tools, tap Secret tools for your sabotage: fake scans, cutting scans, smudges, disguises. Everyone has that button, so it gives nothing away.',
        'At meetings, blend in and vote for a Scientist.'
      ] : [
        M.plural(n, 'Mole is', 'Moles are') + ' hiding in the lab. Find them and vote them out!',
        'Answer questions for energy. Scan classmates in Lab tools to clear them.',
        'Your Evidence Board keeps track of every clue.',
        'Call a meeting when you are ready to vote.'
      ]).forEach(function (t) { ul.appendChild(mk('li', '', t)); });
      if (v.late) ul.appendChild(mk('li', '', 'You joined late, so you are a Scientist.'));
      card.appendChild(ul);
      if (v.job && M.JOBS[v.job]) card.appendChild(mk('div', 'job', M.JOBS[v.job].icon + ' Secret job: ' + M.JOBS[v.job].name + '. ' + M.JOBS[v.job].text));
      var ok = mk('button', 'btn lv-big', 'Got it');
      ok.type = 'button';
      ok.addEventListener('click', function () { keep(function (s) { s.seen = seenKey(); }); revealing = false; o.dataset.key = ''; drawGame(view); });
      card.appendChild(ok);
      x.appendChild(card);
      if (v.stage === 'story') x.appendChild(mk('p', 'lv-small', 'The game starts when the story ends.'));
    });
  }

  // Beside the vote (Donny, 2026-11-15: "allow rumors and suspects to be
  // seen"): the student's own suspects and trusted classmates from their
  // Evidence Board, what their scans said, and every rumor so far.
  // writer: the student can write notes here too (talking time, and after
  // voting); during the vote itself the notes only show.
  function caseNotes(v, writer) {
    var box = mk('aside', 'mh-case');
    box.appendChild(notesPanel(v, writer));
    // What classmates told the class at this meeting, newest first.
    // Filled by fillSaid(), in place, so a new note does not redraw the screen.
    if (v.opts.claims && v.meeting) {
      var said = mk('section', 'mh-case-sec mh-said');
      said.appendChild(mk('h4', '', '📣 Told the class at this meeting'));
      said.appendChild(mk('p', 'mh-empty', 'Nothing yet. Anyone can tap Tell the class on one of their notes.'));
      said.appendChild(mk('div', 'mh-said-list'));
      box.appendChild(said);
    }
    var by = {};
    v.people.forEach(function (p) { by[p.id] = p; });
    var b = v.board || {};
    function group(title, cls, ids, empty) {
      var sec = mk('section', 'mh-case-sec ' + cls);
      sec.appendChild(mk('h4', '', title));
      var chips = mk('div', 'mh-chips');
      ids.map(function (id) { return by[id]; }).filter(Boolean).forEach(function (p) { chips.appendChild(M.chip(p)); });
      if (!chips.children.length) sec.appendChild(mk('p', 'mh-empty', empty)); else sec.appendChild(chips);
      box.appendChild(sec);
    }
    group('🚩 My suspects', 'sus', b.suspect || [], 'Nobody yet. Write a note, or drag names to Suspect on your Evidence Board.');
    group('✅ I trust', 'tru', b.trust || [], 'Nobody yet.');
    var scans = (v.notes || []).filter(function (n) { return n.k === 'scan' || n.k === 'scanned' || n.k === 'peek'; }).slice(-6).reverse();
    var sec = mk('section', 'mh-case-sec');
    sec.appendChild(mk('h4', '', '🔍 My scans'));
    if (!scans.length) sec.appendChild(mk('p', 'mh-empty', 'No scans yet.'));
    scans.forEach(function (n) { sec.appendChild(mk('div', 'mh-clue', n.text)); });
    box.appendChild(sec);
    var rs = mk('section', 'mh-case-sec');
    rs.appendChild(mk('h4', '', '📡 Rumors'));
    var rumors = (v.rumors || []).slice().reverse();
    if (!rumors.length) rs.appendChild(mk('p', 'mh-empty', 'No rumors yet.'));
    rumors.forEach(function (r) { rs.appendChild(mk('div', 'mh-rumor', (r.by ? 'A ghost whispers: ' : 'Rumor ' + r.n + ': ') + r.text)); });
    box.appendChild(rs);
    return box;
  }
  // What classmates told the class at this meeting, newest first: a new one
  // slides in at the top and the rest stay as they are.
  function fillSaid(o, v) {
    var list = o.querySelector('.mh-said-list');
    if (!list || !v.meeting) return;
    var cl = (v.meeting.claims || []).slice().reverse();
    list.parentNode.querySelector('.mh-empty').hidden = !!cl.length;
    M.syncList(list, cl, function (c) { return c.by.id + '|' + c.who.id + '|' + c.at; }, function (c) {
      var it = mk('div', 'mh-said-one ' + c.v);
      it.appendChild(M.heroImg(c.by.hero, 'tiny'));
      var tx = mk('span', '');
      tx.appendChild(mk('b', '', (c.by.id === v.me ? 'You' : c.by.name) + ': '));
      tx.appendChild(document.createTextNode(M.noteText(c.who.name, c.v, c.why, c.who.id === v.me)));
      it.appendChild(tx);
      return it;
    });
  }
  // Which part of the reveal is showing: 'tally' (who the class voted for),
  // 'drum' (the suspense) or 'result'.
  // The answer comes a moment after the board's drum roll ends, never before
  // it (Donny, 2026-11-19: "the reveal happens before the end of the
  // drumroll").
  var REVEAL_AFTER_MS = 300;
  function revealPhase(m) {
    var now = Date.now();
    if (!m.shown) return now < local(m.drumAt || 0) ? 'tally' : 'drum';
    return now >= local(m.resultAt || 0) + REVEAL_AFTER_MS ? 'result' : 'drum';
  }
  // At a meeting every screen shows the same button. A tap shows the
  // student's role and, for a Mole, the fellow Moles (marked in the vote list
  // too) until they cover it or 20 seconds pass (Donny, 2026-11-18: "keep
  // them hidden and the mole can click somehow to reveal it privately").
  function secretStrip(v) {
    var box = mk('div', 'mh-secret' + (secretOpen ? ' open ' + v.role : ''));
    var b = mk('button', 'mh-secret-btn', secretOpen ? '🔒 Cover it' : '🔒 Tap to see your secret role');
    b.type = 'button';
    if (secretOpen) {
      var mole = v.role === 'mole';
      box.appendChild(mk('span', 'txt', mole
        ? 'You are a Mole. ' + (v.mates.length ? M.stop('Your fellow Moles: ' + v.mates.map(function (x) { return x.name + (x.alive ? '' : ' (caught)'); }).join(', ')) : 'You are the only Mole.')
        : 'You are a Scientist' + (v.job && M.JOBS[v.job] ? ' (' + M.JOBS[v.job].name + ')' : '') + '.'));
      b.appendChild(mk('span', 'mh-hide-left', ''));
      b.addEventListener('click', closeSecret);
    } else b.addEventListener('click', openSecret);
    box.appendChild(b);
    return box;
  }
  function drawMeeting(o, v, m) {
    var b = v.board || {};
    var ph = m.step === 'reveal' ? revealPhase(m) : '';
    o.dataset.ph = ph;
    if (ph === 'drum' && m.shown) {
      clearTimeout(drawMeeting.timer);
      drawMeeting.timer = setTimeout(function () { if (view) drawOverlay(view); }, Math.max(0, local(m.resultAt || 0) + REVEAL_AFTER_MS - Date.now()) + 5);
    }
    // A classmate's vote or note does not draw the screen again (Donny,
    // 2026-11-19: "the screen keeps flashing when something new is added"):
    // the vote count and the told-the-class list change in place below, and
    // the student keeps their place in the list.
    var key = JSON.stringify(['meet', m.n, m.step, ph, v.myVote, voteFor, voteWhy, v.alive,
      m.step !== 'reveal' ? [v.people.map(function (p) { return [p.id, p.alive, p.clear]; }), b, (v.notes || []).length, (v.rumors || []).length, secretOpen, v.myNotes || [], nb,
        (m.claims || []).filter(function (c) { return c.by.id === v.me; }).map(function (c) { return c.who.id + '|' + c.at; })] : 0,
      m.result && m.result.out && m.result.out.id]);
    var step = m.n + '|' + m.step, top = o.dataset.step === step ? o.scrollTop : 0;
    var caseEl = o.querySelector('.mh-case'), caseTop = top && caseEl ? caseEl.scrollTop : 0;
    var redrawn = o.dataset.key !== key;
    o.dataset.step = step;
    part(o, key, function (x) {
      x.className = 'mh-overlay mh-meeting-cover' + (m.step === 'reveal' ? ' mh-reveal' : ' mh-meet');
      if (m.step === 'talk') {
        x.appendChild(mk('h2', '', '🔔 Lab Meeting ' + m.n));
        x.appendChild(mk('p', '', 'Called by ' + m.by + '. Talk it over: who is a Mole? Share what your scans said, or keep it to yourself.'));
        x.appendChild(mk('p', 'mh-timer-pill mh-meet-left', ''));
        x.appendChild(secretStrip(v));
        var wrap = mk('div', 'mh-meet-grid one');
        wrap.appendChild(caseNotes(v, true));
        x.appendChild(wrap);
        return;
      }
      if (m.step === 'vote') {
        x.appendChild(mk('h2', '', '🗳️ Vote: who is a Mole?'));
        x.appendChild(mk('p', 'mh-timer-pill mh-meet-left', ''));
        if (!v.alive) { x.appendChild(mk('p', '', 'Ghosts cannot vote. Watch the board!')); return; }
        x.appendChild(secretStrip(v));
        if (v.myVote) {
          var vin = mk('p', '', 'Your vote is in. ');
          vin.appendChild(mk('span', 'mh-votes-in', ''));
          x.appendChild(vin);
          var w2 = mk('div', 'mh-meet-grid one');
          w2.appendChild(caseNotes(v, true));
          x.appendChild(w2);
          return;
        }
        var grid = mk('div', 'mh-meet-grid');
        var left = mk('div', 'mh-meet-main');
        var sus = b.suspect || [], tru = b.trust || [];
        var showMates = secretOpen && v.role === 'mole';
        left.appendChild(mk('p', 'mh-vote-key', '🚩 your suspects  ·  ✅ you trust  ·  ✓ on the Clear list' + (showMates ? '  ·  🕳️ a fellow Mole' : '')));
        var list = mk('div', 'mh-people mh-vote-list');
        // Suspects first, then everyone else, then the ones trusted.
        var rank = function (p) { return sus.indexOf(p.id) >= 0 ? 0 : tru.indexOf(p.id) >= 0 ? 2 : 1; };
        v.people.filter(function (p) { return p.alive; }).sort(function (p, q) { return rank(p) - rank(q); }).forEach(function (p) {
          var isSus = sus.indexOf(p.id) >= 0, isTru = tru.indexOf(p.id) >= 0, isMate = showMates && p.mate;
          var bt = mk('button', 'mh-person' + (p.clear ? ' clear' : '') + (isMate ? ' mate' : '') + (isSus ? ' sus' : '') + (isTru ? ' tru' : ''));
          bt.type = 'button';
          bt.setAttribute('aria-pressed', String(voteFor === p.id));
          bt.appendChild(M.heroImg(p.hero));
          bt.appendChild(mk('span', '', (isMate ? '🕳️ ' : isSus ? '🚩 ' : isTru ? '✅ ' : '') + p.name));
          bt.addEventListener('click', function () { voteFor = p.id; o.dataset.key = ''; drawOverlay(view); });
          list.appendChild(bt);
        });
        left.appendChild(list);
        if (voteFor) {
          var who = (v.people.filter(function (p) { return p.id === voteFor; })[0] || {}).name || '';
          left.appendChild(mk('p', '', 'Why ' + who + '? Tap a reason (you can skip this).'));
          var rs = mk('div', 'mh-reason-pick');
          [['scanned', '🔍 I scanned them'], ['fake', '🎭 Fake scan?'], ['quiet', '😴 Not answering'], ['clear', '🚫 Not on the Clear list'], ['hunch', '🤔 Just a hunch']].forEach(function (r) {
            var rb = mk('button', '', r[1]);
            rb.type = 'button';
            rb.setAttribute('aria-pressed', String(voteWhy === r[0]));
            rb.addEventListener('click', function () { voteWhy = voteWhy === r[0] ? '' : r[0]; o.dataset.key = ''; drawOverlay(view); });
            rs.appendChild(rb);
          });
          left.appendChild(rs);
        }
        var go = mk('div', 'mh-vote-go');
        var vb = mk('button', 'btn lv-big', voteFor ? 'Vote for ' + ((v.people.filter(function (p) { return p.id === voteFor; })[0] || {}).name || '') : 'Pick someone above');
        vb.type = 'button';
        vb.disabled = !voteFor;
        vb.addEventListener('click', function () { send({ t: 'vote', target: voteFor, reason: voteWhy }); });
        var sk = mk('button', 'btn secondary', 'Skip my vote');
        sk.type = 'button';
        sk.addEventListener('click', function () { send({ t: 'vote', target: 'skip' }); });
        go.appendChild(vb);
        go.appendChild(sk);
        left.appendChild(go);
        grid.appendChild(left);
        grid.appendChild(caseNotes(v, false));
        x.appendChild(grid);
        return;
      }
      // The reveal, in step with the board: who the class voted for, the
      // suspense, then the answer.
      var r = m.result || {};
      if (ph === 'tally') {
        x.appendChild(mk('h2', '', '🗳️ The votes are in!'));
        var t = mk('div', 'mh-tally');
        (r.tally || []).slice(0, 6).forEach(function (y) { var c = M.chip(y); c.appendChild(mk('b', '', String(y.n))); t.appendChild(c); });
        if (r.skip) t.appendChild(mk('span', 'mh-chip', 'Skipped ' + r.skip));
        x.appendChild(t);
        x.appendChild(mk('p', '', 'Look up at the board!'));
        return;
      }
      if (r.out) {
        x.appendChild(M.heroImg(r.out.hero, 'big'));
        x.appendChild(mk('p', 'was', r.out.name + ' was...'));
      } else x.appendChild(mk('p', 'was', r.tie ? 'It was a tie...' : 'Most of the class skipped...'));
      if (ph === 'drum') { x.appendChild(mk('p', 'res mh-dots', '...')); return; }
      x.appendChild(mk('p', 'res ' + (r.out && r.wasMole ? 'mole' : 'sci'), r.out ? (r.wasMole ? 'A MOLE!' : 'NOT a Mole.') : 'Nobody leaves the lab.'));
      if (r.out && r.out.id === v.me) x.appendChild(mk('p', '', 'You were voted out. ' + (v.opts.ghosts ? 'You will be a ghost: keep answering to help your team!' : 'Keep answering to practice!')));
    });
    if (redrawn && top) {
      o.scrollTop = top;
      var c2 = o.querySelector('.mh-case');
      if (c2 && caseTop) c2.scrollTop = caseTop;
    }
    var vi = o.querySelector('.mh-votes-in');
    if (vi) vi.textContent = m.votesIn + ' of ' + m.of + ' votes in.';
    fillSaid(o, v);
  }

  /* -------- pop-ups: a scan result, a peek, a mission -------- */

  function drawPop(v) {
    var p = v.pop;
    var last = readSaved().pop || 0;
    if (!p || !p.at || p.at <= last) return;
    keep(function (s) { s.pop = p.at; });
    var box = $('mpPop');
    box.textContent = '';
    // A Mole's missions are different, so with the secrets covered a finished
    // mission says only the energy. Everything else here is the student's own
    // private result: it closes when the secrets cover up.
    popSecret = p.t !== 'mission' || secretOpen;
    if (p.t === 'scan') {
      box.appendChild(mk('div', 'big', p.clear ? '✅' : '❔'));
      box.appendChild(mk('h3', p.clear ? 'ok' : 'no', p.clear ? 'Clear!' : 'Not sure'));
      box.appendChild(mk('p', '', p.clear ? p.name + ' is not a Mole.' + (p.pub ? ' Their name is on the board\'s Clear list now.' : '') : 'Your scan could not clear ' + p.name + '. Moles never come up Clear (unless disguised), but scans can miss Scientists too.'));
    } else if (p.t === 'peek') {
      box.appendChild(mk('div', 'big', '📓'));
      box.appendChild(mk('h3', '', p.name + '\'s notes'));
      var d = mk('div', 'peek');
      var said = (p.notes || []).map(function (n) { return M.noteText(n.name, n.v, n.why); }).concat(p.text ? [p.text] : []);
      d.textContent = 'Trust: ' + (p.board.trust.join(', ') || 'nobody') + '\nSuspect: ' + (p.board.suspect.join(', ') || 'nobody') + '\n\n' + (said.length ? said.join('\n') : '(no notes yet)');
      box.appendChild(d);
    } else if (p.t === 'mission') {
      box.appendChild(mk('div', 'big', '🎯'));
      box.appendChild(mk('h3', 'ok', 'Mission complete!'));
      box.appendChild(mk('p', '', secretOpen ? p.text + ': +' + p.reward + ' ⚡' : '+' + p.reward + ' ⚡. Your missions are on the Missions tab.'));
    } else if (p.t === 'protect') {
      box.appendChild(mk('div', 'big', '🩹'));
      box.appendChild(mk('h3', 'ok', 'Protected'));
      box.appendChild(mk('p', '', p.name + ' is protected from smudges this round.'));
    } else {
      box.appendChild(mk('div', 'big', '✔️'));
      box.appendChild(mk('p', '', p.text || 'Done.'));
    }
    // A mission the tool just finished comes along under its result (the
    // result is never hidden behind it). A Mole's missions say only the energy
    // while the secrets are covered.
    if (p.mission) box.appendChild(mk('p', 'mh-pop-mission', '🎯 ' + (secretOpen ? 'Mission complete: ' + p.mission.text + ': +' + p.mission.reward + ' ⚡' : 'Mission complete! +' + p.mission.reward + ' ⚡')));
    var ok = mk('button', 'btn', 'OK');
    ok.type = 'button';
    ok.addEventListener('click', function () { $('mpPopBack').hidden = true; popSecret = false; });
    box.appendChild(ok);
    $('mpPopBack').hidden = false;
    ok.focus();
  }
  $('mpPopBack').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });

  function tick() {
    var v = view;
    if (!v || v.phase !== 'play') return;
    var now = Date.now();
    if (secretOpen) {
      var hides = ' · hides in ' + Math.max(0, Math.ceil((secretUntil - now) / 1000)) + 's';
      [].forEach.call(document.querySelectorAll('.mh-hide-left'), function (e) { e.textContent = hides; });
    }
    var c = document.querySelector('.mh-mini-clock');
    if (c && v.endsAt) c.textContent = '⏱ ' + M.clock(v.stage === 'story' && v.storyEndsAt ? v.endsAt - v.storyEndsAt : local(v.endsAt) - now);
    var ml = document.querySelector('.mh-meet-left');
    if (ml && v.meeting) ml.textContent = M.clock(local(v.meeting.endsAt) - now) + (v.meeting.step === 'talk' ? ' to talk' : ' to vote');
    var al = document.querySelector('.mh-alarm-left');
    if (al && v.emergency) al.textContent = '⏱ ' + M.clock(local(v.emergency.endsAt) - now);
    if (v.meeting && v.meeting.step === 'reveal' && $('mpOverlay').dataset.ph !== revealPhase(v.meeting)) drawOverlay(v);
    var fl = document.querySelector('.mh-freeze-left');
    if (fl && v.frozenUntil) {
      var left = local(v.frozenUntil) - now;
      fl.textContent = left > 0 ? M.clock(left) : '';
      if (left <= 0) { $('mpOverlay').dataset.key = ''; drawGame(view); }
    }
    var fs = document.querySelector('.mh-free-left');
    if (fs && v.freeScanAt) {
      var l2 = local(v.freeScanAt) - now;
      fs.textContent = l2 > 0 ? '🕵️ Your next free Detective scan in ' + M.clock(l2) : '';
      if (l2 <= 0) { pane('tools').dataset.key = ''; drawGame(view); }
    }
  }

  /* -------- the end (idea 10) -------- */

  function drawDone(v, was) {
    var d = v.done || {};
    var el = $('mpDone');
    el.textContent = '';
    var box = mk('div', 'mh-done-me');
    var head = mk('div', 'mh-done-head ' + d.winner);
    head.appendChild(mk('h2', '', d.won ? '🎉 Your team won!' : 'Your team lost this time'));
    head.appendChild(mk('p', '', (d.winner === 'sci' ? 'The Scientists win. ' : 'The Moles win. ') + (d.why || '')));
    box.appendChild(head);
    box.appendChild(M.heroImg(v.hero, 'big'));
    box.appendChild(mk('p', 'lv-me', 'You were ' + (v.role === 'mole' ? 'a Mole' : 'a Scientist') + (v.job && M.JOBS[v.job] ? ' (' + M.JOBS[v.job].name + ')' : '') + '. You got ' + M.plural(v.right, 'question') + ' right.'));
    var moles = mk('div', 'mh-moles-row');
    moles.appendChild(mk('p', 'mh-empty', 'The Moles were:'));
    (d.moles || []).forEach(function (p) {
      var c = mk('span', 'mh-mcap');
      c.appendChild(M.heroImg(p.hero));
      var t = mk('span');
      t.appendChild(mk('b', '', p.name));
      t.appendChild(mk('span', '', p.outAt ? 'Caught at meeting ' + p.outAt : 'Never caught'));
      c.appendChild(t);
      moles.appendChild(c);
    });
    box.appendChild(moles);
    if ((v.badges || []).length) {
      var b = mk('div', 'mh-badges');
      v.badges.forEach(function (n) { b.appendChild(mk('span', '', '🏅 ' + n)); });
      box.appendChild(b);
    }
    var aw = mk('div', 'mh-awards');
    (d.awards || []).forEach(function (a) {
      var x = mk('div', 'mh-aw');
      x.appendChild(M.heroImg(a.hero));
      var t = mk('div');
      t.appendChild(mk('b', '', a.title));
      t.appendChild(mk('strong', '', a.name + (a.id === v.me ? ' (you!)' : '')));
      t.appendChild(mk('small', '', a.note));
      x.appendChild(t);
      aw.appendChild(x);
    });
    box.appendChild(aw);
    var cf = mk('section', 'mh-panel');
    cf.style.width = 'min(40rem,100%)';
    cf.appendChild(mk('h3', '', '📁 Case File: what the Moles did'));
    var ol = mk('ol', 'mh-tl');
    (d.casefile || []).forEach(function (x) { var li = mk('li'); li.appendChild(mk('i', '', M.clock(x.at))); li.appendChild(mk('span', '', x.text)); ol.appendChild(li); });
    cf.appendChild(ol);
    box.appendChild(cf);
    box.appendChild(mk('p', 'lv-lede', 'Look up at the board for the rest. Wait for your teacher to start the next game.'));
    el.appendChild(box);
    if (was && was.phase === 'play' && d.won && window.IS8Celebrate) try { IS8Celebrate.start({}); } catch (e) { /* only confetti */ }
  }

  /* ---------------- off we go ---------------- */

  var c0 = location.hash.slice(1).toUpperCase();
  if (CODE.test(c0)) start(c0);
  else show('mpCode');
  window.addEventListener('hashchange', function () {
    var c = location.hash.slice(1).toUpperCase();
    if (CODE.test(c) && c !== code) start(c);
  });
})();
