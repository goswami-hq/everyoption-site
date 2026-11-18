// Photo checks (plan, stage 2): JPEG, PNG or WebP only, judged by the bytes (the declared type must agree), at most
// 2 MB, 100 to 6000 px a side, and every metadata block (EXIF with GPS and camera serials, XMP, IPTC, comments, text
// and time chunks) stripped before anything is stored. Standard library only; no decoding, so no image parser runs.
export const PHOTO_CAP = 2 * 1024 * 1024;
const MIN = 100, MAX = 6000;

const fail = (error) => ({ ok: false, error });
const u16 = (b, i) => (b[i] << 8) | b[i + 1];
const u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const le24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const le32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

export function sniff(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => b[i] === x)) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

export function checkPhoto(bytes, declared) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > PHOTO_CAP) return fail("photo_too_large");
  const type = sniff(b);
  if (!type || type !== declared) return fail("photo_type");
  let r;
  try { r = type === "image/jpeg" ? jpeg(b) : type === "image/png" ? png(b) : webp(b); } catch (_) { return fail("photo_unreadable"); }
  if (!r) return fail("photo_unreadable");
  if (!(r.width >= MIN && r.height >= MIN && r.width <= MAX && r.height <= MAX)) return fail("photo_dimensions");
  return { ok: true, type, ext: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type], ...r };
}

// JPEG: keep SOI, APP0 (JFIF), APP14 (Adobe colour), tables, frame and scan; drop APP1-APP13, APP15 and COM.
function jpeg(b) {
  const out = [b.subarray(0, 2)];
  let i = 2, width = 0, height = 0;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xd9) { out.push(b.subarray(i, i + 2)); break; }
    if (m === 0xda) {                                             // scan up to the last EOI; anything after it is dropped
      let e = b.length - 2; while (e > i && !(b[e] === 0xff && b[e + 1] === 0xd9)) e--;
      if (e <= i) return null;
      out.push(b.subarray(i, e + 2)); break;
    }
    if (m >= 0xd0 && m <= 0xd7 || m === 0x01) { out.push(b.subarray(i, i + 2)); i += 2; continue; }
    const len = u16(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    const seg = b.subarray(i, i + 2 + len);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { height = u16(b, i + 5); width = u16(b, i + 7); }
    const meta = (m >= 0xe1 && m <= 0xef && m !== 0xee) || m === 0xfe;
    if (!meta) out.push(seg);
    i += 2 + len;
  }
  return { bytes: concat(out), width, height };
}

// PNG: drop text, time, EXIF and other ancillary chunks except colour and transparency ones.
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "pHYs", "bKGD"]);
function png(b) {
  const out = [b.subarray(0, 8)];
  let i = 8, width = 0, height = 0, end = false;
  while (i + 12 <= b.length) {
    const len = u32(b, i), type = String.fromCharCode(...b.subarray(i + 4, i + 8));
    if (i + 12 + len > b.length) return null;
    if (type === "IHDR") { width = u32(b, i + 8); height = u32(b, i + 12); }
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === "IEND") { end = true; break; }
  }
  return end ? { bytes: concat(out), width, height } : null;
}

// WebP: drop EXIF and XMP chunks, clear their flags in VP8X, fix the RIFF size.
function webp(b) {
  const out = [];
  let i = 12, width = 0, height = 0, size = 4;
  while (i + 8 <= b.length) {
    const id = String.fromCharCode(...b.subarray(i, i + 4)), len = le32(b, i + 4), pad = len % 2;
    if (i + 8 + len > b.length) return null;
    const c = b.slice(i, i + 8 + len + pad);
    if (id === "VP8X") { width = le24(b, i + 12) + 1; height = le24(b, i + 15) + 1; c[8] &= ~0x0c; }
    if (id === "VP8 " && !width) { width = (b[i + 14] | (b[i + 15] << 8)) & 0x3fff; height = (b[i + 16] | (b[i + 17] << 8)) & 0x3fff; }
    if (id === "VP8L" && !width) { const v = le32(b, i + 9); width = (v & 0x3fff) + 1; height = ((v >> 14) & 0x3fff) + 1; }
    if (id !== "EXIF" && id !== "XMP ") { out.push(c); size += c.length; }
    i += 8 + len + pad;
  }
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  head[4] = size & 255; head[5] = (size >> 8) & 255; head[6] = (size >> 16) & 255; head[7] = (size >>> 24) & 255;
  return { bytes: concat([head, ...out]), width, height };
}

function concat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8Array(n);
  let k = 0; for (const p of parts) { o.set(p, k); k += p.length; }
  return o;
}
