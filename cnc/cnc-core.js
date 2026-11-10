// ===== CNC 주문 로직 (화면 코드 없음) =====
// 이 파일은 "데이터를 어떻게 다루는지"만 담당해요. 화면(HTML)은 ui/ 폴더가 그려요.
//
//  1) 주문 작성 중 데이터(draft) 만들기 / 자동 저장 / 불러오기 / 지우기
//  2) 단계별 입력 검사
//  3) 파일 추가 규칙 (형식·크기·개수)
//  4) cases(주문 내용) 만들기
//  5) 파일 업로드 (비공개 버킷 cnc-files)
//  6) 주문 제출 (DB 함수 create_cnc_order — 크레딧 차감까지 한 번에)
//  7) 주문 조회, 고객 액션 (수정·취소·승인·수정 요청·수령)
//  8) 크레딧 잔액·이력, 프로필 저장
//
// 로그인한 사용자 정보는 app.js 의 APP.user (Supabase 사용자), APP.profile (profiles 행) 에 있어요.

var CNC_FILES_BUCKET = 'cnc-files';
var CNC_DESIGNS_BUCKET = 'cnc-designs';
var CNC_DRAFT_PREFIX = 'allabut_cnc_draft_';   // + user_id
var CNC_PAGE_SIZE = 20;

// 서버(DB 함수)가 돌려주는 에러 코드 목록
var CNC_ERROR_CODES = [
  'INSUFFICIENT_CREDITS', 'NO_TEETH', 'DELIVERY_REQUIRED', 'NOT_LOGGED_IN',
  'NOT_EDITABLE', 'NOT_CANCELLABLE', 'NOT_FOUND', 'NOTE_REQUIRED', 'INVALID_ACTION', 'NOT_ADMIN',
  'CANNOT_CANCEL_AFTER_MILLING'   // DB 트리거 prevent_late_cancel: 가공 시작 후 취소 막기
];
// 앱 안에서 만드는 에러 코드 (서버 메시지에서 찾지 않음)
var CNC_APP_ERROR_CODES = ['UPLOAD_FAILED', 'NETWORK', 'STAGE_CHANGED', 'NO_FILES', 'FILE_TOO_LARGE', 'INVALID_AMOUNT', 'BALANCE_NEGATIVE', 'DUPLICATE_PACKAGE', 'DUPLICATE_VERSION'];
// 충전·환불 관련 서버 에러 코드 (sql/002_credit_topups.sql)
CNC_ERROR_CODES = CNC_ERROR_CODES.concat(['PACKAGE_NOT_FOUND', 'SLIP_INVALID', 'SLIP_NOT_FOUND', 'TOO_MANY_PENDING', 'ALREADY_REVIEWED',
  'AMOUNT_TOO_HIGH', 'LOT_NOT_REFUNDABLE', 'NO_LOTS', 'BALANCE_NEGATIVE', 'INVALID_AMOUNT', 'VERSION_OUTDATED']);
// 무료 크레딧 · 등록 치과 정보 (sql/008_free_credits.sql)
//   bonus_address_only: 산 크레딧이 모자라는데 무료 크레딧은 "무료 크레딧으로 주문하기"(등록 정보 배송)에서만 쓸 수 있을 때
CNC_ERROR_CODES = CNC_ERROR_CODES.concat(['bonus_address_only', 'NO_REGISTERED_CLINIC', 'ALREADY_REVIEWED']);
// 관리자 무료 크레딧 지급·회수 (sql/009_free_credit_grants.sql)
CNC_ERROR_CODES = CNC_ERROR_CODES.concat(['EVENT_REQUIRED', 'REASON_REQUIRED']);


// ================================================================
// 0) 작은 도구들
// ================================================================

// 오늘 날짜 'YYYY-MM-DD' (내 컴퓨터 시간 기준)
function cncToday() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

// 짧은 무작위 id (파일 목록 구분용)
function cncRandomId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// 에러 → 코드 하나로 정리 ('INSUFFICIENT_CREDITS', 'NETWORK', 'UPLOAD_FAILED', 'UNKNOWN' ...)
function cncErrorCode(err) {
  if (!err) return 'UNKNOWN';
  if (err.code && (CNC_ERROR_CODES.indexOf(err.code) !== -1 || CNC_APP_ERROR_CODES.indexOf(err.code) !== -1)) {
    return err.code;
  }
  var msg = String(err.message || err.error_description || err || '');
  for (var i = 0; i < CNC_ERROR_CODES.length; i++) {
    if (msg.indexOf(CNC_ERROR_CODES[i]) !== -1) return CNC_ERROR_CODES[i];
  }
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(msg)) return 'NETWORK';
  if (/JWT|not authenticated|permission denied for function/i.test(msg)) return 'NOT_LOGGED_IN';
  return 'UNKNOWN';
}

// 코드를 가진 에러 만들기
function cncError(code, extra) {
  var e = new Error(code);
  e.code = code;
  if (extra) for (var k in extra) e[k] = extra[k];
  return e;
}

// Supabase 응답 { data, error } 에서 에러가 있으면 던지기
function cncCheck(result) {
  if (result && result.error) throw result.error;
  return result ? result.data : null;
}

function cncUserId() {
  return (window.APP && APP.user) ? APP.user.id : null;
}


