// Cloudflare Pages Function: every /api/account/* request. Logic in lib/accounts/ (not served).
// Until the variables in lib/accounts/backend.mjs are set, every route answers 503 "not open yet" and stores nothing.
import { handle } from "../../../lib/accounts/http.mjs";

export async function onRequest({ request, env }) {
  return handle(request, { ...env, backend: undefined });
}
