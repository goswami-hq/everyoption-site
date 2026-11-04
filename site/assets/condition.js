// Condition and finder pages: a link to something inside a collapsed section opens it, and a "Find a doctor" bar
// shows on phones once the ZIP box has scrolled out of view.
(function () {
  function open(id) {
    var el = id && document.getElementById(id);
    for (var n = el; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true;
    if (el) el.scrollIntoView();
    if (id === "finder") { var z = document.getElementById("zip"); if (z) z.focus({ preventScroll: true }); }
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    ev.preventDefault();
    // A history entry, so Back returns the reader to where they were (job 20: Back used to leave the page).
    if (id && location.hash !== "#" + id && history.pushState) history.pushState(null, "", "#" + id);
    open(id);
  });
  // The animation starts over when "How it works" opens, so nobody finds it already finished.
  var how = document.querySelector("details.how-fold");
  if (how) how.addEventListener("toggle", function () { var r = how.querySelector("[data-replay]"); if (how.open && r) r.click(); });
  if (location.hash) open(location.hash.slice(1));
  var bar = document.querySelector(".find-bar"), finder = document.getElementById("finder");
  if (bar && finder && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { bar.hidden = e[0].isIntersecting; }).observe(finder);
  }
})();
