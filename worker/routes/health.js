// ② API Gateway Layer — Health Check Routes
// GET /api/health, GET /api/v4/health

import { json } from '../utils/cors.js';

export function handleHealth(cors) {
  return json({
    status:    "operational",
    engine:    "v4.1",
    routes:    ["/api/verify", "/api/claude", "/api/analyze", "/api/cmc", "/api/v4/*"],
    timestamp: new Date().toISOString(),
  }, 200, cors);
}

export function handleV4Health(env, cors) {
  return json({
    status:  "operational",
    engine:  "v4.1",
    routes: {
      claude:  !!env.ANTHROPIC_API_KEY,
      openai:  !!env.OPENAI_API_KEY,
      grok:    !!env.XAI_API_KEY,
      deberta: !!env.HF_API_KEY,
    },
    timestamp: new Date().toISOString(),
  }, 200, cors);
}
