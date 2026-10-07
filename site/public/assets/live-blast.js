/* ============================================================
   Blast: what a player sees (join/, the #jnBlast step).

   Like Quizlet Blast. A team of up to four shares one asteroid field; each
   player has a ship in a corner (theirs has a ring). A definition shows at
   the top and every asteroid carries a term. Blast the right one: the team
   scores and new asteroids fly in. A wrong one breaks apart and that ship
   recharges for a moment. The team with the most points when the clock runs
   out wins.

   The asteroids' patches and paths come from a seed the game server sends,
   so teammates with the same kind of screen see them in the same places. live-join.js owns the connection
   and calls IS8Blast.draw(view) and IS8Blast.aim(message); shots go back
   through the send function it passes in. No sound.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var send = function () {};
  var cur = null;          // the view being shown
  var offset = 0;          // server clock minus this clock
  var rocks = {};          // k -> { el, x0, y0, vx, vy }
  var ships = {};          // player id -> { el, barrel, slot }
  var shownLast = 0, stunUntil = 0, raf = 0, clock = 0, aimSent = 0, readyShown = false;
  var SLOTS = [[0.07, 0.1], [0.93, 0.1], [0.07, 0.9], [0.93, 0.9]];

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  // The same numbers on every screen for the same seed.
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Bouncing between lo and hi.
  function bounce(v, lo, hi) {
    var span = hi - lo;
    var p = ((v - lo) % (2 * span) + 2 * span) % (2 * span);
    return lo + (p > span ? 2 * span - p : p);
  }
  var clockSet = false;
  function now() { return Date.now() + offset; }
  function field() { return $('blField'); }

  // Each asteroid drifts inside its own patch of sky, so they never pile up
  // on each other: 3 by 2 patches on a wide screen, 2 by 3 on a phone. The
  // corners are left for the ships.
  var layout = { cols: 3, rows: 2, size: 100, w: 1, h: 1 };
  function measure() {
    var f = field().getBoundingClientRect();
    var tall = f.height > f.width * 1.05;
    layout.cols = tall ? 2 : 3;
    layout.rows = tall ? 3 : 2;
    layout.w = f.width || 1;
    layout.h = f.height || 1;
    var cw = f.width * 0.76 / layout.cols, ch = f.height * 0.64 / layout.rows;
    layout.size = Math.max(70, Math.min(140, Math.min(cw, ch) * 0.92));
  }
  function cellBox(cell) {
    var col = cell % layout.cols, row = Math.floor(cell / layout.cols) % layout.rows;
    var cw = 0.76 / layout.cols, ch = 0.64 / layout.rows;
    var rx = layout.size / 2 / layout.w, ry = layout.size / 2 / layout.h;
    var x1 = 0.12 + col * cw + rx, x2 = 0.12 + (col + 1) * cw - rx;
    var y1 = 0.18 + row * ch + ry, y2 = 0.18 + (row + 1) * ch - ry;
    if (x2 < x1) x1 = x2 = (x1 + x2) / 2;
    if (y2 < y1) y1 = y2 = (y1 + y2) / 2;
    return { x1: x1, x2: x2, y1: y1, y2: y2 };
  }
  function rockPos(r) {
    var t = still ? 0 : Math.max(0, now() - cur.at) / 1000;
    var box = cellBox(r.cell);
    var x = box.x2 > box.x1 ? bounce(box.x1 + r.fx * (box.x2 - box.x1) + r.vx * t, box.x1, box.x2) : box.x1;
    var y = box.y2 > box.y1 ? bounce(box.y1 + r.fy * (box.y2 - box.y1) + r.vy * t, box.y1, box.y2) : box.y1;
    return { x: x, y: y };
  }
  function sizeRock(el, text) {
    var longest = String(text).split(/\s+/).reduce(function (m, w) { return Math.max(m, w.length); }, 0);
    var px = layout.size / Math.max(7.5, longest * 0.74, Math.sqrt(text.length) * 2.2);
    el.style.width = el.style.height = layout.size + 'px';
    el.style.fontSize = Math.max(12, Math.min(17, px)) + 'px';
  }
  window.addEventListener('resize', function () {
    if (!cur) return;
    measure();
    Object.keys(rocks).forEach(function (k) { sizeRock(rocks[k].el, rocks[k].el.textContent); });
    fitPrompt();
  });
  // The definition box stays one height so the field never jumps; a long
  // definition gets smaller letters instead (Gennaro, 2026-09-29).
  function fitPrompt() {
    var t = $('blPrompt');
    var box = t.parentNode;
    var size = 20;
    t.style.fontSize = size + 'px';
    // Not on screen yet: it is fitted again once it shows.
    if (!box.clientHeight) { requestAnimationFrame(function () { if (box.clientHeight) fitPrompt(); }); return; }
    while (size > 12 && (t.scrollHeight > t.clientHeight + 1 || box.scrollHeight > box.clientHeight + 1)) {
      size -= 1;
      t.style.fontSize = size + 'px';
    }
  }

  // A real-looking asteroid: a lumpy outline, craters and a light from the
  // top left, different for every rock but the same on every teammate's
  // screen (from the rock's seed). The words sit on it, not turning.
  function asteroid(rnd) {
    var body = mk('span', 'bl-rock-body');
    var pts = [], n = 16;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
      var r = 41 + rnd() * 9 - (rnd() < 0.2 ? 5 : 0);
      pts.push((50 + Math.cos(a) * r).toFixed(1) + '% ' + (50 + Math.sin(a) * r).toFixed(1) + '%');
    }
    body.style.clipPath = 'polygon(' + pts.join(', ') + ')';
    var layers = [];
    var craters = 4 + Math.floor(rnd() * 4);
    for (var c = 0; c < craters; c++) {
      var x = 22 + rnd() * 56, y = 22 + rnd() * 56, cr = 5 + rnd() * 9;
      // A dark bowl with a bright rim on the side away from the light.
      layers.push('radial-gradient(circle at ' + (x + cr * 0.25).toFixed(1) + '% ' + (y + cr * 0.25).toFixed(1) + '%, rgba(255,240,220,.22) 0, rgba(255,240,220,0) ' + (cr * 1.25).toFixed(1) + '%)');
      layers.push('radial-gradient(circle at ' + x.toFixed(1) + '% ' + y.toFixed(1) + '%, rgba(20,14,10,.55) 0, rgba(20,14,10,.35) ' + (cr * 0.7).toFixed(1) + '%, rgba(20,14,10,0) ' + cr.toFixed(1) + '%)');
    }
    var tone = ['#8c8279', '#7d746c', '#8f8174', '#77736e'][Math.floor(rnd() * 4)];
    body.style.backgroundImage = layers.concat([
      'radial-gradient(circle at 32% 28%, rgba(255,250,240,.45) 0, rgba(255,250,240,0) 38%)',
      'radial-gradient(circle at 70% 75%, rgba(0,0,0,.6) 0, rgba(0,0,0,0) 55%)',
      'radial-gradient(circle at 40% 38%, ' + tone + ' 0, #4a433d 62%, #221e1b 100%)'
    ]).join(', ');
    body.style.animationDuration = (7 + rnd() * 6).toFixed(1) + 's';
    body.style.animationDelay = (-rnd() * 6).toFixed(1) + 's';
    return body;
  }
  function shipCenter(id) {
    var s = ships[id];
    var f = field().getBoundingClientRect();
    var slot = SLOTS[s ? s.slot : 0];
    return { x: slot[0] * f.width, y: slot[1] * f.height };
  }

  /* ---------------- drawing ---------------- */

  function buildShips(v) {
    var box = $('blShips');
    box.textContent = '';
    ships = {};
    v.blast.ships.forEach(function (s, i) {
      var el = mk('div', 'bl-ship' + (s.id === v.me ? ' mine' : '') + (s.on ? '' : ' away') + (i % 2 ? ' right' : ' left') + (i % 4 > 1 ? ' bottom' : ''));
      el.style.left = SLOTS[i % 4][0] * 100 + '%';
      el.style.top = SLOTS[i % 4][1] * 100 + '%';
      var barrel = mk('span', 'bl-barrel');
      el.appendChild(barrel);
      el.appendChild(mk('span', 'bl-ship-body', v.team ? v.team.emoji : ''));
      el.appendChild(mk('span', 'bl-ship-name', s.id === v.me ? 'You' : s.name));
      box.appendChild(el);
      ships[s.id] = { el: el, barrel: barrel, slot: i % 4 };
      // Barrels start pointing at the middle of the field.
      setAim(s.id, Math.atan2(0.5 - SLOTS[i % 4][1], 0.5 - SLOTS[i % 4][0]));
    });
  }
  function setAim(id, a) {
    var s = ships[id];
    if (s) s.barrel.style.transform = 'rotate(' + a + 'rad)';
  }

  function buildRocks(b) {
    var box = $('blRocks');
    // The last question's rocks drift away and fade while the new ones fly in
    // one after another, instead of all changing at once (Gennaro, 2026-09-29).
    [].forEach.call(box.children, function (old) {
      if (old.classList.contains('leaving')) return;
      old.classList.add('leaving');
      old.disabled = true;
      setTimeout(function () { old.remove(); }, 450);
    });
    rocks = {};
    measure();
    // Which patch each asteroid gets, the same on every teammate's screen.
    var order = b.rocks.map(function (_, i) { return i; });
    var mix = prng(b.seed);
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(mix() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
    b.rocks.forEach(function (r, i) {
      var rnd = prng(b.seed + (i + 1) * 7919);
      var speed = 0.012 + rnd() * 0.014;
      var dir = rnd() * Math.PI * 2;
      var el = mk('button', 'bl-rock');
      el.appendChild(asteroid(rnd));
      el.appendChild(mk('span', 'bl-rock-text', r.text));
      el.type = 'button';
      el.setAttribute('aria-label', 'Blast ' + r.text);
      el.addEventListener('click', function () { shoot(r.k); });
      sizeRock(el, r.text);
      el.style.animationDelay = (0.08 + i * 0.07).toFixed(2) + 's';
      box.appendChild(el);
      rocks[r.k] = { el: el, cell: order[i], fx: rnd(), fy: rnd(), vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed };
    });
    (b.gone || []).forEach(function (k) { if (rocks[k]) { rocks[k].el.remove(); delete rocks[k]; } });
  }

  function frame() {
    raf = 0;
    if (!cur || $('jnBlast').hidden) return;
    Object.keys(rocks).forEach(function (k) {
      var p = rockPos(rocks[k]);
      rocks[k].el.style.left = p.x * 100 + '%';
      rocks[k].el.style.top = p.y * 100 + '%';
    });
    $('blShips').classList.toggle('stunned', now() < stunUntil);
    raf = requestAnimationFrame(frame);
  }
  function run() { if (!raf) raf = requestAnimationFrame(frame); }

  function tickClock() {
    if (!cur) return;
    var left = Math.max(0, Math.ceil((cur.endsAt - now()) / 1000));
    $('blTime').textContent = left ? Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2) : 'Time!';
  }

  // A laser from a ship to a point, and a burst where it lands.
  function laser(fromId, k, ok) {
    var r = rocks[k];
    if (!r) return;
    var f = field().getBoundingClientRect();
    var p = rockPos(r);
    var a = shipCenter(fromId);
    var svg = $('blLasers');
    var line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', a.x);
    line.setAttribute('y1', a.y);
    line.setAttribute('x2', p.x * f.width);
    line.setAttribute('y2', p.y * f.height);
    line.setAttribute('class', 'bl-laser' + (ok ? ' ok' : ok === false ? ' bad' : ''));
    svg.appendChild(line);
    setTimeout(function () { line.remove(); }, 450);
    setAim(fromId, Math.atan2(p.y * f.height - a.y, p.x * f.width - a.x));
    if (ok === undefined) return;
    var burst = mk('span', 'bl-burst ' + (ok ? 'ok' : 'bad'));
    burst.style.left = p.x * 100 + '%';
    burst.style.top = p.y * 100 + '%';
    field().appendChild(burst);
    setTimeout(function () { burst.remove(); }, 700);
  }

  function shoot(k) {
    if (!cur || !rocks[k]) return;
    if (now() < stunUntil) { say('Your ship is recharging. Wait a moment.'); return; }
    laser(cur.me, k);
    rocks[k].el.disabled = true;
    send({ t: 'shoot', seq: cur.blast.seq, k: k });
  }
  function say(text, good) {
    var m = $('blMsg');
    m.textContent = text;
    m.className = 'bl-msg' + (good ? ' good' : '');
  }

  /* ---------------- from the game server ---------------- */

  function draw(v) {
    var b = v.blast;
    if (!b) return;
    // The quickest update gives the truest server clock (see live-join.js).
    var d = v.now - Date.now();
    if (!clockSet || d > offset) { offset = d; clockSet = true; }
    var fresh = !cur || cur.blast.seq !== b.seq;
    var last = v.last;
    // Show the shot that just happened before the field changes.
    if (last && last.at !== shownLast && cur && last.seq === cur.blast.seq) {
      shownLast = last.at;
      laser(last.pid, last.k, last.ok);
      if (last.ok) say((last.pid === v.me ? 'You' : last.by) + ' blasted it! ' + last.right + '.', true);
      else if (last.pid === v.me) say('Not that one. Your ship is recharging.');
      else say(last.by + ' hit the wrong asteroid.');
    } else if (last) {
      shownLast = last.at;
    }
    var firstTime = !cur;
    cur = { me: v.me, blast: b, at: b.at, endsAt: b.endsAt };
    stunUntil = b.stunMs ? Date.now() + offset + b.stunMs : stunUntil;
    $('blTeam').textContent = (v.team ? v.team.emoji + ' ' + v.team.name : '');
    if (v.team) $('blTeam').style.setProperty('--team', v.team.color);
    $('blScore').textContent = b.score + (b.score === 1 ? ' point' : ' points');
    var img = $('blImg');
    img.hidden = !b.img;
    if (b.img) img.src = b.img;
    if ($('blPrompt').textContent !== b.prompt) {
      $('blPrompt').textContent = b.prompt;
      fitPrompt();
    }
    $('blOthers').textContent = b.others.length ? 'Other teams: ' + b.others.map(function (o) { return o.name + ' ' + o.score; }).join(', ') : '';
    if (firstTime || Object.keys(ships).length !== b.ships.length) buildShips(v);
    b.ships.forEach(function (s) { if (ships[s.id]) ships[s.id].el.classList.toggle('away', !s.on); });
    if (fresh) buildRocks(b);
    else (b.gone || []).forEach(function (k) {
      if (rocks[k]) { var el = rocks[k].el; delete rocks[k]; el.classList.add('leaving'); el.disabled = true; setTimeout(function () { el.remove(); }, 450); }
    });
    if (!readyShown) {
      readyShown = true;
      say('Get ready! Your ship is the one with the ring. Click or tap the asteroid with the right term.', true);
    }
    clearInterval(clock);
    clock = setInterval(tickClock, 500);
    tickClock();
    run();
  }

  function aim(m) { setAim(m.pid, m.a); }

  // Your barrel follows the pointer; teammates see it move.
  document.addEventListener('pointermove', function (e) {
    if (!cur || $('jnBlast').hidden || !ships[cur.me]) return;
    var f = field().getBoundingClientRect();
    if (e.clientX < f.left || e.clientX > f.right || e.clientY < f.top || e.clientY > f.bottom) return;
    var a = shipCenter(cur.me);
    var angle = Math.atan2(e.clientY - f.top - a.y, e.clientX - f.left - a.x);
    setAim(cur.me, angle);
    if (Date.now() - aimSent > 160) { aimSent = Date.now(); send({ t: 'aim', a: angle }); }
  });

  window.IS8Blast = {
    draw: function (v, sender) { send = sender; draw(v); },
    aim: aim,
    reset: function () { cur = null; readyShown = false; shownLast = 0; clearInterval(clock); }
  };
})();
