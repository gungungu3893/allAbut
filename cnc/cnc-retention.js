// ===== 주문 파일 보관 기간 · 자동 삭제 (로직만, sql/020_order_file_retention.sql) =====
// - 완료 · 취소된 지 보관 기간(기본 24개월)이 지난 주문은 매일 새벽 Edge Function 'data-retention' 이
//   스캔 · 사진 · 디자인 파일을 지우고, 주문 안의 환자 ID · 메모 · 파일 이름을 지워요 (주문번호 · 날짜 · 크레딧 · 치아 수는 남아요)
// - 지운 주문은 cnc_orders.files_purged_at 에 시각이 있어요 → 화면은 "보관 기간이 지나 파일이 삭제됐어요" (오류처럼 보이지 않게)
// - 관리자(owner): 보관 기간 · 모드(미리보기 / 실제 삭제) · 최근 실행 결과 — 실제 권한 검사는 DB 함수

var RETENTION_MIN_MONTHS = 12;
var RETENTION_MAX_MONTHS = 120;
var RETENTION_POLICY_MONTHS = 24;   // 개인정보처리방침에 적은 기간 (바꾸면 방침 3개 언어도 같이)

// 이 주문의 파일이 보관 기간이 지나 지워졌나요?
function cncOrderFilesPurged(order) {
  return !!(order && order.files_purged_at);
}

// 화면에 보여줄 환자 ID (지운 주문은 'deleted' 대신 "삭제됨")
function cncPatientLabel(order, empty) {
  var p = order && order.patient;
  if (cncOrderFilesPurged(order) && (p === 'deleted' || !p)) return t('ret_patient_deleted');
  return p || (empty == null ? '—' : empty);
}

// ----- 관리자 (owner) -----
// 설정 + 최근 실행 결과. 020 실행 전이면 null
async function cncAdminGetRetention() {
  var r = await sb.rpc('admin_get_retention');
  if (r.error) {
    if (typeof cncIsMissingFunction === 'function' && cncIsMissingFunction(r.error)) return null;
    throw cncError(cncErrorCode(r.error), { cause: r.error });
  }
  var d = r.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
  return cncNormRetention(d || {});
}

function cncNormRetention(d) {
  return {
    months: Number(d.months) || RETENTION_POLICY_MONTHS,
    mode: d.mode === 'delete' ? 'delete' : 'preview',
    batchLimit: Number(d.batch_limit) || 50,
    updatedAt: d.updated_at || null,
    dueTotal: Number(d.due_total) || 0,
    deletedTotal: Number(d.deleted_total) || 0,
    runs: Array.isArray(d.runs) ? d.runs : [],
    preview: Array.isArray(d.preview) ? d.preview : [],
    recent: Array.isArray(d.recent) ? d.recent : []
  };
}

// 보관 기간 숫자 검사 → 에러 키 또는 ''
function cncCheckRetentionMonths(v) {
  var n = Number(v);
  if (!isFinite(n) || Math.floor(n) !== n || n < RETENTION_MIN_MONTHS || n > RETENTION_MAX_MONTHS) return 'ret_err_months';
  return '';
}

async function cncAdminSetRetention(months, mode) {
  var d = await cncRpc('admin_set_retention', { p_months: Number(months), p_mode: mode === 'delete' ? 'delete' : 'preview' });
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
  return cncNormRetention(d || {});
}

// 지금 실행 (pg_net 으로 Edge Function 호출 → 결과는 1~2분 뒤 새로고침). Vault 에 notify_secret 이 없으면 false
async function cncAdminRunRetentionNow() {
  return !!(await cncRpc('admin_run_retention_now', {}));
}
