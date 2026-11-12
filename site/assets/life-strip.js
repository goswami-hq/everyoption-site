/* Page-top strip that shows the symptom in daily life, with no anatomy (his pick of direction C, 2026-11-11, after a
   non-medical viewer said of the anatomy strip "idk what that is or what I'm looking at"). Source and review history:
   ai-hq projects/platform/design/page-strips-2026-11-11/. Plays once, about 13 seconds (knee 14), then holds; the held frame names
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
           ['Fibroids have more', 'than one treatment.', 'See <tspan class="t">every option</tspan>.']] },
  // Enlarged prostate (his words 2026-11-11: "Combine A and B. Don't say 'that isn't cancer' that's too authoritative"; his
  // yes to building it in, 19:20 CT). Night to sunrise, as in the prostate film. Lines 1 and 2 are the film's.
  pae: { label: 'At night a man gets out of bed and walks to the bathroom three times. A one-week calendar on the wall counts his bathroom trips each night, and tonight\u2019s number goes up each time. Text: Up all night to pee? It could be an enlarged prostate. Get checked. An enlarged prostate has more than one treatment. See every option. Then the sun rises.',
    caps: [['Up all night to <tspan class="t">pee</tspan>?'],
           ['It could be an', 'enlarged <tspan class="t">prostate</tspan>.', 'Get checked.'],
           ['An enlarged prostate has', 'more than one treatment.', 'See <tspan class="t">every option</tspan>.']] },
  // Knee arthritis (his words 2026-11-11: "I like c3 but she should get up and move or something when the sun comes out so
  // it looks like the symptoms improved"; "Looks good build it", 20:27 CT). Line 1 is a draft; the page's own symptom line
  // is "Pain when you walk or put weight on the knee". Lines 2 and 3 are the page's (conditions/knee-arthritis.toml).
  gae: { end: 14, label: 'A woman walks her dog under grey clouds. Twice she stops and holds her knee while the dog looks back, then she sits on the first bench with the dog beside her. Text: Knee pain cutting your walks short? It could be knee arthritis: the cushion in the joint wears down. Knee arthritis has more than one treatment. See every option. Then the sky clears, she gets up, and they walk on.',
    caps: [['Knee <tspan class="t">pain</tspan> cutting', 'your walks short?'],
           ['It could be knee', '<tspan class="t">arthritis</tspan>: the cushion', 'in the joint wears down.'],
           ['Knee arthritis has more', 'than one treatment.', 'See <tspan class="t">every option</tspan>.']] }
};
var K = host.getAttribute('data-s'), SC = SCENES[K]; if (!SC) return;
var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var cl = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; }, seg = function (t, a, b) { var x = cl((t - a) / (b - a)); return x * x * (3 - 2 * x); }, L = function (a, b, p) { return a + (b - a) * p; };
var DROP = 'M0 -7 C3 -2 5 1 5 3.5 A5 5 0 0 1 -5 3.5 C-5 1 -3 -2 0 -7 Z', SK = '#c99067', HAIR = '#2a1e19', TOP = '#7da38d', LEG = '#3f5e55', EDGE = '#efe4cf';
function limb(d, col, w) { return '<path d="' + d + '" fill="none" stroke="' + EDGE + '" stroke-width="' + (w + 3) + '" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
function cap(i, x, y, w, lines, edge) {
  var h = 10 + 17 * lines.length, t = '';
  lines.forEach(function (l, j) { t += '<text class="c" x="' + (x + w / 2) + '" y="' + (y + 19 + 17 * j) + '" text-anchor="middle">' + l + '</text>'; });
  return '<g class="cap" id="ls-c' + i + '" filter="url(#ls-sh)"><rect x="' + x + '" y="' + (y + 3) + '" width="' + w + '" height="' + h + '" rx="7" fill="' + (edge || '#5e1f3c') + '"/><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="7" fill="#fbf6ec"/>' + t + '</g>';
}
function buildUfe() {
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
var rainEls, flEls, dropEls;
function seekUfe(T, clock) {
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

// ---- Enlarged prostate ----
var ACC = '#2f5f8f', MHAIR = '#4a4542';
function buildPae() {
  var rays = '', stars = '', fl = '', cal = '', i, x, cols = ['#ffb648', '#fbf6ec', '#d9e6f2', '#fbf6ec'], wd = 'MTWTFSS';
  for (i = 0; i < 12; i++) rays += '<path d="M0 0 L-9 -150 L9 -150 Z" transform="rotate(' + (i * 30) + ')" fill="var(--ls-ray)"/>';
  for (i = 0; i < 34; i++) stars += '<circle class="lp-s" cx="' + ((i * 137) % 790 + 5) + '" cy="' + (4 + (i * 53) % 78) + '" r="' + (i % 3 ? .9 : 1.4) + '" fill="#fbf6ec"/>';
  for (i = 0; i < 26; i++) fl += '<g class="lp-f" data-x="' + (24 + i * 30.5 + 9 * Math.sin(i * 1.7)).toFixed(1) + '" data-y="' + (121 + 5 * Math.sin(i * 2.3)).toFixed(1) + '"><circle r="3.4" fill="' + cols[i % 4] + '" stroke="' + EDGE + '" stroke-width=".8"/><circle r="1.1" fill="#22302b"/></g>';
  for (i = 0; i < 7; i++) { x = 212 + i * 19.14;
    cal += '<rect x="' + x + '" y="13" width="19.14" height="29" fill="' + (i === 6 ? '#e4edf5' : '#fbf6ec') + '" stroke="' + EDGE + '" stroke-width="1"/><text class="d" x="' + (x + 9.57) + '" y="23" text-anchor="middle">' + wd.charAt(i) + '</text>' +
      '<text class="b lp-n" x="' + (x + 9.57) + '" y="38" text-anchor="middle"' + (i === 6 ? ' style="fill:' + ACC + '"' : '') + '></text>'; }
  var arm = 'fill="none" stroke="' + SK + '" stroke-width="4.6" stroke-linecap="round"', legE = 'fill="none" stroke="' + EDGE + '" stroke-width="9.4" stroke-linecap="round" stroke-linejoin="round"', leg = 'fill="none" stroke="' + LEG + '" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"';
  return '<svg viewBox="0 0 800 133" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + SC.label + '">' +
    '<defs><linearGradient id="ls-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#131c28"/><stop offset="1" stop-color="#2b4460"/></linearGradient>' +
    '<filter id="ls-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#10151c" flood-opacity=".42"/></filter></defs>' +
    '<rect width="800" height="133" fill="url(#ls-storm)"/><g id="lp-stars">' + stars + '</g><rect id="lp-clear" width="800" height="133" fill="var(--ls-clear)"/>' +
    '<g id="lp-rays" transform="translate(366 24)">' + rays + '</g>' +
    '<g id="lp-moon" filter="url(#ls-sh)"><path d="M372 10 a14 14 0 1 0 8 24 a11 11 0 1 1 -8 -24 Z" fill="#fbf6ec" stroke="' + EDGE + '" stroke-width="1.2"/></g>' +
    '<g id="lp-O" filter="url(#ls-sh)"><circle cx="366" cy="24" r="15" fill="#2f5d50" stroke="' + EDGE + '" stroke-width="1.6"/><circle cx="366" cy="24" r="5.5" fill="#ffb648"/></g>' +
    '<path d="M0 104 Q200 84 400 100 T800 96 V133 H0Z" fill="var(--ls-hill1)"/>' +
    '<g filter="url(#ls-sh)"><path d="M-4 116 Q220 100 420 112 T804 108 V140 H-4Z" fill="var(--ls-hill2)" stroke="' + EDGE + '" stroke-width="1.6"/></g>' + fl +
    // the week on the wall: six nights counted, tonight's box counts up
    '<g id="lp-cal" filter="url(#ls-sh)"><rect x="212" y="1" width="134" height="41" rx="3" fill="#fbf6ec" stroke="' + EDGE + '" stroke-width="1.6"/><path d="M212 1 h134 v12 h-134 Z" fill="' + ACC + '"/>' +
      '<text class="n" x="279" y="11" text-anchor="middle">Bathroom trips each night</text>' + cal + '</g>' +
    // bed: headboard, mattress, pillow, blanket
    '<g filter="url(#ls-sh)" stroke="' + EDGE + '" stroke-width="1.6"><rect x="200" y="62" width="10" height="46" rx="4" fill="#b98b78"/><rect x="206" y="90" width="92" height="16" rx="5" fill="#e9dcc4"/>' +
      '<rect x="210" y="81" width="24" height="11" rx="5" fill="#fbf6ec"/><path d="M240 88 h58 v18 h-58 Z" fill="#8fb0cf"/></g>' +
    // bathroom door: the light shows when it opens
    '<g filter="url(#ls-sh)"><path d="M322 108 V64 a14 14 0 0 1 28 0 V108 Z" fill="#e9dcc4" stroke="' + EDGE + '" stroke-width="1.6"/><path d="M326 108 V65 a10 10 0 0 1 20 0 V108 Z" fill="#ffb648"/><path id="lp-door" d="M326 108 V65 a10 10 0 0 1 20 0 V108 Z" fill="#7d9a8c"/><circle cx="342" cy="88" r="1.6" fill="#ffb648"/></g>' +
    // him: one figure, front view, the films' everyday man made small
    '<g id="lp-m" filter="url(#ls-sh)"><path id="lp-lLe" ' + legE + '/><path id="lp-lRe" ' + legE + '/><path id="lp-lL" ' + leg + '/><path id="lp-lR" ' + leg + '/>' +
      '<g id="lp-top"><rect x="-9.4" y="-27" width="18.8" height="28" rx="5.5" fill="' + TOP + '" stroke="' + EDGE + '" stroke-width="1.6"/>' +
      '<g id="lp-face"><rect x="-2.6" y="-30" width="5.2" height="5" fill="' + SK + '"/><circle cx="0" cy="-35.5" r="7.2" fill="' + SK + '" stroke="' + EDGE + '" stroke-width="1.6" paint-order="stroke"/><path d="M-7.4 -36.5 Q-7 -45 0 -45 Q7 -45 7.4 -36.5 Q4 -41 0 -41 Q-4 -41 -7.4 -36.5 Z" fill="' + MHAIR + '"/></g>' +
      '<g id="lp-aS"><path ' + arm + ' d="M-9.2 -22 L-11.4 -3"/><path ' + arm + ' d="M9.2 -22 L11.4 -3"/></g>' +
      '<g id="lp-aK"><path ' + arm + ' d="M-9.2 -22 Q-13 -8 -6 2"/><path ' + arm + ' d="M9.2 -22 Q13 -8 6 2"/></g></g></g>' +
    cap(1, 388, 36, 208, SC.caps[0], '#17324d') + cap(2, 388, 20, 208, SC.caps[1], '#17324d') + cap(3, 388, 12, 208, SC.caps[2], '#17324d') + '</svg>';
}
var starEls, pflEls, numEls;
function seekPae(T, clock) {
  var a = seg(T, 9.2, 11.4), late = seg(a, .5, 1), i, D = 2.4, starts = [.5, 3.6, 6.7], week = [3, 4, 3, 2, 4, 3], tonight = 0;
  $('lp-clear').setAttribute('opacity', a); $('lp-rays').setAttribute('opacity', .14 * late); $('lp-O').setAttribute('opacity', late);
  $('lp-O').setAttribute('transform', 'translate(0 ' + L(20, 0, late) + ')'); $('lp-moon').setAttribute('opacity', 1 - seg(a, 0, .5)); $('lp-stars').setAttribute('opacity', 1 - a);
  for (i = 0; i < starEls.length; i++) starEls[i].setAttribute('opacity', reduce ? .8 : .45 + .55 * Math.abs(Math.sin(clock * 1.3 + i)));
  for (i = 0; i < pflEls.length; i++) pflEls[i].setAttribute('transform', 'translate(' + pflEls[i].getAttribute('data-x') + ' ' + pflEls[i].getAttribute('data-y') + ') scale(' + cl(seg(a, .6, 1) * 1.6 - (i % 5) * .12) + ')');
  // three trips: up from the bed edge, to the door, inside, back, sit; 0.7 s in bed between them
  function trip(t0) { var u = (T - t0) / D * 3.6; if (u < 0 || u > 3.6) return null;
    var out = seg(u, .5, 1.5), back = seg(u, 2.2, 3.2);
    return { x: L(L(286, 336, out), 286, back), p: seg(u, 0, .5) - seg(u, 3.2, 3.6), walking: (u > .5 && u < 1.5) || (u > 2.2 && u < 3.2), inside: seg(u, 1.4, 1.5) - seg(u, 2.2, 2.3), open: seg(u, 1.15, 1.35) - seg(u, 2.35, 2.55) }; }
  var tr = trip(starts[0]) || trip(starts[1]) || trip(starts[2]);
  var hx = tr ? tr.x : 286, p = tr ? tr.p : seg(T, 9.9, 10.8), sw = tr && tr.walking && !reduce ? Math.sin(clock * 7) : 0, hy = L(100, 89, p), bow = 1 - p;
  function leg(side) { var x = hx + side * 3.8, s2 = side * sw, ky = L(104.5, (hy + 116) / 2, p), fy = L(114, 116, p) - 2 * Math.abs(sw) * (s2 > 0 ? 1 : 0);
    return 'M' + x + ' ' + hy + ' L' + (x + L(side * 5, 0, p) + 3 * s2) + ' ' + ky + ' L' + (x + L(side * 3.5, 0, p) + 7 * s2) + ' ' + fy; }
  var dL = leg(-1), dR = leg(1);
  $('lp-lL').setAttribute('d', dL); $('lp-lLe').setAttribute('d', dL); $('lp-lR').setAttribute('d', dR); $('lp-lRe').setAttribute('d', dR);
  $('lp-top').setAttribute('transform', 'translate(' + hx + ' ' + hy + ') scale(.9)');
  $('lp-face').setAttribute('transform', 'translate(0 ' + (5.5 * bow) + ') rotate(' + (-8 * bow) + ' 0 -30)');
  $('lp-aK').setAttribute('opacity', p < .5 ? 1 : 0); $('lp-aS').setAttribute('opacity', p < .5 ? 0 : 1);
  $('lp-m').setAttribute('opacity', 1 - (tr ? tr.inside : 0)); $('lp-door').setAttribute('opacity', 1 - (tr ? tr.open : 0));
  for (i = 0; i < 3; i++) if (T >= starts[i] + D * 1.45 / 3.6) tonight++;
  for (i = 0; i < numEls.length; i++) numEls[i].textContent = i < 6 ? week[i] : (tonight || '');   // tonight's box is empty until his first trip
  $('lp-cal').setAttribute('transform', 'translate(0 ' + L(3, -90, seg(T, 9.6, 10.6)) + ')');
  // captions 1 and 2 cross-fade so the scene is never without words while he is away
  $('ls-c1').setAttribute('opacity', seg(T, .3, .7) - seg(T, 4.2, 4.6));
  $('ls-c2').setAttribute('opacity', seg(T, 4.3, 4.7) - seg(T, 8.6, 9.0));
  $('ls-c3').setAttribute('opacity', seg(T, 9.2, 9.7));
}
// ---- Knee arthritis: walking the dog ----
var KACC = '#4c7a3d', KHAIR = '#9aa6a0', PAIN = '#c2452d', CLOUD = 'M-34 8 C-46 8 -46 -8 -32 -9 C-30 -22 -10 -24 -4 -13 C4 -24 26 -20 26 -7 C40 -8 42 8 30 8 Z';
function buildGae() {
  var rays = '', fl = '', i, cols = ['#ffb648', '#fbf6ec', '#dfe9d3', '#fbf6ec'];
  for (i = 0; i < 12; i++) rays += '<path d="M0 0 L-9 -150 L9 -150 Z" transform="rotate(' + (i * 30) + ')" fill="var(--ls-ray)"/>';
  for (i = 0; i < 26; i++) fl += '<g class="lk-f" data-x="' + (24 + i * 30.5 + 9 * Math.sin(i * 1.7)).toFixed(1) + '" data-y="' + (121 + 5 * Math.sin(i * 2.3)).toFixed(1) + '"><circle r="3.4" fill="' + cols[i % 4] + '" stroke="' + EDGE + '" stroke-width=".8"/><circle r="1.1" fill="#22302b"/></g>';
  var arm = 'fill="none" stroke="' + SK + '" stroke-width="4.6" stroke-linecap="round"', legE = 'fill="none" stroke="' + EDGE + '" stroke-width="9.4" stroke-linecap="round" stroke-linejoin="round"', leg = 'fill="none" stroke="' + LEG + '" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"', zz = 'fill="none" stroke="' + PAIN + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return '<svg viewBox="0 0 800 133" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + SC.label + '">' +
    '<defs><linearGradient id="ls-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262f29"/><stop offset="1" stop-color="#5b665c"/></linearGradient>' +
    '<filter id="ls-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#10151c" flood-opacity=".42"/></filter></defs>' +
    '<rect width="800" height="133" fill="url(#ls-storm)"/><rect id="lk-clear" width="800" height="133" fill="var(--ls-clear)"/>' +
    '<g id="lk-rays" transform="translate(230 24)">' + rays + '</g>' +
    '<g id="lk-cloud" filter="url(#ls-sh)"><path transform="translate(250 16)" d="' + CLOUD + '" fill="#1b221d" stroke="' + EDGE + '" stroke-width="1.4"/><path transform="translate(480 12) scale(.8)" d="' + CLOUD + '" fill="#1b221d" stroke="' + EDGE + '" stroke-width="1.4"/></g>' +
    '<g id="lk-O" filter="url(#ls-sh)"><circle cx="230" cy="24" r="15" fill="#2f5d50" stroke="' + EDGE + '" stroke-width="1.6"/><circle cx="230" cy="24" r="5.5" fill="#ffb648"/></g>' +
    '<path d="M0 104 Q200 84 400 100 T800 96 V133 H0Z" fill="var(--ls-hill1)"/>' +
    '<g filter="url(#ls-sh)"><path d="M-4 116 Q220 100 420 112 T804 108 V140 H-4Z" fill="var(--ls-hill2)" stroke="' + EDGE + '" stroke-width="1.6"/></g>' + fl +
    // the first bench on the path
    '<g filter="url(#ls-sh)" stroke="' + EDGE + '" stroke-width="1.4"><rect x="272" y="78" width="52" height="7" rx="2" fill="#b98b78"/><rect x="272" y="88" width="52" height="7" rx="2" fill="#b98b78"/><rect x="270" y="98" width="56" height="6" rx="2" fill="#b98b78"/><rect x="274" y="104" width="5" height="9" fill="#7a5a4c"/><rect x="317" y="104" width="5" height="9" fill="#7a5a4c"/></g>' +
    // her dog, facing right; the head turns back to look at her
    '<g id="lk-dog" filter="url(#ls-sh)"><path id="lk-leash" fill="none" stroke="#22302b" stroke-width="2" stroke-linecap="round"/>' +
      '<g id="lk-dg"><path id="lk-tail" d="M-9 -8 q-6 -3 -5 -9" fill="none" stroke="#e9dcc4" stroke-width="3" stroke-linecap="round"/>' +
      '<path class="lk-dl" d="M-6 -4 v6" stroke="#d8cbb3" stroke-width="3" stroke-linecap="round"/><path class="lk-dl" d="M6 -4 v6" stroke="#d8cbb3" stroke-width="3" stroke-linecap="round"/>' +
      '<rect x="-10" y="-12" width="20" height="10" rx="5" fill="#e9dcc4" stroke="' + EDGE + '" stroke-width="1.4"/><path d="M-3 -12 h6 v4 h-6 Z" fill="#b98b78"/>' +
      '<g id="lk-dh"><circle cx="10" cy="-14" r="5.4" fill="#e9dcc4" stroke="' + EDGE + '" stroke-width="1.4"/><path d="M7 -18 q-4 2 -2 8" fill="none" stroke="#b98b78" stroke-width="3.2" stroke-linecap="round"/><circle cx="12" cy="-15" r=".9" fill="#22302b"/><circle cx="15.2" cy="-13.4" r="1.2" fill="#22302b"/></g></g></g>' +
    // her: one figure throughout, an older woman with a grey bob
    '<g id="lk-m" filter="url(#ls-sh)"><path id="lk-lLe" ' + legE + '/><path id="lk-lRe" ' + legE + '/><path id="lk-lL" ' + leg + '/><path id="lk-lR" ' + leg + '/>' +
      '<g id="lk-top"><g id="lk-hair"><path d="M-9.5 -36 C-9.5 -48 9.5 -48 9.5 -36 L9.5 -26 L-9.5 -26 Z" fill="' + KHAIR + '" stroke="' + EDGE + '" stroke-width="1.6"/></g><rect x="-8.8" y="-27" width="17.6" height="28" rx="6" fill="' + TOP + '" stroke="' + EDGE + '" stroke-width="1.6"/>' +
      '<g id="lk-face"><rect x="-2.6" y="-30" width="5.2" height="5" fill="' + SK + '"/><circle cx="0" cy="-35.5" r="7" fill="' + SK + '"/><path d="M-7.2 -38 Q0 -46.5 7.2 -38 Q0 -43 -7.2 -38 Z" fill="' + KHAIR + '"/></g>' +
      '<g id="lk-aS"><path ' + arm + ' d="M-9.2 -22 L-11.4 -3"/><path ' + arm + ' d="M9.2 -22 L11.4 -3"/></g>' +
      '<g id="lk-aK"><path ' + arm + ' d="M-9.2 -22 Q-13 -8 -6 2"/><path ' + arm + ' d="M9.2 -22 Q13 -8 6 2"/></g></g>' +
      '<g id="lk-aFw"><path id="lk-aF" ' + arm + '/><path id="lk-aF2" ' + arm + '/></g>' +
      '<g id="lk-pain"><path d="M0 0 l3 -3 l3 3 l3 -3" transform="translate(4 0) rotate(-20) scale(.85)" ' + zz + '/><path d="M0 0 l3 -3 l3 3 l3 -3" transform="translate(5 6) rotate(15) scale(.85)" ' + zz + '/><path d="M0 0 l-3 -3 l-3 3 l-3 -3" transform="translate(-4 3) rotate(10) scale(.85)" ' + zz + '/></g></g>' +
    cap(1, 382, 28, 208, SC.caps[0], '#2c4a22') + cap(2, 382, 20, 208, SC.caps[1], '#2c4a22') + cap(3, 382, 12, 208, SC.caps[2], '#2c4a22') + '</svg>';
}
var kflEls, legEls;
function seekGae(T, clock) {
  var a = seg(T, 10.2, 12.4), late = seg(a, .5, 1), i;
  $('lk-clear').setAttribute('opacity', a); $('lk-rays').setAttribute('opacity', .14 * late); $('lk-O').setAttribute('opacity', late);
  $('lk-O').setAttribute('transform', 'translate(0 ' + L(20, 0, late) + ')'); $('lk-cloud').setAttribute('opacity', 1 - seg(a, 0, .5));
  for (i = 0; i < kflEls.length; i++) kflEls[i].setAttribute('transform', 'translate(' + kflEls[i].getAttribute('data-x') + ' ' + kflEls[i].getAttribute('data-y') + ') scale(' + cl(seg(a, .6, 1) * 1.6 - (i % 5) * .12) + ')');
  // the walk: two stretches with a flare after each (she bends and holds the knee), a third to the bench, she sits;
  // when the sun comes out she lifts her head, gets up, and walks on (his ruling, 2026-11-11 20:17 CT)
  var w1 = seg(T, .5, 1.9), w2 = seg(T, 3.6, 4.9), w3 = seg(T, 6.4, 7.3), w4 = seg(T, 12.1, 13.3);
  var flare = Math.max(seg(T, 1.8, 2.1) - seg(T, 3.1, 3.5), seg(T, 4.8, 5.1) - seg(T, 5.9, 6.3)) * (1 - seg(T, 10.2, 10.9));
  var sit = seg(T, 7.4, 8.1) - seg(T, 11.2, 12.0), ache = seg(T, 7.9, 8.3) * (1 - seg(T, 10.2, 10.9));
  var moving = (w1 > 0 && w1 < 1) || (w2 > 0 && w2 < 1) || (w3 > 0 && w3 < 1) || (w4 > 0 && w4 < 1);
  var hx = 218 + 26 * w1 + 26 * w2 + 28 * w3 + 50 * w4, p = 1 - sit, bow = Math.max(.8 * flare, sit * (1 - seg(T, 10.6, 11.2)));
  var sw = moving && !reduce ? .7 * Math.sin(clock * 6) : 0, pain = Math.max(flare, ache), reach = flare;
  var hy = L(100, 89, p), ky = L(104.5, (hy + 116) / 2, p), kx = hx + L(6.8, 3.8, p);
  function leg(side) { var x = hx + side * 3.8, s2 = side * sw, fy = L(114, 116, p) - 2 * Math.abs(sw) * (s2 > 0 ? 1 : 0);
    return 'M' + x + ' ' + hy + ' L' + (x + L(side * 3, 0, p) + 3 * s2) + ' ' + ky + ' L' + (x + L(side * 2, 0, p) + 7 * s2) + ' ' + fy; }
  var dL = leg(-1), dR = leg(1), lean = 13 * reach * p, rad = lean * Math.PI / 180;
  $('lk-lL').setAttribute('d', dL); $('lk-lLe').setAttribute('d', dL); $('lk-lR').setAttribute('d', dR); $('lk-lRe').setAttribute('d', dR);
  $('lk-top').setAttribute('transform', 'translate(' + hx + ' ' + hy + ') rotate(' + lean + ') scale(.9)');
  var hd = 'translate(0 ' + (5.5 * bow) + ') rotate(' + (-8 * bow) + ' 0 -30)';
  $('lk-face').setAttribute('transform', hd); $('lk-hair').setAttribute('transform', hd);
  var seated = p < .5, reaching = !seated && reach > .5;
  $('lk-aK').setAttribute('opacity', seated ? 1 : 0); $('lk-aS').setAttribute('opacity', seated || reaching ? 0 : 1);
  // the reaching arms are drawn in page space, from her leaning shoulders: one hand on the knee, the other hanging
  var sx = hx + 8.3 * Math.cos(rad) + 19.8 * Math.sin(rad), sy = hy + 8.3 * Math.sin(rad) - 19.8 * Math.cos(rad), s2x = hx - 8.3 * Math.cos(rad) + 19.8 * Math.sin(rad), s2y = hy - 8.3 * Math.sin(rad) - 19.8 * Math.cos(rad);
  $('lk-aF').setAttribute('d', 'M' + sx + ' ' + sy + ' Q' + (kx + 9) + ' ' + (hy - 2) + ' ' + (kx + 2.5) + ' ' + (ky - 3.5));
  $('lk-aF2').setAttribute('d', 'M' + s2x + ' ' + s2y + ' L' + (s2x - 1) + ' ' + (s2y + 17));
  $('lk-aFw').setAttribute('opacity', reaching ? 1 : 0);
  $('lk-pain').setAttribute('transform', 'translate(' + (kx + 3) + ' ' + (ky + 1) + ')');
  $('lk-pain').setAttribute('opacity', pain * (reduce ? .9 : .5 + .5 * Math.abs(Math.sin(clock * 3.4))));
  // the dog leads by a leash length, stops when she stops, looks back while she hurts, and walks on with her
  var dx = hx + 48, dy = 114, back = Math.max(flare, sit * (1 - seg(T, 10.6, 11.2))), trot = moving && !reduce ? Math.sin(clock * 12) : 0;
  $('lk-dg').setAttribute('transform', 'translate(' + dx + ' ' + (dy - Math.abs(trot)) + ')');
  $('lk-dh').setAttribute('transform', back > .5 ? 'translate(-3 0) scale(-1 1) translate(-17 0)' : '');
  $('lk-tail').setAttribute('transform', 'rotate(' + (reduce || back > .5 ? 0 : 14 * Math.sin(clock * 5)) + ' -9 -8)');
  for (i = 0; i < legEls.length; i++) legEls[i].setAttribute('transform', 'rotate(' + (i ? -18 : 18) * trot + ' ' + (i ? 6 : -6) + ' -4)');
  var hand = [hx - (seated ? 6 : 10.5), hy + (seated ? 2 : -3)];   // the leash is in her other hand, away from the sore knee
  $('lk-leash').setAttribute('d', 'M' + hand[0] + ' ' + hand[1] + ' Q' + ((hand[0] + dx) / 2) + ' ' + (dy - 2) + ' ' + (dx + 4) + ' ' + (dy - 11));
  // captions cross-fade, so the scene is never without words; line 2 (12 words) holds 5.2 s
  $('ls-c1').setAttribute('opacity', seg(T, .3, .7) - seg(T, 4.1, 4.5));
  $('ls-c2').setAttribute('opacity', seg(T, 4.1, 4.5) - seg(T, 9.7, 10.1));
  $('ls-c3').setAttribute('opacity', seg(T, 9.7, 10.1));
}
var $ = function (id) { return document.getElementById(id); }, all = function (c) { return host.querySelectorAll(c); };
var DRAW = { ufe: [buildUfe, seekUfe], pae: [buildPae, seekPae], gae: [buildGae, seekGae] }[K];
if (!DRAW) return;   // a scene named above with no drawing yet: leave the strip empty, never throw
host.innerHTML = DRAW[0](); var seek = DRAW[1];
rainEls = all('.ls-r'); flEls = all('.ls-f'); dropEls = all('.ls-d'); starEls = all('.lp-s'); pflEls = all('.lp-f'); numEls = all('.lp-n'); kflEls = all('.lk-f'); legEls = all('.lk-dl');
var END = SC.end || 13, t = reduce ? END : 0, playing = !reduce, clock = 0, last = null, rp = document.getElementById('ls-replay');
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
