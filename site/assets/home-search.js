// Home search: choose a condition and a ZIP, then open that condition's finder with the results showing.
(function () {
  var f = document.getElementById("home-search");
  if (!f) return;
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var z = document.getElementById("home-zip"), s = document.getElementById("home-status"), v = z.value.trim();
    if (!/^\d{5}$/.test(v)) { s.textContent = "Enter a 5-digit ZIP code."; z.setAttribute("aria-invalid", "true"); z.focus(); return; }
    location.href = document.getElementById("home-cond").value + "?zip=" + v + "&r=50";
  });
})();
