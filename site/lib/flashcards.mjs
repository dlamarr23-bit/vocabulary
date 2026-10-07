// The Quizlet style flashcard pages: one page per set, the Flashcards page
// that organizes every set by unit and chapter, and the teacher edit page.
// A set page is a shell. The cards travel as a JSON block and the scripts in
// assets/ draw everything else, because the same cards are shown five ways:
// flashcards, the term list, Learn, Test and Match (and the editor).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { site } from '../content/site.mjs';
import { esc, head, topbar, drawer, footer } from './render.mjs';

// The first 8 characters of a file's hash, added to its address so a browser
// never keeps an old copy after an update.
function fileHash(f) {
  return createHash('sha256').update(readFileSync(new URL('../public/assets/' + f, import.meta.url))).digest('hex').slice(0, 8);
}

// The cards in order: a plain word is looked up in the chapter vocabulary, a
// { term, def, hint } entry stands on its own.
export function setTerms(ch, set) {
  if (!set || !Array.isArray(set.terms)) return ch.vocab;
  return set.terms.map((t) => (typeof t === 'string' ? ch.vocab.find((v) => v.term === t) || { term: t, def: '' } : t));
}

// The set as the page reads it. Picture paths are relative to the page.
export function flashcardData(ch, set, depth, unit) {
  const up = '../'.repeat(depth);
  const images = (set && set.images) || {};
  return {
    id: ch.id,
    title: ch.title,
    where: unit ? `Unit ${unit.number}, Chapter ${ch.number}` : '',
    // Added to picture searches so "variation" finds the biology meaning.
    subject: (unit && unit.subject) || '',
    file: `${ch.slug}-flashcards`,
    cards: setTerms(ch, set).map((v) => {
      const pic = images[v.term];
      return {
        term: v.term,
        def: v.def,
        hint: v.hint || '',
        img: pic ? `${up}assets/flashcards/${ch.id}/${pic.file}` : '',
        alt: pic ? pic.alt : ''
      };
    })
  };
}

// JSON inside a script tag has to be kept from closing the tag early.
const safeJSON = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

// Small line icons, drawn with the current text color.
const ICON = {
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12v7.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>',
  cards: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="12" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v10"/></svg>',
  learn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><path d="M9 12l2 2 4-4"/></svg>',
  test: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/></svg>',
  match: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/><path d="M11 7.5h3a2 2 0 0 1 2 2V13"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fc-ico-play" d="M8 5v14l11-7z"/><path class="fc-ico-pause" d="M8 5v14M16 5v14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  speak: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  cross: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M14 7l3 3"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/></svg>',
  classroom: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="13" rx="2"/><circle cx="12" cy="10" r="2.3"/><path d="M8 17.5c.6-2.2 2.1-3.3 4-3.3s3.4 1.1 4 3.3M9 20.5h6"/></svg>',
  exportIcon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 16v3.5h16V16"/></svg>'
};

// The "Playing a game? Enter the code" box. It is on the Flashcards page and
// on every set page (Gennaro, 2026-09-25: every new set gets one), so
// students can join a game from wherever they are. A plain form to
// join/?code=CODE; live-join.js takes it from there.
function joinBox(up) {
  return `<form class="hero-join" action="${up}join/" method="get">
<label for="volleyCode">Playing a game? Enter the code</label>
<span class="hero-join-row"><input id="volleyCode" name="code" type="text" size="6" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" required><button type="submit" class="btn">Join game</button></span>
</form>`;
}

