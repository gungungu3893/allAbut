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
  'NOT_EDITABLE', 'NOT_CANCELLABLE', 'NOT_FOUND', 'NOTE_REQUIRED', 'INVALID_ACTION'
];


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
  if (err.code && (CNC_ERROR_CODES.indexOf(err.code) !== -1 || err.code === 'UPLOAD_FAILED' || err.code === 'NETWORK')) {
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
      line_id: profile.line_user_id || ''
    },
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


// ================================================================
// 3) 단계별 검사
// ================================================================
// 돌려주는 값: { ok: true/false, errors: { 칸이름: '번역키' }, teeth: { 16: { brand: '번역키', shade: '번역키' } } }

function cncValidateStep(draft, step) {
  var errors = {};
  var teethErrors = {};

  if (step === 1) {
    if (draft.patient.length > 60) errors.patient = 'err_patient_long';
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

  if (step === 5) {
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
  if (!d.clinic.trim() || !d.addr.trim() || !d.phone.trim()) throw cncError('DELIVERY_REQUIRED');

  if (onProgress) onProgress({ phase: 'upload', done: 0, total: draft.files.length });
  await cncUploadFiles(draft, function (p) {
    if (onProgress) onProgress({ phase: 'upload', done: p.done, total: p.total, name: p.name });
  });

  if (onProgress) onProgress({ phase: 'save' });
  var result;
  try {
    result = await sb.rpc('create_cnc_order', {
      p_patient: draft.patient.trim(),
      p_deadline: draft.deadline || null,
      p_clinic: d.clinic.trim(),
      p_addr: d.addr.trim(),
      p_phone: d.phone.trim(),
      p_line_id: d.line_id.trim(),
      p_cases: cncBuildCases(draft)
    });
  } catch (err) {
    throw cncError(cncErrorCode(err), { cause: err });
  }
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });

  // "내 프로필에 저장" 을 켰으면 배송 정보를 profiles 에도 저장 (실패해도 주문은 이미 완료)
  if (draft.saveToProfile) {
    try {
      await cncSaveProfile({
        clinic_name: d.clinic.trim(),
        address: d.addr.trim(),
        phone: d.phone.trim(),
        line_user_id: d.line_id.trim()
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
  var query = sb.from('cnc_orders').select('*').order('created_at', { ascending: false });

  if (opts.tab === 'progress') query = query.not('stage', 'in', '(done,cancelled)');
  if (opts.tab === 'completed') query = query.in('stage', ['done', 'cancelled']);

  var q = cncCleanSearch(opts.search);
  if (q) query = query.or('id.ilike.*' + q + '*,patient.ilike.*' + q + '*');

  // 하나 더 가져와서 "더 있는지" 확인해요
  var rows = cncCheck(await query.range(offset, offset + limit)) || [];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// 최근 주문 n개
async function cncRecentOrders(n) {
  return cncCheck(await sb.from('cnc_orders').select('*').order('created_at', { ascending: false }).limit(n || 5)) || [];
}

// 진행 중인 주문 수
async function cncCountInProgress() {
  var result = await sb.from('cnc_orders').select('id', { count: 'exact', head: true }).not('stage', 'in', '(done,cancelled)');
  if (result.error) throw result.error;
  return result.count || 0;
}

// 주문 하나 다시 읽기
async function cncGetOrder(id) {
  return cncCheck(await sb.from('cnc_orders').select('*').eq('id', id).maybeSingle());
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

// 관리자가 올린 디자인 파일 목록 [{ name, date, path, url }]
function cncOrderDesigns(order) {
  return (order.design_versions || []).map(function (v, i) {
    v = v || {};
    return {
      name: v.name || ('Design v' + (i + 1)),
      date: v.date || null,
      path: v.path || null,
      url: v.url || null
    };
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

// 디자인: path 가 있으면 cnc-designs 서명 URL, http 주소면 그대로, 아니면 url 을 경로로 보고 서명
function cncDesignUrl(design) {
  if (design.path) return cncSignedUrl(CNC_DESIGNS_BUCKET, design.path);
  if (design.url && /^https?:\/\//i.test(design.url)) return Promise.resolve(design.url);
  if (design.url) return cncSignedUrl(CNC_DESIGNS_BUCKET, design.url);
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
  return cncCheck(await sb.from('credit_history').select('*').order('created_at', { ascending: false }).limit(limit || 50)) || [];
}

// profiles 에서 내 행 고치기. fields 예: { clinic_name, address, phone, tax_id, line_user_id, lang }
async function cncSaveProfile(fields) {
  var uid = cncUserId();
  if (!uid) throw cncError('NOT_LOGGED_IN');
  var data = cncCheck(await sb.from('profiles').update(fields).eq('id', uid).select().maybeSingle());
  if (data && window.APP) APP.profile = data;
  return data;
}
