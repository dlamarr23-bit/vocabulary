// Mole Hunt's pages (Donny, 2026-11-15): the teacher's screen (molehunt/,
// setup, lobby, the projector and the report), the students' screen
// (molehunt/play/, where join/ sends a Mole Hunt code) and the Teacher Remote
// for a phone (molehunt/remote/). All three are shells: assets/molehunt-*.js
// draw each step as it arrives from the game server
// (game-server/src/molehunt.js). Students pick the same superheroes as Battle
// Royale (assets/heroes.js).
import { site } from '../content/site.mjs';
import { head, topbar, drawer, footer, assetVersion } from './render.mjs';
import { whoChoices, lobbyRoll, passStep } from './live.mjs';

const tag = (up, file) => file.endsWith('.css')
  ? `<link rel="stylesheet" href="${up}assets/${file}?v=${assetVersion(file)}">\n`
  : `<script src="${up}assets/${file}?v=${assetVersion(file)}" defer></script>\n`;

const HOST_FILES = ['flashcards.css', 'live.css', 'royale.css', 'molehunt.css', 'molehunt-notebook.css', 'editor.js', 'vendor/qrcode.js', 'live-celebrate.js', 'heroes.js', 'live-roster.js', 'molehunt-common.js', 'molehunt-ink.js', 'molehunt-host.js'];
const PLAY_FILES = ['flashcards.css', 'live.css', 'royale.css', 'molehunt.css', 'molehunt-notebook.css', 'live-celebrate.js', 'heroes.js', 'royale-zoom.js', 'molehunt-common.js', 'molehunt-ink.js', 'molehunt-play.js'];
const REMOTE_FILES = ['flashcards.css', 'live.css', 'royale.css', 'molehunt.css', 'molehunt-notebook.css', 'editor.js', 'heroes.js', 'molehunt-common.js', 'molehunt-ink.js', 'molehunt-remote.js'];

// The game's mole: the hand-drawn Mole Hunt picture from Host a game (Donny,
// 2026-11-18: "change the mole to match the muted one"). up: the way back to
// the site's top folder.
const MOLE_PIC = 'review-icons/mole-hunt.webp';
const molePic = (up) => `<img class="mh-mole mh-mole-pic" src="${up}assets/${MOLE_PIC}?v=${assetVersion(MOLE_PIC)}" alt="">`;

export function renderMoleHost(chapters) {
  const depth = 1;
  return head({
    title: `Mole Hunt | ${site.title}`,
    description: 'Host Mole Hunt: find the secret Moles in the lab.',
    unitId: null,
    depth,
    extraHead: HOST_FILES.map((f) => tag('../', f)).join('')
  }) + topbar(depth, null) + drawer(depth, chapters, null, null) + HOST + footer(depth);
}

export function renderMolePlay(chapters) {
  const depth = 2;
  return head({
    title: `Mole Hunt | ${site.title}`,
    description: 'Play Mole Hunt with the code on the board.',
    unitId: null,
    depth,
    extraHead: PLAY_FILES.map((f) => tag('../../', f)).join('')
  }) + topbar(depth, null) + drawer(depth, chapters, null, null) + PLAY + footer(depth);
}

export function renderMoleRemote(chapters) {
  const depth = 2;
  return head({
    title: `Mole Hunt Teacher Remote | ${site.title}`,
    description: 'Run a Mole Hunt game from your phone.',
    unitId: null,
    depth,
    extraHead: REMOTE_FILES.map((f) => tag('../../', f)).join('')
  }) + topbar(depth, null) + drawer(depth, chapters, null, null) + REMOTE + footer(depth);
}