// ================================================================
// 1) 주문 작성 중 데이터 (draft)
// ================================================================
// draft 모양:
// {
//   step: 1~5 (지금 단계), maxStep: 지금까지 가 본 가장 먼 단계,
//   patient: '', deadline: 'YYYY-MM-DD',
//   teeth: [16, 26],                                   ← 선택한 치아 (차트 순서)
//   details: { '16': { brand, size, shade }, ... },    ← 치아마다 따로
//   memo: '',
//   files: [{ id, file(File), name, size, path }],      ← path 는 업로드가 끝나면 채워짐
//   missingFiles: ['upper.stl'],                       ← 복원했을 때 다시 골라야 하는 파일 이름
//   delivery: { clinic, addr, phone, line_id },
//   useFree: false,                                    ← "무료 크레딧으로 주문하기" (켜면 배송 정보 = 등록된 치과 정보, 못 고침)
//   saveToProfile: true,
//   uploadId: '...',                                   ← 업로드 폴더 이름 (한 주문에 하나)
//   updatedAt: 1700000000000
// }

function cncNewDraft(profile) {
  profile = profile || {};
  return {
    step: 1,
    maxStep: 1,
    patient: '',
    deadline: '',
    teeth: [],
    details: {},
    memo: '',
    files: [],
    missingFiles: [],
    delivery: {
      clinic: profile.clinic_name || '',
      addr: profile.address || '',
      phone: profile.phone || '',
      line_id: ''   // 연락용 LINE ID (글자). profiles.line_user_id 는 LINE 알림 연결용이라 여기 쓰지 않아요
    },
    useFree: false,
    saveToProfile: true,
    uploadId: cncRandomId(),
    updatedAt: Date.now()
  };
}

function cncDraftKey(userId) {
  return CNC_DRAFT_PREFIX + userId;
}

// 저장: 파일 자체(File)는 브라우저 저장소에 넣을 수 없어서 이름과 크기만 저장해요
function cncSaveDraft(userId, draft) {
  if (!userId || !draft) return;
  draft.updatedAt = Date.now();
  var copy = {
    step: draft.step,
    maxStep: draft.maxStep,
    patient: draft.patient,
    deadline: draft.deadline,
    teeth: draft.teeth,
    details: draft.details,
    memo: draft.memo,
    fileNames: draft.files.map(function (f) { return f.name; }).concat(draft.missingFiles || []),
    delivery: draft.delivery,
    useFree: !!draft.useFree,
    saveToProfile: draft.saveToProfile,
    uploadId: draft.uploadId,
    updatedAt: draft.updatedAt
  };
  try { localStorage.setItem(cncDraftKey(userId), JSON.stringify(copy)); } catch (e) { /* 저장 공간 부족 등 */ }
}

// 불러오기: 없으면 null
function cncLoadDraft(userId, profile) {
  if (!userId) return null;
  var raw = null;
  try { raw = localStorage.getItem(cncDraftKey(userId)); } catch (e) { return null; }
  if (!raw) return null;
  var saved;
  try { saved = JSON.parse(raw); } catch (e) { return null; }
  if (!saved || typeof saved !== 'object') return null;

  var draft = cncNewDraft(profile);
  draft.step = Math.min(Math.max(parseInt(saved.step, 10) || 1, 1), 5);
  draft.maxStep = Math.min(Math.max(parseInt(saved.maxStep, 10) || draft.step, draft.step), 5);
  draft.patient = String(saved.patient || '');
  draft.deadline = /^\d{4}-\d{2}-\d{2}$/.test(saved.deadline || '') ? saved.deadline : '';
  draft.teeth = sortTeeth((saved.teeth || []).map(Number).filter(isValidTooth));
  draft.details = {};
  draft.teeth.forEach(function (n) {
    var d = (saved.details && saved.details[n]) || {};
    draft.details[n] = {
      brand: IMPLANT_BRANDS.indexOf(d.brand) !== -1 ? d.brand : '',
      size: String(d.size || ''),
      shade: TOOTH_COLORS.indexOf(d.shade) !== -1 ? d.shade : ''
    };
  });
  draft.memo = String(saved.memo || '');
  draft.files = [];
  draft.missingFiles = (saved.fileNames || []).map(String);
  if (saved.delivery) {
    draft.delivery = {
      clinic: String(saved.delivery.clinic || ''),
      addr: String(saved.delivery.addr || ''),
      phone: String(saved.delivery.phone || ''),
      line_id: String(saved.delivery.line_id || '')
    };
  }
  draft.useFree = saved.useFree === true;
  draft.saveToProfile = saved.saveToProfile !== false;
  draft.uploadId = saved.uploadId || cncRandomId();
  draft.updatedAt = saved.updatedAt || Date.now();
  return draft;
}

function cncClearDraft(userId) {
  if (!userId) return;
  try { localStorage.removeItem(cncDraftKey(userId)); } catch (e) { /* 무시 */ }
}

// 이어서 할 만한 내용이 있는 draft 인지 (빈 draft 는 무시)
function cncHasDraft(userId) {
  var d = cncLoadDraft(userId, null);
  if (!d) return false;
  return !!(d.patient || d.deadline || d.teeth.length || d.memo || d.missingFiles.length);
}


// ================================================================
// 2) 치아 선택 / 치아별 정보
// ================================================================

// 치아 선택/해제 → 선택하면 details 칸을 만들어 두고, 해제하면 지워요
function cncToggleTooth(draft, num) {
  num = Number(num);
  if (!isValidTooth(num)) return;
  var i = draft.teeth.indexOf(num);
  if (i === -1) {
    draft.teeth.push(num);
    draft.teeth = sortTeeth(draft.teeth);
    if (!draft.details[num]) draft.details[num] = { brand: '', size: '', shade: '' };
  } else {
    draft.teeth.splice(i, 1);
    delete draft.details[num];
  }
}

