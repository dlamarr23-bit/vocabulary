// Checks the live games' nickname filter (game-server/src/names.js).
// Run after `npm ci` in game-server. The monthly "Update the
// nickname filter" workflow runs it before a new obscenity library version
// goes live, so an update that stops catching rude names, or blocks
// ordinary ones, never reaches students.
//
// The rude test names are stored in ROT13 so the words are not sitting in
// plain text in the repository.
import { rudeName, cleanName } from '../game-server/src/names.js';

const rot13 = (s) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
});

// Must be refused: swearing, look-alike letters, spaced out letters, and our own list.
const RUDE = ['shpx', 'fuvg', 'ovgpu', 'Fu1gURNQ', 'nffubyr', 'q v p x', 'Xvyy Wnpx', 'c00c', 'fghcvq'].map(rot13);
// Must pass: ordinary names and harmless words that contain rude letters.
const OK = ['Maria G', 'Jayden R', 'Grape', 'Peacock', 'Scunthorpe', 'Torpedo', 'Class', 'Skill', 'Button',
  'Nguyen T', 'Hannah', 'Dakota'];

const wrong = [];
for (const n of RUDE) if (!rudeName(cleanName(n))) wrong.push('let through a rude name (ROT13: ' + rot13(n) + ')');
for (const n of OK) if (rudeName(cleanName(n))) wrong.push('blocked an ordinary name: ' + n);

if (wrong.length) {
  console.error('Nickname filter check failed:\n  ' + wrong.join('\n  '));
  process.exit(1);
}
console.log('Nickname filter check passed (' + RUDE.length + ' rude names refused, ' + OK.length + ' ordinary names allowed).');
