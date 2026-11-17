// ===== 세금계산서 · 영수증 로직 (sql/021_tax_invoices.sql) =====
// 화면 그리기는 ui/tax-doc.js (A4 출력) · ui/profile-docs.js (고객) · ui/page-admin-tax.js (관리자) 가 해요.
//
// 문서 종류 (tax_invoices.doc_type)
//   invoice        세금계산서 ใบกำกับภาษี   — 태국 고객, 번호 IV2611-0001, 종이 원본을 우편으로 보내요
//   credit_note    크레딧 노트 ใบลดหนี้       — 세금계산서를 현금 환불할 때, 번호 CN…  (우편 발송)
//   receipt        영수증 RECEIPT            — 해외 고객, 번호 RC…  (고객이 출력한 것이 정식 사본, 우편 없음)
//   receipt_refund 환불 영수증 REFUND RECEIPT — 영수증을 현금 환불할 때, 번호 RF…
//
// 문서는 충전 입금 승인 때 서버가 자동으로 만들어요 (고객 등록 국가 TH → 세금계산서, 그 밖 → 영수증).
// 한 번 만든 문서는 서버에서 바꿀 수 없어요 (우편 발송 칸만 admin_mark_invoices_mailed 로).

var TAX_DOC_TYPES = ['invoice', 'credit_note', 'receipt', 'receipt_refund'];

// 돈이 빠지는 문서(빨간 글씨 · 보고서 마이너스)
function cncTaxDocIsRefund(doc) {
  var tp = doc && doc.doc_type;
  return tp === 'credit_note' || tp === 'receipt_refund';
}

// 태국 세금계산서 쪽 문서인지 (세금계산서 · 크레딧 노트 = 태국어 + 영어, 우편 원본)
function cncTaxDocIsThai(doc) {
  var tp = doc && doc.doc_type;
  return tp === 'invoice' || tp === 'credit_note';
}

// 합계에 더할 때 부호 (환불 문서는 마이너스)
function cncTaxDocSign(doc) {
  return cncTaxDocIsRefund(doc) ? -1 : 1;
}

// 번역 키 (화면 글씨: 세금계산서 / 크레딧 노트 / 영수증 / 환불 영수증)
function cncTaxDocTypeKey(type) {
  return {
    invoice: 'tax_type_invoice', credit_note: 'tax_type_credit_note',
    receipt: 'tax_type_receipt', receipt_refund: 'tax_type_receipt_refund'
  }[type] || 'tax_type_invoice';
}

// 숫자를 소수 둘째 자리까지 (돈 계산 오차 방지)
function cncRound2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ----------------------------------------------------------------
// 태국어 금액 글씨 (บาทถ้วน / สตางค์) — 세금계산서 "จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)"
// 예: 21935      → สองหมื่นหนึ่งพันเก้าร้อยสามสิบห้าบาทถ้วน
//     1500.50    → หนึ่งพันห้าร้อยบาทห้าสิบสตางค์
//     121        → หนึ่งร้อยยี่สิบเอ็ดบาทถ้วน   (끝자리 1 = เอ็ด)
//     21         → ยี่สิบเอ็ดบาทถ้วน            (20 = ยี่สิบ)
//     1000000    → หนึ่งล้านบาทถ้วน
// ----------------------------------------------------------------
var THAI_DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
var THAI_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

// 0 ~ 999,999 를 글씨로 (0 은 빈 글씨). hasHigher = 앞에 백만 단위가 있음 (1000001 → …ล้านเอ็ด)
function _thaiUnder1M(n, hasHigher) {
  var s = String(n);
  var out = '';
  var len = s.length;
  for (var i = 0; i < len; i++) {
    var d = +s.charAt(i);
    var place = len - i - 1;   // 0 = 일의 자리
    if (!d) continue;
    if (place === 0 && d === 1 && (len > 1 || hasHigher)) out += 'เอ็ด';   // 끝자리 1 (11, 21, 101, 1000001 …)
    else if (place === 1 && d === 1) out += 'สิบ';                   // 10 자리 1 = สิบ
    else if (place === 1 && d === 2) out += 'ยี่สิบ';                // 10 자리 2 = ยี่สิบ
    else out += THAI_DIGITS[d] + THAI_PLACES[place];
  }
  return out;
}

