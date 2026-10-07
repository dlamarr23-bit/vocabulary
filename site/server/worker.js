// The server side of the online textbook. Cloudflare Pages runs this file
// ("advanced mode") because build.mjs copies it to public/_worker.js. It only
// sees the requests listed in public/_routes.json, which build.mjs writes:
// /api/* and each flashcard page. Every other page is served as a plain file,
// exactly as before, and the simulation site is a separate project that never
// sees this file.
//
// What it does:
//   - keeps each flashcard set a teacher saves, so students see it straight
//     away, and slips it into the flashcard page as it is served
//   - keeps every picture added to a set, including one copied from a web
//     address, and serves it from this site so nothing is hotlinked
//   - keeps the sets the teacher makes himself, served from one shell page at
//     /flashcards/my/<id>/, and the folders he sorts sets into, which the
//     Flashcards page shows at the top
//   - checks the teacher password before anything can be changed
//
// It needs two settings on the integrated-science-8 Pages project, described
// in textbook/README.md: a KV namespace bound as FLASHCARDS, and a secret
// called EDIT_PASSWORD. Without them the flashcards still work, from the book's
// own cards, and the editor falls back to saving in the teacher's browser.
//
// Live games (a Quizlet Live style race) run in a separate Worker,
// textbook/live-worker, because a Pages site cannot hold a Durable Object
// itself. This file reaches it through a Durable Object binding called LIVE:
// it makes a game for a signed in teacher, and passes every game connection
// straight through to that game.

const MAX_IMAGE = 5 * 1024 * 1024;
// Animated GIFs are often bigger than photos, so they may be twice the size.
const MAX_ANIMATED = 10 * 1024 * 1024;
const MAX_SET = 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'];
const COOKIE = 'is8edit';
const SAFE = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow'
};
// Only this site and the physical science site (which shows the flashcards under its own top bar) may frame
// these pages. The same rule is in build.mjs, for _headers.
const FRAMING = "frame-ancestors 'self' https://physical-science-8.pages.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        const res = await api(request, env, url);
        // A game connection (WebSocket) is passed back exactly as it came.
        return res.webSocket ? res : finish(res);
      } catch (error) {
        return finish(json({ error: 'Something went wrong on the site. Try again.' }, 500));
      }
    }
    try {
      return finish(await page(request, env, url));
    } catch (error) {
      return env.ASSETS.fetch(request);
    }
  }
};

function finish(res) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SAFE)) out.headers.set(k, v);
  // Added to a policy the response already has (an uploaded picture's), not in place of it.
  const policy = out.headers.get('content-security-policy');
  if (!(policy || '').includes('frame-ancestors')) out.headers.set('content-security-policy', policy ? `${policy}; ${FRAMING}` : FRAMING);
  return out;
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
  });
}

const cloudReady = (env) => Boolean(env.FLASHCARDS && env.EDIT_PASSWORD);

// The sets that exist: the book's, written by build.mjs as
// [{ id, title, unit, chapter, path }], then the teacher's own
// [{ id, title, path, own: true }]. A book set taken off the Flashcards page
// is still here, so a game or Combine that uses it keeps working.
async function registry(env, url, lib) {
  const res = await env.ASSETS.fetch(new URL('/assets/flashcard-sets.json', url));
  const book = res.ok ? await res.json() : [];
  if (!env.FLASHCARDS) return book;
  lib = lib || await library(env, url);
  return book.concat(lib.sets.filter((s) => !s.book).map((s) => ({ id: s.id, title: s.title, path: s.path, own: true, count: s.count })));
}

/* ---------------- the library: every folder and set ---------------- */

// The Flashcards page is the teacher's own library (Gennaro, 2026-09-28),
// kept in one KV entry, "library":
//   v:       3
//   folders: [{ id, name, parent, icon?, accent? }]  parent is null or a
//            top folder, so folders go two deep at most; order is the order
//   sets:    [{ id, title, folder, path, count, terms, icon, book?, chapter? }]
//            icon: a picture from assets/icons.js ('' for the two cards)
//   removed: [ids of the starting sets taken off the page]
// Until he changes something it is the build's starting library
// (assets/flashcard-library.json: a folder per unit holding a set per
// chapter, empty where the book has no cards yet). A set he makes keeps its
// cards under "set:<id>", like a book set's saved edits.
const OWN_ID = /^my-[a-z0-9]{8}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const ICON_KEY = /^(?:[a-z0-9-]{1,40}|\/api\/images\/[0-9a-f]{64})$/;
const isPicture = (icon) => /^\/api\/images\/[0-9a-f]{64}$/.test(icon || '');
const FOLDER_ID = /^f-[a-z0-9-]{2,24}$/;
const ownPath = (id) => '/flashcards/my/' + id + '/';
const rid = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
const cleanText = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const termsOf = (cards) => cards.map((c) => String(c.term || '').slice(0, 80)).filter(Boolean).slice(0, 400);

async function startingLibrary(env, url) {
  try {
    const res = await env.ASSETS.fetch(new URL('/assets/flashcard-library.json', url));
    if (res.ok) return await res.json();
  } catch { /* fall through */ }
  return { v: 2, folders: [], sets: [], removed: [] };
}

async function library(env, url) {
  const start = await startingLibrary(env, url);
  let lib = env.FLASHCARDS ? await env.FLASHCARDS.get('library', 'json') : null;
  if (lib && lib.v === 2) lib = withoutChapterFolders(lib, start);
  else if (!lib || lib.v !== 3) lib = fromFirstVersion(lib, start);
  lib.removed = Array.isArray(lib.removed) ? lib.removed : [];
  // A chapter's set takes the chapter's picture until the teacher picks one.
  lib.sets.forEach((x) => {
    if (x.icon !== undefined) return;
    const was = start.sets.find((y) => y.id === x.id || (x.chapter && y.chapter === x.chapter));
    x.icon = (was && was.icon) || '';
  });
  for (const s of start.sets) {
    if (lib.sets.some((x) => x.id === s.id) || lib.removed.includes(s.id)) continue;
    // Cards the book gains later for a chapter take the place of its empty
    // set; if the teacher already filled that set, his stays and the book's
    // is left off.
    const mine = s.book && lib.sets.find((x) => x.chapter === s.chapter && !x.book);
    if (mine) {
      if (!mine.count) lib.sets[lib.sets.indexOf(mine)] = { ...s, title: mine.title, folder: mine.folder };
      continue;
    }
    lib.sets.push({ ...s, folder: lib.folders.some((f) => f.id === s.folder) ? s.folder : null });
  }
  return lib;
}

