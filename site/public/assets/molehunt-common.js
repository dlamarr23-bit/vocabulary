/* ============================================================
   Mole Hunt: what the teacher's screen, the students' screen and the
   Teacher Remote share (Donny, 2026-11-15): making elements, hero pictures
   (the same superheroes as Battle Royale, assets/heroes.js), the lab tools,
   the special roles, and clock text.
   ============================================================ */
(function () {
  'use strict';

  var AV = window.SuperAvatars;
  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var heroByKey = {};
  (AV ? AV.list : []).forEach(function (h) { heroByKey[h.key] = h; });
  var heroSrc = {};
  var NO_HERO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="16" y="28" width="168" height="164" rx="30" fill="#c5c9d6"/><text x="100" y="135" font-family="Arial" font-weight="700" font-size="80" fill="#fff" text-anchor="middle">?</text></svg>');
  function heroURL(key) {
    if (!heroByKey[key]) return NO_HERO;
    if (!heroSrc[key]) heroSrc[key] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(AV.render(heroByKey[key]));
    return heroSrc[key];
  }
  // cls: 'big', 'small'...; gone: grayed out (voted out).
  function heroImg(key, cls, gone) {
    var img = mk('img', 'rb-hero' + (cls ? ' ' + cls : '') + (gone ? ' gray' : ''));
    img.alt = heroByKey[key] ? heroByKey[key].name : '';
    img.src = heroURL(key);
    return img;
  }
  // A name chip with its hero: { name, hero, clear, alive }.
  function chip(p, extra) {
    var c = mk('span', 'mh-chip' + (p.clear ? ' clear' : '') + (p.alive === false ? ' out' : '') + (extra ? ' ' + extra : ''));
    c.appendChild(heroImg(p.hero, 'tiny', p.alive === false));
    c.appendChild(mk('span', 'mh-chip-name', p.name));
    return c;
  }

  var MOLE = '<svg class="mh-mole" viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="36.5" rx="18" ry="3.5" fill="#6e4a2f"/><path d="M7 37c0-17 6-27 13-27s13 10 13 27z" fill="#5e4b41"/><path d="M12 37c0-6 3.5-12 8-12s8 6 8 12z" fill="#e9edf5"/><path d="M17 25.5 20 30l3-4.5" fill="none" stroke="#8a97ad" stroke-width="1.2"/><rect x="10" y="12" width="20" height="2.6" rx="1.2" fill="#22324d"/><circle cx="15.5" cy="13.2" r="3.2" fill="#ffd9a8" stroke="#22324d" stroke-width="1.4"/><circle cx="24.5" cy="13.2" r="3.2" fill="#ffd9a8" stroke="#22324d" stroke-width="1.4"/><circle cx="16" cy="19" r="1.4" fill="#111"/><circle cx="24" cy="19" r="1.4" fill="#111"/><ellipse cx="20" cy="22.3" rx="3.2" ry="2.3" fill="#ff8fa3"/><path d="M10.5 31.5l-3 2.2M11.5 33l-2.4 2.8M29.5 31.5l3 2.2M28.5 33l2.4 2.8" stroke="#f3d3c3" stroke-width="1.3" stroke-linecap="round"/></svg>';
  function mole(cls) { var s = mk('span', 'mh-mole-wrap' + (cls ? ' ' + cls : '')); s.innerHTML = MOLE; return s; }

  var TOOLS = {
    scan: { icon: '🔍', name: 'Private scan', text: 'Is this classmate Clear? Only you see the answer.', target: true },
    public: { icon: '📢', name: 'Public scan', text: 'A Clear result goes on the board\'s Clear list.', target: true },
    peek: { icon: '📓', name: 'Peek at notes', text: 'Read one classmate\'s notes and Evidence Board.', target: true },
    meeting: { icon: '🔔', name: 'Call a meeting', text: 'Everyone talks it over, then votes.', target: false },
    fake: { icon: '🎭', name: 'Fake scan', text: 'Put a made-up scan on the Lab log so you look busy.', target: true },
    cut: { icon: '✂️', name: 'Cut scans', text: 'Take scans out of the class\'s pool.', target: false },
    smudge: { icon: '🖌️', name: 'Smudge', text: 'That classmate never comes up Clear again.', target: true },
    disguise: { icon: '🥸', name: 'Disguise', text: 'The next scan on you says Clear.', target: false },
    powercut: { icon: '🔌', name: 'Power cut', text: 'Drain 10% of the Lab Power bar.', target: false },
    alarm: { icon: '🚨', name: 'Sound an alarm', text: 'The class has 45 seconds to answer together, or it loses scans.', target: false },
    protect: { icon: '🩹', name: 'Protect', text: 'A smudge cannot stick to them this round, and an old one is wiped off. Free, once a round.', target: true }
  };
  var JOBS = {
    detective: { icon: '🕵️', name: 'Detective', team: 'sci', text: 'Every 2 minutes you get one free private scan. Use it on whoever looks suspicious.' },
    medic: { icon: '🩹', name: 'Medic', team: 'sci', text: 'Each round, protect one classmate: a Mole\'s smudge cannot stick to them, and an old one is wiped off.' },
    tech: { icon: '🔧', name: 'Lab Tech', team: 'sci', text: 'Your right answers count double during a lab emergency.' },
    hacker: { icon: '💻', name: 'Hacker', team: 'mole', text: 'Cutting the class\'s scans costs you half.' }
  };
  var EMERGENCY = { spill: '🧪', power: '⚡', gas: '☁️' };

  // "4:05" from milliseconds.
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  window.MH = { mk: mk, heroURL: heroURL, heroImg: heroImg, chip: chip, mole: mole, MOLE: MOLE, TOOLS: TOOLS, JOBS: JOBS, EMERGENCY: EMERGENCY, clock: clock, plural: plural, heroes: heroByKey };
})();
