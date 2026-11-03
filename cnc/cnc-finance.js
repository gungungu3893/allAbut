// ================================================================
// allAbut — 관리자 매출(입금) 통계 · CSV 내보내기
// ================================================================
// DB 함수 (sql/004_finance.sql, 관리자만):
//   admin_finance_month(p_year, p_month)  → 그 달(방콕 시간) 입금·환불·사용·만료·보너스·패키지별·상위 고객
//   admin_finance_trend(p_months)         → 최근 n개월 입금 / 사용 가치 / 환불
//   admin_outstanding_credits()           → 지금 시점 미사용(만료 전) 크레딧
//   admin_topups_export(p_year, p_month)  → 그 달 승인된 충전 목록 (CSV 용)
//
// ⚠️ 여기서 month 는 1~12 (사람이 읽는 달). 화면(PageAdmin.dash.month)은 0~11 이라 +1 해서 넘겨요.

// 숫자로 바꾸기 (DB 의 numeric 은 글자로 올 때도 있어요)
function cncNum(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

// DB 함수가 아직 없는지 (sql/004_finance.sql 을 실행하지 않은 상태)
function cncFinanceMissing(err) {
  var c = err && (err.cause || err);
  if (!c) return false;
  return c.code === 'PGRST202' || c.code === '42883' || /Could not find the function|does not exist/i.test(String(c.message || ''));
}

// 그 달 요약 — 빠진 칸은 0 으로 채워서 화면이 깨지지 않게
async function cncAdminFinanceMonth(year, month) {
  var d = (await cncRpc('admin_finance_month', { p_year: year, p_month: month })) || {};
  function obj(o) { return o || {}; }
  var tp = obj(d.topups), pd = obj(d.pending), pn = obj(d.pending_now), rf = obj(d.refunds),
      cs = obj(d.consumed), ex = obj(d.expired), bn = obj(d.bonus);
  return {
    year: year,
    month: month,
    topups: {
      count: cncNum(tp.count), credits: cncNum(tp.credits),
      subtotal: cncNum(tp.subtotal), vat: cncNum(tp.vat), total: cncNum(tp.total)
    },
    pending: { count: cncNum(pd.count), total: cncNum(pd.total) },
    pendingNow: { count: cncNum(pn.count), total: cncNum(pn.total) },
    refunds: { count: cncNum(rf.count), credits: cncNum(rf.credits), amount: cncNum(rf.amount) },
    net: cncNum(d.net),
    consumed: { credits: cncNum(cs.credits), value: cncNum(cs.value) },
    expired: { credits: cncNum(ex.credits), value: cncNum(ex.value) },
    bonus: { credits: cncNum(bn.credits) },
    byPackage: (d.by_package || []).map(function (p) {
      return {
        credits: cncNum(p.credits), unitPrice: cncNum(p.unit_price), count: cncNum(p.count),
        totalCredits: cncNum(p.total_credits), total: cncNum(p.total)
      };
    }),
    topCustomers: (d.top_customers || []).map(function (c) {
      return { userId: c.user_id, name: c.name || '', count: cncNum(c.count), total: cncNum(c.total) };
    })
  };
}

// 최근 n개월 (오래된 달 → 이번 달)
async function cncAdminFinanceTrend(months) {
  var rows = (await cncRpc('admin_finance_trend', { p_months: months || 12 })) || [];
  return rows.map(function (r) {
    return {
      year: cncNum(r.year), month: cncNum(r.month),
      topups: cncNum(r.topups), consumed: cncNum(r.consumed), refunds: cncNum(r.refunds)
    };
  });
}

// 지금 시점 미사용 크레딧
async function cncAdminOutstandingCredits() {
  var d = (await cncRpc('admin_outstanding_credits')) || {};
  return {
    asOf: d.as_of || new Date().toISOString(),
    paidCredits: cncNum(d.paid_credits),
    paidValue: cncNum(d.paid_value),
    freeCredits: cncNum(d.free_credits),
    customers: cncNum(d.customers)
  };
}

// 그 달 승인된 충전 목록
async function cncAdminTopupsExport(year, month) {
  return (await cncRpc('admin_topups_export', { p_year: year, p_month: month })) || [];
}

// ----------------------------------------------------------------
// CSV 만들기
// ----------------------------------------------------------------

// 칸 하나를 CSV 에 안전하게 넣기
//  - 쉼표·따옴표·줄바꿈이 있으면 "..." 로 감싸고 " 는 "" 로
//  - 글자 칸이 = + - @ 로 시작하면 엑셀이 수식으로 실행하지 않게 앞에 ' 를 붙여요 (CSV 수식 주입 방지)
function cncCsvCell(value, isText) {
  var s = value == null ? '' : String(value);
  if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// 금액: 엑셀이 숫자로 읽게 쉼표 없이 소수점 2자리 (예: 20500.00)
function cncCsvMoney(v) {
  return cncNum(v).toFixed(2);
}

// 행 목록 → CSV 글자 (맨 앞 UTF-8 BOM: 엑셀에서 태국어·한국어가 깨지지 않게)
function cncTopupsCsv(rows, headers) {
  var lines = [headers.map(function (h) { return cncCsvCell(h, true); }).join(',')];
  rows.forEach(function (r) {
    lines.push([
      cncCsvCell(r.request_id, true),
      cncCsvCell(r.approved_at, true),
      cncCsvCell(r.customer_email, true),
      cncCsvCell(r.clinic_name, true),
      // Tax ID 는 0 으로 시작하는 13자리 → 엑셀이 숫자로 바꾸면 앞의 0 이 사라져요. ="..." 로 글자 그대로
      r.tax_id ? '"=""' + String(r.tax_id).replace(/"/g, '') + '"""' : '',
      cncCsvCell(r.package_credits),
      cncCsvCell(r.credits),
      cncCsvMoney(r.unit_price),
      cncCsvMoney(r.subtotal),
      cncCsvMoney(r.vat),
      cncCsvMoney(r.total)
    ].join(','));
  });
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// 파일 이름: allabut-topups-2026-11.csv
function cncTopupsCsvName(year, month) {
  return 'allabut-topups-' + year + '-' + String(month).padStart(2, '0') + '.csv';
}

// 브라우저에서 파일 내려받기
function cncDownloadText(text, filename, type) {
  var blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
