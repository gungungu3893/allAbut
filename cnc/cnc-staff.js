// ================================================================
// allAbut — 직원 계정 · 초대 링크 · 역할별 첫 화면 · 대표의 직원 메뉴 · 영업 화면 데이터 (로직만, 화면 코드 없음)
// ================================================================
// DB: sql/023_staff_accounts.sql
//   계정 종류 profiles.account_type: 'customer'(기본) | 'staff' (직원 — 본명 · 전화 · 이메일만, 주문 · 충전 불가 STAFF_ACCOUNT)
//   owner(대표)는 고객 기능도 쓰니까 customer 그대로 → 지금처럼 고객 메뉴 + Admin 메뉴
//   직원 계정 + 역할: sales(영업) → 영업 홈 / staff(제작 직원) → 주문 / manager(매니저) → 대시보드
//   상태: 'active' | 'pending'(매니저 초대 — 대표 확인 전) | 'suspended'(정지) → active 가 아니면 "기다려 주세요 / 정지됐어요" 화면만
//   화면에서 숨기는 것은 편의이고, 실제 보호는 DB 규칙 · 함수 권한 (has_admin_role · is_sales_rep · my_sales_rep_id)

CNC_ERROR_CODES = ['INVITE_INVALID', 'STAFF_ACCOUNT', 'CANNOT_CHANGE_SELF', 'HAS_CREDITS', 'HAS_ACTIVE_ORDERS', 'NOT_CUSTOMER', 'INVALID_HOURS'].concat(CNC_ERROR_CODES);

var STAFF_INVITE_ROLES = ['sales', 'staff', 'manager'];   // owner 초대는 없어요
var STAFF_INVITE_HOURS = [1, 6, 24, 48, 72, 168];         // 초대 유효 시간 고르기 (기본 48)

// ----------------------------------------------------------------
// 지금 사용자
// ----------------------------------------------------------------
// 직원 계정인지 (프로필의 account_type — owner 는 customer)
function cncIsStaffAccount(profile) {
  var p = profile || (window.APP && APP.profile) || {};
  return p.account_type === 'staff';
}

// 직원 상태: 'active' | 'pending' | 'suspended' | 'none'(팀에서 빠짐)
function cncStaffStatus() {
  var A = window.APP || {};
  if (!A.adminRole) return 'none';
  return A.adminStatus || 'active';
}

// 직원 계정인데 지금 쓸 수 없는 상태 (확인 대기 · 정지 · 팀에서 빠짐)
function cncStaffBlocked() {
  return cncIsStaffAccount() && cncStaffStatus() !== 'active';
}

// 역할마다 첫 화면 (직원 계정만 — 고객 · owner 는 #/home)
function cncStaffStartRoute() {
  var A = window.APP || {};
  if (!cncIsStaffAccount()) return 'home';
  if (A.adminRole === 'manager' || A.adminRole === 'owner') return 'admin/dashboard';
  if (A.adminRole === 'staff') return 'admin/orders';
  if (A.adminRole === 'sales' || A.isSalesRep) return 'admin/sales';
  return 'profile';
}

// 직원 계정이 열면 안 되는 고객 화면 (홈 · 새 주문 · 내 주문 · 충전 · 이용 가이드 · 필수 정보 입력)
var CUSTOMER_ONLY_ROUTES = ['home', 'new', 'orders', 'topup', 'guide', 'complete'];
function cncIsCustomerOnlyRoute(name) {
  return CUSTOMER_ONLY_ROUTES.indexOf(name) !== -1;
}

// ----------------------------------------------------------------
// 초대 링크
// ----------------------------------------------------------------
// 주소의 토큰 읽기 (#/join?t=…)
function cncInviteTokenFromHash(hash) {
  var h = String(hash == null ? location.hash : hash);
  var i = h.indexOf('?');
  if (i === -1) return '';
  var t = new URLSearchParams(h.slice(i + 1)).get('t') || '';
  return /^[0-9a-f]{64,128}$/i.test(t) ? t : '';
}

// 초대 링크 주소 (config.js 의 SITE_URL)
function cncInviteLink(token) {
  return SITE_URL + '/#/join?t=' + encodeURIComponent(token);
}

// 로그인 전: 쓸 수 있는 링크인지 → { valid, role } (틀린 토큰 · 함수 없음 = valid false)
async function cncCheckStaffInvite(token) {
  if (!token) return { valid: false, role: null };
  try {
    var r = await sb.rpc('check_staff_invite', { p_token: token });
    if (r.error) return { valid: false, role: null, error: r.error };
    var d = cncParseJson(r.data) || {};
    return { valid: !!d.valid, role: STAFF_INVITE_ROLES.indexOf(d.role) !== -1 ? d.role : null };
  } catch (e) {
    return { valid: false, role: null, error: e };
  }
}

// 직원 가입 (이름 · 전화 · 이메일 · 비밀번호 + 동의 + Turnstile) — 실제 역할은 서버가 초대 기록에서 정해요
async function cncStaffSignUp(fields) {
  return signUp({
    email: fields.email, password: fields.password, fullName: fields.full_name, phone: fields.phone,
    clinicName: '', taxId: '', address: '', country: 'TH',
    legal: fields.legal, captchaToken: fields.captchaToken, staffInvite: fields.token
  });
}

// 직원 가입 칸 검사 → { 칸: 번역 키 }
function cncValidateStaffJoin(f) {
  var e = {};
  if (!cncNormName(f.full_name)) e.full_name = 'err_full_name_required';
  if (!String(f.phone || '').trim()) e.phone = 'err_phone_required';
  else if (!cncValidPhone(f.phone, 'TH')) e.phone = 'err_phone_intl';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email || '').trim())) e.email = 'err_email_invalid';
  else if (cncIsDisposableEmail(f.email)) e.email = 'err_email_disposable';
  if (String(f.password || '').length < PASSWORD_MIN_LENGTH) e.password = 'err_password_short';   // 8자 이상
  else if (f.password !== f.password2) e.password2 = 'err_password_mismatch';
  if (!f.agree) e.agree = 'err_agree_required';
  return e;
}

