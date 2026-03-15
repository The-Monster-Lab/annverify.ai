// ② API Gateway Layer — CORS Utility
// Cloudflare Worker CORS 헬퍼

export const ALLOWED_ORIGINS = [
  // Production
  "https://annverify.ai",
  "https://www.annverify.ai",
  "https://annglobal.us",
  "https://www.annglobal.us",
  "https://check.ann.io",
  "https://www.check.ann.io",
  "https://onproof.io",
  "https://www.onproof.io",
  // Development
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

export function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
}

export function isOriginAllowed(origin) {
  if (!origin || origin === "") return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // 모든 localhost / 127.0.0.1 개발 환경 허용
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

export function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...(cors || {}), "Content-Type": "application/json" },
  });
}
