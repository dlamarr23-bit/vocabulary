// Surge Showdown's pages (Donny, 2026-11-04: moved onto this site from its
// own, so it is hosted like Battle Royale): the teacher's screen (surge/) and
// the students' screen (surge/play/, where join/ sends a Surge Showdown
// code). Both are shells; assets/surge-host.js and assets/surge-play.js draw
// each step of the game as it arrives from the game server
// (game-server/src/surge.js). The setup screen looks like the rest of the
// site; the game itself keeps Surge Showdown's dark arena (surge.css), which
// reads the same in the site's light and dark modes.
import { site } from '../content/site.mjs';
import { head, topbar, drawer, footer, assetVersion } from './render.mjs';
import { whoChoices, lobbyRoll, passStep } from './live.mjs';

const tag = (up, file) => file.endsWith('.css')
  ? `<link rel="stylesheet" href="${up}assets/${file}?v=${assetVersion(file)}">\n`
  : `<script src="${up}assets/${file}?v=${assetVersion(file)}" defer></script>\n`;

const HOST_FILES = ['flashcards.css', 'live.css', 'surge.css', 'editor.js', 'vendor/qrcode.js', 'live-roster.js', 'surge-common.js', 'surge-intro.js', 'surge-host.js', 'surge-music.js'];
const PLAY_FILES = ['flashcards.css', 'live.css', 'surge.css', 'surge-common.js', 'surge-play.js'];

export function renderSurgeHost(chapters) {
  const depth = 1;
  return head({
    title: `Surge Showdown | ${site.title}`,
    description: 'Host Surge Showdown: teams answer questions to power up, attack, heal and shield.',
    unitId: null,
    depth,
    extraHead: HOST_FILES.map((f) => tag('../', f)).join('')
  }) + topbar(depth, null) + drawer(depth, chapters, null, null) + HOST + footer(depth);
}

export function renderSurgePlay(chapters) {
  const depth = 2;
  return head({
    title: `Surge Showdown | ${site.title}`,
    description: 'Play Surge Showdown with the code on the board.',
    unitId: null,
    depth,
    extraHead: PLAY_FILES.map((f) => tag('../../', f)).join('')
  }) + topbar(depth, null) + drawer(depth, chapters, null, null) + PLAY + footer(depth);
}

// One fieldset of setting rows, filled in by surge-host.js (data-group).
const group = (title, key, extra = '') => `<fieldset class="lv-group sg-box"><legend class="lv-q">${title}</legend>
${extra}<div class="sg-rows" data-group="${key}"></div></fieldset>`;

