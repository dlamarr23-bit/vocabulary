/* ============================================================
   Teacher editor: talks to the site's own /api/ (textbook/server/worker.js).

   This is the only file in the book allowed to make a network request, and
   only to this site's /api/. Students never trigger one: a page calls in
   here only when it is opened with ?edit, when the teacher signs in, or when
   the "is8teacher" hint cookie says he already has (the Flashcards page and
   set pages then show his tools).

   window.IS8Editor
     session()          -> { cloud, editor }  cloud: saving to the site is set up
     signInForm(box, onSignedIn)
     getSet(id), saveSet(id, set), resetSet(id), listSets()
     createSet(title, folder), library(), saveLibrary(lib), newFolder(name, parent), removeSet(id)
     uploadImage(blob), imageFromUrl(address), imageSearch(q, page), suggest(term), draw(term, def)
     drawScene(term, def), drawTry(model, prompt, seed)   the drawing models test page
   ============================================================ */
(function () {
  'use strict';

  function call(path, opts) {
    opts = opts || {};
    var headers = { 'X-IS8-Editor': '1' };
    if (opts.type) headers['content-type'] = opts.type;
    return fetch('/api/' + path, { method: opts.method || 'GET', headers: headers, body: opts.body, credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (body) {
          if (!res.ok || !body) {
            var err = new Error((body && body.error) || 'The site did not answer. Check the internet connection and try again.');
            err.status = res.status;
            throw err;
          }
          return body;
        });
      });
  }
  var sendJSON = function (path, method, value) { return call(path, { method: method, type: 'application/json', body: JSON.stringify(value) }); };

  var session = null;
  var E = {
    session: function () {
      if (!session) {
        // Opened from a file on disk there is no site to talk to.
        session = /^https?:$/.test(location.protocol)
          ? call('session').then(function (s) { return { cloud: !!s.cloud, editor: !!s.editor, live: !!s.live, draw: !!s.draw }; }, function () { return { cloud: false, editor: false, live: false, draw: false }; })
          : Promise.resolve({ cloud: false, editor: false });
      }
      return session;
    },
    login: function (password) { return sendJSON('login', 'POST', { password: password }); },
    logout: function () { return call('logout', { method: 'POST' }); },
    listSets: function () { return call('sets'); },
    getSet: function (id) { return call('sets/' + encodeURIComponent(id)); },
    saveSet: function (id, set) { return sendJSON('sets/' + encodeURIComponent(id), 'PUT', set); },
    resetSet: function (id) { return call('sets/' + encodeURIComponent(id), { method: 'DELETE' }); },
    createSet: function (title, folder) { return sendJSON('sets', 'POST', { title: title, folder: folder || null }); },
    removeSet: function (id) { return call('sets/' + encodeURIComponent(id) + '?remove=1', { method: 'DELETE' }); },
    library: function () { return call('library'); },
    saveLibrary: function (lib) {
      return sendJSON('library', 'PUT', {
        folders: lib.folders.map(function (f) { return { id: f.id, name: f.name, parent: f.parent || null, accent: f.accent || '', icon: f.icon || '' }; }),
        sets: lib.sets.map(function (s) { return { id: s.id, title: s.title, folder: s.folder || null, icon: s.icon || '' }; })
      });
    },
    newFolder: function (name, parent) { return sendJSON('library/folders', 'POST', { name: name, parent: parent || null }); },
    uploadImage: function (blob) { return call('images', { method: 'POST', type: blob.type || 'application/octet-stream', body: blob }); },
    imageFromUrl: function (address) { return sendJSON('images/from-url', 'POST', { url: address }); },
    suggest: function (term) { return call('suggest?term=' + encodeURIComponent(term)); },
    draw: function (term, def) { return sendJSON('images/draw', 'POST', { term: term, def: def }); },
    drawScene: function (term, def) { return sendJSON('images/scene', 'POST', { term: term, def: def }); },
    drawTry: function (model, prompt, seed) { return sendJSON('images/try', 'POST', { model: model, prompt: prompt, seed: seed }); },
    imageSearch: function (q, page) { return call('images/search?q=' + encodeURIComponent(q) + '&page=' + (page || 1)); },
    liveCreate: function (setId, opts, kind) { return sendJSON('live/create', 'POST', { setId: setId, opts: opts, kind: kind || 'volley' }); },

    // A password box and a button. Signing in reloads nothing; onSignedIn runs.
    signInForm: function (box, onSignedIn) {
      box.textContent = '';
      var form = document.createElement('form');
      form.className = 'ed-signin';
      var label = document.createElement('label');
      label.className = 'ed-signin-label';
      label.textContent = 'Teacher password ';
      var input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'current-password';
      input.required = true;
      label.appendChild(input);
      var btn = document.createElement('button');
      btn.type = 'submit';
      btn.className = 'btn fc-small';
      btn.textContent = 'Sign in';
      var msg = document.createElement('span');
      msg.className = 'ed-msg';
      msg.setAttribute('role', 'status');
      form.appendChild(label);
      form.appendChild(btn);
      form.appendChild(msg);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        btn.disabled = true;
        msg.textContent = 'Checking...';
        E.login(input.value).then(function () {
          session = null;
          E.rememberHint();
          msg.textContent = '';
          onSignedIn();
        }, function (err) {
          msg.textContent = err.message;
          btn.disabled = false;
          input.select();
        });
      });
      box.appendChild(form);
      return input;
    }
  };
  window.IS8Editor = E;

  // A set's own picture for its icon (Gennaro, 2026-09-29): upload a file,
  // paste or drop a picture or its web address, or find one on Google Images
  // and paste its address back. Every picture is copied to this site first
  // (/api/images), so nothing is loaded from another site. done(url) gets
  // the site's address for it.
  E.iconPanel = function (searchFor, done) {
    var mk = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    var box = mk('div', 'fx-own-icon');
    box.appendChild(mk('p', 'fx-own-icon-title', 'Or use your own picture'));
    var row = mk('div', 'fx-own-icon-row');
    var file = mk('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    var up = mk('button', 'btn fc-small', 'Upload a picture');
    up.type = 'button';
    up.addEventListener('click', function () { file.click(); });
    var google = mk('a', 'btn secondary fc-small', 'Search Google Images');
    google.href = 'https://www.google.com/search?tbm=isch&safe=active&q=' + encodeURIComponent(searchFor || 'science');
    google.target = '_blank';
    google.rel = 'noopener noreferrer';
    row.appendChild(up);
    row.appendChild(google);
    row.appendChild(file);
    box.appendChild(row);
    var paste = mk('input', 'fx-dialog-input');
    paste.type = 'text';
    paste.placeholder = 'Paste a picture or its web address here, or drop one on this box';
    paste.setAttribute('aria-label', 'Paste a picture or its web address');
    box.appendChild(paste);
    var msg = mk('p', 'fx-own-icon-msg');
    msg.setAttribute('role', 'status');
    box.appendChild(msg);
    var busy = false;
    function take(promise) {
      if (busy) return;
      busy = true;
      msg.textContent = 'Adding the picture...';
      promise.then(function (r) { msg.textContent = ''; done(r.url); }, function (err) { msg.textContent = err.message; })
        .then(function () { busy = false; });
    }
    function fromFile(f) {
      if (!f || !/^image\//.test(f.type)) { msg.textContent = 'That is not a picture.'; return; }
      take(E.uploadImage(f));
    }
    function fromText(t) {
      t = String(t || '').trim();
      if (!/^https?:\/\//i.test(t)) { msg.textContent = 'Paste a web address that starts with http, or a picture.'; return; }
      take(E.imageFromUrl(t));
    }
    file.addEventListener('change', function () { fromFile(file.files[0]); file.value = ''; });
    paste.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); fromFile(items[i].getAsFile()); return; }
      }
      var text = e.clipboardData && e.clipboardData.getData('text');
      if (text) { e.preventDefault(); paste.value = text; fromText(text); }
    });
    paste.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fromText(paste.value); } });
    box.addEventListener('dragover', function (e) { e.preventDefault(); box.classList.add('drop'); });
    box.addEventListener('dragleave', function () { box.classList.remove('drop'); });
    box.addEventListener('drop', function (e) {
      e.preventDefault();
      box.classList.remove('drop');
      var dt = e.dataTransfer;
      if (dt.files && dt.files[0]) { fromFile(dt.files[0]); return; }
      var html = dt.getData('text/html'), m = html && /<img[^>]+src="([^"]+)"/i.exec(html);
      fromText((m && m[1]) || dt.getData('text/uri-list') || dt.getData('text/plain'));
    });
    return box;
  };
  // A set icon that is the teacher's own picture, not one of the book's drawings.
  E.isPicture = function (icon) { return /^\/api\/images\/[0-9a-f]{64}$/.test(icon || ''); };

  // A note in this browser that the teacher signed in here, kept with his
  // unsaved drafts (the flashcard key), so the Flashcards page and set pages
  // know to check the sign in and show his tools. Students never have it,
  // so their visits ask the site nothing. The real check is the signed cookie.
  function drafts() { try { return JSON.parse(localStorage.getItem('is8-flashcards-v1')) || {}; } catch (e) { return {}; } }
  function keepDrafts(all) {
    try {
      if (Object.keys(all).length) localStorage.setItem('is8-flashcards-v1', JSON.stringify(all));
      else localStorage.removeItem('is8-flashcards-v1');
    } catch (e) { /* private window: the tools show after signing in again */ }
  }
  E.signedInHint = function () { return drafts()._teacher === 1; };
  E.rememberHint = function () { var all = drafts(); all._teacher = 1; keepDrafts(all); };
  E.forgetHint = function () { var all = drafts(); delete all._teacher; keepDrafts(all); };
})();
