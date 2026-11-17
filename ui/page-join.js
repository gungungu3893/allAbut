// ===== 직원 초대 링크 가입 #/join?t=… + 직원 대기 · 정지 안내 (sql/023) =====
// PageJoin — 로그인 없이 열려요 (isPublicRoute). 대표가 만든 한 번만 쓰는 링크로만 직원 계정을 만들 수 있어요.
//   1) 주소의 토큰으로 check_staff_invite → 쓸 수 있으면 "allAbut 직원 가입 · 역할: 영업" + 칸
//      쓸 수 없으면 (만료 · 사용됨 · 취소 · 틀림) "이 초대 링크는 더 이상 쓸 수 없어요. 대표에게 새 링크를 요청해 주세요"
//   2) 칸: 본명 · 전화(국가번호 부품 uiPhoneField) · 이메일 · 비밀번호 · 비밀번호 확인 · 약관 동의 · Turnstile
//   3) 가입: signUp 메타데이터 staff_invite → 프로필이 만들어질 때 DB 트리거가 토큰을 검증해서 직원 계정 + 역할 (역할은 서버가 정해요)
//      이메일 인증은 기존 흐름 그대로 (인증 메일 → 로그인하면 그때 프로필이 만들어져요)
//   일반 회원가입 화면에는 직원 선택지가 없어요.
// PageStaffGate — 직원 계정인데 대표 확인 전(매니저 초대) · 정지 · 팀에서 빠진 경우 이 안내만 (router.js 가 보내요)

