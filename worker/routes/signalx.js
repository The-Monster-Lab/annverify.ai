// SignalX → ANN 검증 연동 라우트
// POST /api/signalx/check
//
// Request:
//   { "query": "사용자 문장 텍스트" }
//
// Response:
//   { "score": 85, "grade": "A", "verdict": "VERIFIED", "summary": "..." }

import { json }          from '../utils/cors.js';
import { callAnthropic } from '../utils/anthropic.js';

const GRADE_BANDS = [
  { min: 93, grade: 'A+' },
  { min: 82, grade: 'A'  },
  { min: 74, grade: 'B+' },
  { min: 64, grade: 'B'  },
  { min: 48, grade: 'C'  },
  { min: 30, grade: 'D'  },
  { min:  0, grade: 'F'  },
];

function scoreToGrade(score) {
  for (const band of GRADE_BANDS) {
    if (score >= band.min) return band.grade;
  }
  return 'F';
}

function detectGate(text) {
  const t = (text || '').toLowerCase();
  if (/microchip|chemtrail|mind.?control|faked moon|hoax|bleach cure|flat earth|autism.{0,10}vaccine|vaccine.{0,10}autism|5g cause|crisis actor|deep state|plandemic/.test(t))
    return '\n⚠️ FALSE GUARD ACTIVE: Default to FALSE or MISLEADING unless overwhelming evidence.';

  let s = 0;
  if (/\b(as of|currently|in \d{4}|today|recent|latest|still|now)\b/.test(t))                s += 35;
  if (/\b(always|never|all|every|entirely|completely|only|solely|100%)\b/.test(t))             s += 30;
  if (/\b(causes?|leads? to|results? in|increases?|decreases?|linked to)\b/.test(t))          s += 20;
  if (/\b(health|diet|nutrition|mental health|social media|climate|economy|ai|job)\b/.test(t)) s += 15;
  if (s >= 35)
    return '\n⚡ PARTIAL SIGNAL ACTIVE: Temporal/absolute language detected. Carefully evaluate PARTIALLY_TRUE.';

  return '';
}

export async function handleSignalXCheck(request, env, cors) {
  let body;
  try { body = await request.json(); } catch (_) {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }

  const query = (body.query || '').trim();
  if (!query)
    return json({ error: '"query" field is required' }, 400, cors);

  const today    = new Date().toISOString().slice(0, 10);
  const gateNote = detectGate(query);

  const prompt = `You are ANN Verify — a research-grade AI fact-checking engine.
TODAY'S DATE: ${today}.

CLAIM: "${query}"${gateNote}

VERDICT CLASSES: VERIFIED | LIKELY_TRUE | PARTIALLY_TRUE | UNVERIFIED | MISLEADING | OUTDATED | FALSE | OPINION
SCORING: A+(93-100) A(82-92) B+(74-81) B(64-73) C(48-63) D(30-47) F(0-29)

Respond ONLY with valid JSON (no markdown):
{"overall_score":85,"overall_verdict":"VERIFIED","executive_summary":"2-3 sentence summary."}`;

  let res, data;
  try {
    res  = await callAnthropic({
      model:       'claude-sonnet-4-6',
      max_tokens:  512,
      temperature: 0,
      messages:    [{ role: 'user', content: prompt }],
    }, env.ANTHROPIC_API_KEY, {}, 25000);
    data = await res.json();
  } catch (err) {
    return json({ error: 'Anthropic fetch failed', detail: err.message }, 502, cors);
  }

  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data);
    return json({ error: msg, status: res.status }, res.status, cors);
  }

  // content 배열에서 text 블록 추출
  const textBlock = Array.isArray(data.content) && data.content.find(b => b.type === 'text');
  const rawText   = textBlock?.text || '';

  let parsed;
  try {
    parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
  } catch (_) {
    return json({ error: 'Failed to parse engine response', raw: rawText }, 502, cors);
  }

  const score   = typeof parsed.overall_score === 'number' ? parsed.overall_score : 0;
  const verdict = parsed.overall_verdict || 'UNVERIFIED';
  const summary = parsed.executive_summary || '';

  return json({
    score,
    grade:   scoreToGrade(score),
    verdict,
    summary,
  }, 200, cors);
}
