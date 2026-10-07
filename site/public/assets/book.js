/* Integrated Science 8: shared interactivity.
   Everything runs in the page. Nothing is sent anywhere. The only thing stored
   is a per browser record of which chapters have been opened, when each was
   last opened, and the best review score. It powers the checkmarks in the
   Contents drawer and the Continue button on the home page. */
(function () {
  'use strict';

  /* ---------- icons ---------- */
  function injectIcons() {
    document.querySelectorAll('[data-icon]').forEach(function (el) {
      var key = el.getAttribute('data-icon');
      if (window.ICONS && window.ICONS[key]) el.innerHTML = window.ICONS[key];
      else if (window.ICONS && window.ICONS.fallback) el.innerHTML = window.ICONS.fallback;
    });
  }

  /* ---------- progress, this browser only ---------- */
  var STORE_KEY = 'is8-progress-v1';

  function getProgress() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function setProgress(id, data) {
    try {
      var p = getProgress();
      p[id] = Object.assign(p[id] || {}, data);
      localStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch (e) { /* private window or storage blocked: the book still works */ }
  }
  // The home page button reads "Start with Unit 1, Chapter 1" until a chapter
  // has been opened, and after that points back to the chapter opened last.
  // It uses the same progress record as the check marks: each chapter keeps
  // the time it was last opened, and nothing else is stored.
  function initContinue() {
    var btn = document.getElementById('continue-reading');
    if (!btn) return;
    var p = getProgress();
    var last = null;
    Object.keys(p).forEach(function (id) {
      if (p[id] && p[id].opened && (!last || p[id].opened > p[last].opened)) last = id;
    });
    if (!last) return;
    var mark = document.querySelector('.drawer [data-chapter="' + last + '"]');
    var link = mark && mark.closest('a');
    if (!link) return;
    btn.href = link.getAttribute('href');
    btn.textContent = 'Continue: ' + link.textContent.trim();
  }
  function clearProgress() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing to clear */ }
  }
  function paintNavChecks() {
    var progress = getProgress();
    var done = 0;
    var all = document.querySelectorAll('.check[data-chapter]');
    all.forEach(function (el) {
      var rec = progress[el.getAttribute('data-chapter')];
      var isDone = !!(rec && (rec.visited || typeof rec.best === 'number'));
      el.classList.toggle('done', isDone);
      if (isDone) done += 1;
    });
    var note = document.getElementById('progressNote');
    if (note) note.textContent = done + ' of ' + all.length + ' chapters opened';
  }

  /* ---------- contents drawer ---------- */
  function initDrawer() {
    var openBtn = document.getElementById('openDrawer');
    var closeBtn = document.getElementById('closeDrawer');
    var drawer = document.getElementById('drawer');
    var backdrop = document.getElementById('drawerBackdrop');
    if (!drawer) return;
    function open() {
      drawer.classList.add('open');
      backdrop.classList.add('open');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
      var first = drawer.querySelector('a');
      if (first) first.focus();
    }
    function close() {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      if (openBtn) { openBtn.setAttribute('aria-expanded', 'false'); openBtn.focus(); }
    }
    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
    var reset = document.getElementById('resetProgress');
    if (reset) {
      reset.addEventListener('click', function () {
        clearProgress();
        paintNavChecks();
        reset.textContent = 'Cleared';
        setTimeout(function () { reset.textContent = 'Clear my progress'; }, 1600);
      });
    }
  }

  /* ---------- vocabulary flip cards ---------- */
  function initVocab() {
    document.querySelectorAll('.vcard').forEach(function (card) {
      function flip() {
        var open = card.classList.toggle('flipped');
        card.setAttribute('aria-pressed', open ? 'true' : 'false');
      }
      card.addEventListener('click', flip);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
      });
    });
  }

  /* ---------- shared grading helpers ---------- */
  function markChoices(scope, name, answerIndex) {
    var chosen = scope.querySelector('input[name="' + name + '"]:checked');
    var chosenIndex = chosen ? parseInt(chosen.value, 10) : -1;
    scope.querySelectorAll('.qchoice').forEach(function (cEl, idx) {
      cEl.classList.remove('correct', 'incorrect');
      if (idx === answerIndex) cEl.classList.add('correct');
      else if (idx === chosenIndex) cEl.classList.add('incorrect');
      cEl.style.pointerEvents = 'none';
    });
    return chosenIndex === answerIndex;
  }
  function clearChoices(scope) {
    scope.querySelectorAll('input[type="radio"]').forEach(function (r) { r.checked = false; });
    scope.querySelectorAll('.qchoice').forEach(function (cEl) {
      cEl.classList.remove('correct', 'incorrect');
      cEl.style.pointerEvents = '';
    });
    scope.querySelectorAll('.qfeedback').forEach(function (fb) {
      fb.classList.remove('show', 'right', 'wrong');
      fb.textContent = '';
    });
  }
  function showFeedback(fb, isCorrect, explanation) {
    if (!fb) return;
    fb.textContent = (isCorrect ? 'Correct. ' : 'Not quite. ') + explanation;
    fb.classList.add('show', isCorrect ? 'right' : 'wrong');
  }
  function scoreLine(el, right, total) {
    var pct = Math.round((right / total) * 100);
    el.textContent = 'You scored ' + right + ' of ' + total + ' (' + pct + '%)';
    el.classList.remove('good', 'bad');
    el.classList.add(pct >= 60 ? 'good' : 'bad');
    return pct;
  }

  /* ---------- chapter review ---------- */
  function initQuizzes() {
    document.querySelectorAll('.quiz').forEach(function (quizEl) {
      var chapterId = quizEl.getAttribute('data-chapter');
      var dataEl = document.getElementById(quizEl.getAttribute('data-source'));
      if (!dataEl) return;
      var questions;
      try { questions = JSON.parse(dataEl.textContent); } catch (e) { return; }

      var checkBtn = quizEl.querySelector('.js-check');
      var retryBtn = quizEl.querySelector('.js-retry');
      var scoreEl = quizEl.querySelector('.quiz-score');

      checkBtn.addEventListener('click', function () {
        var right = 0;
        var answered = 0;
        questions.forEach(function (q, i) {
          var qEl = quizEl.querySelector('.quiz-q[data-index="' + i + '"]');
          if (qEl.querySelector('input:checked')) answered += 1;
          var ok = markChoices(qEl, 'q' + i + '-' + chapterId, q.answerIndex);
          if (ok) right += 1;
          showFeedback(qEl.querySelector('.qfeedback'), ok, q.explanation);
        });
        if (!answered) { scoreEl.textContent = 'Pick an answer first'; clearChoices(quizEl); return; }
        scoreLine(scoreEl, right, questions.length);
        checkBtn.style.display = 'none';
        retryBtn.style.display = 'inline-block';
        var best = (getProgress()[chapterId] || {}).best || 0;
        setProgress(chapterId, { visited: true, best: Math.max(best, right), total: questions.length });
        paintNavChecks();
      });

      retryBtn.addEventListener('click', function () {
        clearChoices(quizEl);
        scoreEl.textContent = '';
        scoreEl.classList.remove('good', 'bad');
        checkBtn.style.display = 'inline-block';
        retryBtn.style.display = 'none';
        quizEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    });
  }

  /* ---------- design the experiment ----------
     Built from JSON because every chapter uses the same four parts: the testable
     question, the manipulated variable, the responding variable, and the
     constants and control. Only the scenario changes. */
  function initLabItems() {
    document.querySelectorAll('.lab-item').forEach(function (el) {
      var dataEl = document.getElementById(el.getAttribute('data-source'));
      if (!dataEl) return;
      var data;
      try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
      if (!data.parts || !data.parts.length) return;
      var id = el.getAttribute('data-source');

      var badge = document.createElement('span');
      badge.className = 'lab-badge';
      badge.textContent = 'Design the Experiment';
      el.appendChild(badge);

      var scenario = document.createElement('p');
      scenario.className = 'lab-scenario';
      scenario.textContent = data.scenario || '';
      el.appendChild(scenario);

      var kit = document.createElement('div');
      kit.className = 'lab-toolkit';
      kit.innerHTML =
        '<p class="lab-toolkit-title">Variables toolkit</p>' +
        '<p>In a <span class="gloss-term" data-def="An experiment that changes one factor and watches its effect on another, while keeping every other factor the same.">controlled experiment</span> you change one thing on purpose. ' +
        'The <span class="gloss-term" data-def="The one factor the experimenter changes on purpose. Also called the manipulated variable.">independent variable</span> is what you change. ' +
        'The <span class="gloss-term" data-def="The factor you measure, which changes in response to the independent variable. Also called the responding variable.">dependent variable</span> is what you measure. ' +
        'The <span class="gloss-term" data-def="Every factor deliberately kept the same across all trials, so the test stays fair.">constants</span> are everything you keep the same, and the ' +
        '<span class="gloss-term" data-def="The trial where the independent variable is left alone, used as a baseline to compare the other trials against.">control</span> is the trial you leave unchanged to compare against.</p>';
      el.appendChild(kit);

      var parts = [];
      data.parts.forEach(function (part, i) {
        var wrap = document.createElement('div');
        wrap.className = 'lab-q';
        var q = document.createElement('p');
        q.className = 'qtext';
        if (part.tag) {
          var tag = document.createElement('span');
          tag.className = 'qtag';
          tag.textContent = part.tag;
          q.appendChild(tag);
        }
        q.appendChild(document.createTextNode((i + 1) + '. ' + part.prompt));
        wrap.appendChild(q);

        var choices = document.createElement('div');
        choices.className = 'quiz-choices';
        part.choices.forEach(function (text, idx) {
          var label = document.createElement('label');
          label.className = 'qchoice';
          var input = document.createElement('input');
          input.type = 'radio';
          input.name = 'lab' + i + '-' + id;
          input.value = idx;
          label.appendChild(input);
          label.appendChild(document.createTextNode(' ' + text));
          choices.appendChild(label);
        });
        wrap.appendChild(choices);

        var fb = document.createElement('p');
        fb.className = 'qfeedback';
        wrap.appendChild(fb);
        el.appendChild(wrap);
        parts.push({ wrap: wrap, feedback: fb, data: part });
      });

      var actions = document.createElement('div');
      actions.className = 'quiz-actions';
      var checkBtn = document.createElement('button');
      checkBtn.className = 'btn';
      checkBtn.type = 'button';
      checkBtn.textContent = 'Check My Answers';
      var retryBtn = document.createElement('button');
      retryBtn.className = 'btn secondary';
      retryBtn.type = 'button';
      retryBtn.textContent = 'Try Again';
      retryBtn.style.display = 'none';
      var scoreEl = document.createElement('span');
      scoreEl.className = 'lab-score';
      actions.appendChild(checkBtn);
      actions.appendChild(retryBtn);
      actions.appendChild(scoreEl);
      el.appendChild(actions);

      checkBtn.addEventListener('click', function () {
        var right = 0;
        parts.forEach(function (p, i) {
          var ok = markChoices(p.wrap, 'lab' + i + '-' + id, p.data.answerIndex);
          if (ok) right += 1;
          showFeedback(p.feedback, ok, p.data.explanation);
        });
        scoreLine(scoreEl, right, parts.length);
        checkBtn.style.display = 'none';
        retryBtn.style.display = 'inline-block';
      });

      retryBtn.addEventListener('click', function () {
        parts.forEach(function (p) { clearChoices(p.wrap); });
        scoreEl.textContent = '';
        scoreEl.classList.remove('good', 'bad');
        checkBtn.style.display = 'inline-block';
        retryBtn.style.display = 'none';
      });
    });
  }

  /* ---------- CAST practice item ---------- */
  function initCastItems() {
    document.querySelectorAll('.cast-item').forEach(function (el) {
      var dataEl = document.getElementById(el.getAttribute('data-source'));
      if (!dataEl) return;
      var data;
      try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
      var checkBtn = el.querySelector('.js-cast-check');
      var retryBtn = el.querySelector('.js-cast-retry');
      var feedback = el.querySelector('.qfeedback');
      var name = el.getAttribute('data-name');

      if (checkBtn) {
        checkBtn.addEventListener('click', function () {
          if (!el.querySelector('input:checked')) { feedback.textContent = ''; return; }
          var ok = markChoices(el, name, data.answerIndex);
          showFeedback(feedback, ok, data.explanation);
          checkBtn.style.display = 'none';
          retryBtn.style.display = 'inline-block';
        });
      }
      if (retryBtn) {
        retryBtn.addEventListener('click', function () {
          clearChoices(el);
          checkBtn.style.display = 'inline-block';
          retryBtn.style.display = 'none';
        });
      }
    });
  }

  /* ---------- margin rail: sticky section nav, highlighted as you scroll ---------- */
  function initRailNav() {
    var rail = document.getElementById('marginRail');
    if (!rail) return;
    var sticky = document.createElement('div');
    sticky.className = 'rail-sticky';
    rail.appendChild(sticky);

    var prose = document.querySelector('.chapter-body .prose');
    if (!prose) return;
    var heads = prose.querySelectorAll('h2');
    if (heads.length < 2) return;

    var nav = document.createElement('nav');
    nav.className = 'rail-nav';
    nav.setAttribute('aria-label', 'Sections in this chapter');
    var title = document.createElement('p');
    title.className = 'rail-nav-title';
    title.textContent = 'In this chapter';
    nav.appendChild(title);

    var list = document.createElement('ol');
    var links = [];
    heads.forEach(function (h) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      list.appendChild(li);
      links.push({ a: a, h: h });
    });
    nav.appendChild(list);
    sticky.appendChild(nav);

    var ticking = false;
    function spy() {
      ticking = false;
      var active = links[0];
      links.forEach(function (item) {
        if (item.h.getBoundingClientRect().top <= 100) active = item;
      });
      links.forEach(function (item) {
        item.a.classList.toggle('active', item === active);
        if (item === active) item.a.setAttribute('aria-current', 'true');
        else item.a.removeAttribute('aria-current');
      });
    }
    function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(spy); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    spy();
  }

  /* ---------- glossary terms in the prose ---------- */
  function initGlossaryTerms() {
    var terms = document.querySelectorAll('.gloss-term');
    if (!terms.length) return;
    var rail = document.getElementById('marginRail');
    var backdrop = document.createElement('div');
    backdrop.className = 'term-popout-backdrop';
    document.body.appendChild(backdrop);
    var current = null;

    function isDesktop() { return !!rail && window.matchMedia('(min-width: 981px)').matches; }

    function closePopout() {
      if (current) {
        current.popout.remove();
        current.el.classList.remove('active');
        current.el.setAttribute('aria-expanded', 'false');
        current = null;
      }
      backdrop.classList.remove('show');
    }

    function openPopout(el) {
      if (current && current.el === el) { closePopout(); return; }
      closePopout();
      var pop = document.createElement('div');
      pop.className = 'term-popout';
      var closeBtn = document.createElement('button');
      closeBtn.className = 'pt-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close definition');
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closePopout(); });
      var termDiv = document.createElement('div');
      termDiv.className = 'pt-term';
      termDiv.textContent = el.textContent;
      var defDiv = document.createElement('p');
      defDiv.className = 'pt-def';
      defDiv.textContent = el.getAttribute('data-def') || '';
      pop.appendChild(closeBtn);
      pop.appendChild(termDiv);
      pop.appendChild(defDiv);

      if (isDesktop()) {
        var sticky = rail.querySelector('.rail-sticky');
        if (sticky) sticky.insertBefore(pop, sticky.firstChild);
        else rail.appendChild(pop);
      } else {
        pop.classList.add('mobile');
        document.body.appendChild(pop);
        backdrop.classList.add('show');
      }
      el.classList.add('active');
      el.setAttribute('aria-expanded', 'true');
      current = { el: el, popout: pop };
    }

    terms.forEach(function (el) {
      el.setAttribute('aria-expanded', 'false');
      el.addEventListener('click', function (e) { e.stopPropagation(); openPopout(el); });
    });
    backdrop.addEventListener('click', closePopout);
    document.addEventListener('click', function (e) {
      if (current && !current.popout.contains(e.target) && e.target !== current.el) closePopout();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePopout(); });
    window.addEventListener('resize', closePopout);
  }

  /* ---------- glossary page search ---------- */
  function initGlossarySearch() {
    var box = document.getElementById('glossarySearch');
    if (!box) return;
    var entries = Array.prototype.slice.call(document.querySelectorAll('.gterm'));
    var letters = Array.prototype.slice.call(document.querySelectorAll('.glossary-letter'));
    var empty = document.getElementById('glossaryEmpty');
    box.addEventListener('input', function () {
      var q = box.value.trim().toLowerCase();
      var shown = 0;
      entries.forEach(function (e) {
        var hit = !q || e.textContent.toLowerCase().indexOf(q) !== -1;
        e.style.display = hit ? '' : 'none';
        if (hit) shown += 1;
      });
      letters.forEach(function (h) {
        var any = false;
        var n = h.nextElementSibling;
        while (n && !n.classList.contains('glossary-letter')) {
          if (n.classList.contains('gterm') && n.style.display !== 'none') any = true;
          n = n.nextElementSibling;
        }
        h.style.display = any ? '' : 'none';
      });
      if (empty) empty.style.display = shown ? 'none' : '';
    });
  }

  // A drawing, table or poster wider than the screen scrolls sideways. Nothing
  // about a cut off drawing says there is more to it, so any scroller that is
  // actually clipped gets a short hint underneath it, and loses it once the
  // student has swiped to the far end.
  function initScrollHints() {
    var boxes = Array.prototype.slice.call(document.querySelectorAll('.fig-scroll, .data-table-wrap, .cast-table-wrap, .chapter-figure .poster'));
    function update() {
      boxes.forEach(function (box) {
        var hint = box.nextElementSibling && box.nextElementSibling.classList.contains('scroll-hint') ? box.nextElementSibling : null;
        var clipped = box.scrollWidth > box.clientWidth + 2;
        var atEnd = box.scrollLeft + box.clientWidth >= box.scrollWidth - 4;
        if (clipped && !atEnd && !hint) {
          hint = document.createElement('p');
          hint.className = 'scroll-hint';
          hint.textContent = box.querySelector('table') ? 'Swipe to see the whole table' : 'Swipe to see the whole drawing';
          box.parentNode.insertBefore(hint, box.nextSibling);
        } else if ((!clipped || atEnd) && hint) {
          hint.parentNode.removeChild(hint);
        }
      });
    }
    boxes.forEach(function (box) { box.addEventListener('scroll', update, { passive: true }); });
    window.addEventListener('resize', update);
    update();
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectIcons();
    initScrollHints();
    initContinue();
    initDrawer();
    initVocab();
    initRailNav();
    initLabItems();
    initGlossaryTerms();
    initQuizzes();
    initCastItems();
    initGlossarySearch();
    var id = document.body.getAttribute('data-chapter-id');
    if (id) setProgress(id, { visited: true, opened: Date.now() });
    paintNavChecks();
  });
}());
