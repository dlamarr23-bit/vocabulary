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
    description: 'The class leaderboard: game wins, fastest times and practice.',
    unitId: null,
    depth,
    extraHead: `<link rel="stylesheet" href="${v('flashcards.css')}">\n<link rel="stylesheet" href="${v('leaderboard.css')}">\n<script src="${v('editor.js')}" defer></script>\n<script src="${v('leaderboard.js')}" defer></script>\n`
  }) +
    topbar(depth, 'leaderboard') +
    drawer(depth, [], null, null) +
    `<div class="hero hero-page"><div class="hero-inner">
<div>
<span class="eyebrow">Class Pass</span>
<h1>Leaderboard</h1>
<p class="lede">Game wins, fastest times and practice for every class. Sign in with Class Pass when you play or study, and your results count here.</p>
</div>
<div class="hero-icon lb-hero-icon" aria-hidden="true"><svg viewBox="0 0 64 64"><rect x="6" y="30" width="16" height="26" rx="3" fill="var(--accent-tint)"/><rect x="24" y="18" width="16" height="38" rx="3" fill="var(--accent)"/><rect x="42" y="38" width="16" height="18" rx="3" fill="var(--accent-tint)"/><path d="M32 4l2.6 5.3 5.8.8-4.2 4.1 1 5.8L32 17.3 26.8 20l1-5.8-4.2-4.1 5.8-.8z" fill="var(--brand-gold)"/></svg></div>
</div></div>
<main id="main" class="container lb-page">
<form class="lb-filters" id="lbFilters" hidden>
<label class="lb-field"><span>Class</span><select id="lbPeriod"><option value="">All my classes</option></select></label>
<fieldset class="lb-field lb-span"><legend>Time</legend>
<label><input type="radio" name="lbSpan" value="year" checked> <span id="lbYearLabel">This school year</span></label>
<label><input type="radio" name="lbSpan" value="all"> <span>All time</span></label>
</fieldset>
<label class="lb-field lb-topic"><span>Topic</span><select id="lbTopic"><option value="">All topics</option></select></label>
</form>
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
