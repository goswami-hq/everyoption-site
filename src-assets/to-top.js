// A "Back to top" arrow on every page (his words, ai-hq HQ chat 2026-11-16 07:02 CT: "Let's add a scroll to top arrow
// button to every page"). It shows once the reader is a screen and a half down, sits bottom right, rides above the
// "Find a doctor" bar and the first-visit notice when they show, and takes the reader to the top with focus on the page's
// heading, so a keyboard or screen-reader user lands where the eye does. Reduced motion: the jump is instant. Without
// JavaScript nothing shows (the deep pages' contents list keeps its own "Back to top" link). Styles: site.css ".to-top-btn".
(function () {
  if (!("addEventListener" in window)) return;
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "to-top-btn";
  btn.setAttribute("aria-label", "Back to top");
  btn.hidden = true;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.body.appendChild(btn);

  var ticking = false;
  function check() {
    ticking = false;
    var show = window.scrollY > window.innerHeight * 1.5;
    if (btn.hidden === show) btn.hidden = !show;
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(check); } }, { passive: true });
  window.addEventListener("resize", check);
  check();

  btn.addEventListener("click", function () {
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    var h = document.querySelector("main h1") || document.getElementById("main");
    if (h) {
      if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
    }
    if (history.replaceState && location.hash) history.replaceState(null, "", location.pathname + location.search);
  });
})();
