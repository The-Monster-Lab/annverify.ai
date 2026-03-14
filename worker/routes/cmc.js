// ② API Gateway Layer — CoinMarketCap Proxy
// GET /api/cmc?symbol=BTC

import { json } from '../utils/cors.js';

export async function handleCMC(url, env, cors) {
  const symbol = url.searchParams.get("symbol");
  if (!symbol) return json({ error: "symbol parameter required" }, 400, cors);

  try {
    const cmcRes = await fetch(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(symbol.toUpperCase())}&convert=USD`,
      { headers: { "X-CMC_PRO_API_KEY": env.CMC_API_KEY || "", "Accept": "application/json" } }
    );
    if (!cmcRes.ok) return json({ error: "CMC API error", status: cmcRes.status }, cmcRes.status, cors);

    const cmcData = await cmcRes.json();
    const symKey  = symbol.toUpperCase();
    const td      = cmcData?.data?.[symKey];
    if (!td) return json({ rank: null, listed: false }, 200, cors);

    const q = td.quote?.USD || {};
    return json({
      id: td.id, name: td.name, symbol: td.symbol, rank: td.cmc_rank, listed: true,
      price: q.price, volume_24h: q.volume_24h, market_cap: q.market_cap,
      percent_change_24h: q.percent_change_24h, percent_change_7d: q.percent_change_7d,
      circulating_supply: td.circulating_supply, total_supply: td.total_supply,
      max_supply: td.max_supply, num_market_pairs: td.num_market_pairs,
    }, 200, cors);
  } catch (err) {
    return json({ error: "CMC fetch failed", detail: err.message }, 502, cors);
  }
}
