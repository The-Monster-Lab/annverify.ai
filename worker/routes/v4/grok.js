// ③ ML Core Layer — v4 Grok Route
// POST /api/v4/grok — L3 Evidence 수집 (xAI Grok 3)
// Fallback: /api/v4/claude 로 자동 전환

import { json } from '../../utils/cors.js';

export async function handleV4Grok(request, env, cors) {
  if (!env.XAI_API_KEY)
    return json({ error: "XAI_API_KEY not configured", fallback: true }, 503, cors);

  const body = await request.json();
  if (!body.messages || !Array.isArray(body.messages))
    return json({ error: "messages array required" }, 400, cors);

  const grokBody = {
    model:             body.model || "grok-3-latest",
    max_tokens:        Math.min(body.max_tokens || 3000, 6000),
    messages:          body.messages,
    temperature:       body.temperature ?? 0.1,
    search_parameters: { mode: "on" },
  };

  const res  = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${env.XAI_API_KEY}`,
    },
    body: JSON.stringify(grokBody),
  });
  const data    = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";

  return json({
    _provider: "grok",
    _model:    data?.model,
    content:   [{ type: "text", text: content }],
    usage:     data?.usage,
  }, res.status, cors);
}