var PageJoin = {
  main: null,
  token: '',
  invite: null,      // { valid, role } (null = 확인 중)
  errors: {},
  busy: false,
  done: null,        // 가입 끝 (이메일 인증 필요) → 이메일

  render: function (main) {
    this.main = main;
    this.token = cncInviteTokenFromHash();
    this.invite = null;
    this.errors = {};
    this.busy = false;
    this.done = null;
    this.draw();
    this.check();
  },

  rerender: function (main) {
    if (main) this.main = main;
    var st = uiPhoneState('join-phone');
    this.draw(st);
  },

  check: async function () {
    if (window.APP && APP.user) { this.draw(); return; }
    this.invite = await cncCheckStaffInvite(this.token);
    this.draw();
  },

  field: function (id, labelKey, type, extra) {
    var e = this.errors[id];
    return '<div class="field"><label class="field-label" for="join-' + id + '">' + escHtml(t(labelKey)) + ' <span class="required">*</span></label>' +
      '<input class="input' + (e ? ' invalid' : '') + '" id="join-' + id + '" type="' + (type || 'text') + '" ' + (extra || '') + '>' +
      uiFieldError(e) + '</div>';
  },

  draw: function (phoneState) {
    if (!this.main) return;
    var html = '<div class="page page-join"><section class="card join-card">' +
      '<p class="join-logo">' + logoHtml() + '</p>' +
      '<h1 class="page-title">' + escHtml(t('join_title')) + '</h1>';

    if (window.APP && APP.user) {
      html += '<div class="notice notice-info" role="status"><p>' + escHtml(t('join_logged_in')) + '</p></div>' +
        '<button type="button" class="btn btn-outline btn-lg" onclick="handleSignOut()">' + escHtml(t('sign_out')) + '</button>';
    } else if (this.done) {
      html += '<div class="notice notice-success" role="status"><p><span aria-hidden="true">✉</span> ' + escHtml(tf('join_check_email', { email: this.done })) + '</p></div>' +
        '<button type="button" class="btn btn-primary btn-lg" onclick="PageJoin.goSignIn()">' + escHtml(t('sign_in')) + '</button>';
    } else if (this.invite === null) {
      html += uiLoading();
    } else if (!this.invite.valid) {
      html += '<div class="notice notice-warn" role="alert"><p><span aria-hidden="true">⚠</span> ' + escHtml(t('join_invalid')) + '</p></div>';
    } else {
      var e = this.errors;
      html += '<p class="join-role">' + escHtml(t('join_role_label')) + ' <b class="staff-role-badge">' + escHtml(t('role_' + this.invite.role)) + '</b></p>' +
        '<p class="card-desc">' + escHtml(t('join_desc')) + '</p>' +
        (this.invite.role === 'manager' ? '<p class="field-help">' + escHtml(t('join_manager_note')) + '</p>' : '') +
        '<form class="join-form" onsubmit="PageJoin.submit(event)" novalidate>' +
          this.field('full_name', 'full_name_label', 'text', 'maxlength="80" autocomplete="name"') +
          '<div class="field"><label class="field-label" for="join-phone">' + escHtml(t('phone_label')) + ' <span class="required">*</span></label>' +
            uiPhoneField({ id: 'join-phone', value: '', country: 'TH', invalid: !!e.phone, state: phoneState }) + uiFieldError(e.phone) + '</div>' +
          this.field('email', 'email_label', 'email', 'maxlength="120" autocomplete="email"') +
          this.field('password', 'password_label', 'password', 'minlength="6" autocomplete="new-password"') +
          this.field('password2', 'password_confirm_label', 'password', 'minlength="6" autocomplete="new-password"') +
          '<label class="check-line join-agree"><input type="checkbox" id="join-agree"> <span>' + escHtml(t('join_agree')) +
            ' <a href="#/terms" target="_blank" rel="noopener">' + escHtml(t('legal_terms')) + '</a> · <a href="#/privacy" target="_blank" rel="noopener">' + escHtml(t('legal_privacy')) + '</a></span></label>' +
          uiFieldError(e.agree) +
          '<div class="ts-box" data-ts="join" hidden></div>' +
          '<p class="error-text" id="join-error" role="alert">' + (e._form ? escHtml(e._form) : '') + '</p>' +
          '<button type="submit" class="btn btn-primary btn-lg btn-block" id="join-btn"' + (this.busy ? ' disabled' : '') + '>' +
            escHtml(this.busy ? t('loading') : t('join_submit')) + '</button>' +
          '<p class="auth-public-note join-public-note">' + escHtml(t('public_pc_note')) + '</p>' +   // 직원 계정: 공용 컴퓨터 안내
        '</form>';
    }
    html += '</section></div>';
    // 입력하던 값 지키기 (다시 그릴 때)
    var keep = {};
    ['full_name', 'email', 'password', 'password2'].forEach(function (k) {
      var el = document.getElementById('join-' + k);
      if (el) keep[k] = el.value;
    });
    var agree = document.getElementById('join-agree');
    var agreed = agree && agree.checked;
    this.main.innerHTML = html;
    Object.keys(keep).forEach(function (k) { var el = document.getElementById('join-' + k); if (el) el.value = keep[k]; });
    if (agreed && document.getElementById('join-agree')) document.getElementById('join-agree').checked = true;
    if (typeof tsMountAll === 'function') { if (TS && TS.widgets) delete TS.widgets.join; tsMountAll(); }
  },

  goSignIn: function () {
    history.replaceState(null, '', location.pathname);
    if (typeof switchTab === 'function') switchTab('signin');
    var em = document.getElementById('signin-email');
    if (em && this.done) em.value = this.done;
    showScreen('auth');
  },

  submit: async function (event) {
    event.preventDefault();
    if (this.busy) return;
    var v = function (id) { var el = document.getElementById('join-' + id); return el ? el.value : ''; };
    var f = {
      full_name: cncNormName(v('full_name')), phone: uiPhoneRaw('join-phone'), email: v('email').trim(),
      password: v('password'), password2: v('password2'), agree: !!(document.getElementById('join-agree') || {}).checked, token: this.token
    };
    var phoneState = uiPhoneState('join-phone');
    this.errors = cncValidateStaffJoin(f);
    if (!this.errors.agree && tsMissing('join')) this.errors._form = t('err_captcha_needed');
    if (Object.keys(this.errors).length) { this.draw(phoneState); return; }
    this.busy = true;
    this.draw(phoneState);
    try {
      // 전화 · 이메일 겹침 미리 확인 (고객 · 직원 통틀어 1번호 1계정)
      var avail = await cncCheckSignupAvailable(f.phone, '', f.email, 'TH');
      var taken = {};
      if (avail.phone_taken) taken.phone = 'err_phone_taken';
      if (avail.email_blocked) taken.email = 'err_email_disposable';
      if (Object.keys(taken).length) { this.busy = false; this.errors = taken; this.draw(phoneState); return; }
      var versions = await cncGetLegalVersions(true).catch(function () { return null; });
      var legal = versions && versions.terms && versions.privacy ? { terms: versions.terms.version, privacy: versions.privacy.version } : null;
      var data = await cncStaffSignUp({
        full_name: f.full_name, phone: cncNormPhone(f.phone, 'TH'), email: f.email, password: f.password,
        legal: legal, captchaToken: tsToken('join'), token: f.token
      });
      if (data.session) {
        if (versions && legal) { try { await cncAcceptLegal(versions); } catch (e) { console.warn('Consent record failed:', e); } }
        startSession();
        history.replaceState(null, '', location.pathname + '#/home');   // 역할 첫 화면은 enterApp 이 정해요
        await enterApp();
        return;
      }
      this.busy = false;
      this.done = f.email;
      this.draw();
    } catch (err) {
      console.error(err);
      this.busy = false;
      var code = cncErrorCode(err);
      if (code === 'INVITE_INVALID') {
        try { await sb.auth.signOut(); } catch (e) { /* 무시 */ }
        if (window.APP) APP.user = null;
        this.invite = { valid: false, role: null };
        this.draw();
        return;
      }
      if (code === 'PHONE_TAKEN') this.errors = { phone: 'err_phone_taken' };
      else this.errors = { _form: typeof friendlyError === 'function' ? friendlyError(err) : uiErrorMessage(err) };
      this.draw(phoneState);
    } finally {
      tsReset('join');
    }
  }
};

