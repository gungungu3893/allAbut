// ================================================================
// allAbut — 팀(직원) 권한 · 작업 기록 · 관리자 LINE 그룹 (로직만, 화면 코드 없음)
// ================================================================
// DB: sql/005_team.sql
//   역할: owner ⊃ manager ⊃ staff  (APP.adminRole 에 저장)
//     staff   : 주문 처리 (Orders), 작업 기록 (Activity)
//     manager : + 충전 승인, 고객·크레딧, 주문 관리자 취소, Dashboard 주문 통계, 담당 영업 지정
//     owner   : + 환불, 매출, 설정, 팀, LINE 그룹, 커미션
//   + 'sales' (영업, sql/015) — 위 계층과 별개: 관리자 탭은 하나도 없고 "영업" 메뉴(#/admin/sales)만.
//     cncHasRole('staff' 이상) 은 sales 에게 false. 팀원 누구나 "영업 담당"을 켤 수 있어요 (APP.isSalesRep)
//   화면에서 숨기는 것은 편의일 뿐, 실제 보호는 DB 규칙(RLS·함수 안의 역할 확인)이 해요.
//   sql/023: 상태 status 'active' | 'pending'(대표 확인 전) | 'suspended'(정지) → active 가 아니면 역할이 있어도 권한 없음 (APP.adminStatus)

// 팀 관련 서버 에러 코드 — "USER_NOT_FOUND" 가 "NOT_FOUND" 보다 먼저 찾아지게 맨 앞에 붙여요
CNC_ERROR_CODES = ['USER_NOT_FOUND', 'ALREADY_MEMBER', 'INVALID_ROLE', 'NOT_MEMBER', 'LAST_OWNER', 'CANNOT_REMOVE_SELF'].concat(CNC_ERROR_CODES);
// 영업 · 커미션 서버 에러 코드 (sql/015 · 016) — 긴 이름 먼저 ('NOT_PAID' 가 다른 코드 안에서 먼저 찾아지지 않게).
//   cnc/cnc-sales.js 는 관리 팀 · 영업 담당만 불러와서 여기에 둬요 (NOT_SALES 는 권한 다시 확인에도 써요)
CNC_ERROR_CODES = ['COMMISSION_LOCKED', 'REP_NOT_FOUND', 'MONTH_NOT_ENDED', 'ALREADY_PAID', 'NOT_PAID', 'NOT_SALES',
  'INVALID_RATE_VALUE', 'INVALID_RATE_TYPE', 'INVALID_MONTH'].concat(CNC_ERROR_CODES);

// 관리자면 true (에러가 나면 false — 안전한 쪽으로). 005 실행 전 역할 확인용 (cncLoadAdminMe)
async function cncCheckAdmin() {
  try {
    var result = await sb.rpc('is_admin');
    if (result.error) return false;
    return result.data === true;
  } catch (err) {
    return false;
  }
}

var ADMIN_ROLES = ['owner', 'manager', 'staff'];            // 관리 계층 (관리자 탭)
var TEAM_ROLES = ADMIN_ROLES.concat(['sales']);             // 팀 역할 선택 (영업 포함, sql/015)
var ADMIN_ROLE_RANK = { owner: 3, manager: 2, staff: 1 };   // sales 는 0 → 관리자 권한 없음

// 지금 사용자가 이 역할 이상인지 (예: cncHasRole('manager'))
function cncHasRole(min) {
  var role = window.APP && APP.adminRole;
  if (window.APP && APP.adminStatus && APP.adminStatus !== 'active') return false;   // 확인 대기 · 정지 (sql/023)
  return !!role && (ADMIN_ROLE_RANK[role] || 0) >= (ADMIN_ROLE_RANK[min] || 1);
}

// 함수가 아직 없는지 (005 를 실행하기 전)
function cncIsMissingFunction(err) {
  var c = err && (err.cause || err);
  return !!c && (c.code === 'PGRST202' || c.code === '42883' || /Could not find the function|does not exist/i.test(String(c.message || '')));
}

