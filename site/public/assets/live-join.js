/* ============================================================
   Live games: the students' join screen (join/).

   A student types the code from the board (or opens join/#CODE from the QR
   code), then either types a nickname or gets a random fun name, whichever
   the teacher chose. This screen holds a connection to the game server
   (textbook/live-worker) and shows the student their question and their
   share of the answers.

   So a student who closes the tab can get back in, the game code and the
   player number it was given are kept in this browser (the live key). The
   nickname itself is not kept here.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var STEPS = ['jnCode', 'jnName', 'jnWait', 'jnPlay', 'jnBlast', 'jnMatch', 'jnDone', 'jnGone'];
  var CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  var ws = null, code = '', me = null, typedNames = false, leaving = false, retries = 0, pingTimer = null;
  var shownQ = '', shownFeedback = 0, feedbackTimer = null, locked = false, lastTeammates = 0;

  function show(id) {
    STEPS.forEach(function (s) { $(s).hidden = s !== id; });
    if (id !== 'jnWait') $('jnDoodle').hidden = true;
  }
  function status(text) { $('jnStatus').textContent = text || ''; }
  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function readSaved() {
    try { return JSON.parse(localStorage.getItem('is8-live-v1')) || {}; } catch (e) { return {}; }
  }
  function writeSaved(v) {
    try { localStorage.setItem('is8-live-v1', JSON.stringify(v)); } catch (e) { /* private window */ }
  }
  function savePlayer(p) { var s = readSaved(); s.player = p; writeSaved(s); }
  // A random number for this device, so a teacher's "Remove and block" can
  // keep it out of that one game. It says nothing about the student.
  function device() {
    var s = readSaved();
    if (!s.device || !/^[0-9a-f]{16,32}$/.test(s.device)) {
      s.device = [].map.call(crypto.getRandomValues(new Uint8Array(12)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      writeSaved(s);
    }
    return s.device;
  }
  function forgetPlayer() { var s = readSaved(); delete s.player; writeSaved(s); }

  /* ---------------- the code ---------------- */

  var saved = readSaved().player;
  // A game closes 5 minutes after the last thing that happened in it.
  var recent = function (p) { return p && Date.now() - p.at < 6 * 60 * 1000; };
  if (recent(saved)) $('jnRejoin').hidden = false;
  // Like Quizlet Live (Gennaro, 2026-09-30): on the same device, opening the
  // game's link or typing its code again goes back in as the same player,
  // on the same team, instead of joining as someone new.
  var tryBack = false;
  function comeBack(c) {
    var p = readSaved().player;
    if (!recent(p) || p.code !== c) return false;
    me = { id: p.id, secret: p.secret, name: '' };
    tryBack = true;
    return true;
  }

  $('jnCodeInput').addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  $('jnCodeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('jnCodeInput').value.trim().toUpperCase();
    $('jnCodeError').textContent = '';
    if (!CODE.test(c)) { $('jnCodeError').textContent = 'The code is 6 letters and numbers. Check the board and try again.'; return; }
    me = null;
    comeBack(c);
    open(c);
  });
  $('jnRejoin').addEventListener('click', function () {
    var p = readSaved().player;
    if (!p) return;
    me = { id: p.id, secret: p.secret, name: '' };
    open(p.code);
  });
  $('jnGoneBtn').addEventListener('click', function () {
    show('jnCode');
    $('jnCodeInput').focus();
  });

  /* ---------------- the connection ---------------- */

  // One game at a time: a new connection retires the old one, and anything
  // still arriving from a retired one is ignored.
  var retryTimer = null;
  function open(c) {
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    if (ws) { var old = ws; old.onopen = old.onmessage = old.onclose = null; try { old.close(); } catch (e) { /* closed */ } }
    code = c;
    leaving = false;
    status('Connecting...');
    // Signed in with Class Pass: the game is told who this is, so the result
    // can count on the class leaderboard.
    var pass = passToken();
    var sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live/' + c + '/ws' + (pass ? '?pass=' + pass : ''));
    ws.onopen = function () {
      if (sock !== ws) return;
      retries = 0;
      status('');
      clearInterval(pingTimer);
      // Often enough that the game can tell a student who has left (40 s).
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
      if (retries > 6 && !me) { status(''); show('jnCode'); $('jnCodeError').textContent = 'Could not reach the game. Check the internet connection.'; return; }
      status('Lost the connection. Trying again...');
      retryTimer = setTimeout(function () { open(code); }, Math.min(6000, 700 * retries));
    };
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  /* ---------------- Class Pass (assets/pass.js) ---------------- */
  function passToken() { return window.IS8Pass ? window.IS8Pass.token() : ''; }
  function passMe() { return window.IS8Pass ? window.IS8Pass.me() : null; }
  var counts = false;
  // A line under the code box, and on the waiting screen: whether this
  // student's results go on the leaderboard.
  function passNote() {
    var m = passMe();
    [['jnCode', 'jnPassNote'], ['jnWait', 'jnPassWait']].forEach(function (x) {
      var box = $(x[1]);
      if (!box) {
        box = mk('p', 'lv-small lv-pass-note');
        box.id = x[1];
        $(x[0]).appendChild(box);
      }
      box.textContent = '';
      if (m) {
        box.appendChild(mk('span', 'pass-badge', 'Class Pass'));
        box.appendChild(document.createTextNode(x[0] === 'jnWait' && !counts ? ' This game does not count on the leaderboard (playing as ' + m.name + ').' : ' Your wins count on the class leaderboard (playing as ' + m.name + ').'));
      } else if (x[0] === 'jnCode' || counts) {
        box.appendChild(document.createTextNode('Want your wins on the class leaderboard? '));
        var b = mk('button', 'linkbtn lv-pass-link', 'Sign in with Class Pass');
        b.type = 'button';
        b.addEventListener('click', function () {
          if (!window.IS8Pass) return;
          b.disabled = true;
          window.IS8Pass.signIn().then(function () {
            // Already in a game: back in as the same player, now signed in.
            if (code && me && me.id) open(code);
          }, function (err) { b.disabled = false; box.appendChild(document.createTextNode(' ' + err.message)); });
        });
        box.appendChild(b);
        if (x[0] === 'jnWait') box.appendChild(document.createTextNode(' (do it before the game starts)'));
      }
    });
  }
  if (window.IS8Pass) window.IS8Pass.onChange(passNote);
  else passNote();
  // Idle for 2 minutes during a game (Gennaro, 2026-09-30): the screen asks
  // "Still there?" and the student stops holding answers until they tap.
  var IDLE_MS = 2 * 60 * 1000, lastTouch = Date.now(), idle = false;
  function touched() {
    lastTouch = Date.now();
    if (!idle) return;
    idle = false;
    $('jnIdle').hidden = true;
    send({ t: 'back' });
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, touched, true); });
  // Only during a game: the 2 minutes count from when the game starts, so a
  // student who waited quietly in the lobby is not asked at once (Gennaro saw
  // "Still there?" in the lobby, 2026-10-01).
  setInterval(function () {
    if (lastPhase !== 'play') { if (!document.hidden) touched(); return; }
    var playing = me && me.id && !document.hidden;
    if (!playing || idle || Date.now() - lastTouch < IDLE_MS) return;
    idle = true;
    $('jnIdle').hidden = false;
    send({ t: 'away' });
  }, 5000);

  // A student who switches away or closes the tab stops holding answers at
  // once, so the team can carry on; coming back picks up where they were.
  document.addEventListener('visibilitychange', function () {
    if (!me || !me.id) return;
    send({ t: document.hidden ? 'away' : 'back' });
  });
  window.addEventListener('pagehide', function () {
    if (ws && ws.readyState === 1) { send({ t: 'away' }); try { ws.close(); } catch (e) { /* closing */ } }
  });
  function stop(text, button) {
    leaving = true;
    if (ws) try { ws.close(); } catch (e) { /* closed */ }
    $('jnGoneText').textContent = text;
    $('jnGoneBtn').hidden = !button;
    show('jnGone');
  }

  var lastHello = null;
  // The game server's clock as seen from this screen. Every update says the
  // server's time when it was sent, but some arrive later than others; the
  // one that arrived quickest is the truest, so that is kept. Clocks then
  // never jump back up when a slow update lands (Gennaro saw 8, 7, 8, 7).
  var skew = null;
  function heard(serverNow) { var d = serverNow - Date.now(); if (skew === null || d > skew) skew = d; }
  function local(serverTime) { return serverTime - (skew || 0); }
  function handle(m) {
    if (m.t === 'hello') {
      lastHello = m;
      typedNames = m.typedNames;
      counts = !!m.counts;
      passNote();
      joinReady();
      if (me && me.id) { send({ t: 'rejoin', id: me.id, secret: me.secret }); return; }
      if (m.phase === 'done') { stop('That game is over. Wait for your teacher to start a new one.', true); return; }
      // Random names: nothing to type, so join straight away. Signed in with
      // Class Pass: the game uses the name on the class list.
      if (!typedNames || passToken()) { send({ t: 'join', name: '', dev: device() }); return; }
      nameStep(m);
    } else if (m.t === 'me') {

      me = { id: m.id, secret: m.secret, name: m.name };
      savePlayer({ code: m.code, id: m.id, secret: m.secret, at: Date.now() });
    } else if (m.t === 'nameError') {
      joinReady();
      if ($('jnName').hidden && lastHello) nameStep(lastHello);
      $('jnNameError').textContent = m.msg;
      $('jnNick').select();
    } else if (m.t === 'aim') {
      if (window.IS8Blast) window.IS8Blast.aim(m);
    } else if (m.t === 'view') {
      heard(m.now);
      var p = readSaved().player;
      if (p && me && p.id === me.id) { p.at = Date.now(); savePlayer(p); }
      draw(m);
    } else if (m.t === 'notice') {
      if ($('jnPickMsg')) $('jnPickMsg').textContent = m.msg || '';
      if (!$('jnPlay').hidden || !$('jnBlast').hidden) toast(m.msg || '');
    } else if (m.t === 'rejoinFailed') {
      forgetPlayer();
      me = null;
      $('jnRejoin').hidden = true;
      // Came back with the code but that player is gone: join as new.
      if (tryBack && lastHello) { tryBack = false; handle(lastHello); return; }
      stop(m.msg, true);
    } else if (m.t === 'removed' || m.t === 'over') {
      forgetPlayer();
      $('jnRejoin').hidden = true;
      stop(m.msg, !m.blocked);
    } else if (m.t === 'error') {
      joinReady();
      leaving = true;
      show('jnCode');
      $('jnCodeError').textContent = m.msg;
      if (m.code === 'nogame') { forgetPlayer(); $('jnRejoin').hidden = true; }
    }
  }

  function nameStep(m) {
    $('jnGameTitle').textContent = m.title;
    $('jnTyped').hidden = !typedNames;
    $('jnRandom').hidden = typedNames;
    $('jnNameError').textContent = '';
    show('jnName');
    if (typedNames) $('jnNick').focus();
  }

  // Typed nicknames take a moment to check, so the button says so.
  var joinBtn = $('jnNameForm').querySelector('button');
  function joinReady() {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join game';
  }
  $('jnNameForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('jnNameError').textContent = '';
    if (typedNames) {
      joinBtn.disabled = true;
      joinBtn.textContent = 'Checking your name...';
    }
    send({ t: 'join', name: typedNames ? $('jnNick').value : '', dev: device() });
  });

  /* ---------------- what the student sees ---------------- */

  function teamStyle(el, team) { el.style.setProperty('--team', team ? team.color : ''); }
  function ordinal(n) { var t = n % 100, o = n % 10; return n + (t > 10 && t < 14 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); }

  // Confetti and fireworks (no sound on a student's screen) when the game ends.
  var lastPhase = '';
  function draw(v) {
    if (v.phase === 'done' && lastPhase === 'play' && window.IS8Celebrate) window.IS8Celebrate.start();
    if (v.phase !== lastPhase && !document.hidden) touched();
    lastPhase = v.phase;
    if (v.phase === 'play' && v.goAt > v.now && window.IS8Celebrate) window.IS8Celebrate.countdown(local(v.goAt));
    if (v.phase !== 'play') {
      if (window.IS8Blast) window.IS8Blast.reset();
      if (window.IS8Match) window.IS8Match.reset();
    }
    if (v.phase === 'lobby' || v.phase === 'teams') return drawWait(v);
    // Blast and Match draw themselves (live-blast.js, live-match.js).
    if (v.phase === 'play' && v.kind === 'blast' && window.IS8Blast) { show('jnBlast'); drawPower(v); return window.IS8Blast.draw(v, send); }
    if (v.phase === 'play' && v.kind === 'match' && window.IS8Match) {
      show('jnMatch');
      $('mtName').textContent = v.name;
      return window.IS8Match.draw(v, send);
    }
    if (v.phase === 'play') return v.team && v.team.place ? drawFinished(v) : drawQuestion(v);
    if (v.phase === 'done') return drawDone(v);
  }

  function drawWait(v) {
    shownQ = '';
    show('jnWait');
    // The drawing pad, unless the teacher switched it off. The drawing stays
    // on the page between rounds.
    var pad = $('jnDoodle');
    pad.hidden = v.doodle === false || !window.IS8Doodle;
    if (!pad.hidden) window.IS8Doodle.mount(pad);
    $('jnMe').textContent = v.name;
    var box = $('jnTeam');
    // Picking teams: tap a team, switch until the countdown locks everyone in.
    $('jnPick').hidden = !v.pick || v.pick.locked;
    if (v.pick && !v.pick.locked) {
      box.hidden = true;
      drawPick(v);
      $('jnWaitText').textContent = v.pick.mine ? 'You can switch teams until the countdown ends.' : 'Tap a team to join it.';
      return;
    }
    clearInterval(countTimer);
    if (v.teamsMode && v.team) {
      box.textContent = '';
      teamStyle(box, v.team);
      box.appendChild(mk('span', 'lv-emoji', v.team.emoji));
      box.appendChild(mk('strong', '', 'You are on the ' + v.team.name));
      if (v.team.num) box.appendChild(mk('span', 'lv-team-num', String(v.team.num))).setAttribute('aria-label', 'Team ' + v.team.num);
      var others = v.team.members.filter(function (m) { return m.name !== v.name; }).map(function (m) { return m.name; });
      if (others.length) box.appendChild(mk('span', '', 'With ' + others.join(', ')));
      box.hidden = false;
      $('jnWaitText').textContent = 'Sit with your team. The game starts soon.';
    } else {
      box.hidden = true;
      $('jnWaitText').textContent = 'Look up at the board. The game will start soon.';
    }
  }

  var countTimer = null;
  function drawPick(v) {
    var pk = v.pick, grid = $('jnPickGrid');
    grid.textContent = '';
    $('jnPickTitle').textContent = pk.mine ? 'Your team is picked' : 'Pick your team';
    pk.teams.forEach(function (t) {
      var full = t.members.length >= pk.cap && t.id !== pk.mine;
      var b = mk('button', 'lv-pick-team' + (t.id === pk.mine ? ' mine' : '') + (full ? ' full' : ''));
      b.type = 'button';
      b.disabled = full;
      b.style.setProperty('--team', t.color);
      var top = mk('span', 'lv-pick-team-top');
      top.appendChild(mk('span', 'lv-emoji', t.emoji));
      top.appendChild(mk('strong', 'lv-team-title', t.name));
      if (t.num) top.appendChild(mk('span', 'lv-team-num', String(t.num)));
      b.appendChild(top);
      b.appendChild(mk('span', 'lv-pick-team-who', t.members.length ? t.members.join(', ') : 'No one yet'));
      b.appendChild(mk('span', 'lv-pick-team-count', t.id === pk.mine ? 'Your team' : full ? 'Full' : t.members.length + ' of ' + pk.cap));
      b.addEventListener('click', function () { $('jnPickMsg').textContent = ''; send({ t: 'pickTeam', tid: t.id }); });
      grid.appendChild(b);
    });
    // A team's name stays on one line: a long one gets smaller letters.
    requestAnimationFrame(function () {
      [].forEach.call(grid.querySelectorAll('.lv-team-title'), function (el) {
        var size = parseFloat(getComputedStyle(el).fontSize), min = size * 0.62;
        while (el.scrollWidth > el.clientWidth + 1 && size > min) { size -= 0.5; el.style.fontSize = size + 'px'; }
      });
    });
    clearInterval(countTimer);
    var cd = $('jnCountdown');
    if (!pk.endsAt) { cd.hidden = true; return; }
    cd.hidden = false;
    var end = Math.max(Date.now(), local(pk.endsAt));
    var tick = function () {
      var left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      $('jnCountdownNum').textContent = left >= 60 ? Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) : String(left);
      $('jnCountdownText').textContent = left ? 'Teams lock in when this reaches zero.' : 'Locking in...';
      cd.classList.toggle('urgent', left <= 3);
      if (!left) clearInterval(countTimer);
    };
    tick();
    countTimer = setInterval(tick, 200);
  }

  function playbar(v) {
    var badge = $('jnBadge');
    badge.textContent = '';
    if (v.team) {
      teamStyle($('jnPlay'), v.team);
      badge.appendChild(mk('span', 'lv-emoji', v.team.emoji));
      badge.appendChild(mk('span', '', v.teamsMode ? v.team.name : v.name));
      $('jnFill').style.width = Math.min(100, v.team.progress / v.target * 100) + '%';
      $('jnNum').textContent = v.team.progress + ' / ' + v.target;
      // Three or more right in a row: a flame and the count.
      var fire = $('jnFire');
      fire.hidden = !(v.team.streak >= 3);
      fire.textContent = '\u{1F525} ' + v.team.streak;
      drawClock(v);
    }
  }

  // Vocab Live with a time limit: the time left, on this screen's clock.
  var clockTimer = null, clockEnd = 0;
  function drawClock(v) {
    var c = $('jnClock');
    clearInterval(clockTimer);
    c.hidden = !v.endsAt;
    if (!v.endsAt) return;
    clockEnd = local(v.endsAt);
    var tick = function () {
      var left = Math.max(0, Math.ceil((clockEnd - Date.now()) / 1000));
      c.textContent = left ? Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) : 'Time!';
      c.classList.toggle('urgent', left <= 10);
      if (!left) clearInterval(clockTimer);
    };
    tick();
    clockTimer = setInterval(tick, 500);
  }

  function drawQuestion(v) {
    show('jnPlay');
    playbar(v);
    var q = v.q;
    lastTeammates = q ? q.teammates : 0;
    drawPower(v);
    if (!q) return;
    // A new question, or the same one dealt again because a teammate left or
    // came back: draw it afresh.
    var qKey = q.seq + '|' + q.prompt + '|' + q.options.map(function (o) { return o.k; }).join(',');
    if (qKey !== shownQ) {
      shownQ = qKey;
      $('jnPromptLabel').textContent = q.promptIs === 'definition' ? 'Definition' : 'Term';
      var p = $('jnPrompt');
      p.textContent = q.prompt;
      p.className = 'lv-prompt-text' + (q.prompt.length > 140 ? ' long' : '');
      var img = $('jnImg');
      if (q.img) { img.src = q.img; img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
      $('jnTeamNote').textContent = q.teammates
        ? 'Only one of your team has the right answer. Talk to your team!'
        : '';
      var box = $('jnOptions');
      box.textContent = '';
      if (!q.options.length) {
        box.appendChild(mk('p', 'lv-none', 'Your teammates have the answers this time. Help them choose!'));
      }
      q.options.forEach(function (o) {
        // Every choice looks the same, so the style never hints at the answer.
        var b = mk('button', 'lv-option', o.text);
        b.type = 'button';
        b.addEventListener('click', function () {
          if (locked || held()) return;
          box.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
          send({ t: 'answer', seq: q.seq, k: o.k });
        });
        box.appendChild(b);
      });
    }
    feedback(v);
  }

  // What happened to the last answer: a quick "Correct!", or the right
  // answer and a short pause before the next question.
  function feedback(v) {
    var last = v.last;
    var lockMs = v.lockMs || 0;
    // A wrong answer's panel shows for the whole pause, even after a reconnect.
    var fresh = last && last.at !== shownFeedback && (v.now - last.at < 5000 || (!last.ok && lockMs > 0));
    var box = $('jnFeedback');
    locked = lockMs > 0;
    $('jnOptions').querySelectorAll('button').forEach(function (b) { b.disabled = locked || held(); });
    // While a wrong answer's pause runs, only the feedback shows; the next
    // question appears when the pause ends.
    $('jnPlay').classList.toggle('locked', locked);
    if (!fresh) {
      if (!locked) { clearTimeout(feedbackTimer); box.hidden = true; }
      else waitNote(v);
      return;
    }
    shownFeedback = last.at;
    clearTimeout(feedbackTimer);
    box.textContent = '';
    if (last.ok) {
      box.className = 'lv-feedback ok';
      box.appendChild(mk('strong', '', 'Correct!'));
      if (v.teamsMode && last.by !== v.name) box.appendChild(mk('span', '', last.by + ' got it.'));
      box.hidden = false;
      feedbackTimer = setTimeout(function () { box.hidden = true; }, 1100);
      return;
    }
    box.className = 'lv-feedback bad';
    box.appendChild(mk('strong', '', 'Not quite.'));
    box.appendChild(mk('span', 'lv-fb-prompt', last.prompt));
    var ans = mk('span', '', 'The answer was: ');
    ans.appendChild(mk('b', '', last.right));
    box.appendChild(ans);
    if (v.teamsMode && last.owner && last.owner !== v.name) box.appendChild(mk('span', '', last.owner + ' had it.'));
    if (v.teamsMode && last.owner === v.name) box.appendChild(mk('span', '', 'You had it!'));
    box.appendChild(mk('span', '', v.fast ? 'Keep going.' : (v.teamsMode ? 'Your team goes back to 0.' : 'You go back to 0.')));
    var bar = mk('span', 'lv-wait-bar');
    var fill = mk('span');
    bar.appendChild(fill);
    box.appendChild(bar);
    if (lockMs > 0) {
      // Read it and move on: the pause ends once the whole team presses Continue.
      var go = mk('button', 'btn lv-continue', 'Continue');
      go.type = 'button';
      go.addEventListener('click', function () {
        go.disabled = true;
        send({ t: 'ready' });
      });
      box.appendChild(go);
      box.appendChild(mk('span', 'lv-wait-note'));
    }
    box.hidden = false;
    waitNote(v);
    if (lockMs > 0) {
      fill.style.transition = 'width ' + lockMs + 'ms linear';
      requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = '0'; }); });
      feedbackTimer = setTimeout(function () {
        box.hidden = true;
        locked = false;
        $('jnPlay').classList.remove('locked');
        $('jnOptions').querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      }, lockMs);
    } else {
      feedbackTimer = setTimeout(function () { box.hidden = true; }, 2000);
    }
  }

  /* ---------------- power-ups ---------------- */

  // Every 3 right answers in a row win a mystery power-up. A team votes to
  // use it; an attack picks one other team. Nothing here flashes: Glitch
  // only wobbles and blurs, slowly.
  var POWER = {
    shield: ['\u{1F6E1}\uFE0F', 'Shield', 'Blocks the next attack on your team for 30 seconds.'],
    strike: ['\u26A1', 'Strike', 'Knock a team down 1 rung. It can go below zero!'],
    freeze: ['\u{1F9CA}', 'Freeze', 'Freeze a team\u2019s screens for 5 seconds.'],
    glitch: ['\u{1F4FA}', 'Glitch', 'Scramble a team\u2019s screens for 8 seconds.'],
    swap: ['\u{1F504}', 'Swap', 'Trade places with a team ahead of you. Then your team waits 5 seconds.'],
    double: ['2\u00D7', 'Double Up', 'Your next 2 right answers count as 2 each.'],
    fifty: ['\u2702\uFE0F', '50/50', 'Hides half of the wrong answers on this question.'],
    mirror: ['\u{1FA9E}', 'Mirror', 'Sends the next attack back to whoever sent it, for 30 seconds.']
  };
  // Blast (Gennaro, 2026-09-30): the same power-ups but Swap, used at once
  // without a vote, and worded for points and ships.
  var BLAST_SAYS = {
    strike: 'Knock a team down 1 point. It can go below zero!',
    freeze: 'A team\u2019s ships cannot shoot for 5 seconds.',
    glitch: 'Blur and wobble a team\u2019s asteroids for 8 seconds.',
    double: 'Your team\u2019s next 2 hits count as 2 points each.',
    fifty: 'Half of the wrong asteroids break apart.'
  };
  var PLAY_UI = { box: 'jnPu', play: 'jnPlay', hold: 'jnHold', bar: '#jnPlay .lv-playbar', opts: 'jnOptions', blast: false };
  var BLAST_UI = { box: 'blPu', play: 'jnBlast', hold: 'blHold', bar: '#jnBlast .bl-top', opts: '', blast: true };
  var ui = PLAY_UI;
  function says(k) { return (ui.blast && BLAST_SAYS[k]) || POWER[k][2]; }
  function optionButtons() { return ui.opts ? $(ui.opts).querySelectorAll('button') : []; }
  var ATTACK = ['strike', 'freeze', 'glitch', 'swap'];
  var holdEnd = 0, holdTimer = null, glitchEnd = 0, glitchTimer = null, shuffleTimer = null, seenFx = {}, lastPu = null;
  function held() { return Date.now() < holdEnd; }

  function toast(text) {
    var t = $('jnToast');
    if (!text) return;
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function drawPower(v) {
    ui = v.kind === 'blast' ? BLAST_UI : PLAY_UI;
    var pu = v.pu, box = $(ui.box);
    lastPu = pu || null;
    if (!pu) { box.hidden = true; $('jnPuVote').hidden = true; closeSheet(); return; }
    box.hidden = false;
    box.textContent = '';
    var we = v.teamsMode ? 'your team' : 'you';
    if (pu.item) {
      var info = POWER[pu.item];
      var use = mk('button', 'lv-pu-item');
      use.type = 'button';
      use.appendChild(mk('span', 'lv-pu-icon', info[0]));
      var words = mk('span', 'lv-pu-words');
      words.appendChild(mk('strong', '', info[1]));
      words.appendChild(mk('span', '', pu.vote ? 'Your team is voting...' : 'Tap to use it'));
      use.appendChild(words);
      use.disabled = !!pu.vote;
      use.addEventListener('click', function () { openSheet(); });
      box.appendChild(use);
    } else {
      var meter = mk('div', 'lv-pu-meter');
      meter.appendChild(mk('span', 'lv-pu-icon', '\u{1F381}'));
      var dots = mk('span', 'lv-pu-dots');
      for (var i = 0; i < pu.every; i++) dots.appendChild(mk('span', i < pu.streak ? 'on' : ''));
      meter.appendChild(dots);
      var more = pu.every - pu.streak;
      meter.appendChild(mk('span', 'lv-pu-words', more + (ui.blast ? (more === 1 ? ' more hit' : ' more hits') + ' in a row for a power-up' : ' more right in a row for a power-up')));
      box.appendChild(meter);
    }
    var chips = mk('span', 'lv-pu-chips');
    if (pu.shieldMs) chips.appendChild(mk('span', 'lv-pu-chip', POWER.shield[0] + ' Shield up'));
    if (pu.mirrorMs) chips.appendChild(mk('span', 'lv-pu-chip', POWER.mirror[0] + ' Mirror up'));
    if (pu.double) chips.appendChild(mk('span', 'lv-pu-chip', '2\u00D7 ' + pu.double + ' left'));
    if (chips.childNodes.length) box.appendChild(chips);
    $(ui.play).classList.toggle('shielded', !!pu.shieldMs);
    if (!pu.item) closeSheet();
    drawVote(pu);
    drawHold(pu);
    drawGlitch(pu);
    // What just happened to this team, once each.
    (pu.events || []).forEach(function (e) {
      if (seenFx[e.id]) return;
      seenFx[e.id] = true;
      var text = '';
      try { text = fxText(e, v.team ? v.team.id : '', we); } catch (err) { text = ''; }
      if (text) toast(text);
      if (e.kind === 'strike' && !e.blocked && e.to && v.team && e.to.id === v.team.id) {
        var bar = document.querySelector(ui.bar);
        bar.classList.remove('struck');
        void bar.offsetWidth;
        bar.classList.add('struck');
      }
    });
  }

  function poss(name) { return name + (/s$/i.test(name) ? '\u2019' : '\u2019s'); }
  function fxText(e, mine, we) {
    var n = (POWER[e.power] || ['', ''])[1], icon = (POWER[e.power] || [''])[0];
    var fromMe = e.from && e.from.id === mine, toMe = e.to && e.to.id === mine;
    // A power-up a team uses on itself has no other team, so names default to ''.
    var a = e.from ? e.from.name : '', z = e.to ? e.to.name : '';
    var We = we.charAt(0).toUpperCase() + we.slice(1);
    if (e.kind === 'got' && fromMe) return icon + ' ' + We + ' got ' + n + '!';
    if (e.kind === 'nope' && fromMe) return 'Your team said no. The ' + n + ' is still yours.';
    if (e.kind === 'bounce') return fromMe ? POWER.mirror[0] + ' Your mirror bounced ' + poss(z) + ' ' + n + ' back!' : POWER.mirror[0] + ' ' + poss(a) + ' mirror bounced your ' + n + ' back!';
    if (e.blocked) return toMe ? POWER.shield[0] + ' Your shield blocked ' + poss(a) + ' ' + n + '!' : POWER.shield[0] + ' ' + poss(z) + ' shield blocked your ' + n + '.';
    if (toMe) {
      return {
        strike: icon + ' ' + a + ' struck ' + we + (ui.blast ? '! Minus 1 point.' : '! Down 1 rung.'),
        freeze: icon + ' ' + a + ' froze ' + we + '!',
        glitch: icon + ' ' + a + ' glitched ' + we + '!',
        swap: icon + ' ' + a + ' swapped places with ' + we + '!'
      }[e.kind] || '';
    }
    if (fromMe) {
      return {
        strike: icon + ' ' + We + ' struck ' + z + '!',
        freeze: icon + ' ' + We + ' froze ' + z + '!',
        glitch: icon + ' ' + We + ' glitched ' + z + '!',
        swap: icon + ' ' + We + ' swapped places with ' + z + '!',
        shield: icon + ' Shield up for 30 seconds.',
        mirror: icon + ' Mirror up for 30 seconds.',
        double: icon + (ui.blast ? ' The next 2 hits count double!' : ' The next 2 right answers count double!'),
        fifty: icon + (ui.blast ? ' Half of the wrong asteroids broke apart.' : ' Half of the wrong answers are gone.')
      }[e.kind] || '';
    }
    return '';
  }

  // Tap the power-up: pick a team for an attack, or just confirm.
  function openSheet() {
    var pu = lastPu;
    if (!pu || !pu.item || pu.vote) return;
    var info = POWER[pu.item];
    var sheet = $('jnPuSheet');
    sheet.textContent = '';
    var card = mk('div', 'lv-pu-card');
    card.appendChild(mk('span', 'lv-pu-big', info[0]));
    card.appendChild(mk('h3', '', info[1]));
    card.appendChild(mk('p', '', says(pu.item)));
    // Vocab Live teams vote; in Blast whoever taps it uses it.
    var many = lastTeammates > 0 && !ui.blast;
    if (ATTACK.indexOf(pu.item) !== -1) {
      card.appendChild(mk('p', 'lv-pu-ask', 'Which team?'));
      var list = mk('div', 'lv-pu-targets');
      var targets = pu.targets || [];
      if (!targets.length) list.appendChild(mk('p', 'lv-none', pu.item === 'swap' ? 'No team is ahead of you right now.' : 'No team can be picked right now.'));
      targets.slice().sort(function (a, b) { return b.progress - a.progress; }).forEach(function (t) {
        var b = mk('button', 'lv-pu-target');
        b.type = 'button';
        b.style.setProperty('--team', t.color);
        b.appendChild(mk('span', 'lv-emoji', t.emoji));
        b.appendChild(mk('span', 'lv-pu-target-name', t.name));
        b.appendChild(mk('span', 'lv-pu-target-num', t.shield ? POWER.shield[0] + ' ' + t.progress : String(t.progress)));
        b.disabled = !t.ready;
        if (!t.ready) b.title = 'Just hit. Wait a few seconds.';
        b.addEventListener('click', function () { send({ t: 'power', target: t.id }); closeSheet(); });
        list.appendChild(b);
      });
      card.appendChild(list);
    } else {
      var go = mk('button', 'btn lv-pu-go', many ? 'Ask my team to use it' : 'Use it');
      go.type = 'button';
      go.addEventListener('click', function () { send({ t: 'power' }); closeSheet(); });
      card.appendChild(go);
    }
    if (many) card.appendChild(mk('p', 'lv-pu-note', 'Most of your team has to say yes.'));
    var no = mk('button', 'btn secondary lv-pu-cancel', 'Not yet');
    no.type = 'button';
    no.addEventListener('click', closeSheet);
    card.appendChild(no);
    sheet.appendChild(card);
    sheet.hidden = false;
  }
  function closeSheet() { $('jnPuSheet').hidden = true; $('jnPuSheet').textContent = ''; }
  $('jnPuSheet').addEventListener('click', function (e) { if (e.target === this) closeSheet(); });

  // A teammate wants to use the power-up: yes or no, before the bar runs out.
  var voteKey = '', voteTimer = null;
  function drawVote(pu) {
    var box = $('jnPuVote');
    var vt = pu.vote;
    if (!vt) { box.hidden = true; voteKey = ''; clearTimeout(voteTimer); return; }
    var key = vt.id + '|' + vt.yes + '|' + vt.voted;
    if (key === voteKey) return;
    var fresh = voteKey.split('|')[0] !== vt.id;
    voteKey = key;
    box.textContent = '';
    box.hidden = false;
    var info = POWER[vt.kind];
    var line = mk('p', 'lv-pu-vote-q');
    line.appendChild(mk('span', 'lv-pu-icon', info[0]));
    line.appendChild(mk('span', '', vt.mine
      ? 'You asked to use ' + info[1] + (vt.target ? ' on ' + vt.target : '') + '.'
      : vt.by + ' wants to use ' + info[1] + (vt.target ? ' on ' + vt.target : '') + '.'));
    box.appendChild(line);
    if (!vt.mine) {
      var row = mk('div', 'lv-pu-vote-btns');
      [['yes', '\u2714 Yes'], ['no', '\u2716 No']].forEach(function (c) {
        var b = mk('button', 'btn lv-pu-' + c[0] + (vt.voted === c[0] ? ' picked' : '') + (c[0] === 'no' ? ' secondary' : ''), c[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(vt.voted === c[0]));
        b.addEventListener('click', function () { send({ t: 'vote', id: vt.id, yes: c[0] === 'yes' }); });
        row.appendChild(b);
      });
      box.appendChild(row);
    }
    box.appendChild(mk('span', 'lv-pu-vote-count', vt.yes + ' of ' + vt.need + ' yes needed'));
    var bar = mk('span', 'lv-wait-bar');
    var fill = mk('span');
    bar.appendChild(fill);
    box.appendChild(bar);
    if (fresh) voteEnd = Date.now() + vt.ms;
    var left = Math.max(0, voteEnd - Date.now());
    fill.style.width = (left / 8000 * 100) + '%';
    fill.style.transition = 'width ' + left + 'ms linear';
    requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = '0'; }); });
    clearTimeout(voteTimer);
    voteTimer = setTimeout(function () { box.hidden = true; voteKey = ''; }, left + 300);
  }
  var voteEnd = 0;

  // Frozen, or waiting after a swap: a big overlay with a countdown.
  function drawHold(pu) {
    var box = $(ui.hold), play = $(ui.play);
    if (!pu.holdMs) { if (!held()) { box.hidden = true; play.classList.remove('held'); } return; }
    var end = Date.now() + pu.holdMs;
    if (Math.abs(end - holdEnd) < 400 && !box.hidden) return;
    holdEnd = end;
    box.textContent = '';
    box.className = 'lv-hold ' + pu.hold + (ui.blast ? ' bl-hold' : '');
    var freeze = pu.hold === 'freeze';
    box.appendChild(mk('span', 'lv-hold-icon', freeze ? POWER.freeze[0] : POWER.swap[0]));
    box.appendChild(mk('strong', '', freeze ? 'Frozen by ' + pu.holdBy + '!' : 'You swapped with ' + pu.holdBy + '!'));
    var num = mk('span', 'lv-hold-num');
    box.appendChild(num);
    box.appendChild(mk('span', 'lv-hold-note', freeze ? (ui.blast ? 'Your team\u2019s ships cannot shoot until it thaws.' : 'Nobody on your team can answer until it thaws.') : 'Your team can answer again in a moment.'));
    box.hidden = false;
    play.classList.add('held');
    optionButtons().forEach(function (b) { b.disabled = true; });
    clearInterval(holdTimer);
    var tick = function () {
      var left = Math.ceil((holdEnd - Date.now()) / 1000);
      num.textContent = String(Math.max(0, left));
      if (left <= 0) {
        clearInterval(holdTimer);
        box.hidden = true;
        play.classList.remove('held');
        optionButtons().forEach(function (b) { b.disabled = locked; });
      }
    };
    tick();
    holdTimer = setInterval(tick, 200);
  }

  // Glitched: the answers wobble, blur and trade places now and then.
  function drawGlitch(pu) {
    if (!pu.glitchMs) return;
    var end = Date.now() + pu.glitchMs;
    if (Math.abs(end - glitchEnd) < 400) return;
    glitchEnd = end;
    var play = $(ui.play);
    play.classList.add('glitched');
    play.setAttribute('data-glitch', POWER.glitch[0] + ' Glitched by ' + pu.glitchBy);
    clearTimeout(glitchTimer);
    clearInterval(shuffleTimer);
    // Vocab Live's answers trade places; Blast's asteroids already move.
    if (ui.opts) shuffleTimer = setInterval(function () {
      var box = $(ui.opts);
      var kids = [].slice.call(box.children);
      if (kids.length > 1) box.appendChild(kids[Math.floor(Math.random() * kids.length)]);
    }, 1600);
    glitchTimer = setTimeout(function () { play.classList.remove('glitched'); clearInterval(shuffleTimer); }, pu.glitchMs);
  }

  // "Waiting for your team" once this student has pressed Continue.
  function waitNote(v) {
    var go = $('jnFeedback').querySelector('.lv-continue');
    var note = $('jnFeedback').querySelector('.lv-wait-note');
    if (!go || !note || !v.wait) return;
    go.disabled = v.wait.me;
    note.textContent = v.wait.me && v.wait.of > 1 ? 'Waiting for your team: ' + v.wait.ready + ' of ' + v.wait.of + ' ready.' : '';
  }

  function drawFinished(v) {
    show('jnDone');
    $('jnDoneEmoji').textContent = v.team.place === 1 ? '\u{1F3C6}' : '\u{1F389}';
    $('jnDoneText').textContent = (v.teamsMode ? 'Your team finished ' : 'You finished ') + ordinal(v.team.place) + '!';
    $('jnDoneMore').textContent = 'Watch the board to see who else finishes.';
  }

  function drawDone(v) {
    shownQ = '';
    show('jnDone');
    var place = v.done && v.done.place;
    var winners = (v.done && v.done.winners) || [];
    // 1st, 2nd or 3rd: a big gold, silver or bronze medal spinning on this
    // screen (Gennaro, 2026-09-29); otherwise a flag.
    var em = $('jnDoneEmoji');
    em.textContent = '';
    if (place >= 1 && place <= 3) {
      var metal = ['GOLD', 'SILVER', 'BRONZE'][place - 1];
      var medal = mk('span', 'lv-spin-medal m' + place);
      medal.appendChild(mk('span', 'lv-spin-ribbon'));
      var coin = mk('span', 'lv-spin-coin');
      coin.appendChild(mk('span', 'lv-spin-face', String(place)));
      medal.appendChild(coin);
      em.appendChild(medal);
      em.appendChild(mk('span', 'lv-spin-label m' + place, metal + ' MEDAL!'));
    } else {
      em.textContent = place ? '\u{1F389}' : '\u{1F3C1}';
    }
    $('jnDoneText').textContent = place
      ? (v.teamsMode ? 'Your team finished ' : 'You finished ') + ordinal(place) + '!'
      : 'Game over!';
    // "Winner: Red Bears." or "1st place: Red Bears. 2nd place: Teal Otters."
    var more = $('jnDoneMore');
    more.textContent = '';
    // Blast shows points, Match shows times.
    var extra = function (w) {
      if (v.kind === 'blast') return ' (' + w.score + (w.score === 1 ? ' point)' : ' points)');
      if (v.kind === 'match' && w.finishMs) return ' (' + (w.finishMs / 1000).toFixed(1) + ' s)';
      return '';
    };
    if (v.kind === 'blast' && v.done) more.appendChild(mk('span', 'lv-done-line', 'Your team scored ' + v.done.score + (v.done.score === 1 ? ' point.' : ' points.')));
    drawPodium(winners, extra);
    drawStats(v);
    more.appendChild(mk('span', 'lv-done-line', 'Stay on this page in case the host plays again.'));
  }

  // The same gold, silver and bronze podium as the big screen, small enough
  // for a phone (Gennaro, 2026-09-29). Drawn once per result, so updates
  // while the game sits on this screen do not start it over.
  var podiumKey = '';
  function drawPodium(winners, extra) {
    var pod = $('jnPodium');
    var key = JSON.stringify(winners);
    if (key === podiumKey) return;
    podiumKey = key;
    pod.textContent = '';
    pod.hidden = !winners.length;
    var rise = { 3: 0.2, 2: 0.8, 1: 1.4 };
    winners.forEach(function (w) {
      var li = mk('li', 'lv-step-block p' + w.place + (w.mine ? ' mine' : ''));
      li.style.setProperty('--team', w.color || '');
      li.style.setProperty('--rise', (rise[w.place] || 0) + 's');
      li.style.setProperty('--land', ((rise[w.place] || 0) + 0.45) + 's');
      li.style.setProperty('--dance', ((rise[w.place] || 0) + 1.1) + 's');
      li.style.setProperty('--shine', ((rise[w.place] || 0) + 1.3) + 's');
      var card = mk('div', 'lv-step-card');
      if (w.place === 1) card.appendChild(mk('span', 'lv-crown', '\u{1F451}'));
      card.appendChild(mk('span', 'lv-emoji', w.emoji || ''));
      card.appendChild(mk('span', 'lv-step-name', w.name));
      var x = extra(w).replace(/^ \(|\)$/g, '');
      if (x) card.appendChild(mk('span', 'lv-step-score', x));
      if (w.mine) card.appendChild(mk('span', 'lv-step-you', 'You'));
      li.appendChild(card);
      var base = mk('div', 'lv-step-base');
      base.appendChild(mk('span', 'lv-step-top'));
      base.appendChild(mk('span', 'lv-step-shine'));
      base.appendChild(mk('span', 'lv-medal m' + w.place, String(w.place)));
      li.appendChild(base);
      pod.appendChild(li);
    });
  }

  // The end-of-game numbers (Gennaro, 2026-09-29): this student's own
  // answers first, then the class's, the terms missed most, and the fastest
  // and slowest terms. Drawn once per result, like the podium.
  var statsKey = '';
  function drawStats(v) {
    var box = $('jnStats');
    var st = v.done && v.done.stats, me = v.done && v.done.mine;
    var key = JSON.stringify([st, me]);
    if (key === statsKey) return;
    statsKey = key;
    box.textContent = '';
    if (!st || !(st.right + st.wrong)) { box.hidden = true; return; }
    box.hidden = false;
    var secs = function (ms) { return (ms / 1000).toFixed(1) + ' s'; };
    var tiles = function (list) {
      var row = mk('div', 'lv-stat-tiles');
      list.forEach(function (t) {
        if (!t) return;
        var d = mk('div', 'lv-stat-tile');
        d.appendChild(mk('span', 'lv-stat-big', t[0]));
        d.appendChild(mk('span', 'lv-stat-label', t[1]));
        if (t[2]) d.appendChild(mk('span', 'lv-stat-small', t[2]));
        row.appendChild(d);
      });
      return row;
    };
    var match = v.kind === 'match';
    if (me && me.right + me.wrong) {
      box.appendChild(mk('h3', '', 'Your stats'));
      var tot = me.right + me.wrong;
      box.appendChild(tiles([
        [String(me.right), match ? 'pairs matched' : 'right answers', me.wrong ? me.wrong + (match ? ' wrong tries' : ' wrong') : 'None wrong!'],
        [Math.round(me.right * 100 / tot) + '%', 'right'],
        me.avg ? [secs(me.avg), match ? 'per pair' : 'average time'] : null,
        me.best ? [secs(me.best), 'your fastest', me.term] : null
      ]));
    }
    box.appendChild(mk('h3', '', 'Class stats'));
    var total = st.right + st.wrong;
    box.appendChild(tiles([
      [Math.round(st.right * 100 / total) + '%', 'right', total + (match ? ' tries' : ' answers')],
      st.avg ? [secs(st.avg), match ? 'average per pair' : 'average time'] : null,
      st.best ? [secs(st.best.ms), 'fastest', st.best.term + (st.best.by ? ', ' + st.best.by : '')] : null
    ]));
    if (st.missed.length) {
      var miss = mk('div', 'lv-missed');
      miss.appendChild(mk('h4', '', 'Most missed terms'));
      var ol = mk('ol', 'lv-missed-list');
      st.missed.slice(0, 5).forEach(function (m) {
        var li = mk('li');
        li.appendChild(mk('strong', '', m.term));
        li.appendChild(mk('span', 'lv-missed-n', 'missed ' + m.n + (m.n === 1 ? ' time' : ' times')));
        li.appendChild(mk('span', 'lv-missed-def', m.def));
        ol.appendChild(li);
      });
      miss.appendChild(ol);
      box.appendChild(miss);
    }
    if (st.fastest.length) {
      var speed = mk('div', 'lv-speed');
      [['Fastest terms', st.fastest], ['Slowest terms', st.slowest]].forEach(function (c) {
        var col = mk('div', 'lv-speed-col');
        col.appendChild(mk('h4', '', c[0]));
        var list = mk('ol', 'lv-speed-list');
        c[1].slice(0, 3).forEach(function (r) {
          var li = mk('li');
          li.appendChild(mk('span', 'lv-speed-term', r.term));
          li.appendChild(mk('span', 'lv-speed-time', secs(r.avg)));
          list.appendChild(li);
        });
        col.appendChild(list);
        speed.appendChild(col);
      });
      box.appendChild(speed);
    }
  }

  // Opened from the QR code or a copied link (join/#CODE), or from the code
  // box on the book's home page (join/?code=CODE): the code is in the address.
  // Inside the host's demo split screen: just the game, no site header.
  if (/[?&]embed=1/.test(location.search)) document.documentElement.classList.add('lv-embed');
  var fromHome = (location.search.match(/[?&]code=([^&]*)/) || [])[1];
  if (fromHome) {
    fromHome = decodeURIComponent(fromHome.replace(/\+/g, ' ')).toUpperCase().replace(/[^A-Z0-9]/g, '');
    history.replaceState(null, '', location.pathname + '#' + fromHome);
  }
  var fromLink = location.hash.slice(1).toUpperCase();
  if (CODE.test(fromLink)) {
    $('jnCodeInput').value = fromLink;
    comeBack(fromLink);
    open(fromLink);
  } else if (fromHome) {
    $('jnCodeInput').value = fromHome.slice(0, 6);
    $('jnCodeError').textContent = 'The code is 6 letters and numbers. Check the board and try again.';
  }
})();
