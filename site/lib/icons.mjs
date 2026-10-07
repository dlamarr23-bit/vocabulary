// One illustrated icon per unit and per chapter. Each one is drawn on a 64 x 64
// grid in two tones of the accent color of whatever it sits in, with gold for
// the one thing the eye should land on, over a soft tile. Injected by book.js
// from data-icon.
//
// Shapes that overlap are painted white first and then tinted, so a shape in
// front always hides what is behind it on any background.

const GOLD = '#f2b705';
const r2 = (n) => Math.round(n * 100) / 100;

// Elements. `a` is the attribute string for the shape.
const el = (tag, a) => `<${tag} ${a}/>`;
const tint = (tag, a, o = 0.2) => el(tag, `${a} fill="#fff" stroke="none"`) + el(tag, `${a} fill="currentColor" fill-opacity="${o}"`);
const deep = (tag, a) => tint(tag, a, 0.45);
const solid = (tag, a) => el(tag, `${a} fill="currentColor"`);
const gold = (tag, a) => el(tag, `${a} fill="${GOLD}"`);
const white = (tag, a) => el(tag, `${a} fill="#fff"`);
const line = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const thin = (d, extra = '') => line(d, `stroke-width="1.8" ${extra}`);
const dash = (d) => line(d, 'stroke-width="1.8" stroke-dasharray="3 4" stroke-opacity=".7"');
// A thick stroke with an outline, for bones, necks, handles and wires.
const bar = (d, w, fill = 'tint') => {
  const under = line(d, `stroke-width="${w + 5}"`);
  if (fill === 'gold') return under + line(d, `stroke="${GOLD}" stroke-width="${w}"`);
  if (fill === 'solid') return under;
  return under + line(d, `stroke="#fff" stroke-width="${w}"`) + line(d, `stroke="currentColor" stroke-opacity="${fill === 'deep' ? 0.45 : 0.2}" stroke-width="${w}"`);
};
const dot = (x, y, r, kind = 'solid') => ({ solid, gold, white, tint, deep })[kind]('circle', `cx="${x}" cy="${y}" r="${r}"`);
const sparkle = (x, y, s) => gold('path', `d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" stroke-width="1.4"`);
const arrow = (x1, y1, x2, y2, head = 5, extra = '') => {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = (s) => `${r2(x2 - head * Math.cos(a + s))} ${r2(y2 - head * Math.sin(a + s))}`;
  return line(`M${x1} ${y1}L${x2} ${y2}M${h(0.55)}L${x2} ${y2}L${h(-0.55)}`, extra);
};
// Sample a function into a smooth enough polyline path.
const trace = (f, t0, t1, n = 48) => {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const [x, y] = f(t0 + ((t1 - t0) * i) / n);
    d += `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`;
  }
  return d;
};
const bez = (p0, p1, p2, p3) => (t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};
// A crystal standing on its base, point up.
const crystal = (cx, base, w, h, kind) => {
  const top = base - h;
  const shoulder = top + w * 0.9;
  const d = `M${cx - w} ${base}V${shoulder}L${cx} ${top}L${cx + w} ${shoulder}V${base}Z`;
  const body = kind === 'gold' ? gold('path', `d="${d}"`) : tint('path', `d="${d}"`, kind === 'deep' ? 0.45 : 0.2);
  return body + thin(`M${cx} ${top}V${base}M${cx - w} ${shoulder}L${cx} ${shoulder + w * 0.5}L${cx + w} ${shoulder}`, 'stroke-opacity=".6"');
};
const bone = (x1, y1, x2, y2, kind = 'tint') => {
  const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  const k = (x, y, s) => dot(r2(x + 2.4 * s * Math.cos(a)), r2(y + 2.4 * s * Math.sin(a)), 3.2, kind === 'gold' ? 'gold' : kind);
  return k(x1, y1, 1) + k(x1, y1, -1) + k(x2, y2, 1) + k(x2, y2, -1) + bar(`M${x1} ${y1}L${x2} ${y2}`, 4.4, kind);
};

/* ---------------- the drawings ---------------- */

