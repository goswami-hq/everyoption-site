// Closes the "Doctors by city" fold on phones (job platform-condition-pages-0004). The page ships it open, so with
// JavaScript off, and on desktop, the list shows as before.
// Job platform-condition-pages-0020: the in-depth page's "Other materials doctors use" fold (data-fold-phone) does the same.
(function () {
  if (!window.matchMedia("(max-width: 760px)").matches) return;
  var ds = document.querySelectorAll("details.city-fold, details[data-fold-phone]");
  for (var i = 0; i < ds.length; i++) ds[i].open = false;
})();
