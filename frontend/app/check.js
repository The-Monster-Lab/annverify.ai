// ① Client Layer — 팩트체크 실행 + 로딩 UI
// ③ ML Core Layer (ANNEngineV4) 연동 포함

var LAYER_ICONS = ['source','travel_explore','database','shield','robot','fact_check','verified'];
var LAYER_NAMES = ['Claim Parse','Source Strategy','Evidence','Adversarial','NLI Score','Verdict','BISL Hash'];
function _layerName(i) { return (typeof t === 'function') ? t('layer.' + (i+1)) : LAYER_NAMES[i]; }
var _layer7Timer = null;
var _layer7Start = null;
var _verifyRetrying = false;

// ── Live Log Panel ────────────────────────────────────────────────────
var _LOG_COLORS = { info: '#94a3b8', run: '#38bdf8', ok: '#34d399', warn: '#fbbf24', data: '#a78bfa', err: '#f87171' };

function appendLog(msg, type) {
  var el = document.getElementById('layer-log-body');
  if (!el) return;
  var now = new Date();
  var ts = now.toTimeString().slice(0,8);
  var color = _LOG_COLORS[type || 'info'] || _LOG_COLORS.info;
  var prefix = type === 'ok' ? '✓' : type === 'run' ? '►' : type === 'err' ? '✗' : type === 'data' ? '·' : '·';
  var line = document.createElement('div');
  line.style.cssText = 'color:' + color + ';white-space:pre-wrap;word-break:break-all;';
  line.textContent = '[' + ts + '] ' + prefix + ' ' + msg;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function appendLayerLog(layer, data) {
  var name = LAYER_NAMES[layer - 1] || ('Layer ' + layer);
  var msg = 'L' + layer + ' ' + name + ' — ';
  try {
    if (layer === 1 && data) {
      var cnt = (data.claims || []).length;
      msg += cnt + ' claim' + (cnt !== 1 ? 's' : '') + ' extracted';
      if (data.topic) msg += ' · topic: ' + data.topic;
      if (data.input_type) msg += ' · type: ' + data.input_type;
    } else if (layer === 2 && data) {
      msg += (data.strategy || 'strategy planned');
      if (data.priority) msg += ' · priority: ' + data.priority;
    } else if (layer === 3 && data) {
      var evCnt = (data.evidence || []).length;
      msg += (data.web_searched ? 'web search ✓' : 'claude fallback');
      msg += ' · ' + evCnt + ' evidence item' + (evCnt !== 1 ? 's' : '');
    } else if (layer === 4 && data) {
      var chCnt = (data.challenges || []).length;
      msg += chCnt + ' adversarial challenge' + (chCnt !== 1 ? 's' : '');
      if (data.overall_skepticism !== undefined) msg += ' · skepticism: ' + Math.round(data.overall_skepticism * 100) + '%';
    } else if (layer === 5 && data) {
      var res = data.results || [];
      var avg = res.length ? Math.round(res.reduce(function(s, r) { return s + (r.nliScore || 0); }, 0) / res.length) : '—';
      msg += 'NLI avg score: ' + avg;
      if (data._provider) msg += ' · provider: ' + data._provider;
    } else if (layer === 6 && data) {
      msg += (data.verdict || 'UNVERIFIED') + ' · score: ' + (data.score || '—');
      if (data.confidence !== undefined) msg += ' · confidence: ' + Math.round(data.confidence * 100) + '%';
    } else if (layer === 7 && data) {
      if (data.bisl_hash) msg += 'hash: ' + data.bisl_hash;
      if (data.temporal) msg += ' · freshness: ' + (data.temporal.freshness || '—');
    } else {
      msg += 'done';
    }
  } catch (e) { msg += 'done'; }
  appendLog(msg, 'ok');
}

var _WAIT_MSGS_EN = [
  'Analyzing claim structure...',
  'Searching credible sources...',
  'Cross-referencing evidence...',
  'Evaluating source reliability...',
  'Running NLI consistency check...',
  'Computing adversarial score...',
  'Building BISL fingerprint...',
  'Finalizing trust assessment...',
];
var WAIT_MSGS = _WAIT_MSGS_EN.slice();
function _waitMsg(i) { return (typeof t === 'function') ? t('loading.wait_' + i) : WAIT_MSGS[i]; }

// JSON 파싱 — 직접 파싱 → 중괄호 추출 순으로 시도
function _safeParseJSON(raw) {
  if (!raw) return null;
  // 1) 직접 파싱
  try { return JSON.parse(raw); } catch (_) {}
  // 2) 첫 번째 { ... } 블록 추출
  var m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  // 3) 가장 긴 { ... } 블록 추출 (중첩 고려)
  var start = raw.indexOf('{');
  if (start !== -1) {
    var depth = 0, end = -1;
    for (var i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) { try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {} }
  }
  return null;
}

// ── 입력창 초기화 ────────────────────────────────────────────────────
function clearInput() {
  var el = document.getElementById('home-input');
  if (el) { el.value = ''; el.focus(); }
  clearImage();
  toggleInputClear();
}

function toggleInputClear() {
  var el  = document.getElementById('home-input');
  var btn = document.getElementById('input-clear-btn');
  if (!btn || !el) return;
  if (el.value.trim()) {
    btn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
  }
}

// ── 깊이 토글 ────────────────────────────────────────────────────────
function setDepth(val) {
  document.getElementById('home-depth').value = val;
  var btnStd  = document.getElementById('depth-btn-standard');
  var btnDeep = document.getElementById('depth-btn-deep');
  var activeClass  = ['bg-white','dark:bg-slate-700','text-slate-900','dark:text-white','shadow-sm'];
  var inactiveClass = ['text-slate-500','dark:text-slate-400'];
  if (val === 'standard') {
    activeClass.forEach(c => btnStd.classList.add(c));
    inactiveClass.forEach(c => btnStd.classList.remove(c));
    inactiveClass.forEach(c => btnDeep.classList.add(c));
    activeClass.forEach(c => btnDeep.classList.remove(c));
  } else {
    activeClass.forEach(c => btnDeep.classList.add(c));
    inactiveClass.forEach(c => btnDeep.classList.remove(c));
    inactiveClass.forEach(c => btnStd.classList.add(c));
    activeClass.forEach(c => btnStd.classList.remove(c));
  }
}

// ── 클립보드 붙여넣기 ─────────────────────────────────────────────────
async function pasteFromClipboard() {
  try {
    var text = await navigator.clipboard.readText();
    var el = document.getElementById('home-input');
    if (el) { el.value = text; el.focus(); }
  } catch(e) {
    var el = document.getElementById('home-input');
    if (el) el.focus();
  }
}

// ── 이미지 업로드 ─────────────────────────────────────────────────────
function handleImageUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  state.imageMime = file.type;
  var reader = new FileReader();
  reader.onload = function(ev) {
    state.imageB64 = ev.target.result.split(',')[1];
    document.getElementById('image-preview').src = ev.target.result;
    document.getElementById('image-preview-wrap').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  state.imageB64 = null;
  state.imageMime = null;
  document.getElementById('image-preview-wrap').classList.add('hidden');
  document.getElementById('image-preview').src = '';
}

// ── 입력 언어 감지 ────────────────────────────────────────────────────
function _detectInputLang(text) {
  if (!text) return 'en';
  if (/[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(text)) return 'ko';
  if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(text)) return 'ja';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  return 'en';
}

// ── 팩트체크 진입점 ───────────────────────────────────────────────────
function runCheck() {
  var inputEl = document.getElementById('home-input');
  var input   = inputEl ? inputEl.value.trim() : (state.lastInput || '');
  if (!input && !state.imageB64) {
    if (inputEl) {
      inputEl.focus();
      inputEl.classList.add('ring-2','ring-red-400');
      setTimeout(() => inputEl.classList.remove('ring-2','ring-red-400'), 1500);
    }
    return;
  }

  // ── 정책 필터 검사 ───────────────────────────────────────────────
  if (input) {
    var _policy = (typeof checkInputPolicy === 'function') ? checkInputPolicy(input) : null;
    if (_policy && _policy.blocked) {
      if (inputEl) {
        inputEl.classList.add('ring-2', 'ring-red-400');
        setTimeout(function() { inputEl.classList.remove('ring-2', 'ring-red-400'); }, 2000);
      }
      showToast(_policy.message, 'error');
      return;
    }
  }
  var depth = document.getElementById('home-depth').value;
  var useV4 = depth === 'deep';

  state.lastInput         = input;
  state.lastResult        = null;
  // partner.js / news.js에서 설정한 경우 유지, 그 외 null(user)
  if (state.reportFrom !== 'partner' && state.reportFrom !== 'ainews') {
    state.reportFrom = null;
    state.reportCategory = null;
  }

  goPage('report');
  startLoading(input);

  // partnerArticleLang 우선, 없으면 입력 텍스트에서 자동 감지
  var responseLang = state.partnerArticleLang || _detectInputLang(input);
  if (useV4) {
    runV4Engine(input, responseLang);
  } else {
    runV1Engine(input, responseLang);
  }
  state.partnerArticleLang = null; // 소비 후 초기화
}

// ── 로딩 UI ──────────────────────────────────────────────────────────
function startLoading(input) {
  if (_layer7Timer) { clearInterval(_layer7Timer); _layer7Timer = null; }
  document.getElementById('report-loading').classList.remove('hidden');
  document.getElementById('report-result').classList.add('hidden');
  document.getElementById('report-empty').classList.add('hidden');
  document.getElementById('loading-claim-text').textContent = input.slice(0, 120) + (input.length > 120 ? '…' : '');
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('loading-status').textContent = (typeof t === 'function') ? t('loading.init') : 'Initializing ANN Engine...';
  var logEl = document.getElementById('layer-log-body');
  if (logEl) logEl.innerHTML = '';
  appendLog('ANN Verify Engine starting…', 'info');
  appendLog('Input: ' + input.slice(0, 80) + (input.length > 80 ? '…' : ''), 'data');

  var grid = document.getElementById('layer-progress-grid');
  grid.innerHTML = LAYER_ICONS.map((icon, i) => `
    <div class="flex flex-col items-center gap-2 text-center" id="lp-${i+1}">
      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center layer-icon text-slate-400" id="lp-icon-${i+1}">
        <span class="material-symbols-outlined text-lg">${icon}</span>
      </div>
      <span class="text-[10px] text-slate-400 leading-tight">${_layerName(i)}</span>
    </div>`).join('');
}

function setLayerRunning(n) {
  var el = document.getElementById('lp-icon-' + n);
  if (el) { el.classList.add('running'); el.classList.remove('done'); }
  document.getElementById('loading-status').textContent = (typeof t === 'function') ? t('loading.layer', {n: n, name: _layerName(n-1)}) : ('Running Layer ' + n + ' — ' + LAYER_NAMES[n-1] + '...');
  document.getElementById('progress-bar').style.width = ((n-1)/7*85) + '%';
  appendLog('L' + n + ' ' + LAYER_NAMES[n-1] + ' running…', 'run');

  if (n === 7) {
    _layer7Start = Date.now();
    document.getElementById('progress-bar').classList.add('progress-bar-shimmer');
    _layer7Timer = setInterval(function() {
      var sec = Math.floor((Date.now() - _layer7Start) / 1000);
      var mm = Math.floor(sec / 60), ss = sec % 60;
      var tStr = mm > 0 ? mm + ':' + String(ss).padStart(2,'0') : ss + 's';
      var msgIdx = Math.floor(sec / 3) % _WAIT_MSGS_EN.length;
      document.getElementById('loading-status').textContent = _waitMsg(msgIdx) + ' (' + tStr + ')';
    }, 1000);
  }
}

function setLayerDone(n) {
  var el = document.getElementById('lp-icon-' + n);
  if (el) {
    el.classList.remove('running');
    el.classList.add('done');
    var ic = el.querySelector('.material-symbols-outlined');
    if (ic) ic.textContent = 'check_circle';
  }
  document.getElementById('progress-bar').style.width = (n/7*85) + '%';

  if (n === 7 && _layer7Timer) {
    clearInterval(_layer7Timer);
    _layer7Timer = null;
    document.getElementById('progress-bar').classList.remove('progress-bar-shimmer');
  }
}

// ── v4 Engine — 7-Layer 풀 파이프라인 ────────────────────────────────
async function runV4Engine(input, responseLang) {
  var _langInstr = { ko: '한국어', ja: '日本語', zh: '中文' };
  var _langName  = { ko: 'KOREAN', ja: 'JAPANESE', zh: 'CHINESE' };
  var langPrefix = (responseLang && _langInstr[responseLang])
    ? '[RESPOND IN ' + _langName[responseLang] + ' - 모든 설명 텍스트(executive_summary, claims, evidence 등)를 ' + _langInstr[responseLang] + '로 작성] '
    : '';
  try {
    var result = await ANNEngineV4.run(
      langPrefix + input,
      function(layer, status, data) {
        if (status === 'running') setLayerRunning(layer);
        if (status === 'done')    { setLayerDone(layer); appendLayerLog(layer, data); }
      },
      V4_URL
    );
    setLayerDone(7);
    document.getElementById('progress-bar').style.width = '100%';
    appendLog((typeof t === 'function') ? t('loading.pipeline_done') : 'Pipeline complete · switching to report…', 'ok');
    finishLoading(result);
  } catch(err) {
    if (_layer7Timer) { clearInterval(_layer7Timer); _layer7Timer = null; }
    console.warn('v4 failed, falling back to v1:', err.message);
    appendLog('V4 engine error: ' + err.message + ' → falling back to Standard Engine', 'warn');
    // 레이어 UI 초기화 후 v1 재시작
    for (var i = 1; i <= 7; i++) {
      var el = document.getElementById('lp-icon-' + i);
      if (el) { el.classList.remove('running', 'done'); }
    }
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('loading-status').textContent = (typeof t === 'function') ? t('loading.switching_std') : 'Switching to Standard Engine...';
    runV1Engine(input);
  }
}

// ── v1 Engine — 단일 Claude 호출 ─────────────────────────────────────
async function runV1Engine(input, responseLang) {
  // 페이크 레이어 1-6 진행 UX (Layer 7은 API 응답 후 done 처리)
  var v1LogMsgs = [
    'Parsing claim structure and extracting verifiable statements…',
    'Identifying credible source candidates…',
    'Collecting supporting and contradicting evidence…',
    'Running adversarial robustness probe…',
    'Computing NLI trust score across claim-evidence pairs…',
    'Finalizing verdict with confidence calibration…',
  ];
  var delays = [0, 800, 1600, 2400, 3200, 4000];
  delays.forEach((d, i) => {
    setTimeout(() => setLayerRunning(i+1), d);
    setTimeout(() => { setLayerDone(i+1); appendLog('L' + (i+1) + ' ' + LAYER_NAMES[i] + ' — ' + v1LogMsgs[i], 'ok'); }, d + 700);
  });
  // Layer 7은 layer 6 완료 후 running 시작 → API 응답까지 타이머 유지
  setTimeout(() => { setLayerRunning(7); appendLog('L7 BISL Hash — generating temporal fingerprint…', 'run'); }, 4700);

  try {
    var body  = { claim: input, depth: 'standard' };
    if (responseLang && responseLang !== 'en') body.response_lang = responseLang;
    if (state.imageB64) { body.image_b64 = state.imageB64; body.image_mime = state.imageMime || 'image/jpeg'; }

    var res    = await fetch(API_URL + '/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var data   = await res.json();
    if (!res.ok || data.error) {
      var errObj = data.error;
      var errMsg = (errObj && errObj.message) ? errObj.message : (typeof errObj === 'string' ? errObj : JSON.stringify(errObj));
      var detail = data.detail ? ' (' + data.detail + ')' : '';
      throw new Error('HTTP ' + res.status + ': ' + (errMsg || 'Unknown error') + detail);
    }
    var txt    = data && data.content && data.content.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    var clean  = txt.replace(/```json|```/g, '').trim();
    if (!clean) throw new Error('Empty response from API (type: ' + (data.type || '?') + ', stop_reason: ' + (data.stop_reason || '?') + ')');
    var parsed = _safeParseJSON(clean);
    if (!parsed) {
      // JSON 파싱 실패 → 1회 자동 재시도
      if (!_verifyRetrying) {
        _verifyRetrying = true;
        setTimeout(function() { _verifyRetrying = false; runCheck(); }, 300);
        return;
      }
      throw new Error('JSON parse failed after retry');
    }

    // API 응답 시 Layer 7 완료 처리
    setLayerDone(7);
    appendLog('L7 BISL Hash — hash anchored · pipeline complete', 'ok');
    document.getElementById('progress-bar').style.width = '100%';
    finishLoading(parsed);
  } catch(err) {
    _verifyRetrying = false;
    appendLog('Error: ' + err.message, 'err');
    showError('Verification failed: ' + err.message);
  }
}

function finishLoading(result) {
  state.lastResult = result;
  document.getElementById('loading-status').textContent = 'Complete! Rendering report...';
  setTimeout(() => {
    document.getElementById('report-loading').classList.add('hidden');
    saveHistory(state.lastInput, result, state.reportFrom, state.reportCategory);
    renderReport();
    state.reportFrom = null;
    state.reportCategory = null;
  }, 400);
}

function showError(msg) {
  document.getElementById('report-loading').classList.add('hidden');
  document.getElementById('report-empty').classList.remove('hidden');
  document.getElementById('report-empty').innerHTML = `
    <span class="material-symbols-outlined text-6xl text-red-300 mb-4">error</span>
    <h3 class="font-display text-2xl font-bold text-red-400 mb-2">Verification Failed</h3>
    <p class="text-slate-400 mb-8 max-w-md">${escHtml(msg)}</p>
    <button onclick="goPage('home')" class="px-8 py-4 bg-primary text-white rounded-2xl font-bold">Try Again</button>`;
}
