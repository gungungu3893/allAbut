// ===== 관리자: 🗂 주문 파일 보관 기간 (sql/020) — PageAdmin 에 덧붙여요 =====
// Settings 맨 아래 작은 카드 (owner 만):
//   - 보관 기간(개월, 기본 24 · 12~120) — 개인정보처리방침의 24개월과 다르면 주황 안내
//   - 모드 [미리보기 (지우지 않음)] [실제 삭제] — 실제 삭제로 바꿀 때는 확인 창 (되돌릴 수 없어요)
//   - 숫자: 지금 보관 기간이 지난 주문 · 파일을 지운 주문(누적)
//   - 최근 실행 5번 (시각 · 자동/수동 · 모드 · 대상 · 처리 · 지운 파일 · 오류) + 미리보기 목록(지워질 주문) + 최근 결과(삭제 · 오류)
//   - [지금 실행] → pg_net 으로 Edge Function 호출 (결과는 1~2분 뒤 [새로고침])
// 실제 권한 · 검사는 DB 함수 (admin_get_retention · admin_set_retention · admin_run_retention_now)

Object.assign(PageAdmin, {
  ret: { data: null, error: null, missing: false, loading: false, saving: false, running: false, months: null, mode: null, err: '' },

  retentionSectionHtml: function () {
    if (!cncHasRole('owner')) return '';
    return '<section class="card retention-card" id="retention-admin"></section>';
  },

  loadRetention: async function () {
    var st = this.ret;
    st.loading = true;
    st.error = null;
    this.drawRetention();
    try {
      var d = await cncAdminGetRetention();
      st.missing = d === null;
      st.data = d;
      st.months = null;
      st.mode = null;
      st.err = '';
    } catch (err) {
      console.error(err);
      st.error = err;
    }
    st.loading = false;
    this.drawRetention();
  },

  retModeLabel: function (mode) {
    return t(mode === 'delete' ? 'ret_mode_delete' : 'ret_mode_preview');
  },

  drawRetention: function () {
    var box = document.getElementById('retention-admin');
    if (!box) return;
    var st = this.ret;
    var d = st.data;
    var head = '<div class="card-head"><h2 class="card-title">🗂 ' + escHtml(t('ret_title')) + '</h2>' +
      (d ? '<span class="badge ret-mode-badge ret-mode-' + d.mode + '">' + escHtml(this.retModeLabel(d.mode)) + '</span>' : '') + '</div>' +
      '<p class="card-desc">' + escHtml(t('ret_help')) + '</p>';
    if (st.missing) { box.innerHTML = head + '<p class="notice notice-warn">' + escHtml(t('ret_missing')) + '</p>'; return; }
    if (st.error) {
      box.innerHTML = head + '<p class="error-text">' + escHtml(uiErrorMessage(st.error)) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.loadRetention()">' + escHtml(t('btn_retry')) + '</button>';
      return;
    }
    if (!d) { box.innerHTML = head + uiLoading(); return; }

    var months = st.months != null ? st.months : String(d.months);
    var mode = st.mode || d.mode;
    var changed = String(months) !== String(d.months) || mode !== d.mode;
    function opt(m) {
      var on = mode === m;
      return '<button type="button" role="radio" class="seg-btn' + (on ? ' active' : '') + '" aria-checked="' + on + '" onclick="PageAdmin.pickRetentionMode(\'' + m + '\')">' +
        escHtml(t(m === 'delete' ? 'ret_mode_delete' : 'ret_mode_preview_long')) + '</button>';
    }
    var policyWarn = Number(months) !== RETENTION_POLICY_MONTHS
      ? '<p class="field-help ret-policy-warn"><span aria-hidden="true">⚠</span> ' + escHtml(tf('ret_policy_warn', { n: RETENTION_POLICY_MONTHS })) + '</p>' : '';

    var html = head +
      '<div class="ret-stats">' +
        '<div class="ret-stat"><span class="ret-stat-num mono">' + escHtml(formatNumber(d.dueTotal)) + '</span><span class="ret-stat-label">' + escHtml(t('ret_due_total')) + '</span></div>' +
        '<div class="ret-stat"><span class="ret-stat-num mono">' + escHtml(formatNumber(d.deletedTotal)) + '</span><span class="ret-stat-label">' + escHtml(t('ret_deleted_total')) + '</span></div>' +
      '</div>' +
      '<div class="form-grid two ret-form">' +
        '<div class="field"><label class="field-label" for="ret-months">' + escHtml(t('ret_months_label')) + '</label>' +
          '<div class="ret-months-row"><input class="input ret-months-input mono" id="ret-months" type="number" inputmode="numeric" min="' + RETENTION_MIN_MONTHS + '" max="' + RETENTION_MAX_MONTHS + '" step="1" value="' + escHtml(months) + '" oninput="PageAdmin.setRetentionMonths(this.value)">' +
          '<span class="ret-months-unit">' + escHtml(t('ret_months_unit')) + '</span></div>' +
          '<p class="field-help">' + escHtml(tf('ret_months_help', { min: RETENTION_MIN_MONTHS, max: RETENTION_MAX_MONTHS })) + '</p>' +
          '<div class="ret-policy-slot">' + policyWarn + '</div>' +
          uiFieldError(st.err) +
        '</div>' +
        '<div class="field"><span class="field-label" id="ret-mode-label">' + escHtml(t('ret_mode_label')) + '</span>' +
          '<div class="seg" role="radiogroup" aria-labelledby="ret-mode-label">' + opt('preview') + opt('delete') + '</div>' +
          '<p class="field-help">' + escHtml(t(mode === 'delete' ? 'ret_mode_delete_help' : 'ret_mode_preview_help')) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="action-row ret-actions">' +
        '<button type="button" class="btn btn-primary" onclick="PageAdmin.saveRetention()"' + (!changed || st.saving ? ' disabled' : '') + '>' + escHtml(st.saving ? t('saving') : t('ret_save')) + '</button>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.runRetentionNow()"' + (st.running ? ' disabled' : '') + '>▶ ' + escHtml(t('ret_run_now')) + '</button>' +
        '<button type="button" class="btn btn-outline" onclick="PageAdmin.loadRetention()"' + (st.loading ? ' disabled' : '') + '>↻ ' + escHtml(t('admin_refresh')) + '</button>' +
      '</div>' +
      '<p class="field-help">' + escHtml(t('ret_schedule_note')) + '</p>';

    // 최근 실행
    html += '<h3 class="detail-title">' + escHtml(t('ret_runs_title')) + '</h3>';
    if (!d.runs.length) {
      html += '<p class="empty-text">' + escHtml(t('ret_runs_empty')) + '</p>';
    } else {
      var self = this;
      html += '<div class="table-wrap"><table class="table ret-runs-table"><thead><tr>' +
        '<th>' + escHtml(t('ret_col_time')) + '</th><th>' + escHtml(t('ret_col_how')) + '</th><th>' + escHtml(t('ret_mode_label')) + '</th>' +
        '<th class="num">' + escHtml(t('ret_col_due')) + '</th><th class="num">' + escHtml(t('ret_col_done')) + '</th>' +
        '<th class="num">' + escHtml(t('ret_col_files')) + '</th><th class="num">' + escHtml(t('ret_col_errors')) + '</th></tr></thead><tbody>' +
        d.runs.map(function (r) {
          return '<tr><td class="nowrap">' + escHtml(formatDateTime(r.started_at)) + (r.finished_at ? '' : ' <span class="badge">' + escHtml(t('ret_running')) + '</span>') + '</td>' +
            '<td>' + escHtml(t(r.trigger === 'manual' ? 'ret_how_manual' : 'ret_how_auto')) + '</td>' +
            '<td>' + escHtml(self.retModeLabel(r.mode)) + '</td>' +
            '<td class="num mono">' + escHtml(formatNumber(r.due_total || 0)) + '</td>' +
            '<td class="num mono">' + escHtml(formatNumber(r.orders_processed || 0)) + '</td>' +
            '<td class="num mono">' + escHtml(formatNumber(r.mode === 'delete' ? (r.files_deleted || 0) : (r.files_found || 0))) + '</td>' +
            '<td class="num mono' + (r.errors ? ' error-text' : '') + '">' + escHtml(formatNumber(r.errors || 0)) + '</td></tr>' +
            (r.note ? '<tr class="ret-note-row"><td colspan="7" class="muted">' + escHtml(r.note) + '</td></tr>' : '');
        }).join('') + '</tbody></table></div>' +
        '<p class="field-help">' + escHtml(t('ret_files_col_help')) + '</p>';
    }

    // 미리보기 목록 (지금 실제 삭제로 바꾸면 지워질 주문)
    if (d.preview.length) {
      html += '<h3 class="detail-title">' + escHtml(tf('ret_preview_title', { n: d.preview.length })) + '</h3>' +
        '<div class="table-wrap"><table class="table ret-preview-table"><thead><tr><th>' + escHtml(t('ret_col_order')) + '</th><th>' + escHtml(t('ret_col_closed')) + '</th>' +
        '<th class="num">' + escHtml(t('ret_col_files_found')) + '</th></tr></thead><tbody>' +
        d.preview.map(function (p) {
          return '<tr><td class="mono">' + escHtml(p.order_id) + '</td><td>' + escHtml(p.closed_at ? formatDate(p.closed_at) : '—') + '</td>' +
            '<td class="num mono">' + escHtml(formatNumber(p.files_found || 0)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    // 최근 결과 (삭제 · 오류)
    if (d.recent.length) {
      html += '<h3 class="detail-title">' + escHtml(t('ret_recent_title')) + '</h3>' +
        '<div class="table-wrap"><table class="table ret-recent-table"><thead><tr><th>' + escHtml(t('ret_col_time')) + '</th><th>' + escHtml(t('ret_col_order')) + '</th>' +
        '<th>' + escHtml(t('col_status')) + '</th><th class="num">' + escHtml(t('ret_col_files')) + '</th></tr></thead><tbody>' +
        d.recent.map(function (l) {
          var ok = l.status === 'deleted';
          return '<tr><td class="nowrap">' + escHtml(formatDateTime(l.created_at)) + '</td><td class="mono">' + escHtml(l.order_id) + '</td>' +
            '<td>' + (ok ? '<span class="badge ret-ok">' + escHtml(t('ret_status_deleted')) + '</span>'
                         : '<span class="badge ret-err">' + escHtml(t('ret_status_error')) + '</span> <span class="muted">' + escHtml(l.error || '') + '</span>') + '</td>' +
            '<td class="num mono">' + escHtml(formatNumber(l.files_deleted || 0)) + ' / ' + escHtml(formatNumber(l.files_found || 0)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    box.innerHTML = html;
  },

  // 숫자 칸: 다시 그리지 않고(입력 중 커서 유지) 저장 버튼 · 안내만 바꿔요
  setRetentionMonths: function (v) {
    var st = this.ret;
    st.months = String(v).trim();
    st.err = '';
    var d = st.data;
    var box = document.getElementById('retention-admin');
    if (!box || !d) return;
    var mode = st.mode || d.mode;
    var btn = box.querySelector('.ret-actions .btn-primary');
    if (btn) btn.disabled = st.saving || (st.months === String(d.months) && mode === d.mode);
    var slot = box.querySelector('.ret-policy-slot');
    if (slot) slot.innerHTML = Number(st.months) !== RETENTION_POLICY_MONTHS
      ? '<p class="field-help ret-policy-warn"><span aria-hidden="true">⚠</span> ' + escHtml(tf('ret_policy_warn', { n: RETENTION_POLICY_MONTHS })) + '</p>' : '';
    var errEl = box.querySelector('.ret-form .field-error');
    if (errEl) errEl.remove();
  },

  pickRetentionMode: function (m) {
    this.ret.mode = m === 'delete' ? 'delete' : 'preview';
    var input = document.getElementById('ret-months');
    if (input) this.ret.months = String(input.value).trim();
    this.drawRetention();
  },

  saveRetention: async function () {
    var st = this.ret;
    var d = st.data;
    if (!d || st.saving) return;
    var months = st.months != null ? st.months : String(d.months);
    var mode = st.mode || d.mode;
    var err = cncCheckRetentionMonths(months);
    if (err) { st.err = err; this.drawRetention(); var el = document.getElementById('ret-months'); if (el) el.focus(); return; }
    if (mode === 'delete' && d.mode !== 'delete') {
      var ok = await uiConfirm({
        title: t('ret_confirm_title'),
        message: tf('ret_confirm_delete', { n: months }),
        okLabel: t('ret_confirm_ok'),
        danger: true
      });
      if (!ok) return;
    }
    st.saving = true;
    this.drawRetention();
    try {
      st.data = await cncAdminSetRetention(Number(months), mode);
      st.months = null;
      st.mode = null;
      uiToast(t('admin_settings_saved'), 'success');
    } catch (e) {
      console.error(e);
      uiToast(uiErrorMessage(e), 'error');
    }
    st.saving = false;
    this.drawRetention();
  },

  runRetentionNow: async function () {
    var st = this.ret;
    if (st.running) return;
    st.running = true;
    this.drawRetention();
    try {
      var ok = await cncAdminRunRetentionNow();
      uiToast(t(ok ? 'ret_run_started' : 'ret_run_no_secret'), ok ? 'success' : 'error');
    } catch (e) {
      console.error(e);
      uiToast(uiErrorMessage(e), 'error');
    }
    st.running = false;
    this.drawRetention();
  }
});
