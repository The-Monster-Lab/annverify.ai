// ③ ML Core Layer — v4 News Route
// GET /api/v4/news/feed — 20개 RSS 피드 파싱 + Claude 배치 스코어링 (15분 캐시)

import { json }           from '../../utils/cors.js';
import { callAnthropic } from '../../utils/anthropic.js';

const RSS_SOURCES = [
  { name: 'BBC News',        url: 'https://feeds.bbci.co.uk/news/rss.xml',                    cat: 'World'   },
  { name: 'Reuters',         url: 'https://feeds.reuters.com/reuters/topNews',                  cat: 'World'   },
  { name: 'AP News',         url: 'https://feeds.apnews.com/rss/apf-topnews',                  cat: 'World'   },
  { name: 'NPR News',        url: 'https://feeds.npr.org/1001/rss.xml',                         cat: 'World'   },
  { name: 'The Guardian',    url: 'https://www.theguardian.com/world/rss',                      cat: 'World'   },
  { name: 'Al Jazeera',      url: 'https://www.aljazeera.com/xml/rss/all.xml',                  cat: 'World'   },
  { name: 'CNN',             url: 'http://rss.cnn.com/rss/edition.rss',                         cat: 'World'   },
  { name: 'ABC News',        url: 'https://feeds.abcnews.com/abcnews/topstories',               cat: 'World'   },
  { name: 'Time',            url: 'https://time.com/feed/',                                     cat: 'World'   },
  { name: 'NYT',             url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',  cat: 'World'   },
  { name: 'TechCrunch',      url: 'https://techcrunch.com/feed/',                               cat: 'Tech'    },
  { name: 'The Verge',       url: 'https://www.theverge.com/rss/index.xml',                     cat: 'Tech'    },
  { name: 'Wired',           url: 'https://www.wired.com/feed/rss',                             cat: 'Tech'    },
  { name: 'Ars Technica',    url: 'https://feeds.arstechnica.com/arstechnica/index',            cat: 'Tech'    },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/',                     cat: 'Tech'    },
  { name: 'CNBC',            url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',      cat: 'Finance' },
  { name: 'Forbes',          url: 'https://www.forbes.com/innovation/feed2',                    cat: 'Finance' },
  { name: 'Science Daily',   url: 'https://www.sciencedaily.com/rss/all.xml',                   cat: 'Science' },
  { name: 'NASA',            url: 'https://www.nasa.gov/news-release/feed/',                    cat: 'Science' },
  { name: 'Wash. Post',      url: 'https://feeds.washingtonpost.com/rss/world',                 cat: 'World'   },
];

// CDATA 또는 일반 텍스트에서 XML 태그 값 추출
function extractXML(tag, xml) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i');
  const m  = re.exec(xml);
  return (m ? (m[1] || m[2] || '') : '').trim();
}

// 썸네일 URL 추출 (media:content → enclosure → description img)
function extractThumb(itemXml) {
  let m = /media:(?:content|thumbnail)[^>]+url="([^"]+)"/.exec(itemXml)
       || /<enclosure[^>]+type="image[^"]*"[^>]+url="([^"]+)"/.exec(itemXml)
       || /<enclosure[^>]+url="([^"]+)"[^>]+type="image[^"]*"/.exec(itemXml);
  if (m) return m[1];
  const desc = extractXML('description', itemXml);
  m = /<img[^>]+src="([^"]+)"/.exec(desc);
  return (m && m[1].startsWith('http')) ? m[1] : null;
}

// RSS XML에서 기사 파싱 (최대 limit개)
function parseRSS(xml, source, limit = 2) {
  const items = [];
  const re    = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < limit) {
    const item    = m[1];
    const title   = extractXML('title', item)
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    const link    = extractXML('link', item) || extractXML('guid', item);
    const desc    = extractXML('description', item)
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 250);
    const pubDate = extractXML('pubDate', item) || extractXML('dc:date', item) || extractXML('published', item);
    const thumb   = extractThumb(item);
    if (title && link && link.startsWith('http')) {
      items.push({
        id:      `${source.name.replace(/\W/g, '_')}_${items.length}`,
        title:   title.slice(0, 200),
        url:     link.trim(),
        summary: desc,
        thumb,
        source:  source.name,
        cat:     source.cat,
        pubDate,
        score: null, grade: null, verdict_class: null, tag: null,
      });
    }
  }
  return items;
}

// 단일 RSS 피드 fetch (8초 타임아웃)
async function fetchFeed(source) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANNVerify/2.0; +https://annverify.ai)' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return [];
    return parseRSS(await res.text(), source, 2);
  } catch (_) {
    clearTimeout(tid);
    return [];
  }
}

// Claude 배치 스코어링 — 헤드라인 전체를 단일 API 호출로 평가
async function batchScore(articles, apiKey) {
  if (!articles.length || !apiKey) return articles;
  const headlines = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');
  const prompt = `You are a rapid news fact-checker. Assess these ${articles.length} news headlines.
For each provide: score(0-100), grade(A+/A/B+/B/C/D/F), verdict_class(VERIFIED|LIKELY_TRUE|PARTIALLY_TRUE|UNVERIFIED|MISLEADING|FALSE), tag(one of: Trending|AI Ethics|LLM|Policy|Deepfakes|Science|Finance|Politics|Health|World).
Headlines:
${headlines}
Return ONLY a JSON array (no markdown): [{"i":1,"score":88,"grade":"A","verdict_class":"LIKELY_TRUE","tag":"World"},...]`;

  try {
    const res  = await callAnthropic({
      model: 'claude-sonnet-4-5', max_tokens: 3000, temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    }, apiKey, {}, 25000);
    const data = await res.json();
    if (!res.ok) return articles;
    const block  = Array.isArray(data.content) && data.content.find(b => b.type === 'text');
    const scores = JSON.parse((block?.text || '').replace(/```json|```/g, '').trim());
    if (Array.isArray(scores)) {
      scores.forEach(s => {
        const idx = (s.i || 0) - 1;
        if (idx >= 0 && idx < articles.length) {
          articles[idx].score         = s.score;
          articles[idx].grade         = s.grade;
          articles[idx].verdict_class = s.verdict_class;
          articles[idx].tag           = s.tag;
        }
      });
    }
  } catch (_) {}
  return articles;
}

export async function handleV4NewsFeed(request, env, cors) {
  // 캐시 확인 (15분)
  const cache    = caches.default;
  const cacheKey = new Request('https://cache.annverify.internal/news-v4-feed-v2');
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return json(await cached.json(), 200, cors);
  } catch (_) {}

  // 20개 RSS 피드 병렬 fetch
  const settled = await Promise.allSettled(RSS_SOURCES.map(s => fetchFeed(s)));
  let articles  = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  // Claude 배치 스코어링
  articles = await batchScore(articles, env.ANTHROPIC_API_KEY);

  // 스코어 없는 항목 기본값 채우기
  articles = articles.map((a, i) => ({
    ...a,
    id:            `art_${i}`,
    score:         a.score         ?? 72,
    grade:         a.grade         ?? 'B',
    verdict_class: a.verdict_class ?? 'UNVERIFIED',
    tag:           a.tag           ?? a.cat,
  }));

  const payload = { articles, ts: Date.now(), count: articles.length };

  // 캐시 저장
  try {
    await cache.put(cacheKey, new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=900' },
    }));
  } catch (_) {}

  return json(payload, 200, cors);
}
