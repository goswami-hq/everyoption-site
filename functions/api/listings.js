// Cloudflare Pages Function: GET /api/listings?procedure=<key>. Job 25: the live overlay of doctor account changes
// (public fields only, 60-second cache, 2-second limit). Logic in lib/accounts/listings.mjs.
// Job platform-launch-0011: also starts the hidden-profile reminder sweep (lib/accounts/sweep.mjs), never awaited.
import { handlePublic } from "../../lib/accounts/listings.mjs";
import { reminderSweep } from "../../lib/accounts/sweep.mjs";

export async function onRequest({ request, env, waitUntil }) {
  try { reminderSweep(request, { ...env, backend: undefined, waitUntil }); } catch (_) { /* never blocks the overlay */ }
  return handlePublic(request, { ...env, backend: undefined, waitUntil });
}