// The second version (also 2026-09-28) had a folder per chapter inside each
// unit. Gennaro asked for the chapters to be sets in the unit folder instead:
// what was in a chapter folder moves up into its unit, a chapter with no
// set gets its empty one, and the chapter folders go. Folders he made stay.
function withoutChapterFolders(lib, start) {
  const chapterFolder = {};
  start.sets.forEach((s) => { if (s.chapter) chapterFolder['f-' + s.chapter] = s; });
  const gone = (id) => Boolean(chapterFolder[id]) && lib.folders.some((f) => f.id === id);
  const folderOf = (id) => lib.folders.find((f) => f.id === id);
  const unitOf = (id) => { const f = folderOf(id); return (f && f.parent) || chapterFolder[id].folder; };
  lib.sets.forEach((s) => {
    const was = start.sets.find((x) => x.id === s.id);
    if (was && was.chapter) s.chapter = was.chapter;
    if (gone(s.folder)) { if (!s.chapter) s.fromChapter = chapterFolder[s.folder].chapter; s.folder = unitOf(s.folder); }
  });
  start.sets.forEach((s) => {
    if (s.book || lib.sets.some((x) => x.id === s.id || x.chapter === s.chapter)) return;
    lib.sets.push({ ...s, folder: gone('f-' + s.chapter) ? unitOf('f-' + s.chapter) : (folderOf(s.folder) ? s.folder : null) });
  });
  lib.folders = lib.folders.filter((f) => !chapterFolder[f.id]);
  // In each folder, the chapter sets first in chapter order, then the rest as they were.
  const rank = {};
  start.sets.forEach((s, i) => { rank[s.chapter] = i; });
  const byFolder = new Map();
  lib.sets.forEach((s) => {
    if (!byFolder.has(s.folder || '')) byFolder.set(s.folder || '', []);
    byFolder.get(s.folder || '').push(s);
  });
  lib.sets = [];
  for (const group of byFolder.values()) {
    const key = (s) => rank[s.chapter || s.fromChapter];
    const ch = group.filter((s) => key(s) !== undefined).sort((a, b) => key(a) - key(b));
    lib.sets.push(...ch, ...group.filter((s) => key(s) === undefined));
  }
  lib.sets.forEach((s) => { delete s.fromChapter; });
  lib.v = 3;
  return lib;
}

// The first version (2026-09-28, the same day) had flat folders and a list of
// own sets; they join the starting library as top folders and loose sets.
function fromFirstVersion(old, start) {
  const lib = JSON.parse(JSON.stringify(start));
  if (!old) return lib;
  const place = old.place || {};
  (old.folders || []).forEach((f) => lib.folders.push({ id: f.id, name: f.name, parent: null }));
  const has = (id) => lib.folders.some((f) => f.id === id);
  lib.sets.forEach((s) => { if (place[s.id] && has(place[s.id])) s.folder = place[s.id]; });
  (old.own || []).forEach((o) => lib.sets.push({ id: o.id, title: o.title, folder: has(place[o.id]) ? place[o.id] : null, path: ownPath(o.id), count: o.count || 0, terms: o.terms || [] }));
  return lib;
}

const saveLibrary = (env, lib) => env.FLASHCARDS.put('library', JSON.stringify(lib));

// What a student needs to draw the page.
function publicLibrary(lib) {
  return {
    folders: lib.folders,
    sets: lib.sets.map((s) => ({ id: s.id, title: s.title, folder: s.folder, path: s.path, count: s.count || 0, terms: s.terms || [], icon: s.icon || '' }))
  };
}

const folderOk = (lib, id) => lib.folders.some((f) => f.id === id);

async function createSet(request, env, url) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const title = cleanText(body && body.title, 80) || 'Untitled set';
  const lib = await library(env, url);
  if (lib.sets.length >= 400) return json({ error: 'There are 400 sets already. Delete one you do not need first.' }, 400);
  const id = 'my-' + rid(8);
  const saved = Date.now();
  await env.FLASHCARDS.put('set:' + id, JSON.stringify({ cards: [], base: '', title, saved }), { metadata: { saved, count: 0 } });
  const folder = String((body && body.folder) || '');
  lib.sets.push({ id, title, folder: folderOk(lib, folder) ? folder : null, path: ownPath(id), count: 0, terms: [], icon: '', saved });
  await saveLibrary(env, lib);
  return json({ id, path: ownPath(id) });
}

// A set the teacher made is deleted with its cards. A book set comes off the
// Flashcards page, and its saved edits go too.
async function removeSet(env, url, id) {
  const lib = await library(env, url);
  const s = lib.sets.find((x) => x.id === id);
  lib.sets = lib.sets.filter((x) => x.id !== id);
  if (s && (s.book || s.chapter) && !lib.removed.includes(id)) lib.removed.push(id);
  await saveLibrary(env, lib);
  await env.FLASHCARDS.delete('set:' + id);
  return json(lib);
}

// The folders, and the name, folder and order of each set, as the
// Flashcards page sends them. Counts and terms stay the server's own.
async function putLibrary(request, env, url) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const bad = (msg) => json({ error: msg || 'Those changes could not be saved. Reload the page and try again.' }, 400);
  if (!body || !Array.isArray(body.folders) || !Array.isArray(body.sets) || body.folders.length > 300) return bad();
  const lib = await library(env, url);
  const folders = [];
  for (const f of body.folders) {
    const id = String((f && f.id) || '');
    if (!FOLDER_ID.test(id) || folders.some((x) => x.id === id)) return bad();
    const old = lib.folders.find((x) => x.id === id) || {};
    const keep = { id, name: cleanText(f.name, 80) || 'Untitled folder', parent: f.parent ? String(f.parent) : null };
    // The folder's picture: one the teacher picked ('' for the plain folder), or the one it had.
    if (typeof f.icon === 'string' && (f.icon === '' || ICON_KEY.test(f.icon))) { if (f.icon) keep.icon = f.icon; }
    else if (old.icon) keep.icon = old.icon;
    // The folder's color: one the teacher picked, or the one it had.
    if (typeof f.accent === 'string' && COLOR.test(f.accent)) keep.accent = f.accent.toLowerCase();
    else if (f.accent === '') delete keep.accent;
    else if (old.accent) keep.accent = old.accent;
    folders.push(keep);
  }
  for (const f of folders) {
    if (!f.parent) continue;
    const p = folders.find((x) => x.id === f.parent);
    if (!p || p.id === f.id || p.parent) return bad('A folder can go inside a top folder only, not inside a folder that is already inside another.');
  }
  const sets = [];
  for (const s of body.sets) {
    const cur = lib.sets.find((x) => x.id === String((s && s.id) || ''));
    if (!cur || sets.includes(cur)) continue;
    cur.title = cleanText(s.title, 80) || cur.title;
    if (typeof s.icon === 'string' && (s.icon === '' || ICON_KEY.test(s.icon))) cur.icon = s.icon;
    cur.folder = folders.some((f) => f.id === s.folder) ? s.folder : null;
    sets.push(cur);
  }
  lib.sets.forEach((cur) => { if (!sets.includes(cur)) { if (!folders.some((f) => f.id === cur.folder)) cur.folder = null; sets.push(cur); } });
  lib.folders = folders;
  lib.sets = sets;
  lib.v = 3;
  await saveLibrary(env, lib);
  return json(lib);
}

async function newFolder(request, env, url) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const lib = await library(env, url);
  if (lib.folders.length >= 300) return json({ error: 'There are 300 folders already.' }, 400);
  const parent = String((body && body.parent) || '');
  const p = lib.folders.find((f) => f.id === parent);
  if (parent && (!p || p.parent)) return json({ error: 'A folder can go inside a top folder only.' }, 400);
  lib.folders.push({ id: 'f-' + rid(8), name: cleanText(body && body.name, 80) || 'Untitled folder', parent: p ? p.id : null });
  lib.v = 3;
  await saveLibrary(env, lib);
  return json(lib);
}

// A set's page takes its folder's color (Gennaro, 2026-09-29), or the color
// of the folder that one is in: the page's accent, a darker one for text and
// links, and a light tint for backgrounds, as book.css has for each unit.
function folderColor(lib, set) {
  let f = lib.folders.find((x) => x.id === set.folder);
  while (f && !f.accent && f.parent) f = lib.folders.find((x) => x.id === f.parent);
  return f && COLOR.test(f.accent || '') ? f.accent : '';
}
function colorStyle(hex) {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (to, t) => '#' + rgb.map((c) => Math.round(c + (to - c) * t).toString(16).padStart(2, '0')).join('');
  return `--accent:${hex};--accent-dark:${mix(0, 0.3)};--accent-tint:${mix(255, 0.9)};--unit:${hex}`;
}

