// ③ ML Core Layer — v4 Partner News Route
// Pipeline: RSS Fetch → Dedup by URL → Firestore partnerNews 저장
//
// Endpoints:
//   GET  /api/v4/partner/feed    — Firestore partnerNews 조회 (프론트엔드 서빙)
//   POST /api/v4/partner/refresh — 관리자 수동 RSS 갱신 트리거
// Cron: 0 * * * * (매시간, news 파이프라인과 동시 실행)

import { json }                                       from '../../utils/cors.js';
import { getAccessToken, FirestoreClient }            from '../../utils/firestore.js';

const PROJECT_ID = 'annverify-8d680';

const PARTNER_SOURCES = [
  { id: 'reuters',   name: 'Reuters',     url: 'https://feeds.reuters.com/reuters/topNews',           color: '#FF8000', icon: 'R'   },
  { id: 'yonhap',    name: 'Yonhap News', url: 'https://www.yonhapnewstv.co.kr/browse/feed/',        color: '#005BAA', icon: 'Y'   },
  { id: 'ap',        name: 'AP News',     url: 'https://feeds.apnews.com/rss/apf-topnews',           color: '#CC0000', icon: 'AP'  },
  { id: 'afp',       name: 'AFP',         url: 'https://www.afp.com/en/afp-news-agency-en/rss',      color: '#003A70', icon: 'AFP' },
  { id: 'bloomberg', name: 'Bloomberg',   url: 'https://feeds.bloomberg.com/markets/news.rss',       color: '#1D1D1B', icon: 'B'   },
  { id: 'bbc',       name: 'BBC News',    url: 'https://feeds.bbci.co.uk/news/rss.xml',             color: '#BB1919', icon: 'BBC' },
  { id: 'cnn',       name: 'CNN',         url: 'http://rss.cnn.com/rss/edition.rss',                color: '#CC0000', icon: 'CNN' },
];

// ── RSS 파싱 유틸 ─────────────────────────────────────────────────────

function extractXML(tag, xml) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i');
  const m  = re.exec(xml);
  return (m ? (m[1] || m[2] || '') : '').trim();
}

function extractThumb(itemXml) {
  let m = /media:(?:content|thumbnail)[^>]+url="([^"]+)"/.exec(itemXml)
       || /<enclosure[^>]+type="image[^"]*"[^>]+url="([^"]+)"/.exec(itemXml)
       || /<enclosure[^>]+url="([^"]+)"[^>]+type="image[^"]*"/.exec(itemXml);
  if (m) return m[1];
  const desc = extractXML('description', itemXml);
  m = /<img[^>]+src="([^"]+)"/.exec(desc);
  return (m && m[1].startsWith('http')) ? m[1] : null;
}

function parseRSS(xml, source, limit = 2) {
  const items = [];
  const re    = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < limit) {
    const item    = m[1];
    const title   = extractXML('title', item)
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'");
    const link    = extractXML('link', item) || extractXML('guid', item);
    const desc    = extractXML('description', item)
      .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0, 250);
    const pubDate = extractXML('pubDate', item) || extractXML('dc:date', item) || extractXML('published', item);
    if (title && link && link.startsWith('http')) {
      items.push({
        partnerId: source.id,
        source:    source.name,
        color:     source.color,
        icon:      source.icon,
        title:     title.slice(0, 200),
        url:       link.trim(),
        summary:   desc,
        thumb:     extractThumb(item) || null,
        pubDate:   pubDate || null,
      });
    }
  }
  return items;
}

async function fetchPartnerFeed(source) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANNVerify/2.0; +https://annverify.ai)' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { articles: parseRSS(await res.text(), source, 2), error: null };
  } catch (err) {
    clearTimeout(tid);
    return { articles: [], error: err.message };
  }
}

// ── Firestore 클라이언트 ──────────────────────────────────────────────

async function getDb(env) {
  const saJson = env.FIREBASE_SA_JSON;
  if (!saJson) { console.warn('[Partner] FIREBASE_SA_JSON not set'); return null; }
  const token = await getAccessToken(saJson);
  if (!token) { console.warn('[Partner] Token failed'); return null; }
  return new FirestoreClient(PROJECT_ID, token);
}

// URL → 문서 ID용 단순 해시
function urlHash(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(h, 33) ^ url.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

// ── 파이프라인: RSS 수집 → Firestore partnerNews 저장 ────────────────
export async function runPartnerPipeline(env) {
  console.log('[Partner] Pipeline start');

  const db = await getDb(env);
  if (!db) return { status: 'error', reason: 'db_unavailable' };

  const settled = await Promise.allSettled(PARTNER_SOURCES.map(s => fetchPartnerFeed(s)));

  const allArticles = [];
  const errors      = [];
  settled.forEach((r, i) => {
    const src = PARTNER_SOURCES[i];
    if (r.status === 'fulfilled') {
      if (r.value.articles.length) allArticles.push(...r.value.articles);
      else if (r.value.error)      errors.push({ source: src.name, error: r.value.error });
    } else {
      errors.push({ source: src.name, error: r.reason?.message || 'Unknown' });
    }
  });

  if (!allArticles.length) {
    console.warn('[Partner] No articles fetched');
    return { status: 'skipped', reason: 'no_articles', errors };
  }

  // URL 해시를 docId로 사용 → 동일 기사 중복 저장 방지
  const fetchedAt = new Date().toISOString();
  const date      = fetchedAt.slice(0, 10);
  const docsMap   = {};

  for (const a of allArticles) {
    const docId = `partner_${urlHash(a.url)}`;
    docsMap[docId] = {
      ...a,
      fetchedAt,
      date,
      verdict_class: 'unverified',
      _engine:       'partner_rss',
    };
  }

  const stored = await db.batchSet('partnerNews', docsMap);
  console.log(`[Partner] Stored ${stored}/${allArticles.length} articles`);
  return { status: 'published', stored, total: allArticles.length, errors };
}

// ── HTTP: GET /api/v4/partner/feed — Firestore partnerNews 조회 ───────
export async function handleV4PartnerFeed(request, env, cors) {
  const url   = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '60'), 100);

  const db = await getDb(env);
  if (!db) return json({ error: 'Firestore not configured', articles: [], partners: [] }, 500, cors);

  const articles = await db.query('partnerNews', [], 'fetchedAt', limit);

  // Firestore가 비어 있으면 실시간 RSS 폴백 (초기 배포 직후 대비)
  if (articles.length === 0) {
    console.warn('[Partner] Firestore empty, falling back to live RSS');
    const settled = await Promise.allSettled(PARTNER_SOURCES.map(s => fetchPartnerFeed(s)));
    const live = [];
    settled.forEach(r => {
      if (r.status === 'fulfilled') live.push(...r.value.articles);
    });
    const partners = PARTNER_SOURCES.map(s => ({ id: s.id, name: s.name, color: s.color, icon: s.icon }));
    return json({ articles: live, partners, count: live.length }, 200, cors);
  }

  const partners = PARTNER_SOURCES.map(s => ({ id: s.id, name: s.name, color: s.color, icon: s.icon }));
  return json({ articles, partners, count: articles.length }, 200, cors);
}

// ── HTTP: POST /api/v4/partner/refresh — 수동 RSS 갱신 트리거 ─────────
export async function handleV4PartnerRefresh(request, env, cors) {
  const result = await runPartnerPipeline(env);
  return json(result, 200, cors);
}
