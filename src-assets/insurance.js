// Card details on the coverage pages (job platform-condition-pages-0008). The HTML ships them closed, so phones paint
// closed; here they open at 768 px and up. A jump to a card opens that card. With no script they still open on tap.
(function () {
  var folds = document.querySelectorAll("details.ins-more");
  if (!folds.length) return;
  var wide = window.matchMedia("(min-width: 768px)");
  function openTarget() {
    var id = location.hash.slice(1), card = id && document.getElementById(id);
    var d = card && card.querySelector("details.ins-more");
    if (d) d.open = true;
  }
  function apply() {
    for (var i = 0; i < folds.length; i++) { folds[i].open = wide.matches; folds[i].classList.add("ins-ready"); }
    openTarget();
  }
  apply();
  wide.addEventListener("change", apply);
  window.addEventListener("hashchange", openTarget);
})();
