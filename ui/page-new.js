// ===== 새 주문 #/new (5단계) =====
//  1. Patient & Deadline   환자 ID(필수), 납기일(필수, 자체 달력)
//  2. Select Teeth          FDI 32개 치아 차트
//  3. Tooth Details         치아마다 브랜드·사이즈·쉐이드 + 메모
//  4. Upload Files          스캔 파일·사진·PDF (최대 10개, 파일당 50MB)
//  5. Review & Submit       요약, 배송 정보, 크레딧, 제출
//
// 화면 배치
//  - PC(1024px 이상): 왼쪽 단계 목록 | 가운데 입력 카드 | 오른쪽 주문 요약(따라 내려옴)
//  - 모바일: 위 가로 진행 표시, 아래 고정 Back / Next 버튼 (요약은 5단계에서)
//
// 작성 중인 주문(draft)이 저장돼 있으면, 처음 들어올 때 맨 위에 "이어서 하기 / 삭제" 카드가 떠요.
// 카드가 떠 있는 동안 아래 입력은 잠겨요(흐리게) — 둘 중 하나를 골라야 진행할 수 있어요.
//
// 데이터 처리는 cnc/cnc-core.js 가 하고, 이 파일은 화면만 그려요.

var PageNew = {
  main: null,
  draft: null,          // 작성 중인 주문 (cnc-core 의 draft)
  draftUser: null,      // draft 주인 (다른 계정으로 로그인하면 새로 시작)
  check: null,          // 마지막 검사 결과 (에러 표시용)
  bulkBrand: '',        // "모든 치아에 적용" 용 브랜드
  bulkShade: '',        // "모든 치아에 적용" 용 쉐이드
  fileNotices: [],      // 거부된 파일 안내
  submitting: false,    // 제출 중 (두 번 클릭 방지)
  progress: null,       // 제출 진행 상황
  submitError: null,    // 제출 에러
  success: null,        // 제출 성공 결과 { id, teeth, balance }
  locked: false,        // 저장된 draft 를 "이어서 할지 / 지울지" 고르는 중 (입력 잠금)
  pendingDraft: null,   // 고르기 전의 저장된 draft
  resumeRequested: false, // 홈의 "Continue" 버튼으로 들어옴 → 카드 없이 바로 이어서

  STEP_KEYS: ['wiz_step1', 'wiz_step2', 'wiz_step3', 'wiz_step4', 'wiz_step5'],
  STEP_DESC_KEYS: ['wiz_step1_desc', 'wiz_step2_desc', 'wiz_step3_desc', 'wiz_step4_desc', 'wiz_step5_desc'],

  // ================================================================
  // 페이지 열기 / 다시 그리기 / 떠나기
  // ================================================================
  render: function (main) {
    this.main = main;
    var uid = APP.user.id;

    if (this.resumeRequested) {
      // 홈에서 "Continue" → 저장된 draft 를 바로 불러와요
      this.resumeRequested = false;
      if (!this.draft || this.draftUser !== uid || this.locked) {
        this.draft = cncLoadDraft(uid, APP.profile) || cncNewDraft(APP.profile);
      }
      this.resetState(uid);
    } else if (!this.draft || this.draftUser !== uid) {
      // 처음 들어옴: 저장된 draft 가 있으면 고르는 카드, 없으면 빈 주문
      var saved = cncHasDraft(uid) ? cncLoadDraft(uid, APP.profile) : null;
      this.draft = cncNewDraft(APP.profile);
      this.resetState(uid);
      if (saved) {
        this.pendingDraft = saved;
        this.locked = true;
      }
    }
    this.fillDeliveryFromProfile();

    this.onBalance = this.onBalanceChange.bind(this);
    window.addEventListener('balancechange', this.onBalance);
    this.draw();
    refreshBalance();
  },

  resetState: function (uid) {
    this.draftUser = uid;
    this.check = null;
    this.fileNotices = [];
    this.submitError = null;
    this.locked = false;
    this.pendingDraft = null;
  },

  rerender: function () {
    this.draw();
  },

  leave: function () {
    if (this.onBalance) window.removeEventListener('balancechange', this.onBalance);
    closePopover();
    if (this.locked) {
      // 고르지 않고 떠나면 다음에 다시 카드를 보여줘요
      this.draft = null;
      this.locked = false;
      this.pendingDraft = null;
      return;
    }
    if (this.draft && !this.success) cncSaveDraft(this.draftUser, this.draft);
    if (this.success) this.success = null;    // 다시 들어오면 새 주문 화면
  },

  // ----- 저장된 draft: 이어서 하기 / 삭제 -----
  continueDraft: function () {
    if (!this.pendingDraft) return;
    this.draft = this.pendingDraft;
    this.pendingDraft = null;
    this.locked = false;
    this.fillDeliveryFromProfile();
    this.draw();
    this.scrollTop();
  },

  discardDraft: async function () {
    var ok = await uiConfirm({ title: t('draft_discard'), message: t('draft_discard_confirm'), okLabel: t('draft_discard'), danger: true });
    if (!ok) return;
    cncClearDraft(this.draftUser);
    this.pendingDraft = null;
    this.locked = false;
    this.draft = cncNewDraft(APP.profile);
    this.draw();
    var input = document.getElementById('f-patient');
    if (input) input.focus();
  },

  draftCardHtml: function () {
    var p = this.pendingDraft;
    var info = [];
    info.push(t('wiz_patient_label') + ': ' + (p.patient.trim() || '—'));
    info.push(tf('teeth_count_fmt', { n: p.teeth.length }));
    info.push(tf('draft_saved_at', { time: formatDateTime(p.updatedAt) }));
    return '<div class="draft-choice" role="region" aria-label="' + escHtml(t('draft_found')) + '">' +
      '<p class="draft-choice-title"><span aria-hidden="true">📝</span> ' + escHtml(t('draft_found')) + '</p>' +
      '<p class="draft-choice-info">' + info.map(escHtml).join(' · ') + '</p>' +
      '<p class="draft-choice-step muted">' + escHtml(tf('draft_last_step', { step: t(this.STEP_KEYS[p.step - 1]) })) + '</p>' +
      '<div class="draft-choice-actions">' +
        '<button type="button" class="btn btn-primary btn-lg" onclick="PageNew.continueDraft()">' + escHtml(t('draft_continue_order')) + ' <span class="arrow" aria-hidden="true">→</span></button>' +
        '<button type="button" class="btn btn-outline btn-lg btn-discard" onclick="PageNew.discardDraft()">' + escHtml(t('draft_discard')) + '</button>' +
      '</div>' +
    '</div>';
  },

  onBalanceChange: function () {
    this.updateSummary();
    if (!this.submitting && !this.success && (this.draft.step === 2 || this.draft.step === 5)) this.drawStep();
  },

  // 배송 정보가 비어 있으면 프로필 값으로 채우기
  fillDeliveryFromProfile: function () {
    var p = APP.profile || {};
    var d = this.draft.delivery;
    if (!d.clinic && p.clinic_name) d.clinic = p.clinic_name;
    if (!d.addr && p.address) d.addr = p.address;
    if (!d.phone && p.phone) d.phone = p.phone;
  },

  save: function () {
    if (this.locked) return;   // 고르기 전에는 저장된 draft 를 덮어쓰지 않아요
    cncSaveDraft(this.draftUser, this.draft);
  },

  // ================================================================
  // 전체 틀 그리기
  // ================================================================
  draw: function () {
    if (!this.main) return;
    if (this.success) { this.drawSuccess(); return; }

    this.main.innerHTML =
      '<div class="page page-new">' +
        // LINE 연결 안내 띠: 맨 위. 작성 중 주문 카드가 있으면 그 아래
        (this.locked ? '' : lineBannerHtml()) +
        '<h1 class="page-title wiz-page-title">' + escHtml(t('nav_new')) + '</h1>' +
        (this.locked ? this.draftCardHtml() + lineBannerHtml() : '') +
        '<div class="wizard' + (this.locked ? ' wiz-locked' : '') + '"' + (this.locked ? ' inert aria-hidden="true"' : '') + '>' +
          '<nav class="wiz-steps" aria-label="' + escHtml(t('order_steps')) + '" id="wiz-steps"></nav>' +
          '<div class="wiz-mobile-progress" id="wiz-mobile-progress"></div>' +
          '<section class="card wiz-main" id="wiz-main" aria-live="polite"></section>' +
          '<aside class="wiz-summary card" id="wiz-summary" aria-label="' + escHtml(t('summary_title')) + '"></aside>' +
        '</div>' +
        '<div class="wiz-bottom-bar" id="wiz-bottom-bar"' + (this.locked ? ' inert' : '') + '></div>' +
      '</div>';
    this.drawStep();
  },

  // 단계 목록 + 입력 카드 + 요약 + 아래 버튼 다시 그리기
  drawStep: function () {
    var d = this.draft;
    closePopover();
    var self = this;

    // 왼쪽 세로 단계 목록 (PC)
    var steps = document.getElementById('wiz-steps');
    if (!steps) return;
    steps.innerHTML = '<ol class="wiz-step-list">' + this.STEP_KEYS.map(function (key, i) {
      var n = i + 1;
      var state = n === d.step ? 'current' : (n < d.maxStep || (n <= d.maxStep && n !== d.step) ? 'done' : '');
      var clickable = n !== d.step && n <= d.maxStep;
      var inner = '<span class="wiz-step-num mono" aria-hidden="true">' + (state === 'done' ? '✓' : n) + '</span>' +
        '<span class="wiz-step-name">' + escHtml(t(key)) + '</span>';
      return '<li class="wiz-step ' + state + '">' +
        (clickable
          ? '<button type="button" class="wiz-step-btn" onclick="PageNew.goStep(' + n + ')"' + (n === d.step ? ' aria-current="step"' : '') + '>' + inner + '</button>'
          : '<div class="wiz-step-btn"' + (n === d.step ? ' aria-current="step"' : '') + '>' + inner + '</div>') +
        '</li>';
    }).join('') + '</ol>';

    // 모바일 가로 진행 표시 (1 ─ 2 ─ 3 ─ 4 ─ 5)
    document.getElementById('wiz-mobile-progress').innerHTML =
      '<ol class="wiz-dots">' + this.STEP_KEYS.map(function (key, i) {
        var n = i + 1;
        var state = n === d.step ? 'current' : (n <= d.maxStep ? 'done' : '');
        var dot = '<span class="wiz-dot mono">' + (state === 'done' ? '✓' : n) + '</span>';
        return '<li class="' + state + '">' +
          (n !== d.step && n <= d.maxStep
            ? '<button type="button" class="wiz-dot-btn" onclick="PageNew.goStep(' + n + ')" aria-label="' + escHtml(t(key)) + '">' + dot + '</button>'
            : dot) +
          '</li>';
      }).join('<li class="wiz-dot-line" aria-hidden="true"></li>') + '</ol>' +
      '<p class="wiz-dots-label">' + escHtml(tf('step_of', { n: d.step, total: 5 })) + ' · <b>' + escHtml(t(this.STEP_KEYS[d.step - 1])) + '</b></p>';

    // 가운데 입력 카드
    var body = '';
    if (d.step === 1) body = this.step1();
    if (d.step === 2) body = this.step2();
    if (d.step === 3) body = this.step3();
    if (d.step === 4) body = this.step4();
    if (d.step === 5) body = this.step5();

    document.getElementById('wiz-main').innerHTML =
      '<div class="wiz-head">' +
        '<p class="wiz-step-label">' + escHtml(tf('step_of', { n: d.step, total: 5 })) + '</p>' +
        '<div class="wiz-title-row">' +
          '<h2 class="wiz-title">' + escHtml(t(this.STEP_KEYS[d.step - 1])) + '</h2>' +
          '<button type="button" class="btn btn-outline btn-sm help-btn" aria-expanded="false" onclick="PageNew.showHelp(this)">' +
            '<span class="help-q" aria-hidden="true">?</span> ' + escHtml(t('help_label')) + '</button>' +
        '</div>' +
        '<p class="wiz-desc">' + escHtml(t(this.STEP_DESC_KEYS[d.step - 1])) + '</p>' +
      '</div>' +
      '<div class="wiz-body">' + body + '</div>' +
      '<div class="wiz-nav">' + this.navButtons() + '</div>';

    document.getElementById('wiz-bottom-bar').innerHTML = this.navButtons();
    this.updateSummary();
    self.afterDraw();
  },

  // 그린 뒤 처리 (드롭 영역 연결 등)
  afterDraw: function () {
    if (this.draft.step === 4) {
      var zone = document.getElementById('drop-zone');
      if (zone) {
        var self = this;
        ['dragenter', 'dragover'].forEach(function (ev) {
          zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragging'); });
        });
        ['dragleave', 'dragend'].forEach(function (ev) {
          zone.addEventListener(ev, function () { zone.classList.remove('dragging'); });
        });
        zone.addEventListener('drop', function (e) {
          e.preventDefault();
          zone.classList.remove('dragging');
          if (e.dataTransfer && e.dataTransfer.files) self.addFiles(e.dataTransfer.files);
        });
      }
    }
  },

  // Back / Next (5단계는 Submit) 버튼
  navButtons: function () {
    var d = this.draft;
    var html = '';
    html += d.step > 1
      ? '<button type="button" class="btn btn-outline btn-lg" onclick="PageNew.back()"' + (this.submitting ? ' disabled' : '') + '><span class="arrow" aria-hidden="true">←</span> ' + escHtml(t('wiz_prev')) + '</button>'
      : '<span></span>';
    if (d.step < 5) {
      html += '<button type="button" class="btn btn-primary btn-lg" onclick="PageNew.next()">' + escHtml(t('wiz_next')) + ' <span class="arrow" aria-hidden="true">→</span></button>';
    } else {
      var enough = APP.balance != null && APP.balance >= cncCreditsNeeded(d);
      var label = this.submitting ? '<span class="spinner" aria-hidden="true"></span> ' + escHtml(t('submitting')) : escHtml(t('custom_submit'));
      html += '<button type="button" class="btn btn-gold btn-lg btn-submit" onclick="PageNew.submit()"' +
        (this.submitting || !enough ? ' disabled' : '') + '>' + label + '</button>';
    }
    return html;
  },

  // ================================================================
  // Step 1 — 환자 · 납기일
  // ================================================================
  step1: function () {
    var d = this.draft;
    var e = (this.check && this.check.errors) || {};
    return '<div class="form-grid">' +
      '<div class="field">' +
        '<label class="field-label" for="f-patient">' + escHtml(t('wiz_patient_label')) + ' <span class="required">*</span></label>' +
        '<input class="input input-lg' + (e.patient ? ' invalid' : '') + '" id="f-patient" type="text" maxlength="50" autocomplete="off" ' +
          'value="' + escHtml(d.patient) + '" placeholder="' + escHtml(t('patient_ph')) + '" ' +
          'oninput="PageNew.setField(\'patient\', this.value)">' +
        '<p class="field-help privacy-hint"><span aria-hidden="true">🔒</span> ' + escHtml(t('patient_privacy_hint')) + '</p>' +
        uiFieldError(e.patient) +
      '</div>' +
      '<div class="field">' +
        '<label class="field-label" for="f-deadline">' + escHtml(t('case_deadline_label')) + ' <span class="required">*</span></label>' +
        uiDateField({ id: 'f-deadline', value: d.deadline, min: cncToday(), onChange: 'PageNew.setDeadline', invalid: !!e.deadline }) +
        uiFieldError(e.deadline) +
      '</div>' +
    '</div>';
  },

  // 달력에서 날짜를 고르면 불려요 ('YYYY-MM-DD')
  setDeadline: function (value) {
    this.setField('deadline', value);
  },

  // 단계 제목 옆 "? Help" → 그 단계 설명 (가이드 문구 재사용)
  showHelp: function (btn) {
    var n = this.draft.step;
    uiPopover(btn, '<p class="popover-title">' + escHtml(t(this.STEP_KEYS[n - 1])) + '</p>' +
      '<p>' + escHtml(t('guide_step' + n + '_text')) + '</p>' +
      '<a href="#/guide" class="popover-link">' + escHtml(t('guide_open_full')) + ' <span class="arrow" aria-hidden="true">→</span></a>');
  },

  // 글자 입력 칸 (patient, deadline, memo) — 다시 그리지 않고 저장 + 요약만 갱신 (입력 중 커서 유지)
  setField: function (field, value) {
    this.draft[field] = value;
    this.save();
    this.clearError(field);
    this.updateSummary();
  },

  // 해당 칸의 에러 글씨 지우기
  clearError: function (field) {
    if (!this.check || !this.check.errors[field]) return;
    delete this.check.errors[field];
    var input = document.getElementById('f-' + field);
    if (input) {
      input.classList.remove('invalid');
      var box = input.closest('.field');
      var err = box && box.querySelector('.field-error');
      if (err) err.remove();
    }
  },

  // ================================================================
  // Step 2 — 치아 선택 (FDI 32개)
  // ================================================================
  step2: function () {
    var d = this.draft;
    var e = (this.check && this.check.errors) || {};
    var self = this;

    // 사분면 하나 (8개). upper: 위턱(뿌리 위·번호 아래) / 아래턱(뿌리 아래·번호 위)
    function quad(list, side, upper) {
      return '<div class="tooth-quad ' + side + '">' +
        '<span class="tooth-side" aria-hidden="true">' + (side === 'right' ? 'R' : 'L') + '</span>' +
        '<div class="tooth-row">' + list.map(function (n) {
          return self.toothButtonHtml(n, upper, d.teeth.indexOf(n) !== -1);
        }).join('') + '</div></div>';
    }
    function jaw(titleKey, right, left, upper) {
      return '<div class="jaw ' + (upper ? 'jaw-upper' : 'jaw-lower') + '" role="group" aria-label="' + escHtml(t(titleKey)) + '">' +
        '<p class="jaw-title">' + escHtml(t(titleKey)) + '</p>' +
        '<div class="jaw-arch">' + quad(right, 'right', upper) + '<span class="jaw-mid" aria-hidden="true"></span>' + quad(left, 'left', upper) + '</div>' +
        '</div>';
    }

    var n = d.teeth.length;
    var balance = APP.balance != null ? formatNumber(APP.balance) : '—';
    var info = n
      ? tf('teeth_selected_credits', { n: n, balance: balance })
      : t('teeth_none_selected');
    var short = APP.balance != null && n > APP.balance;

    return '<div class="tooth-chart" dir="ltr">' +
        jaw('upper_jaw', FDI_UPPER_RIGHT, FDI_UPPER_LEFT, true) +
        '<hr class="jaw-divider">' +
        jaw('lower_jaw', FDI_LOWER_RIGHT, FDI_LOWER_LEFT, false) +
      '</div>' +
      '<p class="tooth-legend">' + escHtml(t('tooth_rl_hint')) + '</p>' +
      '<div class="tooth-info' + (short ? ' warn' : '') + '" role="status">' +
        '<span class="tooth-info-text">' + escHtml(info) + '</span>' +
        (n ? '<button type="button" class="btn btn-outline btn-sm" onclick="PageNew.clearTeeth()">' + escHtml(t('clear_all')) + '</button>' : '') +
      '</div>' +
      (short ? '<p class="field-error" role="alert"><span aria-hidden="true">⚠</span> ' + escHtml(t('insufficient_credits_msg')) + '</p>' +
        '<a href="#/topup" class="btn btn-gold btn-sm">💳 ' + escHtml(t('topup_btn')) + '</a>' : '') +
      (n ? '<p class="selected-teeth">' + escHtml(t('selected_teeth')) + ': <span class="mono">' + d.teeth.map(function (x) { return '#' + x; }).join(', ') + '</span></p>' : '') +
      uiFieldError(e.teeth);
  },

  // 치아 종류: 1~3 앞니(좁고 길게) / 4~5 작은어금니 / 6~8 큰어금니(넓고 둥글게)
  toothKind: function (n) {
    var pos = Number(n) % 10;
    return pos <= 3 ? 'front' : (pos <= 5 ? 'premolar' : 'molar');
  },

  // 치아 모양 SVG (위턱 기준: 뿌리 위, 머리 아래. 아래턱은 CSS 로 위아래 뒤집어요)
  TOOTH_PATHS: {
    front: 'M15 31 C14.5 20 16.5 9 20 4 C23.5 9 25.5 20 25 31 C28.5 37 29.5 45 29 50 C28.5 55.5 24 57.5 20 57.5 C16 57.5 11.5 55.5 11 50 C10.5 45 11.5 37 15 31 Z',
    premolar: 'M13.5 30 C13 19 16 9 20 5 C24 9 27 19 26.5 30 C30 35 32 43 31.5 49 C31 55 25.5 57.5 20 57.5 C14.5 57.5 9 55 8.5 49 C8 43 10 35 13.5 30 Z',
    molar: 'M9 30 C8 20 9.5 11 12 6 C14.5 10 16 17 17 23 L23 23 C24 17 25.5 10 28 6 C30.5 11 32 20 31 30 C35.5 34 37 43 35.5 50 C34 56 27 58 20 58 C13 58 6 56 4.5 50 C3 43 4.5 34 9 30 Z'
  },

  // 치아 버튼: 모양 + 번호(위턱은 아래, 아래턱은 위) + 선택 ✓
  toothButtonHtml: function (n, upper, on) {
    var kind = this.toothKind(n);
    var pos = Number(n) % 10;
    // 완만한 아치: 가운데(1번)가 앞으로 — 위턱은 아래로, 아래턱은 위로 조금 (넓은 화면에서만, CSS 변수)
    var arch = Math.round((pos - 1) * (pos - 1) * 0.45);
    var svg = '<svg class="tooth-svg" viewBox="0 0 40 62" aria-hidden="true" focusable="false">' +
      '<path class="tooth-shape" d="' + this.TOOTH_PATHS[kind] + '"/>' +
      '<path class="tooth-cej" d="' + (kind === 'molar' ? 'M7 31 C15 34 25 34 33 31' : (kind === 'premolar' ? 'M11 31 C17 33.5 23 33.5 29 31' : 'M14 32 C18 34 22 34 26 32')) + '"/>' +
      '</svg>';
    var num = '<span class="tooth-num mono">' + n + '</span>';
    return '<button type="button" class="tooth-btn tooth-' + kind + (upper ? ' upper' : ' lower') + (on ? ' selected' : '') + '" ' +
      'style="--arch:' + arch + 'px" aria-pressed="' + on + '" ' +
      'aria-label="' + escHtml(getToothName(n)) + '" title="' + escHtml(getToothName(n)) + '" ' +
      'onclick="PageNew.toggleTooth(' + n + ')">' +
      (upper ? svg + num : num + svg) +
      '<span class="tooth-check" aria-hidden="true">✓</span>' +
      '</button>';
  },

  toggleTooth: function (num) {
    cncToggleTooth(this.draft, num);
    if (this.check) delete this.check.errors.teeth;
    this.save();
    this.drawStep();
    var btn = document.querySelector('.tooth-btn[onclick="PageNew.toggleTooth(' + num + ')"]');
    if (btn) btn.focus();
  },

  clearTeeth: async function () {
    var ok = await uiConfirm({ title: t('clear_all'), message: t('clear_all_confirm'), okLabel: t('clear_all'), danger: true });
    if (!ok) return;
    cncClearTeeth(this.draft);
    this.save();
    this.drawStep();
  },

  // ================================================================
  // Step 3 — 치아별 브랜드 · 사이즈 · 쉐이드 + 메모
  // ================================================================
  step3: function () {
    var d = this.draft;
    var self = this;
    var tErr = (this.check && this.check.teeth) || {};
    var e = (this.check && this.check.errors) || {};

    function brandOptions(selected) {
      return '<option value="">' + escHtml(t('choose_brand')) + '</option>' +
        IMPLANT_BRANDS.map(function (b) {
          return '<option value="' + escHtml(b) + '"' + (b === selected ? ' selected' : '') + '>' + escHtml(b === 'Other' ? t('brand_other') : b) + '</option>';
        }).join('');
    }

    // 위쪽: 모든 치아에 한 번에 적용
    var bulk = '<div class="bulk-box">' +
      '<p class="bulk-title">' + escHtml(t('bulk_title')) + '</p>' +
      '<div class="bulk-grid">' +
        '<div class="bulk-item">' +
          '<label class="field-label" for="bulk-brand">' + escHtml(t('brand_label')) + '</label>' +
          '<div class="bulk-row">' +
            '<select class="input" id="bulk-brand" onchange="PageNew.bulkBrand = this.value">' + brandOptions(this.bulkBrand) + '</select>' +
            '<button type="button" class="btn btn-outline" onclick="PageNew.applyAll(\'brand\')">' + escHtml(t('wiz_brand_apply_all')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="bulk-item">' +
          '<span class="field-label">' + escHtml(t('wiz_shade_label')) + '</span>' +
          '<div class="bulk-row">' +
            '<button type="button" class="input shade-btn" onclick="PageNew.openShadePicker(null)">' +
              uiShadeChip(this.bulkShade) + '<span>' + escHtml(this.bulkShade || t('choose_shade')) + '</span></button>' +
            '<button type="button" class="btn btn-outline" onclick="PageNew.applyAll(\'shade\')">' + escHtml(t('wiz_shade_apply_all')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    // 치아마다 카드
    var cards = d.teeth.map(function (n) {
      var det = d.details[n] || {};
      var er = tErr[n] || {};
      var bad = er.brand || er.shade || er.size;
      return '<div class="tooth-card' + (bad ? ' invalid' : '') + '" id="tooth-card-' + n + '">' +
        '<div class="tooth-card-head"><span class="tooth-card-num mono">#' + n + '</span>' +
          '<span class="tooth-card-name">' + escHtml(t(toothTypeKey(n))) + '</span></div>' +
        '<div class="tooth-card-fields">' +
          '<div class="field">' +
            '<label class="field-label" for="brand-' + n + '">' + escHtml(t('brand_label')) + ' <span class="required">*</span></label>' +
            '<select class="input' + (er.brand ? ' invalid' : '') + '" id="brand-' + n + '" onchange="PageNew.setTooth(' + n + ', \'brand\', this.value, true)">' + brandOptions(det.brand) + '</select>' +
            uiFieldError(er.brand) +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label" for="size-' + n + '">' + escHtml(t('size_label')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
            '<input class="input' + (er.size ? ' invalid' : '') + '" id="size-' + n + '" type="text" maxlength="40" value="' + escHtml(det.size) + '" placeholder="' + escHtml(t('size_ph')) + '" ' +
              'oninput="PageNew.setTooth(' + n + ', \'size\', this.value, false)">' +
            uiFieldError(er.size) +
          '</div>' +
          '<div class="field">' +
            '<span class="field-label">' + escHtml(t('wiz_shade_label')) + ' <span class="required">*</span></span>' +
            '<button type="button" class="input shade-btn' + (er.shade ? ' invalid' : '') + '" id="shade-' + n + '" onclick="PageNew.openShadePicker(' + n + ')">' +
              uiShadeChip(det.shade) + '<span>' + escHtml(det.shade || t('choose_shade')) + '</span></button>' +
            uiFieldError(er.shade) +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return bulk +
      '<p class="section-label">' + escHtml(t('wiz_shade_per_tooth')) + '</p>' +
      '<div class="tooth-cards">' + cards + '</div>' +
      '<div class="field">' +
        '<label class="field-label" for="f-memo">' + escHtml(t('memo_label')) + ' <span class="optional">(' + escHtml(t('optional')) + ')</span></label>' +
        '<textarea class="input textarea' + (e.memo ? ' invalid' : '') + '" id="f-memo" rows="4" maxlength="2000" placeholder="' + escHtml(t('memo_ph')) + '" ' +
          'oninput="PageNew.setField(\'memo\', this.value)">' + escHtml(d.memo) + '</textarea>' +
        uiFieldError(e.memo) +
      '</div>';
  },

  // 치아 하나의 값 바꾸기. redraw=true 면 카드 다시 그림 (드롭다운·쉐이드), false 면 저장만 (글자 입력)
  setTooth: function (num, field, value, redraw) {
    cncSetToothDetail(this.draft, num, field, value);
    if (this.check && this.check.teeth[num]) {
      delete this.check.teeth[num][field];
      if (!Object.keys(this.check.teeth[num]).length) delete this.check.teeth[num];
    }
    this.save();
    if (redraw) {
      var y = window.scrollY;
      this.drawStep();
      window.scrollTo(0, y);
      var el = document.getElementById(field + '-' + num);
      if (el) el.focus({ preventScroll: true });
    } else {
      this.updateSummary();
    }
  },

  applyAll: function (field) {
    var value = field === 'brand' ? this.bulkBrand : this.bulkShade;
    if (!value) {
      uiToast(t(field === 'brand' ? 'choose_brand_first' : 'choose_shade_first'), 'error');
      return;
    }
    cncApplyToAll(this.draft, field, value);
    if (this.check) {
      var tErr = this.check.teeth;
      Object.keys(tErr).forEach(function (n) {
        delete tErr[n][field];
        if (!Object.keys(tErr[n]).length) delete tErr[n];
      });
    }
    this.save();
    var y = window.scrollY;
    this.drawStep();
    window.scrollTo(0, y);
    uiToast(tf('applied_all_fmt', { value: field === 'brand' && value === 'Other' ? t('brand_other') : value, n: this.draft.teeth.length }), 'success');
  },

  // VITA 14색 팔레트 (num 이 null 이면 "모든 치아에 적용" 용)
  openShadePicker: function (num) {
    var self = this;
    var current = num == null ? this.bulkShade : ((this.draft.details[num] || {}).shade || '');
    var title = num == null ? t('wiz_shade_label') : tf('shade_for_tooth', { tooth: getToothName(num) });
    var body = '<div class="shade-grid">' + TOOTH_COLORS.map(function (c) {
      return '<button type="button" class="shade-option' + (c === current ? ' selected' : '') + '" data-shade="' + escHtml(c) + '" ' +
        'style="background:' + VITA_BG[c] + '" aria-pressed="' + (c === current) + '">' +
        '<span class="mono">' + escHtml(c) + '</span>' + (c === current ? '<span class="shade-check" aria-hidden="true">✓</span>' : '') +
        '</button>';
    }).join('') + '</div>';
    var modal = uiModal({ title: title, body: body });
    modal.el.querySelector('.shade-grid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-shade]');
      if (!b) return;
      var shade = b.getAttribute('data-shade');
      modal.close();
      if (num == null) {
        self.bulkShade = shade;
        var y = window.scrollY;
        self.drawStep();
        window.scrollTo(0, y);
      } else {
        self.setTooth(num, 'shade', shade, true);
      }
    });
  },

  // ================================================================
  // Step 4 — 파일 업로드
  // ================================================================
  step4: function () {
    var d = this.draft;
    var html = '';

    // 복원된 draft 에 있던 파일 → 다시 골라야 해요
    if (d.missingFiles.length) {
      html += '<div class="notice notice-warn" role="status">' +
        '<p><span aria-hidden="true">⚠</span> ' + escHtml(t('draft_files_reselect')) + '</p>' +
        '<p class="mono notice-files">' + d.missingFiles.map(escHtml).join(', ') + '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="PageNew.dismissMissing()">' + escHtml(t('btn_dismiss')) + '</button>' +
        '</div>';
    }

    html += '<div class="drop-zone" id="drop-zone">' +
      '<span class="drop-icon" aria-hidden="true">⬆</span>' +
      '<p class="drop-title">' + escHtml(t('drop_title')) + '</p>' +
      '<button type="button" class="btn btn-primary" onclick="document.getElementById(\'file-input\').click()"' +
        (d.files.length >= FILE_MAX_COUNT ? ' disabled' : '') + '>' + escHtml(t('choose_files')) + '</button>' +
      '<input type="file" id="file-input" multiple accept="' + FILE_ACCEPT + '" hidden onchange="PageNew.addFiles(this.files); this.value=\'\'">' +
      '<p class="drop-hint">' + escHtml(t('file_formats_hint')) + '</p>' +
      '<p class="drop-hint">' + escHtml(tf('file_limits_hint', { size: 50, count: FILE_MAX_COUNT })) + '</p>' +
      '<p class="drop-hint privacy-hint"><span aria-hidden="true">🔒</span> ' + escHtml(t('files_privacy_hint')) + '</p>' +
      '</div>';

    // 거부된 파일 안내
    if (this.fileNotices.length) {
      html += '<ul class="file-notices" role="alert">' + this.fileNotices.map(function (r) {
        return '<li class="field-error"><span aria-hidden="true">⚠</span> ' + escHtml(tf('file_reject_' + r.reason, { name: r.name, size: 50, count: FILE_MAX_COUNT })) + '</li>';
      }).join('') + '</ul>';
    }

    // 파일 목록
    html += '<p class="section-label">' + escHtml(tf('files_count_fmt', { n: d.files.length, max: FILE_MAX_COUNT })) + '</p>';
    if (!d.files.length) {
      html += '<p class="empty-text">' + escHtml(t('no_files_yet')) + '</p>';
    } else {
      html += '<ul class="file-list">' + d.files.map(function (f) {
        return '<li class="file-row">' +
          '<span class="file-icon" aria-hidden="true">' + uiFileIcon(f.name) + '</span>' +
          '<span class="file-info"><span class="file-name">' + escHtml(f.name) + '</span>' +
            '<span class="file-size"><span class="mono">' + formatBytes(f.size) + '</span>' + (f.path ? ' · ' + escHtml(t('uploaded')) : '') + '</span></span>' +
          '<span class="file-actions">' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="PageNew.previewFile(\'' + f.id + '\')"><span aria-hidden="true">👁</span> ' + escHtml(t('btn_preview')) + '</button>' +
            '<button type="button" class="btn btn-outline btn-sm btn-danger-text" onclick="PageNew.removeFile(\'' + f.id + '\')"' + (this.submitting ? ' disabled' : '') + '><span aria-hidden="true">✕</span> ' + escHtml(t('btn_remove')) + '</button>' +
          '</span></li>';
      }, this).join('') + '</ul>';
    }
    return html;
  },

  addFiles: function (fileList) {
    var result = cncAddFiles(this.draft, fileList);
    this.fileNotices = result.rejected;
    this.save();
    this.drawStep();
    if (result.added.length) uiToast(tf('files_added_fmt', { n: result.added.length }), 'success');
  },

  removeFile: function (id) {
    cncRemoveFile(this.draft, id);
    this.fileNotices = [];
    this.save();
    this.drawStep();
  },

  previewFile: function (id) {
    var f = this.draft.files.filter(function (x) { return x.id === id; })[0];
    if (f) cncOpenViewer({ name: f.name, file: f.file });
  },

  dismissMissing: function () {
    cncDismissMissingFiles(this.draft);
    this.save();
    this.drawStep();
  },

  // ================================================================
  // Step 5 — 확인 · 배송 · 크레딧 · 제출
  // ================================================================
  step5: function () {
    var d = this.draft;
    var e = (this.check && this.check.errors) || {};
    var need = cncCreditsNeeded(d);
    var bal = APP.balance;
    var enough = bal != null && bal >= need;

    function group(titleKey, step, content) {
      return '<div class="review-group">' +
        '<div class="review-head"><h3 class="review-title">' + escHtml(t(titleKey)) + '</h3>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="PageNew.goStep(' + step + ')"' + (PageNew.submitting ? ' disabled' : '') + '>' + escHtml(t('btn_edit')) + '</button></div>' +
        content + '</div>';
    }
    function row(labelKey, value, mono) {
      return '<div class="review-row"><span class="review-label">' + escHtml(t(labelKey)) + '</span>' +
        '<span class="review-value' + (mono ? ' mono' : '') + '">' + value + '</span></div>';
    }

    var teethTable = '<div class="table-wrap"><table class="table">' +
      '<thead><tr><th>#</th><th>' + escHtml(t('brand_label')) + '</th><th>' + escHtml(t('size_label')) + '</th><th>' + escHtml(t('wiz_shade_label')) + '</th></tr></thead><tbody>' +
      d.teeth.map(function (n) {
        var det = d.details[n] || {};
        return '<tr><td><span class="mono">#' + n + '</span> <span class="muted">' + escHtml(t(toothTypeKey(n))) + '</span></td>' +
          '<td>' + escHtml(det.brand === 'Other' ? t('brand_other') : (det.brand || '—')) + '</td>' +
          '<td class="mono">' + escHtml(det.size || '—') + '</td>' +
          '<td>' + uiShadeChip(det.shade) + ' <span class="mono">' + escHtml(det.shade || '—') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';

    var html = '';
    html += group('wiz_step1', 1,
      row('wiz_patient_label', escHtml(d.patient.trim() || '—')) +
      row('case_deadline_label', escHtml(formatDate(d.deadline))));
    html += group('wiz_step3', 3, teethTable +
      (d.memo ? row('memo_label', '<span class="pre">' + escHtml(d.memo) + '</span>') : ''));
    html += group('wiz_step4', 4, d.files.length
      ? '<ul class="review-files">' + d.files.map(function (f) {
          return '<li><span aria-hidden="true">' + uiFileIcon(f.name) + '</span> ' + escHtml(f.name) + ' <span class="muted mono">' + formatBytes(f.size) + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="muted">' + escHtml(t('no_files_yet')) + '</p>');

    // 배송 정보
    function input(field, labelKey, required, type) {
      return '<div class="field">' +
        '<label class="field-label" for="f-' + field + '">' + escHtml(t(labelKey)) +
          (required ? ' <span class="required">*</span>' : ' <span class="optional">(' + escHtml(t('optional')) + ')</span>') + '</label>' +
        '<input class="input' + (e[field] ? ' invalid' : '') + '" id="f-' + field + '" type="' + (type || 'text') + '" maxlength="200" ' +
          'value="' + escHtml(d.delivery[field]) + '" oninput="PageNew.setDelivery(\'' + field + '\', this.value)">' +
        uiFieldError(e[field]) +
        '</div>';
    }
    html += '<div class="review-group"><div class="review-head"><h3 class="review-title">' + escHtml(t('wiz_delivery_label')) + '</h3></div>' +
      '<div class="form-grid two">' +
        input('clinic', 'clinic_name', true) +
        input('phone', 'phone_label', true, 'tel') +
        '<div class="span-2">' + input('addr', 'address_label', true) + '</div>' +
        input('line_id', 'line_id_label', false) +
      '</div>' +
      '<label class="checkbox"><input type="checkbox" ' + (d.saveToProfile ? 'checked' : '') +
        ' onchange="PageNew.draft.saveToProfile = this.checked; PageNew.save()"> <span>' + escHtml(t('save_to_profile')) + '</span></label>' +
      '</div>';

    // 크레딧
    html += '<div class="review-group credit-box' + (enough ? '' : ' short') + '">' +
      '<div class="review-head"><h3 class="review-title">' + escHtml(t('credits_title')) + '</h3></div>' +
      row('credits_use', formatNumber(need), true) +
      row('credits_current', bal != null ? formatNumber(bal) : '—', true) +
      row('credits_after', bal != null ? formatNumber(bal - need) : '—', true) +
      (bal != null && !enough ? '<p class="field-error" role="alert"><span aria-hidden="true">⚠</span> ' + escHtml(t('insufficient_credits_msg')) + '</p>' +
        '<p class="topup-hint">' + escHtml(t('topup_draft_saved')) + '</p>' +
        '<a href="#/topup" class="btn btn-gold">💳 ' + escHtml(t('topup_btn')) + ' <span class="arrow" aria-hidden="true">→</span></a>' : '') +
      '</div>';

    // 제출 진행 / 에러
    if (this.submitting && this.progress) {
      var p = this.progress;
      var pct = p.phase === 'save' ? 100 : (p.total ? Math.round(p.done / p.total * 100) : 100);
      var text = p.phase === 'save' ? t('submit_saving') : tf('submit_uploading', { done: p.done, total: p.total });
      html += '<div class="progress-box" role="status" aria-live="polite">' +
        '<p>' + escHtml(text) + (p.name && p.phase !== 'save' ? ' <span class="muted">' + escHtml(p.name) + '</span>' : '') + '</p>' +
        '<div class="progress"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>';
    }
    if (this.submitError && !this.submitting) {
      html += '<div class="notice notice-error" role="alert">' +
        '<p><span aria-hidden="true">⚠</span> ' + escHtml(uiErrorMessage(this.submitError)) + '</p>' +
        (cncErrorCode(this.submitError) === 'UPLOAD_FAILED' || cncErrorCode(this.submitError) === 'NETWORK' || cncErrorCode(this.submitError) === 'UNKNOWN'
          ? '<button type="button" class="btn btn-primary" onclick="PageNew.submit()">' + escHtml(t('btn_retry')) + '</button>' : '') +
        uiContactHelpHtml() +
        '</div>';
    }
    html += '<p class="submit-note">' + escHtml(t('custom_submit_note')) + '</p>';
    return html;
  },

  setDelivery: function (field, value) {
    this.draft.delivery[field] = value;
    this.save();
    this.clearError(field);
  },

  // ================================================================
  // 단계 이동
  // ================================================================
  next: async function () {
    var d = this.draft;
    var result = cncValidateStep(d, d.step);
    this.check = result;
    if (!result.ok) {
      this.drawStep();
      this.focusFirstError();
      return;
    }
    if (d.step === 4 && !cncHasScanFile(d)) {
      var ok = await uiConfirm({
        title: t('no_file_confirm_title'),
        message: t('no_file_confirm'),
        okLabel: t('continue_anyway'),
        cancelLabel: t('add_files')
      });
      if (!ok) return;
    }
    this.check = null;
    d.step = Math.min(5, d.step + 1);
    d.maxStep = Math.max(d.maxStep, d.step);
    if (d.step === 5) refreshBalance();
    this.save();
    this.drawStep();
    this.scrollTop();
  },

  back: function () {
    if (this.draft.step <= 1 || this.submitting) return;
    this.check = null;
    this.draft.step--;
    this.save();
    this.drawStep();
    this.scrollTop();
  },

  // 단계 목록·Edit 버튼으로 이동 (앞으로 갈 때는 중간 단계가 모두 맞아야 해요)
  goStep: function (n) {
    var d = this.draft;
    if (this.submitting || n === d.step || n > d.maxStep) return;
    if (n > d.step) {
      for (var s = d.step; s < n; s++) {
        var r = cncValidateStep(d, s);
        if (!r.ok) {
          d.step = s;
          this.check = r;
          this.save();
          this.drawStep();
          this.focusFirstError();
          return;
        }
      }
    }
    this.check = null;
    d.step = n;
    this.save();
    this.drawStep();
    this.scrollTop();
  },

  scrollTop: function () {
    var main = document.getElementById('wiz-main');
    if (main) {
      var y = main.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo(0, Math.max(0, y));
      var title = main.querySelector('.wiz-title');
      if (title) { title.setAttribute('tabindex', '-1'); title.focus({ preventScroll: true }); }
    }
  },

  focusFirstError: function () {
    var el = document.querySelector('#wiz-main .invalid, #wiz-main .field-error');
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    var target = el.matches('input, select, textarea, button') ? el : el.querySelector('input, select, textarea, button');
    if (target) target.focus({ preventScroll: true });
  },

  // ================================================================
  // 오른쪽 주문 요약 (입력할 때마다 갱신)
  // ================================================================
  updateSummary: function () {
    var box = document.getElementById('wiz-summary');
    if (!box || !this.draft) return;
    var d = this.draft;
    var need = cncCreditsNeeded(d);
    var bal = APP.balance;

    var teeth = d.teeth.length
      ? '<ul class="sum-teeth">' + d.teeth.map(function (n) {
          var det = d.details[n] || {};
          return '<li><span class="mono sum-tooth">#' + n + '</span>' +
            '<span class="sum-brand">' + escHtml(det.brand === 'Other' ? t('brand_other') : (det.brand || '—')) + '</span>' +
            '<span class="sum-shade">' + uiShadeChip(det.shade) + '<span class="mono">' + escHtml(det.shade || '—') + '</span></span></li>';
        }).join('') + '</ul>'
      : '<p class="muted">—</p>';

    box.innerHTML =
      '<h2 class="sum-title">' + escHtml(t('summary_title')) + '</h2>' +
      '<dl class="sum-list">' +
        '<dt>' + escHtml(t('wiz_patient_label')) + '</dt><dd>' + escHtml(d.patient.trim() || '—') + '</dd>' +
        '<dt>' + escHtml(t('case_deadline_label')) + '</dt><dd>' + escHtml(d.deadline ? formatDate(d.deadline) : '—') + '</dd>' +
        '<dt>' + escHtml(tf('teeth_count_fmt', { n: d.teeth.length })) + '</dt><dd>' + teeth + '</dd>' +
        '<dt>' + escHtml(t('files_label')) + '</dt><dd class="mono">' + d.files.length + ' / ' + FILE_MAX_COUNT + '</dd>' +
      '</dl>' +
      '<div class="sum-credits' + (bal != null && bal < need ? ' short' : '') + '">' +
        '<div><span>' + escHtml(t('credits_use')) + '</span><b class="mono">' + formatNumber(need) + '</b></div>' +
        '<div><span>' + escHtml(t('credits_current')) + '</span><b class="mono">' + (bal != null ? formatNumber(bal) : '—') + '</b></div>' +
      '</div>';
  },

  // ================================================================
  // 제출
  // ================================================================
  submit: async function () {
    if (this.submitting) return;   // 두 번 클릭 방지
    var d = this.draft;

    // 5단계 칸 검사
    var r = cncValidateStep(d, 5);
    this.check = r;
    if (!r.ok) { this.drawStep(); this.focusFirstError(); return; }

    // 앞 단계도 다시 확인 (다른 탭에서 바뀐 경우 등)
    var bad = cncFirstInvalidStep(d);
    if (bad) { this.goStep(bad); return; }

    if (APP.balance == null || APP.balance < cncCreditsNeeded(d)) {
      this.submitError = cncError('INSUFFICIENT_CREDITS');
      this.drawStep();
      return;
    }

    this.submitting = true;
    this.submitError = null;
    this.progress = { phase: 'upload', done: 0, total: d.files.length };
    this.drawStep();

    var self = this;
    try {
      var res = await cncSubmitOrder(d, function (p) {
        self.progress = p;
        self.drawProgress();
      });
      // 성공!
      cncClearDraft(this.draftUser);
      this.success = res || {};
      this.draft = null;
      this.check = null;
      this.submitting = false;
      this.progress = null;
      if (res && res.balance != null) setBalance(res.balance);
      else refreshBalance();
      this.drawSuccess();
      window.scrollTo(0, 0);
    } catch (err) {
      console.error('Submit failed:', err);
      this.submitting = false;
      this.progress = null;
      this.submitError = err;
      this.save();
      if (cncErrorCode(err) === 'INSUFFICIENT_CREDITS') refreshBalance();
      this.drawStep();
      var box = document.querySelector('.notice-error');
      if (box) box.scrollIntoView({ block: 'center' });
    }
  },

  // 진행률만 다시 그리기 (버튼 연타 방지 상태 유지)
  drawProgress: function () {
    if (!this.draft || this.draft.step !== 5) return;
    var y = window.scrollY;
    this.drawStep();
    window.scrollTo(0, y);
  },

  // ================================================================
  // 성공 화면
  // ================================================================
  drawSuccess: function () {
    var s = this.success || {};
    this.main.innerHTML =
      '<div class="page page-success">' +
        '<div class="card success-card" role="status">' +
          '<div class="success-check" aria-hidden="true">✓</div>' +
          '<h1 class="success-title">' + escHtml(t('order_success_title')) + '</h1>' +
          '<p class="success-label">' + escHtml(t('order_number')) + '</p>' +
          '<p class="success-id mono">' + escHtml(s.id || '') + '</p>' +
          '<p class="success-text">' + escHtml(tf('order_success_detail', { n: s.teeth || 0, balance: formatNumber(s.balance != null ? s.balance : APP.balance) })) + '</p>' +
          lineCtaHtml() +
          '<div class="success-actions">' +
            '<a href="#/orders" class="btn btn-primary btn-lg" onclick="PageOrders.openId=\'' + escHtml(s.id || '') + '\'">' + escHtml(t('view_my_orders')) + '</a>' +
            '<button type="button" class="btn btn-outline btn-lg" onclick="PageNew.startNew()">' + escHtml(t('new_order_btn')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  },

  startNew: function () {
    this.success = null;
    this.draft = cncNewDraft(APP.profile);
    this.draftUser = APP.user.id;
    this.check = null;
    this.fileNotices = [];
    this.submitError = null;
    this.bulkBrand = '';
    this.bulkShade = '';
    this.draw();
    window.scrollTo(0, 0);
  }
};
