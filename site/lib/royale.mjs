// Battle Royale's pages (Donny, 2026-10-29): the teacher's screen (royale/)
// and the students' screen (royale/play/, where join/ sends a Battle Royale
// code). Both are shells; assets/royale-host.js and assets/royale-play.js draw
// each step of the game as it arrives from the game server
// (game-server/src/royale.js). assets/heroes.js draws the superhero avatars.
import { site } from '../content/site.mjs';
import { head, topbar, drawer, footer, assetVersion } from './render.mjs';

const tag = (up, file) => file.endsWith('.css')
  ? `<link rel="stylesheet" href="${up}assets/${file}?v=${assetVersion(file)}">\n`
  : `<script src="${up}assets/${file}?v=${assetVersion(file)}" defer></script>\n`;

const HOST_FILES = ['flashcards.css', 'live.css', 'royale.css', 'editor.js', 'vendor/qrcode.js', 'live-celebrate.js', 'heroes.js', 'royale-host.js'];
const PLAY_FILES = ['flashcards.css', 'live.css', 'royale.css', 'live-celebrate.js', 'heroes.js', 'royale-play.js'];

export function renderRoyaleHost(chapters) {
  const depth = 1;
  return head({
    title: `Battle Royale | ${site.title}`,
    description: 'Host Battle Royale: students face off one on one with superhero avatars.',
    unitId: null,
    depth,
    extraHead: HOST_FILES.map((f) => tag('../', f)).join('')
  }) + topbar(depth, null) + drawer(depth, chapters, null, null) + HOST + footer(depth);
}

export function renderRoyalePlay(chapters) {
  const depth = 2;
  return head({
    title: `Battle Royale | ${site.title}`,
    description: 'Play Battle Royale with the code on the board.',
    unitId: null,
    depth,
    extraHead: PLAY_FILES.map((f) => tag('../../', f)).join('')
  }) + topbar(depth, null) + drawer(depth, chapters, null, null) + PLAY + footer(depth);
}