// Two tone tile icons, like Quizlet's: a strong shape (.a, the unit's accent)
// over a soft one (.b, a light tint of it).
export const TILE = {
  flashcards: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="b" x="10" y="5" width="17" height="14" rx="3"/><rect class="a" x="5" y="11" width="17" height="15" rx="3"/></svg>',
  learn: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="bs" cx="16" cy="16" r="10.5" stroke-dasharray="2.2 3.2"/><path class="as" d="M16 5.5a10.5 10.5 0 0 1 10.5 10.5"/><circle class="a" cx="16" cy="5.5" r="3"/><circle class="a" cx="26.5" cy="16" r="2"/></svg>',
  test: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="b" x="10" y="4" width="16" height="21" rx="3"/><rect class="a" x="6" y="8" width="16" height="21" rx="3"/><rect class="w" x="9.5" y="13" width="9" height="2.4" rx="1.2"/><rect class="w" x="9.5" y="18" width="6" height="2.4" rx="1.2"/></svg>',
  match: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="a" x="4" y="5" width="16" height="11" rx="2.5"/><rect class="w" x="7.5" y="9.3" width="9" height="2.4" rx="1.2"/><rect class="b" x="14" y="17" width="14" height="10" rx="2.5"/><rect class="w" x="17" y="20.8" width="8" height="2.4" rx="1.2"/></svg>',
  volley: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="a" x="5" y="6" width="19" height="4.6" rx="2.3" transform="rotate(-12 14.5 8.3)"/><rect class="b" x="8" y="13.7" width="19" height="4.6" rx="2.3" transform="rotate(-12 17.5 16)"/><rect class="a" x="5" y="21.4" width="19" height="4.6" rx="2.3" transform="rotate(-12 14.5 23.7)"/></svg>',
  blast: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="b" d="M9.5 18.5l-4 2 3.5-7.5 4 1.5zM13.5 22.5l-2 4 7.5-3.5-1.5-4z"/><path class="a" d="M26.5 5.5c-6 0-11 3.5-14.5 9.5l5 5c6-3.5 9.5-8.5 9.5-14.5z"/><circle class="w" cx="20" cy="12" r="2.6"/><path class="bs" d="M9 23l-3 3"/></svg>',
  mmatch: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect class="a" x="4" y="4" width="15" height="17" rx="3"/><rect class="w" x="7.5" y="8.5" width="8" height="2.4" rx="1.2"/><rect class="w" x="7.5" y="13" width="5" height="2.4" rx="1.2"/><rect class="b" x="17" y="14" width="11" height="14" rx="3"/><path class="w" d="M21.5 17.5l3 3-3 3"/></svg>'
};

// Games played together live (textbook/live-worker): anyone can host one
// with this set; the others join with the code.
const GAMES = [
  ['volley', 'Vocab Live', TILE.volley],
  ['blast', 'Blast', TILE.blast],
  ['match', 'Multiplayer Match', TILE.mmatch]
];

const MODES = [
  ['flashcards', 'Flashcards', TILE.flashcards],
  ['learn', 'Learn', TILE.learn],
  ['match', 'Match', TILE.match],
  ['test', 'Test', TILE.test]
];

export function renderFlashcards(ch, set, chapters, unit) {
  const depth = 3;
  const data = flashcardData(ch, set, depth, unit);
  const n = data.cards.length;
  const up = '../'.repeat(depth);
  return setPage({
    id: ch.id,
    title: `${ch.title} Flashcards | ${site.title}`,
    description: `Study the ${n} key words from ${ch.title} with flashcards, Learn, Test and Match.`,
    unitId: unit.id,
    chapters,
    drawerUnit: unit.id,
    drawerCh: ch.id,
    crumbs: `<a href="${up}flashcards/">Flashcards</a><span aria-hidden="true">&rsaquo;</span><a href="${up}flashcards/#folder-f-${unit.id}">Unit ${unit.number}: ${esc(unit.title)}</a><span aria-hidden="true">&rsaquo;</span><a href="${up}flashcards/#folder-f-${ch.id}">Chapter ${ch.number}: ${esc(ch.title)}</a>`,
    h1: esc(ch.title),
    count: `${n} terms`,
    more: ` &middot; <a href="../">Read the chapter</a>`,
    icon: ch.slug,
    listCount: String(n),
    counter: `1 / ${n}`,
    dataJSON: safeJSON(data),
    own: false
  });
}