const HOST = `<main id="main" class="container lv-page lv-host sg-page sg-host">

<section class="lv-step" id="sgGate">
<h1>Surge Showdown</h1>
<p class="lv-lede" id="sgGateText">Checking the site...</p>
<div id="sgSignIn"></div>
</section>

<section class="lv-step" id="sgSetup" hidden>
<div class="sg-setup-head">
<span class="sg-bolt" aria-hidden="true">⚡</span>
<div><h1 id="sgSetupTitle">Surge Showdown</h1>
<p class="lv-lede">Teams answer questions to earn energy, then spend it to attack other teams, heal and shield their own. As the clock runs down every power-up gets stronger. The top 3 teams go on the podium.</p></div>
</div>
<div class="lv-resume" id="sgResume" hidden><span id="sgResumeText"></span> <button type="button" class="btn fc-small" id="sgResumeBtn">Go back to it</button></div>

<fieldset class="lv-group sg-box"><legend class="lv-q">Questions</legend>
<div class="sg-source">
<label class="sg-radio"><input type="radio" name="sgSource" value="qset" checked> A question set</label>
<label class="sg-radio"><input type="radio" name="sgSource" value="flash"> A flashcard set</label>
</div>
<div class="sg-pick" id="sgQsetRow"><select id="sgQset" aria-label="Question set"><option value="">Loading your question sets...</option></select>
<a class="btn secondary fc-small" href="../royale/#new">Make or edit question sets</a></div>
<p class="lv-small" id="sgQsetNote"></p>
<div class="sg-pick" id="sgFlashRow" hidden><select id="sgFlash" aria-label="Flashcard set"></select></div>
<p class="lv-small" id="sgFlashNote" hidden>Students see each definition and pick its term. The wrong answers are other terms from the set.</p>
</fieldset>

${whoChoices('sgWho', 'sgPeriod')}

${group('Game', 'game', `<label class="lv-opt"><span><strong>Game title</strong><span class="lv-opt-note">Shows at the top of every screen.</span></span><input type="text" id="sgTitle" maxlength="40" class="sg-title-input"></label>\n`)}
<fieldset class="lv-group sg-box"><legend class="lv-q">Teams</legend>
<div class="sg-rows" data-group="teams"></div>
<details class="sg-team-details"><summary>Team names, icons and colors</summary><div class="sg-team-edit" id="sgTeamEdit"></div></details>
</fieldset>
${group('Battle', 'battle')}
<fieldset class="lv-group sg-box"><legend class="lv-q">Surge</legend>
<p class="lv-small">Power-ups get stronger as time runs out, and the increase speeds up near the end.</p>
<div class="sg-rows" data-group="surge"></div>
<svg class="sg-curve" id="sgCurve" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"></svg>
<div class="sg-curve-labels lv-small"><span>Start</span><span id="sgCurveMid"></span><span>End</span></div>
</fieldset>
${group('Scoring', 'scoring', '<p class="lv-small">Team score is everyone\'s points plus bonuses. The top 3 teams go on the podium.</p>\n')}
${group('Special events', 'events', '<p class="lv-small">Extra twists that keep every team in the game. Turn off any you do not want.</p>\n')}

<fieldset class="lv-group sg-box"><legend class="lv-q">Music</legend>
<p class="lv-small">Plays on this screen only, never on students' screens. Change or mute it any time from the music bar.</p>
<div class="sg-rows">
<div class="lv-opt"><span><strong>Lobby music</strong><span class="lv-opt-note">Plays while students join. Stops when the game starts.</span></span>
<span class="sg-mu-ctl"><select id="muLobby" aria-label="Lobby music"></select><button type="button" class="btn secondary fc-small" id="muLobbyTry">Listen</button><input type="range" class="sg-mu-vol" id="muLobbyVol" min="0" max="100" aria-label="Lobby music volume" title="Lobby music volume"></span></div>
<div class="lv-opt"><span><strong>Game music</strong><span class="lv-opt-note">Plays during the battle. Pauses when you pause the game.</span></span>
<span class="sg-mu-ctl"><select id="muGame" aria-label="Game music"></select><button type="button" class="btn secondary fc-small" id="muGameTry">Listen</button><input type="range" class="sg-mu-vol" id="muGameVol" min="0" max="100" aria-label="Game music volume" title="Game music volume"></span></div>
<label class="lv-opt"><span><strong>Winning song</strong><span class="lv-opt-note">Plays once when the podium appears.</span></span>
<select id="muWin" aria-label="Winning song"><option value="true">Yes</option><option value="false">No</option></select></label>
</div>
</fieldset>

<fieldset class="lv-group sg-box"><legend class="lv-q">Power-ups at a glance</legend><p class="lv-small sg-power-info" id="sgPowerInfo"></p></fieldset>

<label class="lv-default lv-demo-pick"><input type="checkbox" id="sgDemo"> <span><strong>Demo mode: 40 pretend students</strong> <span class="lv-opt-note">Try the game on your own. Pretend students join using your settings, play, and get some answers right and some wrong. Real students can still join with the code.</span></span></label>
<p class="lv-small">Your choices on this screen are kept on this computer for next time.</p>
<p class="lv-error" id="sgSetupError" role="alert"></p>
<div class="sg-create-row">
<button type="button" class="btn secondary" id="sgCancelEdit" hidden>Cancel</button>
<button type="button" class="btn lv-big" id="sgCreate">Create game</button>
</div>
</section>

<section class="lv-step sg sg-arena" id="sgLobby" hidden>
<div class="panel joinbox">
<div class="sg-join-text">
<div class="muted">Go to</div>
<div class="url" id="sgJoinUrl"></div>
<div class="muted">and enter this code</div>
<div class="code" id="sgJoinCode"></div>
<button type="button" class="sbtn sm good" data-copylink>🔗 Copy join link</button>
</div>
<div class="sg-qr" id="sgQr" aria-label="QR code that opens the join page with this code"></div>
<div class="sg-lobby-side">
<div class="display sg-count" id="sgCount">0 players</div>
<button type="button" class="sbtn primary big" id="sgStart">Start game ▶</button>
<div class="row sg-lobby-tools">
<button type="button" class="sbtn sm ghost" id="sgEditBtn">⚙️ Settings and questions</button>
<button type="button" class="sbtn sm ghost" id="sgShuffle" title="Put everyone on new teams at random">🔀 Shuffle teams</button>
<button type="button" class="sbtn sm ghost" id="sgDemoLobby">🎭 Demo</button>
<button type="button" class="sbtn sm ghost" id="sgIntroBtn" title="See the how-to-play slides without starting">📖 How to play</button>
<button type="button" class="sbtn sm ghost" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="sbtn sm ghost danger-text" data-close>End game</button>
</div>
<div id="sgRemovedLobby"></div>
</div>
</div>
<div class="sg-roll-wrap">
${lobbyRoll('sg')}
</div>
<div class="teams-grid" id="sgLobbyTeams"></div>
</section>

<section class="lv-step sg sg-arena" id="sgLive" hidden>
<header class="sg-live-head">
<div class="sg-brand"><span class="bolt">⚡</span> <span id="sgBrand">Surge Showdown</span></div>
<div class="surge" title="Power-up strength. It grows faster and faster as time runs out.">
<span class="muted">Surge</span><span class="x" id="sgSurgeX">×1.0</span>
<div class="surge-track"><div class="surge-fill" id="sgSurgeFill"></div></div>
</div>
<div class="timer" id="sgTimer">0:00</div>
<div class="row sg-live-tools">
<button type="button" class="sbtn sm good" id="sgAddBtn" title="Show the join code so more students can join">➕ Add students</button>
<button type="button" class="sbtn sm" id="sgMinus" title="Take 1 minute off">-1 min</button>
<button type="button" class="sbtn sm" id="sgPlus" title="Add 1 minute">+1 min</button>
<button type="button" class="sbtn sm" id="sgPause">⏸ Pause</button>
<button type="button" class="sbtn sm ghost" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="sbtn sm danger" id="sgEnd">🏁 End game</button>
</div>
</header>
<div id="sgPaused" class="paused-banner hidden">⏸ PAUSED: students cannot answer or attack</div>
<div class="live">
<div>
<div id="sgShowdownBar" class="showdown-bar hidden">⚔️ FINAL SHOWDOWN · Surge ×2 · No healing</div>
<div id="sgDropBox" class="drop-box hidden"></div>
<div class="battle" id="sgBattle"></div>
<div class="panel sg-players-panel">
<div class="row"><h2>👥 Players</h2><div class="spacer"></div><span class="muted sg-small">Click a column to sort</span></div>
<div class="sg-table-wrap"><table class="ptable" id="sgPtable"></table></div>
</div>
</div>
<aside class="sidebar">
<div class="panel sg-feed-panel"><h2>📣 Battle feed</h2><div class="feed" id="sgFeed"></div></div>
<div class="panel live-join">
<div class="row sg-live-join-top">
<div><div class="muted sg-small">Join at <span id="sgLiveUrl"></span></div><div class="live-code" id="sgLiveCode"></div></div>
<div class="row sg-gap6"><button type="button" class="sbtn sm" data-copylink>🔗 Copy link</button><button type="button" class="sbtn sm" id="sgAddBtn2">Show big</button></div>
</div>
<label class="srow"><span class="stxt"><b>New students</b></span><select id="sgLateJoinLive"><option value="true">Can join</option><option value="false">Locked</option></select></label>
<label class="srow"><span class="stxt"><b>Pretend students</b></span><select id="sgDemoLive"><option value="false">Off</option><option value="true">40 on</option></select></label>
<div id="sgRemovedLive"></div>
</div>
</aside>
</div>
</section>

<section class="lv-step sg sg-arena" id="sgResults" hidden>
<div class="results">
<h1>🏆 Final Standings</h1>
<div class="muted sg-end-reason" id="sgEndReason"></div>
<div id="sgPodium"></div>
<div class="awards" id="sgAwards"></div>
<div class="rank-list" id="sgRankList"></div>
<div class="row sg-done-actions">
<button type="button" class="sbtn primary big" id="sgRematch">🔁 Play again with the same players</button>
<button type="button" class="sbtn big ghost" id="sgNew">✨ New game</button>
<button type="button" class="sbtn big ghost" data-fullscreen>Full screen</button>
</div>
</div>
</section>

<div id="sgMuBar" class="sg mu-bar hidden">
<button type="button" class="mu-mute" id="muMute" aria-pressed="false"></button>
<span class="mu-label" id="muLabel">Lobby music</span>
<select id="muSong" aria-label="Song"></select>
<input type="range" class="sg-mu-vol" id="muVol" min="0" max="100" aria-label="Music volume" title="Volume">
</div>

<aside id="sgWatch" class="sg watch-pane hidden" aria-label="Player view">
<div class="wp-head">
<div><b>👀 Player view</b><div class="muted sg-small" id="sgWpWho">Joining...</div></div>
<div class="spacer"></div>
<select id="sgWpAuto" title="Autoplay"><option value="true">Autoplay on</option><option value="false">I will play</option></select>
<button type="button" class="sbtn sm ghost" id="sgWpHide" title="Hide the player view">✕</button>
</div>
<iframe id="sgWpFrame" title="Player view"></iframe>
</aside>
<button type="button" id="sgWpShow" class="sg sbtn sm wp-show hidden">👀 Show player view</button>

<div id="sgCallouts" class="sg callouts" aria-live="polite"></div>

<div id="sgJoinModal" class="sg modal-bg hidden">
<div class="modal sg-join-modal">
<div class="row sg-right"><button type="button" class="sbtn sm ghost" id="sgJmClose">Close</button></div>
<div class="muted sg-jm-label">Go to</div>
<div class="jm-url" id="sgJmUrl"></div>
<div class="muted sg-jm-label">and enter this code</div>
<div class="jm-code" id="sgJmCode"></div>
<button type="button" class="sbtn good" data-copylink>🔗 Copy join link</button>
<div class="row sg-center"><span class="muted">New students</span><select id="sgLateJoinModal"><option value="true">Can join</option><option value="false">Locked</option></select></div>
<p class="muted" id="sgJmNote"></p>
</div>
</div>
<p class="lv-status" id="sgStatus" role="status" aria-live="polite"></p>
</main>`;

