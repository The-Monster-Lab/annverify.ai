// ① Client Layer — 입력 콘텐츠 정책 필터
// Google 제한 정책 준용: CSAM / 폭력 조장 / 개인정보 / 스팸 / 성인 음란물

var _FILTER_RULES = [

  // ① 아동 성착취 (CSAM) ─────────────────────────────────────────────
  {
    id: 'csam',
    i18n: 'filter.csam',
    fallback: 'Child sexual exploitation content is prohibited by our policy.',
    pattern: /child\s*(sex|porn|nude|naked|exploit|abuse|molestation)|cp\s*porn|loli(ta)?\s*(sex|porn|nude|naked)|pedo(phil(e|ia|ic))?|minor\s*(sex|porn|nude|naked)|underage\s*(sex|porn|nude|naked|content)|아동\s*(음란|포르노|성착취|성폭력|성적\s*노출|성행위|나체)|미성년자\s*(성적|음란|포르노|성행위|나체)|아동포르노|아동음란물|소아성애/i,
  },

  // ② 음란물·성인 콘텐츠 (노골적 묘사·스팸 링크) ────────────────────
  {
    id: 'explicit_sexual',
    i18n: 'filter.explicit_sexual',
    fallback: 'Explicit pornographic content is prohibited by our policy.',
    // 뉴스·정책 논의("pornography regulation", "adult content law")는 허용
    // 포르노 사이트명 직접 언급, 야동 스팸 링크, 노골적 성행위 나열만 차단
    pattern: /\b(pornhub|xvideos|xnxx|redtube|youporn|brazzers|livejasmin|chaturbate)\b|야동\s*(사이트|링크|주소|모음)|성인\s*포르노\s*(사이트|주소|링크|모음|공유)|포르노\s*(사이트|주소|링크)\s*(공유|모음|추천)/i,
  },

  // ③ 실제 폭력 조장 ────────────────────────────────────────────────
  {
    id: 'violence',
    i18n: 'filter.violence',
    fallback: 'Content that incites actual violence is prohibited by our policy.',
    pattern: /(how\s+to\s+(make|build|create|synthesize)\s+(a\s+)?(bomb|explosive|poison|bioweapon|nerve\s+agent)|step[\s\-]by[\s\-]step\s+(to\s+)?(kill|murder|attack|bomb|shoot\s+up)|kill\s+all\s+(the\s+)?(jews?|muslims?|christians?|blacks?|whites?|asians?|infidels?)|genocide\s+(guide|manual|tutorial|how[\s-]to)|폭발물\s*(제조법|만드는\s*법|제조\s*방법|제작\s*방법)|살인\s*(가이드|튜토리얼|방법론|매뉴얼)|테러\s*(실행\s*방법|계획서|매뉴얼))/i,
  },

  // ④ 개인정보 (주민번호·카드번호) ────────────────────────────────────
  {
    id: 'personal_data',
    i18n: 'filter.personal_data',
    fallback: 'Input containing personal ID or credit card numbers is not allowed. Please remove sensitive information.',
    testFn: function(text) {
      var ssn  = /\d{6}-[1-4]\d{6}/.test(text);                               // 한국 주민등록번호
      var card = /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/.test(text); // 카드번호 16자리
      return ssn || card;
    },
  },

  // ⑤ 스팸·SEO 키워드 어뷰징 ──────────────────────────────────────────
  {
    id: 'spam',
    i18n: 'filter.spam',
    fallback: 'Spam or keyword stuffing detected. Please enter a genuine claim to fact-check.',
    testFn: function(text) {
      var words = text.trim().split(/\s+/);
      if (words.length < 15) return false;

      // 단어 반복 비율: 단일 단어가 전체의 30% 이상
      var freq = {};
      words.forEach(function(w) {
        var k = w.toLowerCase().replace(/[^\w가-힣]/g, '');
        if (k.length > 1) freq[k] = (freq[k] || 0) + 1;
      });
      var vals = Object.keys(freq).map(function(k) { return freq[k]; });
      var maxFreq = vals.length ? Math.max.apply(null, vals) : 0;
      if (maxFreq / words.length > 0.3) return true;

      // 동일 구문(10자 이상) 4회 이상 반복
      if (/(.{10,})\1{3,}/.test(text)) return true;

      return false;
    },
  },
];

/**
 * 입력 텍스트 정책 위반 검사
 * @param {string} text — 사용자 입력 원문
 * @returns {{ blocked: true, id: string, message: string } | null}
 */
function checkInputPolicy(text) {
  if (!text || text.trim().length < 3) return null;

  for (var i = 0; i < _FILTER_RULES.length; i++) {
    var rule = _FILTER_RULES[i];
    var hit  = rule.testFn
      ? rule.testFn(text)
      : (rule.pattern && rule.pattern.test(text));

    if (hit) {
      var msg = (typeof t === 'function') ? t(rule.i18n) : null;
      return { blocked: true, id: rule.id, message: msg || rule.fallback };
    }
  }
  return null;
}
