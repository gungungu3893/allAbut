// ================================================================
// allAbut — LINE 알림 연결 공통 부품 (모든 화면에서 같이 써요)
// ================================================================
// 연결 방법: allAbut LINE 공식계정 친구추가 → 연결 코드(AB-XXXX)를 채팅에 보냄
//          → 서버 함수 line-webhook 이 profiles.line_user_id 저장 → 연결 완료
//
// 이 파일이 하는 일
//   1) 연결 상태를 한 곳에서 관리:  LineConnect.isLinked()  (APP.profile 기준)
//      상태가 바뀌면 LineConnect.refreshAll() → 헤더 버튼·안내 띠·Profile 섹션·완료 카드가 같이 바뀌어요
//      (다른 코드는 window 의 'linechange' 이벤트를 들으면 돼요)
//   2) 연결 UI (3단계 안내, Add friend 버튼, QR, 연결 코드 + Copy, 상태 확인, Disconnect)
//      - 페이지 안 섹션:  LineConnect.mountSection(boxElement)   ← Profile 화면
//      - 모달:            LineConnect.openModal()                ← 헤더 버튼, 안내 띠, 완료 카드
//   3) 헤더 버튼 HTML (lineHeaderHtml), 페이지 안내 띠 (lineBannerHtml), 완료 화면 카드 (lineCtaHtml)
//
// 모달이 열려 있는 동안 5초마다 연결 상태를 확인해요 (최대 10분). 연결되면 "✅ 연결 완료" → 3초 후 자동으로 닫혀요.

var LINE_GREEN = '#06C755';
var LINE_POLL_MS = 5000;                       // 5초마다 확인
var LINE_POLL_MAX_MS = 10 * 60 * 1000;         // 최대 10분
var LINE_DONE_CLOSE_MS = 3000;                 // 연결 완료 화면 3초 후 닫기
var LINE_BANNER_HIDE_DAYS = 7;                 // 안내 띠 ✕ → 7일 숨김

// LINE 말풍선 아이콘 (글자와 함께만 써요)
function lineIconSvg(size) {
  var s = size || 20;
  return '<svg class="line-icon" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12 3C6.5 3 2 6.6 2 11.1c0 4 3.6 7.4 8.4 8 .3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5 1.1-.5 5.9-3.5 8-6C21.4 14.4 22 12.8 22 11.1 22 6.6 17.5 3 12 3z"/>' +
    '<path fill="' + LINE_GREEN + '" d="M7.1 13.4H5.2V9.2h.9v3.4h1zm1.6 0h-.9V9.2h.9zm4.3 0h-.8l-1.9-2.6v2.6h-.9V9.2h.8l1.9 2.6V9.2h.9zm3.4-3.4h-1.5v.6h1.5v.8h-1.5v.6h1.5v.8h-2.4V9.2h2.4z"/>' +
    '</svg>';
}

