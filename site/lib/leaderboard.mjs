// The class leaderboard page (leaderboard/) and the Class Pass sign-in window
// (signin/). Both are shells: assets/leaderboard.js asks the site for the
// boards (and, for the teacher, the roster) and draws them; assets/pass-signin.js
// runs the sign-in window.
import { site } from '../content/site.mjs';
import { esc, head, topbar, drawer, footer, assetVersion } from './render.mjs';

export function renderLeaderboard() {
  const depth = 1;
  const v = (f) => `../assets/${f}?v=${assetVersion(f)}`;
  return head({
    title: `Leaderboard | ${site.title}`,
    description: 'The class leaderboard: review game points, live game wins and practice.',
    unitId: null,
    depth,
    extraHead: `<link rel="stylesheet" href="${v('flashcards.css')}">\n<link rel="stylesheet" href="${v('leaderboard.css')}">\n<script src="${v('editor.js')}" defer></script>\n<script src="${v('leaderboard.js')}" defer></script>\n`
  }) +
    topbar(depth, 'leaderboard') +
    drawer(depth, [], null, null) +
    `<div class="hero hero-page hero-section"><div class="hero-inner">
<div>
<h1>Leaderboard</h1>
<p class="lede">Review game points, live game wins and practice. Sign in with Class Pass when you play or study, and your results count here.</p>
</div>
<img class="hero-pic" src="${v('leaderboard-icon.webp')}" width="240" height="160" alt="">
</div></div>
<main id="main" class="container lb-page">
<div class="lb-filters" id="lbFilters" hidden>
<div class="lb-switch" id="lbSpan" role="group" aria-label="Time"></div>
<div class="lb-switch" id="lbClass" role="group" aria-label="Class"></div>
<p class="lb-showing" id="lbShowing"></p>
<div class="lb-unit-pick" id="lbUnitPick" hidden></div>
</div>
<p class="lb-status" id="lbStatus" role="status">Loading the leaderboard...</p>
<div id="lbGate" hidden></div>
<div id="lbBoards"></div>
<section class="lb-roster" id="lbRoster" hidden></section>
<div class="fx-signin"><button type="button" class="linkbtn" id="lbTeacherBtn">Teacher sign in</button><div id="lbTeacherSignIn" hidden></div></div>
<noscript><p>The leaderboard needs JavaScript turned on.</p></noscript>
</main>` +
    footer(depth);
}

// Google sends the student back here after they pick their account.
export function renderSignIn() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Class Pass sign in | ${esc(site.title)}</title>
<link rel="stylesheet" href="../assets/book.css">
<link rel="stylesheet" href="../assets/leaderboard.css?v=${assetVersion('leaderboard.css')}">
<script src="../assets/pass-signin.js?v=${assetVersion('pass-signin.js')}" defer></script>
</head>
<body class="ps-body">
<main class="ps-card">
<span class="pass-badge ps-badge">Class Pass</span>
<h1 id="psTitle">Sign in with your school account</h1>
<p class="ps-text" id="psText" role="status">One moment...</p>
<button type="button" class="btn" id="psAgain" hidden>Try again</button>
<p class="ps-small">Pick your school Google account. Only students on your teacher's class list can sign in.</p>
</main>
</body>
</html>
`;
}

// The Class Pass bridge (bridge/): the physical science site keeps it in a hidden frame on every page, so
// its top bar's Class Pass button knows who is signed in here (assets/book-bridge.js says how).
export function renderBridge() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Class Pass | ${esc(site.title)}</title>
<script src="../assets/pass.js?v=${assetVersion('pass.js')}" defer></script>
<script src="../assets/book-bridge.js?v=${assetVersion('book-bridge.js')}" defer></script>
</head>
<body></body>
</html>
`;
}
