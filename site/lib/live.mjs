// The live game pages: the teacher's host screen (live/) and the students'
// join screen (join/). Both are shells; assets/live-host.js and
// assets/live-join.js draw each step of the game as it arrives from the
// game server (textbook/live-worker).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { site } from '../content/site.mjs';
import { esc, head, topbar, drawer, footer } from './render.mjs';
import { setTerms, TILE } from './flashcards.mjs';

// "../assets/<file>?v=<first 8 of its hash>": a changed file gets a new
// address, so a browser never keeps using an old copy after an update.
const asset = (file) => {
  const path = new URL('../public/assets/' + file, import.meta.url);
  return '../assets/' + file + '?v=' + createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
};

const safeJSON = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function choiceCard(group, value, title, text, picture, checked) {
  return `<label class="lv-choice"><input type="radio" name="${group}" value="${value}"${checked ? ' checked' : ''}>
<span class="lv-choice-art" aria-hidden="true">${picture}</span>
<span class="lv-choice-title">${title}</span>
<span class="lv-choice-text">${text}</span>
</label>`;
}

// Two tone pictures on the choice cards, matching the set page tiles: a
// strong shape (.a) over a soft one (.b), with white details (.w).
const ART = {
  teams: '<svg viewBox="0 0 64 40"><circle class="b" cx="17" cy="12" r="6"/><path class="b" d="M6 36c0-7 5-12 11-12s11 5 11 12z"/><circle class="b" cx="47" cy="12" r="6"/><path class="b" d="M36 36c0-7 5-12 11-12s11 5 11 12z"/><circle class="a" cx="32" cy="14" r="7"/><path class="a" d="M19 39c0-8 6-13 13-13s13 5 13 13z"/></svg>',
  pick: '<svg viewBox="0 0 64 40"><rect class="b" x="4" y="6" width="24" height="28" rx="5"/><rect class="b" x="36" y="6" width="24" height="28" rx="5"/><circle class="a" cx="48" cy="16" r="5"/><path class="a" d="M40 31c0-5 3.6-8 8-8s8 3 8 8z"/><path class="a" d="M24 22h10l-3.5-3.5M34 22l-3.5 3.5" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  solo: '<svg viewBox="0 0 64 40"><circle class="b" cx="32" cy="21" r="18"/><circle class="a" cx="32" cy="15" r="6.5"/><path class="a" d="M20 35c0-7 5-12 12-12s12 5 12 12z"/></svg>',
  defFirst: '<svg viewBox="0 0 64 40"><rect class="a" x="8" y="2" width="48" height="15" rx="4"/><rect class="w" x="14" y="7.5" width="26" height="4" rx="2"/><rect class="b" x="8" y="21" width="22" height="7.5" rx="3"/><rect class="b" x="34" y="21" width="22" height="7.5" rx="3"/><rect class="b" x="8" y="31" width="22" height="7.5" rx="3"/><rect class="b" x="34" y="31" width="22" height="7.5" rx="3"/></svg>',
  termFirst: '<svg viewBox="0 0 64 40"><rect class="a" x="20" y="2" width="24" height="10" rx="4"/><rect class="b" x="6" y="16" width="52" height="10" rx="3"/><rect class="w" x="11" y="19.5" width="30" height="3" rx="1.5"/><rect class="b" x="6" y="29" width="52" height="10" rx="3"/><rect class="w" x="11" y="32.5" width="22" height="3" rx="1.5"/></svg>',
  random: '<svg viewBox="0 0 64 40"><path class="b" d="M49 4l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM13 24l1.5 3.5L18 29l-3.5 1.5L13 34l-1.5-3.5L8 29l3.5-1.5z"/><rect class="a" x="20" y="6" width="26" height="28" rx="6" transform="rotate(-8 33 20)"/><circle class="w" cx="27" cy="14" r="2.6"/><circle class="w" cx="33" cy="20" r="2.6"/><circle class="w" cx="39" cy="26" r="2.6"/></svg>',
  typed: '<svg viewBox="0 0 64 40"><rect class="b" x="6" y="9" width="52" height="22" rx="6"/><rect class="a" x="13" y="16" width="8" height="8" rx="2"/><rect class="a" x="24" y="16" width="8" height="8" rx="2"/><rect class="a" x="44" y="13" width="3" height="14" rx="1.5"/></svg>',
  volley: TILE.volley,
  blast: TILE.blast,
  match: TILE.mmatch
};

