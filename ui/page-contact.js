// ===== 문의하기 #/contact =====
// 로그인 없이도 볼 수 있어요 (로그인 전에는 법적 문서와 같은 screen-legal 화면에 그려요).
// 연락처 값은 company_settings 에서만 읽어요 (cncContactInfo). 비어 있는 항목은 숨기고, LINE 은 기본 @925caqxb.
//   카드 1) 📧 일반 문의 — 이메일 (메일 보내기 + 복사)
//   카드 2) 💬 LINE 문의 — 친구추가 버튼 (+ PC 는 QR)
//   카드 3) 🔒 개인정보 문의 — 개인정보 담당 이메일 (메일 보내기 + 복사)
//   안내: 주문 문의는 주문번호 함께 / 답변 시간 (영업일 기준)
//   회사 정보: 회사명 · 주소 · 전화 (있을 때만)

var PageContact = {
  main: null,
  loaded: false,
  loadToken: 0,

  render: function (main) {
    this.main = main;
    this.draw();
    this.load();
  },

  rerender: function (main) {
    if (main) this.main = main;
    this.draw();
  },

  leave: function () {
    this.loadToken++;
  },

  // 회사 정보 새로 읽기 (관리자가 방금 바꿨을 수도 있어서)
  load: async function () {
    var token = ++this.loadToken;
    try {
      await cncGetCompany(true);
    } catch (err) {
      console.warn('company settings load failed', err);
    }
    if (token !== this.loadToken) return;
    this.loaded = true;
    this.draw();
    renderFooters();
  },

  draw: function () {
    if (!this.main) return;
    var c = cncContactInfo();
    var cards = '';

    // 📧 일반 문의
    if (c.email) {
      cards += '<section class="card contact-card" id="contact-email">' +
        '<h2 class="contact-card-title"><span aria-hidden="true">📧</span> ' + escHtml(t('contact_general')) + '</h2>' +
        '<p class="contact-card-desc">' + escHtml(t('contact_general_desc')) + '</p>' +
        '<p class="contact-value">' + escHtml(c.email) + '</p>' +
        '<div class="contact-actions">' +
          '<a class="btn btn-primary" href="' + escHtml(cncMailto(c.email)) + '"><span aria-hidden="true">✉</span> ' + escHtml(t('contact_send_email')) + '</a>' +
          '<button type="button" class="btn btn-outline" onclick="PageContact.copy(\'' + escHtml(c.email).replace(/'/g, '&#39;') + '\')"><span aria-hidden="true">📋</span> ' + escHtml(t('contact_copy')) + '</button>' +
        '</div></section>';
    }

    // 💬 LINE 문의 (LINE ID 가 비어 있어도 기본값이 있어서 항상 보여요)
    cards += '<section class="card contact-card" id="contact-line">' +
      '<h2 class="contact-card-title"><span aria-hidden="true">💬</span> ' + escHtml(t('contact_line')) + '</h2>' +
      '<p class="contact-card-desc">' + escHtml(t('contact_line_desc')) + '</p>' +
      '<p class="contact-value">' + escHtml(c.lineId) + '</p>' +
      '<div class="contact-actions">' +
        '<a class="btn btn-line" href="' + escHtml(c.lineUrl) + '" target="_blank" rel="noopener">' +
          (typeof lineIconSvg === 'function' ? lineIconSvg(20) + ' ' : '') + escHtml(t('line_add_friend')) + '</a>' +
      '</div>' +
      '<div class="contact-qr-box" id="contact-qr-box">' +
        '<div class="contact-qr" id="contact-qr" aria-hidden="true"></div>' +
        '<p class="muted">' + escHtml(t('line_qr_hint')) + '</p>' +
      '</div></section>';

    // 🔒 개인정보 문의
    if (c.dpoEmail) {
      cards += '<section class="card contact-card" id="contact-dpo">' +
        '<h2 class="contact-card-title"><span aria-hidden="true">🔒</span> ' + escHtml(t('contact_privacy')) + '</h2>' +
        '<p class="contact-card-desc">' + escHtml(t('contact_privacy_desc')) + '</p>' +
        '<p class="contact-value">' + escHtml(c.dpoEmail) + '</p>' +
        '<div class="contact-actions">' +
          '<a class="btn btn-primary" href="' + escHtml(cncMailto(c.dpoEmail)) + '"><span aria-hidden="true">✉</span> ' + escHtml(t('contact_send_email')) + '</a>' +
          '<button type="button" class="btn btn-outline" onclick="PageContact.copy(\'' + escHtml(c.dpoEmail).replace(/'/g, '&#39;') + '\')"><span aria-hidden="true">📋</span> ' + escHtml(t('contact_copy')) + '</button>' +
        '</div></section>';
    }

    // 회사 정보 (있는 것만)
    var company = '';
    if (c.company || c.address || c.phone) {
      company = '<section class="card contact-company">' +
        '<h2 class="card-title">' + escHtml(t('contact_company_title')) + '</h2>' +
        (c.company ? '<p class="contact-company-name">' + escHtml(c.company) + '</p>' : '') +
        (c.address ? '<p class="contact-company-line pre">' + escHtml(c.address) + '</p>' : '') +
        (c.phone ? '<p class="contact-company-line"><span class="muted">' + escHtml(t('phone_label')) + '</span> ' +
          '<a href="' + escHtml(cncTelUrl(c.phone)) + '" class="mono">' + escHtml(c.phone) + '</a></p>' : '') +
        '</section>';
    }

    this.main.innerHTML =
      '<div class="page page-contact">' +
        '<h1 class="page-title"><span aria-hidden="true">💁</span> ' + escHtml(t('contact_title')) + '</h1>' +
        '<p class="page-desc">' + escHtml(t('contact_subtitle')) + '</p>' +
        '<div class="contact-notes">' +
          '<p><span aria-hidden="true">🧾</span> ' + escHtml(t('contact_note_order')) + '</p>' +
          '<p><span aria-hidden="true">⏰</span> ' + escHtml(t('contact_note_hours')) + '</p>' +
        '</div>' +
        '<div class="contact-cards">' + cards + '</div>' +
        company +
      '</div>';
    this.drawQr(c.lineUrl);
  },

  // PC(1024px 이상)에서만 LINE 친구추가 QR
  drawQr: function (url) {
    var box = document.getElementById('contact-qr-box');
    var el = document.getElementById('contact-qr');
    if (!box || !el) return;
    if (!window.matchMedia('(min-width: 1024px)').matches || typeof loadQrLib !== 'function') { box.hidden = true; return; }
    loadQrLib().then(function (QRCode) {
      if (!document.body.contains(el)) return;
      el.innerHTML = '';
      new QRCode(el, { text: url, width: 160, height: 160, colorDark: '#000000', colorLight: '#ffffff' });
    }).catch(function () { box.hidden = true; });
  },

  copy: async function (text) {
    try {
      await navigator.clipboard.writeText(text);
      uiToast(t('contact_copied'), 'success');
    } catch (err) {
      uiToast(t('line_copy_manual'), 'info');
    }
  }
};