var LineConnect = {
  // 공용 상태 (모든 화면이 같이 봐요)
  st: { code: null, codeUser: null, loading: false, error: null, checking: false, busy: false },
  mounts: [],              // 지금 화면에 그려진 연결 UI들 [{ el, mode: 'section' | 'modal' }]
  modal: null,             // 열린 모달 { close, el }
  pollTimer: null,
  pollStarted: 0,
  pollStopped: false,      // 10분이 지나 자동 확인을 멈췄는지
  lastLinked: null,

  // ----------------------------------------------------------------
  // 상태
  // ----------------------------------------------------------------
  isLinked: function () {
    return typeof cncIsLineLinked === 'function' && !!(window.APP && cncIsLineLinked(APP.profile));
  },

  userId: function () {
    return (window.APP && APP.user && APP.user.id) || null;
  },

  isDesktop: function () {
    return !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
  },

  // 연결 상태가 바뀌었을 수 있을 때 → 모든 화면 갱신
  refreshAll: function () {
    var linked = this.isLinked();
    // 헤더 버튼 (PC 헤더 + 모바일 메뉴)
    var slots = document.querySelectorAll('.hdr-line-slot');
    for (var i = 0; i < slots.length; i++) slots[i].innerHTML = lineHeaderHtml();
    if (typeof fitHeader === 'function') fitHeader();      // 버튼 폭이 바뀌면 헤더 다시 맞추기
    // 연결되면 안내 띠·완료 카드는 바로 없애요
    if (linked) {
      document.querySelectorAll('.line-banner, .line-cta').forEach(function (el) { el.remove(); });
    }
    this.drawAll();
    if (this.lastLinked !== linked) {
      this.lastLinked = linked;
      window.dispatchEvent(new CustomEvent('linechange', { detail: { linked: linked } }));
    }
  },

  // ----------------------------------------------------------------
  // 연결 코드
  // ----------------------------------------------------------------
  loadCode: async function (force) {
    var st = this.st;
    var uid = this.userId();
    if (this.isLinked()) { this.drawAll(); return; }
    if (!force && st.code && st.codeUser === uid) { this.drawAll(); return; }
    if (st.loading) return;
    st.loading = true;
    st.error = null;
    this.drawAll();
    try {
      st.code = await cncGetLineLinkCode();
      st.codeUser = uid;
    } catch (err) {
      console.error(err);
      st.error = err;
    }
    st.loading = false;
    this.drawAll();
  },

  copy: async function () {
    var code = this.st.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      uiToast(t('line_copied'), 'success');
    } catch (err) {
      // 복사가 막힌 브라우저: 글자를 선택해 둬요
      var el = document.querySelector('.line-code');
      if (el && window.getSelection) {
        var r = document.createRange();
        r.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      uiToast(t('line_copy_manual'), 'info');
    }
  },

  // "연결 상태 확인" 버튼
  check: async function () {
    var st = this.st;
    if (st.checking) return;
    st.checking = true;
    this.drawAll();
    try {
      await cncReloadProfile();
      st.checking = false;
      if (this.isLinked()) {
        if (!this.modal) uiToast(t('line_connected'), 'success');
        this.onLinked();
        return;
      }
      uiToast(t('line_not_yet'), 'info');
    } catch (err) {
      console.error(err);
      st.checking = false;
      uiToast(uiErrorMessage(err), 'error');
    }
    this.drawAll();
  },

  disconnect: async function () {
    var ok = await uiConfirm({ title: t('line_disconnect'), message: t('line_disconnect_confirm'), okLabel: t('line_disconnect'), danger: true });
    if (!ok) return;
    var st = this.st;
    st.busy = true;
    this.drawAll();
    try {
      await cncUnlinkLine();
      st.busy = false;
      uiToast(t('line_disconnected'), 'success');
      this.refreshAll();
      this.loadCode(true);
    } catch (err) {
      console.error(err);
      st.busy = false;
      uiToast(uiErrorMessage(err), 'error');
      this.drawAll();
    }
  },

  // 연결된 것을 알게 됐을 때 (확인 버튼 / 자동 확인)
  onLinked: function () {
    this.stopPolling();
    if (this.modal) this.showModalDone();
    this.refreshAll();
  },

  // ----------------------------------------------------------------
  // 그리기 (section / modal 공통)
  // ----------------------------------------------------------------
  // 화면에서 사라진 자리는 빼고, 남은 자리는 다시 그려요
  drawAll: function () {
    var self = this;
    this.mounts = this.mounts.filter(function (m) { return document.body.contains(m.el); });
    this.mounts.forEach(function (m) { self.draw(m); });
  },

  draw: function (m) {
    if (m.done) return;                 // 모달의 "연결 완료" 화면은 그대로 둬요
    m.el.innerHTML = m.mode === 'modal' ? this.modalHtml() : this.sectionHtml();
    this.drawQr(m);
  },

  codeHtml: function () {
    var st = this.st;
    if (st.loading) return uiLoading();
    if (st.error) {
      return '<p class="field-error" role="alert"><span aria-hidden="true">⚠</span> ' + escHtml(t('line_code_error')) + '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="LineConnect.loadCode(true)">' + escHtml(t('btn_retry')) + '</button>';
    }
    if (!st.code) return '';
    return '<div class="line-code-row">' +
      '<span class="line-code mono">' + escHtml(st.code) + '</span>' +
      '<button type="button" class="btn btn-outline" onclick="LineConnect.copy()"><span aria-hidden="true">📋</span> ' + escHtml(t('line_copy')) + '</button>' +
      '</div>';
  },

  checkBtnHtml: function () {
    var st = this.st;
    return '<button type="button" class="btn btn-primary line-check-btn" onclick="LineConnect.check()"' + (st.checking ? ' disabled' : '') + '>' +
      escHtml(st.checking ? t('loading') : t('line_check_status')) + '</button>';
  },

  addFriendHtml: function (big) {
    return '<a class="btn btn-line' + (big ? ' btn-lg btn-block line-add-big' : '') + '" href="' + LINE_ADD_FRIEND_URL + '" target="_blank" rel="noopener">' +
      lineIconSvg(big ? 26 : 20) + ' ' + escHtml(t('line_add_friend')) + '</a>';
  },

  connectedHtml: function () {
    var st = this.st;
    return '<div class="line-connected">' +
      '<p class="line-connected-text"><span aria-hidden="true">✅</span> ' + escHtml(t('line_connected')) + '</p>' +
      '<p class="muted">' + escHtml(t('line_connected_desc')) + '</p>' +
      '<button type="button" class="btn btn-outline btn-discard" onclick="LineConnect.disconnect()"' + (st.busy ? ' disabled' : '') + '>' +
        escHtml(st.busy ? t('admin_processing') : t('line_disconnect')) + '</button>' +
      '</div>';
  },

  // Profile 화면 섹션 (예전 Profile 의 LINE 카드와 같은 모양·기능)
  sectionHtml: function () {
    var html = '<h2 class="card-title"><span class="line-logo" aria-hidden="true">LINE</span> ' + escHtml(t('line_title')) + '</h2>';
    if (this.isLinked()) return html + this.connectedHtml();
    return html + '<p class="card-desc">' + escHtml(t('line_desc')) + '</p>' +
      '<div class="line-layout">' +
        '<ol class="line-steps">' +
          '<li><span class="line-step-num mono">1</span><div><p class="line-step-text">' + escHtml(t('line_step1')) + '</p>' +
            this.addFriendHtml(false) + '</div></li>' +
          '<li><span class="line-step-num mono">2</span><div><p class="line-step-text">' + escHtml(t('line_step2')) + '</p>' +
            this.codeHtml() + '</div></li>' +
          '<li><span class="line-step-num mono">3</span><div><p class="line-step-text">' + escHtml(t('line_step3')) + '</p>' +
            this.checkBtnHtml() + '</div></li>' +
        '</ol>' +
        '<div class="line-qr-box">' +
          '<div class="line-qr" aria-hidden="true"></div>' +
          '<p class="muted">' + escHtml(t('line_qr_hint')) + '</p>' +
        '</div>' +
      '</div>';
  },

  // 모달 내용: 모바일은 Add friend 버튼이 가장 크게, PC 는 QR 이 가장 크게
  modalHtml: function () {
    if (this.isLinked()) return this.connectedHtml();
    var desktop = this.isDesktop();
    var status = this.pollStopped
      ? '<p class="line-auto muted"><span aria-hidden="true">⏸</span> ' + escHtml(t('line_auto_stopped')) + '</p>'
      : '<p class="line-auto" role="status"><span class="line-auto-dot" aria-hidden="true"></span> ' + escHtml(t('line_auto_check')) + '</p>';

    var step1 = desktop
      ? '<li class="line-step-qr"><span class="line-step-num mono">1</span><div>' +
          '<p class="line-step-text">' + escHtml(t('line_modal_scan')) + '</p>' +
          '<div class="line-qr line-qr-big" aria-hidden="true"></div>' +
          '<p class="muted line-qr-or">' + escHtml(t('line_modal_or_click')) + '</p>' +
          this.addFriendHtml(false) +
        '</div></li>'
      : '<li><span class="line-step-num mono">1</span><div class="line-step-wide">' +
          '<p class="line-step-text">' + escHtml(t('line_step1')) + '</p>' +
          this.addFriendHtml(true) +
        '</div></li>';

    return '<p class="card-desc">' + escHtml(t('line_desc')) + '</p>' +
      '<ol class="line-steps line-steps-modal">' +
        step1 +
        '<li><span class="line-step-num mono">2</span><div><p class="line-step-text">' + escHtml(t('line_step2')) + '</p>' +
          this.codeHtml() + '</div></li>' +
        '<li><span class="line-step-num mono">3</span><div><p class="line-step-text">' + escHtml(t('line_step3')) + '</p>' +
          status + this.checkBtnHtml() + '</div></li>' +
      '</ol>';
  },

  // QR 그리기 — 섹션은 PC 에서만 작게, 모달은 PC 에서 크게 (모바일은 QR 대신 큰 버튼)
  drawQr: function (m) {
    var el = m.el.querySelector('.line-qr');
    if (!el) return;
    var box = m.el.querySelector('.line-qr-box');
    if (!this.isDesktop()) {
      if (box) box.hidden = true;
      else el.hidden = true;
      return;
    }
    var size = m.mode === 'modal' ? 220 : 168;
    loadQrLib().then(function (QRCode) {
      if (!document.body.contains(el)) return;
      el.innerHTML = '';
      new QRCode(el, { text: LINE_ADD_FRIEND_URL, width: size, height: size, colorDark: '#000000', colorLight: '#ffffff' });
    }).catch(function (err) {
      console.warn('QR library load failed:', err);
      if (box) box.hidden = true;
      else el.hidden = true;
    });
  },

  // ----------------------------------------------------------------
  // 페이지 안 섹션 (Profile)
  // ----------------------------------------------------------------
  mountSection: function (el) {
    if (!el) return;
    this.mounts = this.mounts.filter(function (m) { return m.el !== el && document.body.contains(m.el); });
    var m = { el: el, mode: 'section' };
    this.mounts.push(m);
    this.draw(m);
    this.loadCode(false);
  },

  // ----------------------------------------------------------------
  // 모달
  // ----------------------------------------------------------------
  openModal: function () {
    if (this.modal) return;
    closeHeaderMenu && closeHeaderMenu();
    if (this.isLinked()) { goToProfileLine(); return; }
    var self = this;
    var m = { el: null, mode: 'modal' };
    var modal = uiModal({
      title: t('line_modal_title'),
      body: '<div class="line-modal-body"></div>',
      wide: this.isDesktop(),
      onClose: function () {
        self.stopPolling();
        self.modal = null;
        self.mounts = self.mounts.filter(function (x) { return x !== m; });
        self.refreshAll();
      }
    });
    modal.el.classList.add('line-modal');
    m.el = modal.el.querySelector('.line-modal-body');
    this.modal = modal;
    this.mounts.push(m);
    this.modalMount = m;
    this.pollStopped = false;
    this.draw(m);
    this.loadCode(false);
    this.startPolling();
  },

  showModalDone: function () {
    var m = this.modalMount;
    var modal = this.modal;
    if (!m || !modal) return;
    m.done = true;
    m.el.innerHTML = '<div class="line-done" role="status">' +
      '<div class="line-done-check" aria-hidden="true">✅</div>' +
      '<p class="line-done-title">' + escHtml(t('line_done_title')) + '</p>' +
      '<p class="muted">' + escHtml(t('line_done_text')) + '</p>' +
      '</div>';
    setTimeout(function () { modal.close(); }, LINE_DONE_CLOSE_MS);
  },

  // 5초마다 profiles.line_user_id 확인 (최대 10분, 모달이 열려 있는 동안만)
  startPolling: function () {
    var self = this;
    this.stopPolling();
    this.pollStarted = Date.now();
    this.pollTimer = setInterval(async function () {
      if (!self.modal) { self.stopPolling(); return; }
      if (Date.now() - self.pollStarted > LINE_POLL_MAX_MS) {
        self.stopPolling();
        self.pollStopped = true;
        self.drawAll();
        return;
      }
      try {
        await cncReloadProfile();
        if (self.isLinked()) self.onLinked();
      } catch (err) {
        console.warn('LINE status check failed:', err);
      }
    }, LINE_POLL_MS);
  },

  stopPolling: function () {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  },

  // 로그아웃·다른 계정 로그인 때 (코드 캐시 지우기)
  reset: function () {
    this.stopPolling();
    if (this.modal) this.modal.close();
    this.st = { code: null, codeUser: null, loading: false, error: null, checking: false, busy: false };
    this.mounts = [];
    this.lastLinked = null;
  }
};

