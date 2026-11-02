// ===== 내 주문 #/orders =====
// - 탭: In Progress / Completed (취소된 주문은 Completed 에 회색으로)
// - 검색: 주문번호 · 환자 ID
// - 주문 카드: 주문번호, 날짜, 환자, 치아 수, 상태 배지, 진행 막대 ①~⑦
// - 카드를 누르면 상세가 펼쳐져요: 치아 표, 메모, 파일, 배송 정보, 리뷰 이력, 단계별 버튼
// - 최신순, "Load more" 로 20개씩

var PageOrders = {
  main: null,
  tab: 'progress',
  search: '',
  rows: [],
  hasMore: false,
  loading: false,
  error: false,
  openIds: {},       // 펼쳐진 주문 { id: true }
  openId: null,      // 다른 페이지에서 "이 주문 열어줘" 할 때 (홈·성공 화면)
  busy: {},          // 버튼 처리 중인 주문 { id: true }
  loadToken: 0,
  searchTimer: null,

  render: function (main) {
    this.main = main;
    this.rows = [];
    this.hasMore = false;
    this.error = false;
    this.openIds = {};
    if (this.openId) {
      this.openIds[this.openId] = true;
      this.search = '';
    }
    this.drawFrame();
    this.load(false);
  },

  rerender: function () {
    this.drawFrame();
    this.drawList();
  },

  leave: function () {
    this.loadToken++;
    if (this.searchTimer) clearTimeout(this.searchTimer);
  },

  // 위쪽 (제목, 탭, 검색) — 검색칸은 입력 중에 다시 그리지 않아요
  drawFrame: function () {
    var self = this;
    function tab(id, key) {
      var on = self.tab === id;
      return '<button type="button" role="tab" class="seg-btn' + (on ? ' active' : '') + '" aria-selected="' + on + '" onclick="PageOrders.setTab(\'' + id + '\')">' + escHtml(t(key)) + '</button>';
    }
    this.main.innerHTML =
      '<div class="page page-orders">' +
        '<div class="page-head">' +
          '<h1 class="page-title">' + escHtml(t('nav_orders')) + '</h1>' +
          '<a href="#/new" class="btn btn-primary">' + escHtml(t('home_new_order')) + ' <span class="arrow" aria-hidden="true">→</span></a>' +
        '</div>' +
        '<div class="orders-tools">' +
          '<div class="seg" role="tablist">' + tab('progress', 'tab_in_progress') + tab('completed', 'tab_completed') + '</div>' +
          '<div class="search-box">' +
            '<label class="sr-only" for="order-search">' + escHtml(t('search_orders')) + '</label>' +
            '<span class="search-icon" aria-hidden="true">🔍</span>' +
            '<input class="input" id="order-search" type="search" maxlength="40" value="' + escHtml(this.search) + '" ' +
              'placeholder="' + escHtml(t('search_orders')) + '" oninput="PageOrders.onSearch(this.value)">' +
          '</div>' +
        '</div>' +
        '<div id="orders-list"></div>' +
      '</div>';
  },

  setTab: function (id) {
    if (this.tab === id) return;
    this.tab = id;
    this.drawFrame();
    this.load(false);
  },

  onSearch: function (value) {
    var self = this;
    this.search = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(function () { self.load(false); }, 350);
  },

  // more=false: 처음부터, more=true: 이어서 20개 더
  load: async function (more) {
    var token = ++this.loadToken;
    this.loading = true;
    this.error = false;
    if (!more) { this.rows = []; this.hasMore = false; }
    this.drawList();
    try {
      var res = await cncListOrders({ tab: this.tab, search: this.search, offset: more ? this.rows.length : 0 });
      if (token !== this.loadToken) return;
      this.rows = more ? this.rows.concat(res.rows) : res.rows;
      this.hasMore = res.hasMore;

      // 열어 달라고 한 주문이 다른 탭에 있으면 그 탭으로
      if (this.openId && !more) {
        var found = this.rows.some(function (o) { return o.id === PageOrders.openId; });
        if (!found && this.tab === 'progress') {
          this.openId = null;
          this.tab = 'completed';
          this.loading = false;
          this.drawFrame();
          return this.load(false);
        }
        this.openId = null;
      }
    } catch (err) {
      console.error(err);
      if (token !== this.loadToken) return;
      this.error = true;
    }
    this.loading = false;
    this.drawList();
    var opened = document.querySelector('.order-card.open');
    if (opened && !more) opened.scrollIntoView({ block: 'start' });
  },

  drawList: function () {
    var box = document.getElementById('orders-list');
    if (!box) return;
    var self = this;
    var html = '';

    if (this.error) {
      html = '<div class="card"><p class="empty-text error-text"><span aria-hidden="true">⚠</span> ' + escHtml(t('load_error')) + '</p>' +
        '<button type="button" class="btn btn-outline" onclick="PageOrders.load(false)">' + escHtml(t('btn_retry')) + '</button></div>';
    } else if (!this.rows.length && this.loading) {
      html = '<div class="card">' + uiLoading() + '</div>';
    } else if (!this.rows.length) {
      html = '<div class="card"><p class="empty-text">' + escHtml(this.search ? t('search_no_result') : t('orders_empty')) + '</p></div>';
    } else {
      html = '<ul class="order-cards">' + this.rows.map(function (o) { return self.cardHtml(o); }).join('') + '</ul>';
      if (this.hasMore) {
        html += '<div class="load-more"><button type="button" class="btn btn-outline btn-lg" onclick="PageOrders.load(true)"' + (this.loading ? ' disabled' : '') + '>' +
          (this.loading ? escHtml(t('loading')) : escHtml(t('load_more'))) + '</button></div>';
      }
    }
    box.innerHTML = html;
  },

  // ================================================================
  // 주문 카드
  // ================================================================
  cardHtml: function (o) {
    var open = !!this.openIds[o.id];
    var cancelled = o.stage === 'cancelled';
    return '<li class="order-card card' + (open ? ' open' : '') + (cancelled ? ' cancelled' : '') + '" id="order-' + escHtml(o.id) + '">' +
      '<button type="button" class="order-summary" aria-expanded="' + open + '" onclick="PageOrders.toggle(\'' + escHtml(o.id) + '\')">' +
        '<span class="order-top">' +
          '<span class="order-id mono">' + escHtml(o.id) + '</span>' +
          uiStageBadge(o.stage) +
        '</span>' +
        '<span class="order-meta">' +
          '<span><span class="muted">' + escHtml(t('order_date')) + '</span> ' + escHtml(formatDate(o.created_at)) + '</span>' +
          '<span><span class="muted">' + escHtml(t('patient_label')) + '</span> ' + escHtml(o.patient || t('anonymous')) + '</span>' +
          '<span><span class="muted">' + escHtml(t('teeth_label')) + '</span> <span class="mono">' + formatNumber(o.teeth_count) + '</span></span>' +
          '<span><span class="muted">' + escHtml(t('case_deadline_label')) + '</span> ' + escHtml(formatDate(o.deadline)) + '</span>' +
        '</span>' +
        (cancelled ? '' : uiStageBar(o.stage)) +
        '<span class="order-toggle">' + escHtml(open ? t('hide_details') : t('show_details')) + ' <span aria-hidden="true">' + (open ? '▲' : '▼') + '</span></span>' +
      '</button>' +
      (open ? '<div class="order-detail">' + this.detailHtml(o) + '</div>' : '') +
      '</li>';
  },

  toggle: function (id) {
    if (this.openIds[id]) delete this.openIds[id];
    else this.openIds[id] = true;
    this.redrawCard(id);
  },

  redrawCard: function (id) {
    var o = this.rows.filter(function (r) { return r.id === id; })[0];
    var li = document.getElementById('order-' + id);
    if (!o || !li) return;
    var tmp = document.createElement('ul');
    tmp.innerHTML = this.cardHtml(o);
    li.replaceWith(tmp.firstChild);
  },

  // ================================================================
  // 펼친 상세
  // ================================================================
  detailHtml: function (o) {
    var id = escHtml(o.id);
    var busy = !!this.busy[o.id];
    var dis = busy ? ' disabled' : '';
    var html = '';

    // 단계별 할 일
    if (o.stage === 'submitted') {
      html += '<div class="action-box">' +
        '<p>' + escHtml(t('submitted_help')) + '</p>' +
        '<div class="action-row">' +
          '<button type="button" class="btn btn-outline" onclick="PageOrders.openEdit(\'' + id + '\')"' + dis + '>' + escHtml(t('edit_order_btn')) + '</button>' +
          '<button type="button" class="btn btn-outline btn-danger-text" onclick="PageOrders.cancel(\'' + id + '\')"' + dis + '>' + escHtml(t('cancel_order_btn')) + '</button>' +
        '</div></div>';
    }
    if (o.stage === 'confirmed') {
      html += '<div class="action-box"><p>' + escHtml(t('design_waiting')) + '</p></div>';
    }
    if (o.stage === 'design_ready' || o.stage === 'design_revision') {
      var designs = cncOrderDesigns(o);
      html += '<div class="action-box' + (o.stage === 'design_ready' ? ' highlight' : '') + '">' +
        '<h3 class="detail-title">' + escHtml(t('design_review_title')) + '</h3>' +
        (o.stage === 'design_revision' ? '<p>' + escHtml(t('design_revision_pending')) + '</p>' : '<p>' + escHtml(t('design_ready_help')) + '</p>') +
        (designs.length
          ? '<ul class="file-list">' + designs.map(function (dz, i) {
              return '<li class="file-row' + (i < designs.length - 1 ? ' old' : '') + '">' +
                '<span class="file-icon" aria-hidden="true">' + uiFileIcon(dz.name) + '</span>' +
                '<span class="file-info"><span class="file-name">' + escHtml(dz.name) + '</span>' +
                  '<span class="file-size">' + escHtml(dz.date ? formatDateTime(dz.date) : '') + '</span></span>' +
                '<span class="file-actions"><button type="button" class="btn btn-outline btn-sm" onclick="PageOrders.viewDesign(\'' + id + '\', ' + i + ')"><span aria-hidden="true">👁</span> ' + escHtml(t('btn_preview')) + '</button></span>' +
                '</li>';
            }).join('') + '</ul>'
          : '<p class="muted">' + escHtml(t('no_design_files')) + '</p>') +
        (o.stage === 'design_ready'
          ? '<div class="action-row">' +
              '<button type="button" class="btn btn-primary" onclick="PageOrders.approve(\'' + id + '\')"' + dis + '>' + escHtml(t('design_satisfied')) + '</button>' +
              '<button type="button" class="btn btn-outline" onclick="PageOrders.reject(\'' + id + '\')"' + dis + '>' + escHtml(t('design_not_satisfied')) + '</button>' +
            '</div>'
          : '') +
        '</div>';
    }
    if (o.stage === 'approved' || o.stage === 'milling') {
      html += '<div class="action-box"><p>' + escHtml(t('milling_help')) + '</p></div>';
    }
    if (o.stage === 'shipped') {
      html += '<div class="action-box highlight">' +
        '<h3 class="detail-title">' + escHtml(t('shipping_info')) + '</h3>' +
        '<div class="review-row"><span class="review-label">' + escHtml(t('carrier_label')) + '</span><span class="review-value">' + escHtml(o.carrier || '—') + '</span></div>' +
        '<div class="review-row"><span class="review-label">' + escHtml(t('tracking_label')) + '</span><span class="review-value mono">' + escHtml(o.tracking_number || '—') + '</span></div>' +
        '<p>' + escHtml(t('shipped_msg')) + '</p>' +
        '<div class="action-row"><button type="button" class="btn btn-primary" onclick="PageOrders.receive(\'' + id + '\')"' + dis + '>' + escHtml(t('receive_btn')) + '</button></div>' +
        '</div>';
    }
    if (o.stage === 'cancelled') {
      html += '<div class="action-box"><p>' + escHtml(tf('cancelled_help', { n: o.credits_used })) + '</p></div>';
    }

    // 치아 표
    var teeth = cncOrderTeeth(o);
    html += '<h3 class="detail-title">' + escHtml(t('tooth_details')) + '</h3>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>' + escHtml(t('brand_label')) + '</th><th>' + escHtml(t('size_label')) + '</th><th>' + escHtml(t('wiz_shade_label')) + '</th></tr></thead><tbody>' +
      teeth.map(function (tt) {
        return '<tr><td><span class="mono">#' + escHtml(tt.tooth) + '</span> <span class="muted">' + escHtml(isValidTooth(tt.tooth) ? t(toothTypeKey(tt.tooth)) : '') + '</span></td>' +
          '<td>' + escHtml(tt.brand === 'Other' ? t('brand_other') : (tt.brand || '—')) + '</td>' +
          '<td class="mono">' + escHtml(tt.size || '—') + '</td>' +
          '<td>' + uiShadeChip(tt.color) + ' <span class="mono">' + escHtml(tt.color || '—') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';

    // 메모
    var memo = cncOrderMemo(o);
    if (memo) html += '<h3 class="detail-title">' + escHtml(t('memo_label')) + '</h3><p class="pre memo-box">' + escHtml(memo) + '</p>';

    // 파일
    var files = cncOrderFiles(o);
    html += '<h3 class="detail-title">' + escHtml(t('files_label')) + '</h3>';
    html += files.length
      ? '<ul class="file-list">' + files.map(function (f, i) {
          return '<li class="file-row"><span class="file-icon" aria-hidden="true">' + uiFileIcon(f.name) + '</span>' +
            '<span class="file-info"><span class="file-name">' + escHtml(f.name) + '</span></span>' +
            '<span class="file-actions">' + (f.path
              ? '<button type="button" class="btn btn-outline btn-sm" onclick="PageOrders.viewFile(\'' + id + '\', ' + i + ')"><span aria-hidden="true">👁</span> ' + escHtml(t('btn_preview')) + '</button>'
              : '') + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="muted">' + escHtml(t('no_files_yet')) + '</p>';

    // 배송 정보
    html += '<h3 class="detail-title">' + escHtml(t('wiz_delivery_label')) + '</h3>' +
      '<div class="review-row"><span class="review-label">' + escHtml(t('clinic_name')) + '</span><span class="review-value">' + escHtml(o.clinic) + '</span></div>' +
      '<div class="review-row"><span class="review-label">' + escHtml(t('address_label')) + '</span><span class="review-value">' + escHtml(o.addr) + '</span></div>' +
      '<div class="review-row"><span class="review-label">' + escHtml(t('phone_label')) + '</span><span class="review-value mono">' + escHtml(o.phone) + '</span></div>' +
      (o.line_id ? '<div class="review-row"><span class="review-label">' + escHtml(t('line_id_label')) + '</span><span class="review-value">' + escHtml(o.line_id) + '</span></div>' : '') +
      '<div class="review-row"><span class="review-label">' + escHtml(t('credits_use')) + '</span><span class="review-value mono">' + formatNumber(o.credits_used) + '</span></div>';

    // 리뷰 이력
    var history = o.review_history || [];
    if (history.length) {
      html += '<h3 class="detail-title">' + escHtml(t('review_history_label')) + '</h3><ul class="history-list">' +
        history.map(function (h) {
          return '<li><span class="mono muted">' + escHtml(formatDateTime(h.date)) + '</span> · <b>' + escHtml(t('review_' + (h.action || 'note'))) + '</b>' +
            (h.note ? '<p class="pre">' + escHtml(h.note) + '</p>' : '') + '</li>';
        }).join('') + '</ul>';
    }
    return html;
  },

  findRow: function (id) {
    return this.rows.filter(function (r) { return r.id === id; })[0];
  },

  // 주문 하나만 서버에서 다시 읽어서 갱신 (탭이 안 맞으면 목록에서 빼요)
  refreshRow: async function (id) {
    try {
      var fresh = await cncGetOrder(id);
      var idx = this.rows.findIndex(function (r) { return r.id === id; });
      if (idx === -1) return;
      if (!fresh) { this.rows.splice(idx, 1); this.drawList(); return; }
      this.rows[idx] = fresh;
      var belongs = this.tab === 'completed' ? isClosedStage(fresh.stage) : !isClosedStage(fresh.stage);
      if (!belongs) {
        this.rows.splice(idx, 1);
        this.drawList();
      } else {
        this.redrawCard(id);
      }
    } catch (err) {
      console.error(err);
      this.load(false);
    }
  },

  // 버튼 공통: 처리 중 표시 → 실행 → 성공 안내 / 에러 안내
  runAction: async function (id, fn, successKey) {
    if (this.busy[id]) return;
    this.busy[id] = true;
    this.redrawCard(id);
    try {
      var result = await fn();
      uiToast(typeof successKey === 'function' ? successKey(result) : t(successKey), 'success');
      delete this.busy[id];
      await this.refreshRow(id);
      return result;
    } catch (err) {
      console.error(err);
      delete this.busy[id];
      uiToast(uiErrorMessage(err), 'error');
      this.refreshRow(id);
    }
  },

  // ================================================================
  // 파일 보기
  // ================================================================
  viewFile: function (id, i) {
    var o = this.findRow(id);
    var f = o && cncOrderFiles(o)[i];
    if (!f) return;
    cncOpenViewer({ name: f.name, getUrl: function () { return cncOrderFileUrl(f); } });
  },

  viewDesign: function (id, i) {
    var o = this.findRow(id);
    var dz = o && cncOrderDesigns(o)[i];
    if (!dz) return;
    var name = dz.name;
    if (!fileExt(name)) name += '.' + (fileExt(dz.path || dz.url || '') || 'png');
    cncOpenViewer({ name: name, getUrl: function () { return cncDesignUrl(dz); } });
  },

  // ================================================================
  // submitted: 수정 / 취소
  // ================================================================
  openEdit: function (id) {
    var o = this.findRow(id);
    if (!o) return;
    var self = this;
    function field(name, labelKey, value, required, type) {
      return '<div class="field">' +
        '<label class="field-label" for="e-' + name + '">' + escHtml(t(labelKey)) +
          (required ? ' <span class="required">*</span>' : ' <span class="optional">(' + escHtml(t('optional')) + ')</span>') + '</label>' +
        '<input class="input" id="e-' + name + '" type="' + (type || 'text') + '" maxlength="200" value="' + escHtml(value || '') + '"' +
          (type === 'date' ? ' min="' + cncToday() + '"' : '') + '>' +
        '<div class="err-slot" data-err="' + name + '"></div>' +
        '</div>';
    }
    var body = '<p class="modal-text">' + escHtml(t('edit_order_help')) + '</p>' +
      field('patient', 'wiz_patient_label', o.patient, false) +
      field('deadline', 'case_deadline_label', o.deadline, true, 'date') +
      field('clinic', 'clinic_name', o.clinic, true) +
      field('addr', 'address_label', o.addr, true) +
      field('phone', 'phone_label', o.phone, true, 'tel') +
      field('line_id', 'line_id_label', o.line_id, false);

    var modal = uiModal({
      title: t('edit_order_title') + ' · ' + o.id,
      body: body,
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('pe_save'), kind: 'primary', onClick: async function (close, btn) {
          var el = modal.el;
          var v = function (n) { return el.querySelector('#e-' + n).value.trim(); };
          var f = { patient: v('patient'), deadline: v('deadline'), clinic: v('clinic'), addr: v('addr'), phone: v('phone'), line_id: v('line_id') };
          var errs = {};
          if (!f.deadline) errs.deadline = 'err_deadline_required';
          else if (f.deadline < cncToday() && f.deadline !== o.deadline) errs.deadline = 'err_deadline_past';
          ['clinic', 'addr', 'phone'].forEach(function (k) { if (!f[k]) errs[k] = 'err_required'; });
          var slots = el.querySelectorAll('.err-slot');
          for (var i = 0; i < slots.length; i++) {
            var k = slots[i].getAttribute('data-err');
            slots[i].innerHTML = uiFieldError(errs[k]);
            el.querySelector('#e-' + k).classList.toggle('invalid', !!errs[k]);
          }
          if (Object.keys(errs).length) return;
          btn.disabled = true;
          close();
          await self.runAction(o.id, function () { return cncUpdateOrder(o.id, f); }, 'order_updated');
        } }
      ]
    });
  },

  cancel: async function (id) {
    var o = this.findRow(id);
    if (!o) return;
    var ok = await uiConfirm({
      title: t('cancel_order_btn'),
      message: tf('cancel_confirm_msg', { id: o.id, n: o.credits_used }),
      okLabel: t('cancel_order_btn'),
      cancelLabel: t('keep_order'),
      danger: true
    });
    if (!ok) return;
    await this.runAction(id, function () { return cncCancelOrder(id); }, function (balance) {
      if (balance != null) setBalance(balance);
      return tf('order_cancelled_msg', { n: o.credits_used });
    });
  },

  // ================================================================
  // design_ready: 승인 / 수정 요청
  // ================================================================
  approve: async function (id) {
    var ok = await uiConfirm({ title: t('design_satisfied'), message: t('approve_confirm_msg'), okLabel: t('design_satisfied') });
    if (!ok) return;
    await this.runAction(id, function () { return cncCustomerAction(id, 'approve'); }, 'design_approved_msg');
  },

  reject: function (id) {
    var self = this;
    var modal = uiModal({
      title: t('design_not_satisfied'),
      body: '<div class="field"><label class="field-label" for="reject-note">' + escHtml(t('design_reject_label')) + ' <span class="required">*</span></label>' +
        '<textarea class="input textarea" id="reject-note" rows="4" maxlength="1000" placeholder="' + escHtml(t('design_reject_ph')) + '"></textarea>' +
        '<div class="err-slot"></div></div>',
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('design_reject_submit'), kind: 'primary', onClick: async function (close, btn) {
          var ta = modal.el.querySelector('#reject-note');
          var note = ta.value.trim();
          if (!note) {
            ta.classList.add('invalid');
            modal.el.querySelector('.err-slot').innerHTML = uiFieldError('design_reject_required');
            ta.focus();
            return;
          }
          btn.disabled = true;
          close();
          await self.runAction(id, function () { return cncCustomerAction(id, 'reject', note); }, 'design_rejected_msg');
        } }
      ]
    });
  },

  // ================================================================
  // shipped: 수령 완료
  // ================================================================
  receive: async function (id) {
    var ok = await uiConfirm({ title: t('receive_btn'), message: t('receive_confirm_msg'), okLabel: t('receive_btn') });
    if (!ok) return;
    await this.runAction(id, function () { return cncCustomerAction(id, 'receive'); }, 'received_msg');
  }
};
