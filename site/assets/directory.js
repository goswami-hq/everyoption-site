// Every Option job 27: find a doctor by name. Filters in this page as you type; the search text never leaves it (no
// request carries it, nothing is stored). One file (/data/directory.json: name, city, state, profile path, lists) merged
// with the live overlay (/api/listings, procedure only) by the finder's rules: a new account doctor with an office on the
// map is added, and a doctor who removed a procedure leaves only when the finder could show them in no group.
(function () {
  "use strict";
  var q = document.getElementById("dir-q"), list = document.getElementById("dir-results"), status = document.getElementById("dir-status");
  if (!q) return;
  var PROCS = ["ufe", "pae", "gae", "pelvic", "hae"], MAX = 30, OVERLAY_MS = 2500;   // pelvic: job platform-directory-0009; hae: job 0029
  var people = null, base = null, overlays = {};

  function fold(s) {
    return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function wait(ms) { return new Promise(function (ok) { setTimeout(function () { ok(null); }, ms); }); }
  function overlay(proc) {
    return fetch("/api/listings?procedure=" + proc, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (o) { if (o && o.procedure === proc && Array.isArray(o.people)) overlays[proc] = o; })
      .catch(function () {});
  }
  function hasPoint(o) { return o && o.city && o.lat != null && o.lon != null; }
  function merge() {
    var at = {}, out = base.map(function (p) {
      var x = { n: p.n, c: p.c, s: p.s, p: p.p, l: p.l ? p.l.split(" ") : [], ros: !p.l || !!p.r };
      at[p.p.slice(-11, -1)] = x; return x;
    });
    PROCS.forEach(function (proc) {
      var o = overlays[proc]; if (!o) return;
      (o.removed || []).forEach(function (n) { var x = at[n]; if (x) x.l = x.l.filter(function (k) { return k !== proc; }); });
      o.people.forEach(function (c) {
        var x = at[c.npi], f = (c.offices || []).filter(function (o) { return o && o.city; })[0];
        var placed = (x && x.l.indexOf(proc) >= 0) || (c.offices || []).some(hasPoint);
        if (!x) {
          if (!placed || !f || !c.path) return;   // job platform-web-design-0008: the overlay carries the profile link
          x = at[c.npi] = { n: c.name, c: f.city, s: f.state, p: c.path, l: [], ros: false };
          out.push(x);
        } else if (f) { x.c = f.city; x.s = f.state; }
        if (placed && x.l.indexOf(proc) < 0) x.l.push(proc);
        if (!placed) x.l = x.l.filter(function (k) { return k !== proc; });
      });
    });
    people = out.filter(function (x) { return x.l.length || x.ros; }).map(function (x) {
      x.f = fold(x.n); x.w = x.f.split(" "); x.k = x.f.replace(/ /g, ""); return x;
    });
  }
  function load() {
    var ov = Promise.all(PROCS.map(overlay));
    return Promise.all([fetch("/data/directory.json", { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status); return r.json();
    }), Promise.race([ov, wait(OVERLAY_MS)])]).then(function (x) {
      base = x[0].people; merge();
      ov.then(function () { merge(); if (q.value) show(); });   // a late overlay applies as soon as it arrives
    });
  }
  function score(x, toks, joined) {
    var all = toks.every(function (t) { return x.w.some(function (w) { return w.indexOf(t) === 0; }); });
    if (all) return 0;
    if (toks.every(function (t) { return x.f.indexOf(t) >= 0; })) return 1;
    return joined.length > 2 && x.k.indexOf(joined) >= 0 ? 2 : -1;
  }
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (text) n.textContent = text;
    return n;
  }
  function show() {
    var t = fold(q.value);
    list.innerHTML = "";
    if (!t) { status.textContent = people.length.toLocaleString() + " doctors. Type a first or last name."; return; }
    var toks = t.split(" "), joined = toks.join("");
    var hits = people.map(function (x) { return [score(x, toks, joined), x]; }).filter(function (h) { return h[0] >= 0; })
      .sort(function (a, b) { return a[0] - b[0] || (a[1].w[a[1].w.length - 1] < b[1].w[b[1].w.length - 1] ? -1 : 1) || (a[1].f < b[1].f ? -1 : 1); });
    hits.slice(0, MAX).forEach(function (h) {
      var li = el("li"), a = el("a", { href: h[1].p }, h[1].n);
      li.appendChild(a); li.appendChild(document.createTextNode(" ")); li.appendChild(el("span", { "class": "muted" }, h[1].c + ", " + h[1].s));
      list.appendChild(li);
    });
    status.textContent = !hits.length ? "No doctor by that name. Check the spelling, or try the last name only."
      : hits.length > MAX ? "Showing " + MAX + " of " + hits.length + ". Type more of the name to narrow it." : hits.length + (hits.length === 1 ? " doctor." : " doctors.");
  }
  var ready = null;
  function go() {
    if (!ready) ready = load().catch(function () { ready = null; status.textContent = "We couldn't load the list. Check your connection and try again."; throw 0; });
    ready.then(show, function () {});
  }
  q.addEventListener("input", go);
  q.addEventListener("focus", go, { once: true });
  if (q.value) go();
})();
