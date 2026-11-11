// Cloudflare Pages Function for /hemorrhoids/doctors/ and everything under it (job platform-directory-0029; the pelvic one is job 0009; the fibroid one is job 42): the hub and the metro city pages,
// rendered on request by lib/cities.mjs (static list plus the live account overlay).
import { handleCity } from "../../../lib/cities.mjs";

export async function onRequest({ request, env, next, waitUntil }) {
  const r = await handleCity(request, { ...env, waitUntil });
  return r || next();
}
