// Stage 2: fuller cards. node --test tools/accounts-stage2.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { world, ANN, GIL } from "./accounts-helpers.mjs";
import { screen, BLURB_MAX } from "../lib/accounts/screen.mjs";
import { checkPhoto, PHOTO_CAP } from "../lib/accounts/image.mjs";
import { exportConfirmed } from "../lib/accounts/service.mjs";

// ---- the automatic screen --------------------------------------------------------------------------------------
test("screen: plain blurb passes", () => {
  assert.deepEqual(screen("I perform UFE and PAE at Lakeside. Call the office to ask whether it fits you.", BLURB_MAX).reasons, []);
});
test("screen: 300-character cap", () => {
  assert.equal(screen("a".repeat(300), BLURB_MAX).ok, true);
  assert.deepEqual(screen("a".repeat(301), BLURB_MAX).reasons, ["too_long"]);
});
test("screen: links, emails and phone numbers blocked", () => {
  for (const s of ["See https://x.example", "visit www.lakeside.example", "go to lakesideir.com today", "mail me a@b.example",
    "call 312-555-0100", "(312) 555 0100", "+1 312 555 0100", "3125550100"])
    assert.ok(!screen(s, BLURB_MAX).ok, s);
  assert.ok(screen("I have done this since 2009, over 500 cases.", BLURB_MAX).ok, "years and counts are not phones");
});
test("screen: patient stories blocked", () => {
  for (const s of ["My patient was able to walk again", "One patient told me she felt better", "A 54-year-old woman came in",
    "Read our patient testimonials", "Case report: a man with BPH", "Mrs. Smith had fibroids", "She was pain free in a week"])
    assert.ok(!screen(s, BLURB_MAX).ok, s);
  assert.ok(screen("I see patients in Evanston and Skokie.", BLURB_MAX).ok, "the word patients alone is fine");
});
test("screen: promise and superlative words blocked", () => {
  for (const s of ["Guaranteed results", "The best GAE in town", "A cure for fibroids", "Cures knee pain", "100% success",
    "Painless and risk-free", "#1 rated", "miracle treatment", "Top-rated doctor"])
    assert.ok(!screen(s, BLURB_MAX).ok, s);
  assert.ok(screen("Best to call ahead on Fridays.", BLURB_MAX).ok === false, "best is blocked in any sense (plan wording)");
});

