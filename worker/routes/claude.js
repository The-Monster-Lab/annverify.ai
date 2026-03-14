// ② API Gateway Layer — Claude / Analyze Routes
// POST /api/claude  — Anthropic 직접 프록시 (v1~v3)
// POST /api/analyze — ONPROOF Listing 분석

import { json }           from '../utils/cors.js';
import { callAnthropic } from '../utils/anthropic.js';

export async function handleClaude(request, env, cors) {
  const body = await request.json();
  if (!body.messages || !Array.isArray(body.messages))
    return json({ error: "Invalid request: messages array required" }, 400, cors);

  const anthropicBody = {
    model:      body.model      || "claude-sonnet-4-20250514",
    max_tokens: Math.min(body.max_tokens || 2500, 4000),
    messages:   body.messages,
  };
  if (body.system) anthropicBody.system = body.system;
  if (body.tools)  anthropicBody.tools  = body.tools;

  const res  = await callAnthropic(anthropicBody, env.ANTHROPIC_API_KEY);
  const data = await res.json();
  return json(data, res.status, cors);
}

export async function handleAnalyze(request, env, cors) {
  const body = await request.json();
  const anthropicBody = {
    model:      body.model      || "claude-sonnet-4-20250514",
    max_tokens: Math.min(body.max_tokens || 4000, 6000),
    messages:   body.messages   || [],
  };
  if (body.system) anthropicBody.system = body.system;

  const res  = await callAnthropic(anthropicBody, env.ANTHROPIC_API_KEY);
  const data = await res.json();
  return json(data, res.status, cors);
}
