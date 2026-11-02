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
    if (a) { ev.preventDefault(); open(a.getAttribute("href").slice(1)); }
  });
  if (location.hash) open(location.hash.slice(1));
  var bar = document.querySelector(".find-bar"), finder = document.getElementById("finder");
  if (bar && finder && "IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { bar.hidden = e[0].isIntersecting; }).observe(finder);
  }
})();