// ---- photos -----------------------------------------------------------------------------------------------------
function crc32(b) { let c, crc = 0xffffffff; for (const x of b) { c = (crc ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
export function png(w = 120, h = 120, extra = []) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80); for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), ...extra,
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
function jpeg(w = 200, h = 150) {
  const seg = (m, data) => Buffer.concat([Buffer.from([0xff, m, (data.length + 2) >> 8, (data.length + 2) & 255]), data]);
  const sof = Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0]);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary")),
    seg(0xe1, Buffer.from("Exif\0\0GPSLatitude 41.9 Canon EOS serial 12345")), seg(0xfe, Buffer.from("comment: taken at home")),
    seg(0xdb, Buffer.alloc(65, 1)), seg(0xc0, sof), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]),
    Buffer.from([0xff, 0xd9])]));
}
function webp(w = 300, h = 300) {
  const c = (id, data) => { const b = Buffer.alloc(8); b.write(id, 0); b.writeUInt32LE(data.length, 4); return Buffer.concat([b, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x08 | 0x04; vp8x.writeUIntLE(w - 1, 4, 3); vp8x.writeUIntLE(h - 1, 7, 3);
  const body = Buffer.concat([Buffer.from("WEBP"), c("VP8X", vp8x), c("VP8 ", Buffer.alloc(20, 7)), c("EXIF", Buffer.from("GPS 41.9N")), c("XMP ", Buffer.from("<x:xmpmeta>creator</x:xmpmeta>"))]);
  const head = Buffer.alloc(8); head.write("RIFF", 0); head.writeUInt32LE(body.length, 4);
  return new Uint8Array(Buffer.concat([head, body]));
}
const has = (bytes, s) => Buffer.from(bytes).includes(Buffer.from(s));

test("photo: JPEG metadata (EXIF, comments) stripped, picture kept", () => {
  const r = checkPhoto(jpeg(), "image/jpeg");
  assert.equal(r.ok, true); assert.equal(r.type, "image/jpeg");
  assert.ok(!has(r.bytes, "GPS") && !has(r.bytes, "Canon") && !has(r.bytes, "taken at home"));
  assert.ok(has(r.bytes, "JFIF")); assert.deepEqual([r.width, r.height], [200, 150]);
  assert.deepEqual([...r.bytes.slice(-2)], [0xff, 0xd9]);
});
test("photo: PNG text and time chunks stripped", () => {
  const meta = [chunk("tEXt", Buffer.from("Author\0Ann at 12 Elm St")), chunk("eXIf", Buffer.from("GPS")), chunk("tIME", Buffer.alloc(7))];
  const r = checkPhoto(png(120, 120, meta), "image/png");
  assert.equal(r.ok, true); assert.ok(!has(r.bytes, "Elm St") && !has(r.bytes, "eXIf") && !has(r.bytes, "tIME"));
  assert.ok(has(r.bytes, "IDAT"));
});
test("photo: WebP EXIF and XMP stripped, flags and size fixed", () => {
  const r = checkPhoto(webp(), "image/webp");
  assert.equal(r.ok, true); assert.ok(!has(r.bytes, "GPS") && !has(r.bytes, "xmpmeta"));
  const b = Buffer.from(r.bytes); assert.equal(b.readUInt32LE(4), b.length - 8); assert.equal(b[20] & 0x0c, 0);
});
test("photo: wrong type, mismatched type, too big, too small refused", () => {
  assert.equal(checkPhoto(new Uint8Array(Buffer.from("GIF89a....")), "image/gif").error, "photo_type");
  assert.equal(checkPhoto(jpeg(), "image/png").error, "photo_type", "bytes must match the declared type");
  assert.equal(checkPhoto(new Uint8Array(Buffer.from("<svg onload=alert(1)>")), "image/png").error, "photo_type");
  assert.equal(checkPhoto(png(40, 40), "image/png").error, "photo_dimensions");
  assert.equal(checkPhoto(new Uint8Array(PHOTO_CAP + 1), "image/jpeg").error, "photo_too_large");
});

// ---- profile edits ----------------------------------------------------------------------------------------------
async function verified(w, npi = ANN, email) {
  return w.full(npi, email, ["ufe"]);
}

test("edit: only the holder of the NPI, only their own profile; fields checked and screened", async () => {
  const w = world();
  const u = await w.signIn();
  await w.idCheck(u);
  const r = await u.put("profile", { npi: GIL, blurbs: { ufe: "I perform UFE at Lakeside." } });
  assert.equal(r.status, 400, "npi is not an editable field");
  assert.equal((await u.put("profile", { blurbs: { ufe: "The best UFE" } })).status, 422);
  assert.equal((await u.put("profile", { booking_url: "javascript:alert(1)" })).status, 400);
  assert.equal((await u.put("profile", { booking_url: "http://lakesideir.example/book" })).status, 400, "https only");
  assert.equal((await u.put("profile", { insurances: ["Aetna", "Made Up Plan"] })).status, 400);
  assert.equal((await u.put("profile", { offices: [{ practice: "Lakeside IR", street: "1 Test Way", city: "Chicago", state: "IL", zip: "60611", phone: "312555010" }] })).status, 400);
  const ok = await u.put("profile", { blurbs: { ufe: "I perform UFE at Lakeside." }, insurances: ["Aetna", "Medicare"],
    insurance_other: "Most local plans", insurance_confirm: true, booking_url: "https://lakesideir.example/book",
    offices: [{ practice: "Lakeside IR", street: "1 Test Way", city: "Chicago", state: "IL", zip: "60611", phone: "3125550100" }] });
  assert.equal(ok.status, 200);
  const p = await w.backend.data.one("profiles", { npi: ANN });
  assert.equal(p.blurbs.ufe, "I perform UFE at Lakeside."); assert.equal(p.offices[0].phone, "3125550100");
  assert.equal((await w.backend.data.one("profiles", { npi: GIL })), null, "nobody else's profile touched");
  const g = await verified(w, GIL);
  await g.put("profile", { blurbs: { ufe: "Gil's own words." } });
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).blurbs.ufe, "I perform UFE at Lakeside.");
});

test("edits go live at once in the confirmed export", async () => {
  const w = world(), c = await verified(w);
  await c.put("profile", { blurbs: { ufe: "First words." } });
  assert.equal((await exportConfirmed(w.backend))[0].blurbs.ufe, "First words.");
});

test("contact changes email the login address", async () => {
  const w = world(), c = await verified(w);
  const n = w.outbox.length;
  await c.put("profile", { blurbs: { ufe: "No contact change." } });
  assert.equal(w.outbox.length, n);
  await c.put("profile", { booking_url: "https://lakesideir.example/book" });
  const m = w.outbox.at(-1);
  assert.equal(m.to, "ann@home.example"); assert.match(m.subject, /contact details changed/i); assert.match(m.text, /booking link/i);
});

test("every edit logged; undo restores; others cannot undo; a changed field must be undone newest first", async () => {
  const w = world(), c = await verified(w);
  await c.put("profile", { blurbs: { ufe: "One." } });
  w.clock.t += 1000;
  await c.put("profile", { blurbs: { ufe: "Two." } });
  const log = (await c.get("edits")).body.edits;
  const blurbEdits = log.filter((e) => e.field === "blurbs");
  assert.equal(blurbEdits.length, 2);
  const [first, second] = blurbEdits.sort((a, b) => (a.at < b.at ? -1 : 1));
  assert.equal((await c.post("undo", { edit_id: first.id })).status, 409, "newer edit on top");
  const g = await verified(w, GIL);
  assert.equal((await g.post("undo", { edit_id: second.id })).status, 404, "not your NPI");
  assert.equal((await c.post("undo", { edit_id: second.id })).status, 200);
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).blurbs.ufe, "One.");
  assert.equal((await c.post("undo", { edit_id: second.id })).status, 409, "already undone");
  assert.equal((await c.post("undo", { edit_id: first.id })).status, 200);
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).blurbs.ufe, undefined);
  const all = await w.backend.data.many("edits", { npi: ANN });
  assert.ok(all.length >= 6, "nothing deleted from the log");
  const att = all.find((e) => e.field === "attested");
  assert.equal((await c.post("undo", { edit_id: att.id })).status, 200, "an attestation can be withdrawn");
  assert.equal((await exportConfirmed(w.backend)).filter((x) => x.npi === ANN).length, 0);
});