// "Flashcards > Unit 1 > Chapter 1": the folders a set sits in, as links.
function crumbs(lib, set) {
  const trail = [];
  let f = lib.folders.find((x) => x.id === set.folder);
  while (f && trail.length < 3) { trail.unshift(f); f = lib.folders.find((x) => x.id === f.parent); }
  return '<a href="/flashcards/">Flashcards</a>' + trail.map((x) => `<span aria-hidden="true">&rsaquo;</span><a href="/flashcards/#folder-${escHTML(x.id)}">${escHTML(x.name)}</a>`).join('');
}

/* ---------------- flashcard pages ---------------- */

// Serve the page as built, plus the saved set in a #fcCloud block right after
// the book's own #fcData block. The page script prefers the saved set.
async function page(request, env, url) {
  // Always fetch the whole page, never "unchanged since last time": a student
  // who opened the page before the teacher saved must get the new set.
  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  const own = /^\/flashcards\/my\/([^/]+)(\/(?:index\.html)?)?$/.exec(url.pathname);
  if (own) return ownPage(request, env, url, own);
  const res = await env.ASSETS.fetch(new Request(request, { headers }));
  if (!env.FLASHCARDS || request.method !== 'GET' || res.status !== 200) return res;
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const path = url.pathname.replace(/index\.html$/, '');
  const lib = await library(env, url);
  if (path === '/flashcards/') return fresh(withLibrary(res, lib));
  if (path === '/live/') return fresh(withOwnSets(res, lib));
  const entry = (await registry(env, url, lib)).find((s) => s.path === path);
  if (!entry) return res;
  const saved = await env.FLASHCARDS.get('set:' + entry.id, 'json');
  const mine = lib.sets.find((s) => s.id === entry.id);
  let rw = new HTMLRewriter();
  if (saved) {
    const block = `<script type="application/json" id="fcCloud">${safeJSON(saved)}</script>`;
    rw = rw.on('script#fcData', { element(el) { el.after(block, { html: true }); } });
  }
  if (mine) {
    // The set's name and folders as the teacher has them now.
    rw = rw.on('nav.fc-crumbs', { element(el) { el.setInnerContent(crumbs(lib, mine), { html: true }); } })
      .on('h1#fcTitle', { element(el) { el.setInnerContent(mine.title); } })
      .on('body', { element(el) { const c = folderColor(lib, mine); if (c) el.setAttribute('style', colorStyle(c)); } })
      .on('div.hero-icon', {
        element(el) {
          // The teacher's own picture, or one of the book's drawings (icons.js draws those).
          if (isPicture(mine.icon)) { el.removeAttribute('data-icon'); el.setInnerContent(`<img src="${mine.icon}" alt="">`, { html: true }); }
          else el.setAttribute('data-icon', mine.icon || 'set');
        }
      })
      .on('title', { element(el) { el.setInnerContent(mine.title + ' Flashcards' + ' | __SITE_TITLE__'); } });
  }
  return fresh(rw.transform(res));
}

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escHTML = (v) => String(v).replace(/[&<>"']/g, (ch) => HTML_ESC[ch]);
const safeJSON = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const gone = () => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Set not found</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 16px;line-height:1.5"><h1>That set is not here</h1><p>It may have been deleted, or the address is not quite right.</p><p><a href="/flashcards/">See every flashcard set</a></p>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

// A set the teacher made: the shell page (flashcards/my/set/) with this set
// written into its __SET_...__ marks.
async function ownPage(request, env, url, m) {
  if (!env.FLASHCARDS || !OWN_ID.test(m[1])) return gone();
  // Picture and link paths on the page need the closing slash.
  if (!m[2]) return Response.redirect(new URL(url.pathname + '/' + url.search, url).toString(), 302);
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Not found.' }, 404);
  const id = m[1];
  const [lib, saved] = await Promise.all([library(env, url), env.FLASHCARDS.get('set:' + id, 'json')]);
  const meta = lib.sets.find((s) => s.id === id);
  // A chapter's empty set has nothing saved until the teacher adds cards.
  if (!meta) return gone();
  const shell = await env.ASSETS.fetch(new URL('/flashcards/my/set/', url));
  if (!shell.ok) return shell;
  const cards = saved && Array.isArray(saved.cards) ? saved.cards : [];
  const title = meta.title;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'my-set';
  const data = { id, title, where: '', subject: '', own: true, file: slug + '-flashcards', cards };
  const color = folderColor(lib, meta);
  const html = (await shell.text())
    .replace('<body>', color ? `<body style="${colorStyle(color)}">` : '<body>')
    .split('"__SET_DATA__"').join(safeJSON(data))
    .split('__SET_CRUMBS__').join(crumbs(lib, meta))
    .split('<div class="hero-icon" data-icon="__SET_ICON__"></div>').join(isPicture(meta.icon) ? `<div class="hero-icon"><img src="${meta.icon}" alt=""></div>` : '<div class="hero-icon" data-icon="__SET_ICON__"></div>')
    .split('__SET_ICON__').join(escHTML(meta.icon || 'set'))
    .split('__SET_ID__').join(id)
    .split('__SET_TITLE__').join(escHTML(title))
    .split('__SET_COUNT__ terms').join(cards.length + (cards.length === 1 ? ' term' : ' terms'))
    .split('__SET_COUNT__').join(String(cards.length));
  const headers = new Headers(shell.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  return fresh(new Response(html, { status: 200, headers }));
}

// The Flashcards page: the library goes in a #fxLibrary block, which
// flashcards.js draws in place of the build's starting one.
function withLibrary(res, lib) {
  const block = `<script type="application/json" id="fxLibrary">${safeJSON(publicLibrary(lib))}</script>`;
  return new HTMLRewriter().on('script#fxData', { element(el) { el.after(block, { html: true }); } }).transform(res);
}

// The host page: the teacher's own sets join the book's in the set menu.
function withOwnSets(res, lib) {
  const own = lib.sets.filter((s) => !s.book);
  if (!own.length) return res;
  const opts = own.map((s) => `<option value="${escHTML(s.id)}">${escHTML(s.title)} (${s.count || 0} ${s.count === 1 ? 'term' : 'terms'})</option>`).join('');
  let list = null;
  return new HTMLRewriter()
    .on('select#lvSet', { element(el) { el.append(`<optgroup label="Your own sets">${opts}</optgroup>`, { html: true }); } })
    .on('script#lvSets', {
      text(t) {
        // The block arrives in pieces; it is rewritten once it is whole.
        list = (list || '') + t.text;
        if (!t.lastInTextNode) { t.remove(); return; }
        let book = [];
        try { book = JSON.parse(list); } catch { book = []; }
        t.replace(safeJSON(book.concat(own.map((s) => ({ id: s.id, title: s.title, where: 'Your own set', count: s.count || 0 })))), { html: true });
      }
    })
    .transform(res);
}

// No validator on a flashcard page, so the browser asks again every time.
function fresh(res) {
  const headers = new Headers(res.headers);
  headers.delete('etag');
  headers.delete('last-modified');
  headers.delete('content-length');
  headers.set('cache-control', 'no-cache');
  return new Response(res.body, { status: res.status, headers });
}

/* ---------------- the API ---------------- */

async function api(request, env, url) {
  const [a, b, c] = url.pathname.slice('/api/'.length).split('/');
  const method = request.method;

  if (a === 'session' && method === 'GET') {
    // storage and password say which of the two settings the site can see,
    // never what they hold, so a missing one is easy to spot.
    return json({ cloud: cloudReady(env), editor: await isEditor(request, env), storage: Boolean(env.FLASHCARDS), password: Boolean(env.EDIT_PASSWORD), live: Boolean(env.LIVE), draw: Boolean(env.AI) });
  }
  // Joining a live game needs no sign in: the code is the way in.
  if (a === 'live' && b && c === 'ws' && method === 'GET') {
    if (!env.LIVE) return json({ error: 'Live games are not switched on yet.' }, 503);
    if (!/^[A-Z2-9]{6}$/.test(b.toUpperCase()) || request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Not found.' }, 404);
    return env.LIVE.get(env.LIVE.idFromName(b.toUpperCase())).fetch(request);
  }
  if (a === 'images' && b && b !== 'search' && !c && method === 'GET') return getImage(env, b);

  if (!cloudReady(env)) return json({ error: 'Saving to the site is not switched on yet.' }, 503);
  // A page on another site can post a form here but cannot add this header,
  // so nothing can be changed from outside the editor.
  if (method !== 'GET' && request.headers.get('X-IS8-Editor') !== '1') return json({ error: 'Not allowed.' }, 403);

  if (a === 'login' && method === 'POST') return login(request, env);
  if (a === 'logout' && method === 'POST') return signedCookies(json({ ok: true }), '', 0);
  // Anyone may host a game, students included (Gennaro, 2026-09-25): a game
  // only reads a set's cards and deletes itself after 5 quiet minutes.
  if (a === 'live' && b === 'create' && method === 'POST') return liveCreate(request, env, url);

  if (!(await isEditor(request, env))) return json({ error: 'Sign in with the teacher password first.' }, 401);

  if (a === 'suggest' && !b && method === 'GET') return suggest(env, url);
  if (a === 'images' && b === 'search' && !c && method === 'GET') return imageSearch(url, env);
  if (a === 'sets' && !b && method === 'GET') return listSets(env, url);
  if (a === 'sets' && !b && method === 'POST') return createSet(request, env, url);
  if (a === 'library' && !b && method === 'GET') return json(await library(env, url));
  if (a === 'library' && !b && method === 'PUT') return putLibrary(request, env, url);
  if (a === 'library' && b === 'folders' && !c && method === 'POST') return newFolder(request, env, url);
  if (a === 'sets' && b && !c) {
    if (!(await registry(env, url)).some((s) => s.id === b)) return json({ error: 'There is no set with that name.' }, 404);
    if (method === 'GET') return getSet(env, url, b);
    if (method === 'PUT') return putSet(request, env, b);
    if (method === 'DELETE') {
      // Delete: a set the teacher made is deleted, and ?remove takes a book
      // set off the Flashcards page. Otherwise a book set goes back to the
      // book's cards ("Undo all my changes").
      if (OWN_ID.test(b) || url.searchParams.has('remove')) return removeSet(env, url, b);
      await env.FLASHCARDS.delete('set:' + b);
      const [lib, start] = await Promise.all([library(env, url), startingLibrary(env, url)]);
      const now = lib.sets.find((s) => s.id === b), was = start.sets.find((s) => s.id === b);
      if (now && was) { Object.assign(now, { count: was.count, terms: was.terms }); await saveLibrary(env, lib); }
      return json({ ok: true });
    }
  }
  if (a === 'images' && !b && method === 'POST') {
    const buf = await readLimited(request, MAX_ANIMATED);
    if (!buf) return json({ error: 'That picture is bigger than 10 MB.' }, 413);
    return putImage(env, request.headers.get('content-type'), buf);
  }
  if (a === 'images' && b === 'from-url' && method === 'POST') return imageFromUrl(request, env);
  if (a === 'images' && b === 'draw' && method === 'POST') return drawImage(request, env);
  if (a === 'images' && b === 'scene' && method === 'POST') return drawScene(request, env);
  if (a === 'images' && b === 'try' && method === 'POST') return drawTry(request, env);
  return json({ error: 'Not found.' }, 404);
}

/* ---------------- signing in ---------------- */

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

// The sign-in cookie holds a signature made with the password, never the
// password itself. Changing EDIT_PASSWORD signs everyone out.
async function token(password) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('is8-editor-v1')));
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const cookie = (value, maxAge) => `${COOKIE}=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
function signedCookies(res, value, maxAge) {
  res.headers.append('Set-Cookie', cookie(value, maxAge));
  return res;
}

async function isEditor(request, env) {
  if (!env.EDIT_PASSWORD) return false;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]{64})`).exec(request.headers.get('cookie') || '');
  return Boolean(m) && same(m[1], await token(env.EDIT_PASSWORD));
}

