// Insurance list 2026-11-08 item 3, his "B yes" (HQ chat 2026-11-16 14:30 CT): a profile shows "Call the office to ask
// which plans they accept." only when the doctor entered no plans; plans a doctor enters show as entered, without it.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeDoctor, render, NO_PLANS } from "../lib/directory.mjs";

const NPI = "1999000097";
const doc = (extra) => mergeDoctor(NPI, null, { ufe: { removed: [], people: [{ npi: NPI, name: "Ann Testone", confirmed: true, offices: [
  { practice: "Lakeside IR", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100", lat: 41.9, lon: -87.6 }],
  booking_url: "", blurb: "", photo: "", insurances: [], insurance_other: "", insurance_confirm: false, ...extra }] } });
const insLine = (html) => (/<p class="ins">([\s\S]*?)<\/p>/.exec(html) || [])[1] || "";

test("no plans entered: the profile says to call the office", () => {
  assert.equal(NO_PLANS, "Call the office to ask which plans they accept.");
  const line = insLine(render(NPI, doc({})));
  assert.ok(line.includes(NO_PLANS), line);
});

test("plans entered: shown as entered, no call-the-office line", () => {
  const html = render(NPI, doc({ insurances: ["Aetna", "Medicare"], insurance_other: "Most local plans" }));
  const line = insLine(html);
  assert.ok(line.includes("Aetna, Medicare, Most local plans"), line);
  assert.ok(!html.includes(NO_PLANS));
});

test("only the doctor's 'confirm with the office' choice: kept as the doctor set it", () => {
  const html = render(NPI, doc({ insurance_confirm: true }));
  assert.ok(insLine(html).includes("Confirm with the office."));
  assert.ok(!html.includes(NO_PLANS));
});
