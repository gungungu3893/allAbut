// ===== 사용 매뉴얼 (Guide) #/guide =====
// 큰 글씨, 섹션마다 번호 원 + 아이콘 + 짧은 문장. 위쪽 목차를 누르면 그 섹션으로 내려가요.
// 문구는 전부 번역 키(guide_...)라서 9개 언어로 보여요.
// 새 주문 단계의 "? Help" 팝오버도 여기 문구(guide_step1_text ~ guide_step5_text)를 같이 써요.

var PageGuide = {
  main: null,

  // 섹션 목록: id, 아이콘, 제목 키
  SECTIONS: [
    { id: 'start', icon: '🏁', key: 'guide_s1_title' },
    { id: 'credits', icon: '💳', key: 'guide_s2_title' },
    { id: 'steps', icon: '📝', key: 'guide_s3_title' },
    { id: 'progress', icon: '🚚', key: 'guide_s4_title' },
    { id: 'edit', icon: '✏️', key: 'guide_s5_title' },
    { id: 'faq', icon: '❓', key: 'guide_s6_title' }
  ],

  render: function (main) {
    this.main = main;
    this.draw();
  },

  rerender: function () {
    this.draw();
  },

  // 섹션으로 내려가기 (주소의 # 는 페이지 이동에 쓰고 있어서, 스크롤로 이동해요)
  jump: function (id) {
    var el = document.getElementById('guide-' + id);
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    var h = el.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  },

  draw: function () {
    var self = this;
    function p(key) { return '<p>' + escHtml(t(key)) + '</p>'; }
    function section(i, body) {
      var s = self.SECTIONS[i];
      return '<section class="card guide-section" id="guide-' + s.id + '">' +
        '<h2 class="guide-h2"><span class="guide-num mono">' + (i + 1) + '</span>' +
        '<span class="guide-icon" aria-hidden="true">' + s.icon + '</span> ' + escHtml(t(s.key)) + '</h2>' +
        '<div class="guide-body">' + body + '</div></section>';
    }

    // 3) 주문 5단계
    var steps = '<ol class="guide-steps">' + [1, 2, 3, 4, 5].map(function (n) {
      return '<li><span class="guide-step-num mono">' + n + '</span><div>' +
        '<h3 class="guide-h3">' + escHtml(t('wiz_step' + n)) + '</h3>' +
        '<p>' + escHtml(t('guide_step' + n + '_text')) + '</p></div></li>';
    }).join('') + '</ol>';

    // 4) 주문 후 진행 단계 (고객이 할 일 강조)
    var flow = ['submitted', 'confirmed', 'design_ready', 'approved', 'milling', 'shipped', 'done'];
    var progress = '<ol class="guide-flow">' + flow.map(function (st, i) {
      var action = ['design_ready', 'shipped'].indexOf(st) !== -1;
      return '<li class="' + (action ? 'action' : '') + '">' +
        '<span class="guide-flow-num mono">' + (i + 1) + '</span>' +
        '<div><b>' + escHtml(t('stage_' + st)) + '</b>' +
        '<p>' + escHtml(t('guide_flow_' + st)) + '</p></div></li>';
    }).join('') + '</ol>' +
      '<p class="guide-warn"><span aria-hidden="true">⚠</span> ' + escHtml(t('guide_no_cancel_after_milling')) + '</p>';

    // 6) 자주 묻는 질문
    var faq = '<div class="guide-faq">' + [1, 2, 3, 4, 5].map(function (n) {
      return '<details class="guide-faq-item"' + (n === 1 ? ' open' : '') + '>' +
        '<summary>' + escHtml(t('guide_faq' + n + '_q')) + '</summary>' +
        '<p>' + escHtml(t('guide_faq' + n + '_a')) + '</p></details>';
    }).join('') + '</div>';

    this.main.innerHTML =
      '<div class="page page-guide">' +
        lineBannerHtml() +
        '<h1 class="page-title"><span aria-hidden="true">📖</span> ' + escHtml(t('guide_title')) + '</h1>' +
        '<p class="page-desc">' + escHtml(t('guide_subtitle')) + '</p>' +

        // 목차
        '<nav class="card guide-toc" aria-label="' + escHtml(t('guide_toc')) + '">' +
          '<p class="guide-toc-title">' + escHtml(t('guide_toc')) + '</p>' +
          '<ol>' + this.SECTIONS.map(function (s, i) {
            return '<li><button type="button" class="guide-toc-link" onclick="PageGuide.jump(\'' + s.id + '\')">' +
              '<span class="guide-num mono">' + (i + 1) + '</span> ' + escHtml(t(s.key)) + '</button></li>';
          }).join('') + '</ol>' +
        '</nav>' +

        section(0, p('guide_s1_p1') + p('guide_s1_p2') +
          '<a href="#/profile" class="btn btn-outline">' + escHtml(t('guide_s1_btn')) + ' <span class="arrow" aria-hidden="true">→</span></a>') +
        section(1, '<p class="guide-big"><span class="mono">1</span> ' + escHtml(t('guide_s2_rule')) + '</p>' + p('guide_s2_p1') + p('guide_s2_p2')) +
        section(2, steps) +
        section(3, progress) +
        section(4, p('guide_s5_p1') + p('guide_s5_p2')) +
        section(5, faq) +

        '<div class="guide-cta">' +
          '<a href="#/new" class="btn btn-gold btn-lg">' + escHtml(t('guide_start_order')) + ' <span class="arrow" aria-hidden="true">→</span></a>' +
        '</div>' +
      '</div>';
  }
};
