// vocabulary-room901.pages.dev MOVED into physical-science-8.pages.dev (Donny, 2026-11-19: "I want all pages to be in
// my site"). Everything is in the dlamarr23-bit/physical-science-8 repository now: the pages in its app/ folder, the
// server in app-source/server/worker.js, the game server in game-server/. This Cloudflare Pages project only sends
// visitors there:
//   - a page goes to the same page on the class site (302, so it can be changed later), for old links, bookmarks and
//     QR codes. The browser keeps the part after # (a game's code: /join/#ABC123 goes to /join#ABC123);
//   - /api/... is passed straight through to the class site's server and its answer comes back as it is, because
//     Google Sheets (the Self-Check review games' leaderboard points, the Class List) still send here, and a sheet
//     does not follow a redirect with its data.
const SITE = 'https://physical-science-8.pages.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // Method, headers, body and a game connection (WebSocket) all go along; a redirect comes back as it is.
      const res = await fetch(new Request(SITE + url.pathname + url.search, new Request(request, { redirect: 'manual' })));
      if (res.webSocket || res.status === 101) return res;
      // The answer's words come back unpacked (fetch unpacks them), so they must not still say they are packed.
      const out = new Response(res.body, res);
      out.headers.delete('content-encoding');
      out.headers.delete('content-length');
      return out;
    }
    if (url.pathname === '/carry-over/') return carryOver();
    return Response.redirect(SITE + where(url.pathname, url.searchParams), 302);
  }
};

// Carrying a sign-in over (2026-11-19). Until the move, the Class Pass bridge was here, in a hidden frame on every page
// of the class site, so this browser kept a student's Class Pass sign-in (is8-pass-v1) and a guest's key (is8-guest-v1)
// here, in the storage it keeps for this address inside the class site. The class site's bridge (its app/bridge/,
// app/assets/book-bridge.js) opens this page in a hidden frame once per browser, and this page hands those two to it,
// so nobody has to sign in again. Only the class site may frame this page, and only it is sent the sign-in.
function carryOver() {
  const html = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Class Pass</title>
<script>
(function () {
  var SITE = ${JSON.stringify(SITE)};
  if (window.parent === window) { location.replace(SITE + '/flashcards'); return; }
  var out = { pass: '', guest: '' };
  try { out.pass = localStorage.getItem('is8-pass-v1') || ''; out.guest = localStorage.getItem('is8-guest-v1') || ''; } catch (e) { /* no storage here */ }
  window.parent.postMessage({ vocabCarry: out }, SITE);
})();
</script>`;
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': 'frame-ancestors ' + SITE,
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer'
    }
  });
}

// The class site's address for an old page's address.
function where(path, q) {
  const code = /^[A-Za-z2-9]{6}$/.test(q.get('code') || '') ? q.get('code').toUpperCase() : '';
  if (/^\/join(\/|\/index\.html)?$/.test(path)) return '/join' + (code ? '?code=' + code : '');
  // a student's game screen: its code is after the #, which the browser keeps
  if (/^\/(royale|surge|molehunt)\/play\/?/.test(path)) return '/join' + (code ? '?code=' + code : '');
  if (/^\/molehunt\/remote\/?/.test(path)) return '/app/molehunt/remote/';
  if (/^\/live\/?/.test(path)) {
    const game = { volley: 'vocab-live', blast: 'blast', match: 'match' }[q.get('game')] || 'host';
    return '/flashcards?go=' + game;
  }
  if (/^\/royale\/?/.test(path)) return '/flashcards?go=battle-royale';
  if (/^\/surge\/?/.test(path)) return '/flashcards?go=surge-showdown';
  if (/^\/molehunt\/?/.test(path)) return '/flashcards?go=mole-hunt';
  if (/^\/leaderboard\/?/.test(path)) return '/leaderboard';
  // a set (/flashcards/frame-of-reference/, /flashcards/my/<id>/) has the same address on the class site
  if (/^\/flashcards(\/[\w\/.-]*)?$/.test(path)) return path;
  // the Class Pass sign-in window, the bridge, pictures and other files: the same file in the class site's app/ folder
  if (/^\/(signin|bridge|edit|assets)\//.test(path)) return '/app' + path + (q.toString() ? '?' + q.toString() : '');
  return '/flashcards';
}
