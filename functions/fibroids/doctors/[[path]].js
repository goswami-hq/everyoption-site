// Cloudflare Pages Function for /fibroids/doctors/ and everything under it. Job 42: the hub and the metro city pages,
// rendered on request by lib/cities.mjs (static list plus the live account overlay).
import { handleCity } from "../../../lib/cities.mjs";

export async function onRequest({ request, env, next, waitUntil }) {
  const r = await handleCity(request, { ...env, waitUntil });
  return r || next();
}
