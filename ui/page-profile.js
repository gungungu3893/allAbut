// ===== 내 정보 #/profile =====
// - 본명(sql/010 실행 후, 처음 채워지면 잠김)·이메일(읽기 전용), 치과 정보(Clinic name, Address, Phone, Tax ID), 언어 → 저장
//   본명 · 올바른 Tax ID 는 잠겨서 읽기 전용 → 바꾸려면 등록 정보 변경 요청 (관리자 승인)
// - 크레딧 잔액 (전체 + 💳 충전 n · 🎁 무료 n, 공통 부품 uiCreditSplitHtml) + 묶음 목록 · 크레딧 이력 (줄마다 종류 배지 uiCreditKindBadge)
// - 등록된 치과 정보 (무료 크레딧 주문의 배송지, 잠김) + 변경 요청 (관리자 승인 후 바뀜) — sql/008_free_credits.sql
// - LINE 알림 연결 (공통 부품 ui/line-connect.js 의 LineConnect.mountSection 을 그대로 써요)
// - 치과 소재 국가 (sql/021): 등록 정보와 함께 잠겨요 → 바꾸려면 등록 정보 변경 요청 (관리자 승인)
// - 세금계산서 · 영수증 (sql/021): ui/profile-docs.js 의 ProfileDocs.mount — 문서에 들어갈 이름 · 주소 · 지점 + 월별 목록 · 출력
//   주소 #/profile?docs 로 들어오면 (LINE 충전 승인 카드의 버튼) 이 섹션으로 바로 내려가요

