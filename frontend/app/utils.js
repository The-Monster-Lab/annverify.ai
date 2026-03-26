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

  // 1) 원본 요소를 PDF 폭(718px) 컨테이너에 클론 → 폭 초과로 인한 잘림 방지
  var wrapper = document.createElement('div');
  wrapper.id = '_pdf_wrap';
  wrapper.style.cssText = [
    'position:fixed', 'top:-99999px', 'left:0',
    'width:' + PDF_W + 'px', 'background:#ffffff', 'overflow:visible', 'z-index:-1'
  ].join(';');
  document.body.appendChild(wrapper);

  var clone = el.cloneNode(true);
  // 액션 버튼 제거
  clone.querySelectorAll('button, a[onclick]').forEach(function(b) { b.style.display = 'none'; });
  // 클론 루트 폭 고정
  clone.style.cssText = 'width:' + PDF_W + 'px !important;max-width:' + PDF_W + 'px !important;overflow:visible !important;';
  wrapper.appendChild(clone);

  // 2) PDF 전용 스타일 주입
  var style = document.createElement('style');
  style.id = '_pdf_style';
  style.textContent = [
    '#_pdf_wrap * { box-sizing:border-box !important; max-width:100% !important; overflow-wrap:break-word !important; word-break:break-word !important; }',
    '#_pdf_wrap img { max-width:100% !important; height:auto !important; }',
    '#_pdf_wrap .grid { display:block !important; }',
    '#_pdf_wrap .grid > * { width:100% !important; margin-bottom:12px !important; }',
    '#_pdf_wrap .flex { flex-wrap:wrap !important; }',
    '#_pdf_wrap pre, #_pdf_wrap code { white-space:pre-wrap !important; word-break:break-all !important; }',
    'p, h1, h2, h3, h4, li, td, th, .pdf-no-break { page-break-inside:avoid !important; }',
    'img { page-break-inside:avoid !important; }'
  ].join('\n');
  document.head.appendChild(style);

  var opt = {
    margin:      [10, 10, 10, 10],
    filename:    filename,
    image:       { type: 'jpeg', quality: 0.97 },
    html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: PDF_W },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: ['avoid-all', 'css', 'legacy'], before: '.pdf-page-break' }
  };

  html2pdf().set(opt).from(clone).save().then(function() {
    document.body.removeChild(wrapper);
    var s = document.getElementById('_pdf_style');
    if (s) s.remove();
  }).catch(function(err) {
    console.error('PDF generation failed:', err);
    document.body.removeChild(wrapper);
    var s = document.getElementById('_pdf_style');
    if (s) s.remove();
  });
}