var PageStaffGate = {
  main: null,
  checking: false,

  render: function (main) {
    this.main = main;
    this.draw();
  },

  rerender: function (main) {
    if (main) this.main = main;
    this.draw();
  },

  draw: function () {
    if (!this.main) return;
    var status = cncStaffStatus();
    var pending = status === 'pending';
    this.main.innerHTML = '<div class="page page-staffgate"><section class="card staffgate-card">' +
      '<p class="staffgate-icon" aria-hidden="true">' + (pending ? '⏳' : '⛔') + '</p>' +
      '<h1 class="page-title">' + escHtml(t(pending ? 'staff_gate_pending_title' : 'staff_gate_suspended_title')) + '</h1>' +
      '<p class="card-desc">' + escHtml(t(pending ? 'staff_gate_pending' : 'staff_gate_suspended')) + '</p>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn btn-primary btn-lg" onclick="PageStaffGate.recheck()"' + (this.checking ? ' disabled' : '') + '>' +
          escHtml(this.checking ? t('loading') : t('staff_gate_recheck')) + '</button>' +
        '<button type="button" class="btn btn-outline btn-lg" onclick="handleSignOut()">' + escHtml(t('sign_out')) + '</button>' +
      '</div></section></div>';
  },

  // 대표가 확인 · 다시 켜기를 했는지 다시 보기
  recheck: async function () {
    this.checking = true;
    this.draw();
    var me = await cncLoadAdminMe();
    cncApplyAdminMe(me);
    this.checking = false;
    renderLayout();
    if (!cncStaffBlocked()) {
      history.replaceState(null, '', '#/' + cncStaffStartRoute());
      renderRoute();
      return;
    }
    this.draw();
    uiToast(t(cncStaffStatus() === 'pending' ? 'staff_gate_pending_title' : 'staff_gate_suspended_title'), 'info');
  }
};
