/* ============================================================
   Flashcards: the Flashcards page (every set) and each set's page.

   A set page gets its cards as a JSON block (#fcData) and shows them as
   flashcards and as a list. Learn, Test and Match live in
   flashcard-modes.js and use the window.IS8Flash object made here.
   Adding ?edit to the address turns on the editor: type straight into a
   term, definition or hint, add pictures, reorder, import from Quizlet,
   and download the set as a Word file or a PDF.

   Editing needs the teacher password (see assets/editor.js); without it,
   ?edit shows only a sign in box and nothing can be changed, not even in
   this browser (Gennaro, 2026-09-29). Signed in, every change is saved to
   the site and students see it straight away: the site slips the saved set
   into the page as a #fcCloud block, in place of the book's own. A change
   that fails to save is kept in this browser, under the flashcard key, and
   offered again on the next visit.

   A student's stars, sorting and options are kept in this browser only,
   under the study key. They hold card words, never anything typed.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- the Flashcards page: every folder and set ---------------- */

  // The page is the teacher's library: folders (two deep at most) holding
  // sets. The build writes the starting library in #fxData; the site puts
  // the teacher's own arrangement in #fxLibrary.
  //
  // One folder is shown at a time, as cards (Gennaro, 2026-09-28: the long
  // open lists were too much on one screen): the top shows the top folders
  // and the sets in no folder; a folder's card opens it (#folder-<id>, so
  // Back works) with its inner folders and sets. Searching shows every
  // matching set at once. Signed in, the teacher gets + Add Set and + Add
  // Subfolder for the open folder, and on each card up and down arrows and
  // a menu (Edit, Rename, Move to, Host a game, Delete). Students never see
  // those, and their visit makes no request.
  var fxData = $('fxData');
  if (fxData) {
    initIndex();
    return;
  }

  function initIndex() {
    var read = function (id) { try { return JSON.parse($(id).textContent); } catch (e) { return null; } };
    var lib = read('fxLibrary') || read('fxData');
    var ED = window.IS8Editor || null;
    var teacher = false;
    var view = $('fxTree'), input = $('fxFind'), note = $('fxFindNote'), bar = $('fxTeacher');
    var here = null; // the open folder's id; null is the top

    function mk(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
    function btn(cls, text, run, tip) {
      var b = mk('button', cls, text);
      b.type = 'button';
      if (tip) { b.title = tip; b.setAttribute('aria-label', tip); }
      b.addEventListener('click', run);
      return b;
    }
    function submitBtn(text) { var b = mk('button', 'btn fc-small', text); b.type = 'submit'; return b; }
    var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
    var kids = function (id) { return lib.folders.filter(function (f) { return (f.parent || null) === id; }); };
    // A set with no cards yet (a chapter still to fill) is the teacher's only.
    var visible = function (s) { return teacher || (s.count || 0) > 0; };
    var setsIn = function (id) { return lib.sets.filter(function (s) { return (s.folder || null) === id && visible(s); }); };
    var folderById = function (id) { return lib.folders.filter(function (f) { return f.id === id; })[0] || null; };
    var deepSets = function (f) { return setsIn(f.id).concat.apply(setsIn(f.id), kids(f.id).map(function (k) { return setsIn(k.id); })); };
    var shows = function (f) { return teacher || deepSets(f).length > 0; };
    var trail = function (id) {
      var out = [], f = folderById(id);
      while (f && out.length < 3) { out.unshift(f); f = folderById(f.parent); }
      return out;
    };

    var FOLDER_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="b" d="M4 9a3 3 0 0 1 3-3h6l3 3h9a3 3 0 0 1 3 3v2H4z"/><rect class="a" x="4" y="12" width="24" height="15" rx="3"/></svg>';
    var SET_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="b" x="10" y="5" width="17" height="14" rx="3"/><rect class="a" x="5" y="11" width="17" height="15" rx="3"/></svg>';

    /* ---- drawing ---- */

    function tidyLib() {
      var known = {};
      lib.folders.forEach(function (f) { known[f.id] = true; });
      lib.sets.forEach(function (s) { if (s.folder && !known[s.folder]) s.folder = null; });
      if (here && !known[here]) here = null;
    }

    function draw() {
      tidyLib();
      view.textContent = '';
      if (accentOf(folderById(here))) view.style.setProperty('--unit', accentOf(folderById(here)));
      else view.style.removeProperty('--unit');
      if (input.value.trim()) { drawSearch(); return; }
      var f = folderById(here);
      if (f && !shows(f)) { here = null; f = null; }

      // Where you are: Flashcards > Unit 1 > Chapter 1
      if (f) {
        var nav = mk('nav', 'fx-crumbs');
        nav.setAttribute('aria-label', 'Folders');
        var home = mk('a', null, 'All folders');
        home.href = '#';
        nav.appendChild(home);
        trail(f.id).forEach(function (x, i, all) {
          nav.appendChild(mk('span', 'fx-crumb-sep', '›'));
          if (i === all.length - 1) { nav.appendChild(mk('span', null, x.name)); return; }
          var a = mk('a', null, x.name);
          a.href = '#folder-' + x.id;
          nav.appendChild(a);
        });
        view.appendChild(nav);
        var head = mk('div', 'fx-here');
        var icon = mk('span', 'fx-here-icon');
        icon.innerHTML = iconFor(f);
        head.appendChild(icon);
        head.appendChild(mk('h2', 'fx-here-title', f.name));
        view.appendChild(head);
      }

      if (teacher) view.appendChild(folderActions(f));

      var folders = kids(here).filter(shows);
      var sets = setsIn(here);
      if (folders.length) {
        view.appendChild(mk('h3', 'fx-head', f ? 'Folders inside' : 'Folders'));
        var grid = mk('ul', 'fx-grid');
        folders.forEach(function (k) { grid.appendChild(folderCard(k)); });
        view.appendChild(grid);
      }
      if (sets.length || (teacher && f)) {
        view.appendChild(mk('h3', 'fx-head', f ? 'Sets' : 'Sets not in a folder'));
        var g2 = mk('ul', 'fx-grid');
        sets.forEach(function (s) { g2.appendChild(setCard(s)); });
        if (!sets.length) g2.appendChild(mk('li', 'fx-empty', 'No sets here yet. Use + Add Set.'));
        view.appendChild(g2);
      }
      if (!folders.length && !sets.length && !teacher) view.appendChild(mk('p', 'fx-empty', 'No flashcard sets here yet.'));
      note.textContent = plural(lib.sets.filter(visible).length, 'set', 'sets') + ' in all.';
    }

    // A folder inside a unit takes the unit's color.
    function accentOf(f) {
      if (!f) return '';
      return f.accent || ((folderById(f.parent) || {}).accent) || '';
    }
    // A set's picture (one from the book's drawings), or none for the two cards.
    function setIcon(s) {
      if (ED && ED.isPicture(s.icon)) return '<img src="' + s.icon + '" alt="">';
      return (s.icon && window.ICONS && window.ICONS[s.icon]) || '';
    }
    function iconFor(f) {
      if (ED && ED.isPicture(f.icon)) return '<img src="' + f.icon + '" alt="">';
      return (f.icon && window.ICONS && window.ICONS[f.icon]) || FOLDER_SVG;
    }

    function folderCard(f) {
      var li = mk('li', 'fx-card fx-card-folder');
      li.setAttribute('data-folder', f.id);
      if (accentOf(f)) li.style.setProperty('--unit', accentOf(f));
      var a = mk('a', 'fx-card-main');
      a.href = '#folder-' + f.id;
      var icon = mk('span', 'fx-card-icon' + (f.icon ? '' : ' fx-folder-icon'));
      icon.innerHTML = iconFor(f);
      a.appendChild(icon);
      var text = mk('span', 'fx-card-text');
      text.appendChild(mk('span', 'fx-card-title', f.name));
      var n = deepSets(f).length, sub = kids(f.id).filter(shows).length;
      var bits = [n ? plural(n, 'set', 'sets') : 'Empty'];
      if (sub) bits.push(plural(sub, 'folder', 'folders'));
      text.appendChild(mk('span', 'fx-card-meta', bits.join(' · ')));
      a.appendChild(text);
      li.appendChild(a);
      if (teacher) li.appendChild(cardTools('folder', f));
      return li;
    }

    function setCard(s, where, hits) {
      var li = mk('li', 'fx-card fx-card-set');
      li.setAttribute('data-set', s.id);
      // A set shares its folder's color, here and on its own page.
      if (accentOf(folderById(s.folder))) li.style.setProperty('--unit', accentOf(folderById(s.folder)));
      var a = mk('a', 'fx-card-main');
      a.href = s.path;
      var icon = mk('span', 'fx-card-icon' + (setIcon(s) ? '' : ' fx-set-icon'));
      icon.innerHTML = setIcon(s) || SET_SVG;
      a.appendChild(icon);
      var text = mk('span', 'fx-card-text');
      text.appendChild(mk('span', 'fx-card-title', s.title));
      text.appendChild(mk('span', 'fx-card-meta', (s.count ? plural(s.count, 'term', 'terms') : 'Empty, hidden from students') + (where ? ' · ' + where : '')));
      a.appendChild(text);
      li.appendChild(a);
      if (hits) li.appendChild(mk('span', 'fx-hits', hits));
      if (teacher) li.appendChild(cardTools('set', s));
      return li;
    }

    /* ---- search: every matching set at once ---- */

    function drawSearch() {
      var q = input.value.trim().toLowerCase();
      var found = [];
      lib.sets.filter(visible).forEach(function (s) {
        var hits = (s.terms || []).filter(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
        if (!hits.length && s.title.toLowerCase().indexOf(q) === -1) return;
        found.push({ set: s, hits: hits });
      });
      var shown = input.value.trim();
      note.textContent = found.length ? plural(found.length, 'set has', 'sets have') + ' “' + shown + '”.' : 'No set has “' + shown + '” yet.';
      var grid = mk('ul', 'fx-grid');
      found.forEach(function (r) {
        var hits = r.hits.length ? 'Has ' + r.hits.slice(0, 6).join(', ') + (r.hits.length > 6 ? ' and more' : '') : '';
        var where = trail(r.set.folder).map(function (x) { return x.name; }).join(' \u203a ');
        grid.appendChild(setCard(r.set, where, hits));
      });
      view.appendChild(grid);
    }
    input.addEventListener('input', draw);

    /* ---- which folder is open ---- */

    function fromHash() {
      var m = /^#folder-(f-[a-z0-9-]+)$/.exec(location.hash);
      here = m && folderById(m[1]) ? m[1] : null;
      if (input.value) input.value = '';
      draw();
    }
    // Back to All folders goes to the very top of the page; opening a folder
    // goes to the top of its cards.
    window.addEventListener('hashchange', function () {
      fromHash();
      window.scrollTo(0, here ? view.getBoundingClientRect().top + window.scrollY - 90 : 0);
    });

    /* ---- the teacher's tools ---- */

    function status(text, warn) {
      var el = $('fxTeacherMsg');
      if (!el) return;
      el.textContent = text || '';
      el.classList.toggle('warn', !!warn);
    }

    function keep() {
      status('Saving...');
      return ED.saveLibrary(lib).then(function (r) {
        lib = r;
        status('Saved. Students see this now.');
        draw();
      }, function (err) { status(err.message, true); draw(); });
    }

    // A small box over the page for one question.
    function dialog(title) {
      var d = mk('dialog', 'fc-dialog fx-dialog');
      var h = mk('h2', 'fc-dialog-title', title);
      h.id = 'fxDlg' + Math.random().toString(36).slice(2, 8);
      d.setAttribute('aria-labelledby', h.id);
      d.appendChild(h);
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
      d.addEventListener('close', function () { d.remove(); });
      document.body.appendChild(d);
      return d;
    }
    function dialogButtons(box, d, yes, danger) {
      var row = mk('div', 'fx-dialog-actions');
      var ok = submitBtn(yes);
      if (danger) ok.classList.add('fx-btn-danger');
      row.appendChild(ok);
      row.appendChild(btn('btn secondary fc-small', 'Cancel', function () { d.close(); }));
      box.appendChild(row);
      return ok;
    }
    // A form in a dialog: a name box and, if asked, a folder menu.
    function askName(title, label, value, yes, run, menu) {
      var d = dialog(title);
      var form = mk('form', 'fx-dialog-form');
      var l = mk('label', 'fx-dialog-label', label);
      var i = mk('input', 'fx-dialog-input');
      i.type = 'text';
      i.maxLength = 80;
      i.value = value || '';
      i.required = true;
      i.autocomplete = 'off';
      l.appendChild(i);
      form.appendChild(l);
      if (menu) {
        var l2 = mk('label', 'fx-dialog-label', menu.label);
        l2.appendChild(menu.select);
        form.appendChild(l2);
      }
      d.appendChild(form);
      dialogButtons(form, d, yes);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = i.value.replace(/\s+/g, ' ').trim();
        if (!v) return;
        d.close();
        run(v, menu && menu.select.value);
      });
      d.showModal();
      i.focus();
      i.select();
    }
    function askSure(title, text, yes, run) {
      var d = dialog(title);
      d.appendChild(mk('p', 'fc-dialog-note', text));
      var form = mk('form');
      d.appendChild(form);
      dialogButtons(form, d, yes, true);
      form.addEventListener('submit', function (e) { e.preventDefault(); d.close(); run(); });
      d.showModal();
    }

    // A menu of every folder, top folders first with their inner folders
    // under them. onlyTop: for moving a folder (two deep at most).
    function folderSelect(current, onlyTop, skip) {
      var sel = mk('select', 'fx-dialog-input');
      var top = mk('option', null, onlyTop ? 'The top (not inside a folder)' : 'No folder');
      top.value = '';
      sel.appendChild(top);
      kids(null).forEach(function (f) {
        if (f.id === skip) return;
        var o = mk('option', null, f.name);
        o.value = f.id;
        sel.appendChild(o);
        if (onlyTop) return;
        kids(f.id).forEach(function (k) {
          var o2 = mk('option', null, ' ' + k.name);
          o2.value = k.id;
          sel.appendChild(o2);
        });
      });
      sel.value = current || '';
      return sel;
    }

    // Swap an item with its neighbor among the ones in the same place.
    function move(list, item, same, step) {
      var peers = list.filter(same);
      var j = peers.indexOf(item) + step;
      if (j < 0 || j >= peers.length) return false;
      var a = list.indexOf(item), b = list.indexOf(peers[j]);
      list[a] = peers[j];
      list[b] = item;
      return true;
    }

    // The buttons above the open folder's cards.
    function folderActions(f) {
      var row = mk('div', 'fx-actions');
      row.appendChild(btn('btn fc-small', '+ Add Set', function () { newSet(f ? f.id : null); }));
      if (!f || !f.parent) {
        row.appendChild(btn('btn secondary fc-small', f ? '+ Add Subfolder' : '+ New folder', function () {
          askName(f ? 'New subfolder in ' + f.name : 'New folder', 'Folder name', '', 'Make the folder', function (v) {
            status('Making it...');
            ED.newFolder(v, f ? f.id : null).then(function (r) { lib = r; status('Made.'); draw(); }, function (err) { status(err.message, true); });
          });
        }));
      }
      return row;
    }

    // On each card: a grip to drag it, big up and down arrows, and a menu.
    var ARROW_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>';
    var ARROW_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5.5 12.5L12 19l6.5-6.5"/></svg>';
    var GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
    function iconBtn(cls, svg, tip, run) {
      var b = btn(cls, '', run, tip);
      b.innerHTML = svg;
      return b;
    }
    function cardTools(kind, x) {
      var box = mk('div', 'fx-card-tools');
      var list = kind === 'set' ? lib.sets : lib.folders;
      var same = kind === 'set'
        ? function (y) { return (y.folder || null) === (x.folder || null); }
        : function (y) { return (y.parent || null) === (x.parent || null); };
      var name = kind === 'set' ? x.title : x.name;
      var grip = mk('span', 'fx-grip');
      grip.innerHTML = GRIP;
      grip.title = 'Drag the card to move it';
      box.appendChild(grip);
      box.appendChild(mk('span', 'fx-drag-note', 'Drag to move'));
      box.appendChild(iconBtn('fx-move-btn', ARROW_UP, 'Move up', function () { if (move(list, x, same, -1)) keep(); }));
      box.appendChild(iconBtn('fx-move-btn', ARROW_DOWN, 'Move down', function () { if (move(list, x, same, 1)) keep(); }));
      var more = btn('fx-move-btn fx-more', '⋯', function () { openMenu(more, kind, x, name); }, 'More options for ' + name);
      more.setAttribute('aria-haspopup', 'true');
      more.setAttribute('aria-expanded', 'false');
      box.appendChild(more);
      return box;
    }

    /* ---- dragging a card (the teacher's only) ---- */

    // Press on a card and move: the card lifts and follows the pointer, the
    // others slide aside to show where it will land, and letting go saves.
    // Dropped on the middle of a folder card (or a folder in the trail at
    // the top), it goes into that folder. A plain click still opens a card.
    var drag = null;
    function startDrag(e) {
      if (!teacher || e.button !== 0 || input.value.trim()) return;
      if (e.target.closest('.fx-move-btn, .fx-menu')) return;
      var card = e.target.closest('.fx-card');
      if (!card || !card.parentNode.classList.contains('fx-grid')) return;
      drag = { card: card, x: e.clientX, y: e.clientY, on: false, id: e.pointerId };
    }
    function liftCard(e) {
      var card = drag.card, r = card.getBoundingClientRect();
      drag.on = true;
      drag.dx = drag.x - r.left;
      drag.dy = drag.y - r.top;
      var ghost = card.cloneNode(true);
      ghost.classList.add('fx-ghost');
      ghost.style.width = r.width + 'px';
      ghost.style.height = r.height + 'px';
      if (card.style.getPropertyValue('--unit')) ghost.style.setProperty('--unit', card.style.getPropertyValue('--unit'));
      else if (view.style.getPropertyValue('--unit')) ghost.style.setProperty('--unit', view.style.getPropertyValue('--unit'));
      document.body.appendChild(ghost);
      drag.ghost = ghost;
      card.classList.add('fx-dragging');
      document.body.classList.add('fx-dragging-on');
      moveGhost(e);
    }
    function moveGhost(e) {
      drag.ghost.style.transform = 'translate(' + (e.clientX - drag.dx) + 'px,' + (e.clientY - drag.dy) + 'px) rotate(1.5deg)';
    }
    // Slide the other cards to their new places instead of jumping.
    function slide(grid, change) {
      var cards = [].slice.call(grid.children);
      var before = cards.map(function (c) { return c.getBoundingClientRect(); });
      change();
      cards.forEach(function (c, i) {
        if (c === drag.card) return;
        var now = c.getBoundingClientRect();
        var dx = before[i].left - now.left, dy = before[i].top - now.top;
        if (!dx && !dy) return;
        c.style.transition = 'none';
        c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        requestAnimationFrame(function () {
          c.style.transition = 'transform .18s ease';
          c.style.transform = '';
        });
      });
    }
    // Where a card sits in the grid, leaving out the slide it may be in the
    // middle of, so a sliding card is never mistaken for the one underneath.
    function spot(el) {
      if (!el.classList.contains('fx-card') || !el.parentNode.classList.contains('fx-grid')) return el.getBoundingClientRect();
      var g = el.parentNode.getBoundingClientRect();
      return { left: g.left + el.offsetLeft, top: g.top + el.offsetTop, right: g.left + el.offsetLeft + el.offsetWidth, bottom: g.top + el.offsetTop + el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight };
    }
    function inside(e, el, part) {
      var r = spot(el);
      var px = r.width * (1 - part) / 2, py = r.height * (1 - part) / 2;
      return e.clientX >= r.left + px && e.clientX <= r.right - px && e.clientY >= r.top + py && e.clientY <= r.bottom - py;
    }
    // Can this folder go inside that one? Folders go two deep at most.
    function canNest(id, into) {
      var f = folderById(id);
      if (!f || kids(f.id).length || f.id === into) return false;
      if (!into) return !!f.parent;
      var t = folderById(into);
      return !!t && !t.parent && t.id !== f.parent;
    }
    function clearDrop() { [].forEach.call(document.querySelectorAll('.fx-drop'), function (x) { x.classList.remove('fx-drop'); }); }
    function dragMove(e) {
      if (!drag) return;
      if (!drag.on) {
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
        liftCard(e);
      }
      e.preventDefault();
      moveGhost(e);
      clearDrop();
      drag.into = undefined;
      var isSet = drag.card.classList.contains('fx-card-set');
      var myId = drag.card.getAttribute(isSet ? 'data-set' : 'data-folder');
      // Into a folder: a folder card's middle, or a folder in the trail.
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var target = el && el.closest('.fx-card-folder, .fx-crumbs a');
      if (target && target !== drag.card) {
        var into = target.getAttribute('data-folder');
        if (into === null) into = (/^#folder-(.+)$/.exec(target.getAttribute('href') || '') || [null, ''])[1];
        var middle = target.tagName === 'A' || inside(e, target, isSet ? 0.9 : 0.5);
        var ok = isSet ? into !== (lib.sets.filter(function (s) { return s.id === myId; })[0].folder || '') : canNest(myId, into);
        if (middle && ok) {
          target.classList.add('fx-drop');
          drag.into = into;
          return;
        }
      }
      // Otherwise it takes the place of the card of its own kind under the pointer.
      var grid = drag.card.parentNode;
      var over = [].filter.call(grid.children, function (c) { return c !== drag.card && c.classList.contains('fx-card') && inside(e, c, 1); })[0];
      if (!over) return;
      var r = spot(over);
      var list = [].slice.call(grid.children);
      var after = list.indexOf(over) > list.indexOf(drag.card);
      if (r.width > r.height * 3) after = e.clientX > r.left + r.width / 2 || e.clientY > r.top + r.height / 2;
      slide(grid, function () { grid.insertBefore(drag.card, after ? over.nextSibling : over); });
    }
    function endDrag(e) {
      if (!drag) return;
      var d = drag;
      drag = null;
      if (!d.on) return;
      e.preventDefault();
      d.ghost.remove();
      d.card.classList.remove('fx-dragging');
      document.body.classList.remove('fx-dragging-on');
      clearDrop();
      // The click that ends a drag must not open the card.
      var stop = function (ev) { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener('click', stop, true);
      setTimeout(function () { window.removeEventListener('click', stop, true); }, 60);
      var isSet = d.card.classList.contains('fx-card-set');
      if (d.into !== undefined) {
        if (isSet) lib.sets.filter(function (s) { return s.id === d.card.getAttribute('data-set'); })[0].folder = d.into || null;
        else folderById(d.card.getAttribute('data-folder')).parent = d.into || null;
        keep();
        return;
      }
      // Put the list in the order the cards now show.
      var attr = isSet ? 'data-set' : 'data-folder';
      var ids = [].map.call(d.card.parentNode.querySelectorAll('.fx-card[' + attr + ']'), function (c) { return c.getAttribute(attr); });
      var list = isSet ? lib.sets : lib.folders;
      var slots = [], byId = {};
      list.forEach(function (x, i) { byId[x.id] = x; if (ids.indexOf(x.id) !== -1) slots.push(i); });
      var changed = false;
      slots.forEach(function (at, n) { if (list[at].id !== ids[n]) changed = true; list[at] = byId[ids[n]]; });
      if (changed) keep();
    }
    view.addEventListener('pointerdown', startDrag);
    document.addEventListener('pointermove', dragMove, { passive: false });
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', function () {
      if (!drag) return;
      if (drag.on) { drag.ghost.remove(); document.body.classList.remove('fx-dragging-on'); draw(); }
      drag = null;
    });
    // The browser's own link dragging would fight this one.
    view.addEventListener('dragstart', function (e) { if (teacher) e.preventDefault(); });

    var openList = null;
    function closeMenu() {
      if (!openList) return;
      openList.btn.setAttribute('aria-expanded', 'false');
      openList.el.remove();
      openList = null;
    }
    document.addEventListener('click', function (e) { if (openList && !e.target.closest('.fx-menu, .fx-more')) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openList) { var b = openList.btn; closeMenu(); b.focus(); } });

    function openMenu(anchor, kind, x, name) {
      var again = openList && openList.btn === anchor;
      closeMenu();
      if (again) return;
      var m = mk('div', 'fx-menu');
      m.setAttribute('role', 'menu');
      var item = function (text, run, danger) {
        var b = btn('fx-menu-item' + (danger ? ' fx-danger' : ''), text, function () { closeMenu(); run(); });
        b.setAttribute('role', 'menuitem');
        m.appendChild(b);
      };
      if (kind === 'set') {
        item('Edit cards', function () { location.href = x.path + '?edit'; });
        item('Rename', function () { askName('Rename the set', 'Set name', x.title, 'Save', function (v) { x.title = v; keep(); }); });
        item('Move to a folder', function () {
          var sel = folderSelect(x.folder, false);
          askName('Move “' + x.title + '”', 'Set name', x.title, 'Move it', function (v, to) { x.title = v; x.folder = to || null; keep(); }, { label: 'Folder', select: sel });
        });
        item('Change icon', function () { pickIcon(x); });
        item('Host a game', function () { location.href = '../live/#' + x.id; });
        item('Delete', function () {
          askSure('Delete this set?', 'Delete “' + x.title + '” for good? Students will not see it anymore.', 'Yes, delete it', function () {
            status('Deleting...');
            (/^my-/.test(x.id) ? ED.resetSet(x.id).then(function () { return ED.library(); }) : ED.removeSet(x.id)).then(function (r) {
              lib = r;
              status('Deleted.');
              draw();
            }, function (err) { status(err.message, true); });
          });
        }, true);
      } else {
        item('Rename', function () { askName('Rename the folder', 'Folder name', x.name, 'Save', function (v) { x.name = v; keep(); }); });
        item('Change icon', function () { pickIcon(x, true); });
        item('Change color', function () { pickColor(x); });
        if (!kids(x.id).length) {
          item('Move to another folder', function () {
            var sel = folderSelect(x.parent, true, x.id);
            askName('Move “' + x.name + '”', 'Folder name', x.name, 'Move it', function (v, to) { x.name = v; x.parent = to || null; keep(); }, { label: 'Put it inside', select: sel });
          });
        }
        item('Delete', function () {
          var out = x.parent ? 'the folder it is in' : 'the top of the page';
          askSure('Delete this folder?', 'Delete the folder “' + x.name + '”? Nothing in it is deleted: its sets and folders move to ' + out + '.', 'Yes, delete the folder', function () {
            lib.sets.forEach(function (s) { if (s.folder === x.id) s.folder = x.parent || null; });
            lib.folders.forEach(function (k) { if (k.parent === x.id) k.parent = null; });
            lib.folders = lib.folders.filter(function (y) { return y.id !== x.id; });
            keep();
          });
        }, true);
      }
      anchor.parentNode.appendChild(m);
      anchor.setAttribute('aria-expanded', 'true');
      openList = { el: m, btn: anchor };
      m.querySelector('button').focus();
    }

    // Change icon: every drawing the book has, and the two cards (the default).
    // The one picked shows on the set's card and at the top right of its page.
    var ICON_NAMES = { set: 'Flashcards (default)', book: 'Book', u1: 'Evolution', u2: 'Earth\u2019s resources', u3: 'Space', u4: 'Forces and motion', u5: 'Fields', u6: 'Waves' };
    // For a set (the first choice is the two cards) or a folder (the plain folder).
    function pickIcon(s, isFolder) {
      var name = isFolder ? s.name : s.title;
      var d = dialog('Pick an icon for \u201c' + name + '\u201d');
      var grid = mk('div', 'fx-pick-grid');
      grid.setAttribute('role', 'radiogroup');
      var keys = ['set'].concat(Object.keys(window.ICONS || {}).filter(function (k) { return k !== 'set' && k !== 'fallback'; }));
      keys.forEach(function (k) {
        var val = k === 'set' ? '' : k;
        var label = k === 'set' && isFolder ? 'Folder (default)' : ICON_NAMES[k] || k.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
        var b = btn('fx-pick', '', function () {
          s.icon = val;
          d.close();
          keep();
        }, label);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String((s.icon || '') === val));
        b.innerHTML = k === 'set' && isFolder ? FOLDER_SVG : (window.ICONS && window.ICONS[k]) || SET_SVG;
        if (k === 'set' && isFolder) b.classList.add('fx-folder-icon');
        grid.appendChild(b);
      });
      var tone = isFolder ? accentOf(s) : accentOf(folderById(s.folder));
      if (tone) grid.style.setProperty('--unit', tone);
      d.appendChild(grid);
      d.appendChild(ED.iconPanel(name, function (url) { s.icon = url; d.close(); keep(); }));
      var row = mk('div', 'fx-dialog-actions');
      row.appendChild(btn('btn secondary fc-small', 'Cancel', function () { d.close(); }));
      d.appendChild(row);
      d.showModal();
      (grid.querySelector('[aria-checked="true"]') || grid.firstChild).focus();
    }

    // Change color: a folder's color, which its cards, its sets and the
    // folders inside it share.
    // The six unit colors first, then more.
    var COLORS = [['#0f9d58', 'Green'], ['#c2620d', 'Orange'], ['#6a4c93', 'Purple'], ['#e63946', 'Red'], ['#1982c4', 'Blue'], ['#00a0c4', 'Teal'], ['#1d4ed8', 'Royal blue'], ['#db2777', 'Pink'], ['#b8860b', 'Gold'], ['#8b5e34', 'Brown'], ['#475569', 'Gray'], ['#111827', 'Black']];
    function pickColor(f) {
      var d = dialog('Pick a color for \u201c' + f.name + '\u201d');
      var grid = mk('div', 'fx-color-grid');
      grid.setAttribute('role', 'radiogroup');
      var now = (f.accent || '').toLowerCase();
      COLORS.forEach(function (c) {
        var b = btn('fx-swatch', '', function () {
          f.accent = c[0];
          d.close();
          keep();
        }, c[1]);
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(now === c[0]));
        b.style.setProperty('--swatch', c[0]);
        b.appendChild(mk('span', 'fx-swatch-name', c[1]));
        grid.appendChild(b);
      });
      d.appendChild(grid);
      // Any color at all: the browser's own color picker (a color field and
      // a rainbow slider), with the color shown before it is saved.
      var own = mk('div', 'fx-own-color');
      var lab = mk('label', 'fx-own-color-label');
      lab.appendChild(mk('span', '', 'Or pick any color'));
      var wheel = mk('input', 'fx-color-input');
      wheel.type = 'color';
      wheel.value = /^#[0-9a-f]{6}$/i.test(f.accent || '') ? f.accent : '#1d4ed8';
      wheel.setAttribute('aria-label', 'Any color');
      lab.appendChild(wheel);
      own.appendChild(lab);
      var sample = mk('span', 'fx-own-color-sample', f.name);
      sample.style.setProperty('--swatch', wheel.value);
      own.appendChild(sample);
      wheel.addEventListener('input', function () { sample.style.setProperty('--swatch', wheel.value); });
      own.appendChild(btn('btn fc-small', 'Use this color', function () { f.accent = wheel.value.toLowerCase(); d.close(); keep(); }));
      d.appendChild(own);
      var row = mk('div', 'fx-dialog-actions');
      row.appendChild(btn('btn secondary fc-small', 'Cancel', function () { d.close(); }));
      d.appendChild(row);
      d.showModal();
      (grid.querySelector('[aria-checked="true"]') || grid.firstChild).focus();
    }

    // A new set: a name and a folder, then straight to its page to add cards.
    function newSet(folder) {
      askName('New set', 'Name of the set', '', 'Make the set', function (t, to) {
        status('Making it...');
        ED.createSet(t, to).then(function (r) { location.href = r.path + '?edit'; }, function (err) { status(err.message, true); });
      }, { label: 'Folder', select: folderSelect(folder, false) });
    }

    function teacherBar() {
      bar.hidden = false;
      bar.textContent = '';
      var top = mk('div', 'fx-teacher-top');
      top.appendChild(mk('strong', null, 'Teacher tools'));
      var msg = mk('span', 'fx-teacher-msg', 'Drag any card to move it, or drop it on a folder. Only you see these tools.');
      msg.id = 'fxTeacherMsg';
      msg.setAttribute('role', 'status');
      top.appendChild(msg);
      var host = mk('a', 'btn secondary fc-small', 'Host a game');
      host.href = '../live/';
      top.appendChild(host);
      top.appendChild(btn('linkbtn', 'Sign out', function () {
        ED.forgetHint();
        ED.logout().then(function () { location.reload(); }, function () { location.reload(); });
      }));
      bar.appendChild(top);
    }

    function startTeacher() {
      ED.session().then(function (s) {
        if (!s.editor) { ED.forgetHint(); return; }
        return ED.library().then(function (r) {
          lib = r;
          teacher = true;
          document.body.classList.add('fx-teaching');
          $('fxSignInBtn').parentNode.hidden = true;
          teacherBar();
          fromHash();
        });
      }).catch(function () { /* the page still works for studying */ });
    }

    fromHash();

    $('fxSignInBtn').addEventListener('click', function () {
      var box = $('fxSignIn');
      if (!ED) return;
      box.hidden = !box.hidden;
      if (box.hidden) return;
      ED.session().then(function (s) {
        if (!s.cloud) { box.textContent = 'Saving to the site is not switched on yet.'; return; }
        if (s.editor) { startTeacher(); return; }
        ED.signInForm(box, function () { box.hidden = true; startTeacher(); }).focus();
      });
    });
    if (ED && ED.signedInHint()) startTeacher();
  }

  /* ---------------- a set page ---------------- */

  var dataEl = $('fcData');
  if (!dataEl) return;
  var book = JSON.parse(dataEl.textContent);
  // The set as last saved to the site, if the teacher has saved one.
  var published = null;
  try {
    var cloudEl = $('fcCloud');
    if (cloudEl) published = JSON.parse(cloudEl.textContent);
  } catch (e) { published = null; }
  if (published && !Array.isArray(published.cards)) published = null;
  var ED = window.IS8Editor || null;
  // ?edit asks for the editor, but nothing can be edited, not even in this
  // browser, until the teacher password is entered (Gennaro, 2026-09-29).
  // Until then the page is the plain study page with a sign in box.
  var wantsEdit = /[?&]edit\b/.test(location.search);
  var editing = false;

  var card = $('fcCard'), front = $('fcFront'), back = $('fcBack'), stage = $('fcStage');
  var done = $('fcDone'), counter = $('fcCounter'), bar = $('fcBar');
  var prevBtn = $('fcPrev'), nextBtn = $('fcNext');
  var rowsEl = $('fcRows'), addBtn = $('fcAdd'), note = $('fcSaveNote');

  /* ---------------- the set, and this browser's copy of it ---------------- */

  var uid = 0;
  var tidy = function (c) {
    var img = typeof c.img === 'string' && /^(?:data:image\/|\.\.\/|\/api\/images\/|https:\/\/)/.test(c.img) ? c.img : '';
    return { id: ++uid, term: String(c.term || ''), def: String(c.def || ''), hint: String(c.hint || ''), img: img, alt: img ? String(c.alt || '') : '', credit: img ? String(c.credit || '') : '' };
  };
  var plain = function (c) { return { term: c.term, def: c.def, hint: c.hint || '', img: c.img, alt: c.alt, credit: c.credit || '' }; };

  function readStore() {
    try { return JSON.parse(localStorage.getItem('is8-flashcards-v1')) || {}; } catch (e) { return {}; }
  }
  // A fingerprint of the book's own cards, kept with a saved edit, so the editor
  // can tell when the book's set changed after the edit was made.
  var base = (function () {
    var text = JSON.stringify(book.cards.map(function (c) { return { term: c.term, def: c.def, img: c.img, alt: c.alt }; })), h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return String(h);
  })();

  function loadDraft() {
    var saved = readStore()[book.id];
    return saved && Array.isArray(saved.cards) ? saved.cards.map(tidy) : null;
  }

  // What students see: the saved set if there is one, else the book's.
  var reference = function () { return (published ? published.cards : book.cards).map(tidy); };
  var cards = reference();

  var mode = 'local';     // 'cloud' once signed in to a site that saves sets
  var editReady = false;  // the editor draws its rows once it knows the mode
  var canDraw = false;    // the site has Cloudflare Workers AI for Draw it
  var draft = null;
  var stale = false;      // the book's set changed after these edits were made

  var saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, mode === 'cloud' ? 1200 : 400);
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (mode === 'cloud') saveCloud();
    else saveLocal(false);
  }
  function saveLocal(quiet) {
    var all = readStore();
    all[book.id] = { cards: cards.map(plain), base: stale ? 'old' : base, saved: Date.now() };
    try {
      localStorage.setItem('is8-flashcards-v1', JSON.stringify(all));
      if (!quiet) status('Saved in this browser.');
    } catch (e) {
      say('This browser is out of room, so the last change was not saved. Use smaller pictures.', true);
    }
  }

  // Pictures added in the browser are still data or another site's address.
  // Each is copied to the site before the set is saved there.
  function dataToBlob(data) {
    var m = /^data:([^;,]+)(;base64)?,(.*)$/.exec(data);
    var bytes = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    var arr = new Uint8Array(bytes.length);
    for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: m[1] });
  }
  function copyPictures() {
    var chain = Promise.resolve();
    cards.forEach(function (c) {
      if (/^data:image\//.test(c.img)) {
        chain = chain.then(function () { return ED.uploadImage(dataToBlob(c.img)); }).then(function (r) { c.img = r.url; });
      } else if (/^https:\/\//.test(c.img)) {
        chain = chain.then(function () { return ED.imageFromUrl(c.img); }).then(function (r) { c.img = r.url; });
      }
    });
    return chain;
  }

  var saving = false, saveAgain = false;
  function saveCloud() {
    if (saving) { saveAgain = true; return; }
    saving = true;
    status('Saving...');
    copyPictures().then(function () {
      var out = { cards: cards.map(plain), base: stale ? 'old' : base };
      if (book.own) out.title = book.title;
      return ED.saveSet(book.id, out);
    }).then(function () {
      published = { cards: cards.map(plain), base: stale ? 'old' : base };
      clearDraft();
      status('Saved. Students see this now.');
    }, function (err) {
      saveLocal(true);
      if (err && err.status === 401) {
        say('You have been signed out, so this change is kept in this browser for now. Sign in to save it for students.', true);
        showSignIn();
      } else {
        say(((err && err.message) || 'That did not save.') + ' The change is kept in this browser and will be saved with your next change.', true);
      }
    }).then(function () {
      saving = false;
      if (saveAgain) { saveAgain = false; saveCloud(); }
    });
  }
  function clearDraft() {
    var all = readStore();
    delete all[book.id];
    try {
      if (Object.keys(all).length) localStorage.setItem('is8-flashcards-v1', JSON.stringify(all));
      else localStorage.removeItem('is8-flashcards-v1');
    } catch (e) { /* nothing stored */ }
  }

  // A plain "Saving..." or "Saved" never covers a message with a button in
  // it (like Undo) for the few seconds it takes to use it.
  var keepUntil = 0;
  function status(text) {
    if (Date.now() < keepUntil) return;
    say(text);
  }

  // One line of news in the edit bar, with up to two buttons after it.
  function say(text, warn, action, action2) {
    if (!note) return;
    keepUntil = action ? Date.now() + 10000 : 0;
    note.textContent = '';
    var span = document.createElement('span');
    span.textContent = text;
    if (warn) span.className = 'warn';
    note.appendChild(span);
    [action, action2].forEach(function (a) {
      if (!a) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'linkbtn';
      b.textContent = a.label;
      b.style.marginLeft = '8px';
      b.addEventListener('click', a.run);
      note.appendChild(b);
    });
  }


  /* ---------------- study marks kept in this browser ---------------- */

  // { sets: { <set id>: { stars: [], known: [], learning: [], p: {} } } }
  // Terms are kept lowercased so an edit to capital letters keeps the marks.
  var study;
  try { study = JSON.parse(localStorage.getItem('is8-study-v1')) || {}; } catch (e) { study = {}; }
  function mine() {
    study.sets = study.sets || {};
    var s = study.sets[book.id] = study.sets[book.id] || {};
    s.stars = s.stars || [];
    s.known = s.known || [];
    s.learning = s.learning || [];
    s.p = s.p || {};
    return s;
  }
  function keepStudy() {
    try { localStorage.setItem('is8-study-v1', JSON.stringify(study)); } catch (e) { /* private window: marks last until the page closes */ }
  }
  var key = function (term) { return String(term || '').trim().toLowerCase(); };
  function pref(name, value) {
    var p = mine().p;
    if (arguments.length < 2) return p[name];
    if (value === undefined) delete p[name];
    else p[name] = value;
    keepStudy();
    return value;
  }
  function isStarred(term) { return mine().stars.indexOf(key(term)) !== -1; }
  function toggleStar(term) {
    var stars = mine().stars, k = key(term), at = stars.indexOf(k);
    if (at === -1) stars.push(k); else stars.splice(at, 1);
    keepStudy();
    return at === -1;
  }
  function markOf(term) {
    var s = mine(), k = key(term);
    return s.known.indexOf(k) !== -1 ? 'known' : s.learning.indexOf(k) !== -1 ? 'learning' : '';
  }
  function setMark(term, mark) {
    var s = mine(), k = key(term);
    s.known = s.known.filter(function (x) { return x !== k; });
    s.learning = s.learning.filter(function (x) { return x !== k; });
    if (mark === 'known') s.known.push(k);
    if (mark === 'learning') s.learning.push(k);
    keepStudy();
  }

  /* ---------------- reading out loud ---------------- */

  // The browser's own voice, so it costs nothing and needs no outside
  // service. It only ever speaks when a speaker button is pressed.
  // Browsers ship old robotic voices and newer natural ones side by side:
  // Edge has "Microsoft Aria Online (Natural)" and friends, Chrome has
  // "Google US English", a Mac has Samantha. Pick the most natural English
  // voice the computer has.
  var canSpeak = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
  var voice = null;
  // The English this device is set to (en-GB on a British computer, say),
  // so a voice with that accent wins among equally good ones (2026-09-30).
  var homeLang = ((navigator.languages || [navigator.language || '']).filter(function (l) { return /^en/i.test(l); })[0] || 'en-US').replace('_', '-').toLowerCase();
  function voiceScore(v) {
    var n = v.name || '';
    if (!/^en/i.test(v.lang)) return -100;
    var lang = String(v.lang).replace('_', '-').toLowerCase();
    var s = lang === homeLang ? 5 : /^en-us/.test(lang) ? 3 : 0;
    if (/natural/i.test(n)) s += 20;
    if (/google/i.test(n)) s += 12;
    // Apple's downloaded voices sound far better than its compact ones.
    if (/premium/i.test(n)) s += 10;
    if (/online|neural|enhanced/i.test(n)) s += 6;
    if (v.default && /^en/i.test(v.lang)) s += 1;
    if (/aria|jenny|ava|andrew|emma|brian|michelle|samantha|allison/i.test(n)) s += 3;
    if (/espeak|compact|zira|david|mark/i.test(n) && !/natural/i.test(n)) s -= 6;
    return s;
  }
  function pickVoice() {
    var all = (window.speechSynthesis.getVoices() || []).slice();
    all.sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
    voice = all.length && voiceScore(all[0]) > -100 ? all[0] : null;
  }
  if (canSpeak) {
    pickVoice();
    if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }
  function speak(text) {
    if (!canSpeak || !text) return;
    // Some browsers list their voices only after the page has loaded.
    if (!voice) pickVoice();
    window.speechSynthesis.cancel();
    var u = new window.SpeechSynthesisUtterance(String(text));
    u.lang = voice ? voice.lang : 'en-US';
    if (voice) u.voice = voice;
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  /* ---------------- hints ---------------- */

  // Looking at the term, the hint is the teacher's own hint if the card has
  // one, or else the first few words of the definition. Looking at the
  // definition, it is the term with only first letters showing.
  function hintFor(c, answerIsDef) {
    if (answerIsDef) {
      if (c.hint && c.hint.trim()) return c.hint.trim();
      var words = c.def.trim().split(/\s+/).filter(Boolean);
      if (words.length < 3) return '';
      var n = words.length > 8 ? 4 : 2;
      return words.slice(0, n).join(' ') + ' ...';
    }
    if (!c.term.trim()) return '';
    return c.term.trim().split(/\s+/).map(function (w) {
      var seen = false;
      return w.replace(/[A-Za-z0-9]/g, function (ch) {
        if (seen) return '_';
        seen = true;
        return ch;
      });
    }).join('   ');
  }

  /* ---------------- options ---------------- */

  var SPEEDS = { slow: 5000, medium: 3000, fast: 1800 };
  var opts = { termFirst: true, shuffle: false, sort: false, starred: false, pics: true, speed: 'medium', tts: false };
  (function () {
    var saved = pref('flash');
    if (saved && typeof saved === 'object') Object.keys(opts).forEach(function (k) { if (typeof saved[k] === typeof opts[k]) opts[k] = saved[k]; });
    if (!SPEEDS[opts.speed]) opts.speed = 'medium';
  })();
  function saveOpts() { pref('flash', opts); }

  /* ---------------- flashcards ---------------- */

  var deck = [];          // the cards in study order
  var pos = 0;            // which card in the deck is showing
  var reviewOnly = null;  // keys of the cards in a "keep reviewing" round
  var session = {};       // this round's sorting: key -> 'known' | 'learning'
  var undoStack = [];     // sorting steps that can be undone
  var hintShown = false;

  // A picture with no description is described by its term.
  var altOf = function (c) { return c.alt || (c.term ? 'Picture for ' + c.term : ''); };
  var usable = function (c) { return c.term.trim() || c.def.trim() || c.img; };
  var anyStarred = function () { return cards.some(function (c) { return usable(c) && isStarred(c.term); }); };

  // The cards being studied: every usable card, or only the starred ones.
  function studyCards() {
    var live = cards.filter(usable);
    if (opts.starred && anyStarred()) live = live.filter(function (c) { return isStarred(c.term); });
    return live;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Rebuild the study order after the set or an option changes, staying on
  // the same card where it can.
  function rebuildDeck(keepShuffle) {
    var showing = deck[pos];
    var live = studyCards();
    if (reviewOnly) live = live.filter(function (c) { return reviewOnly.indexOf(key(c.term)) !== -1; });
    if (opts.shuffle && keepShuffle) {
      var kept = deck.filter(function (c) { return live.indexOf(c) !== -1; });
      live.forEach(function (c) { if (kept.indexOf(c) === -1) kept.push(c); });
      deck = kept;
    } else {
      deck = opts.shuffle ? shuffle(live) : live;
    }
    var at = deck.indexOf(showing);
    pos = at !== -1 ? at : Math.min(pos, Math.max(deck.length - 1, 0));
  }

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fillFace(face, label, text, img, alt, hint) {
    face.textContent = '';
    face.className = face.className.replace(/\s*has-img/g, '');
    if (label) face.appendChild(mk('span', 'fc-face-label', label));
    var body = mk('div', 'fc-face-body');
    if (text) body.appendChild(mk('span', 'fc-text' + (text.length > 150 ? ' long' : text.length > 55 ? ' mid' : ''), text));
    if (hint) {
      var h = mk('span', 'fc-hint', 'Hint: ' + hint);
      h.setAttribute('aria-live', 'polite');
      body.appendChild(h);
    }
    face.appendChild(body);
    if (img && opts.pics) {
      var im = document.createElement('img');
      im.src = img;
      im.alt = alt || '';
      face.appendChild(im);
      face.className += ' has-img';
    }
  }

  var flipped = function () { return card.classList.contains('flipped'); };

  function flipTo(state, animate) {
    if (!animate) card.classList.add('no-anim');
    card.classList.toggle('flipped', state);
    card.setAttribute('aria-label', (state ? 'Showing the back. ' : 'Showing the front. ') + 'Press to flip.');
    if (!animate) {
      void card.offsetWidth;
      card.classList.remove('no-anim');
    }
    updateCardBar();
    if (animate) autoSpeak();
  }

  // Text to speech (Options): the side that is showing is read out loud when
  // a card comes up and when it flips. Off unless the student turns it on.
  function autoSpeak() {
    var c = current();
    if (!opts.tts || !canSpeak || !c || editing || activeMode !== 'flashcards') return;
    var termShowing = flipped() ? !opts.termFirst : opts.termFirst;
    speak(termShowing ? c.term : c.def);
  }

  function current() { return done.hidden && !card.hidden ? deck[pos] : null; }

  function updateCardBar() {
    var c = current();
    var hintBtn = $('fcHint'), starBtn = $('fcStar'), speakBtn = $('fcSpeak');
    hintBtn.hidden = !c || flipped() || hintShown || !hintFor(c, opts.termFirst);
    speakBtn.hidden = !c || !canSpeak;
    starBtn.hidden = !c;
    if (c) {
      var on = isStarred(c.term);
      starBtn.setAttribute('aria-pressed', String(on));
      starBtn.setAttribute('aria-label', on ? 'Remove the star from this term' : 'Star this term');
    }
  }

  var ICON_PREV = prevBtn.innerHTML, ICON_NEXT = nextBtn.innerHTML;
  var ICON_CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

  function showCard() {
    var total = deck.length;
    done.hidden = true;
    card.hidden = false;
    hintShown = false;
    if (!total) {
      var empty = editing ? 'No cards yet. Add one below.'
        : opts.starred && !anyStarred() ? 'No starred terms yet. Star a card, or turn off "Study starred terms only" in Options.'
        : 'This set has no cards yet.';
      fillFace(front, '', empty, '', '', '');
      fillFace(back, '', '', '', '', '');
      counter.textContent = '0 / 0';
      bar.style.width = '0';
      prevBtn.disabled = nextBtn.disabled = true;
      updateCardBar();
      return;
    }
    var c = deck[pos];
    var termSide = ['Term', c.term, '', ''];
    var defSide = ['Definition', c.def, c.img, altOf(c)];
    var a = opts.termFirst ? termSide : defSide;
    var b = opts.termFirst ? defSide : termSide;
    fillFace(front, a[0], a[1], a[2], a[3], '');
    fillFace(back, b[0], b[1], b[2], b[3], '');
    counter.textContent = (pos + 1) + ' / ' + total;
    bar.style.width = ((opts.sort ? pos : pos + 1) / total * 100) + '%';
    prevBtn.disabled = !opts.sort && pos === 0;
    nextBtn.disabled = false;
    $('fcUndo').disabled = !undoStack.length;
    updateCardBar();
    autoSpeak();
  }

  function showHint() {
    var c = current();
    if (!c || flipped() || hintShown) return;
    var h = hintFor(c, opts.termFirst);
    if (!h) return;
    hintShown = true;
    var side = opts.termFirst ? ['Term', c.term, '', ''] : ['Definition', c.def, c.img, altOf(c)];
    fillFace(front, side[0], side[1], side[2], side[3], h);
    updateCardBar();
  }

  function go(step) {
    if (!deck.length) return;
    if (!done.hidden) {
      if (step < 0 && !opts.sort) { flipTo(false, false); showCard(); }
      return;
    }
    var to = pos + step;
    if (to < 0) return;
    if (to >= deck.length) { showDone(); return; }
    pos = to;
    flipTo(false, false);
    showCard();
  }

  /* ---------------- sorting into Know and Still learning ---------------- */

  function sortCounts() {
    var known = 0, learning = 0;
    Object.keys(session).forEach(function (k) { if (session[k] === 'known') known += 1; else learning += 1; });
    $('fcKnownCount').textContent = known;
    $('fcLearningCount').textContent = learning;
    return { known: known, learning: learning };
  }

  function sortCard(knowIt) {
    var c = current();
    if (!c) return;
    var k = key(c.term);
    undoStack.push({ pos: pos, k: k, term: c.term, before: session[k], saved: markOf(c.term) });
    session[k] = knowIt ? 'known' : 'learning';
    setMark(c.term, session[k]);
    sortCounts();
    card.classList.remove('pulse-known', 'pulse-learning');
    void card.offsetWidth;
    card.classList.add(knowIt ? 'pulse-known' : 'pulse-learning');
    go(1);
  }

  function undoSort() {
    var last = undoStack.pop();
    if (!last) return;
    if (last.before) session[last.k] = last.before; else delete session[last.k];
    setMark(last.term, last.saved);
    sortCounts();
    pos = last.pos;
    flipTo(false, false);
    showCard();
  }

  function setSort(on) {
    opts.sort = on;
    saveOpts();
    if (on) setPlaying(false);
    $('fcSort').setAttribute('aria-pressed', String(on));
    $('fcOptSort').checked = on;
    $('fcSortBar').hidden = !on;
    $('fcUndo').hidden = !on;
    $('fcPlay').hidden = on;
    prevBtn.innerHTML = on ? ICON_CROSS : ICON_PREV;
    nextBtn.innerHTML = on ? ICON_CHECK : ICON_NEXT;
    prevBtn.setAttribute('aria-label', on ? 'Still learning' : 'Previous card');
    nextBtn.setAttribute('aria-label', on ? 'Know it' : 'Next card');
    prevBtn.title = on ? 'Still learning' : 'Previous card';
    nextBtn.title = on ? 'Know it' : 'Next card';
    prevBtn.classList.toggle('learning', on);
    nextBtn.classList.toggle('known', on);
    $('fcHelp').textContent = on
      ? 'Flip the card, then choose Still learning (left arrow) or Know it (right arrow). S stars a card and H shows a hint.'
      : 'Click the card or press the space bar to flip it. Arrow keys move. S stars a card and H shows a hint.';
    restart(false, true);
  }

  /* ---------------- the end of the deck ---------------- */

  function doneButton(label, run, secondary) {
    var b = mk('button', 'btn' + (secondary ? ' secondary' : ''), label);
    b.type = 'button';
    b.addEventListener('click', run);
    return b;
  }

  function showDone() {
    setPlaying(false);
    done.textContent = '';
    card.hidden = true;
    done.hidden = false;
    bar.style.width = '100%';
    prevBtn.disabled = opts.sort;
    nextBtn.disabled = true;
    updateCardBar();
    var actions = mk('div', 'fc-done-actions');
    if (opts.sort) {
      var n = sortCounts();
      var total = n.known + n.learning;
      var ring = mk('div', 'fc-done-ring');
      ring.style.setProperty('--pct', total ? Math.round(n.known / total * 100) : 0);
      ring.appendChild(mk('span', '', (total ? Math.round(n.known / total * 100) : 0) + '%'));
      done.appendChild(ring);
      done.appendChild(mk('p', 'fc-done-big', n.learning ? 'You know ' + n.known + ' of ' + total + ' terms.' : 'You know all ' + total + ' terms.'));
      done.appendChild(mk('p', 'fc-done-small', n.learning ? n.learning + ' still to learn. Keep going with just those.' : 'Try Learn or a practice test to make sure they stick.'));
      if (n.learning) {
        actions.appendChild(doneButton('Keep reviewing ' + n.learning + (n.learning === 1 ? ' term' : ' terms'), function () {
          reviewOnly = Object.keys(session).filter(function (k) { return session[k] === 'learning'; });
          restart(false, true);
        }));
      }
      actions.appendChild(doneButton('Restart flashcards', function () { reviewOnly = null; restart(false, true); }, !!n.learning));
      actions.appendChild(doneButton('Practice in Learn', function () { goMode('learn'); }, true));
    } else {
      done.appendChild(mk('p', 'fc-done-big', 'You went through all ' + deck.length + ' cards.'));
      actions.appendChild(doneButton('Start over', function () { restart(false); }));
      actions.appendChild(doneButton('Shuffle and start over', function () { restart(true); }, true));
      actions.appendChild(doneButton('Practice in Learn', function () { goMode('learn'); }, true));
    }
    done.appendChild(actions);
    actions.firstChild.focus();
  }

  function restart(mix, fresh) {
    if (mix) setShuffle(true, true);
    if (fresh) { session = {}; undoStack = []; sortCounts(); }
    deck = [];
    pos = 0;
    rebuildDeck(false);
    flipTo(false, false);
    showCard();
  }

  /* ---------------- playing on their own ---------------- */

  var playTimer = null;
  function setPlaying(on) {
    clearTimeout(playTimer);
    playTimer = null;
    var btn = $('fcPlay');
    btn.setAttribute('aria-pressed', String(!!on));
    btn.setAttribute('aria-label', on ? 'Stop playing' : 'Play the cards on their own');
    btn.title = on ? 'Stop' : 'Play';
    if (on) playTimer = setTimeout(playStep, SPEEDS[opts.speed]);
  }
  function playStep() {
    if (!current()) { setPlaying(false); return; }
    if (!flipped()) flipTo(true, true);
    else if (pos >= deck.length - 1) { setPlaying(false); showDone(); return; }
    else go(1);
    playTimer = setTimeout(playStep, SPEEDS[opts.speed]);
  }

  function setShuffle(on, quiet) {
    opts.shuffle = on;
    saveOpts();
    $('fcShuffle').setAttribute('aria-pressed', String(on));
    $('fcOptShuffle').checked = on;
    if (!quiet) restart(false);
  }

  function setSide(termFirst) {
    opts.termFirst = termFirst;
    saveOpts();
    $('fcSideTerm').setAttribute('aria-pressed', String(termFirst));
    $('fcSideDef').setAttribute('aria-pressed', String(!termFirst));
    flipTo(false, false);
    showCard();
  }

  function starCurrent() {
    var c = current();
    if (!c) return;
    toggleStar(c.term);
    updateCardBar();
    refreshStars();
  }

  // After a star changes: the options note, and the list's star buttons.
  function refreshStars() {
    var n = cards.filter(function (c) { return usable(c) && isStarred(c.term); }).length;
    $('fcStarNote').textContent = n ? '(' + n + ' starred)' : '(none starred yet)';
    rowsEl.querySelectorAll('.fc-row-star').forEach(function (b) {
      var on = isStarred(b.getAttribute('data-term'));
      b.setAttribute('aria-pressed', String(on));
    });
    if (listStarredOnly) renderList();
  }

  /* ---------------- wiring the flashcards ---------------- */

  card.addEventListener('click', function () { flipTo(!flipped(), true); });
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipTo(!flipped(), true); }
  });
  prevBtn.addEventListener('click', function () { if (opts.sort) sortCard(false); else go(-1); });
  nextBtn.addEventListener('click', function () { if (opts.sort) sortCard(true); else go(1); });
  $('fcHint').addEventListener('click', showHint);
  $('fcStar').addEventListener('click', starCurrent);
  $('fcSpeak').addEventListener('click', function () {
    var c = current();
    if (!c) return;
    var termShowing = opts.termFirst !== flipped();
    speak(termShowing ? c.term : c.def);
  });
  $('fcUndo').addEventListener('click', undoSort);
  $('fcSort').addEventListener('click', function () { setSort(!opts.sort); });
  $('fcShuffle').addEventListener('click', function () { setShuffle(!opts.shuffle); });
  $('fcPlay').addEventListener('click', function () {
    if (playTimer) { setPlaying(false); return; }
    if (!done.hidden) restart(false);
    setPlaying(true);
  });

  var fullBtn = $('fcFull'), studyEl = $('fcStudy');
  if (!document.fullscreenEnabled || !studyEl.requestFullscreen) fullBtn.hidden = true;
  fullBtn.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else studyEl.requestFullscreen().catch(function () { fullBtn.hidden = true; });
  });
  document.addEventListener('fullscreenchange', function () {
    var on = document.fullscreenElement === studyEl;
    fullBtn.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    fullBtn.title = on ? 'Leave full screen' : 'Full screen';
  });

  // Options panel
  var optBtn = $('fcOptionsBtn'), optBox = $('fcOptions');
  optBtn.addEventListener('click', function () {
    var open = optBox.hidden;
    optBox.hidden = !open;
    optBtn.setAttribute('aria-expanded', String(open));
    if (open) optBox.querySelector('button, input').focus();
  });
  $('fcSideTerm').addEventListener('click', function () { setSide(true); });
  $('fcSideDef').addEventListener('click', function () { setSide(false); });
  $('fcOptSort').addEventListener('change', function () { setSort(this.checked); });
  $('fcOptShuffle').addEventListener('change', function () { setShuffle(this.checked); });
  $('fcOptStarred').addEventListener('change', function () {
    opts.starred = this.checked;
    saveOpts();
    reviewOnly = null;
    restart(false, true);
  });
  $('fcOptPics').addEventListener('change', function () { opts.pics = this.checked; saveOpts(); showCard(); });
  $('fcOptTts').addEventListener('change', function () {
    opts.tts = this.checked;
    saveOpts();
    if (opts.tts) autoSpeak(); else if (canSpeak) window.speechSynthesis.cancel();
  });
  if (!canSpeak) $('fcOptTts').closest('label').hidden = true;
  [].forEach.call(document.querySelectorAll('[data-speed]'), function (b) {
    b.addEventListener('click', function () {
      opts.speed = b.getAttribute('data-speed');
      saveOpts();
      [].forEach.call(document.querySelectorAll('[data-speed]'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      if (playTimer) setPlaying(true);
    });
  });
  $('fcPdf').addEventListener('click', function () { exportAs('pdf', this); });
  $('fcClearStudy').addEventListener('click', function () { $('fcClearConfirm').hidden = false; $('fcClearNo').focus(); });
  $('fcClearNo').addEventListener('click', function () { $('fcClearConfirm').hidden = true; });
  $('fcClearYes').addEventListener('click', function () {
    var s = mine();
    s.stars = []; s.known = []; s.learning = [];
    keepStudy();
    $('fcClearConfirm').hidden = true;
    reviewOnly = null;
    refreshStars();
    restart(false, true);
  });

  /* ---------------- share and print ---------------- */

  // The share button's menu. Students get Copy link, Print or PDF and Export.
  // The teacher's Make a copy and Combine are added by the editor only once
  // it is signed in (addTeacherShareItems), so students never see them.
  var shareBtn = $('fcShareBtn'), shareMenu = $('fcShareMenu');
  function shareOpen(open) {
    shareMenu.hidden = !open;
    shareBtn.setAttribute('aria-expanded', String(open));
    if (open) { if (quickMenu) quickOpen(false); shareMenu.querySelector('button').focus(); }
  }
  shareBtn.addEventListener('click', function () { shareOpen(shareMenu.hidden); });
  document.addEventListener('click', function (e) { if (!shareMenu.hidden && !e.target.closest('.fc-share:not(.fc-share-quick)')) shareOpen(false); });
  shareMenu.addEventListener('keydown', function (e) {
    var items = [].slice.call(shareMenu.querySelectorAll('button'));
    var i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { shareOpen(false); shareBtn.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      box.remove();
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }
  // A button that says "Copied!" for a moment (its words only, not its icon).
  function copiedOn(btn, text) {
    var words = btn.querySelector('span') || btn;
    var label = words.textContent;
    copyText(text).then(function () { words.textContent = 'Copied!'; }, function () { words.textContent = 'Could not copy'; })
      .then(function () { setTimeout(function () { words.textContent = label; }, 1800); });
  }
  // Share: copy the set's link, or post it to Google Classroom (Classroom's
  // own share page, where the teacher picks the class).
  var quickBtn = $('fcQuickBtn'), quickMenu = $('fcQuickMenu');
  var setLink = location.origin + location.pathname;
  function quickOpen(open) {
    quickMenu.hidden = !open;
    quickBtn.setAttribute('aria-expanded', String(open));
    if (open) { shareOpen(false); quickMenu.querySelector('button, a').focus(); }
  }
  quickBtn.addEventListener('click', function () { quickOpen(quickMenu.hidden); });
  document.addEventListener('click', function (e) { if (!quickMenu.hidden && !e.target.closest('.fc-share-quick')) quickOpen(false); });
  quickMenu.addEventListener('keydown', function (e) {
    var items = [].slice.call(quickMenu.querySelectorAll('button, a'));
    var i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { quickOpen(false); quickBtn.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  $('fcQuickCopy').addEventListener('click', function () { copiedOn(this, setLink); });
  $('fcQuickClassroom').href = 'https://classroom.google.com/share?url=' + encodeURIComponent(setLink) +
    '&title=' + encodeURIComponent($('fcTitle').textContent.trim() + ' flashcards') +
    '&body=' + encodeURIComponent('Study these words with flashcards, Learn, Match and Test.') +
    '&itemtype=announcement';
  $('fcQuickClassroom').addEventListener('click', function () { quickOpen(false); });

  // Edit, in the menu for everyone (like Quizlet's). It asks for the teacher
  // password first, so a student who clicks it gets a password box and
  // nothing else. Signed in, it opens the editor; in the editor it reads
  // Stop editing.
  var editItem = $('fcEditItem');
  if (wantsEdit) editItem.querySelector('span').textContent = 'Stop editing';
  editItem.addEventListener('click', function () {
    shareOpen(false);
    if (wantsEdit) { location.href = location.pathname; return; }
    var go = function () { location.href = location.pathname + '?edit'; };
    if (!ED) return;
    ED.session().then(function (s) {
      if (s.cloud && s.editor) { go(); return; }
      var d = dialogBox('Teacher sign in');
      if (!s.cloud) {
        d.appendChild(mk('p', 'fc-dialog-note', 'Editing is not switched on for this site.'));
      } else {
        d.appendChild(mk('p', 'fc-dialog-note', 'Editing is for the teacher. Enter the teacher password to edit this set.'));
        var box = mk('div', 'fc-dialog-signin');
        d.appendChild(box);
        d.showModal();
        ED.signInForm(box, go).focus();
        return;
      }
      d.showModal();
    });
  });

  // A window over the page, used by Export and the teacher's tools.
  function dialogBox(title) {
    var d = document.createElement('dialog');
    d.className = 'fc-dialog';
    var h = mk('h2', 'fc-dialog-title', title);
    h.id = 'fcDlg' + Math.random().toString(36).slice(2, 8);
    d.setAttribute('aria-labelledby', h.id);
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'fc-dialog-x';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = ICON_CROSS;
    x.addEventListener('click', function () { d.close(); });
    d.appendChild(x);
    d.appendChild(h);
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    d.addEventListener('close', function () { d.remove(); });
    document.body.appendChild(d);
    return d;
  }
  function radio(group, value, label, checked) {
    var l = mk('label', 'fc-dialog-choice');
    var r = document.createElement('input');
    r.type = 'radio';
    r.name = group;
    r.value = value;
    r.checked = !!checked;
    l.appendChild(r);
    l.appendChild(document.createTextNode(' ' + label));
    return l;
  }

  // Export: the words as plain text to copy, with the separators the student
  // picks (Quizlet's Import reads tab and new line).
  $('fcExportOpen').addEventListener('click', function () {
    shareOpen(false);
    var d = dialogBox('Export');
    var grid = mk('div', 'fc-exp-grid');
    function side(legend, group, choices) {
      var f = mk('fieldset', 'fc-exp-set');
      f.appendChild(mk('legend', '', legend));
      choices.forEach(function (ch, i) { f.appendChild(radio(group, ch[0], ch[1], i === 0)); });
      var own = document.createElement('input');
      own.type = 'text';
      own.className = 'fc-exp-custom';
      own.setAttribute('aria-label', legend + ': your own separator');
      own.placeholder = 'Your own';
      own.maxLength = 10;
      var ownRow = mk('label', 'fc-dialog-choice');
      var r = document.createElement('input');
      r.type = 'radio';
      r.name = group;
      r.value = 'own';
      ownRow.appendChild(r);
      ownRow.appendChild(own);
      own.addEventListener('focus', function () { r.checked = true; build(); });
      own.addEventListener('input', build);
      f.appendChild(ownRow);
      f.addEventListener('change', build);
      grid.appendChild(f);
      return function () {
        var v = (f.querySelector('input[type=radio]:checked') || {}).value;
        if (v === 'own') return own.value.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        return v === 'tab' ? '\t' : v === 'comma' ? ',' : v === 'semi' ? ';' : '\n';
      };
    }
    var between = side('Between term and definition', 'fcExpSep', [['tab', 'Tab'], ['comma', 'Comma']]);
    var rows = side('Between rows', 'fcExpRow', [['line', 'New line'], ['semi', 'Semicolon']]);
    d.appendChild(grid);
    var alphaRow = mk('label', 'fc-dialog-choice');
    var alpha = document.createElement('input');
    alpha.type = 'checkbox';
    alpha.addEventListener('change', build);
    alphaRow.appendChild(alpha);
    alphaRow.appendChild(document.createTextNode(' Alphabetize'));
    d.appendChild(alphaRow);
    var bar = mk('div', 'fc-exp-bar');
    bar.appendChild(mk('p', '', 'Copy the text below and paste it into a document, a spreadsheet or another flashcard site.'));
    var copy = mk('button', 'btn fc-small', 'Copy text');
    copy.type = 'button';
    copy.addEventListener('click', function () { copiedOn(copy, text.value); });
    bar.appendChild(copy);
    d.appendChild(bar);
    var text = document.createElement('textarea');
    text.className = 'fc-exp-text';
    text.readOnly = true;
    text.rows = 10;
    text.setAttribute('aria-label', 'The words in this set, ready to copy');
    d.appendChild(text);
    function build() {
      var list = cards.filter(usable).map(function (c) { return [c.term.trim(), c.def.trim()]; });
      if (alpha.checked) list.sort(function (a, b) { return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }); });
      var sep = between(), row = rows();
      text.value = list.map(function (t) { return t[0] + sep + t[1]; }).join(row);
    }
    build();
    d.showModal();
    copy.focus();
  });

  /* ---------------- how to play the live games ---------------- */

  var HOWTO = {
    volley: ['How to play Vocab Live', 'Teams race to answer questions in a row. First team to the finish wins.', [
      'One player hosts: press Host, pick the options and show the join code.',
      'Everyone else joins with the code (Have a code? Join a game) and is put on a team.',
      'Your whole team sees the same question, but the answers are split across your screens. Only one of you has the right one, so talk it through.',
      'A wrong answer sends your team back to zero and shows the right answer. Press Continue when your team has read it.'
    ]],
    blast: ['How to play Blast', 'Blast is played in teams of up to 4, where each player controls their own spaceship in a corner of the screen.', [
      'Your spaceship has a yellow ring, so you know which one is yours.',
      'The angle of your blaster follows your mouse or finger as you move it.',
      'A definition shows at the top. Click or tap the asteroid with the matching term to blast it and score a point for your team.',
      'Hit the wrong asteroid and your ship recharges for 2 seconds. The team with the most points when time runs out wins.'
    ]],
    match: ['How to play Match', 'Match is a fast game where players race against each other to match up cards.', [
      'Everyone gets the same terms and definitions, each laid out in their own order.',
      'Pick a term, then its definition, to clear the pair. A wrong pair holds you for a second.',
      'First to clear every pair wins. The host sees everyone racing on the big screen.',
      'Try memory mode: the host can turn on Hidden cards, so the cards start face down and you have to remember where each one is.'
    ]]
  };
  [].forEach.call(document.querySelectorAll('[data-howto]'), function (btn) {
    btn.addEventListener('click', function () {
      var h = HOWTO[btn.getAttribute('data-howto')];
      if (!h) return;
      var d = dialogBox(h[0]);
      d.appendChild(mk('p', 'fc-dialog-note', h[1]));
      var ol = mk('ol', 'fc-howto');
      h[2].forEach(function (step) { ol.appendChild(mk('li', '', step)); });
      d.appendChild(ol);
      var ok = mk('button', 'btn fc-small', 'Got it');
      ok.type = 'button';
      ok.addEventListener('click', function () { d.close(); });
      d.appendChild(ok);
      d.showModal();
      ok.focus();
    });
  });

  /* ---------------- the teacher's copy and combine ---------------- */

  var teacherItems = false;
  function addTeacherShareItems() {
    if (teacherItems || !ED || !ED.getSet) return;
    teacherItems = true;
    shareMenu.appendChild(mk('span', 'fc-share-sep', 'Teacher'));
    var copyBtn = mk('button', 'fc-share-item', 'Make a copy into another set');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', function () { shareOpen(false); otherSets(makeCopy); });
    var combineBtn = mk('button', 'fc-share-item', 'Combine: add cards from other sets');
    combineBtn.type = 'button';
    combineBtn.addEventListener('click', function () { shareOpen(false); otherSets(combine); });
    shareMenu.appendChild(copyBtn);
    shareMenu.appendChild(combineBtn);
  }

  // Every other set in the book, then the tool that uses them.
  function otherSets(then) {
    ED.listSets().then(function (r) {
      then(((r && r.list) || []).filter(function (x) { return x.id !== book.id; }));
    }, function (err) { say(err.message, true); });
  }
  function noOthers(d) {
    d.appendChild(mk('p', 'fc-dialog-note', 'There are no other flashcard sets yet. As more chapters get sets, they show up here.'));
    var ok = mk('button', 'btn fc-small', 'Close');
    ok.type = 'button';
    ok.addEventListener('click', function () { d.close(); });
    d.appendChild(ok);
    d.showModal();
  }
  var setName = function (x) { return x.own ? 'Your set: ' + x.title : 'Unit ' + x.unit + ', Chapter ' + x.chapter + ': ' + x.title; };
  var plainCard = function (c) { return { term: c.term, def: c.def, hint: c.hint || '', img: c.img || '', alt: c.alt || '', credit: c.credit || '' }; };
  var sameTerm = function (list) {
    var seen = {};
    list.forEach(function (c) { seen[c.term.trim().toLowerCase()] = true; });
    return function (c) { return !seen[String(c.term || '').trim().toLowerCase()]; };
  };

  // Make a copy: this set's cards go into another set, added at its end or
  // in place of its cards. Students of that set see it straight away.
  function makeCopy(others) {
    var d = dialogBox('Make a copy into another set');
    if (!others.length) { noOthers(d); return; }
    var mine = cards.filter(usable);
    d.appendChild(mk('p', 'fc-dialog-note', 'Copy the ' + mine.length + ' cards in this set into:'));
    var pick = document.createElement('select');
    pick.className = 'fc-dialog-select';
    pick.setAttribute('aria-label', 'The set to copy into');
    others.forEach(function (x) { var o = document.createElement('option'); o.value = x.id; o.textContent = setName(x); pick.appendChild(o); });
    d.appendChild(pick);
    d.appendChild(radio('fcCopyHow', 'add', 'Add them after that set\u2019s cards (words it already has are skipped)', true));
    d.appendChild(radio('fcCopyHow', 'replace', 'Replace that set\u2019s cards with these'));
    var msg = mk('p', 'fc-dialog-msg');
    msg.setAttribute('role', 'status');
    var go = mk('button', 'btn fc-small', 'Copy the cards');
    go.type = 'button';
    go.addEventListener('click', function () {
      var target = pick.value;
      var replace = d.querySelector('input[name=fcCopyHow]:checked').value === 'replace';
      go.disabled = true;
      msg.textContent = 'Copying...';
      ED.getSet(target).then(function (r) {
        var theirs = (r.cards || []).map(plainCard);
        var next = replace ? mine.map(plainCard) : theirs.concat(mine.filter(sameTerm(theirs)).map(plainCard));
        return ED.saveSet(target, { cards: next, base: '' }).then(function () {
          msg.textContent = 'Done. ' + setName(others.filter(function (x) { return x.id === target; })[0]) + ' now has ' + next.length + ' cards.';
        });
      }).catch(function (err) { msg.textContent = err.message; }).then(function () { go.disabled = false; });
    });
    d.appendChild(go);
    d.appendChild(msg);
    d.showModal();
  }

  // Combine: cards from the sets ticked are added to this set. Words this set
  // already has are skipped.
  function combine(others) {
    var d = dialogBox('Combine: add cards from other sets');
    if (!others.length) { noOthers(d); return; }
    d.appendChild(mk('p', 'fc-dialog-note', 'Add the cards from these sets to the end of this one:'));
    others.forEach(function (x) {
      var l = mk('label', 'fc-dialog-choice');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = x.id;
      l.appendChild(cb);
      l.appendChild(document.createTextNode(' ' + setName(x)));
      d.appendChild(l);
    });
    var msg = mk('p', 'fc-dialog-msg');
    msg.setAttribute('role', 'status');
    var go = mk('button', 'btn fc-small', 'Add the cards');
    go.type = 'button';
    go.addEventListener('click', function () {
      var ids = [].map.call(d.querySelectorAll('input[type=checkbox]:checked'), function (cb) { return cb.value; });
      if (!ids.length) { msg.textContent = 'Tick at least one set.'; return; }
      go.disabled = true;
      msg.textContent = 'Adding...';
      Promise.all(ids.map(function (id) { return ED.getSet(id); })).then(function (sets) {
        var added = 0;
        sets.forEach(function (r) {
          (r.cards || []).filter(sameTerm(cards)).forEach(function (c) { cards.push(tidy(c)); added++; });
        });
        changed(true);
        msg.textContent = added ? 'Added ' + added + (added === 1 ? ' card. It is' : ' cards. They are') + ' at the end of the list below.' : 'Those sets have no words this set does not already have.';
      }).catch(function (err) { msg.textContent = err.message; }).then(function () { go.disabled = false; });
    });
    d.appendChild(go);
    d.appendChild(msg);
    d.showModal();
  }

  function applyOptionsToControls() {
    $('fcSideTerm').setAttribute('aria-pressed', String(opts.termFirst));
    $('fcSideDef').setAttribute('aria-pressed', String(!opts.termFirst));
    $('fcShuffle').setAttribute('aria-pressed', String(opts.shuffle));
    $('fcOptShuffle').checked = opts.shuffle;
    $('fcOptStarred').checked = opts.starred;
    $('fcOptPics').checked = opts.pics;
    $('fcOptTts').checked = opts.tts;
    [].forEach.call(document.querySelectorAll('[data-speed]'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-speed') === opts.speed)); });
  }

  var typing = function (el) { return el && (/^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable); };
  document.addEventListener('keydown', function (e) {
    if (activeMode !== 'flashcards') return;
    if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
    if (e.target.closest && e.target.closest('.drawer, .fc-options, .fc-editbar, .fc-share, .fc-dialog, .fc-zoom')) return;
    var k = e.key;
    if (k === 'ArrowRight') { e.preventDefault(); if (opts.sort) sortCard(true); else go(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); if (opts.sort) sortCard(false); else go(-1); }
    else if ((k === ' ' || k === 'ArrowUp' || k === 'ArrowDown') && current()) {
      // A focused button already answers the space bar on its own.
      if (k === ' ' && (e.target.tagName === 'BUTTON' || e.target === card)) return;
      e.preventDefault();
      flipTo(!flipped(), true);
    }
    else if ((k === 's' || k === 'S') && current()) { e.preventDefault(); starCurrent(); }
    else if ((k === 'h' || k === 'H') && current()) { e.preventDefault(); showHint(); }
  });

  var touch = null;
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (!touch) return;
    var dx = e.changedTouches[0].clientX - touch.x;
    var dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    // Sorting: swipe right for Know it, left for Still learning, like Quizlet.
    if (opts.sort) sortCard(dx > 0);
    else go(dx < 0 ? 1 : -1);
  });

  /* ---------------- the list ---------------- */

  var listStarredOnly = false;

  function updateCounts() {
    var n = cards.filter(usable).length;
    $('fcListCount').textContent = n;
    $('fcCount').textContent = n + (n === 1 ? ' term' : ' terms');
  }

  function smallIcon(label, svg, run, cls) {
    var b = mk('button', 'fc-row-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    b.innerHTML = svg;
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', run);
    return b;
  }
  var SVG_STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
  var SVG_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5.5M14 11v5.5"/></svg>';
  var SVG_SPEAK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';

  function viewRow(c) {
    var li = mk('li', 'fc-row');
    li.appendChild(mk('div', 'fc-row-term', c.term));
    li.appendChild(mk('div', 'fc-row-def', c.def));
    if (c.img) {
      var im = document.createElement('img');
      var zb = document.createElement('button');
      zb.type = 'button';
      zb.className = 'fc-thumb-btn';
      zb.setAttribute('aria-label', 'Show the picture for ' + c.term + ' bigger');
      zb.title = 'Click to see it bigger';
      im.className = 'fc-thumb';
      im.src = c.img;
      im.alt = altOf(c);
      im.loading = 'lazy';
      zb.appendChild(im);
      zb.addEventListener('click', function () { zoom(c.img, altOf(c), c.term, c.credit); });
      li.appendChild(zb);
    } else {
      li.appendChild(mk('span', 'fc-row-noimg'));
    }
    var tools = mk('div', 'fc-row-tools');
    var star = smallIcon('Star ' + c.term, SVG_STAR, function () {
      toggleStar(c.term);
      refreshStars();
      updateCardBar();
    }, 'fc-row-star');
    star.setAttribute('data-term', c.term);
    star.setAttribute('aria-pressed', String(isStarred(c.term)));
    tools.appendChild(star);
    if (canSpeak) tools.appendChild(smallIcon('Read ' + c.term + ' out loud', SVG_SPEAK, function () { speak(c.term + '. ' + c.def); }));
    li.appendChild(tools);
    return li;
  }

  function renderList() {
    rowsEl.textContent = '';
    var edit = editing && editReady;
    $('fcListTools').hidden = edit;
    if (edit) {
      cards.forEach(function (c, i) { rowsEl.appendChild(editRow(c, i)); });
      rowsEl.querySelectorAll('textarea').forEach(grow);
    } else {
      var shown = cards.filter(usable).filter(function (c) { return !listStarredOnly || isStarred(c.term); });
      shown.forEach(function (c) { rowsEl.appendChild(viewRow(c)); });
      if (!shown.length && listStarredOnly) rowsEl.appendChild(mk('li', 'fc-row-empty', 'No starred terms yet. Press the star on any card to add it here.'));
    }
    updateCounts();
  }
  $('fcListAll').addEventListener('click', function () {
    listStarredOnly = false;
    this.setAttribute('aria-pressed', 'true');
    $('fcListStarred').setAttribute('aria-pressed', 'false');
    renderList();
  });
  $('fcListStarred').addEventListener('click', function () {
    listStarredOnly = true;
    this.setAttribute('aria-pressed', 'true');
    $('fcListAll').setAttribute('aria-pressed', 'false');
    renderList();
  });

  /* ---------------- study modes ---------------- */

  var MODES = ['flashcards', 'learn', 'match', 'test'];
  var activeMode = 'flashcards';
  var tabs = MODES.map(function (m) { return $('fcTab-' + m); });

  function goMode(name) {
    if (MODES.indexOf(name) === -1) name = 'flashcards';
    var M = window.IS8Modes || {};
    if (activeMode !== 'flashcards' && activeMode !== name && M[activeMode] && M[activeMode].stop) M[activeMode].stop();
    setPlaying(false);
    if (window.speechSynthesis && canSpeak) window.speechSynthesis.cancel();
    activeMode = name;
    tabs.forEach(function (t, i) {
      var on = MODES[i] === name;
      t.setAttribute('aria-pressed', String(on));
      $('fcPanel-' + MODES[i]).hidden = !on;
    });
    $('fcList').hidden = name !== 'flashcards';
    if (name !== 'flashcards') {
      var panel = $('fcPanel-' + name);
      if (M[name] && M[name].start) M[name].start(panel, API);
      else panel.textContent = 'This way of studying did not load. Reload the page to try again.';
    }
    try {
      history.replaceState(null, '', name === 'flashcards' ? location.pathname + location.search : '#' + name);
    } catch (e) { /* opened from a file: the address cannot change */ }
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { goMode(MODES[i]); });
  });

  // What Learn, Test and Match see (assets/flashcard-modes.js).
  var API = window.IS8Flash = {
    title: book.title,
    canSpeak: canSpeak,
    speak: speak,
    cards: function () { return studyCards().map(plain); },
    isStarred: isStarred,
    toggleStar: function (term) { var on = toggleStar(term); refreshStars(); return on; },
    pref: pref,
    goMode: goMode
  };

  /* ---------------- Word and PDF files ---------------- */

  function saveBlob(blob, name) {
    var a = mk('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function exportAs(kind, btn) {
    var label = btn.textContent;
    var reset = function (text) {
      btn.textContent = text;
      setTimeout(function () { btn.textContent = label; btn.disabled = false; }, text === label ? 0 : 2500);
    };
    if (!window.IS8Export || !window.IS8Export[kind]) { btn.disabled = true; reset('That file maker did not load'); return; }
    var live = cards.filter(usable);
    btn.disabled = true;
    btn.textContent = 'Making the file...';
    window.IS8Export[kind]({
      title: book.title,
      subtitle: (book.where ? book.where + ' · ' : '') + live.length + (live.length === 1 ? ' term' : ' terms'),
      cards: live.map(plain)
    }).then(function (blob) {
      saveBlob(blob, book.file + (kind === 'pdf' ? '.pdf' : '.docx'));
      reset('Downloaded');
    }, function () { reset('Could not make the file'); });
  }

  /* ---------------- importing cards (edit mode) ---------------- */

  function parseImport() {
    var text = $('fcImportText').value;
    var termSep = document.querySelector('input[name="fcSepTerm"]:checked').value;
    var rowSep = document.querySelector('input[name="fcSepRow"]:checked').value;
    var termCustom = $('fcSepTermCustom').value, rowCustom = $('fcSepRowCustom').value;
    var rows = rowSep === 'semi' ? text.split(';')
      : rowSep === 'custom' && rowCustom ? text.split(rowCustom)
      : text.split(/\r?\n/);
    var out = [];
    rows.forEach(function (r) {
      if (!r.trim()) return;
      var at = -1, len = 0, m;
      // A tab, or what a tab often turns into when copied from a document or
      // web page: two or more spaces, or a no-break space (Gennaro, 2026-09-29).
      if (termSep === 'tab') { m = /\t+|[ \u00a0\u2002\u2003]{2,}|[\u00a0\u2002\u2003]/.exec(r.trim()); if (m) { r = r.trim(); at = m.index; len = m[0].length; } }
      else if (termSep === 'comma') { at = r.indexOf(','); len = 1; }
      else if (termSep === 'dash') { m = /\s+[-\u2013\u2014]\s+/.exec(r); if (m) { at = m.index; len = m[0].length; } }
      else if (termCustom) { at = r.indexOf(termCustom); len = termCustom.length; }
      var term = at === -1 ? r.trim() : r.slice(0, at).trim();
      var def = at === -1 ? '' : r.slice(at + len).trim();
      if (term || def) out.push({ term: term, def: def });
    });
    return out;
  }

  function startImport() {
    var box = $('fcImport'), area = $('fcImportText');
    var addB = $('fcImportAdd'), replaceB = $('fcImportReplace');
    var found = [];
    function preview() {
      found = parseImport();
      var count = $('fcImportCount'), list = $('fcImportPreview');
      list.textContent = '';
      count.textContent = found.length ? found.length + (found.length === 1 ? ' card found.' : ' cards found.') + (found.length > 3 ? ' The first 3:' : '') : area.value.trim() ? 'No cards found. Check the marks between the term and the definition.' : 'Nothing pasted yet.';
      found.slice(0, 3).forEach(function (c) {
        var li = mk('li');
        li.appendChild(mk('strong', '', c.term || '(no term)'));
        li.appendChild(document.createTextNode(' · ' + (c.def || '(no definition)')));
        list.appendChild(li);
      });
      addB.disabled = replaceB.disabled = !found.length;
      addB.textContent = found.length ? 'Add ' + found.length + ' to the end' : 'Add to the end';
    }
    // The Tab key types a tab here, so a card can be fixed by hand; Shift+Tab
    // still moves on to the next part of the page.
    area.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      if (!document.execCommand || !document.execCommand('insertText', false, '\t')) {
        area.setRangeText('\t', area.selectionStart, area.selectionEnd, 'end');
        area.dispatchEvent(new Event('input'));
      }
    });
    area.addEventListener('input', function () {
      // Quizlet's copied text uses tabs; pick that when the paste has any.
      if (area.value.indexOf('\t') !== -1 && !box.dataset.touched) document.querySelector('input[name="fcSepTerm"][value="tab"]').checked = true;
      preview();
    });
    box.addEventListener('change', function (e) {
      if (e.target.name === 'fcSepTerm' || e.target.name === 'fcSepRow') box.dataset.touched = '1';
      preview();
    });
    $('fcSepTermCustom').addEventListener('input', function () {
      document.querySelector('input[name="fcSepTerm"][value="custom"]').checked = true;
      box.dataset.touched = '1';
      preview();
    });
    $('fcSepRowCustom').addEventListener('input', function () {
      document.querySelector('input[name="fcSepRow"][value="custom"]').checked = true;
      preview();
    });
    $('fcImportOpen').addEventListener('click', function () {
      box.hidden = !box.hidden;
      if (!box.hidden) area.focus();
    });
    $('fcImportCancel').addEventListener('click', function () { box.hidden = true; });
    function finish(replace) {
      var incoming = found.map(tidy);
      var before = cards.slice();
      cards = replace ? incoming : cards.filter(usable).concat(incoming);
      changed(true);
      area.value = '';
      preview();
      box.hidden = true;
      say((replace ? 'Replaced the set with ' : 'Added ') + incoming.length + (incoming.length === 1 ? ' card.' : ' cards.'), false, {
        label: 'Undo',
        run: function () { cards = before; changed(true); say('Import undone.'); }
      });
    }
    addB.addEventListener('click', function () { finish(false); });
    replaceB.addEventListener('click', function () { finish(true); });
  }
  /* ---------------- editing ---------------- */

  function grow(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  // Something changed in the set: save it, keep the study card in step.
  function changed(listToo) {
    saveSoon();
    rebuildDeck(true);
    if (done.hidden) showCard();
    if (listToo) renderList(); else updateCounts();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function iconBtn(label, text, run, extra) {
    var b = el('button', 'fc-icon-btn' + (extra ? ' ' + extra : ''), text);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', run);
    return b;
  }

  function field(kind, label, value, onInput) {
    var wrap = el('label', 'fc-field ' + kind);
    var ta = el('textarea');
    ta.rows = 1;
    ta.value = value;
    ta.spellcheck = true;
    ta.addEventListener('input', function () { grow(ta); onInput(ta.value); });
    wrap.appendChild(ta);
    wrap.appendChild(el('span', '', label));
    return wrap;
  }

  var dragCard = null;

  function editRow(c, i) {
    var li = el('li', 'fc-row editing');
    li.dataset.id = c.id;

    var top = el('div', 'fc-row-top');
    top.appendChild(el('span', 'fc-num', String(i + 1)));
    // The grip is what gets dragged. The arrow buttons do the same job from
    // the keyboard or on a touch screen.
    var handle = el('span', 'fc-icon-btn fc-handle', '⠇⠇');
    handle.title = 'Drag to move this card';
    handle.setAttribute('aria-hidden', 'true');
    top.appendChild(handle);
    var up = iconBtn('Move this card up', '↑', function () { move(c, -1); });
    var down = iconBtn('Move this card down', '↓', function () { move(c, 1); });
    up.disabled = i === 0;
    down.disabled = i === cards.length - 1;
    top.appendChild(up);
    top.appendChild(down);
    var del = iconBtn('Delete this card', 'Delete', function () { remove(c); }, 'danger fc-del');
    del.insertAdjacentHTML('afterbegin', SVG_TRASH);
    top.appendChild(del);
    li.appendChild(top);

    var fields = el('div', 'fc-fields');
    var termWrap = field('term', 'Term', c.term, function (v) { c.term = v; changed(false); lookSoon(); });
    fields.appendChild(termWrap);
    var defCol = el('div', 'fc-defcol');
    var defWrap = field('def', 'Definition', c.def, function (v) { c.def = v; changed(false); if (v.trim()) sugBox.hidden = true; });
    defCol.appendChild(defWrap);
    var defTa = defWrap.querySelector('textarea');

    // Suggested definitions for the term, like Quizlet's: the book's own
    // wording first, then a dictionary and Wikipedia (see /api/suggest).
    var sugBox = el('div', 'fc-sugs');
    sugBox.hidden = true;
    sugBox.setAttribute('aria-live', 'polite');
    defCol.appendChild(sugBox);
    // Look the term up while it is being typed, so the suggestions are
    // ready by the time the definition box is clicked.
    var lookTimer = null;
    function lookSoon() {
      clearTimeout(lookTimer);
      lookTimer = setTimeout(function () {
        if (!c.def.trim() && c.term.trim().length >= 2) suggestFor(c.term.trim(), function () {
          if (document.activeElement === defTa) ask();
        });
      }, 350);
    }
    function ask() {
      if (c.def.trim() || c.term.trim().length < 2 || mode !== 'cloud') { sugBox.hidden = true; return; }
      var ready = sugCache[c.term.trim().toLowerCase()];
      if (!ready) {
        sugBox.textContent = '';
        sugBox.appendChild(el('span', 'fc-sugs-title', 'Looking up definitions...'));
        sugBox.hidden = false;
      }
      suggestFor(c.term.trim(), function (list, term) {
        if (term !== c.term.trim() || c.def.trim()) return;
        sugBox.textContent = '';
        if (!list.length) {
          sugBox.appendChild(el('span', 'fc-sugs-none', list.failed
            ? 'Suggestions could not load just now. Type the definition, or click here again in a moment.'
            : 'No suggested definitions for "' + term + '". Type your own.'));
          sugBox.hidden = false;
          return;
        }
        sugBox.appendChild(el('span', 'fc-sugs-title', 'Suggestions'));
        list.forEach(function (sg) {
          var b = el('button', 'fc-sug');
          b.type = 'button';
          b.appendChild(el('span', 'fc-sug-text', sg.def));
          b.appendChild(el('span', 'fc-sug-src', sg.source));
          b.addEventListener('click', function () {
            c.def = sg.def;
            defTa.value = sg.def;
            grow(defTa);
            sugBox.hidden = true;
            changed(false);
            defTa.focus();
          });
          sugBox.appendChild(b);
        });
        sugBox.hidden = false;
      });
    }
    defTa.addEventListener('focus', ask);
    defTa.addEventListener('click', function () { if (sugBox.hidden) ask(); });
    // An optional hint of the teacher's own, shown by "Get a hint" in place
    // of the one the page makes up from the definition.
    var hintIn = el('input', 'fc-hint-in');
    hintIn.type = 'text';
    hintIn.maxLength = 300;
    hintIn.value = c.hint || '';
    hintIn.placeholder = 'Hint (optional)';
    hintIn.setAttribute('aria-label', 'Hint for this card (optional)');
    hintIn.addEventListener('input', function () { c.hint = hintIn.value; changed(false); });
    defCol.appendChild(hintIn);
    fields.appendChild(defCol);

    var pic = el('div');
    var drop = el('div', 'fc-drop' + (c.img ? ' has-img' : ''));
    drop.tabIndex = 0;
    drop.setAttribute('role', 'button');
    // With a picture, clicking it shows it big; Upload picture replaces it.
    if (c.img) {
      var im = el('img');
      im.src = c.img;
      im.alt = c.alt || '';
      drop.appendChild(im);
      drop.setAttribute('aria-label', 'Show the picture bigger');
      drop.title = 'Click to see it bigger';
    } else {
      drop.textContent = 'Drop a picture here, paste one, or click to upload';
    }
    var choose = function () { if (c.img) zoom(c.img, c.alt || '', c.term, c.credit); else pickFile(c); };
    drop.addEventListener('click', choose);
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    pic.appendChild(drop);

    // Or give the address of a picture on another site. It is copied, never
    // linked, so it keeps working if that site changes.
    var urlRow = el('div', 'fc-url');
    var urlIn = el('input');
    urlIn.type = 'url';
    urlIn.placeholder = 'Paste image link';
    urlIn.setAttribute('aria-label', 'Web address of a picture for this card');
    var addUrl = function () {
      var address = urlIn.value.trim();
      if (!address) { urlIn.focus(); return; }
      takeAddress(c, address);
    };
    urlIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } });
    urlRow.appendChild(urlIn);
    urlRow.appendChild(iconBtn('Add the picture from this web address', 'Add', addUrl));
    pic.appendChild(urlRow);
    var findRow = el('div', 'fc-find-row');
    if (mode === 'cloud' && ED && ED.imageSearch) {
      var findBtn = iconBtn('Show free pictures for this term to pick from', 'Find pictures', function () { findPictures(c, pic, findBtn); });
      findBtn.classList.add('fc-find-btn');
      findRow.appendChild(findBtn);
    }
    // Google Images in a new tab, safe search on. Drag a picture from there
    // onto the box above, or copy its image address into Paste image link.
    var google = el('a', 'fc-icon-btn fc-find-btn', 'Google Images');
    google.target = '_blank';
    google.rel = 'noopener';
    google.title = 'Open Google Images for this term in a new tab. Drag a picture back onto the box, or copy its image address.';
    google.addEventListener('click', function () {
      google.href = 'https://www.google.com/search?tbm=isch&safe=active&q=' + encodeURIComponent(c.term.trim() || 'science');
    });
    google.href = 'https://www.google.com/search?tbm=isch&safe=active&q=' + encodeURIComponent(c.term.trim() || 'science');
    findRow.appendChild(google);
    pic.appendChild(findRow);
    // Draw it: Cloudflare's AI draws a picture from the term and definition.
    if (mode === 'cloud' && canDraw && ED && ED.draw) {
      var drawBtn = iconBtn('Have AI draw a picture from this term and definition. Click again for a new one.', c.img && /^Drawn by AI/.test(c.credit || '') ? 'Draw another' : 'Draw it', function () { drawPicture(c, drawBtn); }, 'fc-draw-btn');
      pic.appendChild(drawBtn);
    }

    var upRow = el('div', 'fc-img-tools');
    upRow.appendChild(iconBtn(c.img ? 'Upload a new picture from this computer' : 'Upload a picture from this computer', c.img ? 'Upload new' : 'Upload picture', function () { pickFile(c); }));
    pic.appendChild(upRow);
    if (c.img) {
      // Read aloud by screen readers, and shown if the picture cannot load.
      var alt = el('input', 'fc-alt');
      alt.type = 'text';
      alt.value = c.alt;
      alt.placeholder = 'Image description (optional)';
      alt.setAttribute('aria-label', 'Image description, read by screen readers (optional)');
      alt.addEventListener('input', function () { c.alt = alt.value; changed(false); });
      pic.appendChild(alt);
      upRow.appendChild(iconBtn('Remove the picture', 'Remove', function () { c.img = ''; c.alt = ''; c.credit = ''; changed(true); }));
    }
    fields.appendChild(pic);
    li.appendChild(fields);

    // "+" on the line under the card adds a new card right after it.
    var ins = el('button', 'fc-insert');
    ins.type = 'button';
    ins.textContent = 'Add card +';
    ins.setAttribute('aria-label', 'Add a card after card ' + (i + 1));
    ins.title = 'Add a card here';
    ins.addEventListener('click', function () { insertAfter(c); });
    li.appendChild(ins);

    // The grip lifts the card; see startRowDrag. A picture can be dropped
    // anywhere on its row.
    handle.addEventListener('pointerdown', function (e) { startRowDrag(e, li, c); });
    li.addEventListener('dragover', function (e) {
      if (dragCard || !hasPicture(e)) return;
      e.preventDefault();
      drop.classList.add('over');
    });
    li.addEventListener('dragleave', function (e) {
      if (!li.contains(e.relatedTarget)) drop.classList.remove('over');
    });
    li.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('over');
      if (!dragCard) takeDrop(c, e.dataTransfer);
    });
    return li;
  }

  // Dragging a card to a new place, the way Quizlet does it: the card lifts
  // and follows the pointer (mouse, pen or finger), a gap opens where it
  // will land, and the other cards slide out of the way.
  function startRowDrag(e, li, c) {
    if (e.button > 0) return;
    e.preventDefault();
    var handle = e.currentTarget;
    var rect = li.getBoundingClientRect();
    var grabY = e.clientY - rect.top;
    var gap = el('li', 'fc-row-gap');
    gap.style.height = rect.height + 'px';
    li.parentNode.insertBefore(gap, li);
    li.classList.add('lifted');
    li.style.width = rect.width + 'px';
    li.style.left = rect.left + 'px';
    li.style.top = rect.top + 'px';
    dragCard = c;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* older browser: window events still work */ }
    var lastY = e.clientY, scrollTimer = null;

    // Move the gap, sliding the cards it passes (record, move, play back).
    function place(y) {
      var others = [].slice.call(rowsEl.children).filter(function (n) { return n !== li && n !== gap; });
      var before = null;
      for (var i = 0; i < others.length; i++) {
        var r = others[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { before = others[i]; break; }
      }
      if ((before && gap.nextSibling === before) || (!before && gap === rowsEl.lastChild) || (!before && rowsEl.lastChild === li && gap.nextSibling === li)) return;
      var start = others.map(function (n) { return n.getBoundingClientRect().top; });
      if (before) rowsEl.insertBefore(gap, before); else rowsEl.appendChild(gap);
      if (reduceMotion) return;
      others.forEach(function (n, k) {
        var dy = start[k] - n.getBoundingClientRect().top;
        if (!dy) return;
        n.style.transition = 'none';
        n.style.transform = 'translateY(' + dy + 'px)';
        void n.offsetWidth;
        n.style.transition = 'transform .18s ease';
        n.style.transform = '';
      });
    }
    function follow(y) {
      lastY = y;
      li.style.top = (y - grabY) + 'px';
      place(y);
    }
    // Near the top or bottom of the window, keep scrolling.
    function edgeScroll() {
      var h = window.innerHeight, step = lastY < 80 ? -14 : lastY > h - 80 ? 14 : 0;
      if (step) { window.scrollBy(0, step); place(lastY); }
      scrollTimer = requestAnimationFrame(edgeScroll);
    }
    scrollTimer = requestAnimationFrame(edgeScroll);
    function onMove(ev) { ev.preventDefault(); follow(ev.clientY); }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(scrollTimer);
      var target = gap.getBoundingClientRect();
      var finish = function () {
        rowsEl.insertBefore(li, gap);
        gap.remove();
        li.classList.remove('lifted', 'settling');
        li.style.width = li.style.left = li.style.top = '';
        [].forEach.call(rowsEl.children, function (n) { n.style.transition = n.style.transform = ''; });
        dragCard = null;
        var order = [].map.call(rowsEl.children, function (n) { return Number(n.dataset.id); });
        cards.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
        changed(true);
      };
      if (reduceMotion) { finish(); return; }
      li.classList.add('settling');
      li.style.top = target.top + 'px';
      li.style.left = target.left + 'px';
      setTimeout(finish, 180);
    }
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Suggested definitions, fetched once per term while the page is open.
  var sugCache = {}, sugPending = {};
  function suggestFor(term, done) {
    var k = term.toLowerCase();
    if (sugCache[k]) { done(sugCache[k], term); return; }
    if (mode !== 'cloud' || !ED || !ED.suggest) return;
    if (!sugPending[k]) {
      sugPending[k] = ED.suggest(term).then(function (r) {
        var list = (r && r.suggestions) || [];
        // Nothing found because every outside dictionary failed: try again next time.
        var checked = (r && r.checked) || {};
        var failed = Object.keys(checked).length && Object.keys(checked).every(function (s) { return /^failed/.test(checked[s]); });
        if (!list.length && failed) { delete sugPending[k]; list.failed = true; return list; }
        sugCache[k] = list;
        return list;
      }, function () { delete sugPending[k]; var none = []; none.failed = true; return none; });
    }
    sugPending[k].then(function (list) { done(list, term); });
  }

  function move(c, step) {
    var i = cards.indexOf(c);
    var j = i + step;
    if (j < 0 || j >= cards.length) return;
    cards.splice(i, 1);
    cards.splice(j, 0, c);
    changed(true);
    var btn = rowsEl.querySelector('[data-id="' + c.id + '"] [aria-label="Move this card ' + (step < 0 ? 'up' : 'down') + '"]');
    if (btn && !btn.disabled) btn.focus();
  }

  function remove(c) {
    var i = cards.indexOf(c);
    cards.splice(i, 1);
    changed(true);
    say('Deleted "' + (c.term || 'a card') + '".', false, {
      label: 'Undo',
      run: function () {
        cards.splice(Math.min(i, cards.length), 0, c);
        changed(true);
      }
    });
  }

  function insertAfter(after) {
    var c = tidy({});
    cards.splice(cards.indexOf(after) + 1, 0, c);
    changed(true);
    var ta = rowsEl.querySelector('[data-id="' + c.id + '"] textarea');
    if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); }
  }

  function addCard() {
    var c = tidy({});
    cards.push(c);
    changed(true);
    var ta = rowsEl.querySelector('[data-id="' + c.id + '"] textarea');
    if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); }
  }

  /* ---------------- pictures ---------------- */

  var hasPicture = function (e) {
    var types = Array.prototype.slice.call(e.dataTransfer.types || []);
    return types.indexOf('Files') !== -1 || types.indexOf('text/uri-list') !== -1 || types.indexOf('text/html') !== -1;
  };

  // Big photos would fill the browser's storage in a few cards, so every
  // picture is shrunk to at most 900 pixels on its longest side.
  function shrink(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      if (/^https:/.test(src)) im.crossOrigin = 'anonymous';
      im.onload = function () {
        var s = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.naturalWidth * s));
        cv.height = Math.max(1, Math.round(im.naturalHeight * s));
        var g = cv.getContext('2d');
        try {
          g.drawImage(im, 0, 0, cv.width, cv.height);
          var out = cv.toDataURL('image/webp', 0.82);
          if (out.indexOf('data:image/webp') !== 0) {
            g.fillStyle = '#fff';
            g.fillRect(0, 0, cv.width, cv.height);
            g.drawImage(im, 0, 0, cv.width, cv.height);
            out = cv.toDataURL('image/jpeg', 0.85);
          }
          resolve(out);
        } catch (err) { reject(err); }
      };
      im.onerror = reject;
      im.src = src;
    });
  }

  // GIFs and animated WebPs are kept exactly as they are: shrinking one on a
  // canvas keeps only its first frame (Gennaro asked for moving GIFs on
  // cards, 2026-09-30).
  function keepAsIs(r) { return r.animated || /svg|gif/.test(r.type); }
  var GIF_LINK = /\.gif(?:[?#]|$)|(?:^|\/\/)(?:[a-z0-9-]+\.)*(?:giphy\.com|tenor\.com)\//i;

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function setPicture(c, src, credit) {
    c.img = src;
    c.credit = credit || '';
    // The description starts empty so its box shows "Image description
    // (optional)". Students' screen readers fall back to the term.
    changed(true);
  }

  function takeFile(c, file) {
    if (!file || !/^image\//.test(file.type)) { say('That file is not a picture. Use a PNG, JPG, GIF, WebP or SVG.', true); return; }
    say('Adding the picture...');
    if (file.type === 'image/gif') {
      if (mode === 'cloud') {
        ED.uploadImage(file).then(function (r) { setPicture(c, r.url); }, function (err) { say(err.message, true); });
        return;
      }
      // Kept in this browser until he signs in, so only a small one fits.
      if (file.size > 1500000) { say('That GIF is too big to keep in this browser. Sign in first, then add it.', true); return; }
      readFile(file).then(function (data) { setPicture(c, data); }, function () { say('That GIF could not be opened.', true); });
      return;
    }
    readFile(file).then(function (data) {
      if (file.type === 'image/svg+xml') {
        if (data.length > 300000) { say('That SVG is too big to keep in the browser.', true); return; }
        setPicture(c, data);
        return;
      }
      return shrink(data).then(function (small) { setPicture(c, small); });
    }).catch(function () { say('That picture could not be opened. Try saving it as a PNG or JPG first.', true); });
  }

  // A picture dragged in from another tab arrives as an address, not a file.
  function takeDrop(c, dt) {
    if (dt.files && dt.files.length) { takeFile(c, dt.files[0]); return; }
    var url = '';
    var html = dt.getData('text/html');
    var m = html && /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    if (m) url = m[1].replace(/&amp;/g, '&');
    if (!url) url = (dt.getData('text/uri-list') || '').split(/\r?\n/).filter(function (l) { return l && l.charAt(0) !== '#'; })[0] || '';
    if (/^data:image\/gif/.test(url)) { setPicture(c, url); return; }
    if (/^data:image\//.test(url)) { shrink(url).then(function (s) { setPicture(c, s); }, function () { say('That picture could not be opened.', true); }); return; }
    if (!/^https?:\/\//.test(url)) { say('Nothing to add there. Drop a picture file, or a picture from another web page.', true); return; }
    takeAddress(c, url);
  }

  // A picture from a web address. Signed in, the site copies it, then a big
  // one is shrunk like any other picture. Otherwise the browser tries to copy
  // it itself, which many sites do not allow.
  function takeAddress(c, address) {
    if (!/^https?:\/\//i.test(address)) { say('That does not look like a web address. It should start with https://', true); return; }
    say('Copying the picture...');
    if (mode === 'cloud') {
      ED.imageFromUrl(address).then(function (r) {
        if (r.bytes > 350000 && !keepAsIs(r)) {
          return shrink(r.url).then(function (small) { setPicture(c, small); }, function () { setPicture(c, r.url); });
        }
        setPicture(c, r.url);
      }).catch(function (err) { say(err.message, true); });
      return;
    }
    // A GIF is linked for now and copied to the site at the next save.
    if (GIF_LINK.test(address)) { setPicture(c, address); return; }
    shrink(address).then(function (small) { setPicture(c, small); }, function () {
      setPicture(c, address);
      say('That website would not let this browser copy the picture, so for now the card links to it. It is copied for good once you sign in and save to the site.', true);
    });
  }

  // "Find pictures": five free to use pictures for the term (Wikimedia
  // Commons, then Openverse; see /api/images/search). Picking one copies it
  // to the site like a pasted link, and keeps its credit with the card.
  // Every picture search is the vocabulary word exactly as the card has it,
  // nothing added (Gennaro, 2026-09-29).
  function searchWords(term) { return String(term || '').trim(); }
  function findPictures(c, pic, btn) {
    var li = pic.closest('li');
    var open = li.querySelector('.fc-find');
    if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    btn.setAttribute('aria-expanded', 'true');
    var box = el('div', 'fc-find');
    var bar = el('form', 'fc-find-bar');
    var q = el('input');
    q.type = 'search';
    q.value = searchWords(c.term);
    q.placeholder = 'Search for pictures';
    q.setAttribute('aria-label', 'Search words for pictures');
    bar.appendChild(q);
    var go = el('button', 'btn fc-small', 'Search');
    go.type = 'submit';
    bar.appendChild(go);
    var shut = iconBtn('Close the picture search', 'Close', function () { box.remove(); btn.setAttribute('aria-expanded', 'false'); btn.focus(); });
    bar.appendChild(shut);
    box.appendChild(bar);
    var msg = el('p', 'fc-find-msg');
    msg.setAttribute('role', 'status');
    box.appendChild(msg);
    var grid = el('div', 'fc-find-grid');
    box.appendChild(grid);
    var more = el('button', 'linkbtn fc-find-more', 'Show 5 more');
    more.type = 'button';
    more.hidden = true;
    box.appendChild(more);
    var page = 1, busy = false;

    function search(next) {
      var words = q.value.trim();
      if (words.length < 2) { msg.textContent = 'Type a word to search for.'; q.focus(); return; }
      if (busy) return;
      busy = true;
      page = next ? page + 1 : 1;
      if (!next) grid.textContent = '';
      more.hidden = true;
      msg.textContent = 'Finding pictures...';
      ED.imageSearch(words, page).then(function (r) {
        var list = (r && r.results) || [];
        if (!next) grid.textContent = '';
        list.forEach(function (found) {
          var b = el('button', 'fc-find-pick');
          b.type = 'button';
          b.title = found.credit;
          b.setAttribute('aria-label', 'Use this picture: ' + found.title);
          var im = el('img');
          im.src = found.preview;
          im.alt = '';
          b.appendChild(im);
          b.addEventListener('click', function () { pick(found); });
          grid.appendChild(b);
        });
        var checked = (r && r.checked) || {};
        var down = Object.keys(checked).length && Object.keys(checked).every(function (k) { return /^failed/.test(checked[k]); });
        if (!grid.children.length) msg.textContent = down ? 'The picture sites did not answer just now. Try again in a moment.' : 'No pictures found for "' + words + '". Try other words.';
        else msg.textContent = list.length ? 'Pick a picture. Free to use; the credit is kept with the card.' : 'No more pictures for "' + words + '".';
        more.hidden = list.length < 5;
      }, function (err) {
        msg.textContent = err.message;
      }).then(function () { busy = false; });
    }

    function pick(found) {
      msg.textContent = 'Copying the picture...';
      [].forEach.call(grid.querySelectorAll('button'), function (b) { b.disabled = true; });
      var urls = found.urls.slice();
      (function next(lastErr) {
        var address = urls.shift();
        if (!address) {
          msg.textContent = (lastErr && lastErr.message) || 'That picture could not be copied. Pick another.';
          [].forEach.call(grid.querySelectorAll('button'), function (b) { b.disabled = false; });
          return;
        }
        ED.imageFromUrl(address).then(function (r) {
          if (r.bytes > 350000 && !keepAsIs(r)) {
            return shrink(r.url).then(function (small) { setPicture(c, small, found.credit); }, function () { setPicture(c, r.url, found.credit); });
          }
          setPicture(c, r.url, found.credit);
        }, next);
      })();
    }

    bar.addEventListener('submit', function (e) { e.preventDefault(); search(false); });
    more.addEventListener('click', function () { search(true); });
    li.insertBefore(box, li.querySelector('.fc-insert'));
    search(false);
  }

  function drawPicture(c, btn) {
    if (c.term.trim().length < 2) { say('Type the term first, so there is something to draw.', true); return; }
    btn.disabled = true;
    btn.textContent = 'Drawing...';
    say('Drawing a picture for "' + c.term.trim() + '". This takes a few seconds.');
    ED.draw(c.term.trim(), c.def.trim()).then(function (r) {
      if (r.bytes > 350000 && !keepAsIs(r)) {
        return shrink(r.url).then(function (small) { setPicture(c, small, r.credit); }, function () { setPicture(c, r.url, r.credit); });
      }
      setPicture(c, r.url, r.credit);
    }).catch(function (err) {
      say(err.message, true);
      btn.disabled = false;
      btn.textContent = 'Draw it';
    });
  }

  // A picture shown big over the page. Esc, Close or a click outside it
  // closes it.
  var zoomBox = null;
  function zoom(src, alt, term, credit) {
    if (!zoomBox) {
      zoomBox = document.createElement('dialog');
      zoomBox.className = 'fc-zoom';
      zoomBox.setAttribute('aria-label', 'Picture');
      zoomBox.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="btn fc-small fc-zoom-close">Close</button>';
      zoomBox.querySelector('.fc-zoom-close').addEventListener('click', function () { zoomBox.close(); });
      zoomBox.addEventListener('click', function (e) { if (e.target === zoomBox) zoomBox.close(); });
      document.body.appendChild(zoomBox);
    }
    var img = zoomBox.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    var cap = zoomBox.querySelector('figcaption');
    cap.textContent = '';
    if (term) cap.appendChild(mk('strong', '', term));
    if (zoomBox.showModal) zoomBox.showModal(); else zoomBox.setAttribute('open', '');
    zoomBox.querySelector('.fc-zoom-close').focus();
  }

  var fileInput = null;
  function pickFile(c) {
    if (!fileInput) {
      fileInput = el('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.hidden = true;
      document.body.appendChild(fileInput);
    }
    fileInput.value = '';
    fileInput.onchange = function () { if (fileInput.files[0]) takeFile(c, fileInput.files[0]); };
    fileInput.click();
  }

  // Which card a pasted or dropped picture belongs to: the row being edited,
  // or else the card on screen.
  function targetCard() {
    var row = document.activeElement && document.activeElement.closest && document.activeElement.closest('.fc-row');
    if (row) {
      var id = Number(row.dataset.id);
      for (var i = 0; i < cards.length; i++) if (cards[i].id === id) return cards[i];
    }
    return deck[pos] || null;
  }

  // Add any card the book has that this set does not, matched by term.
  function addBookCards() {
    var have = {};
    cards.forEach(function (c) { have[c.term.trim().toLowerCase()] = true; });
    var added = book.cards.filter(function (c) { return !have[c.term.trim().toLowerCase()]; }).map(tidy);
    cards = cards.concat(added);
    stale = false;
    changed(true);
    say(added.length ? 'Added ' + added.length + ' new card' + (added.length === 1 ? '' : 's') + ' from the book, at the end of the list.' : 'Nothing new to add. Every card in the book is already here.');
  }
  var staleActions = function () {
    return [{ label: 'Add the book\u2019s new cards', run: addBookCards }, { label: 'Keep mine as they are', run: function () { stale = false; save(); } }];
  };

  function showSignIn() {
    var box = $('fcSignIn');
    if (!ED || !box) return;
    box.hidden = false;
    ED.signInForm(box, function () { location.reload(); });
  }

  // Once the editor knows whether the site can save, it picks where edits go.
  function chooseMode(s) {
    canDraw = !!s.draw;
    draft = loadDraft();
    var saved = readStore()[book.id];
    if (s.cloud && s.editor) {
      mode = 'cloud';
      ED.rememberHint();
      cards = reference();
      stale = !!(published && published.base && published.base !== base);
      if (!book.own) $('fcConfirmText').textContent = 'Go back to the book\u2019s cards? Students will see the book\u2019s version again, and your edits will be lost.';
      if (draft) {
        say('Some edits were kept only in this browser. Save them for students?', true,
          { label: 'Save them', run: function () { cards = draft; draft = null; changed(true); } },
          { label: 'Throw them away', run: function () { clearDraft(); draft = null; say('Thrown away.'); } });
      } else if (stale) {
        var a = staleActions();
        say('The book\u2019s version of this set has changed since you last saved yours.', true, a[0], a[1]);
      } else {
        say(published || book.own ? 'Signed in. Changes save to the site, and students see them straight away.' : 'Signed in. Students see the book\u2019s cards until you make a change.');
      }
    } else {
      mode = 'local';
      if (draft) cards = draft;
      stale = !!(draft && saved.base !== base);
      if (s.cloud) showSignIn();
      if (stale) {
        var b = staleActions();
        say('The book\u2019s version of this set has changed since you made these edits.', true, b[0], b[1]);
      } else if (s.cloud) {
        say(draft ? 'Showing edits kept in this browser. Sign in to save them for students.' : 'Sign in to save for students. Until then, changes stay in this browser.');
      } else {
        say(draft ? 'Showing your changes. Saving to the site is not switched on yet, so they are kept in this browser only.' : 'Saving to the site is not switched on yet, so changes are kept in this browser only.');
      }
    }
    if (book.own) ownTools();
    if (mode === 'cloud') heroIconEditing();
    editReady = true;
    if (mode === 'cloud') addTeacherShareItems();
    rebuildDeck(false);
    showCard();
    renderList();
  }

  // A set the teacher made himself: its name can change, it can be deleted,
  // and a new one starts with a blank card to type into.
  function ownTools() {
    if (mode !== 'cloud') {
      $('fcOwnDelete').hidden = true;
      say('Sign in to edit this set.', true);
      return;
    }
    var row = $('fcOwnTitleRow'), input = $('fcOwnTitle');
    row.hidden = false;
    input.value = book.title;
    input.addEventListener('input', function () {
      var v = input.value.replace(/\s+/g, ' ').trim();
      if (!v) return;
      book.title = v;
      $('fcTitle').textContent = v;
      document.title = v + ' Flashcards' + document.title.slice(document.title.indexOf(' | '));
      saveSoon();
    });
    if (!cards.length) {
      cards.push(tidy({}));
      say('Your new set is ready. Type the first term and its definition below, or use Import cards to paste a list.');
    }
  }

  // In the editor the big picture at the top right is a button: pick a new
  // icon for the set, the same choices as the Flashcards page's Change icon.
  // It is saved in the library, so the set's card there changes too.
  function heroIconEditing() {
    var hero = document.querySelector('.hero-icon');
    if (!hero || !ED || !ED.library) return;
    hero.classList.add('fc-hero-edit');
    hero.setAttribute('role', 'button');
    hero.setAttribute('tabindex', '0');
    hero.title = 'Change the icon';
    hero.setAttribute('aria-label', 'Change this set\u2019s icon');
    var badge = mk('span', 'fc-hero-badge');
    badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M14 7l3 3"/></svg>';
    // Save the icon: one of the book's drawings (its name), or the site's
    // address of the teacher's own picture.
    var saveIcon = function (value) {
      say('Saving the icon...');
      ED.library().then(function (lib) {
        var mine = lib.sets.filter(function (x) { return x.id === book.id; })[0];
        if (!mine) throw new Error('This set is not on the Flashcards page, so its icon cannot be changed.');
        mine.icon = value;
        return ED.saveLibrary(lib);
      }).then(function () {
        if (ED.isPicture(value)) {
          hero.removeAttribute('data-icon');
          hero.innerHTML = '<img src="' + value + '" alt="">';
        } else {
          hero.setAttribute('data-icon', value || 'set');
          hero.innerHTML = window.ICONS[value || 'set'] || '';
        }
        hero.appendChild(badge);
        say('Icon saved. It shows here and on the set’s card on the Flashcards page.');
      }, function (err) { say(err.message, true); });
    };
    var open = function () {
      var d = dialogBox('Pick an icon for this set');
      var grid = mk('div', 'fx-pick-grid');
      var now = hero.getAttribute('data-icon') || '';
      var keys = ['set'].concat(Object.keys(window.ICONS || {}).filter(function (k) { return k !== 'set' && k !== 'fallback'; }));
      keys.forEach(function (k) {
        var b = mk('button', 'fx-pick');
        b.type = 'button';
        b.title = k === 'set' ? 'Flashcards (default)' : k.replace(/-/g, ' ');
        b.setAttribute('aria-label', b.title);
        b.setAttribute('aria-pressed', String(now === k));
        b.innerHTML = window.ICONS[k] || '';
        b.addEventListener('click', function () { d.close(); saveIcon(k === 'set' ? '' : k); });
        grid.appendChild(b);
      });
      d.appendChild(grid);
      d.appendChild(ED.iconPanel($('fcTitle').textContent.trim(), function (url) { d.close(); saveIcon(url); }));
      d.showModal();
      (grid.querySelector('[aria-pressed="true"]') || grid.firstChild).focus();
    };
    // icons.js fills the picture when the page loads; the badge goes on after it.
    setTimeout(function () { hero.appendChild(badge); }, 0);
    hero.addEventListener('click', open);
    hero.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  }

  // Only a signed in teacher gets the editor. Anyone else gets a password
  // box, and signing in reloads the page into the editor.
  function gateEditing() {
    var bar = $('fcEditBar');
    var noEditor = function (text) {
      bar.hidden = false;
      bar.classList.add('fc-editbar-gate');
      bar.querySelector('.fc-editbar-actions').hidden = true;
      bar.querySelector('.fc-editbar-text').innerHTML = '<strong>Teacher sign in.</strong> ';
      bar.querySelector('.fc-editbar-text').appendChild(document.createTextNode(text));
    };
    if (!ED) return;
    ED.session().then(function (s) {
      if (s.cloud && s.editor) {
        editing = true;
        startEditing();
        return;
      }
      if (!s.cloud) { noEditor('Editing is not switched on for this site.'); return; }
      noEditor('Enter the teacher password to edit this set.');
      var box = $('fcSignIn');
      box.hidden = false;
      ED.signInForm(box, function () { location.reload(); });
    });
  }

  function startEditing() {
    $('fcEditBar').hidden = false;
    addBtn.hidden = false;
    addBtn.addEventListener('click', addCard);
    (ED ? ED.session() : Promise.resolve({ cloud: false, editor: false })).then(chooseMode);

    $('fcWord').addEventListener('click', function () { exportAs('docx', this); });
    $('fcPdfEdit').addEventListener('click', function () { exportAs('pdf', this); });
    // Sign out: save anything waiting, then back to the plain study page.
    $('fcSignOut').addEventListener('click', function () {
      var out = function () {
        ED.forgetHint();
        ED.logout().then(function () { location.href = location.pathname; }, function () { location.href = location.pathname; });
      };
      if (saveTimer) { save(); setTimeout(out, 1500); } else out();
    });
    startImport();

    var confirmBox = $('fcConfirm');
    if (book.own) {
      $('fcOwnDelete').addEventListener('click', function () { confirmBox.hidden = false; $('fcConfirmNo').focus(); });
      $('fcConfirmNo').addEventListener('click', function () { confirmBox.hidden = true; });
      $('fcConfirmYes').addEventListener('click', function () {
        confirmBox.hidden = true;
        clearTimeout(saveTimer);
        saveTimer = null;
        say('Deleting...');
        ED.resetSet(book.id).then(function () {
          clearDraft();
          location.href = '../../../flashcards/';
        }, function (err) { say(err.message, true); });
      });
    }
    if (!book.own) $('fcReset').addEventListener('click', function () { confirmBox.hidden = false; $('fcConfirmNo').focus(); });
    if (!book.own) $('fcConfirmNo').addEventListener('click', function () { confirmBox.hidden = true; });
    if (!book.own) $('fcConfirmYes').addEventListener('click', function () {
      confirmBox.hidden = true;
      clearTimeout(saveTimer);
      saveTimer = null;
      var back = function () {
        clearDraft();
        stale = false;
        published = null;
        cards = book.cards.map(tidy);
        restart(false);
        renderList();
      };
      if (mode !== 'cloud') { back(); say('Back to the book\u2019s cards.'); return; }
      say('Going back to the book\u2019s cards...');
      ED.resetSet(book.id).then(function () {
        back();
        say('Back to the book\u2019s cards. Students see the book\u2019s version again.');
      }, function (err) { say(err.message, true); });
    });

    // Drop a picture on the big card to put it on the card showing.
    stage.addEventListener('dragover', function (e) {
      if (dragCard || !hasPicture(e) || !deck.length) return;
      e.preventDefault();
      card.classList.add('drop-ready');
    });
    stage.addEventListener('dragleave', function () { card.classList.remove('drop-ready'); });
    stage.addEventListener('drop', function (e) {
      card.classList.remove('drop-ready');
      if (dragCard || !deck.length) return;
      e.preventDefault();
      e.stopPropagation();
      takeDrop(deck[pos], e.dataTransfer);
    });

    // A picture dropped somewhere else must not open in place of the page.
    document.addEventListener('dragover', function (e) { if (!dragCard && hasPicture(e)) e.preventDefault(); });
    document.addEventListener('drop', function (e) { if (!dragCard && hasPicture(e)) e.preventDefault(); });

    document.addEventListener('paste', function (e) {
      var cd = e.clipboardData;
      var items = (cd && cd.items) || [];
      // "Copy image" on a GIF gives the browser only its first frame as a
      // file, but also the GIF's address, which is used instead. A GIF link
      // pasted outside a text box is added the same way.
      var ae = document.activeElement;
      var typing = !!ae && (/^(?:INPUT|TEXTAREA)$/.test(ae.tagName) || ae.isContentEditable);
      var hasFile = [].some.call(items, function (it) { return it.kind === 'file' && /^image\//.test(it.type); });
      if (cd && (hasFile || !typing)) {
        var m = /<img[^>]+src=["']([^"']+)["']/i.exec(cd.getData('text/html') || '');
        var link = m ? m[1].replace(/&amp;/g, '&') : '';
        if (!link && !typing) link = (cd.getData('text/plain') || '').trim();
        if (/^https?:\/\//i.test(link) && GIF_LINK.test(link)) {
          var gc = targetCard();
          if (gc) { e.preventDefault(); takeAddress(gc, link); return; }
        }
      }
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          var c = targetCard();
          if (!c) return;
          e.preventDefault();
          takeFile(c, items[i].getAsFile());
          return;
        }
      }
    });

    // Leaving with a change not yet saved: keep it in this browser, and in
    // cloud mode start the save too. If it does not finish, the next visit
    // offers the kept copy.
    window.addEventListener('beforeunload', function () {
      if (!saveTimer) return;
      if (mode === 'cloud') saveLocal(true);
      save();
    });
  }


  /* ---------------- start ---------------- */

  applyOptionsToControls();
  refreshStars();
  if (wantsEdit) gateEditing();
  setSort(opts.sort);
  renderList();
  // Open the study mode named in the address (#learn, #test, #match) once
  // flashcard-modes.js, which loads after this file, is ready.
  document.addEventListener('DOMContentLoaded', function () {
    var m = location.hash.slice(1);
    if (MODES.indexOf(m) > 0) goMode(m);
  });
})();
