// ① Client Layer — Community 페이지

var SOURCE_BADGE = {
  user:    { label:'User',         icon:'person',    cls:'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
  ainews:  { label:'AI News',      icon:'smart_toy', cls:'text-primary bg-primary/10' },
  partner: { label:'Partner News', icon:'handshake', cls:'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
};

var _communitySort = 'recent'; // 현재 정렬 상태
var _communityTab  = 'all';   // 현재 활성 탭

// ── Firestore 데이터 정규화 헬퍼 ─────────────────────────────────────
function _normPost(docId, data) {
  var total = (data.yesCount || 0) + (data.partialCount || 0) + (data.noCount || 0) + (data.notSureCount || 0);
  var yes     = total ? Math.round((data.yesCount      || 0) / total * 100) : 0;
  var partial = total ? Math.round((data.partialCount  || 0) / total * 100) : 0;
  var no      = total ? Math.round((data.noCount       || 0) / total * 100) : 0;
  var notSure = total ? 100 - yes - partial - no : 0;
  var tsMs    = data.ts && data.ts.seconds ? data.ts.seconds * 1000 : (data.ts || Date.now());
  return Object.assign({}, data, {
    _id:      docId,
    id:       docId,
    yes:      yes,
    partial:  partial,
    no:       no,
    notSure:  notSure,
    likes:    data.likeCount    || 0,
    comments: data.commentCount || 0,
    date:     partnerTimeAgo(tsMs ? new Date(tsMs).toISOString() : '') || '',
    ts:       tsMs,
  });
}

// photoURL 있으면 이미지, 없으면 이니셜 원형
function _avatarHtml(photoURL, initial, colorCls, sizeCls) {
  sizeCls  = sizeCls  || 'w-10 h-10';
  colorCls = colorCls || 'bg-primary';
  var base = '<div class="' + sizeCls + ' ' + colorCls
    + ' text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0 relative overflow-hidden">'
    + escHtml(initial);
  if (photoURL) {
    base += '<img src="' + escHtml(photoURL) + '" alt="" '
      + 'class="absolute inset-0 w-full h-full object-cover" '
      + 'onerror="this.style.display=\'none\'">';
  }
  return base + '</div>';
}

function _normComment(docId, data) {
  var tsMs = data.ts && data.ts.seconds ? data.ts.seconds * 1000 : (data.ts || 0);
  return {
    _id:      docId,
    id:       docId,
    user:     data.userName    || ((typeof t === 'function') ? t('community.anonymous') : 'Anonymous'),
    role:     data.userRole    || '',
    initial:  (data.userName || 'A').charAt(0).toUpperCase(),
    color:    'bg-primary',
    photoURL: data.userPhotoURL || '',
    time:     partnerTimeAgo(tsMs ? new Date(tsMs).toISOString() : '') || ((typeof t === 'function') ? t('community.just_now') : 'just now'),
    text:     data.text  || '',
    likes:    data.likeCount || 0,
    liked:    false,
    replies:  (data.replies || []).map(function(r) {
      var rTs = r.ts && r.ts.seconds ? r.ts.seconds * 1000 : (r.ts || 0);
      return {
        _id:      r._id || '',
        user:     r.userName    || ((typeof t === 'function') ? t('community.anonymous') : 'Anonymous'),
        role:     '',
        initial:  (r.userName || 'A').charAt(0).toUpperCase(),
        color:    'bg-slate-500',
        photoURL: r.userPhotoURL || '',
        time:     partnerTimeAgo(rTs ? new Date(rTs).toISOString() : '') || ((typeof t === 'function') ? t('community.just_now') : 'just now'),
        text:     r.text    || '',
        likes:    r.likeCount || 0,
        liked:    false,
      };
    }),
  };
}

// ── 정렬 ─────────────────────────────────────────────────────────────
function setCommunitySort(sort) {
  _communitySort = sort;
  // PC 버튼 스타일 업데이트
  ['recent','oldest','comments','likes'].forEach(s => {
    var btn = document.getElementById('csort-' + s);
    if (!btn) return;
    btn.className = s === sort
      ? 'community-sort-btn px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary text-white transition-all'
      : 'community-sort-btn px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all';
  });
  // 모바일 드롭다운 동기화
  var sel = document.getElementById('csort-select');
  if (sel) sel.value = sort;
  renderCommunity(_communityTab);
}

function sortCommunityItems(items) {
  var sorted = items.slice();
  if      (_communitySort === 'recent')   sorted.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  else if (_communitySort === 'oldest')   sorted.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  else if (_communitySort === 'comments') sorted.sort((a, b) => (b.comments || 0) - (a.comments || 0));
  else if (_communitySort === 'likes')    sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  return sorted;
}

// ── 리스트 렌더링 ─────────────────────────────────────────────────────
// AI News 데이터 미로드 시 직접 fetch (Community 탭 자체 프리페치용)
function _prefetchNewsData() {
  if (state.newsData && state.newsData.length) return Promise.resolve();

  var _fetchFromApi = function() {
    return fetch(API_URL + '/api/v4/news/feed')
      .then(function(res) { return res.ok ? res.json() : { articles: [] }; })
      .then(function(data) { state.newsData = data.articles || []; })
      .catch(function() { state.newsData = []; });
  };

  return db.collection('aiNews').orderBy('deployedAt', 'desc').limit(60).get()
    .then(function(snap) {
      state.newsData = snap.docs.map(function(d) {
        return Object.assign({ id: d.id }, d.data());
      });
      // Firestore 성공이지만 결과 없으면 API 폴백
      if (state.newsData.length === 0) return _fetchFromApi();
    })
    .catch(function() {
      // Firestore 실패(권한 등) → API 폴백
      return _fetchFromApi();
    });
}

// Partner News 데이터 미로드 시 직접 fetch (Community 탭 자체 프리페치용)
function _prefetchPartnerData() {
  if (state.partnerArticles && state.partnerArticles.length) return Promise.resolve();
  return fetch(API_URL + '/api/v4/partner/feed', { headers: { 'Origin': window.location.origin } })
    .then(function(res) { return res.ok ? res.json() : { articles: [] }; })
    .then(function(data) {
      state.partnerArticles = data.articles || [];
      state.partnerMeta     = data.partners  || [];
      // 테스트 기사 주입 (partner.js와 동일)
      var testArticle = {
        partnerId: 'yonhap', source: 'Yonhap News', color: '#005BAA', icon: 'Y',
        title: '\'다시 석탄으로\'…중동발 에너지 대란에 아시아 각국 \'잰걸음\'',
        url: 'https://www.yonhapnewstv.co.kr/news/AKR20260320154617E1f',
        summary: '중동 전쟁으로 인한 호르무즈 해협 봉쇄와 에너지 시설 파괴로 세계 석유·가스 공급에 차질이 빚어진 가운데 인도, 인도네시아 등 아시아 주요국이 석탄 발전과 석탄 생산량을 늘리려는 움직임을 보이고 있습니다.',
        thumb: 'https://d2k5miyk6y5zf0.cloudfront.net/article/AKR/20260320/AKR20260320154617E1f_01_i.jpg',
        pubDate: 'Fri, 20 Mar 2026 15:46:19 +0900', category: 'economy', _isTest: true,
      };
      var hasTest = state.partnerArticles.some(function(a) { return a._isTest; });
      if (!hasTest) state.partnerArticles.unshift(testArticle);
    })
    .catch(function() { if (!state.partnerArticles) state.partnerArticles = []; });
}

function loadCommunity() {
  var grid = document.getElementById('community-grid');
  if (grid) {
    grid.innerHTML = '<div class="col-span-2 py-16 text-center text-slate-400">'
      + '<span class="material-symbols-outlined text-4xl mb-3 block" style="animation:spin 1s linear infinite">progress_activity</span>'
      + '<p>Loading discussions…</p></div>';
  }

  // AI News / Partner News 데이터 보장 후 communityPosts fetch
  Promise.all([_prefetchNewsData(), _prefetchPartnerData()])
    .then(function() {
      return db.collection('communityPosts').orderBy('ts', 'desc').limit(50).get();
    })
    .then(function(snap) {
      var posts = snap.docs.map(function(doc) {
        return _normPost(doc.id, doc.data());
      });

      // 이미 communityPost가 있는 sourceId 집합
      var existing = {};
      posts.forEach(function(p) { if (p.sourceId) existing[p.sourceId] = true; });

      // AI News 기사 → 가상 카드 (중복 제외)
      // state.newsData는 deployedAt desc 순서 → 인덱스 기반으로 노출 시간 할당
      var _annBase = Date.now();
      var _annIdx  = 0;
      (state.newsData || []).forEach(function(a) {
        if (!a.id || existing[a.id]) return;
        var ts = _annBase - (_annIdx++);
        posts.push(_normPost('__ann__' + a.id, {
          _virtual: true, _origId: a.id,
          sourceId: a.id, source: 'ainews',
          title:       a.title    || '',
          description: a.excerpt  || a.summary || '',
          tag:         a.category || a.cat || 'News',
          score:       a.trust_score || a.score || 0,
          grade:       a.trust_grade || a.grade || '',
          yesCount: 0, partialCount: 0, noCount: 0, notSureCount: 0,
          likeCount: 0, commentCount: 0,
          ts: ts,
        }));
      });

      // Partner News 기사 → 가상 카드 (중복 제외)
      // state.partnerArticles 피드 순서를 노출 시간으로 환산
      var _pnBase = Date.now();
      var _pnIdx  = 0;
      (state.partnerArticles || []).forEach(function(a) {
        if (!a.url) return;
        var h = typeof _pnHash === 'function' ? _pnHash(a.url) : '';
        if (!h || existing[h]) return;
        var ts = _pnBase - (_pnIdx++);
        posts.push(_normPost('__pn__' + h, {
          _virtual: true, _origUrl: a.url,
          sourceId: h, source: 'partner', sourceUrl: a.url,
          title:       a.title   || '',
          description: a.summary || '',
          tag:         a.category || 'News',
          score:       a.score || 0,
          grade:       a.grade || a.trust_grade || '',
          displayName: a.source || '',
          yesCount: 0, partialCount: 0, noCount: 0, notSureCount: 0,
          likeCount: 0, commentCount: 0,
          ts: ts,
        }));
      });

      // ts 기준 최신순 정렬
      posts.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });

      state.communityData = posts;
      renderCommunity();
    })
    .catch(function() {
      state.communityData = [];
      renderCommunity();
    });
}

