// ===== "↑ 맨 위로" 버튼 (모든 화면 공통 부품) =====
// - 한 번만 만들어서 <body> 에 붙이고, 랜딩 · 로그인 · 회사소개 · 문의 · 법적 문서 · 고객 앱 · 관리자 · 영업 화면 모두 이 버튼 하나를 써요
// - 모든 화면은 창(window) 전체가 스크롤돼요 (안쪽 스크롤 상자 없음) → window 스크롤을 기준으로 해요
// - 스크롤이 화면 높이 1배 이상 내려가면 오른쪽 아래(아랍어 · 페르시아어는 왼쪽 아래)에 나타나요 (페이드 + 살짝 올라오기)
// - 누르면 맨 위로 부드럽게 (움직임 줄이기 설정이면 바로) → 그 화면 맨 위 제목(없으면 본문 시작)으로 키보드 포커스
// - 아래쪽에 고정된 줄(휴대폰 하단 탭 · 새 주문 아래 버튼 줄 · 랜딩 푸터)과 토스트가 있으면 실제 높이를 읽어서 그 위로 올라가요
// - 버튼이 보이는 동안은 푸터 아래에 버튼 높이만큼 여백을 더해요 (<html class="btt-room">) → 맨 아래 푸터 링크도 가려지지 않고 누를 수 있어요
// - 모달 · 확인창 · 3D 뷰어 · 세션 경고 · 재동의 창 · 날짜 달력이 열려 있으면 숨겨요
// - 스크롤 감지는 passive 리스너 + requestAnimationFrame (한 프레임에 1번만 계산)
// - 인쇄할 때는 안 보여요 (css/app.css @media print)