// 로그인할 때: 내 역할·이름 { role, name, salesRep } (팀이 아니면 null)
//   005 를 아직 실행 안 했으면 예전처럼 is_admin() → 관리자면 owner 로 봐요
//   salesRep: 켜진 영업 담당인지 (sql/015 의 admin_me 가 알려줘요, 015 전이면 false)
async function cncLoadAdminMe() {
  try {
    var result = await sb.rpc('admin_me');
    if (!result.error) {
      var d = result.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
      if (d && typeof d === 'object' && TEAM_ROLES.indexOf(d.role) !== -1) {
        return { role: d.role, name: d.name || '', salesRep: !!d.sales_rep, status: d.status || 'active' };   // status: sql/023 (전이면 active)
      }
      return null;
    }
    if (!cncIsMissingFunction(result.error)) return null;
  } catch (err) {
    return null;
  }
  var legacy = await cncCheckAdmin();
  return legacy ? { role: 'owner', name: '', salesRep: false, legacy: true } : null;
}

// admin_me 결과를 APP 에 넣기 (로그인 · 내 역할이 바뀌었을 때 같이 써요)
//   APP.isAdmin    = 관리 팀(owner · manager · staff) → Admin 메뉴
//   APP.isSalesRep = 켜진 영업 담당 → "영업" 탭 (sales 역할이면 "영업" 메뉴 하나만)
//   APP.adminStatus = 'active' | 'pending' | 'suspended' (sql/023) — active 가 아니면 isAdmin · isSalesRep 모두 false
function cncApplyAdminMe(me) {
  var active = !!me && (me.status || 'active') === 'active';
  APP.adminRole = me ? me.role : null;
  APP.adminName = me ? me.name : '';
  APP.adminStatus = me ? (me.status || 'active') : null;
  APP.isAdmin = active && ADMIN_ROLES.indexOf(me.role) !== -1;
  APP.isSalesRep = active && !!me.salesRep;
  // 관리 팀 · 영업 담당이면 관리자 · 영업 화면 파일을 미리 받기 시작 (loader.js — 고객은 받지 않아요)
  if (cncCanOpenAdmin() && typeof cncLoadStaffScripts === 'function') cncLoadStaffScripts().catch(function () { /* router 가 다시 시도 */ });
}

// ----------------------------------------------------------------
// 권한 다시 확인 (직원 계정의 열려 있는 화면)
// ----------------------------------------------------------------
// 대표가 직원을 [정지] 하거나 역할을 바꾸면, 그 직원의 열려 있는 화면도 바로 막혀야 해요.
//   부르는 곳: session.js (1분마다 · 창으로 돌아왔을 때) · router.js (화면을 옮길 때, 5초에 한 번까지) ·
//              cnc-core.js cncError (서버가 NOT_ADMIN · NOT_SALES 로 거절했을 때 = 권한 함수가 false)
//   바뀌었으면 APP 을 고치고 헤더 · 화면을 다시 그려요 → 직원 계정이 정지 · 대기면 router.js 가 정지 안내 화면(PageStaffGate)으로
//   네트워크 오류면 아무것도 바꾸지 않아요 (잠깐 끊긴 것으로 권한을 잃지 않게)
var _staffRecheck = { busy: false, last: 0 };
async function cncRecheckStaffAccess(throttled) {
  if (!window.APP || !APP.user || !APP.adminRole) return false;
  var now = Date.now();
  if (_staffRecheck.busy) return false;
  if (throttled && now - _staffRecheck.last < 5000) return false;
  _staffRecheck.busy = true;
  _staffRecheck.last = now;
  try {
    var result = await sb.rpc('admin_me');
    if (result.error) return false;
    var d = result.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    var me = (d && typeof d === 'object' && TEAM_ROLES.indexOf(d.role) !== -1)
      ? { role: d.role, name: d.name || '', salesRep: !!d.sales_rep, status: d.status || 'active' } : null;
    var before = [APP.adminRole, APP.adminStatus || 'active', !!APP.isSalesRep].join('|');
    var after = me ? [me.role, me.status, me.status === 'active' && me.salesRep].join('|') : '||false';
    if (before === after) return false;
    cncApplyAdminMe(me);
    if (typeof renderLayout === 'function') renderLayout();
    if (typeof renderRoute === 'function') renderRoute();
    return true;
  } catch (e) {
    return false;
  } finally {
    _staffRecheck.busy = false;
  }
}

// 관리자 화면(#/admin)에 들어갈 수 있는지 (관리 팀 또는 영업 담당)
function cncCanOpenAdmin() {
  return !!(window.APP && (APP.isAdmin || APP.isSalesRep));
}

