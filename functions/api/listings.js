// Cloudflare Pages Function: GET /api/listings?procedure=<key>. Job 25: the live overlay of doctor account changes
// (public fields only, 60-second cache, 2-second limit). Logic in lib/accounts/listings.mjs.
import { handlePublic } from "../../lib/accounts/listings.mjs";

export async function onRequest({ request, env, waitUntil }) {
  return handlePublic(request, { ...env, backend: undefined, waitUntil });
}
