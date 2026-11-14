/* Page-top strip that shows the symptom in daily life, with no anatomy (his pick of direction C, 2026-11-11, after a
   non-medical viewer said of the anatomy strip "idk what that is or what I'm looking at"). Source and review history:
   ai-hq projects/platform/design/page-strips-2026-11-11/. Plays once, about 13 seconds (knee and pelvic 14; hemorrhoids 13, on the fibroid and prostate clock), then holds; the held frame names
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
           ['Knee arthritis has more', 'than one treatment.', 'See <tspan class="t">every option</tspan>.']] },
  // Bleeding hemorrhoids (his words 2026-11-12: "None of these are distinctive and look too similar to the other 3 / we need
  // to lean into bleeding and toilets / dont need a calendar thing"; then "D3", "toilet paper roll and proportions are off",
  // and "D3a - let's make sure the timing matches the other site banners"). No hill and no figure: a bathroom wall, the
  // weather in its window. Line 1 is the page's symptom line, word for word; line 2 is the page's opening rule.
  hae: { label: 'In a bathroom, toilet paper unrolls from the roll and across the picture while it rains outside the window. Red spots of blood appear on the paper, one after another. Text: Bright red blood on the toilet paper? It could be hemorrhoids. Bleeding always needs a doctor\u2019s check. Hemorrhoids have more than one treatment. See every option. Then the sun comes out, the paper pulls through, and clean squares follow.',
    caps: [['Bright red <tspan class="t">blood</tspan>', 'on the toilet paper?'],
           ['It could be <tspan class="t">hemorrhoids</tspan>.', 'Bleeding always needs', 'a doctor\u2019s check.'],
           ['Hemorrhoids have more', 'than one treatment.', 'See <tspan class="t">every option</tspan>.']] },
  // Chronic pelvic pain (his words 2026-11-14: "I like B"; "I like B3 but we need a way to show a lot of time passing , bc
  // that's often these patients months and years without treatment"; "T3 / But the every option sun is cut off when I watch
  // it on my phone"; "Yes, sanity check the critic pass", 11:09 CT). Line 1 is a draft on his ruling ("for years" and the
  // year signs are not page wording; the page says more than 6 months). Line 2 is the page hero, near word for word.
  pelvic: { end: 14, label: 'A woman walks slowly, holding her lower belly, under a dark cloud marked with a question mark, and stops three times. The trees behind her turn from spring to summer, autumn and winter, twice, and she passes roadside signs reading 1 year and 2 years. Text: Pelvic pain for years, and still no answer? Sometimes the cause is veins in the pelvis. It can go unrecognized. Pelvic pain from veins has more than one treatment. See every option. Then the cloud lifts, the sun comes out and she walks on.',
    caps: [['Pelvic <tspan class="t">pain</tspan> for years,', 'and still no answer?'],
           ['Sometimes the cause is', '<tspan class="t">veins in the pelvis</tspan>.', 'It can go unrecognized.'],
           ['Pelvic pain from veins has', 'more than one treatment.', 'See <tspan class="t">every option</tspan>.']] }
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

// ---- Bleeding hemorrhoids: the long roll ----
// Sizes come from the real thing: a sheet is square and as wide as the roll's side (22 units); the roll is 27 across.
var HPW = 22, HPATH = 'M239 50 V97 H812', HEDGE = '#c9bd96', HRED = '#c2452d', HPORC = '#fbf6ec',
    HSPOT = 'M-3.4 -1 C-4 -4 -1 -5.4 1 -4.2 C3.6 -4.6 4.6 -1.6 3.4 .6 C4 3.4 1 4.6 -1 3.6 C-3.6 4.2 -4.8 1.4 -3.4 -1 Z';
function buildHae() {
  var perf = '', spots = '', rain = '', i, wx = 304, cx = 250, cy = 44;
  function tiles(wall, tile, line) {
    var g = '<rect width="800" height="133" fill="' + wall + '"/><rect y="72" width="800" height="48" fill="' + tile + '"/>', x;
    for (x = 0; x <= 800; x += 16) g += '<path d="M' + x + ' 72 V120" stroke="' + line + '" stroke-width="1"/>';
    return g + '<path d="M0 84 H800 M0 96 H800 M0 108 H800" stroke="' + line + '" stroke-width="1"/><path d="M0 72 H800" stroke="' + line + '" stroke-width="2.4"/>';
  }
  for (i = 0; i < 9; i++) rain += '<path d="M' + (wx + 4 + i * 5.5) + ' ' + (14 + (i * 7) % 18) + ' l-3 8" stroke="#a9c1b6" stroke-width="1.2" stroke-linecap="round"/>';
  for (i = -24; i < 25; i++) perf += '<path d="M' + (262 + HPW * i) + ' 86 V108" stroke="#d8cfb7" stroke-width="1" stroke-dasharray="2 2"/>';
  [295, 383, 493].forEach(function (x, j) { spots += '<g class="lh-sp" data-x="' + x + '"><path transform="scale(1.2)" d="' + HSPOT + '" fill="' + HRED + '"/>' + (j === 1 ? '<circle cx="7" cy="-5" r="1.3" fill="' + HRED + '"/>' : '') + '</g>'; });
  return '<svg viewBox="0 0 800 133" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + SC.label + '">' +
    '<defs><filter id="ls-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#10151c" flood-opacity=".42"/></filter>' +
    '<clipPath id="lh-win"><rect x="' + (wx + 3) + '" y="13" width="42" height="40"/></clipPath><clipPath id="lh-rv"><rect id="lh-rvr" x="258" y="84" width="0" height="26"/></clipPath>' +
    '<linearGradient id="ls-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d4f48"/><stop offset="1" stop-color="#5d6d66"/></linearGradient></defs>' +
    // the wall and tiles twice: in the storm, and lit (the lit one fades in with the sun)
    tiles('#4c5a53', '#56645c', '#46534c') + '<g id="lh-light">' + tiles('var(--lh-wall)', 'var(--lh-tile)', 'var(--lh-line)') + '</g>' +
    '<rect y="118" width="800" height="15" fill="var(--ls-hill2)"/><path d="M0 118 H800" stroke="' + EDGE + '" stroke-width="1.6"/>' +
    // the window holds the weather
    '<g filter="url(#ls-sh)"><rect x="' + wx + '" y="10" width="48" height="46" rx="2" fill="#e9dcc4" stroke="' + EDGE + '" stroke-width="1.6"/></g>' +
    '<g clip-path="url(#lh-win)"><rect x="' + wx + '" y="10" width="48" height="46" fill="url(#ls-storm)"/><g id="lh-rain">' + rain + '</g>' +
      '<rect id="lh-clear" x="' + wx + '" y="10" width="48" height="46" fill="var(--ls-clear)"/>' +
      '<g id="lh-O"><circle cx="' + (wx + 24) + '" cy="33" r="9" fill="#2f5d50" stroke="' + EDGE + '" stroke-width="1.4"/><circle cx="' + (wx + 24) + '" cy="33" r="3.3" fill="#ffb648"/></g>' +
      '<g id="lh-cloud"><path transform="translate(' + (wx + 26) + ' 22) scale(.55)" d="' + CLOUD + '" fill="#3b4a44" stroke="' + EDGE + '" stroke-width="2"/></g></g>' +
    // holder: a wall plate and a bar into the back of the roll
    '<g filter="url(#ls-sh)"><rect x="204" y="34" width="9" height="20" rx="2" fill="#9aa6a0" stroke="' + EDGE + '" stroke-width="1.2"/><rect x="209" y="41.5" width="16" height="5" rx="2.5" fill="#9aa6a0" stroke="' + EDGE + '" stroke-width="1"/></g>' +
    // the paper: hangs from the roll, folds, and runs along the wall; the fold shows its shaded underside
    '<g filter="url(#ls-sh)"><path class="lh-pp" d="' + HPATH + '" fill="none" stroke-linejoin="miter" stroke="' + HEDGE + '" stroke-width="' + (HPW + 2.6) + '"/><path class="lh-pp" d="' + HPATH + '" fill="none" stroke-linejoin="miter" stroke="' + HPORC + '" stroke-width="' + HPW + '"/>' +
      '<g id="lh-fold"><path d="M228 86 V108 H250 Z" fill="#e0d5b6"/><path d="M228 86 L250 108" stroke="' + HEDGE + '" stroke-width="1.2"/></g></g>' +
    '<path d="M228 68 H250" stroke="#d8cfb7" stroke-width="1" stroke-dasharray="2 2"/>' +
    '<g clip-path="url(#lh-rv)"><g id="lh-perf">' + perf + '</g>' + spots + '</g>' +
    // the roll, at an angle: its side (as long as a sheet is wide) and its round end with the cardboard core
    '<g filter="url(#ls-sh)"><path d="M' + cx + ' ' + (cy - 13.5) + ' H' + (cx - HPW) + ' A9 13.5 0 0 0 ' + (cx - HPW) + ' ' + (cy + 13.5) + ' H' + cx + ' Z" fill="' + HPORC + '" stroke="' + HEDGE + '" stroke-width="1.3"/>' +
      '<path d="M' + (cx - 16) + ' ' + (cy - 13) + ' q-6 13 0 26 M' + (cx - 8) + ' ' + (cy - 13) + ' q-6 13 0 26" fill="none" stroke="#e6dcc2" stroke-width="1"/>' +
      '<ellipse cx="' + cx + '" cy="' + cy + '" rx="9" ry="13.5" fill="#f4eddc" stroke="' + HEDGE + '" stroke-width="1.3"/><ellipse cx="' + cx + '" cy="' + cy + '" rx="6.4" ry="9.6" fill="none" stroke="#e6dcc2" stroke-width="1"/>' +
      '<ellipse cx="' + cx + '" cy="' + cy + '" rx="3.4" ry="5.1" fill="#b9a878" stroke="#d8cfa8" stroke-width="1.6"/></g>' +
    cap(1, 384, 28, 208, SC.caps[0], '#3f360a') + cap(2, 384, 12, 208, SC.caps[1], '#3f360a') + cap(3, 384, 12, 208, SC.caps[2], '#3f360a') + '</svg>';
}
var hPaper, hSpots, hLen = 0;
function seekHae(T, clock) {
  // The clock is the fibroid and prostate strips': 13 s; line 1 from 0.3 s, line 2 from 4.3 s, line 3 from 9.2 s; the
  // weather clears from 9.2 to 11.4 s (his words 2026-11-12: "let's make sure the timing matches the other site banners").
  var a = seg(T, 9.2, 11.4), late = seg(a, .45, 1), i, s, times = [1.9, 2.6, 3.3];
  $('lh-light').setAttribute('opacity', a); $('lh-clear').setAttribute('opacity', a);
  $('lh-O').setAttribute('opacity', late); $('lh-O').setAttribute('transform', 'translate(0 ' + L(16, 0, late) + ')');
  $('lh-cloud').setAttribute('transform', 'translate(' + L(0, 62, seg(a, 0, .45)) + ' 0)');
  $('lh-rain').setAttribute('opacity', 1 - seg(a, 0, .35));
  $('lh-rain').setAttribute('transform', reduce ? '' : 'translate(' + (-((clock * 18) % 6)) + ' ' + ((clock * 40) % 12) + ')');
  // the paper unrolls (0.5 to 1.5 s); three spots land before line 2; with the sun it pulls through and clean squares follow
  if (!hLen) hLen = hPaper[0].getTotalLength();
  var vis = L(30, hLen, seg(T, .5, 1.5)), tip = hPaper[0].getPointAtLength(vis), off = 560 * seg(T, 9.6, 11.6);
  for (i = 0; i < hPaper.length; i++) hPaper[i].setAttribute('stroke-dasharray', vis + ' ' + (hLen + 10));
  $('lh-fold').setAttribute('opacity', vis > 78 ? 1 : 0);
  $('lh-rvr').setAttribute('width', Math.max(0, tip.x - 258));
  $('lh-perf').setAttribute('transform', 'translate(' + (off % HPW) + ' 0)');
  for (i = 0; i < hSpots.length; i++) {   // a spot lands by scale, never by fading (paper-box guide, section 12)
    s = T < times[i] ? 0 : reduce ? 1 : 1 - Math.exp(-7 * (T - times[i])) * Math.cos(11 * (T - times[i]));
    hSpots[i].setAttribute('transform', 'translate(' + (+hSpots[i].getAttribute('data-x') + off) + ' 97) scale(' + (s > 0 ? .4 + .6 * s : 0) + ')');
  }
  // captions cross-fade as on the prostate strip, so the wall is never without words
  $('ls-c1').setAttribute('opacity', seg(T, .3, .7) - seg(T, 4.2, 4.6));
  $('ls-c2').setAttribute('opacity', seg(T, 4.3, 4.7) - seg(T, 8.6, 9.0));
  $('ls-c3').setAttribute('opacity', seg(T, 9.2, 9.7));
}
// ---- Chronic pelvic pain: the question cloud, with time passing ----
// Mockup and review history: ai-hq projects/platform/design/page-strips-2026-11-11/pelvic-strip-t3.html. She stays mid-picture
// and the ground slides past, so the cloud never leaves her; the seasons turn twice and two year signs go by.
var CHX = 292, CSCROLL = 600, CACC = '#1f6f78', CSEASON = ['#e9a9c0', '#6fae7a', '#e08a3c', '#e08a3c'];   // blossom, green, autumn; winter is bare
function buildCpp() {
  var rays = '', fl = '', trees = '', fall = '', signs = '', i, cols = ['#ffb648', '#fbf6ec', '#d6ebec', '#fbf6ec'];
  for (i = 0; i < 12; i++) rays += '<path d="M0 0 L-9 -150 L9 -150 Z" transform="rotate(' + (i * 30) + ')" fill="var(--ls-ray)"/>';
  for (i = 0; i < 26; i++) fl += '<g class="lc-fl" data-x="' + (24 + i * 30.5 + 9 * Math.sin(i * 1.7)).toFixed(1) + '" data-y="' + (121 + 5 * Math.sin(i * 2.3)).toFixed(1) + '"><circle r="3.4" fill="' + cols[i % 4] + '" stroke="' + EDGE + '" stroke-width=".8"/><circle r="1.1" fill="#22302b"/></g>';
  for (i = 0; i < 14; i++) trees += '<g class="lc-tr" data-x="' + (150 + i * 112) + '"><rect x="-2.2" y="-24" width="4.4" height="26" fill="#7a5a4c"/><path d="M0 -22 L-9 -36 M0 -24 L8 -38 M0 -27 L0 -42 M-5 -30 L-12 -31 M5 -31 L12 -29" fill="none" stroke="#7a5a4c" stroke-width="2" stroke-linecap="round"/>' +
    '<g class="lc-cn" stroke="' + EDGE + '" stroke-width="1.2"><circle cx="-8" cy="-31" r="9"/><circle cx="8" cy="-32" r="9"/><circle cx="0" cy="-41" r="10"/></g></g>';
  for (i = 0; i < 22; i++) fall += '<circle class="lc-lf" r="' + (i % 2 ? 1.5 : 1.9) + '"/>';
  [[130, '1 year'], [330, '2 years']].forEach(function (g) { signs += '<g class="lc-sg" data-x="' + (CHX + g[0]) + '" filter="url(#ls-sh)"><path d="M0 2 V-20" stroke="#7a5a4c" stroke-width="3.4" stroke-linecap="round"/><rect x="-33" y="-42" width="66" height="23" rx="4" fill="' + CACC + '" stroke="' + EDGE + '" stroke-width="1.6"/><text class="n lc-yr" x="0" y="-25.4" text-anchor="middle">' + g[1] + '</text></g>'; });
  var arm = 'fill="none" stroke="' + SK + '" stroke-width="4.6" stroke-linecap="round"', legE = 'fill="none" stroke="' + EDGE + '" stroke-width="9.4" stroke-linecap="round" stroke-linejoin="round"', leg = 'fill="none" stroke="#3f5e55" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"';
  function mark(tr, d) { return '<path d="' + d + '" transform="' + tr + '" fill="none" stroke="#fbf6ec" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" transform="' + tr + '" fill="none" stroke="' + PAIN + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'; }
  var hair = '#4a2f27';
  return '<svg viewBox="0 0 800 133" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + SC.label + '">' +
    '<defs><linearGradient id="ls-storm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3134"/><stop offset="1" stop-color="#4f6769"/></linearGradient>' +
    '<filter id="ls-sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#10151c" flood-opacity=".42"/></filter>' +
    // trees stop at the caption card, so it never reads as a sign on posts
    '<clipPath id="lc-clip"><rect x="0" y="0" width="380" height="133"/><rect x="600" y="0" width="200" height="133"/></clipPath></defs>' +
    '<rect width="800" height="133" fill="url(#ls-storm)"/><rect id="lc-clear" width="800" height="133" fill="var(--ls-clear)"/>' +
    // the sun sits where the question cloud hangs, inside the phone picture (his note 2026-11-14)
    '<g id="lc-rays" transform="translate(236 24)">' + rays + '</g>' +
    '<g id="lc-moon" filter="url(#ls-sh)"><path transform="translate(536 12) scale(.8)" d="' + CLOUD + '" fill="#142326" stroke="' + EDGE + '" stroke-width="1.4"/></g>' +
    '<g id="lc-O" filter="url(#ls-sh)"><circle cx="236" cy="24" r="15" fill="#2f5d50" stroke="' + EDGE + '" stroke-width="1.6"/><circle cx="236" cy="24" r="5.5" fill="#ffb648"/></g>' +
    '<path d="M0 104 Q200 84 400 100 T800 96 V133 H0Z" fill="var(--ls-hill1)"/>' +
    '<g clip-path="url(#lc-clip)">' + trees + '</g>' +
    '<g filter="url(#ls-sh)"><path d="M-4 116 Q220 100 420 112 T804 108 V140 H-4Z" fill="var(--ls-hill2)" stroke="' + EDGE + '" stroke-width="1.6"/></g>' + fl +
    '<g clip-path="url(#lc-clip)">' + fall + signs + '</g>' +
    '<g id="lc-q" filter="url(#ls-sh)"><path d="' + CLOUD + '" transform="scale(2.5 .9)" fill="#142326" stroke="' + EDGE + '" stroke-width="1.4"/><text class="lc-qm" x="-4" y="5" text-anchor="middle">?</text></g>' +
    // her: our female silhouette, front view, long dark hair, sage top (one figure throughout)
    '<g id="lc-her" filter="url(#ls-sh)"><path id="lc-lLe" ' + legE + '/><path id="lc-lRe" ' + legE + '/><path id="lc-lL" ' + leg + '/><path id="lc-lR" ' + leg + '/>' +
      '<g id="lc-top"><g id="lc-hair"><path d="M-9.5 -36 C-9.5 -48 9.5 -48 9.5 -36 L9.5 -21 L-9.5 -21 Z" fill="' + hair + '" stroke="' + EDGE + '" stroke-width="1.6"/></g><rect x="-8.8" y="-27" width="17.6" height="28" rx="6" fill="' + TOP + '" stroke="' + EDGE + '" stroke-width="1.6"/>' +
        '<g id="lc-face"><rect x="-2.6" y="-30" width="5.2" height="5" fill="' + SK + '"/><circle cx="0" cy="-35.5" r="7" fill="' + SK + '"/><path d="M-7.2 -38 Q0 -46.5 7.2 -38 Q0 -43 -7.2 -38 Z" fill="' + hair + '"/></g>' +
        '<g id="lc-aS"><path ' + arm + ' d="M-9.2 -22 L-11.4 -3"/><path ' + arm + ' d="M9.2 -22 L11.4 -3"/></g>' +
        '<g id="lc-aK"><path ' + arm + ' d="M-9.2 -22 Q-15 -9 -3 -6"/><path ' + arm + ' d="M9.2 -22 Q15 -9 3 -6"/></g></g>' +
      '<g id="lc-pain">' + mark('translate(10 -5) rotate(-20) scale(1.35)', 'M0 0 l3 -3 l3 3 l3 -3') + mark('translate(11 4) rotate(15) scale(1.35)', 'M0 0 l3 -3 l3 3 l3 -3') + mark('translate(-10 1) rotate(10) scale(1.35)', 'M0 0 l-3 -3 l-3 3 l-3 -3') + '</g></g>' +
    cap(1, 384, 28, 208, SC.caps[0], '#12454b') + cap(2, 384, 20, 208, SC.caps[1], '#12454b') + cap(3, 384, 12, 208, SC.caps[2], '#12454b') + '</svg>';
}
function hexRgb(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
function mixC(a, b, p) { a = hexRgb(a); b = hexRgb(b); return 'rgb(' + a.map(function (v, i) { return Math.round(L(v, b[i], p)); }).join(',') + ')'; }
function seekCpp(T, clock) {
  // The knee strip's 14 s clock (critic 2026-11-14: line 2 is 12 words, so it must hold 4.6 s, style guide section 6):
  // line 1 from 0.3 s, line 2 4.3 to 9.6 s, line 3 from 9.6 s; the weather clears from 9.6 to 11.8 s.
  var a = seg(T, 9.6, 11.8), late = seg(a, .5, 1), i;
  $('lc-clear').setAttribute('opacity', a); $('lc-rays').setAttribute('opacity', .14 * late); $('lc-O').setAttribute('opacity', late);
  $('lc-O').setAttribute('transform', 'translate(0 ' + L(20, 0, late) + ')'); $('lc-moon').setAttribute('opacity', 1 - seg(a, 0, .5));
  for (i = 0; i < cFl.length; i++) cFl[i].setAttribute('transform', 'translate(' + cFl[i].getAttribute('data-x') + ' ' + cFl[i].getAttribute('data-y') + ') scale(' + cl(seg(a, .6, 1) * 1.6 - (i % 5) * .12) + ')');
  // three stretches of walking with two stops and a last stop; the ground and everything on it slides past her
  var w = [seg(T, .4, 2.6), seg(T, 3.2, 5.6), seg(T, 6.2, 8.6)], sc = CSCROLL * (w[0] + w[1] + w[2]) / 3, go = seg(T, 11.4, 13.1);
  var moving = w.concat([go]).some(function (v) { return v > 0 && v < 1; });
  var stop = Math.max(seg(T, 2.5, 2.8) - seg(T, 3.1, 3.4), seg(T, 5.5, 5.8) - seg(T, 6.1, 6.4), seg(T, 8.5, 8.9)) * (1 - seg(T, 10.0, 10.8));
  // two turns of the seasons from 0.4 to 8.7 s, ending on blossom
  var ph = cl((T - .4) / 8.3) * 8, f = ph % 4, s = Math.floor(f) % 4, p = f - Math.floor(f);
  if (ph >= 8) { s = 0; p = 0; }
  var col = mixC(CSEASON[s], CSEASON[(s + 1) % 4], s === 2 ? 0 : s === 3 ? 1 : seg(p, .2, .8));
  var bare = s === 2 ? seg(p, .35, .9) : s === 3 ? 1 - seg(p, .45, .95) : 0, leaf = s === 2 ? Math.sin(Math.PI * cl(p * 1.15)) : 0, snow = s === 3 ? Math.sin(Math.PI * p) : 0;
  for (i = 0; i < cTr.length; i++) cTr[i].setAttribute('transform', 'translate(' + (+cTr[i].getAttribute('data-x') - sc) + ' 104)');
  for (i = 0; i < cCn.length; i++) { cCn[i].setAttribute('fill', col); cCn[i].setAttribute('opacity', 1 - bare); }
  for (i = 0; i < cLf.length; i++) {
    var isLeaf = leaf >= snow, dr = reduce ? 0 : clock;
    cLf[i].setAttribute('cx', 150 + (i * 97 + (isLeaf ? 9 * Math.sin(dr * 2 + i) : 0)) % 500); cLf[i].setAttribute('cy', 8 + (dr * (isLeaf ? 26 : 34) + i * 31) % 100);
    cLf[i].setAttribute('fill', isLeaf ? '#e08a3c' : '#fbf6ec'); cLf[i].setAttribute('opacity', .9 * Math.max(leaf, snow));
  }
  for (i = 0; i < cSg.length; i++) cSg[i].setAttribute('transform', 'translate(' + (+cSg[i].getAttribute('data-x') - sc) + ' 112)');
  // her: standing throughout; at each stop she bows and holds her lower belly; she walks on as the sun comes
  var hx = CHX + 34 * go, base = 115, hy = base - 27, ky = (hy + base) / 2, bow = Math.max(.45 * (1 - seg(T, 10.0, 10.8)), stop), sw = moving && !reduce ? .6 * Math.sin(clock * 5) : 0;
  var pain = (1 - seg(T, 9.6, 10.3)) * (.7 + .3 * stop);
  function legD(side) { var x = hx + side * 3.8, s2 = side * sw, fy = base - 2 * Math.abs(sw) * (s2 > 0 ? 1 : 0); return 'M' + x + ' ' + hy + ' L' + (x + 3 * s2) + ' ' + ky + ' L' + (x + 7 * s2) + ' ' + fy; }
  var dL = legD(-1), dR = legD(1);
  $('lc-lL').setAttribute('d', dL); $('lc-lLe').setAttribute('d', dL); $('lc-lR').setAttribute('d', dR); $('lc-lRe').setAttribute('d', dR);
  $('lc-top').setAttribute('transform', 'translate(' + hx + ' ' + hy + ') scale(.9)');
  var head = 'translate(0 ' + (5.5 * bow) + ') rotate(' + (-8 * bow) + ' 0 -30)';
  $('lc-face').setAttribute('transform', head); $('lc-hair').setAttribute('transform', head);
  $('lc-aK').setAttribute('opacity', bow > .35 ? 1 : 0); $('lc-aS').setAttribute('opacity', bow > .35 ? 0 : 1);
  $('lc-pain').setAttribute('transform', 'translate(' + hx + ' ' + (hy - 6) + ')');
  $('lc-pain').setAttribute('opacity', reduce ? Math.min(1, pain * 1.2) : pain * (stop > .5 ? 1 : .75 + .25 * Math.abs(Math.sin(clock * 3.4))));   // held full at each stop
  // the question cloud is the sky over her stretch of path, not a bubble on her head (critic 2026-11-14): wide, flat and
  // a little ahead of her; the strip is 133 units tall, so its lower edge sits about 12 units above her hair, not 25
  var away = seg(T, 9.6, 11.0);
  $('lc-q').setAttribute('transform', 'translate(' + (CHX + 14 - 60 * away) + ' ' + (26 - 60 * away + (reduce ? 0 : 1.5 * Math.sin(clock * 1.2))) + ')');
  $('lc-q').setAttribute('opacity', 1 - seg(T, 10.2, 11.0));
  $('ls-c1').setAttribute('opacity', seg(T, .3, .7) - seg(T, 4.1, 4.5));   // line 1, 8 words: 3.4 s
  $('ls-c2').setAttribute('opacity', seg(T, 4.3, 4.6) - seg(T, 9.2, 9.6));
  $('ls-c3').setAttribute('opacity', seg(T, 9.6, 10.1));
}
var cFl, cTr, cCn, cLf, cSg;
var $ = function (id) { return document.getElementById(id); }, all = function (c) { return host.querySelectorAll(c); };
var DRAW = { ufe: [buildUfe, seekUfe], pae: [buildPae, seekPae], gae: [buildGae, seekGae], hae: [buildHae, seekHae], pelvic: [buildCpp, seekCpp] }[K];
if (!DRAW) return;   // a scene named above with no drawing yet: leave the strip empty, never throw
host.innerHTML = DRAW[0](); var seek = DRAW[1];
rainEls = all('.ls-r'); flEls = all('.ls-f'); dropEls = all('.ls-d'); starEls = all('.lp-s'); pflEls = all('.lp-f'); numEls = all('.lp-n'); kflEls = all('.lk-f'); legEls = all('.lk-dl'); hPaper = all('.lh-pp'); hSpots = all('.lh-sp'); cFl = all('.lc-fl'); cTr = all('.lc-tr'); cCn = all('.lc-cn'); cLf = all('.lc-lf'); cSg = all('.lc-sg');
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
