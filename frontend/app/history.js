// ① Client Layer — 히스토리 관리 (로컬 스토리지)

function saveHistory(input, result) {
  var item = {
    input:   input.slice(0, 100),
    score:   result.overall_score,
    grade:   result.overall_grade,
    verdict: result.verdict_class,
    ts:      Date.now(),
  };
  state.history.unshift(item);
  state.history = state.history.slice(0, 20);
  localStorage.setItem('ann_history', JSON.stringify(state.history));
  renderHistory();
}

function clearHistory() {
  state.history = [];
  localStorage.removeItem('ann_history');
  renderHistory();
}

function renderHistory() {
  var grid = document.getElementById('history-grid');
  if (!state.history.length) {
    grid.innerHTML = '<div class="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center text-slate-400 text-sm col-span-3 py-10"><span class="material-symbols-outlined text-3xl mb-2 block">search</span>Your recent fact-checks will appear here</div>';
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
  // data-* 기반 클릭 — innerHTML onclick XSS 방지
  grid.querySelectorAll('.hist-card').forEach(function(el) {
    el.addEventListener('click', function() {
      var h = state.history[parseInt(el.dataset.histIdx, 10)];
      if (h) rerunHistory(h.input);
    });
  });
}

function rerunHistory(input) {
  state.lastInput = input;
  var inputEl = document.getElementById('home-input');
  if (inputEl) inputEl.value = input;
  runCheck();
}