function cncClearTeeth(draft) {
  draft.teeth = [];
  draft.details = {};
}

// 치아 하나의 값 바꾸기 (field: 'brand' / 'size' / 'shade')
function cncSetToothDetail(draft, num, field, value) {
  if (!draft.details[num]) draft.details[num] = { brand: '', size: '', shade: '' };
  draft.details[num][field] = String(value || '');
}

// 모든 치아에 같은 값 넣기
function cncApplyToAll(draft, field, value) {
  draft.teeth.forEach(function (n) { cncSetToothDetail(draft, n, field, value); });
}

// 쓰는 크레딧 = 치아 수 (치아 1개 = 1크레딧)
function cncCreditsNeeded(draft) {
  return draft.teeth.length;
}

// ----------------------------------------------------------------
// 무료 크레딧 · 등록된 치과 정보 (sql/008_free_credits.sql)
// ----------------------------------------------------------------
// 무료 크레딧 = 이벤트·신규 가입 이벤트·관리자 지급 (credit_lots.source 'free' 또는 예전 'bonus', sql/009)
//   현금 환불 불가. 기본은 "등록 주소 배송 전용"(restriction = 'clinic_address_only') →
//   "무료 크레딧으로 주문하기"를 켠 주문(배송 = 등록된 치과 정보)에만 써요. 관리자가 제한 없이 줄 수도 있어요.
//   실제 판단은 DB 함수 create_cnc_order 가 해요 (화면은 미리보기·안내만)
var FREE_LOT_RESTRICTION = 'clinic_address_only';
var FREE_LOT_SOURCES = ['free', 'bonus'];

// 무료 묶음인지 (제한 여부와 상관없이)
function cncIsFreeLot(lot) {
  return !!lot && (lot.free === true || FREE_LOT_SOURCES.indexOf(lot.source) !== -1 || lot.restriction === FREE_LOT_RESTRICTION);
}

// 등록 주소 배송 전용 묶음인지
function cncIsRestrictedLot(lot) {
  return !!lot && (lot.restriction === FREE_LOT_RESTRICTION || (lot.restriction == null && lot.source === 'bonus' && lot.free === undefined));
}

// 최근 들어온 무료 크레딧 (홈 안내용, 30일 이내 · 아직 닫지 않은 것) → [{ id, n, expires_at, event_name }]
var FREE_SEEN_PREFIX = 'allabut_free_seen_';
function cncNewFreeLots(lots) {
  var since = Date.now() - 30 * 86400000;
  return (lots || []).filter(function (l) {
    if (!cncIsFreeLot(l) || !l.created_at || new Date(l.created_at).getTime() < since) return false;
    try { return !localStorage.getItem(FREE_SEEN_PREFIX + l.id); } catch (e) { return true; }
  }).map(function (l) { return { id: l.id, n: Number(l.quantity || l.remaining || 0), expires_at: l.expires_at, event_name: l.event_name || '' }; });
}

function cncMarkFreeSeen(ids) {
  (ids || []).forEach(function (id) { try { localStorage.setItem(FREE_SEEN_PREFIX + id, '1'); } catch (e) { /* 무시 */ } });
}

// 등록된 치과 정보 (프로필에 잠긴 값). 아직 없으면 null
function cncRegisteredClinic(profile) {
  var p = profile || {};
  if (!p.clinic_locked_at || !p.reg_addr) return null;
  return { clinic: String(p.reg_clinic || ''), addr: String(p.reg_addr || ''), phone: String(p.reg_phone || '') };
}