function setCommunityTab(tab) {
  _communityTab = tab;
  // PC 탭 버튼 스타일 업데이트
  ['all','user','ainews','partner'].forEach(t => {
    var btn = document.getElementById('ctab-' + t);
    if (!btn) return;
    btn.className = t === tab
      ? 'pb-3 text-sm font-bold border-b-2 border-primary text-primary px-1 whitespace-nowrap'
      : 'pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-1 border-b-2 border-transparent whitespace-nowrap';
  });
  // 모바일 드롭다운 동기화
  var sel = document.getElementById('ctab-select');
  if (sel) sel.value = tab;
  renderCommunity(tab);
}

var _COMM_GRADS = [
  'from-violet-600 to-blue-500',
  'from-fuchsia-600 to-violet-500',
  'from-blue-600 to-cyan-500',
  'from-rose-500 to-pink-600',
  'from-indigo-600 to-violet-500',
  'from-teal-500 to-cyan-600',
];
function _commGrad(id) {
  var n = 0; for (var i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return _COMM_GRADS[n % _COMM_GRADS.length];
}
function _commTypePill(source) {
  if (source === 'ainews')  return '<span class="bg-violet-600/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">AI</span>';
  if (source === 'partner') return '<span class="bg-emerald-600/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">PN</span>';
  return '<span class="bg-slate-600/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">User</span>';
}
function _commGradeHtml(grade, score) {
  if (!grade && !score) return '';
  var g = grade || '';
  var cls = g.startsWith('A') ? 'bg-emerald-500' : g.startsWith('B') ? 'bg-blue-500' : g === 'C' ? 'bg-amber-500' : 'bg-slate-400';
  var label = g ? 'VERIFIED · ' + g : (score ? score + '/100' : '');
  return '<span class="' + cls + ' text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"><span class="material-symbols-outlined" style="font-size:10px">verified</span>' + label + '</span>';
}

function renderCommunity(tab) {
  var items = state.communityData || [];
  if      (tab === 'user')    items = items.filter(i => i.source === 'user');
  else if (tab === 'ainews')  items = items.filter(i => i.source === 'ainews');
  else if (tab === 'partner') items = items.filter(i => i.source === 'partner');

  // 검색어 필터
  var searchEl = document.getElementById('community-search');
  var query = searchEl ? searchEl.value.trim().toLowerCase() : '';
  if (query) {
    items = items.filter(function(i) {
      return (i.title       || '').toLowerCase().includes(query)
          || (i.description || '').toLowerCase().includes(query);
    });
  }

  items = sortCommunityItems(items);

  var emptyMsg = {
    user:    (typeof t === 'function') ? t('community.no_posts') : 'No community discussions yet.<br><span class="text-sm">Be the first to submit a claim and start the conversation!</span>',
    ainews:  (typeof t === 'function') ? t('community.no_ai_news') : 'No AI News fact-checks available.',
    partner: (typeof t === 'function') ? t('community.no_partner_news') : 'No Partner News fact-checks available.',
    all:     'No discussions found.',
  };

  document.getElementById('community-grid').innerHTML = items.length
    ? items.map(function(item) {
        var badge = SOURCE_BADGE[item.source] || SOURCE_BADGE.user;

        // 검증 상태 배지
        var verifiedBadge;
        if (item.grade) {
          var vColor = item.grade.startsWith('A')
            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
            : item.grade.startsWith('B')
            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
            : 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
          verifiedBadge = '<span class="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ' + vColor + '">'
            + '<span class="material-symbols-outlined" style="font-size:11px;font-variation-settings:\'FILL\' 1">verified</span>'
            + 'Verified&nbsp;·&nbsp;' + escHtml(item.grade)
            + '</span>';
        } else {
          verifiedBadge = '<span class="flex items-center gap-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">'
            + '<span class="material-symbols-outlined" style="font-size:12px">unpublished</span>'
            + 'Unverified'
            + '</span>';
        }

        // 투표 raw count
        var cntYes     = item.yesCount     || 0;
        var cntNo      = item.noCount      || 0;
        var cntPartial = item.partialCount || 0;
        var cntNotSure = item.notSureCount || 0;

        return '<article onclick="openCommunityDetail(\'' + item.id + '\')" class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex flex-col gap-3 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all news-card">'

          // 상단: 소스 + 카테고리 | 검증 배지
          + '<div class="flex items-start justify-between gap-3">'
            + '<div class="flex items-center gap-1.5 flex-wrap min-w-0">'
              + '<span class="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ' + badge.cls + '">'
                + '<span class="material-symbols-outlined" style="font-size:11px">' + badge.icon + '</span>'
                + badge.label
              + '</span>'
              + '<span class="text-slate-300 dark:text-slate-600 text-xs select-none">·</span>'
              + '<span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide truncate">'
                + escHtml(item.tag || 'General')
              + '</span>'
            + '</div>'
            + verifiedBadge
          + '</div>'

          // 제목
          + '<h3 class="font-display font-bold text-slate-900 dark:text-white text-base leading-snug line-clamp-2">'
            + escHtml(item.title)
          + '</h3>'

          // 설명
          + (item.description
            ? '<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 flex-1">' + escHtml(item.description) + '</p>'
            : '<div class="flex-1"></div>')

          // 하단: 투표 카운트 + 댓글 + 날짜
          + '<div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 gap-2 flex-wrap">'

            // 투표 카운트
            + '<div class="flex items-center text-xs text-slate-500 dark:text-slate-400 flex-wrap gap-y-1 gap-x-0">'
              + '<span class="flex items-center gap-1 pr-2 mr-2 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">'
                + '<span class="material-symbols-outlined text-sm text-emerald-500" style="font-variation-settings:\'FILL\' 1">thumb_up</span>'
                + '<strong class="text-slate-700 dark:text-slate-300">' + cntYes + '</strong>'
              + '</span>'
              + '<span class="flex items-center gap-1 pr-2 mr-2 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">'
                + '<span class="material-symbols-outlined text-sm text-rose-500" style="font-variation-settings:\'FILL\' 1">thumb_down</span>'
                + '<strong class="text-slate-700 dark:text-slate-300">' + cntNo + '</strong>'
              + '</span>'
              + '<span class="flex items-center gap-1 pr-2 mr-2 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">'
                + '<span class="material-symbols-outlined text-sm text-amber-500">sentiment_neutral</span>'
                + '<strong class="text-slate-700 dark:text-slate-300">' + cntPartial + '</strong>'
              + '</span>'
              + '<span class="flex items-center gap-1 whitespace-nowrap">'
                + '<span class="material-symbols-outlined text-sm text-slate-400">help_outline</span>'
                + '<strong class="text-slate-700 dark:text-slate-300">' + cntNotSure + '</strong>'
              + '</span>'
            + '</div>'

            // 댓글 수 + 날짜
            + '<div class="flex items-center gap-3 text-xs text-slate-400 shrink-0">'
              + '<span class="flex items-center gap-1">'
                + '<span class="material-symbols-outlined text-sm">forum</span>'
                + (item.comments || 0)
              + '</span>'
              + (item.date ? '<span>' + item.date + '</span>' : '')
            + '</div>'

          + '</div>'

        + '</article>';
      }).join('')
    : '<div class="col-span-2 py-16 text-center text-slate-400">'
        + '<span class="material-symbols-outlined text-4xl mb-3 block">forum</span>'
        + '<p class="mb-4">' + (emptyMsg[tab] || emptyMsg.all) + '</p>'
        + '<button onclick="goPage(\'home\')" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Start Verifying</button>'
      + '</div>';
}

// ── 공유 ──────────────────────────────────────────────────────────────
// ── Verify Report 드롭다운 ────────────────────────────────────────────
var _verifyPanelOpen = false;

function toggleVerifyReport(_id, sourceId, source) {
  var panel   = document.getElementById('cd-verify-panel');
  var btnIcon = document.getElementById('cd-verify-btn-icon');
  if (!panel) return;

  var item  = state.communityDetail || {};
  var score = item.score || 0;

  // 미검증 기사 → 팩트체크 실행
  if (!score) {
    if (source === 'ainews' && sourceId) {
      if (typeof runNewsCheck === 'function') runNewsCheck(sourceId);
    } else {
      var input = item.sourceUrl || item._origUrl || item.title || '';
      if (typeof _runVerifyAPI === 'function') {
        _runVerifyAPI(input, item.title || '');
      } else {
        state.lastInput = input;
        state.imageB64  = null;
        var el = document.getElementById('home-input');
        if (el) el.value = input;
        if (typeof runCheck === 'function') runCheck();
      }
    }
    return;
  }

  // 토글 닫기
  if (_verifyPanelOpen) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    if (btnIcon) btnIcon.textContent = 'expand_more';
    _verifyPanelOpen = false;
    return;
  }

  // 로딩 표시
  panel.innerHTML = '<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 mb-5 flex items-center justify-center gap-2 text-sm text-slate-400"><span class="material-symbols-outlined animate-spin text-primary">progress_activity</span>Loading report…</div>';
  panel.classList.remove('hidden');
  if (btnIcon) btnIcon.textContent = 'expand_less';
  _verifyPanelOpen = true;

  // 풀 리포트 로드 후 렌더링
  _loadFullReportForPanel(sourceId, source, item, function(r) {
    if (!r) {
      panel.innerHTML = '<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 mb-5 text-sm text-slate-400 text-center">Report data not available.</div>';
      return;
    }
    _renderVerifyPanel(panel, r, item);
  });
}

