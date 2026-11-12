// ================================================================
// allAbut — 영업(sales) · 담당자 · 커미션 (로직만, 화면 코드 없음)
//   DB: sql/015_sales_commission.sql (역할 · 담당 · 요율 · 정산) + sql/016_commission_on_payments.sql (수금 기준)
// ================================================================
// 역할 'sales' (영업)는 owner ⊃ manager ⊃ staff 계층과 별개예요.
//   - sales 역할: 관리자 화면 대신 "영업" 메뉴 하나 (#/admin/sales) — 내 담당 고객 입금 내역 + 내 월별 커미션
//   - 팀원 누구나(owner · manager · staff) "영업 담당"을 켤 수 있어요 → Admin 안에 "영업" 탭이 같이 보여요
//   - 다른 고객 정보 · 돈 정보는 DB 가 막아요 (is_admin() 이 sales 에게 false). 화면에서 숨기는 것은 편의일 뿐
// 커미션 = 수금 기준 (sql/016)
//   실적 = 충전 입금이 승인(approved)된 건. 승인되는 순간 그 고객의 담당 영업이 충전 요청에 기록돼요 (topup_requests.sales_rep_id)
//   커미션 달 = 승인 시각의 방콕 달 / 요율 = 승인일에 유효한 요율
//     percent    : 입금 subtotal(VAT 제외) × 값%
//     per_credit : 충전 크레딧 수 × 값 THB
//   현금 환불 → 그 충전의 담당자에게 환불한 달에 마이너스 (원래 요율로). 추적이 안 되는 환불은 "확인 필요"
//   무료 크레딧 지급(관리자 · 이벤트)은 실적 아님
// 지급 완료한 달은 스냅샷 숫자 그대로 (다시 계산 안 함), 그 달 입금은 담당자 변경 불가 (COMMISSION_LOCKED)

// 서버 에러 코드 (긴 이름 먼저 — 'NOT_PAID' 가 다른 코드 안에서 먼저 찾아지지 않게)
CNC_ERROR_CODES = ['COMMISSION_LOCKED', 'REP_NOT_FOUND', 'MONTH_NOT_ENDED', 'ALREADY_PAID', 'NOT_PAID', 'NOT_SALES',
  'INVALID_RATE_VALUE', 'INVALID_RATE_TYPE', 'INVALID_MONTH'].concat(CNC_ERROR_CODES);

var RATE_TYPES = ['percent', 'per_credit'];

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

// 요율 검사 → 에러 키 또는 '' (DB 와 같은 규칙: percent 0~100, 크레딧 1개당 0~1,000,000 THB)
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

// 요율 방식 이름 키 (015 의 'per_tooth' 가 남아 있어도 크레딧 1개당으로 보여줘요)
function cncRateTypeKey(type) {
  return type === 'percent' ? 'rate_type_percent' : 'rate_type_per_credit';
}

// 요율 글자: "10%" / "300.00 THB / 크레딧"
function cncRateText(rate) {
  if (!rate || rate.type == null) return t('rate_none');
  if (rate.type === 'percent') return formatNumber(Number(rate.value)) + '%';
  return tf('rate_per_credit_text', { amount: formatTHB(Number(rate.value)) });
}

// ----------------------------------------------------------------
// 담당자 지정 (manager 이상)
// ----------------------------------------------------------------
// 승인된 입금 한 건의 담당 (이미 담당이 있으면 사유 필수)
function cncAdminSetTopupRep(topupId, repId, reason) {
  return cncRpc('admin_set_topup_rep', { p_topup: topupId, p_rep: repId || null, p_reason: String(reason || '').trim() });
}

// 고객 담당 (앞으로의 입금에만 적용 — 세 번째 인자는 DB 가 무시해요)
function cncAdminSetCustomerRep(userId, repId) {
  return cncRpc('admin_set_customer_rep', { p_user: userId, p_rep: repId || null, p_apply_open_orders: false });
}

// ----------------------------------------------------------------
// 커미션
// ----------------------------------------------------------------
function cncParseJson(d) {
  if (typeof d === 'string') { try { return JSON.parse(d); } catch (e) { return null; } }
  return d;
}

// 건별 상세 한 줄 → 화면용 (입금 'payment' / 환불 차감 'refund' / 015 때 주문 기준 정산 'order')
function cncCommissionItem(i) {
  var n = function (v) { return Number(v) || 0; };
  if (i.kind === 'payment' || i.kind === 'refund') {
    return {
      kind: i.kind, topupId: i.topup_id || '', customer: i.customer || '', date: i.date,
      packageCredits: n(i.package_credits), credits: n(i.credits),
      amount: n(i.subtotal),                 // VAT 제외 (환불은 환불액의 VAT 제외 금액)
      total: n(i.kind === 'refund' ? i.amount_thb : i.total),
      rateType: i.rate_type || null, rateValue: i.rate_value == null ? null : n(i.rate_value), commission: n(i.commission)
    };
  }
  // 예전(주문 기준) 스냅샷: 주문번호 · 커미션만
  return { kind: 'order', topupId: i.order_id || '', customer: i.clinic || '', date: i.shipped_at || null, packageCredits: 0,
    credits: n(i.paid_teeth), amount: n(i.revenue), total: n(i.revenue),
    rateType: i.rate_type || null, rateValue: i.rate_value == null ? null : n(i.rate_value), commission: n(i.commission) };
}

