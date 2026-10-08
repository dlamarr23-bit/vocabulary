/* ============================================================
   Study modes for a flashcard set: Learn, Test and Match.

   The flashcard page sets up window.IS8Flash before this file runs:
     cards()     the cards to study, [{ term, def, img, alt, hint }]
     title       the set's title
     speak(t)    reads t aloud; only offered when canSpeak is true
     pref(k, v)  a saved value for this set in this browser
     goMode(m)   switches the page to 'flashcards', 'learn', 'test' or 'match'

   Each mode registers itself on window.IS8Modes with start(panel, api) and
   stop(). The page calls start every time a student opens that mode's tab
   and stop when the student leaves it. Everything is drawn with
   createElement and textContent, so a card's words are never read as HTML.
   ============================================================ */
(function () {
  'use strict';

  var Modes = window.IS8Modes = window.IS8Modes || {};

  /* ---------------- shared helpers ---------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function button(label, cls, run) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }

  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return prefix + '-' + seq;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pickOne(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // Class Pass (assets/pass.js): a finished Match, test or Learn set goes on
  // the class leaderboard for a signed in student. A line under the result
  // says so, or offers the sign-in.
  function passReport(api, result, box) {
    var P = window.IS8Pass;
    if (!P || !api || !api.setId) return;
    result.setId = api.setId;
    var line = el('p', 'md-note md-pass');
    if (box) box.appendChild(line);
    if (!P.me()) {
      line.appendChild(document.createTextNode('Sign in with Class Pass (at the top of the page) to put results like this on the class leaderboard.'));
      return;
    }
    P.report(result).then(function (r) {
      line.textContent = r && r.counted ? 'Saved to the class leaderboard (' + P.me().name + ').' : '';
    });
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function focusQuietly(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }

  // Bring a mode back into view when its top has scrolled up under the
  // top bar, for example after a long test is submitted.
  function bringIntoView(node) {
    if (!node || !node.getBoundingClientRect) return;
    var top = node.getBoundingClientRect().top;
    if (top < 70) node.scrollIntoView({ block: 'start' });
  }

  var typing = function (t) {
    return !!t && (/^(?:INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  };
  var pressable = function (t) {
    return !!t && (/^(?:BUTTON|A|SUMMARY)$/.test(t.tagName) || (t.getAttribute && t.getAttribute('role') === 'button'));
  };
  var inDrawer = function (t) {
    return !!(t && t.closest && t.closest('.drawer'));
  };

  // The cards a mode can use: each needs a term and a definition.
  function readCards(api) {
    var raw = [];
    try { raw = api.cards() || []; } catch (e) { raw = []; }
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var c = raw[i] || {};
      var term = String(c.term == null ? '' : c.term).trim();
      var def = String(c.def == null ? '' : c.def).trim();
      if (!term || !def) continue;
      var img = typeof c.img === 'string' ? c.img : '';
      out.push({
        term: term,
        def: def,
        img: img,
        alt: img ? String(c.alt || '') : '',
        hint: String(c.hint || '').trim(),
        key: term
      });
    }
    return out;
  }

  function signature(cards) {
    return JSON.stringify(cards.map(function (c) { return [c.term, c.def, c.img, c.hint]; }));
  }

  function readPref(api, key) {
    try { return api.pref(key); } catch (e) { return undefined; }
  }

  function writePref(api, key, value) {
    try { api.pref(key, value); } catch (e) { /* saving is a bonus, never a need */ }
  }

  /* ---------------- checking a typed answer ----------------
     Lenient, like Quizlet: capital letters, curly quotes, punctuation, extra
     spaces and a leading "the", "a" or "an" never matter. A small slip in
     spelling still counts, with a note that shows the right spelling. */

  var PUNCTUATION = /[!-\/:-@\[-`{-~\u00a1-\u00bf\u2010-\u2027\u2030-\u205e]/g;

  function tidyAnswer(text) {
    var s = String(text == null ? '' : text).toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"');
    s = s.replace(PUNCTUATION, '').replace(/\s+/g, ' ').trim();
    return s.replace(/^(?:the|a|an) /, '');
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  // 'exact', 'close' (right, with a spelling slip) or 'wrong'.
  function checkTyped(answer, term, allTerms) {
    var a = tidyAnswer(answer), t = tidyAnswer(term);
    if (!a) return 'wrong';
    if (a === t || a.replace(/ /g, '') === t.replace(/ /g, '')) return 'exact';
    // Typing a different term from the set is never a spelling slip.
    for (var i = 0; i < allTerms.length; i++) {
      var other = tidyAnswer(allTerms[i]);
      if (other !== t && other === a) return 'wrong';
    }
    return editDistance(a, t) <= Math.max(1, Math.floor(0.15 * t.length)) ? 'close' : 'wrong';
  }

  /* ---------------- pieces every mode uses ---------------- */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function speakerIcon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    ['M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z', 'M15.5 9a4 4 0 0 1 0 6', 'M18.5 6.5a7.5 7.5 0 0 1 0 11'].forEach(function (d) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function speakButton(api, text, what) {
    if (!api || !api.canSpeak) return null;
    var b = el('button', 'md-speak');
    b.type = 'button';
    b.setAttribute('aria-label', 'Read the ' + what + ' aloud');
    b.title = 'Read aloud';
    b.appendChild(speakerIcon());
    b.addEventListener('click', function () {
      try { api.speak(text); } catch (e) { /* nothing to read with */ }
    });
    return b;
  }

  function picture(card, cls) {
    if (!card.img) return null;
    var im = el('img', cls);
    im.src = card.img;
    im.alt = card.alt || '';
    im.addEventListener('error', function () { im.hidden = true; });
    return im;
  }

  function sizeClass(text) {
    return text.length > 150 ? ' long' : text.length > 60 ? ' mid' : '';
  }

  // The words a student answers, with the card's picture beside them.
  function promptBlock(text, card, withImg, id) {
    var wrap = el('div', 'md-prompt');
    var p = el('p', 'md-prompt-text' + sizeClass(text), text);
    if (id) p.id = id;
    wrap.appendChild(p);
    var im = withImg ? picture(card, 'md-prompt-img') : null;
    if (im) {
      wrap.appendChild(im);
      wrap.className += ' has-img';
    }
    return wrap;
  }

  function tooFew(root, api, what) {
    var box = el('div', 'md-card md-empty');
    box.appendChild(el('p', 'md-empty-text', 'Add at least 2 cards to ' + what + '.'));
    var row = el('div', 'md-actions');
    row.appendChild(button('Back to flashcards', 'btn secondary', function () { api.goMode('flashcards'); }));
    box.appendChild(row);
    root.appendChild(box);
  }

  function fieldset(legend) {
    var fs = el('fieldset', 'md-fieldset');
    fs.appendChild(el('legend', 'md-legend', legend));
    return fs;
  }

  function choiceRow(type, name, text, sub, checked, onChange) {
    var lab = el('label', 'md-check');
    var input = el('input');
    input.type = type;
    if (name) input.name = name;
    input.checked = checked;
    input.addEventListener('change', function () { onChange(input.checked); });
    lab.appendChild(input);
    var words = el('span', 'md-check-text', text);
    if (sub) words.appendChild(el('small', '', sub));
    lab.appendChild(words);
    return { label: lab, input: input };
  }

  // The right card plus up to n - 1 others whose answers read differently.
  function pickChoices(card, cards, dir, n) {
    var answerOf = function (c) { return dir === 'def' ? c.def : c.term; };
    var seen = Object.create(null);
    seen[tidyAnswer(answerOf(card))] = true;
    var out = [card];
    var pool = shuffle(cards);
    for (var i = 0; i < pool.length && out.length < n; i++) {
      var k = tidyAnswer(answerOf(pool[i]));
      if (seen[k]) continue;
      seen[k] = true;
      out.push(pool[i]);
    }
    return shuffle(out);
  }

  /* ================================================================
     Learn: practice in rounds that adapt to the student.

     Every term is new (0), learning (1) or mastered (2). A right answer
     moves a term up one level: multiple choice while it is new, typing the
     term once it is learning. A wrong answer sends it back to new, and it
     comes back later in the same round.
     ================================================================ */

  var ROUND_SIZE = 7;
  var LEVEL_NAMES = ['New', 'Learning', 'Mastered'];
  var PRAISE = ['Correct!', 'Nice work!', 'You got it!', 'Great job!'];

  var learn = { active: false, api: null, root: null, stage: null, s: null, ui: null, opt: null, timer: null };

  function learnOptions(api) {
    var o = readPref(api, 'learnOptions');
    if (!o || typeof o !== 'object') o = {};
    var opts = { mc: o.mc !== false, written: o.written !== false, answerWith: o.answerWith === 'def' ? 'def' : 'term' };
    if (!opts.mc && !opts.written) opts.mc = opts.written = true;
    return opts;
  }

  function learnSession(cards, sig, api) {
    var saved = readPref(api, 'learnLevels');
    if (!saved || typeof saved !== 'object') saved = {};
    var levels = Object.create(null);
    cards.forEach(function (c) {
      var v = has(saved, c.key) ? saved[c.key] : 0;
      levels[c.key] = v === 1 || v === 2 ? v : 0;
    });
    return {
      sig: sig,
      cards: shuffle(cards),
      levels: levels,
      opts: learnOptions(api),
      round: 0,
      queue: [],
      roundCards: [],
      q: null,
      screen: 'question'
    };
  }

  // Written questions ask for the term, so they only come with "Answer with: Term".
  function writtenOn(o) { return o.written && o.answerWith === 'term'; }
  function choiceOn(o) { return o.mc || !writtenOn(o); }

  function levelCounts() {
    var s = learn.s, n = [0, 0, 0];
    s.cards.forEach(function (c) { n[s.levels[c.key]] += 1; });
    return n;
  }

  // Levels for terms outside the cards being studied (for example when only
  // starred cards are on) are kept, so they are there again later.
  function saveLevels() {
    var s = learn.s, saved = readPref(learn.api, 'learnLevels'), out = {};
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      Object.keys(saved).forEach(function (k) {
        if (saved[k] === 1 || saved[k] === 2) out[k] = saved[k];
      });
    }
    s.cards.forEach(function (c) {
      if (s.levels[c.key]) out[c.key] = s.levels[c.key];
      else delete out[c.key];
    });
    writePref(learn.api, 'learnLevels', Object.keys(out).length ? out : undefined);
  }

  function learnStart(panel, api) {
    learnStop();
    learn.active = true;
    learn.api = api;
    clear(panel);
    learn.root = el('div', 'md-root lm-root');
    panel.appendChild(learn.root);
    var cards = readCards(api);
    if (cards.length < 2) {
      learn.s = null;
      tooFew(learn.root, api, 'use Learn');
      return;
    }
    var sig = signature(cards);
    if (!learn.s || learn.s.sig !== sig) learn.s = learnSession(cards, sig, api);
    learnFrame();
    var s = learn.s;
    if (s.screen === 'question' && s.q && s.q.answered) advance(false);
    else if (s.screen === 'question' && !s.q) beginRound(false);
    else showLearn(false);
  }

  function learnStop() {
    learn.active = false;
    clearTimeout(learn.timer);
    learn.timer = null;
  }

  function learnFrame() {
    var root = learn.root;
    var top = el('div', 'lm-top');
    var row = el('div', 'lm-top-row');
    learn.roundEl = el('span', 'lm-round');
    row.appendChild(learn.roundEl);
    var optBtn = button('Options', 'btn secondary md-small lm-opt-btn', function () {
      var open = learn.opt.box.hidden;
      learn.opt.box.hidden = !open;
      optBtn.setAttribute('aria-expanded', String(open));
    });
    optBtn.setAttribute('aria-expanded', 'false');
    row.appendChild(optBtn);
    top.appendChild(row);

    var bar = el('div', 'lm-bar');
    bar.setAttribute('aria-hidden', 'true');
    learn.barParts = [];
    ['new', 'learn', 'done'].forEach(function (k) {
      var part = el('span', 'lm-bar-' + k);
      bar.appendChild(part);
      learn.barParts.push(part);
    });
    top.appendChild(bar);

    var counts = el('p', 'lm-counts');
    learn.countEls = [];
    ['new', 'learn', 'done'].forEach(function (k, i) {
      if (i) {
        var sep = el('span', 'lm-sep', '\u00b7');
        sep.setAttribute('aria-hidden', 'true');
        counts.appendChild(document.createTextNode(' '));
        counts.appendChild(sep);
        counts.appendChild(document.createTextNode(' '));
      }
      var item = el('span', 'lm-count lm-count-' + k);
      var dot = el('span', 'lm-dot');
      dot.setAttribute('aria-hidden', 'true');
      item.appendChild(dot);
      item.appendChild(document.createTextNode(LEVEL_NAMES[i] + ' '));
      var n = el('b', '', '0');
      item.appendChild(n);
      learn.countEls.push(n);
      counts.appendChild(item);
    });
    top.appendChild(counts);
    root.appendChild(top);

    var opts = learnOptionsPanel();
    optBtn.setAttribute('aria-controls', opts.id);
    learn.optBtn = optBtn;
    root.appendChild(opts);

    learn.stage = el('div', 'lm-stage');
    root.appendChild(learn.stage);
  }

  function learnBar() {
    var s = learn.s, n = levelCounts(), total = s.cards.length;
    for (var i = 0; i < 3; i++) {
      learn.barParts[i].style.width = (n[i] / total * 100) + '%';
      learn.countEls[i].textContent = String(n[i]);
    }
    learn.roundEl.textContent = s.screen === 'done' ? 'All done' : s.round ? 'Round ' + s.round : 'Learn';
  }

  function showLearn(focus) {
    var s = learn.s;
    learnBar();
    clear(learn.stage);
    learn.ui = null;
    if (s.screen === 'done') learnDone(focus);
    else if (s.screen === 'summary') learnSummary(focus);
    else learnQuestion(focus);
    if (focus) bringIntoView(learn.root);
  }

  // A round is up to seven terms that are not mastered yet, the ones already
  // being learned first.
  function beginRound(focus) {
    var s = learn.s;
    clearTimeout(learn.timer);
    learn.timer = null;
    var pool = s.cards.filter(function (c) { return s.levels[c.key] === 1; })
      .concat(s.cards.filter(function (c) { return s.levels[c.key] === 0; }));
    if (!pool.length) {
      s.screen = 'done';
      s.q = null;
      showLearn(focus);
      return;
    }
    s.round += 1;
    s.roundCards = pool.slice(0, ROUND_SIZE);
    s.queue = shuffle(s.roundCards);
    s.q = makeQuestion(s.queue.shift());
    s.screen = 'question';
    showLearn(focus);
  }

  function advance(focus) {
    var s = learn.s;
    clearTimeout(learn.timer);
    learn.timer = null;
    if (levelCounts()[2] === s.cards.length) { s.screen = 'done'; s.q = null; s.justDone = true; }
    else if (s.queue.length) { s.q = makeQuestion(s.queue.shift()); s.screen = 'question'; }
    else { s.screen = 'summary'; s.q = null; }
    showLearn(focus);
  }

  function makeQuestion(card) {
    var s = learn.s, o = s.opts;
    var w = writtenOn(o), m = choiceOn(o);
    var type = s.levels[card.key] === 0 ? (m ? 'mc' : 'written') : (w ? 'written' : 'mc');
    var q = { card: card, type: type, dir: o.answerWith, answered: false, result: null, prev: 0 };
    if (type === 'mc') q.choices = pickChoices(card, s.cards, q.dir, 4);
    return q;
  }

  function learnQuestion(focus) {
    var s = learn.s, q = s.q, card = q.card;
    var byTerm = q.dir === 'term';
    var text = byTerm ? card.def : card.term;
    var box = el('section', 'md-card lm-q');
    box.setAttribute('aria-label', 'Question');

    var head = el('div', 'lm-q-head');
    head.appendChild(el('span', 'md-label', byTerm ? 'Definition' : 'Term'));
    var sp = speakButton(learn.api, text, byTerm ? 'definition' : 'term');
    if (sp) head.appendChild(sp);
    box.appendChild(head);

    var pid = uid('lm-prompt');
    var prompt = promptBlock(text, card, byTerm, pid);
    var ptext = prompt.firstChild;
    ptext.tabIndex = -1;
    box.appendChild(prompt);
    learn.ui = { box: box, choices: [], input: null, fb: null, actions: null, prompt: ptext };

    if (card.hint) box.appendChild(hintToggle(card.hint));
    if (q.type === 'mc') learnChoices(box, q);
    else learnWritten(box, q, pid);

    var fb = el('div', 'md-feedback');
    fb.setAttribute('aria-live', 'polite');
    box.appendChild(fb);
    var actions = el('div', 'md-actions lm-after');
    actions.hidden = true;
    box.appendChild(actions);
    learn.ui.fb = fb;
    learn.ui.actions = actions;
    learn.stage.appendChild(box);
    if (focus) focusQuietly(q.type === 'written' ? learn.ui.input : ptext);
  }

  function hintToggle(hint) {
    var wrap = el('div', 'md-hint');
    var text = el('p', 'md-hint-text', hint);
    text.hidden = true;
    text.tabIndex = -1;
    var show = button('Show a hint', 'md-link', function () {
      text.hidden = false;
      show.hidden = true;
      focusQuietly(text);
    });
    wrap.appendChild(show);
    wrap.appendChild(text);
    return wrap;
  }

  function learnChoices(box, q) {
    var askRow = el('div', 'lm-ask-row');
    var ask = el('p', 'lm-ask', q.dir === 'term' ? 'Choose the matching term' : 'Choose the matching definition');
    ask.id = uid('lm-ask');
    askRow.appendChild(ask);
    askRow.appendChild(el('span', 'lm-keys', 'Keys 1 to ' + q.choices.length));
    box.appendChild(askRow);
    var grid = el('div', 'lm-choices' + (q.dir === 'def' ? ' long' : ''));
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-labelledby', ask.id);
    q.choices.forEach(function (c, i) {
      var text = q.dir === 'term' ? c.term : c.def;
      var b = el('button', 'lm-choice');
      b.type = 'button';
      var num = el('span', 'lm-num', String(i + 1));
      num.setAttribute('aria-hidden', 'true');
      b.appendChild(num);
      b.appendChild(el('span', 'lm-choice-text' + sizeClass(text), text));
      b.addEventListener('click', function () { chooseAnswer(i); });
      grid.appendChild(b);
      learn.ui.choices.push(b);
    });
    box.appendChild(grid);
    var more = el('div', 'lm-idk');
    more.appendChild(button("I don't know", 'md-link', function () { chooseAnswer(-1); }));
    box.appendChild(more);
    learn.ui.idk = more;
  }

  function chooseAnswer(i) {
    var s = learn.s, q = s && s.q;
    if (!q || q.answered || q.type !== 'mc') return;
    var right = q.choices.indexOf(q.card);
    var ok = i === right;
    q.answered = true;
    learn.ui.choices.forEach(function (b, j) {
      b.disabled = true;
      b.classList.add(j === right ? 'is-right' : j === i ? 'is-wrong' : 'is-dim');
    });
    learn.ui.idk.hidden = true;
    record(ok);
    if (ok) praise([pickOne(PRAISE)], 900);
    else missed(i === -1 ? 'Here is the answer.' : 'Not quite.', q.dir === 'term' ? q.card.term : q.card.def, null, false);
  }

  function learnWritten(box, q, pid) {
    var wrap = el('div', 'lm-write');
    var id = uid('lm-answer');
    var lab = el('label', 'lm-write-label', 'Type the term');
    lab.htmlFor = id;
    var input = el('input', 'md-input lm-answer');
    input.type = 'text';
    input.id = id;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-describedby', pid);
    input.spellcheck = false;
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.repeat || e.isComposing) return;
      e.preventDefault();
      if (!q.answered) checkWritten();
      else if (q.result === 'right') advance(true);
    });
    wrap.appendChild(lab);
    wrap.appendChild(input);
    var row = el('div', 'md-actions');
    row.appendChild(button('Check', 'btn', function () { checkWritten(); }));
    row.appendChild(button("I don't know", 'btn secondary', function () { writtenResult('', 'skip'); }));
    wrap.appendChild(row);
    box.appendChild(wrap);
    learn.ui.input = input;
    learn.ui.writeRow = row;
  }

  function checkWritten() {
    var s = learn.s, q = s.q, ui = learn.ui;
    if (!q || q.answered) return;
    var value = ui.input.value;
    if (!tidyAnswer(value)) {
      ui.fb.className = 'md-feedback note';
      ui.fb.textContent = 'Type an answer first, or choose "I don\'t know."';
      ui.input.focus();
      return;
    }
    writtenResult(value, checkTyped(value, q.card.term, s.cards.map(function (c) { return c.term; })));
  }

  function writtenResult(value, result) {
    var q = learn.s.q, ui = learn.ui;
    if (!q || q.answered) return;
    q.answered = true;
    ui.input.readOnly = true;
    ui.writeRow.hidden = true;
    var ok = result === 'exact' || result === 'close';
    record(ok);
    ui.input.classList.add(ok ? 'is-right' : 'is-wrong');
    if (result === 'exact') praise([pickOne(PRAISE)], 900);
    // A little longer here, so there is time to read the right spelling.
    else if (result === 'close') praise(['Correct. Check your spelling: ', { strong: q.card.term }], 1800);
    else missed(result === 'skip' ? 'Here is the answer.' : 'Not quite.', q.card.term, result === 'skip' ? null : value, result !== 'skip');
  }

  function record(ok) {
    var s = learn.s, q = s.q, key = q.card.key;
    q.prev = s.levels[key];
    if (ok) s.levels[key] = Math.min(2, q.prev + 1);
    else {
      s.levels[key] = 0;
      s.queue.push(q.card);
    }
    q.result = ok ? 'right' : 'wrong';
    saveLevels();
    learnBar();
  }

  // "I was right": the student's answer counts after all.
  function overrideRight() {
    var s = learn.s, q = s.q;
    if (!q || q.result !== 'wrong') return;
    var at = s.queue.lastIndexOf(q.card);
    if (at !== -1) s.queue.splice(at, 1);
    s.levels[q.card.key] = Math.min(2, q.prev + 1);
    q.result = 'right';
    saveLevels();
    advance(true);
  }

  function fillFeedback(fb, parts) {
    clear(fb);
    parts.forEach(function (p) {
      if (typeof p === 'string') fb.appendChild(document.createTextNode(p));
      else fb.appendChild(el('strong', '', p.strong));
    });
  }

  function praise(parts, ms) {
    var ui = learn.ui;
    ui.fb.className = 'md-feedback good';
    fillFeedback(ui.fb, parts);
    learn.timer = setTimeout(function () {
      learn.timer = null;
      if (learn.active) advance(true);
    }, ms);
  }

  function missed(lead, answer, yours, canOverride) {
    var ui = learn.ui;
    ui.fb.className = 'md-feedback bad';
    clear(ui.fb);
    ui.fb.appendChild(el('p', 'md-fb-lead', lead));
    var right = el('p', 'md-fb-line');
    right.appendChild(el('span', 'md-fb-label', 'Correct answer'));
    right.appendChild(el('strong', 'md-fb-right', answer));
    ui.fb.appendChild(right);
    if (yours != null) {
      var mine = el('p', 'md-fb-line');
      mine.appendChild(el('span', 'md-fb-label', 'Your answer'));
      mine.appendChild(el('span', 'md-fb-yours', yours));
      ui.fb.appendChild(mine);
    }
    clear(ui.actions);
    var go = button('Continue', 'btn', function () { advance(true); });
    ui.actions.appendChild(go);
    if (canOverride) ui.actions.appendChild(button('I was right', 'btn secondary', overrideRight));
    ui.actions.appendChild(el('span', 'lm-enter', 'or press Enter'));
    ui.actions.hidden = false;
    focusQuietly(go);
  }

  function learnSummary(focus) {
    var s = learn.s, n = levelCounts();
    var box = el('section', 'md-card lm-summary');
    box.appendChild(el('h2', 'md-title', 'Round ' + s.round + ' done.'));
    box.appendChild(el('p', 'md-lede', 'You have mastered ' + n[2] + ' of ' + plural(s.cards.length, 'term') + '.'));
    var list = el('ul', 'lm-list');
    s.roundCards.forEach(function (c) {
      var lv = s.levels[c.key];
      var li = el('li');
      li.appendChild(el('span', 'lm-list-term', c.term));
      li.appendChild(el('span', 'lm-chip lv' + lv, LEVEL_NAMES[lv]));
      list.appendChild(li);
    });
    box.appendChild(list);
    var row = el('div', 'md-actions');
    var go = button('Continue', 'btn', function () { beginRound(true); });
    row.appendChild(go);
    box.appendChild(row);
    learn.stage.appendChild(box);
    if (focus) focusQuietly(go);
  }

  function learnDone(focus) {
    var s = learn.s;
    var box = el('section', 'md-card lm-summary lm-done');
    box.appendChild(el('h2', 'md-title', 'You mastered all ' + plural(s.cards.length, 'term') + '.'));
    box.appendChild(el('p', 'md-lede', 'Great work. A practice test is a good way to check what you know.'));
    var row = el('div', 'md-actions');
    var testBtn = button('Take a practice test', 'btn', function () { learn.api.goMode('test'); });
    row.appendChild(testBtn);
    row.appendChild(button('Study again', 'btn secondary', learnReset));
    box.appendChild(row);
    learn.stage.appendChild(box);
    if (s.justDone) { s.justDone = false; passReport(learn.api, { kind: 'learn', total: s.cards.length }, box); }
    if (focus) focusQuietly(testBtn);
  }

  function learnReset() {
    var s = learn.s;
    s.cards.forEach(function (c) { s.levels[c.key] = 0; });
    s.cards = shuffle(s.cards);
    s.round = 0;
    s.queue = [];
    s.roundCards = [];
    s.q = null;
    saveLevels();
    beginRound(true);
  }

  function learnOptionsPanel() {
    var o = learn.s.opts;
    var box = el('div', 'md-card lm-options');
    box.id = uid('lm-options');
    box.hidden = true;

    var types = fieldset('Question types');
    var mc = choiceRow('checkbox', '', 'Multiple choice', '', o.mc, function (on) { o.mc = on; optionsChanged(); });
    var wr = choiceRow('checkbox', '', 'Written', 'Type the term', o.written, function (on) { o.written = on; optionsChanged(); });
    var lockNote = el('p', 'md-note', 'At least one question type stays on.');
    var dirNote = el('p', 'md-note', 'Written questions are off while you answer with the definition, since definitions are too long to type.');
    types.appendChild(mc.label);
    types.appendChild(wr.label);
    types.appendChild(lockNote);
    types.appendChild(dirNote);
    box.appendChild(types);

    var dir = fieldset('Answer with');
    var name = uid('lm-dir');
    dir.appendChild(choiceRow('radio', name, 'Term', 'You see the definition', o.answerWith === 'term', function (on) {
      if (on) { o.answerWith = 'term'; optionsChanged(); }
    }).label);
    dir.appendChild(choiceRow('radio', name, 'Definition', 'You see the term', o.answerWith === 'def', function (on) {
      if (on) { o.answerWith = 'def'; optionsChanged(); }
    }).label);
    box.appendChild(dir);

    // Starting over takes a second step, so one stray tap cannot erase progress.
    var reset = el('div', 'lm-reset');
    var ask = button('Start over', 'btn secondary md-small', function () {
      ask.hidden = true;
      sure.hidden = false;
      focusQuietly(yes);
    });
    var sure = el('div', 'md-confirm');
    sure.hidden = true;
    sure.appendChild(el('span', '', 'Set every term back to new?'));
    var yes = button('Yes, start over', 'btn md-small', function () {
      sure.hidden = true;
      ask.hidden = false;
      box.hidden = true;
      learn.optBtn.setAttribute('aria-expanded', 'false');
      learnReset();
    });
    var no = button('Cancel', 'btn secondary md-small', function () {
      sure.hidden = true;
      ask.hidden = false;
      focusQuietly(ask);
    });
    sure.appendChild(yes);
    sure.appendChild(no);
    reset.appendChild(ask);
    reset.appendChild(sure);
    box.appendChild(reset);

    learn.opt = { box: box, mc: mc, wr: wr, lockNote: lockNote, dirNote: dirNote };
    syncOptions();
    return box;
  }

  function syncOptions() {
    var o = learn.s.opts, u = learn.opt;
    var w = writtenOn(o), m = choiceOn(o);
    u.mc.input.checked = m;
    u.wr.input.checked = w;
    u.mc.input.disabled = m && !w;
    u.wr.input.disabled = o.answerWith !== 'term' || (w && !m);
    u.mc.label.classList.toggle('is-off', u.mc.input.disabled);
    u.wr.label.classList.toggle('is-off', u.wr.input.disabled);
    u.dirNote.hidden = o.answerWith === 'term';
    u.lockNote.hidden = !(o.answerWith === 'term' && (u.mc.input.disabled || u.wr.input.disabled));
  }

  function optionsChanged() {
    var s = learn.s;
    writePref(learn.api, 'learnOptions', { mc: s.opts.mc, written: s.opts.written, answerWith: s.opts.answerWith });
    syncOptions();
    if (s.screen === 'question' && s.q && !s.q.answered) {
      s.q = makeQuestion(s.q.card);
      showLearn(false);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (!learn.active || !learn.s || !learn.stage) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    var t = e.target;
    // The answer box handles its own Enter key.
    if (typing(t) || inDrawer(t)) return;
    var s = learn.s, q = s.q;
    if (s.screen === 'question' && q && q.type === 'mc' && !q.answered && /^[1-9]$/.test(e.key)) {
      var i = Number(e.key) - 1;
      if (i < q.choices.length) {
        e.preventDefault();
        chooseAnswer(i);
      }
      return;
    }
    // A focused button answers Enter by itself.
    if (e.key !== 'Enter' || e.repeat || pressable(t)) return;
    if (s.screen === 'summary') { e.preventDefault(); beginRound(true); }
    else if (s.screen === 'question' && q && q.answered) { e.preventDefault(); advance(true); }
  });

  /* ================================================================
     Test: a practice test made from the set.
     ================================================================ */

  var TYPES = ['tf', 'mc', 'match', 'written'];
  var TYPE_NAMES = { tf: 'True or false', mc: 'Multiple choice', match: 'Matching', written: 'Written' };
  var LETTERS = 'ABCDEF';
  var MATCH_MAX = 6;

  var test = { active: false, api: null, root: null, s: null };

  function testSettings(api, n) {
    var o = readPref(api, 'testOptions');
    if (!o || typeof o !== 'object') o = {};
    var saved = o.types && typeof o.types === 'object' ? o.types : {};
    var types = {};
    TYPES.forEach(function (k) { types[k] = saved[k] !== false; });
    if (!TYPES.some(function (k) { return types[k]; })) TYPES.forEach(function (k) { types[k] = true; });
    return {
      count: Math.min(20, n),
      answerWith: /^(?:term|def|both)$/.test(o.answerWith) ? o.answerWith : 'term',
      types: types
    };
  }

  function testStart(panel, api) {
    testStop();
    test.active = true;
    test.api = api;
    clear(panel);
    test.root = el('div', 'md-root ts-root');
    panel.appendChild(test.root);
    var cards = readCards(api);
    if (cards.length < 2) {
      test.s = null;
      tooFew(test.root, api, 'use Test');
      return;
    }
    var sig = signature(cards);
    if (!test.s || test.s.sig !== sig) {
      test.s = { sig: sig, cards: cards, screen: 'setup', settings: testSettings(api, cards.length), test: null };
    }
    showTest(false);
  }

  function testStop() {
    test.active = false;
  }

  function showTest(focus) {
    var s = test.s;
    clear(test.root);
    if (s.screen === 'taking' && s.test) testTaking(focus);
    else if (s.screen === 'results' && s.test) testResults(focus);
    else testSetup(focus);
    if (focus) bringIntoView(test.root);
  }

  function clampCount(value, n, fallback) {
    var v = parseInt(value, 10);
    if (isNaN(v)) v = fallback;
    return Math.max(1, Math.min(n, v));
  }

  function testSetup(focus) {
    var s = test.s, st = s.settings, n = s.cards.length;
    s.screen = 'setup';
    var box = el('section', 'md-card ts-setup');
    if (test.api.title) box.appendChild(el('p', 'md-eyebrow', test.api.title));
    var h = el('h2', 'md-title', 'Practice test');
    h.tabIndex = -1;
    box.appendChild(h);
    box.appendChild(el('p', 'md-lede', 'Choose your test options, then start when you are ready.'));

    var grid = el('div', 'ts-setup-grid');

    var countBox = el('div', 'ts-count-box');
    var cid = uid('ts-count');
    var clab = el('label', 'md-legend', 'Number of questions');
    clab.htmlFor = cid;
    countBox.appendChild(clab);
    var line = el('div', 'ts-count-line');
    var cin = el('input', 'ts-count');
    cin.type = 'number';
    cin.id = cid;
    cin.min = '1';
    cin.max = String(n);
    cin.step = '1';
    cin.inputMode = 'numeric';
    cin.value = String(st.count);
    cin.addEventListener('change', function () {
      st.count = clampCount(cin.value, n, st.count);
      cin.value = String(st.count);
    });
    line.appendChild(cin);
    line.appendChild(el('span', 'ts-count-max', 'of ' + n));
    countBox.appendChild(line);
    grid.appendChild(countBox);

    var dir = fieldset('Answer with');
    var name = uid('ts-dir');
    [['term', 'Term', 'You see the definition'], ['def', 'Definition', 'You see the term'], ['both', 'Both', 'A mix of the two']].forEach(function (d) {
      dir.appendChild(choiceRow('radio', name, d[1], d[2], st.answerWith === d[0], function (on) {
        if (on) { st.answerWith = d[0]; saveTestOptions(); }
      }).label);
    });
    grid.appendChild(dir);

    var types = fieldset('Question types');
    var rows = {};
    var lock = el('p', 'md-note', 'At least one question type stays on.');
    var syncTypes = function () {
      var on = TYPES.filter(function (k) { return st.types[k]; });
      TYPES.forEach(function (k) {
        rows[k].input.disabled = on.length === 1 && st.types[k];
        rows[k].label.classList.toggle('is-off', rows[k].input.disabled);
      });
      lock.hidden = on.length !== 1;
    };
    TYPES.forEach(function (k) {
      rows[k] = choiceRow('checkbox', '', TYPE_NAMES[k], k === 'written' ? 'You type the term' : '', st.types[k], function (on) {
        st.types[k] = on;
        syncTypes();
        saveTestOptions();
      });
      types.appendChild(rows[k].label);
    });
    types.appendChild(lock);
    syncTypes();
    grid.appendChild(types);
    box.appendChild(grid);

    var row = el('div', 'md-actions');
    row.appendChild(button('Start test', 'btn', function () {
      st.count = clampCount(cin.value, n, st.count);
      s.test = buildTest(s.cards, st);
      s.screen = 'taking';
      showTest(true);
    }));
    box.appendChild(row);
    test.root.appendChild(box);
    if (focus) focusQuietly(h);
  }

  function saveTestOptions() {
    var st = test.s.settings, types = {};
    TYPES.forEach(function (k) { types[k] = !!st.types[k]; });
    writePref(test.api, 'testOptions', { answerWith: st.answerWith, types: types });
  }

  // Spread the questions evenly over the chosen types. Matching is one group
  // of up to six (two at least) when other types are on too.
  function allocate(n, types) {
    var alloc = {}, i;
    types.forEach(function (t) { alloc[t] = 0; });
    for (i = 0; i < n; i++) alloc[types[i % types.length]] += 1;
    if (has(alloc, 'match') && types.length > 1) {
      var others = types.filter(function (t) { return t !== 'match'; });
      var extra = 0;
      if (alloc.match > MATCH_MAX) { extra = alloc.match - MATCH_MAX; alloc.match = MATCH_MAX; }
      else if (alloc.match === 1) { extra = 1; alloc.match = 0; }
      for (i = 0; i < extra; i++) alloc[others[i % others.length]] += 1;
    }
    return alloc;
  }

  function buildTest(cards, st) {
    var n = clampCount(st.count, cards.length, cards.length);
    var types = TYPES.filter(function (k) { return st.types[k]; });
    var alloc = allocate(n, types);
    var pool = shuffle(cards);
    var dirFor = function () {
      return st.answerWith === 'both' ? (Math.random() < 0.5 ? 'term' : 'def') : st.answerWith;
    };
    var sections = [];
    types.forEach(function (type) {
      var k = alloc[type];
      if (!k) return;
      var picked = pool.splice(0, k);
      var sec = { type: type, items: [] };
      if (type === 'match') {
        // Only when Matching is the only type can it need more than one group.
        var groups = Math.ceil(k / MATCH_MAX);
        for (var g = 0; g < groups; g++) {
          var size = Math.ceil(picked.length / (groups - g));
          sec.items.push(matchGroup(picked.splice(0, size), st.answerWith === 'def' ? 'def' : 'term'));
        }
      } else {
        picked.forEach(function (c) { sec.items.push(makeTestQuestion(type, c, cards, dirFor())); });
      }
      sections.push(sec);
    });
    var num = 0;
    sections.forEach(function (sec) {
      sec.items.forEach(function (q) {
        if (q.type === 'match') q.rows.forEach(function (r) { num += 1; r.num = num; });
        else { num += 1; q.num = num; }
      });
    });
    return { sections: sections, total: num, right: 0 };
  }

  function makeTestQuestion(type, card, cards, dir) {
    var q = { type: type, card: card, dir: dir, answer: type === 'written' ? '' : null, ok: false };
    if (type === 'tf') {
      var others = cards.filter(function (c) {
        return tidyAnswer(c.term) !== tidyAnswer(card.term) && tidyAnswer(c.def) !== tidyAnswer(card.def);
      });
      var other = others.length ? pickOne(others) : null;
      q.truth = !other || Math.random() < 0.5;
      q.termCard = dir === 'term' && !q.truth ? other : card;
      q.defCard = dir === 'def' && !q.truth ? other : card;
    } else if (type === 'mc') {
      q.choices = pickChoices(card, cards, dir, 4);
      q.correct = q.choices.indexOf(card);
    }
    return q;
  }

  function matchGroup(group, dir) {
    var bank = shuffle(group);
    return {
      type: 'match',
      dir: dir,
      bank: bank,
      rows: shuffle(group).map(function (c) {
        return { type: 'row', card: c, correct: bank.indexOf(c), answer: null, ok: false };
      })
    };
  }

  function eachQuestion(t, fn) {
    t.sections.forEach(function (sec) {
      sec.items.forEach(function (q) {
        if (q.type === 'match') q.rows.forEach(function (r) { fn(r, q); });
        else fn(q, null);
      });
    });
  }

  function sectionCount(sec) {
    var n = 0;
    sec.items.forEach(function (q) { n += q.type === 'match' ? q.rows.length : 1; });
    return n;
  }

  function isAnswered(q) {
    return q.type === 'written' ? !!String(q.answer || '').trim() : q.answer != null;
  }

  function testTaking(focus) {
    var s = test.s, t = s.test, root = test.root;
    var head = el('div', 'md-card ts-head');
    var h = el('h2', 'md-title', 'Practice test');
    h.tabIndex = -1;
    head.appendChild(h);
    head.appendChild(el('p', 'md-lede', plural(t.total, 'question') + (test.api.title ? ' \u00b7 ' + test.api.title : '')));
    head.appendChild(button('Change test options', 'md-link', function () { s.screen = 'setup'; showTest(true); }));
    root.appendChild(head);

    t.sections.forEach(function (sec) { root.appendChild(sectionBox(sec, t, false)); });

    var foot = el('div', 'ts-submit');
    var warn = el('div', 'ts-warn-wrap');
    warn.setAttribute('aria-live', 'polite');
    foot.appendChild(button('Submit test', 'btn ts-submit-btn', function () { submitTest(false, warn); }));
    foot.appendChild(warn);
    root.appendChild(foot);
    if (focus) focusQuietly(h);
  }

  function sectionBox(sec, t, review) {
    var box = el('section', 'ts-section');
    var h = el('h3', 'ts-section-head', TYPE_NAMES[sec.type]);
    h.id = uid('ts-sec');
    h.appendChild(document.createTextNode(' '));
    h.appendChild(el('span', 'ts-section-count', plural(sectionCount(sec), 'question')));
    box.setAttribute('aria-labelledby', h.id);
    box.appendChild(h);
    sec.items.forEach(function (q) {
      if (review) {
        if (q.type === 'match') q.rows.forEach(function (r) { box.appendChild(reviewView(r, q, t.total)); });
        else box.appendChild(reviewView(q, null, t.total));
      } else {
        box.appendChild(questionView(q, t.total));
      }
    });
    return box;
  }

  function questionView(q, total) {
    if (q.type === 'match') return matchView(q, total);
    var box = el('div', 'ts-q');
    var top = el('div', 'ts-q-top');
    var num = el('span', 'ts-num', q.num + ' of ' + total);
    num.id = uid('ts-num');
    top.appendChild(num);
    box.appendChild(top);
    var byTerm = q.dir === 'term';
    var ask;

    if (q.type === 'tf') {
      box.appendChild(pairView(q));
      ask = el('p', 'ts-ask', 'Do these match?');
      ask.id = uid('ts-ask');
      box.appendChild(ask);
      box.appendChild(radioGroup(q, [{ text: 'True', value: true }, { text: 'False', value: false }], 'tf', num.id + ' ' + ask.id));
      return box;
    }

    // Multiple choice asks either way. Written always asks for the term.
    var showsDef = q.type === 'written' || byTerm;
    var text = showsDef ? q.card.def : q.card.term;
    var sp = speakButton(test.api, text, showsDef ? 'definition' : 'term');
    if (sp) top.appendChild(sp);
    box.appendChild(el('span', 'md-label', showsDef ? 'Definition' : 'Term'));
    var pid = uid('ts-p');
    box.appendChild(promptBlock(text, q.card, showsDef, pid));

    if (q.type === 'mc') {
      ask = el('p', 'ts-ask', byTerm ? 'Choose the matching term' : 'Choose the matching definition');
      ask.id = uid('ts-ask');
      box.appendChild(ask);
      var options = q.choices.map(function (c, i) { return { text: byTerm ? c.term : c.def, value: i }; });
      box.appendChild(radioGroup(q, options, byTerm ? '' : 'long', num.id + ' ' + ask.id));
      return box;
    }

    var id = uid('ts-in');
    var lab = el('label', 'ts-write-label', 'Type the term');
    lab.htmlFor = id;
    box.appendChild(lab);
    var input = el('input', 'md-input ts-answer');
    input.type = 'text';
    input.id = id;
    input.value = q.answer || '';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('aria-describedby', num.id + ' ' + pid);
    input.spellcheck = false;
    input.addEventListener('input', function () { q.answer = input.value; });
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      focusNextAnswer(input);
    });
    q.focusEl = input;
    box.appendChild(input);
    return box;
  }

  // Enter in a written answer moves on to the next one, then to Submit.
  function focusNextAnswer(from) {
    var all = test.root.querySelectorAll('.ts-answer, .ts-submit-btn');
    for (var i = 0; i < all.length - 1; i++) {
      if (all[i] === from) { all[i + 1].focus(); return; }
    }
  }

  function pairView(q) {
    var pair = el('div', 'ts-pair');
    var termBox = el('div', 'ts-side');
    termBox.appendChild(el('span', 'md-label', 'Term'));
    termBox.appendChild(el('p', 'ts-side-term', q.termCard.term));
    var defBox = el('div', 'ts-side');
    defBox.appendChild(el('span', 'md-label', 'Definition'));
    defBox.appendChild(promptBlock(q.defCard.def, q.defCard, true));
    if (q.dir === 'term') { pair.appendChild(defBox); pair.appendChild(termBox); }
    else { pair.appendChild(termBox); pair.appendChild(defBox); }
    return pair;
  }

  function radioGroup(q, options, cls, labelledBy) {
    var name = uid('ts-r');
    var group = el('div', 'ts-choices' + (cls ? ' ' + cls : ''));
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', labelledBy);
    var labels = [];
    options.forEach(function (op, i) {
      var lab = el('label', 'ts-choice');
      var input = el('input');
      input.type = 'radio';
      input.name = name;
      input.checked = q.answer === op.value;
      if (input.checked) lab.className += ' is-on';
      input.addEventListener('change', function () {
        if (!input.checked) return;
        q.answer = op.value;
        labels.forEach(function (l) { l.classList.toggle('is-on', l === lab); });
      });
      lab.appendChild(input);
      lab.appendChild(el('span', 'ts-choice-text', op.text));
      if (!i) q.focusEl = input;
      labels.push(lab);
      group.appendChild(lab);
    });
    return group;
  }

  function shorten(text, max) {
    return text.length > max ? text.slice(0, max - 3).replace(/\s+\S*$/, '') + '...' : text;
  }

  function matchView(q, total) {
    var byTerm = q.dir === 'term';
    var box = el('div', 'ts-q ts-match');
    box.appendChild(el('p', 'ts-ask ts-ask-top', byTerm ? 'Choose the matching term for each definition.' : 'Choose the matching definition for each term.'));
    var grid = el('div', 'ts-match-grid');

    var bank = el('div', 'ts-bank');
    bank.appendChild(el('p', 'md-label', byTerm ? 'Terms' : 'Definitions'));
    var ul = el('ul', 'ts-bank-list' + (byTerm ? '' : ' long'));
    q.bank.forEach(function (c, i) {
      var li = el('li');
      var letter = el('span', 'ts-letter', LETTERS.charAt(i));
      li.appendChild(letter);
      li.appendChild(el('span', 'ts-bank-text', byTerm ? c.term : c.def));
      ul.appendChild(li);
    });
    bank.appendChild(ul);

    var rows = el('ol', 'ts-rows');
    q.rows.forEach(function (r) {
      var li = el('li', 'ts-row');
      var num = el('span', 'ts-num', r.num + ' of ' + total);
      num.id = uid('ts-num');
      li.appendChild(num);
      var pid = uid('ts-p');
      li.appendChild(promptBlock(byTerm ? r.card.def : r.card.term, r.card, byTerm, pid));
      var sel = el('select', 'ts-select');
      sel.setAttribute('aria-labelledby', num.id + ' ' + pid);
      var none = el('option', '', 'Choose a letter');
      none.value = '';
      sel.appendChild(none);
      q.bank.forEach(function (c, i) {
        var o = el('option', '', LETTERS.charAt(i) + '. ' + shorten(byTerm ? c.term : c.def, 60));
        o.value = String(i);
        sel.appendChild(o);
      });
      sel.value = r.answer == null ? '' : String(r.answer);
      sel.addEventListener('change', function () { r.answer = sel.value === '' ? null : Number(sel.value); });
      r.focusEl = sel;
      li.appendChild(sel);
      rows.appendChild(li);
    });
    grid.appendChild(rows);
    grid.appendChild(bank);
    box.appendChild(grid);
    return box;
  }

  function submitTest(force, warn) {
    var s = test.s, missing = [];
    eachQuestion(s.test, function (q) { if (!isAnswered(q)) missing.push(q); });
    if (missing.length && !force) {
      clear(warn);
      var box = el('div', 'ts-warn');
      box.appendChild(el('p', 'ts-warn-text', plural(missing.length, 'question') + (missing.length === 1 ? ' has' : ' have') + ' no answer.'));
      var row = el('div', 'md-actions');
      row.appendChild(button('Submit anyway', 'btn', function () { submitTest(true, warn); }));
      row.appendChild(button('Keep working', 'btn secondary', function () {
        clear(warn);
        var f = missing[0].focusEl;
        if (f && f.isConnected !== false) {
          f.scrollIntoView({ block: 'center' });
          focusQuietly(f);
        }
      }));
      box.appendChild(row);
      warn.appendChild(box);
      return;
    }
    gradeTest(s.test);
    s.screen = 'results';
    s.test.report = true;
    showTest(true);
  }

  function gradeTest(t) {
    var terms = test.s.cards.map(function (c) { return c.term; });
    var right = 0;
    eachQuestion(t, function (q, group) {
      if (group) {
        var textOf = function (c) { return group.dir === 'term' ? c.term : c.def; };
        q.ok = q.answer != null && tidyAnswer(textOf(group.bank[q.answer])) === tidyAnswer(textOf(q.card));
      } else if (q.type === 'tf') {
        q.ok = q.answer === q.truth;
      } else if (q.type === 'mc') {
        q.ok = q.answer === q.correct;
      } else {
        q.result = checkTyped(q.answer, q.card.term, terms);
        q.ok = q.result !== 'wrong';
      }
      if (q.ok) right += 1;
    });
    t.right = right;
  }

  function testResults(focus) {
    var s = test.s, t = s.test, root = test.root;
    var pct = Math.round(t.right / t.total * 100);
    var head = el('section', 'md-card ts-score');
    head.appendChild(el('p', 'md-label', 'Your score'));
    var big = el('h2', 'ts-score-big', t.right + ' of ' + t.total + ' correct \u00b7 ' + pct + '%');
    big.tabIndex = -1;
    head.appendChild(big);
    var bar = el('div', 'ts-score-bar');
    bar.setAttribute('aria-hidden', 'true');
    var fill = el('span');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    head.appendChild(bar);
    head.appendChild(el('p', 'md-lede', pct === 100 ? 'A perfect score. Great work!'
      : pct >= 80 ? 'Great work. Look over the ones you missed below.'
      : pct >= 50 ? 'Good start. Look over the ones you missed, then try again.'
      : 'Keep practicing. Learn mode can help you build up to it.'));
    head.appendChild(resultButtons());
    if (t.report) { t.report = false; passReport(test.api, { kind: 'test', score: t.right, total: t.total }, head); }
    root.appendChild(head);
    t.sections.forEach(function (sec) { root.appendChild(sectionBox(sec, t, true)); });
    var foot = resultButtons();
    foot.className += ' ts-foot';
    root.appendChild(foot);
    if (focus) focusQuietly(big);
  }

  function resultButtons() {
    var row = el('div', 'md-actions');
    row.appendChild(button('Retake this test', 'btn', retakeTest));
    row.appendChild(button('New test', 'btn secondary', function () { test.s.screen = 'setup'; showTest(true); }));
    return row;
  }

  function retakeTest() {
    var t = test.s.test;
    eachQuestion(t, function (q) {
      q.answer = q.type === 'written' ? '' : null;
      q.ok = false;
      q.result = null;
    });
    t.right = 0;
    test.s.screen = 'taking';
    showTest(true);
  }

  function answerLine(label, text, cls) {
    var p = el('p', 'ts-ans' + (cls ? ' ' + cls : ''));
    p.appendChild(el('span', 'ts-ans-label', label));
    p.appendChild(el('span', 'ts-ans-text', text));
    return p;
  }

  function reviewView(q, group, total) {
    var box = el('div', 'ts-q ts-r ' + (q.ok ? 'ok' : 'no'));
    var top = el('div', 'ts-q-top');
    top.appendChild(el('span', 'ts-num', q.num + ' of ' + total));
    top.appendChild(el('span', 'ts-badge ' + (q.ok ? 'ok' : 'no'), q.ok ? 'Correct' : 'Incorrect'));
    box.appendChild(top);
    var none = 'No answer';
    var yours, right;

    if (group) {
      var byTerm = group.dir === 'term';
      var textOf = function (i) { return LETTERS.charAt(i) + '. ' + (byTerm ? group.bank[i].term : group.bank[i].def); };
      box.appendChild(el('span', 'md-label', 'Matching'));
      box.appendChild(promptBlock(byTerm ? q.card.def : q.card.term, q.card, byTerm));
      yours = q.answer == null ? none : textOf(q.answer);
      right = textOf(q.correct);
    } else if (q.type === 'tf') {
      box.appendChild(pairView(q));
      yours = q.answer == null ? none : q.answer ? 'True' : 'False';
      right = q.truth ? 'True' : 'False';
    } else {
      var showsDef = q.type === 'written' || q.dir === 'term';
      box.appendChild(el('span', 'md-label', showsDef ? 'Definition' : 'Term'));
      box.appendChild(promptBlock(showsDef ? q.card.def : q.card.term, q.card, showsDef));
      if (q.type === 'mc') {
        var answerText = function (c) { return q.dir === 'term' ? c.term : c.def; };
        yours = q.answer == null ? none : answerText(q.choices[q.answer]);
        right = answerText(q.card);
      } else {
        yours = String(q.answer || '').trim() || none;
        right = q.card.term;
      }
    }

    box.appendChild(answerLine('Your answer', yours, q.ok ? 'ok' : 'no'));
    if (!q.ok) box.appendChild(answerLine('Correct answer', right, 'ok'));
    if (q.result === 'close') box.appendChild(el('p', 'ts-note', 'Correct. Check your spelling: ' + q.card.term));
    if (q.type === 'tf' && !q.truth) box.appendChild(el('p', 'ts-note', 'That definition goes with "' + q.defCard.term + '."'));
    return box;
  }

  /* ================================================================
     Match: a timed game. Pair each term with its definition.
     ================================================================ */

  var MATCH_PAIRS = 6;
  var match = { active: false, api: null, root: null, game: null, tick: null, timers: [] };

  function matchLater(fn, ms) {
    var id = setTimeout(function () {
      var at = match.timers.indexOf(id);
      if (at !== -1) match.timers.splice(at, 1);
      fn();
    }, ms);
    match.timers.push(id);
  }

  function stopClock() {
    clearInterval(match.tick);
    match.tick = null;
    match.timers.forEach(clearTimeout);
    match.timers = [];
  }

  // Six cards, short definitions first so the tiles stay easy to read.
  function matchCards(cards) {
    var seenT = Object.create(null), seenD = Object.create(null), short = [], long = [];
    shuffle(cards).forEach(function (c) {
      var t = tidyAnswer(c.term), d = tidyAnswer(c.def);
      if (seenT[t] || seenD[d]) return;
      seenT[t] = seenD[d] = true;
      (c.def.length <= 150 ? short : long).push(c);
    });
    return short.concat(long).slice(0, MATCH_PAIRS);
  }

  function bestTime() {
    var b = readPref(match.api, 'matchBest');
    return typeof b === 'number' && isFinite(b) && b > 0 ? b : 0;
  }

  function seconds(ms) {
    return (Math.floor(ms / 100) / 10).toFixed(1) + ' s';
  }

  function matchStart(panel, api) {
    matchStop();
    match.active = true;
    match.api = api;
    clear(panel);
    match.root = el('div', 'md-root mt-root');
    panel.appendChild(match.root);
    if (matchCards(readCards(api)).length < 2) {
      tooFew(match.root, api, 'play Match');
      return;
    }
    matchIntro(false);
  }

  function matchStop() {
    match.active = false;
    stopClock();
    match.game = null;
  }

  function matchIntro(focus) {
    clear(match.root);
    var box = el('section', 'md-card mt-intro');
    box.appendChild(el('h2', 'md-title', 'Match'));
    box.appendChild(el('p', 'md-lede', 'Match each term with its definition as fast as you can.'));
    box.appendChild(el('p', 'md-note', 'Choose a tile, then the tile that goes with it. A wrong match adds 1 second.'));
    var best = bestTime();
    if (best) box.appendChild(el('p', 'mt-best', 'Your best time: ' + seconds(best)));
    var row = el('div', 'md-actions');
    var go = button('Start game', 'btn', matchPlay);
    row.appendChild(go);
    box.appendChild(row);
    match.root.appendChild(box);
    if (focus) focusQuietly(go);
  }

  function tileSize(text) {
    var n = text.length;
    return n <= 22 ? 'mt-s1' : n <= 60 ? 'mt-s2' : n <= 110 ? 'mt-s3' : 'mt-s4';
  }

  function matchPlay() {
    stopClock();
    var cards = matchCards(readCards(match.api));
    if (cards.length < 2) {
      clear(match.root);
      tooFew(match.root, match.api, 'play Match');
      return;
    }
    clear(match.root);
    var g = { pairs: cards.length, tiles: [], sel: null, bad: null, badToken: 0, plusToken: 0, left: cards.length, start: Date.now(), end: 0, penalty: 0, done: false, ui: {} };
    match.game = g;

    var bar = el('div', 'mt-bar');
    var clockWrap = el('div', 'mt-clock');
    var clock = el('span', 'mt-time', '0.0 s');
    clock.setAttribute('role', 'timer');
    var plus = el('span', 'mt-plus', '+1 s');
    plus.setAttribute('aria-hidden', 'true');
    plus.hidden = true;
    clockWrap.appendChild(clock);
    clockWrap.appendChild(plus);
    bar.appendChild(clockWrap);
    var left = el('span', 'mt-left', plural(g.left, 'pair') + ' left');
    bar.appendChild(left);
    bar.appendChild(button('Start over', 'btn secondary md-small', matchPlay));
    match.root.appendChild(bar);

    var grid = el('div', 'mt-grid');
    var tiles = [];
    cards.forEach(function (c) {
      tiles.push({ card: c, kind: 'term', text: c.term });
      tiles.push({ card: c, kind: 'def', text: c.def });
    });
    shuffle(tiles).forEach(function (t) {
      var b = el('button', 'mt-tile mt-' + t.kind + ' ' + tileSize(t.text));
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'md-sr', t.kind === 'term' ? 'Term: ' : 'Definition: '));
      b.appendChild(el('span', 'mt-text', t.text));
      b.addEventListener('click', function () { tapTile(t); });
      t.btn = b;
      grid.appendChild(b);
      g.tiles.push(t);
    });
    match.root.appendChild(grid);
    var live = el('p', 'md-sr');
    live.setAttribute('aria-live', 'polite');
    match.root.appendChild(live);
    g.ui = { clock: clock, plus: plus, left: left, live: live };
    match.tick = setInterval(updateClock, 100);
    focusQuietly(g.tiles[0].btn);
  }

  function elapsed(g) {
    return (g.done ? g.end : Date.now()) - g.start + g.penalty;
  }

  function updateClock() {
    var g = match.game;
    if (g) g.ui.clock.textContent = seconds(elapsed(g));
  }

  function selectTile(g, t) {
    g.sel = t;
    t.btn.classList.add('is-sel');
    t.btn.setAttribute('aria-pressed', 'true');
  }

  function unselect(g) {
    if (!g.sel) return;
    g.sel.btn.classList.remove('is-sel');
    g.sel.btn.setAttribute('aria-pressed', 'false');
    g.sel = null;
  }

  function clearBad(g) {
    if (!g.bad) return;
    g.bad.forEach(function (t) { t.btn.classList.remove('mt-bad'); });
    g.bad = null;
  }

  function tapTile(t) {
    var g = match.game;
    if (!g || g.done || t.gone) return;
    clearBad(g);
    if (!g.sel) { selectTile(g, t); return; }
    if (g.sel === t) { unselect(g); return; }
    // Two terms (or two definitions) can never match, so the second one
    // simply becomes the choice.
    if (g.sel.kind === t.kind) { unselect(g); selectTile(g, t); return; }
    var a = g.sel;
    unselect(g);
    if (a.card === t.card) paired(g, a, t);
    else mismatched(g, a, t);
  }

  function paired(g, a, b) {
    a.gone = b.gone = true;
    [a, b].forEach(function (t) { t.btn.classList.add('mt-good'); });
    g.left -= 1;
    g.ui.left.textContent = plural(g.left, 'pair') + ' left';
    g.ui.live.textContent = 'Matched ' + a.card.term + '. ' + plural(g.left, 'pair') + ' left.';
    if (!g.left) {
      g.done = true;
      g.end = Date.now();
      clearInterval(match.tick);
      match.tick = null;
      updateClock();
      matchLater(matchFinish, 550);
    }
    matchLater(function () {
      var hadFocus = document.activeElement === a.btn || document.activeElement === b.btn;
      [a, b].forEach(function (t) {
        t.btn.classList.add('mt-gone');
        t.btn.disabled = true;
      });
      // Keep a keyboard in the grid when the tile it was on disappears.
      if (hadFocus && !g.done) {
        for (var i = 0; i < g.tiles.length; i++) {
          if (!g.tiles[i].gone) { focusQuietly(g.tiles[i].btn); break; }
        }
      }
    }, 350);
  }

  function mismatched(g, a, b) {
    g.penalty += 1000;
    g.bad = [a, b];
    [a, b].forEach(function (t) {
      t.btn.classList.remove('mt-bad');
      void t.btn.offsetWidth;
      t.btn.classList.add('mt-bad');
    });
    var token = ++g.badToken;
    matchLater(function () { if (g.badToken === token) clearBad(g); }, 650);
    var plus = g.ui.plus;
    plus.hidden = false;
    plus.classList.remove('show');
    void plus.offsetWidth;
    plus.classList.add('show');
    var ptoken = ++g.plusToken;
    matchLater(function () { if (g.plusToken === ptoken) plus.hidden = true; }, 900);
    g.ui.live.textContent = 'Not a match. 1 second added.';
    updateClock();
  }

  function matchFinish() {
    var g = match.game;
    if (!g || !match.active) return;
    var time = elapsed(g);
    var best = bestTime();
    var isBest = !best || time < best;
    if (isBest) writePref(match.api, 'matchBest', time);
    clear(match.root);
    var box = el('section', 'md-card mt-intro mt-end');
    var h = el('h2', 'md-title', 'You finished in ' + seconds(time));
    h.tabIndex = -1;
    box.appendChild(h);
    if (isBest) box.appendChild(el('p', 'mt-new', 'New best time!'));
    else box.appendChild(el('p', 'mt-best', 'Your best time is ' + seconds(best) + '.'));
    if (g.penalty) box.appendChild(el('p', 'md-note', 'That includes ' + plural(g.penalty / 1000, 'second') + ' added for wrong matches.'));
    var row = el('div', 'md-actions');
    var again = button('Play again', 'btn', matchPlay);
    row.appendChild(again);
    row.appendChild(button('Back to flashcards', 'btn secondary', function () { match.api.goMode('flashcards'); }));
    box.appendChild(row);
    passReport(match.api, { kind: 'match', ms: time, pairs: g.pairs }, box);
    match.root.appendChild(box);
    match.game = null;
    focusQuietly(again);
  }

  document.addEventListener('keydown', function (e) {
    if (!match.active || !match.game || e.key !== 'Escape') return;
    if (typing(e.target) || inDrawer(e.target)) return;
    unselect(match.game);
  });

  Modes.learn = { start: learnStart, stop: learnStop };
  Modes.test = { start: testStart, stop: testStop };
  Modes.match = { start: matchStart, stop: matchStop };
})();
