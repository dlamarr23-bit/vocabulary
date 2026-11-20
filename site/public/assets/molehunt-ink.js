/* ============================================================
   Mole Hunt: the hand drawn lab notebook look (Donny, 2026-11-19: "let's go
   with style 1"). Two jobs, for the teacher's screen, the students' screens
   and the Teacher Remote:

   1. Ink outlines. Every box listed in BOXES gets a wobbly pen outline (two
      passes, like a real pen), its fill, and if the style sheet asks, a hard
      shadow, hatching, a colored stripe or a dashed line. The shapes are
      drawn in an SVG behind the box's own content; their colors are CSS
      variables (--ink-fill, --ink-line, --ink-shade, --ink-hatch,
      --ink-stripe), so a theme change or a hover needs no redraw. A box is
      drawn again only when its size changes or the game empties it, so
      nothing flickers.
   2. Ink doodles for emoji. Every emoji in the game's text becomes a matching
      hand drawn icon from the sprite below (ICONS), so no screen shows
      computer emoji. The game's code keeps writing emoji; this swaps them as
      they appear.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- 1. the doodles ---------------- */
  var G = '<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">';
  var RING = '<path d="M24.6 5.6C35 5.4 42.6 13.4 42.4 24 42.2 34.4 34.2 42.4 23.8 42.2 13.6 42 5.6 34 5.8 23.8 6 13.6 14 5.6 25.2 5.8"/>';
  var ICONS = {
    scan: '<circle cx="21.6" cy="21.4" r="12.4" fill="#cfe9f7"/>' + G + '<path d="M20 7.2C28.4 6.6 34.4 12.6 34 20.8 33.6 28.6 27.4 34.2 19.8 33.8 12 33.4 6.6 27.2 7 19.6 7.4 12.4 12.8 7.6 21.4 7.4"/><path d="M30.4 30.8 41.8 42.4" stroke-width="5.6"/><path d="M13.4 17.6C14 13.8 16.2 12 19.4 11.6" stroke-width="2.4"/></g>',
    mega: '<path d="M11.6 19.6 31.6 9.8 31.4 38.4 11.8 29.6Z" fill="#ffcf3a"/>' + G + '<path d="M10.2 18.6 10.8 28.8"/><path d="M10.2 18.6 30.6 8.6C32.8 15 33.2 30 30.4 38L10.8 28.8"/><path d="M30.6 8.6C33.4 9 34.8 15.6 34.6 23.4 34.4 31.6 32.6 38.2 30.4 38"/><path d="M15 30.6 17.4 40.4 22.4 39.6 20.6 32.6"/><path d="M38.6 17.6C40.8 20.8 40.8 26 38.6 29.4" stroke-width="2.6"/><path d="M42.6 13.4C46.4 19 46.4 28 42.4 33.8" stroke-width="2.6"/></g>',
    radio: '<rect x="8.4" y="18.4" width="33.6" height="23.6" rx="2" fill="#8fd0c2"/>' + G + '<path d="M7.4 17.6C18 16.8 30 17.2 41 17.2 41.6 25 41.4 33 40.8 41.6 30 42.2 18 42 7.8 41.4 7 33 7 25 7.4 17.6Z"/><path d="M13 17 33.6 5.4"/><circle cx="17.6" cy="29.6" r="6.6" fill="#fffdf6"/><path d="M15 27.6h5.4M14.6 30.4h6.2M15.2 33.2h4.6" stroke-width="2"/><path d="M28.6 24.4h7.8M28.6 29.4h7.8" stroke-width="2.6"/><circle cx="32.4" cy="35.6" r="2.4" stroke-width="2.4"/></g><circle cx="33.6" cy="5.4" r="2.2" fill="currentColor"/>',
    bell: '<path d="M13.6 34.6Q15.6 30.6 15.6 22.6Q15.6 12.6 25 11.6Q34.4 12.6 34.6 22.6Q34.6 30.6 37 34.6Z" fill="#ffc933"/>' + G + '<path d="M12.4 34.2C14.6 30.6 14.8 26.4 14.8 21.8 14.6 14.4 18.6 10.6 24 10.4 29.6 10.2 33.6 14.2 33.6 21.6 33.6 26.6 34 30.8 36.4 34"/><path d="M9.6 34.6C19 36.4 29.4 36.2 39 34.2"/><path d="M21.4 37.6C21.8 41.4 26.4 41.6 26.8 37.8"/><path d="M22.4 10.2C22.4 7.4 25.8 7.2 25.8 10.2"/><path d="M6.4 16.8C4.4 20.4 4.6 24.6 6.6 27.8M41.6 16.8C43.6 20.4 43.4 24.6 41.4 27.8" stroke-width="2.6"/></g>',
    beaker: '<path d="M12.6 28.4C18 27 30 27 35.6 28.4L39.4 40.6C39.8 42.4 38.8 43.2 37 43.2H11.2C9.4 43.2 8.4 42.2 9 40.6Z" fill="#7ed67a"/>' + G + '<path d="M17.6 6.4 17.4 19.8 8.6 40.6C7.8 42.8 9.2 44 11.2 44H37C39.2 44 40.4 42.6 39.6 40.4L30.8 19.6 30.6 6.4"/><path d="M14 6.2C20.6 5.6 27.6 5.8 34.2 6.2"/><path d="M12.4 28.6C17 26.4 21 30.6 24.6 28.4 28.2 26.4 32 30 35.8 28.4" stroke-width="2.4"/><circle cx="19.6" cy="36.6" r="2.2" stroke-width="2.2"/><circle cx="27.6" cy="33.4" r="1.5" stroke-width="2"/><circle cx="29.4" cy="39.4" r="2" stroke-width="2.2"/></g>',
    bolt: '<path d="M29.2 5 11.8 28H23.4L19.2 44.8 39 19H26.2Z" fill="#ffd21f"/>' + G + '<path d="M27.8 3.8 10.4 27.2C16 27.6 19.6 27 22.4 27.4L17.8 44.6C24.4 35.8 31.2 27 37.8 18.2 33.6 18.2 29.4 17.8 25 18.2L27.8 3.8Z"/></g>',
    lock: '<path d="M10.4 22.4H40.2V43.8H10.4Z" fill="#f0c04a"/>' + G + '<path d="M15.4 21.2V14.4C15.2 8.6 19 5.4 24 5.4 29.2 5.4 32.8 8.8 32.8 14.6V21.2"/><path d="M9 21.6C19 20.8 29.6 21 39.6 21.2 39.8 28.6 39.6 35.6 39.2 43.4 29.4 43.8 19.2 43.8 9.4 43.4 8.8 36 8.8 28.8 9 21.6Z"/><circle cx="24.2" cy="30" r="3"/><path d="M24.2 33 24 38"/></g>',
    flag: '<path d="M10.8 6.4C16 3.4 21.6 4 27 6.6 32.2 9 37.6 9.4 42.6 6.4 42.8 13 42.6 19.6 42.8 26 37.6 29.4 32 28.6 27 26.2 21.6 23.6 16 23.4 10.8 26.2Z" fill="#fffdf6"/><path d="M10.8 6.4C13 5.2 15.6 4.6 18.2 4.7V15.4C15.6 15.2 13 15.6 10.8 16.4ZM26.2 6.2C28.8 7.4 31.4 8.4 34.4 8.6V18.2C31.6 18 28.8 17 26.2 15.8ZM18.2 15.4C21 15.6 23.6 16.6 26.2 17.8V27.2C23.6 26 21 24.6 18.2 24.4ZM34.4 18.2C37.4 18.4 40.2 17.6 42.8 16.2V26.2C40.2 27.8 37.4 28.6 34.4 28.4Z" fill="#1b1a1e"/>' + G + '<path d="M10.6 45.4 10.4 3.4"/><path d="M10.8 6.4C16 3.4 21.6 4 27 6.6 32.2 9 37.6 9.4 42.6 6.4 42.8 13 42.6 19.6 42.8 26 37.6 29.4 32 28.6 27 26.2 21.6 23.6 16 23.4 10.8 26.2"/></g>',
    redflag: '<path d="M12 7.4C17.6 4.6 23 9.6 28.6 7.6 32.4 6.4 35.2 5.6 39.4 6.4 37.6 11 37.8 15.6 39.6 20.2 34.6 19.4 31 21 27.2 22.2 21.6 24 17.4 20.6 12.2 22.8Z" fill="#e5483a"/>' + G + '<path d="M11.4 44.2 11.8 4.6"/><path d="M12 7.4C17.6 4.6 23 9.6 28.6 7.6 32.4 6.4 35.2 5.6 39.4 6.4 37.6 11 37.8 15.6 39.6 20.2 34.6 19.4 31 21 27.2 22.2 21.6 24 17.4 20.6 12.2 22.8"/></g>',
    clock: '<circle cx="24.6" cy="28" r="15.2" fill="#fffdf6"/>' + G + '<path d="M24.4 12C33 11.8 39.8 18.6 39.6 27.4 39.4 36 32.6 42.8 24 42.6 15.4 42.4 8.6 35.6 8.8 27 9 18.6 15.6 12 24.8 12.2"/><path d="M20.2 5.6H28M24.2 5.8V11.6"/><path d="M36 13.6 38.8 10.8"/><path d="M24.2 27.6V18.6M24.2 27.6 30.6 31"/></g>',
    check: '<path d="M7.6 25.6C11.4 28.6 15 32.6 18.6 37.4 24.4 26.6 31.4 17.6 41.6 9" fill="none" stroke="var(--nb-sci, #16883a)" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/>',
    pause: '<circle cx="24" cy="24" r="17.6" fill="#cfe9f7"/>' + G + RING + '<path d="M18.4 15.8 18.6 32.4M29.8 15.6 29.6 32.4" stroke-width="5.6"/></g>',
    play: '<circle cx="24" cy="24" r="17.6" fill="#c9f0c4"/>' + G + RING + '<path d="M19.4 15.4 33.6 24.2 19.2 32.8Z" fill="#1b1a1e"/></g>',
    skip: '<circle cx="24" cy="24" r="17.6" fill="#cfe9f7"/>' + G + RING + '<path d="M14.6 16.2 23.2 24 14.6 31.8ZM23.6 16.2 32.2 24 23.6 31.8Z" fill="#1b1a1e" stroke-width="2"/><path d="M34.4 15.8V32.2"/></g>',
    ghost: '<path d="M12.6 41V21Q12.6 8.6 24 8.6Q35.4 8.6 35.4 21V41L31.4 37.2 27.6 41 24 37.2 20.2 41 16.4 37.2Z" fill="#fffdf6"/>' + G.replace('3.2', '3') + '<path d="M12.2 40.8C12 34 11.8 27.6 12.2 21 12.8 12.8 17.6 8 24.2 8 31 8.2 35.6 13 35.8 21 36 27.6 35.8 34.2 35.6 40.8L31.6 37 27.8 41 24 37.2 20.2 41 16.2 37.2Z"/><path d="M19.6 20.2v3M28.2 20.2v3" stroke-width="3.8"/><path d="M22 28.6C22.6 27 25.4 27 26 28.6 25.4 30.4 22.6 30.4 22 28.6Z" stroke-width="2.2"/></g>',
    players: '<circle cx="17.4" cy="16" r="6.6" fill="#ffd9b0"/><path d="M6.4 39C6.8 31.4 11 27 17.2 27 23.4 27 27.6 31.6 27.8 39Z" fill="#8fd0c2"/>' + G + '<path d="M17.4 9.2C21.4 9.2 23.8 12 23.6 16 23.4 19.8 20.8 22.4 17 22.2 13.2 22 10.6 19.4 10.8 15.6 11 12 13.6 9.2 17.6 9.4"/><path d="M5.8 39.6C6 31.4 10.4 26.4 17.2 26.4 24 26.4 28.2 31.6 28.4 39.6Z"/><path d="M31.6 12.6C35 12.4 37.4 14.8 37.2 18.2 37 21.2 34.8 23.2 31.8 23"/><path d="M31.6 27.4C38 27 42.4 31.4 42.4 38.6H32.8"/></g>',
    remote: '<rect x="14.2" y="5.4" width="20.2" height="37.6" rx="3" fill="#cfe9f7"/>' + G + '<path d="M16.4 4.8C21.4 4.4 26.6 4.6 31.6 4.8 33.6 5 34.6 6.2 34.6 8.2 34.8 19.4 34.8 30.6 34.4 40.4 34.4 42.4 33.2 43.4 31.2 43.4 26.4 43.6 21.4 43.6 16.6 43.4 14.6 43.2 13.6 42.2 13.6 40.2 13.4 29.6 13.4 18.6 13.8 8 13.8 6 14.8 5 16.4 4.8Z"/><path d="M14 35.6C20.8 35.2 27.6 35.4 34.4 35.6" stroke-width="2.4"/><path d="M19.6 18.4C22.2 16.4 25.8 16.4 28.4 18.4M17 14.6C21.4 11.4 26.6 11.4 31 14.6" stroke-width="2.4"/></g>',
    stop: G + '<path d="M17 5.2 31.2 5 43 16.8 42.8 31.2 31 43 16.8 42.8 5.2 31 5.4 16.8Z" fill="#e5483a"/><path d="M17.4 17.2 30.8 30.8M30.6 17.4 17.2 30.6" stroke="#fffdf6" stroke-width="4.6"/></g>',
    vote: '<path d="M17 24V7H32V24Z" fill="#fffdf6"/><path d="M7 24.2H41.4V43.6H7Z" fill="#cfe9f7"/>' + G + '<path d="M16.6 23.4 16.8 6.6C22 6.2 27 6.4 32 6.6L31.8 23.4"/><path d="M20 15.4 23 18.4 28.6 11.4" stroke-width="2.8"/><path d="M6.6 24C18 23.6 30 23.6 41.6 24 41.8 30.6 41.6 37 41.4 43.6 30 44 18 44 6.8 43.6 6.4 37 6.4 30.6 6.6 24Z"/><path d="M13.6 31.6H34.6" stroke-width="2.6"/></g>',
    flame: '<path d="M24 43.6C14.6 43.4 10 37.4 10.8 30 11.4 23.4 16.2 19.4 19 14.4 20.6 18.6 21.8 21 24.6 22.6 23.4 15 26.4 8.4 31.4 4.4 31.6 11.6 34.6 16.8 37.4 21 40.2 25.4 40.6 30.8 38.6 35.6 36.4 40.6 31.4 43.8 24 43.6Z" fill="#ff9636"/><path d="M24.4 43C19.6 42.6 17.4 39.2 18 35.4 18.6 31.6 21.6 29.6 23.2 26.6 24.6 29.4 27.4 30.2 28.4 27.6 30.8 30.8 31.4 34.6 30.4 37.8 29.4 41 27.4 43 24.4 43Z" fill="#ffd84a"/>' + G + '<path d="M24 43.6C14.6 43.4 10 37.4 10.8 30 11.4 23.4 16.2 19.4 19 14.4 20.6 18.6 21.8 21 24.6 22.6 23.4 15 26.4 8.4 31.4 4.4 31.6 11.6 34.6 16.8 37.4 21 40.2 25.4 40.6 30.8 38.6 35.6 36.4 40.6 31.4 43.8 24 43.6Z"/></g>',
    warn: '<path d="M24.4 5.4C30.4 16.4 36.6 27.6 43 41.6 30.4 42.6 17.6 42.4 5.2 41.8 11.4 29.6 17.6 17.4 24.4 5.4Z" fill="#ffd21f"/>' + G + '<path d="M24.4 5.4C30.4 16.4 36.6 27.6 43 41.6 30.4 42.6 17.6 42.4 5.2 41.8 11.4 29.6 17.6 17.4 24.4 5.4Z"/><path d="M24.2 17.6 24 30.2" stroke-width="4.8"/><path d="M24 35.8v.6" stroke-width="5.6"/></g>',
    pencil: '<path d="M9.6 38.4 32.4 15.6 37.4 20.6 14.6 43.4 8 44.6Z" fill="#ffd23f"/>' + G + '<path d="M8.4 37.6 33 13 39 19 14.4 43.6 6.6 45.2Z"/><path d="M33 13 36.4 9.6C37.8 8.2 39.4 8.2 40.8 9.6L42.4 11.2C43.8 12.6 43.8 14.2 42.4 15.6L39 19"/><path d="M8.4 37.6 14.4 43.6"/><path d="M29.6 16.4 35.6 22.4" stroke-width="2.2"/></g>',
    mole: '<path d="M13.6 30.8C12.8 21.4 17 14.4 24 14.2 31 14.2 35.4 21.2 34.6 30.6Z" fill="#8c6c57"/>' + G.replace('3.2', '3') + '<path d="M13.6 30.8C12.8 21.4 17 14.4 24 14.2 31 14.2 35.4 21.2 34.6 30.6"/><circle cx="19.8" cy="22.6" r="3.8" fill="#fffdf6" stroke-width="2.4"/><circle cx="28.4" cy="22.6" r="3.8" fill="#fffdf6" stroke-width="2.4"/></g><circle cx="20.2" cy="23" r="1.3" fill="#1b1a1e"/><circle cx="28.8" cy="23" r="1.3" fill="#1b1a1e"/><path d="M22.2 27.8C23 26.6 25 26.6 25.8 27.8 25 29.2 23 29.2 22.2 27.8Z" fill="#f08f98" stroke="currentColor" stroke-width="1.6"/><path d="M3.6 43.6C6 35 12 29.4 18.4 30.6 21.6 27.6 26.6 27.6 30 30.6 36.4 29.4 42 34.8 44.6 43.6Z" fill="#b5835a" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
    pin: '<path d="M17.6 6.6H30.8L28.4 18.6C32.8 20 35.2 23 35.4 26.6H12.6C12.8 23 15.2 20 19.6 18.6Z" fill="#5b93e8"/>' + G + '<path d="M16.6 5.8C21.6 5.4 26.4 5.4 31.4 5.8L28.8 18.2C33.2 19.6 35.8 22.6 36 26.8 28 27.2 20 27.2 12 26.8 12.2 22.6 14.8 19.6 19.2 18.2Z"/><path d="M24 27.2 23.6 44.2"/></g>',
    target: '<circle cx="24" cy="24" r="17.6" fill="#fffdf6"/><circle cx="24" cy="24" r="10" fill="#ffd23f"/>' + G + RING + '<path d="M24.4 13.6C30.4 13.4 34.6 17.8 34.4 24 34.2 29.8 29.8 34.2 24 34 18 33.8 13.8 29.6 14 23.8 14.2 18 18.4 13.6 24.8 13.8"/></g><circle cx="24" cy="24" r="3" fill="#1b1a1e"/>',
    question: '<path d="M8.4 8.6H40V31.6H22L13.4 39.6 13.8 31.6H8.4Z" fill="#fff3c4"/>' + G + '<path d="M7.6 8C18.4 7.4 29.4 7.4 40.4 7.8 40.8 15.8 40.6 24 40.2 32.2 34 32.6 28 32.4 22 32.6L12.6 40.6 13.2 32.6C11.4 32.6 9.6 32.4 7.8 32.2 7.2 24 7.2 16 7.6 8Z"/><path d="M19.6 15.4C20.4 12.4 22.6 11.4 24.6 11.6 27.4 11.8 29 13.8 28.6 16.2 28.2 18.8 24.6 19.4 24.4 23"/><path d="M24.4 27.4v.4" stroke-width="4.2"/></g>',
    trophy: '<path d="M14.6 7.6H33.6C33.8 17.6 31 24.6 24.2 25.8 17.2 24.6 14.4 17.6 14.6 7.6Z" fill="#ffcf3a"/><path d="M16.4 41.8C16.6 37 19.4 34.4 24 34.2 28.6 34.4 31.4 37 31.6 41.8Z" fill="#d9b98b"/>' + G + '<path d="M14 7C20.6 6.6 27.4 6.6 34.2 7 34.4 17.8 31.2 25.4 24.2 26.4 17 25.4 13.8 17.8 14 7Z"/><path d="M14.4 11.4C9.4 10.6 7.2 13.6 8 17 8.8 20.4 12.4 21.8 16.2 21M33.8 11.4C38.8 10.6 41 13.6 40.2 17 39.4 20.4 35.8 21.8 32 21"/><path d="M24.2 26.6 24 34"/><path d="M16.4 41.8C16.6 37 19.4 34.4 24 34.2 28.6 34.4 31.4 37 31.6 41.8"/><path d="M13.8 42.2C20.6 41.8 27.4 41.8 34.2 42.2"/></g>',
    medal: '<path d="M14.8 5.4H21.4L26.6 17.8H20Z" fill="#5b93e8"/><path d="M33.2 5.4H26.6L21.4 17.8H28Z" fill="#e5483a"/><circle cx="24" cy="30" r="11" fill="#ffcf3a"/>' + G + '<path d="M14.8 5.4 20.4 18.2M33.2 5.4 27.6 18.2M14.8 5.4H21.2M26.8 5.4H33.2"/><path d="M24.4 18.8C30.6 18.8 35.2 23.4 35 30 34.8 36.2 30.4 40.8 24 40.8 17.6 40.6 13.2 36.2 13.2 29.8 13.4 23.6 17.8 19 24.8 19"/><path d="M24 24.6 25.8 28.4 29.8 28.8 26.8 31.4 27.8 35.4 24 33.2 20.4 35.4 21.4 31.4 18.4 28.8 22.4 28.4Z" stroke-width="2"/></g>',
    plus: G + '<path d="M24.2 8.6C24 18.6 24 29 23.8 39.4M8.6 24.2C18.6 23.8 29 23.8 39.4 24" stroke-width="5.4"/></g>',
    turtle: '<path d="M10.4 30.6C10.6 21.4 16.4 15.2 24 15 31.6 15.2 37.4 21.4 37.6 30.6Z" fill="#7ed67a"/>' + G + '<path d="M9.6 30.8C10 21.2 16 14.4 24 14.2 32 14.4 38 21.2 38.4 30.8 28.8 31.4 19.2 31.4 9.6 30.8Z"/><path d="M16 21.4 20.6 25.4 27.4 25.4 32 21.2M20.6 25.4 18.4 30.8M27.4 25.4 29.6 30.8M24 15V25.2" stroke-width="2.2"/><path d="M38.2 27.2C40.4 23.6 45 24.4 44.8 28 44.6 31 41.2 31.6 38.6 30.6"/><path d="M14.2 31.4 13.4 37.2M33.6 31.4 34.6 37.2"/></g>',
    bandage: '<path d="M8.6 30.6 30.6 8.6C33.6 5.6 38.4 5.8 41 8.6 43.6 11.4 43.4 15.8 40.6 18.6L18.4 40.8C15.6 43.6 10.8 43.6 8.2 40.8 5.6 38 5.8 33.4 8.6 30.6Z" fill="#f4c99b"/><path d="M19.4 19.8 28.4 28.8 23.6 33.6 14.6 24.6Z" fill="#fffdf6"/>' + G + '<path d="M8.6 30.6 30.6 8.6C33.6 5.6 38.4 5.8 41 8.6 43.6 11.4 43.4 15.8 40.6 18.6L18.4 40.8C15.6 43.6 10.8 43.6 8.2 40.8 5.6 38 5.8 33.4 8.6 30.6Z"/><path d="M19.4 19.8 28.4 28.8M14.6 24.6 23.6 33.6" stroke-width="2.4"/></g>',
    disguise: G + '<circle cx="15.4" cy="19.6" r="6.6" fill="#cfe9f7"/><circle cx="32.6" cy="19.6" r="6.6" fill="#cfe9f7"/><path d="M22 19.2C23.4 17.8 24.6 17.8 26 19.2"/><path d="M8.8 18.4 4.6 15.6M39.2 18.4 43.4 15.6"/><path d="M24 22.6C22.6 26.4 21.8 28.6 24.4 29.4"/><path d="M11.6 35.4C16.4 37.2 20.2 34.4 24 32 27.8 34.4 31.6 37.2 36.4 35.4 33.4 39.6 27.6 38.8 24 35.8 20.4 38.8 14.6 39.6 11.6 35.4Z" fill="currentColor"/></g>',
    siren: '<path d="M14 36.6C13.6 25 17.4 18.6 24 18.4 30.6 18.6 34.4 25 34 36.6Z" fill="#e5483a"/>' + G + '<path d="M13.4 36.8C13 25 17 17.8 24 17.6 31 17.8 35 25 34.6 36.8"/><path d="M9.6 37.2C19 36.6 29 36.6 38.4 37.2L38.6 43C29 43.6 19 43.6 9.4 43Z"/><path d="M24 7.4V11.4M10.4 12.2 13.2 15M37.6 12.2 34.8 15M4.6 25.6H8.6M39.4 25.6H43.4" stroke-width="2.8"/><path d="M19.4 30.4C19.2 26.6 20.8 24 23.6 23.4" stroke="#fffdf6" stroke-width="2.4"/></g>',
    key: '<circle cx="15.6" cy="24" r="8.8" fill="#ffcf3a"/>' + G + '<path d="M15.4 15C20.6 15 24.4 18.8 24.4 24 24.4 29 20.4 33 15.4 33 10.4 33 6.6 29 6.6 24 6.6 19 10.6 15 15.8 15.2"/><circle cx="13.4" cy="24" r="2.4" stroke-width="2.4"/><path d="M24.4 23.6C30.4 23.4 36.6 23.4 42.6 23.8L42.4 29.6M36.4 23.8 36.2 28.8"/></g>',
    x: G + '<path d="M11.6 11.4C19 18.8 27 27.6 36.4 36.8M36.2 11.6C28 19.4 20.4 27.6 11.8 36.4" stroke-width="5"/></g>',
    ice: '<path d="M8.6 16.4 24.2 8.4 39.6 16.2V33.2L24 41.4 8.4 33.4Z" fill="#cfe9f7"/>' + G + '<path d="M8.6 16.4 24.2 8.4 39.6 16.2 39.4 33.2 24 41.4 8.4 33.4Z"/><path d="M8.8 16.6 24 24.4 39.4 16.4M24 24.4 24 41"/></g>',
    mask: '<path d="M8.6 10.6C18.8 13.6 29.2 13.6 39.4 10.6 40.6 25.6 34.4 38.2 24 38.6 13.6 38.2 7.4 25.6 8.6 10.6Z" fill="#fffdf6"/>' + G + '<path d="M8.6 10.6C18.8 13.6 29.2 13.6 39.4 10.6 40.6 25.6 34.4 38.2 24 38.6 13.6 38.2 7.4 25.6 8.6 10.6Z"/><path d="M14.4 20.6C16.2 18.4 19 18.4 20.8 20.6M27.2 20.6C29 18.4 31.8 18.4 33.6 20.6"/><path d="M17 28.8C21 33.6 27 33.6 31 28.8"/></g>',
    notebook: '<path d="M12.6 6.4H37.4V42.6H12.6Z" fill="#9b7ad6"/>' + G + '<path d="M12 6C20.6 5.6 29.2 5.6 38 6 38.4 18.4 38.4 30.6 38 42.8 29.4 43.2 20.6 43.2 12 42.8 11.6 30.4 11.6 18.4 12 6Z"/><path d="M17.4 6.2 17.2 42.8"/><path d="M22.4 14.4H32.6M22.4 19.6H31" stroke-width="2.4"/></g>',
    folder: '<path d="M6.4 13.6H19L22.6 17.6H41.6V39.6H6.4Z" fill="#ffcf3a"/>' + G + '<path d="M5.8 12.8C10.4 12.6 14.8 12.6 19.4 12.8L22.8 17C29 17 35.2 17 41.6 17.2 42 24.6 42 32.2 41.6 40 29.6 40.4 17.6 40.4 5.8 40 5.4 31 5.4 21.8 5.8 12.8Z"/><path d="M6 22.4C18 22 30 22 41.8 22.4" stroke-width="2.4"/></g>',
    eyes: G + '<path d="M5 24C9.4 16.6 18.8 16.6 22.6 24 18.8 31.4 9.4 31.4 5 24Z" fill="#fffdf6"/><path d="M25.4 24C29.2 16.6 38.6 16.6 43 24 38.6 31.4 29.2 31.4 25.4 24Z" fill="#fffdf6"/></g><circle cx="15.6" cy="24" r="3.4" fill="#1b1a1e"/><circle cx="36" cy="24" r="3.4" fill="#1b1a1e"/>',
    repeat: G + '<path d="M9.6 26.4C8.6 17.6 14.6 11.6 23.6 11.4L36.4 11.6"/><path d="M31.4 6.4 37 11.6 31.4 16.8"/><path d="M38.4 21.6C39.4 30.4 33.4 36.4 24.4 36.6L11.6 36.4"/><path d="M16.6 31.2 11 36.4 16.6 41.6"/></g>',
    scope: '<path d="M18.6 6.4 26.2 6 26.6 22.4 19.4 22.8Z" fill="#cfe9f7"/>' + G + '<path d="M18.2 5.8C21 5.4 23.8 5.4 26.6 5.6L27 23 19 23.4Z"/><path d="M23 23.4 23.2 28.4"/><path d="M27.6 13.6C35.6 15.6 38.4 23.6 34.8 30.6"/><path d="M12.2 42.4C19.6 41.8 27.4 41.8 35.8 42.4M24.2 34.4C29 34.4 33 37.4 33.6 41.8M18.6 30.4 31 30.2"/></g>',
    zzz: G + '<path d="M9.4 26.2H20.4L9.6 39.4H21" stroke-width="3.6"/><path d="M25.6 14.8H34.4L25.8 25.4H34.8" stroke-width="3"/><path d="M36.4 5.6H42.4L36.6 12.6H42.6" stroke-width="2.4"/></g>',
    no: G + RING + '<path d="M11.6 11.8 36.4 36.4" stroke="var(--nb-mole, #d0281f)" stroke-width="4.4"/></g>',
    scissors: G + '<circle cx="13.4" cy="34.6" r="6" fill="#ff9aa2"/><circle cx="33.6" cy="35" r="6" fill="#ff9aa2"/><path d="M17.6 30.2 34.4 6.6M29.6 30.4 13 6.6"/></g>',
    brush: '<path d="M8.4 40.4C9.6 34.4 13.6 31.4 18 32.4 20.6 35.8 18.6 41.4 12.4 42.4Z" fill="#b8327a"/>' + G + '<path d="M18.4 31.6 38.6 9C40.4 7 42.6 8.6 41.2 10.8L21.8 34.6"/><path d="M8 41C9.2 34.6 13.4 31 18.2 32 21.4 35.6 19 41.8 12.2 42.8 10.4 43 8.8 42.4 8 41Z"/></g>',
    plug: '<path d="M14.6 16.6H33.4V26.4C33.4 31.4 29.4 34.6 24 34.6 18.6 34.6 14.6 31.4 14.6 26.4Z" fill="#ffcf3a"/>' + G + '<path d="M14 16C20.6 15.6 27.4 15.6 34 16 34.2 19.6 34.2 23.2 34 26.6 33.6 31.6 29.6 35.2 24 35.2 18.4 35.2 14.4 31.6 14 26.6 13.8 23 13.8 19.6 14 16Z"/><path d="M19.4 15.8V7.2M28.6 15.8V7.2"/><path d="M24 35.4C24 39.2 25.6 41.8 29.4 42.4 33 43 35.4 41.2 37.4 38.6"/></g>',
    wrench: '<path d="M28.4 6.6C24.4 8.6 23 13 24.6 17L8.6 33.2C6.8 35 6.8 37.8 8.6 39.6 10.4 41.4 13.2 41.2 15 39.4L31 23.4C35 25 39.6 23.6 41.4 19.6L35.6 19.8 32.4 15.8 34.6 10.8Z" fill="#c8d0da"/>' + G + '<path d="M28.4 6.6C24.4 8.6 23 13 24.6 17L8.6 33.2C6.8 35 6.8 37.8 8.6 39.6 10.4 41.4 13.2 41.2 15 39.4L31 23.4C35 25 39.6 23.6 41.4 19.6L35.6 19.8 32.4 15.8 34.6 10.8Z"/></g>',
    laptop: '<path d="M10.4 11.4H37.6V31H10.4Z" fill="#cfe9f7"/>' + G + '<path d="M9.8 10.8C19.4 10.4 28.8 10.4 38.4 10.8 38.6 17.6 38.6 24.4 38.2 31.4 28.8 31.8 19.2 31.8 10 31.4 9.6 24.6 9.6 17.6 9.8 10.8Z"/><path d="M5 37.4C17.6 36.8 30.4 36.8 43 37.4 42.2 40.2 40.6 41.4 38 41.4H10C7.4 41.4 5.8 40.2 5 37.4Z"/><path d="M15.6 19.4 19.6 21.6 15.6 24M22.4 25H28" stroke-width="2.6"/></g>',
    cloud: '<path d="M12.4 35.6C6.8 35.4 5 30.6 6.8 27 8.4 23.8 11.6 23 14 24 14.4 17.2 19.8 13 25.6 13.6 31 14.2 34.6 18.6 34.6 23.6 39.6 23.2 43.2 26.8 42.8 30.8 42.4 34 39.8 35.8 36.4 35.8Z" fill="#dfe6ee"/>' + G + '<path d="M12.4 35.6C6.8 35.4 5 30.6 6.8 27 8.4 23.8 11.6 23 14 24 14.4 17.2 19.8 13 25.6 13.6 31 14.2 34.6 18.6 34.6 23.6 39.6 23.2 43.2 26.8 42.8 30.8 42.4 34 39.8 35.8 36.4 35.8Z"/></g>',
    dice: '<path d="M9 9.4H39V39H9Z" fill="#fffdf6"/>' + G + '<path d="M9.6 8.4C19.2 8 28.8 8 38.6 8.6 39.4 18.6 39.4 28.8 38.8 39.2 29 39.8 19 39.8 9 39.4 8.4 29 8.6 18.6 9.6 8.4Z"/></g><circle cx="16.6" cy="16.2" r="2.6" fill="#1b1a1e"/><circle cx="24" cy="24" r="2.6" fill="#1b1a1e"/><circle cx="31.4" cy="31.6" r="2.6" fill="#1b1a1e"/>',
    letters: G + '<path d="M5.6 36.4 13.4 11.6 21.4 36.2M8.6 27.8H18.6" stroke-width="3.4"/><path d="M27.4 12 27.6 36.2C31.6 36.4 36 36.4 38.6 34.6 41.4 32.6 41.2 27.4 38 25.6 35.6 24.4 31.4 24.4 27.6 24.6 31.2 24.4 35 24.2 36.8 22.4 39 20 38.4 14.6 35 13 32.6 11.8 30 12 27.4 12Z"/></g>'
  };
  // The emoji the game writes, and the doodle each one becomes.
  var EMOJI = {
    '⚡': 'bolt', '🗳': 'vote', '✅': 'check', '✔': 'check', '📣': 'mega', '📢': 'mega', '🔔': 'bell', '🔒': 'lock', '🤫': 'lock',
    '📡': 'radio', '⏸': 'pause', '🚩': 'redflag', '🏁': 'flag', '▶': 'play', '⏭': 'skip', '🕵': 'scan', '🔍': 'scan',
    '👻': 'ghost', '🧪': 'beaker', '⏱': 'clock', '🎯': 'target', '🏆': 'trophy', '🎉': 'trophy', '🕳': 'mole', '🤔': 'question',
    '❔': 'question', '🔮': 'eyes', '➕': 'plus', '🏅': 'medal', '🎖': 'medal', '🐢': 'turtle', '🩹': 'bandage', '🥸': 'disguise',
    '🚨': 'siren', '🗝': 'key', '📝': 'pencil', '✖': 'x', '🧊': 'ice', '🎭': 'mask', '📓': 'notebook', '📁': 'folder',
    '⚠': 'warn', '🧾': 'pin', '📌': 'pin', '👀': 'eyes', '🔥': 'flame', '🔁': 'repeat', '🔬': 'scope', '😴': 'zzz',
    '🚫': 'no', '✂': 'scissors', '🖌': 'brush', '🔌': 'plug', '🔧': 'wrench', '💻': 'laptop', '☁': 'cloud', '📱': 'remote',
    '👥': 'players', '🎲': 'dice', '🔤': 'letters', '⏹': 'stop'
  };
  var RE_SRC = '(' + Object.keys(EMOJI).sort(function (a, b) { return b.length - a.length; }).join('|') + ')\\uFE0F?';
  var RE = new RegExp(RE_SRC, 'g'), HAS = new RegExp(RE_SRC);
  var SKIP = { SCRIPT: 1, STYLE: 1, OPTION: 1, SELECT: 1, TEXTAREA: 1, INPUT: 1, svg: 1, SVG: 1, TITLE: 1 };
  function sprite() {
    if (document.getElementById('mhInkSprite')) return;
    var s = '<svg id="mhInkSprite" xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">';
    Object.keys(ICONS).forEach(function (k) { s += '<symbol id="mhi-' + k + '" viewBox="0 0 48 48">' + ICONS[k] + '</symbol>'; });
    var box = document.createElement('div');
    box.innerHTML = s + '</svg>';
    document.body.insertBefore(box.firstChild, document.body.firstChild);
  }
  // A doodle, for code that wants one directly.
  function icon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'mh-ic mhi-' + name);
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#mhi-' + name);
    svg.appendChild(use);
    return svg;
  }
  function iconifyText(t) {
    var p = t.parentNode;
    if (!p || SKIP[p.nodeName] || (p.closest && p.closest('svg, select, textarea, [data-noicon]'))) return;
    var s = t.nodeValue;
    if (!HAS.test(s)) return;
    RE.lastIndex = 0;
    var frag = document.createDocumentFragment(), at = 0, m;
    while ((m = RE.exec(s))) {
      if (m.index > at) frag.appendChild(document.createTextNode(s.slice(at, m.index)));
      frag.appendChild(icon(EMOJI[m[1]]));
      at = m.index + m[0].length;
    }
    if (at < s.length) frag.appendChild(document.createTextNode(s.slice(at)));
    p.replaceChild(frag, t);
  }
  function iconify(root) {
    if (root.nodeType === 3) { iconifyText(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [], n;
    while ((n = w.nextNode())) if (HAS.test(n.nodeValue)) list.push(n);
    list.forEach(iconifyText);
  }

  /* ---------------- 2. the ink outlines ---------------- */
  // Boxes drawn in ink. 'tab': no bottom line. 'ring': a loose circle (no fill).
  var BOXES = [
    // the teacher's screen
    '#mhPlay .mh-clock-box', '#mhPlay .mh-tb', '#mhPlay .mh-codechip', '#mhPlay .mh-tool', '#mhPlay .rb-music',
    '.mh-stat', '.mh-pw-bar', '.mh-panel', '.mh-p-clear .mh-chip', '.mh-rumor', '.mh-ctrl', '.mh-cb', '.mh-alarm', '.mh-pop',
    '.mh-claims', '.mh-named', '.mh-claim', '.mh-timer-pill', '.mh-vote-bar', '.mh-warn', '.mh-reason', '.mh-tally .mh-chip',
    '.mh-mcap', '.mh-aw', '#mhLobby .lv-joinbox', '#mhLobby .rb-player', '#mhLobby .lv-roll', '#mhLobby .rb-lobby-opts',
    '#mhLobby .btn', '#mhPlay .btn', '#mhDone .btn', '.mh-host .lv-roster', '.mh-host .lv-roster .btn',
    // the students' screens
    '.mh-game .mh-role', '.mh-game .mh-en', '.mh-game .mh-streak', '.mh-banner', '.mh-pane', '.mh-ans button', '.mh-toolbtn',
    '.mh-pickwho', '.mh-drawer', '.mh-col', '.mh-clue', '.mh-missions', '.mh-lock', '.mh-note', '.mh-nb', '.mh-rolecard',
    '.mh-popup', '.mh-secret-btn', '.mh-secret.open', '.mh-tell', '.mh-cover-btn', '.mh-reason-pick button', '.mh-mynotes',
    '.mh-badges span', '.mh-game .btn', '#mpDone .btn', '.mh-game .mh-person', '.mh-frozen > div:nth-child(2)',
    // the Teacher Remote
    '.mh-rm-head', '.mh-remote .btn', '.mh-truth'
  ].join(',');
  var TABS = '.mh-tab';
  var RINGS = '.mh-stat.red b';
  var ALL = BOXES + ',' + TABS + ',' + RINGS;

  function f(n) { return Math.round(n * 10) / 10; }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // One wobbly pen stroke from (x1, y1) to (x2, y2), a little past each end.
  function rline(R, x1, y1, x2, y2, j) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    var ov = Math.min(4, L * 0.04);
    var sx = x1 - ux * R() * ov + nx * (R() - .5) * j, sy = y1 - uy * R() * ov + ny * (R() - .5) * j;
    var ex = x2 + ux * R() * ov + nx * (R() - .5) * j, ey = y2 + uy * R() * ov + ny * (R() - .5) * j;
    var segs = Math.max(1, Math.round(L / 240)), d = 'M' + f(sx) + ' ' + f(sy), px = sx, py = sy;
    var bow = Math.min(2.4, 0.4 + L * 0.01);
    for (var i = 1; i <= segs; i++) {
      var tx, ty;
      if (i === segs) { tx = ex; ty = ey; } else { var o = (R() - .5) * j * 1.3, t = i / segs; tx = sx + (ex - sx) * t + nx * o; ty = sy + (ey - sy) * t + ny * o; }
      var c1x = px + (tx - px) * .33 + nx * (R() - .5) * bow * 2, c1y = py + (ty - py) * .33 + ny * (R() - .5) * bow * 2;
      var c2x = px + (tx - px) * .67 + nx * (R() - .5) * bow * 2, c2y = py + (ty - py) * .67 + ny * (R() - .5) * bow * 2;
      d += 'C' + f(c1x) + ' ' + f(c1y) + ' ' + f(c2x) + ' ' + f(c2y) + ' ' + f(tx) + ' ' + f(ty);
      px = tx; py = ty;
    }
    return d;
  }
  function ringPath(R, cx, cy, rx, ry) {
    var n = 30, a0 = R() * Math.PI * 2, sweep = Math.PI * 2 + .45 + R() * .3, pts = [];
    for (var i = 0; i <= n; i++) {
      var t = a0 + sweep * i / n, g = .97 + .07 * (i / n), k = 1 + (R() - .5) * .025;
      pts.push([cx + Math.cos(t) * rx * g * k, cy + Math.sin(t) * ry * g * k]);
    }
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (var m = 1; m < n; m++) d += 'Q' + f(pts[m][0]) + ' ' + f(pts[m][1]) + ' ' + f((pts[m][0] + pts[m + 1][0]) / 2) + ' ' + f((pts[m][1] + pts[m + 1][1]) / 2);
    return d + 'L' + f(pts[n][0]) + ' ' + f(pts[n][1]);
  }
  function poly(p) {
    var d = 'M' + f(p[0][0]) + ' ' + f(p[0][1]);
    for (var i = 1; i < p.length; i++) d += 'L' + f(p[i][0]) + ' ' + f(p[i][1]);
    return d + 'Z';
  }
  function num(cs, name, dflt) { var v = parseFloat(cs.getPropertyValue(name)); return isNaN(v) ? dflt : v; }
  var uid = 0;

  function draw(el) {
    var ink = el.__ink;
    if (!ink) return;
    if (!el.isConnected) { ro.unobserve(el); el.__ink = null; return; }
    var old = el.__inkSvg;
    if (old && old.parentNode === el && old.__w === el.offsetWidth && old.__h === el.offsetHeight && el.firstChild === old) return;
    if (old && old.parentNode) old.parentNode.removeChild(old);
    el.__inkSvg = null;
    var w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return;
    el.classList.add('mh-inked');
    var cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    var scale = Math.max(.8, Math.min(2, parseFloat(getComputedStyle(document.documentElement).fontSize) / 16));
    var sw = num(cs, '--ink-w', 3) * scale, sh = num(cs, '--ink-shadow', 0) * scale, gap = num(cs, '--ink-hatch-gap', 0) * scale;
    var stripe = num(cs, '--ink-stripe-w', 0) * scale, j = Math.min(2.2, 1 + Math.min(w, h) / 60);
    var R = rng(ink.seed + Math.round(w / 8) * 7 + Math.round(h / 8) * 13), P = 30, out = '';
    var st = function (color, width, extra) { return ' fill="none" style="stroke:' + color + '" stroke-width="' + f(width) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || ''); };
    if (ink.kind === 'ring') {
      var rx = w / 2 + 6 * scale, ry = h / 2 + 4 * scale;
      out += '<path d="' + ringPath(R, w / 2, h / 2, rx, ry) + '"' + st('var(--ink-line)', sw) + '/>';
    } else {
      var c = ink.kind === 'tab'
        ? [[2 + R() * 2, -1 + R() * 2], [w - 2 - R() * 2, -1 + R() * 2], [w + 1, h + 4], [-1, h + 4]]
        : [[(R() - .5) * 2.4, (R() - .5) * 2.4], [w + (R() - .5) * 2.4, (R() - .5) * 2.4], [w + (R() - .5) * 2.4, h + (R() - .5) * 2.4], [(R() - .5) * 2.4, h + (R() - .5) * 2.4]];
      var shape = poly(c);
      if (sh) out += '<path d="' + poly(c.map(function (p) { return [p[0] + sh, p[1] + sh * 1.1]; })) + '" style="fill:var(--ink-shade)"/>';
      out += '<path d="' + shape + '" style="fill:var(--ink-fill)"/>';
      if (gap) {
        var id = 'mhk' + (++uid), hd = '';
        for (var t = -h; t < w + 4; t += gap) hd += rline(R, t, h + 3, t + h + 3, -3, 1.2);
        out += '<clipPath id="' + id + '"><path d="' + shape + '"/></clipPath><path clip-path="url(#' + id + ')" d="' + hd + '"' + st('var(--ink-hatch)', 1.5 * scale) + '/>';
      }
      if (stripe) out += '<path d="' + rline(R, stripe / 2 + 3, 8, stripe / 2 + 3, h - 8, 1) + '"' + st('var(--ink-stripe)', stripe) + '/>';
      var sides = ink.kind === 'tab' ? [[3, 0], [0, 1], [1, 2]] : [[0, 1], [1, 2], [2, 3], [3, 0]];
      // A dashed line (a greyed-out button) and the second pen pass are CSS
      // too (--ink-dasharray, --ink-pass2), so they switch without a redraw.
      for (var pass = 0; pass < 2; pass++) {
        var pd = '';
        sides.forEach(function (sd) {
          var a = c[sd[0]], b = c[sd[1]];
          if (ink.kind === 'tab' && sd[0] === 3) a = [a[0], h + 1];
          if (ink.kind === 'tab' && sd[1] === 2) b = [b[0], h + 1];
          pd += rline(R, a[0], a[1], b[0], b[1], j);
        });
        out += '<path d="' + pd + '" fill="none" style="stroke:var(--ink-line);stroke-dasharray:var(--ink-dasharray, none)' + (pass ? ';opacity:var(--ink-pass2, .8)' : '') + '" stroke-width="' + f(pass ? sw * .55 : sw) + '" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    }
    var holder = document.createElement('span');
    holder.innerHTML = '<svg class="mh-ink" aria-hidden="true" focusable="false" style="left:' + (-P) + 'px;top:' + (-P) + 'px;width:' + (w + 2 * P) + 'px;height:' + (h + 2 * P) + 'px" width="' + (w + 2 * P) + '" height="' + (h + 2 * P) +
      '" viewBox="' + (-P) + ' ' + (-P) + ' ' + (w + 2 * P) + ' ' + (h + 2 * P) + '">' + out + '</svg>';
    var svg = holder.firstChild;
    svg.__w = w; svg.__h = h;
    el.__inkSvg = svg;
    el.insertBefore(svg, el.firstChild);
  }

  var queued = [], raf = 0;
  function queue(el) {
    if (queued.indexOf(el) < 0) queued.push(el);
    if (!raf) raf = requestAnimationFrame(flush);
  }
  function flush() {
    raf = 0;
    var list = queued;
    queued = [];
    list.forEach(draw);
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function (entries) { entries.forEach(function (e) { queue(e.target); }); }) : null;
  function adopt(el) {
    if (el.__ink || !ro) return;
    el.__ink = { seed: (Math.random() * 1e9) | 0, kind: el.matches(TABS) ? 'tab' : el.matches(RINGS) ? 'ring' : 'box' };
    ro.observe(el);
    // Drawn right away (before the screen paints), so a new box never shows
    // for a moment without its ink.
    if (el.isConnected) draw(el); else queue(el);
  }
  function scan(root) {
    if (root.nodeType !== 1 || root.nodeName === 'svg' || root.namespaceURI === 'http://www.w3.org/2000/svg') return;
    if (root.matches(ALL)) adopt(root);
    [].forEach.call(root.querySelectorAll(ALL), adopt);
  }

  /* ---------------- watching the page ---------------- */
  function start() {
    var main = document.querySelector('main.mh-page');
    if (!main) return;
    sprite();
    document.documentElement.classList.add('mh-ink-on');
    iconify(main);
    scan(main);
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === 'characterData') { iconify(m.target); return; }
        var t = m.target;
        // The game emptied an inked box (it was drawn again): ink it again now,
        // before the screen paints, so its outline never blinks.
        if (t.__ink && t.__inkSvg && t.__inkSvg.parentNode !== t) { t.classList.add('mh-inked'); draw(t); }
        [].forEach.call(m.addedNodes, function (n) {
          if (n.nodeType === 3) { iconify(n); return; }
          if (n.nodeType !== 1 || n.classList.contains('mh-ink') || n.classList.contains('mh-ic')) return;
          iconify(n);
          scan(n);
        });
      });
    }).observe(main, { childList: true, subtree: true, characterData: true });
    // The fonts change sizes when they arrive.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { [].forEach.call(main.querySelectorAll('.mh-inked'), queue); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.MHInk = { icon: icon, ICONS: ICONS, EMOJI: EMOJI };
})();
