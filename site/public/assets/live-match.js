/* ============================================================
   Match: what a player sees (join/, the #jnMatch step).

   Like Quizlet's multiplayer Match. Everyone gets the same terms and
   definitions, laid out in their own order, and races to match them all.
   Pick a term and its definition to clear the pair; a wrong pair holds the
   player for a second. First to clear every pair wins. With "Hidden cards"
   (memory mode) the cards start face down.

   live-join.js owns the connection and calls IS8Match.draw(view); each
   pair found goes back through the send function it passes in. No sound.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var send = function () {};
  var round = '', picked = null, busy = false, offset = 0, clockSet = false, startedAt = 0, finishMs = 0, clock = 0;

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

  function tick() {
    $('mtTime').textContent = finishMs ? secs(finishMs) : secs(Math.max(0, Date.now() + offset - startedAt));
  }

  function build(m) {
    var grid = $('mtGrid');
    grid.textContent = '';
    grid.classList.toggle('hidden-cards', !!m.hidden);
    picked = null;
    busy = false;
    var tiles = [];
    m.cards.forEach(function (c) {
      if (m.found.indexOf(c.k) !== -1) return;
      tiles.push({ k: c.k, side: 't', text: c.term });
      tiles.push({ k: c.k, side: 'd', text: c.def, img: c.img });
    });
    shuffle(tiles).forEach(function (t) {
      var b = mk('button', 'mt-tile');
      b.type = 'button';
      b.setAttribute('data-k', t.k);
      b.setAttribute('data-side', t.side);
      var face = mk('span', 'mt-face');
      if (t.img) {
        var im = mk('img');
        im.src = t.img;
        im.alt = '';
        face.appendChild(im);
      }
      face.appendChild(mk('span', 'mt-text', t.text));
      b.appendChild(face);
      b.appendChild(mk('span', 'mt-back', '?'));
      b.setAttribute('aria-label', m.hidden ? 'Hidden card' : t.text);
      b.addEventListener('click', function () { choose(b, t, m.hidden); });
      grid.appendChild(b);
    });
  }

  function choose(b, t, hidden) {
    if (busy || b.classList.contains('gone') || b === picked) return;
    b.classList.add('up');
    if (hidden) b.setAttribute('aria-label', t.text);
    if (!picked) { picked = b; return; }
    var a = picked;
    picked = null;
    var same = a.getAttribute('data-k') === b.getAttribute('data-k') && a.getAttribute('data-side') !== b.getAttribute('data-side');
    if (same) {
      a.classList.add('right');
      b.classList.add('right');
      setTimeout(function () { a.classList.add('gone'); b.classList.add('gone'); a.disabled = b.disabled = true; }, 250);
      send({ t: 'matched', k: Number(t.k) });
      return;
    }
    // A wrong pair: both shake, and nothing can be picked for a second.
    busy = true;
    send({ t: 'miss', k: [Number(a.getAttribute('data-k')), Number(b.getAttribute('data-k'))] });
    a.classList.add('wrong');
    b.classList.add('wrong');
    $('mtMsg').textContent = 'Not a match. Wait a second.';
    setTimeout(function () {
      [a, b].forEach(function (x) {
        x.classList.remove('wrong', 'up');
        if (hidden) x.setAttribute('aria-label', 'Hidden card');
      });
      busy = false;
      $('mtMsg').textContent = '';
    }, hidden ? 1100 : 1000);
  }

  function draw(v) {
    var m = v.match;
    if (!m) return;
    // The quickest update gives the truest server clock (see live-join.js).
    var d = v.now - Date.now();
    if (!clockSet || d > offset) { offset = d; clockSet = true; }
    startedAt = m.startedAt;
    finishMs = m.finishMs;
    $('mtHelp').textContent = m.hidden ? 'Flip two cards to find a term and its definition. Clear every pair to finish.' : 'Pick a term, then its definition. Clear every pair to finish.';
    var key = m.startedAt + ':' + m.cards.map(function (c) { return c.k; }).join(',');
    if (key !== round) { round = key; build(m); }
    $('mtFound').textContent = m.found.length + ' / ' + m.cards.length + ' pairs';
    var done = !!m.finishMs;
    $('mtGrid').hidden = done;
    $('mtDone').hidden = !done;
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
    reset: function () { round = ''; clearInterval(clock); }
  };
})();
