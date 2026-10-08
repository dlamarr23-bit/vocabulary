/* ============================================================
   The Class Pass sign-in window (signin/). Opened by pass.js.

   1. Opened with ?n=<random number>: it goes to Google's own sign-in page,
      where the student picks their school account. The number goes along as
      the "nonce", which Google writes into its answer.
   2. Google sends the student back here with an ID token after the #. The
      site's server has Google check the token, checks the student is on the
      class list, and keeps the sign-in under the number for the page that
      opened this window to pick up.
   Google only sends answers back to addresses added to the Class Pass client
   in Google Cloud: https://<this site>/signin/ (README, step 8).
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'is8-pass-v1';
  var STATE = 'is8-pass-signin';

  function say(text, bad) {
    $('psText').textContent = text;
    $('psText').className = bad ? 'ps-text bad' : 'ps-text';
  }
  function again(label) {
    var b = $('psAgain');
    b.hidden = false;
    b.textContent = label || 'Try again';
  }
  function remember(v) { try { sessionStorage.setItem(STATE, JSON.stringify(v)); } catch (e) { /* fine */ } }
  function recall() { try { return JSON.parse(sessionStorage.getItem(STATE)) || {}; } catch (e) { return {}; } }
  function okBack(b) { return typeof b === 'string' && /^\/[^/\\]/.test(b) ? b : ''; }

  function toGoogle(n, back) {
    remember({ n: n, back: back });
    say('Opening Google sign-in...');
    fetch('/api/pass/config', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (c) {
      if (!c.ready) { say('Class Pass is not switched on for this site yet. Please tell your teacher.', true); return; }
      var p = new URLSearchParams({
        client_id: c.client,
        redirect_uri: location.origin + '/signin/',
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce: n,
        prompt: 'select_account',
        hd: '*'
      });
      location.replace('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
    }, function () {
      say('Could not reach the site. Check the internet connection.', true);
      again();
    });
  }

  function claims(t) {
    try {
      var p = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) { return null; }
  }

  function finish(idToken, saved) {
    say('Checking your sign-in...');
    fetch('/api/pass/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Pass-Client': '1' },
      body: JSON.stringify({ idToken: idToken })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.token) throw new Error(d.error || 'Signing in did not work. Try again.');
        return d;
      });
    }).then(function (d) {
      try { localStorage.setItem(KEY, JSON.stringify({ token: d.token, me: d.me, checked: Date.now() })); } catch (e) { /* the page that opened this window picks it up anyway */ }
      try { sessionStorage.removeItem(STATE); } catch (e) { /* fine */ }
      if (saved.back) { location.replace(saved.back); return; }
      $('psTitle').textContent = 'You are signed in';
      say('Hi, ' + d.me.name + '! Your games and practice now count on the class leaderboard. This window closes by itself; if it does not, close it and go back to your page.');
      try { if (window.opener) window.opener.postMessage({ is8pass: saved.n }, location.origin); } catch (e) { /* the page checks by itself */ }
      setTimeout(function () { try { window.close(); } catch (e) { /* stays open */ } }, 1500);
    }, function (err) {
      $('psTitle').textContent = 'Not signed in';
      say(err.message, true);
      again('Try a different account');
    });
  }

  var q = new URLSearchParams(location.search);
  var hash = location.hash.length > 1 ? new URLSearchParams(location.hash.slice(1)) : null;
  $('psAgain').addEventListener('click', function () {
    var s = recall();
    $('psAgain').hidden = true;
    toGoogle(/^[0-9a-f]{32}$/.test(s.n || '') ? s.n : q.get('n'), okBack(s.back));
  });

  if (hash && (hash.get('id_token') || hash.get('error'))) {
    var saved = recall();
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* fine */ }
    if (hash.get('error')) {
      say(hash.get('error') === 'access_denied' ? 'Sign-in was canceled.' : 'Google sign-in did not work (' + hash.get('error') + ').', true);
      again();
      return;
    }
    var c = claims(hash.get('id_token'));
    if (!c || !saved.n || c.nonce !== saved.n) {
      say('That sign-in did not start here. Press Try again.', true);
      again();
      return;
    }
    finish(hash.get('id_token'), saved);
    return;
  }
  var n = q.get('n') || '';
  if (!/^[0-9a-f]{32}$/.test(n)) {
    n = [].map.call(crypto.getRandomValues(new Uint8Array(16)), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  toGoogle(n, okBack(q.get('back')));
})();
