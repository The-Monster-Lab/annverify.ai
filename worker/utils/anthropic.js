// ② API Gateway Layer — Anthropic API 공통 유틸리티
// verify.js / claude.js / v4/claude.js 중복 제거

// 비JSON 응답을 Anthropic 에러 형식 JSON Response로 래핑
async function _toJsonSafeResponse(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res;
  // Cloudflare 에러 페이지 등 비JSON 응답 → 안전한 JSON 에러로 변환
  let text = '';
  try { text = await res.text(); } catch (_) {}
  const safe = JSON.stringify({
    error: { type: 'upstream_error', message: `HTTP ${res.status}: ${text.slice(0, 300)}` }
  });
  return new Response(safe, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function callAnthropic(body, apiKey, extraHeaders = {}, timeoutMs = 0) {
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    ...extraHeaders,
  };

  const doFetch = (signal) =>
    fetch("https://gateway.ai.cloudflare.com/v1/2b10ac43a3fe8ddb0d93bd28f06338b2/ann-verify/anthropic/v1/messages", {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });

  // timeoutMs 지정 시 AbortController로 타임아웃 적용
  if (timeoutMs > 0) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let res = await doFetch(ctrl.signal);
      // 502 / 529 시 최대 2회 재시도 (간격 점진 증가)
      for (let i = 0; i < 2 && (res.status === 403 || res.status === 502 || res.status === 529); i++) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        res = await doFetch(ctrl.signal);
      }
      clearTimeout(tid);
      return _toJsonSafeResponse(res);
    } catch (err) {
      clearTimeout(tid);
      throw err; // AbortError 포함 — 호출부 catch로 전달
    }
  }

  let res = await doFetch();

  // 502 / 529 시 최대 2회 재시도
  for (let i = 0; i < 2 && (res.status === 403 || res.status === 502 || res.status === 529); i++) {
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    res = await doFetch();
  }

  return _toJsonSafeResponse(res);
}
