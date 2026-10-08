/* ============================================================
   Class Pass on the vocabulary site (Donny, 2026-10-08).

   A student signs in with their school Google account, the same way Class
   Pass works on the physical science site, so their games and practice can
   go on the class leaderboard. Signing in is never needed to study or play.

   Signing in happens in a small window of its own (signin/), because Google's
   sign-in page cannot open inside the physical science site's frame. That
   window hands the sign-in to the site's server under a random number only
   this page knows, and this page picks it up from there (a page in a frame
   and a window of its own cannot always see each other's storage).

   This device keeps the sign-in key (is8-pass-v1 in localStorage) and sends
   it in the X-Pass header. Nothing else about the student is kept here.

   window.IS8Pass:
     me()          { name, first, period } or null
     token()       the sign-in key, or ''
     signIn()      opens the sign-in window; resolves when signed in
     signOut()
     report(r)     a practice result: { kind: 'match'|'test'|'learn', setId, ... }
     onChange(fn)  fn(me) now and whenever someone signs in or out
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'is8-pass-v1';
  var CHECK_MS = 15 * 60 * 1000;
  var mem = null;
  var listeners = [];

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return mem; }
  }
  function write(v) {
    mem = v;
    try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* a private window: kept for this page only */ }
  }
  var state = read();
  function token() { return state && /^[0-9a-f]{64}$/.test(state.token || '') ? state.token : ''; }
  function me() { return token() && state.me ? state.me : null; }
  function changed() { listeners.forEach(function (fn) { try { fn(me()); } catch (e) { /* one listener's problem */ } }); }
  function set(v) { state = v; write(v); changed(); }

  function call(method, path, body) {
    var headers = { 'X-Pass-Client': '1' };
    if (token()) headers['X-Pass'] = token();
    if (body) headers['content-type'] = 'application/json';
    return fetch('/api/pass/' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var err = new Error(d.error || 'Class Pass did not answer. Try again in a minute.'); err.status = r.status; throw err; }
          return d;
        });
      });
  }

  // Still signed in? Asked at most every 15 minutes.
  function recheck() {
    if (!token() || Date.now() - (state.checked || 0) < CHECK_MS) return;
    call('GET', 'me').then(function (d) {
      if (d && d.me) set({ token: state.token, me: d.me, checked: Date.now() });
      else set(null);
    }, function () { /* offline: try again next time */ });
  }

  function nonce() {
    return [].map.call(crypto.getRandomValues(new Uint8Array(16)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  var waiting = null;
  function signIn() {
    if (waiting) { if (waiting.win && !waiting.win.closed) try { waiting.win.focus(); } catch (e) { /* fine */ } return waiting.promise; }
    var n = nonce();
    var url = '/signin/?n=' + n;
    var win = null;
    try { win = window.open(url, 'classpass', 'popup,width=520,height=700'); } catch (e) { win = null; }
    if (!win) {
      // No pop-ups: on its own (not in a frame) the page itself goes to sign in and comes back.
      if (window.top === window.self) {
        location.href = url + '&back=' + encodeURIComponent(location.pathname + location.search + location.hash);
        return new Promise(function () {});
      }
      return Promise.reject(new Error('Your browser blocked the sign-in window. Allow pop-ups for this page, then press Sign in again.'));
    }
    var w = { win: win };
    waiting = w;
    w.promise = new Promise(function (resolve, reject) {
      var started = Date.now(), timer = 0, closedAt = 0, busy = false;
      function done(err, d) {
        clearInterval(timer);
        window.removeEventListener('message', onMsg);
        waiting = null;
        if (err) reject(err); else resolve(d);
      }
      function claim() {
        if (busy) return;
        busy = true;
        call('POST', 'claim', { nonce: n }).then(function (d) {
          busy = false;
          if (d && d.token && d.me) { set({ token: d.token, me: d.me, checked: Date.now() }); done(null, d.me); }
        }, function () { busy = false; });
      }
      function onMsg(e) {
        if (e.origin === location.origin && e.data && e.data.is8pass === n) claim();
      }
      window.addEventListener('message', onMsg);
      timer = setInterval(function () {
        claim();
        // Closed without finishing: one more look a few seconds later, then stop.
        if (win.closed && !closedAt) closedAt = Date.now();
        if ((closedAt && Date.now() - closedAt > 6000) || Date.now() - started > 10 * 60 * 1000) {
          done(new Error('Sign-in did not finish. Press Sign in to try again.'));
        }
      }, 1500);
    });
    return w.promise;
  }

  function signOut() {
    var t = token();
    if (t) call('POST', 'signout', {}).catch(function () {});
    set(null);
  }

  function report(r) {
    if (!token() || !r) return Promise.resolve({ counted: false });
    return call('POST', 'report', r).catch(function (err) {
      if (err.status === 401) set(null);
      return { counted: false };
    });
  }

  function onChange(fn) { listeners.push(fn); fn(me()); }

  window.IS8Pass = { me: me, token: token, signIn: signIn, signOut: signOut, report: report, onChange: onChange };

  // Signed in or out in another tab of this site.
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    state = read();
    changed();
  });

  /* ---------------- the Class Pass button in the top bar ---------------- */

  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function bar() {
    var inner = document.querySelector('.topbar-inner');
    if (!inner || document.querySelector('.pass-pill')) return;
    var box = mk('div', 'pass-pill');
    var btn = mk('button', 'pass-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    var menu = mk('div', 'pass-menu');
    menu.hidden = true;
    var who = mk('p', 'pass-who');
    var board = mk('a', 'pass-item', 'Leaderboard');
    board.href = '/leaderboard/';
    var out = mk('button', 'pass-item', 'Sign out');
    out.type = 'button';
    var msg = mk('p', 'pass-msg');
    msg.setAttribute('role', 'status');
    menu.appendChild(who);
    menu.appendChild(board);
    menu.appendChild(out);
    box.appendChild(btn);
    box.appendChild(menu);
    box.appendChild(msg);
    var menuBtn = inner.querySelector('.menu-btn');
    inner.insertBefore(box, menuBtn || null);

    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function () {
      msg.textContent = '';
      if (!me()) {
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        signIn().then(function () { btn.disabled = false; }, function (err) {
          btn.disabled = false;
          draw(null);
          msg.textContent = err.message;
          setTimeout(function () { msg.textContent = ''; }, 9000);
        });
        return;
      }
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    out.addEventListener('click', function () { close(); signOut(); });
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    function draw(m) {
      close();
      btn.disabled = false;
      btn.classList.toggle('in', !!m);
      btn.textContent = '';
      btn.appendChild(mk('span', 'pass-badge', 'Class Pass'));
      btn.appendChild(mk('span', 'pass-name', m ? m.name : 'Sign in'));
      btn.setAttribute('aria-label', m ? 'Class Pass: signed in as ' + m.name + '. Open the menu.' : 'Sign in with Class Pass');
      who.textContent = m ? 'Signed in as ' + m.name + (m.period ? ', period ' + m.period : '') + '. Your games and practice count on the leaderboard.' : '';
    }
    onChange(draw);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar);
  else bar();
  recheck();
})();
