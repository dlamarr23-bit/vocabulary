// Battle Royale: tap a question's picture to see it full screen. The X (or Esc,
// or a tap on the dark space around it) goes back to the game (Donny, 2026-11-05).
// Used by the teacher's screen (royale-host.js) and the students' (royale-play.js).
(function () {
  'use strict';

  var layer = null, pic = null, xBtn = null, clock = null, from = null;

  function build() {
    layer = document.createElement('div');
    layer.className = 'rb-zoom-layer';
    layer.hidden = true;
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'The picture, full screen');
    pic = document.createElement('img');
    pic.className = 'rb-zoom-img';
    pic.alt = '';
    pic.referrerPolicy = 'no-referrer';
    pic.addEventListener('load', fit);
    xBtn = document.createElement('button');
    xBtn.type = 'button';
    xBtn.className = 'rb-zoom-x';
    xBtn.setAttribute('aria-label', 'Close the picture and go back to the game');
    xBtn.textContent = '✕';
    xBtn.addEventListener('click', close);
    clock = document.createElement('span');
    clock.className = 'rb-zoom-clock';
    clock.hidden = true;
    clock.setAttribute('aria-label', 'Time left');
    layer.appendChild(pic);
    layer.appendChild(xBtn);
    layer.appendChild(clock);
    layer.addEventListener('click', function (e) { if (e.target === layer) close(); });
    document.addEventListener('keydown', function (e) {
      if (layer.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); xBtn.focus(); }
    });
    document.body.appendChild(layer);
  }

  // The picture fills as much of the screen as it can without stretching.
  function fit() {
    if (pic.naturalWidth && pic.naturalHeight) layer.style.setProperty('--ar', String(pic.naturalWidth / pic.naturalHeight));
  }

  function open(src, back) {
    if (!src) return;
    if (!layer) build();
    from = back || null;
    pic.src = src;
    if (pic.complete) fit();
    layer.hidden = false;
    document.documentElement.classList.add('rb-zoom-on');
    xBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!layer || layer.hidden) return;
    layer.hidden = true;
    document.documentElement.classList.remove('rb-zoom-on');
    var back = from;
    from = null;
    if (back && document.body.contains(back)) back.focus({ preventScroll: true });
  }

  // The seconds left, in the corner while the picture is open (blank hides it).
  function setClock(n, low) {
    if (!layer) return;
    clock.hidden = n === '' || n == null;
    clock.textContent = clock.hidden ? '' : String(n);
    clock.classList.toggle('low', !!low);
  }

  // Puts a picture inside a button that opens it full screen. Returns the button.
  var GLASS = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M15 15l5.5 5.5M10 7v6M7 10h6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  function wrap(img) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'rb-zoom';
    b.setAttribute('aria-label', 'Show the picture full screen');
    b.title = 'Tap to make the picture bigger';
    if (img.parentNode) img.parentNode.replaceChild(b, img);
    b.appendChild(img);
    var badge = document.createElement('span');
    badge.className = 'rb-zoom-badge';
    badge.innerHTML = GLASS;
    b.appendChild(badge);
    b.addEventListener('click', function () { open(img.currentSrc || img.src, b); });
    return b;
  }

  window.rbZoom = {
    open: open,
    close: close,
    wrap: wrap,
    clock: setClock,
    isOpen: function () { return !!layer && !layer.hidden; }
  };
})();
