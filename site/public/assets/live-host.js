/* ============================================================
   Live games: the teacher's host screen (live/).

   Anyone (teacher or student) picks a game (Vocab Live, Blast or Match),
   a set and the options, and the site makes a game with a join code
   (IS8Editor.liveCreate).
   This screen then holds a connection to the game server
   (textbook/live-worker) and draws whatever step the game is at: the lobby
   with the code and a QR code, the teams, the race, and the winners.

   The game's code and host key are kept in this browser (the live key) so a
   refresh can go straight back to the game. Nothing about students is kept.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ED = window.IS8Editor;
  var STEPS = ['lvGate', 'lvSetup', 'lvLobby', 'lvTeamsStep', 'lvPlay', 'lvDone'];
  var sets = JSON.parse($('lvSets').textContent);
  var ws = null, game = null, board = null, leaving = false, retries = 0, pingTimer = null, qrFor = '';

  function show(id) { STEPS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function status(text) { $('lvStatus').textContent = text || ''; }
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
  function saveHost(g) { var s = readSaved(); s.host = g; writeSaved(s); }
  function forgetHost() { var s = readSaved(); delete s.host; writeSaved(s); }

  /* ---------------- getting in ---------------- */

  function gate() {
    if (!ED) { $('lvGateText').textContent = 'This page did not load properly. Reload it to try again.'; return; }
    ED.session().then(function (s) {
      if (!s.cloud) {
        $('lvGateText').textContent = 'Saving to the site is not switched on, so games cannot run yet.';
      } else if (!s.live) {
        $('lvGateText').textContent = 'Games need one more Cloudflare setting. The steps are in the README, steps 4 and 5.';
      } else {
        setup();
      }
    });
  }

  function setup() {
    show('lvSetup');
    if (typeof musicFor === 'function') { $('lvMusic').hidden = true; music.part = ''; stopSong(); }
    $('lvLobbyOptsBody').textContent = '';
    // His saved defaults first; a set or game named in the address still wins.
    var defaults = readSaved().defaults;
    if (defaults) applyDefaults(defaults);
    $('lvSaveDefault').checked = !!defaults;
    var want = location.hash.slice(1);
    if (want && sets.some(function (s) { return s.id === want; })) $('lvSet').value = want;
    var saved = readSaved().host;
    // A game closes 5 minutes after the last thing that happened in it.
    if (saved && Date.now() - saved.at < 6 * 60 * 1000) {
      $('lvResumeText').textContent = 'Your game ' + saved.code + ' may still be running.';
      $('lvResume').hidden = false;
    }
    // Opened from a set page's game card: live/?game=blast#<set>
    var kind = (location.search.match(/[?&]game=(volley|blast|match)/) || [])[1];
    if (kind) document.querySelector('input[name="lvGame"][value="' + kind + '"]').checked = true;
    syncOptions();
    // Players per team follows the game unless his default is for this game.
    if (defaults && defaults.lvGame === (picked('lvGame') || 'volley') && defaults.lvSize) $('lvSize').value = defaults.lvSize;
  }

  // Save these as my default settings (Gennaro, 2026-09-29): every choice on
  // the setup screen, kept in this browser and filled in next time.
  var DEFAULT_RADIOS = ['lvGame', 'lvTeams', 'lvPrompt', 'lvWho'];
  var DEFAULT_SELECTS = ['lvSet', 'lvMinutes', 'lvPairs', 'lvPause', 'lvTarget', 'lvWinners', 'lvSize', 'lvPickTeams', 'lvLimit'];
  var POWER_KINDS = ['shield', 'strike', 'freeze', 'glitch', 'swap', 'double', 'fifty', 'mirror'];
  var DEFAULT_CHECKS = ['lvHidden', 'lvFast', 'lvPowers', 'lvDoodle'].concat(POWER_KINDS.map(function (k) { return 'lvPw-' + k; }));
  // Blast's minutes box: a whole number from 1 to 30, 5 if it is left empty.
  function minutesIn(input) {
    var n = Math.round(Number(input.value));
    n = n >= 1 ? Math.min(30, n) : 5;
    input.value = String(n);
    return n;
  }
  function collectDefaults() {
    var d = {};
    DEFAULT_RADIOS.forEach(function (n) { d[n] = picked(n); });
    DEFAULT_SELECTS.forEach(function (id) { d[id] = $(id).value; });
    DEFAULT_CHECKS.forEach(function (id) { d[id] = $(id).checked; });
    d.v = 2;
    return d;
  }
  function applyDefaults(d) {
    // Defaults saved before Blast had a minutes box held its old 3-minute
    // choice; those start at the new 5 instead (Gennaro, 2026-09-29).
    if (!d.v && String(d.lvMinutes) === '3') d = Object.assign({}, d, { lvMinutes: '5' });
    DEFAULT_RADIOS.forEach(function (n) {
      var r = d[n] && document.querySelector('input[name="' + n + '"][value="' + d[n] + '"]');
      if (r) r.checked = true;
    });
    DEFAULT_SELECTS.forEach(function (id) {
      var sel = $(id);
      if (sel.tagName === 'INPUT') { if (d[id]) sel.value = d[id]; return; }
      if (d[id] && [].some.call(sel.options, function (o) { return o.value === d[id]; })) sel.value = d[id];
    });
    DEFAULT_CHECKS.forEach(function (id) { if (typeof d[id] === 'boolean') $(id).checked = d[id]; });
  }

  function picked(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  // Each game shows only its own options.
  var lastKind = '';
  function syncOptions() {
    var kind = picked('lvGame') || 'volley';
    [].forEach.call(document.querySelectorAll('#lvSetup [data-for]'), function (el) {
      el.hidden = el.getAttribute('data-for').split(' ').indexOf(kind) === -1;
    });
    $('lvSizeRow').hidden = !(kind === 'blast' || (kind === 'volley' && picked('lvTeams') === 'teams'));
    $('lvPickRow').hidden = !(kind === 'volley' && picked('lvTeams') === 'pick');
    if (kind !== lastKind) $('lvSize').value = kind === 'blast' ? '4' : '3';
    // Teams of 5 or 6 are for Vocab Live only: Blast has four ships.
    [].forEach.call($('lvSize').options, function (o) { o.disabled = o.hidden = kind === 'blast' && Number(o.value) > 4; });
    if (kind === 'blast' && Number($('lvSize').value) > 4) $('lvSize').value = '4';
    // The power-up list shows once power-ups are switched on.
    if (kind === 'volley' || kind === 'blast') $('lvPwKinds').hidden = !$('lvPowers').checked;
    lastKind = kind;
  }
  document.querySelectorAll('input[name="lvTeams"], input[name="lvGame"]').forEach(function (r) { r.addEventListener('change', syncOptions); });
  $('lvPowers').addEventListener('change', syncOptions);

  $('lvCreate').addEventListener('click', function () {
    var btn = this;
    $('lvSetupError').textContent = '';
    $('lvSetupNote').textContent = '';
    btn.disabled = true;
    btn.textContent = 'Making the game...';
    $('lvResume').hidden = true;
    var opts = {
      teams: picked('lvTeams') !== 'solo',
      pick: picked('lvTeams') === 'pick',
      pickTeams: Number($('lvPickTeams').value),
      promptDef: picked('lvPrompt') === 'def',
      typedNames: picked('lvWho') === 'typed',
      fast: $('lvFast').checked,
      pause: Number($('lvPause').value),
      target: Number($('lvTarget').value),
      winners: Number($('lvWinners').value),
      teamSize: Number($('lvSize').value),
      minutes: minutesIn($('lvMinutes')),
      limit: Number($('lvLimit').value),
      pairs: Number($('lvPairs').value),
      hidden: $('lvHidden').checked,
      doodle: $('lvDoodle').checked,
      powers: $('lvPowers').checked && POWER_KINDS.some(function (k) { return $('lvPw-' + k).checked; }),
      powerKinds: POWER_KINDS.filter(function (k) { return $('lvPw-' + k).checked; }),
      demo: $('lvDemo').checked
    };
    stopTrying();
    if ($('lvSaveDefault').checked) { var sd = readSaved(); sd.defaults = collectDefaults(); writeSaved(sd); }
    else { var sn = readSaved(); delete sn.defaults; writeSaved(sn); }
    ED.liveCreate($('lvSet').value, opts, picked('lvGame') || 'volley').then(function (r) {
      game = { code: r.code, key: r.hostKey, at: Date.now() };
      saveHost(game);
      connect();
    }, function (err) {
      $('lvSetupError').textContent = err.message;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Create game';
    });
  });

  $('lvResumeBtn').addEventListener('click', function () {
    game = readSaved().host;
    if (game) connect();
  });

  /* ---------------- the connection ---------------- */

  // One game per screen. Gennaro's board flickered between two games
  // (2026-09-30): a second connection was opened while the first was still
  // live, and both kept drawing. Each new connection now retires the old
  // one, and anything still arriving from a retired one is ignored.
  var retryTimer = null;
  function retire() {
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    var old = ws;
    ws = null;
    if (!old) return;
    old.onopen = old.onmessage = old.onclose = null;
    try { old.close(); } catch (e) { /* already closed */ }
  }
  function connect() {
    retire();
    leaving = false;
    status('Connecting...');
    var sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/live/' + game.code + '/ws?host=' + encodeURIComponent(game.key));
    var forCode = game.code;
    ws.onopen = function () {
      if (sock !== ws) return;
      retries = 0;
      status('');
      clearInterval(pingTimer);
      pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000);
    };
    ws.onmessage = function (e) {
      if (sock !== ws || e.data === 'pong') return;
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === 'board' && m.code === forCode) draw(m);
      else if (m.t === 'error' || m.t === 'over') {
        leaving = true;
        forgetHost();
        game = null;
        qrFor = '';
        setup();
        $('lvResume').hidden = true;
        if (m.t === 'over' || m.code === 'nogame') $('lvSetupNote').textContent = (m.t === 'over' ? m.msg : 'That game has closed.') + ' You can set up a new one below.';
        else $('lvSetupError').textContent = m.msg || 'That game has ended.';
      }
    };
    ws.onclose = function () {
      if (sock !== ws) return;
      clearInterval(pingTimer);
      if (leaving) return;
      retries += 1;
      status('Lost the connection. Trying again...');
      retryTimer = setTimeout(connect, Math.min(8000, 800 * retries));
    };
  }

  function send(m) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
  }

  /* ---------------- inviting students ---------------- */

  var toastTimer;
  function toast(text) {
    var t = $('lvToast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2500);
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      box.remove();
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }
  $('lvCopy').addEventListener('click', function () {
    if (!board) return;
    var link = joinLink(board.code);
    copyText(link).then(function () {
      toast('Copied! Paste the join link anywhere.');
    }, function () {
      toast('Could not copy. The link is ' + link);
    });
  });

  /* ---------------- lobby and game music ---------------- */

  // Gennaro asked for music (2026-09-29): the one other exception to the
  // book's no sound rule. It plays only on the host's screen and only if he
  // picks a song: a lobby song while students join (lobby and teams
  // screens) and a game song while the game is on. The music bar on those
  // screens mutes it and changes the song or volume at any time. The files
  // are in assets/music/ (free Pixabay tracks he supplied). His picks and
  // volume are remembered in this browser.
  var SONGS = {
    lobby: [
      ['competition-briefing', 'Competition Briefing'],
      ['cartoon-lobby-music-3', 'Cartoon Lobby Music 3'],
      ['cartoon-lobby-music-10', 'Cartoon Lobby Music 10'],
      ['video-game-music', 'Video Game Music'],
      ['elevator-music', 'Elevator Music'],
      ['lounge-jazz', 'Lounge Jazz'],
      ['waiting-room-calm', 'Waiting Room (Calm)']
    ],
    game: [
      ['game-quiz-master', 'Quiz Master'],
      ['game-pixel-chiptune', 'Pixel Chiptune'],
      ['game-retro-game-arcade', 'Retro Game Arcade'],
      ['game-arcadia', 'Arcadia'],
      ['game-rise-above', 'Rise Above'],
      ['game-heroic-battle-orchestra', 'Heroic Battle Orchestra'],
      ['game-airland-jazz', 'Airland Jazz']
    ]
  };
  var SOUND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var SOUND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var saved0 = readSaved();
  var num = function (v, d) { return typeof v === 'number' ? v : d; };
  var music = {
    lobby: saved0.music || '',
    game: saved0.gameMusic || '',
    // Each part has its own volume and its own mute (Gennaro, 2026-09-29).
    vol: { lobby: num(saved0.volume, 60), game: num(saved0.gameVolume, num(saved0.volume, 60)) },
    // A bug on 2026-09-29 could save the game music as muted without anyone
    // pressing mute, which also silenced the winners' sounds; that saved
    // mute is dropped once (soundFix).
    mute: { lobby: !!saved0.lobbyMuted, game: saved0.soundFix === 1 && !!saved0.gameMuted },
    part: '',        // 'lobby' or 'game': which song the bar is for now
    sounding: '',    // the part whose song is playing (for its volume)
    player: null,
    trying: null     // the setup screen's Listen button that is playing
  };
  function keepMusic() {
    var s = readSaved();
    s.music = music.lobby; s.gameMusic = music.game;
    s.volume = music.vol.lobby; s.gameVolume = music.vol.game;
    s.lobbyMuted = music.mute.lobby; s.gameMuted = music.mute.game;
    s.soundFix = 1;
    writeSaved(s);
  }
  function fillSongs(sel, part) {
    sel.textContent = '';
    var off = mk('option', '', 'No music');
    off.value = '';
    sel.appendChild(off);
    SONGS[part].forEach(function (x) { var o = mk('option', '', x[1]); o.value = x[0]; sel.appendChild(o); });
    sel.value = music[part];
  }
  function player() {
    if (!music.player) {
      music.player = new Audio();
      music.player.loop = true;
      music.player.preload = 'none';
    }
    return music.player;
  }
  function playSong(id, part) {
    var p = player();
    var src = '../assets/music/' + id + '.mp3';
    if (p.getAttribute('src') !== src) p.setAttribute('src', src);
    music.sounding = part;
    p.volume = music.vol[part] / 100;
    // Already playing this song: nothing to do (every board update comes here).
    if (!p.paused) return;
    var go = p.play();
    // Only a browser that blocks sound mutes the music. A play cut short
    // because the game moved on is not that: treating it so used to mute the
    // game music, and with it the winners' song and pops (Gennaro, 2026-09-29).
    if (go && go.catch) go.catch(function (e) { if (e && e.name === 'NotAllowedError') { music.mute[part] = true; drawControls(); } });
  }
  function stopSong() { if (music.player) music.player.pause(); }
  // Called on every board update: the lobby song in the lobby and on the
  // teams screen, the game song during the game, nothing after it.
  // The game song waits for GO, so the 3, 2, 1 beeps are heard on their own
  // (Gennaro, 2026-09-30); goLeft is how long until GO.
  var goTimer = null;
  function musicFor(phase, goLeft) {
    clearTimeout(goTimer);
    if (phase === 'play' && goLeft > 0) {
      goTimer = setTimeout(function () { if (board && board.phase === 'play') musicFor('play', 0); }, goLeft);
      stopSong();
      phase = 'countdown';
    }
    var part = phase === 'lobby' || phase === 'teams' ? 'lobby' : phase === 'play' ? 'game' : '';
    var bar = $('lvMusic');
    // Under the join buttons in the lobby, under the top bar on the teams and game screens.
    if (phase === 'lobby' && bar.previousElementSibling !== $('lvToast')) $('lvToast').after(bar);
    if (phase === 'teams' && bar.nextElementSibling !== $('lvTeamList')) $('lvTeamList').before(bar);
    // During a game it sits above the race, beside "Show only the top 5".
    var tools = document.querySelector('#lvPlay .lv-race-tools');
    if (phase === 'play' && bar.parentNode !== tools) tools.prepend(bar);
    bar.hidden = !part;
    if (part !== music.part) {
      music.part = part;
      if (part) {
        fillSongs($('lvMusicSong'), part);
        $('lvMusicLabel').textContent = part === 'game' ? 'Game music' : 'Lobby music';
      }
    }
    if (part && music[part] && !music.mute[part]) playSong(music[part], part);
    else stopSong();
    drawControls();
  }
  // A mute button's picture and words.
  function muteLook(btn, part, what) {
    var quiet = music.mute[part] || !music[part];
    btn.innerHTML = quiet ? SOUND_OFF : SOUND_ON;
    btn.title = (music.mute[part] ? 'Unmute the ' : 'Mute the ') + what;
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(music.mute[part]));
    btn.classList.toggle('muted', quiet);
  }
  function drawControls() {
    muteLook($('lvLobbyMute'), 'lobby', 'lobby music');
    muteLook($('lvGameMute'), 'game', 'game music');
    $('lvLobbyVolume').value = String(music.vol.lobby);
    $('lvGameVolume').value = String(music.vol.game);
    if (music.part) {
      muteLook($('lvMusicPlay'), music.part, music.part === 'game' ? 'game music' : 'lobby music');
      $('lvMusicSong').value = music[music.part];
      $('lvMusicVolume').value = String(music.vol[music.part]);
    }
  }
  // Mute or unmute one part, from its setup button or the music bar.
  function toggleMute(part) {
    music.mute[part] = !music.mute[part];
    keepMusic();
    var tryingThis = music.trying && music.trying.getAttribute('data-part') === part;
    if (music.mute[part]) { if (music.sounding === part) stopSong(); if (tryingThis) stopTrying(); }
    else if (music.part === part && music[part]) playSong(music[part], part);
    drawControls();
  }
  function setVolume(part, v) {
    music.vol[part] = v;
    if (music.player && music.sounding === part) music.player.volume = v / 100;
    // Moving the slider on muted music turns it back on (Gennaro, 2026-09-29).
    if (music.mute[part] && v > 0) { toggleMute(part); return; }
    keepMusic();
    drawControls();
  }
  // The setup screen: a menu, a Listen button, a mute button and a volume
  // slider for each part.
  [['lobby', 'lvMusicPick', 'lvMusicTry', 'lvLobbyMute', 'lvLobbyVolume'], ['game', 'lvGameMusicPick', 'lvGameMusicTry', 'lvGameMute', 'lvGameVolume']].forEach(function (x) {
    var part = x[0], pick = $(x[1]), tryBtn = $(x[2]);
    tryBtn.setAttribute('data-part', part);
    fillSongs(pick, part);
    pick.addEventListener('change', function () {
      music[part] = pick.value;
      keepMusic();
      if (music.trying === tryBtn) { if (pick.value) playSong(pick.value, part); else stopTrying(); }
      drawControls();
    });
    tryBtn.addEventListener('click', function () {
      if (music.trying === tryBtn) { stopTrying(); return; }
      stopTrying();
      if (!music[part]) { music[part] = SONGS[part][0][0]; pick.value = music[part]; keepMusic(); }
      if (music.mute[part]) { music.mute[part] = false; keepMusic(); }
      music.trying = tryBtn;
      tryBtn.textContent = 'Stop';
      playSong(music[part], part);
      drawControls();
    });
    $(x[3]).addEventListener('click', function () { toggleMute(part); });
    $(x[4]).addEventListener('input', function () { setVolume(part, Number(this.value)); });
  });
  function stopTrying() {
    if (!music.trying) return;
    music.trying.textContent = 'Listen';
    music.trying = null;
    stopSong();
  }
  // The music bar in the lobby and the game works on the part playing now.
  $('lvMusicPlay').addEventListener('click', function () { if (music.part) toggleMute(music.part); });
  $('lvMusicSong').addEventListener('change', function () {
    if (!music.part) return;
    music[music.part] = this.value;
    music.mute[music.part] = false;
    keepMusic();
    if (this.value) playSong(this.value, music.part); else stopSong();
    drawControls();
  });
  $('lvMusicVolume').addEventListener('input', function () { if (music.part) setVolume(music.part, Number(this.value)); });
  drawControls();

  /* ---------------- changing the settings in the lobby ---------------- */

  // The same choices as the setup screen, for the game being played, sent to
  // the game as they change. The server only takes them in the lobby.
  var SETTINGS = {
    volley: [
      ['teams', 'Teams', [[true, 'Teams'], [false, 'Individuals']]],
      ['pick', 'How teams are made', [[false, 'Random teams'], [true, 'Students pick']], function (o) { return o.teams; }],
      ['pickTeams', 'Number of teams to pick from', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8'], [9, '9'], [10, '10']], function (o) { return o.teams && o.pick; }],
      ['teamSize', 'Players per team', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], function (o) { return o.teams && !o.pick; }],
      ['promptDef', 'Show first', [[true, 'Definition, then term'], [false, 'Term, then definition']]],
      ['limit', 'Time limit', [[0, 'None'], [2, '2 minutes'], [3, '3 minutes'], [5, '5 minutes'], [7, '7 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes']]],
      ['target', 'Questions to win', [[6, '6'], [8, '8'], [10, '10'], [12, '12'], [15, '15'], [20, '20']]],
      ['winners', 'Number of winners', [[1, '1'], [2, '2'], [3, '3']]],
      ['pause', 'Pause after a wrong answer', [[3, '3 seconds'], [5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds']]],
      ['fast', 'Fast mode (a wrong answer does not reset)', [[false, 'Off'], [true, 'On']]],
      ['powers', 'Power-ups', [[false, 'Off'], [true, 'On']]],
      ['doodle', 'Drawing pad while waiting', [[true, 'On'], [false, 'Off']]]
    ],
    blast: [
      ['minutes', 'Time in minutes', 'number'],
      ['teamSize', 'Players per team', [[2, '2'], [3, '3'], [4, '4']]],
      ['powers', 'Power-ups', [[false, 'Off'], [true, 'On']]],
      ['doodle', 'Drawing pad while waiting', [[true, 'On'], [false, 'Off']]]
    ],
    match: [
      ['pairs', 'Pairs to match', [[4, '4 pairs'], [6, '6 pairs'], [8, '8 pairs']]],
      ['hidden', 'Hidden cards (memory mode)', [[false, 'Off'], [true, 'On']]],
      ['doodle', 'Drawing pad while waiting', [[true, 'On'], [false, 'Off']]]
    ]
  };
  function drawSettings(b) {
    var body = $('lvLobbyOptsBody');
    var list = SETTINGS[b.kind || 'volley'] || [];
    list.forEach(function (row) {
      var key = row[0], label = row[1], choices = row[2], when = row[3];
      var field = body.querySelector('[data-opt="' + key + '"]');
      if (!field && choices === 'number') {
        field = mk('label', 'lv-opt');
        field.setAttribute('data-opt', key);
        field.appendChild(mk('span', '', label)).className = 'lv-opt-name';
        var num = mk('input');
        num.type = 'number';
        num.min = '1';
        num.max = '30';
        num.step = '1';
        num.inputMode = 'numeric';
        num.addEventListener('change', function () {
          var opts = {};
          opts[key] = minutesIn(num);
          send({ t: 'settings', opts: opts });
        });
        field.appendChild(num);
        body.appendChild(field);
      }
      if (choices === 'number') {
        var box = field.querySelector('input');
        if (document.activeElement !== box) box.value = String(b.opts[key]);
        field.hidden = when ? !when(b.opts) : false;
        return;
      }
      if (!field) {
        field = mk('label', 'lv-opt');
        field.setAttribute('data-opt', key);
        field.appendChild(mk('span', '', label)).className = 'lv-opt-name';
        var sel = mk('select');
        choices.forEach(function (c, i) { var o = mk('option', '', c[1]); o.value = String(i); sel.appendChild(o); });
        sel.addEventListener('change', function () {
          var opts = {};
          opts[key] = choices[Number(sel.value)][0];
          send({ t: 'settings', opts: opts });
        });
        field.appendChild(sel);
        body.appendChild(field);
      }
      field.hidden = when ? !when(b.opts) : false;
      var s = field.querySelector('select');
      if (document.activeElement === s) return;
      var at = choices.map(function (c) { return c[0]; }).indexOf(b.opts[key]);
      if (at === -1 && key === 'pairs') at = 0;
      if (at !== -1) s.value = String(at);
    });
  }

  /* ---------------- drawing the game ---------------- */

  // The game server's clock as seen from this screen. Every update says the
  // server's time when it was sent, but some arrive later than others; the
  // one that arrived quickest is the truest, so that is kept. Clocks then
  // never jump back up when a slow update lands (Gennaro saw 8, 7, 8, 7).
  var skew = null;
  function heard(serverNow) { var d = serverNow - Date.now(); if (skew === null || d > skew) skew = d; }
  function local(serverTime) { return serverTime - (skew || 0); }
  function draw(b) {
    board = b;
    heard(b.now);
    // Every board update means something happened; remember when, for "Go back to it".
    if (game) { game.at = Date.now(); saveHost(game); }
    [].forEach.call(document.querySelectorAll('.lv-mini-code'), function (n) { n.textContent = b.code; });
    [].forEach.call(document.querySelectorAll('.lv-join-url'), function (n) { n.textContent = location.host + '/join'; });
    // A game that has just ended gets the full reveal (drumroll, podium,
    // takeover, song, fireworks); opened later, the podium just shows.
    if (b.phase === 'done' && lastPhase === 'play') revealNext = true;
    if (b.phase !== 'done') clearReveal();
    lastPhase = b.phase;
    if (b.phase === 'play' && b.goAt > b.now && window.IS8Celebrate) window.IS8Celebrate.countdown(local(b.goAt), { schedule: beeps });
    // The game song starts as GO! leaves the screen.
    musicFor(b.phase, b.phase === 'play' && b.goAt ? local(b.goAt) - Date.now() + 800 : 0);
    demoBanner(b);
    splitView(b);
    sizeScreen();
    drawRoster(b);
    if (b.phase === 'lobby') drawLobby(b);
    else if (b.phase === 'teams') drawTeams(b);
    else if (b.phase === 'play') drawRace(b);
    else if (b.phase === 'done') drawDone(b);
  }

  /* ---------------- the celebration ---------------- */

  // When a game ends (Gennaro, 2026-09-29): the winning song and a pop for
  // each firework on this screen, at the game music's volume unless it is
  // muted; confetti and fireworks on every screen (live-celebrate.js).
  var lastPhase = '';
  var popper = null;
  function pop(x) {
    if (music.mute.game) return;
    try {
      popper = sounds();
      var ac = popper, now = ac.currentTime, vol = music.vol.game / 100;
      // A crack of noise, and a low thump under it.
      var len = Math.floor(ac.sampleRate * 0.25), buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      var noise = ac.createBufferSource();
      noise.buffer = buf;
      var band = ac.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1200 + Math.random() * 1800;
      var g = ac.createGain();
      g.gain.setValueAtTime(0.9 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      var pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      noise.connect(band);
      band.connect(g);
      if (pan) { pan.pan.value = (x - 0.5) * 1.4; g.connect(pan); pan.connect(ac.destination); } else g.connect(ac.destination);
      noise.start(now);
      var osc = ac.createOscillator(), og = ac.createGain();
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
      og.gain.setValueAtTime(0.6 * vol, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(og);
      og.connect(ac.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) { /* no sound on this browser */ }
  }
  // A beep for 3, 2 and 1 and a higher, longer one for GO.
  // Race-start beeps (Gennaro, 2026-09-30): three short, round "boop"s for
  // 3, 2, 1 and a long, bright one an octave up for GO, like a kart race.
  // Each beep is set to its exact moment on the sound maker's own clock, not
  // played when a timer happens to fire, so they fall exactly a second apart.
  function beeps(list) {
    list.forEach(function (x) { beep(x.n, Math.max(0, (x.at - Date.now()) / 1000)); });
  }
  function beep(n, wait) {
    if (music.mute.game) return;
    try {
      popper = sounds();
      var ac = popper, now = ac.currentTime + (wait || 0), vol = music.vol.game / 100;
      var freq = n ? 587.33 : 1174.66, len = n ? 0.32 : 0.95;
      var out = ac.createGain(), soft = ac.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = n ? 2600 : 4200;
      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(0.32 * vol, now + 0.012);
      out.gain.setValueAtTime(0.32 * vol, now + len * 0.55);
      out.gain.exponentialRampToValueAtTime(0.0001, now + len);
      soft.connect(out);
      out.connect(ac.destination);
      // A square wave for the buzz and a triangle an octave down for body.
      [['square', freq, 0.55], ['triangle', freq / 2, 0.9]].forEach(function (w) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = w[0];
        o.frequency.value = w[1];
        g.gain.value = w[2];
        o.connect(g);
        g.connect(soft);
        o.start(now);
        o.stop(now + len + 0.02);
      });
    } catch (e) { /* no sound on this browser */ }
  }
  // The sound maker for the drumroll, crash, pops and beeps, woken up again
  // if the browser put it to sleep.
  function sounds() {
    popper = popper || new (window.AudioContext || window.webkitAudioContext)();
    if (popper.state === 'suspended' && popper.resume) popper.resume().catch(function () { /* still asleep */ });
    return popper;
  }
  // Browsers only let a page make sound after someone clicks or types on it,
  // and some (Safari, Chromebooks with strict settings) only for sound set up
  // during that click. So the first clicks on this page wake the sound maker
  // and ready the winners' song, and the end of the game plays them.
  var winSong = null;
  function unlockSound() {
    try { sounds(); } catch (e) { /* no Web Audio */ }
    if (!winSong) {
      winSong = new Audio('../assets/music/winning.mp3');
      winSong.preload = 'auto';
      winSong.muted = true;
      var p = winSong.play();
      var hush = function () { winSong.pause(); winSong.currentTime = 0; winSong.muted = false; };
      if (p && p.then) p.then(hush, function () { winSong.muted = false; winSong = null; });
      else hush();
    }
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, unlockSound, true); });
  function celebrate() {
    if (!music.mute.game) {
      var win = winSong || new Audio('../assets/music/winning.mp3');
      win.muted = false;
      win.currentTime = 0;
      win.volume = music.vol.game / 100;
      var go = win.play();
      if (go && go.catch) go.catch(function () { /* the browser blocked it */ });
    }
    if (window.IS8Celebrate) window.IS8Celebrate.start({ onBurst: pop, duration: 5000 });
  }

  // Demo mode: a banner saying so, with the button that ends the game.
  function demoBanner(b) {
    var on = !!(b.opts && b.opts.demo) && b.phase !== 'done';
    $('lvDemoBanner').hidden = !on;
    if (!on) return;
    var n = b.players.filter(function (p) { return p.bot; }).length;
    $('lvDemoText').textContent = b.phase === 'play'
      ? n + ' pretend students are playing. Some answers are right, some wrong.'
      : n + (n === 1 ? ' pretend student has' : ' pretend students have') + ' joined' + (n < 40 ? ', more are on the way.' : '.');
    $('lvDemoWin').hidden = b.phase !== 'play';
  }
  $('lvDemoWin').addEventListener('click', function () { send({ t: 'demoWin' }); });

  // Demo mode, split screen (Gennaro, 2026-09-29): a phone on the right side
  // of the host screen is a real student in the game, so both sides can be
  // tried at once. It is the join page itself, joined with the game's code.
  var split = null;
  function splitView(b) {
    var on = !!(b.opts && b.opts.demo);
    if (!on || (split && split.code !== b.code)) {
      if (split) { split.box.remove(); split.tab.remove(); document.body.classList.remove('lv-split-on', 'lv-split-wide'); window.removeEventListener('resize', split.fit); split = null; }
      if (!on) return;
    }
    if (split) return;
    var box = mk('aside', 'lv-split');
    box.setAttribute('aria-label', 'What a student sees');
    var bar = mk('div', 'lv-split-bar');
    bar.appendChild(mk('strong', '', 'What a student sees'));
    // Phone or computer: the same student, at a phone's width or a
    // Chromebook's, shrunk to fit.
    var kinds = mk('div', 'lv-split-kinds');
    kinds.setAttribute('role', 'group');
    kinds.setAttribute('aria-label', 'Screen size');
    var kindBtns = {};
    [['phone', 'Phone'], ['computer', 'Computer']].forEach(function (k) {
      var kb = mk('button', 'lv-split-kind', k[1]);
      kb.type = 'button';
      kb.addEventListener('click', function () { setKind(k[0]); });
      kindBtns[k[0]] = kb;
      kinds.appendChild(kb);
    });
    bar.appendChild(kinds);
    var hide = mk('button', 'btn secondary fc-small', 'Hide');
    hide.type = 'button';
    bar.appendChild(hide);
    box.appendChild(bar);
    var phone = mk('div', 'lv-phone');
    var frame = mk('iframe');
    var kind = 'phone';
    kind = readSaved().split === 'computer' ? 'computer' : 'phone';
    var fit = function () {
      if (kind !== 'computer') { frame.style.width = frame.style.height = frame.style.transform = ''; return; }
      var w = phone.clientWidth, h = phone.clientHeight, scale = w / 1280;
      frame.style.width = '1280px';
      frame.style.height = Math.round(h / scale) + 'px';
      frame.style.transform = 'scale(' + scale + ')';
    };
    var setKind = function (k) {
      kind = k;
      var saved = readSaved();
      saved.split = k;
      writeSaved(saved);
      box.classList.toggle('wide', k === 'computer');
      phone.className = k === 'computer' ? 'lv-laptop' : 'lv-phone';
      document.body.classList.toggle('lv-split-wide', k === 'computer' && !box.hidden);
      Object.keys(kindBtns).forEach(function (n) { kindBtns[n].setAttribute('aria-pressed', String(n === k)); });
      fit();
    };
    frame.title = 'A student\u2019s screen in this game';
    frame.src = '../join/?embed=1#' + b.code;
    phone.appendChild(frame);
    box.appendChild(phone);
    box.appendChild(mk('p', 'lv-small lv-split-note', 'This is a real player you can play as. Your students do not see it.'));
    var tab = mk('button', 'btn lv-split-tab', 'Show the student\u2019s screen');
    tab.type = 'button';
    tab.hidden = true;
    var shown = function (yes) {
      box.hidden = !yes;
      tab.hidden = yes;
      document.body.classList.toggle('lv-split-on', yes);
      document.body.classList.toggle('lv-split-wide', yes && kind === 'computer');
      fit();
    };
    hide.addEventListener('click', function () { shown(false); });
    tab.addEventListener('click', function () { shown(true); });
    document.body.appendChild(box);
    document.body.appendChild(tab);
    split = { code: b.code, box: box, tab: tab, fit: fit };
    window.addEventListener('resize', fit);
    setKind(kind);
    shown(true);
  }

  // The join page with the code already filled in.
  function joinLink(code) { return location.origin + '/join/#' + code; }

  function drawLobby(b) {
    show('lvLobby');
    $('lvJoinUrl').textContent = location.host + '/join';
    $('lvCode').textContent = b.code;
    // Google Classroom's own share page: the teacher picks the class and posts.
    $('lvClassroom').href = 'https://classroom.google.com/share?url=' + encodeURIComponent(joinLink(b.code)) +
      '&title=' + encodeURIComponent('Vocab Live: ' + b.title) +
      '&body=' + encodeURIComponent('Click the link to join the game. The code is ' + b.code + '.') +
      '&itemtype=announcement';
    if (qrFor !== b.code && window.qrcode) {
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(joinLink(b.code));
        qr.make();
        $('lvQr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        qrFor = b.code;
      } catch (e) { $('lvQrSide').hidden = true; }
    }
    var n = b.players.length;
    $('lvCount').textContent = n ? n + (n === 1 ? ' student has joined.' : ' students have joined.') : 'Waiting for students to join...';
    var picking = !!b.pick;
    $('lvMakeTeams').hidden = !b.opts.teams || picking;
    $('lvStartSolo').hidden = b.opts.teams && !picking;
    $('lvMakeTeams').disabled = $('lvStartSolo').disabled = !n;
    var list = $('lvPlayers');
    list.textContent = '';
    // Picking teams: the teams filling up, and below them who has not picked yet.
    $('lvPick').hidden = !picking;
    if (picking) drawPick(b);
    b.players.forEach(function (p) { if (!picking || !p.team) list.appendChild(playerChip(p)); });
    drawSettings(b);
  }

  // A student's name with remove and random name buttons. Removing takes a
  // second press so a slip of the mouse cannot do it.
  var chipSeen = {};
  function playerChip(p) {
    var li = mk('li', 'lv-player' + (p.on ? '' : ' off') + (chipSeen[p.id] ? '' : ' pop'));
    chipSeen[p.id] = true;
    li.appendChild(mk('span', 'lv-dot'));
    li.appendChild(mk('span', '', p.name));
    li.appendChild(controls(p));
    return li;
  }
  function controls(p) {
    var box = mk('span', 'lv-player-tools');
    var rename = mk('button', 'lv-x rename', '↻');
    rename.type = 'button';
    rename.title = 'Give ' + p.name + ' a random name';
    rename.setAttribute('aria-label', 'Give ' + p.name + ' a random name');
    rename.addEventListener('click', function () { send({ t: 'rename', id: p.id }); });
    var kick = mk('button', 'lv-x', '×');
    kick.type = 'button';
    kick.title = 'Remove ' + p.name;
    kick.setAttribute('aria-label', 'Remove ' + p.name + ' from the game');
    kick.addEventListener('click', function () {
      if (kick.classList.contains('sure')) { send({ t: 'kick', id: p.id }); return; }
      kick.classList.add('sure');
      kick.textContent = 'Remove?';
      setTimeout(function () { kick.classList.remove('sure'); kick.textContent = '×'; }, 3000);
    });
    box.appendChild(rename);
    box.appendChild(kick);
    return box;
  }

  /* ---------------- the lobby's settings panel ---------------- */

  // "Settings" in the lobby (Gennaro, 2026-10-01): a panel from the right,
  // so students joining no longer push the settings down the page.
  var settingsOpen = false;
  function openSettings(yes) {
    settingsOpen = yes;
    $('lvSettingsPanel').hidden = !yes;
    $('lvSettingsBack').hidden = !yes;
    $('lvSettingsBtn').setAttribute('aria-expanded', String(yes));
    if (yes) $('lvSettingsClose').focus();
  }
  $('lvSettingsBtn').addEventListener('click', function () { openSettings(!settingsOpen); });
  $('lvSettingsClose').addEventListener('click', function () { openSettings(false); $('lvSettingsBtn').focus(); });
  $('lvSettingsBack').addEventListener('click', function () { openSettings(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && settingsOpen) openSettings(false); });

  /* ---------------- sizes on this screen ---------------- */

  // Like Blooket and Wayground (Gennaro, 2026-10-01): buttons, menus and
  // settings stay their normal size on any screen; only what the class reads
  // from across the room (the join code and QR code, names, teams, the race,
  // the clock, the podium) grows to fill a bigger screen or projector, up to
  // about twice. For bigger controls, the browser's own zoom (A-/A+ were
  // removed, 2026-10-01).
  var showZoom = 1;
  function sizeScreen() {
    var main = document.querySelector('main');
    var w = main ? main.getBoundingClientRect().width : innerWidth;
    showZoom = Math.max(1, Math.min(1.9, w / 1360, innerHeight / 820));
    document.documentElement.style.setProperty('--lv-show', showZoom.toFixed(3));
  }
  window.addEventListener('resize', sizeScreen);
  sizeScreen();

  /* ---------------- the player list during a game ---------------- */

  // "Players" on the game screen (Gennaro, 2026-09-30): a panel from the
  // right, so nothing about removing anyone shows on the projector until the
  // teacher opens it. Each player: playing, idle or gone, a new name,
  // Remove (they may join again) and Remove and block (not back into this
  // game; the game forgets it when it closes). Both ask twice.
  var rosterOpen = false;
  function openRoster(yes) {
    rosterOpen = yes;
    $('lvRoster').hidden = !yes;
    $('lvRosterBack').hidden = !yes;
    $('lvRosterBtn').setAttribute('aria-expanded', String(yes));
    if (yes && board) drawRoster(board);
    if (yes) $('lvRosterClose').focus();
  }
  $('lvRosterBtn').addEventListener('click', function () { openRoster(!rosterOpen); });
  $('lvRosterClose').addEventListener('click', function () { openRoster(false); $('lvRosterBtn').focus(); });
  $('lvRosterBack').addEventListener('click', function () { openRoster(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && rosterOpen) openRoster(false); });

  // Two presses, like End game: the first asks, the second does it.
  function twice(btn, label, ask, go) {
    btn.textContent = label;
    btn.addEventListener('click', function () {
      if (btn.classList.contains('sure')) { go(); return; }
      btn.classList.add('sure');
      btn.textContent = ask;
      setTimeout(function () { btn.classList.remove('sure'); btn.textContent = label; }, 3000);
    });
  }
  var rosterKey = '';
  function drawRoster(b) {
    if (!rosterOpen) return;
    if (b.phase !== 'play') { openRoster(false); return; }
    var byTeam = {};
    b.players.forEach(function (p) { (byTeam[p.team] = byTeam[p.team] || []).push(p); });
    var key = JSON.stringify([b.teams.map(function (t) { return [t.id, t.name, t.members.map(function (m) { return [m.id, m.name, m.on]; })]; }), b.blocked || []]);
    // Redrawn only when someone changes, so a button that is asking stays asking.
    if (key === rosterKey) return;
    rosterKey = key;
    var body = $('lvRosterBody');
    body.textContent = '';
    b.teams.forEach(function (t) {
      var group = mk('section', 'lv-roster-team');
      group.style.setProperty('--team', t.color);
      if (b.opts.teams || b.kind === 'blast') {
        var h = mk('h3', 'lv-roster-team-name');
        h.appendChild(mk('span', 'lv-emoji', t.emoji));
        h.appendChild(mk('span', '', t.name));
        group.appendChild(h);
      }
      t.members.forEach(function (m) {
        var p = (byTeam[t.id] || []).filter(function (x) { return x.id === m.id; })[0] || m;
        var row = mk('div', 'lv-roster-row' + (m.on ? '' : ' gone'));
        row.appendChild(mk('span', 'lv-roster-dot', m.on ? '\u{1F7E2}' : '\u{1F47B}'));
        var who = mk('span', 'lv-roster-name', m.name);
        if (p.bot) who.appendChild(mk('span', 'lv-roster-bot', ' pretend'));
        row.appendChild(who);
        var tools = mk('span', 'lv-roster-tools');
        var rename = mk('button', 'btn secondary fc-small', 'New name');
        rename.type = 'button';
        rename.title = 'Give ' + m.name + ' a random name';
        rename.addEventListener('click', function () { send({ t: 'rename', id: m.id }); });
        var kick = mk('button', 'btn secondary fc-small lv-roster-kick');
        kick.type = 'button';
        twice(kick, 'Remove', 'Sure? Remove', function () { send({ t: 'kick', id: m.id }); });
        var block = mk('button', 'btn secondary fc-small lv-roster-kick');
        block.type = 'button';
        block.title = 'Take ' + m.name + ' out and keep them out of this game';
        twice(block, 'Remove and block', 'Sure? Block', function () { send({ t: 'kick', id: m.id, block: true }); });
        [rename, kick, block].forEach(function (x) { tools.appendChild(x); });
        row.appendChild(tools);
        group.appendChild(row);
      });
      body.appendChild(group);
    });
    var blocked = b.blocked || [];
    if (blocked.length) {
      var box = mk('section', 'lv-roster-team lv-roster-blocked');
      box.appendChild(mk('h3', 'lv-roster-team-name', '\u{1F6AB} Blocked from this game'));
      blocked.forEach(function (x) {
        var row = mk('div', 'lv-roster-row');
        row.appendChild(mk('span', 'lv-roster-name', x.name));
        var back = mk('button', 'btn secondary fc-small', 'Let back in');
        back.type = 'button';
        back.addEventListener('click', function () { send({ t: 'unblock', id: x.id }); });
        var tools = mk('span', 'lv-roster-tools');
        tools.appendChild(back);
        row.appendChild(tools);
        box.appendChild(row);
      });
      body.appendChild(box);
    }
  }

  // The teams students are picking, with the countdown that locks them in.
  var countTimer = null;
  function drawPick(b) {
    var box = $('lvPickTeamsBox');
    box.textContent = '';
    b.teams.forEach(function (t, i) {
      var card = mk('div', 'lv-team');
      card.style.setProperty('--team', t.color);
      var h = mk('div', 'lv-team-head');
      h.appendChild(mk('span', 'lv-emoji', t.emoji));
      h.appendChild(mk('span', 'lv-team-title', t.name));
      h.appendChild(mk('span', 'lv-team-count', t.members.length + ' / ' + b.pick.cap));
      h.appendChild(teamNum(i + 1));
      card.appendChild(h);
      var ul = mk('ul');
      t.members.forEach(function (m) {
        var li = mk('li', m.on ? '' : 'off');
        li.appendChild(mk('span', '', m.name));
        li.appendChild(controls(m));
        ul.appendChild(li);
      });
      if (!t.members.length) ul.appendChild(mk('li', 'lv-team-empty', 'No one yet'));
      card.appendChild(ul);
      box.appendChild(card);
    });
    fitNames(box);
    var left = b.players.filter(function (p) { return !p.team; }).length;
    $('lvCount').textContent = b.players.length
      ? b.players.length + (b.players.length === 1 ? ' student has' : ' students have') + ' joined' + (left ? ', ' + left + ' still to pick a team.' : '. Everyone is on a team.')
      : 'Waiting for students to join...';
    $('lvPickGo').hidden = !!b.pick.endsAt || b.pick.locked;
    $('lvPickSecs').parentNode.hidden = !!b.pick.endsAt || b.pick.locked;
    $('lvPickStop').hidden = !b.pick.endsAt && !b.pick.locked;
    $('lvPickStop').textContent = b.pick.locked ? 'Unlock the teams' : 'Stop the countdown';
    countdown($('lvCountdown'), $('lvCountdownNum'), $('lvCountdownText'), b.pick, b.now, 'Pick your team!');
  }
  // A big countdown: seconds left, red for the last three, then "locked in".
  function countdown(box, num, text, pk, now, prompt) {
    clearInterval(countTimer);
    if (pk.locked) {
      box.hidden = false;
      box.classList.remove('urgent');
      box.classList.add('locked');
      num.textContent = '\u{1F512}';
      text.textContent = 'Teams are locked in.';
      return;
    }
    box.classList.remove('locked');
    if (!pk.endsAt) { box.hidden = true; return; }
    box.hidden = false;
    var end = Math.max(Date.now(), local(pk.endsAt));
    var tick = function () {
      var left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      num.textContent = left >= 60 ? Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) : String(left);
      text.textContent = left ? prompt + ' Teams lock in when this reaches zero.' : 'Locking in...';
      box.classList.toggle('urgent', left <= 3);
      if (!left) clearInterval(countTimer);
    };
    tick();
    countTimer = setInterval(tick, 200);
  }
  $('lvPickGo').addEventListener('click', function () { send({ t: 'pickTimer', seconds: Number($('lvPickSecs').value) }); });
  $('lvPickStop').addEventListener('click', function () { send({ t: 'pickTimer', seconds: 0 }); });

  // Each team's number in the corner of its banner (Gennaro, 2026-09-30), so
  // the class can say "team 3" and find their seats.
  // A team's name stays on one line: a long one gets smaller letters.
  function fitNames(box) {
    requestAnimationFrame(function () {
      [].forEach.call(box.querySelectorAll('.lv-team-title'), function (el) {
        el.style.fontSize = '';
        var size = parseFloat(getComputedStyle(el).fontSize);
        var min = size * 0.62;
        while (el.scrollWidth > el.clientWidth + 1 && size > min) {
          size -= 0.5;
          el.style.fontSize = size + 'px';
        }
      });
    });
  }
  window.addEventListener('resize', function () { ['lvTeamList', 'lvPickTeamsBox'].forEach(function (id) { if ($(id)) fitNames($(id)); }); });

  function teamNum(n) {
    var s = mk('span', 'lv-team-num', String(n));
    s.setAttribute('aria-label', 'Team ' + n);
    return s;
  }

  function drawTeams(b) {
    show('lvTeamsStep');
    var box = $('lvTeamList');
    box.textContent = '';
    b.teams.forEach(function (t, i) {
      var card = mk('div', 'lv-team');
      card.style.setProperty('--team', t.color);
      var h = mk('div', 'lv-team-head');
      h.appendChild(mk('span', 'lv-emoji', t.emoji));
      h.appendChild(mk('span', 'lv-team-title', t.name));
      h.appendChild(teamNum(i + 1));
      card.appendChild(h);
      var ul = mk('ul');
      t.members.forEach(function (m) {
        var li = mk('li', m.on ? '' : 'off');
        li.appendChild(mk('span', '', m.name));
        li.appendChild(controls(m));
        ul.appendChild(li);
      });
      card.appendChild(ul);
      box.appendChild(card);
    });
    fitNames(box);
  }

  var lanes = {}, laneOrder = [], lastSort = 0, sortTimer = null;
  function drawRace(b) {
    show('lvPlay');
    var kind = b.kind || 'volley';
    // Blast: points against the leader, with the clock. Match: pairs found.
    var goal = kind === 'blast' ? Math.max(5, Math.max.apply(null, b.teams.map(function (t) { return t.progress; }).concat(0))) : kind === 'match' ? b.pairs : b.opts.target;
    // The header (Gennaro, 2026-09-30, like Blooket and Wayground): the set
    // and the goal on the left, the clock big in the middle with a minute off
    // or on beside it, the teacher's buttons on the right.
    $('lvPlayTitle').textContent = b.title;
    $('lvPlayGoal').textContent = kind === 'match' ? 'Match: ' + b.pairs + ' pairs' : kind === 'blast' ? 'Blast: most points wins' : 'Vocab Live: first to ' + b.opts.target;
    $('lvClockBox').hidden = kind === 'match';
    if (b.endsAt) blastClock(b);
    else { clearInterval(clockTimer); clockTimer = null; $('lvBigClock').textContent = ''; $('lvBigClock').className = 'lv-big-clock none'; }
    $('lvTimeMinus').hidden = !b.endsAt;
    $('lvTimePlus').textContent = b.endsAt ? '+ 1:00' : '+ Add a 1:00 clock';
    $('lvFastRow').hidden = kind !== 'volley';
    if (document.activeElement !== $('lvFastNow')) $('lvFastNow').checked = !!b.opts.fast;
    var race = $('lvRace');
    // Level teams keep the order they had, so a tie does not swap back and forth.
    var spot = {};
    laneOrder.forEach(function (id, i) { spot[id] = i; });
    var ranked = b.teams.slice().sort(function (x, y) {
      if (x.place && y.place) return x.place - y.place;
      if (x.place || y.place) return x.place ? -1 : 1;
      return (y.progress - x.progress) || ((x.id in spot ? spot[x.id] : 1e6) - (y.id in spot ? spot[y.id] : 1e6));
    });
    // The rows change places at most once a second, sliding to their new
    // spots (Gennaro saw them jiggle on every answer, 2026-09-30).
    var byId = {};
    b.teams.forEach(function (t) { byId[t.id] = t; });
    var now = Date.now(), order = ranked;
    if (now - lastSort < 1000 && laneOrder.length) {
      order = laneOrder.filter(function (id) { return byId[id]; }).map(function (id) { return byId[id]; });
      ranked.forEach(function (t) { if (!(t.id in spot)) order.push(t); });
      clearTimeout(sortTimer);
      sortTimer = setTimeout(function () { if (board && board.phase === 'play') drawRace(board); }, 1000 - (now - lastSort));
    } else {
      lastSort = now;
    }
    laneOrder = order.map(function (t) { return t.id; });
    // Every team has its ladder; "Show only the top 5" hides the rest, so
    // nobody is shown at the bottom (Gennaro, 2026-09-30, like Quizizz).
    var top5 = $('lvTop5').checked;
    var cut = top5 ? 5 : order.length;
    var shown = order.slice(0, cut);
    var moved = shown.map(function (t) { return t.id; }).join() !== shownOrder.join();
    shownOrder = shown.map(function (t) { return t.id; });
    var before = {};
    if (moved) Object.keys(lanes).forEach(function (id) { before[id] = lanes[id].li.getBoundingClientRect().top; });
    var keep = {};
    shown.forEach(function (t) {
      keep[t.id] = true;
      var lane = lanes[t.id];
      if (!lane) {
        lane = { li: mk('li', 'lv-lane') };
        var name = mk('div', 'lv-lane-name');
        lane.emoji = mk('span', 'lv-emoji', t.emoji);
        var text = mk('span', 'lv-lane-text');
        lane.title = mk('span', 'lv-lane-title', t.name);
        lane.members = mk('span', 'lv-lane-members');
        text.appendChild(lane.title);
        text.appendChild(lane.members);
        lane.pu = mk('span', 'lv-lane-pu');
        text.appendChild(lane.pu);
        name.appendChild(lane.emoji);
        name.appendChild(text);
        var track = mk('div', 'lv-track');
        lane.fill = mk('span', 'lv-lane-fill');
        var ticks = mk('span', 'lv-ticks');
        if (kind !== 'blast') for (var i = 0; i < goal; i++) ticks.appendChild(mk('span'));
        track.appendChild(lane.fill);
        track.appendChild(ticks);
        lane.num = mk('span', 'lv-lane-num');
        lane.li.appendChild(name);
        lane.li.appendChild(track);
        lane.li.appendChild(lane.num);
        lanes[t.id] = lane;
      }
      lane.li.style.setProperty('--team', t.color);
      lane.title.textContent = t.name;
      // Someone who has left stays on the team as a ghost.
      lane.members.textContent = b.opts.teams ? t.members.map(function (m) { return m.on ? m.name : '\u{1F47B} ' + m.name; }).join(', ') : '';
      lane.li.classList.toggle('gone', !t.members.some(function (m) { return m.on; }));
      lane.fill.style.width = Math.max(0, Math.min(100, t.progress / goal * 100)) + '%';
      lanePower(lane, t.pu, t.streak);
      lane.li.classList.toggle('finished', !!t.place);
      lane.num.textContent = kind === 'blast' ? t.progress + (t.progress === 1 ? ' point' : ' points')
        : t.place ? medal(t.place) + ' ' + ordinal(t.place) + (kind === 'match' && t.finishMs ? ' ' + seconds(t.finishMs) : '')
        : t.progress + ' / ' + goal;
      if (moved) race.appendChild(lane.li);
    });
    // Slide each row from where it was to where it is now.
    if (moved) {
      Object.keys(before).forEach(function (id) {
        var li = lanes[id] && lanes[id].li;
        if (!li) return;
        // The race is zoomed for the room (sizeScreen), so a move in screen
        // pixels is that much smaller inside it.
        var dy = (before[id] - li.getBoundingClientRect().top) / showZoom;
        if (Math.abs(dy) < 1) return;
        li.style.transition = 'none';
        li.style.transform = 'translateY(' + dy + 'px)';
        requestAnimationFrame(function () { requestAnimationFrame(function () { li.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; li.style.transform = ''; }); });
      });
    }
    Object.keys(lanes).forEach(function (id) {
      if (!keep[id]) { lanes[id].li.remove(); delete lanes[id]; }
    });
    drawRest(b, order.slice(cut));
    watchRace(ranked);
    if (b.opts.powers) powerFeed(b.feed || []);
  }

  // With only the top 5 showing: how many more are still playing.
  function drawRest(b, rest) {
    var box = $('lvRest');
    box.textContent = '';
    box.hidden = !rest.length;
    if (!rest.length) return;
    var who = b.opts.teams ? (rest.length === 1 ? ' more team' : ' more teams') : (rest.length === 1 ? ' more player' : ' more players');
    box.appendChild(mk('p', 'lv-rest-note', '+ ' + rest.length + who + ' still playing'));
  }
  var shownOrder = [];
  (function () {
    var box = $('lvTop5');
    box.checked = !!readSaved().top5;
    box.addEventListener('change', function () {
      var s = readSaved();
      s.top5 = box.checked;
      writeSaved(s);
      lastSort = 0;
      if (board && board.phase === 'play') drawRace(board);
    });
  })();

  /* ---------------- the leader's crown ---------------- */

  // The team out in front wears a crown, with a short fanfare when it changes.
  var leadId = '', leadRound = 0;
  function watchRace(order) {
    var open = order.filter(function (t) { return !t.place; });
    var lead = open[0] && open[0].progress > 0 && (!open[1] || open[0].progress > open[1].progress) ? open[0] : null;
    var id = lead ? lead.id : leadId;
    if (board && leadRound !== board.goAt) { leadRound = board.goAt; leadId = ''; }
    if (lead && id !== leadId && leadId) powerSound('lead');
    if (lead) leadId = id;
    Object.keys(lanes).forEach(function (k) { lanes[k].li.classList.toggle('leader', k === leadId); });
  }

  /* ---------------- power-ups on the big screen ---------------- */

  var POWER = {
    shield: ['\u{1F6E1}\uFE0F', 'Shield'], strike: ['\u26A1', 'Strike'], freeze: ['\u{1F9CA}', 'Freeze'],
    glitch: ['\u{1F4FA}', 'Glitch'], swap: ['\u{1F504}', 'Swap'], double: ['2\u00D7', 'Double Up'],
    fifty: ['\u2702\uFE0F', '50/50'], mirror: ['\u{1FA9E}', 'Mirror']
  };
  function powerIcon(k) { return (POWER[k] || ['?'])[0]; }

  // Beside each team's name: what it holds and what is on it right now.
  function lanePower(lane, pu, streak) {
    lane.pu.textContent = '';
    lane.li.classList.toggle('frozen', !!(pu && pu.frozen === 'freeze'));
    lane.li.classList.toggle('glitchy', !!(pu && pu.glitch));
    var chip = function (icon, text, cls) { var c = mk('span', 'lv-pu-chip' + (cls ? ' ' + cls : ''), icon + ' ' + text); lane.pu.appendChild(c); };
    // Three or more right in a row: a flame and the count.
    if (streak >= 3) chip('\u{1F525}', String(streak), 'fire' + (streak >= 5 ? ' hot' : ''));
    if (!pu) return;
    if (pu.item) chip(powerIcon(pu.item), pu.voting ? 'voting...' : 'ready', 'held');
    if (pu.shield) chip(powerIcon('shield'), 'shield');
    if (pu.mirror) chip(powerIcon('mirror'), 'mirror');
    if (pu.double) chip('2\u00D7', pu.double + ' left');
    if (pu.frozen === 'freeze') chip(powerIcon('freeze'), 'frozen');
    if (pu.frozen === 'swap') chip(powerIcon('swap'), 'waiting');
    if (pu.glitch) chip(powerIcon('glitch'), 'glitched');
  }

  // Each power-up used pops up as a big icon on the ladders it touched,
  // with a sound on this screen only. No words to read (Gennaro, 2026-09-30).
  var feedSeen = {}, lastSound = 0;
  function burst(id, icon, cls) {
    var lane = id && lanes[id];
    if (!lane) return;
    var b = mk('span', 'lv-burst' + (cls ? ' ' + cls : ''), icon);
    lane.li.appendChild(b);
    setTimeout(function () { b.remove(); }, 1700);
  }
  function powerFeed(list) {
    list.forEach(function (e) {
      if (feedSeen[e.id]) return;
      feedSeen[e.id] = true;
      var from = e.from && e.from.id, to = e.to && e.to.id;
      if (e.kind === 'bounce') burst(from, powerIcon('mirror'), 'guard');
      else if (e.blocked) burst(to, powerIcon('shield'), 'guard');
      else if (to) {
        burst(to, powerIcon(e.kind), e.kind);
        if (e.kind === 'swap') burst(from, powerIcon('swap'), 'swap');
        var hitLane = lanes[to];
        if (hitLane && e.kind !== 'swap') {
          hitLane.li.classList.remove('hit');
          void hitLane.li.offsetWidth;
          hitLane.li.classList.add('hit');
        }
      } else burst(from, powerIcon(e.kind), 'self');
      // One sound at a time, so a burst of power-ups is not a racket.
      if (Date.now() - lastSound > 350) { lastSound = Date.now(); powerSound(e.blocked ? 'blocked' : e.kind === 'bounce' ? 'mirror' : e.kind); }
    });
  }

  // A short sound for each power-up, at the game music's volume.
  function powerSound(kind) {
    if (music.mute.game) return;
    try {
      var ac = sounds(), t0 = ac.currentTime, vol = music.vol.game / 100 * 0.35;
      var tone = function (type, f1, f2, start, len, gain) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f1, t0 + start);
        o.frequency.exponentialRampToValueAtTime(f2, t0 + start + len);
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(gain * vol, t0 + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
        o.connect(g);
        g.connect(ac.destination);
        o.start(t0 + start);
        o.stop(t0 + start + len + 0.02);
      };
      if (kind === 'strike') { tone('sawtooth', 1400, 80, 0, 0.35, 1); pop(0.5); }
      else if (kind === 'freeze') { [1800, 2400, 3000, 2200].forEach(function (f, i) { tone('sine', f, f * 1.02, i * 0.07, 0.4, 0.6); }); }
      else if (kind === 'glitch') { [0, 0.06, 0.12, 0.2, 0.26].forEach(function (d) { tone('square', 200 + Math.random() * 900, 120 + Math.random() * 400, d, 0.06, 0.7); }); }
      else if (kind === 'swap') { tone('triangle', 300, 900, 0, 0.25, 0.9); tone('triangle', 900, 300, 0.25, 0.25, 0.9); }
      else if (kind === 'blocked') { tone('triangle', 520, 520, 0, 0.12, 1); tone('sine', 1040, 1040, 0, 0.3, 0.6); }
      else if (kind === 'lead') { tone('triangle', 523, 523, 0, 0.12, 0.7); tone('triangle', 659, 659, 0.1, 0.12, 0.7); tone('triangle', 784, 784, 0.2, 0.3, 0.8); }
      else if (kind === 'mirror') { tone('sine', 700, 1400, 0, 0.2, 0.8); tone('sine', 1400, 700, 0.2, 0.2, 0.8); }
      else { tone('triangle', 660, 660, 0, 0.12, 0.8); tone('triangle', 990, 990, 0.12, 0.25, 0.8); }
    } catch (e) { /* no sound on this browser */ }
  }

  // The Blast clock on the host screen, counting down to the end.
  var clockTimer = null, clockEnd = 0;
  function blastClock(b) {
    clockEnd = Math.max(Date.now(), local(b.endsAt));
    var tick = function () {
      var left = Math.max(0, Math.ceil((clockEnd - Date.now()) / 1000));
      var c = $('lvBigClock');
      c.textContent = Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
      // The last 10 seconds turn red; nothing flashes.
      c.className = 'lv-big-clock' + (left <= 10 ? ' urgent' : left <= 30 ? ' soon' : '');
      if (!left || !board || board.phase !== 'play') { clearInterval(clockTimer); clockTimer = null; }
    };
    tick();
    if (!clockTimer) clockTimer = setInterval(tick, 500);
  }
  function seconds(ms) { return (ms / 1000).toFixed(1) + ' s'; }

  function ordinal(n) { var t = n % 100, o = n % 10; return n + (t > 10 && t < 14 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); }
  function medal(n) { return n === 1 ? '\u{1F947}' : n === 2 ? '\u{1F948}' : n === 3 ? '\u{1F949}' : '\u{1F3C1}'; }

  // The winners' reveal (Gennaro, 2026-09-29): a drumroll while 3rd and then
  // 2nd rise with a pop, the whole screen saying who won, the song and
  // fireworks, then gold for the winner, who dances while each player's name
  // pops up, and the other teams cheer along the bottom.
  var revealNext = false, revealed = false, revealTimers = [];
  function later(fn, ms) { revealTimers.push(setTimeout(fn, ms)); }
  function clearReveal() {
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
    revealed = false;
    var t = document.querySelector('.lv-takeover');
    if (t) t.remove();
    if (stage) { stage.stop(); stage = null; }
  }
  var stage = null;
  function drawDone(b) {
    show('lvDone');
    lanes = {};
    $('lvRace').textContent = '';
    if (!revealed) {
      revealed = true;
      buildPodium(b, revealNext);
      revealNext = false;
    }
    drawStats(b);
  }
  function buildPodium(b, animate) {
    // Start the reveal at the top of the page, not partway down the race.
    if (animate) window.scrollTo(0, 0);
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animate = animate && !calm;
    var ranked = b.teams.filter(function (t) { return t.place; }).sort(function (x, y) { return x.place - y.place; });
    // Ended early: the teams furthest along stand on the podium.
    if (!ranked.length) {
      ranked = b.teams.slice().sort(function (x, y) { return y.progress - x.progress; }).slice(0, 3)
        .map(function (t, i) { return Object.assign({}, t, { place: i + 1 }); });
    }
    var top = ranked.slice(0, 3);
    var has = function (n) { return top.some(function (t) { return t.place === n; }); };
    // When each block rises (ms after the game ends).
    var at = { 3: 600, 2: 0, 1: 0 };
    at[2] = has(3) ? 2100 : 600;
    var win = has(2) || has(3) ? at[2] + 1700 : 400;   // the takeover
    at[1] = win + 2800;
    if (!animate) at = { 1: 0, 2: 0, 3: 0 };
    var sec = function (ms) { return (ms / 1000).toFixed(2) + 's'; };
    var title = $('lvDone').querySelector('.lv-done-title');
    var pod = $('lvPodium');
    pod.textContent = '';
    var landAt = {};
    top.forEach(function (t) {
      var rise = at[t.place], land = rise + (t.place === 1 ? 500 : 450);
      landAt[t.place] = land;
      var li = mk('li', 'lv-step-block p' + t.place);
      li.style.setProperty('--team', t.color);
      li.style.setProperty('--rise', sec(rise));
      li.style.setProperty('--land', sec(land));
      li.style.setProperty('--dance', sec(land + 700));
      li.style.setProperty('--shine', sec(land + 900));
      var card = mk('div', 'lv-step-card');
      if (t.place === 1) { li.appendChild(mk('span', 'lv-rays')); card.appendChild(mk('span', 'lv-crown', '\u{1F451}')); }
      card.appendChild(mk('span', 'lv-emoji', t.emoji));
      card.appendChild(mk('span', 'lv-step-name', t.name));
      // Each player's name pops up in turn once the team lands.
      if (b.opts.teams) {
        var who = mk('span', 'lv-step-members');
        t.members.forEach(function (m, i) {
          var n = mk('span', 'lv-step-who', m.name);
          n.style.setProperty('--pop', sec(land + 500 + Math.min(i, 12) * 220));
          who.appendChild(n);
        });
        card.appendChild(who);
      }
      if (b.kind === 'blast') card.appendChild(mk('span', 'lv-step-score', t.progress + (t.progress === 1 ? ' point' : ' points')));
      if (b.kind === 'match' && t.finishMs) card.appendChild(mk('span', 'lv-step-score', seconds(t.finishMs)));
      li.appendChild(card);
      // A block with a top, a front and a medal, rising up in turn: 3rd, 2nd, then 1st.
      var base = mk('div', 'lv-step-base');
      base.appendChild(mk('span', 'lv-step-top'));
      base.appendChild(mk('span', 'lv-step-shine'));
      base.appendChild(mk('span', 'lv-medal m' + t.place, String(t.place)));
      base.appendChild(mk('span', 'lv-step-place', ordinal(t.place)));
      li.appendChild(base);
      pod.appendChild(li);
    });
    // The teams that did not place, cheering along the bottom.
    var crowd = $('lvCrowd');
    crowd.textContent = '';
    var placed = top.map(function (t) { return t.id; });
    var rest = b.teams.filter(function (t) { return placed.indexOf(t.id) === -1; });
    crowd.hidden = !rest.length;
    crowd.style.setProperty('--crowd', sec(at[1] + 800));
    rest.slice(0, 40).forEach(function (t, i) {
      var f = mk('span', 'lv-fan');
      f.style.setProperty('--team', t.color);
      f.style.setProperty('--i', String(i % 12));
      f.appendChild(mk('span', 'lv-fan-emoji', t.emoji));
      f.appendChild(mk('span', 'lv-fan-hands', '\u{1F64C}'));
      f.appendChild(mk('span', 'lv-fan-name', t.name));
      crowd.appendChild(f);
    });
    title.textContent = animate ? 'And the winner is…' : 'Winners';
    if (!animate) { if (revealNext) celebrate(); return; }
    drumroll(win / 1000);
    // Stage lights (2026-09-30): the screen dims while the drumroll plays and
    // two spotlights sweep the stage, settling on the empty 1st place; the
    // winner rises into them, and only then do the lights come up with the
    // song and 5 seconds of fireworks.
    var spot1 = pod.querySelector('.p1');
    if (window.IS8Celebrate && IS8Celebrate.spotlight && spot1) {
      if (stage) stage.stop();
      stage = IS8Celebrate.spotlight(function () { return spot1; });
      later(function () { if (stage) stage.lock(); }, Math.max(0, win - 1200));
    }
    [3, 2].forEach(function (n) { if (landAt[n] != null) later(function () { pop(n === 3 ? 0.8 : 0.2); }, landAt[n]); });
    var champ = top.filter(function (t) { return t.place === 1; })[0];
    later(function () {
      crash();
      title.textContent = 'Winners';
      if (champ) takeover(champ, b.opts.teams);
    }, win);
    var lit = (landAt[1] != null ? landAt[1] : win) + 900;
    if (landAt[1] != null) later(function () { pop(0.5); }, landAt[1]);
    later(function () {
      if (stage) { stage.fadeOut(900); stage = null; }
      celebrate();
    }, lit);
  }
  // The whole screen says who won, then shrinks away onto the podium.
  function takeover(t, teams) {
    var box = mk('div', 'lv-takeover');
    box.style.setProperty('--team', t.color);
    box.setAttribute('role', 'status');
    box.appendChild(mk('span', 'lv-takeover-emoji', t.emoji));
    box.appendChild(mk('span', 'lv-takeover-name', t.name));
    box.appendChild(mk('span', 'lv-takeover-win', teams || /s$/i.test(t.name) ? 'WIN!' : 'WINS!'));
    document.body.appendChild(box);
    later(function () { box.classList.add('away'); }, 2300);
    later(function () { box.remove(); }, 2900);
  }

  // A snare drumroll, getting louder, made on the spot (no sound file).
  function drumroll(secs) {
    if (music.mute.game || secs < 0.5) return;
    try {
      popper = sounds();
      var ac = popper, start = ac.currentTime + 0.05, vol = music.vol.game / 100;
      var len = Math.floor(ac.sampleRate * 0.06), buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      var hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      hp.connect(ac.destination);
      for (var t = 0; t < secs; t += 0.045) {
        var n = ac.createBufferSource(), g = ac.createGain();
        n.buffer = buf;
        g.gain.value = vol * (0.12 + 0.5 * Math.pow(t / secs, 1.6)) * (0.8 + Math.random() * 0.4);
        n.connect(g);
        g.connect(hp);
        n.start(start + t + Math.random() * 0.006);
      }
    } catch (e) { /* no sound on this browser */ }
  }
  // A cymbal crash as the winner shows.
  function crash() {
    if (music.mute.game) return;
    try {
      popper = sounds();
      var ac = popper, now = ac.currentTime, vol = music.vol.game / 100;
      var len = Math.floor(ac.sampleRate * 1.8), buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      var n = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
      n.buffer = buf;
      hp.type = 'highpass';
      hp.frequency.value = 4500;
      g.gain.value = 0.7 * vol;
      n.connect(hp);
      hp.connect(g);
      g.connect(ac.destination);
      n.start(now);
    } catch (e) { /* no sound on this browser */ }
  }

  // Game stats under the podium: totals, the most missed terms, and the
  // terms answered fastest and slowest (Gennaro, 2026-09-29).
  function drawStats(b) {
    var st = b.stats;
    var box = $('lvStatsBox');
    if (!st || !(st.right + st.wrong)) { box.hidden = true; return; }
    box.hidden = false;
    var tiles = $('lvStatTiles');
    tiles.textContent = '';
    var tile = function (big, label, small) {
      var d = mk('div', 'lv-stat-tile');
      d.appendChild(mk('span', 'lv-stat-big', big));
      d.appendChild(mk('span', 'lv-stat-label', label));
      if (small) d.appendChild(mk('span', 'lv-stat-small', small));
      tiles.appendChild(d);
    };
    var total = st.right + st.wrong;
    tile(String(total), b.kind === 'match' ? 'tries' : 'answers', st.terms + (st.terms === 1 ? ' term' : ' terms'));
    tile(Math.round(st.right * 100 / total) + '%', 'right', st.right + ' right, ' + st.wrong + ' wrong');
    if (st.avg) tile(seconds(st.avg), b.kind === 'match' ? 'average per pair' : 'average answer time');
    if (st.best) tile(seconds(st.best.ms), b.kind === 'match' ? 'fastest pair' : 'fastest answer', st.best.term + (st.best.by ? ', ' + st.best.by : ''));

    var body = $('lvMissed');
    body.textContent = '';
    st.missed.forEach(function (m) {
      var tr = mk('tr');
      tr.appendChild(mk('td', '', m.term));
      tr.appendChild(mk('td', '', m.def));
      tr.appendChild(mk('td', '', String(m.n)));
      tr.appendChild(mk('td', '', String(m.right)));
      body.appendChild(tr);
    });
    $('lvMissedBox').hidden = !st.missed.length;

    var list = function (id, rows) {
      var ol = $(id);
      ol.textContent = '';
      rows.forEach(function (r) {
        var li = mk('li');
        li.appendChild(mk('span', 'lv-speed-term', r.term));
        li.appendChild(mk('span', 'lv-speed-time', seconds(r.avg)));
        ol.appendChild(li);
      });
    };
    list('lvFastest', st.fastest);
    list('lvSlowest', st.slowest);
    $('lvSpeedBox').hidden = !st.fastest.length;
  }

  /* ---------------- the teacher's buttons ---------------- */

  $('lvMakeTeams').addEventListener('click', function () { send({ t: 'makeTeams' }); });
  $('lvStartSolo').addEventListener('click', function () { send({ t: 'start' }); });
  $('lvShuffle').addEventListener('click', function () { send({ t: 'makeTeams' }); });
  $('lvBack').addEventListener('click', function () { send({ t: 'backToLobby' }); });
  $('lvStartTeams').addEventListener('click', function () { send({ t: 'start' }); });
  $('lvEnd').addEventListener('click', function () {
    var btn = this;
    if (btn.classList.contains('sure')) { send({ t: 'end' }); return; }
    btn.classList.add('sure');
    btn.textContent = 'Click again to end';
    setTimeout(function () { btn.classList.remove('sure'); btn.textContent = 'End game'; }, 3000);
  });
  $('lvAgain').addEventListener('click', function () { send({ t: 'again' }); });
  $('lvTimeMinus').addEventListener('click', function () { send({ t: 'time', seconds: -60 }); });
  $('lvTimePlus').addEventListener('click', function () { send({ t: 'time', seconds: 60 }); });
  $('lvFastNow').addEventListener('change', function () { send({ t: 'fast', on: this.checked }); });
  // Full screen, for projecting the board (Gennaro, 2026-09-30): the site's
  // top bar steps aside and everything grows to fill the screen.
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
    fsButtons.forEach(function (btn) { btn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
  });
  // End game before the race: closes the game for everyone (press twice).
  [].forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('sure')) {
        btn.classList.remove('sure');
        btn.textContent = 'End game';
        if (ws && ws.readyState === 1) send({ t: 'close' });
        else { forgetHost(); location.reload(); }
        return;
      }
      btn.classList.add('sure');
      btn.textContent = 'Click again to end';
      setTimeout(function () { btn.classList.remove('sure'); btn.textContent = 'End game'; }, 3000);
    });
  });
  $('lvNew').addEventListener('click', function () {
    // The finished game is closed so students are not left on it.
    send({ t: 'close' });
    leaving = true;
    retire();
    forgetHost();
    game = null;
    qrFor = '';
    setup();
    $('lvResume').hidden = true;
  });

  gate();
})();