// The page for a set Gennaro makes himself (Gennaro, 2026-09-28). There is
// one shell, at flashcards/my/set/; the server fills in the __SET_...__
// marks for each set, under /flashcards/my/<id>/, which is three folders
// deep like a chapter's set, so picture paths work the same way. The server
// also writes the folder trail into a book set's crumbs.
export const OWN = {
  id: '__SET_ID__',
  title: '__SET_TITLE__',
  count: '__SET_COUNT__',
  crumbs: '__SET_CRUMBS__',
  icon: '__SET_ICON__',
  data: '"__SET_DATA__"'
};
export function renderOwnSetShell(chapters) {
  return setPage({
    id: OWN.id,
    title: `${OWN.title} Flashcards | ${site.title}`,
    description: `Study ${OWN.title} with flashcards, Learn, Test and Match.`,
    unitId: null,
    chapters,
    drawerUnit: null,
    drawerCh: null,
    crumbs: OWN.crumbs,
    h1: OWN.title,
    count: `${OWN.count} terms`,
    more: '',
    icon: OWN.icon,
    listCount: OWN.count,
    counter: `1 / ${OWN.count}`,
    dataJSON: OWN.data,
    own: true
  });
}

function setPage(p) {
  const depth = 3;
  const up = '../'.repeat(depth);
  const asset = (f) => `${up}assets/${f}?v=${fileHash(f)}`;
  return head({
    title: p.title,
    description: p.description,
    unitId: p.unitId,
    depth,
    extraHead: [
      `<link rel="stylesheet" href="${asset('flashcards.css')}">`,
      `<link rel="stylesheet" href="${asset('flashcard-modes.css')}">`,
      `<script src="${asset('editor.js')}" defer></script>`,
      `<script src="${asset('flashcards.js')}" defer></script>`,
      `<script src="${asset('flashcard-modes.js')}" defer></script>`,
      `<script src="${asset('flashcard-export.js')}" defer></script>`
    ].join('\n') + '\n'
  }) +
    topbar(depth, 'flashcards') +
    drawer(depth, p.chapters, p.drawerUnit, p.drawerCh) +
    `<div class="hero hero-page"><div class="hero-inner">
<div>
<nav class="fc-crumbs" aria-label="Where this set is">${p.crumbs}</nav>
<h1 id="fcTitle">${p.h1}</h1>
<p class="fc-meta"><span id="fcCount">${p.count}</span>${p.more} &middot; <a href="${up}flashcards/">All flashcard sets</a></p>
${joinBox(up)}
</div>
<div class="fc-hero-side">
<div class="hero-icon" data-icon="${p.icon}"></div>
<div class="fc-top-btns">
<div class="fc-share fc-share-quick">
<button type="button" class="fc-round-btn fc-round-share" id="fcQuickBtn" aria-haspopup="true" aria-expanded="false" aria-controls="fcQuickMenu" aria-label="Share this set" title="Share">${ICON.share}</button>
<div class="fc-share-menu" id="fcQuickMenu" hidden>
<button type="button" class="fc-share-item" id="fcQuickCopy">${ICON.link}<span>Copy link</span></button>
<a class="fc-share-item" id="fcQuickClassroom" href="https://classroom.google.com/" target="_blank" rel="noopener noreferrer">${ICON.classroom}<span>Post to Google Classroom</span></a>
</div>
</div>
<div class="fc-share">
<button type="button" class="fc-round-btn" id="fcShareBtn" aria-haspopup="true" aria-expanded="false" aria-controls="fcShareMenu" aria-label="More: edit, print and export" title="More">${ICON.more}</button>
<div class="fc-share-menu" id="fcShareMenu" hidden>
<button type="button" class="fc-share-item" id="fcEditItem">${ICON.pencil}<span>Edit</span></button>
<button type="button" class="fc-share-item" id="fcPdf">${ICON.print}<span>Print or download a PDF</span></button>
<button type="button" class="fc-share-item" id="fcExportOpen">${ICON.exportIcon}<span>Export the words as text</span></button>
</div>
</div>
</div>
</div>
</div></div>
<main id="main" class="container fc-page">

<div class="fc-editbar" id="fcEditBar" hidden>
<div class="fc-editbar-text"><strong>Edit mode.</strong> <span id="fcSaveNote">Getting ready...</span></div>
<div class="fc-editbar-actions">
<a class="btn secondary fc-small" href="${up}flashcards/">All sets</a>
<a class="btn secondary fc-small" href="${up}live/#${p.id}">Host a game</a>
<button type="button" class="btn secondary fc-small" id="fcImportOpen">Import cards</button>
<button type="button" class="btn secondary fc-small" id="fcWord">Download Word</button>
<button type="button" class="btn secondary fc-small" id="fcPdfEdit">Download PDF</button>
${p.own ? '<button type="button" class="btn secondary fc-small fc-danger" id="fcOwnDelete">Delete this set</button>' : '<button type="button" class="btn secondary fc-small" id="fcReset">Undo all my changes</button>'}
<button type="button" class="btn secondary fc-small" id="fcSignOut">Sign out</button>
</div>
${p.own ? '<label class="fc-own-name" id="fcOwnTitleRow" hidden><span>Set name</span><input type="text" id="fcOwnTitle" maxlength="80" autocomplete="off"></label>' : ''}
<div class="fc-signin" id="fcSignIn" hidden></div>
<div class="fc-confirm" id="fcConfirm" hidden>
<span id="fcConfirmText">${p.own ? 'Delete this set for good? Students will not see it anymore.' : 'Go back to the book&#39;s cards? Every change you made will be lost.'}</span>
<button type="button" class="btn fc-small" id="fcConfirmYes">${p.own ? 'Yes, delete it' : 'Yes, undo them'}</button>
<button type="button" class="btn secondary fc-small" id="fcConfirmNo">${p.own ? 'Keep it' : 'Keep my changes'}</button>
</div>
<div class="fc-import" id="fcImport" hidden>
<h2 class="fc-import-title">Import cards</h2>
<p class="fc-import-help">Paste your cards below, one card per line with a tab between the term and the definition. <strong>From Quizlet:</strong> open the set, choose the &middot;&middot;&middot; menu, then Export, then Copy text, and paste it here.</p>
<label class="fc-import-box"><span>Cards to import</span><textarea id="fcImportText" rows="7" spellcheck="false" aria-describedby="fcImportKeys"></textarea></label>
<p class="fc-import-keys" id="fcImportKeys">The Tab key types a tab in this box. Two or more spaces count as a tab too. Shift+Tab moves on.</p>
<div class="fc-import-opts">
<fieldset><legend>Between term and definition</legend>
<label><input type="radio" name="fcSepTerm" value="tab" checked> Tab</label>
<label><input type="radio" name="fcSepTerm" value="comma"> Comma</label>
<label><input type="radio" name="fcSepTerm" value="dash"> Dash ( - )</label>
<label><input type="radio" name="fcSepTerm" value="custom"> Other</label>
<input type="text" id="fcSepTermCustom" class="fc-sep-custom" aria-label="Your own mark between term and definition" maxlength="10">
</fieldset>
<fieldset><legend>Between cards</legend>
<label><input type="radio" name="fcSepRow" value="line" checked> New line</label>
<label><input type="radio" name="fcSepRow" value="semi"> Semicolon</label>
<label><input type="radio" name="fcSepRow" value="custom"> Other</label>
<input type="text" id="fcSepRowCustom" class="fc-sep-custom" aria-label="Your own mark between cards" maxlength="10">
</fieldset>
</div>
<p class="fc-import-count" id="fcImportCount" aria-live="polite">Nothing pasted yet.</p>
<ol class="fc-import-preview" id="fcImportPreview"></ol>
<div class="fc-import-actions">
<button type="button" class="btn fc-small" id="fcImportAdd" disabled>Add to the end</button>
<button type="button" class="btn secondary fc-small" id="fcImportReplace" disabled>Replace all cards</button>
<button type="button" class="btn secondary fc-small" id="fcImportCancel">Close</button>
</div>
</div>
</div>

<section class="fc-hub" aria-labelledby="fcGamesTitle">
<div class="fc-hub-head"><h2 id="fcGamesTitle">Multiplayer games</h2><a href="${up}join/">Have a code? Join a game</a></div>
<div class="fc-tiles fc-tiles-3">
${GAMES.map(([id, name, icon]) => `<div class="fc-tile fc-game-tile"><a class="fc-tile-main" href="${up}live/?game=${id}#${p.id}">${icon}<span>${name}</span></a><button type="button" class="linkbtn fc-tile-howto" data-howto="${id}" aria-label="How to play ${name}">How to play</button></div>`).join('\n')}
</div>
</section>

<div class="fc-hub fc-hub-study">
<h2 class="fc-hub-title" id="fcStudyTitle">Study</h2>
<div class="fc-modes fc-tiles fc-tiles-4" role="group" aria-labelledby="fcStudyTitle">
${MODES.map(([id, label, icon], i) => `<button type="button" class="fc-mode fc-tile" id="fcTab-${id}" data-mode="${id}" aria-controls="fcPanel-${id}" aria-pressed="${i === 0}">${icon}<span>${label}</span></button>`).join('\n')}
</div>
</div>

<div class="fc-panel" id="fcPanel-flashcards" aria-labelledby="fcTab-flashcards">
<section class="fc-study" id="fcStudy" aria-label="Flashcards">
<div class="fc-stage" id="fcStage">
<div class="fc-card" id="fcCard" role="button" tabindex="0" aria-describedby="fcHelp">
<div class="fc-inner">
<div class="fc-face fc-front" id="fcFront"></div>
<div class="fc-face fc-back" id="fcBack"></div>
</div>
</div>
<div class="fc-cardbar">
<button type="button" class="fc-hintbtn" id="fcHint" hidden>${ICON.hint}<span>Get a hint</span></button>
<span class="fc-cardbar-right">
<button type="button" class="fc-iconbtn" id="fcSpeak" aria-label="Read this side out loud" title="Read out loud" hidden>${ICON.speak}</button>
<button type="button" class="fc-iconbtn fc-starbtn" id="fcStar" aria-pressed="false" aria-label="Star this term" title="Star this term">${ICON.star}</button>
</span>
</div>
<div class="fc-done" id="fcDone" hidden></div>
</div>
<div class="fc-controls">
<div class="fc-controls-left">
<button type="button" class="fc-tool" id="fcSort" aria-pressed="false" title="Sort the cards into Know and Still learning">Sort cards</button>
<button type="button" class="fc-iconbtn" id="fcUndo" aria-label="Undo the last card" title="Undo" hidden>${ICON.undo}</button>
</div>
<div class="fc-nav">
<button type="button" class="fc-arrow" id="fcPrev" aria-label="Previous card">${ICON.prev}</button>
<span class="fc-counter" id="fcCounter" aria-live="polite">${p.counter}</span>
<button type="button" class="fc-arrow" id="fcNext" aria-label="Next card">${ICON.next}</button>
</div>
<div class="fc-controls-right">
<button type="button" class="fc-iconbtn" id="fcPlay" aria-pressed="false" aria-label="Play the cards on their own" title="Play">${ICON.play}</button>
<button type="button" class="fc-iconbtn" id="fcShuffle" aria-pressed="false" aria-label="Shuffle the cards" title="Shuffle">${ICON.shuffle}</button>
<button type="button" class="fc-iconbtn" id="fcOptionsBtn" aria-expanded="false" aria-controls="fcOptions" aria-label="Options" title="Options">${ICON.gear}</button>
<button type="button" class="fc-iconbtn" id="fcFull" aria-label="Full screen" title="Full screen">${ICON.full}</button>
</div>
</div>
<div class="fc-sortbar" id="fcSortBar" hidden>
<span class="fc-pill learning"><span id="fcLearningCount">0</span> still learning</span>
<span class="fc-pill known"><span id="fcKnownCount">0</span> know</span>
</div>
<div class="fc-progress" aria-hidden="true"><span id="fcBar"></span></div>
<p class="fc-help" id="fcHelp">Click the card or press the space bar to flip it. Arrow keys move. S stars a card and H shows a hint.</p>

<div class="fc-options" id="fcOptions" hidden>
<h2 class="fc-options-title">Options</h2>
<div class="fc-opt-row"><span class="fc-opt-label" id="fcSideLabel">Show first</span>
<span class="fc-seg-group" role="group" aria-labelledby="fcSideLabel"><button type="button" class="fc-seg" id="fcSideTerm" aria-pressed="true">Term</button><button type="button" class="fc-seg" id="fcSideDef" aria-pressed="false">Definition</button></span></div>
<label class="fc-opt-row fc-switch"><span class="fc-opt-label">Sort the cards into Know and Still learning</span><input type="checkbox" id="fcOptSort"></label>
<label class="fc-opt-row fc-switch"><span class="fc-opt-label">Shuffle</span><input type="checkbox" id="fcOptShuffle"></label>
<label class="fc-opt-row fc-switch"><span class="fc-opt-label">Study starred terms only <span class="fc-opt-note" id="fcStarNote">(none starred yet)</span></span><input type="checkbox" id="fcOptStarred"></label>
<label class="fc-opt-row fc-switch"><span class="fc-opt-label">Show pictures</span><input type="checkbox" id="fcOptPics" checked></label>
<label class="fc-opt-row fc-switch"><span class="fc-opt-label">Text to speech <span class="fc-opt-note">Reads each card out loud as it shows and flips.</span></span><input type="checkbox" id="fcOptTts"></label>
<div class="fc-opt-row"><span class="fc-opt-label" id="fcSpeedLabel">Play speed</span>
<span class="fc-seg-group" role="group" aria-labelledby="fcSpeedLabel"><button type="button" class="fc-seg" data-speed="slow" aria-pressed="false">Slow</button><button type="button" class="fc-seg" data-speed="medium" aria-pressed="true">Medium</button><button type="button" class="fc-seg" data-speed="fast" aria-pressed="false">Fast</button></span></div>
<div class="fc-opt-actions">
<button type="button" class="btn secondary fc-small" id="fcClearStudy">Clear my stars and sorting</button>
<span class="fc-opt-confirm" id="fcClearConfirm" hidden>Clear them? <button type="button" class="linkbtn" id="fcClearYes">Yes, clear</button> <button type="button" class="linkbtn" id="fcClearNo">No</button></span>
</div>
<p class="fc-opt-foot">Stars, sorting and these options are kept in this browser only.</p>
</div>
</section>
</div>

${MODES.slice(1).map(([id]) => `<div class="fc-panel fc-mode-panel" id="fcPanel-${id}" aria-labelledby="fcTab-${id}" hidden></div>`).join('\n')}

<section class="fc-list" id="fcList" aria-labelledby="fcListTitle">
<div class="fc-list-head">
<h2 id="fcListTitle">Terms in this set (<span id="fcListCount">${p.listCount}</span>)</h2>
<span class="fc-list-tools" id="fcListTools">
<button type="button" class="fc-seg" id="fcListAll" aria-pressed="true">All</button><button type="button" class="fc-seg" id="fcListStarred" aria-pressed="false">Starred</button>
</span>
</div>
<ol class="fc-rows" id="fcRows"></ol>
<button type="button" class="fc-add" id="fcAdd" hidden>+ Add a card</button>
</section>

<noscript><p>The flashcards need JavaScript turned on.</p></noscript>
<script type="application/json" id="fcData">${p.dataJSON}</script>
</main>` +
    footer(depth);
}

