// Condition pages: everything starts collapsed. A link to something inside a collapsed section opens it.
(function () {
  function open(id) {
    var el = id && document.getElementById(id);
    for (var n = el; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true;
    if (el) el.scrollIntoView();
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (a) open(a.getAttribute("href").slice(1));
  });
  if (location.hash) open(location.hash.slice(1));
})();
