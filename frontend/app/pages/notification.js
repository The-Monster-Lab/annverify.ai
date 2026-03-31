// ① Client Layer — Notification 페이지
// Firestore: announcements 컬렉션
// 필드: title(string), content(HTML), active(boolean), createdAt(Timestamp), updatedAt(Timestamp)

var _notifPageSize  = 15;
var _notifCurrent   = 1;
var _notifTotal     = 0;
var _notifAllDocs   = [];   // active:true 문서 캐시
var _notifLoaded    = false;

// ── 날짜 포맷 ─────────────────────────────────────────────────────────
function _notifFmtDate(ts) {
  var ms = ts && ts.seconds ? ts.seconds * 1000 : (ts || 0);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── 리스트 렌더링 ─────────────────────────────────────────────────────
function _renderNotifList(docs, page) {
  var listEl = document.getElementById('notif-list');
  if (!listEl) return;

  if (!docs.length) {
    listEl.innerHTML = '<div class="py-16 text-center text-slate-400">'
      + '<span class="material-symbols-outlined text-4xl mb-3 block">notifications_off</span>'
      + '<p>등록된 공지사항이 없습니다.</p></div>';
    return;
  }

  var start = (page - 1) * _notifPageSize;
  var slice = docs.slice(start, start + _notifPageSize);

  listEl.innerHTML = slice.map(function(d, idx) {
    var num     = _notifTotal - start - idx;
    var title   = escHtml(d.title || '(제목 없음)');
    var content = d.content || '';             // HTML 그대로 렌더
    var date    = _notifFmtDate(d.createdAt);

    return '<div class="px-5 sm:px-7 py-4 sm:py-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" '
      + 'onclick="_toggleNotifDetail(this)">'
      + '<div class="flex items-start gap-4">'

      // 번호
      + '<div class="shrink-0 w-7 pt-0.5 text-center text-sm text-slate-400 font-medium">' + num + '</div>'

      // 제목 + 본문
      + '<div class="flex-1 min-w-0">'
      + '<p class="text-sm sm:text-[15px] font-semibold text-slate-800 dark:text-white leading-snug">' + title + '</p>'
      + (content
          ? '<div class="notif-detail hidden mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">'
            + content + '</div>'
          : '')
      + '</div>'

      // 날짜 + 토글 화살표
      + '<div class="shrink-0 flex flex-col items-end gap-1">'
      + '<span class="text-[11px] text-slate-400 whitespace-nowrap">' + date + '</span>'
      + (content ? '<span class="material-symbols-outlined text-slate-300 dark:text-slate-600 notif-arrow transition-transform" style="font-size:16px">expand_more</span>' : '')
      + '</div>'

      + '</div>'
      + '</div>';
  }).join('');
}

// ── 본문 토글 ─────────────────────────────────────────────────────────
function _toggleNotifDetail(rowEl) {
  var detail = rowEl.querySelector('.notif-detail');
  var arrow  = rowEl.querySelector('.notif-arrow');
  if (!detail) return;
  var nowHidden = detail.classList.toggle('hidden');
  if (arrow) arrow.style.transform = nowHidden ? '' : 'rotate(180deg)';
}

// ── 페이지네이션 렌더링 ───────────────────────────────────────────────
function _renderNotifPagination(current, total, pageSize) {
  var paginEl = document.getElementById('notif-pagination');
  if (!paginEl) return;

  var totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { paginEl.classList.add('hidden'); return; }
  paginEl.classList.remove('hidden');

  var btnBase = 'inline-flex items-center justify-center w-9 h-9 rounded-xl text-sm font-medium transition-colors';
  var btnActive = btnBase + ' bg-primary text-white shadow';
  var btnInactive = btnBase + ' text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800';
  var btnDisabled = btnBase + ' text-slate-300 dark:text-slate-700 cursor-default';

  var html = '';

  // Prev
  html += current > 1
    ? '<button class="' + btnInactive + '" onclick="loadNotifications(' + (current - 1) + ')">'
      + '<span class="material-symbols-outlined" style="font-size:18px">chevron_left</span></button>'
    : '<span class="' + btnDisabled + '"><span class="material-symbols-outlined" style="font-size:18px">chevron_left</span></span>';

  // 페이지 번호 (최대 7개 표시)
  var start = Math.max(1, current - 3);
  var end   = Math.min(totalPages, start + 6);
  if (end - start < 6) start = Math.max(1, end - 6);

  if (start > 1) {
    html += '<button class="' + btnInactive + '" onclick="loadNotifications(1)">1</button>';
    if (start > 2) html += '<span class="' + btnDisabled + '">…</span>';
  }

  for (var p = start; p <= end; p++) {
    html += p === current
      ? '<button class="' + btnActive + '">' + p + '</button>'
      : '<button class="' + btnInactive + '" onclick="loadNotifications(' + p + ')">' + p + '</button>';
  }

  if (end < totalPages) {
    if (end < totalPages - 1) html += '<span class="' + btnDisabled + '">…</span>';
    html += '<button class="' + btnInactive + '" onclick="loadNotifications(' + totalPages + ')">' + totalPages + '</button>';
  }

  // Next
  html += current < totalPages
    ? '<button class="' + btnInactive + '" onclick="loadNotifications(' + (current + 1) + ')">'
      + '<span class="material-symbols-outlined" style="font-size:18px">chevron_right</span></button>'
    : '<span class="' + btnDisabled + '"><span class="material-symbols-outlined" style="font-size:18px">chevron_right</span></span>';

  paginEl.innerHTML = html;
}

// ── 메인 로드 함수 ────────────────────────────────────────────────────
function loadNotifications(page) {
  page = page || 1;
  _notifCurrent = page;

  // 이미 캐시된 경우 바로 렌더
  if (_notifLoaded) {
    _renderNotifList(_notifAllDocs, page);
    _renderNotifPagination(page, _notifTotal, _notifPageSize);
    window.scrollTo(0, 0);
    return;
  }

  // 로딩 스피너
  var listEl = document.getElementById('notif-list');
  if (listEl) {
    listEl.innerHTML = '<div class="py-16 text-center text-slate-400">'
      + '<span class="material-symbols-outlined text-4xl mb-3 block" style="animation:spin 1s linear infinite">progress_activity</span>'
      + '<p>Loading…</p></div>';
  }

  var _apply = function(docs) {
    _notifAllDocs = docs;
    _notifTotal   = docs.length;
    _notifLoaded  = true;
    _renderNotifList(_notifAllDocs, page);
    _renderNotifPagination(page, _notifTotal, _notifPageSize);
  };

  var _fail = function() {
    if (listEl) listEl.innerHTML = '<div class="py-16 text-center text-slate-400">공지사항을 불러오지 못했습니다.</div>';
  };

  // Firestore: announcements, active:true 필터 + createdAt 내림차순
  db.collection('announcements')
    .where('active', '==', true)
    .orderBy('createdAt', 'desc')
    .get()
    .then(function(snap) {
      _apply(snap.docs.map(function(d) { return Object.assign({ _id: d.id }, d.data()); }));
    })
    .catch(function(err) {
      console.warn('announcements 복합 인덱스 미배포, 클라이언트 필터 폴백:', err);
      // 복합 인덱스 배포 전 폴백: createdAt 정렬 후 클라이언트 필터
      db.collection('announcements')
        .orderBy('createdAt', 'desc')
        .get()
        .then(function(snap) {
          var docs = snap.docs
            .filter(function(d) { return d.data().active === true; })
            .map(function(d) { return Object.assign({ _id: d.id }, d.data()); });
          _apply(docs);
        })
        .catch(_fail);
    });
}
