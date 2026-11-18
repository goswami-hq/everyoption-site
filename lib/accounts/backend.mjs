// Picks the backend from configuration. Connecting is configuration only: set the variables below in the Pages
// project (secrets as encrypted variables, never in the repo) and the same code runs against Supabase and the vendors.
// Missing anything, or ACCOUNTS_OPEN not "yes": null, so every account route answers "not open yet" and stores nothing.
import { supabaseData, supabasePhotos, supabaseRadiologists } from "./supabase.mjs";
import { resendEmail, stripeIdentity, nppesRegistry, assetListings, doximityOAuth, censusGeocoder, telegramAlert } from "./vendors.mjs";

export const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "EMAIL_FROM"];
// Optional (his decision 2026-11-02, Stripe later): without both, the ID route is off and invitations still give full access.
export const STRIPE = ["STRIPE_SECRET_KEY", "STRIPE_IDENTITY_WEBHOOK_SECRET"];
export const DOXIMITY = ["DOXIMITY_CLIENT_ID", "DOXIMITY_CLIENT_SECRET", "DOXIMITY_AUTHORIZE_URL", "DOXIMITY_TOKEN_URL",
  "DOXIMITY_PROFILE_URL", "DOXIMITY_REDIRECT_URI"];

export function missing(env = {}) {
  const m = REQUIRED.filter((k) => !env[k]);
  if (env.ACCOUNTS_OPEN !== "yes") m.unshift("ACCOUNTS_OPEN=yes");
  if (!env.ASSETS) m.push("ASSETS (Pages binding, automatic)");
  return m;
}

export function backendFrom(env = {}) {
  if (missing(env).length) return null;
  const doxOn = env.DOXIMITY_ON === "yes" && DOXIMITY.every((k) => env[k]);
  return {
    kind: "supabase",
    data: supabaseData(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    photos: supabasePhotos(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    email: resendEmail(env.RESEND_API_KEY, env.EMAIL_FROM),
    identity: STRIPE.every((k) => env[k]) ? stripeIdentity(env.STRIPE_SECRET_KEY, env.STRIPE_IDENTITY_WEBHOOK_SECRET) : null,
    nppes: nppesRegistry(),
    listings: assetListings(env.ASSETS),
    radiologists: supabaseRadiologists(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    doximity: doxOn ? doximityOAuth(env) : null,
    // Job 16: the Census geocoder only once he connects accounts and sets GEOCODER_ON=yes; otherwise offices use ZIP centers.
    geocoder: env.GEOCODER_ON === "yes" ? censusGeocoder() : null,
    // Job 25: contact-change alerts to the Every Option topic; without these two variables they are recorded only.
    alert: env.ALERT_TELEGRAM_TOKEN && env.ALERT_TELEGRAM_CHAT
      ? telegramAlert(env.ALERT_TELEGRAM_TOKEN, env.ALERT_TELEGRAM_CHAT, env.ALERT_TELEGRAM_TOPIC) : null,
  };
}