// The music bar's mute button picture (a speaker).
const MUSIC_ICON = {
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};

export function renderLiveHost(chapters, units, sets) {
  const depth = 1;
  const list = [];
  chapters.forEach((c) => {
    if (!sets[c.id]) return;
    const u = units.find((x) => x.id === c.unit);
    list.push({ id: c.id, title: c.title, where: `Unit ${u.number}, Chapter ${c.number}`, count: setTerms(c, sets[c.id]).length });
  });
  return head({
    title: `Host a Game | ${site.title}`,
    description: 'Host Vocab Live, Blast or Match for the class with any flashcard set.',
    unitId: null,
    depth,
    extraHead: `<link rel="stylesheet" href="${asset('flashcards.css')}">\n<link rel="stylesheet" href="${asset('live.css')}">\n<script src="${asset('editor.js')}" defer></script>\n<script src="${asset('vendor/qrcode.js')}" defer></script>\n<script src="${asset('live-celebrate.js')}" defer></script>\n<script src="${asset('live-host.js')}" defer></script>\n`
  }) +
    topbar(depth, null) +
    drawer(depth, chapters, null, null) +
    `<main id="main" class="container lv-page lv-host">

<section class="lv-step" id="lvGate">
<h1>Host a game</h1>
<p class="lv-lede" id="lvGateText">Checking the site...</p>
<div id="lvSignIn"></div>
</section>

<section class="lv-step" id="lvSetup" hidden>
<div class="lv-setup-head">
<h1>Host a game</h1>
<p class="lv-lede">Pick a game, a set and how to play. Players join on their own screens with a code.</p>
</div>
<div class="lv-resume" id="lvResume" hidden><span id="lvResumeText"></span> <button type="button" class="btn fc-small" id="lvResumeBtn">Go back to it</button></div>
<p class="lv-note" id="lvSetupNote" role="status"></p>
<label class="lv-field"><span class="lv-q">Flashcard set</span>
<select id="lvSet">${list.map((s) => `<option value="${esc(s.id)}">${esc(s.where)}: ${esc(s.title)} (${s.count} terms)</option>`).join('')}</select></label>

<fieldset class="lv-group"><legend class="lv-q">Which game?</legend>
<div class="lv-choices lv-choices-3">
${choiceCard('lvGame', 'volley', 'Vocab Live', 'Teams race to answer in a row. Each teammate holds some of the answers.', ART.volley, true)}
${choiceCard('lvGame', 'blast', 'Blast', 'Teams of up to 4 blast the asteroid with the right term before time runs out.', ART.blast, false)}
${choiceCard('lvGame', 'match', 'Match', 'Everyone races to match every term to its definition. First done wins.', ART.match, false)}
</div></fieldset>

<fieldset class="lv-group" data-for="volley"><legend class="lv-q">How would you like your teams arranged?</legend>
<div class="lv-choices lv-choices-3">
${choiceCard('lvTeams', 'teams', 'Random teams', 'Students are put into teams at random. Each teammate holds some of the answers, so they have to talk.', ART.teams, true)}
${choiceCard('lvTeams', 'pick', 'Students pick teams', 'You choose how many teams. Students tap one and can switch until your countdown locks them in.', ART.pick, false)}
${choiceCard('lvTeams', 'solo', 'Individuals', 'Every student plays on their own.', ART.solo, false)}
</div></fieldset>

<fieldset class="lv-group" data-for="volley"><legend class="lv-q">How would you like to play?</legend>
<div class="lv-choices">
${choiceCard('lvPrompt', 'def', 'Definition, then term', 'Students see the definition and pick the term.', ART.defFirst, true)}
${choiceCard('lvPrompt', 'term', 'Term, then definition', 'Students see the term and pick the definition.', ART.termFirst, false)}
</div></fieldset>

<fieldset class="lv-group"><legend class="lv-q">What names do students play under?</legend>
<div class="lv-choices">
${choiceCard('lvWho', 'random', 'Random fun names', 'Each student gets a name like Speedy Otter. Nothing to type.', ART.random, true)}
${choiceCard('lvWho', 'typed', 'Students type their name', 'First name and last initial only, checked for rude words. You can remove anyone or swap their name.', ART.typed, false)}
</div></fieldset>

<div class="lv-more">
<label class="lv-opt" data-for="blast"><span><strong>Time</strong><span class="lv-opt-note">The team with the most right answers when time runs out wins.</span></span>
<span class="lv-minutes"><input type="number" id="lvMinutes" min="1" max="30" step="1" value="5" inputmode="numeric"> minutes</span></label>
<label class="lv-opt" data-for="match"><span><strong>Pairs to match</strong><span class="lv-opt-note">Everyone gets the same cards.</span></span>
<select id="lvPairs"><option value="4">4 pairs</option><option value="6" selected>6 pairs</option><option value="8">8 pairs</option></select></label>
<label class="lv-opt fc-switch" data-for="match"><span><strong>Hidden cards</strong><span class="lv-opt-note">Memory mode: cards start face down, so players remember where each one is.</span></span><input type="checkbox" id="lvHidden"></label>
<label class="lv-opt fc-switch"><span><strong>Drawing pad while waiting</strong><span class="lv-opt-note">Students can draw on their screen while the class joins. Drawings stay on their device.</span></span><input type="checkbox" id="lvDoodle" checked></label>
<label class="lv-opt fc-switch" data-for="volley blast"><span><strong>Power-ups</strong><span class="lv-opt-note">Every 3 right answers in a row win a mystery power-up. In Vocab Live the team votes to use it; in Blast anyone on the team can use it at once.</span></span><input type="checkbox" id="lvPowers"></label>
<div class="lv-pw-kinds" data-for="volley blast" id="lvPwKinds"><p class="lv-pw-head">Power-ups in this game <span>Untick any you do not want.</span></p><div class="lv-pw-grid"><label class="lv-pw-card"><input type="checkbox" id="lvPw-shield" data-power="shield" checked><span class="lv-pw-icon" aria-hidden="true">🛡️</span><span class="lv-pw-text"><strong>Shield</strong><span>Blocks the next attack on the team for 30 seconds.</span></span></label><label class="lv-pw-card"><input type="checkbox" id="lvPw-strike" data-power="strike" checked><span class="lv-pw-icon" aria-hidden="true">⚡</span><span class="lv-pw-text"><strong>Strike</strong><span>Knocks another team down 1 rung. It can go below zero.</span></span></label><label class="lv-pw-card"><input type="checkbox" id="lvPw-freeze" data-power="freeze" checked><span class="lv-pw-icon" aria-hidden="true">🧊</span><span class="lv-pw-text"><strong>Freeze</strong><span>Another team cannot answer for 5 seconds.</span></span></label><label class="lv-pw-card"><input type="checkbox" id="lvPw-glitch" data-power="glitch" checked><span class="lv-pw-icon" aria-hidden="true">📺</span><span class="lv-pw-text"><strong>Glitch</strong><span>Another team’s answers blur and wobble for 8 seconds.</span></span></label><label class="lv-pw-card" data-for="volley"><input type="checkbox" id="lvPw-swap" data-power="swap" checked><span class="lv-pw-icon" aria-hidden="true">🔄</span><span class="lv-pw-text"><strong>Swap</strong><span>Trade places with a team ahead. Then the team waits 5 seconds.</span></span></label><label class="lv-pw-card"><input type="checkbox" id="lvPw-double" data-power="double" checked><span class="lv-pw-icon" aria-hidden="true">2×</span><span class="lv-pw-text"><strong>Double Up</strong><span>The next 2 right answers count as 2 each.</span></span></label><label class="lv-pw-card"><input type="checkbox" id="lvPw-fifty" data-power="fifty" checked><span class="lv-pw-icon" aria-hidden="true">✂️</span><span class="lv-pw-text"><strong>50/50</strong><span>Hides half of the wrong answers on this question.</span></span></label><label class="lv-pw-card"><input type="checkbox" id="lvPw-mirror" data-power="mirror" checked><span class="lv-pw-icon" aria-hidden="true">🪞</span><span class="lv-pw-text"><strong>Mirror</strong><span>Sends the next attack back to whoever sent it, for 30 seconds.</span></span></label></div></div>
<label class="lv-opt fc-switch" data-for="volley"><span><strong>Fast mode</strong><span class="lv-opt-note">A wrong answer does not send the team back to zero.</span></span><input type="checkbox" id="lvFast"></label>
<label class="lv-opt" data-for="volley"><span><strong>Pause after a wrong answer</strong><span class="lv-opt-note">How long the right answer stays up. Students can press Continue sooner.</span></span>
<select id="lvPause"><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10" selected>10 seconds</option><option value="15">15 seconds</option></select></label>
<label class="lv-opt" data-for="volley"><span><strong>Time limit</strong><span class="lv-opt-note">When time runs out, the podium goes by the scores then. You can add or take away time during the game.</span></span>
<select id="lvLimit"><option value="0" selected>No time limit</option>${[2, 3, 5, 7, 10, 15, 20, 30].map((n) => `<option value="${n}">${n} minutes</option>`).join('')}</select></label>
<label class="lv-opt" data-for="volley"><span><strong>Questions to win</strong><span class="lv-opt-note">Right answers in a row a team needs.</span></span>
<select id="lvTarget"><option>6</option><option>8</option><option>10</option><option selected>12</option><option>15</option><option>20</option></select></label>
<label class="lv-opt" data-for="volley"><span><strong>Number of winners</strong><span class="lv-opt-note">The game ends when this many teams finish.</span></span>
<select id="lvWinners"><option selected>1</option><option>2</option><option>3</option></select></label>
<label class="lv-opt" id="lvPickRow" hidden><span><strong>Number of teams</strong><span class="lv-opt-note">Students pick from these. A team is full at one more than an even share.</span></span>
<select id="lvPickTeams">${[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option${n === 4 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
<label class="lv-opt" id="lvSizeRow"><span><strong>Players per team</strong><span class="lv-opt-note">Up to six in Vocab Live, four in Blast.</span></span>
<select id="lvSize"><option>2</option><option selected>3</option><option>4</option><option>5</option><option>6</option></select></label>
<div class="lv-opt"><span><strong>Lobby music</strong><span class="lv-opt-note">Plays on this screen only while students join. It stops when the game starts.</span></span>
<span class="lv-music-ctl"><span class="lv-music-pick"><select id="lvMusicPick" aria-label="Lobby music"></select><button type="button" class="btn secondary fc-small" id="lvMusicTry">Listen</button></span>
<span class="lv-vol-row"><button type="button" class="lv-mute" id="lvLobbyMute" aria-pressed="false" title="Mute the lobby music" aria-label="Mute the lobby music">${MUSIC_ICON.sound}</button><input type="range" class="lv-volume" id="lvLobbyVolume" min="0" max="100" value="60" aria-label="Lobby music volume" title="Lobby music volume"></span></span></div>
<div class="lv-opt"><span><strong>Game music</strong><span class="lv-opt-note">Plays on this screen only while the game is on. Mute it or change it any time during the game.</span></span>
<span class="lv-music-ctl"><span class="lv-music-pick"><select id="lvGameMusicPick" aria-label="Game music"></select><button type="button" class="btn secondary fc-small" id="lvGameMusicTry">Listen</button></span>
<span class="lv-vol-row"><button type="button" class="lv-mute" id="lvGameMute" aria-pressed="false" title="Mute the game music" aria-label="Mute the game music">${MUSIC_ICON.sound}</button><input type="range" class="lv-volume" id="lvGameVolume" min="0" max="100" value="60" aria-label="Game music volume" title="Game music volume"></span></span></div>
</div>
<label class="lv-default lv-demo-pick"><input type="checkbox" id="lvDemo"> <span><strong>Demo mode: 40 pretend students</strong> <span class="lv-opt-note">Try the game on your own. Pretend students join using your settings, play, and get some answers right and some wrong. Real students can still join with the code.</span></span></label>
<label class="lv-default"><input type="checkbox" id="lvSaveDefault"> <span><strong>Save these as my default settings</strong> <span class="lv-opt-note">Next time, this page starts with the same game, set, choices and music.</span></span></label>
<p class="lv-error" id="lvSetupError" role="alert"></p>
<button type="button" class="btn lv-big" id="lvCreate">Create game</button>
</section>

<div class="lv-demo-banner" id="lvDemoBanner" hidden>
<span class="lv-demo-text"><strong>Demo mode.</strong> <span id="lvDemoText">Pretend students are joining.</span></span>
<button type="button" class="btn lv-demo-win" id="lvDemoWin" hidden>MAKE A TEAM WIN TO END GAME</button>
</div>

<section class="lv-step" id="lvLobby" hidden>
<div class="lv-joinbox">
<div class="lv-join-text">
<p class="lv-join-step">Go to <strong id="lvJoinUrl"></strong></p>
<p class="lv-join-step">Enter this code:</p>
<p class="lv-code" id="lvCode"></p>
<div class="lv-invite">
<button type="button" class="btn lv-invite-btn" id="lvCopy">Copy join link</button>
<a class="btn lv-invite-btn lv-classroom" id="lvClassroom" href="https://classroom.google.com/" target="_blank" rel="noopener">Post to Google Classroom</a>
</div>
</div>
<div class="lv-qr-side" id="lvQrSide">
<div class="lv-qr" id="lvQr" aria-label="QR code that opens the join page with this code"></div>
<p class="lv-join-or">Scan the QR code with a camera to join.</p>
</div>
</div>
<p class="lv-toast" id="lvToast" role="status" aria-live="polite"></p>
<div class="lv-lobby-bar">
<p class="lv-count" id="lvCount" aria-live="polite">Waiting for students to join...</p>
<div class="lv-lobby-actions">
<button type="button" class="btn secondary" id="lvSettingsBtn" aria-expanded="false" aria-controls="lvSettingsPanel">⚙️ Settings</button>
<button type="button" class="btn secondary lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="btn secondary lv-close" data-close>End game</button>
<button type="button" class="btn lv-big" id="lvMakeTeams">Make teams</button>
<button type="button" class="btn lv-big" id="lvStartSolo">Start game</button>
</div>
</div>
<div class="lv-pick" id="lvPick" hidden>
<div class="lv-pick-bar">
<strong class="lv-pick-label">Students pick their teams</strong>
<label class="lv-pick-secs">Countdown <select id="lvPickSecs"><option value="15">15 seconds</option><option value="30" selected>30 seconds</option><option value="45">45 seconds</option><option value="60">1 minute</option><option value="90">1 minute 30 seconds</option><option value="120">2 minutes</option></select></label>
<button type="button" class="btn" id="lvPickGo">Start the countdown</button>
<button type="button" class="btn secondary" id="lvPickStop" hidden>Stop and let them pick again</button>
</div>
<div class="lv-countdown" id="lvCountdown" hidden><span class="lv-countdown-num" id="lvCountdownNum"></span><span class="lv-countdown-text" id="lvCountdownText"></span></div>
<div class="lv-teams" id="lvPickTeamsBox"></div>
</div>
<ul class="lv-players" id="lvPlayers"></ul>
</section>
<div class="lv-roster-back" id="lvSettingsBack" hidden></div>
<aside class="lv-roster lv-settings-panel" id="lvSettingsPanel" hidden aria-label="Game settings">
<div class="lv-roster-head"><h2>Game settings</h2><button type="button" class="lv-roster-close" id="lvSettingsClose" aria-label="Close the game settings">✖</button></div>
<p class="lv-small">Changes take effect right away, while students are still joining.</p>
<div class="lv-lobby-opts-body" id="lvLobbyOptsBody"></div>
</aside>

<section class="lv-step" id="lvTeamsStep" hidden>
<div class="lv-lobby-bar">
<div><h2>Teams</h2><p class="lv-small">Students joining now go to the smallest team.</p></div>
<div class="lv-lobby-actions">
<button type="button" class="btn secondary lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="btn secondary lv-close" data-close>End game</button>
<button type="button" class="btn secondary" id="lvBack">Back</button>
<button type="button" class="btn secondary" id="lvShuffle">Shuffle teams</button>
<button type="button" class="btn lv-big" id="lvStartTeams">Start game</button>
</div>
</div>
<div class="lv-late-join" aria-label="How to join late">
<span class="lv-late-step">Still joining? Go to <strong class="lv-join-url"></strong></span>
<span class="lv-late-step">and enter <span class="lv-late-code lv-mini-code"></span></span>
</div>
<div class="lv-teams" id="lvTeamList"></div>
</section>

<section class="lv-step" id="lvPlay" hidden>
<header class="lv-play-head">
<div class="lv-ph-left">
<h2 id="lvPlayTitle">Race to the finish</h2>
<p class="lv-ph-sub"><span id="lvPlayGoal"></span><span class="lv-ph-code">Join code <strong class="lv-mini-code"></strong></span></p>
</div>
<div class="lv-ph-mid" id="lvClockBox">
<button type="button" class="lv-clock-btn" id="lvTimeMinus" title="Take a minute off the clock" aria-label="Take a minute off the clock">− 1:00</button>
<div class="lv-big-clock" id="lvBigClock" role="timer" aria-live="off"></div>
<button type="button" class="lv-clock-btn" id="lvTimePlus" title="Add a minute to the clock" aria-label="Add a minute to the clock">+ 1:00</button>
</div>
<div class="lv-ph-right">
<button type="button" class="lv-tool" id="lvRosterBtn" aria-expanded="false" aria-controls="lvRoster" title="See, rename or remove players"><span aria-hidden="true">👥</span> Players</button>
<button type="button" class="lv-tool lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="lv-tool lv-tool-end" id="lvEnd">End game</button>
</div>
</header>
<div class="lv-race-tools">
<span class="lv-toggles">
<label class="lv-toggle fc-switch" id="lvFastRow" title="A wrong answer keeps the team where it is"><input type="checkbox" id="lvFastNow"><span>No going back to 0</span></label>
<label class="lv-toggle fc-switch" title="Everyone else keeps playing, just off the board"><input type="checkbox" id="lvTop5"><span>Top 5 only</span></label>
</span>
</div>
<div class="lv-play-grid">
<ol class="lv-race" id="lvRace"></ol>
<div class="lv-rest" id="lvRest" hidden></div>
</div>
</section>

<div class="lv-roster-back" id="lvRosterBack" hidden></div>
<aside class="lv-roster" id="lvRoster" hidden aria-label="Players">
<div class="lv-roster-head"><h2>Players</h2><button type="button" class="lv-roster-close" id="lvRosterClose" aria-label="Close the player list">✖</button></div>
<p class="lv-small">Give someone a new name, or take them out of the game. Their answers so far stay in the stats.</p>
<div id="lvRosterBody"></div>
</aside>
<section class="lv-step" id="lvDone" hidden>
<h2 class="lv-done-title">Winners</h2>
<ol class="lv-podium" id="lvPodium"></ol>
<div class="lv-crowd" id="lvCrowd" aria-label="The other teams, cheering" hidden></div>
<section class="lv-stats" id="lvStatsBox" aria-labelledby="lvStatsTitle" hidden>
<h3 id="lvStatsTitle">Game stats</h3>
<div class="lv-stat-tiles" id="lvStatTiles"></div>
<div class="lv-missed" id="lvMissedBox">
<h4>Most missed terms</h4>
<table class="lv-missed-table"><thead><tr><th scope="col">Term</th><th scope="col">Definition</th><th scope="col">Missed</th><th scope="col">Right</th></tr></thead><tbody id="lvMissed"></tbody></table>
</div>
<div class="lv-speed" id="lvSpeedBox">
<div class="lv-speed-col"><h4>Fastest terms</h4><p class="lv-small">Average time to a right answer</p><ol class="lv-speed-list" id="lvFastest"></ol></div>
<div class="lv-speed-col"><h4>Slowest terms</h4><p class="lv-small">Worth another look</p><ol class="lv-speed-list" id="lvSlowest"></ol></div>
</div>
</section>
<div class="lv-lobby-actions lv-done-actions">
<button type="button" class="btn secondary lv-fullscreen" data-fullscreen title="Fill the whole screen, for projecting">Full screen</button>
<button type="button" class="btn lv-big" id="lvAgain">Play again with the same players</button>
<button type="button" class="btn secondary" id="lvNew">New game</button>
</div>
</section>

<div class="lv-music" id="lvMusic" hidden>
<span class="lv-music-label" id="lvMusicLabel">Lobby music</span>
<button type="button" class="lv-music-btn" id="lvMusicPlay" aria-label="Mute the music" title="Mute the music" aria-pressed="false">${MUSIC_ICON.sound}</button>
<select id="lvMusicSong" aria-label="Song"></select>
<input type="range" id="lvMusicVolume" min="0" max="100" value="60" aria-label="Music volume" title="Volume">
</div>
<p class="lv-status" id="lvStatus" role="status" aria-live="polite"></p>
<script type="application/json" id="lvSets">${safeJSON(list)}</script>
</main>` +
    footer(depth);
}

