// Written by tools/build.py from content/conditions.json (tools/registry.py). Edit that file, not this one.
// Cloudflare Pages Function for /fibroids/doctors/ and everything under it: the hub and the metro city pages,
// rendered on request by lib/cities.mjs (static list plus the live account overlay).
import { handleCity } from "../../../lib/cities.mjs";

export async function onRequest({ request, env, next, waitUntil }) {
  const r = await handleCity(request, { ...env, waitUntil });
  return r || next();
}
