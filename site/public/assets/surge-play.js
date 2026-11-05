/* ============================================================
   Surge Showdown: the students' screen (surge/play/), Donny 2026-11-04.

   join/ sends a Surge Showdown code here (#CODE). A student signed in with
   Class Pass joins at once under the name on the class list (or picks a
   team first, when the teacher lets students choose). Not signed in: sign
   in, or, when the teacher allows guests, join as a guest with a first name
   and last initial. Then the game: answer questions for energy, and spend it
   in the shop on upgrades, attacks, healing and shields.

   In demo mode the teacher's screen shows this page beside the board
   (?embed=1) as "Teacher View", which can play itself.
   ============================================================ */
(function () {
  'use strict';

  const { $, esc, store, toast, connect, timing, fmtTime, inkOn, imgTag, hpBar, podiumHTML, confetti, flash } = window.SG;
  const STEPS = ['spCode', 'spPass', 'spName', 'spRemoved', 'spGone'];
  const VIEWS = ['vWait', 'vGame', 'vEnd'];
  const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
  const EMBED = new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window;
  if (EMBED) document.documentElement.classList.add('sg-embed');

  let conn = null, S = null, me = null, RULES = null, code = '', token = null, hello = null;
  let removed = false, asGuest = false, wantTeam = null, joining = false;
  let curQ = null, queuedQ = null, locked = false, tab = 'q', lastMyHp = null, shopBuilt = false, lastStatus = null, lastPick = null;

  const tokenKey = (c) => (EMBED ? 'is8-surge-w-' : 'is8-surge-p-') + c;
  function passToken() { return window.IS8Pass ? window.IS8Pass.token() : ''; }

  function showStep(id) {
    STEPS.forEach((s) => { $('#' + s).hidden = s !== id; });
    const inArena = VIEWS.includes(id);
    $('#spArena').hidden = !inArena;
    VIEWS.forEach((v) => $('#' + v).classList.toggle('hidden', v !== id));
    if (!inArena) $('#targetModal').classList.add('hidden');
  }
  function status(text) { $('#spStatus').textContent = text || ''; }

  /* ---------------- the code ---------------- */

  $('#spCodeInput').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
  $('#spCodeForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = $('#spCodeInput').value.trim().toUpperCase();
    $('#spCodeError').textContent = '';
    if (!CODE.test(c)) { $('#spCodeError').textContent = 'The code is 6 letters and numbers. Check the board and try again.'; return; }
    start(c);
  });
  function start(c) {
    code = c;
    token = store.get(tokenKey(c), null);
    me = null; S = null; removed = false; asGuest = false; wantTeam = null;
    if (!EMBED && location.hash.slice(1) !== c) history.replaceState(null, '', location.pathname + location.search + '#' + c);
    openConn();
  }
  function openConn() {
    if (conn) conn.close();
    status('Connecting...');
    conn = connect(() => '/api/live/' + code + '/ws' + (passToken() ? '?pass=' + passToken() : ''), {
      onMessage,
      onStatus: (st) => { status(st === 'online' ? '' : st === 'offline' && me ? 'Lost the connection. Trying again...' : ''); }
    });
  }
  function stop(text) {
    if (conn) conn.close();
    conn = null;
    $('#spGoneText').textContent = text;
    showStep('spGone');
  }

  /* ---------------- joining ---------------- */

  function pickable() { return S ? S.teams.filter((t) => S.status === 'lobby' || (t.active && t.alive)) : []; }
  const choosing = () => S && S.settings.teamPick === 'choose' && pickable().length > 1;
  function joinNow() {
    if (joining) return;
    const msg = { t: 'join', team: wantTeam };
    if (token) msg.token = token;
    if (EMBED) { msg.host = window.parent.SGHost ? window.parent.SGHost.key() : ''; msg.name = 'Teacher View'; }
    if (asGuest) msg.name = $('#spNick').value;
    joining = !!asGuest;
    if (joining) { $('#spNameBtn').disabled = true; $('#spNameBtn').textContent = 'Checking your name...'; }
    conn.send(msg);
  }
  function joinReady() { joining = false; $('#spNameBtn').disabled = false; $('#spNameBtn').textContent = 'Join game'; }
  // Sign in with Class Pass; "Join as a guest" too when the teacher lets guests in.
  function passStep(m) {
    $('#spPassTitle').textContent = (m && m.title) || 'Surge Showdown';
    $('#spPassError').textContent = '';
    $('#spGuestBox').hidden = !(m && m.guests);
    $('#spPassBtn').disabled = false;
    showStep('spPass');
  }
  $('#spPassBtn').addEventListener('click', function () {
    if (!window.IS8Pass) return;
    const btn = this;
    btn.disabled = true;
    $('#spPassError').textContent = '';
    window.IS8Pass.signIn().then(() => { btn.disabled = false; openConn(); }, (err) => {
      btn.disabled = false;
      $('#spPassError').textContent = err.message;
    });
  });
  $('#spGuestBtn').addEventListener('click', () => { asGuest = true; nameStep(); });
  // A guest types a name; anyone picks a team when the teacher lets students choose.
  function nameStep() {
    $('#spNameTitle').textContent = (S && S.settings.title) || 'Surge Showdown';
    $('#spNickBox').hidden = !asGuest;
    $('#spPickWrap').hidden = !choosing();
    paintPick();
    joinReady();
    showStep('spName');
    if (asGuest) setTimeout(() => $('#spNick').focus(), 50);
  }
  function paintPick() {
    if (!choosing()) return;
    $('#spTeamPick').innerHTML = pickable().map((t) => `<button type="button" data-team="${t.id}" class="${wantTeam === t.id ? 'on' : ''}" style="--tc:${t.color};--on:${inkOn(t.color)}" aria-pressed="${wantTeam === t.id}"><span>${esc(t.icon)} ${esc(t.name)}</span><span class="sg-pick-n">${t.size}</span></button>`).join('');
  }
  $('#spNameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    $('#spNameError').textContent = '';
    if (asGuest && $('#spNick').value.trim().length < 2) { $('#spNameError').textContent = 'Type your first name and last initial.'; return; }
    if (choosing() && wantTeam == null) { $('#spNameError').textContent = 'Pick a team.'; return; }
    joinNow();
  });
  $('#spTeamPick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-team]');
    if (!b) return;
    wantTeam = +b.dataset.team;
    paintPick();
  });
  function afterHello(m) {
    if (token) { joinNow(); return; }
    if (m.state.status === 'ended') { stop('That game is over. Wait for your teacher to start a new one.'); return; }
    if (EMBED) { const t = pickable()[0]; wantTeam = choosing() && t ? t.id : null; joinNow(); return; }
    if (passToken() && m.signedIn) { if (choosing()) nameStep(); else joinNow(); return; }
    if (m.needPass || !asGuest) { passStep(m); return; }
    nameStep();
  }

  /* ---------------- messages ---------------- */

  function onMessage(m) {
    switch (m.t) {
      case 'hello':
        if (m.kind && m.kind !== 'surge') { location.replace('../../join/#' + code); return; }
        hello = m; RULES = m.rules; S = m.state;
        afterHello(m);
        break;
      case 'joined':
        token = m.token;
        store.set(tokenKey(code), token);
        joinReady();
        if (EMBED) window.parent.postMessage({ surgeWatch: true, pid: m.pid, code: S.code }, location.origin);
        break;
      case 'me': me = m.me; unremove(); render(); break;
      case 'readmitted': unremove(); break;
      case 'state':
        S = m.state;
        if (removed) break;
        if (me) render();
        else if (!$('#spName').hidden) { $('#spPickWrap').hidden = !choosing(); paintPick(); }
        break;
      case 'q':
        if (!m.q) { curQ = null; queuedQ = null; break; }
        if (removed) break;
        if (locked) queuedQ = m.q; else { curQ = m.q; renderQ(); }
        break;
      case 'result':
        if (m.auto) {
          if (locked || !curQ) break;
          locked = true;
          lastPick = document.querySelectorAll('.opt')[m.pick] || null;
        }
        onResult(m);
        break;
      case 'toast': toast(m.msg, 'good'); break;
      case 'nameError':
        joinReady();
        if ($('#spName').hidden) nameStep();
        $('#spNameError').textContent = m.msg;
        $('#spNick').select();
        break;
      case 'error':
        joinReady();
        if (m.code === 'needPass') { passStep(hello); break; }
        if (m.code === 'nogame') { store.del(tokenKey(code)); stop(m.msg); break; }
        if (!me) {
          if (token && /ended|locked|full/i.test(m.msg)) { store.del(tokenKey(code)); token = null; }
          if (!$('#spName').hidden) $('#spNameError').textContent = m.msg;
          else stop(m.msg);
        } else toast(m.msg, 'bad');
        break;
      case 'kicked': kicked(); break;
      case 'over':
        store.del(tokenKey(code));
        stop(m.msg || 'The game is over.');
        break;
    }
  }
  function kicked() {
    // Stays connected: if the teacher lets them back in, the game picks up where it left off.
    removed = true;
    showStep('spRemoved');
  }
  function unremove() {
    if (!removed) return;
    removed = false;
    toast('Your teacher let you back in!', 'good');
  }

  /* ---------------- drawing ---------------- */

  function myTeam() { return me && S ? S.teams[me.team] : null; }
  function render() {
    if (!S || !me || removed) return;
    const t = myTeam();
    if (!t) return;
    $('#spArena').style.setProperty('--tc', t.color);
    if (S.status === 'lobby') { showStep('vWait'); renderWait(); }
    else if (S.status === 'ended') { showStep('vEnd'); renderEnd(lastStatus !== 'ended'); }
    else { showStep('vGame'); renderGame(); }
    lastStatus = S.status;
  }
  function renderWait() {
    const t = myTeam();
    const mates = S.players.filter((p) => p.team === t.id);
    $('#waitBox').innerHTML = `
      <div class="big-ic">${esc(t.icon)}</div>
      <div class="display sg-wait-title">You are on <span style="color:${t.color}">${esc(t.name)}</span>!</div>
      <p class="muted sg-wait-text">${esc(me.name)}, look up at the board. Your teacher will start the game soon.</p>
      <div class="row sg-center">${mates.map((p) => `<span class="tchip" style="--tc:${t.color}">${esc(p.name)}</span>`).join('')}</div>
      <p class="muted sg-wait-foot">${S.teams.length} teams · ${S.players.length} ${S.players.length === 1 ? 'player' : 'players'} · ${S.settings.durationMin} minute game</p>`;
  }
  function renderGame() {
    const t = myTeam();
    $('#phead').style.setProperty('--tc', t.color);
    const bp = Math.round(((t.boost || 1) - 1) * 100);
    $('#myTeam').innerHTML = `<span class="myteam-ic">${esc(t.icon)}</span>${esc(t.name)}${bp > 0 ? `<span class="boost-tag" title="Your team is smaller, so your power-ups are ${bp}% stronger">💪 +${bp}%</span>` : ''}`;
    $('#myHpBar').innerHTML = hpBar(t);
    $('#myHpTxt').textContent = t.alive ? `❤️ ${t.hp} / ${t.maxHp}${t.shield ? `  ·  🛡️ ${t.shield}` : ''}  ·  ${t.score.toLocaleString()} pts` : `💀 Fallen · ${t.score.toLocaleString()} pts`;
    const hpNow = t.hp + t.shield;
    if (lastMyHp != null && hpNow < lastMyHp) { flash('#ef4444'); $('#phead').classList.remove('hit'); void $('#phead').offsetWidth; $('#phead').classList.add('hit'); }
    lastMyHp = hpNow;
    $('#energy').textContent = me.energy.toLocaleString();
    $('#fallenBanner').classList.toggle('hidden', t.alive);
    if (!t.alive) {
      const cb = S.settings.comeback > 0 && !t.revived ? ` 🔄 Comeback: ${t.revive || 0} / ${S.settings.comeback} correct answers to return!` : '';
      $('#fallenBanner').textContent = (S.settings.fallenCanAttack ? '💀 Your team has fallen! Keep answering. You can still attack the other teams.' : '💀 Your team has fallen! Keep answering to earn points for your team.') + cb;
    }
    const d = S.drop;
    $('#dropStrip').classList.toggle('hidden', !d);
    if (d) {
      const label = { heal: '❤️ Big heal', shield: '🛡️ Mega shield', energy: '⚡ Energy for your whole team' }[d.prize], n = d.prog[t.id] || 0;
      const lead = Math.max(0, ...Object.values(d.prog));
      $('#dropStrip').innerHTML = `<span>📦 SUPPLY DROP: ${label}! Your team</span><div class="cb-bar"><i style="width:${(n / d.need) * 100}%"></i></div><b>${n}/${d.need}</b>${lead > n ? `<span class="muted sg-small">Leader: ${lead}/${d.need}</span>` : ''}`;
    }
    $('#gambleBanner').classList.toggle('hidden', !me.gamble);
    if (me.gamble) $('#gambleBanner').textContent = `🎲 DOUBLE OR NOTHING! Get this one right for about +${gambleAmt()} team health. Wrong costs the same.`;
    $('#pausedBanner').classList.toggle('hidden', S.status !== 'paused');
    $('#streakTxt').innerHTML = me.streak > 1 ? `<span class="streak">🔥 ${me.streak} in a row</span>` : `✓ ${me.correct} correct`;
    $('#miniTeams').innerHTML = S.teams.filter((x) => x.active).map((x) => `<div class="mini ${x.alive ? '' : 'fallen'} ${x.id === t.id ? 'mine' : ''}" style="--tc:${x.color}">${esc(x.icon)} ${esc(x.name)}${S.bounty === x.id ? ' <span class="tgt" title="Bounty: hit this team for bonus energy">🎯</span>' : ''} <span class="muted mini-score">${x.score.toLocaleString()}</span>${hpBar(x)}</div>`).join('');
    $('#ticker').innerHTML = S.feed.slice(-4).reverse().map((e) => `<div class="ev ${esc(e.kind)}">${esc(e.text)}</div>`).join('');
    if (!curQ && !locked) $('#qtext').textContent = S.status === 'paused' ? 'Paused' : 'Loading...';
    buildShop();
    updateShop();
  }

  /* ---------------- questions ---------------- */

  function renderQ() {
    if (!curQ) return;
    $('#qimg').innerHTML = imgTag(curQ.img, 'qimg');
    $('#qtext').textContent = curQ.text;
    $('#qtext').classList.toggle('short', !curQ.text);
    $('#fb').textContent = '';
    $('#fb').className = 'feedback';
    $('#answerArea').innerHTML = `<div class="opts">${curQ.options.map((o, i) => `<button type="button" class="opt" data-i="${i}">${imgTag(o.img)}${o.t ? `<span>${esc(o.t)}</span>` : ''}</button>`).join('')}</div>`;
  }
  function answer(val, btn) {
    if (locked || !curQ) return;
    if (S.status !== 'running') { toast(S.status === 'paused' ? 'The game is paused' : 'The game is not running', 'bad'); return; }
    const sent = conn.send({ t: 'answer', qid: curQ.id, pick: val });
    if (!sent) { toast('Reconnecting... try that answer again in a second', 'bad'); return; }
    locked = true;
    lastPick = btn || null;
    setTimeout(() => { if (locked && !$('#fb').textContent) locked = false; }, 4000);
  }
  function onResult(m) {
    const fb = $('#fb');
    if (m.correct) {
      fb.className = 'feedback good';
      fb.textContent = `Correct! +${m.gained} ⚡`;
      if (m.gamble && m.gamble.win) { fb.textContent += ` 🎲 You WON the bet: +${m.gamble.amt} for your team!`; flash('#7c3aed'); }
      if (lastPick) lastPick.classList.add('right');
    } else {
      fb.className = 'feedback bad';
      fb.textContent = `Not quite${m.gained < 0 ? ` (${m.gained} ⚡)` : ''}`;
      document.querySelectorAll('.opt').forEach((b, i) => { if (i === m.right) b.classList.add('right'); else if (b === lastPick) b.classList.add('wrong'); });
      if (m.gamble && m.gamble.win === false) fb.insertAdjacentHTML('beforeend', `<div class="sg-gamble-lost">🎲 Lost the bet: -${m.gamble.amt} team health</div>`);
    }
    // After a wrong answer the right one stays up (the Read the right answer
    // setting), and the Slow down rule covers the screen. The game server
    // ignores answers until both are over (Donny, 2026-11-04).
    const wait = m.correct ? (m.gamble ? 1800 : 650) : Math.max(m.gamble ? 1800 : 1700, m.readMs || 0, m.slowMs || 0);
    clearInterval(readTick);
    if (!m.correct && (m.readMs || m.slowMs)) {
      const end = Date.now() + wait;
      const line = document.createElement('div');
      line.className = 'sg-read-next';
      fb.appendChild(line);
      const tick = () => {
        const left = Math.ceil((end - Date.now()) / 1000);
        line.textContent = left > 0 ? `Read the right answer. Next question in ${left}` : '';
        if (left <= 0) clearInterval(readTick);
      };
      tick();
      readTick = setInterval(tick, 200);
    }
    if (m.slowMs) slowCover(m.slowMs, m.answer);
    setTimeout(() => {
      locked = false;
      if (queuedQ) { curQ = queuedQ; queuedQ = null; renderQ(); }
    }, wait);
  }
  let readTick = 0, slowTick = 0;
  function slowCover(ms, answerText) {
    let box = document.getElementById('spSlow');
    if (!box) {
      box = document.createElement('div');
      box.id = 'spSlow';
      box.className = 'lv-slow';
      box.setAttribute('role', 'alert');
      box.innerHTML = '<div class="lv-slow-card"><p class="lv-slow-emoji">🐢</p><p class="lv-slow-title">Slow down and read!</p><p class="lv-slow-text"></p><p class="lv-slow-num"></p></div>';
      document.body.appendChild(box);
    }
    box.querySelector('.lv-slow-text').innerHTML = '3 wrong answers in 10 seconds is guessing.' +
      (answerText ? ` The right answer was <b>${esc(answerText)}</b>.` : '') + ' Read every choice before you pick.';
    const end = Date.now() + ms;
    clearInterval(slowTick);
    const tick = () => {
      const left = Math.ceil((end - Date.now()) / 1000);
      box.hidden = left <= 0;
      if (left <= 0) { clearInterval(slowTick); return; }
      box.querySelector('.lv-slow-num').textContent = 'Back in ' + left;
    };
    tick();
    slowTick = setInterval(tick, 200);
  }

  /* ---------------- the shop ---------------- */

  function buildShop() {
    if (shopBuilt || !RULES) return;
    shopBuilt = true;
    const G = RULES.gamble;
    $('#powers').innerHTML = (S.settings.gamble && G ? `
      <button type="button" class="item gamble-item" data-gamble="1">
        <div class="it-top"><span class="it-ic">${G.icon}</span>${G.name}</div>
        <div class="it-d">${G.desc}</div>
        <div class="it-amt" id="gambleAmt"></div>
        <div class="it-cost">⚡ ${G.cost}</div>
      </button>` : '') + Object.entries(RULES.powers).map(([k, p]) => `
      <button type="button" class="item" data-power="${k}">
        <div class="it-top"><span class="it-ic">${p.icon}</span>${p.name}</div>
        <div class="it-d">${p.desc}</div>
        <div class="it-amt" data-amt="${k}"></div>
        <div class="it-cost">⚡ ${p.cost}</div>
      </button>`).join('');
    $('#upgrades').innerHTML = Object.entries(RULES.upgrades).map(([k, u]) => `
      <button type="button" class="item" data-upg="${k}">
        <div class="it-top">${k === 'gain' ? '💰' : '🔥'} ${u.name}</div>
        <div class="it-d">${u.desc}</div>
        <div class="lvl" data-lvl="${k}"></div>
        <div class="it-amt" data-uamt="${k}"></div>
        <div class="it-cost" data-ucost="${k}"></div>
      </button>`).join('');
  }
  function powerAmt(k) { return Math.round(RULES.powers[k].base * S.settings.powerScale * timing(S, conn.offset).surge * (myTeam().boost || 1)); }
  function gambleAmt() { return Math.round(RULES.gamble.base * S.settings.powerScale * timing(S, conn.offset).surge * (myTeam().boost || 1)); }
  function updateShop() {
    if (!shopBuilt || !me || !S) return;
    const t = myTeam(), running = S.status === 'running', sd = timing(S, conn.offset).showdown;
    const gb = document.querySelector('[data-gamble]');
    if (gb) {
      const wait = Math.ceil(((me.gambleNext || 0) - (Date.now() + (conn.offset || 0))) / 1000);
      gb.disabled = !running || !t.alive || me.gamble || wait > 0 || me.energy < RULES.gamble.cost;
      $('#gambleAmt').textContent = !t.alive ? 'Not while your team is fallen' : me.gamble ? 'Bet placed! Answer your next question' : wait > 0 ? `Ready in ${wait}s` : `Win or lose ${gambleAmt()} health`;
    }
    for (const [k, p] of Object.entries(RULES.powers)) {
      const el = document.querySelector(`[data-power="${k}"]`);
      const self = p.target === 'self';
      const blocked = (!t.alive && self) || (!t.alive && !S.settings.fallenCanAttack) || (sd && k === 'mend');
      el.disabled = !running || me.energy < p.cost || blocked;
      const a = powerAmt(k);
      document.querySelector(`[data-amt="${k}"]`).textContent = sd && k === 'mend' ? 'No healing in the Final Showdown!' : blocked ? (self ? 'Not while your team is fallen' : 'Fallen teams cannot attack') :
        k === 'mend' ? `Heals ${a}` : k === 'shield' ? `+${a} shield` : k === 'barrage' ? `${a} damage to each team` : k === 'siphon' ? (sd ? `${a} damage (no heal in the showdown)` : `${a} damage + heal ${a}`) : `${a} damage`;
    }
    for (const [k, u] of Object.entries(RULES.upgrades)) {
      const lvl = me.upg[k], max = u.levels.length - 1, el = document.querySelector(`[data-upg="${k}"]`);
      document.querySelector(`[data-lvl="${k}"]`).innerHTML = u.levels.map((_, i) => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('');
      const now = u.levels[lvl], next = u.levels[lvl + 1];
      document.querySelector(`[data-uamt="${k}"]`).textContent = k === 'gain' ? `${now} ⚡ per answer${next != null ? `, next ${next}` : ''}` : `+${now} per answer in a row${next != null ? `, next +${next}` : ''}`;
      document.querySelector(`[data-ucost="${k}"]`).textContent = lvl >= max ? 'MAXED' : `⚡ ${u.costs[lvl + 1]}`;
      el.disabled = !running || lvl >= max || me.energy < u.costs[lvl + 1];
    }
  }
  let pendingPower = null;
  function usePower(k) {
    if (RULES.powers[k].target === 'enemy') { pendingPower = k; openTargets(); }
    else conn.send({ t: 'power', key: k });
  }
  function openTargets() {
    const p = RULES.powers[pendingPower];
    const ts = S.teams.filter((t) => t.active && t.alive && t.id !== me.team);
    $('#tmTitle').textContent = `${p.icon} ${p.name}: ${powerAmt(pendingPower)} damage. Pick a team.`;
    $('#tmTargets').innerHTML = ts.length ? ts.map((t) => `<button type="button" class="target" data-target="${t.id}" style="--tc:${t.color}"><div class="tt">${esc(t.icon)} ${esc(t.name)}<span class="muted sg-small sg-push">${t.score.toLocaleString()} pts</span></div>${hpBar(t)}<div class="muted sg-small">❤️ ${t.hp}${t.shield ? ` · 🛡️ ${t.shield}` : ''}</div></button>`).join('') : '<p class="muted">No teams left to target.</p>';
    $('#targetModal').classList.remove('hidden');
  }

  /* ---------------- the end ---------------- */

  function renderEnd(fresh) {
    const R = S.results;
    if (!R) return;
    $('#podium').innerHTML = podiumHTML(R);
    const mine = R.ranked.find((r) => r.id === me.team);
    $('#myStats').innerHTML = `<div class="display sg-my-place">${esc(myTeam().icon)} ${esc(myTeam().name)} finished #${mine ? mine.rank : '-'}</div>
      <div class="row sg-center sg-my-line"><span>✓ ${me.correct} correct</span><span>🔥 best streak ${me.best}</span><span>💥 ${me.dmg} damage</span><span>⭐ ${me.points} pts</span></div>`;
    $('#rankList').innerHTML = R.ranked.map((t) => `<div class="rank-row ${t.id === me.team ? 'mine' : ''}" style="--tc:${t.color}"><span class="r">${t.rank}</span><span class="rank-ic">${esc(t.icon)}</span><b>${esc(t.name)}</b><span class="s">${t.score.toLocaleString()} pts</span></div>`).join('');
    if (fresh && mine && mine.rank <= 3) setTimeout(confetti, 1200);
  }

  /* ---------------- taps ---------------- */

  document.addEventListener('click', (e) => {
    if (!conn) return;
    const o = e.target.closest('.opt');
    if (o) { answer(+o.dataset.i, o); return; }
    const tb = e.target.closest('[data-tab]');
    if (tb) {
      tab = tb.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === tb));
      $('#tabQ').classList.toggle('hidden', tab !== 'q');
      $('#tabShop').classList.toggle('hidden', tab !== 'shop');
      return;
    }
    const gb = e.target.closest('[data-gamble]');
    if (gb && !gb.disabled) { conn.send({ t: 'gamble' }); return; }
    const pw = e.target.closest('[data-power]');
    if (pw && !pw.disabled) { usePower(pw.dataset.power); return; }
    const up = e.target.closest('[data-upg]');
    if (up && !up.disabled) { conn.send({ t: 'upgrade', key: up.dataset.upg }); return; }
    const tg = e.target.closest('[data-target]');
    if (tg) { conn.send({ t: 'power', key: pendingPower, target: +tg.dataset.target }); $('#targetModal').classList.add('hidden'); return; }
    if (e.target.id === 'tmClose' || e.target.id === 'targetModal') $('#targetModal').classList.add('hidden');
  });
  // Number keys 1 to 4 answer, on a computer.
  document.addEventListener('keydown', (e) => {
    if (tab !== 'q' || !curQ || $('#vGame').classList.contains('hidden') || document.activeElement.tagName === 'INPUT') return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= curQ.options.length) answer(n - 1, document.querySelectorAll('.opt')[n - 1]);
  });

  setInterval(() => {
    if (!S || !me || !conn || (S.status !== 'running' && S.status !== 'paused')) return;
    const tm = timing(S, conn.offset);
    $('#ptimer').textContent = fmtTime(tm.remaining);
    $('#ptimer').classList.toggle('low', tm.remaining < 30000);
    $('#surgeX').textContent = '×' + tm.surge.toFixed(1);
    $('#surgeX').style.setProperty('--glow', Math.min(1, (tm.surge - 1) / Math.max(1, S.settings.surgeMax - 1)));
    $('#sdStrip').classList.toggle('hidden', !tm.showdown);
    updateShop();
  }, 500);

  // A sign-in from another tab: come back in signed in.
  if (window.IS8Pass && window.IS8Pass.onChange) window.IS8Pass.onChange(() => { if (conn && !me && !$('#spPass').hidden && passToken()) openConn(); });

  /* ---------------- start ---------------- */

  const fromHash = location.hash.slice(1).toUpperCase();
  if (CODE.test(fromHash)) start(fromHash);
  else showStep('spCode');
})();