// The starting library (Gennaro, 2026-09-28): a folder per unit holding a
// set per chapter. A chapter the book has no cards for yet gets an empty set
// of his own (made on the site, like one he adds himself), which students
// do not see until it has cards. Its id is fixed from the chapter's, so it
// is the same on every build. From then on the Flashcards page is his own
// library, kept by the server: he can rename, move or delete any folder or
// set, and add his own.
export function defaultLibrary(chapters, units, sets) {
  const folders = [];
  const list = [];
  units.forEach((u) => {
    const folder = `f-${u.id}`;
    folders.push({ id: folder, name: `Unit ${u.number}: ${u.title}`, parent: null, icon: u.id, accent: u.accent });
    chapters.filter((c) => c.unit === u.id).forEach((c) => {
      if (sets[c.id]) {
        const cards = setTerms(c, sets[c.id]);
        list.push({ id: c.id, title: c.title, folder, book: true, chapter: c.id, icon: c.slug, path: `/${u.slug}/${c.slug}/flashcards/`, count: cards.length, terms: cards.map((v) => v.term) });
      } else {
        const id = 'my-' + createHash('sha256').update('chapter:' + c.id).digest('hex').slice(0, 8);
        list.push({ id, title: c.title, folder, chapter: c.id, icon: c.slug, path: `/flashcards/my/${id}/`, count: 0, terms: [] });
      }
    });
  });
  return { v: 3, folders, sets: list, removed: [] };
}

