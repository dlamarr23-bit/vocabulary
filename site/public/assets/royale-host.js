/* ============================================================
   Battle Royale: the teacher's screen (royale/), Donny 2026-10-29.

   Setup: pick a question set (or a flashcard set), the starting energy, the
   time per question and an optional game clock. Question sets are made here:
   paste rows from Google Sheets (or a Wayground or Blooket spreadsheet) and
   save; they are kept on the site (/api/qsets) for next time.

   Then the board: the join code, the students and their heroes, and each
   round as it happens (the matchups, the question, the match results). The
   clock can be added, changed or taken away at any time, so a game always
   ends with a winner before the bell.

   The game itself runs on the game server (game-server/src/royale.js).
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ED = window.IS8Editor;
  var AV = window.SuperAvatars;
  var STEPS = ['rbGate', 'rbSetup', 'rbLobby', 'rbPlay', 'rbDone'];
  var COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#e03131'];
  var ws = null, game = null, board = null, leaving = false, retries = 0, pingTimer = null, qrFor = '', skew = null;

  function show(id) { STEPS.forEach(function (s) { $(s).hidden = s !== id; }); }
  function status(text) { $('rbStatus').textContent = text || ''; }
  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function toast(text) {
    var t = $('rbToast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function readSaved() {
    try { return JSON.parse(localStorage.getItem('is8-royale-v1')) || {}; } catch (e) { return {}; }
  }
  function writeSaved(v) {
    try { localStorage.setItem('is8-royale-v1', JSON.stringify(v)); } catch (e) { /* private window */ }
  }
  function keep(fn) { var s = readSaved(); fn(s); writeSaved(s); }

  function call(path, method, body) {
    var headers = { 'X-IS8-Editor': '1' };
    if (body) headers['content-type'] = 'application/json';
    return fetch('/api/' + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (d) {
          if (!res.ok || !d) {
            var err = new Error((d && d.error) || 'The site did not answer. Check the internet connection and try again.');
            err.data = d || {};
            throw err;
          }
          return d;
        });
      });
  }

  /* ---------------- hero pictures ---------------- */

  var heroByKey = {};
  (AV ? AV.list : []).forEach(function (h) { heroByKey[h.key] = h; });
  var heroSrc = {};
  var NO_HERO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="16" y="28" width="168" height="164" rx="30" fill="#c5c9d6"/><text x="100" y="135" font-family="Arial" font-weight="700" font-size="80" fill="#fff" text-anchor="middle">?</text></svg>');
  // Each picture is its own little image, so the same hero can show twice.
  function heroURL(key) {
    if (!heroByKey[key]) return NO_HERO;
    if (!heroSrc[key]) heroSrc[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(AV.render(heroByKey[key]));
    return heroSrc[key];
  }
  function heroImg(key, cls) {
    var img = mk('img', 'rb-hero' + (cls ? ' ' + cls : ''));
    img.alt = heroByKey[key] ? heroByKey[key].name : '';
    img.src = heroURL(key);
    return img;
  }
  function bolts(n, of) {
    var box = mk('span', 'rb-bolts');
    box.setAttribute('aria-label', n + ' energy');
    if (of > 6 || n > 6) { box.textContent = '⚡' + n; return box; }
    for (var i = 0; i < Math.max(n, of || 0); i++) box.appendChild(mk('span', i < n ? 'on' : 'off', '⚡'));
    return box;
  }
  function secs(ms) { return (ms / 1000).toFixed(2) + 's'; }
  function ordinal(n) { var t = n % 100, o = n % 10; return n + (t > 10 && t < 14 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); }

  // A strip of heroes across the top of the setup screen.
  (function strip() {
    var box = $('rbStrip');
    if (!box || !AV) return;
    ['batman', 'wonder-woman', 'spider-man', 'storm', 'black-panther', 'captain-marvel', 'hulk', 'ms-marvel', 'flash', 'supergirl'].forEach(function (k) {
      if (heroByKey[k]) box.appendChild(heroImg(k));
    });
  })();

  /* ---------------- getting in ---------------- */

  function gate() {
    if (!ED) { $('rbGateText').textContent = 'This page did not load properly. Reload it to try again.'; return; }
    ED.session().then(function (s) {
      if (!s.cloud) $('rbGateText').textContent = 'Saving to the site is not switched on, so games cannot run yet.';
      else if (!s.live) $('rbGateText').textContent = 'Games need one more Cloudflare setting. The steps are in the README, steps 4 and 5.';
      else if (!s.editor) {
        ED.forgetHint();
        $('rbGateText').textContent = 'Only your teacher can host a game. Teacher: sign in with the teacher password.';
        ED.signInForm($('rbSignIn'), function () { $('rbSignIn').textContent = ''; setup(); });
      } else {
        ED.rememberHint();
        setup();
      }
    });
  }

  var qsets = [], flashSets = [];
  function setup() {
    show('rbSetup');
    musicFor('');
    var saved = readSaved();
    var d = saved.defaults;
    if (d) {
      ['rbEnergy', 'rbSeconds', 'rbClock'].forEach(function (id) { if (d[id]) $(id).value = d[id]; });
      ['rbPass', 'rbComeback', 'rbShield'].forEach(function (id) { if (typeof d[id] === 'boolean') $(id).checked = d[id]; });
      if (d.source) document.querySelector('input[name="rbSource"][value="' + d.source + '"]').checked = true;
    }
    $('rbSaveDefault').checked = !!d;
    syncSource();
    if (saved.host && Date.now() - saved.host.at < 6 * 60 * 1000) {
      $('rbResumeText').textContent = 'Your game ' + saved.host.code + ' may still be running.';
      $('rbResume').hidden = false;
    }
    loadQsets(d && d.qset);
    call('sets').then(function (r) {
      flashSets = (r.list || []).filter(function (s) { return s && s.id; });
      var sel = $('rbFlash');
      sel.textContent = '';
      flashSets.forEach(function (s) {
        var o = mk('option', '', s.title + (s.count ? ' (' + s.count + ' terms)' : ''));
        o.value = s.id;
        sel.appendChild(o);
      });
      if (d && d.flash && flashSets.some(function (s) { return s.id === d.flash; })) sel.value = d.flash;
    }, function () { /* the flashcard list is only needed for that choice */ });
  }

  function loadQsets(want) {
    return call('qsets').then(function (r) {
      qsets = r.sets || [];
      var sel = $('rbQset');
      var was = want || sel.value;
      sel.textContent = '';
      if (!qsets.length) {
        var none = mk('option', '', 'No question sets yet: click New set');
        none.value = '';
        sel.appendChild(none);
      }
      qsets.forEach(function (s) {
        var o = mk('option', '', s.title + ' (' + s.count + (s.count === 1 ? ' question)' : ' questions)'));
        o.value = s.id;
        sel.appendChild(o);
      });
      if (was && qsets.some(function (s) { return s.id === was; })) sel.value = was;
      $('rbQsetEdit').disabled = $('rbQsetDelete').disabled = !qsets.length;
      $('rbQsetNote').textContent = qsets.length ? '' : 'Make your first set with New set. You can paste the questions straight from Google Sheets.';
    }, function (err) { $('rbQsetNote').textContent = err.message; });
  }

  function source() { var r = document.querySelector('input[name="rbSource"]:checked'); return r ? r.value : 'qset'; }
  function syncSource() {
    var q = source() === 'qset';
    $('rbQsetRow').hidden = !q;
    $('rbQsetNote').hidden = !q;
    $('rbFlashRow').hidden = q;
    $('rbFlashNote').hidden = q;
  }
  [].forEach.call(document.querySelectorAll('input[name="rbSource"]'), function (r) { r.addEventListener('change', syncSource); });

  /* ---------------- making a question set ---------------- */

  // Rows from a paste or a file: tabs (Google Sheets), commas (a .csv file,
  // with "quoted" cells) or " | " between the parts.
  function rows(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (text.indexOf('\t') >= 0) return splitQuoted(text, '\t');
    if (/ \| /.test(text)) return text.split('\n').map(function (l) { return l.split('|').map(function (c) { return c.trim(); }); });
    if (text.indexOf(',') >= 0) return splitQuoted(text, ',');
    return text.split('\n').map(function (l) { return [l.trim()]; });
  }
  // Spreadsheet text: a cell in "quotes" may hold the separator, a line
  // break, or "" for a quote mark.
  function splitQuoted(text, sep) {
    var out = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === sep) { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n') { row.push(cell.trim()); out.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell.trim());
    out.push(row);
    return out;
  }
  var isPic = function (s) { return /^https:\/\/\S+$/i.test(s || ''); };

  // Questions from the rows. A top row like Wayground's ("Question Text",
  // "Option 1" ... "Correct Answer") or Blooket's ("Answer 1" ... "Correct
  // Answer(s)") says which column is which; otherwise the columns are
  // question, right answer, then up to 3 wrong answers (and a picture link).
  function parse(text) {
    var list = rows(text).filter(function (r) { return r.some(function (c) { return c; }); });
    var head = -1, cols = null;
    for (var i = 0; i < Math.min(3, list.length); i++) {
      var low = list[i].map(function (c) { return c.toLowerCase(); });
      var qi = low.findIndex(function (c) { return /question text|^question$/.test(c); });
      var opts = [];
      low.forEach(function (c, j) { if (/^(option|answer) ?\d/.test(c)) opts.push(j); });
      var right = low.findIndex(function (c) { return /^correct/.test(c); });
      if (qi >= 0 && opts.length >= 2 && right >= 0) {
        head = i;
        cols = { q: qi, opts: opts, right: right, type: low.findIndex(function (c) { return /question type/.test(c); }), img: low.findIndex(function (c) { return /image/.test(c); }) };
        break;
      }
      // A top row of plain labels ("Question, Correct, Wrong...") is skipped.
      if (/^question/.test(low[0] || '') && /correct|answer/.test(low[1] || '')) { head = i; break; }
    }
    var questions = [], skipped = [];
    list.forEach(function (r, i) {
      if (i <= head) return;
      var q, a, w, img = '';
      if (cols) {
        if (cols.type >= 0 && r[cols.type] && !/multiple|checkbox/i.test(r[cols.type])) { skipped.push(i + 1); return; }
        var options = cols.opts.map(function (j) { return r[j] || ''; });
        var n = parseInt(String(r[cols.right] || '').split(/[,;]/)[0], 10);
        q = r[cols.q] || '';
        a = n >= 1 && n <= options.length ? options[n - 1] : '';
        w = options.filter(function (o, j) { return o && j !== n - 1; });
        if (cols.img >= 0 && isPic(r[cols.img])) img = r[cols.img];
      } else {
        q = r[0] || '';
        a = r[1] || '';
        w = r.slice(2, 5).filter(function (c) { return c && !isPic(c); });
        img = isPic(r[5]) ? r[5] : isPic(r[r.length - 1]) ? r[r.length - 1] : '';
      }
      w = w.filter(function (x, j) { return x.toLowerCase() !== a.toLowerCase() && w.indexOf(x) === j; }).slice(0, 3);
      if (!q || !a || !w.length) { skipped.push(i + 1); return; }
      questions.push({ q: q, a: a, w: w, img: img });
    });
    return { questions: questions, skipped: skipped };
  }

  var editing = '';
  function openEditor(id) {
    editing = id || '';
    $('rbEditorTitle').textContent = id ? 'Edit question set' : 'New question set';
    $('rbEdError').textContent = '';
    $('rbEdName').value = '';
    $('rbEdText').value = '';
    $('rbEdLink').value = '';
    $('rbImportHelp').hidden = true;
    $('rbEditor').hidden = false;
    preview();
    if (!id) { $('rbEdName').focus(); return; }
    $('rbEdCount').textContent = 'Opening...';
    call('qsets/' + id).then(function (s) {
      $('rbEdName').value = s.title;
      $('rbEdText').value = questionRows(s.questions);
      preview();
    }, function (err) { $('rbEdError').textContent = err.message; });
    $('rbEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function preview() {
    var r = parse($('rbEdText').value);
    var n = r.questions.length;
    $('rbEdCount').textContent = n ? n + (n === 1 ? ' question' : ' questions') + (r.skipped.length ? '. Skipped line' + (r.skipped.length === 1 ? ' ' : 's ') + r.skipped.slice(0, 8).join(', ') + (r.skipped.length > 8 ? '...' : '') + ' (each needs a question, a right answer and a wrong one).' : '') : '';
    var box = $('rbEdPreview');
    box.textContent = '';
    r.questions.slice(0, 4).forEach(function (x, i) {
      var card = mk('div', 'rb-pq');
      card.appendChild(mk('p', 'rb-pq-q', (i + 1) + '. ' + x.q));
      var ans = mk('p', 'rb-pq-a');
      ans.appendChild(mk('span', 'rb-ok', '✔ ' + x.a));
      x.w.forEach(function (w) { ans.appendChild(mk('span', 'rb-no', '✖ ' + w)); });
      card.appendChild(ans);
      if (x.img) card.appendChild(mk('p', 'lv-small', 'Picture: ' + x.img));
      box.appendChild(card);
    });
    if (n > 4) box.appendChild(mk('p', 'lv-small', 'and ' + (n - 4) + ' more.'));
    return r;
  }
  $('rbEdText').addEventListener('input', preview);

  // Questions (or spreadsheet rows) as lines for the box, a tab between cells.
  function cellText(c) { c = String(c == null ? '' : c); return /[\t\n"]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }
  function questionRows(list) {
    return list.map(function (x) {
      var cells = [x.q, x.a].concat(x.w);
      while (cells.length < 5) cells.push('');
      if (x.img) cells.push(x.img);
      return cells.map(cellText).join('\t');
    }).join('\n');
  }
  function sheetRows(list) { return list.map(function (r) { return r.map(cellText).join('\t'); }).join('\n'); }

  // Import from a link: a Wayground quiz or a Google Sheet (the site reads it).
  // A sheet shared only inside the school is read here instead, with the
  // Google account signed in to this browser (as Surge Showdown does).
  $('rbEdImport').addEventListener('click', function () {
    var link = $('rbEdLink').value.trim();
    var help = $('rbImportHelp');
    var btn = this;
    help.hidden = true;
    $('rbEdError').textContent = '';
    if (!/^https?:\/\//.test(link)) { $('rbEdError').textContent = 'Paste the whole link, starting with https://'; return; }
    btn.disabled = true;
    btn.textContent = 'Importing...';
    var done = function () { btn.disabled = false; btn.textContent = 'Import'; };
    var put = function (text, title) {
      $('rbEdText').value = text;
      if (title && !$('rbEdName').value) $('rbEdName').value = title;
      var r = preview();
      toast(r.questions.length ? 'Imported ' + r.questions.length + (r.questions.length === 1 ? ' question.' : ' questions.') + ' Check them, then click Save set.' : 'No questions found in that link.');
    };
    call('qsets/import', 'POST', { url: link }).then(function (r) {
      done();
      if (r.kind === 'quiz') {
        put(questionRows(r.questions), r.title);
        if (r.skipped) $('rbEdCount').textContent += ' ' + r.skipped + (r.skipped === 1 ? ' Wayground question was' : ' Wayground questions were') + ' skipped (not multiple choice, or picture answers).';
      } else put(r.text, 'Google Sheet set');
    }, function (err) {
      if (!err.data || !err.data.private) { done(); $('rbEdError').textContent = err.message; return; }
      sheetViaBrowser(link).then(function (rows) {
        done();
        if (rows && rows.length) { put(sheetRows(rows), 'Google Sheet set'); return; }
        help.innerHTML = '<strong>Could not open that sheet.</strong> Either:<ol><li>In the sheet, click <strong>Share</strong>, set General access to <strong>Anyone with the link</strong> (Viewer), then click Import again.</li>' +
          '<li>Or select the rows in the sheet, copy (Ctrl+C), click in the box below and paste (Ctrl+V).</li></ol>';
        help.hidden = false;
      });
    });
  });
  function sheetViaBrowser(link) {
    var id = (link.match(/\/spreadsheets\/d\/([\w-]{20,})/) || [])[1];
    if (!id || id === 'e') return Promise.resolve(null);
    var gid = (link.match(/[#&?]gid=(\d+)/) || [])[1];
    function once(user) {
      return new Promise(function (resolve) {
        var cb = '__rbSheet' + Math.random().toString(36).slice(2);
        var s = document.createElement('script');
        var t = setTimeout(function () { finish(null); }, 7000);
        function finish(v) { clearTimeout(t); try { delete window[cb]; } catch (e) { window[cb] = undefined; } s.remove(); resolve(v); }
        window[cb] = function (res) {
          finish(res && res.status !== 'error' && res.table ? (res.table.rows || []).map(function (r) {
            return (r.c || []).map(function (c) { return c == null ? '' : String(c.f != null ? c.f : c.v != null ? c.v : ''); });
          }) : null);
        };
        s.onerror = function () { finish(null); };
        s.src = 'https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tqx=out:json;responseHandler:' + cb + '&headers=0' + (gid ? '&gid=' + gid : '') + (user ? '&authuser=' + user : '');
        document.head.appendChild(s);
      });
    }
    // Each Google account signed in to this browser, in turn.
    return once(0).then(function (r) { return r || once(1); }).then(function (r) { return r || once(2); });
  }
  $('rbEdFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      $('rbEdText').value = String(reader.result || '');
      if (!$('rbEdName').value) $('rbEdName').value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120);
      preview();
    };
    reader.readAsText(f);
    this.value = '';
  });
  $('rbQsetNew').addEventListener('click', function () { openEditor(''); });
  $('rbQsetEdit').addEventListener('click', function () { if ($('rbQset').value) openEditor($('rbQset').value); });
  $('rbEdCancel').addEventListener('click', function () { $('rbEditor').hidden = true; });
  $('rbEdSave').addEventListener('click', function () {
    var r = preview();
    var title = $('rbEdName').value.trim();
    $('rbEdError').textContent = '';
    if (!title) { $('rbEdError').textContent = 'Give the set a name.'; $('rbEdName').focus(); return; }
    if (!r.questions.length) { $('rbEdError').textContent = 'Paste at least one question with its right answer and a wrong answer.'; return; }
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Saving...';
    call(editing ? 'qsets/' + editing : 'qsets', editing ? 'PUT' : 'POST', { title: title, questions: r.questions }).then(function (s) {
      $('rbEditor').hidden = true;
      document.querySelector('input[name="rbSource"][value="qset"]').checked = true;
      syncSource();
      toast('Saved "' + s.title + '" with ' + s.count + (s.count === 1 ? ' question.' : ' questions.'));
      return loadQsets(s.id);
    }, function (err) { $('rbEdError').textContent = err.message; }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Save set';
    });
  });
  $('rbQsetDelete').addEventListener('click', function () {
    var id = $('rbQset').value;
    var set = qsets.filter(function (s) { return s.id === id; })[0];
    if (!set) return;
    var btn = this;
    if (!btn.classList.contains('sure')) {
      btn.classList.add('sure');
      btn.textContent = 'Click again to delete';
      setTimeout(function () { btn.classList.remove('sure'); btn.textContent = 'Delete'; }, 3000);
      return;
    }
    btn.classList.remove('sure');
    btn.textContent = 'Delete';
    call('qsets/' + id, 'DELETE').then(function () { toast('Deleted "' + set.title + '".'); loadQsets(''); }, function (err) { toast(err.message); });
  });

  /* ---------------- starting a game ---------------- */

  function opts() {
    return {
      energy: Number($('rbEnergy').value),
      seconds: Number($('rbSeconds').value),
      limit: Number($('rbClock').value),
      pass: $('rbPass').checked,
      comeback: $('rbComeback').checked,
      shield: $('rbShield').checked,
      demo: $('rbDemo').checked
    };
  }
  $('rbCreate').addEventListener('click', function () {
    var q = source() === 'qset';
    var body = { kind: 'royale', opts: opts() };
    if (q) body.qsetId = $('rbQset').value; else body.setId = $('rbFlash').value;
    $('rbSetupError').textContent = '';
    if (q && !body.qsetId) { $('rbSetupError').textContent = 'Make a question set first (New set), or pick a flashcard set.'; return; }
    if (!q && !body.setId) { $('rbSetupError').textContent = 'Pick a flashcard set.'; return; }
    keep(function (s) {
      if ($('rbSaveDefault').checked) {
        s.defaults = { rbEnergy: $('rbEnergy').value, rbSeconds: $('rbSeconds').value, rbClock: $('rbClock').value, rbPass: $('rbPass').checked, rbComeback: $('rbComeback').checked, rbShield: $('rbShield').checked, source: source(), qset: $('rbQset').value, flash: $('rbFlash').value };
      } else delete s.defaults;
    });
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Making the game...';
    call('live/create', 'POST', body).then(function (r) {
      game = { code: r.code, key: r.hostKey };
      keep(function (s) { s.host = { code: r.code, key: r.hostKey, at: Date.now() }; });
      $('rbResume').hidden = true;
      connect();
    }, function (err) { $('rbSetupError').textContent = err.message; }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Create game';
    });
  });
  $('rbResumeBtn').addEventListener('click', function () {
    var h = readSaved().host;
    if (!h) return;
    game = { code: h.code, key: h.key };
    $('rbResume').hidden = true;
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
        $('rbResume').hidden = true;
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

  /* ---------------- the board ---------------- */

  function draw(b) {
    var was = board;
    board = b;
    heard(b.now);
    [].forEach.call(document.querySelectorAll('.rb-mini-code'), function (n) { n.textContent = b.code; });
    [].forEach.call(document.querySelectorAll('.rb-join-url'), function (n) { n.textContent = location.host + '/join'; });
    if (b.phase === 'lobby') { show('rbLobby'); drawLobby(b); }
    else if (b.phase === 'play') { show('rbPlay'); drawPlay(b, was); }
    else if (b.phase === 'done') { show('rbDone'); drawDone(b, was); }
    musicFor(b.phase);
    if (rosterOpen) drawRoster(b);
  }

  function joinLink(code) { return location.origin + '/join/#' + code; }
  var seen = {};

  function drawLobby(b) {
    $('rbCode').textContent = b.code;
    if (qrFor !== b.code && window.qrcode) {
      try {
        var qr = window.qrcode(0, 'M');
        qr.addData(joinLink(b.code));
        qr.make();
        $('rbQr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
        qrFor = b.code;
      } catch (e) { /* no QR code: the code is enough */ }
    }
    var n = b.players.length;
    var passed = b.players.filter(function (p) { return p.pass; }).length;
    var picking = b.players.filter(function (p) { return !p.hero; }).length;
    $('rbCount').textContent = n ? n + (n === 1 ? ' student has joined.' : ' students have joined.') + (passed && passed < n ? ' ' + passed + ' signed in with Class Pass.' : '') +
      (picking ? ' ' + picking + ' still picking a hero.' : '') : 'Waiting for students to join...';
    $('rbStart').disabled = n < 2;
    $('rbStart').title = n < 2 ? 'Battle Royale needs at least 2 players.' : '';
    drawLobbyOpts(b);
    var list = $('rbPlayers');
    list.textContent = '';
    b.players.forEach(function (p) {
      // Only a student who just joined pops in.
      var li = mk('li', 'rb-player' + (p.on || p.bot ? '' : ' gone') + (seen[p.id] ? '' : ' new'));
      seen[p.id] = true;
      li.appendChild(heroImg(p.hero));
      li.appendChild(mk('span', 'rb-player-name', p.name));
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
    var box = $('rbLobbyOpts');
    var key = JSON.stringify([b.opts.energy, b.opts.seconds, b.opts.limit, b.opts.pass, b.opts.comeback, b.opts.shield]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.textContent = '';
    function row(label, values, now, change) {
      var l = mk('label', 'rb-lo');
      l.appendChild(mk('span', '', label));
      var sel = mk('select');
      values.forEach(function (v) { var o = mk('option', '', v[1]); o.value = String(v[0]); sel.appendChild(o); });
      sel.value = String(now);
      sel.addEventListener('change', function () { change(sel.value); });
      l.appendChild(sel);
      box.appendChild(l);
    }
    row('Starting energy', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return [n, n + ' ⚡']; }), b.opts.energy, function (v) { send({ t: 'settings', opts: { energy: Number(v) } }); });
    row('Time per question', [[10, '10 seconds'], [15, '15 seconds'], [20, '20 seconds'], [30, '30 seconds'], [45, '45 seconds'], [60, '1 minute']], b.opts.seconds, function (v) { send({ t: 'settings', opts: { seconds: Number(v) } }); });
    row('Game clock', CLOCKS, b.opts.limit, function (v) { send({ t: 'clock', minutes: Number(v) }); });
    [['pass', 'Class Pass needed'], ['comeback', 'Comebacks'], ['shield', 'Shield streaks']].forEach(function (x) {
      var l = mk('label', 'rb-lo fc-switch');
      l.appendChild(mk('span', '', x[1]));
      var cb = mk('input');
      cb.type = 'checkbox';
      cb.checked = !!b.opts[x[0]];
      cb.addEventListener('change', function () { var o = {}; o[x[0]] = cb.checked; send({ t: 'settings', opts: o }); });
      l.appendChild(cb);
      box.appendChild(l);
    });
  }
  var CLOCKS = [[0, 'No clock'], [1, '1 minute'], [2, '2 minutes'], [3, '3 minutes'], [4, '4 minutes'], [5, '5 minutes'], [7, '7 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes']];

  $('rbStart').addEventListener('click', function () { send({ t: 'start' }); });
  $('rbCopy').addEventListener('click', function () {
    if (!board) return;
    var link = joinLink(board.code);
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Copied the join link.'); }, function () { toast(link); });
  });

  /* ---------------- the game ---------------- */

  var tickTimer = null;
  function drawPlay(b, was) {
    var r = b.round || {};
    var alive = b.players.filter(function (p) { return !p.out; }).length;
    $('rbRound').textContent = r.n ? 'Round ' + r.n : 'Battle Royale';
    $('rbLeft').textContent = alive + ' of ' + b.players.length + ' heroes left';
    $('rbPause').textContent = b.paused ? 'Resume' : 'Pause';
    $('rbPause').classList.toggle('on', !!b.paused);
    drawClockSet(b);
    var banner = $('rbBanner');
    var say = b.paused ? 'Paused. Press Resume to go on.'
      : b.timeUp ? 'Time is up! This is the last round.'
        : r.sudden && r.stage === 'results' ? 'Sudden death! Everyone left missed it, so nobody is out this round.' : '';
    banner.hidden = !say;
    banner.textContent = say;
    banner.classList.toggle('rb-banner-time', !!b.timeUp && !b.paused);
    var key = [r.n, r.stage, b.paused].join('|');
    var stage = $('rbStage');
    if (stage.dataset.key !== key) {
      stage.dataset.key = key;
      stage.textContent = '';
      stage.className = 'rb-stage rb-stage-' + (r.stage || 'none');
      if (r.stage === 'vs') drawVs(stage, b, r);
      else if (r.stage === 'question') drawQuestion(stage, b, r);
      else if (r.stage === 'results') drawResults(stage, b, r);
    }
    // The count of answers changes without a new stage.
    var got = $('rbGot');
    if (got) got.textContent = r.answered + ' of ' + r.of + ' answered';
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 200);
    tick();
  }

  // The clocks: the game clock in the top bar, and the countdown on the stage.
  function tick() {
    var b = board;
    if (!b || b.phase !== 'play') { clearInterval(tickTimer); return; }
    var now = Date.now();
    var left = b.paused ? b.pausedLeft : b.endsAt ? Math.max(0, local(b.endsAt) - now) : 0;
    var clock = $('rbClock2');
    var on = !!b.endsAt || (b.paused && b.pausedLeft > 0);
    $('rbMinus').hidden = $('rbPlus').hidden = !on;
    clock.hidden = !on && !b.timeUp;
    if (on) {
      var s = Math.ceil(left / 1000);
      clock.textContent = b.timeUp ? '0:00' : Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
      clock.classList.toggle('low', s <= 30 && !b.paused);
    }
    var r = b.round || {};
    var cd = $('rbCountdown');
    if (!cd || b.paused) return;
    var to = r.stage === 'vs' ? r.qAt : r.stage === 'question' ? r.endsAt : r.stage === 'results' ? r.nextAt : 0;
    var n = Math.max(0, Math.ceil((local(to) - now) / 1000));
    cd.textContent = String(n);
    var bar = $('rbTimeBar');
    if (bar && r.stage === 'question') bar.style.width = Math.max(0, Math.min(100, (local(r.endsAt) - now) / (r.seconds * 10))) + '%';
  }

  function drawClockSet(b) {
    var sel = $('rbClockSet');
    var key = (b.endsAt || b.pausedLeft) ? 'on' : 'off';
    if (sel.dataset.key === key) return;
    sel.dataset.key = key;
    sel.textContent = '';
    var first = mk('option', '', key === 'on' ? 'Change the clock' : '⏱ Add a clock');
    first.value = '';
    sel.appendChild(first);
    CLOCKS.forEach(function (c) {
      if (c[0] === 0 && key === 'off') return;
      var o = mk('option', '', c[0] ? c[1] + ' from now' : 'Take the clock away');
      o.value = String(c[0]);
      sel.appendChild(o);
    });
  }
  $('rbClockSet').addEventListener('change', function () {
    if (this.value === '') return;
    send({ t: 'clock', minutes: Number(this.value) });
    this.value = '';
  });
  $('rbMinus').addEventListener('click', function () { send({ t: 'time', seconds: -60 }); });
  $('rbPlus').addEventListener('click', function () { send({ t: 'time', seconds: 60 }); });
  $('rbPause').addEventListener('click', function () { if (board) send({ t: board.paused ? 'resume' : 'pause' }); });
  $('rbSkip').addEventListener('click', function () { send({ t: 'skip' }); });
  twice($('rbEnd'), 'End game', 'Click again to end', function () { send({ t: 'end' }); });

  function twice(btn, label, ask, go) {
    btn.addEventListener('click', function () {
      if (btn.classList.contains('sure')) { btn.classList.remove('sure'); btn.textContent = label; go(); return; }
      btn.classList.add('sure');
      btn.textContent = ask;
      setTimeout(function () { btn.classList.remove('sure'); btn.textContent = label; }, 3000);
    });
  }

  function person(p, extra) {
    var box = mk('div', 'rb-fighter' + (extra ? ' ' + extra : ''));
    if (!p) { box.appendChild(mk('span', 'rb-fighter-name', 'Left the game')); return box; }
    box.appendChild(heroImg(p.hero));
    var t = mk('div', 'rb-fighter-text');
    t.appendChild(mk('span', 'rb-fighter-name', p.name));
    var e = mk('span', 'rp-energy-line');
    e.appendChild(bolts(p.energy, board.opts.energy));
    if (p.shield) { var s = mk('span', 'rb-shield', '🛡️'); s.title = 'Shield: blocks the next lost energy'; e.appendChild(s); }
    t.appendChild(e);
    box.appendChild(t);
    return box;
  }
  // The badge under a player in the match results.
  function badge(f, r, id, lost) {
    if (r.out.some(function (o) { return o.id === id; })) f.appendChild(mk('span', 'rb-ko', 'OUT'));
    else if (r.blocked.indexOf(id) >= 0) f.appendChild(mk('span', 'rb-blocked', '🛡️ blocked'));
    else if (lost) f.appendChild(mk('span', 'rb-minus', '−1 ⚡'));
    else if (r.earned.indexOf(id) >= 0) f.appendChild(mk('span', 'rb-earned', '+ 🛡️'));
  }

  function drawVs(stage, b, r) {
    var head = mk('div', 'rb-vs-head');
    head.appendChild(mk('span', 'rb-vs-title', 'Round ' + r.n + ' starts in'));
    var cd = mk('span', 'rb-countdown');
    cd.id = 'rbCountdown';
    head.appendChild(cd);
    stage.appendChild(head);
    var grid = mk('div', 'rb-matchups' + (r.match.length > 10 ? ' many' : ''));
    r.match.forEach(function (x) {
      var card = mk('div', 'rb-matchup');
      card.appendChild(person(x.a));
      card.appendChild(mk('span', 'rb-vs-word', 'VS'));
      card.appendChild(person(x.b, 'right'));
      grid.appendChild(card);
    });
    if (r.sat) {
      var sat = mk('div', 'rb-matchup rb-sat');
      sat.appendChild(person(r.sat));
      sat.appendChild(mk('span', 'rb-sat-note', 'No opponent this round: answer right to stay safe'));
      grid.appendChild(sat);
    }
    stage.appendChild(grid);
  }

  function answerTiles(r, settled) {
    var box = mk('div', 'rb-tiles');
    var most = settled && r.counts ? Math.max.apply(null, r.counts.concat([1])) : 1;
    r.q.opts.forEach(function (o, i) {
      var tile = mk('div', 'rb-tile' + (settled ? (i === r.c ? ' right' : ' wrong') : ''));
      tile.style.setProperty('--tile', COLORS[i % 4]);
      tile.appendChild(mk('span', 'rb-tile-text', o));
      if (settled && r.counts) {
        var n = mk('span', 'rb-tile-count', (i === r.c ? '✔ ' : '') + r.counts[i]);
        tile.appendChild(n);
        var fill = mk('span', 'rb-tile-fill');
        fill.style.width = Math.round(100 * r.counts[i] / most) + '%';
        tile.appendChild(fill);
      }
      box.appendChild(tile);
    });
    return box;
  }

  function drawQuestion(stage, b, r) {
    var top = mk('div', 'rb-q-top');
    var qbox = mk('div', 'rb-q');
    qbox.appendChild(mk('p', 'rb-q-text', r.q.text));
    if (r.q.img) { var img = mk('img', 'rb-q-img'); img.alt = ''; img.src = r.q.img; qbox.appendChild(img); }
    top.appendChild(qbox);
    var side = mk('div', 'rb-q-side');
    var cd = mk('span', 'rb-countdown rb-countdown-q');
    cd.id = 'rbCountdown';
    side.appendChild(cd);
    var got = mk('span', 'rb-got');
    got.id = 'rbGot';
    side.appendChild(got);
    top.appendChild(side);
    stage.appendChild(top);
    var bar = mk('div', 'rb-timebar');
    var fill = mk('span');
    fill.id = 'rbTimeBar';
    bar.appendChild(fill);
    stage.appendChild(bar);
    stage.appendChild(answerTiles(r, false));
  }

  function drawResults(stage, b, r) {
    var top = mk('div', 'rb-res-top');
    var qbox = mk('div', 'rb-q rb-q-small');
    qbox.appendChild(mk('p', 'rb-q-text', r.q.text));
    top.appendChild(qbox);
    top.appendChild(answerTiles(r, true));
    stage.appendChild(top);
    var head = mk('div', 'rb-vs-head');
    head.appendChild(mk('span', 'rb-vs-title', r.last ? 'Final match results' : 'Match results'));
    var cd = mk('span', 'rb-countdown rb-countdown-small');
    cd.id = 'rbCountdown';
    head.appendChild(cd);
    stage.appendChild(head);
    // Students who were out and got 3 practice questions right in a row.
    if (r.back.length) {
      var back = mk('div', 'rb-back-list');
      back.appendChild(mk('strong', '', 'Comeback! Back in next round:'));
      r.back.forEach(function (p) {
        var chip = mk('span', 'rb-back-chip');
        chip.appendChild(heroImg(p.hero));
        chip.appendChild(document.createTextNode(p.name));
        back.appendChild(chip);
      });
      stage.appendChild(back);
    }
    var grid = mk('div', 'rb-matchups rb-results' + (r.match.length > 10 ? ' many' : ''));
    r.match.forEach(function (x) {
      var card = mk('div', 'rb-matchup');
      [x.a, x.b].forEach(function (p, i) {
        if (i === 1) card.appendChild(mk('span', 'rb-vs-word', 'VS'));
        var won = p && x.win === p.id;
        var lost = p && x.lost.indexOf(p.id) >= 0;
        var f = person(p, (i ? 'right ' : '') + (won ? 'won' : lost ? 'lost' : ''));
        if (p) {
          var how = mk('span', 'rb-how', x.ok[p.id] ? '✔ ' + secs(x.ms[p.id]) : x.ms[p.id] ? '✖ wrong' : '✖ no answer');
          f.querySelector('.rb-fighter-text').appendChild(how);
          badge(f, r, p.id, lost);
        }
        card.appendChild(f);
      });
      grid.appendChild(card);
    });
    if (r.sat) {
      var sat = mk('div', 'rb-matchup rb-sat');
      var f = person(r.sat, r.satOk ? 'won' : 'lost');
      badge(f, r, r.sat.id, !r.satOk);
      sat.appendChild(f);
      sat.appendChild(mk('span', 'rb-sat-note', r.satOk ? 'Answered alone: safe' : 'Answered alone: missed it'));
      grid.appendChild(sat);
    }
    stage.appendChild(grid);
  }

  /* ---------------- the players list during a game ---------------- */

  var rosterOpen = false;
  function openRoster(yes) {
    rosterOpen = yes;
    $('rbRoster').hidden = $('rbRosterBack').hidden = !yes;
    $('rbRosterBtn').setAttribute('aria-expanded', String(yes));
    if (yes && board) drawRoster(board);
  }
  $('rbRosterBtn').addEventListener('click', function () { openRoster(!rosterOpen); });
  $('rbRosterClose').addEventListener('click', function () { openRoster(false); });
  $('rbRosterBack').addEventListener('click', function () { openRoster(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && rosterOpen) openRoster(false); });
  function drawRoster(b) {
    var body = $('rbRosterBody');
    var key = JSON.stringify([b.players.map(function (p) { return [p.id, p.energy, p.out, p.on]; }), b.blocked]);
    if (body.dataset.key === key) return;
    body.dataset.key = key;
    body.textContent = '';
    var list = mk('ul', 'rb-roster-list');
    b.players.slice().sort(function (x, y) { return (x.out ? 1 : 0) - (y.out ? 1 : 0) || y.energy - x.energy; }).forEach(function (p) {
      var li = mk('li', 'rb-roster-row' + (p.out ? ' out' : ''));
      li.appendChild(heroImg(p.hero));
      li.appendChild(mk('span', 'rb-player-name', p.name + (p.on || p.bot ? '' : ' (away)')));
      li.appendChild(p.out ? mk('span', 'rb-out-tag', 'out') : bolts(p.energy, b.opts.energy));
      var x = mk('button', 'btn secondary fc-small', 'Remove');
      x.type = 'button';
      twice(x, 'Remove', 'Sure?', function () { send({ t: 'kick', id: p.id }); });
      var blk = mk('button', 'btn secondary fc-small rb-danger', 'Remove and block');
      blk.type = 'button';
      twice(blk, 'Remove and block', 'Sure?', function () { send({ t: 'kick', id: p.id, block: true }); });
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

  /* ---------------- the winners ---------------- */

  function drawDone(b, was) {
    clearInterval(tickTimer);
    var ranked = b.players.slice().sort(function (x, y) { return (x.place || 999) - (y.place || 999); });
    var pod = $('rbPodium');
    pod.textContent = '';
    // Second, first, third, like a real podium.
    [ranked[1], ranked[0], ranked[2]].forEach(function (p) {
      if (!p) return;
      var li = mk('li', 'rb-step rb-step-' + p.place);
      li.appendChild(heroImg(p.hero, 'big'));
      li.appendChild(mk('span', 'rb-step-name', p.name));
      li.appendChild(mk('span', 'rb-step-wins', p.wins + (p.wins === 1 ? ' win' : ' wins')));
      li.appendChild(mk('span', 'rb-step-place', ordinal(p.place)));
      pod.appendChild(li);
    });
    var list = $('rbFinal');
    list.textContent = '';
    ranked.forEach(function (p) {
      var li = mk('li', 'rb-final-row');
      li.appendChild(mk('span', 'rb-final-place', ordinal(p.place)));
      li.appendChild(heroImg(p.hero));
      li.appendChild(mk('span', 'rb-player-name', p.name));
      li.appendChild(mk('span', 'rb-final-stat', (p.out ? 'Out in round ' + p.out : p.energy + ' ⚡ left') + ', ' +
        p.wins + (p.wins === 1 ? ' win, ' : ' wins, ') + p.right + ' right'));
      list.appendChild(li);
    });
    var missed = $('rbMissed');
    missed.textContent = '';
    $('rbMissedBox').hidden = !b.missed.length;
    b.missed.forEach(function (x) {
      var li = mk('li');
      li.appendChild(mk('span', 'rb-missed-q', x.q));
      li.appendChild(mk('span', 'rb-missed-a', 'Answer: ' + x.a));
      li.appendChild(mk('span', 'rb-missed-n', x.w + ' of ' + (x.r + x.w) + ' missed it'));
      missed.appendChild(li);
    });
    if (was && was.phase === 'play') celebrate();
  }
  $('rbAgain').addEventListener('click', function () { send({ t: 'again' }); });

  // Download results (Donny, 2026-10-29): one row per student, one column per
  // question that came up, for Google Sheets or Excel. Pretend students are
  // left out. A question asked more than once shows each answer in turn.
  $('rbDownload').addEventListener('click', function () {
    var res = board && board.results;
    if (!res) return;
    var word = { R: 'right', W: 'wrong', N: 'no answer' };
    var csv = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = res.rows.filter(function (p) { return !p.bot; });
    // A demo game with only pretend students: show them, so the file can be tried.
    if (!rows.length) rows = res.rows;
    var head = ['Place', 'Student', 'Email', 'Energy left', 'Out in round', 'Matches won', 'Right', 'Wrong or no answer', 'Percent right', 'Average right answer (seconds)', 'Comeback in round']
      .concat(res.questions.map(function (q, i) { return 'Q' + (i + 1) + ': ' + q.q + ' (answer: ' + q.a + ')'; }));
    var lines = [head];
    rows.forEach(function (p) {
      // Every answer counts here, practice ones after being out too.
      var marks = p.qa.join('');
      var right = (marks.match(/R/g) || []).length, all = marks.length;
      lines.push([p.place, p.name, p.email, p.energy, p.out || '', p.wins, right, all - right, all ? Math.round(100 * right / all) + '%' : '',
        p.avg ? (p.avg / 1000).toFixed(2) : '', p.back || ''].concat(p.qa.map(function (s) { return s.split('').map(function (c) { return word[c] || c; }).join(', '); })));
    });
    // The class, question by question: who got it right.
    var pct = ['', 'Class percent right', '', '', '', '', '', '', '', '', ''].concat(res.questions.map(function (q, i) {
      var r = 0, n = 0;
      rows.forEach(function (p) { (p.qa[i] || '').split('').forEach(function (c) { n += 1; if (c === 'R') r += 1; }); });
      return n ? Math.round(100 * r / n) + '%' : '';
    }));
    lines.push([]);
    lines.push(pct);
    var text = '﻿' + lines.map(function (l) { return l.map(csv).join(','); }).join('\r\n');
    var day = new Date(res.at || Date.now());
    var stamp = day.getFullYear() + '-' + ('0' + (day.getMonth() + 1)).slice(-2) + '-' + ('0' + day.getDate()).slice(-2);
    var a = mk('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = ('Battle Royale ' + res.title + ' ' + stamp).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('rbNew').addEventListener('click', function () {
    send({ t: 'close' });
    leaving = true;
    retire();
    keep(function (s) { delete s.host; });
    game = null;
    qrFor = '';
    setup();
    $('rbResume').hidden = true;
  });

  /* ---------------- music (this screen only) ---------------- */

  var SONGS = {
    lobby: [['competition-briefing', 'Competition Briefing'], ['cartoon-lobby-music-3', 'Cartoon Lobby Music 3'], ['cartoon-lobby-music-10', 'Cartoon Lobby Music 10'],
      ['video-game-music', 'Video Game Music'], ['elevator-music', 'Elevator Music'], ['lounge-jazz', 'Lounge Jazz'], ['waiting-room-calm', 'Waiting Room (Calm)']],
    game: [['game-heroic-battle-orchestra', 'Heroic Battle Orchestra'], ['game-quiz-master', 'Quiz Master'], ['game-pixel-chiptune', 'Pixel Chiptune'],
      ['game-retro-game-arcade', 'Retro Game Arcade'], ['game-arcadia', 'Arcadia'], ['game-rise-above', 'Rise Above'], ['game-airland-jazz', 'Airland Jazz']]
  };
  var saved0 = readSaved();
  var music = { lobby: saved0.lobbyMusic || '', game: saved0.gameMusic || '', volume: typeof saved0.volume === 'number' ? saved0.volume : 60, muted: !!saved0.muted, part: '', player: null };
  [['lobby', 'rbLobbyMusic'], ['game', 'rbGameMusic']].forEach(function (x) {
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
  $('rbVolume').value = music.volume;
  function musicFor(phase) {
    var part = phase === 'lobby' ? 'lobby' : phase === 'play' ? 'game' : '';
    $('rbMusic').hidden = !part || !music[part];
    $('rbMusicLabel').textContent = part === 'game' ? 'Game music' : 'Lobby music';
    $('rbMute').textContent = music.muted ? 'Unmute' : 'Mute';
    $('rbMute').setAttribute('aria-pressed', String(music.muted));
    if (!part || !music[part] || music.muted) { if (music.player) music.player.pause(); music.part = part; return; }
    if (!music.player) { music.player = new Audio(); music.player.loop = true; }
    var src = '../assets/music/' + music[part] + '.mp3';
    if (music.player.getAttribute('src') !== src) music.player.setAttribute('src', src);
    music.player.volume = music.volume / 100;
    music.part = part;
    if (music.player.paused) {
      var go = music.player.play();
      if (go && go.catch) go.catch(function () { /* the browser wants a click first */ });
    }
  }
  $('rbMute').addEventListener('click', function () {
    music.muted = !music.muted;
    keep(function (s) { s.muted = music.muted; });
    musicFor(board ? board.phase : '');
  });
  $('rbVolume').addEventListener('input', function () {
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
    document.body.classList.toggle('rb-full', !!document.fullscreenElement);
    fsButtons.forEach(function (btn) { btn.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
  });
  [].forEach.call(document.querySelectorAll('[data-close]'), function (btn) {
    twice(btn, 'End game', 'Click again to end', function () {
      if (ws && ws.readyState === 1) send({ t: 'close' });
      else { keep(function (s) { delete s.host; }); location.reload(); }
    });
  });

  gate();
})();
