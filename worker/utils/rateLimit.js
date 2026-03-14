// ② API Gateway Layer — Rate Limit Utility

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX    = 30;
const rateLimitMap      = new Map();

export function checkRateLimit(ip) {
  const now    = Date.now();

  // 만료된 엔트리 정리 — 맵 무한 증가 방지
  for (const [key, rec] of rateLimitMap) {
    if (now - rec.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
  }

  const record = rateLimitMap.get(ip);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count++;
  return true;
}
