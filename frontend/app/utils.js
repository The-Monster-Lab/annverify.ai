// ① Client Layer — 공통 유틸리티

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function shareReport() {
  var txt = 'ANN Verify Report\n\nClaim: ' + state.lastInput +
            '\nScore: ' + (state.lastResult && state.lastResult.overall_score || '--') +
            '\nGrade: ' + (state.lastResult && state.lastResult.overall_grade || '--');
  if (navigator.share) {
    navigator.share({ title: 'ANN Verify Report', text: txt });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  }
}

function downloadReport() {
  if (!state.lastResult) { alert('No report to download.'); return; }

  // Determine which report view is currently visible
  var el = document.getElementById('partner-report-view');
  if (el && !el.classList.contains('hidden')) {
    _downloadElementAsPdf(el, 'ann-partner-report-' + Date.now() + '.pdf');
    return;
  }
  el = document.getElementById('ai-news-article-view');
  if (el && !el.classList.contains('hidden')) {
    _downloadElementAsPdf(el, 'ann-news-report-' + Date.now() + '.pdf');
    return;
  }
  el = document.getElementById('report-result');
  if (el && !el.classList.contains('hidden')) {
    _downloadElementAsPdf(el, 'ann-report-' + Date.now() + '.pdf');
    return;
  }
  // fallback: entire page-report section
  el = document.getElementById('page-report');
  _downloadElementAsPdf(el, 'ann-report-' + Date.now() + '.pdf');
}

function _downloadElementAsPdf(el, filename) {
  // A4 portrait 콘텐츠 폭: (210mm - 좌우 10mm 마진×2) / 25.4 × 96dpi ≈ 718px
  var PDF_W = 718;

  // ── 독립 컨테이너 방식 ──────────────────────────────────────────
  // position:absolute top:0 left:0 → document 최상단 배치
  //   getBoundingClientRect().top = -scrollY, html2canvas 기본 scrollY = pageYOffset
  //   → crop top = -scrollY + scrollY = 0  (스크롤 보정 자동)
  // position:fixed 는 뷰포트 높이 이상 렌더링 안 되는 문제가 있어서 사용 불가.
  var wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:absolute', 'top:0', 'left:0',
    'width:' + PDF_W + 'px',
    'background:#ffffff',
    'overflow:visible',
    'z-index:99999',
    'pointer-events:none'
  ].join(';');

  var clone = el.cloneNode(true);
  clone.style.cssText = [
    'width:' + PDF_W + 'px!important',
    'max-width:' + PDF_W + 'px!important',
    'overflow:visible!important',
    'box-sizing:border-box!important'
  ].join(';');

  // 액션 버튼 제거
  clone.querySelectorAll('button, a[onclick]').forEach(function(b) {
    b.style.display = 'none';
  });

  // grid → display:block (인라인 스타일로 직접 강제)
  clone.querySelectorAll('[class]').forEach(function(node) {
    var c = typeof node.className === 'string' ? node.className : '';
    if (/\bgrid\b/.test(c)) node.style.display = 'block';
  });

  // 이미지 폭 제한
  clone.querySelectorAll('img').forEach(function(img) {
    img.style.maxWidth = '100%';
    img.style.height   = 'auto';
  });

  wrap.appendChild(clone);
  document.body.appendChild(wrap);

  var opt = {
    margin:      [10, 10, 10, 10],
    filename:    filename,
    image:       { type: 'jpeg', quality: 0.97 },
    html2canvas: {
      scale:       2,
      useCORS:     true,
      logging:     false,
      windowWidth: PDF_W
      // scrollX/Y 기본값(window.pageXOffset/pageYOffset) 사용 → absolute top:0 과 자동 보정
    },
    jsPDF:     { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  function cleanup() {
    if (document.body.contains(wrap)) document.body.removeChild(wrap);
  }

  // DOM 추가 후 브라우저 레이아웃 계산 대기 (즉시 캡처 시 빈 캔버스 문제 방지)
  setTimeout(function() {
    html2pdf().set(opt).from(wrap).save().then(cleanup).catch(function(err) {
      console.error('PDF generation failed:', err);
      cleanup();
    });
  }, 100);
}
