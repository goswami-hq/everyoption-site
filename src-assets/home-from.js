// Walkthrough finding 3 (his "1-4 changes let's do them", 2026-11-09). The menu's "Conditions" from a condition's short
// page arrives here as /?from=<slug>#conditions. That condition's card must not send the reader straight back: it offers
// the comparison page instead, or, for a condition with no comparison page, stops being a link. Without JavaScript the
// list is unchanged.
(function () {
  var from = new URLSearchParams(location.search).get("from");
  if (!from || !/^[a-z-]+$/.test(from)) return;
  var a = document.querySelector('.fork-list a[href="/' + from + '/"]');
  if (!a) return;
  var proc = a.querySelector(".proc"), count = a.querySelector(".count"), compare = a.getAttribute("data-compare");
  if (compare) {
    a.setAttribute("href", compare);
    if (proc) proc.textContent = "Compare your options";
    if (count) count.remove();
    return;
  }
  a.removeAttribute("href");
  if (count) count.textContent = "You came from this page";
})();
