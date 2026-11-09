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

// 지금 기준 (월 선택과 상관없음): 단계별 진행 중 주문 수 + 납기 임박·지남 목록
// 돌려주는 값: { counts: { submitted: 3, ... }, due: [주문...] }
async function cncAdminDashboardNow() {
  var dueLimit = cncAddDays(cncToday(), ADMIN_DUE_DAYS);
  var countJobs = ADMIN_ACTIVE_STAGES.map(function (stage) {
    return sb.from('cnc_orders').select('id', { count: 'exact', head: true }).eq('stage', stage);
  });
  var results = await Promise.all(countJobs.concat([
    sb.from('cnc_orders').select('id, stage, deadline, clinic, patient, teeth_count, created_at')
      .not('stage', 'in', '(done,cancelled)').lte('deadline', dueLimit)
      .order('deadline', { ascending: true }).limit(50)
  ]));
  var counts = {};
  ADMIN_ACTIVE_STAGES.forEach(function (stage, i) {
    if (results[i].error) throw results[i].error;
    counts[stage] = results[i].count || 0;
  });
  return { counts: counts, due: cncCheck(results[ADMIN_ACTIVE_STAGES.length]) || [] };
}

// 달의 시작·끝 (내 컴퓨터 시간 기준) → ISO 글자
function cncMonthRange(year, month) {
  return {
    start: new Date(year, month, 1).toISOString(),
    end: new Date(year, month + 1, 1).toISOString()
  };
}

// 선택한 달 통계 (created_at 기준) + 그 달에 완료된 주문 (updated_at 기준, stage = done)
// 돌려주는 값:
// { orders, teeth, done, cancelled, inProgress, daily: [1일 수, 2일 수, ...], completed: [주문...] }
// - teeth(= 사용 크레딧) 은 취소된 주문을 빼고 더해요 (취소하면 크레딧이 환불되니까)
async function cncAdminMonthStats(year, month) {
  var r = cncMonthRange(year, month);
  var results = await Promise.all([
    sb.from('cnc_orders').select('id, stage, teeth_count, created_at')
      .gte('created_at', r.start).lt('created_at', r.end).limit(20000),
    sb.from('cnc_orders').select('id, clinic, patient, teeth_count, updated_at, created_at')
      .eq('stage', 'done').gte('updated_at', r.start).lt('updated_at', r.end)
      .order('updated_at', { ascending: false }).limit(200)
  ]);
  var rows = cncCheck(results[0]) || [];
  var completed = cncCheck(results[1]) || [];
  var days = new Date(year, month + 1, 0).getDate();
  var daily = [];
  for (var i = 0; i < days; i++) daily.push(0);

  var stats = { orders: rows.length, teeth: 0, done: 0, cancelled: 0, inProgress: 0, daily: daily, completed: completed };
  rows.forEach(function (o) {
    if (o.stage === 'cancelled') stats.cancelled++;
    else stats.teeth += o.teeth_count || 0;
    if (o.stage === 'done') stats.done++;
    if (!isClosedStage(o.stage)) stats.inProgress++;
    var d = new Date(o.created_at);
    if (!isNaN(d.getTime())) daily[d.getDate() - 1]++;
  });
  return stats;
}

