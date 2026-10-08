/* ============================================================
   The class leaderboard (leaderboard/), Donny 2026-10-08.

   Students signed in with Class Pass, and the teacher, see the boards:
   wins in live games (team and solo), top 3 finishes, correct answers,
   wins by game, practice, and, for one topic at a time, the fastest Match
   times. Names show as "First L.". Filters: one class or all of them, this
   school year (from August) or all time, and a topic (a folder or a set).

   The teacher also gets the roster: paste the class list (email, first name,
   last name, period), see who has signed in, and take a student off or clear
   their results. Only students on the roster can sign in with Class Pass.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ED = window.IS8Editor;
  var PASS = window.IS8Pass;
  var teacher = false;
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
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : /(s|sh|ch|x)$/.test(word) ? 'es' : 's'); }
  function seconds(ms) { return (Math.floor(ms / 100) / 10).toFixed(1) + ' s'; }

  // Remembered on this device: the filters last used.
  var KEY = 'is8-board-filters';
  function saved() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function keep() {
    try { localStorage.setItem(KEY, JSON.stringify({ period: $('lbPeriod').value, span: span(), topic: $('lbTopic').value })); } catch (e) { /* fine */ }
  }
  function span() { var r = document.querySelector('input[name="lbSpan"]:checked'); return r ? r.value : 'year'; }

  /* ---------------- loading the boards ---------------- */

  function load() {
    var mine = ++loading;
    var start = saved();
    var q = new URLSearchParams({
      period: data ? $('lbPeriod').value : (start.period || ''),
      span: data ? span() : (start.span || 'year'),
      topic: data ? $('lbTopic').value : (start.topic || '')
    });
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
      var first = !data;
      data = res.d;
      if (first) fillFilters(q);
      status('');
      draw();
    }, function () {
      if (mine === loading) status('Could not reach the site. Check the internet connection.', true);
    });
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

  function fillFilters(q) {
    var per = $('lbPeriod');
    per.length = 1;
    (data.periods || []).forEach(function (p) {
      var o = mk('option', null, /^\d+$/.test(p) ? 'Period ' + p : p);
      o.value = p;
      per.appendChild(o);
    });
    per.value = q.get('period');
    if (per.value !== q.get('period')) per.value = '';
    // A student starts on their own class.
    if (!teacher && data.me && data.me.period && !('period' in saved())) per.value = data.me.period;
    $('lbYearLabel').textContent = 'This school year (' + data.year + ')';
    document.querySelector('input[name="lbSpan"][value="' + (q.get('span') === 'all' ? 'all' : 'year') + '"]').checked = true;
    var top = $('lbTopic');
    top.length = 1;
    var t = data.topics || { folders: [], sets: [] };
    var setsIn = function (fid) { return t.sets.filter(function (s) { return (s.folder || null) === fid; }); };
    var addSets = function (parent, list, indent) {
      list.forEach(function (s) {
        var o = mk('option', null, indent + s.title);
        o.value = 's:' + s.id;
        parent.appendChild(o);
      });
    };
    t.folders.filter(function (f) { return !f.parent; }).forEach(function (f) {
      var g = mk('optgroup');
      g.label = f.name;
      var all = mk('option', null, 'All of ' + f.name);
      all.value = 'f:' + f.id;
      g.appendChild(all);
      addSets(g, setsIn(f.id), '');
      t.folders.filter(function (k) { return k.parent === f.id; }).forEach(function (k) {
        var o = mk('option', null, ' ' + k.name + ' (all)');
        o.value = 'f:' + k.id;
        g.appendChild(o);
        addSets(g, setsIn(k.id), '  ');
      });
      top.appendChild(g);
    });
    var loose = setsIn(null);
    if (loose.length) {
      var g2 = mk('optgroup');
      g2.label = 'Other sets';
      addSets(g2, loose, '');
      top.appendChild(g2);
    }
    top.value = q.get('topic');
    if (top.value !== q.get('topic')) top.value = '';
    $('lbFilters').hidden = false;
    if (per.value !== q.get('period')) load();
  }

  /* ---------------- drawing the boards ---------------- */

  function valueText(bd, r) {
    if (bd.unit === 'ms') return seconds(r.value) + (r.pairs ? ' · ' + plural(r.pairs, 'pair') : '');
    return plural(r.value, bd.unit);
  }

  function rowEl(bd, r, allClasses) {
    var li = mk('li', 'lb-row' + (r.me ? ' me' : '') + (r.place <= 3 ? ' top ' + MEDALS[r.place] : ''));
    var place = mk('span', 'lb-place', String(r.place));
    place.setAttribute('aria-label', 'Place ' + r.place);
    li.appendChild(place);
    var who = mk('span', 'lb-name', r.name + (r.me ? ' (you)' : ''));
    if (teacher && r.email) who.title = r.email;
    li.appendChild(who);
    if (allClasses && r.period) li.appendChild(mk('span', 'lb-period', /^\d+$/.test(r.period) ? 'P' + r.period : r.period));
    li.appendChild(mk('span', 'lb-value', valueText(bd, r)));
    return li;
  }

  function draw() {
    var box = $('lbBoards');
    box.textContent = '';
    var allClasses = !$('lbPeriod').value;
    var topic = $('lbTopic').value;
    var groups = [];
    var byGroup = {};
    data.boards.forEach(function (bd) {
      if (!byGroup[bd.group]) { byGroup[bd.group] = []; groups.push(bd.group); }
      byGroup[bd.group].push(bd);
    });
    if (data.me) {
      var hi = mk('p', 'lb-hello');
      hi.textContent = 'Signed in as ' + data.me.name + (data.me.period ? ', period ' + data.me.period : '') + '. Your row is highlighted.';
      box.appendChild(hi);
    } else if (teacher) {
      box.appendChild(mk('p', 'lb-hello', 'You are signed in as the teacher: every student is listed, and hovering a name shows the email.'));
    }
    groups.forEach(function (name) {
      var sec = mk('section', 'lb-group');
      sec.appendChild(mk('h2', 'lb-group-title', name));
      var grid = mk('div', 'lb-grid');
      byGroup[name].forEach(function (bd) {
        var card = mk('article', 'lb-card');
        card.appendChild(mk('h3', 'lb-title', bd.title));
        card.appendChild(mk('p', 'lb-blurb', bd.blurb));
        if (!bd.rows.length) {
          card.appendChild(mk('p', 'lb-empty', bd.low ? 'No times yet on this topic. Play Match to set one!' : 'Nobody yet. Be the first!'));
        } else {
          var ol = mk('ol', 'lb-list');
          bd.rows.forEach(function (r) { ol.appendChild(rowEl(bd, r, allClasses)); });
          card.appendChild(ol);
          if (bd.mine) {
            var gap = mk('ol', 'lb-list lb-mine');
            gap.appendChild(rowEl(bd, bd.mine, allClasses));
            card.appendChild(gap);
          }
        }
        grid.appendChild(card);
      });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    if (!topic.startsWith('s:')) {
      box.appendChild(mk('p', 'lb-note', 'Fastest Match times show when you pick one set under Topic.'));
    }
    box.appendChild(mk('p', 'lb-note', 'How it counts: live games count when your teacher hosts them and you joined signed in with Class Pass. A win is first place. Practice counts when you finish Match, a test, or every term in Learn while signed in.'));
  }

  ['lbPeriod', 'lbTopic'].forEach(function (id) { $(id).addEventListener('change', function () { keep(); load(); }); });
  [].forEach.call(document.querySelectorAll('input[name="lbSpan"]'), function (r) { r.addEventListener('change', function () { keep(); load(); }); });

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

  function drawRoster(list) {
    var sec = $('lbRoster');
    sec.hidden = false;
    sec.textContent = '';
    var details = mk('details', 'lb-roster-box');
    var sum = mk('summary', null, 'Class roster (' + plural(list.students.length, 'student') + ')');
    details.appendChild(sum);
    if (!list.students.length) details.open = true;
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
    var msg = mk('p', 'lb-small lb-ok');
    msg.id = 'lbRosterMsg';
    msg.setAttribute('role', 'status');
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
      list.students.forEach(function (s) {
        var tr = mk('tr');
        tr.appendChild(mk('td', null, s.period));
        tr.appendChild(mk('td', null, s.name));
        tr.appendChild(mk('td', null, s.first + ' ' + s.last));
        tr.appendChild(mk('td', 'lb-email', s.email));
        tr.appendChild(mk('td', null, s.signedIn ? 'Yes' : ''));
        tr.appendChild(mk('td', null, String(s.results)));
        var tools = mk('td', 'lb-tools');
        tools.appendChild(btn('Clear results', 'linkbtn', function () {
          if (!window.confirm('Clear every result for ' + s.first + ' ' + s.last + '? This cannot be undone.')) return;
          rosterCall('POST', 'reset', { email: s.email }).then(function (d) { drawRoster(d); $('lbRoster').querySelector('details').open = true; load(); }, function (err) { msg.textContent = err.message; });
        }));
        tools.appendChild(btn('Remove', 'linkbtn', function () {
          if (!window.confirm('Take ' + s.first + ' ' + s.last + ' off the roster? They are signed out and no longer shown. Their results are kept in case you add them back.')) return;
          rosterCall('POST', 'remove', { email: s.email }).then(function (d) { drawRoster(d); $('lbRoster').querySelector('details').open = true; load(); }, function (err) { msg.textContent = err.message; });
        }));
        tr.appendChild(tools);
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      wrap.appendChild(table);
      details.appendChild(wrap);
    }
    sec.appendChild(details);
  }

  function loadRoster() {
    rosterCall('GET').then(drawRoster, function (err) {
      $('lbRoster').hidden = false;
      $('lbRoster').textContent = err.message;
    });
  }

  /* ---------------- start ---------------- */

  function start() {
    var session = ED ? ED.session() : Promise.resolve({ editor: false });
    session.then(function (s) {
      teacher = !!s.editor;
      if (teacher) $('lbTeacherBtn').parentNode.style.display = 'none';
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
