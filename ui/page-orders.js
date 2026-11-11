// ===== 내 주문 #/orders =====
// - 탭: In Progress / Completed (취소된 주문은 Completed 에 회색으로)
// - 검색: 주문번호 · 환자 ID
// - 주문 카드 (간단하게): 윗줄 주문번호 · 상태 배지 / 둘째 줄 환자 · 치아 수 · 납기 · 접수일
//   / 얇은 진행 줄(7칸) + "현재: 디자인 검토 (3/7)"
//   / 고객이 할 일이 있으면 왼쪽 골드 세로줄 + "다음 할 일: …" + 바로가기 버튼
// - 카드를 누르면 상세가 펼쳐져요: 큰 7단계 진행 막대, 치아 표, 메모, 파일, 배송 정보, 리뷰 이력, 단계별 버튼
// - 진행 중: 할 일 있는 주문 → 납기 빠른 순 (한 번에 모두) / 완료: 최신순, "Load more" 로 20개씩

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
      // "이 주문 열어줘" (홈·완료 화면·LINE 링크 #/orders?id=…) → 진행 중 탭부터 찾아요
      this.openIds[this.openId] = true;
      this.search = '';
      this.tab = 'progress';
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
        lineBannerHtml() +
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
          // 진행 중에 없으면 완료 탭에서 찾아요 (openId 는 그대로 두고 다시 불러요)
          this.tab = 'completed';
          this.loading = false;
          this.drawFrame();
          return this.load(false);
        }
        if (!found && this.tab === 'completed' && !this.search) {
          // 완료 탭 첫 20개에도 없으면 (오래된 주문) 주문번호로 검색해서 보여줘요 — LINE 링크 #/orders?id=… 용
          this.search = this.openId;
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
        '<button type="button" class="btn btn-outline" onclick="PageOrders.load(false)">' + escHtml(t('btn_retry')) + '</button>' + uiContactHelpHtml() + '</div>';
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
    var todo = cncOrderNeedsAction(o);
    var id = escHtml(o.id);
    function meta(labelKey, value) {
      return '<span class="order-meta-item"><span class="muted">' + escHtml(t(labelKey)) + '</span> ' + value + '</span>';
    }
    return '<li class="order-card card' + (open ? ' open' : '') + (cancelled ? ' cancelled' : '') + (todo ? ' has-todo' : '') + '" id="order-' + id + '">' +
      '<button type="button" class="order-summary" aria-expanded="' + open + '" onclick="PageOrders.toggle(\'' + id + '\')">' +
        '<span class="order-top">' +
          '<span class="order-id mono">' + id + '</span>' +
          uiStageBadge(o.stage) +
        '</span>' +
        '<span class="order-meta">' +
          meta('patient_label', escHtml(o.patient || t('anonymous'))) +
          meta('teeth_label', '<span class="mono">' + formatNumber(o.teeth_count) + '</span>') +
          meta('case_deadline_label', uiDeadlineHtml(o)) +   // 승인 전 = 디자인 승인 때 결정
          meta('order_date', escHtml(formatDate(o.created_at))) +
        '</span>' +
        (open || cancelled ? '' : uiStageProgress(o.stage)) +
        '<span class="order-toggle">' + escHtml(open ? t('hide_details') : t('show_details')) + ' <span aria-hidden="true">' + (open ? '▲' : '▼') + '</span></span>' +
      '</button>' +
      (todo && !open ? this.todoRowHtml(o) : '') +
      (open ? '<div class="order-detail">' + (cancelled ? '' : '<div class="order-detail-bar">' + uiStageBar(o.stage) + '</div>') + this.detailHtml(o) + '</div>' : '') +
      '</li>';
  },

  // 다음 할 일 + 바로가기 (카드를 펼치고 할 일 상자로 이동)
  todoRowHtml: function (o) {
    var id = escHtml(o.id);
    var key = o.stage === 'design_ready' ? 'todo_design' : 'todo_receive';
    return '<div class="order-todo">' +
      '<span class="order-todo-text"><span aria-hidden="true">👉</span> ' + escHtml(t('todo_next')) + ': <b>' + escHtml(t(key)) + '</b></span>' +
      '<button type="button" class="btn btn-gold btn-sm" onclick="PageOrders.goTodo(\'' + id + '\')">' + escHtml(t(key + '_btn')) + ' <span class="arrow" aria-hidden="true">→</span></button>' +
      '</div>';
  },

  goTodo: function (id) {
    this.openIds[id] = true;
    this.redrawCard(id);
    var box = document.querySelector('#order-' + CSS.escape(id) + ' .action-box.highlight');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        uiDesignVersions(designs, function (vi, fi) { return "PageOrders.viewDesign('" + o.id + "', " + vi + ', ' + fi + ')'; }) +
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
      '<div class="review-row order-deadline-row"><span class="review-label">' + escHtml(t('case_deadline_label')) + '</span><span class="review-value">' + uiDeadlineHtml(o) + '</span></div>' +
      // 이 주문에 쓴 크레딧: 🎁 무료 n / 💳 충전 n (cnc_orders.bonus_used · credits_used)
      '<div class="review-row order-credits-row"><span class="review-label">' + escHtml(t('credits_use')) + '</span><span class="review-value">' + uiOrderCreditUseHtml(o.credits_used, o.bonus_used) + '</span></div>';

    // 리뷰·처리 이력
    if ((o.review_history || []).length) {
      html += '<h3 class="detail-title">' + escHtml(t('review_history_label')) + '</h3>' + uiHistoryList(o.review_history);
    }
    html += this.inquiryHtml(o);
    return html;
  },

  // 맨 아래 "이 주문 문의하기": 메일 제목에 주문번호 자동 입력 ("[CA261104-0008] 문의")
  // 회사 이메일이 비어 있으면 문의하기 페이지로
  inquiryHtml: function (o) {
    var c = cncContactInfo();
    var link = c.email
      ? '<a class="btn btn-outline" href="' + escHtml(cncMailto(c.email, tf('contact_order_subject', { id: o.id }))) + '"><span aria-hidden="true">✉</span> ' + escHtml(t('contact_this_order')) + '</a>'
      : '<a class="btn btn-outline" href="#/contact"><span aria-hidden="true">💁</span> ' + escHtml(t('contact_this_order')) + '</a>';
    return '<div class="order-inquiry">' +
      '<p class="muted">' + escHtml(t('contact_order_hint')) + '</p>' + link +
      '</div>';
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

  // 디자인 파일 보기 (vi: 버전 순서, fi: 그 버전 안 파일 순서) → cnc-designs 서명 URL
  viewDesign: function (id, vi, fi) {
    var o = this.findRow(id);
    var v = o && cncOrderDesigns(o)[vi];
    var f = v && v.files[fi];
    if (!f) return;
    var name = f.name;
    if (!fileExt(name)) name += '.' + (fileExt(f.path || f.url || '') || 'png');
    cncOpenViewer({ name: name, getUrl: function () { return cncDesignUrl(f); } });
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
        (type === 'date'
          ? uiDateField({ id: 'e-' + name, value: value || '', min: (value && value < cncToday()) ? value : cncToday() })
          : '<input class="input" id="e-' + name + '" type="' + (type || 'text') + '" maxlength="' + (name === 'patient' ? 50 : 200) + '" value="' + escHtml(value || '') + '">') +
        '<div class="err-slot" data-err="' + name + '"></div>' +
        '</div>';
    }
    var body = '<p class="modal-text">' + escHtml(t('edit_order_help')) + '</p>' +
      field('patient', 'wiz_patient_label', o.patient, true) +
      // 납품일은 여기서 못 바꿔요 → 디자인 승인 때 정해요
      '<p class="deadline-later-note"><span aria-hidden="true">📅</span> ' + escHtml(t('deadline_at_approval_note')) + '</p>' +
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
          var v = function (n) {
            var input = el.querySelector('#e-' + n);
            return input.classList.contains('date-field') ? (input.getAttribute('data-value') || '') : input.value.trim();
          };
          var f = { patient: v('patient'), clinic: v('clinic'), addr: v('addr'), phone: v('phone'), line_id: v('line_id') };
          var errs = {};
          if (!f.patient) errs.patient = 'err_patient_required';
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
  // 승인 창: 디자인 버전 요약 + 납품일 선택 (가장 빠른 날 이전은 못 골라요) + 안내 → [승인하고 납품일 확정]
  //   서버(customer_approve_design, sql/012)가 승인 · 납품일 저장 · 기록을 한 번에. 날짜 에러는 칸 바로 아래 빨간 글씨
  approve: async function (id) {
    var self = this;
    var o = this.findRow(id);
    if (!o || this.busy[id]) return;
    var rules = await cncGetDeadlineRules();
    var vers = Array.isArray(o.design_versions) ? o.design_versions : [];
    var last = vers[vers.length - 1];
    var nFiles = last ? ((last.names || last.paths || []).length) : 0;
    var body =
      (last
        ? '<div class="approve-design-box">' +
            '<p class="approve-ver"><span aria-hidden="true">🎨</span> <b>' + escHtml(tf('approve_design_version', { v: last.version || vers.length })) + '</b>' +
              (last.date ? ' <span class="muted">· ' + escHtml(formatDate(last.date)) + '</span>' : '') + '</p>' +
            '<p class="muted">' + escHtml(tf('approve_design_files', { n: nFiles })) + ' · <span class="mono">' + escHtml(o.id) + '</span></p>' +
          '</div>'
        : '') +
      '<div class="field approve-deadline-field">' +
        '<span class="field-label" id="approve-deadline-label">' + escHtml(t('approve_deadline_label')) + ' <span class="required">*</span></span>' +
        uiDateField({ id: 'approve-deadline', min: rules.earliest }) +
        '<p class="field-help">' + escHtml(tf('approve_deadline_help', { date: formatDate(rules.earliest) })) + '</p>' +
        '<div class="err-slot" data-err="deadline"></div>' +
      '</div>' +
      '<p class="approve-warn" role="note"><span aria-hidden="true">⚠</span> ' + escHtml(t('approve_warning')) + '</p>';

    var modal = uiModal({
      title: t('design_satisfied'),
      body: body,
      actions: [
        { label: t('btn_cancel'), kind: 'outline' },
        { label: t('approve_submit'), kind: 'primary', onClick: async function (close, btn) {
          var slot = modal.el.querySelector('[data-err="deadline"]');
          var field = modal.el.querySelector('#approve-deadline');
          function showErr(key, params) {
            slot.innerHTML = key ? uiFieldError(key, params) : '';
            if (field) field.classList.toggle('invalid', !!key);
            if (key && field) field.focus();
          }
          var dl = uiDateValue('approve-deadline');
          if (!dl) return showErr('err_deadline_required');
          if (dl < rules.earliest) return showErr('err_deadline_too_early', { date: formatDate(rules.earliest) });
          showErr('');
          btn.disabled = true;
          self.busy[id] = true;
          try {
            await cncApproveDesign(id, dl);
            delete self.busy[id];
            close();
            uiToast(tf('design_approved_deadline_msg', { date: formatDate(dl) }), 'success');
            await self.refreshRow(id);
          } catch (err) {
            console.error(err);
            delete self.busy[id];
            btn.disabled = false;
            var code = cncErrorCode(err);
            if (code === 'DEADLINE_TOO_EARLY') {
              rules = await cncGetDeadlineRules();   // 그 사이 날짜가 바뀌었거나 최소 일수가 바뀐 경우
              showErr('err_deadline_too_early', { date: formatDate(rules.earliest) });
            } else if (code === 'DEADLINE_REQUIRED') {
              showErr('err_deadline_required');
            } else if (code === 'STAGE_CHANGED') {
              close();
              uiToast(t('err_stage_changed_customer'), 'error');
              self.refreshRow(id);
            } else {
              uiToast(uiErrorMessage(err), 'error');
            }
          }
        } }
      ]
    });
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