// 숫자 정리 (스냅샷 · 계산 모두 같은 모양으로)
function cncNormalizeCommission(d) {
  d = cncParseJson(d) || {};
  var n = function (v) { return Number(v) || 0; };
  return {
    year: n(d.year), month: n(d.month), monthEnded: !!d.month_ended,
    unassigned: d.unassigned == null ? null : n(d.unassigned),
    unresolved: (d.unresolved_refunds || []).map(function (u) {
      return { customer: u.customer || '', date: u.refunded_at, credits: n(u.credits), amount: n(u.amount_thb), reason: u.reason || '' };
    }),
    reps: (d.reps || []).map(function (r) {
      return {
        repId: r.rep_id, name: r.name || '', active: !!r.active, basis: r.basis || 'payment',
        payments: n(r.payments), amount: n(r.amount), credits: n(r.credits),
        refunds: n(r.refunds), refundDeduction: n(r.refund_deduction), commission: n(r.commission),
        rate: r.rate || null,
        paid: r.paid ? { paidAt: r.paid.paid_at, by: r.paid.paid_by_name || '', note: r.paid.note || '', total: n(r.paid.total) } : null,
        items: (r.items || []).map(cncCommissionItem)
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

// 영업 본인: 내 담당 고객 입금 내역 (요청번호 · 고객 · 승인일 · 크레딧 · 금액만)
async function cncSalesMyPayments() {
  var d = cncParseJson(await cncRpc('sales_my_payments', { p_limit: 300 }));
  return Array.isArray(d) ? d : [];
}

function cncAdminMarkCommissionPaid(repId, year, month, note) {
  return cncRpc('admin_mark_commission_paid', { p_rep: repId, p_year: year, p_month: month, p_note: String(note || '').trim() });
}

function cncAdminUnmarkCommissionPaid(repId, year, month, reason) {
  return cncRpc('admin_unmark_commission_paid', { p_rep: repId, p_year: year, p_month: month, p_reason: String(reason || '').trim() });
}

// 직원마다 첫 요율 시작일 → { rep_id: 'YYYY-MM-DD' } (요율이 없던 건의 "왜 요율 없음" 설명용)
//   RLS: owner 는 전부, 영업 본인은 자기 것만 읽혀요. 못 읽으면 {}
async function cncRepFirstRateDates() {
  try {
    var rows = cncCheck(await sb.from('sales_rep_rates').select('rep_id, effective_from')) || [];
    var out = {};
    rows.forEach(function (r) {
      var d = String(r.effective_from || '').slice(0, 10);
      if (d && (!out[r.rep_id] || d < out[r.rep_id])) out[r.rep_id] = d;
    });
    return out;
  } catch (err) {
    return {};
  }
}

// 고객 담당 지정과 함께 채울 수 있는 예전 입금: 승인됨 + 담당 없음 (+ owner 면 그 담당자의 정산 잠긴 달 제외)
//   manager 는 정산 기록을 못 읽어서 잠긴 달도 목록에 들어가요 → 적용할 때 COMMISSION_LOCKED 로 건너뜀
//   016 전(칸 없음)이면 []
async function cncCustomerUnassignedPayments(userId, repId) {
  var rows;
  try {
    rows = cncCheck(await sb.from('topup_requests').select('id, reviewed_at, sales_rep_id')
      .eq('user_id', userId).eq('status', 'approved').is('sales_rep_id', null)) || [];
  } catch (err) {
    return [];
  }
  if (!rows.length || !repId || typeof cncHasRole !== 'function' || !cncHasRole('owner')) return rows;
  try {
    var paid = cncCheck(await sb.from('commission_payouts').select('year, month').eq('rep_id', repId)) || [];
    var locked = {};
    paid.forEach(function (p) { locked[p.year + '-' + String(p.month).padStart(2, '0')] = true; });
    return rows.filter(function (r) { return !locked[cncBkkMonthKey(r.reviewed_at)]; });
  } catch (err) {
    return rows;
  }
}

// 시각 → 방콕 'YYYY-MM'
function cncBkkMonthKey(iso) {
  var t = Date.parse(iso);
  if (isNaN(t)) return '';
  return new Date(t + 7 * 3600000).toISOString().slice(0, 7);
}

// 예전 입금들에 담당 지정 (한 건씩) → { done, locked, failed }
async function cncBackfillTopupRep(rows, repId, reason) {
  var res = { done: 0, locked: 0, failed: 0 };
  for (var i = 0; i < rows.length; i++) {
    try {
      await cncAdminSetTopupRep(rows[i].id, repId, reason);
      res.done++;
    } catch (err) {
      if (cncErrorCode(err) === 'COMMISSION_LOCKED') res.locked++;
      else { console.warn('backfill', rows[i].id, err); res.failed++; }
    }
  }
  return res;
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

// 그 달(방콕)의 시작 · 끝 ISO (충전 목록 "승인한 달" 필터용) → { from, to } (to 는 다음 달 1일, 미포함)
function cncBkkMonthRange(year, month) {
  var next = cncShiftMonth(year, month, 1);
  var pad = function (v) { return String(v).padStart(2, '0'); };
  return { from: year + '-' + pad(month) + '-01T00:00:00+07:00', to: next.year + '-' + pad(next.month) + '-01T00:00:00+07:00' };
}

// CSV (owner): 직원별 건 한 줄씩 (입금 + 환불 차감) — 기존 CSV 규칙 (UTF-8 BOM, 금액은 쉼표 없는 숫자, 수식 주입 방지 cncCsvCell)
function cncCommissionCsv(data, headers) {
  var lines = [headers.map(function (h) { return cncCsvCell(h, true); }).join(',')];
  (data.reps || []).forEach(function (r) {
    r.items.forEach(function (i) {
      lines.push([
        cncCsvCell(r.name, true),
        cncCsvCell(i.kind, true),
        cncCsvCell(i.topupId, true),
        cncCsvCell(i.date ? String(i.date).slice(0, 10) : '', true),
        cncCsvCell(i.customer, true),
        cncCsvCell(i.credits),
        cncCsvMoney(i.amount),
        cncCsvMoney(i.total),
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
