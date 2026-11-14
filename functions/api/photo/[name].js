// Cloudflare Pages Function: GET /api/photo/<npi>-<id>.<ext>. Job 25: a full-access doctor's current photo only;
// the storage bucket stays private. Logic in lib/accounts/listings.mjs.
import { handlePublic } from "../../../lib/accounts/listings.mjs";

export async function onRequest({ request, env, waitUntil }) {
  return handlePublic(request, { ...env, backend: undefined, waitUntil });
}
