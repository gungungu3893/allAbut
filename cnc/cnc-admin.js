// ===== 관리자 로직 (화면 코드 없음) =====
// 관리자만 쓰는 데이터 처리예요. 화면은 ui/page-admin.js 가 그려요.
//
// 서버 쪽 보안 (Supabase 에 이미 있는 것):
//   - is_admin()                    → 관리자인지
//   - cnc_orders 관리자 update 정책  → 단계·디자인·배송 정보를 직접 고칠 수 있음
//   - profiles 관리자 읽기 정책      → 고객 닉네임 등 읽기
//   - admin_list_users()            → 고객 목록 (이메일 포함)
//   - admin_add_credits(p_user, p_amount, p_description) → 크레딧 충전(+)/차감(-)
//   - admin_cancel_cnc_order(...)   → 취소 + 크레딧 환불
//   - cnc-files / cnc-designs 관리자 Storage 정책
// 관리자가 아니면 서버가 거절하니까, 화면에서 버튼을 숨기는 것은 "편의"일 뿐이에요.

// 단계별 다음 처리 (화면의 큰 버튼)
var ADMIN_ACTIVE_STAGES = ['submitted', 'confirmed', 'design_ready', 'design_revision', 'approved', 'milling', 'shipped'];
var ADMIN_ALL_STAGES = ADMIN_ACTIVE_STAGES.concat(['done', 'cancelled']);
// 가공 전 단계 (취소·환불 가능)
var ADMIN_CANCELLABLE_STAGES = ['submitted', 'confirmed', 'design_ready', 'design_revision', 'approved'];
// 자주 쓰는 택배사
var ADMIN_CARRIERS = ['Kerry Express', 'Flash Express', 'Thailand Post', 'J&T Express', 'Lalamove', 'Hand delivery'];
var ADMIN_DUE_DAYS = 3;   // 납기 3일 이내면 "임박"


// ================================================================
// 0) 관리자 확인
// ================================================================

// 관리자면 true (에러가 나면 false — 안전한 쪽으로)
async function cncCheckAdmin() {
  try {
    var result = await sb.rpc('is_admin');
    if (result.error) return false;
    return result.data === true;
  } catch (err) {
    return false;
  }
}