async function login(request, env) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const given = body && typeof body.password === 'string' ? body.password : '';
  const expected = await token(String(env.EDIT_PASSWORD).trim());
  if (!given || !same(await token(given.trim()), expected)) {
    await new Promise((r) => setTimeout(r, 700));
    return json({ error: 'That password is not right.' }, 401);
  }
  return signedCookies(json({ ok: true }), await token(String(env.EDIT_PASSWORD)), 60 * 60 * 24 * 60);
}

/* ---------------- sets ---------------- */

async function listSets(env, url) {
  const out = {};
  const list = await env.FLASHCARDS.list({ prefix: 'set:' });
  for (const k of list.keys) out[k.name.slice(4)] = k.metadata || {};
  // list: every set in the book, for the editor's Make a copy and Combine.
  return json({ sets: out, list: await registry(env, url) });
}

// One set's cards as students see them now (the teacher's saved version, or
// the book's), for Make a copy and Combine. Picture paths come back written
// for a set page, which always sits three folders deep.
async function getSet(env, url, id) {
  const entry = (await registry(env, url)).find((s) => s.id === id);
  const saved = await env.FLASHCARDS.get('set:' + id, 'json');
  let cards = saved && Array.isArray(saved.cards) ? saved.cards : null;
  if (!cards) {
    const res = await env.ASSETS.fetch(new URL('/assets/flashcard-data/' + id + '.json', url));
    if (res.ok) cards = (await res.json()).cards;
  }
  const base = new URL(entry.path, url);
  const out = (cards || []).map((c) => {
    let img = c.img ? new URL(c.img, base).pathname : '';
    if (img.startsWith('/assets/')) img = '../../..' + img;
    return { term: c.term || '', def: c.def || '', hint: c.hint || '', img, alt: img ? c.alt || '' : '', credit: img ? c.credit || '' : '' };
  });
  return json({ id, title: entry.title, cards: out });
}

const IMG_OK = /^(?:\/api\/images\/[0-9a-f]{64}|(?:\.\.\/)+assets\/flashcards\/[\w-]+\/[\w.-]+)?$/;

async function putSet(request, env, id) {
  const raw = await readLimited(request, MAX_SET);
  if (!raw) return json({ error: 'That set is too big to save.' }, 413);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { body = null; }
  if (!body || !Array.isArray(body.cards) || body.cards.length > 400) return json({ error: 'That is not a flashcard set.' }, 400);
  const str = (v, max) => String(v == null ? '' : v).slice(0, max);
  const cards = [];
  for (const c of body.cards) {
    const img = str(c && c.img, 300);
    if (!IMG_OK.test(img)) return json({ error: 'A picture in the set has not been copied to the site yet. Add it again.' }, 400);
    cards.push({ term: str(c.term, 400), def: str(c.def, 4000), hint: str(c.hint, 400), img, alt: img ? str(c.alt, 600) : '', credit: img ? str(c.credit, 300) : '' });
  }
  const saved = Date.now();
  const set = { cards, base: str(body.base, 40), saved };
  // The Flashcards page keeps each set's count and terms for its search, and
  // a set the teacher made takes its name from the edit bar.
  const lib = await library(env, new URL(request.url));
  const meta = lib.sets.find((s) => s.id === id);
  if (meta) {
    if (OWN_ID.test(id)) meta.title = set.title = cleanText(body.title, 80) || meta.title;
    Object.assign(meta, { count: cards.length, terms: termsOf(cards), saved });
    lib.v = 3;
    await saveLibrary(env, lib);
  }
  await env.FLASHCARDS.put('set:' + id, JSON.stringify(set), { metadata: { saved, count: cards.length } });
  return json({ saved, title: set.title });
}

