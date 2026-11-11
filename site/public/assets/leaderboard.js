/* ============================================================
   The class leaderboard (leaderboard/), Donny 2026-10-08.

   Students signed in with Class Pass, and the teacher, see the boards.
   Since 2026-11-10 (Donny: "way too many categories", "easier for an 8th
   grader") there are four: review game points, live game wins, correct
   answers and practice, each with gold, silver and bronze trophies
   (assets/trophy-1/2/3.webp, cut from Donny's picture) for its top 3.
   Two switches: This topic (the current topic, which the teacher picks
   here) / This year / All time, and My class / All classes. All time
   shows every class together, and students who have left the class list
   too, with their school year, so later classes can try to beat them.
   Names show as "First L.".

   The teacher also gets the roster: paste the class list (email, first name,
   last name, period), see who has signed in, and take a student off or clear
   their results. Only students on the roster can sign in with Class Pass.
   Since 2026-11-10 the class list can come from the teacher's Class List
   Google Sheet instead (it sends it to /api/classlist/sync): once it has,
   this page shows the sheet's classes and the students read-only (Clear
   results still works) with Sync now, and the Class list key box under it.
   Student view (the physical science site's menu, 2026-11-10): the teacher
   sees the page the way a student does (IS8Editor.session says studentView).
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ED = window.IS8Editor;
  var PASS = window.IS8Pass;
  var teacher = false;
  var studentView = false;   // the teacher, looking the way a student does
  var classList = null;      // /api/classlist: the Class List sheet's status (teacher only)
  var data = null;
  var loading = 0;
  var MEDALS = ['', 'gold', 'silver', 'bronze'];

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(label, cls, run) {
    var b = mk('button', cls || 'btn', label);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }
  function status(text, bad) {
    $('lbStatus').textContent = text || '';
    $('lbStatus').classList.toggle('bad', !!bad);
  }
  function plural(n, word) { return n.toLocaleString('en-US') + ' ' + word + (n === 1 ? '' : /(s|sh|ch|x)$/.test(word) ? 'es' : 's'); }
  var periodName = function (p) { return /^\d+$/.test(p) ? 'Period ' + p : p; };

  // What is showing: span (unit = This topic, year or all), period ('' = all classes) and, for the teacher
  // only, unit (a topic to look at instead of the current one). Remembered on this device (span and period),
  // from 2026-11-10 under a new name, so everyone starts on This topic once.
  var KEY = 'is8-board-view';
  var view = null;
  function saved() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function keep() {
    try { localStorage.setItem(KEY, JSON.stringify({ span: view.span, period: view.period })); } catch (e) { /* fine */ }
  }

  /* ---------------- loading the boards ---------------- */

  function load() {
    var mine = ++loading;
    if (!view) {
      var s = saved();
      view = { span: s.span || '', period: s.period || '', unit: '', chosePeriod: 'period' in s };
    }
    var q = new URLSearchParams({ span: view.span, period: view.period });
    if (view.unit) q.set('unit', view.unit);
    var headers = {};
    if (PASS && PASS.token()) headers['X-Pass'] = PASS.token();
    status(data ? 'Updating...' : 'Loading the leaderboard...');
    return fetch('/api/board?' + q.toString(), { headers: headers, cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; });
    }).then(function (res) {
      if (mine !== loading) return;
      if (res.status === 401) { gate(); return; }
      if (!res.ok) { status(res.d.error || 'The leaderboard did not load. Try again in a minute.', true); return; }
      $('lbGate').hidden = true;
      data = res.d;
      view.span = data.span;
      // A student starts on their own class.
      if (!view.chosePeriod && !teacher && data.me && data.me.period && view.span !== 'all' && view.period !== data.me.period) {
        view.period = data.me.period;
        view.chosePeriod = true;
        load();
        return;
      }
      status('');
      drawFilters();
      draw();
    }, function () {
      if (mine === loading) status('Could not reach the site. Check the internet connection.', true);
    });
  }
  function show(change) {
    for (var k in change) view[k] = change[k];
    keep();
    load();
  }

  // Not signed in: the Class Pass button.
  function gate() {
    data = null;
    $('lbFilters').hidden = true;
    $('lbBoards').textContent = '';
    status('');
    var g = $('lbGate');
    g.hidden = false;
    g.textContent = '';
    var card = mk('section', 'lb-gate');
    card.appendChild(mk('span', 'pass-badge', 'Class Pass'));
    card.appendChild(mk('h2', null, 'Sign in to see the leaderboard'));
    card.appendChild(mk('p', null, 'Use your school Google account. Then your live games, Match times, tests and Learn sets count on the board, at school or at home.'));
    var msg = mk('p', 'lb-gate-msg');
    msg.setAttribute('role', 'status');
    var go = btn('Sign in with Class Pass', 'btn', function () {
      if (!PASS) return;
      go.disabled = true;
      msg.textContent = 'Finish signing in in the new window...';
      PASS.signIn().then(function () { msg.textContent = ''; }, function (err) { go.disabled = false; msg.textContent = err.message; });
    });
    card.appendChild(go);
    card.appendChild(msg);
    g.appendChild(card);
  }

  /* ---------------- the switches ---------------- */

  // A row of buttons, one of them on: [{ label, on, run }].
  function switchRow(box, items) {
    box.textContent = '';
    items.forEach(function (it) {
      var b = btn(it.label, 'lb-sw' + (it.on ? ' on' : ''), function () { if (!it.on) it.run(); });
      b.setAttribute('aria-pressed', it.on ? 'true' : 'false');
      box.appendChild(b);
    });
    box.hidden = !items.length;
  }

  function drawFilters() {
    var unit = data.unit;
    var spans = [];
    if (unit) spans.push({ label: 'This topic', on: view.span === 'unit', run: function () { show({ span: 'unit' }); } });
    spans.push({ label: 'This year', on: view.span === 'year', run: function () { show({ span: 'year' }); } });
    spans.push({ label: 'All time', on: view.span === 'all', run: function () { show({ span: 'all' }); } });
    switchRow($('lbSpan'), spans);

    // A student: their class or all of them. The teacher (or student view): all classes or one period.
    var classes = [];
    if (view.span !== 'all') {
      var all = { label: 'All classes', on: !view.period, run: function () { show({ period: '', chosePeriod: true }); } };
      if (!teacher && data.me && data.me.period) {
        var p = data.me.period;
        classes.push({ label: 'My class', on: view.period === p, run: function () { show({ period: p, chosePeriod: true }); } });
        classes.push(all);
      } else if ((data.periods || []).length > 1) {
        classes.push(all);
        data.periods.forEach(function (x) {
          classes.push({ label: periodName(x), on: view.period === x, run: function () { show({ period: x, chosePeriod: true }); } });
        });
      }
    }
    switchRow($('lbClass'), classes);

    var says = view.span === 'unit' ? 'This topic: ' + unit.name + ' (this school year, ' + data.year + ')'
      : view.span === 'year' ? 'This school year (' + data.year + '), every topic'
        : 'Every year, every class. Students from past years show their school year.';
    $('lbShowing').textContent = says;
    if (teacher) unitPicker();
    $('lbFilters').hidden = false;
  }

  // The teacher picks the current topic (Donny, 2026-11-10; called a unit at first, "topic" since 2026-11-11): the
  // flashcard set (a topic) the students' This topic shows. Picking another one here shows it to the teacher only, with a button to
  // make it the current topic. (The code and the site's API still call it the unit.)
  function unitPicker() {
    var box = $('lbUnitPick');
    box.textContent = '';
    box.hidden = false;
    var units = data.units || [];
    if (!units.length) {
      box.appendChild(mk('p', 'lb-small', 'For This topic, make a flashcard set for each topic on the Flashcards page. Then pick the current one here.'));
      return;
    }
    var cur = data.current;
    var lab = mk('label', 'lb-unit-label', 'Topic ');
    var sel = mk('select');
    if (!cur) {
      var none = mk('option', null, 'Pick the topic you are teaching now');
      none.value = '';
      sel.appendChild(none);
    }
    units.forEach(function (u) {
      var o = mk('option', null, u.name + (cur && cur.id === u.id ? ' (current)' : ''));
      o.value = u.id;
      sel.appendChild(o);
    });
    sel.value = data.unit ? data.unit.id : '';
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      show({ unit: cur && sel.value === cur.id ? '' : sel.value, span: 'unit' });
    });
    lab.appendChild(sel);
    box.appendChild(lab);
    var msg = mk('span', 'lb-small');
    msg.setAttribute('role', 'status');
    if (data.unit && (!cur || cur.id !== data.unit.id)) {
      var pick = data.unit;
      var make = btn('Make this the current topic', 'btn lb-btn-sm', function () {
        make.disabled = true;
        msg.textContent = ' Saving...';
        fetch('/api/board/unit', { method: 'PUT', headers: { 'X-IS8-Editor': '1', 'content-type': 'application/json' }, body: JSON.stringify({ id: pick.id }), cache: 'no-store' })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'That did not save. Try again.'); return d; }); })
          .then(function () { show({ unit: '', span: 'unit' }); }, function (err) { make.disabled = false; msg.textContent = ' ' + err.message; });
      });
      box.appendChild(make);
      if (cur) box.appendChild(mk('span', 'lb-small', ' Students see ' + cur.name + ' now. Only you see this one.'));
    } else if (cur) {
      box.appendChild(mk('span', 'lb-small', ' Students see this topic under This topic. When you start a new topic, pick it here.'));
    }
    box.appendChild(msg);
  }

  /* ---------------- drawing the boards ---------------- */

  var TROPHY = ['', 'trophy-1.webp', 'trophy-2.webp', 'trophy-3.webp'];

  function valueText(bd, r) { return plural(r.value, bd.unit); }

  // "Maya R." with a tag: the period (all classes) or the school year (a past student). On the podium,
  // where names have little room, "You" is a tag too.
  function nameEl(tag, cls, r, allClasses, onPodium) {
    var who = mk(tag, cls, r.name + (r.me && !onPodium ? ' (you)' : ''));
    if (teacher && r.email) who.title = r.email;
    if (r.me && onPodium) who.appendChild(mk('span', 'lb-you', 'You'));
    if (r.year) who.appendChild(mk('span', 'lb-year', r.year));
    else if (allClasses && r.period) who.appendChild(mk('span', 'lb-period', /^\d+$/.test(r.period) ? 'P' + r.period : r.period));
    return who;
  }

  function rowEl(bd, r, allClasses) {
    var li = mk('li', 'lb-row' + (r.me ? ' me' : '') + (r.place <= 3 ? ' top ' + MEDALS[r.place] : ''));
    var place = mk('span', 'lb-place', String(r.place));
    place.setAttribute('aria-label', 'Place ' + r.place);
    li.appendChild(place);
    li.appendChild(nameEl('span', 'lb-name', r, allClasses));
    li.appendChild(mk('span', 'lb-value', valueText(bd, r)));
    return li;
  }

  // The top 3 on a podium: 2nd, 1st, 3rd, each with their trophy (a tie for 1st is two gold trophies).
  function podium(bd, rows, allClasses) {
    var pod = mk('ol', 'lb-podium');
    pod.setAttribute('aria-label', 'Top 3');
    [1, 0, 2].forEach(function (i) {
      var r = rows[i];
      if (!r) return;
      var spot = mk('li', 'lb-spot p' + r.place + (i === 0 ? ' first' : '') + (r.me ? ' me' : ''));
      var img = mk('img');
      img.src = '../assets/' + TROPHY[r.place];
      img.alt = ['', '1st place', '2nd place', '3rd place'][r.place] + ' trophy';
      img.width = 256;
      img.height = 233;
      spot.appendChild(img);
      spot.appendChild(nameEl('span', 'lb-spot-name', r, allClasses, true));
      spot.appendChild(mk('span', 'lb-spot-value', valueText(bd, r)));
      pod.appendChild(spot);
    });
    return pod;
  }

  function card(bd, allClasses, big) {
    var c = mk('article', 'lb-card' + (big ? ' lb-card-big' : ''));
    c.appendChild(mk('h2', 'lb-title', bd.title));
    c.appendChild(mk('p', 'lb-blurb', bd.blurb));
    if (!bd.rows.length) {
      c.appendChild(mk('p', 'lb-empty', 'Nobody yet. Be the first!'));
      return c;
    }
    // The podium takes the first rows that are in the top 3 (at most three of them).
    var n = 0;
    while (n < 3 && n < bd.rows.length && bd.rows[n].place <= 3) n++;
    // The big card (Donny, 2026-11-11: "a lot of dead space"): the podium on the left, 4th place down on the
    // right, side by side (stacked on a phone).
    var body = big ? mk('div', 'lb-big-body') : c;
    body.appendChild(podium(bd, bd.rows.slice(0, n), allClasses));
    var rest = big ? mk('div', 'lb-big-rest') : c;
    if (bd.rows.length > n) {
      var ol = mk('ol', 'lb-list');
      bd.rows.slice(n).forEach(function (r) { ol.appendChild(rowEl(bd, r, allClasses)); });
      rest.appendChild(ol);
    }
    if (bd.mine) {
      var gap = mk('ol', 'lb-list lb-mine');
      gap.appendChild(rowEl(bd, bd.mine, allClasses));
      rest.appendChild(gap);
    }
    if (big) {
      if (rest.firstChild) body.appendChild(rest);
      else body.classList.add('lb-big-alone');
      c.appendChild(body);
    }
    return c;
  }

  function draw() {
    var box = $('lbBoards');
    box.textContent = '';
    var allClasses = !view.period;
    if (data.me) {
      var hi = mk('p', 'lb-hello');
      hi.textContent = 'Signed in as ' + data.me.name + (data.me.period ? ', period ' + data.me.period : '') + '. Your row is highlighted.';
      box.appendChild(hi);
    } else if (studentView) {
      box.appendChild(mk('p', 'lb-hello', 'Student view: this is the leaderboard the way students see it (a student’s own row is highlighted for them).'));
    } else if (teacher) {
      box.appendChild(mk('p', 'lb-hello', 'You are signed in as the teacher: each leaderboard shows its top 10, and hovering a name shows the email.'));
    }
    var boards = data.boards || [];
    if (boards.length) box.appendChild(card(boards[0], allClasses, true));
    var grid = mk('div', 'lb-grid');
    boards.slice(1).forEach(function (bd) { grid.appendChild(card(bd, allClasses, false)); });
    box.appendChild(grid);
    if (teacher && data.reviewGames) box.appendChild(reviewTopicsBox());
    box.appendChild(mk('p', 'lb-note', 'How it counts: review game points add up your best try on each of your teacher’s review games. Live games count when your teacher hosts them and you joined signed in with Class Pass, and a win is first place. Practice counts when you finish Match, a test, or every term in Learn while signed in. All time keeps every year, so you can try to beat students from past years.'));
  }

  // Teacher only (Donny, 2026-11-03): which topic each review game counts toward. A game goes with the folder or
  // set whose name is in the game's title. A game whose sheet sent its points before the site kept titles counts
  // on This year and All time only until the sheet sends them again.
  function reviewTopicsBox() {
    var games = data.reviewGames || [], untitled = data.reviewUntitled || 0;
    var trouble = untitled || games.some(function (g) { return !g.topic; });
    var details = mk('details', 'lb-roster-box');
    if (trouble) details.open = true;
    details.appendChild(mk('summary', null, 'Review games and their topics'));
    details.appendChild(mk('p', 'lb-small', 'A review game counts toward This topic when the topic’s name (its flashcard set’s name, without the emojis) is in the game’s title, like “Kinetic Energy and Speed Review Game” for the topic Kinetic Energy and Speed. Every review game counts on This year and All time.'));
    if (games.length) {
      var ul = mk('ul', 'lb-small');
      games.forEach(function (g) {
        ul.appendChild(mk('li', null, g.title + ': ' + (g.topic ? 'goes with ' + g.topic : 'no topic yet (no folder or set name is in this title), so it counts on This year and All time only')));
      });
      details.appendChild(ul);
    }
    if (untitled) {
      details.appendChild(mk('p', 'lb-small', plural(untitled, 'review game') + ' sent points before this site kept game titles, so ' + (untitled === 1 ? 'it counts' : 'they count') +
        ' on This year and All time only. To fix it, open that game’s Google Sheet and click Self-Check > Send game points to the website leaderboard now. (Sheets on version 2026.11.03b or newer do this by themselves within an hour.)'));
    }
    if (!games.length && !untitled) details.appendChild(mk('p', 'lb-small', 'No review game has sent its points yet.'));
    return details;
  }

  /* ---------------- the roster (teacher) ---------------- */

  var EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
  var PERIOD = /^(?:p(?:er(?:iod)?)?\.?\s*)?(\d{1,2})$/i;

  // One line of a pasted list into cells: tabs (from a spreadsheet), or
  // commas with "quoted, parts" (a CSV file).
  function cells(line) {
    if (line.indexOf('\t') !== -1) return line.split('\t').map(function (c) { return c.trim(); });
    var out = [], cur = '', quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line.charAt(i);
      if (ch === '"') { if (quoted && line.charAt(i + 1) === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if ((ch === ',' || ch === ';') && !quoted) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  // A pasted class list -> [{ email, first, last, period }]. Columns can be in
  // any order: the email is found by its @, the period by being a number, and
  // the name is either two cells (first, last) or one ("Maya Rodriguez", or
  // "Rodriguez, Maya" in a single cell). A Self-Check sheet's Roster tab
  // (Period, Name, Email, ...) pastes straight in.
  function parseRoster(text, fallbackPeriod) {
    var head = null, rows = [], skipped = [];
    text.split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var c = cells(line);
      var ei = -1;
      c.forEach(function (x, i) { if (ei < 0 && EMAIL.test(x)) ei = i; });
      if (ei < 0) {
        var low = c.map(function (x) { return x.toLowerCase(); });
        if (low.some(function (x) { return /first/.test(x); }) || low.some(function (x) { return /email/.test(x); })) head = low;
        else skipped.push(line);
        return;
      }
      var first = '', last = '', period = '';
      if (head) {
        head.forEach(function (h, i) {
          if (!c[i]) return;
          if (/first/.test(h)) first = c[i];
          else if (/last|surname|family/.test(h)) last = c[i];
          else if (/period|class|section|^per/.test(h) && PERIOD.test(c[i])) period = PERIOD.exec(c[i])[1];
          else if (/name/.test(h) && !first && !last) { var nm = splitName(c[i]); first = nm[0]; last = nm[1]; }
        });
      }
      var rest = [];
      c.forEach(function (x, i) {
        if (i === ei || !x) return;
        if (!period && PERIOD.test(x)) { period = PERIOD.exec(x)[1]; return; }
        if (/[a-z]/i.test(x) && !/^\d{5,}$/.test(x) && !EMAIL.test(x)) rest.push(x);
      });
      if (!first && !last) {
        if (rest.length >= 2) { first = rest[0]; last = rest[1]; }
        else if (rest.length === 1) { var n = splitName(rest[0]); first = n[0]; last = n[1]; }
      }
      if (!first) first = c[ei].split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0] || 'Student';
      rows.push({ email: c[ei].toLowerCase(), first: first, last: last, period: period || fallbackPeriod || '' });
    });
    return { rows: rows, skipped: skipped };
  }
  function splitName(full) {
    full = full.replace(/\s+/g, ' ').trim();
    if (full.indexOf(',') !== -1) { var p = full.split(','); return [p.slice(1).join(',').trim(), p[0].trim()]; }
    var w = full.split(' ');
    return w.length > 1 ? [w.slice(0, -1).join(' '), w[w.length - 1]] : [full, ''];
  }

  function rosterCall(method, path, body) {
    return fetch('/api/roster' + (path ? '/' + path : ''), {
      method: method,
      headers: { 'X-IS8-Editor': '1', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'That did not work. Try again.');
        return d;
      });
    });
  }

  // fresh: the email of a row just edited, which is highlighted.
  function drawRoster(list, fresh) {
    var sec = $('lbRoster');
    sec.hidden = false;
    sec.textContent = '';
    var details = mk('details', 'lb-roster-box');
    var fromSheet = !!(classList && classList.connected);
    var sum = mk('summary', null, (fromSheet ? 'Class list (' : 'Class roster (') + plural(list.students.length, 'student') + (fromSheet ? ', from your Class List sheet)' : ')'));
    details.appendChild(sum);
    if (!list.students.length) details.open = true;
    var msg = mk('p', 'lb-small lb-ok');
    msg.id = 'lbRosterMsg';
    msg.setAttribute('role', 'status');
    if (fromSheet) sheetPart(details, msg);
    else {
    details.appendChild(mk('p', 'lb-small', 'Only students on this list can sign in with Class Pass. Paste rows of email, first name, last name and period, in any order, straight from a spreadsheet. A Self-Check sheet’s Roster tab (Period, Name, Email) works as it is.'));

    var ta = mk('textarea', 'lb-paste');
    ta.rows = 7;
    ta.placeholder = 'maya.rodriguez@hartdistrict.org\tMaya\tRodriguez\t3\n3\tLiam Chen\tliam.chen@hartdistrict.org';
    ta.setAttribute('aria-label', 'Paste the class list');
    details.appendChild(ta);
    var opts = mk('div', 'lb-paste-opts');
    var perLab = mk('label', null, 'Period for rows without one ');
    var per = mk('input');
    per.type = 'text';
    per.size = 4;
    per.maxLength = 20;
    perLab.appendChild(per);
    opts.appendChild(perLab);
    var modeLab = mk('label');
    var mode = mk('select');
    [['add', 'Add these students (keep everyone else)'], ['replace', 'Replace the whole roster with this list']].forEach(function (m) {
      var o = mk('option', null, m[1]);
      o.value = m[0];
      mode.appendChild(o);
    });
    modeLab.appendChild(mode);
    opts.appendChild(modeLab);
    details.appendChild(opts);
    var preview = mk('p', 'lb-small');
    preview.setAttribute('role', 'status');
    var parsed = null;
    var check = function () {
      parsed = parseRoster(ta.value, per.value.trim());
      preview.textContent = ta.value.trim() ? 'Found ' + plural(parsed.rows.length, 'student') + (parsed.skipped.length ? '; ' + plural(parsed.skipped.length, 'line') + ' without an email skipped' : '') + '.' +
        (parsed.rows.length ? ' First: ' + parsed.rows[0].first + ' ' + parsed.rows[0].last + ', period ' + (parsed.rows[0].period || '(none)') + '.' : '') : '';
    };
    ta.addEventListener('input', check);
    per.addEventListener('input', check);
    details.appendChild(preview);
    var saveBtn = btn('Save roster', 'btn', function () {
      check();
      if (!parsed.rows.length) { preview.textContent = 'Paste at least one row with a student email first.'; return; }
      if (mode.value === 'replace' && !window.confirm('Replace the roster? Students not in this list can no longer sign in (their results are kept).')) return;
      saveBtn.disabled = true;
      rosterCall('PUT', '', { students: parsed.rows, mode: mode.value }).then(function (d) {
        saveBtn.disabled = false;
        ta.value = '';
        drawRoster(d);
        $('lbRoster').querySelector('details').open = true;
        $('lbRosterMsg').textContent = 'Saved ' + plural(d.saved, 'student') + '.';
        data = null;
        load();
      }, function (err) { saveBtn.disabled = false; preview.textContent = err.message; });
    });
    details.appendChild(saveBtn);
    }
    details.appendChild(msg);

    if (list.students.length) {
      var wrap = mk('div', 'lb-table-wrap');
      var table = mk('table', 'lb-table');
      var hr = mk('tr');
      ['Period', 'Shows as', 'Name', 'Email', 'Signed in', 'Results', ''].forEach(function (h) { hr.appendChild(mk('th', null, h)); });
      var thead = mk('thead');
      thead.appendChild(hr);
      table.appendChild(thead);
      var tb = mk('tbody');
      // The row being edited goes back to normal when another one is opened.
      var editing = null;
      var showRow = function (tr, s) {
        tr.textContent = '';
        tr.className = s.email === fresh ? 'lb-saved' : '';
        tr.appendChild(mk('td', null, s.period));
        tr.appendChild(mk('td', null, s.name));
        tr.appendChild(mk('td', null, s.first + ' ' + s.last));
        tr.appendChild(mk('td', 'lb-email', s.email));
        tr.appendChild(mk('td', null, s.signedIn ? 'Yes' : ''));
        tr.appendChild(mk('td', null, String(s.results)));
        var tools = mk('td', 'lb-tools');
        if (!fromSheet) tools.appendChild(btn('Edit', 'linkbtn', function () { editRow(tr, s); }));
        tools.appendChild(btn('Clear results', 'linkbtn', function () {
          if (!window.confirm('Clear every result for ' + s.first + ' ' + s.last + '? This cannot be undone.')) return;
          rosterCall('POST', 'reset', { email: s.email }).then(function (d) { drawRoster(d); $('lbRoster').querySelector('details').open = true; load(); }, function (err) { msg.textContent = err.message; });
        }));
        if (!fromSheet) tools.appendChild(btn('Remove', 'linkbtn', function () {
          if (!window.confirm('Take ' + s.first + ' ' + s.last + ' off the roster? They are signed out and no longer shown. Their results are kept in case you add them back.')) return;
          rosterCall('POST', 'remove', { email: s.email }).then(function (d) { drawRoster(d); $('lbRoster').querySelector('details').open = true; load(); }, function (err) { msg.textContent = err.message; });
        }));
        tr.appendChild(tools);
      };
      // The same row as boxes, to fix a mistyped email, a name or a period.
      // Enter saves, Escape puts the row back.
      var editRow = function (tr, s) {
        if (editing) editing();
        editing = function () { editing = null; showRow(tr, s); };
        tr.textContent = '';
        tr.className = 'lb-editing';
        var box = function (value, label, size) {
          var i = mk('input');
          i.type = 'text';
          i.value = value || '';
          i.size = size;
          i.setAttribute('aria-label', label + ' for ' + s.first + ' ' + s.last);
          i.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') editing();
          });
          return i;
        };
        var cell = function (kids, cls) {
          var td = mk('td', cls);
          kids.forEach(function (k) { td.appendChild(k); });
          return td;
        };
        var ePer = box(s.period, 'Period', 3);
        var eFirst = box(s.first, 'First name', 10);
        var eLast = box(s.last, 'Last name', 12);
        var eEmail = box(s.email, 'Email', 30);
        eEmail.spellcheck = false;
        var note = mk('span', 'lb-edit-msg');
        note.setAttribute('role', 'status');
        var say = function (text, bad) { note.textContent = text; note.classList.toggle('bad', !!bad); };
        var saveRow = btn('Save', 'btn lb-btn-sm', function () { save(); });
        var save = function () {
          var p = ePer.value.trim();
          var student = { email: eEmail.value.trim().toLowerCase(), first: eFirst.value.trim(), last: eLast.value.trim(), period: PERIOD.test(p) ? PERIOD.exec(p)[1] : p };
          if (!EMAIL.test(student.email)) { say('That is not a full email address.', true); eEmail.focus(); return; }
          if (!student.first) { say('Type a first name.', true); eFirst.focus(); return; }
          saveRow.disabled = true;
          say('Saving...');
          rosterCall('POST', 'edit', { email: s.email, student: student }).then(function (d) {
            drawRoster(d, student.email);
            $('lbRoster').querySelector('details').open = true;
            var moved = student.email !== s.email;
            $('lbRosterMsg').textContent = 'Saved ' + student.first + ' ' + student.last + '.' +
              (moved && s.results ? ' Their results moved to the new email.' : '') +
              (moved && s.signedIn ? ' They need to sign in with Class Pass again.' : '');
            // A new period changes the class list in the filters.
            data = null;
            load();
          }, function (err) { saveRow.disabled = false; say(err.message, true); });
        };
        tr.appendChild(cell([ePer]));
        tr.appendChild(cell([document.createTextNode(s.name)]));
        tr.appendChild(cell([eFirst, eLast], 'lb-edit-name'));
        tr.appendChild(cell([eEmail]));
        tr.appendChild(cell([document.createTextNode(s.signedIn ? 'Yes' : '')]));
        tr.appendChild(cell([document.createTextNode(String(s.results))]));
        tr.appendChild(cell([saveRow, btn('Cancel', 'linkbtn', function () { editing(); }), note], 'lb-tools'));
        eEmail.focus();
      };
      list.students.forEach(function (s) {
        var tr = mk('tr');
        showRow(tr, s);
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      wrap.appendChild(table);
      details.appendChild(wrap);
    }
    sec.appendChild(details);
    sec.appendChild(classListBox());
    sec.appendChild(reviewKeyBox());
  }

  /* ---------------- the Class List sheet (Donny, 2026-11-10) ---------------- */

  function ago(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return plural(m, 'minute') + ' ago';
    var h = Math.round(m / 60);
    if (h < 48) return plural(h, 'hour') + ' ago';
    return new Date(ms).toLocaleDateString();
  }
  // Asks the Class List sheet's web app (its helper) to do something; it checks the key.
  function askSheet(fn) {
    return fetch(classList.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, key: classList.key }) })
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var d = null;
        try { d = JSON.parse(text); } catch (e) { d = null; }
        if (!d) throw new Error('The Class List sheet did not answer. Open it and run Class List > Set up once.');
        if (!d.ok) throw new Error(d.error || 'The Class List sheet said no.');
        return d.result;
      });
  }
  // The class list comes from the sheet: which classes, when it last came, and Sync now.
  function sheetPart(details, msg) {
    var c = classList;
    details.appendChild(mk('p', 'lb-small', 'Your class list comes from your Class List Google Sheet: tick classes in its Classes tab, and add anyone else in its Added by hand tab. ' +
      'It sends the list here every hour when it changes. Last sent ' + ago(c.synced) + ': ' + plural(c.students || 0, 'student') + '. ' +
      'Change students in the sheet, not here (the next sync would undo it). Clear results still works here.'));
    var shown = (c.classes || []).filter(function (x) { return x.show; }), off = (c.classes || []).filter(function (x) { return !x.show; });
    if (shown.length) {
      var wrap = mk('div', 'lb-table-wrap');
      var table = mk('table', 'lb-table');
      var hr = mk('tr');
      ['Class', 'Shows as', 'Students'].forEach(function (h) { hr.appendChild(mk('th', null, h)); });
      var thead = mk('thead');
      thead.appendChild(hr);
      table.appendChild(thead);
      var tb = mk('tbody');
      shown.forEach(function (x) {
        var tr = mk('tr');
        tr.appendChild(mk('td', null, x.name));
        tr.appendChild(mk('td', null, /^\d+$/.test(x.showsAs) ? 'Period ' + x.showsAs : x.showsAs));
        tr.appendChild(mk('td', null, String(x.count)));
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      wrap.appendChild(table);
      details.appendChild(wrap);
    }
    if (off.length) details.appendChild(mk('p', 'lb-small', 'Not on the site (unticked in the sheet): ' + off.map(function (x) { return x.name; }).join('; ') + '.'));
    if (c.url) {
      var go = btn('Sync now', 'btn', function () {
        go.disabled = true;
        msg.textContent = 'Asking the Class List sheet... (about half a minute)';
        askSheet('sync').then(function (r) {
          go.disabled = false;
          msg.textContent = r.text || 'Sent.';
          data = null;
          loadRoster();
          load();
        }, function (err) { go.disabled = false; msg.textContent = err.message; });
      });
      details.appendChild(go);
    }
  }

  // The key the Class List sheet needs (Settings tab, Site key), and how to set the sheet up.
  function classListBox() {
    var c = classList || {};
    var details = mk('details', 'lb-roster-box');
    details.appendChild(mk('summary', null, c.connected ? 'Class list key' : 'Class list from a Google Sheet (set up)'));
    if (!c.connected) {
      details.appendChild(mk('p', 'lb-small', 'Keep your class list in a Google Sheet instead of pasting it here. The sheet lists your Google Classroom classes; tick the ones on this site, and it keeps the list up to date every hour. It is also what lets the Assignment Launchpad update your sheets’ code (Update now).'));
      var ol = mk('ol', 'lb-small');
      ['Make a new Google Sheet (sheets.new) and name it Class List.',
        'In it: Extensions > Apps Script. Click Project Settings (the gear on the left) and check Show "appsscript.json" manifest file in editor.',
        'Back in the editor (the < > on the left): open physical-science-8.pages.dev/pass/releases/class-list/Code.gs.txt, copy it all, and paste it over everything in Code.gs. Then open appsscript.json.txt there and paste it over everything in appsscript.json. Save.',
        'Turn on the Google Apps Script API once: script.google.com/home/usersettings, switch Google Apps Script API to On.',
        'Reload the sheet. Class List > Set up, and approve.',
        'Copy the key below into the sheet’s Settings tab, Site key. Tick Show for your classes in the Classes tab, then Class List > Sync now.'
      ].forEach(function (s) { ol.appendChild(mk('li', null, s)); });
      details.appendChild(ol);
    } else {
      details.appendChild(mk('p', 'lb-small', 'Your Class List sheet uses this key (Settings tab, Site key). Keep it to yourself: it lets a sheet change the class list and update your assignment sheets. Changing the teacher password changes it, and then the sheet needs the new one.'));
    }
    var out = mk('input', 'lb-paste');
    out.readOnly = true;
    out.value = c.key || 'The key did not load. Reload the page.';
    out.setAttribute('aria-label', 'Class list key');
    out.style.cssText = 'font-family:monospace;font-size:13px;width:100%;max-width:640px';
    var note = mk('span', 'lb-small');
    var copy = btn('Copy the key', 'btn', function () {
      out.select();
      var done = function () { note.textContent = ' Copied.'; };
      if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, function () { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    copy.disabled = !c.key;
    var row = mk('p');
    row.appendChild(copy);
    row.appendChild(note);
    details.appendChild(out);
    details.appendChild(row);
    return details;
  }

  // The key a review game's Google Sheet needs to put its points on these
  // leaderboards (Settings tab, "Website leaderboard key"). It is made from the
  // teacher password, so only the teacher sees it.
  function reviewKeyBox() {
    var details = mk('details', 'lb-roster-box');
    details.appendChild(mk('summary', null, 'Review game key'));
    details.appendChild(mk('p', 'lb-small', 'A review game (a Google Sheet) puts its game points on the Review games leaderboards when its Settings tab has this key. Copy it, then paste it into the sheet’s Settings tab, in Website leaderboard key. Keep it to yourself: it lets a sheet add points. Changing the teacher password changes the key.'));
    var out = mk('input', 'lb-paste');
    out.readOnly = true;
    out.value = 'Loading…';
    out.setAttribute('aria-label', 'Review game key');
    out.style.cssText = 'font-family:monospace;font-size:13px;width:100%;max-width:640px';
    var msg = mk('span', 'lb-small');
    var copy = btn('Copy the key', 'btn', function () {
      out.select();
      var done = function () { msg.textContent = ' Copied.'; };
      if (navigator.clipboard) navigator.clipboard.writeText(out.value).then(done, function () { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    copy.disabled = true;
    var row = mk('p');
    row.appendChild(copy);
    row.appendChild(msg);
    details.appendChild(out);
    details.appendChild(row);
    details.addEventListener('toggle', function () {
      if (!details.open || !copy.disabled) return;
      fetch('/api/review/key', { headers: { 'X-IS8-Editor': '1' }, cache: 'no-store' }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok || !d.key) throw new Error(d.error || 'The key did not load. Try again.');
          out.value = d.key;
          copy.disabled = false;
        });
      }).catch(function (err) { out.value = ''; msg.textContent = ' ' + err.message; });
    });
    return details;
  }

  function loadRoster() {
    var cl = fetch('/api/classlist', { headers: { 'X-IS8-Editor': '1' }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { connected: false }; }, function () { return { connected: false }; });
    Promise.all([rosterCall('GET'), cl]).then(function (got) { classList = got[1] || { connected: false }; drawRoster(got[0]); }, function (err) {
      $('lbRoster').hidden = false;
      $('lbRoster').textContent = err.message;
    });
  }

  /* ---------------- start ---------------- */

  function start() {
    var session = ED ? ED.session() : Promise.resolve({ editor: false });
    session.then(function (s) {
      teacher = !!s.editor;
      studentView = !!s.studentView;
      if (teacher || studentView) $('lbTeacherBtn').parentNode.style.display = 'none';
      if (teacher) loadRoster();
      load();
    });
  }
  $('lbTeacherBtn').addEventListener('click', function () {
    var box = $('lbTeacherSignIn');
    box.hidden = false;
    $('lbTeacherBtn').hidden = true;
    if (ED) ED.signInForm(box, function () { location.reload(); });
  });
  // Signed in (or out) with Class Pass: load again.
  var lastMe = null, began = false;
  if (PASS) {
    PASS.onChange(function (m) {
      var who = m ? m.name : '';
      if (began && who !== lastMe) { data = null; load(); }
      lastMe = who;
    });
  }
  began = true;
  start();
})();
