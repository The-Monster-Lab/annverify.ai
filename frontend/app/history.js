// ① Client Layer — 히스토리 관리 (Firestore + localStorage 폴백)

// ── 결과 캐시 (세션 간 유지, 12시간 TTL) ─────────────────────────────
var _RESULT_CACHE_KEY = 'ann_result_cache';

function _getResultCache() {
  try { return JSON.parse(localStorage.getItem(_RESULT_CACHE_KEY) || '{}'); } catch(_) { return {}; }
}

function _setResultCache(input, result) {
  try {
    var cache = _getResultCache();
    var now = Date.now();
    // 12시간 지난 항목 정리
    Object.keys(cache).forEach(function(k) {
      if (now - (cache[k].ts || 0) > _HISTORY_CACHE_MS) delete cache[k];
    });
    // 최대 10개 유지 (오래된 것부터 제거)
    var keys = Object.keys(cache).sort(function(a, b) { return (cache[a].ts || 0) - (cache[b].ts || 0); });
    if (keys.length >= 10) keys.slice(0, keys.length - 9).forEach(function(k) { delete cache[k]; });
    cache[input.slice(0, 200)] = { result: result, ts: now };
    localStorage.setItem(_RESULT_CACHE_KEY, JSON.stringify(cache));
  } catch(e) {
    console.warn('Result cache save failed:', e);
  }
}

// ── Firestore 히스토리 저장 ────────────────────────────────────────────
async function saveHistory(input, result, sourceType, category) {
  // 이미지 검증 시 input이 비어있으면 결과에서 표시 텍스트 추출
  var displayInput = input || (result && (
    result.executive_summary ||
    (result.claims && result.claims[0] && result.claims[0].sentence) ||
    result.overall_verdict
  )) || '';
  var item = {
    input:      displayInput.slice(0, 100),
    score:      result.overall_score,
    grade:      result.overall_grade,
    verdict:    result.verdict_class,
    sourceType: sourceType || 'user',
    category:   category   || null,
    ts:         Date.now(),
    result:     result,   // 세션 내 캐시용 (Firestore/localStorage에는 미저장)
  };

  // 로컬 state 업데이트
  state.history.unshift(item);
  state.history = state.history.slice(0, 50);

  // 결과 캐시 저장 (세션 간 12시간 유지)
  _setResultCache(displayInput, result);

  const user = typeof auth !== 'undefined' && auth.currentUser;
  if (user) {
    // 로그인 상태 → Firestore에 저장
    try {
      await db.collection('users').doc(user.uid).collection('history').add({
        input:      item.input,
        score:      item.score,
        grade:      item.grade,
        verdict:    item.verdict,
        sourceType: item.sourceType,
        category:   item.category,
        ts:         firebase.firestore.FieldValue.serverTimestamp(),
        tsLocal:    item.ts,
      });
      // Firestore 저장 성공 시 localStorage는 동기화 불필요 — 빈값으로 초기화
      localStorage.removeItem('ann_history');
    } catch(e) {
      // Firestore 실패 시 localStorage 폴백
      console.warn('Firestore saveHistory 실패, localStorage 폴백:', e);
      localStorage.setItem('ann_history', JSON.stringify(state.history.map(function(h) { var c = Object.assign({}, h); delete c.result; return c; })));
    }
  } else {
    // 비로그인 → localStorage에만 저장 (result 필드 제외)
    localStorage.setItem('ann_history', JSON.stringify(state.history.map(function(h) { var c = Object.assign({}, h); delete c.result; return c; })));
  }

  renderHistory();
}

// ── Firestore 히스토리 로드 ────────────────────────────────────────────
async function loadHistoryFromFirestore() {
  const user = typeof auth !== 'undefined' && auth.currentUser;
  if (!user) return;
  try {
    const snap = await db.collection('users').doc(user.uid)
      .collection('history')
      .orderBy('tsLocal', 'desc')
      .limit(50)
      .get();
    state.history = snap.docs.map(function(doc) {
      var d = doc.data();
      return {
        id:      doc.id,
        input:      d.input,
        score:      d.score,
        grade:      d.grade,
        verdict:    d.verdict,
        sourceType: d.sourceType || 'user',
        category:   d.category   || null,
        ts:         d.tsLocal || (d.ts && d.ts.toMillis ? d.ts.toMillis() : Date.now()),
      };
    });
    localStorage.removeItem('ann_history');
    renderHistory();
    if (typeof renderVerifyHistoryPage === 'function') renderVerifyHistoryPage();
  } catch(e) {
    console.warn('Firestore loadHistory 실패:', e);
  }
}

