// ① Client Layer — i18n (다국어 선택 · 로케일 감지 · t() 번역)
// 지원 언어: en / ko / ja / fr / es / de
// 우선순위: localStorage → navigator.language → en

var I18N_LANGS = {
  en: { code: 'ENG', label: 'English',  flag: '🇺🇸' },
  ko: { code: 'KOR', label: '한국어',   flag: '🇰🇷' },
  ja: { code: 'JPN', label: '日本語',   flag: '🇯🇵' },
  fr: { code: 'FRA', label: 'Français', flag: '🇫🇷' },
  es: { code: 'ESP', label: 'Español',  flag: '🇪🇸' },
  de: { code: 'DEU', label: 'Deutsch',  flag: '🇩🇪' },
};

var _translations  = {};   // { lang: { ...json } }
var _i18nLang      = 'en'; // 초기값, _detectLocale() 후 갱신

// ── 로케일 감지 ───────────────────────────────────────────────────────
function _detectLocale() {
  var saved = localStorage.getItem('ann_lang');
  if (saved && I18N_LANGS[saved]) return saved;
  var nav = ((navigator.language || navigator.userLanguage || 'en')
              .split('-')[0]).toLowerCase();
  return I18N_LANGS[nav] ? nav : 'en';
}

// ── JSON 로드 (캐시) ──────────────────────────────────────────────────
async function _loadTranslations(lang) {
  if (_translations[lang]) return true;
  try {
    var r = await fetch('/locales/' + lang + '.json?v=1');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _translations[lang] = await r.json();
    return true;
  } catch(e) {
    console.warn('[i18n] Failed to load', lang, e.message);
    return false;
  }
}

// ── t() — dot-notation 키 조회, {var} 치환, en fallback ──────────────
function t(key, vars) {
  function _resolve(lang) {
    var parts = key.split('.');
    var obj   = _translations[lang] || {};
    for (var i = 0; i < parts.length; i++) {
      if (obj == null) return null;
      obj = obj[parts[i]];
    }
    return (typeof obj === 'string') ? obj : null;
  }
  var str = _resolve(_i18nLang) || _resolve('en') || key;
  if (vars) {
    Object.keys(vars).forEach(function(k) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
    });
  }
  return str;
}

// ── DOM 일괄 번역 적용 ────────────────────────────────────────────────
function _applyTranslations() {
  // data-i18n → textContent
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  // data-i18n-placeholder → placeholder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  // data-i18n-html → innerHTML (신뢰된 번역 문자열만 사용)
  document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });

  // dark-label-el 동기화 (현재 다크모드 상태 반영)
  var isDark = document.documentElement.classList.contains('dark');
  document.querySelectorAll('.dark-label-el').forEach(function(el) {
    el.textContent = t(isDark ? 'dark_mode.light' : 'dark_mode.dark');
  });

  // 동적 렌더 영역 재렌더링 — 언어 변경 시 카드/리포트 즉시 갱신
  if (typeof renderHistory         === 'function') renderHistory();
  if (typeof renderReport          === 'function' && typeof state !== 'undefined' && state && state.lastResult) renderReport();
  if (typeof renderCommunityDetail === 'function' && typeof state !== 'undefined' && state && state.communityDetail) renderCommunityDetail(state.communityDetail);
  if (typeof renderPartners        === 'function') renderPartners();
  if (typeof renderPartnerArticles === 'function') renderPartnerArticles();
  if (typeof renderTodayHot        === 'function' && typeof _hotSlots !== 'undefined' && _hotSlots.length) renderTodayHot();
  // AI News 기사뷰 / Partner 리포트뷰 재렌더
  if (typeof renderNewsArticle   === 'function' && typeof state !== 'undefined' && state && state.lastResult && state.lastResult._engine === 'ai_news') renderNewsArticle(state.lastResult);
  if (typeof renderPartnerReport === 'function' && typeof state !== 'undefined' && state && state.partnerArticleData && state.lastResult) renderPartnerReport(state.lastResult);
}

// ── 언어 변경 ─────────────────────────────────────────────────────────
async function setLang(lang) {
  if (!I18N_LANGS[lang]) return;
  _i18nLang = lang;
  localStorage.setItem('ann_lang', lang);
  document.documentElement.lang = lang;
  await _loadTranslations(lang);
  if (!_translations['en']) await _loadTranslations('en');
  _applyTranslations();
  _updateLangBtn();
  _closeLangDropdown();
}

function getLang() { return _i18nLang; }

// ── 버튼 라벨 갱신 (모바일 + PC 동시) ───────────────────────────────
function _updateLangBtn() {
  var l = I18N_LANGS[_i18nLang];
  var text = l.label;
  var lbl   = document.getElementById('lang-btn-label');
  var lblPc = document.getElementById('lang-btn-label-pc');
  if (lbl)   lbl.textContent   = text;
  if (lblPc) lblPc.textContent = text;
}

// ── 드롭다운 토글 (PC: lang-dropdown-pc, 모바일: lang-dropdown) ───────
function toggleLangDropdown() {
  // 화면 너비에 따라 활성 드롭다운 결정
  var isMobile = window.innerWidth < 640;
  var ddId = isMobile ? 'lang-dropdown' : 'lang-dropdown-pc';
  var dd = document.getElementById(ddId);
  if (!dd) return;
  dd.classList.toggle('hidden');
}

function _closeLangDropdown() {
  var dd1 = document.getElementById('lang-dropdown');
  var dd2 = document.getElementById('lang-dropdown-pc');
  if (dd1) dd1.classList.add('hidden');
  if (dd2) dd2.classList.add('hidden');
}

// ── 초기화 ────────────────────────────────────────────────────────────
_i18nLang = _detectLocale();
document.documentElement.lang = _i18nLang;

document.addEventListener('DOMContentLoaded', function() {
  _updateLangBtn();

  // 현재 언어 + en fallback 로드 후 DOM 적용
  Promise.all([
    _loadTranslations(_i18nLang),
    _i18nLang !== 'en' ? _loadTranslations('en') : Promise.resolve(true),
  ]).then(function() {
    _applyTranslations();
  });

  // 외부 클릭 시 드롭다운 닫기 (모바일 topbar 내 버튼 + PC fixed 버튼 모두 체크)
  document.addEventListener('click', function(e) {
    var wrapPc  = document.getElementById('lang-selector-wrap');
    var mobileBtn = document.getElementById('lang-btn');
    var mobileDD  = document.getElementById('lang-dropdown');
    var insidePc     = wrapPc    && wrapPc.contains(e.target);
    var insideMobile = (mobileBtn && mobileBtn.contains(e.target)) || (mobileDD && mobileDD.contains(e.target));
    if (!insidePc && !insideMobile) _closeLangDropdown();
  });
});
