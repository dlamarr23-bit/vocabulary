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

  // The hand-drawn Mole Hunt picture (the one on Host a game), next to this
  // script in assets/review-icons/.
  var HERE = (document.currentScript && document.currentScript.src) || '';
  var MOLE = HERE.replace(/molehunt-common\.js.*$/, '') + 'review-icons/mole-hunt.webp';
  function mole(cls) {
    var s = mk('span', 'mh-mole-wrap' + (cls ? ' ' + cls : ''));
    var img = mk('img', 'mh-mole mh-mole-pic');
    img.alt = '';
    img.src = MOLE;
    s.appendChild(img);
    return s;
  }

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

  // A student's notes, made with taps (Donny, 2026-11-18): "I think <name>
  // <says> because <why>." col: the Evidence Board column the note moves that
  // classmate to. The keys must match NOTE_WHY in game-server/src/molehunt.js.
  var NOTE_SAYS = {
    mole: { icon: '🚩', text: 'is a Mole', col: 'suspect' },
    sci: { icon: '✅', text: 'is a Scientist', col: 'trust' },
    unsure: { icon: '🤔', text: 'might be a Mole', col: 'unsure' }
  };
  var NOTE_WHY = {
    mole: [['scanNo', 'my scan said Not sure'], ['quiet', 'they are not answering questions'], ['fake', 'their scan looks fake'], ['noClear', 'they are not on the Clear list'], ['vote', 'they voted for a Scientist'], ['rumor', 'a rumor fits them'], ['hunch', 'it is just a hunch']],
    sci: [['scanYes', 'my scan said Clear'], ['onClear', 'they are on the Clear list'], ['busy', 'they answer a lot of questions'], ['vote', 'they voted for a Mole'], ['hunch', 'it is just a hunch']],
    unsure: [['scanNo', 'my scan said Not sure'], ['notScanned', 'nobody has scanned them yet'], ['rumor', 'a rumor could fit them'], ['hunch', 'it is just a hunch']]
  };
  // you: the note is about the student reading it ("I think you are a Mole
  // because you are not answering questions.").
  function noteText(name, v, why, you) {
    var says = NOTE_SAYS[v];
    if (!says) return '';
    var r = (NOTE_WHY[v] || []).filter(function (x) { return x[0] === why; })[0];
    var t = stop('I think ' + (you ? 'you' : name) + ' ' + says.text + (r ? ' because ' + r[1] : ''));
    return you ? t.replace(/^I think you is /, 'I think you are ').replace(/ their /g, ' your ').replace(/ they /g, ' you ').replace(/ them/g, ' you') : t;
  }

  // Keeps a list on the screen in step with the game without drawing it again
  // (Donny, 2026-11-19: "the screen keeps flashing when something new is
  // added"): what is still there stays put, so nothing flashes, jumps or loses
  // its place; new items are made and marked "fresh" (not on the first draw),
  // and items no longer there are taken away. key(item): a name that stays the
  // same for the same item. make(item): a new element. update(el, item):
  // optional, for an item that is still there. Gives back the new elements.
  function syncList(box, items, key, make, update) {
    var have = {};
    [].slice.call(box.children).forEach(function (n) {
      if (n.dataset.k != null && !have[n.dataset.k]) have[n.dataset.k] = n;
      else n.remove();
    });
    var first = box.dataset.synced !== '1';
    box.dataset.synced = '1';
    var made = [];
    var want = items.map(function (it, i) {
      var k = String(key(it, i));
      var n = have[k];
      if (n) { delete have[k]; if (update) update(n, it, i); return n; }
      n = make(it, i);
      n.dataset.k = k;
      if (!first) { n.classList.add('fresh'); made.push(n); }
      return n;
    });
    Object.keys(have).forEach(function (k) { have[k].remove(); });
    want.forEach(function (n, i) { if (box.children[i] !== n) box.insertBefore(n, box.children[i] || null); });
    return made;
  }
  // A new item's slide-in plays once: if it moves later it does not play again.
  document.addEventListener('animationend', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('fresh') && e.animationName === 'mh-fresh') t.classList.remove('fresh');
  });

  // "4:05" from milliseconds.
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  // A sentence's last period, unless it already ends with one (names like Ben C.).
  function stop(text) { return /[.!?]$/.test(text) ? text : text + '.'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  window.MH = { mk: mk, heroURL: heroURL, heroImg: heroImg, chip: chip, mole: mole, MOLE: MOLE, TOOLS: TOOLS, JOBS: JOBS, EMERGENCY: EMERGENCY, NOTE_SAYS: NOTE_SAYS, NOTE_WHY: NOTE_WHY, noteText: noteText, clock: clock, plural: plural, stop: stop, heroes: heroByKey, syncList: syncList };
})();
