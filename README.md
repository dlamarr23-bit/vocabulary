# Moved into physical-science-8

On 2026-11-19 everything in this repository moved into
[dlamarr23-bit/physical-science-8](https://github.com/dlamarr23-bit/physical-science-8), so the review pages
(flashcards, the live class games, Class Pass, the leaderboard) are part of the class site,
physical-science-8.pages.dev. There:

- `app/` is the pages (they were `site/public/` here). A page is at `/app/<its old address>`, and the class site's own
  pages show them under its top bar: `/flashcards` (Review), `/join` (Join a game), `/leaderboard`.
- `app-source/` is the build (`node app-source/build.mjs`), the page templates and the server (`app-source/server/worker.js`).
- `game-server/` is the live game server (the `vocab-live` Worker).

The full history of this repository is still here, in the commits before this one.

## What this repository does now

The Cloudflare Pages project `vocabulary-room901` still builds from here, so the old address keeps working:
`site/public/_worker.js` sends every page to the same page on the class site (for old links, bookmarks and QR codes)
and passes `/api/...` straight through to the class site's server (Google Sheets still send review game points and
the class list here). Do not add anything else here: change the class site instead.
