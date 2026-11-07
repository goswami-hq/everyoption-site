// Closes the "Doctors by city" fold on phones (job platform-condition-pages-0004). The page ships it open, so with
// JavaScript off, and on desktop, the list shows as before.
(function () {
  var d = document.querySelector("details.city-fold");
  if (d && window.matchMedia("(max-width: 760px)").matches) d.open = false;
})();
