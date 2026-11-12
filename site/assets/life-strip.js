/* Page-top strip that shows the symptom in daily life, with no anatomy (his pick of direction C, 2026-11-11, after a
   non-medical viewer said of the anatomy strip "idk what that is or what I'm looking at"). Source and review history:
   ai-hq projects/platform/design/page-strips-2026-11-11/. Plays once, about 13 seconds, then holds; the held frame names
   the condition. Reduced motion shows the held frame. Colours that change with the page theme are CSS variables on .ls
   (src-assets/site.css). A scene per procedure key; registry part "banner": "life" (tools/registry.py). */
(function () {
var host = document.querySelector('.page-strip .ls'); if (!host) return;
var SCENES = {
  // Fibroids (his words 2026-11-11: "Combine A and B"; "one full week of bleeding is enough"; "ruin your week"; "Hold the
  // resolution of the storm until the end"; "get the color scheme to match the fibroid page").
  ufe: { label: 'A woman sits curled on a couch holding a heating pad, in the rain. A one-week calendar on the wall fills with a drop every day. Text: Heavy periods and cramps that ruin your week? It could be fibroids: non-cancerous growths in the uterus. Fibroids have more than one treatment. See every option. Then the rain clears and she gets up.',
    caps: [['Heavy periods and <tspan class="t">cramps</tspan>', 'that ruin your week?'],
           ['It could be <tspan class="t">fibroids</tspan>:', 'non-cancerous growths', 'in the uterus.'],
           ['Fibroids have more', 'than one treatment.', 'See <tspan class="t">every option</tspan>.']] }
};
var K = host.getAttribute('data-s'), SC = SCENES[K]; if (!SC) return;
var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var cl = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; }, seg = function (t, a, b) { var x = cl((t - a) / (b - a)); return x * x * (3 - 2 * x); }, L = function (a, b, p) { return a + (b - a) * p; };
var DROP = 'M0 -7 C3 -2 5 1 5 3.5 A5 5 0 0 1 -5 3.5 C-5 1 -3 -2 0 -7 Z', SK = '#c99067', HAIR = '#2a1e19', TOP = '#7da38d', LEG = '#3f5e55', EDGE = '#efe4cf';
function limb(d, col, w) { return '<path d="' + d + '" fill="none" stroke="' + EDGE + '" stroke-width="' + (w + 3) + '" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
function cap(i, x, y, w, lines) {
  var h = 10 + 17 * lines.length, t = '';
  lines.forEach(function (l, j) { t += '<text class="c" x="' + (x + w / 2) + '" y="' + (y + 19 + 17 * j) + '" text-anchor="middle">' + l + '</text>'; });
  return '<g class="cap" id="ls-c' + i + '" filter="url(#ls-sh)"><rect x="' + x + '" y="' + (y + 3) + '" width="' + w + '" height="' + h + '" rx="7" fill="#5e1f3c"/><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="7" fill="#fbf6ec"/>' + t + '</g>';
}
function build() {
  var rays = '', rain = '', fl = '', cal = '', zig = '', i, x, cols = ['#ffb648', '#fbf6ec', '#f6dce6', '#fbf6ec'], wd = 'MTWTFSS';
  for (i = 0; i < 12; i++) rays += '<path d="M0 0 L-9 -150 L9 -150 Z" transform="rotate(' + (i * 30) + ')" fill="var(--ls-ray)"/>';
  for (i = 0; i < 26; i++) rain += '<path class="ls-r" d="M0 0 l-2 7" stroke="#cdb7c1" stroke-width="1.3" stroke-linecap="round"/>';
  for (i = 0; i < 26; i++) fl += '<g class="ls-f" data-x="' + (24 + i * 30.5 + 9 * Math.sin(i * 1.7)).toFixed(1) + '" data-y="' + (121 + 5 * Math.sin(i * 2.3)).toFixed(1) + '"><circle r="3.4" fill="' + cols[i % 4] + '" stroke="' + EDGE + '" stroke-width=".8"/><circle r="1.1" fill="#22302b"/></g>';
  for (i = 0; i < 7; i++) { x = 256 + i * 12.86;
    cal += '<rect x="' + x + '" y="13" width="12.86" height="34" fill="#fbf6ec" stroke="' + EDGE + '" stroke-width="1"/><text class="d" x="' + (x + 6.43) + '" y="23.5" text-anchor="middle">' + wd.charAt(i) + '</text>' +
      '<g class="ls-d" transform="translate(' + (x + 6.43) + ' 36) scale(.86)"><path d="' + DROP + '" fill="#c2452d" stroke="' + EDGE + '" stroke-width=".9"/></g>'; }
  [[-15, 91, -70], [15, 91, 20], [13, 81, -20]].forEach(function (v) { zig += '<path d="M0 0 l3 -3 l3 3 l3 -3" transform="translate(' + (238 + v[0]) + ' ' + v[1] + ') rotate(' + v[2] + ') scale(.85)" fill="none" stroke="#c2452d" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'; });
  var arm = 'fill="none" stroke="' + SK + '" stroke-width="4.4" stroke-linecap="round"';
  return '<svg viewBox="0 0 800 133" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + SC.label + '">' +
    '<defs><linearGradient id="ls-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#33272a"/><stop offset="1" stop-color="#5a4650"/></linearGradient>' +
    '<filter id="ls-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#221e19" flood-opacity=".38"/></filter></defs>' +
    '<rect width="800" height="133" fill="url(#ls-storm)"/><rect id="ls-clear" width="800" height="133" fill="var(--ls-clear)"/>' +
    '<g id="ls-rays" transform="translate(203 24)">' + rays + '</g>' +
    '<g id="ls-O" filter="url(#ls-sh)"><circle cx="203" cy="24" r="15" fill="#2f5d50" stroke="' + EDGE + '" stroke-width="1.6"/><circle cx="203" cy="24" r="5.5" fill="#ffb648"/></g>' +
    '<g id="ls-rain">' + rain + '</g>' +
    '<g id="ls-cloud"><path d="M-34 8 C-46 8 -46 -8 -32 -9 C-30 -22 -10 -24 -4 -13 C4 -24 26 -20 26 -7 C40 -8 42 8 30 8 Z" fill="#231a1d" stroke="' + EDGE + '" stroke-width="1.6"/></g>' +
    '<path d="M0 104 Q200 84 400 100 T800 96 V133 H0Z" fill="var(--ls-hill1)"/>' +
    '<g filter="url(#ls-sh)"><path d="M-4 116 Q220 100 420 112 T804 108 V140 H-4Z" fill="var(--ls-hill2)" stroke="' + EDGE + '" stroke-width="1.6"/></g>' + fl +
    // the one-week calendar on the wall
    '<g id="ls-cal" filter="url(#ls-sh)"><rect x="256" y="1" width="90" height="46" rx="3" fill="#fbf6ec" stroke="' + EDGE + '" stroke-width="1.6"/><path d="M256 1 h90 v12 h-90 Z" fill="#a63a6b"/>' +
      '<text id="ls-n" class="n" x="301" y="10.5" text-anchor="middle">Period: day 1</text>' + cal + '</g>' +
    // couch
    '<g filter="url(#ls-sh)" stroke="' + EDGE + '" stroke-width="1.6"><rect x="204" y="66" width="132" height="36" rx="9" fill="#e9dcc4"/><rect x="198" y="90" width="144" height="16" rx="6" fill="#b98b78"/>' +
      '<rect x="196" y="78" width="14" height="28" rx="6" fill="#b98b78"/><rect x="330" y="78" width="14" height="28" rx="6" fill="#b98b78"/></g>' +
    // Her: ONE figure for the whole strip (his note 2026-11-11: the seated and standing women looked like different people,
    // and the jump between them was abrupt). Our female silhouette, front view; seated she is bowed over the heating pad on
    // her belly, then she sets the pad aside, stands up and walks. Legs are drawn each frame (seek) so they can bend.
    '<g id="ls-her" filter="url(#ls-sh)">' +
      '<path id="ls-lLe" fill="none" stroke="' + EDGE + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path id="ls-lRe" fill="none" stroke="' + EDGE + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path id="ls-lL" fill="none" stroke="' + LEG + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path id="ls-lR" fill="none" stroke="' + LEG + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g id="ls-top">' +
        '<g id="ls-head"><path d="M-9.5 -36 C-9.5 -48 9.5 -48 9.5 -36 L9.5 -24 L-9.5 -24 Z" fill="' + HAIR + '" stroke="' + EDGE + '" stroke-width="1.6"/></g>' +
        '<rect x="-8.6" y="-27" width="17.2" height="28" rx="6" fill="' + TOP + '" stroke="' + EDGE + '" stroke-width="1.6"/>' +
        '<g id="ls-face"><rect x="-2.2" y="-30" width="4.4" height="5" fill="' + SK + '"/><circle cx="0" cy="-35.5" r="7" fill="' + SK + '"/><path d="M-7.3 -36.5 Q0 -47 7.3 -36.5 Q0 -41.5 -7.3 -36.5 Z" fill="' + HAIR + '"/></g>' +
        '<g id="ls-aS"><path ' + arm + ' d="M-8.4 -22 L-10.6 -3"/><path ' + arm + ' d="M8.4 -22 L10.6 -3"/></g>' +
        '<g id="ls-aH"><path ' + arm + ' d="M-8.2 -22 Q-13 -9 -4 -6"/><path ' + arm + ' d="M8.2 -22 Q13 -9 4 -6"/></g>' +
      '</g></g>' +
    // the heating pad: on her belly under her hands, then set down on the couch beside her
    '<g id="ls-pad" filter="url(#ls-sh)"><path id="ls-cord" d="M-8 3 q-9 6 -4 14" fill="none" stroke="#22302b" stroke-width="1.3" stroke-linecap="round"/><rect x="-8.5" y="-6.5" width="17" height="13" rx="3.5" fill="#ffb648" stroke="' + EDGE + '" stroke-width="1.6"/><path d="M-4.5 -2.6 h9 M-4.5 0.4 h9 M-4.5 3.4 h9" stroke="#22302b" stroke-width="1" stroke-linecap="round"/>' +
      '<g id="ls-hands"><circle cx="-6.5" cy="1" r="2.6" fill="' + SK + '"/><circle cx="6.5" cy="1" r="2.6" fill="' + SK + '"/></g></g>' +
    '<g id="ls-zz">' + zig + '</g>' +
    cap(1, 388, 28, 208, SC.caps[0]) + cap(2, 388, 20, 208, SC.caps[1]) + cap(3, 388, 12, 208, SC.caps[2]) + '</svg>';
}
host.innerHTML = build();
var $ = function (id) { return document.getElementById(id); }, all = function (c) { return host.querySelectorAll(c); };
var rainEls = all('.ls-r'), flEls = all('.ls-f'), dropEls = all('.ls-d');
function seek(T, clock) {
  var a = seg(T, 9.2, 11.4), late = seg(a, .5, 1), i, ph, o, day = 1;
  $('ls-clear').setAttribute('opacity', a); $('ls-rays').setAttribute('opacity', .16 * late); $('ls-O').setAttribute('opacity', late);
  $('ls-O').setAttribute('transform', 'translate(0 ' + L(20, 0, late) + ')'); $('ls-rain').setAttribute('opacity', 1 - a);
  for (i = 0; i < rainEls.length; i++) { ph = reduce ? (i * .37) % 1 : (clock * 1.3 + i * .37) % 1; rainEls[i].setAttribute('transform', 'translate(' + (30 + (i * 97) % 760 - 14 * ph) + ' ' + (-8 + 118 * ph) + ')'); }
  for (i = 0; i < flEls.length; i++) flEls[i].setAttribute('transform', 'translate(' + flEls[i].getAttribute('data-x') + ' ' + flEls[i].getAttribute('data-y') + ') scale(' + cl(seg(a, .6, 1) * 1.6 - (i % 5) * .12) + ')');
  $('ls-cloud').setAttribute('opacity', 1 - seg(a, 0, .5)); $('ls-cloud').setAttribute('transform', 'translate(' + L(222, 120, a) + ' 12) scale(.8)');
  for (i = 0; i < dropEls.length; i++) { o = seg(T, .5 + i * .44, .7 + i * .44); dropEls[i].setAttribute('opacity', o); if (o > .5) day = i + 1; }
  $('ls-n').textContent = 'Period: day ' + day;
  $('ls-cal').setAttribute('transform', 'translate(0 ' + L(8, -90, seg(T, 9.6, 10.6)) + ')');
  // she sets the pad down (q), stands up (p), then walks off to the right (walk): one figure, moving
  var q = seg(T, 9.6, 10.1), p = seg(T, 10.0, 10.9), walk = seg(T, 11.0, 12.4), ache = reduce ? 0 : Math.sin(clock * 3) * (1 - p);
  var hx = L(238, 371, walk), hy = L(100, 89, p), sw = walk > .001 && walk < .999 && !reduce ? Math.sin(clock * 7) * Math.min(1, walk * 8, (1 - walk) * 6) : 0;
  function leg(side) {   // hip, knee, foot: bent over the seat edge when seated, straight when standing
    var x = hx + side * 3.6, k = side * sw, ky = L(104.5, (hy + 116) / 2, p), fy = L(114, 116, p) - 2 * Math.abs(sw) * (k > 0 ? 1 : 0);
    return 'M' + x + ' ' + hy + ' L' + (x + L(side * 5, 0, p) + 3 * k) + ' ' + ky + ' L' + (x + L(side * 3.5, 0, p) + 7 * k) + ' ' + fy;
  }
  var dL = leg(-1), dR = leg(1);
  $('ls-lL').setAttribute('d', dL); $('ls-lLe').setAttribute('d', dL); $('ls-lR').setAttribute('d', dR); $('ls-lRe').setAttribute('d', dR);
  $('ls-top').setAttribute('transform', 'translate(' + hx + ' ' + (hy + .5 * ache) + ') rotate(' + L(-7, 0, p) + ') scale(.9)');
  $('ls-face').setAttribute('transform', 'translate(' + L(-1.5, 0, p) + ' ' + L(5.5, 0, p) + ') rotate(' + L(-10, 0, p) + ' 0 -30)');
  $('ls-head').setAttribute('transform', 'translate(' + L(-1.5, 0, p) + ' ' + L(5.5, 0, p) + ') rotate(' + L(-10, 0, p) + ' 0 -30)');
  $('ls-aH').setAttribute('opacity', 1 - q); $('ls-aS').setAttribute('opacity', q);
  $('ls-pad').setAttribute('transform', 'translate(' + L(238.6, 219, q) + ' ' + (L(94.5, 94, q) + .5 * ache * (1 - q) - 7 * Math.sin(Math.PI * q)) + ') rotate(' + L(-4, 6, q) + ')');
  $('ls-hands').setAttribute('opacity', 1 - seg(q, 0, .5)); $('ls-cord').setAttribute('opacity', q);
  $('ls-zz').setAttribute('opacity', (reduce ? .8 : .45 + .55 * Math.abs(Math.sin(clock * 3.4))) * (1 - seg(T, 9.2, 9.8)));
  // captions hold 3.4 s and 3.6 s (paper-box guide, section 6)
  $('ls-c1').setAttribute('opacity', seg(T, .3, .7) - seg(T, 4.1, 4.5));
  $('ls-c2').setAttribute('opacity', seg(T, 4.6, 5.0) - seg(T, 8.6, 9.0));
  $('ls-c3').setAttribute('opacity', seg(T, 9.2, 9.7));
}
var END = 13, t = reduce ? END : 0, playing = !reduce, clock = 0, last = null, rp = document.getElementById('ls-replay');
var ICON = { skip: '<path d="M5 5l7 7-7 7"/><path d="M13 5l7 7-7 7"/>', replay: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>' };
// One button: "Skip animation" while it plays (so the motion can be stopped), "Replay animation" once it holds.
function button() {
  if (!rp) return; rp.hidden = reduce;
  rp.setAttribute('aria-label', playing ? 'Skip animation' : 'Replay animation');
  var svg = rp.querySelector('svg'); if (svg) svg.innerHTML = playing ? ICON.skip : ICON.replay;
}
function frame(now) {
  if (last === null) last = now; var dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
  if (playing) { t += dt; if (t >= END) { t = END; playing = false; button(); } }
  seek(t, clock);
  if (playing) requestAnimationFrame(frame);
}
window.__lifeStrip = function (v) { playing = false; t = v; seek(t, clock); button(); };
if (rp) rp.addEventListener('click', function () {
  if (reduce) return;
  if (playing) { playing = false; t = END; seek(t, clock); button(); return; }
  t = 0; playing = true; last = null; button(); requestAnimationFrame(frame);
});
button();
seek(t, 0); if (!reduce) requestAnimationFrame(frame);
})();