const PLAY = `<main id="main" class="container lv-page sg-page sg-play">

<section class="lv-step lv-card" id="spCode" hidden>
<h1>Surge Showdown</h1>
<form id="spCodeForm" class="lv-form">
<label class="lv-q" for="spCodeInput">Enter the join code</label>
<input id="spCodeInput" class="lv-code-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6">
<button type="submit" class="btn lv-big">Continue</button>
</form>
<p class="lv-error" id="spCodeError" role="alert"></p>
</section>

${passStep('sp')}

<section class="lv-step lv-card" id="spName" hidden>
<p class="lv-eyebrow" id="spNameTitle">Surge Showdown</p>
<form id="spNameForm" class="lv-form">
<div id="spNickBox">
<label class="lv-q" for="spNick">Enter your first name and last initial only.</label>
<input id="spNick" class="lv-nick-input" type="text" autocomplete="off" spellcheck="false" maxlength="16">
<p class="lv-small">For example: Maria G.</p>
</div>
<div id="spPickWrap" hidden>
<p class="lv-q">Pick your team</p>
<div class="sg-team-pick" id="spTeamPick"></div>
</div>
<button type="submit" class="btn lv-big" id="spNameBtn">Join game</button>
</form>
<p class="lv-error" id="spNameError" role="alert"></p>
</section>

<section class="lv-step lv-card" id="spRemoved" hidden>
<p class="lv-done-emoji" aria-hidden="true">✋</p>
<p class="lv-me">Your teacher removed you from the game.</p>
<p class="lv-lede">If that was a mistake, ask your teacher to let you back in. Keep this page open and you will jump right back in.</p>
</section>

<section class="lv-step lv-card" id="spGone" hidden>
<p class="lv-me" id="spGoneText"></p>
<a class="btn" href="../../join/">Join a game</a>
</section>

<div class="sg sg-arena sg-play-arena" id="spArena" hidden>
<section id="vWait" class="hidden p-wrap"><div class="wait panel" id="waitBox"></div></section>

<section id="vGame" class="hidden p-wrap">
<div class="p-head" id="phead">
<div class="myteam" id="myTeam"></div>
<div class="myhp"><div id="myHpBar"></div><div class="muted sg-small sg-strong" id="myHpTxt"></div></div>
<div class="surge"><span class="x" id="surgeX">×1.0</span></div>
<div class="ptimer" id="ptimer">0:00</div>
<div class="energy">⚡ <span id="energy">0</span></div>
</div>
<div id="fallenBanner" class="fallen-banner hidden"></div>
<div id="pausedBanner" class="fallen-banner paused hidden">⏸ The teacher paused the game</div>
<div id="sdStrip" class="ev-strip sd hidden">⚔️ FINAL SHOWDOWN · Surge ×2 · No healing</div>
<div id="dropStrip" class="ev-strip drop hidden"></div>
<div class="tabs" role="tablist">
<button type="button" data-tab="q" class="on">❓ Questions</button>
<button type="button" data-tab="shop">🛒 Shop and power-ups</button>
</div>
<div id="tabQ">
<div class="qcard">
<div id="gambleBanner" class="gamble-banner hidden"></div>
<div class="muted sg-strong"><span id="streakTxt"></span></div>
<div id="qimg"></div>
<div class="qtext" id="qtext">Loading...</div>
<div id="answerArea"></div>
<div class="feedback" id="fb" role="status" aria-live="polite"></div>
</div>
<div class="mini-teams" id="miniTeams"></div>
<div class="feed ticker" id="ticker"></div>
</div>
<div id="tabShop" class="hidden shop">
<h3>⚔️ Power-ups <span class="muted sg-small">The surge makes these stronger as time runs out.</span></h3>
<div class="shop-grid" id="powers"></div>
<h3>⬆️ Upgrades</h3>
<div class="shop-grid" id="upgrades"></div>
</div>
</section>

<section id="vEnd" class="hidden results">
<h1>🏆 Final Standings</h1>
<div id="podium"></div>
<div class="panel sg-my-stats" id="myStats"></div>
<div class="rank-list" id="rankList"></div>
</section>
</div>

<div id="targetModal" class="sg modal-bg hidden">
<div class="modal">
<div class="row sg-modal-head"><h2 id="tmTitle">Choose a target</h2><div class="spacer"></div><button type="button" class="sbtn sm ghost" id="tmClose">Cancel</button></div>
<div class="targets" id="tmTargets"></div>
</div>
</div>
<p class="lv-status" id="spStatus" role="status" aria-live="polite"></p>
</main>`;
