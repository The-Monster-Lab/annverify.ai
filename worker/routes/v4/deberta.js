// ③ ML Core Layer — v4 DeBERTa Route
// POST /api/v4/deberta — L5 Trust Score (HuggingFace DeBERTa-v3 NLI)
// Fallback: /api/v4/claude 로 자동 전환

import { json } from '../../utils/cors.js';

const HF_MODEL = "cross-encoder/nli-deberta-v3-small";

export async function handleV4DeBERTa(request, env, cors) {
  if (!env.HF_API_KEY)
    return json({ error: "HF_API_KEY not configured", fallback: true }, 503, cors);

  const body = await request.json();
  if (!body.pairs || !Array.isArray(body.pairs))
    return json({ error: "pairs array required" }, 400, cors);

  const results = [];

  for (const pair of body.pairs.slice(0, 20)) {
    try {
      const hfRes = await fetch(
        `https://api-inference.huggingface.co/models/${HF_MODEL}`,
        {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${env.HF_API_KEY}`,
          },
          body: JSON.stringify({
            inputs: { text: pair.premise, text_pair: pair.hypothesis },
          }),
        }
      );
      const hfData = await hfRes.json();
      const scores = {};
      if (Array.isArray(hfData)) {
        hfData.forEach(item => {
          scores[item.label?.toUpperCase()] = item.score;
        });
      }
      const hasScores = "ENTAILMENT" in scores || "CONTRADICTION" in scores;
      if (!hasScores) {
        results.push({
          error:     hfData?.error || "no NLI scores returned",
          fallback:  true,
          premise:   pair.premise?.slice(0, 50),
          hypothesis: pair.hypothesis?.slice(0, 50),
        });
      } else {
        results.push({
          premise:       pair.premise?.slice(0, 100),
          hypothesis:    pair.hypothesis?.slice(0, 100),
          entailment:    scores["ENTAILMENT"]    || 0,
          neutral:       scores["NEUTRAL"]       || 0,
          contradiction: scores["CONTRADICTION"] || 0,
          nliScore: Math.round(
            ((scores["ENTAILMENT"] || 0) - (scores["CONTRADICTION"] || 0) * 0.8 + 1) / 2 * 100
          ),
        });
      }
    } catch (e) {
      results.push({ error: e.message, premise: pair.premise?.slice(0, 50) });
    }
  }

  return json({ _provider: "deberta", model: HF_MODEL, results }, 200, cors);
}
