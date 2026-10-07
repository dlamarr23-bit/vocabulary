/* ============================================================
   Drawing models test (teacher only, /flashcards/draw-test/).
   One scene per word is written first, then every model draws that same
   scene with the same seed, so the pictures differ only by model.
   Nothing is saved. Network calls go through editor.js.
   ============================================================ */
(function () {
  'use strict';

  var MODELS = [
    { key: 'klein-4b', name: 'FLUX.2 klein 4B', note: 'What Draw it used before. Fastest, least detail. About 90 a day free.' },
    { key: 'klein-9b', name: 'FLUX.2 klein 9B', note: 'What Draw it uses now (picked 2026-09-30). About 7 a day free.' },
    { key: 'flux-2-dev', name: 'FLUX.2 dev', note: 'Most detailed FLUX. Uses the most of the free allowance of the FLUX models.' },
    { key: 'lucid-origin', name: 'Leonardo Lucid Origin', note: 'Follows the prompt closely, clean graphic look. Heavy on the free allowance.' },
    { key: 'phoenix', name: 'Leonardo Phoenix 1.0', note: 'Leonardo’s older model. Heavy on the free allowance.' }
  ];
  var WORDS = [
    { term: 'antibiotic', def: 'A medicine that kills bacteria or stops them from growing.' },
    { term: 'camouflage', def: 'Colors or patterns that help an organism blend in with its surroundings.' },
    { term: 'mutation', def: 'A change in the DNA of a gene that may lead to a different trait.' }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var app = document.getElementById('dtApp');
  var E = window.IS8Editor;
  if (!app || !E) return;

  E.session().then(function (s) {
    if (s.editor) return build(s);
    app.textContent = '';
    var box = el('div', 'dt-signin');
    app.appendChild(box);
    E.signInForm(box, function () { E.session().then(build); });
  });

  function build(s) {
    app.textContent = '';
    if (!s.draw) { app.appendChild(el('p', 'dt-warn', 'Drawing is not switched on for this site (the Workers AI setting).')); return; }

    var form = el('div', 'dt-words');
    var inputs = WORDS.map(function (w, i) {
      var row = el('div', 'dt-word');
      var t = el('input'); t.value = w.term; t.setAttribute('aria-label', 'Word ' + (i + 1));
      var d = el('input', 'dt-def'); d.value = w.def; d.setAttribute('aria-label', 'Definition ' + (i + 1));
      row.appendChild(t); row.appendChild(d); form.appendChild(row);
      return { t: t, d: d };
    });
    app.appendChild(form);

    var go = el('button', 'btn', 'Draw them all');
    go.type = 'button';
    var msg = el('span', 'ed-msg');
    msg.setAttribute('role', 'status');
    var bar = el('div', 'dt-bar');
    bar.appendChild(go); bar.appendChild(msg);
    app.appendChild(bar);
    app.appendChild(el('p', 'dt-small', 'Drawing all of them uses a good part of today’s free drawing allowance, so run it once or twice, not over and over.'));

    var grid = el('div', 'dt-grid');
    app.appendChild(grid);

    go.addEventListener('click', function () {
      go.disabled = true;
      grid.textContent = '';
      var head = el('div', 'dt-row dt-head');
      head.appendChild(el('div', 'dt-label', ''));
      MODELS.forEach(function (m) {
        var c = el('div', 'dt-col');
        c.appendChild(el('strong', null, m.name));
        c.appendChild(el('span', 'dt-small', m.note));
        head.appendChild(c);
      });
      grid.appendChild(head);

      var words = inputs.map(function (x) { return { term: x.t.value.trim(), def: x.d.value.trim() }; }).filter(function (w) { return w.term.length > 1; });
      var jobs = [];
      words.forEach(function (w) {
        var row = el('div', 'dt-row');
        var label = el('div', 'dt-label');
        label.appendChild(el('strong', null, w.term));
        var sceneLine = el('span', 'dt-small', 'Planning the picture...');
        label.appendChild(sceneLine);
        row.appendChild(label);
        var cells = MODELS.map(function () {
          var c = el('div', 'dt-cell');
          c.appendChild(el('span', 'dt-wait', 'Waiting...'));
          row.appendChild(c);
          return c;
        });
        grid.appendChild(row);
        jobs.push(Promise.resolve().then(function () {
          return E.drawScene(w.term, w.def).then(function (sc) {
            sceneLine.textContent = 'Scene: ' + sc.scene;
            var seed = Math.floor(Math.random() * 1e9);
            // Every model at once, so a slow one does not hold up the others.
            return Promise.all(MODELS.map(function (m, mi) {
              var wait = cells[mi].firstChild, t0 = Date.now();
              var tick = setInterval(function () { wait.textContent = 'Drawing... ' + Math.round((Date.now() - t0) / 1000) + ' s'; }, 1000);
              wait.textContent = 'Drawing...';
              return E.drawTry(m.key, sc.prompt, seed).then(function (r) {
                clearInterval(tick);
                cells[mi].textContent = '';
                var img = el('img');
                img.src = r.image;
                img.alt = m.name + ' drawing of ' + w.term;
                cells[mi].appendChild(img);
                cells[mi].appendChild(el('span', 'dt-small', (r.ms / 1000).toFixed(1) + ' seconds'));
              }, function (err) {
                clearInterval(tick);
                cells[mi].textContent = '';
                cells[mi].appendChild(el('span', 'dt-warn', 'Could not draw: ' + err.message));
              });
            }));
          }, function (err) {
            sceneLine.textContent = 'Could not plan the picture: ' + err.message;
          });
        }));
      });
      msg.textContent = 'Drawing all ' + words.length + ' words at once...';
      Promise.all(jobs).then(function () { msg.textContent = 'Done.'; go.disabled = false; go.textContent = 'Draw them again'; });
    });
  }
})();