const helix = () => {
  const x = (y, s) => 32 + s * 12 * Math.cos(((y - 6) / 52) * 2 * Math.PI);
  let rungs = '';
  for (const y of [9.5, 14, 24, 28.5, 37, 41, 50.5, 55]) rungs += line(`M${r2(x(y, -1))} ${y}L${r2(x(y, 1))} ${y}`, 'stroke-width="3.2" stroke-opacity=".45"');
  const mut = 32.75;
  rungs += line(`M${r2(x(mut, -1))} ${mut}L${r2(x(mut, 1))} ${mut}`, `stroke="${GOLD}" stroke-width="4.4"`);
  return rungs + bar(trace((t) => [x(t, 1), t], 6, 58), 2.6, 'deep') + bar(trace((t) => [x(t, -1), t], 6, 58), 2.6);
};

const coaster = () => {
  const hill = bez([4, 52], [14, 52], [16, 14], [27, 14]);
  const dip = bez([27, 14], [38, 14], [36, 40], [45, 40]);
  const rise = bez([45, 40], [53, 40], [55, 27], [61, 27]);
  const onTrack = (x) => {
    for (const seg of [hill, dip, rise]) {
      for (let t = 0; t <= 1; t += 0.002) { const p = seg(t); if (Math.abs(p[0] - x) < 0.3) return p[1]; }
    }
    return 56;
  };
  let legs = '';
  for (const x of [11, 17, 22, 32, 37, 42, 50, 56]) legs += thin(`M${x} ${r2(onTrack(x) + 2)}V56`, 'stroke-opacity=".55"');
  const track = trace(hill, 0, 1, 30) + trace(dip, 0, 1, 30).replace('M', 'L') + trace(rise, 0, 1, 20).replace('M', 'L');
  return legs + line('M3 56H61') + bar(track, 2.2, 'deep')
    + dot(23, 3.2, 2.4, 'gold') + dot(30.5, 3.2, 2.4, 'gold')
    + deep('path', 'd="M18 11.5V7.5Q18 5.5 20 5.5H33.5L37 11.5Z"')
    + dot(21.5, 12, 1.9) + dot(33, 12, 1.9);
};

const galaxy = () => {
  const arm = (off) => trace((t) => {
    const r = 3 + 3.6 * Math.exp(0.23 * t);
    return [32 + r * Math.cos(t + off), 32 + r * Math.sin(t + off) * 0.78];
  }, 0, 8.2, 60);
  let stars = '';
  for (const [x, y, r] of [[12, 14, 1.4], [52, 12, 1.2], [8, 44, 1.2], [56, 50, 1.4], [44, 57, 1], [18, 56, 1]]) stars += dot(x, y, r);
  return bar(arm(0), 4.2) + bar(arm(Math.PI), 4.2) + dot(32, 32, 6.2, 'gold') + stars + sparkle(55, 30, 4) + sparkle(10, 28, 3);
};

const wave = (x0, x1, y, amp, len, extra) => line(trace((x) => [x, y - amp * Math.sin(((x - x0) / len) * 2 * Math.PI)], x0, x1, 60), extra);

const gravityField = () => {
  let arrows = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 2 * Math.PI + Math.PI / 8;
    arrows += arrow(r2(32 + 27 * Math.cos(a)), r2(32 + 27 * Math.sin(a)), r2(32 + 18 * Math.cos(a)), r2(32 + 18 * Math.sin(a)), 4.5, 'stroke-width="2.4"');
  }
  return arrows + tint('circle', 'cx="32" cy="32" r="13"', 0.3) + thin('M22 28c4 2 7-1 10 1s5 4 9 2M24 38c3-1 6 1 9 0', 'stroke-opacity=".6"') + dot(36, 25, 1.8, 'white');
};

