// Home search: choose a condition and a ZIP, then open that condition's finder with the results showing.
// Used by the home page and the Find a doctor page (fix D, 2026-11-15). The condition box starts on "Select a condition"
// (his words, 2026-11-15 18:01 CT: it "should be something like 'select a condition' and be clearly something that
// needs selecting"), so nothing is chosen for the reader.
(function () {
  var f = document.getElementById("home-search");
  if (!f) return;
  var c = document.getElementById("home-cond"), z = document.getElementById("home-zip"), s = document.getElementById("home-status");
  c.addEventListener("change", function () { if (c.value) { c.removeAttribute("aria-invalid"); if (s.dataset.k === "cond") s.textContent = ""; } });
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = z.value.trim();
    if (!c.value) { s.textContent = "Select a condition."; s.dataset.k = "cond"; c.setAttribute("aria-invalid", "true"); c.focus(); return; }
    if (!/^\d{5}$/.test(v)) { s.textContent = "Enter a 5-digit ZIP code."; s.dataset.k = "zip"; z.setAttribute("aria-invalid", "true"); z.focus(); return; }
    location.href = c.value + "?zip=" + v + "&r=50";
  });
})();
