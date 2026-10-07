/* ============================================================
   Live games: a drawing pad on the students' waiting screen (join/).
   Gennaro, 2026-09-30: something to do while the class joins. Pen, marker,
   spray, eraser, fill, line, box and circle, a palette, sizes, undo and
   redo, clear, and Save to download the picture.

   The drawing never leaves the student's device: nothing is sent to the
   game or kept in the browser. It stays on the page between rounds, so a
   student can keep adding to it while waiting for the next game.

   window.IS8Doodle.mount(box)   builds the pad inside box (once)
   ============================================================ */
(function () {
  'use strict';

  var W = 1000, H = 700;
  var COLORS = ['#1b1f2a', '#ffffff', '#868e96', '#e03131', '#f76707', '#fcc419', '#94d82d', '#2f9e44',
    '#15aabf', '#1c7ed6', '#3b5bdb', '#7048e8', '#ae3ec9', '#f06595', '#8d5524', '#e0ac69', '#ffd8a8', '#a5d8ff'];
  var TOOLS = [
    ['pen', 'Pen', '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>'],
    ['marker', 'Marker', '<path d="M6 21h6"/><path d="M9 17l-3-3 9-9 3 3z"/><path d="M6 14l-2 5 5-2"/>'],
    ['spray', 'Spray paint', '<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M10 9V6h4v3"/><circle cx="4" cy="4" r="1"/><circle cx="7" cy="3" r="1"/><circle cx="4" cy="7" r="1"/>'],
    ['eraser', 'Eraser', '<path d="M7 21h13"/><path d="M4 15l9-9 6 6-7 7H8z"/><path d="M9 10l6 6"/>'],
    ['fill', 'Fill bucket', '<path d="M5 11l7-7 7 7-7 7z"/><path d="M5 11h14"/><path d="M20 15c0 1.5 1 2.5 1 3.5a1 1 0 0 1-2 0c0-1 1-2 1-3.5z"/>'],
    ['line', 'Line', '<path d="M5 19L19 5"/>'],
    ['rect', 'Box', '<rect x="4" y="6" width="16" height="12" rx="1"/>'],
    ['circle', 'Circle', '<ellipse cx="12" cy="12" rx="8" ry="7"/>']
  ];

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(paths) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function mount(box) {
    if (!box || box.getAttribute('data-ready')) return;
    box.setAttribute('data-ready', '1');
    var state = { tool: 'pen', color: '#1b1f2a', size: 8 };

    var head = mk('div', 'dd-head');
    head.appendChild(mk('h2', 'dd-title', 'Draw while you wait'));
    head.appendChild(mk('span', 'dd-note', 'Only you can see this. It is not sent anywhere.'));
    box.appendChild(head);

    var bar = mk('div', 'dd-bar');
    var tools = mk('div', 'dd-tools');
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', 'Drawing tools');
    var toolBtns = {};
    TOOLS.forEach(function (t) {
      var b = mk('button', 'dd-tool');
      b.type = 'button';
      b.innerHTML = icon(t[2]);
      b.title = t[1];
      b.setAttribute('aria-label', t[1]);
      b.addEventListener('click', function () { pickTool(t[0]); });
      toolBtns[t[0]] = b;
      tools.appendChild(b);
    });
    bar.appendChild(tools);

    var sizeWrap = mk('label', 'dd-size');
    var dot = mk('span', 'dd-dot');
    var size = mk('input');
    size.type = 'range';
    size.min = '1';
    size.max = '60';
    size.value = String(state.size);
    size.setAttribute('aria-label', 'Brush size');
    size.addEventListener('input', function () { state.size = Number(size.value); showDot(); });
    sizeWrap.appendChild(dot);
    sizeWrap.appendChild(size);
    bar.appendChild(sizeWrap);

    var acts = mk('div', 'dd-acts');
    var undoBtn = actBtn('Undo', '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', undo);
    var redoBtn = actBtn('Redo', '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>', redo);
    var clearBtn = actBtn('Clear the page', '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>', clearAsk);
    var saveBtn = actBtn('Save my drawing', '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>', save);
    [undoBtn, redoBtn, clearBtn, saveBtn].forEach(function (b) { acts.appendChild(b); });
    bar.appendChild(acts);
    box.appendChild(bar);

    var pal = mk('div', 'dd-palette');
    pal.setAttribute('role', 'group');
    pal.setAttribute('aria-label', 'Colors');
    var swatches = [];
    COLORS.forEach(function (c) {
      var s = mk('button', 'dd-swatch');
      s.type = 'button';
      s.style.background = c;
      s.setAttribute('aria-label', 'Color ' + c);
      s.addEventListener('click', function () { pickColor(c); });
      swatches.push([c, s]);
      pal.appendChild(s);
    });
    var custom = mk('input', 'dd-custom');
    custom.type = 'color';
    custom.value = state.color;
    custom.title = 'Any color';
    custom.setAttribute('aria-label', 'Pick any color');
    custom.addEventListener('input', function () { pickColor(custom.value); });
    pal.appendChild(custom);
    box.appendChild(pal);

    var stage = mk('div', 'dd-stage');
    var cv = mk('canvas', 'dd-canvas');
    cv.width = W;
    cv.height = H;
    cv.setAttribute('aria-label', 'Drawing page');
    var over = mk('canvas', 'dd-over');
    over.width = W;
    over.height = H;
    stage.appendChild(cv);
    stage.appendChild(over);
    box.appendChild(stage);
    var g = cv.getContext('2d', { willReadFrequently: true });
    var o = over.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, W, H);

    var past = [], future = [];
    function snap() {
      past.push(g.getImageData(0, 0, W, H));
      if (past.length > 25) past.shift();
      future = [];
      refreshActs();
    }
    function undo() {
      if (!past.length) return;
      future.push(g.getImageData(0, 0, W, H));
      g.putImageData(past.pop(), 0, 0);
      refreshActs();
    }
    function redo() {
      if (!future.length) return;
      past.push(g.getImageData(0, 0, W, H));
      g.putImageData(future.pop(), 0, 0);
      refreshActs();
    }
    // Clear asks twice, like the host's End game button.
    var clearTimer = null;
    function clearAsk() {
      if (!clearBtn.classList.contains('sure')) {
        clearBtn.classList.add('sure');
        clearBtn.title = 'Press again to clear';
        clearTimer = setTimeout(function () { clearBtn.classList.remove('sure'); clearBtn.title = 'Clear the page'; }, 2500);
        return;
      }
      clearTimeout(clearTimer);
      clearBtn.classList.remove('sure');
      clearBtn.title = 'Clear the page';
      snap();
      g.fillStyle = '#fff';
      g.fillRect(0, 0, W, H);
    }
    function save() {
      var a = document.createElement('a');
      a.download = 'my-drawing.png';
      a.href = cv.toDataURL('image/png');
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    function refreshActs() {
      undoBtn.disabled = !past.length;
      redoBtn.disabled = !future.length;
    }
    function actBtn(label, paths, fn) {
      var b = mk('button', 'dd-act');
      b.type = 'button';
      b.innerHTML = icon(paths);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      return b;
    }

    function pickTool(t) {
      state.tool = t;
      Object.keys(toolBtns).forEach(function (k) { toolBtns[k].setAttribute('aria-pressed', String(k === t)); });
      stage.setAttribute('data-tool', t);
      showDot();
    }
    function pickColor(c) {
      state.color = c;
      swatches.forEach(function (x) { x[1].setAttribute('aria-pressed', String(x[0] === c)); });
      if (/^#[0-9a-f]{6}$/i.test(c)) custom.value = c;
      if (state.tool === 'eraser') pickTool('pen');
      showDot();
    }
    function showDot() {
      var d = Math.max(4, Math.min(34, state.size * 0.6));
      dot.style.width = dot.style.height = d + 'px';
      dot.style.background = state.tool === 'eraser' ? '#fff' : state.color;
    }

    // Where the pointer is, in the canvas's own pixels.
    function at(e) {
      var r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    }

    var down = null, points = [], sprayTimer = null;
    function strokeStyle(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = state.tool === 'eraser' ? '#fff' : state.color;
      ctx.lineWidth = state.tool === 'marker' ? state.size * 1.6 : state.size;
    }
    function drawPath(ctx, pts) {
      strokeStyle(ctx);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y);
      for (var i = 1; i < pts.length - 1; i++) {
        var mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
    function spray(p) {
      g.fillStyle = state.color;
      var r = state.size * 1.5 + 4;
      for (var i = 0; i < 18 + state.size; i++) {
        var a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        g.fillRect(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1.6, 1.6);
      }
    }
    function shape(ctx, a, b) {
      strokeStyle(ctx);
      ctx.beginPath();
      if (state.tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      else if (state.tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      else ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 + 0.5, Math.abs(b.y - a.y) / 2 + 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    over.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      over.setPointerCapture(e.pointerId);
      var p = at(e);
      snap();
      if (state.tool === 'fill') { flood(Math.floor(p.x), Math.floor(p.y), state.color); return; }
      down = p;
      points = [p];
      if (state.tool === 'spray') {
        spray(p);
        sprayTimer = setInterval(function () { spray(points[points.length - 1]); }, 40);
      } else if (state.tool === 'pen' || state.tool === 'eraser') {
        drawPath(g, points);
      } else if (state.tool === 'marker') {
        o.clearRect(0, 0, W, H);
        drawPath(o, points);
      }
    });
    over.addEventListener('pointermove', function (e) {
      if (!down) return;
      var p = at(e);
      var tool = state.tool;
      if (tool === 'pen' || tool === 'eraser') {
        var last = points[points.length - 1];
        points.push(p);
        strokeStyle(g);
        g.beginPath();
        g.moveTo(last.x, last.y);
        g.lineTo(p.x, p.y);
        g.stroke();
      } else if (tool === 'marker') {
        // A marker stroke is see-through, but even where it crosses itself.
        points.push(p);
        o.clearRect(0, 0, W, H);
        drawPath(o, points);
      } else if (tool === 'spray') {
        points.push(p);
        spray(p);
      } else {
        o.clearRect(0, 0, W, H);
        shape(o, down, p);
      }
    });
    function finish(e) {
      if (!down) return;
      clearInterval(sprayTimer);
      var p = e && e.clientX != null ? at(e) : points[points.length - 1];
      if (state.tool === 'marker') {
        g.save();
        g.globalAlpha = 0.45;
        g.drawImage(over, 0, 0);
        g.restore();
      } else if (['line', 'rect', 'circle'].indexOf(state.tool) !== -1) {
        shape(g, down, p);
      }
      o.clearRect(0, 0, W, H);
      down = null;
      points = [];
    }
    over.addEventListener('pointerup', finish);
    over.addEventListener('pointercancel', finish);

    // Fill: every touching pixel close to the one tapped takes the new color.
    function flood(x, y, hex) {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      var img = g.getImageData(0, 0, W, H), d = img.data;
      var n = parseInt(hex.slice(1), 16), R = n >> 16 & 255, G = n >> 8 & 255, B = n & 255;
      var i0 = (y * W + x) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
      if (Math.abs(r0 - R) + Math.abs(g0 - G) + Math.abs(b0 - B) < 6) return;
      var near = function (i) { return Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) < 90; };
      var seen = new Uint8Array(W * H), stack = [x, y];
      while (stack.length) {
        var sy = stack.pop(), sx = stack.pop();
        var lx = sx;
        while (lx > 0 && !seen[sy * W + lx - 1] && near((sy * W + lx - 1) * 4)) lx--;
        var up = false, dn = false;
        for (var cx = lx; cx < W; cx++) {
          var k = sy * W + cx;
          if (seen[k] || !near(k * 4)) break;
          seen[k] = 1;
          d[k * 4] = R; d[k * 4 + 1] = G; d[k * 4 + 2] = B; d[k * 4 + 3] = 255;
          if (sy > 0) { var u = k - W; if (!seen[u] && near(u * 4)) { if (!up) { stack.push(cx, sy - 1); up = true; } } else up = false; }
          if (sy < H - 1) { var v = k + W; if (!seen[v] && near(v * 4)) { if (!dn) { stack.push(cx, sy + 1); dn = true; } } else dn = false; }
        }
      }
      g.putImageData(img, 0, 0);
    }

    pickTool('pen');
    pickColor(state.color);
    refreshActs();
  }

  window.IS8Doodle = { mount: mount };
})();
