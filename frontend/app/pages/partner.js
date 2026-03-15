// ① Client Layer — Partner News 페이지

var PARTNERS = [
  {id:'reuters',  name:'Reuters',    trust:98, color:'#FF8000', icon:'R'},
  {id:'yonhap',   name:'Yonhap News',trust:94, color:'#005BAA', icon:'Y'},
  {id:'ap',       name:'AP News',    trust:97, color:'#CC0000', icon:'AP'},
  {id:'afp',      name:'AFP',        trust:95, color:'#003A70', icon:'AFP'},
  {id:'bloomberg',name:'Bloomberg',  trust:93, color:'#1D1D1B', icon:'B'},
  {id:'bbc',      name:'BBC News',   trust:91, color:'#BB1919', icon:'BBC'},
];

var PARTNER_ARTICLES = [
  {partner:'reuters',   title:'Federal Reserve Holds Rates, Eyes Data Before Cuts',          trust:98, time:'3h ago',  summary:'Fed officials remained cautious citing mixed labor market signals.'},
  {partner:'yonhap',    title:'South Korea Tech Giants Announce Joint AI Ethics Charter',    trust:92, time:'5h ago',  summary:'Samsung, LG, Kakao and Naver align on content authenticity principles.'},
  {partner:'ap',        title:'WHO Issues Updated Pandemic Preparedness Guidelines',         trust:97, time:'7h ago',  summary:'International health authority revises response protocols following COVID-19 lessons.'},
  {partner:'bloomberg', title:'Global EV Battery Supply Chain Report: 2026 Outlook',        trust:89, time:'9h ago',  summary:'Lithium shortfalls and manufacturing shifts reshape the global EV supply chain.'},
  {partner:'bbc',       title:'Climate Summit: Nations Agree on Carbon Credit Framework',   trust:91, time:'12h ago', summary:'150 nations reach consensus on voluntary carbon markets governance.'},
  {partner:'afp',       title:'CERN Researchers Report Potential New Particle Signature',   trust:95, time:'1d ago',  summary:'High-energy collision data shows anomaly requiring further analysis.'},
];

function loadPartner() {
  state.partnerData = PARTNER_ARTICLES;
  state.activePartner = 'all';
  renderPartners();
  renderPartnerArticles();
}

function renderPartners() {
  document.getElementById('partners-row').innerHTML = PARTNERS.map(p => {
    var isActive = state.activePartner === p.id;
    var cls = isActive
      ? 'border-primary bg-primary/5'
      : 'border-slate-200 dark:border-slate-700 hover:border-primary/40';
    return `
    <button onclick="filterByPartner('${p.id}')" class="flex-shrink-0 flex flex-col items-center gap-2 px-5 py-3 rounded-2xl border-2 transition-all ${cls}">
      <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-sm" style="background:${p.color}">${p.icon}</div>
      <span class="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">${p.name}</span>
      <span class="text-[10px] text-emerald-600 font-bold">${p.trust}% Trust</span>
    </button>`;
  }).join('');
}

function filterByPartner(id) {
  state.activePartner = id;
  renderPartnerArticles();
  renderPartners();
}

function setPartnerFilter() { state.activePartner = 'all'; renderPartnerArticles(); }
function filterPartner() { renderPartnerArticles(); }

function renderPartnerArticles() {
  var items      = state.partnerData.filter(a => state.activePartner === 'all' || a.partner === state.activePartner);
  var trustColor = t => t >= 90 ? 'text-emerald-600' : t >= 75 ? 'text-blue-600' : 'text-amber-600';
  document.getElementById('partner-articles').innerHTML = items.map(a => {
    var p = PARTNERS.find(p => p.id === a.partner) || { name:'Unknown', icon:'N', color:'#888' };
    return `<article class="flex gap-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-5 news-card">
      <div class="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-black text-sm" style="background:${p.color}">${p.icon}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-xs font-bold text-slate-500">${p.name}</span>
          <span class="text-slate-300">·</span>
          <span class="text-xs text-slate-400">${a.time}</span>
          <span class="ml-auto text-xs font-black ${trustColor(a.trust)}">${a.trust}% Trust</span>
        </div>
        <h3 class="font-bold text-slate-900 dark:text-white leading-snug mb-2">${escHtml(a.title)}</h3>
        <p class="text-sm text-slate-500 line-clamp-1">${escHtml(a.summary)}</p>
        <div class="flex gap-3 mt-3">
          <button onclick="previewClaim('${escHtml(a.title)}')" class="text-xs px-3 py-1.5 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors">ANN Verify</button>
          <button class="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-slate-600 hover:border-primary hover:text-primary transition-all">Original Article</button>
        </div>
      </div>
    </article>`;
  }).join('');
}