var BackToTop = {
  GAP: 20,            // 화면 가장자리 · 고정 줄과의 여백 (px)
  // 아래쪽에 고정되어 버튼을 가릴 수 있는 것들 (보이고 position: fixed 일 때만 피해요)
  OBSTACLES: ['.app-tabbar', '.wiz-bottom-bar', '.public-footer', '#toast-root .toast'],
  // 이것들이 열려 있으면 버튼을 숨겨요
  BLOCKERS: ['#modal-root .modal-overlay', '.viewer-overlay.open', '.session-modal.open', '.consent-gate:not([hidden])', '.datepicker', '.datepicker-backdrop'],
  el: null,
  ticking: false,
  shown: false,
  lastBottom: null,
  lastRoom: null,
  byToast: false,

  init: function () {
    if (this.el) return;
    var self = this;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'back-to-top';
    btn.setAttribute('data-back-to-top', '');
    btn.innerHTML = '<span class="back-to-top-arrow" aria-hidden="true">↑</span> <span class="back-to-top-label"></span>';
    btn.setAttribute('tabindex', '-1');        // 처음에는 숨김 → Tab 으로 안 잡히게
    btn.setAttribute('aria-hidden', 'true');
    btn.addEventListener('click', function () { self.go(); });
    document.body.appendChild(btn);
    this.el = btn;
    this.label();

    // 가벼운 감지: passive 리스너 → 다음 프레임에 1번만 계산
    var req = function () { self.request(); };
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req, { passive: true });
    window.addEventListener('hashchange', req);
    window.addEventListener('langchange', function () { self.label(); self.request(); });
    // 모달 · 토스트 · 화면 전환처럼 DOM 이 바뀌면 다시 확인 (속성 · 자식 변화, 프레임당 1번)
    // (버튼 자신의 변화는 무시 — 끝없이 다시 계산하지 않게)
    if (window.MutationObserver) {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].target !== btn && !btn.contains(records[i].target)) { req(); return; }
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    this.request();
  },

  // 글자 (언어가 바뀌면 다시)
  label: function () {
    if (!this.el) return;
    this.el.querySelector('.back-to-top-label').textContent = t('back_to_top');
    this.el.setAttribute('aria-label', t('back_to_top_aria'));
  },

  request: function () {
    if (this.ticking) return;
    this.ticking = true;
    var self = this;
    requestAnimationFrame(function () { self.ticking = false; self.update(); });
  },

  scrollY: function () {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  },

  blocked: function () {
    for (var i = 0; i < this.BLOCKERS.length; i++) {
      var b = document.querySelector(this.BLOCKERS[i]);
      if (b && this.visible(b)) return true;
    }
    return false;
  },

  visible: function (x) {
    if (!x || x.hidden) return false;
    var cs = getComputedStyle(x);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = x.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  },

  // 아래 고정 줄 · 토스트를 피해서 버튼 아래 위치 계산 (버튼과 가로로 겹치는 것만)
  // 피할 것이 없으면 '' (CSS 기본 = 20px + safe-area), 있으면 그 위 px (고정 줄 높이에 safe-area 가 이미 들어 있어요)
  bottomOffset: function () {
    var vh = window.innerHeight;
    var bw = this.el.offsetWidth || 160;
    var rtl = document.documentElement.dir === 'rtl';
    var vw = document.documentElement.clientWidth;
    var bl = rtl ? this.GAP : vw - this.GAP - bw;     // 버튼이 놓일 가로 범위 (대략, safe-area 제외)
    var br = bl + bw;
    var off = 0;
    this.byToast = false;
    for (var i = 0; i < this.OBSTACLES.length; i++) {
      var list = document.querySelectorAll(this.OBSTACLES[i]);
      for (var j = 0; j < list.length; j++) {
        var x = list[j];
        if (!this.visible(x)) continue;
        // 토스트는 #toast-root 가 fixed, 그 밖의 것은 자기 자신이 fixed 일 때만
        var fixedEl = x.classList.contains('toast') ? x.parentNode : x;
        if (getComputedStyle(fixedEl).position !== 'fixed') continue;
        var r = x.getBoundingClientRect();
        if (r.right <= bl || r.left >= br) continue;       // 가로로 안 겹침
        if (r.top >= vh) continue;
        var o = vh - r.top + 12;
        if (o > off) { off = o; this.byToast = x.classList.contains('toast'); }
      }
    }
    return off ? off + 'px' : '';
  },

  update: function () {
    if (!this.el) return;
    var y = this.scrollY();
    var show = y >= window.innerHeight && !this.blocked();
    if (show) {
      var b = this.bottomOffset();
      if (b !== this.lastBottom) {
        this.lastBottom = b;
        if (b) this.el.style.setProperty('--btt-bottom', b); else this.el.style.removeProperty('--btt-bottom');
      }
      // 맨 아래까지 내렸을 때 버튼이 푸터 링크를 가리지 않게, 푸터 아래에 버튼 높이만큼 여백 (--btt-room, css)
      // (토스트 때문에 잠깐 올라간 위치는 쓰지 않아요 — 토스트마다 화면이 출렁이지 않게)
      if (!this.byToast) {
        var room = Math.round(window.innerHeight - this.el.offsetTop + 12) + 'px';
        if (room !== this.lastRoom) { this.lastRoom = room; document.documentElement.style.setProperty('--btt-room', room); }
      }
    }
    if (show !== this.shown) {
      this.shown = show;
      this.el.classList.toggle('show', show);
      // 숨었을 때는 키보드 Tab 으로도 안 잡히게 (CSS visibility 와 함께)
      if (show) this.el.removeAttribute('tabindex'); else this.el.setAttribute('tabindex', '-1');
      this.el.setAttribute('aria-hidden', show ? 'false' : 'true');
      document.documentElement.classList.toggle('btt-room', show);
    }
    // 다크 화면(랜딩 · 로그인)에서는 골드 버튼
    this.el.classList.toggle('on-dark', !document.body.classList.contains('in-app'));
  },

  reduced: function () {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  },

  // 지금 화면의 맨 위 제목 (없으면 로그인 화면의 선택된 탭 → 본문 시작)
  focusTarget: function () {
    var screen = document.querySelector('.screen.active') || document.body;
    var heads = screen.querySelectorAll('h1, h2, .wiz-title');
    for (var i = 0; i < heads.length; i++) {
      if (this.visible(heads[i]) && !heads[i].closest('.app-header, .landing-nav, .auth-nav, .modal-overlay')) return heads[i];
    }
    // 제목이 없는 로그인 · 가입 화면: 지금 선택된 탭 (로그인 / 계정 만들기)
    var tab = screen.querySelector('.auth-tab.active');
    if (tab && this.visible(tab)) return tab;
    return screen.querySelector('main') || screen;
  },

  go: function () {
    var self = this;
    var target = this.focusTarget();
    var smooth = !this.reduced();
    try { window.scrollTo({ top: 0, left: 0, behavior: smooth ? 'smooth' : 'auto' }); }
    catch (e) { window.scrollTo(0, 0); }
    // 키보드 사용자: 제목으로 포커스 (스크롤이 끝난 뒤, 화면이 다시 움직이지 않게)
    var done = function () {
      if (!target) return;
      if (!target.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) {
        target.setAttribute('tabindex', '-1');
        target.classList.add('btt-focus-target');   // 마우스로 눌렀을 때 테두리가 거슬리지 않게 (CSS)
      }
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    };
    if (!smooth) { done(); this.request(); return; }
    var start = performance.now();
    (function wait() {
      if (self.scrollY() <= 1 || performance.now() - start > 1500) { done(); return; }
      requestAnimationFrame(wait);
    })();
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { BackToTop.init(); });
else BackToTop.init();
