// ===== 테스트 서비스 배지 "TEST" (서비스 상태가 'test' 일 때만) =====
// 값은 cnc/cnc-service.js 의 CNC_SERVICE_MODE ('test' | 'live' | null)
// - 로고 옆 빈 칸 <span class="test-badge-slot"></span> 마다 작은 알약 "TEST" 버튼을 넣어요
//     랜딩 흰 메뉴 줄 · 로그인 화면 메뉴 줄 · 법률 문서 헤더 (index.html) / 앱 헤더 (ui/layout.js renderLayout)
// - 누르거나(클릭 · 탭) 마우스를 올리면 짧은 설명 (9개 언어) — 누르면 uiPopover, 올리면 title 툴팁
// - 랜딩 슬로건 옆 "Beta test service" (#beta-note)
// - 'live' 이거나 아직 모르면(null) 칸을 비워요 → 아무것도 안 보여요
// - 다시 그리는 때: boot 에서 값을 읽은 뒤 · 언어 바꿀 때 · renderLayout 이 헤더를 새로 만들 때 · 관리자가 상태를 바꿨을 때

var ServiceBadge = {
  render: function () {
    var on = typeof cncIsTestMode === 'function' && cncIsTestMode();
    var slots = document.querySelectorAll('.test-badge-slot');
    var html = on
      ? '<button type="button" class="test-badge" title="' + escHtml(t('test_badge_info')) + '" aria-label="' + escHtml(t('test_badge_aria')) +
        '" aria-haspopup="dialog" aria-expanded="false" onclick="ServiceBadge.info(this, event)">TEST</button>'
      : '';
    for (var i = 0; i < slots.length; i++) {
      slots[i].innerHTML = html;
      slots[i].hidden = !on;
    }
    var note = document.getElementById('beta-note');
    if (note) {
      note.textContent = on ? t('beta_note') : '';
      note.hidden = !on;
    }
    // 헤더 칸이 바뀌었으니 넘침 검사 다시 (layout.js)
    if (typeof fitHeader === 'function' && document.getElementById('app-header')) fitHeader();
  },

  info: function (btn, ev) {
    // 로그인 화면의 로고 버튼(첫 화면으로) 등 바깥 클릭으로 번지지 않게
    if (ev && ev.stopPropagation) ev.stopPropagation();
    uiPopover(btn, '<p class="test-badge-info"><span class="test-badge test-badge-static" aria-hidden="true">TEST</span> ' + escHtml(t('test_badge_info')) + '</p>');
  }
};

window.addEventListener('langchange', function () { ServiceBadge.render(); });
