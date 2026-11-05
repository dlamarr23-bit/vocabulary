/* ============================================================
   Surge Showdown on this site (Donny, 2026-11-04): helpers the teacher's
   screen (surge/, surge-host.js) and the students' screen (surge/play/,
   surge-play.js) share. The game itself runs on the game server
   (game-server/src/surge.js); both screens hold a connection to it at
   /api/live/<code>/ws, like every other game on this site.

   window.SG
     $(selector), esc(text), store.get/set/del, toast(text, kind)
     connect(path, { onMessage, onStatus, queue })   a connection that comes back by itself
     timing(state, offset)   the clock and the surge right now
     fmtTime(ms), inkOn(color), imgTag(src, cls), hpBar(team)
     podiumHTML(results), confetti(), flash(color)
   ============================================================ */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* private window */ } }
  };
  function toast(msg, kind = '') {
    let wrap = $('#sgToasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'sgToasts'; wrap.className = 'sg sg-toasts'; wrap.setAttribute('role', 'status'); document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  // A connection to the game that comes back by itself: the game server
  // answers "ping" with "pong" every 15 seconds, so a connection that goes
  // quiet for 35 seconds (a sleeping Chromebook, a school filter) is opened
  // again. queue: messages sent while it is down go once it is back (the
  // teacher's buttons).
  function connect(path, { onMessage, onStatus, queue = false }) {
    let ws, tries = 0, closedByUs = false, pingT, retryT, lastMsg = Date.now();
    const outbox = [];
    const api = {
      send(o) {
        if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; }
        if (queue) { outbox.push(o); if (outbox.length > 50) outbox.shift(); }
        return false;
      },
      close() { closedByUs = true; clearInterval(pingT); clearTimeout(retryT); if (ws) try { ws.close(); } catch { /* closed */ } },
      reopen() { tries = 0; if (ws) { const old = ws; ws = null; old.onclose = null; try { old.close(); } catch { /* closed */ } } open(); },
      get online() { return !!ws && ws.readyState === 1; },
      offset: 0
    };
    const open = () => {
      clearTimeout(retryT);
      if (closedByUs) return;
      const sock = ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + path());
      if (onStatus) onStatus('connecting');
      sock.onopen = () => {
        if (sock !== ws) return;
        tries = 0; lastMsg = Date.now();
        if (onStatus) onStatus('online');
        while (outbox.length && sock.readyState === 1) sock.send(JSON.stringify(outbox.shift()));
        clearInterval(pingT);
        pingT = setInterval(() => {
          if (Date.now() - lastMsg > 35000) { try { sock.close(4001, 'heartbeat'); } catch { /* closed */ } return; }
          if (sock.readyState === 1) sock.send('ping');
        }, 15000);
      };
      sock.onmessage = (e) => {
        if (sock !== ws) return;
        lastMsg = Date.now();
        if (e.data === 'pong') return;
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.state && m.state.serverNow) api.offset = m.state.serverNow - Date.now();
        onMessage(m);
      };
      sock.onclose = (e) => {
        if (sock !== ws) return;
        clearInterval(pingT);
        if (closedByUs) { if (onStatus) onStatus('closed', e); return; }
        if (onStatus) onStatus('offline', e);
        tries++;
        retryT = setTimeout(open, tries === 1 ? 300 : Math.min(8000, 500 * 2 ** Math.min(tries, 4)));
      };
    };
    const wake = () => { if (!closedByUs && (!ws || ws.readyState > 1)) { tries = 0; open(); } };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    open();
    return api;
  }

  // The clock and the surge from the game's state.
  function timing(st, offset) {
    const now = Date.now() + (offset || 0);
    const elapsed = st.elapsedBase + (st.runStartedAt ? now - st.runStartedAt : 0);
    const remaining = Math.max(0, st.totalMs - elapsed);
    const p = st.totalMs ? Math.min(1, Math.max(0, elapsed / st.totalMs)) : 0;
    const k = st.settings.surgeCurve, M = st.settings.surgeMax;
    // The final showdown: the last 60 seconds of a game 2 minutes or longer.
    const showdown = !!(st.settings.showdown && st.status !== 'lobby' && st.status !== 'ended' && st.totalMs >= 120000 && remaining <= 60000);
    const surge = (st.status === 'lobby' ? 1 : 1 + (M - 1) * (Math.exp(k * p) - 1) / (Math.exp(k) - 1)) * (showdown ? 2 : 1);
    return { remaining, elapsed, p, surge, showdown };
  }
  const fmtTime = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // Readable text on a team color.
  function inkOn(hex) {
    const n = parseInt(String(hex || '#888888').slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';
  }
  const imgTag = (src, cls = '') => src ? `<img class="${cls}" src="${esc(src)}" alt="" referrerpolicy="no-referrer" loading="eager" onerror="this.style.display='none'">` : '';
  function hpBar(t) {
    const hp = t.maxHp ? (t.hp / t.maxHp) * 100 : 0, sh = t.maxHp ? Math.min(100, (t.shield / t.maxHp) * 100) : 0;
    return `<div class="hpbar" style="--tc:${t.color}"><div class="hp" style="width:${hp}%"></div><div class="sh" style="width:${sh}%"></div></div>`;
  }
  function podiumHTML(results) {
    const r = (results && results.ranked) || [];
    const slot = (x, place) => x ? `
      <div class="pod pod-${place}" style="--tc:${x.color}">
        <div class="pod-icon">${esc(x.icon)}</div>
        <div class="pod-name">${esc(x.name)}</div>
        <div class="pod-score">${x.score.toLocaleString()} pts</div>
        <div class="pod-block"><span>${place}</span></div>
      </div>` : `<div class="pod pod-${place} empty"><div class="pod-block"><span>${place}</span></div></div>`;
    return `<div class="podium">${slot(r[1], 2)}${slot(r[0], 1)}${slot(r[2], 3)}</div>`;
  }
  function confetti() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'sg-confetti';
    document.body.appendChild(c);
    const ctx = c.getContext('2d'); const W = (c.width = innerWidth), H = (c.height = innerHeight);
    const cols = ['#facc15', '#ef4444', '#3b82f6', '#22c55e', '#f472b6', '#8b5cf6', '#fff'];
    const ps = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -Math.random() * H, vy: 2 + Math.random() * 4, vx: -1 + Math.random() * 2, r: Math.random() * 6.28, s: 5 + Math.random() * 7, c: cols[(Math.random() * cols.length) | 0] }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) { p.y += p.vy; p.x += p.vx; p.r += 0.1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
      if (++f < 260) requestAnimationFrame(tick); else c.remove();
    })();
  }
  function flash(color) {
    const f = document.createElement('div');
    f.className = 'sg-flash';
    f.style.background = color;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 520);
  }

  window.SG = { $, esc, store, toast, connect, timing, fmtTime, inkOn, imgTag, hpBar, podiumHTML, confetti, flash };
})();
