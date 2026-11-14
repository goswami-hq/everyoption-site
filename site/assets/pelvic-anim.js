// Chronic pelvic pain: the two "How it works" drawings, one in each treatment fold (his pick B, 2026-11-14, ai-hq
// projects/platform/design/procedure-animations/pelvic-b-animated-2026-11-14.html, round 3; his "Yes both look good add it
// to the dev site", 15:28 CT). Same 14 s story, steps and controls as site/assets/procedure-anim.js, which handles pages
// with one drawing; this file drives each figure marked data-own on its own, so the two can sit on one page.
// The build writes the Before picture into each figure for readers without JavaScript; this script redraws it live.
(function () {
var figs = document.querySelectorAll('.proc[data-own]'); if (!figs.length) return;
var NS = "http://www.w3.org/2000/svg", D = 14, STEPS = [0, 3, 10], KEY = [2, 8.4, 14];
var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
var cl = function (v) { return Math.max(0, Math.min(1, v)); };
var seg = function (t, a, b) { var x = cl((t - a) / (b - a)); return x * x * (3 - 2 * x); };
var M = function (cx, cy, s) { return "translate(" + cx + " " + cy + ") scale(" + s + ") translate(" + (-cx) + " " + (-cy) + ")"; };
var DEFS = '<defs><radialGradient id="pvAche"><stop offset="0" stop-color="var(--ache)" stop-opacity=".5"/><stop offset=".6" stop-color="var(--ache)" stop-opacity=".18"/><stop offset="1" stop-color="var(--ache)" stop-opacity="0"/></radialGradient>'
  + '<pattern id="pvMesh" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0 L8 8 M8 0 L0 8" stroke="var(--tube)" stroke-width="1.3" fill="none"/></pattern><filter id="pvSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>';
var UT = "M200 70 C270 70 310 115 300 175 C292 225 250 262 222 285 L222 325 Q200 335 178 325 L178 285 C150 262 108 225 100 175 C90 115 130 70 200 70 Z";
function dots(g, n, r) { var a = []; for (var i = 0; i < n; i++) { var c = document.createElementNS(NS, "circle"); c.setAttribute("class", "cell"); c.setAttribute("r", r); g.appendChild(c); a.push(c); } return a; }
function coil(g, cx, cy, ang) {
  var d = "", k = Math.PI / 180 * ang, ca = Math.cos(k), sa = Math.sin(k);
  for (var j = 0; j <= 64; j++) { var u = j / 64, al = (u - .5) * 30 + 5 * Math.cos(u * 8 * Math.PI), ac = 6 * Math.sin(u * 8 * Math.PI);
    d += (j ? "L" : "M") + (cx + al * ca - ac * sa).toFixed(1) + " " + (cy + al * sa + ac * ca).toFixed(1); }
  var w = document.createElementNS(NS, "g"); w.innerHTML = '<path class="coil-halo" d="' + d + '"/><path class="coil" d="' + d + '"/>'; g.appendChild(w);
  return { p: w, cx: cx, cy: cy };
}
function showCoil(c, T, t0) { var x = seg(T, t0, t0 + .5); c.p.setAttribute("opacity", x); c.p.setAttribute("transform", M(c.cx, c.cy, .4 + .6 * x)); }
function cathIn(p, T, a, b, c, d) { var L = p._l || (p._l = p.getTotalLength()); p.style.strokeDasharray = L; var x = seg(T, a, b) - seg(T, c, d); p.style.strokeDashoffset = L * (1 - x); p.setAttribute("opacity", x > .001 ? 1 : 0); }

function veins(g, list) { // each: [path, width before, width after]; returns refs for halo, base and full-colour copies
  return list.map(function (v) { var o = { w0: v[1], w1: v[2] }; ["halo", "vein", "vein full"].forEach(function (c, i) { var e = document.createElementNS(NS, "path"); e.setAttribute("class", c); e.setAttribute("d", v[0]); g.appendChild(e); o[i] = e; }); return o; });
}
function setVeins(vs, k, a, wob) { vs.forEach(function (o) { var w = o.w0 + (o.w1 - o.w0) * k + wob; o[0].setAttribute("stroke-width", w + 5); o[1].setAttribute("stroke-width", w); o[2].setAttribute("stroke-width", w); o[2].setAttribute("opacity", 1 - k); o[1].setAttribute("opacity", 1 - .35 * a); }); }
function bolts(g, list) { return list.map(function (b) { var e = document.createElementNS(NS, "g"); e.setAttribute("class", "bolt"); e.setAttribute("transform", "translate(" + b[0] + " " + b[1] + ") rotate(" + b[2] + ")"); e.innerHTML = '<path d="M0 0 L7 -11 L-5 -14 L3 -27"/>'; g.appendChild(e); return e; }); }
function flash(bs, clock, k, off) { bs.forEach(function (e, i) { e.setAttribute("opacity", (reduce ? 1 : Math.max(0, Math.sin(clock * 5 + (i + off) * 1.9))) * k); }); }
function mist(g, paths, n, t0, t1) { // puffs of foamy medicine that drift from the tube into the veins, then fade
  var a = []; for (var i = 0; i < n; i++) { var c = document.createElementNS(NS, "circle"); c.setAttribute("class", "mist"); g.appendChild(c); var p = paths[i % paths.length]; a.push({ c: c, p: p, l: p.getTotalLength(), b: t0 + i * .1, far: .25 + .75 * ((i * 7) % n) / n, r: 7 + (i * 5) % 7 }); }
  return function (T) { a.forEach(function (m) { var x = seg(T, m.b, m.b + 1.3), q = m.p.getPointAtLength(m.l * m.far * x);
    m.c.setAttribute("cx", q.x); m.c.setAttribute("cy", q.y); m.c.setAttribute("r", m.r * (.5 + .7 * x)); m.c.setAttribute("opacity", .95 * seg(T, m.b, m.b + .3) * (1 - seg(T, t1, t1 + 1.4))); }); };
}
function organ(id, cx, cy, s) { return '<g data-id="' + id + '"><g transform="translate(' + cx + ' ' + cy + ') scale(' + s + ') translate(-200 -200)"><path class="organ" d="' + UT + '"/><path data-id="' + id + 'H" class="hot" d="' + UT + '"/><path class="light" d="M168 138 Q200 152 232 138 L210 232 Q200 244 190 232 Z"/></g></g>'; }
function ovary(id, cx, cy, rot) { var e = 'cx="' + cx + '" cy="' + cy + '" rx="19" ry="12" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"'; return '<g data-id="' + id + '"><ellipse class="soft" ' + e + '/><ellipse data-id="' + id + 'H" class="hot" ' + e + '/></g>'; }
function angry(q, id, cx, cy, big, k, pulse) { q(id).setAttribute("transform", M(cx, cy, 1 + (big + .014 * pulse) * (1 - k))); q(id + "H").setAttribute("opacity", (.46 + .14 * pulse) * (1 - k)); }
var S = {
  embo: {
    R: [["M330 -24 C338 30 306 70 314 110 C320 140 300 150 292 164", 14, 4], ["M312 112 C342 140 320 168 302 184 C288 196 270 190 262 204", 10, 3], ["M262 204 C284 222 246 236 262 256 C278 274 242 288 250 310", 11, 3],
        ["M292 164 C272 176 262 190 244 196 C228 202 232 222 216 234", 9, 2.5], ["M302 184 C326 204 298 228 310 254", 8, 2.5], ["M250 250 C232 262 238 280 222 290", 8, 2.5]],
    L: [["M66 -24 C58 30 90 70 80 110 C74 140 92 150 100 164", 12, 4], ["M80 112 C52 140 72 168 90 184 C104 196 120 190 126 204", 9, 3], ["M126 204 C104 222 142 236 126 256 C112 274 144 288 138 310", 10, 3],
        ["M100 164 C120 176 126 190 144 196 C160 202 156 222 172 234", 8, 2.5], ["M90 184 C68 204 92 228 82 252", 7, 2.5]],
    scene: '<circle data-id="gR" class="pv-glow" cx="278" cy="214" r="118"/><circle data-id="gL" class="pv-glow" cx="110" cy="214" r="104"/>'
      + '<path class="fal" d="M150 196 C128 168 112 160 102 158"/><path class="fal" d="M236 196 C258 168 274 160 284 158"/>'
      + ovary('oL', 96, 156, -14) + ovary('oR', 290, 156, 14)
      + organ('ut', 193, 245, .6)
      + '<g data-id="vR"></g><g data-id="vL"></g><g data-id="flow"></g><g data-id="mist" filter="url(#pvSoft)"></g>'
      + '<path data-id="c1" class="cath" d="M330 -24 C338 30 306 70 314 110 C320 140 300 150 292 164"/><path data-id="c2" class="cath" d="M66 -24 C58 30 90 70 80 110 C74 140 92 150 100 164"/>'
      + '<g data-id="coils"></g><g data-id="bolts"></g>'
      + '<g aria-hidden="true"><text class="label" x="193" y="350" text-anchor="middle">Uterus</text><path class="leader" d="M214 118 L276 148"/><text class="label" x="168" y="118">Ovary</text><path class="leader" d="M348 300 L314 258"/><text class="label" x="336" y="318">Veins</text></g>',
    init: function (q) {
      this.q = q; this.vR = veins(q("vR"), this.R); this.vL = veins(q("vL"), this.L); this.gR = q("gR"); this.gL = q("gL");
      this.f = [this.vR[0][1], this.vR[2][1], this.vL[0][1], this.vL[2][1]].map(function (p, k) { return { p: p, l: p.getTotalLength(), d: dots(q("flow"), 5, 2.6), s: k < 2 ? 0 : 1 }; });
      this.mR = mist(q("mist"), this.vR.slice(1).map(function (o) { return o[1]; }), 26, 4.3, 6.4);
      this.mL = mist(q("mist"), this.vL.slice(1).map(function (o) { return o[1]; }), 22, 7.8, 9.8);
      this.c = [coil(q("coils"), 313, 96, 96), coil(q("coils"), 80, 96, 84)]; this.k = [q("c1"), q("c2")];
      this.bR = bolts(q("bolts"), [[322, 150, 55], [330, 232, 95], [276, 322, 150]]); this.bL = bolts(q("bolts"), [[64, 150, -55], [58, 236, -95], [112, 322, -150]]); this.bU = bolts(q("bolts"), [[193, 150, 0]]);
    },
    draw: function (T, a, pulse, clock) {
      var st = [seg(T, 5, 6.2), seg(T, 8.4, 9.6)], both = (st[0] + st[1]) / 2;
      setVeins(this.vR, Math.max(a, .3 * st[0]), a, (1 - a) * (1 - st[0]) * 1.4 * pulse); setVeins(this.vL, Math.max(a, .3 * st[1]), a, (1 - a) * (1 - st[1]) * 1.2 * pulse);
      this.gR.setAttribute("opacity", (.6 + .4 * pulse) * (1 - .6 * st[0]) * (1 - a)); this.gL.setAttribute("opacity", (.6 + .4 * pulse) * (1 - .6 * st[1]) * (1 - a));
      this.f.forEach(function (o) { o.d.forEach(function (c, i) { var n = o.d.length, ph = reduce ? (i + .5) / n : (clock * .16 + i / n) % 1, pt = o.p.getPointAtLength(o.l * ph);
        c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y); c.setAttribute("opacity", .85 * (1 - st[o.s]) * (ph < .06 ? ph / .06 : ph > .9 ? (1 - ph) / .1 : 1)); }); });
      this.mR(T); this.mL(T);
      angry(this.q, "ut", 193, 250, .13, Math.max(a, .3 * both), pulse); angry(this.q, "oR", 290, 156, .32, Math.max(a, .3 * st[0]), pulse); angry(this.q, "oL", 96, 156, .32, Math.max(a, .3 * st[1]), pulse);
      cathIn(this.k[0], T, 3, 4.2, 6.1, 6.7); cathIn(this.k[1], T, 6.7, 7.7, 9.5, 10);
      showCoil(this.c[0], T, 5.6); showCoil(this.c[1], T, 9.0);
      flash(this.bR, clock, 1 - st[0], 0); flash(this.bL, clock, 1 - st[1], 3); flash(this.bU, clock, 1 - both, 6);
    } },
  stent: {
    P: [["M270 176 C264 200 254 214 244 230", 11, 4], ["M244 230 C264 246 232 260 246 278 C254 292 236 302 230 290", 10, 3], ["M244 230 C230 234 230 250 220 256", 8, 2.5], ["M258 204 C282 218 266 242 278 262", 8, 2.5]],
    scene: '<path data-id="legF" class="pv-skin"/><path class="pv-skin" d="M70 -30 C60 40 34 90 34 170 C34 230 52 300 62 370 L170 370 L200 296 L230 370 L330 370 L330 -30 Z"/>'
      + '<path class="pv-skin-edge" d="M70 -30 C60 40 34 90 34 170 C34 230 52 300 62 370 M170 370 L200 296 L230 370"/><path data-id="legE" class="pv-skin-edge"/>'
      + '<circle data-id="glow" class="pv-glow" cx="256" cy="250" r="86"/>'
      + '<path class="vein" stroke-width="22" d="M178 -24 L178 60"/><path class="vein" stroke-width="17" d="M178 60 C165 120 130 200 114 356"/>'
      + '<path class="vein" stroke-width="17" d="M178 60 L190 71"/><path data-id="dist" class="vein" d="M226 104 L236 112 C270 145 292 230 296 356"/><path data-id="distF" class="vein full" d="M226 104 L236 112 C270 145 292 230 296 356"/><path data-id="pin" class="vein" d="M190 71 L226 104"/>'
      + organ('ut', 200, 252, .34)
      + '<g data-id="pv"></g><path data-id="fp" d="M296 356 C292 230 270 145 236 112 L178 60 L178 -24" fill="none"/><g data-id="flow"></g>'
      + '<g transform="translate(208 87.5) rotate(42.5)"><rect data-id="st" class="stent-fill" x="-27" width="54" rx="5"/></g>'
      + '<path data-id="c1" class="cath" d="M296 356 C292 230 270 145 236 112 L186 67 L178 30"/>'
      + '<path class="press" stroke-width="11" d="M226 -24 L226 40"/><path data-id="art" class="press" stroke-width="11" d="M226 40 C206 85 165 190 135 356"/>'
      + '<g data-id="bolts"></g>'
      + '<g aria-hidden="true"><text class="label" x="244" y="6">Artery</text><path class="leader" d="M150 6 L166 10"/><text class="label" x="112" y="12">Vein</text><g data-id="sq"><path class="leader" d="M262 62 L222 84"/><text class="label" x="266" y="62">Squeezed here</text><text class="label" x="318" y="300">Swollen</text><text class="label" x="318" y="318">leg</text></g></g>',
    init: function (q) { var o = this; this.q = q; ["glow", "dist", "distF", "pin", "fp", "st", "c1", "art", "sq", "legF", "legE"].forEach(function (k) { o[k] = q(k); });
      this.pv = veins(q("pv"), this.P); this.l = this.fp.getTotalLength(); this.d = dots(q("flow"), 10, 3);
      var best = 1e9; for (var i = 0; i <= 200; i++) { var pt = this.fp.getPointAtLength(this.l * i / 200), dd = Math.abs(pt.x - 208) + Math.abs(pt.y - 87.5); if (dd < best) { best = dd; this.f0 = i / 200; } }
      this.b = bolts(q("bolts"), [[292, 236, 80], [262, 312, 150], [222, 204, -10]]); },
    draw: function (T, a, pulse, clock) {
      var p = seg(T, 6, 8.4), sw = (1 - p) * 2.5 * pulse, pw = 4 + 13 * p, l = this.l, fp = this.fp, f0 = this.f0 - .03;
      this.pin.setAttribute("stroke-width", pw);
      this.dist.setAttribute("stroke-width", 29 - 12 * p + sw); this.distF.setAttribute("stroke-width", 29 - 12 * p + sw); this.distF.setAttribute("opacity", 1 - p);
      setVeins(this.pv, Math.max(a, .35 * p), a, (1 - p) * 1.3 * pulse);
      this.glow.setAttribute("opacity", (.6 + .4 * pulse) * (1 - .5 * p) * (1 - a));
      var h = Math.max(3, pw - 2); this.st.setAttribute("y", -h / 2); this.st.setAttribute("height", h); this.st.setAttribute("opacity", seg(T, 4.6, 5.2));
      this.art.setAttribute("opacity", 1 - .35 * p); this.sq.setAttribute("opacity", 1 - seg(T, 5.4, 6.2));
      cathIn(this.c1, T, 3, 4.2, 9.2, 10);
      var sp = .04 + .16 * p;
      this.d.forEach(function (c, i) { var n = 10, ph = reduce ? (i + .5) / n : (clock * sp + i / n) % 1, pt = fp.getPointAtLength(l * ph);
        c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y);
        c.setAttribute("opacity", .85 * (ph > f0 ? (i % 4 === 0 ? 1 : p) : 1) * (ph < .05 ? ph / .05 : ph > .92 ? (1 - ph) / .08 : 1)); });
      flash(this.b, clock, (1 - p) * (1 - a), 0);
      var bg = 44 * (1 - Math.max(a, .3 * p)) + (1 - p) * 1.5 * pulse, e = "M330 -30 C340 40 366 90 366 170 C" + (366 + bg * .3) + " 230 " + (348 + bg * 1.25) + " " + (300 - bg * .4) + " " + (338 + bg) + " 370";
      this.legE.setAttribute("d", e); this.legF.setAttribute("d", e + " L320 370 L320 -30 Z");
      angry(this.q, "ut", 200, 258, .2, Math.max(a, .3 * p), pulse);
    } }
};