// The Flashcards page: every folder and set. flashcards.js draws it, and
// adds the teacher's tools (new set, new folder, rename, move, delete) once
// he signs in at the bottom of the page. Students see only folders with sets.
export function renderFlashcardIndex(chapters, lib) {
  const depth = 1;
  const v = (f) => `../assets/${f}?v=${fileHash(f)}`;
  return head({
    title: `Flashcards | ${site.title}`,
    description: 'Every flashcard set, sorted into folders.',
    unitId: null,
    depth,
    extraHead: `<link rel="stylesheet" href="${v('flashcards.css')}">\n<script src="${v('editor.js')}" defer></script>\n<script src="${v('flashcards.js')}" defer></script>\n`
  }) +
    topbar(depth, 'flashcards') +
    drawer(depth, chapters, null, null) +
    `<div class="hero hero-page"><div class="hero-inner">
<div>
<span class="eyebrow">Study tools</span>
<h1>Flashcards</h1>
<p class="lede">Every flashcard set, sorted into folders. Open a set to study it with flashcards, Learn, Test or Match.</p>
${joinBox('../')}
</div>
<div class="hero-icon" data-icon="flashcards"></div>
</div></div>
<main id="main" class="container fc-page fx-page">
<div class="fx-teacher" id="fxTeacher" hidden></div>
<div class="fx-find">
<label for="fxFind">Find a word</label>
<input type="search" id="fxFind" placeholder="Type a word" autocomplete="off" spellcheck="false">
<p class="fx-find-note" id="fxFindNote" aria-live="polite"></p>
</div>
<div id="fxTree"></div>
<noscript><p>The flashcards need JavaScript turned on.</p></noscript>
<div class="fx-signin"><button type="button" class="linkbtn" id="fxSignInBtn">Teacher sign in</button><div id="fxSignIn" hidden></div></div>
<script type="application/json" id="fxData">${safeJSON(lib)}</script>
</main>` +
    footer(depth);
}