// Profile 의 LINE 섹션으로 이동 (연결된 사람이 헤더의 체크 아이콘을 누를 때)
function goToProfileLine() {
  if (window.currentRoute === 'profile') {
    var box = document.getElementById('profile-line');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  PageProfile.scrollToLine = true;
  location.hash = '#/profile';
}


// ================================================================
// 헤더 버튼 — 미연결: 초록 "LINE 연결" / 연결됨: 작은 초록 체크 (툴팁 "LINE 연결됨")
// ================================================================
function lineHeaderHtml() {
  if (LineConnect.isLinked()) {
    return '<button type="button" class="hdr-line-ok" onclick="goToProfileLine()" title="' + escHtml(t('line_hdr_connected')) + '" aria-label="' + escHtml(t('line_hdr_connected')) + '">' +
      lineIconSvg(18) + '<span class="hdr-line-check" aria-hidden="true">✓</span></button>';
  }
  return '<button type="button" class="hdr-line-btn" onclick="LineConnect.openModal()">' +
    lineIconSvg(20) +
    '<span class="hdr-line-label">' + escHtml(t('line_hdr_connect')) + '</span>' +
    '<span class="hdr-line-label-short">' + escHtml(t('line_hdr_connect_short')) + '</span>' +
    '</button>';
}


// ================================================================
// 페이지 상단 안내 띠 (Home, New Order, My Orders, Top up, Guide) — 미연결 + 7일 숨김 아님
// ================================================================
function lineBannerKey() {
  var uid = LineConnect.userId();
  return uid ? 'allabut_line_banner_hidden_' + uid : null;
}

function lineBannerHidden() {
  var key = lineBannerKey();
  if (!key) return true;
  try {
    var until = parseInt(localStorage.getItem(key) || '0', 10);
    return until > Date.now();
  } catch (e) {
    return false;
  }
}

function lineBannerHtml() {
  if (LineConnect.isLinked() || lineBannerHidden()) return '';
  return '<div class="line-banner" role="region" aria-label="LINE">' +
    '<span class="line-banner-text"><span aria-hidden="true">📲</span> ' + escHtml(t('line_banner_text')) + '</span>' +
    '<span class="line-banner-actions">' +
      '<button type="button" class="btn btn-line btn-sm" onclick="LineConnect.openModal()">' + lineIconSvg(18) + ' ' + escHtml(t('line_banner_btn')) + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm line-banner-hide" onclick="hideLineBanner()" title="' + escHtml(t('line_banner_hide_title')) + '">' +
        '<span aria-hidden="true">✕</span> ' + escHtml(t('btn_hide')) + '</button>' +
    '</span>' +
    '</div>';
}

// ✕ → 7일 동안 숨김 (이 사용자만). 헤더 버튼은 계속 보여요
function hideLineBanner() {
  var key = lineBannerKey();
  if (key) {
    try { localStorage.setItem(key, String(Date.now() + LINE_BANNER_HIDE_DAYS * 24 * 3600 * 1000)); } catch (e) { /* 무시 */ }
  }
  document.querySelectorAll('.line-banner').forEach(function (el) { el.remove(); });
}


// ================================================================
// 완료 화면 카드 (주문 완료 · 충전 요청 완료) — 미연결일 때만
// ================================================================
function lineCtaHtml() {
  if (LineConnect.isLinked()) return '';
  return '<div class="line-cta">' +
    '<span class="line-cta-icon">' + lineIconSvg(32) + '</span>' +
    '<p class="line-cta-text">' + escHtml(t('line_cta_text')) + '</p>' +
    '<button type="button" class="btn btn-line" onclick="LineConnect.openModal()">' + lineIconSvg(20) + ' ' + escHtml(t('line_hdr_connect')) + '</button>' +
    '</div>';
}


// ================================================================
// QR 코드 라이브러리 (cdnjs qrcodejs 1.0.0 고정, 필요할 때만 불러와요 — LINE QR, PromptPay QR 공용)
// ================================================================
var QR_LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
var _qrPromise = null;
function loadQrLib() {
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (_qrPromise) return _qrPromise;
  _qrPromise = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = QR_LIB_URL;
    s.async = true;
    s.onload = function () { window.QRCode ? resolve(window.QRCode) : reject(new Error('QRCode missing')); };
    s.onerror = function () { _qrPromise = null; reject(new Error('QR load failed')); };
    document.head.appendChild(s);
  });
  return _qrPromise;
}
