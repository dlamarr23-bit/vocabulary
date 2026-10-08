// Your site's name and the links in its top bar. Change these, then run
// `node build.mjs` in this folder and push. (The README explains.)
export const site = {
  // The browser tab and the footer.
  title: 'Vocabulary',
  tagline: 'Flashcards and live vocabulary games',
  // The name in the top bar, and an optional second line under it ('' for none).
  brandLine: 'Vocabulary',
  brandSub: '',
  links: [
    { label: 'Flashcards', href: 'flashcards/', key: 'flashcards' },
    { label: 'Host a game', href: 'live/', key: 'live' },
    { label: 'Join a game', href: 'join/', key: 'join' },
    { label: 'Leaderboard', href: 'leaderboard/', key: 'leaderboard' }
  ]
};

// The kit has no textbook units; the page templates expect this list.
export const units = [];
