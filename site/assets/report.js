// Every Option report-an-error form (job 19). Posts to /api/report. Anyone can send one; a report never changes a listing.
(function () {
  "use strict";
  var form = document.getElementById("report-form");
  if (!form) return;
  var statusEl = document.getElementById("report-status");
  var btn = form.querySelector("button[type=submit]");
  var qs = new URLSearchParams(location.search);
  var sent = false;

  function npiOk(n) {             // NPI check digit (Luhn over "80840" + the first nine digits)
    if (!/^\d{10}$/.test(n)) return false;
    var s = "80840" + n.slice(0, 9), sum = 0;
    for (var i = 0; i < s.length; i++) {
      var d = +s[s.length - 1 - i];
      if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return (10 - (sum % 10)) % 10 === +n[9];
  }

  // From a card's "Report an error" link: the doctor is shown, not typed.
  var npi = (qs.get("npi") || "").trim(), name = (qs.get("name") || "").trim().slice(0, 120);
  var proc = (qs.get("procedure") || "").replace(/[^a-z]/g, "").slice(0, 8);
  var known = npiOk(npi);
  form.listing.value = known ? npi : "";
  form.procedure.value = proc;
  if (known) {
    document.getElementById("r-doc-name").textContent = name || ("NPI " + npi);
    document.getElementById("r-doc-known").hidden = false;
    document.getElementById("r-doc-field").hidden = true;
  } else if (name) form.doctor.value = name;
  // The claim link keeps the doctor, so a physician who landed here can claim instead.
  var claim = document.getElementById("r-claim");
  if (claim && known) claim.href = "/account/?npi=" + npi + (proc ? "&procedure=" + proc : "");
  // One id per page view: a second press of Send is the same report, not a new one.
  form.submission_id.value = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  function show(html, cls) { statusEl.className = "status " + (cls || ""); statusEl.innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function reason() { var r = form.querySelector('input[name="reason"]:checked'); return r ? r.value : ""; }
  var reasonBox = document.getElementById("r-reason");

  form.addEventListener("input", function (ev) { if (ev.target.getAttribute("aria-invalid")) ev.target.removeAttribute("aria-invalid"); });
  form.addEventListener("change", function (ev) { if (ev.target.name === "reason") reasonBox.removeAttribute("aria-invalid"); });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (sent) return;
    var f = form, errs = [], bad = [];
    function need(el, words) { errs.push(words); bad.push(el); }
    if (!known && f.doctor.value.trim().length < 2) need(f.doctor, "the doctor's name");
    if (!reason()) need(reasonBox, "what's wrong");
    var email = f.email.value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) need(f.email, "a full email address, or leave it blank");
    [f.doctor, reasonBox, f.email].forEach(function (el) { if (bad.indexOf(el) < 0) el.removeAttribute("aria-invalid"); else el.setAttribute("aria-invalid", "true"); });
    if (errs.length) {
      var list = errs.map(esc), last = list.pop();
      show("Please add " + (list.length > 1 ? list.join(", ") + ", and " + last : list.length ? list[0] + " and " + last : last) + ".", "err");
      var first = bad[0]; (first.tagName === "FIELDSET" ? first.querySelector("input") : first).focus();
      return;
    }
    var body = { submission_id: f.submission_id.value, listing: f.listing.value, procedure: f.procedure.value,
      doctor: known ? (name || "") : f.doctor.value.trim(), reason: reason(), note: f.note.value.trim(), email: email,
      website: f.website.value };
    btn.disabled = true; btn.textContent = "Sending…"; show("Sending…");
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      credentials: "same-origin", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 200 || res.status === 201) {
          sent = true;
          form.hidden = true;
          show("<strong>Thank you. We got your report.</strong>" + (email ? " If we need more, we will write to " + esc(email) + "." : ""), "ok");
          statusEl.focus();
        } else if (res.status === 503) {
          show("The form is not open yet. Please email <a href=\"mailto:errors@everyoptionmd.com\">errors@everyoptionmd.com</a> instead.", "err");
        } else if (res.status === 429) {
          show("Too many reports from this connection. Please try again in an hour.", "err");
        } else if (res.status === 400) {
          show("Please check the form and try again.", "err");
        } else {
          show("Something went wrong on our side. Your report was not saved; please try again.", "err");
        }
      })
      .catch(function () { show("We couldn't reach the server. Check your connection and try again.", "err"); })
      .then(function () { clearTimeout(t); if (!sent) { btn.disabled = false; btn.textContent = "Send"; } });
  });
})();