/* ---------------- live games ---------------- */

// Letters that cannot be mistaken for each other on a projector: no I, O, 0 or 1.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function joinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((x) => CODE_LETTERS[x % CODE_LETTERS.length]).join('');
}

// The teacher picks a set and the options; the site gathers the cards the
// students see right now (the teacher's saved version, or the book's) and
// starts a game under a fresh code.
async function liveCreate(request, env, url) {
  if (!env.LIVE) return json({ error: 'Live games are not switched on yet. The steps are in the README, steps 4 and 5.' }, 503);
  let body;
  try { body = await request.json(); } catch { body = null; }
  const setId = String((body && body.setId) || '');
  const entry = (await registry(env, url)).find((s) => s.id === setId);
  if (!entry) return json({ error: 'Pick a flashcard set first.' }, 400);
  let cards = null;
  const saved = await env.FLASHCARDS.get('set:' + setId, 'json');
  if (saved && Array.isArray(saved.cards)) cards = saved.cards;
  if (!cards) {
    const res = await env.ASSETS.fetch(new URL('/assets/flashcard-data/' + setId + '.json', url));
    if (res.ok) cards = (await res.json()).cards;
  }
  // Pictures saved with a set are written relative to the set's own page.
  const base = new URL(entry.path, url);
  cards = (cards || []).map((c) => ({
    term: c.term,
    def: c.def,
    img: c.img ? new URL(c.img, base).pathname : ''
  }));
  const hostKey = [...crypto.getRandomValues(new Uint8Array(18))].map((x) => x.toString(16).padStart(2, '0')).join('');
  for (let tries = 0; tries < 8; tries++) {
    const code = joinCode();
    const res = await env.LIVE.get(env.LIVE.idFromName(code)).fetch('https://live/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, hostKey, setId, title: entry.title, cards, kind: String((body && body.kind) || 'volley'), opts: (body && body.opts) || {} })
    });
    if (res.status === 409) continue;
    if (!res.ok) return json({ error: (await res.text()) || 'The game could not be made.' }, 400);
    return json({ code, hostKey });
  }
  return json({ error: 'Every code tried was in use. Try again.' }, 503);
}

/* ---------------- suggested definitions ---------------- */

// While the teacher types a term, the editor asks here for definitions to
// pick from, like Quizlet's suggestions: the book's own glossary first (its
// wording is written for Grade 8), then WordNet (Princeton's free dictionary,
// short definitions, knows two word science terms), then Wiktionary. (The
// Free Dictionary API was dropped on 2026-09-24: from Cloudflare it was too
// slow to answer, and it is built on Wiktionary anyway.) Only a signed in teacher can ask. Answers are cached for
// a day. "checked" says what each source did, so a source that stops
// answering is easy to spot (open /api/suggest?term=food while signed in).
async function suggest(env, url) {
  const term = String(url.searchParams.get('term') || '').trim().slice(0, 80);
  if (term.length < 2) return json({ suggestions: [] });
  const out = [];
  const seen = new Set();
  const checked = {};
  const add = (def, source) => {
    const d = String(def || '').replace(/\s+/g, ' ').trim();
    const k = d.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (!d || d.length > 500 || seen.has(k)) return;
    seen.add(k);
    out.push({ def: d.charAt(0).toUpperCase() + d.slice(1) + (/[.!?]$/.test(d) ? '' : '.'), source });
  };
  try {
    const res = await env.ASSETS.fetch(new URL('/assets/glossary.json', url));
    if (res.ok) (await res.json()).filter((g) => g.term.toLowerCase() === term.toLowerCase()).forEach((g) => add(g.def, 'This book'));
  } catch { /* no glossary, carry on */ }
  const sources = [['wordnet', 'WordNet', wordnetDefs], ['wiktionary', 'Wiktionary', wiktionaryDefs]];
  const results = await Promise.allSettled(sources.map(([key, , get]) => cached(key, term, get)));
  results.forEach((r, i) => {
    const [key, label] = sources[i];
    if (r.status === 'fulfilled') {
      checked[key] = r.value.length ? 'found' : 'nothing';
      r.value.slice(0, 3).forEach((d) => add(d, label));
    } else {
      checked[key] = 'failed: ' + String((r.reason && r.reason.message) || r.reason).slice(0, 80);
    }
  });
  return json({ suggestions: out.slice(0, 5), checked }, 200, { 'cache-control': 'private, max-age=3600' });
}

// Keep each outside answer for a day, so a second look is instant. An empty
// answer is not kept, in case the source was only having a bad moment.
async function cached(source, term, get) {
  const key = new Request('https://suggest.cache/v2/' + source + '/' + encodeURIComponent(term.toLowerCase()));
  let cache = null;
  try { cache = caches.default; } catch { cache = null; }
  if (cache) {
    const hit = await cache.match(key).catch(() => null);
    if (hit) return hit.json();
  }
  const defs = await get(term);
  if (cache && defs.length) await cache.put(key, new Response(JSON.stringify(defs), { headers: { 'cache-control': 'public, max-age=86400' } })).catch(() => {});
  return defs;
}

// Wikimedia asks every program to say who it is.
const AGENT = 'ClassroomVocabulary/1.0 (classroom flashcard editor)';

async function lookup(address, ms = 2500) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    return await fetch(address, { signal: stop.signal, headers: { accept: 'application/json', 'user-agent': AGENT } });
  } catch (err) {
    throw new Error(err && err.name === 'AbortError' ? 'too slow' : 'could not connect');
  } finally {
    clearTimeout(timer);
  }
}
// A source that answers "not found" has nothing; any other refusal is a failure.
async function lookupJSON(address, ms) {
  const res = await lookup(address, ms);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('answered ' + res.status);
  return res.json();
}

// WordNet through the free Datamuse API: [{ word, defs: ["n\tdefinition", ...] }].
async function wordnetDefs(term) {
  const words = await lookupJSON('https://api.datamuse.com/words?sp=' + encodeURIComponent(term.toLowerCase()) + '&md=d&max=3');
  const hit = (Array.isArray(words) ? words : []).find((w) => String(w.word || '').toLowerCase() === term.toLowerCase());
  return hit && Array.isArray(hit.defs) ? hit.defs.map((d) => String(d).replace(/^[a-z]+\t/, '')) : [];
}

