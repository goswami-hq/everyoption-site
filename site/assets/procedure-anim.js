// Patient animation for a procedure: before, during, after. Starts when scrolled into view, and stops drawing off screen.
// Template: ai-hq projects/platform/design/procedure-animations/README.md
(function () {
  var fig = document.querySelector(".proc"); if (!fig) return;
  var cur = fig.dataset.proc;
  var D = 14, STEPS = [0, 3, 10], KEY = [2, 8.4, 14];
  var NS = "http://www.w3.org/2000/svg";
  var $ = function (id) { return document.getElementById(id); };
  var reduce = false; try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var cl = function (v) { return Math.max(0, Math.min(1, v)); };
  var seg = function (t, a, b) { var x = cl((t - a) / (b - a)); return x * x * (3 - 2 * x); };
  var M = function (cx, cy, s) { return "translate(" + cx + " " + cy + ") scale(" + s + ") translate(" + (-cx) + " " + (-cy) + ")"; };
  function scatter(n, cx, cy, rx, ry) { var o = []; for (var i = 0; i < n; i++) { var a = i * 2.399, r = Math.sqrt((i + .6) / n); o.push([cx + rx * r * Math.cos(a), cy + (ry || rx) * r * Math.sin(a)]); } return o; }

  var S = {
    ufe: { 
      sides: [{ br: "ufeBrL", cath: "ufeCathL", n: 10, t: scatter(10, 150, 190, 21), c: [150, 190], blood: 7 }, { br: "ufeBrR", cath: "ufeCathR", n: 16, t: scatter(16, 252, 135, 38), c: [252, 135], blood: 9 }],
      draw: function (T, a, st, pulse, calmed) {
        $("ufeAll").setAttribute("transform", M(200, 195, 1.1 - .14 * a + (1 - calmed) * .012 * pulse));
        $("ufeHot").setAttribute("opacity", (.62 + .1 * pulse) * (1 - calmed));
        var sR = 1.12 - .58 * a, sL = 1.1 - .52 * a;
        $("ufeFibR").setAttribute("transform", M(252, 135, sR)); $("ufeFibL").setAttribute("transform", M(150, 190, sL));
        $("ufeFibRH").setAttribute("opacity", 1 - st[1] * .35 - a * .65); $("ufeFibLH").setAttribute("opacity", 1 - st[0] * .35 - a * .65);
        $("ufeGlowR").setAttribute("opacity", (.55 + .45 * pulse) * (1 - st[1])); $("ufeGlowR").setAttribute("transform", M(252, 135, sR));
        $("ufeGlowL").setAttribute("opacity", (.55 + .45 * pulse) * (1 - st[0])); $("ufeGlowL").setAttribute("transform", M(150, 190, sL));
        return [sL, sR];
      } },
    pae: { 
      sides: [{ br: "paeBrL", cath: "paeCathL", n: 14, t: scatter(14, 163, 230, 24, 32), c: [200, 228], blood: 7 }, { br: "paeBrR", cath: "paeCathR", n: 14, t: scatter(14, 237, 230, 24, 32), c: [200, 228], blood: 7 }],
      init: function () { this.u = dots($("paeUrine"), "urine", 3, 18); },
      draw: function (T, a, st, pulse, calmed, clock) {
        var s = 1.22 - .46 * a, squeeze = (1 - calmed) * (.02 * pulse);
        $("paeGland").setAttribute("transform", M(200, 228, s + squeeze));
        $("paeHot").setAttribute("opacity", (.62 + .1 * pulse) * (1 - calmed));
        $("paeGlow").setAttribute("opacity", (.55 + .45 * pulse) * (1 - (st[0] + st[1]) / 2));
        $("paeUrethra").setAttribute("stroke-width", 2 + 10 * a);
        $("paeFluid").setAttribute("y", 50 + 88 * a);
        var speed = .05 + .75 * a;
        this.u.forEach(function (c, i) {
          var ph = reduce ? i / 18 : (clock * speed + i / 18) % 1;
          var on = i % 6 === 0 ? 1 : a;
          c.setAttribute("cx", 200); c.setAttribute("cy", 178 + 172 * ph);
          c.setAttribute("r", 2.6 + 2.6 * a); c.setAttribute("opacity", on);
        });
        return [s, s];
      } },
    gae: { 
      bloodSpeed: .8,
      sides: [{ br: "gaeBrL", cath: "gaeCathL", n: 14, t: scatter(14, 246, 146, 26, 18), c: [246, 146], blood: 8 }, { br: "gaeBrR", cath: "gaeCathR", n: 14, t: scatter(14, 246, 190, 26, 16), c: [246, 190], blood: 8 }],
      init: function () {
        var g = $("gaeNeo"); this.n = [1, 2, 3, 4, 5].map(function (i) { var p = $("neo" + i); return { p: p, l: p.getTotalLength(), d: dots(g, "blood", 2.4, 3) }; });
        this.b = [].slice.call($("gaeBolts").children);
      },
      draw: function (T, a, st, pulse, calmed, clock) {
        var both = (st[0] + st[1]) / 2;
        var stiff = (1 - seg(T, 2.4, 3)) * (reduce ? 0 : 3 + 3 * Math.sin(clock * 9));
        var free = a * (reduce ? 20 : 20 + 20 * Math.sin(clock * 2.2 - 1.57));
        var bend = "rotate(" + (stiff + free) + " 200 175)";
        $("gaeShin").setAttribute("transform", bend); $("gaeShinBone").setAttribute("transform", bend);
        $("gaeCap").setAttribute("transform", M(222, 172, 1.2 - .5 * a + (1 - calmed) * .04 * pulse));
        $("gaeCap").setAttribute("opacity", (.62 + .14 * pulse) * (1 - calmed));
        $("gaeGlow").setAttribute("opacity", (.6 + .4 * pulse) * (1 - both));
        this.n.forEach(function (o, k) {
          o.p.setAttribute("opacity", 1 - .9 * both);
          o.d.forEach(function (c, i) { var ph = reduce ? i / 3 : (clock * .9 + i / 3 + k * .2) % 1, q = o.p.getPointAtLength(o.l * ph);
            c.setAttribute("cx", q.x); c.setAttribute("cy", q.y); c.setAttribute("opacity", 1 - both); });
        });
        this.b.forEach(function (e, i) {
          var fl = reduce ? 1 : Math.max(0, Math.sin(clock * 5 + i * 1.9));
          e.setAttribute("opacity", fl * (1 - both));
        });
        return [1, 1];
      } }
  };
  function dots(g, cls, r, n) { var a = []; for (var i = 0; i < n; i++) { var c = document.createElementNS(NS, "circle"); c.setAttribute("class", cls); c.setAttribute("r", r); g.appendChild(c); a.push(c); } return a; }
  [cur].forEach(function (k) {
    var sc = S[k], root = $("scene-" + k);
    sc.sides.forEach(function (d) {
      d.path = $(d.br); d.len = d.path.getTotalLength();
      d.cl = $(d.cath); d.cLen = d.cl.getTotalLength(); d.cl.style.strokeDasharray = d.cLen;
      d.bloods = dots(root.querySelector(".flow"), "blood", 2.6, d.blood);
      d.beads = dots(root.querySelector(".beads"), "bead", 3.4, d.n);
    });
    if (sc.init) sc.init();
  });

  var t = 0, clock = 0, playing = false, last = 0, shown = null, visible = false, started = false, ticking = false;
  var rl = $("routeLine"), rLen = rl.getTotalLength(); rl.style.strokeDasharray = rLen;
  function render(T) {
    var sc = S[cur], a = seg(T, 10, 13.4);
    var st = [seg(T, 5, 6), seg(T, 8.4, 9.4)], both = (st[0] + st[1]) / 2;
    var pulse = reduce ? .5 : .5 + .5 * Math.sin(clock * 3.2), calmed = Math.max(a, both * .55);
    var sc2 = sc.draw(T, a, st, pulse, calmed, clock);
    var tm = [[3, 4.2, 6, 6.7, 4.2, 6], [6.7, 7.7, 9.4, 10, 7.7, 9.4]];
    sc.sides.forEach(function (d, si) {
      var m = tm[si], inn = seg(T, m[0], m[1]) - seg(T, m[2], m[3]);
      d.cl.style.strokeDashoffset = d.cLen * (1 - inn); d.cl.setAttribute("opacity", inn > .001 ? 1 : 0);
      d.bloods.forEach(function (c, i) {
        var ph = reduce ? i / d.bloods.length : (clock * (sc.bloodSpeed || .33) + i / d.bloods.length) % 1, p = d.path.getPointAtLength(d.len * ph);
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("opacity", 1 - st[si]);
      });
      var s = sc2[si], cx = d.c[0], cy = d.c[1], fade = sc.fadeBeads || .55;
      d.beads.forEach(function (c, i) {
        var b0 = m[4] + (m[5] - m[4] - .7) * i / d.n, x = cl((T - b0) / .7);
        if (T < b0) { c.setAttribute("opacity", 0); return; }
        var f = d.path.getPointAtLength(d.len * (.72 + .28 * x)), g = d.t[i];
        var px = x < 1 ? f.x + (g[0] - f.x) * x * x : g[0], py = x < 1 ? f.y + (g[1] - f.y) * x * x : g[1];
        c.setAttribute("cx", cx + (px - cx) * s); c.setAttribute("cy", cy + (py - cy) * s);
        c.setAttribute("opacity", 1 - fade * a);
      });
    });
    var w = seg(T, 2.4, 3) - seg(T, 9.6, 10.2);
    rl.style.strokeDashoffset = rLen * (1 - w);
    var step = T >= STEPS[2] ? 2 : T >= STEPS[1] ? 1 : 0;
    if (step !== shown) {
      shown = step;
      [0, 1, 2].forEach(function (i) {
        $("st-" + i).setAttribute("aria-pressed", i === step ? "true" : "false");
        $("cap-" + i).classList.toggle("on", i === step);
      });
    }
  }
  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
    if (playing) { t += dt; if (t >= D) { t = D; playing = false; } }
    render(t);
    if (visible && !reduce) requestAnimationFrame(frame); else ticking = false;
  }
  function wake() { if (ticking || reduce || !visible) return; ticking = true; last = performance.now(); requestAnimationFrame(frame); }
  function play(at, step) {
    if (reduce) { t = KEY[step]; render(t); return; }
    t = at; playing = true; wake();
  }
  fig.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.step) { var i = +b.dataset.step; play(STEPS[i], i); }
    else if (b.dataset.replay !== undefined) play(0, 0);
  });
  fig.classList.add("js");
  [].forEach.call(fig.querySelectorAll("[hidden]"), function (el) { el.hidden = false; });
  t = reduce ? KEY[0] : 0; render(t);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible && !started && !reduce) { started = true; playing = true; }
      wake();
    }, { threshold: .3 }).observe(fig);
  } else if (!reduce) { visible = true; started = true; playing = true; wake(); }
})();
