// Condition and finder pages: a link to something inside a collapsed section opens it, and a "Find a doctor" bar
// shows on phones once the ZIP box has scrolled out of view.
(function () {
  var from = null, back = null, fromHash = "", pushed = false;
  function open(id) {
    var el = id && document.getElementById(id);
    for (var n = el; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true;
    if (el) el.scrollIntoView();
    // Design review 2026-11-06: a reference reached from a marker is marked (pushState never sets :target) and offers a
    // way back to the sentence the reader left.
    if (/^ref-/.test(id || "") && el) {
      var old = document.querySelector("ol.refs .is-target");
      if (old) old.classList.remove("is-target");
      el.classList.add("is-target");
      if (from) {
        if (!back) {
          back = document.createElement("button");
          back.type = "button"; back.className = "ref-back"; back.textContent = "Back to the text";
          back.addEventListener("click", function () { if (pushed) history.back(); else home(); });
        }
        el.appendChild(back);
      }
      el.focus({ preventScroll: true });
    }
    if (id === "finder") { var z = document.getElementById("zip"); if (z) z.focus({ preventScroll: true }); }
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    ev.preventDefault();
    from = /^ref-/.test(id) ? a : null; fromHash = location.hash; pushed = false;
    // A history entry, so Back returns the reader to where they were (job 20: Back used to leave the page).
    if (id && location.hash !== "#" + id && history.pushState) { history.pushState(null, "", "#" + id); pushed = true; }
    open(id);
  });
  // The animation starts over when "How it works" opens, so nobody finds it already finished.
  var how = document.querySelector("details.how-fold");
  if (how) how.addEventListener("toggle", function () { var r = how.querySelector("[data-replay]"); if (how.open && r) r.click(); });
  if (location.hash) open(location.hash.slice(1));
  // Back (the button or the browser's) lands on the marker the reader left, with focus on it.
  function home() {
    var f = from; from = null; if (back && back.parentNode) back.remove();
    if (f) { if (!pushed) f.scrollIntoView({ block: "center" }); f.focus({ preventScroll: true }); }
  }
  window.addEventListener("popstate", function () { if (from && location.hash === fromHash) home(); });
  var bar = document.querySelector(".find-bar"), finder = document.getElementById("finder");
  if (bar && finder && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { bar.hidden = e[0].isIntersecting; }).observe(finder);
  }
})();