var KEYS = { "pelvic-embo": "embo", "pelvic-stent": "stent" };
[].forEach.call(figs, function (fig) {
  var sc = Object.create(S[KEYS[fig.dataset.proc]]); if (!sc.draw) return;
  var svg = fig.querySelector("svg.main"), keep = svg.querySelector("defs");
  // the build's static Before picture is replaced by the live scene (same drawing, built by the code below)
  while (svg.lastChild && svg.lastChild !== keep) svg.removeChild(svg.lastChild);
  svg.insertAdjacentHTML("beforeend", DEFS + sc.scene);
  var q = function (id) { return svg.querySelector('[data-id="' + id + '"]'); };
  sc.init(q);
  var rl = fig.querySelector(".route-line"), rLen = rl.getTotalLength(); rl.style.strokeDasharray = rLen;
  var bs = [].slice.call(fig.querySelectorAll("[data-step]")), caps = [].slice.call(fig.querySelectorAll(".proc-cap"));
  var t = 0, clock = 0, playing = false, last = 0, shown = null, visible = false, started = false, ticking = false, rest = false, ended = 0;
  function render(T) {
    var a = seg(T, 10, 13.4), pulse = reduce ? .5 : .5 + .5 * Math.sin(clock * 3.2);
    sc.draw(T, a, pulse, clock);
    rl.style.strokeDashoffset = rLen * (1 - (seg(T, 2.4, 3) - seg(T, 9.6, 10.2)));
    var step = T >= STEPS[2] ? 2 : T >= STEPS[1] ? 1 : 0;
    if (step !== shown) { shown = step; bs.forEach(function (b, i) { b.setAttribute("aria-pressed", i === step ? "true" : "false"); }); caps.forEach(function (c, i) { c.classList.toggle("on", i === step); }); }
  }
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
    if (playing) { t += dt; if (t >= D) { t = D; playing = false; ended = clock; } }
    render(t);
    if (ended && clock - ended > 15) { rest = true; ended = 0; }   // rests about 15 s after the story ends, as on the other pages
    if (visible && !reduce && !rest) requestAnimationFrame(frame); else ticking = false;
  }
  function wake() { if (ticking || reduce || !visible || rest) return; ticking = true; last = performance.now(); requestAnimationFrame(frame); }
  function play(at, step) { if (reduce) { t = KEY[step]; render(t); return; } t = at; playing = true; rest = false; ended = 0; wake(); }
  fig.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.step) { var i = +b.dataset.step; play(STEPS[i], i); } else if (b.dataset.replay !== undefined) play(0, 0);
  });
  fig.classList.add("js");
  [].forEach.call(fig.querySelectorAll("[hidden]"), function (el) { el.hidden = false; });
  fig._seek = function (T) { t = T; playing = false; rest = true; clock = 1; render(T); };   // for the build's screenshot check
  t = reduce ? KEY[0] : 0; render(t);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible && !started && !reduce) { started = true; playing = true; } wake(); }, { threshold: .3 }).observe(fig);
  } else if (!reduce) { visible = true; started = true; playing = true; wake(); }
});
})();