// 'YYYY-MM-DD' 날짜를 n일 더하기
function cncAddDays(dateStr, n) {
  var p = dateStr.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 납기 상태: 'overdue'(지남) / 'soon'(3일 이내) / ''(여유) — 끝난 주문은 ''
function cncDueState(order) {
  if (!order || !order.deadline || isClosedStage(order.stage)) return '';
  var today = cncToday();
  if (order.deadline < today) return 'overdue';
  if (order.deadline <= cncAddDays(today, ADMIN_DUE_DAYS)) return 'soon';
  return '';
}


// ================================================================
// 1) 대시보드
// ================================================================
// 돌려주는 값:
// { counts: { submitted: 3, ... }, due: [주문...], today: 2, month: 15, monthCredits: 40 }

async function cncAdminDashboard() {
  var now = new Date();
  var startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  var startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  var dueLimit = cncAddDays(cncToday(), ADMIN_DUE_DAYS);

  // 단계별 주문 수 (개수만 세서 가볍게)
  var countJobs = ADMIN_ACTIVE_STAGES.map(function (stage) {
    return sb.from('cnc_orders').select('id', { count: 'exact', head: true }).eq('stage', stage);
  });

  var results = await Promise.all(countJobs.concat([
    // 납기 임박·지남 (진행 중 주문만)
    sb.from('cnc_orders').select('id, stage, deadline, clinic, patient, teeth_count, created_at')
      .not('stage', 'in', '(done,cancelled)').lte('deadline', dueLimit)
      .order('deadline', { ascending: true }).limit(50),
    // 오늘 들어온 주문 수
    sb.from('cnc_orders').select('id', { count: 'exact', head: true }).gte('created_at', startToday),
    // 이번 달 주문 (취소 제외) — 사용 크레딧 합계용
    sb.from('cnc_orders').select('credits_used, stage').gte('created_at', startMonth).limit(10000)
  ]));

  var counts = {};
  ADMIN_ACTIVE_STAGES.forEach(function (stage, i) {
    if (results[i].error) throw results[i].error;
    counts[stage] = results[i].count || 0;
  });
  var due = cncCheck(results[ADMIN_ACTIVE_STAGES.length]) || [];
  var todayRes = results[ADMIN_ACTIVE_STAGES.length + 1];
  if (todayRes.error) throw todayRes.error;
  var monthRows = cncCheck(results[ADMIN_ACTIVE_STAGES.length + 2]) || [];
  var monthActive = monthRows.filter(function (r) { return r.stage !== 'cancelled'; });

  return {
    counts: counts,
    due: due,
    today: todayRes.count || 0,
    month: monthActive.length,
    monthCredits: monthActive.reduce(function (s, r) { return s + (r.credits_used || 0); }, 0)
  };
}


// ================================================================
// 2) 주문 목록 · 상세
// ================================================================
// opts: { stage: 'active' | 'all' | 'submitted' ..., search: '', sort: 'newest' | 'deadline', offset, limit, userId }
// 돌려주는 값: { rows, hasMore }

async function cncAdminListOrders(opts) {
  opts = opts || {};
  var limit = opts.limit || CNC_PAGE_SIZE;
  var offset = opts.offset || 0;
  var query = sb.from('cnc_orders').select('*');

  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (!opts.stage || opts.stage === 'active') query = query.not('stage', 'in', '(done,cancelled)');
  else if (opts.stage !== 'all') query = query.eq('stage', opts.stage);

  var q = cncCleanSearch(opts.search);
  if (q) query = query.or('id.ilike.*' + q + '*,patient.ilike.*' + q + '*,clinic.ilike.*' + q + '*');

  if (opts.sort === 'deadline') {
    query = query.order('deadline', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  var rows = cncCheck(await query.range(offset, offset + limit)) || [];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// 주문 하나 + 고객 프로필 (닉네임)
async function cncAdminGetOrder(id) {
  var order = cncCheck(await sb.from('cnc_orders').select('*').eq('id', id).maybeSingle());
  if (!order) throw cncError('NOT_FOUND');
  var profile = null;
  try {
    profile = cncCheck(await sb.from('profiles').select('id, nickname, clinic_name, phone').eq('id', order.user_id).maybeSingle());
  } catch (err) {
    console.warn('Profile read failed:', err);
  }
  return { order: order, profile: profile };
}


// ================================================================
// 3) 주문 처리 (cnc_orders 직접 update — 관리자 update 정책)
// ================================================================

// 처리 이력 한 줄
function cncAdminHistoryEntry(action, note) {
  return { action: action, note: note || '', date: new Date().toISOString(), by: 'admin' };
}

// 주문 고치기 (공통)
// - expectStage: 지금 화면에서 본 단계. 그 사이에 다른 사람이 바꿨으면 STAGE_CHANGED 에러
// - fields: 바꿀 칸 { stage, carrier, ... }
// - entry: review_history 에 붙일 한 줄 (없으면 안 붙임)
async function cncAdminUpdate(order, expectStage, fields, entry) {
  var update = Object.assign({}, fields, { updated_at: new Date().toISOString() });
  if (entry) update.review_history = (order.review_history || []).concat([entry]);

  var result;
  try {
    result = await sb.from('cnc_orders').update(update).eq('id', order.id).eq('stage', expectStage).select();
  } catch (err) {
    throw cncError(cncErrorCode(err), { cause: err });
  }
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });
  if (!result.data || !result.data.length) {
    // 한 줄도 안 바뀜 → 단계가 이미 바뀌었거나 권한이 없음
    var now = await sb.from('cnc_orders').select('stage').eq('id', order.id).maybeSingle();
    if (now.data && now.data.stage !== expectStage) throw cncError('STAGE_CHANGED');
    throw cncError('NOT_ADMIN');
  }
  return result.data[0];
}

// submitted → confirmed
function cncAdminConfirm(order) {
  return cncAdminUpdate(order, 'submitted', { stage: 'confirmed' }, cncAdminHistoryEntry('confirmed'));
}

// approved → milling
function cncAdminStartMilling(order) {
  return cncAdminUpdate(order, 'approved', { stage: 'milling' }, cncAdminHistoryEntry('milling_started'));
}

// milling → shipped (택배사·송장번호)
function cncAdminShip(order, carrier, tracking) {
  carrier = String(carrier || '').trim();
  tracking = String(tracking || '').trim();
  return cncAdminUpdate(order, 'milling',
    { stage: 'shipped', carrier: carrier, tracking_number: tracking },
    cncAdminHistoryEntry('shipped', carrier + (tracking ? ' · ' + tracking : '')));
}

// shipped → done (고객 대신 수령 처리)
function cncAdminMarkDone(order) {
  return cncAdminUpdate(order, 'shipped', { stage: 'done' }, cncAdminHistoryEntry('marked_done'));
}

// 아무 단계로 직접 바꾸기 (확인창은 화면에서)
function cncAdminSetStage(order, newStage, note) {
  if (ADMIN_ALL_STAGES.indexOf(newStage) === -1) throw cncError('INVALID_ACTION');
  if (newStage === 'cancelled') throw cncError('INVALID_ACTION');   // 취소는 환불이 필요해서 "Cancel & refund" 로만
  var text = order.stage + ' → ' + newStage + (note ? ' · ' + note : '');
  return cncAdminUpdate(order, order.stage, { stage: newStage }, cncAdminHistoryEntry('stage_changed', text));
}


// ================================================================
// 4) 디자인 업로드
// ================================================================
// cnc-designs 버킷: {고객 user_id}/{주문번호}/v{버전}_{안전한파일명}
// design_versions 에 { version, paths: [...], names: [...], date } 추가 → stage = design_ready

// 다음 버전 번호 (예전 형식이 섞여 있어도 개수 기준으로 안전하게)
function cncNextDesignVersion(order) {
  var list = order.design_versions || [];
  var max = list.length;
  list.forEach(function (v) { if (v && v.version > max) max = v.version; });
  return max + 1;
}

// files: <input type="file"> 의 파일들. onProgress({ done, total, name })
async function cncAdminUploadDesign(order, files, onProgress) {
  var list = Array.prototype.slice.call(files || []);
  if (!list.length) throw cncError('NO_FILES');
  for (var i = 0; i < list.length; i++) {
    if (list[i].size > FILE_MAX_BYTES) throw cncError('FILE_TOO_LARGE', { fileName: list[i].name });
  }
  var expect = order.stage;
  if (expect !== 'confirmed' && expect !== 'design_revision') throw cncError('STAGE_CHANGED');

  var version = cncNextDesignVersion(order);
  var stamp = Date.now().toString(36);   // 같은 버전으로 다시 올려도 이름이 겹치지 않게
  var paths = [];
  var names = [];
  if (onProgress) onProgress({ done: 0, total: list.length, name: '' });

  for (var j = 0; j < list.length; j++) {
    var f = list[j];
    var path = order.user_id + '/' + order.id + '/v' + version + '_' + stamp + '_' + (j + 1) + '_' + cncSafeFileName(f.name);
    if (onProgress) onProgress({ done: j, total: list.length, name: f.name });
    var result;
    try {
      result = await sb.storage.from(CNC_DESIGNS_BUCKET).upload(path, f, {
        upsert: false,
        contentType: f.type || 'application/octet-stream'
      });
    } catch (err) {
      throw cncError('UPLOAD_FAILED', { fileName: f.name, cause: err });
    }
    if (result.error) throw cncError('UPLOAD_FAILED', { fileName: f.name, cause: result.error });
    paths.push(path);
    names.push(f.name);
  }
  if (onProgress) onProgress({ done: list.length, total: list.length, name: '' });

  var entry = { version: version, paths: paths, names: names, date: new Date().toISOString() };
  return cncAdminUpdate(order, expect,
    { stage: 'design_ready', design_versions: (order.design_versions || []).concat([entry]) },
    cncAdminHistoryEntry('design_uploaded', 'v' + version + ' · ' + names.join(', ')));
}


// ================================================================
// 5) 취소 + 환불 (DB 함수 admin_cancel_cnc_order)
// ================================================================
// 함수의 인자 이름이 프로젝트마다 다를 수 있어서, 흔한 이름 순서대로 시도해요.
// (PGRST202 = "그 인자 이름으로는 함수를 찾을 수 없음")
async function cncAdminCancel(order, reason) {
  reason = String(reason || '').trim();
  if (!reason) throw cncError('NOTE_REQUIRED');
  if (ADMIN_CANCELLABLE_STAGES.indexOf(order.stage) === -1) throw cncError('NOT_CANCELLABLE');

  var tries = [
    { p_id: order.id, p_reason: reason },
    { p_id: order.id, p_note: reason },
    { p_order_id: order.id, p_reason: reason },
    { p_id: order.id }
  ];
  var lastErr = null;
  for (var i = 0; i < tries.length; i++) {
    var result;
    try {
      result = await sb.rpc('admin_cancel_cnc_order', tries[i]);
    } catch (err) {
      throw cncError(cncErrorCode(err), { cause: err });
    }
    if (!result.error) {
      // 사유가 이력에 남았는지 확인하고, 없으면 붙여 둬요
      await cncAdminEnsureCancelNote(order.id, reason);
      return result.data;
    }
    lastErr = result.error;
    if (result.error.code !== 'PGRST202') break;
  }
  throw cncError(cncErrorCode(lastErr), { cause: lastErr });
}

async function cncAdminEnsureCancelNote(id, reason) {
  try {
    var fresh = cncCheck(await sb.from('cnc_orders').select('review_history, stage').eq('id', id).maybeSingle());
    if (!fresh) return;
    var history = fresh.review_history || [];
    var has = history.some(function (h) { return h && h.note === reason; });
    if (has) return;
    await sb.from('cnc_orders').update({
      review_history: history.concat([cncAdminHistoryEntry('cancelled', reason)]),
      updated_at: new Date().toISOString()
    }).eq('id', id);
  } catch (err) {
    console.warn('Cancel note save failed:', err);
  }
}


// ================================================================
// 6) 고객 · 크레딧
// ================================================================

// admin_list_users() 결과를 같은 모양으로 맞추기
// { id, email, nickname, clinic_name, phone, balance, created_at }
function cncAdminNormalizeUser(r) {
  r = r || {};
  var balance = r.balance;
  if (balance == null) balance = r.credits;
  if (balance == null) balance = r.credit_balance;
  return {
    id: r.id || r.user_id,
    email: r.email || '',
    nickname: r.nickname || '',
    clinic_name: r.clinic_name || '',
    phone: r.phone || '',
    balance: balance == null ? 0 : Number(balance),
    created_at: r.created_at || r.joined_at || null
  };
}

async function cncAdminListUsers() {
  var result;
  try {
    result = await sb.rpc('admin_list_users');
  } catch (err) {
    throw cncError(cncErrorCode(err), { cause: err });
  }
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });
  return (result.data || []).map(cncAdminNormalizeUser).sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

// 크레딧 충전(+) / 차감(-) → 새 잔액
async function cncAdminAddCredits(userId, amount, description) {
  amount = parseInt(amount, 10);
  if (!amount || isNaN(amount)) throw cncError('INVALID_AMOUNT');
  var result;
  try {
    result = await sb.rpc('admin_add_credits', { p_user: userId, p_amount: amount, p_description: String(description || '').trim() });
  } catch (err) {
    throw cncError(cncErrorCode(err), { cause: err });
  }
  if (result.error) {
    var msg = String(result.error.message || '');
    if (/check constraint|balance/i.test(msg) && amount < 0) throw cncError('BALANCE_NEGATIVE', { cause: result.error });
    throw cncError(cncErrorCode(result.error), { cause: result.error });
  }
  return result.data;
}

// 고객 한 명의 크레딧 이력 / 잔액
async function cncAdminCreditHistory(userId, limit) {
  return cncCheck(await sb.from('credit_history').select('*').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(limit || 100)) || [];
}

async function cncAdminGetBalance(userId) {
  var row = cncCheck(await sb.from('credit_wallets').select('balance').eq('user_id', userId).maybeSingle());
  return row ? (row.balance || 0) : 0;
}


// ================================================================
// 7) 파일 다운로드 주소 (서명 URL + "다운로드로 받기" 표시)
// ================================================================
async function cncAdminDownloadUrl(bucket, path, fileName) {
  if (!path) throw cncError('NOT_FOUND');
  var result = await sb.storage.from(bucket).createSignedUrl(path, 3600, { download: fileName || true });
  if (result.error) throw result.error;
  return result.data.signedUrl;
}