// 최근 12개월 (선택한 달까지) 월별 주문 수·치아 수
// 돌려주는 값: [{ year, month, orders, teeth }, ...] (오래된 달 → 선택한 달)
async function cncAdminTrend(year, month) {
  var first = new Date(year, month - 11, 1);
  var r = { start: first.toISOString(), end: new Date(year, month + 1, 1).toISOString() };
  var rows = cncCheck(await sb.from('cnc_orders').select('stage, teeth_count, created_at')
    .gte('created_at', r.start).lt('created_at', r.end).limit(50000)) || [];
  var list = [];
  for (var i = 0; i < 12; i++) {
    var d = new Date(first.getFullYear(), first.getMonth() + i, 1);
    list.push({ year: d.getFullYear(), month: d.getMonth(), orders: 0, teeth: 0 });
  }
  rows.forEach(function (o) {
    var d = new Date(o.created_at);
    var idx = (d.getFullYear() - first.getFullYear()) * 12 + (d.getMonth() - first.getMonth());
    if (idx < 0 || idx > 11) return;
    list[idx].orders++;
    if (o.stage !== 'cancelled') list[idx].teeth += o.teeth_count || 0;
  });
  return list;
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
  var stage = opts.stage || 'active';
  if (stage === 'active') {
    query = query.not('stage', 'in', '(done,cancelled)');          // 진행 중 전체
  } else if (stage !== 'all') {
    if (ADMIN_ALL_STAGES.indexOf(stage) === -1) throw cncError('INVALID_ACTION');
    query = query.eq('stage', stage);                              // 한 단계만
  }
  // 'all' → 단계 조건 없음 (완료·취소 포함 정말 전체)

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
  // by_name 은 화면용 미리보기 — 실제 이름은 DB 트리거가 로그인한 직원으로 다시 채워요 (sql/005_team.sql)
  return { action: action, note: note || '', date: new Date().toISOString(), by: 'admin', by_name: (window.APP && APP.adminName) || '' };
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
// 순서
//  1) 먼저 review_history 에 { action: 'admin_cancelled', note: 사유, by: 'admin' } 를 붙여요 (단계는 그대로라 알림 없음)
//     → LINE 알림 함수(line-notify)가 "관리자 취소"인지 "고객 취소"인지 이 기록으로 구분해요
//  2) admin_cancel_cnc_order 로 취소 + 환불 (이때 stage 가 cancelled 로 바뀌면서 고객에게 LINE 알림)
//  3) 2) 가 실패하면 1) 에서 붙인 기록을 되돌려요
// 함수의 인자 이름이 프로젝트마다 다를 수 있어서, 흔한 이름 순서대로 시도해요.
// (PGRST202 = "그 인자 이름으로는 함수를 찾을 수 없음")
async function cncAdminCancel(order, reason) {
  reason = String(reason || '').trim();
  if (!reason) throw cncError('NOTE_REQUIRED');
  if (ADMIN_CANCELLABLE_STAGES.indexOf(order.stage) === -1) throw cncError('NOT_CANCELLABLE');

  // 1) 취소 기록 먼저 (지금 단계가 그대로일 때만)
  var before = order.review_history || [];
  var marked = await cncAdminUpdate(order, order.stage, {}, cncAdminHistoryEntry('admin_cancelled', reason));

  // 2) 취소 + 환불
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
      lastErr = err;
      break;
    }
    if (!result.error) return result.data;
    lastErr = result.error;
    if (result.error.code !== 'PGRST202') break;
  }

  // 3) 실패 → 붙인 기록 되돌리기
  try {
    await sb.from('cnc_orders').update({ review_history: before, updated_at: new Date().toISOString() })
      .eq('id', order.id).eq('stage', marked.stage);
  } catch (err) {
    console.warn('Cancel note rollback failed:', err);
  }
  throw cncError(cncErrorCode(lastErr), { cause: lastErr });
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
    created_at: r.created_at || r.joined_at || null,
    line_linked: cncIsLineLinked(r)   // admin_list_users 가 line_user_id 를 주면 바로, 아니면 아래에서 profiles 로 채워요
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
  var users = (result.data || []).map(cncAdminNormalizeUser).sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  // 고객 LINE 연결 여부: profiles.line_user_id (manager 이상은 고객 프로필을 읽을 수 있어요)
  try {
    var ids = users.map(function (u) { return u.id; }).filter(Boolean);
    var linked = {};
    for (var i = 0; i < ids.length; i += 200) {
      var rows = cncCheck(await sb.from('profiles').select('id, line_user_id').in('id', ids.slice(i, i + 200))) || [];
      rows.forEach(function (p) { linked[p.id] = cncIsLineLinked(p); });
    }
    users.forEach(function (u) { if (u.id in linked) u.line_linked = linked[u.id]; });
  } catch (err) {
    console.warn('LINE status load failed', err);
  }
  return users;
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


// ================================================================
// 8) 크레딧 충전 요청 (Top-ups) — 승인·거절은 DB 함수로만
// ================================================================