// ----------------------------------------------------------------
// 팀 관리 (owner)
// ----------------------------------------------------------------
async function cncAdminListTeam() {
  return (await cncRpc('admin_list_team')) || [];
}

function cncAdminAddMember(email, role, name) {
  return cncRpc('admin_add_member', { p_email: String(email || '').trim(), p_role: role, p_display_name: String(name || '').trim() });
}

function cncAdminSetRole(userId, role) {
  return cncRpc('admin_set_role', { p_user: userId, p_role: role });
}

function cncAdminSetMemberName(userId, name) {
  return cncRpc('admin_set_member_name', { p_user: userId, p_display_name: String(name || '').trim() });
}

function cncAdminRemoveMember(userId) {
  return cncRpc('admin_remove_member', { p_user: userId });
}

// ----------------------------------------------------------------
// 작업 기록 (staff 이상)
// ----------------------------------------------------------------
var AUDIT_PAGE = 50;
// 필터의 "작업" 묶음 → DB 의 action 값들
var AUDIT_ACTION_GROUPS = {
  orders: ['order_stage', 'order_shipping', 'order_design', 'order_cancelled', 'order_deadline'],
  topups: ['topup_approved', 'topup_rejected', 'refund_cash'],
  credits: ['credits_added', 'credits_removed'],
  team: ['team_add', 'team_role', 'team_name', 'team_remove', 'group_code',
    'staff_joined', 'staff_invite_created', 'staff_invite_revoked', 'staff_confirmed', 'staff_suspended', 'staff_reactivated', 'clients_moved', 'staff_converted'],   // 직원 (sql/023)
  sales: ['topup_rep', 'order_rep', 'customer_rep', 'sales_rep_on', 'sales_rep_off', 'commission_rate', 'commission_paid', 'commission_unpaid'],
  settings: ['settings_changed', 'service_mode', 'ad_banner_saved', 'ad_banner_deleted', 'retention_settings', 'retention_run']
};

// 역할마다 고를 수 있는 "작업" 묶음 (sql/024 — DB 가 역할별로 걸러서, 볼 수 없는 묶음은 처음부터 안 보여줘요)
//   manager = 주문 · 충전 · 크레딧 · 설정(광고 배너 · 등록 치과 정보 변경 요청) / owner = 전부
function cncAuditGroupsForRole() {
  if (cncHasRole('owner')) return ['orders', 'topups', 'credits', 'team', 'sales', 'settings'];
  if (cncHasRole('manager')) return ['orders', 'topups', 'credits', 'settings'];
  return ['orders'];
}

// 제작 직원 "내 작업" (sql/024): 내가 처리한 주문 작업만 (단계 · 디자인 · 배송 · 납기), p_from(ISO) 이후 최신순
var MY_WORK_ACTIONS = ['order_stage', 'order_design', 'order_shipping', 'order_deadline'];
async function cncMyWork(fromIso) {
  var me = APP.user && APP.user.id;
  if (!me) return [];
  var q = sb.from('admin_audit_log').select('*').eq('actor_id', me).in('action', MY_WORK_ACTIONS)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(500);
  if (fromIso) q = q.gte('created_at', fromIso);
  return cncCheck(await q) || [];
}

