/* ============================================================
   The current review game on the Review page (Donny, 2026-11-15).

   A banner above the folders shows the review game the teacher picked:
   its title, a countdown to the student's own period's due time (start of
   class on test day: each class's due date in Google Classroom, which the
   game's sheet sends here every hour), the period race (how much of each
   period has full credit) and the student's best try and place. Play is the
   sheet's own Class Pass link, the same one Classroom has, so the score lands
   in that sheet and on the leaderboard either way.

   The teacher (signed in with the teacher password, not in student view) gets
   a box above it to pick the game from the review games the site knows, or
   to paste a game's Google Sheet link, to check each period's due time, and
   to see the banner as each period does.

   Talks to:
     GET /api/pass/current-review   the banner (a signed-in student sends X-Pass)
     GET /api/review/games          teacher: the games, periods, current pick
     PUT /api/review/current        teacher: { id } (a sheet id or link; '' = take it down)
   ============================================================ */
(function () {
  'use strict';

  var box = document.getElementById('rgBanner');
  var tbox = document.getElementById('rgTeacher');
  if (!box) return;

  var ART_BASE = document.currentScript.src;
  var DAY = 86400000;
  var data = null;        // the banner's data, or null when nothing is showing
  var offset = 0;         // the site's clock minus this computer's
  var shown = '';         // the state last drawn (live, soon, over, out, nodue)
  var preview = null;     // the teacher's "See it as": null = as himself, '' = not signed in, '1' = Period 1
  var teacher = false;
  var games = null;       // teacher: { games, periods, current }
  var picked = '';        // teacher: the game picked in the list (not saved yet)
  var open = false;       // teacher: the box's picker is open

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pkey(p) { p = String(p == null ? '' : p).trim(); return /^\d+$/.test(p) ? String(Number(p)) : p; }
  function byPeriod(a, b) { var x = parseFloat(a), y = parseFloat(b); return (isFinite(x) && isFinite(y) && x !== y) ? x - y : String(a).localeCompare(String(b)); }
  function now() { return Date.now() + offset; }
  function when(ms) {
    var d = new Date(ms);
    try {
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' at ' +
        d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (e) { return d.toString(); }
  }
  function parts(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function leftText(ms) {
    if (ms <= 0) return 'Closed';
    var p = parts(ms);
    return (p.d ? p.d + 'd ' : '') + p.h + 'h ' + pad(p.m) + 'm';
  }

  /* ---------------- the banner ---------------- */

  function load() {
    var headers = {};
    var t = window.IS8Pass && window.IS8Pass.token();
    if (t) headers['X-Pass'] = t;
    return fetch('/api/pass/current-review', { headers: headers, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) {
        data = d && d.game && d.game.title ? d : null;
        if (data) {
          offset = (Number(data.now) || Date.now()) - Date.now();
          var dues = {};
          Object.keys(data.game.dues || {}).forEach(function (p) { dues[pkey(p)] = Number(data.game.dues[p]) || 0; });
          data.game.dues = dues;
        }
        shown = '';
        draw();
        if (teacher) drawAs();
      });
  }

  // Who the banner is drawn for: the period (or '' for no period), the student's own numbers, and the state.
  function view() {
    var g = data.game, me = data.me || null;
    var period = preview != null ? preview : me && me.period ? pkey(me.period) : '';
    var mine = preview != null ? null : me;
    var due = period && g.dues[period] ? g.dues[period] : 0;
    var t = now();
    var st = !period ? 'out' : !due ? 'nodue' : t >= due ? 'over' : due - t < DAY ? 'soon' : 'live';
    return { g: g, me: mine, period: period, due: due, st: st, signedIn: Boolean(me) || preview != null && preview !== '' };
  }

  function goalText(g) {
    return g.goal && g.goal.pct ? g.goal.pct + '% or better = ' + (g.goal.points ? g.goal.points + ' out of ' + g.goal.points : 'full credit') : 'Your best try counts';
  }

  function raceBox(v) {
    var race = (data.race || []).filter(function (r) { return r.students > 0; });
    if (!race.length) return null;
    var g = v.g;
    var wrap = mk('div', 'rg-race');
    wrap.appendChild(mk('div', 'rg-race-h', 'Period race: class at ' + (g.goal && g.goal.pct ? g.goal.pct + '% or better' : 'full credit')));
    race.slice().sort(function (a, b) { return byPeriod(a.period, b.period); }).forEach(function (r) {
      var pct = Math.round((100 * r.passed) / r.students);
      var lane = mk('div', 'rg-lane' + (v.period && pkey(r.period) === v.period ? ' mine' : ''));
      lane.appendChild(mk('span', null, 'P' + r.period));
      var track = mk('span', 'rg-track');
      var fill = mk('i');
      fill.style.width = pct + '%';
      track.appendChild(fill);
      lane.appendChild(track);
      lane.appendChild(mk('span', 'rg-lane-pct', pct + '%'));
      lane.title = 'Period ' + r.period + ': ' + r.passed + ' of ' + r.students + ' students';
      wrap.appendChild(lane);
    });
    return wrap;
  }

  function tiles() {
    var row = mk('div', 'rg-tiles');
    row.setAttribute('role', 'timer');
    ['d', 'h', 'm', 's'].forEach(function (u, i) {
      var t = mk('div', 'rg-tile');
      var b = mk('b');
      b.setAttribute('data-u', u);
      t.appendChild(b);
      t.appendChild(mk('small', null, ['Days', 'Hours', 'Min', 'Sec'][i]));
      row.appendChild(t);
    });
    return row;
  }

  function draw() {
    box.textContent = '';
    if (!data || (!data.game.link && !teacher)) { box.hidden = true; return; }
    var v = view(), g = v.g;
    shown = v.st;
    box.hidden = false;

    var sec = mk('section', 'rg rg-' + v.st);
    sec.setAttribute('aria-label', 'Current review game');
    var art = mk('div', 'rg-art');
    var trophy = mk('img');
    trophy.src = new URL('review-icons/review-trophy.webp', ART_BASE).href;
    trophy.alt = '';
    trophy.width = 120;
    trophy.height = 120;
    art.appendChild(trophy);
    sec.appendChild(art);

    var main = mk('div', 'rg-main');
    main.appendChild(mk('p', 'rg-kicker', v.st === 'soon' ? 'Less than a day left!' : v.st === 'over' ? 'Review game closed' : 'This week’s review game'));
    main.appendChild(mk('h2', 'rg-title', g.title));
    var meta = [];
    if (g.unit) meta.push(g.unit);
    if (g.questions) meta.push(g.questions + ' questions');
    meta.push('your best try counts');
    main.appendChild(mk('p', 'rg-meta', meta.join(' · ')));
    var due = mk('p', 'rg-due');
    if (v.st === 'live' || v.st === 'soon') {
      due.appendChild(document.createTextNode('Due for '));
      due.appendChild(mk('b', null, 'Period ' + v.period));
      due.appendChild(document.createTextNode(': ' + when(v.due) + ' (start of class)'));
    } else if (v.st === 'over') {
      due.textContent = 'Period ' + v.period + ' was due ' + when(v.due) + '. No late work.';
    } else if (v.st === 'nodue') {
      due.textContent = 'Due at the start of class on test day.';
    } else {
      due.textContent = v.signedIn || teacher ? 'Due at the start of class on test day: each period’s time is on the right.' : 'Sign in with Class Pass to see the countdown for your period.';
    }
    main.appendChild(due);
    if (v.st === 'over') {
      var lb = mk('a', 'btn rg-play', 'See the leaderboard');
      lb.href = '../leaderboard/';
      main.appendChild(lb);
    } else if (g.link) {
      var play = mk('a', 'btn rg-play');
      play.href = g.link;
      play.target = '_top';
      play.innerHTML = '<span aria-hidden="true">&#9654;</span>&nbsp; Play the review game';
      main.appendChild(play);
    } else {
      main.appendChild(mk('p', 'rg-nolink', 'Teacher: this game’s sheet hasn’t sent its student link yet (see the box above).'));
    }
    sec.appendChild(main);

    var side = mk('div', 'rg-side');
    if (v.st === 'live' || v.st === 'soon') side.appendChild(tiles());
    else if (v.st === 'over') side.appendChild(mk('div', 'rg-stamp', 'TIME’S UP'));
    else if (v.st === 'out') {
      var ps = Object.keys(g.dues).sort(byPeriod);
      if (ps.length) {
        side.appendChild(mk('div', 'rg-side-h', 'Due at the start of class'));
        var list = mk('div', 'rg-list');
        ps.forEach(function (p) {
          list.appendChild(mk('b', null, 'Period ' + p));
          list.appendChild(mk('span', null, when(g.dues[p])));
        });
        side.appendChild(list);
      }
    }
    var race = raceBox(v);
    if (race) side.appendChild(race);
    sec.appendChild(side);

    var foot = mk('div', 'rg-foot');
    function bit(label, strong, cls) {
      var s = mk('span', cls || null);
      if (label) s.appendChild(document.createTextNode(label));
      if (strong) s.appendChild(mk('b', null, strong));
      foot.appendChild(s);
    }
    var me = v.me;
    if (v.st === 'over') {
      if (me && me.played) bit('Your best try: ', me.pct + '%');
      bit('Good luck on the test!');
    } else if (me && me.played && me.passed) {
      bit('✔ ', 'You earned ' + (g.goal && g.goal.points ? g.goal.points + ' out of ' + g.goal.points : 'full credit'), 'rg-ok');
      bit('(best try ' + me.pct + '%)', null, 'rg-ok');
      bit('Play again to climb the leaderboard: ', '#' + me.place + ' in Period ' + v.period);
    } else if (me && me.played) {
      bit('Your best try: ', me.pct + '%');
      bit(goalText(g));
      bit('Leaderboard: ', '#' + me.place + ' in Period ' + v.period);
    } else if (me && me.period) {
      bit('You haven’t played yet.');
      bit(goalText(g));
    } else if (!v.signedIn && !teacher) {
      bit(goalText(g));
      bit('Your score counts the same from here or from Google Classroom.');
    } else {
      bit(goalText(g));
    }
    sec.appendChild(foot);
    box.appendChild(sec);
    tick();
  }

  function tick() {
    if (!data || box.hidden) return;
    var v = view();
    if (v.st !== shown) { draw(); return; }
    if (v.st !== 'live' && v.st !== 'soon') return;
    var p = parts(v.due - now());
    box.querySelectorAll('[data-u]').forEach(function (b) { b.textContent = pad(p[b.getAttribute('data-u')]); });
  }

  setInterval(tick, 1000);
  setInterval(function () { if (!document.hidden) load(); }, 5 * 60 * 1000);   // the race and best tries change as students play
  if (window.IS8Pass) {
    var first = true;
    window.IS8Pass.onChange(function () { if (first) { first = false; return; } load(); });
  }
  load();

  /* ---------------- the teacher's box ---------------- */

  function call(path, method, body) {
    var headers = { 'X-IS8-Editor': '1' };
    if (body) headers['content-type'] = 'application/json';
    return fetch('/api/' + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || 'The site did not answer. Check the internet connection and try again.');
          return d;
        });
      });
  }

  function loadGames() {
    return call('review/games').then(function (d) {
      games = d;
      if (!picked) picked = d.current && d.current.on ? d.current.id : '';
      if (!d.current) open = true;
      drawTeacher();
    }, function (err) {
      games = { games: [], periods: [], current: null, error: err.message };
      drawTeacher();
    });
  }

  function gameById(id) { return games && games.games.filter(function (g) { return g.id === id; })[0]; }

  function say(text, bad) {
    var m = tbox.querySelector('.rg-tmsg');
    if (!m) return;
    m.textContent = text || '';
    m.classList.toggle('bad', Boolean(bad));
  }

  function save(id) {
    say('Saving...');
    return call('review/current', 'PUT', { id: id }).then(function (r) {
      picked = r.current ? r.current.id : '';
      return Promise.all([loadGames(), load()]).then(function () {
        var g = gameById(picked);
        if (!r.current) say('Taken down. Students don’t see a review game now.');
        else if (!g) say('Saved. This sheet hasn’t sent anything to the website yet, so students don’t see it until it does. In the sheet: Self-Check > Send game points to the website leaderboard now.', true);
        else if (!g.link) say('Saved, but this sheet hasn’t sent its student link yet, so students don’t see it. Update its code (Assignment Launchpad > Update now), then in the sheet: Self-Check > Send game points to the website leaderboard now.', true);
        else if (!Object.keys(g.dues || {}).length) say('Saved. Students see it now, but without a countdown: no class has a due date in Classroom for it yet.', true);
        else say('Saved. Students see it now.');
      });
    }, function (err) { say(err.message, true); });
  }

  function drawTeacher() {
    if (!tbox || !teacher) return;
    tbox.hidden = false;
    tbox.textContent = '';
    var cur = games && games.current && games.current.on ? gameById(games.current.id) : null;
    var curId = games && games.current && games.current.on ? games.current.id : '';

    var head = mk('div', 'rg-thead');
    head.appendChild(mk('strong', 'rg-th', 'Current review game'));
    head.appendChild(mk('span', 'rg-only', 'Only you see this box'));
    var now1 = mk('span', 'rg-tnow');
    if (curId) {
      now1.appendChild(document.createTextNode('Showing: '));
      now1.appendChild(mk('b', null, cur ? cur.title : 'a sheet that hasn’t sent anything yet'));
    } else now1.textContent = 'Nothing is showing to students.';
    head.appendChild(now1);
    var tog = mk('button', 'btn secondary fc-small', open ? 'Close' : curId ? 'Change' : 'Pick a game');
    tog.type = 'button';
    tog.setAttribute('aria-expanded', String(open));
    tog.addEventListener('click', function () { open = !open; drawTeacher(); });
    head.appendChild(tog);
    tbox.appendChild(head);

    tbox.appendChild(mk('div', 'rg-as'));
    drawAs();

    if (!open) { tbox.appendChild(mk('p', 'rg-tmsg')); return; }
    if (games && games.error) { tbox.appendChild(mk('p', 'rg-tmsg bad', games.error)); return; }

    var grid = mk('div', 'rg-tgrid');
    var left = mk('div');
    left.appendChild(stepTitle(1, 'Pick the review game'));
    var list = mk('div', 'rg-tpick');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Review games');
    var all = (games && games.games) || [];
    if (!all.length) list.appendChild(mk('p', 'rg-tempty', 'No review game has sent its points to the website yet. In a review game sheet: Self-Check > Send game points to the website leaderboard now.'));
    all.forEach(function (g) {
      var row = mk('button', 'rg-trow' + (g.id === picked ? ' on' : ''));
      row.type = 'button';
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', String(g.id === picked));
      row.appendChild(mk('span', 'rg-rad'));
      var txt = mk('span', 'rg-ttext');
      txt.appendChild(mk('b', null, g.title));
      var bits = [];
      var n = Object.keys(g.dues || {}).length;
      if (!g.sent) bits.push(['No due times yet: update this sheet’s code (Launchpad > Update now)', 'warn']);
      else if (!g.link) bits.push(['No student link yet: in the sheet, step 2 (Create the assignment)', 'warn']);
      else if (n) {
        var last = Math.max.apply(null, Object.keys(g.dues).map(function (p) { return g.dues[p]; }));
        bits.push([(last < now() ? 'Was due ' : 'Due ') + when(last).replace(/ at .*/, '') + ' (' + n + ' period' + (n === 1 ? '' : 's') + ')']);
      } else bits.push(['No due dates in Classroom yet', 'warn']);
      if (g.played) bits.push([g.played + ' played, ' + g.passed + ' at full credit']);
      if (g.id === curId) bits.push(['Showing now', 'now']);
      var small = mk('small');
      bits.forEach(function (x, i) {
        if (i) small.appendChild(document.createTextNode(' · '));
        small.appendChild(mk('span', x[1] ? 'rg-' + x[1] : null, x[0]));
      });
      txt.appendChild(small);
      row.appendChild(txt);
      if (g.unit) row.appendChild(mk('span', 'rg-unit', g.unit));
      row.addEventListener('click', function () { picked = g.id; drawTeacher(); });
      list.appendChild(row);
    });
    left.appendChild(list);
    left.appendChild(mk('p', 'rg-tor', 'Or paste the game’s Google Sheet link'));
    var pasteRow = mk('div', 'rg-tpaste');
    var input = mk('input');
    input.type = 'url';
    input.placeholder = 'https://docs.google.com/spreadsheets/d/...';
    input.setAttribute('aria-label', 'The review game’s Google Sheet link');
    var use = mk('button', 'btn secondary fc-small', 'Show this game');
    use.type = 'button';
    use.addEventListener('click', function () {
      var val = input.value.trim();
      if (!val) { say('Paste the link of the review game’s Google Sheet first.', true); input.focus(); return; }
      save(val);
    });
    pasteRow.appendChild(input);
    pasteRow.appendChild(use);
    left.appendChild(pasteRow);
    grid.appendChild(left);

    var right = mk('div');
    right.appendChild(stepTitle(2, 'Check the due times'));
    var g = gameById(picked);
    if (!g) right.appendChild(mk('p', 'rg-tnote', 'Pick a game to see each period’s due time.'));
    else {
      var table = mk('table', 'rg-ttable');
      var thead = mk('thead');
      var hr = mk('tr');
      ['Class', 'Due (start of class)', 'Left'].forEach(function (h) { hr.appendChild(mk('th', null, h)); });
      thead.appendChild(hr);
      table.appendChild(thead);
      var tb = mk('tbody');
      var ps = {};
      ((games && games.periods) || []).forEach(function (p) { ps[pkey(p)] = 1; });
      Object.keys(g.dues || {}).forEach(function (p) { ps[pkey(p)] = 1; });
      Object.keys(ps).sort(byPeriod).forEach(function (p) {
        var tr = mk('tr');
        tr.appendChild(mk('td', null, 'Period ' + p));
        var d = g.dues ? g.dues[p] : 0;
        tr.appendChild(mk('td', d ? null : 'rg-warn', d ? when(d) : 'No due date in Classroom'));
        tr.appendChild(mk('td', 'rg-left', d ? leftText(d - now()) : ''));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      right.appendChild(table);
      right.appendChild(mk('p', 'rg-tnote', 'These are each class’s due date in Google Classroom. The game’s sheet sends them every hour; to send them now, in the sheet click Self-Check > Send game points to the website leaderboard now.'));
    }
    right.appendChild(stepTitle(3, 'Show it'));
    var btns = mk('div', 'rg-tbtns');
    var saveBtn = mk('button', 'btn', picked && picked === curId ? 'Saved' : 'Show this game');
    saveBtn.type = 'button';
    saveBtn.disabled = !picked || picked === curId;
    saveBtn.addEventListener('click', function () { save(picked); });
    btns.appendChild(saveBtn);
    var down = mk('button', 'btn secondary', 'Take it down');
    down.type = 'button';
    down.disabled = !(games && games.current);
    down.addEventListener('click', function () { save(''); });
    btns.appendChild(down);
    right.appendChild(btns);
    var msg = mk('p', 'rg-tmsg');
    msg.setAttribute('role', 'status');
    right.appendChild(msg);
    grid.appendChild(right);
    tbox.appendChild(grid);
    tbox.appendChild(mk('p', 'rg-tfoot', '✔ The Play button uses the same link as your Classroom assignment, so every score goes to that game’s sheet and the leaderboard either way.'));
  }

  // "See it as": the banner the way a student who isn't signed in, or each period, sees it (only while one is showing)
  function drawAs() {
    var as = tbox && tbox.querySelector('.rg-as');
    if (!as) return;
    as.textContent = '';
    as.hidden = !data;
    if (!data) return;
    as.appendChild(mk('span', 'rg-as-h', 'See it as:'));
    var choices = [[null, 'All periods'], ['', 'Not signed in']].concat(((games && games.periods) || []).map(function (p) { return [pkey(p), 'Period ' + p]; }));
    choices.forEach(function (c) {
      var b = mk('button', 'rg-chip' + (preview === c[0] ? ' on' : ''), c[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(preview === c[0]));
      b.addEventListener('click', function () { preview = c[0]; draw(); drawAs(); });
      as.appendChild(b);
    });
  }

  function stepTitle(n, text) {
    var p = mk('p', 'rg-tstep');
    p.appendChild(mk('span', null, String(n)));
    p.appendChild(document.createTextNode(text));
    return p;
  }

  function startTeacher() {
    if (teacher || !tbox) return;
    var ED = window.IS8Editor;
    if (!ED) return;
    ED.session().then(function (s) {
      if (!s.editor || teacher) return;
      teacher = true;
      draw();
      loadGames();
      setInterval(function () { if (!document.hidden && open) drawTeacher(); }, 60 * 1000);   // the Left column
    }).catch(function () { /* students still get the banner */ });
  }
  // flashcards.js says when the teacher signs in on this page (or was already)
  document.addEventListener('fx:teacher', startTeacher);
  if (window.IS8Editor && window.IS8Editor.signedInHint && window.IS8Editor.signedInHint()) startTeacher();
})();
