// ================================================================
// allAbut — 영업(sales) · 주문 담당자 · 커미션 (로직만, 화면 코드 없음) — DB: sql/015_sales_commission.sql
// ================================================================
// 역할 'sales' (영업)는 owner ⊃ manager ⊃ staff 계층과 별개예요.
//   - sales 역할: 관리자 화면 대신 "영업" 메뉴 하나 (#/admin/sales) — 내 담당 주문 + 내 월별 커미션
//   - 팀원 누구나(owner · manager · staff) "영업 담당"을 켤 수 있어요 → Admin 안에 "영업" 탭이 같이 보여요
//   - 다른 고객 주문 · 프로필 · 돈 정보는 DB 가 막아요 (is_admin() 이 sales 에게 false). 화면에서 숨기는 것은 편의일 뿐
// 커미션 = 그 달(방콕)에 배송된 주문 × 배송일에 유효한 요율
//   percent   : 주문 매출(묶음 단가 × 사용 크레딧, VAT 별도, 무료 묶음 0) × 값%
//   per_tooth : 유료 묶음으로 만든 치아 수 × 값 (THB)
// 지급 완료한 달은 스냅샷 숫자 그대로 (다시 계산 안 함), 그 달 주문은 담당자 변경 불가

// 서버 에러 코드 (긴 이름 먼저 — 'NOT_PAID' 가 다른 코드 안에서 먼저 찾아지지 않게)
CNC_ERROR_CODES = ['COMMISSION_LOCKED', 'REP_NOT_FOUND', 'MONTH_NOT_ENDED', 'ALREADY_PAID', 'NOT_PAID', 'NOT_SALES',
  'INVALID_RATE_VALUE', 'INVALID_RATE_TYPE', 'INVALID_MONTH'].concat(CNC_ERROR_CODES);

var RATE_TYPES = ['percent', 'per_tooth'];

// ----------------------------------------------------------------
// 영업 담당 목록 (staff 이상: 이름 · 켜짐 / owner 는 지금 요율도)
//   → [{ rep_id, name, email, role, active, rate: { type, value, effective_from } | null }]
//   015 실행 전이면 null (화면은 담당 칸을 숨겨요)
// ----------------------------------------------------------------
var _salesRepsCache = null;
async function cncAdminListSalesReps(force) {
  if (_salesRepsCache && !force) return _salesRepsCache;
  try {
    var d = await cncRpc('admin_list_sales_reps');
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = []; } }
    _salesRepsCache = Array.isArray(d) ? d : [];
    return _salesRepsCache;
  } catch (err) {
    if (cncIsMissingFunction(err)) return null;
    throw err;
  }
}
function cncClearSalesRepsCache() { _salesRepsCache = null; }

// 담당자 이름 (목록에서 찾기, 없으면 '')
function cncRepName(reps, id) {
  if (!id || !reps) return '';
  for (var i = 0; i < reps.length; i++) if (reps[i].rep_id === id) return reps[i].name || reps[i].email || '';
  return '';
}

// 켜진 담당자만 (선택 상자용)
function cncActiveReps(reps) {
  return (reps || []).filter(function (r) { return r.active; });
}

// ----------------------------------------------------------------
// 팀 (owner): 영업 담당 켜기 · 끄기, 요율
// ----------------------------------------------------------------
function cncAdminSetSalesRep(userId, active) {
  cncClearSalesRepsCache();
  return cncRpc('admin_set_sales_rep', { p_user: userId, p_active: !!active });
}

// 요율 검사 → 에러 키 또는 '' (DB 와 같은 규칙: percent 0~100, 치아당 0~1,000,000 THB)
function cncValidateRate(type, value) {
  if (RATE_TYPES.indexOf(type) === -1) return 'rate_err_type';
  var s = String(value == null ? '' : value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'rate_err_value';
  var n = Number(s);
  if (type === 'percent' && n > 100) return 'rate_err_percent';
  if (n > 1000000) return 'rate_err_value';
  return '';
}

function cncAdminSetRepRate(repId, type, value, effectiveFrom) {
  cncClearSalesRepsCache();
  return cncRpc('admin_set_rep_rate', { p_rep: repId, p_type: type, p_value: Number(value), p_effective_from: effectiveFrom || null });
}

// 요율 이력 (owner — RLS: 본인 또는 owner) 최신 시작일 먼저
async function cncAdminRepRates(repId) {
  return cncCheck(await sb.from('sales_rep_rates').select('*').eq('rep_id', repId)
    .order('effective_from', { ascending: false }).order('created_at', { ascending: false })) || [];
}

// 요율 글자: "10%" / "300.00 THB / 치아"
function cncRateText(rate) {
  if (!rate || rate.type == null) return t('rate_none');
  if (rate.type === 'percent') return formatNumber(Number(rate.value)) + '%';
  return tf('rate_per_tooth_text', { amount: formatTHB(Number(rate.value)) });
}

// ----------------------------------------------------------------
// 담당자 지정 (manager 이상)
// ----------------------------------------------------------------
function cncAdminSetOrderRep(orderId, repId, reason) {
  return cncRpc('admin_set_order_rep', { p_order: orderId, p_rep: repId || null, p_reason: String(reason || '').trim() });
}

function cncAdminSetCustomerRep(userId, repId, applyOpenOrders) {
  return cncRpc('admin_set_customer_rep', { p_user: userId, p_rep: repId || null, p_apply_open_orders: !!applyOpenOrders });
}

// ----------------------------------------------------------------
// 커미션
// ----------------------------------------------------------------
function cncParseJson(d) {
  if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return null; } }
  return d;
}