// 주소 비교용 (DB 의 _norm_addr 와 같게: 소문자, 공백·기호 빼기)
function cncNormAddr(s) {
  return String(s || '').toLowerCase().replace(/[\s!-\/:-@\[-`{-~]+/g, '');
}

// 차감 미리보기: { free, paid, ok, freeWouldHelp }
//   useFree = true  → 무료 먼저, 모자라는 만큼 산 크레딧
//   useFree = false → 산 크레딧만 (무료로 채울 수 있었으면 freeWouldHelp)
function cncCreditSplit(need, paidAvail, freeAvail, useFree) {
  need = Math.max(0, need | 0);
  paidAvail = Math.max(0, paidAvail | 0);
  freeAvail = Math.max(0, freeAvail | 0);
  if (useFree) {
    var free = Math.min(freeAvail, need);
    var paid = need - free;
    return { free: free, paid: paid, ok: paid <= paidAvail, freeWouldHelp: false };
  }
  var ok = paidAvail >= need;
  return { free: 0, paid: need, ok: ok, freeWouldHelp: !ok && freeAvail > 0 && paidAvail + freeAvail >= need };
}

// 내 크레딧 요약 { paid, free, lots } — 008 을 실행하기 전이면 null (그때는 예전처럼 전부 산 크레딧)
async function cncGetCreditSummary() {
  var r = await sb.rpc('get_my_credit_summary');
  if (r.error) {
    if (typeof cncIsMissingFunction === 'function' && cncIsMissingFunction(r.error)) return null;
    throw cncError(cncErrorCode(r.error), { cause: r.error });
  }
  var d = r.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  // paid = 산 크레딧, free = 무료 + 등록 주소 전용, freeOpen = 무료 + 제한 없음 (009)
  return d && typeof d === 'object'
    ? { paid: Number(d.paid || 0), free: Number(d.free || 0), freeOpen: Number(d.free_open || 0), lots: Array.isArray(d.lots) ? d.lots : [] }
    : null;
}

// 등록 정보 변경 요청 (관리자 승인 후 바뀌어요)
function cncRequestClinicChange(clinic, addr, phone, reason) {
  return cncRpc('request_clinic_change', {
    p_clinic: String(clinic || '').trim(), p_addr: String(addr || '').trim(), p_phone: String(phone || '').trim(), p_reason: String(reason || '').trim()
  });
}

function cncCancelClinicChange() {
  return cncRpc('cancel_my_clinic_change');
}

// 내 최근 변경 요청 (없거나 008 실행 전이면 null)
async function cncMyClinicChange() {
  var r = await sb.from('clinic_change_requests').select('*').eq('user_id', cncUserId()).order('created_at', { ascending: false }).limit(1);
  if (r.error) return null;
  return (r.data && r.data[0]) || null;
}


// ================================================================
// 3) 단계별 검사
// ================================================================
// 돌려주는 값: { ok: true/false, errors: { 칸이름: '번역키' }, teeth: { 16: { brand: '번역키', shade: '번역키' } } }

function cncValidateStep(draft, step) {
  var errors = {};
  var teethErrors = {};

  if (step === 1) {
    var patient = draft.patient.trim();
    if (!patient) errors.patient = 'err_patient_required';
    else if (patient.length > 50) errors.patient = 'err_patient_long';
    if (!draft.deadline) errors.deadline = 'err_deadline_required';
    else if (draft.deadline < cncToday()) errors.deadline = 'err_deadline_past';
  }

  if (step === 2) {
    if (draft.teeth.length < 1) errors.teeth = 'wiz_no_tooth_err';
  }

  if (step === 3) {
    draft.teeth.forEach(function (n) {
      var d = draft.details[n] || {};
      var e = {};
      if (!d.brand) e.brand = 'wiz_no_brand_tooth_err';
      if (!d.shade) e.shade = 'wiz_no_shade_err';
      if (d.size && d.size.length > 40) e.size = 'err_size_long';
      if (e.brand || e.shade || e.size) teethErrors[n] = e;
    });
    if (draft.memo.length > 2000) errors.memo = 'err_memo_long';
  }

  if (step === 4) {
    if (draft.files.length > FILE_MAX_COUNT) errors.files = 'err_file_count';
  }

  // 무료 크레딧 주문은 배송 정보가 등록된 치과 정보로 고정이라 칸 검사를 하지 않아요
  if (step === 5 && !draft.useFree) {
    if (!draft.delivery.clinic.trim()) errors.clinic = 'err_required';
    if (!draft.delivery.addr.trim()) errors.addr = 'err_required';
    if (!draft.delivery.phone.trim()) errors.phone = 'err_required';
  }

  var ok = Object.keys(errors).length === 0 && Object.keys(teethErrors).length === 0;
  return { ok: ok, errors: errors, teeth: teethErrors };
}

// 1~4단계를 모두 통과했는지 (5단계 제출 전에 다시 확인). 틀린 첫 단계 번호, 모두 통과면 0
function cncFirstInvalidStep(draft) {
  for (var s = 1; s <= 5; s++) {
    if (!cncValidateStep(draft, s).ok) return s;
  }
  return 0;
}

// 3D 스캔 파일이 하나라도 있는지 (없으면 4단계에서 확인창)
function cncHasScanFile(draft) {
  return draft.files.some(function (f) { return fileKind(f.name) === '3d'; });
}


// ================================================================
// 4) 파일 추가 / 삭제
// ================================================================
// fileList: <input type="file"> 이나 드래그로 받은 파일들
// 돌려주는 값: { added: [이름...], rejected: [{ name, reason: 'type'|'size'|'count'|'duplicate'|'empty' }] }

function cncAddFiles(draft, fileList) {
  var added = [];
  var rejected = [];
  var list = Array.prototype.slice.call(fileList || []);

  list.forEach(function (file) {
    var name = file.name || 'file';
    if (FILE_ALLOWED_EXT.indexOf(fileExt(name)) === -1) {
      rejected.push({ name: name, reason: 'type' });
    } else if (!file.size) {
      rejected.push({ name: name, reason: 'empty' });
    } else if (file.size > FILE_MAX_BYTES) {
      rejected.push({ name: name, reason: 'size' });
    } else if (draft.files.some(function (f) { return f.name === name && f.size === file.size; })) {
      rejected.push({ name: name, reason: 'duplicate' });
    } else if (draft.files.length >= FILE_MAX_COUNT) {
      rejected.push({ name: name, reason: 'count' });
    } else {
      draft.files.push({ id: cncRandomId(), file: file, name: name, size: file.size, path: null });
      added.push(name);
      // 복원 목록에 같은 이름이 있으면 "다시 골랐음"으로 지워요
      var mi = draft.missingFiles.indexOf(name);
      if (mi !== -1) draft.missingFiles.splice(mi, 1);
    }
  });
  return { added: added, rejected: rejected };
}

function cncRemoveFile(draft, fileId) {
  draft.files = draft.files.filter(function (f) { return f.id !== fileId; });
}

function cncDismissMissingFiles(draft) {
  draft.missingFiles = [];
}


// ================================================================
// 5) cases (주문 내용) 만들기 — Dentalk 과 같은 모양 + 파일 경로
// ================================================================
// [{
//   patient, deadline, memo,
//   teeth: [{ tooth: 16, toothName: '#16 1st Molar', brand, size, color }],
//   stls: ['upper.stl'],                         ← 원래 파일 이름
//   stlPaths: ['{user_id}/{uploadId}/1_upper.stl'] ← 비공개 버킷 안 경로
// }]

function cncBuildCases(draft) {
  var teeth = draft.teeth.map(function (n) {
    var d = draft.details[n] || {};
    return {
      tooth: n,
      toothName: getToothNameEn(n),
      brand: d.brand || '',
      size: (d.size || '').trim(),
      color: d.shade || ''
    };
  });
  return [{
    patient: draft.patient.trim(),
    deadline: draft.deadline,
    memo: draft.memo.trim(),
    teeth: teeth,
    stls: draft.files.map(function (f) { return f.name; }),
    stlPaths: draft.files.map(function (f) { return f.path; })
  }];
}


// ================================================================
// 6) 파일 업로드 (비공개 버킷 cnc-files)
// ================================================================

// 저장소 경로에 쓸 수 있는 안전한 파일 이름 (영문·숫자·.-_ 만 남김)
function cncSafeFileName(name) {
  var ext = fileExt(name);
  var base = String(name || 'file').replace(/\.[^.]*$/, '');
  base = base.normalize ? base.normalize('NFKD') : base;
  base = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|_+$/g, '').slice(0, 60);
  if (!base) base = 'file';
  return ext ? base + '.' + ext : base;
}

// 아직 안 올린 파일만 순서대로 올려요. 이미 올린 파일(path 있음)은 건너뛰어서 "다시 시도" 때 중복 업로드가 없어요.
// onProgress({ done, total, name }) 로 진행 상황을 알려요.
// 실패하면 cncError('UPLOAD_FAILED', { fileName }) 를 던져요 (파일을 DB에 대신 넣는 일은 절대 하지 않아요).
async function cncUploadFiles(draft, onProgress) {
  var uid = cncUserId();
  if (!uid) throw cncError('NOT_LOGGED_IN');
  var total = draft.files.length;
  var done = draft.files.filter(function (f) { return !!f.path; }).length;
  if (onProgress) onProgress({ done: done, total: total, name: '' });

  for (var i = 0; i < draft.files.length; i++) {
    var f = draft.files[i];
    if (f.path) continue;
    var path = uid + '/' + draft.uploadId + '/' + (i + 1) + '_' + cncSafeFileName(f.name);
    if (onProgress) onProgress({ done: done, total: total, name: f.name });

    var result;
    try {
      result = await sb.storage.from(CNC_FILES_BUCKET).upload(path, f.file, {
        upsert: false,
        contentType: f.file.type || 'application/octet-stream'
      });
    } catch (err) {
      throw cncError('UPLOAD_FAILED', { fileName: f.name, cause: err });
    }
    if (result.error) {
      // 지난번 시도에서 이미 올라간 파일이면 성공으로 봐요
      var msg = String(result.error.message || '');
      var already = /exists|Duplicate/i.test(msg) || String(result.error.statusCode) === '409';
      if (!already) throw cncError('UPLOAD_FAILED', { fileName: f.name, cause: result.error });
    }
    f.path = path;
    done++;
    if (onProgress) onProgress({ done: done, total: total, name: f.name });
  }
}


// ================================================================
// 7) 주문 제출
// ================================================================
// 순서: 로그인 확인 → 전체 검사 → 파일 업로드 → DB 함수(create_cnc_order) → (선택) 프로필 저장
// 성공하면 { id, teeth, balance } 를 돌려줘요. 실패하면 code 가 있는 에러를 던져요.

async function cncSubmitOrder(draft, onProgress) {
  var sessionResult = await sb.auth.getSession();
  var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
  if (!session) throw cncError('NOT_LOGGED_IN');

  if (draft.teeth.length < 1) throw cncError('NO_TEETH');
  var d = draft.delivery;
  // 무료 크레딧 주문: 배송 정보는 등록된 치과 정보 (DB 도 같은 값으로 강제로 바꿔요)
  var reg = draft.useFree ? cncRegisteredClinic(window.APP && APP.profile) : null;
  if (draft.useFree && !reg) throw cncError('NO_REGISTERED_CLINIC');
  if (reg) d = { clinic: reg.clinic, addr: reg.addr, phone: reg.phone, line_id: d.line_id || '' };
  if (!d.clinic.trim() || !d.addr.trim() || !d.phone.trim()) throw cncError('DELIVERY_REQUIRED');

  if (onProgress) onProgress({ phase: 'upload', done: 0, total: draft.files.length });
  await cncUploadFiles(draft, function (p) {
    if (onProgress) onProgress({ phase: 'upload', done: p.done, total: p.total, name: p.name });
  });

  if (onProgress) onProgress({ phase: 'save' });
  var result;
  var args = {
    p_patient: draft.patient.trim(),
    p_deadline: draft.deadline || null,
    p_clinic: d.clinic.trim(),
    p_addr: d.addr.trim(),
    p_phone: d.phone.trim(),
    p_line_id: d.line_id.trim(),
    p_cases: cncBuildCases(draft)
  };
  if (draft.useFree) args.p_use_free = true;   // 008 실행 전에도 일반 주문은 그대로 되게, 켰을 때만 보내요
  try {
    result = await sb.rpc('create_cnc_order', args);
  } catch (err) {
    throw cncError(cncErrorCode(err), { cause: err });
  }
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });

  // "내 프로필에 저장" 을 켰으면 배송 정보를 profiles 에도 저장 (실패해도 주문은 이미 완료)
  //   무료 크레딧 주문은 등록 정보 그대로라 저장할 필요가 없어요
  if (draft.saveToProfile && !draft.useFree) {
    try {
      // (LINE ID 칸은 저장하지 않아요 — profiles.line_user_id 는 LINE 알림 연결 전용)
      await cncSaveProfile({
        clinic_name: d.clinic.trim(),
        address: d.addr.trim(),
        phone: d.phone.trim()
      });
    } catch (err) {
      console.warn('Profile save after order failed:', err);
    }
  }
  return result.data;   // { id, teeth, balance }
}


// ================================================================
// 8) 주문 조회
// ================================================================

// 검색어에서 DB 검색 문법을 깨뜨릴 수 있는 글자 빼기
function cncCleanSearch(q) {
  return String(q || '').replace(/[,()%*\\:."']/g, ' ').trim().slice(0, 40);
}

// 내 주문 목록
// opts: { tab: 'progress' | 'completed' | 'all', search: '', offset: 0, limit: 20 }
// 돌려주는 값: { rows: [...], hasMore: true/false }
async function cncListOrders(opts) {
  opts = opts || {};
  var limit = opts.limit || CNC_PAGE_SIZE;
  var offset = opts.offset || 0;
  // 관리자는 DB 규칙상 모든 주문을 읽을 수 있어서, "내 주문" 은 항상 내 user_id 로 걸러요
  var query = sb.from('cnc_orders').select('*').eq('user_id', cncUserId()).order('created_at', { ascending: false });

  if (opts.tab === 'progress') query = query.not('stage', 'in', '(done,cancelled)');
  if (opts.tab === 'completed') query = query.in('stage', ['done', 'cancelled']);

  var q = cncCleanSearch(opts.search);
  if (q) query = query.or('id.ilike.*' + q + '*,patient.ilike.*' + q + '*');

  // 진행 중: 한 번에 모두 가져와서 "할 일 있는 주문 → 납기 빠른 순" 으로 정렬 (진행 중 주문은 많지 않아요)
  if (opts.tab === 'progress') {
    var all = cncCheck(await query.limit(CNC_PROGRESS_MAX)) || [];
    return { rows: cncSortProgress(all), hasMore: false };
  }

  // 하나 더 가져와서 "더 있는지" 확인해요
  var rows = cncCheck(await query.range(offset, offset + limit)) || [];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// 진행 중 목록 최대 개수 (한 번에 정렬하려고 모두 가져와요)
var CNC_PROGRESS_MAX = 300;
// 고객이 할 일이 있는 단계: 디자인 확인 / 수령 확인
var CUSTOMER_ACTION_STAGES = ['design_ready', 'shipped'];

function cncOrderNeedsAction(o) {
  return !!o && CUSTOMER_ACTION_STAGES.indexOf(o.stage) !== -1;
}

// 할 일 있는 주문 → 납기 빠른 순(납기 없으면 뒤) → 최신 접수 순
function cncSortProgress(rows) {
  return rows.slice().sort(function (a, b) {
    var na = cncOrderNeedsAction(a) ? 0 : 1, nb = cncOrderNeedsAction(b) ? 0 : 1;
    if (na !== nb) return na - nb;
    var da = a.deadline || '9999-12-31', db = b.deadline || '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    return a.created_at < b.created_at ? 1 : (a.created_at > b.created_at ? -1 : 0);
  });
}

// 홈 "확인이 필요해요": 디자인 확인 · 수령 확인할 내 주문
async function cncOrdersNeedingAction() {
  var rows = cncCheck(await sb.from('cnc_orders').select('*').eq('user_id', cncUserId()).in('stage', CUSTOMER_ACTION_STAGES).order('created_at', { ascending: false }).limit(20)) || [];
  return cncSortProgress(rows);
}

// 최근 주문 n개
async function cncRecentOrders(n) {
  return cncCheck(await sb.from('cnc_orders').select('*').eq('user_id', cncUserId()).order('created_at', { ascending: false }).limit(n || 5)) || [];
}

// 진행 중인 주문 수
async function cncCountInProgress() {
  var result = await sb.from('cnc_orders').select('id', { count: 'exact', head: true }).eq('user_id', cncUserId()).not('stage', 'in', '(done,cancelled)');
  if (result.error) throw result.error;
  return result.count || 0;
}

// 주문 하나 다시 읽기
async function cncGetOrder(id) {
  return cncCheck(await sb.from('cnc_orders').select('*').eq('id', id).eq('user_id', cncUserId()).maybeSingle());
}

// 주문의 치아 목록 (cases 안 teeth 를 한 줄로)
function cncOrderTeeth(order) {
  var list = [];
  (order.cases || []).forEach(function (c) {
    (c.teeth || []).forEach(function (tt) { list.push(tt); });
  });
  return list;
}

// 주문의 메모 (cases[0].memo)
function cncOrderMemo(order) {
  var c = (order.cases || [])[0];
  return c ? (c.memo || '') : '';
}

// 주문의 파일 목록 [{ name, path }]
function cncOrderFiles(order) {
  var list = [];
  (order.cases || []).forEach(function (c) {
    var names = c.stls || [];
    var paths = c.stlPaths || [];
    for (var i = 0; i < names.length; i++) {
      list.push({ name: names[i], path: paths[i] || null });
    }
  });
  return list;
}

// 관리자가 올린 디자인 버전 목록 (오래된 것 → 최신 순서)
// [{ version: 1, date, files: [{ name, path, url }] }, ...]
// 저장 형식: { version, paths: [...], names: [...], date }
// (예전 형식 { name, path, url } 도 버전 하나로 바꿔서 보여줘요)
function cncOrderDesigns(order) {
  return (order.design_versions || []).map(function (v, i) {
    v = v || {};
    var files = [];
    if (v.paths && v.paths.length) {
      for (var k = 0; k < v.paths.length; k++) {
        var p = v.paths[k];
        files.push({ name: (v.names && v.names[k]) || String(p).split('/').pop(), path: p, url: null });
      }
    } else if (v.path || v.url) {
      files.push({ name: v.name || String(v.path || v.url).split('/').pop(), path: v.path || null, url: v.url || null });
    }
    return { version: v.version || (i + 1), date: v.date || null, files: files };
  });
}


// ================================================================
// 9) 고객 액션 (모두 DB 함수 — 내 주문만, 상태가 맞을 때만 서버가 허용)
// ================================================================

async function cncRpc(name, params) {
  var result;
  try {
    result = await sb.rpc(name, params);
  } catch (err) {
    throw cncError(cncErrorCode(err), { cause: err });
  }
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });
  return result.data;
}

// 접수 상태일 때 환자·납기·배송 정보 수정
function cncUpdateOrder(id, f) {
  return cncRpc('update_my_cnc_order', {
    p_id: id,
    p_patient: (f.patient || '').trim(),
    p_deadline: f.deadline || null,
    p_clinic: (f.clinic || '').trim(),
    p_addr: (f.addr || '').trim(),
    p_phone: (f.phone || '').trim(),
    p_line_id: (f.line_id || '').trim()
  });
}

// 접수 상태일 때 취소 → 크레딧 환불. 돌려받은 뒤 잔액을 돌려줘요
function cncCancelOrder(id) {
  return cncRpc('cancel_my_cnc_order', { p_id: id });
}

// action: 'approve' (디자인 승인) / 'reject' (수정 요청, note 필수) / 'receive' (수령 완료)
function cncCustomerAction(id, action, note) {
  return cncRpc('customer_cnc_action', { p_id: id, p_action: action, p_note: note || '' });
}


// ================================================================
// 10) 파일 보기용 주소 (비공개 버킷 → 1시간짜리 서명 URL)
// ================================================================

async function cncSignedUrl(bucket, path) {
  if (!path) throw cncError('NOT_FOUND');
  var result = await sb.storage.from(bucket).createSignedUrl(path, 3600);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}

function cncOrderFileUrl(file) {
  return cncSignedUrl(CNC_FILES_BUCKET, file.path);
}

// 디자인 파일 하나({ name, path, url }): path 가 있으면 cnc-designs 서명 URL, http 주소면 그대로, 아니면 url 을 경로로 보고 서명
function cncDesignUrl(file) {
  if (file.path) return cncSignedUrl(CNC_DESIGNS_BUCKET, file.path);
  if (file.url && /^https?:\/\//i.test(file.url)) return Promise.resolve(file.url);
  if (file.url) return cncSignedUrl(CNC_DESIGNS_BUCKET, file.url);
  return Promise.reject(cncError('NOT_FOUND'));
}


// ================================================================
// 11) 크레딧 · 프로필
// ================================================================

// 내 크레딧 잔액 (지갑이 아직 없으면 0)
async function cncGetBalance() {
  var uid = cncUserId();
  if (!uid) return 0;
  var row = cncCheck(await sb.from('credit_wallets').select('balance').eq('user_id', uid).maybeSingle());
  return row ? (row.balance || 0) : 0;
}

// 크레딧 이력 (최신순)
async function cncCreditHistory(limit) {
  return cncCheck(await sb.from('credit_history').select('*').eq('user_id', cncUserId()).order('created_at', { ascending: false }).limit(limit || 50)) || [];
}

// profiles 에서 내 행 고치기. fields 예: { clinic_name, address, phone, tax_id, lang }
// (line_user_id 는 LINE 알림 연결 전용 — 서버(line-webhook)만 저장해요)
async function cncSaveProfile(fields) {
  var uid = cncUserId();
  if (!uid) throw cncError('NOT_LOGGED_IN');
  var data = cncCheck(await sb.from('profiles').update(fields).eq('id', uid).select().maybeSingle());
  if (data && window.APP) APP.profile = data;
  return data;
}



// ================================================================
// 12) LINE 알림 연결
// ================================================================
// 연결 방법: 고객이 allAbut LINE 공식계정을 친구추가 → 연결 코드(AB-XXXX)를 채팅에 보냄
//          → 서버 함수 line-webhook 이 profiles.line_user_id 에 LINE 사용자 id 를 저장
var LINE_ADD_FRIEND_URL = 'https://line.me/R/ti/p/@925caqxb';

// 연결됐는지: LINE 사용자 id 모양(U + 16진수 32자리)일 때만 "연결됨"
// (예전에 손으로 적어 둔 LINE ID 글자는 연결로 보지 않아요)
function cncIsLineLinked(profile) {
  return !!(profile && typeof profile.line_user_id === 'string' && /^U[0-9a-f]{32}$/.test(profile.line_user_id));
}

// 내 연결 코드 (DB 함수 get_my_line_link_code)
async function cncGetLineLinkCode() {
  var result = await sb.rpc('get_my_line_link_code');
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });
  var d = result.data;
  if (d && typeof d === 'object') d = d.code || d.line_link_code || d.get_my_line_link_code || '';
  return String(d || '');
}

// 연결 해제 (DB 함수 unlink_my_line)
async function cncUnlinkLine() {
  var result = await sb.rpc('unlink_my_line');
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });
  if (window.APP && APP.profile) APP.profile.line_user_id = null;
}

// 내 프로필 다시 읽기 (연결 상태 확인용)
async function cncReloadProfile() {
  var uid = cncUserId();
  if (!uid) return null;
  var data = cncCheck(await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  if (data && window.APP) APP.profile = data;
  return data;
}


// ================================================================
// 13) 크레딧 충전 (PromptPay + 입금 슬립) · 크레딧 묶음(유효기간)
// ================================================================
var TOPUP_SLIPS_BUCKET = 'topup-slips';
var SLIP_MAX_BYTES = 10 * 1024 * 1024;                    // 10MB
var SLIP_ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'];
var CREDIT_EXPIRY_WARN_DAYS = 30;                          // 30일 이내 만료 → 주황
var CREDIT_EXPIRY_DANGER_DAYS = 7;                         // 7일 이내 만료 → 빨강

// 금액 계산 (화면 표시용 — 실제 청구 금액은 DB 함수가 다시 계산해요)
function cncPackagePrice(pkg, vatRate) {
  var subtotal = Number(pkg.credits) * Number(pkg.unit_price);
  var vat = Math.round(subtotal * Number(vatRate || 0)) / 100;
  return { subtotal: subtotal, vat: vat, total: Math.round((subtotal + vat) * 100) / 100 };
}

// 1개 가격 대비 할인율 (%), 1개 패키지가 없으면 0
function cncPackageDiscount(pkg, packages) {
  var single = (packages || []).filter(function (p) { return Number(p.credits) === 1; })[0];
  var base = single ? Number(single.unit_price) : 0;
  if (!base || Number(pkg.unit_price) >= base) return 0;
  return Math.round((1 - Number(pkg.unit_price) / base) * 100);
}

// 판매 중인 패키지 (작은 것부터)
async function cncGetPackages() {
  var rows = cncCheck(await sb.from('credit_packages').select('*').eq('active', true).order('credits', { ascending: true })) || [];
  return rows;
}

// 결제 정보 (PromptPay ID, 계좌, VAT %)
async function cncGetPaymentSettings() {
  var row = cncCheck(await sb.from('payment_settings').select('*').eq('id', 1).maybeSingle());
  return row || { promptpay_id: '', bank_name: '', account_name: '', account_number: '', vat_rate: 7, note: '' };
}

// 슬립 파일 검사: '' 면 OK, 아니면 에러 번역 키
function cncCheckSlipFile(file) {
  if (!file) return 'topup_slip_required';
  if (SLIP_ALLOWED_EXT.indexOf(fileExt(file.name)) === -1) return 'topup_slip_type';
  if (!file.size) return 'topup_slip_type';
  if (file.size > SLIP_MAX_BYTES) return 'topup_slip_size';
  return '';
}

// 충전 요청: 슬립을 topup-slips/{user_id}/... 에 올리고 → DB 함수 create_topup_request (금액은 DB 가 계산)
// 돌려주는 값: { id, credits, subtotal, vat_amount, total }
async function cncCreateTopup(packageId, file) {
  var uid = cncUserId();
  if (!uid) throw cncError('NOT_LOGGED_IN');
  var bad = cncCheckSlipFile(file);
  if (bad) throw cncError('SLIP_INVALID', { key: bad });

  var path = uid + '/' + Date.now().toString(36) + '_' + cncSafeFileName(file.name);
  var up;
  try {
    up = await sb.storage.from(TOPUP_SLIPS_BUCKET).upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  } catch (err) {
    throw cncError('UPLOAD_FAILED', { fileName: file.name, cause: err });
  }
  if (up.error) throw cncError('UPLOAD_FAILED', { fileName: file.name, cause: up.error });

  return cncRpc('create_topup_request', { p_package_id: packageId, p_slip_path: path });
}

// 내 충전 요청 목록 (최신순)
async function cncListMyTopups(limit) {
  return cncCheck(await sb.from('topup_requests').select('*').eq('user_id', cncUserId())
    .order('created_at', { ascending: false }).limit(limit || 30)) || [];
}

function cncCancelTopup(id) {
  return cncRpc('cancel_my_topup', { p_id: id });
}

// 내 크레딧 묶음 (남은 것, 만료 빠른 순)
async function cncGetMyLots() {
  var result = await sb.rpc('get_my_credit_lots');
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });
  return result.data || [];
}

// 남은 날짜 (오늘 기준, 올림)
function cncDaysLeft(expiresAt) {
  var t = new Date(expiresAt).getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

// 만료 상태: 'danger'(7일 이내) / 'warn'(30일 이내) / ''
function cncExpiryState(expiresAt) {
  var d = cncDaysLeft(expiresAt);
  if (d == null) return '';
  if (d <= CREDIT_EXPIRY_DANGER_DAYS) return 'danger';
  if (d <= CREDIT_EXPIRY_WARN_DAYS) return 'warn';
  return '';
}

// 30일 이내 만료 예정: { credits: 개수, days: 가장 빠른 만료까지 남은 날 } (없으면 null)
function cncExpiringSummary(lots) {
  var credits = 0, days = null;
  (lots || []).forEach(function (l) {
    if (!(l.remaining > 0) || !cncExpiryState(l.expires_at)) return;
    credits += l.remaining;
    var d = cncDaysLeft(l.expires_at);
    if (d != null && (days == null || d < days)) days = d;
  });
  return credits ? { credits: credits, days: Math.max(1, days || 1) } : null;
}

// 곧 만료되는 크레딧 수 (30일 이내)
function cncExpiringSoon(lots) {
  return (lots || []).reduce(function (sum, l) {
    return sum + (cncExpiryState(l.expires_at) && l.remaining > 0 ? l.remaining : 0);
  }, 0);
}
