// Job platform-launch-0011: the 6-month "still hidden" reminder needs a sender that runs on a schedule. The site has none
// (the daily cleanup, eo_cleanup(), is a database job and cannot send email), so the sweep rides on the site's own
// traffic: at most once every 10 minutes per isolate it asks the database (eo_hit, one per hour across all isolates)
// whether a sweep is due, then sends what is due through the site's account email sender (svc.hiddenReminders()).
// Never holds up the request it rides on; a failure waits for the next sweep.
import { backendFrom } from "./backend.mjs";
import { makeService, REMIND_SWEEP_SEC } from "./service.mjs";

const ISOLATE_MS = 10 * 60000;
let lastTry = 0;
export function resetSweep() { lastTry = 0; }

export function reminderSweep(request, env = {}) {
  const now = (env.now || Date.now)();
  if (now - lastTry < ISOLATE_MS) return null;
  lastTry = now;
  const backend = env.backend || backendFrom(env);
  if (!backend || !backend.email) return null;
  const job = (async () => {
    if (!(await backend.data.hit("hidden_reminder_sweep", REMIND_SWEEP_SEC, 1, now))) return null;
    const svc = makeService(backend, { ...env, origin: env.origin || new URL(request.url).origin });
    return svc.hiddenReminders();
  })().catch((e) => { console.error("reminders", e && e.message ? e.message.slice(0, 80) : "error"); return null; });
  if (env.waitUntil) env.waitUntil(job);
  return job;
}