// 숫자 정리 (스냅샷 · 계산 모두 같은 모양으로)
function cncNormalizeCommission(d) {
  d = cncParseJson(d) || {};
  var n = function (v) { return Number(v) || 0; };
  return {
    year: n(d.year), month: n(d.month), monthEnded: !!d.month_ended,
    unassigned: d.unassigned == null ? null : n(d.unassigned),
    reps: (d.reps || []).map(function (r) {
      return {
        repId: r.rep_id, name: r.name || '', active: !!r.active,
        orders: n(r.orders), teeth: n(r.teeth), paidTeeth: n(r.paid_teeth), revenue: n(r.revenue), commission: n(r.commission),
        rate: r.rate || null,
        paid: r.paid ? { paidAt: r.paid.paid_at, by: r.paid.paid_by_name || '', note: r.paid.note || '', total: n(r.paid.total) } : null,
        items: (r.items || []).map(function (i) {
          return {
            orderId: i.order_id, clinic: i.clinic || '', shippedAt: i.shipped_at, teeth: n(i.teeth), paidTeeth: n(i.paid_teeth),
            revenue: n(i.revenue), rateType: i.rate_type || null, rateValue: i.rate_value == null ? null : n(i.rate_value), commission: n(i.commission)
          };
        })
      };
    })
  };
}

// owner: 그 달 전체 (year, month 는 1~12)
async function cncAdminCommissionMonth(year, month) {
  return cncNormalizeCommission(await cncRpc('admin_commission_month', { p_year: year, p_month: month }));
}

// 영업 본인: 내 것만
async function cncMyCommissionMonth(year, month) {
  return cncNormalizeCommission(await cncRpc('my_commission_month', { p_year: year, p_month: month }));
}

// 영업 본인: 내 담당 주문 (주문번호 · 치과명 · 치아 수 · 단계 · 배송일)
async function cncSalesMyOrders() {
  var d = cncParseJson(await cncRpc('sales_my_orders', { p_limit: 300 }));
  return Array.isArray(d) ? d : [];
}

function cncAdminMarkCommissionPaid(repId, year, month, note) {
  return cncRpc('admin_mark_commission_paid', { p_rep: repId, p_year: year, p_month: month, p_note: String(note || '').trim() });
}

function cncAdminUnmarkCommissionPaid(repId, year, month, reason) {
  return cncRpc('admin_unmark_commission_paid', { p_rep: repId, p_year: year, p_month: month, p_reason: String(reason || '').trim() });
}

// 방콕 기준 지금 연 · 월 (1~12)
function cncBkkYearMonth() {
  var s = (typeof cncBkkToday === 'function') ? cncBkkToday() : new Date().toISOString().slice(0, 10);
  var p = s.split('-');
  return { year: +p[0], month: +p[1] };
}

// 달 이동 (delta = -1 / +1)
function cncShiftMonth(year, month, delta) {
  var m = month - 1 + delta;
  return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 + 1 };
}

// 그 달(방콕)의 시작 · 끝 ISO (주문 목록 "배송한 달" 필터용) → { from, to } (to 는 다음 달 1일, 미포함)
function cncBkkMonthRange(year, month) {
  var next = cncShiftMonth(year, month, 1);
  var pad = function (v) { return String(v).padStart(2, '0'); };
  return { from: year + '-' + pad(month) + '-01T00:00:00+07:00', to: next.year + '-' + pad(next.month) + '-01T00:00:00+07:00' };
}

// CSV (owner): 직원별 주문 한 줄씩 — 기존 CSV 규칙 (UTF-8 BOM, 금액은 쉼표 없는 숫자, 수식 주입 방지 cncCsvCell)
function cncCommissionCsv(data, headers) {
  var lines = [headers.map(function (h) { return cncCsvCell(h, true); }).join(',')];
  (data.reps || []).forEach(function (r) {
    r.items.forEach(function (i) {
      lines.push([
        cncCsvCell(r.name, true),
        cncCsvCell(i.orderId, true),
        cncCsvCell(i.clinic, true),
        cncCsvCell(i.shippedAt ? String(i.shippedAt).slice(0, 10) : '', true),
        cncCsvCell(i.teeth),
        cncCsvCell(i.paidTeeth),
        cncCsvMoney(i.revenue),
        cncCsvCell(i.rateType || '', true),
        i.rateValue == null ? '' : cncCsvMoney(i.rateValue),
        cncCsvMoney(i.commission),
        cncCsvCell(r.paid ? 'paid' : 'unpaid', true)
      ].join(','));
    });
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function cncCommissionCsvName(year, month) {
  return 'allabut-commission-' + year + '-' + String(month).padStart(2, '0') + '.csv';
}
