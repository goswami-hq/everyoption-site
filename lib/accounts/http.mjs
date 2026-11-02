// HTTP layer for /api/account/*: cookies, origin and content-type checks, body caps, then lib/accounts/service.mjs.
// With no backend connected (env.backend missing and backendFrom(env) null) every route answers 503 not_open and
// stores nothing; that is the state of the dev site until he says connect.
import { Fail, json } from "./util.mjs";
import { makeService, SESSION_HOURS } from "./service.mjs";
import { backendFrom } from "./backend.mjs";

const COOKIE = "eo_session";
const DOX_COOKIE = "eo_dox_state";
const JSON_MAX = 16 * 1024;
const PHOTO_MAX = 5 * 1024 * 1024;     // read cap; lib/accounts/image.mjs sets the stored cap

function cookies(req) {
  const out = {};
  for (const part of (req.headers.get("Cookie") || "").split(";")) {
    const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const sessionCookie = (v, maxAge) =>
  `${COOKIE}=${v}; Path=/api/account; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function readJSON(req) {
  if (!/^application\/json\b/i.test(req.headers.get("Content-Type") || "")) throw new Fail(415, "json_only");
  const raw = await req.text();
  if (raw.length > JSON_MAX) throw new Fail(413, "too_large");
  try { const b = JSON.parse(raw || "{}"); if (b && typeof b === "object" && !Array.isArray(b)) return b; } catch (_) {}
  throw new Fail(400, "bad_json");
}

async function readBytes(req, max) {
  const len = +(req.headers.get("Content-Length") || 0);
  if (len > max) throw new Fail(413, "too_large");
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > max) throw new Fail(413, "too_large");
  return buf;
}

export async function handle(request, env = {}) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/account\/?/, "").replace(/\/$/, "");
  const backend = env.backend || backendFrom(env);
  if (!backend) return json(503, { error: "not_open", message: "Accounts are not open yet." });
  const origin = env.origin || url.origin;
  const svc = makeService(backend, { ...env, origin });
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ctx = { ip };
  const m = request.method;
  try {
    if (m !== "GET" && m !== "HEAD" && route !== "identity/result") {
      const o = request.headers.get("Origin");
      if (!o || (o !== origin && o !== url.origin)) throw new Fail(403, "bad_origin");
    }
    const c = cookies(request);
    const who = async () => { const a = await svc.session(c[COOKIE]); if (!a) throw new Fail(401, "signed_out"); return a; };

    if (m === "GET" && route === "status") return json(200, await svc.status());
    if (m === "POST" && route === "signup") return json(202, await svc.signup(await readJSON(request), ctx));
    if (m === "POST" && route === "login") return json(202, await svc.login(await readJSON(request), ctx));
    if (m === "POST" && route === "link") {
      const r = await svc.useLink(await readJSON(request), ctx);
      if (!r.session) return json(200, r);
      return json(200, { ok: true }, { "Set-Cookie": sessionCookie(r.session, SESSION_HOURS * 3600) });
    }
    if (m === "POST" && route === "logout") {
      await readJSON(request);
      await svc.logout(c[COOKIE]);
      return json(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (m === "GET" && route === "me") return json(200, await svc.me(await who()));
    if (m === "POST" && route === "check/email") { const a = await who(); return json(202, await svc.checkEmail(a, await readJSON(request))); }
    if (m === "POST" && route === "check/identity") { const a = await who(); await readJSON(request); return json(200, await svc.checkIdentity(a)); }
    if (m === "POST" && route === "identity/result") return json(200, await svc.identityResult(await backend.identity.parseResult(request, env)));
    if (m === "POST" && route === "attest") { const a = await who(); return json(200, await svc.attest(a, await readJSON(request))); }

    // Stage 2
    if (m === "PUT" && route === "profile") { const a = await who(); return json(200, await svc.editProfile(a, await readJSON(request))); }
    if (m === "POST" && route === "photo") {
      const a = await who();
      const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Fail(415, "photo_type");
      return json(200, await svc.uploadPhoto(a, await readBytes(request, PHOTO_MAX), type));
    }
    if (m === "GET" && route === "edits") return json(200, await svc.edits(await who()));
    if (m === "POST" && route === "undo") { const a = await who(); return json(200, await svc.undo(a, await readJSON(request))); }

    // Stage 3: Sign in with Doximity, only when its switch is on.
    if (route.startsWith("doximity/")) {
      if (!backend.doximity) throw new Fail(404, "doximity_off");
      if (m === "GET" && route === "doximity/start") {
        const r = await svc.doximityStart();
        return new Response(null, { status: 302, headers: { Location: r.url, "Cache-Control": "no-store",
          "Set-Cookie": `${DOX_COOKIE}=${r.state}; Path=/api/account/doximity; HttpOnly; Secure; SameSite=Lax; Max-Age=600` } });
      }
      if (m === "GET" && route === "doximity/callback") {
        // A cross-site redirect: the Strict session cookie is not sent here, so linking finishes on the account page.
        const r = await svc.doximityCallback({ code: url.searchParams.get("code"), state: url.searchParams.get("state"),
          cookieState: c[DOX_COOKIE] });
        const h = new Headers({ Location: `/account/#doximity=${r.result}`, "Cache-Control": "no-store" });
        h.append("Set-Cookie", `${DOX_COOKIE}=; Path=/api/account/doximity; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
        if (r.session) h.append("Set-Cookie", sessionCookie(r.session, SESSION_HOURS * 3600));
        return new Response(null, { status: 302, headers: h });
      }
      if (m === "POST" && route === "doximity/link") { const a = await who(); return json(200, await svc.doximityLink(a, await readJSON(request))); }
    }
    return json(404, { error: "not_found" });
  } catch (e) {
    if (e instanceof Fail) return json(e.status, { error: e.code, ...e.extra });
    console.error("accounts", route, e && e.message ? e.message.slice(0, 200) : String(e));
    return json(500, { error: "server" });
  }
}
