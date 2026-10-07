// Builds the vocabulary site into public/. No packages needed: node build.mjs
// Run it after changing content/site.mjs (the site's name and top bar), then
// push. Your sets are not in here: they are saved on Cloudflare (KV) from the
// Flashcards page, so they never need a rebuild.
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { site } from './content/site.mjs';
import { iconsScript } from './lib/icons.mjs';
import { esc } from './lib/render.mjs';
import { renderEditMoved, renderFlashcardIndex, renderOwnSetShell, defaultLibrary, renderDrawTest } from './lib/flashcards.mjs';
import { renderLiveHost, renderLiveJoin } from './lib/live.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'public');

// Keep assets, replace every generated page.
for (const entry of existsSync(OUT) ? readdirSync(OUT) : []) {
  if (entry === 'assets') continue;
  rmSync(join(OUT, entry), { recursive: true, force: true });
}
mkdirSync(OUT, { recursive: true });

const write = (rel, body) => {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
};

// The home address opens the Flashcards page.
write('index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url=flashcards/">
<title>${esc(site.title)}</title>
</head>
<body><p><a href="flashcards/">Open the flashcards</a></p></body>
</html>
`);
write('assets/icons.js', iconsScript);

// No starter sets: the library begins empty and the teacher fills it.
const library = defaultLibrary([], [], {});
write('assets/flashcard-library.json', JSON.stringify(library) + '\n');
write('assets/flashcard-sets.json', '[]\n');
write('assets/glossary.json', '[]\n');
write('flashcards/index.html', renderFlashcardIndex([], library));
write('flashcards/my/set/index.html', renderOwnSetShell([]));
write('flashcards/draw-test/index.html', renderDrawTest([]));
write('edit/index.html', renderEditMoved());
write('live/index.html', renderLiveHost([], [], {}));
write('join/index.html', renderLiveJoin([]));

// The server (Cloudflare Pages runs public/_worker.js), with this site's name.
const server = readFileSync(join(here, 'server/worker.js'), 'utf8')
  .split("' | __SITE_TITLE__'").join(JSON.stringify(' | ' + site.title));
write('_worker.js', server);
write('_routes.json', JSON.stringify({
  version: 1,
  include: ['/api/*', '/flashcards', '/flashcards/*', '/live', '/live/*'],
  exclude: []
}, null, 2) + '\n');
write('robots.txt', 'User-agent: *\nDisallow: /\n');
write('_headers', `/*
  Content-Security-Policy: frame-ancestors 'self' https://physical-science-8.pages.dev
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow

/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`);

console.log(`Built "${site.title}" into public/.`);
