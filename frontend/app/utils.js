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
  // onclone + from(el) 방식은 window.pageYOffset(스크롤 오프셋)을
  // 클론 문서의 crop 좌표에 그대로 더해서 빈 캔버스가 생성되는 문제가 있음.
  // 해결: position:fixed z-index:최상위 독립 div에 클론 후 scrollX/Y:0 으로 캡처.
  var wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
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
      windowWidth: PDF_W,
      // 스크롤 오프셋 0 고정 — wrap은 position:fixed top:0 left:0 이므로
      scrollX:     0,
      scrollY:     0
    },
    jsPDF:     { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'], before: '.pdf-page-break' }
  };

  function cleanup() {
    if (document.body.contains(wrap)) document.body.removeChild(wrap);
  }

  html2pdf().set(opt).from(wrap).save().then(cleanup).catch(function(err) {
    console.error('PDF generation failed:', err);
    cleanup();
  });
}