const DRAW = {
  // ---- units ----
  u1: () => // a tree of life, with a different kind of living thing at every tip
    bar('M32 57V42C32 36 22 36 20 30M32 42C32 36 44 36 44 28M20 30C20 25 14 24 13 19M20 30C20 25 26 24 27 19M44 28C44 23 39 22 38 16M44 28C44 23 51 22 51 17', 2.2, 'deep')
    + line('M20 57H44')
    + tint('circle', 'cx="13" cy="14" r="5"')
    + tint('path', 'd="M27 8L32.5 18H21.5Z"', 0.45)
    + gold('rect', 'x="33.5" y="6" width="9" height="9" rx="2"')
    + tint('path', 'd="M51 7l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z"'),
  u2: () => // crystals growing from a rock
    tint('path', 'd="M6 56C8 47 16 44 24 45C32 42 44 42 50 46C56 47 59 52 58 56Z"', 0.45)
    + crystal(21, 48, 6, 24, 'tint') + crystal(43, 47, 5.5, 20, 'deep') + crystal(32, 50, 7, 36, 'gold')
    + sparkle(52, 14, 4) + sparkle(11, 18, 3),
  u3: () => // a ringed planet among stars
    '<g transform="rotate(-18 32 32)">'
    + line('M5 32a27 8.5 0 0 1 54 0', 'stroke-width="4.6" stroke-opacity=".45"')
    + tint('circle', 'cx="32" cy="32" r="15"', 0.3)
    + thin('M18.5 26h27M17.5 34h29', 'stroke-opacity=".5"')
    + line('M59 32a27 8.5 0 0 1-54 0', 'stroke-width="4.6"')
    + '</g>'
    + sparkle(10, 12, 4) + sparkle(54, 53, 3.5) + dot(52, 10, 1.4) + dot(12, 52, 1.2),
  u4: coaster, // the first hill of a roller coaster, with the car at the top
  u5: () => // a horseshoe magnet and its field
    dash('M13 20C11 -2 53 -2 51 20') + dash('M18 20C17 6 47 6 46 20')
    + bar('M20 28V38A12 12 0 0 0 44 38V28', 10, 'deep')
    + solid('rect', 'x="12.5" y="18" width="15" height="10" rx="1.5"')
    + gold('rect', 'x="36.5" y="18" width="15" height="10" rx="1.5"'),
  u6: () => // a phone sending a message
    tint('rect', 'x="10" y="14" width="24" height="44" rx="5"', 0.45)
    + white('rect', 'x="14" y="20" width="16" height="30" rx="2" stroke-width="1.8"')
    + gold('path', 'd="M16.5 25h11a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H21l-3 3v-3h-1.5A1.5 1.5 0 0 1 15 31.5v-5a1.5 1.5 0 0 1 1.5-1.5z" stroke-width="1.6"')
    + thin('M18 43h8', 'stroke-opacity=".5"') + dot(22, 54, 1.6)
    + line('M40 18a8 8 0 0 1 6 6') + line('M40 10a16 16 0 0 1 14 14', 'stroke-opacity=".7"') + line('M40 2a24 24 0 0 1 22 22', 'stroke-opacity=".45"'),

  // ---- Unit 1, Evolution ----
  'natural-selection': () => // bacteria round an antibiotic disc: one gold survivor sits inside the clear ring
    tint('circle', 'cx="32" cy="32" r="26"', 0.12)
    + thin('M32 10a22 22 0 1 1 0 44a22 22 0 1 1 0-44', 'stroke-opacity=".45"')
    + [[17, 22, 30], [24, 15, -20], [44, 16, 60], [50, 30, 10], [47, 45, -40], [34, 51, 20], [19, 45, 70], [13, 34, -10], [30, 22, 80]]
      .map(([x, y, r]) => tint('rect', `x="-5.5" y="-2.8" width="11" height="5.6" rx="2.8" transform="translate(${x} ${y}) rotate(${r})"`, 0.5)).join('')
    + dash('M32 25a10 10 0 1 1 0 20a10 10 0 1 1 0-20')
    + white('circle', 'cx="32" cy="35" r="4.5"')
    + gold('rect', 'x="-5.5" y="-2.8" width="11" height="5.6" rx="2.8" transform="translate(38 30) rotate(-35)"'),
  'genes-and-mutations': helix, // a double helix with one changed base pair
  'fossils-and-the-rock-record': () => // rock layers, youngest on top, with a shell and a bone
    tint('rect', 'x="6" y="8" width="52" height="50" rx="7"', 0.1)
    + tint('path', 'd="M6 22C18 19 28 25 40 22S54 20 58 21V51a7 7 0 0 1-7 7H13a7 7 0 0 1-7-7Z"', 0.22)
    + tint('path', 'd="M6 38C16 36 26 41 38 38S52 36 58 38V51a7 7 0 0 1-7 7H13a7 7 0 0 1-7-7Z"', 0.36)
    + thin('M6 22C18 19 28 25 40 22S54 20 58 21M6 38C16 36 26 41 38 38S52 36 58 38', 'stroke-opacity=".55"')
    + white('circle', 'cx="21" cy="30" r="6"') + thin('M21 30m-1 0a1 1 0 1 1 2 0a2.5 2.5 0 0 1-4.5 1.5a4 4 0 0 1 3-6a5 5 0 0 1 5.5 5')
    + bone(32, 49, 47, 45, 'gold') + dot(47, 14, 1.2) + dot(15, 15, 1),
  'comparing-living-things': () => // the bones of a hand and forearm, the same set every mammal limb is built from
    line('M26 62L27.5 49', `stroke="${GOLD}" stroke-width="5.5"`) + line('M38 62L36.5 49', `stroke="${GOLD}" stroke-width="5.5"`)
    + [[25, 42, 18, 34, 12, 27], [29, 39, 26.5, 26, 24.5, 13], [32.5, 38, 32.5, 24, 32.5, 9], [36, 39, 38.5, 26, 40.5, 14], [39, 42, 44, 31, 48, 22]]
      .map(([x0, y0, x1, y1, x2, y2]) => {
        const a = Math.atan2(y2 - y1, x2 - x1); const gx = r2(x1 + 3 * Math.cos(a)), gy = r2(y1 + 3 * Math.sin(a));
        return line(`M${x0} ${y0}L${x1} ${y1}`, 'stroke-width="3.6" stroke-opacity=".55"') + line(`M${gx} ${gy}L${x2} ${y2}`, 'stroke-width="3.6"');
      }).join('')
    + dot(28, 45, 2.6, 'white') + dot(32.5, 44, 2.6, 'white') + dot(37, 45, 2.6, 'white'),
  'extinction-and-diversity': () => // a long necked dinosaur looking up at an incoming asteroid
    line('M50 14L61 3M46 12L55 3M52 18L62 9', `stroke="${GOLD}" stroke-width="2.4"`)
    + gold('circle', 'cx="47" cy="17" r="6"') + dot(45.5, 15.5, 1.3, 'white')
    + bar('M28 38C24 32 22 26 17 20', 5.2, 'deep')
    + tint('path', 'd="M24 44C24 36 30 33 38 33C46 33 50 37 52 40C56 42 59 45 62 50C55 50 51 48 49 48L49 56H44V49C40 50 36 50 32 49V56H27V47C25 46 24 45 24 44Z"', 0.45)
    + tint('ellipse', 'cx="14" cy="18" rx="5.5" ry="3.8" transform="rotate(-25 14 18)"', 0.45) + dot(12.5, 16.5, 1.1)
    + line('M2 56H62'),
  'selective-breeding': () => // a small wild tomato, and the large one people bred from it
    tint('circle', 'cx="12" cy="20" r="6"', 0.45) + solid('path', 'd="M12 13l2 2.5 3-.5-2 2 .5 3-3.5-2-3.5 2 .5-3-2-2 3 .5z" stroke-width="1"')
    + line('M16 30C18 40 24 44 30 45', 'stroke-width="2.2"') + line('M25.5 42L30.5 45 26.5 49', 'stroke-width="2.2"')
    + tint('path', 'd="M42 22C51 22 58 29 58 38C58 48 50 56 41 56C32 56 25 49 25 39C25 29 33 22 42 22Z"', 0.45)
    + thin('M37 28c-4 3-6 7-6 12', 'stroke="#fff" stroke-opacity=".9" stroke-width="3"')
    + gold('path', 'd="M42 17l3 5 6-1-4 4 1 6-6-3-6 3 1-6-4-4 6 1z" stroke-width="1.8"') + line('M42 17V11'),

  // ---- Unit 2, Earth's Resources ----
  'where-resources-come-from': () => // ore in the rock, and the pick that gets it out
    tint('path', 'd="M6 56L10 42L22 33L37 34L50 41L57 56Z"', 0.45)
    + gold('path', 'd="M20 45l4-3 4 2-1 4-5 1z"') + gold('path', 'd="M36 42l4-1 2 3-3 3-4-2z"') + gold('path', 'd="M29 51l3-2 3 2-3 2z" stroke-width="1.8"')
    + thin('M22 33L26 40M37 34L33 40', 'stroke-opacity=".55"')
    + bar('M44 8L28 34', 3.4, 'deep')
    + tint('path', 'd="M30 10C38 3 50 4 57 12C50 9 43 9 37 12Z"', 0.45),
  'energy-resources': () => // a wind turbine and a solar panel in the sun
    dot(52, 12, 6, 'gold') + line('M52 2V3.5M62 12h-1.5M59 5l-1 1M45 5l1 1', `stroke="${GOLD}"`)
    + tint('path', 'd="M20 58L22.5 24H25.5L28 58Z"', 0.45)
    + tint('path', 'd="M24 22C22 16 22 8 24 2C26 8 26 16 24 22Z"', 0.3)
    + tint('path', 'd="M24 22C18 25 11 27 5 27C10 23 17 21 24 22Z" ', 0.3)
    + tint('path', 'd="M24 22C29 26 34 32 36 38C31 35 26 29 24 22Z"', 0.3)
    + dot(24, 22, 3, 'white')
    + deep('path', 'd="M36 44H60L56 54H32Z"') + thin('M44 44l-4 10M52 44l-4 10M34 49h24', 'stroke="#fff" stroke-width="1.6"')
    + line('M46 54V58M2 58H62'),
  'natural-hazards': () => // a volcano erupting
    tint('circle', 'cx="26" cy="13" r="6"', 0.18) + tint('circle', 'cx="36" cy="10" r="7"', 0.18) + tint('circle', 'cx="45" cy="15" r="5"', 0.18)
    + tint('path', 'd="M4 58L24 26H40L60 58Z"', 0.45)
    + gold('path', 'd="M24 26H40L37 34C36 40 39 44 36 50C34 44 33 40 32 36C31 42 28 44 27 48C26 42 28 36 24 26Z"')
    + white('path', 'd="M24 26C27 28 37 28 40 26" stroke-width="2"')
    + dot(18, 20, 2.4, 'gold') + dot(47, 24, 2.2, 'gold') + dot(13, 30, 1.8, 'gold')
    + line('M2 58H62'),
  'human-impact-and-climate': () => // the Earth and a rising thermometer
    tint('circle', 'cx="24" cy="34" r="19"', 0.18)
    + deep('path', 'd="M13 22C18 20 21 24 20 28S14 32 12 36C8 32 8 26 13 22Z"')
    + deep('path', 'd="M27 17C32 17 38 20 40 26C36 26 33 29 34 34C35 40 30 44 26 42C28 36 24 32 25 28C26 24 23 20 27 17Z"')
    + deep('path', 'd="M16 45C20 44 23 47 22 51C19 51 16 49 16 45Z"')
    + white('rect', 'x="44" y="6" width="12" height="42" rx="6"')
    + gold('circle', 'cx="50" cy="51" r="8"') + line(`M50 45V14`, `stroke="${GOLD}" stroke-width="4.5"`)
    + thin('M44 18h4M44 26h4M44 34h4'),

  // ---- Unit 3, Solar System and Beyond ----
  'gravity-and-the-solar-system': () => // the Sun's gravity bending two planets into orbits
    thin('M32 18a14 14 0 1 1 0 28a14 14 0 1 1 0-28', 'stroke-opacity=".5"')
    + thin('M32 7a25 25 0 1 1 0 50a25 25 0 1 1 0-50', 'stroke-opacity=".5"')
    + dot(32, 32, 7, 'gold') + line('M32 21v-2M43 32h2M32 43v2M21 32h-2', `stroke="${GOLD}"`)
    + dot(44, 25, 3.5, 'deep')
    + dot(14.3, 49.7, 5, 'tint') + arrow(18, 46, 26, 38, 4, 'stroke-width="2"')
    + line('M47 10a25 25 0 0 1 8 8', 'stroke-width="2.4"') + line('M51.5 18.5l3.5-.5.5-3.5', 'stroke-width="2.4"'),
  'earth-moon-and-sun': () => // a total solar eclipse: the Moon covering the Sun
    [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a, i) => {
      const r = a * Math.PI / 180; const o = i % 2 ? 26 : 29;
      return line(`M${r2(32 + 21 * Math.cos(r))} ${r2(32 + 21 * Math.sin(r))}L${r2(32 + o * Math.cos(r))} ${r2(32 + o * Math.sin(r))}`, `stroke="${GOLD}" stroke-width="2.6"`);
    }).join('')
    + gold('circle', 'cx="32" cy="32" r="17"')
    + solid('circle', 'cx="33.5" cy="30.5" r="16"')
    + dot(40, 25, 2.2, 'white') + white('circle', 'cx="45.5" cy="44" r="1.6" stroke="none" fill-opacity=".7"'),
  'the-scale-of-space': galaxy, // a spiral galaxy

  // ---- Unit 4, Forces and Motion ----
  'describing-motion': () => // a stopwatch timing something fast
    thin('M3 26h9M1 34h11M5 42h7', 'stroke-width="2.4" stroke-opacity=".6"')
    + solid('rect', 'x="32" y="4" width="8" height="6" rx="1.5"') + line('M36 10v4M50 14l3-3')
    + tint('circle', 'cx="36" cy="36" r="21"', 0.45) + white('circle', 'cx="36" cy="36" r="16" stroke-width="1.8"')
    + thin('M36 22v3M50 36h-3M36 50v-3M22 36h3')
    + line('M36 36L45 28', `stroke="${GOLD}" stroke-width="3.2"`) + dot(36, 36, 2.6),
  'forces-and-newtons-laws': () => // a big push and a smaller friction force: the crate speeds up
    line('M4 46H60') + thin('M8 46l-3 5M16 46l-3 5M24 46l-3 5M32 46l-3 5M40 46l-3 5M48 46l-3 5M56 46l-3 5', 'stroke-opacity=".5"')
    + tint('rect', 'x="22" y="22" width="24" height="24" rx="2"', 0.45) + thin('M22 22l24 24M46 22L22 46', 'stroke-opacity=".6"')
    + bar('M2 34H13', 5, 'gold') + gold('path', 'd="M12 26L21 34 12 42Z"')
    + arrow(60, 51, 48, 51, 4, 'stroke-width="2.4"') + arrow(34, 21, 34, 9, 4, 'stroke-width="2.4" stroke-opacity=".6"') + arrow(34, 47, 34, 60, 4, 'stroke-width="2.4" stroke-opacity=".6"'),
  'collisions-and-safety': () => // a car meeting a crash barrier
    thin('M2 30h6M1 38h7', 'stroke-width="2.4" stroke-opacity=".6"')
    + tint('path', 'd="M9 46V37L16 35L22 26H35L43 34L49 36V46Z"', 0.45)
    + white('path', 'd="M23.5 29H28V34H19.5Z" stroke-width="1.8"') + white('path', 'd="M31 29H34L38.5 34H31Z" stroke-width="1.8"')
    + dot(18, 46, 5, 'solid') + dot(18, 46, 1.8, 'white') + dot(41, 46, 5, 'solid') + dot(41, 46, 1.8, 'white')
    + gold('path', 'd="M51 26l2 5 4-3-1 5 5 1-5 3 3 4-5-1-1 5-3-4-3 3 1-5z" stroke-width="1.8"')
    + white('rect', 'x="56" y="16" width="6" height="38"') + line('M56 24L62 18M56 34L62 28M56 44L62 38M56 54L62 48', 'stroke-width="2.6"')
    + line('M2 54H62'),
  'kinetic-and-potential-energy': () => // a pendulum swinging between its high and low points
    line('M16 6H48') + thin('M20 6l-3-4M28 6l-3-4M36 6l-3-4M44 6l-3-4', 'stroke-opacity=".5"')
    + dash('M14 42C20 52 44 52 50 42')
    + thin('M32 6L14 42', 'stroke-opacity=".35"') + tint('circle', 'cx="14" cy="42" r="6"', 0.2)
    + thin('M32 6V48', 'stroke-opacity=".35"') + tint('circle', 'cx="32" cy="50" r="6"', 0.2)
    + line('M32 6L50 42') + gold('circle', 'cx="50" cy="42" r="7"') + dot(32, 6, 2.4)
    + arrow(58, 50, 52, 56, 3.5, 'stroke-width="2"'),

  // ---- Unit 5, Fields and Interactions ----
  'magnetic-force-and-fields': () => // a bar magnet and the loops of its field
    dash('M12 28C6 8 58 8 52 28') + dash('M12 36C6 56 58 56 52 36')
    + dash('M16 28C14 17 50 17 48 28') + dash('M16 36C14 47 50 47 48 36')
    + solid('rect', 'x="10" y="27" width="22" height="10" rx="1.5"') + tint('rect', 'x="32" y="27" width="22" height="10" rx="1.5"', 0.3)
    + arrow(30, 12.5, 35, 12.5, 3.5, 'stroke-width="2"') + arrow(35, 51.5, 30, 51.5, 3.5, 'stroke-width="2"'),
  'electric-force-and-electromagnets': () => // an iron nail wrapped in wire, with a battery driving the current
    tint('path', 'd="M8 26H12V29H48L58 32L48 35H12V38H8Z"', 0.45)
    + [18, 23, 28, 33, 38, 43].map((x) => line(`M${x} 25C${x + 5} 27 ${x + 5} 37 ${x} 39`, `stroke="${GOLD}" stroke-width="3"`)).join('')
    + thin('M18 39V52H23M43 39V52H40')
    + tint('rect', 'x="23" y="47" width="17" height="10" rx="2"', 0.45) + solid('rect', 'x="40" y="49.5" width="3" height="5" rx="1"')
    + thin('M27 52h3M28.5 50.5v3M34 52h3', 'stroke="#fff" stroke-width="1.6"')
    + line('M51 20l4-6M56 22l6-4', 'stroke-width="2" stroke-opacity=".6"'),
  'gravity-as-a-field': gravityField, // arrows pointing in towards a planet from every side
  'energy-stored-in-fields': () => // two magnets held with like poles facing: the field pushes them apart
    solid('rect', 'x="23" y="27" width="7" height="10" rx="1"') + tint('rect', 'x="4" y="27" width="19" height="10" rx="1.5"', 0.3)
    + solid('rect', 'x="34" y="27" width="7" height="10" rx="1"') + tint('rect', 'x="41" y="27" width="19" height="10" rx="1.5"', 0.3)
    + line('M4 27h26v10H4zM34 27h26v10H34z')
    + dash('M30 29C27 20 24 16 20 12M34 29C37 20 40 16 44 12M30 35C27 44 24 48 20 52M34 35C37 44 40 48 44 52')
    + sparkle(32, 32, 5) + arrow(14, 21, 5, 21, 3.5, 'stroke-width="2.2"') + arrow(50, 21, 59, 21, 3.5, 'stroke-width="2.2"'),

  // ---- Unit 6, Waves and Information ----
  'wave-properties-and-energy': () => // a wave, its wavelength from crest to crest and its amplitude
    thin('M4 36H60', 'stroke-opacity=".5"')
    + wave(4, 60, 36, 13, 26, 'stroke-width="3.4"')
    + line('M10.5 16V10M36.5 16V10M10.5 13H36.5', `stroke="${GOLD}" stroke-width="2.6"`)
    + arrow(49.5, 36, 49.5, 47, 3.5, `stroke="${GOLD}" stroke-width="2.6"`),
  'waves-meeting-materials': () => // white light entering a prism and leaving as colours
    line('M2 38L22 31', 'stroke-width="3.2"')
    + tint('path', 'd="M30 8L52 50H8Z"', 0.18)
    + line('M22 31L39 33', 'stroke-width="2.4" stroke-opacity=".6"')
    + line('M39 33L62 30', 'stroke-width="3" stroke-opacity=".45"') + line('M39.5 34L62 40', `stroke="${GOLD}" stroke-width="3"`) + line('M40 35L62 50', 'stroke-width="3"'),
  'sending-information': () => // a smooth signal turned into ones and zeros
    wave(4, 60, 16, 8, 28, 'stroke-width="3" stroke-opacity=".55"')
    + arrow(32, 27, 32, 37, 4, 'stroke-width="2.2"')
    + line('M4 56H12V44H20V56H28V44H44V56H52V44H60', `stroke="${GOLD}" stroke-width="3.4"`)
    + line('M4 56H12V44H20V56H28V44H44V56H52V44H60', 'stroke-width="1.2" fill="none" stroke-opacity=".6"'),

  // ---- anything without its own drawing ----
  book: () => // an open book, for the front page and anything without its own drawing
    tint('path', 'd="M32 16C26 11 16 10 6 12V52C16 50 26 51 32 56Z"', 0.3)
    + tint('path', 'd="M32 16C38 11 48 10 58 12V52C48 50 38 51 32 56Z"', 0.3)
    + line('M32 16V56') + thin('M12 20c5-1 10 0 14 2M12 28c5-1 10 0 14 2M12 36c5-1 10 0 14 2M38 22c4-2 9-3 14-2M38 30c4-2 9-3 14-2', 'stroke-opacity=".55"')
    + sparkle(46, 40, 5),
  flashcards: () => { // the Flashcards page: a hand of cards fanned over a deck, the front card starred
    // The two cards fanned behind turn about a point below the deck (32, 62).
    const fan = (a, o) => tint('rect', `x="17" y="15" width="30" height="22" rx="4.5" transform="rotate(${a} 32 62)"`, o)
      + thin('M22 22h14M22 28h9', `stroke-opacity=".45" transform="rotate(${a} 32 62)"`);
    // The deck: cards one under another below the front card, each edge showing.
    const deckCard = (d, o) => tint('rect', `x="13" y="${26 + d}" width="36" height="25" rx="5"`, o);
    const star = (x, y, r) => {
      let d = '';
      for (let i = 0; i < 10; i++) {
        const t = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
        d += `${i ? 'L' : 'M'}${r2(x + rr * Math.cos(t))} ${r2(y + rr * Math.sin(t))}`;
      }
      return gold('path', `d="${d}Z" stroke-width="1.8"`);
    };
    return dash('M6 21A28 28 0 0 1 56 12.5') + arrow(52.6, 7.8, 56.2, 12.8, 4.2, 'stroke-width="1.8" stroke-opacity=".7"')
      + fan(-23, 0.16) + fan(23, 0.28)
      + deckCard(9, 0.12) + deckCard(4.5, 0.24)
      + deep('rect', 'x="13" y="26" width="36" height="25" rx="5"')
      + line('M20 35.5h20M20 42.5h12', 'stroke="#fff" stroke-width="3.2"')
      + star(48, 26.5, 6.4)
      + sparkle(8, 9, 3.6) + sparkle(59, 51, 3.2) + dot(58, 6, 1.4) + dot(6, 50, 1.3);
  },
  set: () => // two flashcards, one over the other: a flashcard set with no picture of its own
    tint('rect', 'x="22" y="10" width="34" height="28" rx="5"', 0.3)
    + deep('rect', 'x="8" y="24" width="34" height="30" rx="5"')
    + line('M15 35h20M15 43h13', 'stroke="#fff" stroke-width="3"'),
};

// The drawings use 0 to 64; the view box leaves a margin round them for the tile.
// No ids anywhere, because a page can show the same icon more than once.
const TILE = '<rect x="-4" y="-4" width="72" height="72" rx="18" fill="currentColor" fill-opacity=".09" stroke="none"/>';
const wrap = (body) => `<svg viewBox="-4 -4 72 72" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${TILE}${body}</svg>`;

DRAW.fallback = DRAW.book;

export const ICONS = Object.fromEntries(Object.entries(DRAW).map(([k, f]) => [k, wrap(f())]));

// Emitted as a standalone script so the pages can inject icons without a build step.
export const iconsScript = 'window.ICONS = ' + JSON.stringify(ICONS) + ';';