test("photo upload: stored stripped, logged, undoable; type checked against bytes", async () => {
  const w = world(), c = await verified(w);
  const bad = await c.call("POST", "photo", jpeg(), { headers: { "Content-Type": "image/png" } });
  assert.equal(bad.status, 415);
  const r = await c.call("POST", "photo", jpeg(), { headers: { "Content-Type": "image/jpeg" } });
  assert.equal(r.status, 200);
  const key = (await w.backend.data.one("profiles", { npi: ANN })).photo_key;
  assert.match(key, /^1999000015\/[0-9a-f]{16}\.jpg$/);
  const stored = await w.backend.photos.get(key);
  assert.ok(!has(stored.bytes, "GPS"));
  const e = (await c.get("edits")).body.edits.find((x) => x.field === "photo");
  assert.equal((await c.post("undo", { edit_id: e.id })).status, 200);
  assert.equal((await w.backend.data.one("profiles", { npi: ANN })).photo_key, null);
});

test("export tool: confirmed.json plus the photo copied under its public name", async () => {
  const { writeConfirmed } = await import("./export-confirmed.mjs");
  const { mkdtempSync, readFileSync, readdirSync } = await import("node:fs");
  const os = await import("node:os"), path = await import("node:path");
  const w = world(), c = await verified(w);
  await c.call("POST", "photo", jpeg(), { headers: { "Content-Type": "image/jpeg" } });
  const dir = mkdtempSync(path.join(os.tmpdir(), "eo-")), out = path.join(dir, "confirmed.json");
  const list = await writeConfirmed(w.backend, out, path.join(dir, "photos"));
  assert.equal(list.length, 1);
  const files = readdirSync(path.join(dir, "photos"));
  assert.equal(files.length, 1); assert.match(files[0], /^1999000015-[0-9a-f]{16}\.jpg$/);
  assert.equal(JSON.parse(readFileSync(out, "utf8"))[0].npi, ANN);
});
