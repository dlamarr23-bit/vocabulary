/* ============================================================
   Flashcard export: saves a flashcard set as a PDF or a Word file.

   Everything happens in this browser, with no library and no network:
   - Each picture is drawn onto a canvas and taken back as JPEG bytes.
   - The PDF is written out by hand with the standard Helvetica fonts, so
     words are wrapped using Helvetica's real letter widths.
   - The Word file is a small zip, stored without compression, of the XML
     parts a .docx needs.

     IS8Export.pdf(set)   gives a Promise of a PDF Blob
     IS8Export.docx(set)  gives a Promise of a .docx Blob

   set = { title, subtitle, cards: [{ term, def, img, alt }] }

   A picture that will not load, or that the browser will not let a canvas
   read (a picture from another site), is left out and the rest of the file
   is still made.
   ============================================================ */
(function () {
  'use strict';

  var PDF_TYPE = 'application/pdf';
  var DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  var str = function (v) { return v == null ? '' : String(v); };

  function readSet(set) {
    set = set || {};
    var cards = Array.isArray(set.cards) ? set.cards : [];
    return {
      title: str(set.title),
      subtitle: str(set.subtitle),
      cards: cards.map(function (c) {
        c = c || {};
        return { term: str(c.term), def: str(c.def), img: str(c.img), alt: str(c.alt) };
      }).filter(function (c) {
        // A card left completely blank in the editor is not worth a row.
        return /\S/.test(c.term + c.def) || c.img;
      })
    };
  }

  /* ---------------- pictures ---------------- */

  var MAX_PX = 600;          // longest side of a picture, in canvas pixels
  var PICTURE_WAIT = 20000;  // give up on one picture after this many ms

  function base64Bytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function fromOtherSite(src) {
    var m = /^https?:\/\/[^\/]+/i.exec(src);
    if (!m) return false;
    try { return m[0].toLowerCase() !== String(location.origin).toLowerCase(); } catch (e) { return true; }
  }

  // Draws a loaded picture on a white canvas and returns its JPEG bytes and
  // size, or null. A canvas holding a picture from another site cannot be
  // read, and toDataURL throws; the caller treats that as "no picture".
  function toJpeg(img, src) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    var vector = /\.svg(?:[?#]|$)|^data:image\/svg/i.test(src);
    if (!w || !h) {
      if (!vector) return null;
      w = 400; h = 300;   // an SVG with no size of its own
    }
    var longest = Math.max(w, h);
    // Drawings are redrawn at full size so they stay sharp; photos are only
    // ever made smaller.
    var scale = vector || longest > MAX_PX ? MAX_PX / longest : 1;
    var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    var url = canvas.toDataURL('image/jpeg', 0.85);
    var comma = url.indexOf(',');
    if (url.indexOf('data:image/jpeg') !== 0 || comma < 0) return null;
    var bytes = base64Bytes(url.slice(comma + 1));
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
    return { bytes: bytes, w: cw, h: ch };
  }

  function loadPicture(src) {
    return new Promise(function (resolve) {
      var settled = false, timer = null;
      var finish = function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      try {
        var img = new Image();
        if (fromOtherSite(src)) img.crossOrigin = 'anonymous';
        img.onload = function () {
          try { finish(toJpeg(img, src)); } catch (e) { finish(null); }
        };
        img.onerror = function () { finish(null); };
        timer = setTimeout(function () { finish(null); }, PICTURE_WAIT);
        img.src = src;
      } catch (e) {
        finish(null);
      }
    });
  }

  // One entry per card: { bytes, w, h } or null. A picture used on several
  // cards is loaded once, and the same object comes back for each of them.
  function loadPictures(cards) {
    var seen = {};
    return Promise.all(cards.map(function (c) {
      if (!c.img) return null;
      if (!seen[c.img]) seen[c.img] = loadPicture(c.img);
      return seen[c.img];
    }));
  }

  function fit(w, h, maxW, maxH) {
    var s = Math.min(maxW / w, maxH / h);
    return { w: w * s, h: h * s };
  }

  /* ---------------- bytes ---------------- */

  // A string whose characters are all 0..255, as bytes.
  function latin1Bytes(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
    return out;
  }

  function utf8Bytes(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
      }
      if (c >= 0xD800 && c <= 0xDFFF) c = 0xFFFD;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  /* ============================================================
     PDF
     ============================================================ */

  // Helvetica and Helvetica-Bold widths (thousandths of the font size) for
  // WinAnsi codes 32..255, from Adobe's standard font metrics.
  var HELV = [
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,
    556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,
    0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,
    278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,
    400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,
    667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,
    722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,
    556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,
    556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500
  ];
  var HELV_BOLD = [
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,
    556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,
    0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,
    278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,
    400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,
    722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,
    722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,
    556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,
    611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556
  ];
  var FONTS = {
    regular: { name: '/F1', widths: HELV },
    bold: { name: '/F2', widths: HELV_BOLD }
  };

  // Characters above Latin-1 that WinAnsi still has, at codes 128..159.
  var WIN_ANSI = {
    0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134,
    0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140,
    0x017D: 142, 0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149,
    0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155,
    0x0153: 156, 0x017E: 158, 0x0178: 159
  };
  // Close stand-ins for common characters WinAnsi does not have.
  var STAND_IN = {
    0x2010: '-', 0x2011: '-', 0x2012: '-', 0x2015: '-', 0x2043: '-', 0x2212: '-',
    0x201B: "'", 0x2032: "'", 0x201F: '"', 0x2033: '"',
    0x2190: '<-', 0x2192: '->', 0x2194: '<->', 0x21D2: '=>', 0x21CC: '<=>',
    0x2264: '<=', 0x2265: '>=', 0x2260: '/=', 0x2248: '~', 0x223C: '~',
    0x2044: '/', 0x2215: '/', 0x2217: '*', 0x2219: '\xB7', 0x22C5: '\xB7', 0x2027: '\xB7',
    0x25CF: '\x95', 0x25E6: 'o', 0x2713: 'v', 0x2717: 'x', 0x03BC: '\xB5',
    0x2070: '0', 0x2074: '4', 0x2075: '5', 0x2076: '6', 0x2077: '7', 0x2078: '8',
    0x2079: '9', 0x207A: '+', 0x207B: '-',
    0x2080: '0', 0x2081: '1', 0x2082: '2', 0x2083: '3', 0x2084: '4', 0x2085: '5',
    0x2086: '6', 0x2087: '7', 0x2088: '8', 0x2089: '9',
    0x0394: 'Delta ', 0x03B1: 'alpha', 0x03B2: 'beta', 0x03B3: 'gamma', 0x03BB: 'lambda',
    0x03C0: 'pi', 0x03A9: 'Ohm',
    0x0141: 'L', 0x0142: 'l', 0x0110: 'D', 0x0111: 'd', 0x0126: 'H', 0x0127: 'h', 0x0131: 'i'
  };

  // Turns any text into WinAnsi bytes (a string of codes 0..255). Line
  // breaks are kept as "\n"; anything WinAnsi cannot show becomes the
  // nearest plain letter, or "?".
  function winAnsi(text) {
    text = str(text).replace(/\r\n?/g, '\n');
    if (text.normalize) text = text.normalize('NFC');
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
        var d = text.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { i++; out += '?'; continue; }
      }
      if (c === 10 || c === 0x2028 || c === 0x2029) out += '\n';
      else if (c === 9) out += ' ';
      else if (c >= 32 && c <= 126) out += text.charAt(i);
      else if (c < 160) { /* control characters are dropped */ }
      else if (c === 0xAD) { /* a soft hyphen never shows */ }
      else if (c <= 255) out += text.charAt(i);
      else if (WIN_ANSI[c]) out += String.fromCharCode(WIN_ANSI[c]);
      else if (STAND_IN[c]) out += STAND_IN[c];
      else if ((c >= 0x2000 && c <= 0x200A) || c === 0x205F || c === 0x3000) out += ' ';
      else if (c === 0x202F) out += '\xA0';
      else if ((c >= 0x200B && c <= 0x200D) || c === 0x2060 || c === 0xFEFF) { /* invisible */ }
      else {
        // A letter with an accent WinAnsi lacks: keep the plain letter.
        var base = text.charAt(i).normalize ? text.charAt(i).normalize('NFD').charAt(0) : '';
        var b = base.charCodeAt(0);
        out += base && b >= 32 && b <= 126 ? base : '?';
      }
    }
    return out;
  }

  function measure(s, font, size) {
    var w = 0, widths = font.widths;
    for (var i = 0; i < s.length; i++) w += widths[s.charCodeAt(i) - 32] || 0;
    return w * size / 1000;
  }

  // Breaks WinAnsi text into lines no wider than maxW. Lines break at
  // spaces, or just after a hyphen; a word longer than a whole line is cut.
  function wrap(s, font, size, maxW) {
    var lines = [];
    s.split('\n').forEach(function (para) {
      var words = para.split(' ').filter(function (w) { return w !== ''; });
      var line = '';
      words.forEach(function (word) {
        var pieces = word.match(/[^-]+-*|-+/g) || [word];
        pieces.forEach(function (piece, j) {
          var trial = line + (j === 0 && line ? ' ' : '') + piece;
          if (measure(trial, font, size) <= maxW) { line = trial; return; }
          if (line) lines.push(line);
          while (piece.length > 1 && measure(piece, font, size) > maxW) {
            var n = piece.length - 1;
            while (n > 1 && measure(piece.slice(0, n), font, size) > maxW) n--;
            lines.push(piece.slice(0, n));
            piece = piece.slice(n);
          }
          line = piece;
        });
      });
      if (line || !lines.length) lines.push(line);
    });
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  // Shortens a line to fit maxW, ending it with an ellipsis (code 133).
  function clip(s, font, size, maxW) {
    if (measure(s, font, size) <= maxW) return s;
    while (s.length && measure(s + '\x85', font, size) > maxW) s = s.slice(0, -1);
    return s.replace(/\s+$/, '') + '\x85';
  }

  var pdfString = function (s) { return '(' + s.replace(/[\\()]/g, '\\$&') + ')'; };
  var num = function (v) { return String(Math.round(v * 100) / 100); };

  function pdfTextOp(s, font, size, x, y, gray) {
    return 'BT ' + num(gray || 0) + ' g ' + font.name + ' ' + num(size) + ' Tf ' +
      num(x) + ' ' + num(y) + ' Td ' + pdfString(s) + ' Tj ET\n';
  }

  // The title of the document as the reader shows it: UTF-16 with a BOM.
  function pdfUnicode(s) {
    var hex = 'FEFF';
    for (var i = 0; i < s.length; i++) hex += ('000' + s.charCodeAt(i).toString(16).toUpperCase()).slice(-4);
    return '<' + hex + '>';
  }

  var PAGE_W = 612, PAGE_H = 792, MARGIN = 54;
  var TABLE_W = PAGE_W - 2 * MARGIN;
  var COL_W = [TABLE_W * 0.30, TABLE_W * 0.48, TABLE_W * 0.22];
  var PAD_X = 6, PAD_Y = 7;
  var BODY = 11, LEAD = 14, ASCENT = 9, TEXT_EXTRA = 3;
  var PIC_W = COL_W[2] - 8, PIC_H = 80;
  var LINE_GRAY = 0.8, HEAD_FILL = 0.92, SUB_GRAY = 0.3, FOOT_GRAY = 0.45;
  var FOOT_Y = 34, FOOT_SIZE = 9;

  var textHeight = function (n) { return n ? (n - 1) * LEAD + ASCENT + TEXT_EXTRA : 0; };

  // Lays the set out page by page. Each page is { ops, images } where ops is
  // the page's drawing commands and images lists the pictures it uses.
  function layoutPdf(set, pics) {
    var pages = [], page = null, y = 0, fresh = true;
    var reg = FONTS.regular, bold = FONTS.bold;
    var colX = [MARGIN, MARGIN + COL_W[0], MARGIN + COL_W[0] + COL_W[1]];

    function hline(yy, gray, width) {
      page.ops.push(num(gray) + ' G ' + num(width) + ' w ' + num(MARGIN) + ' ' + num(yy) + ' m ' +
        num(MARGIN + TABLE_W) + ' ' + num(yy) + ' l S\n');
    }

    function headerRow() {
      var h = 2 * 6 + textHeight(1);
      page.ops.push(num(HEAD_FILL) + ' g ' + num(MARGIN) + ' ' + num(y - h) + ' ' + num(TABLE_W) + ' ' + num(h) + ' re f\n');
      ['Term', 'Definition', 'Picture'].forEach(function (label, i) {
        page.ops.push(pdfTextOp(label, bold, BODY, colX[i] + PAD_X, y - 6 - ASCENT, 0));
      });
      hline(y, 0.55, 0.75);
      hline(y - h, 0.55, 0.75);
      y -= h;
      fresh = true;
    }

    function newPage() {
      page = { ops: [], images: [] };
      pages.push(page);
      y = PAGE_H - MARGIN;
      if (pages.length > 1) headerRow();
    }

    // Title and subtitle, on the first page only.
    newPage();
    var titleLines = wrap(winAnsi(set.title), bold, 20, TABLE_W);
    titleLines.forEach(function (line, i) {
      page.ops.push(pdfTextOp(line, bold, 20, MARGIN, y - 15 - i * 24, 0));
    });
    y -= 15 + (titleLines.length - 1) * 24 + 6;
    var sub = winAnsi(set.subtitle).replace(/^\s+|\s+$/g, '');
    if (sub) {
      var subLines = wrap(sub, reg, BODY, TABLE_W);
      subLines.forEach(function (line, i) {
        page.ops.push(pdfTextOp(line, reg, BODY, MARGIN, y - 12 - i * LEAD, SUB_GRAY));
      });
      y -= 12 + (subLines.length - 1) * LEAD + 4;
    }
    y -= 14;
    headerRow();

    function drawRow(term, def, pic, box, h) {
      var top = y;
      term.forEach(function (line, i) {
        page.ops.push(pdfTextOp(line, bold, BODY, colX[0] + PAD_X, top - PAD_Y - ASCENT - i * LEAD, 0));
      });
      def.forEach(function (line, i) {
        page.ops.push(pdfTextOp(line, reg, BODY, colX[1] + PAD_X, top - PAD_Y - ASCENT - i * LEAD, 0));
      });
      if (pic) {
        var n = page.images.indexOf(pic);
        if (n < 0) { page.images.push(pic); n = page.images.length - 1; }
        var px = colX[2] + (COL_W[2] - box.w) / 2, py = top - PAD_Y - box.h;
        page.ops.push('q ' + num(box.w) + ' 0 0 ' + num(box.h) + ' ' + num(px) + ' ' + num(py) + ' cm /Im' + (n + 1) + ' Do Q\n');
      }
      y -= h;
      hline(y, LINE_GRAY, 0.5);
      fresh = false;
    }

    set.cards.forEach(function (card, i) {
      var term = wrap(winAnsi(card.term), bold, BODY, COL_W[0] - 2 * PAD_X);
      var def = wrap(winAnsi(card.def), reg, BODY, COL_W[1] - 2 * PAD_X);
      var pic = pics[i], box = pic ? fit(pic.w, pic.h, PIC_W, PIC_H) : null;
      var rowH = function (t, d, b) {
        return 2 * PAD_Y + Math.max(textHeight(t.length), textHeight(d.length), b ? b.h : 0);
      };
      var h = rowH(term, def, box);
      if (y - h < MARGIN && !fresh) newPage();
      // A row taller than a whole page (a very long definition) is the one
      // case where a row has to carry on over the page break.
      while (y - h < MARGIN) {
        var fits = Math.max(1, Math.floor((y - MARGIN - 2 * PAD_Y - ASCENT - TEXT_EXTRA) / LEAD) + 1);
        if (fits >= Math.max(term.length, def.length)) break;
        var partH = rowH(term.slice(0, fits), def.slice(0, fits), box);
        drawRow(term.slice(0, fits), def.slice(0, fits), pic, box, partH);
        term = term.slice(fits);
        def = def.slice(fits);
        pic = box = null;
        newPage();
        h = rowH(term, def, box);
      }
      drawRow(term, def, pic, box, h);
    });

    // Footer: the set's title at the left and "Page n of N" in the middle.
    var footTitle = winAnsi(set.title).replace(/\s+/g, ' ');
    pages.forEach(function (p, i) {
      var label = 'Page ' + (i + 1) + ' of ' + pages.length;
      var lw = measure(label, reg, FOOT_SIZE);
      var room = PAGE_W / 2 - lw / 2 - 16 - MARGIN;
      if (footTitle) p.ops.push(pdfTextOp(clip(footTitle, reg, FOOT_SIZE, room), reg, FOOT_SIZE, MARGIN, FOOT_Y, FOOT_GRAY));
      p.ops.push(pdfTextOp(label, reg, FOOT_SIZE, (PAGE_W - lw) / 2, FOOT_Y, FOOT_GRAY));
    });
    return pages;
  }

  function buildPdf(set, pics) {
    var pages = layoutPdf(set, pics);

    // Every picture gets one image object, however many pages use it.
    var images = [];
    pages.forEach(function (p) {
      p.images.forEach(function (pic) { if (images.indexOf(pic) < 0) images.push(pic); });
    });

    // Objects: 1 catalog, 2 page tree, 3 document info, 4 and 5 the fonts,
    // then the images, then a page object and its content for each page.
    var objects = [];
    var firstImage = 6, firstPage = firstImage + images.length;
    var ref = function (n) { return n + ' 0 R'; };
    var stream = function (dict, data) {
      return [dict.replace(/ >>$/, ' /Length ' + data.length + ' >>') + '\nstream\n', data, '\nendstream'];
    };

    objects.push(['<< /Type /Catalog /Pages 2 0 R /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>']);
    objects.push(['<< /Type /Pages /Kids [' + pages.map(function (p, i) { return ref(firstPage + 2 * i); }).join(' ') +
      '] /Count ' + pages.length + ' >>']);
    objects.push(['<< /Title ' + pdfUnicode(set.title) + ' /Creator (Classroom flashcards) >>']);
    objects.push(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
    objects.push(['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
    images.forEach(function (pic) {
      objects.push(stream('<< /Type /XObject /Subtype /Image /Width ' + pic.w + ' /Height ' + pic.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>', pic.bytes));
    });
    pages.forEach(function (p, i) {
      var xobjects = p.images.map(function (pic, n) {
        return '/Im' + (n + 1) + ' ' + ref(firstImage + images.indexOf(pic));
      }).join(' ');
      objects.push(['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + ']' +
        ' /Resources << /Font << /F1 4 0 R /F2 5 0 R >>' + (xobjects ? ' /XObject << ' + xobjects + ' >>' : '') + ' >>' +
        ' /Contents ' + ref(firstPage + 2 * i + 1) + ' >>']);
      objects.push(stream('<< >>', latin1Bytes(p.ops.join(''))));
    });

    var chunks = [], pos = 0, offsets = [];
    var put = function (part) {
      var bytes = typeof part === 'string' ? latin1Bytes(part) : part;
      chunks.push(bytes);
      pos += bytes.length;
    };
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    objects.forEach(function (parts, i) {
      offsets.push(pos);
      put((i + 1) + ' 0 obj\n');
      parts.forEach(put);
      put('\nendobj\n');
    });
    var xref = pos;
    var table = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { table += ('000000000' + o).slice(-10) + ' 00000 n \n'; });
    put(table + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(chunks, { type: PDF_TYPE });
  }

  /* ============================================================
     Word (.docx)
     ============================================================ */

  // Escapes text for XML, first dropping the characters XML 1.0 does not
  // allow at all (control codes and broken surrogate pairs).
  function xml(s) {
    s = str(s);
    var clean = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { clean += s.charAt(i) + s.charAt(i + 1); i++; }
      } else if (c >= 0xDC00 && c <= 0xDFFF) {
        continue;
      } else if ((c >= 32 || c === 9 || c === 10 || c === 13) && c !== 0xFFFE && c !== 0xFFFF) {
        clean += s.charAt(i);
      }
    }
    return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Runs for one piece of text, with line breaks kept as Word line breaks.
  function runs(text, rPr) {
    var lines = str(text).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n');
    var body = lines.map(function (line) {
      return '<w:t xml:space="preserve">' + xml(line) + '</w:t>';
    }).join('<w:br/>');
    return '<w:r>' + (rPr ? '<w:rPr>' + rPr + '</w:rPr>' : '') + body + '</w:r>';
  }

  var NS_MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  var XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  var TWIPS_COLS = [2800, 4360, 2200];
  var CELL_MAR_X = 100, CELL_MAR_Y = 80;
  var EMU_PER_TWIP = 635;
  var PIC_MAX_W = (TWIPS_COLS[2] - 2 * CELL_MAR_X) * EMU_PER_TWIP;  // about 1.4 in
  var PIC_MAX_H = 914400;                                             // 1 in

  function cell(width, content, opts) {
    opts = opts || {};
    return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' +
      (opts.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + opts.fill + '"/>' : '') +
      '</w:tcPr><w:p>' + (opts.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : '') + content + '</w:p></w:tc>';
  }

  function drawing(pic, rel, id, alt) {
    var size = fit(pic.w, pic.h, PIC_MAX_W, PIC_MAX_H);
    var cx = Math.max(1, Math.round(size.w)), cy = Math.max(1, Math.round(size.h));
    var descr = xml(str(alt).replace(/\s+/g, ' ').replace(/^\s|\s$/g, ''));
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="Picture ' + id + '" descr="' + descr + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="Picture ' + id + '" descr="' + descr + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rel + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }

  function buildDocx(set, pics) {
    var media = [];   // unique pictures, in the order they first appear
    var border = function (side) { return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="8C8C8C"/>'; };
    var rowPr = '<w:trPr><w:cantSplit/></w:trPr>';
    var header = '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' +
      ['Term', 'Definition', 'Picture'].map(function (label, i) {
        return cell(TWIPS_COLS[i], runs(label, '<w:b/><w:bCs/>'), { fill: 'E7E9ED' });
      }).join('') + '</w:tr>';
    var picCount = 0;
    var rows = set.cards.map(function (card, i) {
      var pic = pics[i], content = '';
      if (pic) {
        var n = media.indexOf(pic);
        if (n < 0) { media.push(pic); n = media.length - 1; }
        content = drawing(pic, 'rIdImg' + (n + 1), ++picCount, card.alt);
      }
      return '<w:tr>' + rowPr +
        cell(TWIPS_COLS[0], runs(card.term, '<w:b/><w:bCs/>')) +
        cell(TWIPS_COLS[1], runs(card.def)) +
        cell(TWIPS_COLS[2], content, { center: true }) + '</w:tr>';
    }).join('');

    var subtitle = set.subtitle.replace(/^\s+|\s+$/g, '');
    var docXml = XML_HEAD +
      '<w:document xmlns:w="' + NS_MAIN + '" xmlns:r="' + NS_REL + '"' +
      ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
      ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' +
      '<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:after="' + (subtitle ? 60 : 240) + '"/></w:pPr>' +
      runs(set.title, '<w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/>') + '</w:p>' +
      (subtitle ? '<w:p><w:pPr><w:spacing w:after="240"/></w:pPr>' + runs(subtitle, '<w:color w:val="595959"/>') + '</w:p>' : '') +
      '<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/>' +
      '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('') + '</w:tblBorders>' +
      '<w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="' + CELL_MAR_Y + '" w:type="dxa"/><w:left w:w="' + CELL_MAR_X + '" w:type="dxa"/>' +
      '<w:bottom w:w="' + CELL_MAR_Y + '" w:type="dxa"/><w:right w:w="' + CELL_MAR_X + '" w:type="dxa"/></w:tblCellMar>' +
      '</w:tblPr><w:tblGrid>' + TWIPS_COLS.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>' +
      header + rows + '</w:tbl><w:p/>' +
      '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';

    var styles = XML_HEAD + '<w:styles xmlns:w="' + NS_MAIN + '"><w:docDefaults>' +
      '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>' +
      '</w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/>' +
      '<w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr>' +
      '<w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
      '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>' +
      '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
      '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>' +
      '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
      '</w:styles>';

    var settings = XML_HEAD + '<w:settings xmlns:w="' + NS_MAIN + '"><w:compat>' +
      '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
      '</w:compat></w:settings>';

    var relType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    var docRels = XML_HEAD + '<Relationships xmlns="' + NS_PKG_REL + '">' +
      '<Relationship Id="rIdStyles" Type="' + relType + 'styles" Target="styles.xml"/>' +
      '<Relationship Id="rIdSettings" Type="' + relType + 'settings" Target="settings.xml"/>' +
      media.map(function (pic, n) {
        return '<Relationship Id="rIdImg' + (n + 1) + '" Type="' + relType + 'image" Target="media/image' + (n + 1) + '.jpeg"/>';
      }).join('') + '</Relationships>';

    var rootRels = XML_HEAD + '<Relationships xmlns="' + NS_PKG_REL + '">' +
      '<Relationship Id="rId1" Type="' + relType + 'officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>';

    var created = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    var core = XML_HEAD + '<cp:coreProperties' +
      ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"' +
      ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + xml(set.title) + '</dc:title>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + created + '</dcterms:created>' +
      '</cp:coreProperties>';

    var wml = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
    var types = XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="' + wml + 'document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="' + wml + 'styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="' + wml + 'settings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>';

    var files = [
      { name: '[Content_Types].xml', data: utf8Bytes(types) },
      { name: '_rels/.rels', data: utf8Bytes(rootRels) },
      { name: 'docProps/core.xml', data: utf8Bytes(core) },
      { name: 'word/document.xml', data: utf8Bytes(docXml) },
      { name: 'word/styles.xml', data: utf8Bytes(styles) },
      { name: 'word/settings.xml', data: utf8Bytes(settings) },
      { name: 'word/_rels/document.xml.rels', data: utf8Bytes(docRels) }
    ];
    media.forEach(function (pic, n) {
      files.push({ name: 'word/media/image' + (n + 1) + '.jpeg', data: pic.bytes });
    });
    return new Blob(zip(files), { type: DOCX_TYPE });
  }

  /* ---------------- zip, stored without compression ---------------- */

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Returns the zip as a list of byte chunks, ready for a Blob.
  function zip(files) {
    var now = new Date();
    var time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var date = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var local = [], central = [], offset = 0, centralSize = 0;
    files.forEach(function (f) {
      var name = utf8Bytes(f.name), crc = crc32(f.data), size = f.data.length;
      var head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034B50, true);
      head.setUint16(4, 20, true);        // version needed to extract
      head.setUint16(6, 0x0800, true);    // names are UTF-8
      head.setUint16(8, 0, true);         // stored
      head.setUint16(10, time, true);
      head.setUint16(12, date, true);
      head.setUint32(14, crc, true);
      head.setUint32(18, size, true);
      head.setUint32(22, size, true);
      head.setUint16(26, name.length, true);
      head.setUint16(28, 0, true);
      local.push(new Uint8Array(head.buffer), name, f.data);

      var entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014B50, true);
      entry.setUint16(4, 20, true);       // made by
      entry.setUint16(6, 20, true);       // needed to extract
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(10, 0, true);
      entry.setUint16(12, time, true);
      entry.setUint16(14, date, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, size, true);
      entry.setUint32(24, size, true);
      entry.setUint16(28, name.length, true);
      // extra field, comment, disk number, internal and external attributes: all 0
      entry.setUint32(42, offset, true);
      central.push(new Uint8Array(entry.buffer), name);

      offset += 30 + name.length + size;
      centralSize += 46 + name.length;
    });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return local.concat(central, [new Uint8Array(end.buffer)]);
  }

  /* ---------------- the two exporters ---------------- */

  function exporter(build) {
    return function (set) {
      var s;
      try { s = readSet(set); } catch (e) { return Promise.reject(e); }
      return loadPictures(s.cards).then(function (pics) { return build(s, pics); });
    };
  }

  window.IS8Export = {
    pdf: exporter(buildPdf),
    docx: exporter(buildDocx)
  };
})();