// ── 히스토리 전체 삭제 ─────────────────────────────────────────────────
async function clearHistory() {
  state.history = [];
  localStorage.removeItem('ann_history');

  const user = typeof auth !== 'undefined' && auth.currentUser;
  if (user) {
    try {
      const snap = await db.collection('users').doc(user.uid)
        .collection('history').limit(100).get();
      const batch = db.batch();
      snap.docs.forEach(function(doc) { batch.delete(doc.ref); });
      await batch.commit();
    } catch(e) {
      console.warn('Firestore clearHistory 실패:', e);
    }
  }

  renderHistory();
  if (typeof renderVerifyHistoryPage === 'function') renderVerifyHistoryPage();
}

// ── 홈 히스토리 카드 렌더링 ───────────────────────────────────────────
function renderHistory() {
  var grid = document.getElementById('history-grid');
  if (!grid) return;
  if (!state.history.length) {
    grid.innerHTML = '<div class="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-slate-400 text-sm col-span-3 py-10"><span class="material-symbols-outlined text-3xl mb-2 block">search</span>' + ((typeof t === 'function') ? t('history.empty') : 'Your recent fact-checks will appear here') + '</div>';
    return;
  }
  var cards = state.history.slice(0, 6).map(function(h, idx) {
    var vc  = h.verdict && h.verdict.toLowerCase() || 'partial';
    var cls = 'verified' === vc || 'likely' === vc
      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-200'
      : 'false' === vc
      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border-red-200'
      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-200';
    return `<div data-hist-idx="${idx}" class="hist-card p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer">
      <div class="flex items-start justify-between gap-3 mb-3">
        <p class="text-sm font-medium text-slate-900 dark:text-white line-clamp-2 leading-snug">${escHtml(h.input)}</p>
        <span class="flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-black ${cls}">${escHtml(h.grade)}</span>
      </div>
      <p class="text-xs text-slate-400">${new Date(h.ts).toLocaleDateString()}</p>
    </div>`;
  });
  grid.innerHTML = cards.join('');
  grid.querySelectorAll('.hist-card').forEach(function(el) {
    el.addEventListener('click', function() {
      var h = state.history[parseInt(el.dataset.histIdx, 10)];
      if (h) rerunHistory(h.input);
    });
  });
}

// ── 히스토리 재실행 ───────────────────────────────────────────────────
var _HISTORY_CACHE_MS = 12 * 60 * 60 * 1000; // 12시간

function rerunHistory(input) {
  var now = Date.now();

  // ① 세션 내 캐시 (state.history에 result가 있는 경우)
  var history = state.history || [];
  var recent  = history
    .filter(function(h) { return h.input === input && h.result && h.ts; })
    .sort(function(a, b) { return b.ts - a.ts; })[0];

  if (recent && (now - recent.ts) < _HISTORY_CACHE_MS) {
    state.lastInput  = input;
    state.lastResult = recent.result;
    state.imageB64   = null;
    var inputEl = document.getElementById('home-input');
    if (inputEl) inputEl.value = input;
    goPage('report');
    if (typeof renderReport === 'function') renderReport();
    return;
  }

  // ② localStorage 캐시 (세션 간 유지)
  var cached = _getResultCache()[input.slice(0, 200)];
  if (cached && cached.result && (now - (cached.ts || 0)) < _HISTORY_CACHE_MS) {
    state.lastInput  = input;
    state.lastResult = cached.result;
    state.imageB64   = null;
    var inputEl2 = document.getElementById('home-input');
    if (inputEl2) inputEl2.value = input;
    goPage('report');
    if (typeof renderReport === 'function') renderReport();
    return;
  }

  // ③ 12시간 초과 또는 캐시 없으면 재실행
  state.lastInput = input;
  var inputEl3 = document.getElementById('home-input');
  if (inputEl3) inputEl3.value = input;
  runCheck();
}
