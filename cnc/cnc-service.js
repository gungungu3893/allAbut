// ================================================================
// allAbut — 서비스 상태 (테스트 / 정식) (로직만, 화면 코드 없음) — DB: sql/017_service_mode.sql
// ================================================================
// 'test' 이면 로고 옆 "TEST" 배지 · 랜딩 슬로건 옆 "Beta test service" 를 보여줘요 (화면은 ui/service-badge.js)
//   cncLoadServiceMode()      누구나(로그인 전 포함) 읽기 → 'test' | 'live' | null(017 실행 전 · 오류 → 배지 없음)
//   cncSetServiceMode(mode)   owner 만 바꾸기 (관리자 Settings → "서비스 상태") → 작업 기록 'service_mode'
// 현재 값은 CNC_SERVICE_MODE 에 담아 둬요 (처음엔 null = 아직 모름 → 배지 안 보임)

var CNC_SERVICE_MODE = null;

async function cncLoadServiceMode() {
  try {
    var r = await sb.rpc('get_service_mode');
    if (r.error) return CNC_SERVICE_MODE;   // 함수가 없거나 오류 → 그대로 (처음이면 null = 배지 없음)
    var m = String(r.data || '');
    CNC_SERVICE_MODE = (m === 'test' || m === 'live') ? m : null;
  } catch (err) {
    /* 네트워크 오류 → 그대로 */
  }
  return CNC_SERVICE_MODE;
}

function cncIsTestMode() {
  return CNC_SERVICE_MODE === 'test';
}

// 반환: { ok: true, mode } 또는 { ok: false, error }
async function cncSetServiceMode(mode) {
  if (mode !== 'test' && mode !== 'live') return { ok: false, error: 'INVALID_ACTION' };
  try {
    var r = await sb.rpc('admin_set_service_mode', { p_mode: mode });
    if (r.error) return { ok: false, error: r.error.message || 'ERROR' };
    CNC_SERVICE_MODE = r.data === 'live' ? 'live' : 'test';
    return { ok: true, mode: CNC_SERVICE_MODE };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'ERROR' };
  }
}
