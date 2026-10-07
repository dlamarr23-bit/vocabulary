// The frame every page shares: head, top bar, menu and footer.
import { site, units } from '../content/site.mjs';
import { mascotSVG } from './mascot.mjs';

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FAVICON = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 64 64%27%3E%3Crect x=%2720%27 y=%2710%27 width=%2736%27 height=%2728%27 rx=%276%27 fill=%27%239db8f2%27/%3E%3Crect x=%278%27 y=%2724%27 width=%2738%27 height=%2730%27 rx=%276%27 fill=%27%231d4ed8%27/%3E%3C/svg%3E';

export function head({ title, description, unitId, depth, extraHead = '' }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="description" content="${esc(description)}">
<title>${esc(title)}</title>
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${up}assets/book.css">
<script src="${up}assets/icons.js" defer></script>
<script src="${up}assets/book.js" defer></script>
${extraHead}</head>
<body${unitId ? ` data-unit="${unitId}"` : ''}>
<a class="skip" href="#main">Skip to the page</a>`;
}

export function topbar(depth, activeKey) {
  const up = '../'.repeat(depth);
  const links = site.links.map((l) => {
    const href = l.external ? l.href : up + l.href;
    const cls = l.key === activeKey ? ' class="active"' : '';
    const rel = l.external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${esc(href)}"${cls}${rel}>${esc(l.label)}</a>`;
  }).join('');
  return `<div class="topbar"><div class="topbar-inner">
<a class="brand" href="${up}index.html">
<span class="dot" aria-hidden="true"></span>
<span class="mascot" aria-hidden="true">${mascotSVG}</span>
<span>${esc(site.brandLine)}${site.brandSub ? `<small>${esc(site.brandSub)}</small>` : ''}</span>
</a>
<nav class="inline-links" aria-label="Site">${links}</nav>
<button class="menu-btn" id="openDrawer" aria-expanded="false" aria-controls="drawer">&#9776; Menu</button>
</div></div>`;
}

export function drawer(depth, chapters, currentUnitId, currentChapterId) {
  const up = '../'.repeat(depth);
  const blocks = units.map((u) => {
    const own = chapters.filter((c) => c.unit === u.id);
    const items = own.map((c) => `<li><a class="${c.id === currentChapterId ? 'active' : ''}" href="${up}${u.slug}/${c.slug}/"><span class="check" data-chapter="${c.id}"></span> ${esc(c.title)}</a></li>`).join('');
    return `<div class="unit-block${u.id === currentUnitId ? ' current' : ''}">
<a class="unit-title" href="${up}${u.slug}/">Unit ${u.number}: ${esc(u.title)}</a>
<ul>${items}</ul>
</div>`;
  }).join('');
  return `<div class="drawer-backdrop" id="drawerBackdrop"></div>
<div class="drawer" id="drawer" aria-label="Menu">
<button class="drawer-close" id="closeDrawer" aria-label="Close the menu">&times;</button>
<h2 class="drawer-title">Menu</h2>
<nav class="drawer-links" aria-label="Site">${site.links.map((l) => `<a href="${esc(l.external ? l.href : up + l.href)}"${l.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(l.label)}</a>`).join('')}</nav>
${blocks}
</div>`;
}

export function footer(depth) {
  return `<footer><div class="container">${esc(site.title)} &middot; ${esc(site.tagline)} </div></footer>
</body>
</html>`;
}