export function renderLiveJoin(chapters) {
  const depth = 1;
  return head({
    title: `Join a Game | ${site.title}`,
    description: 'Join a Vocab Live, Blast or Match game with the code on the board.',
    unitId: null,
    depth,
    extraHead: `<link rel="stylesheet" href="${asset('flashcards.css')}">\n<link rel="stylesheet" href="${asset('live.css')}">\n<script src="${asset('live-blast.js')}" defer></script>\n<script src="${asset('live-match.js')}" defer></script>\n<script src="${asset('live-celebrate.js')}" defer></script>\n<script src="${asset('live-doodle.js')}" defer></script>\n<script src="${asset('live-join.js')}" defer></script>\n`
  }) +
    topbar(depth, 'flashcards') +
    drawer(depth, chapters, null, null) +
    `<main id="main" class="container lv-page lv-join">

<section class="lv-step lv-card" id="jnCode">
<h1>Join a game</h1>
<form id="jnCodeForm" class="lv-form">
<label class="lv-q" for="jnCodeInput">Enter the join code</label>
<input id="jnCodeInput" class="lv-code-input" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="6" aria-describedby="jnCodeNote">
<p class="lv-small" id="jnCodeNote">It is the six letters and numbers on the board.</p>
<button type="submit" class="btn lv-big">Continue</button>
</form>
<p class="lv-error" id="jnCodeError" role="alert"></p>
<button type="button" class="linkbtn lv-rejoin" id="jnRejoin" hidden>Rejoin the game I was in</button>
</section>

<section class="lv-step lv-card" id="jnName" hidden>
<p class="lv-eyebrow" id="jnGameTitle"></p>
<form id="jnNameForm" class="lv-form">
<div id="jnTyped" hidden>
<label class="lv-q" for="jnNick">Enter your first name and last initial only.</label>
<input id="jnNick" data-live-nickname class="lv-nick-input" type="text" autocomplete="off" spellcheck="false" maxlength="16">
<p class="lv-small">For example: Maria G.</p>
</div>
<p class="lv-q" id="jnRandom" hidden>You will get a random fun name.</p>
<button type="submit" class="btn lv-big">Join game</button>
</form>
<p class="lv-error" id="jnNameError" role="alert"></p>
</section>

<section class="lv-step lv-card" id="jnWait" hidden>
<p class="lv-eyebrow">You are in</p>
<p class="lv-me" id="jnMe"></p>
<div class="lv-myteam" id="jnTeam" hidden></div>
<div class="lv-pick-join" id="jnPick" hidden>
<div class="lv-countdown" id="jnCountdown" hidden><span class="lv-countdown-num" id="jnCountdownNum"></span><span class="lv-countdown-text" id="jnCountdownText"></span></div>
<p class="lv-pick-title" id="jnPickTitle">Pick your team</p>
<div class="lv-pick-grid" id="jnPickGrid"></div>
<p class="lv-pick-msg" id="jnPickMsg" role="status"></p>
</div>
<p class="lv-lede" id="jnWaitText">Look up at the board. Your teacher will start the game soon.</p>
</section>
<section class="lv-doodle" id="jnDoodle" hidden aria-label="Drawing pad"></section>

<section class="lv-step" id="jnPlay" hidden>
<div class="lv-playbar">
<span class="lv-badge" id="jnBadge"></span>
<span class="lv-progress"><span class="lv-progress-fill" id="jnFill"></span></span>
<span class="lv-progress-num" id="jnNum"></span>
<span class="lv-fire" id="jnFire" hidden></span>
<span class="bl-time lv-clock" id="jnClock" hidden aria-label="Time left"></span>
</div>
<div class="lv-pu" id="jnPu" hidden></div>
<div class="lv-pu-vote" id="jnPuVote" hidden role="status"></div>
<div class="lv-prompt">
<span class="lv-prompt-label" id="jnPromptLabel"></span>
<p class="lv-prompt-text" id="jnPrompt"></p>
<img class="lv-prompt-img" id="jnImg" alt="" hidden>
</div>
<p class="lv-teamnote" id="jnTeamNote"></p>
<div class="lv-options" id="jnOptions"></div>
<div class="lv-feedback" id="jnFeedback" hidden role="status" aria-live="assertive"></div>
<div class="lv-hold" id="jnHold" hidden role="alert"></div>
</section>
<div class="lv-idle" id="jnIdle" hidden role="alertdialog" aria-label="Still there?"><div class="lv-idle-card"><span class="lv-idle-icon" aria-hidden="true">😴</span><strong>Still there?</strong><span>Tap anywhere to keep playing. Your team is carrying on without you.</span></div></div>
<div class="lv-pu-sheet" id="jnPuSheet" hidden></div>
<div class="lv-toast" id="jnToast" role="status" aria-live="polite"></div>

<section class="lv-step lv-blast" id="jnBlast" hidden>
<div class="bl-top">
<span class="lv-badge" id="blTeam"></span>
<span class="bl-score" id="blScore"></span>
<span class="bl-time" id="blTime" aria-label="Time left"></span>
</div>
<div class="lv-pu" id="blPu" hidden></div>
<div class="bl-prompt"><span class="lv-prompt-label">Blast the term for</span><p class="bl-prompt-text" id="blPrompt"></p><img class="lv-prompt-img" id="blImg" alt="" hidden></div>
<div class="bl-field" id="blField">
<svg class="bl-lasers" id="blLasers" aria-hidden="true"></svg>
<div class="bl-rocks" id="blRocks"></div>
<div class="bl-ships" id="blShips"></div>
<div class="lv-hold bl-hold" id="blHold" hidden role="alert"></div>
</div>
<p class="bl-msg" id="blMsg" role="status" aria-live="polite"></p>
<p class="bl-others" id="blOthers"></p>
</section>

<section class="lv-step lv-match" id="jnMatch" hidden>
<div class="mt-top">
<span class="lv-badge" id="mtName"></span>
<span class="mt-found" id="mtFound"></span>
<span class="mt-time" id="mtTime" aria-label="Your time"></span>
</div>
<p class="lv-small mt-help" id="mtHelp"></p>
<p class="mt-msg" id="mtMsg" role="status" aria-live="polite"></p>
<div class="mt-grid" id="mtGrid"></div>
<div class="lv-card mt-done" id="mtDone" hidden>
<p class="lv-done-emoji" aria-hidden="true">&#x1F3C1;</p>
<p class="lv-me" id="mtDoneText"></p>
<p class="lv-lede" id="mtDoneMore"></p>
</div>
</section>

<section class="lv-step lv-card" id="jnDone" hidden>
<p class="lv-done-emoji" id="jnDoneEmoji" aria-hidden="true"></p>
<p class="lv-me" id="jnDoneText"></p>
<ol class="lv-podium lv-mini-podium" id="jnPodium" aria-label="Winners"></ol>
<p class="lv-lede" id="jnDoneMore"></p>
<div class="lv-stats lv-stats-mini" id="jnStats" hidden></div>
</section>

<section class="lv-step lv-card" id="jnGone" hidden>
<p class="lv-me" id="jnGoneText"></p>
<button type="button" class="btn" id="jnGoneBtn">Join a game</button>
</section>

<p class="lv-status" id="jnStatus" role="status" aria-live="polite"></p>
</main>` +
    footer(depth);
}
