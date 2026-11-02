// Every Option claim or correct form. Posts to /api/claim; nothing it sends goes live until a person reviews it.
(function () {
  "use strict";
  var form = document.getElementById("claim-form");
  if (!form) return;
  var statusEl = document.getElementById("claim-status");
  var btn = form.querySelector("button[type=submit]");
  var qs = new URLSearchParams(location.search);
  var sent = false;

  // Prefill from the card's "Is this you?" link.
  var npi = qs.get("npi"), name = qs.get("name"), proc = qs.get("procedure");
  if (npi && /^\d{10}$/.test(npi)) form.npi.value = npi;
  if (name) form.name.value = name.slice(0, 120);
  if (proc) { var box = form.querySelector('input[name="procedures"][value="' + proc.replace(/[^a-z]/g, "") + '"]'); if (box) box.checked = true; }
  form.listing.value = npi || "";
  // One id per page view: a second press of Submit is the same submission, not a new one.
  form.submission_id.value = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

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
  function show(html, cls) { statusEl.className = cls || ""; statusEl.innerHTML = html; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // A field fixed by the reader is no longer marked as a problem.
  form.addEventListener("input", function (ev) { if (ev.target.getAttribute("aria-invalid")) ev.target.removeAttribute("aria-invalid"); });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (sent) return;
    var f = form, errs = [], bad = [];
    function need(field, words) { errs.push(words); if (bad.indexOf(field) < 0) bad.push(field); }
    if (f.name.value.trim().length < 2) need(f.name, "your name");
    if (f.npi.value.trim() && !npiOk(f.npi.value.trim())) need(f.npi, "a valid 10-digit NPI (or leave it blank if you are not the doctor)");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) need(f.email, "an email address we can reply to");
    if (f.role.value === "doctor" && !f.npi.value.trim()) need(f.npi, "your NPI");
    [f.name, f.npi, f.email].forEach(function (el) { if (bad.indexOf(el) < 0) el.removeAttribute("aria-invalid"); else el.setAttribute("aria-invalid", "true"); });
    if (errs.length) {
      var list = errs.map(esc), last = list.pop();
      show("Please add " + (list.length > 1 ? list.join(", ") + ", and " + last : list.length ? list[0] + " and " + last : last) + ".", "err");
      // in page order, so focus lands on the first field to fix
      bad.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; })[0].focus();
      return;
    }
    var body = {
      submission_id: f.submission_id.value, listing: f.listing.value, role: f.role.value,
      name: f.name.value.trim(), npi: f.npi.value.trim(), email: f.email.value.trim(),
      procedures: Array.prototype.slice.call(f.querySelectorAll('input[name="procedures"]:checked')).map(function (b) { return b.value; }),
      practice: f.practice.value.trim(), city: f.city.value.trim(), state: f.state.value.trim().toUpperCase(),
      note: f.note.value.trim(), website: f.website.value
    };
    btn.disabled = true; btn.textContent = "Sending…"; show("Sending…");
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    fetch("/api/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      credentials: "same-origin", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 200 || res.status === 201) {
          sent = true;
          form.hidden = true;
          show("<strong>Thank you. We have your submission.</strong> A person reviews every one before anything on the site changes. We will reply to " + esc(body.email) + " if we need more.", "ok");
          statusEl.focus();
        } else if (res.status === 503) {
          show("The form is not open yet. Please try again in a few days.", "err");
        } else if (res.status === 429) {
          show("Too many submissions from this connection. Please try again in an hour.", "err");
        } else if (res.status === 400 && res.j && res.j.fields) {
          show("Please check: " + res.j.fields.map(esc).join(", ") + ".", "err");
        } else {
          show("Something went wrong on our side. Your submission was not saved; please try again.", "err");
        }
      })
      .catch(function () { show("We couldn't reach the server. Check your connection and try again.", "err"); })
      .then(function () { clearTimeout(t); if (!sent) { btn.disabled = false; btn.textContent = "Send"; } });
  });
})();