// The old teacher edit page moved onto the Flashcards page (Gennaro,
// 2026-09-28). A bookmark to it still lands in the right place.
export function renderEditMoved() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=../flashcards/">
<title>Moved to Flashcards | ${site.title}</title>
<link rel="stylesheet" href="../assets/book.css">
</head>
<body>
<main id="main" class="container"><p>Editing sets is now on the <a href="../flashcards/">Flashcards page</a>. Sign in at the bottom of it.</p></main>
</body>
</html>
`;
}

// Teacher only: the drawing models test page (Gennaro, 2026-09-30). The same
// words drawn by each of Cloudflare's free picture models, side by side, so he
// can choose the one Draw it uses. Nothing shows until he signs in, and no
// page links here.
export function renderDrawTest(chapters) {
  const depth = 2;
  const v = (f) => `../../assets/${f}?v=${fileHash(f)}`;
  return head({
    title: `Drawing models test | ${site.title}`,
    description: 'Teacher only: compare the AI drawing models.',
    unitId: null,
    depth,
    extraHead: `<link rel="stylesheet" href="${v('flashcards.css')}">\n<script src="${v('editor.js')}" defer></script>\n<script src="${v('draw-test.js')}" defer></script>\n`
  }) +
    topbar(depth, 'flashcards') +
    drawer(depth, chapters, null, null) +
    `<main id="main" class="container fc-page">
<h1>Drawing models test</h1>
<p class="lede">The same words drawn by each free drawing model, side by side. Nothing is saved. Tell Claude which one to use for Draw it.</p>
<div id="dtApp"><p>Loading...</p></div>
</main>
` + footer(depth);
}
