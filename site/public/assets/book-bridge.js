/* ============================================================
   The Class Pass bridge (bridge/), Donny 2026-10-20.

   The physical science site keeps this page in a hidden frame on every one
   of its pages. Its top bar has the Class Pass button now (the bar of this
   site is hidden inside that site, book.css .in-book), and this page is how
   that button knows who is signed in here:

   - it tells the page around it who is signed in with Class Pass (pass.js)
     and whether the teacher password is in (/api/session), now and whenever
     that changes, also when it changes in the Review frame;
   - the page around it opens the Class Pass sign-in window itself, with a
     number it made, and this page picks the sign-in up (IS8Pass.claimFor);
   - the teacher signs in and out with the teacher password from that top
     bar, and saves the words changed on a page of that site
     (/api/book-text/<page>);
   - the teacher's Assignment Launchpad on that site (/launchpad) gets and
     saves its list of assignments (/api/launchpad, teacher only).

   Messages go only to and from https://physical-science-8.pages.dev, as
   { vocabBridge: { type, ... } }. A question with an id gets one answer:
   { type: 'reply', id, ok, data | error, status }.
   ============================================================ */
(function () {
  'use strict';

  var BOOK_SITE = 'https://physical-science-8.pages.dev';
  if (window.parent === window || !window.IS8Pass) return;

  var teacher = false, checked = false;

  function tell(msg) {
    try { window.parent.postMessage({ vocabBridge: msg }, BOOK_SITE); } catch (e) { /* the page around it went away */ }
  }
  function state() {
    tell({ type: 'state', me: window.IS8Pass.me(), teacher: teacher, checked: checked });
  }

  // Is the teacher password in on this device? (The cookie is the site's own; this page can send it.)
  function session() {
    return fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { teacher = Boolean(d && d.editor); checked = true; state(); return { teacher: teacher }; },
        function () { checked = true; state(); return { teacher: teacher }; });
  }

  function call(method, path, body) {
    return fetch('/api/' + path, {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-IS8-Editor': '1', 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var err = new Error(d.error || 'The site did not answer. Try again in a minute.');
          err.status = r.status;
          throw err;
        }
        return d;
      });
    });
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== BOOK_SITE || e.source !== window.parent) return;
    var m = e.data && e.data.vocabBridge;
    if (!m || typeof m.type !== 'string') return;
    function reply(p) {
      Promise.resolve(p).then(function (d) { tell({ type: 'reply', id: m.id, ok: true, data: d || {} }); },
        function (err) { tell({ type: 'reply', id: m.id, ok: false, error: (err && err.message) || 'That did not work. Try again.', status: (err && err.status) || 0 }); });
    }
    // the teacher password ran out or was changed: the page around it hears so
    function signedOut(err) {
      if (err.status === 401) { teacher = false; state(); }
      throw err;
    }
    switch (m.type) {
      case 'claim': reply(window.IS8Pass.claimFor(String(m.nonce || ''))); break;
      case 'stop': window.IS8Pass.stopWaiting(); break;
      case 'signOut': window.IS8Pass.signOut(); break;
      case 'login': reply(call('POST', 'login', { password: String(m.password || '') }).then(session)); break;
      case 'logout': reply(call('POST', 'logout', {}).then(session)); break;
      case 'saveText':
        if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(String(m.page || ''))) { reply(Promise.reject(new Error('This page cannot be changed.'))); break; }
        reply(call('PUT', 'book-text/' + m.page, { edits: m.edits || {} }).catch(signedOut));
        break;
      // the teacher's Assignment Launchpad (/launchpad on that site): the list, and saving it
      case 'launchpad': reply(call('GET', 'launchpad').catch(signedOut)); break;
      case 'saveLaunchpad': reply(call('PUT', 'launchpad', { items: m.items || [], base: m.base || 0 }).catch(signedOut)); break;
      case 'refresh': session(); break;
    }
  });

  window.IS8Pass.onChange(state);
  session();
})();