const HOST = `<main id="main" class="container lv-page rb-page rb-host">

<section class="lv-step" id="rbGate">
<h1>Battle Royale</h1>
<p class="lv-lede" id="rbGateText">Checking the site...</p>
<div id="rbSignIn"></div>
</section>

<section class="lv-step" id="rbSetup" hidden>
<div class="rb-hero-head">
<div class="rb-hero-strip" id="rbStrip" aria-hidden="true"></div>
<h1>Battle Royale</h1>
<p class="lv-lede">Everyone starts with the same HP (health points). Each round, students face random classmates on the same question. The fastest right answer wins; a wrong or slower answer costs 1 HP. The last hero standing wins.</p>
</div>
<div class="lv-resume" id="rbResume" hidden><span id="rbResumeText"></span> <button type="button" class="btn fc-small" id="rbResumeBtn">Go back to it</button></div>

<fieldset class="lv-group rb-box"><legend class="lv-q">Questions</legend>
<div class="rb-source">
<label class="rb-radio"><input type="radio" name="rbSource" value="qset" checked> A question set</label>
<label class="rb-radio"><input type="radio" name="rbSource" value="flash"> A flashcard set</label>
</div>
<div class="rb-pick" id="rbQsetRow">
<select id="rbQset" aria-label="Question set"></select>
<button type="button" class="btn secondary fc-small" id="rbQsetNew">New set</button>
<button type="button" class="btn secondary fc-small" id="rbQsetEdit">Edit</button>
<button type="button" class="btn secondary fc-small rb-danger" id="rbQsetDelete">Delete</button>
</div>
<p class="lv-small" id="rbQsetNote"></p>
<div class="rb-pick" id="rbFlashRow" hidden>
<select id="rbFlash" aria-label="Flashcard set"></select>
</div>
<p class="lv-small" id="rbFlashNote" hidden>Students see each definition and pick its term. The wrong answers are other terms from the set.</p>
</fieldset>

<section class="rb-editor rb-box" id="rbEditor" hidden aria-labelledby="rbEditorTitle">
<h2 id="rbEditorTitle">New question set</h2>
<label class="lv-field"><span class="lv-q">Name</span><input type="text" id="rbEdName" maxlength="120" placeholder="Mass, Acceleration, and Collisions"></label>
<div class="rb-howto">
<p><strong>Import from a link:</strong> paste the link to a Wayground quiz or a Google Sheet, then click Import.</p>
<p class="lv-small">Start a sheet from the template: <a id="rbTemplate" href="#" target="_blank" rel="noopener">make a copy in Google Sheets</a> (or <a href="../assets/question-template.xlsx" download>download it for Excel</a>). It has a picture column for the question and for every answer: paste a picture link there (a Google Drive link works). Surge Showdown uses the same template. A Wayground or Blooket spreadsheet works too.</p>
</div>
<div class="rb-link-import">
<input type="url" id="rbEdLink" placeholder="https://wayground.com/... or https://docs.google.com/spreadsheets/..." aria-label="Wayground or Google Sheets link">
<button type="button" class="btn fc-small" id="rbEdImport">Import</button>
</div>
<div class="rb-import-help" id="rbImportHelp" hidden></div>
<p class="lv-small"><strong>Or paste rows</strong> straight from a sheet (select them, Ctrl+C, then Ctrl+V in the box), one question per line.</p>
<textarea id="rbEdText" rows="10" spellcheck="false" placeholder="What is the unit of force?&#9;Newton&#9;Joule&#9;Watt&#9;Meter"></textarea>
<div class="rb-ed-tools">
<label class="btn secondary fc-small rb-file">Open a file (.csv or .tsv)<input type="file" id="rbEdFile" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden></label>
<span class="lv-small" id="rbEdCount" role="status"></span>
</div>
<div class="rb-preview" id="rbEdPreview"></div>
<p class="lv-error" id="rbEdError" role="alert"></p>
<div class="rb-ed-actions">
<button type="button" class="btn" id="rbEdSave">Save set</button>
<button type="button" class="btn secondary" id="rbEdCancel">Cancel</button>
</div>
</section>

<fieldset class="lv-group rb-box"><legend class="lv-q">How to play</legend>
<div class="rb-opts">
<label class="lv-opt"><span><strong>Starting HP</strong><span class="lv-opt-note">Health points: how many face-offs a student can lose before they are eliminated. More HP, longer games.</span></span>
<select id="rbEnergy"><option value="1">1 HP</option><option value="2">2 HP</option><option value="3" selected>3 HP</option><option value="4">4 HP</option><option value="5">5 HP</option><option value="6">6 HP</option><option value="7">7 HP</option><option value="8">8 HP</option><option value="9">9 HP</option><option value="10">10 HP</option></select></label>
<label class="lv-opt"><span><strong>Students per face-off</strong><span class="lv-opt-note">The fastest right answer in each group wins and everyone else in it loses 1 HP, so bigger groups make shorter games. You can change it any time during the game.</span></span>
<select id="rbSize"><option value="2" selected>2 (one on one)</option><option value="3">3 players</option><option value="4">4 players</option><option value="5">5 players</option></select></label>
<label class="lv-opt"><span><strong>Time per question</strong><span class="lv-opt-note">The round ends sooner once everyone has answered.</span></span>
<select id="rbSeconds"><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="20" selected>20 seconds</option><option value="30">30 seconds</option><option value="45">45 seconds</option><option value="60">1 minute</option></select></label>
<label class="lv-opt"><span><strong>Game clock</strong><span class="lv-opt-note">When it runs out, the round being played finishes and the most energy wins. You can add, change or remove the clock any time during the game too.</span></span>
<select id="rbClock"><option value="0" selected>No clock</option><option value="1">1 minute</option><option value="2">2 minutes</option><option value="3">3 minutes</option><option value="4">4 minutes</option><option value="5">5 minutes</option><option value="7">7 minutes</option><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option></select></label>
<label class="lv-opt fc-switch"><span><strong>Revives</strong><span class="lv-opt-note">A student who is eliminated and gets 3 practice questions right in a row is revived with 1 HP, once a game.</span></span><input type="checkbox" id="rbComeback" checked></label>
<label class="lv-opt fc-switch"><span><strong>Shield streaks</strong><span class="lv-opt-note">Winning 3 face-offs in a row earns a shield. It blocks the next HP that student would lose.</span></span><input type="checkbox" id="rbShield" checked></label>
<label class="lv-opt fc-switch"><span><strong>Students sign in with Class Pass</strong><span class="lv-opt-note">Their name comes from your class list and wins go on the leaderboard. Turn off only if Class Pass is not working.</span></span><input type="checkbox" id="rbPass" checked></label>
<div class="lv-opt"><span><strong>Lobby music</strong><span class="lv-opt-note">Plays on this screen only while students join.</span></span>
<span class="lv-music-ctl"><select id="rbLobbyMusic" aria-label="Lobby music"></select></span></div>
<div class="lv-opt"><span><strong>Game music</strong><span class="lv-opt-note">Plays on this screen only during the game.</span></span>
<span class="lv-music-ctl"><select id="rbGameMusic" aria-label="Game music"></select></span></div>
</div>
</fieldset>
<label class="lv-default lv-demo-pick"><input type="checkbox" id="rbDemo"> <span><strong>Demo mode: 40 pretend students</strong> <span class="lv-opt-note">Try the game on your own. Pretend students join, pick heroes and play. Real students can still join with the code.</span></span></label>
<label class="lv-default"><input type="checkbox" id="rbSaveDefault"> <span><strong>Save these as my default settings</strong> <span class="lv-opt-note">Next time, this page starts with the same questions, choices and music.</span></span></label>
<p class="lv-error" id="rbSetupError" role="alert"></p>
<button type="button" class="btn lv-big" id="rbCreate">Create game</button>
</section>

<section class="lv-step" id="rbLobby" hidden>
<div class="lv-joinbox">
<div class="lv-join-text">
<p class="lv-join-step">Go to <strong class="rb-join-url"></strong></p>
<p class="lv-join-step">Enter this code:</p>
<p class="lv-code" id="rbCode"></p>
<div class="lv-invite">
<button type="button" class="btn lv-invite-btn" id="rbCopy">Copy join link</button>
<a class="btn lv-invite-btn lv-classroom" href="https://classroom.google.com/" target="_blank" rel="noopener">Post to Google Classroom</a>
</div>
</div>
<div class="lv-qr-side">
<div class="lv-qr" id="rbQr" aria-label="QR code that opens the join page with this code"></div>
<p class="lv-join-or">Scan the QR code with a camera to join.</p>
</div>
</div>
<div class="lv-lobby-bar">
<p class="lv-count" id="rbCount" aria-live="polite">Waiting for students to join...</p>
<div class="lv-lobby-actions">
<button type="button" class="btn secondary lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="btn secondary lv-close" data-close>End game</button>
<button type="button" class="btn lv-big" id="rbStart">Start game</button>
</div>
</div>
<div class="rb-lobby-opts" id="rbLobbyOpts"></div>
<ul class="rb-players" id="rbPlayers"></ul>
</section>

<section class="lv-step rb-arena" id="rbPlay" hidden>
<header class="rb-play-head">
<div class="rb-ph-left">
<h2 id="rbRound">Round 1</h2>
<p class="rb-ph-sub"><span id="rbLeft"></span><span class="lv-ph-code">Join code <strong class="rb-mini-code"></strong></span></p>
</div>
<div class="rb-ph-mid" id="rbClockBox">
<button type="button" class="lv-clock-btn" id="rbMinus" title="Take a minute off the clock" aria-label="Take a minute off the clock">&minus; 1:00</button>
<div class="lv-big-clock rb-clock" id="rbClock2" role="timer" aria-live="off"></div>
<button type="button" class="lv-clock-btn" id="rbPlus" title="Add a minute to the clock" aria-label="Add a minute to the clock">+ 1:00</button>
<label class="rb-clock-set"><span class="rb-sr">Set the game clock</span><select id="rbClockSet" aria-label="Set the game clock"></select></label>
<label class="rb-size-now">Face-offs <select id="rbSizeNow" aria-label="Students per face-off, from the next round"><option value="2">2 (one on one)</option><option value="3">3 players</option><option value="4">4 players</option><option value="5">5 players</option></select></label>
</div>
<div class="rb-ph-right">
<button type="button" class="lv-tool" id="rbPause">Pause</button>
<button type="button" class="lv-tool" id="rbSkip" title="Don't wait: go on to the next part now">Skip ahead</button>
<button type="button" class="lv-tool" id="rbRosterBtn" aria-expanded="false" aria-controls="rbRoster"><span aria-hidden="true">👥</span> Players</button>
<button type="button" class="lv-tool lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="lv-tool lv-tool-end" id="rbEnd">End game</button>
</div>
</header>
<div class="rb-banner" id="rbBanner" hidden role="status"></div>
<div class="rb-play-grid">
<aside class="rb-spot" id="rbSpot" aria-label="Highlights from the last round"></aside>
<div class="rb-stage" id="rbStage"></div>
</div>
</section>

<div class="lv-roster-back" id="rbRosterBack" hidden></div>
<aside class="lv-roster" id="rbRoster" hidden aria-label="Players">
<div class="lv-roster-head"><h2>Players</h2><button type="button" class="lv-roster-close" id="rbRosterClose" aria-label="Close the player list">✖</button></div>
<p class="lv-small">Take a student out of the game if they should not be playing. Removing and blocking keeps that device out of this game.</p>
<div id="rbRosterBody"></div>
</aside>

<section class="lv-step rb-arena" id="rbDone" hidden>
<h2 class="lv-done-title">Winners</h2>
<ol class="rb-podium" id="rbPodium"></ol>
<div class="rb-done-grid">
<section class="rb-standings-box"><h3>Final standings</h3><ol class="rb-final" id="rbFinal"></ol></section>
<section class="rb-missed-box" id="rbMissedBox" hidden><h3>Most missed questions</h3><ol class="rb-missed" id="rbMissed"></ol></section>
</div>
<div class="lv-lobby-actions lv-done-actions">
<button type="button" class="btn secondary lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="btn lv-big" id="rbAgain">Play again with the same players</button>
<button type="button" class="btn secondary" id="rbDownload" title="Every student's answer to every question, for Google Sheets or Excel">Download results</button>
<button type="button" class="btn secondary" id="rbNew">New game</button>
</div>
</section>

<div class="rb-music" id="rbMusic" hidden>
<span class="lv-music-label" id="rbMusicLabel">Music</span>
<button type="button" class="lv-music-btn" id="rbMute" aria-pressed="false">Mute</button>
<input type="range" id="rbVolume" min="0" max="100" value="60" aria-label="Music volume" title="Volume">
</div>
<p class="lv-toast" id="rbToast" role="status" aria-live="polite"></p>
<p class="lv-status" id="rbStatus" role="status" aria-live="polite"></p>
</main>`;

