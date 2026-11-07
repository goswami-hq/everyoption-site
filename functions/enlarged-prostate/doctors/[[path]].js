// Cloudflare Pages Function for /enlarged-prostate/doctors/ and everything under it (S3, job platform-main-0024; the fibroid one is job 42): the hub and the metro city pages,
// rendered on request by lib/cities.mjs (static list plus the live account overlay).
import { handleCity } from "../../../lib/cities.mjs";

export async function onRequest({ request, env, next, waitUntil }) {
  const r = await handleCity(request, { ...env, waitUntil });
  return r || next();
}