// 목록. status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all'
// 고객 이름은 profiles 에서 한 번에 읽어서 붙여요 (row.customer = { nickname, clinic_name })
async function cncAdminListTopups(opts) {
  opts = opts || {};
  var limit = opts.limit || CNC_PAGE_SIZE;
  var offset = opts.offset || 0;
  var query = sb.from('topup_requests').select('*');
  if (opts.status && opts.status !== 'all') query = query.eq('status', opts.status);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  query = query.order('created_at', { ascending: opts.status === 'pending' });   // 대기 중은 오래된 것부터
  var rows = cncCheck(await query.range(offset, offset + limit)) || [];
  var page = rows.slice(0, limit);
  var ids = page.map(function (r) { return r.user_id; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  if (ids.length) {
    try {
      var profiles = cncCheck(await sb.from('profiles').select('id, nickname, clinic_name').in('id', ids)) || [];
      page.forEach(function (r) { r.customer = profiles.filter(function (p) { return p.id === r.user_id; })[0] || null; });
    } catch (err) {
      console.warn('Customer names failed:', err);
    }
  }
  return { rows: page, hasMore: rows.length > limit };
}

async function cncAdminPendingTopupCount() {
  var result = await sb.from('topup_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (result.error) throw result.error;
  return result.count || 0;
}

function cncAdminApproveTopup(id) {
  return cncRpc('admin_approve_topup', { p_id: id });
}

function cncAdminRejectTopup(id, reason) {
  return cncRpc('admin_reject_topup', { p_id: id, p_reason: String(reason || '').trim() });
}

// 입금 슬립 보기 주소 (비공개 버킷 topup-slips → 1시간 서명 URL)
function cncAdminSlipUrl(path) {
  return cncSignedUrl(TOPUP_SLIPS_BUCKET, path);
}


// ================================================================
// 9) 설정: 크레딧 패키지 · 결제 정보 (관리자 RLS 로 직접 수정)
// ================================================================

// 모든 패키지 (판매 중지 포함)
async function cncAdminListPackages() {
  return cncCheck(await sb.from('credit_packages').select('*').order('sort_order', { ascending: true }).order('credits', { ascending: true })) || [];
}

// 저장: id 가 있으면 수정, 없으면 추가
async function cncAdminSavePackage(pkg) {
  var fields = {
    credits: parseInt(pkg.credits, 10),
    unit_price: Number(pkg.unit_price),
    active: !!pkg.active,
    sort_order: parseInt(pkg.sort_order, 10) || 0
  };
  if (!fields.credits || fields.credits < 1 || isNaN(fields.unit_price) || fields.unit_price < 0) throw cncError('INVALID_AMOUNT');
  var result = pkg.id
    ? await sb.from('credit_packages').update(fields).eq('id', pkg.id).select()
    : await sb.from('credit_packages').insert(fields).select();
  if (result.error) {
    if (/duplicate|unique/i.test(String(result.error.message || ''))) throw cncError('DUPLICATE_PACKAGE', { cause: result.error });
    throw cncError(cncErrorCode(result.error), { cause: result.error });
  }
  if (!result.data || !result.data.length) throw cncError('NOT_ADMIN');
  return result.data[0];
}

async function cncAdminSaveSettings(fields) {
  var clean = {
    promptpay_id: String(fields.promptpay_id || '').trim(),
    bank_name: String(fields.bank_name || '').trim(),
    account_name: String(fields.account_name || '').trim(),
    account_number: String(fields.account_number || '').trim(),
    vat_rate: Number(fields.vat_rate),
    note: String(fields.note || '').trim(),
    updated_at: new Date().toISOString()
  };
  var result = await sb.from('payment_settings').update(clean).eq('id', 1).select();
  if (result.error) throw cncError(cncErrorCode(result.error), { cause: result.error });
  if (!result.data || !result.data.length) throw cncError('NOT_ADMIN');
  return result.data[0];
}


// ================================================================
// 10) 고객의 크레딧 묶음 · 현금 환불 계산기
// ================================================================

// 고객의 묶음 (남은 것 먼저, 만료 빠른 순)
async function cncAdminUserLots(userId) {
  return cncCheck(await sb.from('credit_lots').select('*').eq('user_id', userId)
    .order('expires_at', { ascending: true }).limit(200)) || [];
}

// 환불 계산 (계산만): { lots: [{ lot_id, rule, refundable, ... }], total_refundable, single_price, vat_rate }
function cncAdminRefundQuote(userId) {
  return cncRpc('admin_refund_quote', { p_user: userId });
}

// 환불 기록 (고른 묶음 → 0, 이력 'refund_cash'). 송금은 관리자가 직접
function cncAdminRefundCash(userId, lotIds, amount, note) {
  return cncRpc('admin_refund_cash', { p_user: userId, p_lot_ids: lotIds, p_amount: Number(amount), p_note: String(note || '').trim() });
}