const PLAY = `<main id="main" class="container lv-page rb-page rb-play">

<section class="lv-step lv-card" id="rpCode" hidden>
<h1>Battle Royale</h1>
<form id="rpCodeForm" class="lv-form">
<label class="lv-q" for="rpCodeInput">Enter the join code</label>
<input id="rpCodeInput" class="lv-code-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6">
<button type="submit" class="btn lv-big">Continue</button>
</form>
<p class="lv-error" id="rpCodeError" role="alert"></p>
</section>

<section class="lv-step lv-card" id="rpPass" hidden>
<h1>Battle Royale</h1>
<p class="lv-lede">Sign in with Class Pass to play. Your name comes from your class list, and your wins go on the class leaderboard.</p>
<button type="button" class="btn lv-big" id="rpPassBtn">Sign in with Class Pass</button>
<p class="lv-error" id="rpPassError" role="alert"></p>
</section>

<section class="lv-step" id="rpLobby" hidden>
<div class="rp-me-card">
<div class="rp-me-hero" id="rpMeHero"></div>
<div class="rp-me-text">
<p class="lv-eyebrow">You are in</p>
<p class="rp-me-name" id="rpMeName"></p>
<p class="rp-energy" id="rpMeEnergy"></p>
<p class="lv-small" id="rpWaitText">Pick your hero. Your teacher will start the game soon.</p>
</div>
</div>
<div class="rp-picker" id="rpPicker">
<h2 class="rp-pick-title">Pick your hero</h2>
<p class="rp-pick-msg" id="rpPickMsg" role="status"></p>
<div class="rp-grid" id="rpGrid"></div>
</div>
</section>

<section class="lv-step rp-screen" id="rpVs" hidden>
<p class="rp-round" id="rpVsRound"></p>
<div class="rp-vs">
<div class="rp-side rp-side-me" id="rpVsMe"></div>
<div class="rp-vs-word" aria-hidden="true">VS</div>
<div class="rp-side rp-side-them" id="rpVsThem"></div>
</div>
<p class="rp-vs-note" id="rpVsNote"></p>
</section>

<section class="lv-step rp-screen" id="rpQ" hidden>
<div class="rp-qbar">
<span class="rp-tag" id="rpQTag"></span>
<span class="rp-energy" id="rpQEnergy"></span>
<span class="rp-timer" id="rpTimer" aria-label="Time left"></span>
</div>
<div class="rp-question">
<p class="rp-qtext" id="rpQText"></p>
<img class="rp-qimg" id="rpQImg" alt="" hidden>
</div>
<div class="rp-answers" id="rpAnswers"></div>
<div class="rp-sent" id="rpSent" hidden><strong>Answer sent!</strong><span id="rpSentNote">Waiting for the others...</span></div>
</section>

<section class="lv-step rp-screen" id="rpResult" hidden>
<div class="rp-banner" id="rpBanner"></div>
<div class="rp-result-vs" id="rpResultVs"></div>
<p class="rp-answer-was" id="rpAnswerWas"></p>
<p class="rp-energy rp-energy-big" id="rpResultEnergy"></p>
<p class="lv-small" id="rpResultNote"></p>
</section>

<section class="lv-step lv-card" id="rpPaused" hidden>
<p class="lv-done-emoji" aria-hidden="true">⏸️</p>
<p class="lv-me">Your teacher paused the game.</p>
<p class="lv-lede">Look up at the board.</p>
</section>

<section class="lv-step lv-card rp-done" id="rpDone" hidden>
<div class="rp-done-hero" id="rpDoneHero"></div>
<p class="lv-me" id="rpDoneText"></p>
<ol class="rb-podium rp-mini-podium" id="rpPodium" aria-label="Winners"></ol>
<p class="lv-lede" id="rpDoneMore"></p>
</section>

<section class="lv-step lv-card" id="rpGone" hidden>
<p class="lv-me" id="rpGoneText"></p>
<a class="btn" href="../../join/">Join a game</a>
</section>

<div class="lv-toast" id="rpToast" role="status" aria-live="polite"></div>
<p class="lv-status" id="rpStatus" role="status" aria-live="polite"></p>
</main>`;