// Wiktionary's own definitions, English only, with the links taken out.
async function wiktionaryDefs(term) {
  const data = await lookupJSON('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(term.toLowerCase().replace(/ /g, '_')));
  const defs = [];
  for (const part of (data && data.en) || []) {
    for (const d of part.definitions || []) {
      const text = String(d.definition || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      if (text) defs.push(text);
    }
  }
  return defs;
}

/* ---------------- drawing pictures ---------------- */

// "Draw it" in the editor: Cloudflare Workers AI draws a simple textbook style
// picture from the card's term and definition. Needs the Workers AI binding
// called AI on this Pages project (no key; it uses the account's free daily
// AI allowance, which the live game nickname check shares). FLUX.2 klein 9B
// is tried first (Gennaro picked it on 2026-09-30 from the drawing models
// test: the best pictures, about 7 a day on the free allowance), then klein
// 4B and FLUX.1 schnell if that fails. The picture is kept like an uploaded
// one, and the card's credit says it was drawn by AI.
const DRAW_MODELS = [
  ['@cf/black-forest-labs/flux-2-klein-9b', 'FLUX.2 klein 9B'],
  ['@cf/black-forest-labs/flux-2-klein-4b', 'FLUX.2 klein'],
  ['@cf/black-forest-labs/flux-1-schnell', 'FLUX.1 schnell']
];

const SCENE_RULES = `You plan pictures for middle school science flashcards. You get a vocabulary term and its definition. Reply with ONE sentence of at most 40 words describing a single simple, concrete scene that shows what the term means, using only things that can be drawn: organisms, objects, people, arrows, before and after panels. Scientifically accurate. Do not use the term itself or any word that gives it away, and never ask for writing, labels, letters, numbers or signs. Reply with the sentence only.`;

// A drawable scene for the term, or '' if the text AI is not available.
async function sceneFor(env, term, def) {
  try {
    const out = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [{ role: 'system', content: SCENE_RULES }, { role: 'user', content: 'Term: ' + term + '\nDefinition: ' + (def || '(none given)') }],
      max_tokens: 90,
      temperature: 0.8
    });
    let text = String((out && out.response) || '').replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
    // If the term slipped in anyway, leave it out.
    text = text.replace(new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '').replace(/\s+([,.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    return text.length > 10 ? text.slice(0, 400) : '';
  } catch {
    return '';
  }
}

async function drawImage(request, env) {
  if (!env.AI) return json({ error: 'Drawing is not switched on yet. It needs the Workers AI setting in Cloudflare (steps in the README, step 6).' }, 503);
  let body;
  try { body = await request.json(); } catch { body = null; }
  const term = String((body && body.term) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const def = String((body && body.def) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (term.length < 2) return json({ error: 'Type the term first, so there is something to draw.' }, 400);
  // The term itself is never put in the drawing instructions: a picture AI
  // given a word tends to write it on the picture, which would give the
  // answer away. A text AI first turns the term and definition into a scene
  // made only of things that can be drawn.
  const scene = (await sceneFor(env, term, def)) || def || term;
  const prompt = 'Flat clip art illustration in the style of a middle school science textbook, clear simple shapes, ' +
    'bright friendly colors, plain white background. ' + scene + ' ' +
    'A wordless picture: no text, no letters, no numbers, no captions, no labels, no signs.';
  const seed = Math.floor(Math.random() * 1e9);
  let lastError = 'no answer';
  for (const [model, name] of DRAW_MODELS) {
    try {
      let out;
      if (model.includes('flux-2')) {
        const form = new FormData();
        // 9B costs the same for any size up to 1024 x 1024, so it draws that big.
        const size = model.includes('9b') ? '1024' : '768';
        form.append('prompt', prompt);
        form.append('width', size);
        form.append('height', size);
        form.append('seed', String(seed));
        const packed = new Response(form);
        out = await env.AI.run(model, { multipart: { body: packed.body, contentType: packed.headers.get('content-type') } });
      } else {
        // No seed on this one, so a small change in the framing gives a new picture each time.
        const framing = ['Centered view.', 'Side view.', 'Close-up view.', 'Wide view.', 'Slightly tilted view.', 'Front view.'][seed % 6];
        out = await env.AI.run(model, { prompt: prompt + ' ' + framing, steps: 6 });
      }
      const b64 = out && typeof out.image === 'string' ? out.image : '';
      if (!b64) throw new Error('no picture came back');
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const saved = await putImage(env, 'image/jpeg', buf.buffer);
      if (!saved.ok) return saved;
      const info = await saved.json();
      return json({ ...info, credit: 'Drawn by AI (' + name + ') from this card', model: name });
    } catch (err) {
      lastError = String((err && err.message) || err).slice(0, 160);
    }
  }
  return json({ error: 'The AI could not draw a picture just now (' + lastError + '). Try again in a moment.' }, 502);
}

// The drawing models test page (/flashcards/draw-test/, teacher only): the
// same scene drawn by each of Cloudflare's own picture models, side by side,
// so Gennaro can pick the one Draw it should use. Nothing here is saved.
// All of these run on the free daily Workers AI allowance; the "Third-party"
// models in Cloudflare's list (OpenAI, Google) are not free, so none is here.
const TRY_MODELS = {
  'klein-4b': { id: '@cf/black-forest-labs/flux-2-klein-4b', form: true },
  'klein-9b': { id: '@cf/black-forest-labs/flux-2-klein-9b', form: true },
  'flux-2-dev': { id: '@cf/black-forest-labs/flux-2-dev', form: true },
  'lucid-origin': { id: '@cf/leonardo/lucid-origin' },
  'phoenix': { id: '@cf/leonardo/phoenix-1.0' },
  'schnell': { id: '@cf/black-forest-labs/flux-1-schnell', schnell: true }
};

function drawPrompt(scene) {
  return 'Flat clip art illustration in the style of a middle school science textbook, clear simple shapes, ' +
    'bright friendly colors, plain white background. ' + scene + ' ' +
    'A wordless picture: no text, no letters, no numbers, no captions, no labels, no signs.';
}

async function drawScene(request, env) {
  if (!env.AI) return json({ error: 'Drawing is not switched on yet.' }, 503);
  let body;
  try { body = await request.json(); } catch { body = null; }
  const term = String((body && body.term) || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const def = String((body && body.def) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (term.length < 2) return json({ error: 'Type the term first.' }, 400);
  const scene = (await sceneFor(env, term, def)) || def || term;
  return json({ scene, prompt: drawPrompt(scene) });
}

async function drawTry(request, env) {
  if (!env.AI) return json({ error: 'Drawing is not switched on yet.' }, 503);
  let body;
  try { body = await request.json(); } catch { body = null; }
  const m = TRY_MODELS[body && body.model];
  const prompt = String((body && body.prompt) || '').trim().slice(0, 1200);
  const seed = Math.abs(Math.floor(Number(body && body.seed))) % 1e9 || 12345;
  if (!m || prompt.length < 5) return json({ error: 'Pick a model and a prompt.' }, 400);
  const started = Date.now();
  try {
    let out;
    if (m.form) {
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('width', '768');
      form.append('height', '768');
      form.append('seed', String(seed));
      const packed = new Response(form);
      out = env.AI.run(m.id, { multipart: { body: packed.body, contentType: packed.headers.get('content-type') } });
    } else if (m.schnell) {
      out = env.AI.run(m.id, { prompt, steps: 6, seed });
    } else {
      out = env.AI.run(m.id, { prompt, width: 768, height: 768, seed });
    }
    // A model that is busy or stuck is reported instead of waited on forever.
    let timer;
    out = await Promise.race([out, new Promise((_, no) => { timer = setTimeout(() => no(new Error('no picture after 60 seconds')), 60000); })]).finally(() => clearTimeout(timer));
    // Some models answer { image: base64 }, others with the picture's bytes.
    let b64 = out && typeof out.image === 'string' ? out.image : '';
    if (!b64) {
      const buf = new Uint8Array(await new Response(out).arrayBuffer());
      if (buf.length < 100) throw new Error('no picture came back');
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      b64 = btoa(bin);
    }
    const type = b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('UklG') ? 'image/webp' : 'image/jpeg';
    return json({ image: 'data:' + type + ';base64,' + b64, ms: Date.now() - started });
  } catch (err) {
    return json({ error: String((err && err.message) || err).slice(0, 200), ms: Date.now() - started }, 502);
  }
}

/* ---------------- finding pictures ---------------- */

// "Find pictures" in the editor: five free to use pictures for a term.
//   1. Wikipedia: the pictures in the encyclopedia article about the term and
//      the lead pictures of the next closest articles. For science words these
//      are the most on target (diagrams, organisms, real examples).
//   2. Pixabay: clean photos and illustrations, safe search on, free to use
//      without credit. Only when the site has a free Pixabay key (a Cloudflare
//      secret called PIXABAY_KEY; steps in textbook/README.md).
//   3. Wikimedia Commons file search, then Openverse, only to fill in.
// Results from the sources are taken in turn so the five are varied. Google's
// image search has no free way in and most of its pictures are not free to
// reuse. Small previews are fetched here and sent as data, so the teacher's
// browser never asks another site for anything. The picture picked is copied
// to the site with images/from-url, and its credit is kept with the card.
// "checked" says what each source did.
async function imageSearch(url, env) {
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 100);
  const page = Math.min(10, Math.max(1, Number(url.searchParams.get('page')) || 1));
  if (q.length < 2) return json({ results: [] });
  const checked = {};
  const run = async (key, get) => {
    try {
      const list = await get(q, page, env);
      checked[key] = list.length ? 'found' : 'nothing';
      return list;
    } catch (err) {
      checked[key] = 'failed: ' + err.message;
      return [];
    }
  };
  const first = [run('wikipedia', wikipediaImages)];
  if (env.PIXABAY_KEY) first.push(run('pixabay', pixabayImages));
  const lists = await Promise.all(first);
  if (lists.flat().length < 8) lists.push(await run('commons', commonsImages));
  if (lists.flat().length < 8) lists.push(await run('openverse', openverseImages));
  // One from each source in turn.
  const found = [];
  const seen = new Set();
  for (let i = 0; found.length < 8 && lists.some((l) => l.length > i); i++) {
    for (const l of lists) {
      const r = l[i];
      if (r && !seen.has(r.urls[0]) && found.length < 8) { seen.add(r.urls[0]); found.push(r); }
    }
  }
  const results = [];
  for (const r of await Promise.all(found.map(withPreview))) {
    if (r && results.length < 5) results.push(r);
  }
  return json({ results, checked }, 200, { 'cache-control': 'private, max-age=3600' });
}

const WIKI = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&action=query';
// Little pictures every article carries that are never what a card needs.
const WIKI_SKIP = /(?:icon|logo|symbol|flag|stub|question[_ ]book|edit-clear|padlock|commons-|wiktionary|wikiquote|wikisource|wikibooks|portal|disambig|ambox|crystal|nuvola|folder|increase|decrease|steady|blank|placeholder|signature|audio|speaker|loudspeaker|red_pog|location[_ ]map)/i;

async function wikipediaImages(q, page) {
  // The closest articles, each with its lead picture.
  const found = await lookupJSON(WIKI + '&generator=search&gsrsearch=' + encodeURIComponent(q) + '&gsrlimit=6&prop=pageimages&piprop=name', 4000);
  const articles = ((found && found.query && found.query.pages) || []).sort((x, y) => (x.index || 0) - (y.index || 0));
  if (!articles.length) return [];
  // Every picture in the two closest articles.
  const inTop = await lookupJSON(WIKI + '&titles=' + encodeURIComponent(articles.slice(0, 2).map((a) => a.title).join('|')) + '&prop=images&imlimit=60', 4000);
  const filesOf = new Map((((inTop && inTop.query && inTop.query.pages) || [])).map((p) => [p.title, (p.images || []).map((f) => f.title)]));
  // A picture whose file name shares words with the search is more likely
  // to show the idea itself than a map or a portrait further down the page.
  const words = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const score = (n) => words.filter((w) => n.toLowerCase().includes(w)).length;
  const ranked = (list) => list.map((n, i) => [n, score(n), i]).sort((x, y) => y[1] - x[1] || x[2] - y[2]);
  const names = [];
  const addName = (n) => { n = String(n || '').replace(/_/g, ' '); if (n && !WIKI_SKIP.test(n) && !names.includes(n)) names.push(n); };
  const first = ranked(filesOf.get(articles[0].title) || []);
  // The closest article's lead picture, then its pictures that match the
  // search, then the other articles' lead pictures, then everything else.
  if (articles[0].pageimage) addName('File:' + articles[0].pageimage);
  first.filter((r) => r[1] > 0).forEach((r) => addName(r[0]));
  articles.slice(1).forEach((a) => { if (a.pageimage) addName('File:' + a.pageimage); });
  first.filter((r) => r[1] === 0).forEach((r) => addName(r[0]));
  if (articles[1]) ranked(filesOf.get(articles[1].title) || []).forEach((r) => addName(r[0]));
  const want = names.slice((page - 1) * 12, page * 12);
  if (!want.length) return [];
  const info = await lookupJSON(WIKI + '&titles=' + encodeURIComponent(want.join('|')) + '&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=960&iiextmetadatafilter=Artist|LicenseShortName', 4000);
  const byName = new Map(((info && info.query && info.query.pages) || []).map((p) => [p.title, p]));
  return want
    .map((n) => byName.get(n))
    .filter(Boolean)
    .map((p) => ({ p, ii: (p.imageinfo || [])[0] }))
    // Diagrams drawn as SVG come back as a PNG picture, so they can be kept.
    .filter(({ ii }) => ii && ii.thumburl && /^image\/(?:jpeg|png|gif|webp|svg\+xml)$/.test(ii.mime || '') && (ii.width || 0) >= 200 && (ii.height || 0) >= 150)
    .map(({ p, ii }) => {
      const meta = ii.extmetadata || {};
      const title = String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ');
      const artist = plainText(meta.Artist && meta.Artist.value);
      const license = plainText(meta.LicenseShortName && meta.LicenseShortName.value);
      const thumb = /\/960px-/.test(ii.thumburl) ? ii.thumburl : ii.url;
      return {
        title,
        credit: ['"' + title + '"', artist ? 'by ' + artist : '', license, '(Wikipedia)'].filter(Boolean).join(' '),
        preview: /\/960px-/.test(ii.thumburl) ? ii.thumburl.replace(/\/960px-/, '/250px-') : ii.thumburl,
        urls: [thumb]
      };
    });
}

// Pixabay: https://pixabay.com/api/docs/ (free key, pictures are free to use
// without credit; Pixabay asks that pictures are copied, never linked).
async function pixabayImages(q, page, env) {
  const data = await lookupJSON('https://pixabay.com/api/?key=' + encodeURIComponent(env.PIXABAY_KEY) + '&q=' + encodeURIComponent(q) +
    '&image_type=all&safesearch=true&per_page=10&page=' + page + '&lang=en', 4000);
  return ((data && data.hits) || [])
    .filter((h) => h.webformatURL && (h.largeImageURL || h.webformatURL))
    .map((h) => {
      const title = String(h.tags || q).split(',')[0].trim() || q;
      return {
        title,
        credit: ['"' + title + '"', h.user ? 'by ' + h.user : '', 'Pixabay License', '(Pixabay)'].filter(Boolean).join(' '),
        preview: h.webformatURL,
        urls: [h.largeImageURL, h.webformatURL].filter(Boolean)
      };
    });
}

const PICTURE = /^(?:jpe?g|png|gif|webp)$/i;
const plainText = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

async function openverseImages(q, page) {
  const data = await lookupJSON('https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) + '&page_size=10&page=' + page + '&mature=false', 4000);
  return ((data && data.results) || [])
    .filter((r) => r.url && r.thumbnail && (!r.filetype || PICTURE.test(r.filetype)))
    .map((r) => {
      const license = (String(r.license || '').toLowerCase() === 'pdm' ? 'public domain' : 'CC ' + String(r.license || '').toUpperCase() + (r.license_version ? ' ' + r.license_version : '')).trim();
      const small = r.filesize ? r.filesize < 4 * 1024 * 1024 : (r.width || 0) <= 3000;
      return {
        title: plainText(r.title) || q,
        credit: [plainText(r.title) ? '"' + plainText(r.title) + '"' : '', r.creator ? 'by ' + plainText(r.creator) : '', license, r.source ? '(' + r.source + ')' : ''].filter(Boolean).join(' '),
        preview: r.thumbnail,
        urls: small ? [r.url, r.thumbnail] : [r.thumbnail]
      };
    });
}

async function commonsImages(q, page) {
  const address = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6' +
    '&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + q) + '&gsrlimit=10&gsroffset=' + (page - 1) * 10 +
    '&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=960&iiextmetadatafilter=Artist|LicenseShortName';
  const data = await lookupJSON(address, 4000);
  const pages = Object.values((data && data.query && data.query.pages) || {}).sort((x, y) => (x.index || 0) - (y.index || 0));
  return pages
    .map((p) => ({ p, info: (p.imageinfo || [])[0] }))
    .filter(({ info }) => info && info.thumburl && /^image\/(?:jpeg|png|gif|webp)$/.test(info.mime || ''))
    .map(({ p, info }) => {
      const meta = info.extmetadata || {};
      const title = String(p.title || '').replace(/^File:/, '').replace(/\.[a-z]+$/i, '');
      const artist = plainText(meta.Artist && meta.Artist.value);
      const license = plainText(meta.LicenseShortName && meta.LicenseShortName.value);
      return {
        title,
        credit: ['"' + title + '"', artist ? 'by ' + artist : '', license, '(Wikimedia Commons)'].filter(Boolean).join(' '),
        preview: info.thumburl.replace(/\/960px-/, '/250px-'),
        urls: [info.thumburl]
      };
    });
}

// The preview, fetched here and handed over as data. A picture whose preview
// will not load is left out.
async function withPreview(r) {
  try {
    const res = await fetch(r.preview, { headers: { accept: 'image/*', 'user-agent': AGENT } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const type = sniff(buf);
    if (!type || type === 'image/svg+xml' || buf.byteLength > 400000) return null;
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { title: r.title.slice(0, 200), credit: r.credit.slice(0, 300), preview: 'data:' + type + ';base64,' + btoa(bin), urls: r.urls };
  } catch {
    return null;
  }
}

/* ---------------- pictures ---------------- */

async function readLimited(request, max) {
  if (Number(request.headers.get('content-length') || 0) > max) return null;
  const buf = await request.arrayBuffer();
  return buf.byteLength > max ? null : buf;
}

// What a picture really is, from its first bytes, for sites that label every
// file "application/octet-stream".
function sniff(buf) {
  const b = new Uint8Array(buf.slice(0, 16));
  const s = String.fromCharCode(...b);
  if (b[0] === 0x89 && s.slice(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (s.startsWith('GIF8')) return 'image/gif';
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return 'image/webp';
  if (s.slice(4, 12) === 'ftypavif') return 'image/avif';
  const head = new TextDecoder().decode(buf.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return '';
}

// GIFs and animated WebPs are never shrunk in the browser, which would keep
// only the first frame, and may be up to 10 MB. (An animated WebP says so in
// its header; GIFs are simply all let through, since counting frames in a
// big one costs more time than the site has.)
function isAnimated(buf, type) {
  if (type === 'image/gif') return true;
  const b = new Uint8Array(buf.slice(0, 32));
  return type === 'image/webp' && b.length > 21 && String.fromCharCode(...b.subarray(12, 16)) === 'VP8X' && (b[20] & 0x02) !== 0;
}

async function putImage(env, declared, buf) {
  const type = sniff(buf) || String(declared || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(type)) return json({ error: 'That is not a picture the site can keep. Use a PNG, JPG, GIF, WebP or SVG.' }, 415);
  const animated = isAnimated(buf, type);
  if (!animated && buf.byteLength > MAX_IMAGE) return json({ error: 'That picture is bigger than 5 MB.' }, 413);
  const name = hex(await crypto.subtle.digest('SHA-256', buf));
  const key = 'img:' + name;
  // The same picture always gets the same name, so adding it twice costs nothing.
  const existing = await env.FLASHCARDS.get(key, 'stream');
  if (existing) await existing.cancel();
  else await env.FLASHCARDS.put(key, buf, { metadata: { type } });
  return json({ url: '/api/images/' + name, bytes: buf.byteLength, type, animated });
}

const privateHost = (u) => /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname);

async function imageFromUrl(request, env) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  let target;
  try { target = new URL(String(body && body.url || '').trim()); } catch { target = null; }
  if (!target || !/^https?:$/.test(target.protocol) || privateHost(target)) {
    return json({ error: 'That does not look like a web address. It should start with https://' }, 400);
  }
  let got = await fetchPicture(target);
  // A GIF site's page (Giphy, Tenor and most others) names its picture in
  // the page's og:image tag, so a link to the page works as well.
  if (got.page) {
    const m = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i.exec(got.page) ||
      /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(got.page);
    let pic = null;
    try { pic = m ? new URL(m[1].replace(/&amp;/g, '&'), target) : null; } catch { pic = null; }
    if (!pic || !/^https:$/.test(pic.protocol) || privateHost(pic)) return json({ error: 'That address is a web page, not a picture. Right-click the picture itself and choose "Copy image address".' }, 415);
    // Giphy's page picture is a still; its animated GIF sits next to it.
    if (/(^|\.)giphy\.com$/.test(pic.hostname)) pic = new URL(pic.pathname.replace(/\/[^/]*$/, '/giphy.gif'), pic);
    got = await fetchPicture(pic);
    if (got.page) return json({ error: 'That address is a web page, not a picture. Right-click the picture itself and choose "Copy image address".' }, 415);
  }
  // Giphy keeps a smaller copy of every GIF, for the ones over 10 MB.
  if (got.tooBig && /(^|\.)giphy\.com$/.test(got.url.hostname) && /\/giphy\.gif$/.test(got.url.pathname)) {
    got = await fetchPicture(new URL(got.url.pathname.replace(/giphy\.gif$/, 'giphy-downsized.gif'), got.url));
  }
  if (got.error) return got.error;
  if (got.tooBig) return json({ error: 'That picture is bigger than 10 MB.' }, 413);
  return putImage(env, got.type, got.buf);
}

// { buf, type } for a picture, { page } for a web page, or { error }.
async function fetchPicture(url) {
  let res;
  try {
    res = await fetch(url.toString(), { redirect: 'follow', headers: { accept: 'image/avif,image/webp,image/*;q=0.9,text/html;q=0.5', 'user-agent': 'Mozilla/5.0 (compatible; ClassroomVocabulary flashcards)' } });
  } catch {
    return { url, error: json({ error: 'That website could not be reached.' }, 400) };
  }
  if (!res.ok) return { url, error: json({ error: `That website would not send the picture (it answered ${res.status}).` }, 400) };
  if (Number(res.headers.get('content-length') || 0) > MAX_ANIMATED) { await res.body?.cancel(); return { url, tooBig: true }; }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_ANIMATED) return { url, tooBig: true };
  if ((res.headers.get('content-type') || '').includes('text/html') && !sniff(buf)) return { url, page: new TextDecoder().decode(buf.slice(0, 300000)) };
  return { url, buf, type: res.headers.get('content-type') };
}

async function getImage(env, name) {
  if (!env.FLASHCARDS || !/^[0-9a-f]{64}$/.test(name)) return json({ error: 'Not found.' }, 404);
  const { value, metadata } = await env.FLASHCARDS.getWithMetadata('img:' + name, { type: 'arrayBuffer', cacheTtl: 86400 });
  if (!value) return json({ error: 'Not found.' }, 404);
  return new Response(value, {
    headers: {
      'content-type': (metadata && metadata.type) || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      // An SVG opened on its own could carry a script. This stops it running.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    }
  });
}
