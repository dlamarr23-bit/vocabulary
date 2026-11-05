/* ============================================================
   The class list on a game's teacher screen (Donny, 2026-11-04): pick the
   class period that is playing, and the lobby shows who from that period
   has joined and who has not.

   The class list is the roster on the Leaderboard page (/api/roster, teacher
   only). A student counts as joined when they are in the game signed in with
   Class Pass (the game tells the teacher's screen each player's school
   email, players[i].email). Guests are not on the list, so they show apart.

   Every game's teacher screen uses this (live/, royale/, surge/):
     IS8Roster.load()                       -> Promise of { students, periods }
     IS8Roster.fillPeriods(select, want)    fills a period menu, then picks want
     IS8Roster.draw(box, period, players)   draws the joined / not joined lists
     IS8Roster.label(period)                "Period 3" (or "" for none)
     IS8Roster.remember(period) / IS8Roster.last()   this computer's last pick
   ============================================================ */
(function () {
  'use strict';

  var got = null;
  function load() {
    if (!got) {
      got = fetch('/api/roster', { headers: { 'X-IS8-Editor': '1' }, credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return { students: (d && d.students) || [], periods: (d && d.periods) || [] }; }, function () { got = null; return { students: [], periods: [] }; });
    }
    return got;
  }
  function label(p) { return p ? (/^\d+$/.test(p) ? 'Period ' + p : p) : ''; }
  function mk(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var KEY = 'is8-live-period';
  function remember(p) { try { localStorage.setItem(KEY, p || ''); } catch (e) { /* private window */ } }
  function last() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }

  function fillPeriods(sel, want) {
    return load().then(function (r) {
      var keep = want != null ? want : sel.value;
      sel.textContent = '';
      var none = mk('option', '', r.periods.length ? 'No period: just show who joins' : 'No class list yet');
      none.value = '';
      sel.appendChild(none);
      r.periods.forEach(function (p) {
        var n = r.students.filter(function (s) { return s.period === p; }).length;
        var o = mk('option', '', label(p) + ' (' + n + ' students)');
        o.value = p;
        sel.appendChild(o);
      });
      if (keep && r.periods.indexOf(keep) >= 0) sel.value = keep;
      return r;
    });
  }

  // The lists under the joined students: who from the period is not here
  // yet, and anyone here from another period or as a guest.
  function draw(box, period, players) {
    if (!box) return;
    load().then(function (r) {
      box.textContent = '';
      box.hidden = !period;
      if (!period) return;
      var here = {};
      (players || []).forEach(function (p) { if (p.email && !p.bot) here[p.email.toLowerCase()] = p; });
      var mine = r.students.filter(function (s) { return s.period === period; });
      var joined = mine.filter(function (s) { return here[s.email]; });
      var missing = mine.filter(function (s) { return !here[s.email]; });
      var head = mk('p', 'lv-roll-head');
      head.appendChild(mk('strong', '', label(period) + ': '));
      head.appendChild(document.createTextNode(joined.length + ' of ' + mine.length + ' joined'));
      box.appendChild(head);
      var row = mk('div', 'lv-roll-cols');
      var col = function (title, list, cls, empty) {
        var c = mk('div', 'lv-roll-col ' + cls);
        c.appendChild(mk('h3', 'lv-roll-title', title + ' (' + list.length + ')'));
        if (!list.length) { c.appendChild(mk('p', 'lv-small', empty)); return c; }
        var ul = mk('ul', 'lv-roll-list');
        list.forEach(function (s) { ul.appendChild(mk('li', 'lv-roll-name', s.name || (s.first + ' ' + (s.last || '').slice(0, 1) + '.'))); });
        c.appendChild(ul);
        return c;
      };
      row.appendChild(col('Not joined yet', missing, 'missing', 'Everyone in ' + label(period) + ' is here.'));
      row.appendChild(col('Joined', joined, 'joined', 'No one from ' + label(period) + ' yet.'));
      box.appendChild(row);
      // Signed in students from another period, and guests.
      var others = (players || []).filter(function (p) {
        if (p.bot) return false;
        if (p.guest || !p.email) return true;
        return !mine.some(function (s) { return s.email === p.email.toLowerCase(); });
      });
      if (others.length) {
        var o = mk('p', 'lv-small lv-roll-others');
        o.textContent = 'Also here: ' + others.map(function (p) {
          var s = p.email && r.students.filter(function (x) { return x.email === p.email.toLowerCase(); })[0];
          return p.name + (p.guest ? ' (guest)' : s && s.period ? ' (' + label(s.period) + ')' : '');
        }).join(', ');
        box.appendChild(o);
      }
    });
  }

  window.IS8Roster = { load: load, fillPeriods: fillPeriods, draw: draw, label: label, remember: remember, last: last };
})();
