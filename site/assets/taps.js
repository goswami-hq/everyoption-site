// Counts a tap on a doctor's Call, Website or booking link (his words, ai-hq HQ chat 2026-11-21 09:08 CT: "Let's
// build 2 first", item 2 of the marketing plan: count when a patient taps to call or visit a doctor).
// It sends only the doctor's NPI, the procedure, the kind of tap and the kind of page, to our own server
// (functions/api/tap.js). No cookie, no stored ID, no third party, nothing about the visitor. The link opens as before:
// the count is sent in the background and never delays or blocks it. Cards and profiles carry data-npi, data-proc and
// data-src (lib/cities.mjs, lib/directory.mjs, src-assets/finder.js); a link outside them is never counted.
(function () {
  if (!("addEventListener" in document) || !navigator.sendBeacon) return;
  var NPI = /^[0-9]{10}$/, PROC = /^[a-z]{2,12}$/, SRC = { finder: 1, city: 1, profile: 1 };
  function kindOf(a) {
    var href = a.getAttribute("href") || "";
    if (href.indexOf("tel:") === 0) return "call";
    if (a.classList.contains("book")) return "booking";
    if (a.classList.contains("page")) return "website";
    return "";
  }
  function send(e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var kind = kindOf(a), box = kind ? a.closest("[data-npi]") : null;
    if (!box) return;
    var npi = box.getAttribute("data-npi") || "", proc = box.getAttribute("data-proc") || "", src = box.getAttribute("data-src") || "";
    if (!NPI.test(npi) || !SRC[src] || (proc && !PROC.test(proc))) return;
    try { navigator.sendBeacon("/api/tap", JSON.stringify({ npi: npi, proc: proc, kind: kind, src: src })); } catch (_) {}
  }
  document.addEventListener("click", send, true);
  // A middle click opens the doctor's site in a new tab without a click event.
  document.addEventListener("auxclick", function (e) { if (e.button === 1) send(e); }, true);
})();
