/* ============================================================
   Match: what a player sees (join/, the #jnMatch step).

   Like Quizlet's multiplayer Match. Everyone gets the same terms and
   definitions, laid out in their own order, and races to match them all.
   Pick a term and its definition to clear the pair. First to clear every
   pair wins. With "Hidden cards" (memory mode) the cards start face down.

   A wrong pair (Donny, 2026-10-14): until the player has cleared 2 pairs it
   holds them for a second. After that there is no wait; instead the game
   server deals them one more pair from the set, and its two cards drop into
   empty spaces on the board.

   The cards fill the screen, so nothing needs scrolling: every card is the
   same size, as many go across as gives the biggest cards, and each card's
   words get smaller until they fit.

   live-join.js owns the connection and calls IS8Match.draw(view); each
   pair found goes back through the send function it passes in. No sound.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var send = function () {};
  var round = '', picked = null, busy = false, offset = 0, clockSet = false, startedAt = 0, finishMs = 0, clock = 0;
  var hidden = false, freeAfter = 2, mostLeft = 12;
  // The board's pairs (by their number k): dealt has cards on the board,
  // cleared has been matched here or by the server.
  var dealt = {}, cleared = {};
  var wrongPair = null, wrongTimer = 0, msgTimer = 0;

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function secs(ms) { return (Math.max(0, ms) / 1000).toFixed(1) + ' s'; }
  function ordinal(n) { var t = n % 100, o = n % 10; return n + (t > 10 && t < 14 ? 'th' : o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th'); }
  function count(o) { return Object.keys(o).length; }
  function left() { return Object.keys(dealt).filter(function (k) { return !cleared[k]; }).length; }

  function tick() {
    $('mtTime').textContent = finishMs ? secs(finishMs) : secs(Math.max(0, Date.now() + offset - startedAt));
  }

  function say(text, more) {
    clearTimeout(msgTimer);
    $('mtMsg').textContent = text;
    $('mtMsg').classList.toggle('more', !!more);
    if (text && more) msgTimer = setTimeout(function () { $('mtMsg').textContent = ''; }, 1800);
  }

  /* ---------------- the cards ---------------- */

  function tile(c, side) {
    var text = side === 't' ? c.term : c.def;
    var b = mk('button', 'mt-tile');
    b.type = 'button';
    b.setAttribute('data-k', c.k);
    b.setAttribute('data-side', side);
    var face = mk('span', 'mt-face');
    if (side === 'd' && c.img) {
      var im = mk('img');
      im.src = c.img;
      im.alt = '';
      face.appendChild(im);
    }
    face.appendChild(mk('span', 'mt-text', text));
    b.appendChild(face);
    b.appendChild(mk('span', 'mt-back', '?'));
    b.setAttribute('aria-label', hidden ? 'Hidden card' : text);
    b.addEventListener('click', function () { choose(b, text); });
    b.addEventListener('animationend', function () { b.classList.remove('new'); });
    return b;
  }

  function build(m) {
    var grid = $('mtGrid');
    grid.textContent = '';
    grid.classList.toggle('hidden-cards', hidden);
    picked = null;
    busy = false;
    wrongPair = null;
    clearTimeout(wrongTimer);
    dealt = {};
    cleared = {};
    m.found.forEach(function (k) { cleared[k] = true; });
    var tiles = [];
    m.cards.forEach(function (c) {
      if (cleared[c.k]) return;
      dealt[c.k] = true;
      tiles.push(tile(c, 't'), tile(c, 'd'));
    });
    shuffle(tiles).forEach(function (b) { grid.appendChild(b); });
    layout();
  }

  // A pair the server dealt after a wrong match: each card takes a random
  // empty space, or a new one at the end when there is none.
  function addPairs(m) {
    var grid = $('mtGrid'), was = grid.children.length, added = [];
    m.found.forEach(function (k) { cleared[k] = true; });
    m.cards.forEach(function (c) {
      if (dealt[c.k] || cleared[c.k]) return;
      dealt[c.k] = true;
      [tile(c, 't'), tile(c, 'd')].forEach(function (b) {
        var holes = [].filter.call(grid.children, function (x) { return x.classList.contains('gone'); });
        if (holes.length) grid.replaceChild(b, holes[Math.floor(Math.random() * holes.length)]);
        else grid.appendChild(b);
        b.classList.add('new');
        setTimeout(function () { b.classList.remove('new'); }, 600);
        added.push(b);
      });
    });
    if (!added.length) return;
    say('Not a match: one more pair to clear.', true);
    if (grid.children.length !== was) layout();
    else added.forEach(fit);
  }

  function choose(b, text) {
    if (busy || b.classList.contains('gone') || b === picked) return;
    settle();
    b.classList.add('up');
    if (hidden) b.setAttribute('aria-label', text);
    if (!picked) { picked = b; return; }
    var a = picked;
    picked = null;
    var k = a.getAttribute('data-k');
    if (k === b.getAttribute('data-k') && a.getAttribute('data-side') !== b.getAttribute('data-side')) {
      a.classList.add('right');
      b.classList.add('right');
      cleared[k] = true;
      setTimeout(function () { a.classList.add('gone'); b.classList.add('gone'); a.disabled = b.disabled = true; }, 250);
      send({ t: 'matched', k: Number(k) });
      return;
    }
    // A wrong pair. The game server works out the same thing from the same
    // numbers, and deals the extra pair.
    var free = count(cleared) >= freeAfter && left() < mostLeft;
    send({ t: 'miss', k: [Number(a.getAttribute('data-k')), Number(b.getAttribute('data-k'))] });
    a.classList.add('wrong');
    b.classList.add('wrong');
    wrongPair = [a, b];
    if (free) {
      // No wait: the two cards turn back by themselves, or as soon as another
      // is picked. The message changes when the extra pair arrives (addPairs).
      say('Not a match.', true);
      wrongTimer = setTimeout(settle, hidden ? 900 : 450);
      return;
    }
    // Early on, nothing can be picked for a second.
    busy = true;
    say('Not a match. Wait a second.');
    wrongTimer = setTimeout(function () {
      settle();
      busy = false;
      say('');
    }, hidden ? 1100 : 1000);
  }

  // The wrong pair turns back over.
  function settle() {
    clearTimeout(wrongTimer);
    if (!wrongPair) return;
    wrongPair.forEach(function (x) {
      x.classList.remove('wrong', 'up');
      if (hidden) x.setAttribute('aria-label', 'Hidden card');
    });
    wrongPair = null;
  }

  /* ---------------- filling the screen ---------------- */

  // How many cards go across: the most that gives the biggest cards in the
  // room left below the grid's top, cards reading best at about 7 wide to 5 tall.
  function layout() {
    var grid = $('mtGrid');
    var n = grid.children.length;
    if (!n || grid.hidden || !grid.offsetWidth) return;
    var W = grid.clientWidth;
    var gap = W < 520 ? 6 : 10;
    var top = grid.getBoundingClientRect().top + (window.pageYOffset || 0);
    var H = Math.max(window.innerHeight - top - 16, 220);
    var best = null;
    for (var c = 1; c <= n; c++) {
      var r = Math.ceil(n / c);
      var w = (W - gap * (c - 1)) / c;
      var h = (H - gap * (r - 1)) / r;
      if (w < 44) break;
      var size = Math.min(w, h * 1.4);
      if (!best || size > best.size + 0.5) best = { c: c, w: w, h: h, size: size };
    }
    if (!best) return;
    var rowH = Math.floor(Math.max(52, Math.min(best.h, best.w * 1.15)));
    grid.style.setProperty('--mt-cols', best.c);
    grid.style.setProperty('--mt-row', rowH + 'px');
    grid.style.setProperty('--mt-gap', gap + 'px');
    grid.style.setProperty('--mt-pad', rowH < 120 || best.w < 140 ? '4px' : '8px');
    // A picture takes about half the card, the words the rest.
    grid.style.setProperty('--mt-img', Math.round((rowH - 20) * (rowH < 110 ? 0.42 : 0.5)) + 'px');
    [].forEach.call(grid.children, fit);
  }

  // The biggest letters (in whole pixels) that fit the card without
  // splitting a word. When even the smallest do not fit, the card's picture
  // gets smaller, then goes; only then may a long word split.
  var SMALLEST = 10;
  function fit(b) {
    if (b.classList.contains('gone')) return;
    var face = b.firstChild, text = face.lastChild, img = face.firstChild !== text ? face.firstChild : null;
    if (!face.clientWidth) return;
    text.classList.remove('squeeze');
    if (img) { img.style.height = ''; img.hidden = false; }
    var most = Math.max(SMALLEST, Math.floor(Math.min(32, b.clientHeight * 0.24, b.clientWidth * 0.15)));
    var fits = function (px) {
      text.style.fontSize = px + 'px';
      var room = face.clientHeight - (img && !img.hidden ? img.offsetHeight + 6 : 0);
      return text.offsetHeight <= room && text.scrollWidth <= text.clientWidth + 1;
    };
    var biggest = function () {
      if (fits(most)) return true;
      if (!fits(SMALLEST)) return false;
      var lo = SMALLEST, hi = most;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      return fits(lo);
    };
    if (biggest()) return;
    if (img) {
      var full = img.offsetHeight;
      if ([0.6, 0.35].some(function (share) { img.style.height = Math.round(full * share) + 'px'; return biggest(); })) return;
      img.hidden = true;
      if (biggest()) return;
    }
    text.classList.add('squeeze');
    fits(SMALLEST);
  }

  var resizing = 0;
  function refit() {
    clearTimeout(resizing);
    resizing = setTimeout(function () { if (round && !$('jnMatch').hidden) layout(); }, 80);
  }
  window.addEventListener('resize', refit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);

  /* ---------------- each update from the game ---------------- */

  function draw(v) {
    var m = v.match;
    if (!m) return;
    // The quickest update gives the truest server clock (see live-join.js).
    var d = v.now - Date.now();
    if (!clockSet || d > offset) { offset = d; clockSet = true; }
    startedAt = m.startedAt;
    finishMs = m.finishMs;
    hidden = !!m.hidden;
    if (m.freeAfter) freeAfter = m.freeAfter;
    if (m.mostLeft) mostLeft = m.mostLeft;
    $('mtHelp').textContent = (m.hidden ? 'Flip two cards to find a term and its definition.' : 'Pick a term, then its definition.') +
      ' After your first ' + freeAfter + ' pairs, a wrong match adds a pair.';
    var done = !!m.finishMs;
    $('mtGrid').hidden = done;
    $('mtDone').hidden = !done;
    // A new round: the same cards for everyone, in this player's own order.
    var key = m.startedAt + ':' + m.cards.slice(0, m.pairs || m.cards.length).map(function (c) { return c.k; }).join(',');
    if (key !== round) { round = key; build(m); } else if (!done) addPairs(m);
    $('mtFound').textContent = m.found.length + ' / ' + m.cards.length + ' pairs';
    if (done) {
      $('mtDoneText').textContent = 'You matched them all in ' + secs(m.finishMs) + '! You finished ' + ordinal(m.place) + '.';
      $('mtDoneMore').textContent = m.finished < m.players ? m.finished + ' of ' + m.players + ' players are done. Wait for the others.' : 'Everyone is done.';
    }
    clearInterval(clock);
    if (!done) clock = setInterval(tick, 100);
    tick();
  }

  window.IS8Match = {
    draw: function (v, sender) { send = sender; draw(v); },
    reset: function () { round = ''; clearInterval(clock); settle(); say(''); }
  };
})();
