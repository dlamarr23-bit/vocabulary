// Superhero avatars drawn in a Blooket-style block look.
// Every avatar is a 200 x 200 SVG: a rounded square head with a darker
// bottom edge, big shiny eyes, and a costume collar with the hero's emblem.
(function (global) {
  var SKIN = { light: '#f8d3b0', fair: '#f2c29b', tan: '#c98b5e', brown: '#8d5a3b', deep: '#6e4429' };

  function c(cx, cy, r, fill, x) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" ' + (x || '') + '/>'; }
  function p(d, fill, x) { return '<path d="' + d + '" fill="' + fill + '" ' + (x || '') + '/>'; }
  function st(d, color, w, x) {
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + w +
      '" stroke-linecap="round" stroke-linejoin="round" ' + (x || '') + '/>';
  }
  function mirror(s) { return '<g transform="translate(200 0) scale(-1 1)">' + s + '</g>'; }
  function both(s) { return s + mirror(s); }
  function text(t, x, y, size, fill) {
    return '<text x="' + x + '" y="' + y + '" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="' +
      size + '" fill="' + fill + '" text-anchor="middle">' + t + '</text>';
  }

  // Costume across the bottom of the block
  function collar(fill, top) {
    top = top || 156;
    return p('M16,' + top + ' Q100,' + (top - 10) + ' 184,' + top + ' V200 H16Z', fill);
  }
  // Lower face showing under a cowl (Batman, Flash, ...)
  function jaw(skin) { return p('M44,124 Q100,114 156,124 Q154,150 136,162 H64 Q46,150 44,124Z', skin); }
  // Hair that covers the top and both sides, leaving the face open
  function hairFrame(color) {
    return p('M16,28 H184 V172 Q170,170 160,158 Q160,100 150,80 Q132,60 100,60 Q68,60 50,80 Q40,100 40,158 Q30,170 16,172Z', color);
  }
  function longHair(color, top) {
    top = top || 52;
    return both(p('M18,' + top + ' Q-2,120 4,176 Q8,192 30,188 L30,' + top + 'Z', color));
  }
  function cape(color) { return both(p('M16,154 Q32,152 46,160 L36,200 H16Z', color)); }
  function domino(color) {
    return p('M30,96 Q46,82 70,86 Q88,88 100,98 Q112,88 130,86 Q154,82 170,96 Q168,120 146,126 Q124,130 108,118 ' +
      'Q100,112 92,118 Q76,130 54,126 Q32,120 30,96Z', color);
  }
  function blush(color, op, y) {
    return both('<ellipse cx="50" cy="' + (y || 130) + '" rx="11" ry="6.5" fill="' + (color || '#ff6f86') + '" opacity="' + (op || 0.35) + '"/>');
  }

  function mouth(type, y, color) {
    y = y || 140;
    color = color || '#5a3020';
    if (type === 'open') {
      return p('M86,' + y + ' Q100,' + (y + 20) + ' 114,' + y + 'Z', color) +
        p('M92,' + (y + 6) + ' Q100,' + (y + 12) + ' 108,' + (y + 6) + ' Q100,' + (y + 2) + ' 92,' + (y + 6) + 'Z', '#ff7b8a');
    }
    if (type === 'flat') return st('M92,' + (y + 3) + ' H108', color, 4.5);
    if (type === 'smirk') return st('M88,' + (y + 2) + ' Q101,' + (y + 8) + ' 112,' + (y - 2), color, 4.5);
    if (type === 'lips') {
      return p('M88,' + y + ' Q100,' + (y + 11) + ' 112,' + y + ' Q100,' + (y + 3) + ' 88,' + y + 'Z', color === '#5a3020' ? '#d43a4a' : color);
    }
    return st('M88,' + y + ' Q100,' + (y + 10) + ' 112,' + y, color, 4.5);
  }

  // One eye. side is -1 (left) or 1 (right).
  function eye(id, side, o) {
    var r = o.r || 18, cx = 100 + side * (o.dx || 31), cy = o.y || 106;
    var rx = o.rx || r, ry = o.ry || r, rot = (o.rot || 0) * -side;
    function shape(fill, x) {
      return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')" fill="' + fill + '" ' + (x || '') + '/>';
    }
    var s = '';
    if (o.ring) s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx + o.ringW) + '" ry="' + (ry + o.ringW) + '" fill="' + o.ring + '" opacity=".8"/>';
    s += shape(o.sclera || '#fff');
    var pr = o.pr || r * 0.66, px = cx - side * (o.inward || 0), py = cy + (o.py === undefined ? 2 : o.py);
    if (o.iris) s += c(px, py, pr * 1.08, o.iris) + c(px, py, pr * 0.6, '#1b1b24');
    else s += c(px, py, pr, '#1b1b24');
    s += c((px + pr * 0.32).toFixed(1), (py - pr * 0.38).toFixed(1), (pr * 0.36).toFixed(1), '#fff') +
      c((px - pr * 0.34).toFixed(1), (py + pr * 0.36).toFixed(1), (pr * 0.15).toFixed(1), '#fff');
    if (o.lid) {
      var clip = id + '-e' + (side < 0 ? 'l' : 'r');
      var kin = o.lid === 'angry' ? 0.1 : 0.3, kout = o.lid === 'angry' ? 0.75 : 0.3;
      var inner = cx - side * (rx + 4), outer = cx + side * (rx + 4), top = cy - ry - 4;
      // The clip is a little bigger than the eye so no white edge shows above the lid
      s += '<clipPath id="' + clip + '"><ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (rx + 1.5) + '" ry="' + (ry + 1.5) +
        '" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"/></clipPath>' +
        p('M' + outer + ',' + top + ' L' + inner + ',' + top + ' L' + inner + ',' + (cy - ry * kin) + ' L' + outer + ',' + (cy - ry * kout) + 'Z',
          o.lidColor, 'clip-path="url(#' + clip + ')"');
    }
    if (o.stroke) s += shape('none', 'stroke="' + o.stroke + '" stroke-width="' + (o.strokeW || 5) + '"');
    return s;
  }
  function eyes(id, o) { o = o || {}; return eye(id, -1, o) + eye(id, 1, o); }
  // Big white lenses like Spider-Man's mask
  function lenses(id, stroke) {
    return eyes(id, { y: 102, dx: 33, rx: 25, ry: 19, rot: 22, stroke: stroke, strokeW: 6, pr: 9, inward: 3 });
  }

  function star(cx, cy, R, r, n, fill, x) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var rad = i % 2 ? r : R, a = -Math.PI / 2 + i * Math.PI / n;
      pts.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1));
    }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '" ' + (x || '') + '/>';
  }
  function bat(cx, cy, s, fill) {
    return '<path transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" fill="' + fill + '" d="M0,-2 L-2,-7 L-4,-2 ' +
      'C-8,-2 -10,-4 -11,-8 C-15,-6 -19,-3 -20,0 C-17,0 -15,2 -14,5 C-12,3 -9,3 -7,5 C-5,3 -3,4 -2,7 L0,9 L2,7 ' +
      'C3,4 5,3 7,5 C9,3 12,3 14,5 C15,2 17,0 20,0 C19,-3 15,-6 11,-8 C10,-4 8,-2 4,-2 L2,-7Z"/>';
  }
  function spider(cx, cy, s, color) {
    var legs = 'M-2,-3 L-8,-9 L-9,-15 M-3,0 L-11,-3 L-14,-8 M-3,4 L-11,7 L-14,12 M-2,7 L-7,13 L-8,18';
    return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" fill="' + color + '">' +
      '<ellipse cx="0" cy="4" rx="4" ry="7"/>' + c(0, -5, 3.4, color) + st(legs, color, 2.4) +
      '<g transform="scale(-1 1)">' + st(legs, color, 2.4) + '</g></g>';
  }
  function web(cx, cy, color, op, w) {
    var d = '', n = 12, rings = [24, 46, 70, 96, 124];
    function pt(a, r) { return (cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1); }
    for (var i = 0; i < n; i++) d += 'M' + cx + ',' + cy + ' L' + pt(i * 2 * Math.PI / n, 170) + ' ';
    rings.forEach(function (r) {
      for (var j = 0; j < n; j++) {
        var a1 = j * 2 * Math.PI / n, a2 = (j + 1) * 2 * Math.PI / n;
        d += 'M' + pt(a1, r) + ' Q' + pt((a1 + a2) / 2, r * 0.86) + ' ' + pt(a2, r) + ' ';
      }
    });
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + w + '" opacity="' + op + '"/>';
  }
  function bolt(cx, cy, s, fill, x) {
    return '<path transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" d="M4,-12 L-7,1 L0,1 L-4,13 L8,-3 L1,-3 L6,-12Z" fill="' + fill + '" ' + (x || '') + '/>';
  }

  var HEROES = [
    { key: 'batman', name: 'Batman', group: 'boy', draw: function (id) {
      var cowl = '#3b4150';
      return {
        base: cowl,
        inside: jaw(SKIN.fair) + collar('#7e8695') + both(p('M16,150 Q34,152 48,162 L40,200 H16Z', '#2c313d')),
        back: both(p('M34,54 L42,4 L66,34Z', cowl)),
        front: eyes(id, { lid: 'angry', lidColor: cowl }) + mouth('flat', 140) +
          '<ellipse cx="100" cy="172" rx="24" ry="13" fill="#f6d02f" stroke="#1d2029" stroke-width="2.5"/>' + bat(100, 172, 1.05, '#1d2029')
      };
    } },
    { key: 'wonder-woman', name: 'Wonder Woman', group: 'girl', draw: function (id) {
      var hair = '#1c1a24', gold = '#f2c230';
      return {
        base: '#e9b48c',
        back: longHair(hair),
        inside: hairFrame(hair) + p('M44,82 Q100,60 156,82 L153,90 Q100,70 47,90Z', gold) + p('M86,70 H114 L100,90Z', gold) + collar('#d42a32'),
        front: star(100, 76, 7.5, 3.2, 5, '#e0283a') + blush() + eyes(id, { iris: '#3a72d6' }) + mouth('lips') +
          st('M66,158 H80 M120,158 H134', gold, 6) + st('M72,158 L85,182 L100,166 L115,182 L128,158', gold, 6)
      };
    } },
    { key: 'superman', name: 'Superman', group: 'boy', draw: function (id) {
      var hair = '#1f2433';
      return {
        base: SKIN.light,
        inside: p('M16,28 H184 V80 Q170,60 152,62 Q132,44 104,56 Q80,46 58,58 Q36,58 16,82Z', hair) + collar('#2f62d8') + cape('#d6262c'),
        front: st('M104,57 C94,61 94,68 100,71 C106,74 103,80 96,82', hair, 5) + blush() + eyes(id, { iris: '#3a78e0' }) + mouth('smile') +
          p('M79,162 L88,154 H112 L121,162 L100,187Z', '#f7d23a', 'stroke="#d6262c" stroke-width="3" stroke-linejoin="round"') + text('S', 100, 177, 19, '#d6262c')
      };
    } },
    { key: 'supergirl', name: 'Supergirl', group: 'girl', draw: function (id) {
      var hair = '#f6d061';
      return {
        base: SKIN.light,
        back: longHair(hair),
        inside: p('M16,28 H184 V172 Q170,170 160,158 Q160,104 152,78 Q138,58 110,62 Q84,64 66,78 Q50,90 44,110 Q40,130 40,158 Q30,170 16,172Z', hair) +
          st('M150,76 Q122,68 96,72', '#e0ae38', 3) + collar('#2f62d8') + cape('#d6262c'),
        front: blush() + eyes(id, { iris: '#3a78e0' }) + mouth('smile') +
          p('M79,162 L88,154 H112 L121,162 L100,187Z', '#f7d23a', 'stroke="#d6262c" stroke-width="3" stroke-linejoin="round"') + text('S', 100, 177, 19, '#d6262c')
      };
    } },
    { key: 'spider-man', name: 'Spider-Man', group: 'boy', draw: function (id) {
      return {
        base: '#d8262d',
        inside: web(100, 104, '#6e0d10', 0.55, 2) + both(p('M16,158 Q34,154 52,166 L60,200 H16Z', '#2a52c9')),
        front: lenses(id, '#16161c') + spider(100, 174, 1, '#16161c')
      };
    } },
    { key: 'spider-gwen', name: 'Spider-Gwen', group: 'girl', draw: function (id) {
      return {
        base: '#f3f3f7',
        inside: web(100, 40, '#1d1d24', 0.45, 2) + p('M44,172 Q36,70 100,64 Q164,70 156,172Z', '#fbfbfd') +
          st('M42,172 Q32,64 100,58 Q168,64 158,172', '#f5579d', 9) + collar('#f3f3f7') +
          both(p('M16,156 Q34,154 50,162 L56,200 H16Z', '#1d1d24') + st('M22,170 L44,166', '#2bc0c5', 4)),
        front: lenses(id, '#16161c') + spider(100, 174, 0.9, '#16161c')
      };
    } },
    { key: 'iron-man', name: 'Iron Man', group: 'boy', draw: function (id) {
      return {
        base: '#c81f2e',
        inside: p('M46,62 Q100,44 154,62 L156,126 Q152,150 130,160 H70 Q48,150 44,126Z', '#f3c13a') +
          st('M58,132 L70,150 M142,132 L130,150', '#c99a1c', 3) + collar('#b01a28'),
        front: eyes(id, { ring: '#8af0ff', ringW: 4 }) + st('M86,140 H114', '#9b7412', 4) +
          c(100, 172, 16, '#8af0ff', 'opacity=".35"') + c(100, 172, 11, '#d6fbff', 'stroke="#6fd3ea" stroke-width="4"') + c(100, 172, 4.5, '#fff')
      };
    } },
    { key: 'captain-marvel', name: 'Captain Marvel', group: 'girl', draw: function (id) {
      var hair = '#f2c94c';
      return {
        base: SKIN.light,
        back: both(p('M18,56 Q4,110 10,160 L30,160 L30,56Z', hair)),
        inside: p('M16,28 H184 V156 Q172,158 162,146 Q160,100 150,76 Q130,56 104,64 Q78,58 58,72 Q42,90 40,146 Q30,158 16,156Z', hair) +
          collar('#25479f') + p('M66,150 H134 L120,200 H80Z', '#d42a32'),
        front: blush() + eyes(id, { iris: '#3a78e0' }) + mouth('smirk') + star(100, 172, 14, 6, 8, '#f6c935', 'stroke="#c9961a" stroke-width="1"')
      };
    } },
    { key: 'captain-america', name: 'Captain America', group: 'boy', draw: function (id) {
      return {
        base: '#2b58c8',
        inside: p('M30,124 Q100,112 170,124 L170,170 H30Z', SKIN.fair) + both('<ellipse cx="69" cy="106" rx="25" ry="21" fill="' + SKIN.fair + '"/>') +
          text('A', 100, 80, 32, '#fff') + collar('#1f45a8'),
        front: both(p('M18,66 L2,56 L8,70 L0,70 L8,82 L2,84 L18,94Z', '#fff', 'stroke="#c3cde0" stroke-width="1.5" stroke-linejoin="round"')) +
          blush() + eyes(id, { iris: '#3a78e0' }) + mouth('smile') + star(100, 170, 14, 6, 5, '#fff')
      };
    } },
    { key: 'black-widow', name: 'Black Widow', group: 'girl', draw: function (id) {
      var hair = '#c83b2a';
      return {
        base: SKIN.light,
        back: both(p('M18,50 Q0,100 6,158 Q16,170 32,164 L32,50Z', hair)),
        inside: p('M16,28 H184 V164 Q172,166 162,152 Q160,98 150,76 Q130,54 96,60 Q70,64 54,80 Q42,100 40,150 Q30,166 16,164Z', hair) +
          st('M60,74 Q90,58 128,64', '#a52c1e', 3) + collar('#1d1d24') + st('M100,190 V196', '#9aa1ad', 3),
        front: blush() + eyes(id, { iris: '#3f9e5a' }) + mouth('lips') + p('M89,161 H111 L100,172Z M89,183 H111 L100,172Z', '#e02b2b')
      };
    } },
    { key: 'hulk', name: 'Hulk', group: 'boy', draw: function (id) {
      var green = '#5fb847', dark = '#2b5f22';
      return {
        base: green,
        inside: p('M16,28 H184 V70 L170,60 L160,74 L146,58 L134,72 L120,56 L108,70 L96,54 L84,70 L72,56 L60,72 L48,58 L36,74 L26,62 L16,76Z', '#1e2a1f') +
          p('M16,158 L28,150 L38,160 L50,148 L62,158 L74,150 L86,160 L100,150 L114,160 L126,150 L138,158 L150,148 L162,160 L172,150 L184,158 V200 H16Z', '#7c3fb0'),
        front: eyes(id, { iris: '#3c8a2c', lid: 'angry', lidColor: green }) + both(st('M48,82 L86,94', dark, 8)) +
          '<rect x="84" y="132" width="32" height="14" rx="4" fill="#fff" stroke="' + dark + '" stroke-width="3"/>' +
          st('M84,139 H116 M92,132 V146 M100,132 V146 M108,132 V146', dark, 2)
      };
    } },
    { key: 'she-hulk', name: 'She-Hulk', group: 'girl', draw: function (id) {
      var hair = '#1f3a24';
      return {
        base: '#7bc65e',
        back: longHair(hair),
        inside: hairFrame(hair) + st('M58,78 Q100,58 142,78', '#2f5236', 3) + collar('#f2f2f6') +
          both(p('M16,154 Q34,152 52,160 L60,200 H16Z', '#7c3fb0')),
        front: blush('#e2577e', 0.35) + eyes(id, { iris: '#2f8f3a' }) + mouth('lips', 140, '#a43a78')
      };
    } },
    { key: 'thor', name: 'Thor', group: 'boy', draw: function (id) {
      var hair = '#f0c24a', disc = 'stroke="#8f9aa8" stroke-width="2"';
      return {
        base: SKIN.light,
        back: both(p('M18,64 Q2,120 8,180 L26,180 L26,64Z', hair)),
        inside: both(p('M16,60 H52 Q42,96 42,148 Q32,160 16,164Z', hair)) +
          p('M16,28 H184 V68 Q100,50 16,68Z', '#cdd5df') + st('M16,68 Q100,50 184,68', '#97a3b3', 6) +
          p('M50,116 Q54,154 100,164 Q146,154 150,116 Q140,144 100,148 Q60,144 50,116Z', '#e2a93a') +
          collar('#363d4b') + cape('#c4232b'),
        front: both(p('M24,60 Q6,48 2,22 Q12,30 18,28 Q14,40 24,42 Q20,30 26,22 Q34,40 38,54Z', '#f5f7fa', 'stroke="#b6c0cd" stroke-width="1.5"')) +
          blush() + eyes(id, { iris: '#3a78e0' }) + mouth('smile', 138, '#7a4a1a') +
          c(72, 173, 8, '#d9e0e8', disc) + c(100, 170, 8, '#d9e0e8', disc) + c(128, 173, 8, '#d9e0e8', disc)
      };
    } },
    { key: 'scarlet-witch', name: 'Scarlet Witch', group: 'girl', draw: function (id) {
      var hair = '#7a3a24', red = '#c4192e';
      return {
        base: SKIN.light,
        back: longHair(hair),
        inside: hairFrame(hair) + p('M46,86 Q66,72 84,64 L100,40 L116,64 Q134,72 154,86 L150,92 Q126,80 100,82 Q74,80 50,92Z', red) +
          collar('#8e1426') + both(p('M16,150 Q34,150 50,158 L44,200 H16Z', red)),
        front: blush() + eyes(id, { iris: '#3f9e5a' }) + mouth('lips')
      };
    } },
    { key: 'black-panther', name: 'Black Panther', group: 'boy', draw: function (id) {
      var black = '#2a2a33', silver = '#8e93a4', beads = '';
      for (var i = 0; i <= 8; i++) {
        var x = 56 + i * 11, y = 156 + 9 * Math.sin(Math.PI * i / 8);
        beads += p('M' + (x - 4.5) + ',' + y.toFixed(1) + ' L' + (x + 4.5) + ',' + y.toFixed(1) + ' L' + x + ',' + (y + 11).toFixed(1) + 'Z', '#c9ced9');
      }
      return {
        base: black,
        inside: st('M58,70 L100,94 L142,70', silver, 2.5) + both(st('M36,64 L58,96 L60,128', silver, 2.5)) +
          st('M80,152 L100,138 L120,152', silver, 2.5) + collar('#1d1d25') + beads,
        back: both(p('M36,50 Q36,18 66,30Z', black) + p('M42,44 Q43,26 60,32Z', '#43434f')),
        front: eyes(id, { lid: 'angry', lidColor: black })
      };
    } },
    { key: 'shuri', name: 'Shuri', group: 'girl', draw: function (id) {
      var hair = '#1d1512', line = '#3b2a22', beads = '';
      for (var i = 0; i <= 10; i++) {
        beads += c(50 + i * 10, (157 + 8 * Math.sin(Math.PI * i / 10)).toFixed(1), 4.5, i % 2 ? '#8f5ad6' : '#d3d7e0');
      }
      return {
        base: SKIN.deep,
        back: '<ellipse cx="100" cy="26" rx="34" ry="20" fill="' + hair + '"/>' + st('M74,20 Q100,8 126,20 M70,30 Q100,18 130,30', line, 2.5),
        inside: p('M16,28 H184 V72 Q150,52 100,54 Q50,52 16,72Z', hair) + st('M24,60 Q60,40 100,40 Q140,40 176,60 M44,48 Q100,26 156,48', line, 2.5) +
          collar('#1e1e28') + both(p('M28,178 L40,168 L52,178Z M54,186 L66,176 L78,186Z', '#8f5ad6')) + beads,
        front: blush('#e26b7e', 0.3) + eyes(id, { iris: '#4a2a14' }) + mouth('open', 138, '#4a2216')
      };
    } },
    { key: 'miles-morales', name: 'Miles Morales', group: 'boy', draw: function (id) {
      return {
        base: '#1d1d24',
        inside: web(100, 104, '#c8202a', 0.6, 1.6) + collar('#17171c'),
        front: lenses(id, '#000') + spider(100, 174, 1.3, '#d8262d')
      };
    } },
    { key: 'ms-marvel', name: 'Ms. Marvel', group: 'girl', draw: function (id) {
      var hair = '#2a1c16';
      return {
        base: SKIN.tan,
        back: longHair(hair, 56),
        inside: hairFrame(hair) + p('M56,76 Q92,56 146,70 Q112,72 92,92 Q84,80 56,76Z', hair) + collar('#2a56c8') +
          p('M28,150 Q100,140 172,150 L170,162 Q100,152 30,162Z', '#d8323a'),
        front: domino('#203b7a') + blush() + eyes(id, { iris: '#6b3f20' }) + mouth('open', 138, '#4a2216') +
          bolt(101, 175, 1, '#f7d23a', 'stroke="#c99a1c" stroke-width="1"')
      };
    } },
    { key: 'flash', name: 'Flash', group: 'boy', draw: function (id) {
      return {
        base: '#d7262c',
        inside: jaw(SKIN.fair) + collar('#c21f25'),
        front: both(p('M22,102 L6,86 L14,84 L2,60 L26,82 L18,84 L28,96Z', '#f7d23a', 'stroke="#c99a1c" stroke-width="1.5" stroke-linejoin="round"')) +
          blush() + eyes(id, {}) + mouth('smile', 140) + c(100, 172, 13, '#fff', 'stroke="#f7d23a" stroke-width="3"') +
          bolt(100, 172, 0.85, '#f7d23a', 'stroke="#d29b14" stroke-width="1"')
      };
    } },
    { key: 'batgirl', name: 'Batgirl', group: 'girl', draw: function (id) {
      var cowl = '#5a3f92', hair = '#e0552d';
      return {
        base: cowl,
        back: both(p('M18,92 Q0,140 8,192 L32,192 L32,92Z', hair) + p('M36,54 L44,12 L64,34Z', cowl)),
        inside: jaw(SKIN.light) + both(p('M16,108 Q30,116 36,150 L32,200 H16Z', hair)) + collar('#4a307e'),
        front: blush() + eyes(id, { iris: '#3f9e5a' }) + mouth('lips') + bat(100, 172, 1.1, '#f6d02f')
      };
    } },
    { key: 'wolverine', name: 'Wolverine', group: 'boy', draw: function (id) {
      var black = '#1c1c22';
      return {
        base: '#f4c430',
        inside: jaw(SKIN.fair) + both(p('M44,120 L64,126 Q60,142 68,156 Q50,152 44,136Z', '#3a2a1e')) + collar('#2c56b8') +
          p('M70,150 H130 L120,200 H80Z', '#f4c430'),
        front: both(p('M94,104 Q94,126 72,128 Q46,128 40,106 Q36,80 34,4 Q52,48 70,68 Q92,80 94,104Z', black)) +
          eyes(id, { lid: 'angry', lidColor: black }) + mouth('smirk', 142)
      };
    } },
    { key: 'storm', name: 'Storm', group: 'girl', draw: function (id) {
      var hair = '#eef1f6';
      return {
        base: SKIN.brown,
        back: p('M28,44 Q40,2 100,6 Q160,2 172,44Z', hair) + both(p('M18,40 Q-4,110 2,178 Q6,194 34,190 L34,40Z', hair)),
        inside: hairFrame(hair) + both(st('M28,60 Q24,110 30,160', '#cdd3de', 3)) +
          p('M46,80 Q100,62 154,80 L152,87 Q118,76 106,80 L100,94 L94,80 Q82,76 48,87Z', '#e6b93b') + collar('#1e1e28'),
        front: blush('#ff8fa0', 0.3) + eyes(id, { iris: '#4aa3e6' }) + mouth('lips', 140, '#b23a4a') +
          c(100, 172, 12, '#f2c230') + c(100, 172, 9, '#1e1e28') + st('M94,166 L106,178 M106,166 L94,178', '#f2c230', 3.5)
      };
    } },
    { key: 'aquaman', name: 'Aquaman', group: 'boy', draw: function (id) {
      var hair = '#f0b93a', scales = '';
      [164, 176, 188].forEach(function (y, row) {
        for (var x = 16 + (row % 2) * 7; x <= 184; x += 14) scales += 'M' + (x - 7) + ',' + y + ' Q' + x + ',' + (y + 8) + ' ' + (x + 7) + ',' + y + ' ';
      });
      return {
        base: SKIN.fair,
        back: longHair(hair, 56),
        inside: p('M16,28 H184 V164 Q170,162 160,150 Q158,100 150,76 Q128,58 104,64 Q86,56 70,64 Q50,72 44,100 Q40,130 40,150 Q30,162 16,164Z', hair) +
          collar('#f08024') + st(scales, '#c4600f', 2) + st('M16,156 Q100,146 184,156', '#2f9e55', 5),
        front: blush() + eyes(id, { iris: '#2fa3b8' }) + mouth('smile')
      };
    } },
    { key: 'catwoman', name: 'Catwoman', group: 'girl', draw: function (id) {
      var cowl = '#24232b';
      return {
        base: cowl,
        inside: jaw(SKIN.light) + st('M16,64 Q100,46 184,64', '#5a5e6a', 5) +
          both(c(74, 62, 13, '#b8bfca') + c(74, 62, 9, '#c2203b') + c(70, 58, 3, '#ff9fb0')) +
          collar('#1b1a21') + st('M100,152 V200', '#b8bfca', 3) + '<rect x="96" y="160" width="8" height="12" rx="2" fill="#b8bfca"/>',
        back: both(p('M32,58 Q30,24 50,6 Q60,26 68,34Z', cowl)),
        front: eyes(id, { iris: '#57c35f', lid: 'sly', lidColor: cowl }) + mouth('lips', 141)
      };
    } },
    { key: 'green-lantern', name: 'Green Lantern', group: 'boy', draw: function (id) {
      var green = '#1f9a45';
      return {
        base: SKIN.fair,
        inside: p('M16,28 H184 V78 Q176,60 156,58 Q130,46 96,54 Q70,56 52,68 Q30,70 16,86Z', '#3d2a1c') + collar('#1b1d22') +
          p('M64,150 H136 L124,200 H76Z', '#25a24b'),
        front: domino(green) + blush() + eyes(id, {}) + mouth('smile', 140) +
          c(100, 172, 13, '#fff') + c(100, 172, 7, 'none', 'stroke="' + green + '" stroke-width="4"') +
          '<rect x="89" y="160" width="22" height="3.5" rx="1" fill="' + green + '"/><rect x="89" y="180.5" width="22" height="3.5" rx="1" fill="' + green + '"/>'
      };
    } },
    { key: 'jean-grey', name: 'Jean Grey', group: 'girl', draw: function (id) {
      var hair = '#e0482a';
      return {
        base: SKIN.light,
        back: p('M30,46 Q44,10 100,12 Q156,10 170,46Z', hair) + both(p('M20,40 Q-6,100 2,178 Q6,194 34,190 L34,40Z', hair)),
        inside: hairFrame(hair) + st('M60,76 Q100,58 140,76', '#b83620', 3) + collar('#2d9a4b'),
        front: blush() + eyes(id, { iris: '#3f9e5a' }) + mouth('smile') +
          p('M100,156 L110,166 L128,160 L116,174 L100,188 L84,174 L72,160 L90,166Z', '#f2c230', 'stroke="#c9961a" stroke-width="1"')
      };
    } },
    { key: 'robin', name: 'Robin', group: 'boy', draw: function (id) {
      return {
        base: SKIN.fair,
        inside: p('M16,28 H184 V86 Q178,70 166,66 L172,80 Q154,60 132,58 L138,70 Q116,52 90,58 L96,66 Q70,56 50,70 L60,72 Q36,74 16,92Z', '#1b1b22') +
          collar('#d6262c') + both(p('M16,150 Q34,150 50,160 L44,200 H16Z', '#f6c722')),
        front: domino('#1b1b22') + blush() + eyes(id, {}) + mouth('open', 138) +
          c(100, 172, 12, '#f6c722', 'stroke="#1b1b22" stroke-width="2.5"') + text('R', 100, 178, 16, '#1b1b22')
      };
    } },
    { key: 'starfire', name: 'Starfire', group: 'girl', draw: function (id) {
      var hair = '#d8322e';
      return {
        base: '#f59a3c',
        back: p('M34,44 Q50,14 100,16 Q150,14 166,44Z', hair) + both(p('M20,40 Q-6,110 2,180 Q6,198 34,194 L34,40Z', hair)),
        inside: hairFrame(hair) + collar('#7a2fb0') + p('M40,150 Q100,140 160,150 L156,166 Q100,156 44,166Z', '#c9ced9'),
        front: blush('#e2475e', 0.3) + eyes(id, { sclera: '#c4f9d2', iris: '#2ec45a' }) + mouth('lips', 138, '#b8304a') +
          c(100, 165, 8, '#5df08a', 'stroke="#2fb85a" stroke-width="2"') + c(97, 162, 2.5, '#eafff0')
      };
    } },
    { key: 'cyborg', name: 'Cyborg', group: 'boy', draw: function (id) {
      var metal = '#c5ccd6', line = '#8b94a2';
      return {
        base: SKIN.deep,
        inside: p('M16,28 H184 V200 H108 L114,152 L104,134 L114,112 L104,90 L72,76 L52,50 L16,56Z', metal) +
          st('M130,40 V66 H170 M150,124 H184 M120,58 L104,90', line, 2.5) + collar('#9aa3b0'),
        front: eye(id, -1, { iris: '#4a2a14' }) + c(131, 106, 22, '#5a6270') + c(131, 106, 17, '#ff3344') + c(131, 106, 7, '#ffd0d4') +
          c(125, 99, 3.5, '#fff') + mouth('smile', 140) +
          c(100, 172, 11, '#ff3344', 'opacity=".35"') + c(100, 172, 6.5, '#ff3344') + c(100, 172, 2.5, '#fff')
      };
    } },
    { key: 'raven', name: 'Raven', group: 'girl', draw: function (id) {
      return {
        base: '#3a2d6e',
        inside: p('M50,104 Q46,64 100,60 Q154,64 150,104 L148,148 Q128,164 100,166 Q72,164 52,148Z', '#c3c0d4') +
          p('M50,100 Q46,62 100,60 Q154,62 150,100 L144,82 L132,92 L120,78 L108,90 L100,78 L92,90 L80,78 L68,92 L56,82Z', '#2a1f4a') +
          st('M48,156 Q38,60 100,54 Q162,60 152,156', '#2a2050', 5) + collar('#2f2459'),
        front: c(100, 86, 4.5, '#e0233a') + eyes(id, { iris: '#7a5ad6' }) + mouth('flat', 140) +
          c(100, 168, 9, '#e6b93b') + c(100, 168, 5, '#e0233a')
      };
    } },
    { key: 'deadpool', name: 'Deadpool', group: 'boy', draw: function (id) {
      var handle = '<g transform="rotate(-24 52 44)"><rect x="46" y="-2" width="12" height="20" rx="4" fill="#2b2b33"/>' +
        st('M47,2 L57,8 M57,2 L47,8 M47,9 L57,15 M57,9 L47,15', '#5a5a66', 2) +
        '<rect x="39" y="15" width="26" height="7" rx="2" fill="#a2a9b5"/></g>';
      return {
        base: '#c3151b',
        back: both(handle),
        inside: collar('#8f0f14') + st('M30,160 L150,200', '#1b1b22', 10),
        front: both(p('M30,102 Q32,74 68,80 Q94,86 94,106 Q92,130 64,130 Q32,128 30,102Z', '#18181e')) +
          eyes(id, { r: 12, dx: 32, y: 106 })
      };
    } },
    { key: 'harley-quinn', name: 'Harley Quinn', group: 'girl', draw: function (id) {
      var red = '#d42a32', black = '#1d1d24', ruff = '';
      for (var x = 24; x <= 176; x += 16) ruff += c(x, 154, 9, '#fff', 'stroke="#e2dcd5" stroke-width="1.5"');
      return {
        base: '#faf6f1',
        back: p('M46,50 Q6,50 6,10 Q30,24 62,30Z', red) + c(7, 9, 7.5, '#fff') + p('M154,50 Q194,50 194,10 Q170,24 138,30Z', black) + c(193, 9, 7.5, '#fff'),
        inside: p('M16,28 H100 V62 Q66,62 50,82 Q42,108 44,150 Q30,160 16,160Z', red) +
          p('M100,28 H184 V160 Q170,160 156,150 Q158,108 150,82 Q134,62 100,62Z', black) +
          p('M16,156 Q58,151 100,150 V200 H16Z', black) + p('M100,150 Q142,151 184,156 V200 H100Z', red) + ruff,
        front: p('M38,100 Q50,86 70,88 Q88,90 100,100 Q112,90 130,88 Q150,86 162,100 Q160,118 140,122 Q120,124 106,114 ' +
          'Q100,110 94,114 Q80,124 60,122 Q40,118 38,100Z', black) + blush() + eyes(id, { iris: '#3a8fe0' }) + mouth('lips', 138)
      };
    } },
    { key: 'doctor-strange', name: 'Doctor Strange', group: 'boy', draw: function (id) {
      var hair = '#1f1f29';
      return {
        base: SKIN.fair,
        inside: p('M16,28 H184 V96 Q180,72 164,62 Q136,48 100,50 Q64,48 36,62 Q20,72 16,96Z', hair) +
          both(st('M22,88 Q26,66 50,56', '#d5d9e0', 6)) + collar('#2a3d8f') +
          both(p('M16,100 Q34,110 44,130 L64,160 L52,200 H16Z', '#c42a2f') + p('M16,116 Q28,122 34,136 L44,160 L30,200 H16Z', '#a32227')),
        front: eyes(id, { iris: '#5b8fbf' }) + mouth('smirk', 141) +
          p('M80,138 Q88,127 100,132 Q112,127 120,138 Q110,134 100,136 Q90,134 80,138Z', hair) +
          p('M92,150 Q100,147 108,150 L100,162Z', hair) + c(100, 174, 12, '#e8b93a', 'stroke="#a97c16" stroke-width="2"') +
          p('M91,174 Q100,166 109,174 Q100,182 91,174Z', '#4fd06a') + c(100, 174, 3, '#1d6b30')
      };
    } },
    { key: 'wasp', name: 'Wasp', group: 'girl', draw: function (id) {
      var hair = '#1d1a22', wing = 'fill="#c9eeff" opacity=".9" stroke="#7fc8ee" stroke-width="2"';
      return {
        base: SKIN.light,
        back: both('<ellipse cx="24" cy="38" rx="24" ry="11" transform="rotate(-40 24 38)" ' + wing + '/>' +
          '<ellipse cx="12" cy="64" rx="15" ry="8" transform="rotate(-15 12 64)" ' + wing + '/>'),
        inside: p('M16,28 H184 V150 Q170,150 162,140 Q160,104 156,86 L156,78 H44 L44,86 Q40,104 38,140 Q30,150 16,150Z', hair) +
          collar('#f6d02f') + p('M16,170 Q100,160 184,170 V180 Q100,170 16,180Z', hair),
        front: both(st('M84,40 Q78,18 64,10', hair, 4) + c(64, 10, 5, '#f6d02f')) + blush() + eyes(id, { iris: '#7a4a2a' }) + mouth('lips')
      };
    } },
    { key: 'groot', name: 'Groot', group: 'boy', draw: function (id) {
      var bark = '#7a4f28', leaf = '#6cc24a';
      function lf(x, y, a) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="8" ry="4.5" transform="rotate(' + a + ' ' + x + ' ' + y + ')" fill="' + leaf + '"/>'; }
      return {
        base: '#9a6a3c',
        back: st('M58,40 L48,10 M52,22 L36,14 M100,34 V4 M100,16 L112,6 M142,40 L154,12 M150,24 L166,18', bark, 7) +
          lf(46, 7, -60) + lf(32, 13, -10) + lf(100, 2, -90) + lf(116, 4, -30) + lf(156, 9, -70) + lf(170, 17, 10),
        inside: st('M40,40 Q46,80 38,120 M162,44 Q154,90 164,130 M70,152 Q74,170 68,192 M132,152 Q126,174 134,192 M100,30 Q96,50 104,64', bark, 3.5) +
          st('M48,84 Q70,76 90,86 M110,86 Q130,76 152,84', '#6e4522', 6),
        front: lf(178, 70, 30) + eyes(id, { iris: '#5a3212', r: 19 }) + mouth('open', 138, '#3d2210')
      };
    } },
    { key: 'squirrel-girl', name: 'Squirrel Girl', group: 'girl', draw: function (id) {
      var hair = '#7a4a28', fur = '';
      for (var x = 22; x <= 178; x += 13) fur += c(x, 153, 8, '#ecd3a8');
      return {
        base: SKIN.light,
        back: p('M120,200 Q214,200 200,110 Q194,40 150,10 Q128,-2 104,8 Q140,24 150,50 Q160,80 150,120 Q140,170 120,200Z', '#b0692e') +
          st('M120,10 Q160,20 182,56 Q198,96 190,150', '#d38b45', 6) +
          both(p('M42,44 Q40,14 62,10 Q70,26 66,40Z', hair) + p('M48,38 Q48,20 60,18 Q64,28 62,36Z', '#f4a7b0')),
        inside: p('M16,28 H184 V146 Q170,148 162,138 Q160,104 154,80 Q130,66 100,70 Q70,66 46,80 Q40,104 38,138 Q30,148 16,146Z', hair) +
          collar('#8a5a34') + fur,
        front: blush() + eyes(id, { iris: '#6b3f20' }) + mouth('open', 136, '#4a2216') +
          '<rect x="95" y="136" width="10" height="7" rx="1.5" fill="#fff"/>' + st('M100,136 V143', '#d8cfc4', 1)
      };
    } },
    { key: 'hawkeye', name: 'Hawkeye', group: 'boy', draw: function (id) {
      var hair = '#e2b94e', purple = '#6b3fa8', dark = '#2a2233';
      // Arrows in the quiver over his shoulder, feathers up
      function shaft(x, y, a) {
        return '<g transform="translate(' + x + ' ' + y + ') rotate(' + a + ') scale(1.25)">' + st('M0,6 V60', '#8a6a44', 3) +
          p('M-5,15 V6 L0,0 L5,6 V15 L0,11Z', '#9b6ad8', 'stroke="' + dark + '" stroke-width="1.5" stroke-linejoin="round"') + '</g>';
      }
      return {
        base: SKIN.fair,
        back: shaft(136, 2, 12) + shaft(153, 6, 24) + shaft(169, 14, 36),
        inside: p('M16,28 H184 V80 Q176,64 160,60 Q140,50 116,54 Q124,60 120,66 Q104,56 84,58 Q62,58 46,66 Q28,68 16,84Z', hair) +
          collar(purple) + both(p('M16,156 Q34,154 52,162 L58,200 H16Z', dark)),
        front: p('M26,90 Q60,82 86,90 Q95,93 100,99 Q105,93 114,90 Q140,82 174,90 L166,112 Q158,128 134,128 Q116,128 106,117 ' +
          'Q100,111 94,117 Q84,128 66,128 Q42,128 34,112Z', purple) + eyes(id, { iris: '#3a78e0' }) + mouth('smirk', 141) +
          c(100, 172, 14, '#fff') + c(100, 172, 10, purple) + c(100, 172, 6, '#fff') + c(100, 172, 2.5, purple) +
          '<g transform="translate(100 172) rotate(-40)">' + st('M-21,0 H16', dark, 3) + p('M14,-5.5 L25,0 L14,5.5Z', dark) +
          st('M-24,-5 L-19,0 L-24,5 M-18,-5 L-13,0 L-18,5', dark, 2.2) + '</g>'
      };
    } },
    { key: 'invisible-woman', name: 'Invisible Woman', group: 'girl', draw: function (id) {
      var hair = '#f3d27a', blue = '#2f6fd8';
      return {
        base: SKIN.light,
        back: both(p('M18,50 Q2,100 6,142 Q4,160 -2,170 Q18,174 34,160 L34,50Z', hair)),
        inside: p('M16,28 H184 V156 Q172,160 162,148 Q160,100 152,78 Q140,58 120,58 Q92,60 74,74 Q56,84 46,98 Q40,124 40,148 Q30,160 16,156Z', hair) +
          st('M122,60 Q94,64 74,78 Q60,88 52,98', '#dcae4a', 3) + collar(blue),
        front: blush() + eyes(id, { iris: '#3a78e0' }) + mouth('lips') +
          c(100, 172, 14, '#fff', 'stroke="#1d1d24" stroke-width="3"') + text('4', 100, 180, 21, blue)
      };
    } },
    { key: 'ant-man', name: 'Ant-Man', group: 'boy', draw: function (id) {
      var red = '#c8202a', silver = '#c3cad5', dark = '#2a2d36', grey = '#7d8694';
      // Little ant for the chest badge
      function ant(cx, cy, s, col) {
        var legs = 'M-2,-1 L-8,-5 L-10,-9 M-2,1 L-9,2 L-12,0 M-2,3 L-8,8 L-9,12 M-1,-10 L-4,-15 L-7,-15';
        return '<g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ')" fill="' + col + '">' +
          c(0, -8, 3.6, col) + '<ellipse cx="0" cy="-1" rx="2.6" ry="3.4"/><ellipse cx="0" cy="7.5" rx="4.4" ry="5.6"/>' +
          st(legs, col, 1.8) + '<g transform="scale(-1 1)">' + st(legs, col, 1.8) + '</g></g>';
      }
      return {
        base: silver,
        inside: p('M16,28 H184 V82 Q168,64 146,66 Q100,58 54,66 Q32,64 16,82Z', red) + '<rect x="93" y="28" width="14" height="36" fill="' + dark + '"/>' +
          p('M32,98 Q42,80 70,82 Q90,84 100,94 Q110,84 130,82 Q158,80 168,98 Q166,124 144,130 Q120,134 106,121 Q100,116 94,121 ' +
            'Q80,134 56,130 Q34,124 32,98Z', dark) + collar(red) + both(p('M16,156 Q34,154 52,162 L58,200 H16Z', dark)),
        front: both(st('M72,40 L58,14 L40,8', grey, 4.5) + c(72, 40, 6, grey)) + eyes(id, { ring: '#ff4a4a', ringW: 4 }) +
          both(c(30, 134, 11, red) + c(30, 134, 5, dark) + st('M40,138 Q58,148 76,146', dark, 5)) +
          '<rect x="74" y="134" width="52" height="22" rx="10" fill="' + dark + '"/>' + st('M84,140 V150 M94,140 V150 M106,140 V150 M116,140 V150', grey, 3) +
          c(100, 172, 14, silver, 'stroke="' + dark + '" stroke-width="2.5"') + ant(100, 173, 1.05, red)
      };
    } },
    { key: 'hawkgirl', name: 'Hawkgirl', group: 'girl', draw: function (id) {
      var hair = '#c8402a', gold = '#eab53a', goldD = '#b8861c', wing = '#a8784a', wingD = '#6e4626', fan = '';
      // Feathers fanning out from behind the head
      [[-175, 56], [-155, 62], [-135, 74], [-115, 74], [-95, 72]].forEach(function (k) {
        var a = k[0] * Math.PI / 180, mx = (56 + Math.cos(a) * k[1] / 2).toFixed(1), my = (70 + Math.sin(a) * k[1] / 2).toFixed(1);
        fan += '<ellipse cx="' + mx + '" cy="' + my + '" rx="' + k[1] / 2 + '" ry="10" transform="rotate(' + k[0] + ' ' + mx + ' ' + my + ')" fill="' +
          wing + '" stroke="' + wingD + '" stroke-width="2"/>';
      });
      return {
        base: SKIN.light,
        back: both(fan) + longHair(hair, 70),
        inside: both(p('M16,80 Q32,88 38,110 Q40,140 36,160 Q28,170 16,172Z', hair)) +
          p('M16,28 H184 V90 Q170,84 162,94 Q158,124 134,128 Q114,130 106,120 L100,134 L94,120 Q86,130 66,128 Q42,124 38,94 Q30,84 16,90Z', gold) +
          st('M100,30 V112', goldD, 3) + both(p('M40,94 Q28,70 34,42 Q42,62 54,70 Q50,56 54,44 Q62,64 72,74 Q58,80 40,94Z', goldD)) +
          collar('#2e8a4a') + both(st('M30,152 L90,176', gold, 7)),
        front: eyes(id, { iris: '#3f9e5a' }) + mouth('lips', 142) +
          p('M100,158 L105,166 L126,160 Q122,172 108,176 L104,188 L100,184 L96,188 L92,176 Q78,172 74,160 L95,166Z', gold,
            'stroke="' + goldD + '" stroke-width="1.5" stroke-linejoin="round"')
      };
    } },
    { key: 'falcon', name: 'Falcon', group: 'boy', draw: function (id) {
      var red = '#d8262d', redD = '#9e1820', metal = '#9aa4b3', metalD = '#3c434f', hair = '#1d1512';
      return {
        base: SKIN.deep,
        // Metal wings rising behind the head: red top edge, stepped feathers down the outside
        back: both(p('M74,46 Q46,12 16,3 L7,14 L12,17 L3,30 L8,33 L2,47 L7,50 L2,64 L22,76Z', metal,
          'stroke="' + metalD + '" stroke-width="2.5" stroke-linejoin="round"') + st('M64,38 Q42,14 21,7', red, 4) +
          st('M12,17 L40,44 M8,33 L36,54 M7,50 L30,64', metalD, 2)),
        inside: p('M16,28 H184 V76 Q160,56 100,56 Q40,56 16,76Z', hair) + '<rect x="16" y="99" width="168" height="12" fill="#2a2a33"/>' +
          collar(red) + both(p('M16,156 Q34,154 52,162 L58,200 H16Z', '#f2f2f6')),
        front: both('<rect x="42" y="84" width="54" height="44" rx="16" fill="' + red + '" stroke="' + redD + '" stroke-width="3"/>') +
          '<rect x="94" y="98" width="12" height="8" fill="' + redD + '"/>' + eyes(id, { iris: '#4a2a14' }) + mouth('smile', 141, '#3a1c10') +
          p('M100,157 L105,165 L128,156 L124,164 L132,162 L118,174 L106,177 L100,190 L94,177 L82,174 L68,162 L76,164 L72,156 L95,165Z', '#fff',
            'stroke="#fff" stroke-width="1.5" stroke-linejoin="round"')
      };
    } },
    { key: 'gamora', name: 'Gamora', group: 'girl', draw: function (id) {
      var skin = '#4fa27a', hair = '#2a1a2a', tips = '#d93a8c', silver = '#dfe4ec', cut = id + '-tips';
      return {
        base: skin,
        back: '<clipPath id="' + cut + '"><rect x="0" y="122" width="200" height="78"/></clipPath>' +
          longHair(hair) + '<g clip-path="url(#' + cut + ')">' + longHair(tips) + '</g>',
        inside: hairFrame(hair) + '<g clip-path="url(#' + cut + ')">' + hairFrame(tips) + '</g>' +
          st('M60,76 Q100,58 140,76', '#4a2a44', 3) + collar('#2b2631') + p('M74,150 L100,176 L126,150Z', '#8a2444'),
        front: both(st('M44,120 Q46,134 60,142', silver, 4.5, 'stroke-dasharray="0.5 6.5"') + st('M47,84 Q54,76 64,74', silver, 3.5, 'stroke-dasharray="0.5 6"')) +
          eyes(id, { iris: '#7a3a1a' }) + mouth('lips', 140, '#7a2a4a') +
          p('M100,160 L110,172 L100,184 L90,172Z', silver, 'stroke="#8a929e" stroke-width="1.5"')
      };
    } },
    { key: 'nightwing', name: 'Nightwing', group: 'boy', draw: function (id) {
      var black = '#18181e', blue = '#2a7de1';
      return {
        base: SKIN.fair,
        inside: p('M16,28 H184 V120 Q172,110 164,92 Q158,72 140,62 L144,76 Q124,56 100,60 L106,70 Q82,58 62,68 L68,76 Q46,76 38,94 Q30,110 16,120Z', black) +
          collar(black) + both(p('M16,161 L28,162 L25,156 L40,162 L38,156 L56,165 Q80,171 101,178.5 V191.5 Q78,181 56,176 Q34,171 16,172Z', blue)),
        front: p('M24,88 Q46,86 70,86 Q88,88 100,98 Q112,88 130,86 Q154,86 176,88 Q168,120 146,126 Q124,130 108,118 ' +
          'Q100,112 92,118 Q76,130 54,126 Q32,120 24,88Z', black) + eyes(id, {}) + mouth('smirk', 141)
      };
    } },
    { key: 'rogue', name: 'Rogue', group: 'girl', draw: function (id) {
      var hair = '#8a4428', white = '#f4f2ee', green = '#2e9a4b', yellow = '#f2c230';
      return {
        base: SKIN.light,
        back: both(p('M20,36 Q-8,96 0,176 Q4,196 36,192 L36,36Z', hair)),
        // White streak swept from the part down the left side of her face
        inside: hairFrame(hair) + p('M120,58 Q70,34 44,64 Q26,90 30,130 Q32,150 42,162 Q40,138 42,112 Q44,90 58,78 Q82,62 120,58Z', white) +
          collar(green) + both(p('M16,156 Q50,148 74,150 L101,181 V200 H16Z', yellow)) + cape('#7a4a2a'),
        front: blush() + eyes(id, { iris: '#3f9e5a' }) + mouth('lips') + c(100, 172, 8, '#d8262d') + st('M95,167 L105,177 M105,167 L95,177', '#1d1d24', 3)
      };
    } },
    { key: 'green-arrow', name: 'Green Arrow', group: 'boy', draw: function (id) {
      var hood = '#2f7d34', dark = '#1d5523', blond = '#e0b04a';
      return {
        base: SKIN.fair,
        back: p('M56,44 Q92,30 112,0 Q122,26 146,44Z', hood),
        inside: p('M56,72 Q78,60 100,62 Q124,60 146,74 Q126,70 112,78 Q100,70 88,78 Q74,70 56,72Z', blond) +
          collar('#3d8f42') + st('M44,150 L132,200', '#7a4a2a', 9) +
          p('M16,28 H184 V200 H146 Q160,170 160,140 Q162,96 150,76 Q130,56 100,56 Q70,56 50,76 Q38,96 40,140 Q40,170 54,200 H16Z', hood) +
          st('M54,200 Q40,170 40,140 Q38,96 50,76 Q70,56 100,56 Q130,56 150,76 Q162,96 160,140 Q160,170 146,200', dark, 5),
        front: p('M46,96 Q56,84 72,86 Q90,88 100,98 Q110,88 128,86 Q144,84 154,96 Q154,120 140,126 Q122,130 108,118 ' +
          'Q100,112 92,118 Q78,130 60,126 Q46,120 46,96Z', '#2a8a35') + eyes(id, {}) +
          p('M84,135 Q92,129 100,133 Q108,129 116,135 Q108,134 100,137 Q92,134 84,135Z', blond) + mouth('smirk', 141) +
          p('M91,151 Q100,148 109,151 L100,166Z', blond) +
          '<g transform="translate(100 174) rotate(-40)">' + st('M-16,0 H10', '#f2e6b8', 3.5) + p('M8,-6 L19,0 L8,6Z', '#f2e6b8') + '</g>'
      };
    } },
    { key: 'okoye', name: 'Okoye', group: 'girl', draw: function (id) {
      var gold = '#e8b93a', goldD = '#a87c18', red = '#b8242c', rings = '';
      for (var i = 0; i < 4; i++) {
        var y = 152 + i * 8;
        rings += p('M64,' + y + ' Q100,' + (y + 8) + ' 136,' + y + ' V' + (y + 6) + ' Q100,' + (y + 14) + ' 64,' + (y + 6) + 'Z', gold,
          'stroke="' + goldD + '" stroke-width="1.5"');
      }
      return {
        base: SKIN.deep,
        inside: both(st('M22,100 Q22,66 50,44 M34,96 Q36,72 58,56', gold, 3) + c(66, 50, 3, gold) + c(60, 40, 3, gold)) +
          st('M100,34 L106,43 L100,52 L94,43Z', gold, 2.5) +
          collar(red) + both(p('M16,150 Q34,148 54,158 L48,200 H16Z', '#8e1a22') + st('M18,166 Q34,162 50,170', gold, 3)) + rings,
        front: eyes(id, { iris: '#4a2a14' }) + mouth('smirk', 136, '#3a1c10')
      };
    } },
    { key: 'shazam', name: 'Shazam', group: 'boy', draw: function (id) {
      var hair = '#1f2433', white = '#f7f5ef', gold = '#e8b93a';
      return {
        base: SKIN.fair,
        inside: p('M16,28 H184 V86 Q176,66 156,62 Q128,56 100,74 Q72,56 44,62 Q24,66 16,86Z', hair) + st('M58,48 Q80,40 98,46', '#3a4258', 3) +
          collar('#d42a32') + both(p('M16,140 Q40,140 58,158 L50,200 H16Z', white) + st('M16,140 Q40,140 58,158 L50,200', gold, 3)),
        front: blush() + eyes(id, { iris: '#3a78e0' }) + mouth('open', 138) + bolt(100, 171, 1.45, '#f7d23a', 'stroke="#c99a1c" stroke-width="1"')
      };
    } },
    { key: 'zatanna', name: 'Zatanna', group: 'girl', draw: function (id) {
      var hair = '#1c1a24', hat = '#18181e';
      return {
        base: SKIN.light,
        back: longHair(hair),
        inside: hairFrame(hair) + collar('#1d1d24') + p('M68,150 Q100,146 132,150 L106,200 H94Z', '#fff') +
          both(p('M68,150 L96,200 H82 L52,154Z', '#30303c')),
        // Top hat: brim first so the crown sits on top of it
        front: '<g transform="rotate(-6 100 46)" stroke="#44444f" stroke-width="2"><ellipse cx="100" cy="46" rx="58" ry="8" fill="' + hat + '"/>' +
          p('M64,46 V10 Q64,6 68,6 H132 Q136,6 136,10 V46 Q100,52 64,46Z', hat) + '<rect x="65" y="34" width="70" height="9" fill="#c4192e" stroke="none"/></g>' +
          blush() + eyes(id, { iris: '#3a78e0' }) + mouth('lips') +
          p('M100,158 L84,150 V166Z M100,158 L116,150 V166Z', '#1d1d24') + c(100, 158, 4, '#1d1d24') + c(100, 176, 3, '#1d1d24') + c(100, 188, 3, '#1d1d24')
      };
    } },
    { key: 'beast-boy', name: 'Beast Boy', group: 'boy', draw: function (id) {
      var skin = '#86cf55', hair = '#2e8a2e', dark = '#1d1d24', purple = '#7b44c4', paw = '#8be05a';
      return {
        base: skin,
        back: both(p('M24,86 Q6,80 0,56 Q6,92 12,112 Q16,122 24,124Z', skin) + p('M14,90 Q6,80 4,66 Q8,90 14,104Z', '#5fae3c')),
        inside: p('M16,28 H184 V92 L170,74 L166,90 L150,64 L144,80 L126,58 L120,74 L100,54 L94,72 L76,58 L72,76 L54,64 L52,82 L34,72 L36,90 L16,84Z', hair) +
          collar(dark) + p('M62,150 Q100,146 138,150 L126,200 H74Z', purple),
        front: eyes(id, { iris: '#2f8f3a' }) + mouth('open', 138, '#3d2216') + p('M90,138 L93.5,146 L97,138Z', '#fff') +
          '<ellipse cx="100" cy="178" rx="7.5" ry="6" fill="' + paw + '"/>' + c(89, 168, 3.2, paw) + c(96, 163, 3.2, paw) + c(104, 163, 3.2, paw) + c(111, 168, 3.2, paw)
      };
    } },
    { key: 'ironheart', name: 'Ironheart', group: 'girl', draw: function (id) {
      var red = '#c81f2e', gold = '#f3c13a', goldD = '#c99a1c';
      return {
        base: SKIN.deep,
        inside: p('M16,28 H184 V200 H148 Q156,178 156,150 L158,98 Q156,72 138,64 Q120,58 100,58 Q80,58 62,64 Q44,72 42,98 L44,150 Q44,178 52,200 H16Z', red) +
          st('M52,200 Q44,178 44,150 L42,98 Q44,72 62,64 Q80,58 100,58 Q120,58 138,64 Q156,72 158,98 L156,150 Q156,178 148,200', gold, 5) +
          p('M58,30 Q100,22 142,30 L138,52 Q100,44 62,52Z', gold, 'stroke="' + goldD + '" stroke-width="2"') +
          both(p('M70,38 L92,40 L90,45 L72,44Z', '#bff6ff', 'stroke="#8a5a10" stroke-width="1.5" stroke-linejoin="round"')) +
          collar('#b01a28') + both(p('M16,156 Q34,152 50,160 L44,200 H16Z', gold)),
        front: blush('#e26b7e', 0.3) + eyes(id, { iris: '#4a2a14' }) + mouth('smile', 140, '#4a2216') +
          c(100, 172, 17, '#8af0ff', 'opacity=".35"') +
          p('M100,183 C88,175 84,168 86,163 Q88,158 94,159 Q98,160 100,164 Q102,160 106,159 Q112,158 114,163 C116,168 112,175 100,183Z', '#d6fbff',
            'stroke="#6fd3ea" stroke-width="3" stroke-linejoin="round"') + c(95, 165, 2.2, '#fff')
      };
    } }
  ];

  function render(hero, size) {
    var id = 'av-' + hero.key, a = hero.draw(id);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"' + (size ? ' width="' + size + '" height="' + size + '"' : '') + '>' +
      '<title>' + hero.name + '</title>' +
      '<defs><clipPath id="' + id + '-c"><rect x="16" y="28" width="168" height="164" rx="30"/></clipPath></defs>' +
      (a.back || '') +
      '<g clip-path="url(#' + id + '-c)">' +
      '<rect x="16" y="28" width="168" height="164" fill="' + a.base + '"/>' + (a.inside || '') +
      '<rect x="16" y="180" width="168" height="12" fill="#000" opacity=".16"/>' +
      '<rect x="16" y="28" width="168" height="10" fill="#fff" opacity=".10"/>' +
      '</g>' + (a.front || '') + '</svg>';
  }

  global.SuperAvatars = { list: HEROES, render: render };
})(this);