var PageProfile = {
  main: null,
  history: null,
  historyKinds: {},   // 이력 줄마다 종류 (충전 / 무료 / 섞임) — cncCreditHistoryKinds
  historyError: false,
  errors: {},
  saving: false,
  loadToken: 0,
  scrollToLine: false,   // 헤더의 "LINE 연결됨" 체크를 누르고 들어오면 LINE 섹션으로 내려가요
  scrollToDocs: false,   // #/profile?docs (LINE 카드 · 충전 내역 버튼) → 세금계산서 · 영수증 섹션으로 내려가요

  render: function (main) {
    this.main = main;
    this.history = null;
    this.historyError = false;
    this.errors = {};
    // 직원 계정 (sql/023): 이름 · 전화 · 비밀번호 변경 · 언어만 (크레딧 · 치과 정보 · LINE 고객 연결 · 세금계산서 없음)
    if (cncIsStaffAccount()) { this.drawStaff(); return; }
    this.draw();
    this.loadHistory();
    this.loadDeletion();
    this.loadClinicChange();
    if (this.scrollToLine) {
      this.scrollToLine = false;
      var box = document.getElementById('profile-line');
      if (box) setTimeout(function () { box.scrollIntoView({ block: 'start' }); }, 50);
    }
    if (this.scrollToDocs || /[?&]docs\b/.test(location.hash)) {
      this.scrollToDocs = false;
      var docs = document.getElementById('profile-docs');
      if (docs) setTimeout(function () { docs.scrollIntoView({ block: 'start' }); }, 300);
    }
    this.onBalance = this.drawCredits.bind(this);
    window.addEventListener('balancechange', this.onBalance);
    refreshBalance();
  },

  rerender: function () {
    if (cncIsStaffAccount()) { this.drawStaff(uiPhoneState('ps-phone')); return; }
    this.draw();
  },

  // ================================================================
  // 직원 계정의 내 정보 (sql/023)
  // ================================================================
  drawStaff: function (phoneState) {
    if (!this.main) return;
    var p = APP.profile || {};
    var e = this.errors;
    var role = APP.adminRole ? t('badge_role_' + APP.adminRole) + (APP.adminStatus && APP.adminStatus !== 'active' ? ' · ' + t(cncMemberStatusKey(APP.adminStatus)) : '') : t('staff_account');
    this.main.innerHTML = '<div class="page page-profile staff-profile">' +
      '<h1 class="page-title">' + escHtml(t('nav_profile')) + '</h1>' +
      '<p class="staff-intro">' + escHtml(t('sintro_profile')) + '</p>' +   // 직원 화면 맨 위 한 줄 안내
      '<section class="card"><h2 class="card-title">' + escHtml(t('staff_profile_title')) + '</h2>' +
        '<form class="form-grid two" onsubmit="PageProfile.saveStaff(event)" novalidate>' +
          '<div class="field"><span class="field-label">' + escHtml(t('full_name_label')) + '</span><p class="readonly-value">' + escHtml(p.full_name || p.nickname || '—') + '</p>' +
            '<p class="field-help">' + escHtml(t('staff_name_help')) + '</p></div>' +
          '<div class="field"><span class="field-label">' + escHtml(t('email_label')) + '</span><p class="readonly-value">' + escHtml((APP.user && APP.user.email) || '—') + '</p></div>' +
          '<div class="field"><span class="field-label">' + escHtml(t('staff_role_label')) + '</span><p class="readonly-value"><span class="staff-role-badge">' + escHtml(role) + '</span></p></div>' +
          '<div class="field"><label class="field-label" for="ps-phone">' + escHtml(t('phone_label')) + '</label>' +
            uiPhoneField({ id: 'ps-phone', value: p.phone, country: 'TH', invalid: !!e.phone, state: phoneState }) + uiFieldError(e.phone) + '</div>' +
          '<div class="field"><label class="field-label" for="ps-lang">' + escHtml(t('language')) + '</label>' +
            '<select class="input" id="ps-lang">' + LANGUAGES.map(function (l) {
              return '<option value="' + l.code + '"' + (l.code === currentLang ? ' selected' : '') + '>' + escHtml(l.name) + '</option>';
            }).join('') + '</select></div>' +
          '<div class="span-2 form-actions"><button type="submit" class="btn btn-primary btn-lg"' + (this.saving ? ' disabled' : '') + '>' +
            escHtml(this.saving ? t('saving') : t('pe_save')) + '</button></div>' +
        '</form></section>' +
      '<section class="card"><h2 class="card-title">' + escHtml(t('staff_password_title')) + '</h2>' +
        '<form class="form-grid two" onsubmit="PageProfile.saveStaffPassword(event)" novalidate>' +
          '<div class="field"><label class="field-label" for="ps-pw">' + escHtml(t('staff_new_password')) + '</label>' +
            '<input class="input' + (e.pw ? ' invalid' : '') + '" id="ps-pw" type="password" minlength="6" autocomplete="new-password">' + uiFieldError(e.pw) + '</div>' +
          '<div class="field"><label class="field-label" for="ps-pw2">' + escHtml(t('password_confirm_label')) + '</label>' +
            '<input class="input' + (e.pw2 ? ' invalid' : '') + '" id="ps-pw2" type="password" minlength="6" autocomplete="new-password">' + uiFieldError(e.pw2) + '</div>' +
          '<div class="span-2 form-actions"><button type="submit" class="btn btn-outline btn-lg">' + escHtml(t('staff_change_password')) + '</button></div>' +
        '</form>' +
        '<p class="field-help">' + escHtml(t('password_change_signs_out_others')) + '</p></section>' +
        this.signOutAllHtml() +
      '</div>';
  },

  // "모든 기기에서 로그아웃" (고객 · 직원 공통) — 휴대폰 · 다른 컴퓨터에 남아 있는 로그인까지 끊어요 (app.js handleSignOutEverywhere)
  signOutAllHtml: function () {
    return '<section class="card signout-all-card"><h2 class="card-title">' + escHtml(t('signout_all_title')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('signout_all_desc')) + '</p>' +
      '<button type="button" class="btn btn-outline btn-lg btn-danger-text" onclick="handleSignOutEverywhere()">' + escHtml(t('signout_all_btn')) + '</button></section>';
  },

  saveStaff: async function (event) {
    event.preventDefault();
    if (this.saving) return;
    var raw = uiPhoneRaw('ps-phone');
    var st = uiPhoneState('ps-phone');
    var lang = document.getElementById('ps-lang').value;
    this.errors = {};
    if (!raw) this.errors.phone = 'err_phone_required';
    else if (!cncValidPhone(raw, 'TH')) this.errors.phone = 'err_phone_intl';
    if (Object.keys(this.errors).length) { this.drawStaff(st); return; }
    this.saving = true;
    this.drawStaff(st);
    try {
      await cncSaveProfile({ phone: cncNormPhone(raw, 'TH'), lang: lang });
      this.saving = false;
      uiToast(t('profile_saved'), 'success');
      if (lang !== currentLang) setLang(lang);
      else this.drawStaff();
    } catch (err) {
      console.error(err);
      this.saving = false;
      var code = cncErrorCode(err);
      if (code === 'PHONE_TAKEN' || code === 'PHONE_INVALID') this.errors.phone = code === 'PHONE_TAKEN' ? 'err_phone_taken' : 'err_phone_intl';
      else uiToast(uiErrorMessage(err), 'error');
      this.drawStaff(st);
    }
  },

  saveStaffPassword: async function (event) {
    event.preventDefault();
    var pw = document.getElementById('ps-pw').value;
    var pw2 = document.getElementById('ps-pw2').value;
    this.errors = {};
    if (pw.length < 6) this.errors.pw = 'err_password_short';
    else if (pw !== pw2) this.errors.pw2 = 'err_password_mismatch';
    if (Object.keys(this.errors).length) { this.drawStaff(uiPhoneState('ps-phone')); return; }
    try {
      await updatePassword(pw);
      uiToast(t('staff_password_changed'), 'success');
      this.drawStaff(uiPhoneState('ps-phone'));
    } catch (err) {
      console.error(err);
      uiToast(uiErrorMessage(err), 'error');
    }
  },

  leave: function () {
    this.loadToken++;
    if (this.onBalance) window.removeEventListener('balancechange', this.onBalance);
  },

  loadHistory: async function () {
    var token = ++this.loadToken;
    this.historyError = false;
    try {
      var rows = await cncCreditHistory(50);
      if (token !== this.loadToken) return;
      var kinds = await cncCreditHistoryKinds(rows, APP.creditSummaryOk === false);
      if (token !== this.loadToken) return;
      this.historyKinds = kinds;
      this.history = rows;
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.historyError = true;
    }
    this.drawCredits();
  },

  phoneState: null,   // 다시 그릴 때 전화번호 칸 상태 (uiPhoneState) — 한 번 쓰고 비워요

  draw: function () {
    if (!this.main) return;
    var p = APP.profile || {};
    var e = this.errors;

    function readOnly(labelKey, value) {
      return '<div class="field"><span class="field-label">' + escHtml(t(labelKey)) + '</span>' +
        '<p class="readonly-value">' + escHtml(value || '—') + '</p></div>';
    }
    function input(id, labelKey, value, opts) {
      opts = opts || {};
      return '<div class="field' + (opts.span ? ' span-2' : '') + '">' +
        '<label class="field-label" for="p-' + id + '">' + escHtml(t(labelKey)) +
          (opts.required ? '' : ' <span class="optional">(' + escHtml(t('optional')) + ')</span>') + '</label>' +
        '<input class="input' + (e[id] ? ' invalid' : '') + '" id="p-' + id + '" type="' + (opts.type || 'text') + '" maxlength="200" value="' + escHtml(value || '') + '">' +
        (opts.help ? '<p class="field-help">' + escHtml(t(opts.help)) + '</p>' : '') +
        uiFieldError(e[id]) +
        '</div>';
    }

    // sql/010 실행 후: 본명 · Tax ID 잠금, 필수 표시
    var ident = cncHasIdentityColumns(p);
    function lockedValue(labelKey, value) {
      return '<div class="field"><span class="field-label">' + escHtml(t(labelKey)) + '</span>' +
        '<p class="readonly-value">' + escHtml(value || '—') + '</p>' +
        '<p class="field-help"><span aria-hidden="true">🔒</span> ' + escHtml(t('identity_locked_note')) + '</p></div>';
    }
    var nameHtml = !ident ? readOnly('nickname_label', p.nickname)
      : cncIdentityLocked(p, 'full_name') ? lockedValue('full_name_label', p.full_name)
      : input('full_name', 'full_name_label', p.full_name, { required: true });
    // sql/021: 치과 소재 국가 — 태국이 아니면 Tax ID 는 선택 ("Tax / VAT ID (optional)")
    var hasCountry = cncHasCountryColumns(p);
    var country = cncProfileCountry(p);
    var thai = cncIsThai(country);
    var countryHtml = '';
    if (hasCountry) {
      if (cncIdentityLocked(p, 'country')) {
        countryHtml = lockedValue('country_label', cncCountryName(country, currentLang));
      } else {
        countryHtml = '<div class="field"><label class="field-label" for="p-country">' + escHtml(t('country_label')) + '</label>' +
          '<select class="input" id="p-country" onchange="PageProfile.onCountry()">' +
          cncCountryOptions(country, currentLang).map(function (c) {
            return '<option value="' + c.code + '"' + (c.code === country ? ' selected' : '') + '>' + escHtml(c.label) + '</option>';
          }).join('') + '</select></div>';
      }
    }
    var taxLabel = !ident ? 'tax_id_label' : thai ? 'clinic_tax_id_label' : 'tax_vat_optional_label';
    var taxHtml = ident && cncIdentityLocked(p, 'tax_id') ? lockedValue(taxLabel, cncFormatTaxId(p.tax_id))
      : input('tax_id', taxLabel, p.tax_id, { required: ident && thai, help: ident ? (thai ? 'tax_id_help' : 'tax_vat_optional_help') : '' });

    this.main.innerHTML =
      '<div class="page page-profile">' +
        '<h1 class="page-title">' + escHtml(t('nav_profile')) + '</h1>' +
        '<div class="profile-grid">' +
          '<section class="card">' +
            '<h2 class="card-title">' + escHtml(t('profile_info_title')) + '</h2>' +
            '<p class="card-desc">' + escHtml(t('profile_info_desc')) + '</p>' +
            '<form class="form-grid two" onsubmit="PageProfile.save(event)" novalidate>' +
              nameHtml +
              readOnly('email_label', APP.user && APP.user.email) +
              input('clinic_name', 'clinic_name', p.clinic_name, { span: true, required: ident }) +
              input('address', 'address_label', p.address, { span: true, required: ident }) +
              countryHtml +
              // 전화: 국가번호 + 뒷번호 (공통 부품 uiPhoneField — 국가번호는 치과 국가를 따라가요)
              '<div class="field"><label class="field-label" for="p-phone">' + escHtml(t('phone_label')) +
                (ident ? '' : ' <span class="optional">(' + escHtml(t('optional')) + ')</span>') + '</label>' +
                uiPhoneField({ id: 'p-phone', value: p.phone, country: country, invalid: !!e.phone, state: this.phoneState }) +
                uiFieldError(e.phone) + '</div>' +
              taxHtml +
              '<div class="field">' +
                '<label class="field-label" for="p-lang">' + escHtml(t('language')) + '</label>' +
                '<select class="input" id="p-lang">' + LANGUAGES.map(function (l) {
                  return '<option value="' + l.code + '"' + (l.code === currentLang ? ' selected' : '') + '>' + escHtml(l.name) + '</option>';
                }).join('') + '</select>' +
              '</div>' +
              '<div class="span-2 form-actions">' +
                '<button type="submit" class="btn btn-primary btn-lg" id="profile-save"' + (this.saving ? ' disabled' : '') + '>' +
                  escHtml(this.saving ? t('saving') : t('pe_save')) + '</button>' +
              '</div>' +
            '</form>' +
          '</section>' +
          '<section class="card" id="profile-credits"></section>' +
        '</div>' +
        '<section class="card reg-card" id="profile-reg"></section>' +
        '<section class="card docs-card" id="profile-docs" hidden></section>' +
        '<section class="card line-card" id="profile-line"></section>' +
        this.signOutAllHtml() +
        '<section class="card delete-card" id="profile-delete"></section>' +
      '</div>';
    this.phoneState = null;
    this.drawCredits();
    this.drawReg();
    if (typeof ProfileDocs !== 'undefined') ProfileDocs.mount(document.getElementById('profile-docs'));
    LineConnect.mountSection(document.getElementById('profile-line'));
    this.drawDelete();
  },

  // 국가를 바꾸면 (아직 잠기지 않았을 때만) 입력하던 값을 남긴 채 라벨 · 규칙만 다시 그려요
  onCountry: function () {
    var v = function (id) { var el = document.getElementById('p-' + id); return el ? el.value.trim() : undefined; };
    var keep = { clinic_name: v('clinic_name'), address: v('address'), country: v('country') };
    this.phoneState = uiPhoneState('p-phone');   // 뒷번호 · 고른 국가번호 그대로 (따라가는 중이면 새 국가번호로)
    if (v('tax_id') !== undefined) keep.tax_id = v('tax_id');
    if (v('full_name') !== undefined) keep.full_name = v('full_name');
    this.errors = {};
    this.keepValues(keep);
  },

  // ================================================================
  // 등록된 치과 정보 (무료 크레딧 배송지) + 변경 요청
  // ================================================================
  clinicChange: undefined,   // 내 최근 변경 요청 (undefined = 아직 안 읽음)

  loadClinicChange: async function () {
    try {
      this.clinicChange = await cncMyClinicChange();
    } catch (err) {
      this.clinicChange = null;
    }
    this.drawReg();
  },

  drawReg: function () {
    var box = document.getElementById('profile-reg');
    if (!box) return;
    var p = APP.profile || {};
    // 008 실행 전 (칸이 없음) → 숨김
    if (!('clinic_locked_at' in p)) { box.hidden = true; return; }
    box.hidden = false;
    var reg = cncRegisteredClinic(p);
    var html = '<h2 class="card-title"><span aria-hidden="true">🔒</span> ' + escHtml(t('reg_title')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('reg_desc')) + '</p>';
    if (!reg) {
      html += '<p class="reg-empty"><span aria-hidden="true">ℹ</span> ' + escHtml(t('free_need_registered')) + '</p>';
    } else {
      html += '<div class="reg-box"><p class="reg-box-name">' + escHtml(reg.clinic) + '</p>' +
        '<p class="reg-box-line pre">' + escHtml(reg.addr) + '</p>' +
        '<p class="reg-box-line">' + escHtml(reg.phone) + '</p>' +
        (p.reg_country ? '<p class="reg-box-line">' + escHtml(cncCountryName(p.reg_country, currentLang)) + '</p>' : '') +
        '<p class="field-help">' + escHtml(tf('reg_since', { date: formatDate(p.clinic_locked_at) })) + '</p></div>';
      var c = this.clinicChange;
      if (c && c.status === 'pending') {
        html += '<div class="notice notice-info reg-pending" role="status"><p><span aria-hidden="true">⏳</span> ' +
          escHtml(tf('reg_change_pending', { date: formatDate(c.created_at) })) + '</p>' +
          '<p class="reg-box-line">' + (c.full_name ? escHtml(c.full_name) + ' · ' : '') + escHtml(c.clinic) + ' · ' + escHtml(c.addr) + ' · ' + escHtml(c.phone) +
            (c.tax_id ? ' · ' + escHtml(cncFormatTaxId(c.tax_id)) : '') +
            (c.country ? ' · ' + escHtml(cncCountryName(c.country, currentLang)) : '') + '</p>' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="PageProfile.cancelClinicChange()">' + escHtml(t('reg_change_cancel')) + '</button></div>';
      } else {
        if (c && c.status === 'rejected') {
          html += '<p class="muted">' + escHtml(tf('reg_change_rejected', { date: formatDate(c.reviewed_at) })) +
            (c.admin_note ? ' — ' + escHtml(c.admin_note) : '') + '</p>';
        }
        html += '<button type="button" class="btn btn-outline" onclick="PageProfile.openClinicChange()">' + escHtml(t('reg_change_btn')) + '</button>';
      }
    }
    box.innerHTML = html;
  },

  openClinicChange: function () {
    var self = this;
    var p = APP.profile || {};
    var reg = cncRegisteredClinic(p) || {};
    var ident = cncHasIdentityColumns(p);   // sql/010 실행 후엔 본명 · Tax ID 도 같이 요청
    var hasCountry = cncHasCountryColumns(p);   // sql/021 실행 후엔 치과 소재 국가도 같이 요청
    var curCountry = cncProfileCountry(p);
    function field(id, labelKey, value, type, optional) {
      return '<div class="field"><label class="field-label" for="rc-' + id + '"><span id="rc-' + id + '-label">' + escHtml(t(labelKey)) + '</span>' +
        ' <span class="required" id="rc-' + id + '-req"' + (optional ? ' hidden' : '') + '>*</span></label>' +
        '<input class="input" id="rc-' + id + '" type="' + (type || 'text') + '" maxlength="300" value="' + escHtml(value || '') + '">' +
        '<div class="err-slot" data-rc-err="' + id + '"></div></div>';
    }
    var countryField = !hasCountry ? '' :
      '<div class="field"><label class="field-label" for="rc-country">' + escHtml(t('country_label')) + ' <span class="required">*</span></label>' +
      '<select class="input" id="rc-country">' + cncCountryOptions(curCountry, currentLang).map(function (c) {
        return '<option value="' + c.code + '"' + (c.code === curCountry ? ' selected' : '') + '>' + escHtml(c.label) + '</option>';
      }).join('') + '</select>' +
      '<p class="field-help">' + escHtml(t('country_change_help')) + '</p><div class="err-slot" data-rc-err="country"></div></div>';
    var thaiNow = cncIsThai(curCountry);
    var modal = uiModal({
      title: t('reg_change_btn'),
      body: '<p class="modal-text">' + escHtml(t('reg_change_text')) + '</p>' +
        (ident ? field('full_name', 'full_name_label', p.full_name) : '') +
        countryField +
        field('clinic', 'clinic_name', reg.clinic) + field('addr', 'address_label', reg.addr) +
        '<div class="field"><label class="field-label" for="rc-phone">' + escHtml(t('phone_label')) + ' <span class="required">*</span></label>' +
          uiPhoneField({ id: 'rc-phone', value: reg.phone, country: curCountry }) + '<div class="err-slot" data-rc-err="phone"></div></div>' +
        (ident ? field('tax_id', thaiNow ? 'clinic_tax_id_label' : 'tax_vat_optional_label', p.tax_id, 'text', !thaiNow) : '') +
        '<div class="field"><label class="field-label" for="rc-reason">' + escHtml(t('reg_change_reason')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
        '<textarea class="input textarea" id="rc-reason" rows="2" maxlength="500"></textarea></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('reg_change_submit'), kind: 'primary', onClick: async function (close, btn) {
          var v = function (id) { return modal.el.querySelector('#rc-' + id).value.trim(); };
          var vals = { clinic: v('clinic'), addr: v('addr'), phone: uiPhoneRaw('rc-phone') };
          if (ident) { vals.full_name = v('full_name'); vals.tax_id = v('tax_id'); }
          var country = hasCountry ? cncNormCountry(v('country')) : 'TH';
          var thai = cncIsThai(country);
          var errs = {};
          Object.keys(vals).forEach(function (k) {
            if (!vals[k] && !(k === 'tax_id' && !thai)) errs[k] = 'err_required';   // 태국이 아니면 Tax ID 는 선택
          });
          if (vals.phone && !cncValidPhone(vals.phone, country)) errs.phone = thai ? 'err_phone' : 'err_phone_intl';
          if (ident && vals.tax_id && !cncValidTaxId(vals.tax_id, country)) errs.tax_id = thai ? 'err_tax_id_checksum' : 'err_tax_id_intl';
          Object.keys(vals).forEach(function (k) {
            modal.el.querySelector('[data-rc-err="' + k + '"]').innerHTML = uiFieldError(errs[k]);
          });
          uiPhoneSetInvalid('rc-phone', !!errs.phone);
          if (Object.keys(errs).length) return;
          btn.disabled = true;
          try {
            await cncRequestClinicChange(vals.clinic, vals.addr, cncNormPhone(vals.phone, country), v('reason'),
              ident ? vals.full_name : undefined, ident ? vals.tax_id : undefined, hasCountry ? country : undefined);
            close();
            uiToast(t('reg_change_sent'), 'success');
            self.loadClinicChange();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            var code = cncErrorCode(err);
            if (code === 'TAX_ID_REQUIRED' || code === 'TAX_ID_INVALID') {
              modal.el.querySelector('[data-rc-err="tax_id"]').innerHTML = uiFieldError(thai ? 'err_tax_id_checksum' : 'err_tax_id_intl');
            } else {
              uiToast(uiErrorMessage(err), 'error');
            }
          }
        } }
      ]
    });
    // 국가를 바꾸면 Tax ID 라벨 · 필수 표시가 바뀌고, 전화 국가번호가 따라가요
    var sel = modal.el.querySelector('#rc-country');
    if (sel) sel.addEventListener('change', function () { uiPhoneSetCountry('rc-phone', sel.value); });
    if (sel && ident) sel.addEventListener('change', function () {
      var th = cncIsThai(sel.value);
      var lab = modal.el.querySelector('#rc-tax_id-label');
      if (lab) lab.textContent = t(th ? 'clinic_tax_id_label' : 'tax_vat_optional_label');
      var req = modal.el.querySelector('#rc-tax_id-req');
      if (req) req.hidden = !th;
    });
  },

  cancelClinicChange: async function () {
    var ok = await uiConfirm({ title: t('reg_change_cancel'), message: t('reg_change_cancel_confirm') });
    if (!ok) return;
    try {
      await cncCancelClinicChange();
      this.loadClinicChange();
    } catch (err) {
      uiToast(uiErrorMessage(err), 'error');
    }
  },

  // ================================================================
  // 계정 삭제 요청
  // ================================================================
  deletion: undefined,   // 내 최근 삭제 요청 (undefined = 아직 안 읽음)

  loadDeletion: async function () {
    try {
      this.deletion = await cncMyDeletionRequest();
    } catch (err) {
      console.warn('Deletion request read failed:', err);
      this.deletion = null;
    }
    this.drawDelete();
  },

  drawDelete: function () {
    var box = document.getElementById('profile-delete');
    if (!box) return;
    var d = this.deletion;
    var html = '<h2 class="card-title">' + escHtml(t('delete_title')) + '</h2>' +
      '<p class="card-desc">' + escHtml(t('delete_desc')) + '</p>';
    if (d && d.status === 'pending') {
      html += '<p class="delete-pending"><span aria-hidden="true">⏳</span> ' + escHtml(tf('delete_pending', { date: formatDate(d.created_at) })) + '</p>';
    } else {
      if (d && d.status === 'rejected') html += '<p class="muted">' + escHtml(tf('delete_rejected', { date: formatDate(d.handled_at) })) + '</p>';
      html += '<button type="button" class="btn btn-outline btn-discard" onclick="PageProfile.requestDeletion()">' + escHtml(t('delete_btn')) + '</button>';
    }
    html += '<p class="muted delete-links"><a href="#/privacy">' + escHtml(t('legal_privacy')) + '</a></p>';
    box.innerHTML = html;
  },

  requestDeletion: function () {
    var self = this;
    var modal = uiModal({
      title: t('delete_btn'),
      body: '<p class="modal-text">' + escHtml(t('delete_confirm_text')) + '</p>' +
        '<div class="field"><label class="field-label" for="delete-reason">' + escHtml(t('delete_reason')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
        '<textarea class="input textarea" id="delete-reason" rows="3" maxlength="1000"></textarea></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('delete_submit'), kind: 'danger', onClick: async function (close, btn) {
          btn.disabled = true;
          var reason = modal.el.querySelector('#delete-reason').value.trim();
          try {
            var res = await cncRequestDeletion(reason);
            close();
            var msg = t('delete_done');
            if (res && (res.active_orders > 0 || res.balance > 0)) {
              msg += ' ' + tf('delete_done_pending_items', { orders: res.active_orders || 0, credits: res.balance || 0 });
            }
            uiModal({ title: t('delete_done_title'), body: '<p class="modal-text">' + escHtml(msg) + '</p>', actions: [{ label: t('btn_ok'), kind: 'primary' }] });
            self.loadDeletion();
          } catch (err) {
            console.error(err);
            btn.disabled = false;
            uiToast(uiErrorMessage(err), 'error');
          }
        } }
      ]
    });
  },

  // 크레딧 묶음 목록: 충전일, 수량, 남은 수량, 만료일 (30일 이내 주황, 7일 이내 빨강)
  lotsHtml: function () {
    var lots = APP.lots;
    var html = '<h3 class="detail-title">' + escHtml(t('lots_title')) + '</h3>';
    if (!lots) return html + uiLoading();
    if (!lots.length) return html + '<p class="muted">' + escHtml(t('lots_empty')) + '</p>';
    return html + '<div class="table-wrap"><table class="table lots-table"><thead><tr>' +
      '<th>' + escHtml(t('lots_charged')) + '</th><th>' + escHtml(t('lots_quantity')) + '</th><th>' + escHtml(t('lots_remaining')) + '</th><th>' + escHtml(t('lots_expires')) + '</th></tr></thead><tbody>' +
      lots.map(function (l) {
        var st = cncExpiryState(l.expires_at);
        var days = cncDaysLeft(l.expires_at);
        // 종류: 요약 함수가 없으면(sql/008 전) 전부 충전
        var free = APP.creditSummaryOk !== false && cncLotKind(l) === 'free';
        return '<tr class="' + (st ? 'lot-' + st : '') + (free ? ' lot-free' : '') + '">' +
          '<td class="nowrap">' + escHtml(formatDate(l.created_at)) + ' ' +
            (cncProductOf(l.product) === 'crown_set' ? uiProductBadge('crown_set') + ' ' : '') +
            uiCreditKindBadge({ kind: free ? 'free' : 'paid', event: free ? l.event_name : '' }) +
            (free && cncIsRestrictedLot(l) ? '<span class="lot-free-tag">' + escHtml(t('free_lot_tag')) + '</span>' : '') + '</td>' +
          '<td class="mono">' + formatNumber(l.quantity) + '</td>' +
          '<td class="mono"><b>' + formatNumber(l.remaining) + '</b></td>' +
          '<td class="nowrap lot-exp">' + escHtml(formatDate(l.expires_at)) +
            (st ? ' <span class="lot-days">' + escHtml(tf('lots_days_left', { n: days })) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  },

  drawCredits: function () {
    var box = document.getElementById('profile-credits');
    if (!box) return;
    var self = this;
    var html = '<h2 class="card-title">' + escHtml(t('credit_balance')) + '</h2>' +
      // 크라운 세트를 보여줄 때(sql/018): 종류별 줄. 아니면 예전처럼 합계 + 💳 충전 · 🎁 무료
      (cncShowCrownSet()
        ? uiProductCreditsHtml({ expiry: true, cls: 'profile-products' })
        : '<p class="big-number"><span class="mono">' + (APP.balance != null ? formatNumber(APP.balance) : '—') + '</span> <span class="big-number-unit">' + escHtml(t('credit_unit')) + '</span></p>' +
          '<p class="credit-split-line" id="credit-split-line">' + uiCreditSplitHtml({ expiry: true }) + '</p>') +
      ((APP.freeTotal || 0) > 0 ? '<p class="field-help">' + escHtml(t('free_rule_short')) + '</p>' : '') +
      '<p class="card-desc">' + escHtml(t('credit_rule')) + ' · ' + escHtml(t('credit_validity_rule')) + '</p>' +
      '<a href="#/topup" class="btn btn-gold">💳 ' + escHtml(t('topup_btn')) + '</a>' +
      this.lotsHtml() +
      '<h3 class="detail-title">' + escHtml(t('credit_history_title')) + '</h3>';

    if (this.historyError) {
      html += '<p class="empty-text error-text"><span aria-hidden="true">⚠</span> ' + escHtml(t('credit_load_error')) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageProfile.loadHistory()">' + escHtml(t('btn_retry')) + '</button>';
    } else if (this.history === null) {
      html += uiLoading();
    } else if (!this.history.length) {
      html += '<p class="empty-text">' + escHtml(t('credit_no_history')) + '</p>';
    } else {
      html += '<div class="table-wrap"><table class="table credit-table"><thead><tr>' +
        '<th>' + escHtml(t('col_date')) + '</th><th>' + escHtml(t('col_type')) + '</th><th>' + escHtml(t('split_kind')) + '</th><th>' + escHtml(t('col_amount')) + '</th>' +
        '<th>' + escHtml(t('col_description')) + '</th><th>' + escHtml(t('order_number')) + '</th></tr></thead><tbody>' +
        this.history.map(function (h) {
          var amount = Number(h.amount || 0);
          var k = APP.creditSummaryOk === false ? { kind: 'paid' } : (self.historyKinds[h.id] || { kind: 'paid' });
          return '<tr>' +
            '<td class="mono nowrap">' + escHtml(formatDate(h.created_at)) + '</td>' +
            '<td><span class="badge credit-' + escHtml(h.type) + '">' + escHtml(t('credit_type_' + h.type)) + '</span></td>' +
            '<td class="kind-cell">' + (h.product === 'crown_set' || h.product === 'mixed' ? uiProductBadge(h.product === 'mixed' ? 'crown_set' : h.product) + ' ' : '') + uiCreditKindBadge(k) + '</td>' +
            '<td class="mono nowrap ' + (amount >= 0 ? 'plus' : 'minus') + '">' + (amount > 0 ? '+' : '') + formatNumber(amount) + '</td>' +
            '<td>' + escHtml(h.description || '') + '</td>' +
            '<td class="mono nowrap">' + escHtml(h.order_id || '—') + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    box.innerHTML = html;
  },

  save: async function (event) {
    event.preventDefault();
    if (this.saving) return;
    var v = function (id) { var el = document.getElementById('p-' + id); return el ? el.value.trim() : null; };
    var p = APP.profile || {};
    var ident = cncHasIdentityColumns(p);
    var fields = {
      clinic_name: v('clinic_name'),
      address: v('address'),
      phone: uiPhoneRaw('p-phone'),   // '+66812345678' — 검사 뒤 치과 국가 규칙으로 정규화해서 저장
      lang: document.getElementById('p-lang').value
    };
    // 국가: 아직 잠기지 않았을 때만 입력칸이 있어요 (sql/021)
    var country = cncProfileCountry(p);
    if (v('country') !== null) { country = cncNormCountry(v('country')); fields.country = country; }
    var thai = cncIsThai(country);
    // 잠긴 칸(본명 · Tax ID)은 화면에 입력칸이 없어서 보내지 않아요
    if (v('tax_id') !== null) fields.tax_id = ident ? cncNormTaxId(v('tax_id'), country) : v('tax_id');
    if (ident && v('full_name') !== null) fields.full_name = cncNormName(v('full_name'));
    this.errors = {};
    if (ident) {
      // sql/010 실행 후: 모두 필수 + 전화 형식 + Tax ID 체크섬 (잠긴 칸은 지금 값으로 검사)
      var check = cncValidateIdentity({
        full_name: fields.full_name !== undefined ? fields.full_name : p.full_name,
        phone: fields.phone, clinic_name: fields.clinic_name, address: fields.address,
        tax_id: fields.tax_id !== undefined ? fields.tax_id : p.tax_id,
        country: country
      });
      var self = this;
      Object.keys(check).forEach(function (k) { if (document.getElementById('p-' + k)) self.errors[k] = check[k]; });
    } else {
      if (fields.tax_id && !/^[0-9A-Za-z\- ]{5,20}$/.test(fields.tax_id)) this.errors.tax_id = 'err_tax_id';
      if (fields.phone && !/^[0-9+\-() ]{6,20}$/.test(fields.phone)) this.errors.phone = 'err_phone';
    }
    this.phoneState = uiPhoneState('p-phone');   // 다시 그려도 전화번호 칸이 그대로
    if (Object.keys(this.errors).length) {
      this.keepValues(fields);
      return;
    }
    if (fields.phone) fields.phone = cncNormPhone(fields.phone, country);

    this.saving = true;
    this.keepValues(fields);
    try {
      var wasLocked = !!(APP.profile && APP.profile.clinic_locked_at);
      await cncSaveProfile(fields);
      this.saving = false;
      APP.needsInfo = cncNeedsProfileInfo(APP.profile);
      uiToast(t('profile_saved'), 'success');
      // 치과 정보가 처음으로 모두 채워지면 등록 정보가 잠기고, 신규 가입 무료 크레딧 이벤트가 있으면 들어와요
      if (!wasLocked && APP.profile && APP.profile.clinic_locked_at) {
        refreshBalance();
        uiToast(t('reg_locked_now'), 'info');
      }
      if (fields.lang !== currentLang) setLang(fields.lang);   // 화면 전체가 새 언어로 다시 그려져요
      else this.draw();
    } catch (err) {
      console.error(err);
      this.saving = false;
      var code = cncErrorCode(err);
      var fieldOf = { PHONE_TAKEN: 'phone', PHONE_INVALID: 'phone', TAX_ID_TAKEN: 'tax_id', TAX_ID_INVALID: 'tax_id' };
      if (fieldOf[code]) this.errors[fieldOf[code]] = uiErrorMessageKey(code, country);   // 칸 아래 빨간 글씨 (ui/page-complete.js)
      this.phoneState = uiPhoneState('p-phone');
      this.keepValues(fields);
      if (!fieldOf[code]) uiToast(uiErrorMessage(err), 'error');
    }
  },

  // 다시 그려도 입력하던 값이 남도록
  keepValues: function (fields) {
    var backup = APP.profile;
    APP.profile = Object.assign({}, backup || {}, fields);
    this.draw();
    APP.profile = backup;
    var first = document.querySelector('.page-profile .invalid');
    if (first) first.focus();
  }
};

