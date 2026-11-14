// Cloudflare Pages Function for /doctors/*. Job 27: a profile address is rendered by lib/directory.mjs; anything else
// (the search page and the A to Z pages are excluded in site/_routes.json) falls through to the static file.
import { handleDoctor } from "../../lib/directory.mjs";

export async function onRequest({ request, env, next, waitUntil }) {
  const r = await handleDoctor(request, { ...env, waitUntil });
  return r || next();
}
