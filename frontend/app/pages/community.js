// ① Client Layer — Community 페이지

var COMMUNITY_MOCK = [
  {id:1, title:'Is AI really replacing 40% of jobs by 2030?',                               score:62, yes:45, partial:30, no:25, comments:34,  date:'2h ago',  tag:'Tech'},
  {id:2, title:'Climate models predict 4°C rise by 2100 — verified?',                      score:87, yes:71, partial:18, no:11, comments:52,  date:'5h ago',  tag:'Science'},
  {id:3, title:'Viral: "New study shows coffee prevents Alzheimer\'s"',                     score:43, yes:28, partial:42, no:30, comments:19,  date:'8h ago',  tag:'Health'},
  {id:4, title:'Did the Senate pass a net neutrality bill last week?',                      score:92, yes:84, partial:10, no:6,  comments:67,  date:'1d ago',  tag:'Politics'},
  {id:5, title:'Social media causes depression in teenagers — evidence?',                   score:71, yes:55, partial:35, no:10, comments:88,  date:'1d ago',  tag:'Health'},
  {id:6, title:'"Eating red meat 3x/week doubles heart disease risk" — true?',              score:58, yes:38, partial:40, no:22, comments:41,  date:'2d ago',  tag:'Health'},
];

function loadCommunity() {
  state.communityData = COMMUNITY_MOCK;
  renderCommunity();
}

function setCommunityTab(tab) {
  ['popular','recent','my'].forEach(t => {
    var btn = document.getElementById('ctab-' + t);
    btn.className = t === tab
      ? 'pb-3 text-sm font-bold border-b-2 border-primary text-primary px-1'
      : 'pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-1 border-b-2 border-transparent';
  });
  renderCommunity(tab);
}

function renderCommunity(tab) {
  var items      = state.communityData;
  if (tab === 'my') items = [];
  var scoreColor = s => s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-blue-600' : s >= 40 ? 'text-amber-600' : 'text-red-600';
  document.getElementById('community-grid').innerHTML = items.length
    ? items.map(item => `
      <article class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 news-card">
        <div class="flex items-start justify-between gap-3 mb-4">
          <span class="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full">${item.tag}</span>
          <span class="text-lg font-black ${scoreColor(item.score)}">${item.score}</span>
        </div>
        <h3 class="font-display font-bold text-slate-900 dark:text-white leading-snug mb-5">${escHtml(item.title)}</h3>
        <div class="flex gap-2 mb-5">
          <button class="flex-1 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-100 transition-colors">
            ✓ Yes Verified <span class="font-normal opacity-70">${item.yes}%</span>
          </button>
          <button class="flex-1 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-100 transition-colors">
            ~ Partial <span class="font-normal opacity-70">${item.partial}%</span>
          </button>
          <button class="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-bold hover:bg-red-100 transition-colors">
            ✗ No <span class="font-normal opacity-70">${item.no}%</span>
          </button>
        </div>
        <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          <button onclick="previewClaim('${escHtml(item.title)}')" class="text-xs text-primary font-bold flex items-center gap-1 hover:underline">
            <span class="material-symbols-outlined text-sm">bolt</span>ANN Verify
          </button>
          <div class="flex items-center gap-3 text-slate-400">
            <span class="flex items-center gap-1 text-xs"><span class="material-symbols-outlined text-sm">comment</span>${item.comments}</span>
            <span class="text-xs">${item.date}</span>
          </div>
        </div>
      </article>`).join('')
    : `<div class="col-span-2 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">forum</span>
        <p class="mb-4">${tab === 'my' ? "You haven't verified any claims yet." : 'No discussions found.'}</p>
        <button onclick="goPage('home')" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Start Verifying</button>
      </div>`;
}
