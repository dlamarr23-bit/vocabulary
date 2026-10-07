/* ============================================================
   Confetti and fireworks when a live game ends with a winner
   (Gennaro, 2026-09-29). Used by the host screen and every player's
   screen. Drawn on one canvas over the page that lets clicks through,
   for about seven seconds; with reduced motion there is a short shower
   of confetti and no rockets.

   window.IS8Celebrate.start({ onBurst })  onBurst(x) runs as each
   firework bursts (x from 0 to 1 across the screen), so the host screen
   can play a pop. This file makes no sound itself.
   ============================================================ */
(function () {
  'use strict';

  var COLORS = ['#f2b705', '#e63946', '#1d4ed8', '#0f9d58', '#ff7a00', '#db2777', '#00a0c4', '#6a4c93'];
  var running = null;

  function start(opts) {
    opts = opts || {};
    if (running) running.stop();
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canvas = document.createElement('canvas');
    canvas.className = 'lv-celebrate';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0;
    function size() {
      var box = canvas.getBoundingClientRect();
      W = box.width || window.innerWidth;
      H = box.height || window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };
    var confetti = [], sparks = [], rockets = [];
    var began = performance.now();
    var LAST = calm ? 1500 : (opts.duration || 7000);   // new confetti and rockets stop after this

    function addConfetti(n, fromTop) {
      for (var i = 0; i < n; i++) {
        confetti.push({
          x: fromTop ? Math.random() * W : (Math.random() < 0.5 ? 0 : W),
          y: fromTop ? -20 - Math.random() * H * 0.3 : H * (0.55 + Math.random() * 0.3),
          vx: fromTop ? (Math.random() - 0.5) * 2 : (Math.random() * 7 + 3) * (Math.random() < 0.5 ? 1 : -1),
          vy: fromTop ? Math.random() * 2 + 1.5 : -(Math.random() * 9 + 7),
          w: Math.random() * 7 + 6, h: Math.random() * 5 + 4,
          a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
          wob: Math.random() * 10, color: pick(COLORS), shape: Math.random() < 0.25 ? 'dot' : 'rect'
        });
      }
    }
    // A rocket climbs to a point in the top half, then bursts into a ring of sparks.
    function launch() {
      var x = W * (0.15 + Math.random() * 0.7);
      rockets.push({ x: x, y: H + 10, tx: x + (Math.random() - 0.5) * W * 0.15, ty: H * (0.12 + Math.random() * 0.3), color: pick(COLORS), t: 0 });
    }
    function burst(r) {
      var n = 60 + Math.floor(Math.random() * 30);
      var power = 3.5 + Math.random() * 2.5;
      var second = pick(COLORS);
      for (var i = 0; i < n; i++) {
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.1;
        var sp = power * (0.55 + Math.random() * 0.45) * 1.15;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, fade: 0.012 + Math.random() * 0.01, color: i % 3 ? r.color : second, size: Math.random() * 1.8 + 2.2 });
      }
      if (opts.onBurst) { try { opts.onBurst(r.x / W); } catch (e) { /* sound is optional */ } }
    }

    addConfetti(calm ? 80 : 160, true);
    if (!calm) addConfetti(90, false);
    var nextRocket = calm ? Infinity : began + 150;
    var nextConfetti = began + 900;
    var frame = 0;

    function tick(now) {
      var t = now - began;
      ctx.clearRect(0, 0, W, H);
      if (now >= nextRocket && t < LAST) {
        launch();
        if (Math.random() < 0.35) launch();
        nextRocket = now + 380 + Math.random() * 520;
      }
      if (!calm && now >= nextConfetti && t < LAST - 1500) {
        addConfetti(35, true);
        nextConfetti = now + 900;
      }
      // Rockets and their trails
      for (var i = rockets.length - 1; i >= 0; i--) {
        var r = rockets[i];
        r.t += 0.028;
        var e = 1 - Math.pow(1 - Math.min(1, r.t), 3);
        var px = r.x, py = r.y;
        r.x = r.x + (r.tx - r.x) * 0.06;
        r.y = H + 10 + (r.ty - H - 10) * e;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py + 14);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
        if (r.t >= 1) { burst(r); rockets.splice(i, 1); }
      }
      // Firework sparks: they slow, fall a little and fade (solid colors, so
      // they show on a light page)
      for (var j = sparks.length - 1; j >= 0; j--) {
        var s = sparks[j];
        s.vx *= 0.975; s.vy = s.vy * 0.975 + 0.05;
        s.x += s.vx; s.y += s.vy;
        s.life -= s.fade;
        if (s.life <= 0) { sparks.splice(j, 1); continue; }
        ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 1.4));
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.7 + s.life * 0.7), 0, Math.PI * 2);
        ctx.fill();
        // A short tail behind each spark
        ctx.globalAlpha *= 0.45;
        ctx.beginPath();
        ctx.arc(s.x - s.vx * 2.2, s.y - s.vy * 2.2, s.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Confetti: flutters down, turning over as it goes
      for (var k = confetti.length - 1; k >= 0; k--) {
        var c = confetti[k];
        c.vy = Math.min(c.vy + 0.18, 3.2);
        c.vx *= 0.985;
        c.wob += 0.08;
        c.x += c.vx + Math.sin(c.wob) * 0.7;
        c.y += c.vy;
        c.a += c.va;
        if (c.y > H + 30) { confetti.splice(k, 1); continue; }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.a);
        ctx.fillStyle = c.color;
        if (c.shape === 'dot') {
          ctx.beginPath();
          ctx.arc(0, 0, c.h / 2 + 1, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.scale(1, Math.cos(c.wob * 1.3));
          ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        }
        ctx.restore();
      }
      frame += 1;
      if (t < LAST || confetti.length || sparks.length || rockets.length) running.raf = requestAnimationFrame(tick);
      else running.stop();
    }

    running = {
      raf: requestAnimationFrame(tick),
      stop: function () {
        cancelAnimationFrame(running && running.raf);
        window.removeEventListener('resize', size);
        canvas.remove();
        running = null;
      }
    };
  }

  // The giant 3, 2, 1, GO! over the whole screen before a game starts
  // (Gennaro, 2026-09-29). `go` is the moment of GO by this computer's clock,
  // when answers open. Each number shows for exactly one second, counted from
  // GO (2026-09-30): 3 at three seconds before, 2 at two, 1 at one, GO for
  // most of a second after; until 3 there is "Get ready!". opts.schedule(list)
  // gets the steps still to come, [{ at, n }] with n 3, 2, 1 and 0 for GO, so
  // the host screen can set its beeps to the exact moments. Asking again for
  // the same moment does nothing.
  var counting = null;
  function countdown(go, opts) {
    opts = opts || {};
    if (counting && Math.abs(counting.go - go) < 400) return;
    if (counting) counting.stop();
    var steps = [3, 2, 1, 0].map(function (n) { return { at: go - n * 1000, n: n }; });
    var end = go + 800;
    if (Date.now() >= end) return;
    var box = document.createElement('div');
    box.className = 'lv-go ready';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'assertive');
    // A ring that bursts out from the number with each beep.
    var ring = document.createElement('span');
    ring.className = 'lv-go-ring';
    box.appendChild(ring);
    var num = document.createElement('span');
    num.className = 'lv-go-num';
    box.appendChild(num);
    document.body.appendChild(box);
    var shown = null, raf = 0, timer = 0;
    var me = counting = {
      go: go,
      stop: function () { cancelAnimationFrame(raf); clearTimeout(timer); box.remove(); if (counting === me) counting = null; }
    };
    if (opts.schedule) { try { opts.schedule(steps.filter(function (x) { return x.at > Date.now() - 60; })); } catch (e) { /* sound is optional */ } }
    function tick() {
      var now = Date.now();
      if (now >= end) { me.stop(); return; }
      var step = null;
      steps.forEach(function (x) { if (now >= x.at) step = x; });
      var n = step ? step.n : -1;
      if (n !== shown) {
        shown = n;
        num.textContent = n > 0 ? String(n) : n === 0 ? 'GO!' : 'Get ready!';
        box.className = 'lv-go' + (n > 0 ? ' n' + n : n === 0 ? ' go' : ' ready');
        // Start the pop-in again for each number.
        num.style.animation = ring.style.animation = box.style.animation = 'none';
        void num.offsetWidth;
        num.style.animation = ring.style.animation = box.style.animation = '';
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    // A backup in case the tab stops drawing frames.
    timer = setTimeout(function () { me.stop(); }, end - Date.now() + 200);
  }

  // Stage lights for the winners' reveal (Gennaro, 2026-09-30): the screen
  // goes dark and two soft spotlights from the top corners sweep the stage,
  // then settle on the empty 1st place, where the winner will rise. target()
  // gives the element to light (read every frame, so scrolling is fine).
  // The light is drawn small and stretched up, which blurs its edges for free.
  // Returns { lock(), fadeOut(ms), stop() }.
  function spotlight(target) {
    var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var canvas = document.createElement('canvas');
    canvas.className = 'lv-spot';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var small = document.createElement('canvas'), sctx = small.getContext('2d');
    var tint = document.createElement('canvas'), tctx = tint.getContext('2d');
    var SCALE = 6;
    var W = 0, H = 0, left = 0, top = 0;
    function size() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height; left = r.left; top = r.top;
      canvas.width = Math.round(W);
      canvas.height = Math.round(H);
      small.width = tint.width = Math.ceil(W / SCALE);
      small.height = tint.height = Math.ceil(H / SCALE);
    }
    size();
    window.addEventListener('resize', size);
    var began = performance.now(), locked = calm ? began : 0, fade = null, raf = 0;
    // One cone of light, from a lamp above a corner down to the spot. Its
    // foot is a flat oval lying on the floor, like light landing on a stage.
    function cone(c, sx, sy, tx, ty, half, a) {
      var g = c.createLinearGradient(sx, sy, tx, ty);
      g.addColorStop(0, 'rgba(255,255,255,' + a * 0.95 + ')');
      g.addColorStop(0.6, 'rgba(255,255,255,' + a * 0.55 + ')');
      g.addColorStop(1, 'rgba(255,255,255,' + a * 0.7 + ')');
      c.fillStyle = g;
      var ry = half * 0.3;
      c.beginPath();
      c.moveTo(sx - 3, sy);
      c.lineTo(tx - half, ty);
      // Round along the front of the oval, from its left end to its right.
      c.ellipse(tx, ty, half, ry, 0, Math.PI, 0, true);
      c.lineTo(sx + 3, sy);
      c.closePath();
      c.fill();
      // The back half of the oval, so the pool is a whole ellipse.
      c.beginPath();
      c.ellipse(tx, ty, half, ry, 0, 0, Math.PI * 2);
      c.fill();
    }
    function glow(c, x, y, rx, ry, a) {
      c.save();
      c.translate(x, y);
      c.scale(1, ry / rx);
      var g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      g.addColorStop(0.6, 'rgba(255,255,255,' + a * 0.7 + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, rx, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    function tick(now) {
      var el = target && target();
      var r = el ? el.getBoundingClientRect() : { left: W / 2 - 120, width: 240, top: H * 0.3, height: H * 0.4 };
      // The spot: the top of 1st place's block, where the winner stands
      // (2026-09-30), and the middle of the winner above it.
      var base = el && el.querySelector && el.querySelector('.lv-step-base');
      var br = base ? base.getBoundingClientRect() : null;
      var cx = r.left - left + r.width / 2;
      var floor = Math.min(H - 10, br ? br.top - top : r.top - top + r.height);
      var cy = r.top - top + (floor - (r.top - top)) * 0.55;
      var half = Math.max(80, r.width * 0.5);
      var t = (now - began) / 1000;
      // Before locking on, the beams sweep back and forth across the stage.
      var settle = locked ? Math.min(1, (now - locked) / 800) : 0;
      var ease = settle * settle * (3 - 2 * settle);
      var aimL = cx + Math.sin(t * 2.1) * W * 0.24 * (1 - ease);
      var aimR = cx + Math.sin(t * 1.7 + 2) * W * 0.24 * (1 - ease);
      var dim = fade ? Math.max(0, 1 - (now - fade.at) / fade.ms) : Math.min(1, t / 0.6);
      if (dim <= 0 && fade) { stop(); return; }
      // The light, drawn at one sixth size.
      var k = 1 / SCALE;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, small.width, small.height);
      sctx.setTransform(k, 0, 0, k, 0, 0);
      cone(sctx, W * 0.04, -30, aimL, floor, half, 0.62);
      cone(sctx, W * 0.96, -30, aimR, floor, half, 0.62);
      glow(sctx, cx, cy, half * 1.35, half * 1.5, 0.35 + 0.55 * ease);
      glow(sctx, cx, floor, half * 1.6, half * 0.45, 0.5 + 0.45 * ease);
      // Dark over everything, the light cut out of it, then a cool haze in the beams.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(3, 6, 18, ' + (0.88 * dim) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = dim;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(small, 0, 0, W, H);
      // The same light in stage blue, added on top.
      tctx.globalCompositeOperation = 'copy';
      tctx.drawImage(small, 0, 0);
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = 'rgb(110, 160, 255)';
      tctx.fillRect(0, 0, tint.width, tint.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 * dim;
      ctx.drawImage(tint, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // The lamps, glowing at the top.
      [W * 0.04, W * 0.96].forEach(function (x) {
        var g = ctx.createRadialGradient(x, 0, 0, x, 0, 60);
        g.addColorStop(0, 'rgba(225, 238, 255, ' + 0.95 * dim + ')');
        g.addColorStop(1, 'rgba(225, 238, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 60, 0, 120, 60);
      });
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      canvas.remove();
    }
    raf = requestAnimationFrame(tick);
    return {
      lock: function () { if (!locked) locked = performance.now(); },
      fadeOut: function (ms) { if (!fade) fade = { at: performance.now(), ms: ms || 800 }; },
      stop: stop
    };
  }

  window.IS8Celebrate = {
    spotlight: spotlight,
    countdown: countdown,
    start: start,
    stop: function () { if (running) running.stop(); }
  };
})();