// 정수를 글씨로 (백만 단위마다 ล้าน)
function _thaiInteger(n) {
  if (n === 0) return 'ศูนย์';
  var out = '';
  var millions = Math.floor(n / 1000000);
  var rest = n % 1000000;
  if (millions > 0) out += _thaiInteger(millions) + 'ล้าน';
  out += _thaiUnder1M(rest, millions > 0);
  return out;
}

function cncBahtText(amount) {
  var v = cncRound2(Math.abs(Number(amount) || 0));
  var satang = Math.round(v * 100);
  var baht = Math.floor(satang / 100);
  satang = satang % 100;
  var out = '';
  if (baht > 0 || satang === 0) out += _thaiInteger(baht) + 'บาท';
  if (satang === 0) out += 'ถ้วน';
  else out += _thaiUnder1M(satang) + 'สตางค์';
  return out;
}

// ----------------------------------------------------------------
// 날짜 · 달
// ----------------------------------------------------------------
// 방콕 기준 오늘 'YYYY-MM-DD'
function cncTaxBkkToday() {
  var d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// 이번 달 { y, m } (방콕 기준)
function cncBkkThisMonth() {
  var s = cncTaxBkkToday();
  return { y: +s.slice(0, 4), m: +s.slice(5, 7) };
}

// 달 이동 (delta = -1 지난달, +1 다음달)
function cncTaxShiftMonth(ym, delta) {
  var idx = ym.y * 12 + (ym.m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

// 그 달의 [첫날, 다음 달 첫날) 'YYYY-MM-DD'
function cncTaxMonthRange(ym) {
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var next = cncTaxShiftMonth(ym, 1);
  return { from: ym.y + '-' + pad(ym.m) + '-01', to: next.y + '-' + pad(next.m) + '-01' };
}

// 화면에 보여줄 달 이름 (지금 언어, 예: 2026년 11월 / November 2026)
function cncMonthLabel(ym, lang) {
  try {
    return new Date(ym.y, ym.m - 1, 1).toLocaleDateString(lang || 'en', { year: 'numeric', month: 'long' });
  } catch (e) {
    return ym.y + '-' + (ym.m < 10 ? '0' : '') + ym.m;
  }
}

// ----------------------------------------------------------------
// 합계 (월 합계 줄 · 보고서) — 환불 문서는 마이너스
// ----------------------------------------------------------------
function cncTaxDocTotals(docs) {
  var t = { subtotal: 0, vat: 0, total: 0, count: 0 };
  (docs || []).forEach(function (d) {
    var sign = cncTaxDocSign(d);
    t.subtotal += sign * Number(d.subtotal || 0);
    t.vat += sign * Number(d.vat_amount || 0);
    t.total += sign * Number(d.total || 0);
    t.count++;
  });
  t.subtotal = cncRound2(t.subtotal); t.vat = cncRound2(t.vat); t.total = cncRound2(t.total);
  return t;
}

// 문서 한 장의 설명 (목록의 "내용" 칸) — 품목 이름 + 수량
function cncTaxDocDescription(doc) {
  var items = Array.isArray(doc && doc.items) ? doc.items : [];
  var first = items[0] || {};
  var text = first.name_en || '';
  if (first.qty) text += ' × ' + formatNumber(first.qty);
  return text;
}

// ----------------------------------------------------------------
// 고객: 내 문서
// ----------------------------------------------------------------
// 021 을 실행했는지 (표가 없으면 섹션을 숨겨요)
var _cncTaxReady = null;
async function cncTaxTableReady() {
  if (_cncTaxReady !== null) return _cncTaxReady;
  try {
    var r = await sb.from('tax_invoices').select('id').limit(1);
    _cncTaxReady = !r.error;
  } catch (e) {
    _cncTaxReady = false;
  }
  return _cncTaxReady;
}

// 그 달에 발행된 내 문서 (발행일 · 번호 순)
async function cncListMyTaxDocs(ym) {
  var range = cncTaxMonthRange(ym);
  return cncCheck(await sb.from('tax_invoices').select('*')
    .eq('user_id', cncUserId())
    .gte('issue_date', range.from).lt('issue_date', range.to)
    .order('issue_date', { ascending: true }).order('number', { ascending: true })) || [];
}

// 충전 요청 번호들 → 그 충전의 세금계산서 / 영수증 (충전 내역의 [세금계산서] 버튼)
// 돌려주는 값: { 'TP…': doc, … }
async function cncTaxDocsForTopups(topupIds) {
  var ids = (topupIds || []).filter(Boolean);
  if (!ids.length || !(await cncTaxTableReady())) return {};
  var r = await sb.from('tax_invoices').select('*').in('topup_id', ids).in('doc_type', ['invoice', 'receipt']);
  if (r.error) return {};
  var map = {};
  (r.data || []).forEach(function (d) { map[d.topup_id] = d; });
  return map;
}

// 문서 한 장 (id)
async function cncGetTaxDoc(id) {
  return cncCheck(await sb.from('tax_invoices').select('*').eq('id', id).maybeSingle());
}

// 고객 위해 세금계산서가 없는 이유를 보여줄 때 (예: 원본이 영어 영수증인 고객)
function cncMyDocKind(profile) {
  return cncIsThai(cncProfileCountry(profile)) ? 'invoice' : 'receipt';
}

// 문서에 들어갈 정보 저장 (이미 발행된 문서는 바뀌지 않아요)
async function cncSaveDocInfo(fields) {
  var clean = {
    doc_name: String(fields.doc_name || '').trim().slice(0, 200),
    doc_address: String(fields.doc_address || '').trim().slice(0, 500),
    doc_branch: cncNormBranch(fields.doc_branch)
  };
  return cncSaveProfile(clean);
}

// 문서 정보가 비어 있는지 (비었으면 "문서에 들어갈 정보를 채워 주세요" 안내)
function cncDocInfoMissing(profile) {
  var p = profile || {};
  if (!cncHasCountryColumns(p)) return false;
  return !String(p.doc_name || '').trim() || !String(p.doc_address || '').trim();
}

// 내 VAT % (sql/021 get_my_vat_rate — 해외 고객은 결제 설정 '해외 VAT' 에 따라 0 일 수 있어요). 함수가 없으면 null
async function cncGetMyVatRate() {
  try {
    var r = await sb.rpc('get_my_vat_rate');
    if (r.error || r.data === null || r.data === undefined) return null;
    var v = Number(typeof r.data === 'object' ? (r.data.get_my_vat_rate != null ? r.data.get_my_vat_rate : NaN) : r.data);
    return isFinite(v) ? v : null;
  } catch (e) {
    return null;
  }
}

// ----------------------------------------------------------------
// 관리자 (manager 이상 보기 · 보고서와 설정은 owner)
// ----------------------------------------------------------------
// 그 달 문서 목록 + 필터 { type, mail, q }
async function cncAdminListTaxDocs(ym, filter) {
  filter = filter || {};
  var range = cncTaxMonthRange(ym);
  var q = sb.from('tax_invoices').select('*')
    .gte('issue_date', range.from).lt('issue_date', range.to);
  if (filter.type) q = q.eq('doc_type', filter.type);
  if (filter.mail) q = q.eq('mail_status', filter.mail);
  var rows = cncCheck(await q.order('issue_date', { ascending: true }).order('number', { ascending: true })) || [];
  var text = String(filter.q || '').trim().toLowerCase();
  if (text) {
    rows = rows.filter(function (d) {
      return [d.number, d.buyer_name, d.buyer_tax_id, d.topup_id, d.buyer_phone].some(function (v) {
        return String(v || '').toLowerCase().indexOf(text) !== -1;
      });
    });
  }
  return rows;
}

// 우편 발송 대기 (모든 달) — 대시보드 "지금 처리할 일" · 발송 화면
async function cncAdminPendingMail() {
  if (!(await cncTaxTableReady())) return [];
  var r = await sb.from('tax_invoices').select('*').eq('mail_status', 'pending')
    .order('issue_date', { ascending: true }).order('number', { ascending: true });
  if (r.error) return [];
  return r.data || [];
}

// 021 실행 전이면 null (대시보드 카드를 숨겨요)
async function cncAdminPendingMailCount() {
  if (!(await cncTaxTableReady())) return null;
  var r = await sb.from('tax_invoices').select('id', { count: 'exact', head: true }).eq('mail_status', 'pending');
  if (r.error) return 0;
  return r.count || 0;
}

// 충전 요청 한 건의 문서들 (원본 + 크레딧 노트 / 환불 영수증) — 충전 상세에서 바로 열기
async function cncAdminTaxDocsOfTopup(topupId) {
  if (!topupId || !(await cncTaxTableReady())) return [];
  var r = await sb.from('tax_invoices').select('*').eq('topup_id', topupId).order('id', { ascending: true });
  if (r.error) return [];
  return r.data || [];
}

// 승인됐는데 문서가 없는 충전 (설정이 꺼져 있었을 때) → [발행] 버튼
async function cncAdminTopupsWithoutDocs() {
  var d = await cncRpc('admin_topups_without_docs');
  return Array.isArray(d) ? d : [];
}

// 나중에 발행 (발행일 = 오늘, 원래 승인일도 문서에 같이 보여요)
async function cncAdminIssueTaxDoc(topupId) {
  return cncRpc('admin_issue_tax_doc', { p_topup: String(topupId) });
}

// 여러 장을 우편 발송 완료로 (날짜 · 등기번호)
async function cncAdminMarkMailed(ids, date, tracking) {
  return cncRpc('admin_mark_invoices_mailed', {
    p_ids: (ids || []).map(Number),
    p_date: date || null,
    p_tracking: String(tracking || '').trim() || null
  });
}

// 월별 매출 세금 보고서 (owner)
async function cncAdminTaxReport(ym) {
  var d = await cncRpc('admin_tax_report', { p_year: ym.y, p_month: ym.m });
  d = d || {};
  return {
    output: Array.isArray(d.output) ? d.output : [],
    outputTotals: d.output_totals || { subtotal: 0, vat_amount: 0, total: 0 },
    overseas: Array.isArray(d.overseas) ? d.overseas : [],
    overseasTotals: d.overseas_totals || { subtotal: 0, vat_amount: 0, total: 0 }
  };
}

// 우편 묶기: 같은 고객 + 같은 달 문서는 한 봉투 → [{ key, user_id, name, address, phone, docs: [...] }]
function cncGroupMailDocs(docs) {
  var groups = {};
  var order = [];
  (docs || []).forEach(function (d) {
    var key = d.user_id + '|' + String(d.issue_date || '').slice(0, 7);
    if (!groups[key]) {
      groups[key] = { key: key, user_id: d.user_id, month: String(d.issue_date || '').slice(0, 7),
        name: d.buyer_name, address: d.buyer_address, phone: d.buyer_phone, docs: [] };
      order.push(key);
    }
    groups[key].docs.push(d);
  });
  return order.map(function (k) { return groups[k]; });
}

// ----------------------------------------------------------------
// CSV (엑셀용: BOM + Tax ID 는 ="…" 로 앞자리 0 이 안 사라지게)
// ----------------------------------------------------------------
function _csvCell(v) {
  var s = String(v == null ? '' : v);
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function cncTaxReportCsv(rows, totals) {
  var head = ['Date', 'Number', 'Type', 'Buyer', 'Tax ID', 'Branch', 'Country', 'Subtotal', 'VAT', 'Total'];
  var lines = [head.join(',')];
  (rows || []).forEach(function (r) {
    lines.push([
      _csvCell(r.issue_date), _csvCell(r.number), _csvCell(r.doc_type), _csvCell(r.buyer_name),
      r.buyer_tax_id ? '"=""' + String(r.buyer_tax_id).replace(/"/g, '') + '"""' : '',
      r.buyer_branch ? '"=""' + r.buyer_branch + '"""' : '',
      _csvCell(r.buyer_country || ''),
      Number(r.subtotal || 0).toFixed(2), Number(r.vat_amount || 0).toFixed(2), Number(r.total || 0).toFixed(2)
    ].join(','));
  });
  if (totals) {
    lines.push(['', '', '', 'TOTAL', '', '', '',
      Number(totals.subtotal || 0).toFixed(2), Number(totals.vat_amount || 0).toFixed(2), Number(totals.total || 0).toFixed(2)].join(','));
  }
  return '﻿' + lines.join('\r\n');
}

function cncTaxDownload(filename, text, mime) {
  var blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ----------------------------------------------------------------
// 설정 (owner): 판매자 VAT 등록 정보 (company_settings) + 해외 VAT (payment_settings)
// ----------------------------------------------------------------
var TAX_SELLER_FIELDS = ['vat_registered', 'seller_name_th', 'seller_name_en', 'seller_address_th', 'seller_address_en', 'seller_branch', 'mail_cycle'];

// 021 칸이 있는지 (company_settings 에 vat_registered 가 있는지)
function cncHasTaxSettings(company) {
  return !!company && Object.prototype.hasOwnProperty.call(company, 'vat_registered');
}

// 세금계산서를 발행할 수 있는지 (서버 _tax_invoice_ready 와 같은 규칙)
function cncTaxInvoiceReady(company) {
  var c = company || {};
  return c.vat_registered === true && !!String(c.seller_name_th || '').trim() && !!String(c.seller_address_th || '').trim() &&
    cncValidTaxId(c.tax_id, 'TH');
}

// 영수증을 발행할 수 있는지 (영어 이름 · 주소, 없으면 회사 이름 · 주소)
function cncReceiptReady(company) {
  var c = company || {};
  return !!String(c.seller_name_en || c.company_name || '').trim() && !!String(c.seller_address_en || c.address || '').trim();
}

// 지점 글씨: '' → สำนักงานใหญ่ (Head office), '00001' → สาขาที่ 00001 (Branch 00001)
function cncBranchText(branch, english) {
  var b = String(branch || '').trim();
  if (!b || b === '00000') return english ? 'Head office' : 'สำนักงานใหญ่';
  return english ? 'Branch ' + b : 'สาขาที่ ' + b;
}

async function cncAdminSaveTaxSettings(fields) {
  var clean = {
    vat_registered: fields.vat_registered === true,
    seller_name_th: String(fields.seller_name_th || '').trim(),
    seller_name_en: String(fields.seller_name_en || '').trim(),
    seller_address_th: String(fields.seller_address_th || '').trim(),
    seller_address_en: String(fields.seller_address_en || '').trim(),
    seller_branch: cncNormBranch(fields.seller_branch),
    mail_cycle: fields.mail_cycle === 'each' ? 'each' : 'monthly',
    updated_at: new Date().toISOString()
  };
  if (fields.tax_id !== undefined) clean.tax_id = String(fields.tax_id || '').replace(/\D/g, '');
  var r = await sb.from('company_settings').update(clean).eq('id', 1).select();
  if (r.error) throw cncError(cncErrorCode(r.error), { cause: r.error });
  if (!r.data || !r.data.length) throw cncError('NOT_ADMIN');
  if (typeof _companyCache !== 'undefined') _companyCache = r.data[0];
  if (fields.overseas_vat_mode) {
    var mode = fields.overseas_vat_mode === 'zero' ? 'zero' : 'charge';
    var p = await sb.from('payment_settings').update({ overseas_vat_mode: mode }).eq('id', 1).select();
    if (p.error) throw cncError(cncErrorCode(p.error), { cause: p.error });
  }
  return r.data[0];
}
