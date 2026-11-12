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

// 팀 관련 서버 에러 코드 — "USER_NOT_FOUND" 가 "NOT_FOUND" 보다 먼저 찾아지게 맨 앞에 붙여요
CNC_ERROR_CODES = ['USER_NOT_FOUND', 'ALREADY_MEMBER', 'INVALID_ROLE', 'NOT_MEMBER', 'LAST_OWNER', 'CANNOT_REMOVE_SELF'].concat(CNC_ERROR_CODES);

var ADMIN_ROLES = ['owner', 'manager', 'staff'];            // 관리 계층 (관리자 탭)
var TEAM_ROLES = ADMIN_ROLES.concat(['sales']);             // 팀 역할 선택 (영업 포함, sql/015)
var ADMIN_ROLE_RANK = { owner: 3, manager: 2, staff: 1 };   // sales 는 0 → 관리자 권한 없음

// 지금 사용자가 이 역할 이상인지 (예: cncHasRole('manager'))
function cncHasRole(min) {
  var role = window.APP && APP.adminRole;
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
      if (d && typeof d === 'object' && TEAM_ROLES.indexOf(d.role) !== -1) return { role: d.role, name: d.name || '', salesRep: !!d.sales_rep };
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
function cncApplyAdminMe(me) {
  APP.adminRole = me ? me.role : null;
  APP.adminName = me ? me.name : '';
  APP.isAdmin = !!me && ADMIN_ROLES.indexOf(me.role) !== -1;
  APP.isSalesRep = !!me && !!me.salesRep;
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
  team: ['team_add', 'team_role', 'team_name', 'team_remove', 'group_code'],
  sales: ['topup_rep', 'order_rep', 'customer_rep', 'sales_rep_on', 'sales_rep_off', 'commission_rate', 'commission_paid', 'commission_unpaid'],
  settings: ['settings_changed']
};

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