// 소스별 풀 리포트 로드
function _loadFullReportForPanel(sourceId, source, item, cb) {
  // AI News
  if (source === 'ainews') {
    var article = (state.newsData || []).find(function(a) { return a.id === sourceId; });
    if (article) {
      // state.newsData 기사 데이터를 리포트 형태로 변환
      var r = {
        overall_score:     article.trust_score || article.score || item.score || 0,
        overall_grade:     article.trust_grade || article.grade || item.grade || '',
        verdict_class:     _communityVc(article.trust_score || article.score || item.score || 0),
        executive_summary: article.d_sum || article.excerpt || article.summary || item.description || '',
        _body:             article.body || '',
        layer_analysis:    _buildLayers(article),
        metrics: {
          factual:          article.m_factual || 0,
          logic:            article.m_logic || 0,
          source_quality:   article.m_source_quality || 0,
          cross_validation: article.m_cross_val || 0,
          recency:          article.m_recency || 0,
        },
        claims: (article.d_claims || []).map(function(c) { return { sentence: c.t || '', status: c.s || 'PARTIAL', verdict: c.v || '' }; }),
        key_evidence: { supporting: article.d_sup || [], contradicting: article.d_con || [] },
        web_citations: article.d_cit || [],
        _source: article.source || 'AI News',
        _engine: 'ai_news',
      };
      cb(r);
    } else {
      cb(null);
    }
    return;
  }

  // Partner: localStorage 우선 → Firestore fallback
  try {
    var stored = JSON.parse(localStorage.getItem('pn_verified_full') || '{}');
    // sourceId = _pnHash(url) 이므로 URL 매칭
    var foundUrl = Object.keys(stored).find(function(url) {
      return typeof _pnHash === 'function' && _pnHash(url) === sourceId;
    });
    if (foundUrl && stored[foundUrl]) { cb(stored[foundUrl]); return; }
  } catch (_) {}

  // Firestore partnerVerified/{sourceId}
  try {
    db.collection('partnerVerified').doc(sourceId).get().then(function(snap) {
      if (snap.exists && snap.data().fullResult) {
        cb(snap.data().fullResult);
      } else {
        cb(null);
      }
    }).catch(function() { cb(null); });
  } catch (_) { cb(null); }
}

