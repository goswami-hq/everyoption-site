/* Banner version of each procedure animation (his yes, 2026-11-03). Source: ai-hq projects/platform/design/procedure-banners/. Plays once, about 9 seconds, then holds. */
(function () {
var C = function (a, b, x) { x = (x - a) / (b - a); x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }, L = function (a, b, p) { return a + (b - a) * p; };
var DEFS = '<defs><radialGradient id="ID-heat"><stop offset="0" stop-color="#e8352a" stop-opacity=".78"/><stop offset=".55" stop-color="#ff5a3c" stop-opacity=".28"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="ID-org" cx=".4" cy=".32" r=".8"><stop offset="0" stop-color="var(--org-a)"/><stop offset="1" stop-color="var(--org-b)"/></radialGradient>' +
  '<linearGradient id="ID-bf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--bone)" stop-opacity="0"/><stop offset=".55" stop-color="var(--bone)"/><stop offset="1" stop-color="var(--bone-hi)"/></linearGradient>' +
  '<linearGradient id="ID-bt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--bone-hi)"/><stop offset=".45" stop-color="var(--bone)"/><stop offset="1" stop-color="var(--bone)" stop-opacity="0"/></linearGradient>' +
  '<clipPath id="ID-bl"><path d="M240 62 C240 36 264 26 290 28 C310 31 326 46 334 62 C326 78 310 93 290 96 C264 98 240 88 240 62 Z"/></clipPath>' +
  '<radialGradient id="ID-wall" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#d9b8a6"/><stop offset="1" stop-color="#9c7468"/></radialGradient><linearGradient id="ID-urine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5d675"/><stop offset="1" stop-color="#d39f2d"/></linearGradient>' +
  '<linearGradient id="ID-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a4748"/><stop offset="1" stop-color="#3f3031"/></linearGradient><radialGradient id="ID-pat" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#f3e9d8"/><stop offset="1" stop-color="#b5a48f"/></radialGradient></defs>';
var ROUTE = {
  ufe: 'M-10 28 C60 4 120 66 190 44 C240 26 292 70 330 60 C352 54 372 58 390 68',
  pae: 'M-10 112 C70 128 150 88 222 112 C280 130 342 124 384 92',
  gae: 'M-10 88 C70 62 150 98 230 78 C290 62 340 92 380 84'
};
var TAIL = { ufe: 'M430 70 C500 100 560 40 640 66 C690 82 740 54 800 70', pae: 'M420 110 C500 124 560 104 640 118 C700 126 750 112 800 120', gae: '' };
var SCENE = {
  ufe: '<g class="whole" data-c="390 64"><g transform="translate(390 64) scale(.4) translate(-200 -195)">' +
    '<path d="M120 112 C90 78 62 78 42 96 M280 112 C310 78 338 78 358 96" fill="none" stroke="var(--org-edge)" stroke-width="7" stroke-linecap="round"/>' +
    '<ellipse cx="66" cy="132" rx="23" ry="15" transform="rotate(-18 66 132)" fill="var(--org-b)" stroke="var(--org-edge)" stroke-width="1.5"/><ellipse cx="334" cy="132" rx="23" ry="15" transform="rotate(18 334 132)" fill="var(--org-b)" stroke="var(--org-edge)" stroke-width="1.5"/>' +
    '<path d="M200 70 C270 70 310 115 300 175 C292 225 250 262 222 285 L222 325 Q200 335 178 325 L178 285 C150 262 108 225 100 175 C90 115 130 70 200 70 Z" fill="url(#ID-org)" stroke="var(--org-edge)" stroke-width="2"/>' +
    '<path d="M168 138 Q200 152 232 138 L210 232 Q200 244 190 232 Z" fill="var(--org-a)" opacity=".55"/>' +
    '<g class="fa"><circle cx="252" cy="135" r="46" fill="url(#ID-org)" stroke="var(--org-edge)" stroke-width="1.5"/><circle class="hotf" cx="252" cy="135" r="46" fill="var(--hot)"/><path d="M226 128 C236 104 272 104 280 132" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2" stroke-linecap="round"/></g>' +
    '<g class="fb"><circle cx="150" cy="190" r="27" fill="url(#ID-org)" stroke="var(--org-edge)" stroke-width="1.5"/><circle class="hotf" cx="150" cy="190" r="27" fill="var(--hot)"/></g></g></g>',
  pae: '<path d="M334 62 L800 62" fill="none" stroke="#6f5d52" stroke-width="10"/><path class="ure" d="M334 62 L800 62" fill="none" stroke="var(--urine)"/><g class="drops" fill="#ffe08a"></g>' +
    '<path d="M228 62 C228 26 260 12 292 16 C320 20 340 44 348 62 C340 80 320 104 292 108 C260 112 228 98 228 62 Z" fill="url(#ID-wall)" stroke="var(--org-edge)" stroke-width="1"/>' +
    '<path d="M240 62 C240 36 264 26 290 28 C310 31 326 46 334 62 C326 78 310 93 290 96 C264 98 240 88 240 62 Z" fill="#3a2b2c"/><g clip-path="url(#ID-bl)"><rect class="level" x="235" width="105" height="110" fill="url(#ID-urine)"/></g>' +
    '<g class="lob up"><path d="M352 58 C346 26 372 8 398 12 C424 8 448 28 442 58 C410 54 382 54 352 58 Z" fill="url(#ID-org)" stroke="var(--org-edge)" stroke-width="1"/><path class="hotf" d="M352 58 C346 26 372 8 398 12 C424 8 448 28 442 58 C410 54 382 54 352 58 Z" fill="var(--hot)"/><path d="M372 26 C380 36 384 42 396 46 M420 24 C414 34 410 42 398 46" fill="none" stroke="var(--org-a)" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/></g>' +
    '<g class="lob dn"><path d="M352 66 C346 98 372 116 398 112 C424 116 448 96 442 66 C410 70 382 70 352 66 Z" fill="url(#ID-org)" stroke="var(--org-edge)" stroke-width="1"/><path class="hotf" d="M352 66 C346 98 372 116 398 112 C424 116 448 96 442 66 C410 70 382 70 352 66 Z" fill="var(--hot)"/><path d="M372 98 C380 88 384 82 396 78 M420 100 C414 90 410 82 398 78" fill="none" stroke="var(--org-a)" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/></g>',
  gae: '<path d="M-10 20 C120 24 260 28 336 30 C360 26 392 18 414 28 C432 40 434 72 424 92 C410 110 384 112 360 108 C260 112 120 116 -10 120 Z" fill="url(#ID-skin)"/><path d="M-10 20 C120 24 260 28 336 30 C360 26 392 18 414 28 M-10 120 C120 116 260 112 360 108" fill="none" stroke="var(--skin-edge)" stroke-width="1"/>' +
    '<g class="cap"><ellipse cx="396" cy="68" rx="44" ry="50" fill="var(--org-b)" opacity=".5"/></g>' +
    '<g class="shin"><path d="M366 34 C400 26 430 34 444 44 C520 36 620 34 810 46 L810 92 C660 112 520 116 430 108 C400 114 372 110 362 100 Z" fill="url(#ID-skin)"/><path d="M444 44 C520 36 620 34 810 46 M810 92 C660 112 520 116 430 108" fill="none" stroke="var(--skin-edge)" stroke-width="1"/>' +
    '<path d="M404 44 C416 38 430 42 438 54 C520 58 680 60 820 60 L820 78 C680 80 520 82 438 84 C430 96 416 98 404 94 C400 84 400 54 404 44 Z" fill="url(#ID-bt)"/></g>' +
    '<path d="M399 48 C394 60 394 80 399 92 C392 88 390 54 399 48 Z" fill="var(--org-a)"/><path d="M-40 52 C120 50 300 52 348 50 C360 38 382 38 391 50 C396 58 396 80 391 88 C382 100 360 100 348 88 C300 86 120 88 -40 86 Z" fill="url(#ID-bf)"/>' +
    '<path d="M388 26 C400 22 412 28 414 40 C414 52 402 58 392 54 C382 48 380 32 388 26 Z" fill="url(#ID-pat)" stroke="var(--bone-hi)" stroke-opacity=".6" stroke-width=".6"/>' +
    '<g class="neo" fill="none" stroke="#ff7a66" stroke-width="1.3" stroke-linecap="round"><path d="M352 96 c6 -8 14 -2 18 -10 s10 -4 14 -10"/><path d="M360 40 c8 4 12 -4 18 2 s10 4 12 10"/><path d="M432 96 c-8 -6 -12 2 -18 -6 s-8 -4 -12 -12"/><path d="M434 44 c-8 2 -10 8 -16 6 s-8 6 -14 8"/></g>' +
    '<g class="bolts" fill="none" stroke="#ff6b52" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M352 22 l-7 -7 l8 -2 l-7 -8"/><path d="M446 24 l7 -7 l-8 -2 l7 -8"/><path d="M450 118 l9 6 l-7 3"/><path d="M344 120 l-9 5 l7 3"/></g>'
};
var CENTER = { ufe: [390, 66, 66], pae: [396, 62, 70], gae: [396, 66, 72] };
var inst = [], n = 0;
document.querySelectorAll('.page-strip .pb').forEach(function (f) {
  var k = f.getAttribute('data-s'), id = 's' + (n++), c = CENTER[k], beads = '', i;
  for (i = 0; i < 16; i++) beads += '<circle r="1.7" fill="var(--bead)"/>';
  f.innerHTML = '<svg viewBox="0 0 780 130" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + (k === 'ufe' ? 'A swollen uterus. A thin tube delivers tiny beads, and the fibroids shrink.' : k === 'pae' ? 'An enlarged prostate squeezes the urine tube. A thin tube delivers tiny beads, the prostate shrinks, and urine flows.' : 'A swollen, painful knee. A thin tube delivers tiny particles, the pain calms, and the knee bends.') + '">' + DEFS.replace(/ID/g, id) +
    '<path d="' + TAIL[k] + '" fill="none" stroke="var(--vessel)" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>' + SCENE[k].replace(/ID/g, id) +
    '<circle class="heat" cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '" fill="url(#' + id + '-heat)"/>' +
    '<path class="bg" d="' + ROUTE[k] + '" fill="none" stroke="var(--vessel)" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/><path class="lit" d="' + ROUTE[k] + '" fill="none" stroke="var(--vessel)" stroke-width="3.2" stroke-linecap="round"/><path class="cath" d="' + ROUTE[k] + '" fill="none" stroke="var(--tube)" stroke-width="1.5" stroke-linecap="round"/><circle class="tip" r="2.4" fill="var(--tube)"/><g class="beads">' + beads + '</g></svg>';
  var q = function (s) { return f.querySelector(s); };
  var o = { k: k, q: q, c: c, lit: q('.lit'), cath: q('.cath'), tip: q('.tip'), heat: q('.heat'), beads: f.querySelectorAll('.beads circle'), hot: f.querySelectorAll('.hotf') };
  o.len = o.lit.getTotalLength(); o.lit.style.strokeDasharray = o.cath.style.strokeDasharray = o.len;
  if (k === 'pae') { var d = q('.drops'), h = ''; for (i = 0; i < 14; i++) h += '<circle r="2"/>'; d.innerHTML = h; o.drops = d.querySelectorAll('circle'); }
  inst.push(o);
});
function scale(el, cx, cy, s) { el.setAttribute('transform', 'translate(' + cx + ' ' + cy + ') scale(' + s.toFixed(3) + ') translate(' + (-cx) + ' ' + (-cy) + ')'); }
function seek(t) {
  inst.forEach(function (o) {
    var adv = C(.8, 2.3, t), back = C(3.9, 4.8, t), fix = C(2.7, 4.7, t), l = o.len * adv * (1 - back), p = o.cath.getPointAtLength(l), pulse = Math.sin(t * 3.2);
    o.lit.style.strokeDashoffset = o.cath.style.strokeDashoffset = o.len - l;
    o.lit.style.opacity = o.cath.style.opacity = o.tip.style.opacity = (t > .8 && back < 1) ? 1 : 0;
    o.tip.setAttribute('cx', p.x); o.tip.setAttribute('cy', p.y);
    o.heat.style.opacity = (1 - fix) * (.8 + .2 * pulse);
    for (var h = 0; h < o.hot.length; h++) o.hot[h].style.opacity = (o.k === 'pae' ? .7 : .85) * (1 - fix);
    o.beads.forEach(function (b, j) {
      var u = (t - 2.35 - j * .05) / 1.1, pr = u < 0 ? 0 : u > 1 ? 1 : u, a = j * 2.4, rad = 3 + pr * o.c[2] * .46 * (.55 + .45 * Math.sin(j * 1.7));
      b.setAttribute('cx', o.c[0] + Math.cos(a) * rad); b.setAttribute('cy', o.c[1] + Math.sin(a) * rad * .8);
      b.style.opacity = (u > 0 && u < 1.4) ? (u < 1 ? .95 : .95 * (1.4 - u) / .4) : 0;
    });
    if (o.k === 'ufe') {
      scale(o.q('.whole'), 390, 64, (1 - .13 * fix) * (1 + .012 * pulse * (1 - fix)));
      scale(o.q('.fa'), 252, 135, 1 - .55 * fix); scale(o.q('.fb'), 150, 190, 1 - .55 * fix);
    } else if (o.k === 'pae') {
      var lobe = (1 - .3 * fix) * (1 + .012 * pulse * (1 - fix)), close = 3.2 * (1 - fix) - .4 * fix;
      o.q('.up').setAttribute('transform', 'translate(396 ' + (56 + close) + ') scale(' + lobe.toFixed(3) + ') translate(-396 -56)');
      o.q('.dn').setAttribute('transform', 'translate(396 ' + (68 - close) + ') scale(' + lobe.toFixed(3) + ') translate(-396 -68)');
      o.q('.ure').setAttribute('stroke-width', L(1.5, 7, fix)); o.q('.ure').setAttribute('stroke-opacity', L(.35, .75, fix));
      o.q('.level').setAttribute('y', L(30, 80, C(4.3, 7.5, t)));
      var fast = C(3.6, 4.9, t), speed = L(26, 150, fast);
      o.drops.forEach(function (d, j) {
        var every = fast > .5 ? 1 : 3, on = j % every === 0, x = 440 + ((t * speed + j * 26) % 360);
        d.setAttribute('cx', x); d.setAttribute('cy', 62);
        d.setAttribute('r', L(1.8, 3.2, fast)); d.style.opacity = on ? 1 : 0;
      });
    } else {
      var tremble = (1 - fix) * .7 * Math.sin(t * 22), bend = C(4.6, 5.6, t) * (11 + 11 * Math.sin((t - 4.6) * 1.5 - 1.57));
      o.q('.shin').setAttribute('transform', 'rotate(' + (tremble + bend).toFixed(2) + ' 400 68)');
      o.q('.neo').style.opacity = 1 - fix; scale(o.q('.cap'), 396, 68, 1 - .3 * fix); o.q('.cap').style.opacity = 1 - .6 * fix; var bo = o.q('.bolts'); bo.style.opacity = (1 - C(3, 4.3, t)) * (.5 + .5 * Math.abs(Math.sin(t * 5)));
    }
  });
}
var END = 9, t0 = null, cur = 0, run = true, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, rp = document.getElementById('pb-replay');
function frame(now) { if (!run) return; if (t0 === null) t0 = now; cur = (now - t0) / 1000; if (cur >= END) { seek(END); run = false; if (rp) rp.hidden = false; return; } seek(cur); requestAnimationFrame(frame); }
function play() { if (rp) rp.hidden = true; t0 = null; run = true; requestAnimationFrame(frame); }
if (rp) rp.onclick = play;
window.__seek = function (x) { run = false; seek(x); };
if (reduce) { run = false; seek(END); if (rp) rp.hidden = false; } else { seek(0); play(); }
})();