// 방콕 날짜 'YYYY-MM-DD' (시각 → 방콕)
function cncBkkDay(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
// "내 작업" 묶음: 오늘 / 이번 주(월요일부터, 오늘 빼고) / 이번 달(이번 주 빼고) / 그 전 — 방콕 기준
//   now: 테스트용 (없으면 지금). 돌려주는 값 { today: [], week: [], month: [], older: [] }
function cncGroupMyWork(rows, now) {
  var today = cncBkkDay((now || new Date()).toISOString());
  var t0 = new Date(today + 'T00:00:00Z');
  var dow = (t0.getUTCDay() + 6) % 7;   // 월요일 = 0
  var weekStart = new Date(t0.getTime() - dow * 864e5).toISOString().slice(0, 10);
  var monthStart = today.slice(0, 8) + '01';
  var out = { today: [], week: [], month: [], older: [] };
  (rows || []).forEach(function (r) {
    var d = cncBkkDay(r.created_at);
    if (d === today) out.today.push(r);
    else if (d >= weekStart) out.week.push(r);
    else if (d >= monthStart) out.month.push(r);
    else out.older.push(r);
  });
  return out;
}
// "내 작업" 을 어디부터 불러올지: 이번 주 시작과 이번 달 1일 중 빠른 날 (방콕 0시 → ISO)
function cncMyWorkFrom(now) {
  var today = cncBkkDay((now || new Date()).toISOString());
  var t0 = new Date(today + 'T00:00:00Z');
  var dow = (t0.getUTCDay() + 6) % 7;
  var weekStart = new Date(t0.getTime() - dow * 864e5).toISOString().slice(0, 10);
  var monthStart = today.slice(0, 8) + '01';
  var from = weekStart < monthStart ? weekStart : monthStart;
  return new Date(new Date(from + 'T00:00:00Z').getTime() - 7 * 3600000).toISOString();   // 방콕 0시
}

// filters: { actor: user id, group: 'orders'|..., target: 글자, before: 시각(더 보기) }
async function cncAdminListAudit(filters) {
  var f = filters || {};
  var q = sb.from('admin_audit_log').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(AUDIT_PAGE + 1);
  if (f.actor) q = q.eq('actor_id', f.actor);
  if (f.group && AUDIT_ACTION_GROUPS[f.group]) q = q.in('action', AUDIT_ACTION_GROUPS[f.group]);
  if (f.target) q = q.ilike('target_id', '%' + String(f.target).trim().replace(/[%_,()]/g, '') + '%');
  if (f.before) q = q.lt('created_at', f.before);
  var rows = cncCheck(await q) || [];
  return { rows: rows.slice(0, AUDIT_PAGE), hasMore: rows.length > AUDIT_PAGE };
}

// ----------------------------------------------------------------
// 관리자 LINE 알림 대상 · 그룹 코드 (owner)
// ----------------------------------------------------------------
var NOTIFY_CATEGORIES = ['orders', 'topups', 'account', 'customer_copy'];   // customer_copy: 고객 알림 사본 (sql/006)
var GROUP_CODE_POLL_MS = 5000;   // 5초마다 연결됐는지 확인

// 관리자 LINE 알림 카드 색 안내 (Settings → LINE groups 의 범례) — 영수증 카드의 제목 글씨 색
// ⚠️ supabase/functions/line-notify/index.ts 의 ADMIN_NOTICE_STYLES 색과 같게 맞춰 주세요
var ADMIN_NOTICE_LEGEND = [
  { color: '#1D4ED8', key: 'lg_legend_new' },
  { color: '#15803D', key: 'lg_legend_good' },
  { color: '#EA580C', key: 'lg_legend_revision' },
  { color: '#B91C1C', key: 'lg_legend_cancel' },
  { color: '#B8860B', key: 'lg_legend_money' },
  { color: '#7C3AED', key: 'lg_legend_refund' },
  { color: '#4B5563', key: 'lg_legend_gray' },
  { color: '#0E7490', key: 'lg_legend_team' }
];

async function cncAdminListNotifyTargets() {
  return cncCheck(await sb.from('admin_notify_targets').select('*').order('created_at', { ascending: true })) || [];
}

// fields: { categories?: [...], active?: true|false, name?: '...' }
async function cncAdminUpdateNotifyTarget(id, fields) {
  var patch = {};
  if (fields.categories) patch.categories = fields.categories.filter(function (c) { return NOTIFY_CATEGORIES.indexOf(c) !== -1; });
  if (typeof fields.active === 'boolean') patch.active = fields.active;
  if (typeof fields.name === 'string') patch.name = fields.name.trim().slice(0, 100);
  cncCheck(await sb.from('admin_notify_targets').update(patch).eq('id', id));
}

async function cncAdminDeleteNotifyTarget(id) {
  cncCheck(await sb.from('admin_notify_targets').delete().eq('id', id));
}

// 새 그룹 연결 코드 → { code: 'GRP-7K2Q', expires_at }
async function cncAdminCreateGroupCode() {
  var d = await cncRpc('admin_create_group_code');
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = { code: d }; } }
  return d || {};
}

// 코드가 쓰였는지 → { used: true|false }
async function cncAdminGroupCodeStatus(code) {
  var row = cncCheck(await sb.from('admin_group_link_codes').select('code, used_at, target_id').eq('code', code).maybeSingle());
  return { used: !!(row && row.used_at), targetId: row ? row.target_id : null };
}
