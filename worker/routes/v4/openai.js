// ③ ML Core Layer — v4 OpenAI Route
// POST /api/v4/openai — L4 Adversarial 검증 (GPT-4o)
// Fallback: /api/v4/claude 로 자동 전환

import { json } from '../../utils/cors.js';

const ALLOWED_OPENAI = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4"];

export async function handleV4OpenAI(request, env, cors) {
  if (!env.OPENAI_API_KEY)
    return json({ error: "OPENAI_API_KEY not configured", fallback: true }, 503, cors);

  const body = await request.json();
  if (!body.messages || !Array.isArray(body.messages))
    return json({ error: "messages array required" }, 400, cors);

  const model = ALLOWED_OPENAI.includes(body.model) ? body.model : "gpt-4o";

  const openaiBody = {
    model,
    max_tokens:      Math.min(body.max_tokens || 2000, 4000),
    messages:        body.messages,
    temperature:     body.temperature ?? 0.3,
    response_format: { type: "json_object" },
  };

  const res  = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(openaiBody),
  });
  const data    = await res.json();
  const content = data?.choices?.[0]?.message?.content || "";

  return json({
    _provider: "openai",
    _model:    data?.model,
    content:   [{ type: "text", text: content }],
    usage:     data?.usage,
  }, res.status, cors);
}