// ----------------------------------------------------------------
// 대표(owner): 직원 메뉴
// ----------------------------------------------------------------
async function cncAdminListStaff() {
  var d = cncParseJson(await cncRpc('admin_list_staff'));
  return Array.isArray(d) ? d : [];
}
async function cncAdminCreateStaffInvite(role, hours, note) {
  return cncParseJson(await cncRpc('admin_create_staff_invite', { p_role: role, p_hours: Number(hours) || 48, p_note: String(note || '').trim() }));
}
async function cncAdminListStaffInvites() {
  var d = cncParseJson(await cncRpc('admin_list_staff_invites'));
  return Array.isArray(d) ? d : [];
}
function cncAdminRevokeStaffInvite(id) { return cncRpc('admin_revoke_staff_invite', { p_id: Number(id) }); }
function cncAdminConfirmMember(userId) { return cncRpc('admin_confirm_member', { p_user: userId }); }
function cncAdminSetMemberActive(userId, active, moveTo) {
  return cncRpc('admin_set_member_active', { p_user: userId, p_active: !!active, p_move_to: moveTo || null });
}
async function cncAdminRepClients(repId) {
  var d = cncParseJson(await cncRpc('admin_rep_clients', { p_rep: repId }));
  return Array.isArray(d) ? d : [];
}
function cncAdminMoveClients(userIds, toRep) { return cncRpc('admin_move_clients', { p_users: userIds || [], p_to: toRep || null }); }
function cncAdminConvertToStaff(userId) { return cncRpc('admin_convert_to_staff', { p_user: userId }); }

// 대시보드 "지금 처리할 일" — 최근 7일 초대 가입 + 확인 대기 매니저 (023 전이면 빈 값)
async function cncAdminStaffTodo() {
  try {
    var r = await sb.rpc('admin_staff_todo');
    if (r.error) return { joins: [], pending: [] };
    var d = cncParseJson(r.data) || {};
    return { joins: Array.isArray(d.joins) ? d.joins : [], pending: Array.isArray(d.pending) ? d.pending : [] };
  } catch (e) {
    return { joins: [], pending: [] };
  }
}

// 초대 상태 번역 키
function cncInviteStatusKey(status) {
  return { waiting: 'staff_inv_waiting', used: 'staff_inv_used', expired: 'staff_inv_expired', revoked: 'staff_inv_revoked' }[status] || 'staff_inv_waiting';
}
function cncMemberStatusKey(status) {
  return { active: 'staff_status_active', pending: 'staff_status_pending', suspended: 'staff_status_suspended' }[status] || 'staff_status_active';
}

// ----------------------------------------------------------------
// 영업 화면 데이터 (전부 내 담당 거래처만 — 서버 함수가 my_sales_rep_id() 로 걸러요)
// ----------------------------------------------------------------
async function cncSalesSummary() {
  var d = cncParseJson(await cncRpc('sales_my_summary')) || {};
  var n = function (v) { return Number(v) || 0; };
  return {
    year: n(d.year), month: n(d.month), amount: n(d.amount), payments: n(d.payments), commission: n(d.commission),
    clients: n(d.clients), activeOrders: n(d.active_orders), pendingTopups: n(d.pending_topups),
    recent: Array.isArray(d.recent) ? d.recent : []
  };
}
async function cncSalesClients() {
  var d = cncParseJson(await cncRpc('sales_my_clients'));
  return Array.isArray(d) ? d : [];
}
async function cncSalesClientOrders(from, to, stage) {
  var d = cncParseJson(await cncRpc('sales_my_client_orders', { p_from: from || null, p_to: to || null, p_stage: stage || null }));
  return Array.isArray(d) ? d : [];
}
async function cncSalesPendingTopups() {
  var d = cncParseJson(await cncRpc('sales_my_pending_topups'));
  return Array.isArray(d) ? d : [];
}
async function cncSalesRevenue(months) {
  var d = cncParseJson(await cncRpc('sales_my_revenue', { p_months: months || 12 }));
  return (Array.isArray(d) ? d : []).map(function (m) {
    var n = function (v) { return Number(v) || 0; };
    return { year: n(m.year), month: n(m.month), amount: n(m.amount), payments: n(m.payments), refunds: n(m.refunds),
      refundAmount: n(m.refund_amount), refundDeduction: n(m.refund_deduction), commission: n(m.commission) };
  });
}

// 거래처별 합계 (커미션 건별 상세 → 그 달의 거래처 표): [{ customer, payments, amount, refunds, commission }]
function cncRevenueByClient(items) {
  var map = {};
  (items || []).forEach(function (i) {
    var k = i.customer || '—';
    if (!map[k]) map[k] = { customer: k, payments: 0, amount: 0, refunds: 0, commission: 0 };
    if (i.kind === 'payment') { map[k].payments++; map[k].amount += i.amount; }
    if (i.kind === 'refund') { map[k].refunds++; map[k].amount -= i.amount; }
    map[k].commission += i.commission;
  });
  return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.amount - a.amount; });
}

// 기간 안인지 ('YYYY-MM-DD' 둘 다 비면 전부)
function cncInDateRange(iso, from, to) {
  if (!iso) return !from && !to;
  var d = new Date(iso);
  var k = new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);   // 방콕 날짜
  if (from && k < from) return false;
  if (to && k > to) return false;
  return true;
}
