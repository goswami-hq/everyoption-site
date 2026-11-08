// Card details on the coverage pages (job platform-condition-pages-0008). The HTML ships them closed, so phones paint
// closed; here they open at 768 px and up. A jump to a card opens that card. The sources list stays folded at every width
// (his words 2026-11-08 11:54 CT: "Collapse sources for sure"); a source number opens it. With no script both open on tap.
(function () {
  var folds = document.querySelectorAll("details.ins-more");
  var wide = window.matchMedia("(min-width: 768px)");
  function openTarget() {
    var id = location.hash.slice(1), el = id && document.getElementById(id);
    if (!el) return;
    var d = el.querySelector("details.ins-more");   // a jump to a card opens that card
    if (d) d.open = true;
    for (var p = el.parentElement; p; p = p.parentElement) if (p.tagName === "DETAILS") p.open = true;   // a source number opens the folded list
  }
  function apply() {
    for (var i = 0; i < folds.length; i++) { folds[i].open = wide.matches; folds[i].classList.add("ins-ready"); }
    openTarget();
  }
  apply();
  wide.addEventListener("change", apply);
  window.addEventListener("hashchange", openTarget);
  document.addEventListener("click", function (ev) {   // a repeat tap on the same link fires no hashchange
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (a) setTimeout(openTarget, 0);
  });
})();
