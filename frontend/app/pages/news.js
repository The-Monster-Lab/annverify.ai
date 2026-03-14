// ① Client Layer — AI News 페이지

var NEWS_MOCK = [
  {id:1, title:"AI Regulation Bill Passes Senate Committee with Bipartisan Support",       cat:"Politics", grade:"A+", score:96, summary:"New AI governance framework requiring transparency disclosures from major AI labs moves to full Senate vote.",                                         date:"2h ago",  tag:"Trending"},
  {id:2, title:"GPT-5 Achieves PhD-Level Performance on 32 Scientific Benchmarks",         cat:"Tech",     grade:"A",  score:88, summary:"OpenAI's latest model demonstrates breakthrough reasoning capabilities across STEM disciplines.",                                                  date:"4h ago",  tag:"LLM"},
  {id:3, title:"Deepfake Video of World Leader Spreads Across Social Media",               cat:"Ethics",   grade:"F",  score:12, summary:"AI-generated video falsely attributed to a major world leader was debunked within 6 hours by three independent labs.",                            date:"5h ago",  tag:"Deepfakes"},
  {id:4, title:"Climate Scientists Confirm 2025 Was Hottest Year on Record",              cat:"Science",  grade:"A+", score:98, summary:"NASA and NOAA data confirms global mean temperature records broken for third consecutive year.",                                                   date:"6h ago",  tag:"Policy"},
  {id:5, title:"Viral Claim: '5G Towers Cause Memory Loss' — Debunked",                   cat:"Science",  grade:"F",  score:4,  summary:"No peer-reviewed evidence supports any link between 5G radio waves and neurological effects at permitted exposure levels.",                        date:"8h ago",  tag:"Trending"},
  {id:6, title:"Fed Signals Two Rate Cuts in 2026 Amid Cooling Inflation",                cat:"Finance",  grade:"B+", score:78, summary:"Federal Reserve officials indicated cautious optimism about inflation trajectory, with cuts contingent on data.",                                   date:"10h ago", tag:"Policy"},
];

function loadNews() {
  state.newsData = NEWS_MOCK;
  setTimeout(() => renderNews(), 500);
}

function filterNews() { renderNews(); }

function setNewsTag(tag) {
  state.newsTag = tag;
  document.querySelectorAll('#news-tag-filters button').forEach(b => {
    b.className = b.textContent.trim() === tag
      ? 'px-4 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold whitespace-nowrap'
      : 'px-4 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 whitespace-nowrap';
  });
  renderNews();
}

function loadMoreNews() { alert('Full archive coming in v2.0!'); }

function renderNews() {
  var sf    = document.getElementById('news-score-filter').value;
  var cf    = document.getElementById('news-cat-filter').value;
  var items = state.newsData.filter(n => {
    if (sf && !n.grade.startsWith(sf)) return false;
    if (cf && n.cat !== cf)            return false;
    return true;
  });
  var gradeClass = { A:'grade-A', 'A+':'grade-A', B:'grade-B', 'B+':'grade-B', C:'grade-C', D:'grade-D', F:'grade-F' };
  document.getElementById('news-grid').innerHTML = items.map(n => `
    <article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col">
      <div class="h-2 ${n.grade.startsWith('A') ? 'bg-emerald-400' : n.grade.startsWith('B') ? 'bg-blue-400' : n.grade === 'F' ? 'bg-red-400' : 'bg-amber-400'}"></div>
      <div class="p-6 flex flex-col flex-1">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex gap-2 flex-wrap">
            <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">${n.cat}</span>
            <span class="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide">7-Layer Verified</span>
          </div>
          <span class="flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-black ${gradeClass[n.grade] || 'grade-B'}">${n.grade}</span>
        </div>
        <h3 class="font-display font-bold text-slate-900 dark:text-white text-base leading-snug mb-3 flex-1">${escHtml(n.title)}</h3>
        <p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">${escHtml(n.summary)}</p>
        <div class="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
          <span class="text-xs text-slate-400">${n.date}</span>
          <div class="flex gap-2">
            <button onclick="previewClaim('${escHtml(n.title)}')" class="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold hover:border-primary hover:text-primary transition-all">View Source</button>
            <button onclick="goPage('community')" class="text-xs px-3 py-1.5 bg-primary/10 text-primary rounded-xl font-semibold hover:bg-primary/20 transition-all">Discuss</button>
          </div>
        </div>
      </div>
    </article>`).join('');
}

function previewClaim(title) {
  document.getElementById('home-input').value = title;
  goPage('home');
}
