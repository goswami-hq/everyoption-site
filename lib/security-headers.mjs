// Job 30: security headers for every Function response that is not an HTML page (JSON answers, photos). site/_headers
// covers static files only; Pages Functions skip it (job 27 review). HTML profiles set their own (lib/directory.mjs).
export const API_SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
};