function _communityVc(score) {
  return score >= 80 ? 'verified' : score >= 65 ? 'likely' : score >= 45 ? 'partial' : score >= 30 ? 'misleading' : 'false';
}

function _buildLayers(article) {
  if (!article.m_factual) return [];
  return [
    { layer:'L1', name:'Source Quality',    score: article.m_source_quality || 0, summary:'' },
    { layer:'L2', name:'Logic',             score: article.m_logic || 0,          summary:'' },
    { layer:'L3', name:'Factual Accuracy',  score: article.m_factual || 0,        summary:'' },
    { layer:'L4', name:'Cross Validation',  score: article.m_cross_val || 0,      summary:'' },
    { layer:'L5', name:'Recency',           score: article.m_recency || 0,        summary:'' },
  ];
}

// 풀 리포트 패널 렌더링
function _renderVerifyPanel(panel, r, item) {
  var score = r.overall_score || 0;
  var grade = r.overall_grade || '';
  var vc    = (r.verdict_class || _communityVc(score)).toLowerCase();
  var badgeMap = {
    verified:   ['bg-emerald-100 text-emerald-700 border-emerald-200', 'verified_user', 'VERIFIED'],
    likely:     ['bg-blue-100 text-blue-700 border-blue-200',          'thumb_up',      'LIKELY TRUE'],
    partial:    ['bg-amber-100 text-amber-700 border-amber-200',       'balance',       'PARTIALLY VERIFIED'],
    misleading: ['bg-orange-100 text-orange-700 border-orange-200',    'warning',       'MISLEADING'],
    false:      ['bg-red-100 text-red-700 border-red-200',             'cancel',        'FALSE'],
  };
  var bm = badgeMap[vc] || badgeMap['partial'];
  var ringColors = { verified:'#10b981', likely:'#3b82f6', partial:'#f59e0b', misleading:'#f97316', false:'#ef4444' };
  var ringColor = ringColors[vc] || '#f59e0b';
  var circ = 2 * Math.PI * 36;
  var dash = (score / 100) * circ;

  // ── 헤더: 배지 + 점수 게이지 ──
  var headerHtml =
    '<div class="flex items-center justify-between gap-4 p-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">'
      + '<div class="flex flex-col gap-2">'
        + '<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ' + bm[0] + '">'
          + '<span class="material-symbols-outlined text-sm">' + bm[1] + '</span>' + bm[2]
        + '</span>'
        + (grade ? '<span class="text-2xl font-black" style="color:' + ringColor + '">' + escHtml(grade) + '</span>' : '')
      + '</div>'
      + '<div class="relative flex items-center justify-center shrink-0" style="width:72px;height:72px">'
          + '<svg width="72" height="72" viewBox="0 0 80 80" style="transform:rotate(-90deg);position:absolute;inset:0;width:100%;height:100%">'
            + '<circle cx="40" cy="40" r="36" fill="none" stroke="#e2e8f0" stroke-width="8"/>'
            + '<circle cx="40" cy="40" r="36" fill="none" stroke="' + ringColor + '" stroke-width="8" stroke-dasharray="' + dash + ' ' + circ + '" stroke-linecap="round"/>'
          + '</svg>'
          + '<div class="absolute inset-0 flex flex-col items-center justify-center leading-tight">'
            + '<span class="text-xl font-black" style="color:' + ringColor + '">' + score + '</span>'
            + '<span class="text-[9px] font-bold text-slate-400 uppercase">SCORE</span>'
          + '</div>'
      + '</div>'
    + '</div>';

  var bodyContent = '';

  if (r._body) {
    // ── AI News 풀 리포트: 본문 + Evidence Nodes + Data Sourcing ──
    var claims = r.claims || [];
    var bodyHtml = r._body;
    // Evidence Node 콜아웃 (claims 처음 2개)
    if (claims.length) {
      bodyHtml += claims.slice(0, 2).map(function(c, i) {
        return '<div class="border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 pl-4 py-3 rounded-r-xl my-4">'
          + '<div class="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">'
          + '<span class="material-symbols-outlined" style="font-size:14px">fact_check</span>'
          + 'EVIDENCE NODE #' + (200 + i + 1)
          + '</div>'
          + '<p class="text-sm text-slate-700 dark:text-slate-300">' + escHtml(c.sentence || '') + '</p>'
          + '</div>';
      }).join('');
    }

    // Data Sourcing & Analysis Flow
    var sources = (r.key_evidence && r.key_evidence.supporting) ? r.key_evidence.supporting : [];
    var srcIcons = { Reuters:'newspaper', BBC:'tv', Nature:'science', Bloomberg:'bar_chart',
                     TechCrunch:'code', 'AP News':'feed', NIF:'bolt', LLNL:'biotech',
                     Wired:'devices', CNN:'broadcast_on_personal', 'The Guardian':'article',
                     'Al Jazeera':'language', 'Financial Times':'trending_up' };
    var sourcesGridHtml = sources.slice(0, 4).map(function(s) {
      var icon = srcIcons[s] || 'article';
      return '<div class="flex items-center gap-2.5 p-3 border border-slate-100 dark:border-slate-800 rounded-xl">'
        + '<span class="material-symbols-outlined text-slate-400 text-base">' + icon + '</span>'
        + '<span class="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">' + escHtml(s) + '</span>'
        + '</div>';
    }).join('');

    var flowSteps = ['Data Crawling', 'Cross-Verification', 'Sentiment Analysis', 'Final Synthesis'];
    var flowHtml = flowSteps.map(function(step, i) {
      var isFinal = i === flowSteps.length - 1;
      return isFinal
        ? '<div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700">'
            + '<span class="w-2 h-2 rounded-full flex-shrink-0 bg-white dark:bg-slate-300"></span>'
            + '<span class="text-sm font-bold text-white whitespace-nowrap">' + step + '</span>'
            + '</div>'
        : '<div class="flex items-center gap-3 py-1">'
            + '<span class="w-2 h-2 rounded-full flex-shrink-0 bg-primary"></span>'
            + '<span class="text-sm font-medium text-primary whitespace-nowrap">' + step + '</span>'
            + '</div>';
    }).join('');

    var dataSourcingHtml = (sourcesGridHtml || flowHtml)
      ? '<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5 mt-5">'
          + '<p class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">Data Sourcing &amp; Analysis Flow</p>'
          + '<div class="grid grid-cols-2 gap-4">'
            + (sourcesGridHtml ? '<div>'
                + '<p class="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-1">'
                  + '<span class="material-symbols-outlined text-sm">star</span>PRIMARY SOURCES'
                + '</p>'
                + '<div class="space-y-2">' + sourcesGridHtml + '</div>'
              + '</div>' : '')
            + (flowHtml ? '<div>'
                + '<p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">AI ANALYSIS FLOW</p>'
                + '<div class="space-y-1">' + flowHtml + '</div>'
              + '</div>' : '')
          + '</div>'
        + '</div>'
      : '';

    bodyContent =
      '<div class="p-5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">'
        + '<div class="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed [&_p]:mb-4 [&_p:last-child]:mb-0">'
          + bodyHtml
        + '</div>'
        + dataSourcingHtml
      + '</div>';

  } else {
    // ── Partner / 기타: 기존 섹션 (레이어 분석 · Claims · Evidence · Citations) ──
    var layers = r.layer_analysis || [];
    var layersHtml = layers.length ? layers.map(function(l) {
      var pct = Math.round(l.score || 0);
      var barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';
      return '<div>'
        + '<div class="flex justify-between text-xs mb-1">'
          + '<span class="text-slate-500 font-medium">' + escHtml(l.layer + ' · ' + l.name) + '</span>'
          + '<span class="font-bold text-slate-700 dark:text-slate-300">' + pct + '%</span>'
        + '</div>'
        + '<div class="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">'
          + '<div class="h-full rounded-full transition-all ' + barColor + '" style="width:' + pct + '%"></div>'
        + '</div>'
      + '</div>';
    }).join('') : '';

    var m = r.metrics || {};
    var techAcc = m.factual || m.source_quality || 0;
    var srcAuth = m.source_quality || m.cross_validation || 0;
    var metricsHtml = (techAcc || srcAuth) ? ''
      + '<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">'
        + '<p class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">Confidence Metrics</p>'
        + _metricBar('TECHNICAL ACCURACY', techAcc, '#3b82f6')
        + _metricBar('SOURCE AUTHORITY',   srcAuth, '#10b981')
      + '</div>' : '';

    var clms = r.claims || [];
    var claimsHtml = clms.length ? '<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">'
      + '<p class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">Claims Analysis</p>'
      + '<div class="space-y-2">'
      + clms.slice(0, 5).map(function(c) {
          var st = (c.status || '').toUpperCase();
          var isCon = st === 'CONFIRMED', isDis = st === 'DISPUTED' || st === 'FALSE';
          var border = isCon ? 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10'
                     : isDis ? 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10'
                     :         'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10';
          var badge  = isCon ? '<span class="text-emerald-600 text-[10px] font-bold shrink-0">✓ CONFIRMED</span>'
                     : isDis ? '<span class="text-red-600 text-[10px] font-bold shrink-0">✗ DISPUTED</span>'
                     :         '<span class="text-amber-600 text-[10px] font-bold shrink-0">~ PARTIAL</span>';
          return '<div class="border-l-4 ' + border + ' pl-3 py-2 rounded-r-lg">'
            + '<div class="flex items-start justify-between gap-2">'
              + '<p class="text-xs text-slate-700 dark:text-slate-300 leading-snug">' + escHtml(c.sentence) + '</p>'
              + badge
            + '</div>'
            + (c.verdict ? '<p class="text-xs text-slate-400 mt-1">' + escHtml(c.verdict) + '</p>' : '')
            + '</div>';
        }).join('')
      + '</div></div>' : '';

    var ev = r.key_evidence || {};
    var evHtml = '';
    if ((ev.supporting || []).length) {
      evHtml += '<div class="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">'
        + '<p class="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 tracking-widest mb-2">Supporting Evidence</p>'
        + '<ul class="space-y-1">' + ev.supporting.slice(0, 3).map(function(s) {
            return '<li class="text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-1.5"><span class="shrink-0 text-emerald-500">✓</span>' + escHtml(s) + '</li>';
          }).join('') + '</ul></div>';
    }
    if ((ev.contradicting || []).length) {
      evHtml += '<div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">'
        + '<p class="text-xs font-bold uppercase text-red-700 dark:text-red-400 tracking-widest mb-2">Contradicting Evidence</p>'
        + '<ul class="space-y-1">' + ev.contradicting.slice(0, 3).map(function(s) {
            return '<li class="text-xs text-red-900 dark:text-red-200 flex items-start gap-1.5"><span class="shrink-0 text-red-500">✗</span>' + escHtml(s) + '</li>';
          }).join('') + '</ul></div>';
    }

    var cits = r.web_citations || [];
    var citHtml = cits.length ? '<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">'
      + '<p class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">Web Citations</p>'
      + '<ul class="space-y-1">' + cits.slice(0, 5).map(function(c) {
          var url = typeof c === 'string' ? c : (c.url || '');
          var label = typeof c === 'string' ? c : (c.title || c.url || '');
          return url
            ? '<li class="text-xs text-primary truncate"><a href="' + escHtml(url) + '" target="_blank" rel="noopener" class="hover:underline flex items-center gap-1"><span class="material-symbols-outlined text-sm shrink-0">link</span>' + escHtml(label) + '</a></li>'
            : '';
        }).join('')
      + '</ul></div>' : '';

    bodyContent =
      (r.executive_summary ? '<div class="p-5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800"><p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">' + escHtml(r.executive_summary) + '</p></div>' : '')
      + '<div class="p-4 space-y-3">'
        + (layersHtml ? '<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4"><p class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">Layer Analysis</p><div class="space-y-3">' + layersHtml + '</div></div>' : '')
        + metricsHtml
        + claimsHtml
        + (evHtml ? '<div class="space-y-3">' + evHtml + '</div>' : '')
        + citHtml
      + '</div>';
  }

  panel.innerHTML =
    '<div class="rounded-2xl border border-primary/20 bg-primary/5 dark:bg-primary/10 overflow-hidden mb-5">'
      + headerHtml
      + bodyContent
    + '</div>';

  // 패널로 부드럽게 스크롤
  setTimeout(function() { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
}

function _metricBar(label, pct, color) {
  pct = Math.round(pct || 0);
  return '<div class="mb-3">'
    + '<div class="flex justify-between text-xs mb-1">'
      + '<span class="font-bold text-slate-500 uppercase tracking-wide" style="font-size:10px">' + label + '</span>'
      + '<span class="font-bold text-slate-700 dark:text-slate-300">' + pct + '%</span>'
    + '</div>'
    + '<div class="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">'
      + '<div class="h-full rounded-full transition-all" style="width:' + pct + '%;background:' + color + '"></div>'
    + '</div>'
  + '</div>';
}

function shareCommunityDetail() {
  var item = state.communityDetail;
  var title = item ? item.title : document.title;
  var url   = window.location.href;
  if (navigator.share) {
    navigator.share({ title: title, url: url }).catch(function() {});
  } else {
    navigator.clipboard.writeText(url).then(function() {
      showToast((typeof t === 'function') ? t('share.copied') : 'Link copied to clipboard!', 'success');
    }).catch(function() {
      showToast((typeof t === 'function') ? t('share.copy_failed') : 'Copy failed. Please copy the URL manually.', 'error');
    });
  }
}

// ── 디테일 페이지 ─────────────────────────────────────────────────────
function _showCommunityDetailSkeleton() {
  // 이전 피드 데이터 초기화 — goPage('community-detail') 시 구 데이터가 렌더되는 플래시 방지
  state.communityDetail = null;
  document.getElementById('cd-claim-card').innerHTML =
    '<div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 mb-6 p-6 animate-pulse">' +
      '<div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/4 mb-3"></div>' +
      '<div class="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2"></div>' +
      '<div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full mb-1"></div>' +
      '<div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>' +
    '</div>';
  document.getElementById('cd-poll').innerHTML = '';
  document.getElementById('cd-comments-list').innerHTML =
    '<div class="py-8 text-center text-slate-400 text-sm animate-pulse">' + ((typeof t === 'function') ? t('community.comments_loading') : 'Loading comments...') + '</div>';
  document.getElementById('cd-comment-count').textContent = '0';
}

// 데이터만 로드 (이미 community-detail로 이동된 경우)
function _loadCommunityDetail(id) {
  db.collection('communityPosts').doc(id).get().then(function(snap) {
    if (!snap.exists) { showToast((typeof t === 'function') ? t('community.post_not_found') : 'Post not found.', 'error'); return; }
    var item = _normPost(snap.id, snap.data());
    state.communityDetail = item;
    if (!state.communityComments) state.communityComments = {};
    renderCommunityDetail(item);

    db.collection('communityPosts').doc(id).collection('comments')
      .orderBy('ts', 'desc').limit(50).get().then(function(cSnap) {
        state.communityComments[id] = cSnap.docs.map(function(d) {
          return _normComment(d.id, d.data());
        });
        renderCommunityComments(id);
      }).catch(function() {
        state.communityComments[id] = [];
        renderCommunityComments(id);
      });
  }).catch(function() {
    showToast((typeof t === 'function') ? t('community.post_load_fail') : 'Failed to load post.', 'error');
  });
}

// 커뮤니티 목록 카드 클릭 → 페이지 이동 + 데이터 로드
function openCommunityDetail(id) {
  // 가상 카드: Firestore post 없음 → 각 소스의 Discussion 생성/이동 함수로 위임
  if (id.startsWith('__ann__')) {
    var origId = id.replace('__ann__', '');
    if (typeof openAnnDiscussion === 'function') openAnnDiscussion(origId);
    return;
  }
  if (id.startsWith('__pn__')) {
    var item = (state.communityData || []).find(function(i) { return i.id === id; });
    if (item && typeof openPartnerDiscussion === 'function') {
      var art = (state.partnerArticles || []).find(function(a) { return a.url === item._origUrl; });
      openPartnerDiscussion(item._origUrl, item.title, art);
    }
    return;
  }
  // 실제 communityPost
  _showCommunityDetailSkeleton();
  goPage('community-detail');
  _loadCommunityDetail(id);
}

function renderCommunityDetail(item) {
  var score     = item.score || 0;
  var scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#3b82f6' : score >= 40 ? '#f59e0b' : '#ef4444';
  var gradeLabel = score >= 80 ? 'A TRUST' : score >= 60 ? 'B TRUST' : score >= 40 ? 'C TRUST' : 'D TRUST';
  var src = SOURCE_BADGE[item.source] || SOURCE_BADGE.user;

  // 원형 게이지 SVG
  var r = 36, circ = 2 * Math.PI * r;
  var dash = (score / 100) * circ;
  var gaugeSvg = `
    <div class="relative flex items-center justify-center shrink-0 w-16 h-16 sm:w-[90px] sm:h-[90px]">
      <svg width="100%" height="100%" viewBox="0 0 90 90" style="transform:rotate(-90deg)"
        <circle cx="45" cy="45" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="8"/>
        <circle cx="45" cy="45" r="${r}" fill="none" stroke="${scoreColor}" stroke-width="8"
          stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span class="text-xl font-black" style="color:${scoreColor}">${score}</span>
        <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide">${gradeLabel}</span>
        <span class="text-[8px] text-slate-400 uppercase tracking-widest">TRUST</span>
      </div>
    </div>`;

  // Verified 배지 (등급 있을 때만 표시)
  var verifiedBadge = item.grade ? `
    <span class="flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
      <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">verified</span>
      Verified · ${escHtml(item.grade)}
    </span>` : '';

  // 클레임 카드
  document.getElementById('cd-claim-card').innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-5 sm:p-6 mb-5">
      <!-- 상단: Fact-Checked Claim 레이블 + Verified 배지 -->
      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="flex items-center gap-1.5 text-primary text-xs font-bold">
          <span class="material-symbols-outlined text-sm" style="font-variation-settings:'FILL' 1">verified</span>
          ${(typeof t === 'function') ? t('community.fact_checked_claim') : 'Fact-Checked Claim'}
        </div>
        ${verifiedBadge}
      </div>
      <!-- 제목 -->
      <h2 class="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug mb-2 line-clamp-2">${(typeof t === 'function') ? t('community.claim_prefix') : 'Claim:'} ${escHtml(item.title)}</h2>
      <!-- 설명 -->
      <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 mb-4">${escHtml(item.description || '')}</p>
      <!-- 하단: 출처 + Verify Report 버튼 -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1 text-xs text-slate-400">
          <span class="material-symbols-outlined text-sm">link</span>
          ${escHtml(src.label)}${item.date ? ' · ' + item.date : ''}
        </div>
        <button id="cd-verify-btn" onclick="toggleVerifyReport('${escHtml(item.id)}','${escHtml(item.sourceId || '')}','${escHtml(item.source || '')}')"
          class="shrink-0 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl text-sm hover:opacity-90 transition-all flex items-center gap-1">
          <span class="material-symbols-outlined text-sm" id="cd-verify-btn-icon">expand_more</span>${(typeof t === 'function') ? t('community.verify_report') : 'Verify Report'}
        </button>
      </div>
    </div>
    <!-- Verify Report 드롭다운 패널 -->
    <div id="cd-verify-panel" class="hidden overflow-hidden transition-all duration-300"></div>`;

  // 커뮤니티 폴
  var cntYes     = item.yesCount     || 0;
  var cntNo      = item.noCount      || 0;
  var cntPartial = item.partialCount || 0;
  var cntNotSure = item.notSureCount || 0;
  document.getElementById('cd-poll').innerHTML = `
    <div class="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 mb-5">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-primary text-lg">how_to_vote</span>
        </div>
        <div>
          <p class="font-bold text-slate-900 dark:text-white text-sm">Community Poll: Do you agree with this claim?</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Based on the provided evidence, what is your stance?</p>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button onclick="voteCommunity('${item.id}','yes',this)" class="flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-primary hover:text-white hover:border-primary transition-all">
          <span class="material-symbols-outlined text-base">thumb_up</span>Like
          <span class="font-black">${String(cntYes).padStart(2,'0')}</span>
        </button>
        <button onclick="voteCommunity('${item.id}','no',this)" class="flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-primary hover:text-white hover:border-primary transition-all">
          <span class="material-symbols-outlined text-base">thumb_down</span>Dislike
          <span class="font-black">${String(cntNo).padStart(2,'0')}</span>
        </button>
        <button onclick="voteCommunity('${item.id}','partial',this)" class="flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-primary hover:text-white hover:border-primary transition-all">
          <span class="material-symbols-outlined text-base">sentiment_neutral</span>Neutral
          <span class="font-black">${String(cntPartial).padStart(2,'0')}</span>
        </button>
        <button onclick="voteCommunity('${item.id}','notsure',this)" class="flex items-center justify-center gap-2 px-3 py-3 sm:py-2.5 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-primary hover:text-white hover:border-primary transition-all">
          <span class="material-symbols-outlined text-base">help_outline</span>Not Sure
          <span class="font-black">${String(cntNotSure).padStart(2,'0')}</span>
        </button>
      </div>
    </div>`;

  renderCommunityComments(item.id);
}

function renderCommunityComments(id) {
  var comments = (state.communityComments && state.communityComments[id]) || [];
  var total    = comments.reduce(function(n, c) { return n + 1 + (c.replies ? c.replies.length : 0); }, 0);

  document.getElementById('cd-comment-count').textContent = total;

  var listEl = document.getElementById('cd-comments-list');
  listEl.innerHTML = comments.map(function(c, ci) {
    var repliesHtml = '';
    if (c.replies && c.replies.length) {
      repliesHtml = '<div class="mt-3 ml-8 space-y-3">'
        + c.replies.map(function(r, ri) {
          return '<div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 flex gap-3">'
            + _avatarHtml(r.photoURL, r.initial, r.color || 'bg-slate-500', 'w-7 h-7')
            + '<div class="flex-1 min-w-0">'
              + '<div class="flex items-center gap-2 mb-1 flex-wrap">'
                + '<span class="text-xs font-bold text-slate-900 dark:text-white">' + escHtml(r.user) + '</span>'
                + '<span class="text-xs text-slate-400 ml-auto">' + r.time + '</span>'
              + '</div>'
              + '<p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-1.5">' + escHtml(r.text) + '</p>'
              + '<button onclick="likeCommunityComment(\'' + id + '\',' + ci + ',' + ri + ',this)" class="flex items-center gap-1 text-xs ' + (r.liked ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-rose-500') + ' transition-colors">'
                + '<span class="material-symbols-outlined text-sm">' + (r.liked ? 'favorite' : 'favorite_border') + '</span>'
                + '<span class="like-count">' + r.likes + '</span>'
              + '</button>'
            + '</div>'
          + '</div>';
        }).join('')
        + '</div>';
    }

    return '<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 mb-4">'
      + '<div class="flex gap-3">'
        + _avatarHtml(c.photoURL, c.initial, c.color || 'bg-primary', 'w-10 h-10')
        + '<div class="flex-1 min-w-0">'
          + '<div class="flex items-center gap-2 mb-1 flex-wrap">'
            + '<span class="text-sm font-bold text-slate-900 dark:text-white">' + escHtml(c.user) + '</span>'
            + (c.role ? '<span class="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">' + escHtml(c.role) + '</span>' : '')
            + '<span class="text-xs text-slate-400 ml-auto">' + c.time + '</span>'
          + '</div>'
          + '<p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">' + escHtml(c.text) + '</p>'
          + '<div class="flex items-center gap-4">'
            + '<button onclick="likeCommunityComment(\'' + id + '\',' + ci + ',null,this)" class="flex items-center gap-1 text-xs ' + (c.liked ? 'text-rose-500 font-bold' : 'text-slate-400 hover:text-rose-500') + ' transition-colors">'
              + '<span class="material-symbols-outlined text-sm">' + (c.liked ? 'favorite' : 'favorite_border') + '</span>'
              + '<span class="like-count">' + c.likes + '</span>'
            + '</button>'
            + '<button onclick="toggleReplyInput(\'reply-input-' + ci + '\')" class="text-xs text-slate-400 hover:text-primary transition-colors flex items-center gap-1">'
              + '<span class="material-symbols-outlined text-sm">reply</span>Reply'
            + '</button>'
          + '</div>'
          + '<div id="reply-input-' + ci + '" class="hidden mt-3">'
            + '<div class="flex gap-2">'
              + '<input type="text" placeholder="' + ((typeof t === 'function') ? t('community.reply_placeholder') : 'Write a reply…') + '" class="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>'
              + '<button onclick="postCommunityReply(\'' + id + '\',' + ci + ',\'reply-input-' + ci + '\')" class="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors">Post</button>'
            + '</div>'
          + '</div>'
        + '</div>'
      + '</div>'
      + repliesHtml
      + '</div>';
  }).join('') || '<p class="text-sm text-slate-400 text-center py-8">Be the first to share your perspective!</p>';
}

// 진행 중인 투표 ID 추적 (중복 클릭 방지)
var _votingInProgress = {};

function voteCommunity(id, vote, btn) {
  // 중복 클릭 방지
  if (_votingInProgress[id]) return;

  var user = typeof auth !== 'undefined' && auth.currentUser;
  if (!user) { showToast((typeof t === 'function') ? t('community.login_to_vote') : 'Please sign in to vote.', 'info'); return; }

  var container = btn.closest('#cd-poll');
  if (!container) return;
  var btns = container.querySelectorAll('button');

  // 모든 버튼 일시 비활성화
  btns.forEach(function(b) { b.disabled = true; });
  _votingInProgress[id] = true;

  var postRef = db.collection('communityPosts').doc(id);
  var voteRef = postRef.collection('votes').doc(user.uid);
  var voteFieldMap = { yes: 'yesCount', no: 'noCount', partial: 'partialCount', notsure: 'notSureCount' };

  voteRef.get().then(function(voteSnap) {
    var prevVote = voteSnap.exists ? voteSnap.data().vote : null;
    if (prevVote === vote) {
      btns.forEach(function(b) { b.disabled = false; });
      delete _votingInProgress[id];
      return;
    }

    var batch = db.batch();
    batch.set(voteRef, { vote: vote, ts: Date.now() });

    var updates = {};
    if (prevVote && voteFieldMap[prevVote]) updates[voteFieldMap[prevVote]] = firebase.firestore.FieldValue.increment(-1);
    if (voteFieldMap[vote]) updates[voteFieldMap[vote]] = firebase.firestore.FieldValue.increment(1);
    batch.set(postRef, updates, { merge: true });

    return batch.commit().then(function() {
      btns.forEach(function(b) { b.disabled = false; });
      btns.forEach(function(b) {
        var m = (b.getAttribute('onclick') || '').match(/'([^']+)',this\)/);
        var bv = m ? m[1] : '';
        var countSpan = b.querySelector('span.font-black');
        if (bv === vote) {
          b.classList.add('bg-primary', 'text-white', 'shadow-md');
          b.classList.remove('border-slate-300', 'text-slate-700', 'dark:text-slate-300');
          if (countSpan) {
            var n = parseInt(countSpan.textContent, 10) || 0;
            countSpan.textContent = String(n + 1).padStart(2, '0');
          }
        } else if (bv) {
          b.classList.remove('bg-primary', 'text-white', 'shadow-md');
          b.classList.add('border-slate-300', 'text-slate-700');
          if (bv === prevVote && countSpan) {
            var n = parseInt(countSpan.textContent, 10) || 0;
            countSpan.textContent = String(Math.max(0, n - 1)).padStart(2, '0');
          }
        }
      });

      // state.communityData 의 해당 항목 카운트 동기화 (리스트 카드 반영용)
      var listItem = (state.communityData || []).find(function(it) { return it.id === id; });
      if (listItem) {
        if (prevVote && voteFieldMap[prevVote]) listItem[voteFieldMap[prevVote]] = Math.max(0, (listItem[voteFieldMap[prevVote]] || 0) - 1);
        if (voteFieldMap[vote]) listItem[voteFieldMap[vote]] = (listItem[voteFieldMap[vote]] || 0) + 1;
      }
    });
  }).catch(function(e) {
    console.warn('vote 저장 실패:', e);
    btns.forEach(function(b) { b.disabled = false; });
    showToast((typeof t === 'function') ? t('community.vote_fail') : 'Failed to save vote. Please try again.', 'error');
  }).finally(function() {
    delete _votingInProgress[id];
  });

  // 로컬 state 활동 추적
  var item = state.communityDetail || {};
  var entry = { id: id, vote: vote, title: item.title || '', ts: Date.now() };
  var existing = (state.myActivity.votes || []).findIndex(function(v) { return v.id === id; });
  if (existing >= 0) state.myActivity.votes.splice(existing, 1, entry);
  else               (state.myActivity.votes = state.myActivity.votes || []).unshift(entry);
  // 투표 활동 Firestore 영구 저장
  if (user) {
    db.collection('users').doc(user.uid).collection('communityVotes').doc(id).set({
      itemId: id, title: item.title || '', vote: vote, ts: Date.now()
    }).catch(function(e) { console.warn('투표 활동 저장 실패:', e); });
  }
}

function toggleReplyInput(elId) {
  var el = document.getElementById(elId);
  if (el) el.classList.toggle('hidden');
}

function likeCommunityComment(itemId, ci, ri, btn) {
  var comments = state.communityComments && state.communityComments[itemId];
  if (!comments || !comments[ci]) return;
  var isReply = ri !== null && ri !== undefined;
  var target  = isReply ? (comments[ci].replies && comments[ci].replies[ri]) : comments[ci];
  if (!target) return;

  target.liked  = !target.liked;
  target.likes += target.liked ? 1 : -1;

  var delta = target.liked ? 1 : -1;

  // Firestore: 최상위 댓글 좋아요
  if (!isReply && comments[ci]._id) {
    db.collection('communityPosts').doc(itemId).collection('comments').doc(comments[ci]._id)
      .update({ likeCount: firebase.firestore.FieldValue.increment(delta) })
      .catch(function(e) { console.warn('댓글 좋아요 저장 실패:', e); });
  }

  // DOM 즉시 반영
  var iconEl  = btn.querySelector('.material-symbols-outlined');
  var countEl = btn.querySelector('.like-count');
  if (iconEl)  iconEl.textContent  = target.liked ? 'favorite' : 'favorite_border';
  if (countEl) countEl.textContent = target.likes;
  if (target.liked) {
    btn.className = btn.className.replace('text-slate-400 hover:text-rose-500', 'text-rose-500 font-bold');
  } else {
    btn.className = btn.className.replace('text-rose-500 font-bold', 'text-slate-400 hover:text-rose-500');
  }
}

function postCommunityComment() {
  var item = state.communityDetail;
  if (!item) return;
  var user = auth && auth.currentUser;
  if (!user) { showToast((typeof t === 'function') ? t('community.login_to_comment') : 'Please sign in to comment.', 'info'); return; }
  var textarea = document.getElementById('cd-comment-textarea');
  var text = textarea ? textarea.value.trim() : '';
  if (!text) return;

  // 정책 필터 검사 (기본 정책 + 욕설)
  var _policy = (typeof checkCommentPolicy === 'function') ? checkCommentPolicy(text) : null;
  if (_policy && _policy.blocked) {
    if (textarea) {
      textarea.classList.add('ring-2', 'ring-red-400');
      setTimeout(function() { textarea.classList.remove('ring-2', 'ring-red-400'); }, 2000);
    }
    showToast(_policy.message, 'error');
    return;
  }

  var name = user.displayName || user.email.split('@')[0];
  var ts   = Date.now();
  var commentData = {
    uid: user.uid, userName: name, userRole: '', userPhotoURL: user.photoURL || '',
    text: text, likeCount: 0, replies: [], ts: ts,
  };

  // Firestore 저장 → 반환된 ID로 로컬 state 추가
  db.collection('communityPosts').doc(item.id).collection('comments').add(commentData)
    .then(function(ref) {
      if (!state.communityComments) state.communityComments = {};
      if (!state.communityComments[item.id]) state.communityComments[item.id] = [];
      state.communityComments[item.id].unshift(_normComment(ref.id, commentData));
      if (textarea) textarea.value = '';
      renderCommunityComments(item.id);
      // 게시글 댓글 수 증가 (Firestore + 로컬 state 동기화)
      db.collection('communityPosts').doc(item.id)
        .update({ commentCount: firebase.firestore.FieldValue.increment(1) }).catch(function() {});
      var listItem = (state.communityData || []).find(function(it) { return it.id === item.id; });
      if (listItem) listItem.commentCount = (listItem.commentCount || 0) + 1;
      // 활동 추적 (로컬)
      if (!state.myActivity) state.myActivity = { comments:[], votes:[], likesGiven:0 };
      state.myActivity.comments.unshift({ itemId: item.id, title: item.title, text: text, ts: ts });
      // 활동 추적 (Firestore 영구 저장)
      db.collection('users').doc(user.uid).collection('communityComments').add({
        itemId: item.id, title: item.title, text: text, ts: ts
      }).catch(function(e) { console.warn('댓글 활동 저장 실패:', e); });
    }).catch(function(e) { console.warn('댓글 저장 실패:', e); showToast((typeof t === 'function') ? t('community.comment_save_fail') : 'Failed to save comment.', 'error'); });
}

function postCommunityReply(itemId, ci, inputWrapperId) {
  var wrap  = document.getElementById(inputWrapperId);
  var input = wrap ? wrap.querySelector('input') : null;
  var text  = input ? input.value.trim() : '';
  if (!text) return;
  var user = auth && auth.currentUser;
  if (!user) { showToast((typeof t === 'function') ? t('community.login_to_reply') : 'Please sign in to reply.', 'info'); return; }

  // 정책 필터 검사 (기본 정책 + 욕설)
  var _replyPolicy = (typeof checkCommentPolicy === 'function') ? checkCommentPolicy(text) : null;
  if (_replyPolicy && _replyPolicy.blocked) {
    if (input) {
      input.classList.add('ring-2', 'ring-red-400');
      setTimeout(function() { input.classList.remove('ring-2', 'ring-red-400'); }, 2000);
    }
    showToast(_replyPolicy.message, 'error');
    return;
  }
  var name     = user.displayName || user.email.split('@')[0];
  var ts       = Date.now();
  var replyObj = { uid: user.uid, userName: name, userPhotoURL: user.photoURL || '', text: text, likeCount: 0, ts: ts };

  var comment = state.communityComments && state.communityComments[itemId] && state.communityComments[itemId][ci];
  if (!comment) return;

  // Firestore 댓글 문서의 replies 배열에 추가
  if (comment._id) {
    db.collection('communityPosts').doc(itemId).collection('comments').doc(comment._id)
      .update({ replies: firebase.firestore.FieldValue.arrayUnion(replyObj) })
      .catch(function(e) { console.warn('답글 저장 실패:', e); });
  }

  // 로컬 state 즉시 반영
  var localReply = {
    user: name, role:'', initial: name.charAt(0).toUpperCase(),
    color:'bg-slate-500', photoURL: user.photoURL || '',
    time: (typeof t === 'function') ? t('community.just_now') : 'just now', text: text, likes:0, liked:false,
  };
  comment.replies.push(localReply);
  if (input) input.value = '';
  renderCommunityComments(itemId);
}