// A switch row: id, title, note, on.
const sw = (id, title, note, on) => `<label class="lv-opt fc-switch"><span><strong>${title}</strong><span class="lv-opt-note">${note}</span></span><input type="checkbox" id="${id}"${on ? ' checked' : ''}></label>`;
const sel = (id, title, note, options, picked) => `<label class="lv-opt"><span><strong>${title}</strong><span class="lv-opt-note">${note}</span></span>
<select id="${id}">${options.map(([v, t]) => `<option value="${v}"${String(v) === String(picked) ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;

const HOST = `<main id="main" class="container lv-page mh-page mh-host">

<section class="lv-step" id="mhGate">
<h1>Mole Hunt</h1>
<p class="lv-lede" id="mhGateText">Checking the site...</p>
<div id="mhSignIn"></div>
</section>

<section class="lv-step" id="mhSetup" hidden>
<div class="mh-hero-head">
<div class="mh-logo">${molePic('../')}</div>
<div>
<h1>Mole Hunt</h1>
<p class="lv-lede">Somebody in the lab is a mole. Most of the class are <strong class="mh-t-sci">Scientists</strong>; a few secret <strong class="mh-t-mole">Moles</strong> try to sabotage the lab. Everyone answers your questions to earn energy, then spends it on lab tools. Scientists scan classmates and vote the Moles out at Lab Meetings.</p>
</div>
</div>
<div class="lv-resume" id="mhResume" hidden><span id="mhResumeText"></span> <button type="button" class="btn fc-small" id="mhResumeBtn">Go back to it</button></div>

<fieldset class="lv-group mh-box"><legend class="lv-q">Questions</legend>
<div class="rb-source">
<label class="rb-radio"><input type="radio" name="mhSource" value="qset" checked> A question set</label>
<label class="rb-radio"><input type="radio" name="mhSource" value="flash"> A flashcard set</label>
</div>
<div class="rb-pick" id="mhQsetRow"><select id="mhQset" aria-label="Question set"></select>
<a class="btn secondary fc-small" href="../royale/#new">New or edit question sets</a></div>
<div class="rb-pick" id="mhFlashRow" hidden><select id="mhFlash" aria-label="Flashcard set"></select></div>
<p class="lv-small" id="mhSourceNote">Question sets are shared with Battle Royale and Surge Showdown.</p>
</fieldset>

${whoChoices('mhWho', 'mhPeriod').replace('class="lv-group lv-who"', 'class="lv-group lv-who mh-box"')}

<fieldset class="lv-group mh-box"><legend class="lv-q">The Moles and the meetings</legend>
<div class="rb-opts">
${sel('mhMoles', 'Moles', 'Auto picks about 1 Mole for every 10 students (3 for a class of 30). More Moles, longer games.', [[0, 'Auto (1 for every 10)'], [1, '1 Mole'], [2, '2 Moles'], [3, '3 Moles'], [4, '4 Moles'], [5, '5 Moles'], [6, '6 Moles']], 0)}
${sel('mhMeetings', 'Lab Meetings', 'How many votes the class gets. Never fewer than 1 more than the Moles. You can add one any time during the game.', [[0, '2 more than the Moles'], [3, '3 meetings'], [4, '4 meetings'], [5, '5 meetings'], [6, '6 meetings'], [7, '7 meetings'], [9, '9 meetings']], 0)}
${sel('mhTalk', 'Talking time at a meeting', 'Then voting opens by itself. You can open it sooner.', [[30, '30 seconds'], [60, '1 minute'], [90, '1.5 minutes'], [120, '2 minutes'], [180, '3 minutes']], 60)}
${sel('mhVote', 'Voting time', 'Voting ends sooner once everyone has voted.', [[20, '20 seconds'], [30, '30 seconds'], [45, '45 seconds'], [60, '1 minute']], 30)}
${sw('mhShowVoters', 'Show who voted for whom', 'After each vote the board shows every student\'s vote. Off: only the totals.', false)}
${sw('mhClaims', 'Students can tell the class at meetings', 'A student taps Tell the class on one of their notes, and it shows on this screen: "I think Ben C. is a Mole because my scan said Not sure." 2 for each student at each meeting. Moles can fib.', true)}
</div></fieldset>

<fieldset class="lv-group mh-box"><legend class="lv-q">Time, scans and prices</legend>
<div class="rb-opts">
${sel('mhLimit', 'Game length', 'When time runs out with Moles still hiding, the Moles win. Add or take away a minute any time during the game.', [[5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [25, '25 minutes'], [30, '30 minutes'], [0, 'No time limit']], 15)}
${sel('mhScans', 'Scans for each student', 'The class shares one pool of scans: this many for each student. Moles can cut it.', [[3, '3 each'], [5, '5 each'], [10, '10 each'], [15, '15 each'], [20, '20 each']], 10)}
${sel('mhReliable', 'How reliable scans are', 'How often a scan on a Scientist says Clear. A scan on a Mole always says Not sure, unless the Mole is disguised.', [['always', 'Always right'], ['usually', 'Usually right (85%)'], ['normal', 'Normal (70%)'], ['shaky', 'Shaky (50%)']], 'normal')}
${sel('mhPrices', 'Tool prices', 'Cheap means more scans and more action.', [['cheap', 'Cheap'], ['normal', 'Normal'], ['pricey', 'Pricey']], 'normal')}
</div></fieldset>

<fieldset class="lv-group mh-box"><legend class="lv-q">Tools and answers</legend>
<div class="rb-opts mh-two">
${sw('mhT-scan', 'Private scan', 'Scientists see Clear or Not sure. Only they see it.', true)}
${sw('mhT-public', 'Public scan', 'A Clear result goes on the board\'s Clear list.', true)}
${sw('mhT-peek', 'Peek at notes', 'Read one classmate\'s notes and Evidence Board.', true)}
${sw('mhT-studentMeetings', 'Students can call meetings', 'Off: only you call meetings.', true)}
${sw('mhT-fake', 'Fake scan (Moles)', 'Puts a made-up scan on the Lab log.', true)}
${sw('mhT-cut', 'Cut scans (Moles)', 'Takes scans out of the class\'s pool.', true)}
${sw('mhT-smudge', 'Smudge (Moles)', 'That student never comes up Clear again.', true)}
${sw('mhT-disguise', 'Disguise (Moles)', 'The next scan on that Mole says Clear.', true)}
${sw('mhWrongCost', 'A wrong answer costs 1 energy', 'Off is best for science questions: on, energy comes about half as fast.', false)}
${sw('mhShowAnswer', 'Show the right answer after a miss', 'Students see the right answer for a moment before the next question.', true)}
${sw('mhJoinLate', 'Students can join late', 'A late student is always a Scientist.', true)}
${sw('mhSlow', 'Slow down rule', '3 wrong answers within 12 seconds pause that student for 5 seconds with a "Slow down and read" message, so guessing does not pay.', true)}
</div></fieldset>

<fieldset class="lv-group mh-box"><legend class="lv-q">Extras</legend>
<p class="lv-small mh-always">Always on: 1 the Evidence Board, 7 meeting reasons and the big reveal, 10 the Case File and awards.</p>
<div class="rb-opts mh-two">
${sw('mhX-power', '2 Lab Power', 'Every right answer from a Scientist fills a class bar. Fill it and the Scientists win.', true)}
${sw('mhX-emergencies', '3 Lab Emergencies', 'A Mole sets off an alarm: the class has 45 seconds to answer together.', true)}
${sw('mhX-missions', '4 Secret Missions', 'Three private side quests each round, for energy and badges.', true)}
${sw('mhX-roles', '5 Special Roles', 'Secret jobs with a power (pick which below).', true)}
${sw('mhX-ghosts', '6 Ghost Lab', 'Voted out students keep answering and give energy to their team.', true)}
${sw('mhX-rumors', '8 Rumor Drops', 'Every so often the lab radio drops a true clue.', true)}
${sw('mhX-second', '9 Second Chance and streaks', 'A missed question comes back worth double; 3 and 5 in a row earn bonus energy.', true)}
</div>
<div class="mh-sub" id="mhRolesSub">
<p class="lv-small"><strong>Special roles:</strong></p>
<label class="rb-radio"><input type="checkbox" id="mhJ-detective" checked> Detective: a free scan every 2 minutes</label>
<label class="rb-radio"><input type="checkbox" id="mhJ-medic" checked> Medic: protects one student a round from smudges</label>
<label class="rb-radio"><input type="checkbox" id="mhJ-tech" checked> Lab Tech: counts double in an emergency</label>
<label class="rb-radio"><input type="checkbox" id="mhJ-hacker" checked> Hacker (a Mole): Cut scans costs half</label>
</div>
<div class="mh-sub" id="mhRumorSub">${sel('mhRumorEvery', 'A rumor every', 'You can also drop one any time.', [[60, '1 minute'], [90, '1.5 minutes'], [120, '2 minutes'], [180, '3 minutes']], 90)}</div>
</fieldset>

<fieldset class="lv-group mh-box"><legend class="lv-q">Music</legend>
<div class="rb-opts">
<div class="lv-opt"><span><strong>Lobby music</strong><span class="lv-opt-note">Plays on this screen only while students join.</span></span>
<span class="lv-music-ctl"><select id="mhLobbyMusic" aria-label="Lobby music"></select></span></div>
<div class="lv-opt"><span><strong>Game music</strong><span class="lv-opt-note">Plays on this screen only during the game.</span></span>
<span class="lv-music-ctl"><select id="mhGameMusic" aria-label="Game music"></select></span></div>
</div></fieldset>
<label class="lv-default lv-demo-pick"><input type="checkbox" id="mhDemo"> <span><strong>Demo mode: 40 pretend students</strong> <span class="lv-opt-note">Try the game on your own. Pretend students join, answer, scan, sabotage and vote. Real students can still join with the code.</span></span></label>
<label class="lv-default"><input type="checkbox" id="mhSaveDefault"> <span><strong>Save these as my default settings</strong> <span class="lv-opt-note">Next time, this page starts with the same choices and music.</span></span></label>
<p class="lv-error" id="mhSetupError" role="alert"></p>
<button type="button" class="btn lv-big" id="mhCreate">Create game</button>
</section>

<section class="lv-step" id="mhLobby" hidden>
<div class="lv-joinbox">
<div class="lv-join-text">
<p class="lv-join-step">Go to <strong class="mh-join-url"></strong></p>
<p class="lv-join-step">Enter this code:</p>
<p class="lv-code" id="mhCode"></p>
<div class="lv-invite">
<button type="button" class="btn lv-invite-btn" id="mhCopy">Copy join link</button>
<a class="btn lv-invite-btn lv-classroom" href="https://classroom.google.com/" target="_blank" rel="noopener">Post to Google Classroom</a>
</div>
</div>
<div class="lv-qr-side">
<div class="lv-qr" id="mhQr" aria-label="QR code that opens the join page with this code"></div>
<p class="lv-join-or">Scan the QR code with a camera to join.</p>
</div>
</div>
<div class="lv-lobby-bar">
<p class="lv-count" id="mhCount" aria-live="polite">Waiting for students to join...</p>
<div class="lv-lobby-actions">
<button type="button" class="btn secondary lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="btn secondary lv-close" data-close>End game</button>
<button type="button" class="btn lv-big" id="mhStart">Start game</button>
</div>
</div>
<div class="rb-lobby-opts" id="mhLobbyOpts"></div>
${lobbyRoll('mh')}
<ul class="rb-players" id="mhPlayers"></ul>
</section>

<section class="lv-step mh-arena" id="mhPlay" hidden>
<header class="mh-bar">
<div class="mh-brand">${molePic('../')}<span>Mole Hunt</span></div>
<p class="mh-phase" id="mhPhase"></p>
<div class="mh-clock-box" id="mhClockBox">
<button type="button" class="mh-tb" id="mhMinus" title="Take a minute off the clock">&minus;1 min</button>
<span class="mh-clock" id="mhClock" role="timer" aria-live="off"></span>
<button type="button" class="mh-tb" id="mhPlus" title="Add a minute to the clock">+1 min</button>
<label class="mh-clock-set"><span class="rb-sr">Set the game clock</span><select id="mhClockSet" aria-label="Set the game clock"></select></label>
</div>
<div class="mh-bar-right" id="mhBarRight">
<span class="mh-codechip">Code <strong class="mh-mini-code"></strong></span>
<button type="button" class="mh-tool" id="mhRemoteBtn" aria-expanded="false">📱 Remote</button>
<button type="button" class="mh-tool" id="mhRosterBtn" aria-expanded="false" aria-controls="mhRoster">👥 Players</button>
<button type="button" class="mh-tool lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
</div>
</header>
<div class="mh-stage" id="mhStage"></div>
<div class="mh-ctrl" id="mhCtrl" role="toolbar" aria-label="Teacher controls">
<button type="button" class="mh-cb hot" id="mhCallMeeting"><span aria-hidden="true">🔔</span>Call meeting<small>(free)</small></button>
<button type="button" class="mh-cb" id="mhPause"><span aria-hidden="true">⏸️</span>Pause all<small>screens</small></button>
<button type="button" class="mh-cb hot" id="mhRumorBtn" aria-expanded="false"><span aria-hidden="true">📡</span>Drop a<small>rumor</small></button>
<button type="button" class="mh-cb" id="mhBoost"><span aria-hidden="true">⚡</span>+5 for<small>everyone</small></button>
<button type="button" class="mh-cb on" id="mhAddMeeting"><span aria-hidden="true">➕</span>+1<small>meeting</small></button>
<button type="button" class="mh-cb" id="mhVoteBtn"><span aria-hidden="true">🗳️</span><b id="mhVoteWord">Start</b><small>voting</small></button>
<button type="button" class="mh-cb red" id="mhEnd"><span aria-hidden="true">🏁</span>End game<small>now</small></button>
</div>
<div class="mh-pop" id="mhRumorPop" hidden>
<h3>Drop a rumor</h3>
<p class="lv-small">Rumors are always true. They come from this game.</p>
<button type="button" class="mh-pop-item on" data-rumor="">🎲 Pick a true one for me</button>
<button type="button" class="mh-pop-item" data-rumor="names">🔤 About the Moles' names or heroes</button>
<button type="button" class="mh-pop-item" data-rumor="answers">📝 About how the Moles are answering</button>
<button type="button" class="mh-pop-item" data-rumor="sabotage">🕵️ About sabotage so far</button>
</div>
<div class="mh-pop mh-pop-remote" id="mhRemotePop" hidden>
<h3>Teacher Remote</h3>
<div class="mh-qr" id="mhRemoteQr" aria-label="QR code that opens the Teacher Remote"></div>
<p class="lv-small">Scan with your phone. You sign in with the teacher password, then only your phone shows who the Moles are.</p>
<p class="mh-remote-link" id="mhRemoteLink"></p>
</div>
</section>

<div class="lv-roster-back" id="mhRosterBack" hidden></div>
<aside class="lv-roster" id="mhRoster" hidden aria-label="Players">
<div class="lv-roster-head"><h2>Players</h2><button type="button" class="lv-roster-close" id="mhRosterClose" aria-label="Close the player list">✖</button></div>
<p class="lv-small">Take a student out of the game if they should not be playing. Removing and blocking keeps that device out of this game.</p>
<div id="mhRosterBody"></div>
</aside>

<section class="lv-step mh-arena" id="mhDone" hidden>
<div class="mh-done-head" id="mhDoneHead"></div>
<div class="mh-moles-row" id="mhDoneMoles"></div>
<div class="mh-done-grid">
<section class="mh-panel"><h3>📁 Case File: what the Moles did</h3><ol class="mh-tl" id="mhCaseFile"></ol></section>
<section class="mh-panel"><h3>🏆 Awards</h3><div class="mh-awards" id="mhAwards"></div></section>
</div>
<section class="mh-panel mh-report">
<div class="mh-report-head"><h3>Game report</h3>
<div class="mh-report-btns">
<button type="button" class="btn" id="mhSheet">Open in Google Sheets</button>
<span class="mh-lb-note" id="mhLbNote"></span>
</div></div>
<p class="lv-small" id="mhSheetNote" role="status"></p>
<div class="mh-table-wrap"><table class="mh-table" id="mhTable"></table></div>
<div id="mhMissedBox" hidden><h4>Most missed questions</h4><ol class="mh-missed" id="mhMissed"></ol></div>
</section>
<div class="lv-lobby-actions lv-done-actions">
<button type="button" class="btn secondary lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="btn lv-big" id="mhAgain">Play again with the same players</button>
<button type="button" class="btn secondary" id="mhNew">New game</button>
</div>
</section>

<div id="mhMusicHome"><div class="rb-music" id="mhMusic" hidden>
<span class="lv-music-label" id="mhMusicLabel">Music</span>
<button type="button" class="lv-music-btn" id="mhMute" aria-pressed="false">Mute</button>
<input type="range" id="mhVolume" min="0" max="100" value="60" aria-label="Music volume" title="Volume">
</div></div>
<p class="lv-toast" id="mhToast" role="status" aria-live="polite"></p>
<p class="lv-status" id="mhStatus" role="status" aria-live="polite"></p>
</main>`;

const PLAY = `<main id="main" class="container lv-page mh-page mh-play">

<section class="lv-step lv-card" id="mpCode" hidden>
<h1>Mole Hunt</h1>
<form id="mpCodeForm" class="lv-form">
<label class="lv-q" for="mpCodeInput">Enter the join code</label>
<input id="mpCodeInput" class="lv-code-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6">
<button type="submit" class="btn lv-big">Continue</button>
</form>
<p class="lv-error" id="mpCodeError" role="alert"></p>
</section>

${passStep('mp')}

<section class="lv-step lv-card" id="mpName" hidden>
<p class="lv-eyebrow">Mole Hunt</p>
<form id="mpNameForm" class="lv-form">
<label class="lv-q" for="mpNick">Enter your first name and last initial only.</label>
<input id="mpNick" class="lv-nick-input" type="text" autocomplete="off" spellcheck="false" maxlength="16">
<p class="lv-small">For example: Maria G.</p>
<button type="submit" class="btn lv-big" id="mpNameBtn">Join game</button>
</form>
<p class="lv-error" id="mpNameError" role="alert"></p>
</section>

<section class="lv-step" id="mpLobby" hidden>
<div class="rp-me-card mh-me-card">
<div class="rp-me-hero" id="mpMeHero"></div>
<div class="rp-me-text">
<p class="lv-eyebrow">You are in</p>
<p class="rp-me-name" id="mpMeName"></p>
<p class="lv-small" id="mpWaitText">Pick your hero. Your teacher will start the game soon.</p>
</div>
<div class="mh-me-mole">${molePic('../../')}</div>
</div>
<div class="rp-picker" id="mpPicker">
<h2 class="rp-pick-title">Pick your hero</h2>
<p class="rp-pick-msg" id="mpPickMsg" role="status"></p>
<div class="rp-grid" id="mpGrid"></div>
</div>
</section>

<section class="lv-step mh-game" id="mpGame" hidden>
<header class="mh-me-bar" id="mpBar"></header>
<div class="mh-banners" id="mpBanners"></div>
<nav class="mh-tabs" id="mpTabs" role="tablist"></nav>
<div class="mh-panes" id="mpPanes"></div>
<div class="mh-overlay" id="mpOverlay" hidden></div>
<div class="mh-popup-back" id="mpPopBack" hidden><div class="mh-popup" id="mpPop" role="dialog" aria-modal="true"></div></div>
</section>

<section class="lv-step lv-card" id="mpPaused" hidden>
<p class="lv-done-emoji" aria-hidden="true">⏸️</p>
<p class="lv-me">Your teacher paused the game.</p>
<p class="lv-lede">Look up at the board.</p>
</section>

<section class="lv-step mh-game" id="mpDone" hidden></section>

<section class="lv-step lv-card" id="mpGone" hidden>
<p class="lv-me" id="mpGoneText"></p>
<a class="btn" href="../../join/">Join a game</a>
</section>

<div class="lv-toast" id="mpToast" role="status" aria-live="polite"></div>
<p class="lv-status" id="mpStatus" role="status" aria-live="polite"></p>
</main>`;

const REMOTE = `<main id="main" class="container lv-page mh-page mh-remote">

<section class="lv-step" id="mrGate">
<h1>Teacher Remote</h1>
<p class="lv-lede" id="mrGateText">Checking the site...</p>
<div id="mrSignIn"></div>
<form id="mrCodeForm" class="lv-form" hidden>
<label class="lv-q" for="mrCodeInput">The game code on the board</label>
<input id="mrCodeInput" class="lv-code-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6">
<button type="submit" class="btn lv-big">Open the remote</button>
</form>
<p class="lv-error" id="mrError" role="alert"></p>
</section>

<section class="lv-step" id="mrMain" hidden>
<div class="mh-rm-head"><span aria-hidden="true">🔒</span> Teacher Remote<strong>Only you can see this</strong></div>
<div class="mh-rm-stats" id="mrStats"></div>
<div class="mh-rm-clock" id="mrClock"></div>
<div class="mh-rm-ctrl" id="mrCtrl"></div>
<nav class="mh-tabs mh-rm-tabs" id="mrTabs"></nav>
<div id="mrBody"></div>
</section>

<div class="lv-toast" id="mrToast" role="status" aria-live="polite"></div>
<p class="lv-status" id="mrStatus" role="status" aria-live="polite"></p>
</main>`;
