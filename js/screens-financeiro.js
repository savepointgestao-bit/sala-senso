/* Psicólogo: financeiro. Pagamentos, recibos numerados no papel, despesas, A receber (com cobrança pelo WhatsApp), aba Financeiro da ficha
   e extrato do paciente. Valores em centavos; datas AAAA-MM-DD. Só componentes do site, sem innerHTML. */
(function () {
  'use strict';
  var h = UI.h, C = window.Clinic, P = window.PrintDoc, T = UI.dt;
  var S = window.Screens = window.Screens || {};

  var MAX_REAIS = 1000000;
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function txt(s) { return String(s == null ? '' : s).trim(); }
  function fin() { return API.pro.finance; }
  function money(c) { return C.money(c); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function shiftYm(m, n) { var y = +m.slice(0, 4), k = +m.slice(5, 7) - 1 + n; y += Math.floor(k / 12); k = ((k % 12) + 12) % 12; return y + '-' + pad(k + 1); }
  function monthRange(m) { return [m + '-01', m + '-' + pad(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate())]; }
  function dm(day) { return String(day).slice(8, 10) + '/' + String(day).slice(5, 7); }
  function sessionsText(n) { var t = String(n).replace('.', ','); return t === '0' ? 'sem sessões ligadas' : (t === '1' ? '1 sessão' : t + ' sessões'); }
  function stat(value, label, tone) { return h('div', { class: 'stat' + (tone ? ' ' + tone : '') }, h('b', null, value), h('span', null, label)); }
  function failBox(box, e, tag) { Diag.error(tag, e); clear(box); box.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível carregar agora. Atualize a página.'))); }
  function isVerifiedPro(ctx) { return !!(ctx.me.professional && ctx.me.professional.verification === 'verified'); }
  function pageLock(ctx, active, title, sub) {
    var pro = ctx.me.professional || {};
    return S.shell(ctx, active, [UI.pageHead(title, sub), S.crpNotice(pro.verification), UI.empty('lock', 'Libera quando o seu CRP for confirmado', 'Enquanto isso, você pode explorar o resto do Senso.')]);
  }
  S.proLock = function (ctx, active, title, sub) { return isVerifiedPro(ctx) ? null : pageLock(ctx, active, title, sub); };

  /* ---------------------------------------------------------------- planilha (CSV com ponto e vírgula, abre direto no Excel em português) */
  function csvNum(v) { var s = String(v == null ? '' : v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csvText(v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return csvNum(s); }
  function csvMoney(c) { return ((c || 0) / 100).toFixed(2).replace('.', ','); }
  function saveCsv(name, rows) {
    var text = '﻿' + rows.map(function (r) { return r.join(';'); }).join('\r\n');
    if (window.Native && Native.saveFile) {
      try { UI.toast('Planilha salva em ' + Native.saveFile(name, 'text/csv', text), 'circle-check'); } catch (e) { Diag.error('salvar-planilha', e); UI.toast('Não deu para salvar a planilha.'); }
      return;
    }
    try {
      var url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      var a = h('a', { href: url, download: name });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      UI.toast('Planilha baixada.', 'circle-check');
    } catch (e) { Diag.error('baixar-planilha', e); UI.toast('Não deu para baixar a planilha.'); }
  }
  S.financeCsv = { num: csvNum, text: csvText, money: csvMoney, save: saveCsv };

  /* ---------------------------------------------------------------- cobrança pelo WhatsApp */
  function chargeText(name, count, cents, proName) {
    return 'Olá, ' + UI.firstName(name) + '! Tudo bem? Passando para combinar o pagamento de ' + (count === 1 ? '1 sessão' : count + ' sessões') + ' (' + money(cents) + ').' + (proName ? '\nObrigado(a)!\n' + proName : '');
  }
  function chargeLink(phone, name, count, cents, ctx, cls) {
    var link = phone ? UI.waLink(phone, chargeText(name, count, cents, ctx.me.profile.full_name)) : null;
    return link ? h('a', { class: cls || 'btn ghost auto sm', href: link, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 16), 'Cobrar no WhatsApp') : null;
  }

  /* ---------------------------------------------------------------- pequena janela com motivo (cancelar recibo) */
  function reasonSheet(o) {
    var reason = UI.field({ label: o.label || 'Motivo', type: 'textarea', optional: true, rows: 3, maxlength: 200, placeholder: o.placeholder || '' });
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button(o.ok, { type: 'submit', variant: o.danger ? 'danger' : null }), sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general); UI.busy(btn, true);
      o.run(txt(reason.value())).then(function () { sh.close('done'); UI.toast(o.done, 'circle-check'); if (o.after) o.after(); })
        .catch(function (e) { UI.busy(btn, false); Diag.error(o.tag, e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível agora. Tente de novo.'))); });
    } }, o.text ? h('p', { class: 'muted' }, o.text) : null, reason.el, general, btn);
    sh = UI.sheet({ title: o.title, content: form });
    return sh;
  }

  /* ---------------------------------------------------------------- campos do recibo (quem pagou, CPF, referente, beneficiário)
     o.ben = true mostra o beneficiário (o paciente, quando quem paga é outra pessoa). */
  function receiptFields(o) {
    o = o || {};
    var payer = UI.field({ label: 'Nome de quem pagou', maxlength: 120, autocapitalize: 'words' });
    var payerDoc = C.docField({ label: 'CPF ou CNPJ de quem pagou', optional: true });
    var ref = UI.field({ label: 'Referente a', maxlength: 200, value: 'Sessões de psicoterapia' });
    var benName = o.ben ? UI.field({ label: 'Nome do paciente (beneficiário)', optional: true, maxlength: 120, autocapitalize: 'words', hint: 'Preencha quando quem paga não é o paciente.' }) : null;
    var benDoc = o.ben ? C.cpfField({ label: 'CPF do paciente', optional: true }) : null;
    var el = h('div', null, payer.el, payerDoc.el, ref.el, benName ? benName.el : null, benDoc ? benDoc.el : null);
    function setDefaults(d) {
      d = d || {};
      payer.input.value = d.payer_name || '';
      payerDoc.input.value = d.payer_cpf ? C.maskDoc(d.payer_cpf) : '';
      ref.input.value = d.referente || 'Sessões de psicoterapia';
      if (benName) { benName.input.value = d.beneficiary_name || ''; benDoc.input.value = d.beneficiary_cpf ? C.maskCpf(d.beneficiary_cpf) : ''; }
    }
    function validate() {
      var bads = [];
      if (!txt(payer.value())) { payer.setError('Informe quem pagou.'); bads.push(payer.input); }
      if (txt(payerDoc.value()) && !C.validDoc(payerDoc.value())) { payerDoc.setError('Confira o CPF ou CNPJ.'); bads.push(payerDoc.input); }
      if (benDoc && txt(benDoc.value()) && !C.validCpf(benDoc.value())) { benDoc.setError('Confira o CPF.'); bads.push(benDoc.input); }
      return bads;
    }
    function values() {
      var v = { payer_name: txt(payer.value()) || null, payer_cpf: C.digits(payerDoc.value()) || null, referente: txt(ref.value()) || null };
      if (benName) { v.beneficiary_name = txt(benName.value()) || null; v.beneficiary_cpf = v.beneficiary_name ? (C.digits(benDoc.value()) || null) : null; }
      return v;
    }
    return { el: el, setDefaults: setDefaults, validate: validate, values: values };
  }

  /* ---------------------------------------------------------------- recibo no papel */
  S.receiptDocument = function (rc, st) {
    var kids = [];
    var who = [rc.payer_name, rc.payer_cpf ? 'CPF/CNPJ ' + C.maskDoc(rc.payer_cpf) : ''];
    kids.push(h('div', { class: 'doc-head' }, h('div', null, h('h1', null, 'RECIBO'), h('div', { class: 'doc-no' }, 'Nº ' + rc.number)), h('div', { class: 'doc-val' }, money(rc.amount_cents))));
    kids.push(h('p', null, 'Recebi de ', h('b', null, who[0]), who[1] ? ', ' + who[1] : '', ', a quantia de ', h('b', null, money(rc.amount_cents)), ' (', h('i', null, C.moneyWords(rc.amount_cents)), '), referente a ', h('b', null, rc.referente || 'Sessões de psicoterapia'), '.'));
    if (rc.beneficiary_name) kids.push(h('p', null, 'Paciente (beneficiário(a) do atendimento): ', h('b', null, rc.beneficiary_name), rc.beneficiary_cpf ? ', CPF ' + C.maskCpf(rc.beneficiary_cpf) : '', '.'));
    kids.push(h('p', null, 'Forma de pagamento: ' + C.methodLabel(rc.method).toLowerCase() + '. Data do pagamento: ' + UI.fmtDate(rc.issued_on) + '.'));
    kids.push(h('p', null, 'Para maior clareza, firmo o presente.'));
    kids.push(P.cityDate(st, rc.issued_on));
    kids.push(P.signature(st));
    kids.push(P.foot(st, st && st.receipt_footer));
    if (rc.canceled) kids.unshift(h('div', { class: 'stamp', 'aria-hidden': 'true' }, 'CANCELADO'));
    var paper = P.paper(kids.filter(Boolean));
    paper.classList.add('wm');
    return paper;
  };
  function receiptText(rc, st) {
    st = st || {};
    return 'RECIBO Nº ' + rc.number + (rc.canceled ? ' (CANCELADO)' : '') + '\n\nRecebi de ' + rc.payer_name + (rc.payer_cpf ? ' (CPF/CNPJ ' + C.maskDoc(rc.payer_cpf) + ')' : '') +
      ' a quantia de ' + money(rc.amount_cents) + ' (' + C.moneyWords(rc.amount_cents) + '), referente a ' + (rc.referente || 'Sessões de psicoterapia') + '.\n' +
      (rc.beneficiary_name ? 'Paciente: ' + rc.beneficiary_name + '.\n' : '') +
      'Forma de pagamento: ' + C.methodLabel(rc.method).toLowerCase() + '. Data: ' + UI.fmtDate(rc.issued_on) + '.\n\n' +
      (st.name || '') + (st.crp ? '\nCRP ' + st.crp : '') + (st.document ? '\nCPF/CNPJ ' + C.maskDoc(st.document) : '');
  }

  /* Abre o recibo. o.onChange() avisa quem chamou quando cancelar ou reativar. */
  S.receiptSheet = function (id, o) {
    o = o || {};
    var body = h('div', null, UI.loading()), sh = UI.sheet({ title: 'Recibo', wide: true, content: body });
    Promise.all([fin().receipt(id), API.pro.settings()]).then(function (r) {
      sh.close('swap');
      var rc = r[0], st = r[1], pv = null;
      var text = receiptText(rc, st);
      var extra = [UI.button('Copiar texto', { variant: 'ghost', icon: 'copy', onclick: function () { UI.copyText(text).then(function () { UI.toast('Texto copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar.'); }); } })];
      var wa = rc.phone ? UI.waLink(rc.phone, text) : null;
      if (wa) extra.push(h('a', { class: 'btn ghost', href: wa, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), 'Enviar pelo WhatsApp'));
      function again() { if (o.onChange) o.onChange(); S.receiptSheet(id, o); }
      if (!rc.canceled) extra.push(UI.button('Cancelar recibo', { variant: 'ghost', onclick: function () {
        pv.close('go');
        reasonSheet({ title: 'Cancelar o recibo ' + rc.number, text: 'O número não é reaproveitado: o recibo fica na lista como cancelado, com a marca no papel. Se precisar, dá para reativar depois.', label: 'Motivo (opcional)',
          placeholder: 'Ex.: valor errado.', ok: 'Cancelar recibo', danger: true, run: function (why) { return fin().cancelReceipt(id, why); }, done: 'Recibo cancelado.', tag: 'cancelar-recibo', after: again });
      } }));
      else extra.push(UI.button('Reativar recibo', { variant: 'ghost', onclick: function () {
        UI.busy(this, true);
        var self = this;
        fin().reactivateReceipt(id).then(function () { pv.close('go'); UI.toast('Recibo reativado.', 'circle-check'); again(); })
          .catch(function (e) { UI.busy(self, false); Diag.error('reativar-recibo', e); UI.toast(UI.errorText(e)); });
      } }));
      pv = P.preview('Recibo ' + rc.number, S.receiptDocument(rc, st), extra);
      if (rc.canceled && rc.cancel_reason) pv.body.insertBefore(UI.notice('warn', 'Cancelado' + (rc.cancel_reason ? ': ' + rc.cancel_reason : '.')), pv.body.firstChild);
    }).catch(function (e) { Diag.error('recibo', e); clear(body); body.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível abrir o recibo agora. Tente de novo.'))); });
    return sh;
  };

  /* Emite o recibo de um pagamento que ainda não tem. o.payment, o.name, o.onDone() */
  S.receiptCreateSheet = function (o) {
    var pay = o.payment, rf = receiptFields({ ben: true }), general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Emitir recibo', { type: 'submit' }), sh;
    btn.disabled = true;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = rf.validate();
      if (bads.length) { S.focusFirst(bads); return; }
      UI.busy(btn, true);
      var p = rf.values(); p.payment_id = pay.id;
      fin().createReceipt(p).then(function (r) {
        sh.close('done'); UI.toast('Recibo ' + r.number + ' emitido.', 'circle-check');
        if (o.onDone) o.onDone();
        S.receiptSheet(r.id, { onChange: o.onDone });
      }).catch(function (e) { UI.busy(btn, false); Diag.error('emitir-recibo', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível emitir agora. Tente de novo.'))); });
    } }, h('p', { class: 'muted' }, 'Pagamento de ' + money(pay.amount_cents) + ' em ' + UI.fmtDate(pay.paid_on) + (o.name ? ', ' + o.name : '') + '.'), rf.el, general, btn);
    sh = UI.sheet({ title: 'Emitir recibo', content: form });
    fin().context(pay.record_id).then(function (c) { rf.setDefaults(c); btn.disabled = false; })
      .catch(function (e) { Diag.error('contexto-recibo', e); btn.disabled = false; });
    return sh;
  };

  /* Recibo avulso: sem pagamento ligado (ex.: pagamento antigo ou de alguém que não é paciente cadastrado). */
  S.receiptNewSheet = function (o) {
    o = o || {};
    var today = UI.today(), rf = receiptFields({ ben: true }), general = h('div', { 'aria-live': 'polite' }), X = { rec: null };
    var who = UI.field({ label: 'Paciente', type: 'select', optional: true, options: [['', 'Sem paciente cadastrado']] });
    var amount = UI.field({ label: 'Valor', inputmode: 'decimal', placeholder: '150,00', maxlength: 12 });
    var date = UI.field({ label: 'Data do pagamento', type: 'date', max: today, min: '2000-01-01', value: today });
    var method = UI.field({ label: 'Forma de pagamento', type: 'select', options: [['', 'Não informada']].concat(C.PAY_METHODS), value: 'pix' });
    var btn = UI.button('Emitir recibo', { type: 'submit' }), sh;
    who.input.addEventListener('change', function () {
      X.rec = who.value() || null;
      if (X.rec) fin().context(X.rec).then(function (c) { rf.setDefaults(c); if (!txt(amount.value()) && c.price_cents) amount.input.value = C.moneyText(c.price_cents); }).catch(function () { /* sem sugestão */ });
    });
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [], cents = C.parseMoney(amount.value(), MAX_REAIS);
      if (cents == null || isNaN(cents) || cents < 1) { amount.setError(cents == null ? 'Digite o valor.' : 'Confira o valor.'); bads.push(amount.input); }
      if (!date.value() || date.value() > today || date.value() < '2000-01-01') { date.setError('Escolha a data do pagamento.'); bads.push(date.input); }
      rf.validate().forEach(function (n) { bads.push(n); });
      if (bads.length) { S.focusFirst(bads); return; }
      UI.busy(btn, true);
      var p = rf.values(); p.amount_cents = cents; p.issued_on = date.value(); p.method = method.value() || null; if (X.rec) p.record_id = X.rec;
      fin().createReceipt(p).then(function (r) {
        sh.close('done'); UI.toast('Recibo ' + r.number + ' emitido.', 'circle-check');
        if (o.onDone) o.onDone();
        S.receiptSheet(r.id, { onChange: o.onDone });
      }).catch(function (e) { UI.busy(btn, false); Diag.error('recibo-avulso', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível emitir agora. Tente de novo.'))); });
    } }, h('p', { class: 'muted' }, 'Use para emitir um recibo sem registrar um pagamento no financeiro.'), who.el, h('div', { class: 'grid2' }, amount.el, date.el), method.el, rf.el, general, btn);
    sh = UI.sheet({ title: 'Recibo avulso', content: form });
    API.pro.patients().then(function (list) {
      list.filter(function (p) { return !p.transferred_at; }).forEach(function (p) { who.input.appendChild(h('option', { value: p.record_id }, p.social_name || p.full_name)); });
      if (o.record) { who.input.value = o.record.id; who.input.dispatchEvent(new Event('change')); }
    }).catch(function () { /* continua sem a lista */ });
    return sh;
  };

  /* ---------------------------------------------------------------- pagamento: registrar, editar, apagar
     o.record = { id, name } (paciente já escolhido) | o.payment = pagamento existente | o.preset = { cents, sessions, appointment_id } | o.onDone() */
  S.paymentSheet = function (o) {
    o = o || {};
    var pay = o.payment || null, rec = o.record || (pay ? { id: pay.record_id, name: pay.name || '' } : null), preset = o.preset || {};
    var today = UI.today(), X = { recordId: rec ? rec.id : null, ctx: null, touched: !!pay, ready: !!pay };
    var body = h('div', null, UI.loading()), sh = UI.sheet({ title: pay ? 'Pagamento' : 'Novo pagamento', content: body });
    var liveReceipt = !!(pay && pay.receipt && !pay.receipt.canceled), byAppt = !!(pay && pay.appointment_id);

    function build(patients) {
      clear(body);
      var who = null;
      if (!rec) {
        who = UI.field({ label: 'Paciente', type: 'select', required: true, options: [['', 'Escolha o paciente']].concat(patients.filter(function (p) { return !p.transferred_at; }).map(function (p) { return [p.record_id, p.social_name || p.full_name]; })) });
        who.input.addEventListener('change', function () { X.recordId = who.value() || null; X.ready = false; sync(); if (X.recordId) loadCtx(); else { X.ctx = null; apply(); } });
      }
      var apptSel = UI.field({ label: 'Consulta que está sendo paga', type: 'select', optional: true, options: [['', 'Nenhuma: pagamento avulso ou de pacote']] });
      var amount = UI.field({ label: 'Valor recebido', inputmode: 'decimal', placeholder: '150,00', maxlength: 12, value: pay ? C.moneyText(pay.amount_cents) : (preset.cents ? C.moneyText(preset.cents) : '') });
      var sessions = UI.field({ label: 'Sessões que esse valor paga', inputmode: 'decimal', maxlength: 6, value: pay ? String(pay.sessions).replace('.', ',') : (preset.sessions ? String(preset.sessions) : '1') });
      var priceNote = h('p', { class: 'small muted' });
      var method = UI.field({ label: 'Forma de pagamento', type: 'select', options: [['', 'Não informada']].concat(C.PAY_METHODS), value: pay ? (pay.method || '') : 'pix' });
      var date = UI.field({ label: 'Data do pagamento', type: 'date', required: true, max: today, min: '2000-01-01', value: pay ? pay.paid_on : today });
      var note = UI.field({ label: 'Observação', optional: true, maxlength: 200, value: pay ? pay.note || '' : '' });
      if (liveReceipt) { amount.input.disabled = true; date.input.disabled = true; }
      var receipt = pay ? null : UI.checkbox({ label: 'Emitir recibo deste pagamento' });
      var rf = receiptFields({ ben: true });
      var rbox = h('div', { class: 'hide' }, h('p', { class: 'small muted' }, 'Confira os dados do recibo. Eles vêm da ficha do paciente.'), rf.el);
      if (receipt) receipt.input.addEventListener('change', function () { rbox.classList.toggle('hide', !receipt.checked()); });
      var general = h('div', { 'aria-live': 'polite' });
      var btn = UI.button(pay ? 'Salvar' : 'Registrar pagamento', { type: 'submit' });

      function sync() { btn.disabled = !X.ready; }
      function autoSessions() {
        if (X.touched || apptSel.value() || byAppt) return;
        var cents = C.parseMoney(amount.value(), MAX_REAIS), price = X.ctx && X.ctx.price_cents;
        if (cents > 0) sessions.input.value = String(price > 0 ? Math.max(1, Math.round(cents / price)) : 1);
      }
      function onAppt() {
        var id = apptSel.value(), a = X.ctx && X.ctx.pending_appointments ? X.ctx.pending_appointments.filter(function (x) { return x.id === id; })[0] : null;
        sessions.el.classList.toggle('hide', !!id || byAppt);
        if (a) amount.input.value = C.moneyText(a.price_cents); else autoSessions();
      }
      function apply() {
        var c = X.ctx;
        priceNote.textContent = c ? (c.price_cents > 0 ? 'Valor da sessão: ' + money(c.price_cents) + '. O Senso usa isso para ver quais sessões ficam pagas.' : 'Esse paciente está sem valor de sessão. Coloque o valor na ficha para o Senso calcular o que está pago.') : '';
        clear(apptSel.input);
        apptSel.input.appendChild(h('option', { value: '' }, 'Nenhuma: pagamento avulso ou de pacote'));
        var list = c && !pay ? c.pending_appointments || [] : [];
        list.forEach(function (a) { apptSel.input.appendChild(h('option', { value: a.id }, UI.fmtDate(T.dayOf(a.starts_at)) + ' às ' + T.hmOf(a.starts_at) + ', ' + money(a.price_cents))); });
        apptSel.el.classList.toggle('hide', !list.length);
        if (preset.appointment_id && list.some(function (a) { return a.id === preset.appointment_id; })) apptSel.input.value = preset.appointment_id;
        if (c && receipt && !X.receiptSet) { receipt.input.checked = !!c.receipt_auto; rbox.classList.toggle('hide', !receipt.checked()); }
        if (c) { rf.setDefaults(c); X.receiptSet = true; }
        onAppt();
      }
      function loadCtx() {
        if (!X.recordId) return;
        var rid = X.recordId;
        fin().context(rid).then(function (c) { if (rid !== X.recordId) return; X.ctx = c; X.ready = true; sync(); apply(); })
          .catch(function (e) { Diag.error('contexto-pagamento', e); X.ready = true; sync(); });
      }
      X.reload = loadCtx;
      apptSel.input.addEventListener('change', onAppt);
      amount.input.addEventListener('input', autoSessions);
      sessions.input.addEventListener('input', function () { X.touched = true; });

      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); clear(general);
        var bads = [], cents = C.parseMoney(amount.value(), MAX_REAIS), apptId = apptSel.value() || (pay && pay.appointment_id) || null, sv = null;
        if (who && !X.recordId) { who.setError('Escolha o paciente.'); bads.push(who.input); }
        if (!liveReceipt && (cents == null || isNaN(cents) || cents < 1)) { amount.setError(cents == null ? 'Digite o valor recebido.' : 'Confira o valor.'); bads.push(amount.input); }
        if (!apptId) {
          sv = Number(txt(sessions.value()).replace(',', '.'));
          if (!txt(sessions.value()) || !isFinite(sv) || sv < 0 || sv > 500) { sessions.setError('Confira o número de sessões (de 0 a 500).'); bads.push(sessions.input); }
        }
        if (!liveReceipt && (!date.value() || date.value() > today || date.value() < '2000-01-01')) { date.setError('Escolha a data do pagamento.'); bads.push(date.input); }
        var wantReceipt = !!(receipt && receipt.checked());
        if (wantReceipt) rf.validate().forEach(function (n) { bads.push(n); });
        if (bads.length) { S.focusFirst(bads); return; }
        var p = { paid_on: date.value(), amount_cents: liveReceipt ? pay.amount_cents : cents, method: method.value() || null, note: txt(note.value()) || null };
        if (sv != null) p.sessions = Math.round(sv * 100) / 100;
        if (pay) p.id = pay.id; else { p.record_id = X.recordId; if (apptId) p.appointment_id = apptId; if (wantReceipt) p.receipt = rf.values(); }
        UI.busy(btn, true);
        fin().savePayment(p).then(function (r) {
          sh.close('done');
          UI.toast(pay ? 'Pagamento salvo.' : (r.receipt ? 'Pagamento registrado. Recibo ' + r.receipt.number + ' emitido.' : 'Pagamento registrado.'), 'circle-check');
          if (o.onDone) o.onDone();
          if (r.receipt) S.receiptSheet(r.receipt.id, { onChange: o.onDone });
        }).catch(function (e) { UI.busy(btn, false); Diag.error('salvar-pagamento', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.'))); });
      } },
        who ? who.el : h('p', { class: 'lead mb16' }, rec.name || ''),
        liveReceipt ? UI.notice('info', 'Esse pagamento tem recibo. Para mudar o valor ou a data, cancele o recibo antes.') : null,
        byAppt ? UI.notice('info', 'Pagamento de uma consulta específica.') : null,
        apptSel.el, h('div', { class: 'grid2' }, amount.el, date.el), sessions.el, priceNote, method.el, note.el,
        receipt ? receipt.el : null, rbox, general, btn);
      body.appendChild(form);

      if (pay) {
        sessions.el.classList.toggle('hide', byAppt);
        var acts = [];
        if (pay.receipt) acts.push(UI.button('Ver recibo ' + pay.receipt.number + (pay.receipt.canceled ? ' (cancelado)' : ''), { variant: 'ghost', icon: 'receipt', onclick: function () { sh.close('go'); S.receiptSheet(pay.receipt.id, { onChange: o.onDone }); } }));
        if (!liveReceipt) acts.push(UI.button('Emitir recibo', { variant: 'ghost', icon: 'receipt', onclick: function () { sh.close('go'); S.receiptCreateSheet({ payment: pay, name: rec.name, onDone: o.onDone }); } }));
        if (!liveReceipt) acts.push(UI.button('Apagar pagamento', { variant: 'ghost', onclick: function () {
          UI.confirmBox({ title: 'Apagar este pagamento?', text: 'O valor sai do financeiro e as sessões que ele cobria voltam a ficar sem pagamento.', ok: 'Apagar', danger: true }).then(function (yes) {
            if (!yes) return;
            return fin().deletePayment(pay.id).then(function () { sh.close('done'); UI.toast('Pagamento apagado.', 'circle-check'); if (o.onDone) o.onDone(); });
          }).catch(function (e) { Diag.error('apagar-pagamento', e); UI.toast(UI.errorText(e)); });
        } }));
        body.appendChild(h('div', { class: 'btn-row mt16' }, acts));
        acts.forEach(function (b) { if (/Apagar/.test(b.getAttribute('data-label') || '')) b.classList.add('danger-link'); });
      } else {
        sync();
        if (X.recordId) loadCtx(); else apply();
      }
    }

    if (rec || pay) build([]);
    else API.pro.patients().then(build).catch(function (e) { Diag.error('pacientes-pagamento', e); clear(body); body.appendChild(UI.notice('bad', 'Não foi possível carregar os pacientes agora.')); });
    return sh;
  };

  /* ---------------------------------------------------------------- despesa */
  S.expenseSheet = function (o) {
    o = o || {};
    var ex = o.expense || null, today = UI.today(), maxDay = T.addDays(today, 31);
    var desc = UI.field({ label: 'Descrição', maxlength: 120, value: ex ? ex.description : '', placeholder: 'Ex.: aluguel da sala', autocapitalize: 'sentences' });
    var amount = UI.field({ label: 'Valor', inputmode: 'decimal', placeholder: '800,00', maxlength: 12, value: ex ? C.moneyText(ex.amount_cents) : '' });
    var date = UI.field({ label: 'Data', type: 'date', required: true, max: maxDay, min: '2000-01-01', value: ex ? ex.paid_on : today });
    var cat = UI.field({ label: 'Categoria', type: 'select', options: C.EXPENSE_CATS, value: ex ? ex.category : 'rent' });
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button(ex ? 'Salvar' : 'Registrar despesa', { type: 'submit' }), sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [], cents = C.parseMoney(amount.value(), MAX_REAIS);
      if (!txt(desc.value())) { desc.setError('Descreva a despesa.'); bads.push(desc.input); }
      if (cents == null || isNaN(cents) || cents < 1) { amount.setError(cents == null ? 'Digite o valor.' : 'Confira o valor.'); bads.push(amount.input); }
      if (!date.value() || date.value() > maxDay || date.value() < '2000-01-01') { date.setError('Escolha uma data válida.'); bads.push(date.input); }
      if (bads.length) { S.focusFirst(bads); return; }
      var p = { description: txt(desc.value()), amount_cents: cents, paid_on: date.value(), category: cat.value() };
      if (ex) p.id = ex.id;
      UI.busy(btn, true);
      fin().saveExpense(p).then(function () { sh.close('done'); UI.toast(ex ? 'Despesa salva.' : 'Despesa registrada.', 'circle-check'); if (o.onDone) o.onDone(); })
        .catch(function (e) { UI.busy(btn, false); Diag.error('salvar-despesa', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.'))); });
    } }, desc.el, h('div', { class: 'grid2' }, amount.el, date.el), cat.el, general, btn);
    var kids = [form];
    if (ex) kids.push(h('div', { class: 'btn-row mt16' }, UI.button('Apagar despesa', { variant: 'ghost', onclick: function () {
      UI.confirmBox({ title: 'Apagar esta despesa?', text: 'Ela sai do resultado do mês.', ok: 'Apagar', danger: true }).then(function (yes) {
        if (!yes) return;
        return fin().deleteExpense(ex.id).then(function () { sh.close('done'); UI.toast('Despesa apagada.', 'circle-check'); if (o.onDone) o.onDone(); });
      }).catch(function (e) { Diag.error('apagar-despesa', e); UI.toast(UI.errorText(e)); });
    } })));
    sh = UI.sheet({ title: ex ? 'Despesa' : 'Nova despesa', content: kids });
    return sh;
  };

  /* ---------------------------------------------------------------- linhas de lista */
  function receiptBadge(rc) {
    return rc ? h('span', { class: 'badge ' + (rc.canceled ? 'bad' : 'soft') }, UI.svg('receipt', 12), rc.canceled ? 'Recibo ' + rc.number + ' cancelado' : 'Recibo ' + rc.number) : null;
  }
  function payRow(p, o) {
    var sess = p.appointment_id ? 'Uma consulta' : sessionsText(p.sessions);
    var sub = [UI.fmtDate(p.paid_on)].concat(o.name ? [C.methodLabel(p.method)] : [sess]).concat(o.name ? [sess] : []).concat(p.note ? [p.note] : []);
    return h('button', { type: 'button', class: 'item', onclick: o.onClick },
      h('span', { class: 'ico-box' }, UI.svg('wallet', 20)),
      h('span', { class: 'grow' }, h('span', { class: 't' }, o.name ? p.name : C.methodLabel(p.method)), h('span', { class: 's' }, sub.join(' · ')), receiptBadge(p.receipt)),
      h('span', { class: 'amt' }, money(p.amount_cents)));
  }

  /* ---------------------------------------------------------------- tela Financeiro */
  S.finance = function (ctx, q) {
    if (!isVerifiedPro(ctx)) return pageLock(ctx, 'financeiro', 'Financeiro', 'Pagamentos, recibos e despesas');
    var thisMonth = UI.today().slice(0, 7);
    var month = /^\d{4}-(0[1-9]|1[0-2])$/.test((q && q.m) || '') ? q.m : thisMonth;
    if (month > thisMonth) month = thisMonth;
    var TABS = ['recebido', 'receber', 'recibos', 'despesas'];
    var tab = TABS.indexOf(q && q.aba) >= 0 ? q.aba : 'recebido';
    var SM = null, holder = h('div', null, UI.loading());
    var rep = h('a', { class: 'btn ghost auto sm', href: '#/relatorios' }, UI.svg('chart-column', 18), 'Relatórios');
    var node = S.shell(ctx, 'financeiro', [UI.pageHead('Financeiro', 'Pagamentos, recibos e despesas', rep), holder]);

    function load() {
      fin().summary(month + '-01').then(function (s) { SM = s; draw(); }).catch(function (e) { failBox(holder, e, 'financeiro'); });
    }
    function pct(now, before) { return before > 0 ? Math.round((now - before) / before * 100) : null; }

    function receivedPanel() {
      var box = h('div', null, UI.loading()), r = monthRange(month);
      fin().payments(r[0], r[1]).then(function (list) {
        clear(box);
        var acts = h('div', { class: 'btn-row compact mb16' }, UI.button('Novo pagamento', { icon: 'plus', onclick: function () { S.paymentSheet({ onDone: load }); } }),
          list.length ? UI.button('Baixar planilha', { variant: 'ghost', icon: 'download', onclick: function () {
            var rows = [['Data', 'Paciente', 'Forma', 'Sessões', 'Valor (R$)', 'Recibo', 'Observação']].concat(list.slice().sort(function (a, b) { return a.paid_on < b.paid_on ? -1 : 1; }).map(function (p) {
              return [UI.fmtDate(p.paid_on), csvText(p.name), C.methodLabel(p.method), String(p.sessions).replace('.', ','), csvMoney(p.amount_cents), p.receipt ? p.receipt.number + (p.receipt.canceled ? ' (cancelado)' : '') : '', csvText(p.note || '')];
            }));
            saveCsv('senso-recebido-' + month + '.csv', rows);
          } }) : null);
        box.appendChild(acts);
        if (!list.length) { box.appendChild(UI.empty('wallet', 'Nenhum pagamento em ' + T.MONTHS[+month.slice(5, 7) - 1], 'Quando você registrar um pagamento, ele aparece aqui e entra no total do mês.')); return; }
        box.appendChild(h('div', { class: 'group' }, list.map(function (p) { return payRow(p, { name: true, onClick: function () { S.paymentSheet({ payment: p, record: { id: p.record_id, name: p.name }, onDone: load }); } }); })));
        if (SM.by_method.length) {
          box.appendChild(h('section', { class: 'card mt16' }, h('h2', null, 'Como você recebeu'),
            Charts.bars(SM.by_method.map(function (m) { return { label: C.methodLabel(m.method), value: m.cents }; }), { max: SM.by_method[0].cents, fmt: money, label: 'Recebido por forma de pagamento' })));
        }
      }).catch(function (e) { failBox(box, e, 'financeiro-recebido'); });
      return box;
    }

    function pendingPanel() {
      var box = h('div', null, UI.loading());
      fin().pending().then(function (list) {
        clear(box);
        if (!list.length) { box.appendChild(UI.empty('circle-check', 'Tudo em dia', 'Nenhuma sessão realizada está sem pagamento.')); return; }
        var total = list.reduce(function (n, x) { return n + x.cents; }, 0), count = list.reduce(function (n, x) { return n + x.count; }, 0);
        box.appendChild(UI.notice('warn', h('span', null, h('b', null, money(total)), ' a receber: ' + count + (count === 1 ? ' sessão' : ' sessões') + ' de ' + list.length + (list.length === 1 ? ' paciente.' : ' pacientes.'))));
        list.forEach(function (x) {
          var dates = x.dates.map(dm).join(', ') + (x.count > x.dates.length ? '...' : '');
          var rec = h('button', { type: 'button', class: 'btn auto sm', onclick: function () { S.paymentSheet({ record: { id: x.record_id, name: x.name }, preset: { cents: x.cents, sessions: x.count }, onDone: load }); } }, UI.svg('wallet', 16), 'Receber');
          box.appendChild(h('article', { class: 'card mt16' },
            h('div', { class: 'appt-head' }, h('div', { class: 'grow' }, h('a', { class: 'appt-when', href: '#/pacientes/' + x.record_id + '?aba=financeiro' }, x.name),
              h('div', { class: 'small muted' }, (x.count === 1 ? '1 sessão' : x.count + ' sessões') + ' desde ' + UI.fmtDate(x.since))), h('b', { class: 'amt-big' }, money(x.cents))),
            h('p', { class: 'small muted mb0 mt8' }, 'Datas: ' + dates),
            h('div', { class: 'btn-row mt16' }, rec, chargeLink(x.phone, x.name, x.count, x.cents, ctx))));
        });
      }).catch(function (e) { failBox(box, e, 'financeiro-receber'); });
      return box;
    }

    function receiptsPanel() {
      var box = h('div'), year = +month.slice(0, 4), area = h('div', null, UI.loading());
      function loadYear(y) {
        year = y; clear(area); area.appendChild(UI.loading());
        fin().receipts(y).then(function (d) {
          clear(area); clear(box); box.appendChild(top(d)); box.appendChild(area);
          var live = d.items.filter(function (i) { return !i.canceled; }), total = live.reduce(function (n, i) { return n + i.amount_cents; }, 0);
          if (!d.items.length) { area.appendChild(UI.empty('receipt', 'Nenhum recibo em ' + y, 'Os recibos aparecem aqui com o número em sequência (' + y + '-0001, ' + y + '-0002...).')); return; }
          area.appendChild(h('p', { class: 'small muted' }, live.length + (live.length === 1 ? ' recibo válido' : ' recibos válidos') + ', total de ' + money(total) + '. Cancelados não entram na soma.'));
          area.appendChild(h('div', { class: 'group' }, d.items.map(function (i) {
            return h('button', { type: 'button', class: 'item' + (i.canceled ? ' struck' : ''), onclick: function () { S.receiptSheet(i.id, { onChange: load }); } },
              h('span', { class: 'ico-box' }, UI.svg('receipt', 20)),
              h('span', { class: 'grow' }, h('span', { class: 't' }, 'Nº ' + i.number + (i.name ? ', ' + i.name : '')), h('span', { class: 's' }, UI.fmtDate(i.issued_on) + ' · ' + C.methodLabel(i.method)),
                i.canceled ? h('span', { class: 'badge bad' }, 'Cancelado') : null),
              h('span', { class: 'amt' }, money(i.amount_cents)));
          })));
        }).catch(function (e) { failBox(area, e, 'financeiro-recibos'); });
      }
      function top(d) {
        var years = d.years.slice();
        if (years.indexOf(+thisMonth.slice(0, 4)) < 0) years.unshift(+thisMonth.slice(0, 4));
        if (years.indexOf(year) < 0) years.unshift(year);
        years.sort(function (a, b) { return b - a; });
        var chips = h('div', { class: 'chips mb16', role: 'group', 'aria-label': 'Ano dos recibos' }, years.map(function (y) {
          return h('button', { type: 'button', class: 'chip', 'aria-pressed': y === year ? 'true' : 'false', onclick: function () { loadYear(y); } }, String(y));
        }));
        var acts = h('div', { class: 'btn-row compact mb16' }, UI.button('Recibo avulso', { icon: 'plus', onclick: function () { S.receiptNewSheet({ onDone: load }); } }),
          d.items.length ? UI.button('Baixar planilha', { variant: 'ghost', icon: 'download', onclick: function () {
            var rows = [['Número', 'Data', 'Paciente', 'Forma', 'Valor (R$)', 'Situação']].concat(d.items.slice().reverse().map(function (i) {
              return [i.number, UI.fmtDate(i.issued_on), csvText(i.name || ''), C.methodLabel(i.method), csvMoney(i.amount_cents), i.canceled ? 'Cancelado' : 'Válido'];
            }));
            saveCsv('senso-recibos-' + d.year + '.csv', rows);
          } }) : null);
        return h('div', null, chips, acts);
      }
      box.appendChild(area);
      loadYear(year);
      return box;
    }

    function expensesPanel() {
      var box = h('div', null, UI.loading()), r = monthRange(month);
      fin().expenses(r[0], r[1]).then(function (list) {
        clear(box);
        box.appendChild(h('div', { class: 'btn-row compact mb16' }, UI.button('Nova despesa', { icon: 'plus', onclick: function () { S.expenseSheet({ onDone: load }); } }),
          list.length ? UI.button('Baixar planilha', { variant: 'ghost', icon: 'download', onclick: function () {
            saveCsv('senso-despesas-' + month + '.csv', [['Data', 'Descrição', 'Categoria', 'Valor (R$)']].concat(list.slice().reverse().map(function (e) {
              return [UI.fmtDate(e.paid_on), csvText(e.description), C.categoryLabel(e.category), csvMoney(e.amount_cents)];
            })));
          } }) : null));
        if (!list.length) { box.appendChild(UI.empty('trending-down', 'Nenhuma despesa em ' + T.MONTHS[+month.slice(5, 7) - 1], 'Registre aluguel, material, supervisão e o que mais sair do seu bolso para ver o resultado do mês.')); return; }
        box.appendChild(h('div', { class: 'group' }, list.map(function (e) {
          return h('button', { type: 'button', class: 'item', onclick: function () { S.expenseSheet({ expense: e, onDone: load }); } },
            h('span', { class: 'ico-box' }, UI.svg('trending-down', 20)),
            h('span', { class: 'grow' }, h('span', { class: 't' }, e.description), h('span', { class: 's' }, UI.fmtDate(e.paid_on) + ' · ' + C.categoryLabel(e.category))),
            h('span', { class: 'amt' }, money(e.amount_cents)));
        })));
        var by = {};
        list.forEach(function (e) { by[e.category] = (by[e.category] || 0) + e.amount_cents; });
        var cats = Object.keys(by).map(function (k) { return { label: C.categoryLabel(k), value: by[k] }; }).sort(function (a, b) { return b.value - a.value; });
        if (cats.length > 1) box.appendChild(h('section', { class: 'card mt16' }, h('h2', null, 'Para onde foi'), Charts.bars(cats, { max: cats[0].value, fmt: money, label: 'Despesas por categoria' })));
      }).catch(function (e) { failBox(box, e, 'financeiro-despesas'); });
      return box;
    }

    function draw() {
      clear(holder);
      var prev = h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Mês anterior', onclick: function () { month = shiftYm(month, -1); load(); } }, UI.svg('chevron-left', 20));
      var next = h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Próximo mês', onclick: function () { month = shiftYm(month, 1); load(); } }, UI.svg('chevron-right', 20));
      next.disabled = month >= thisMonth;
      holder.appendChild(h('div', { class: 'cal-bar' }, prev, h('div', { class: 'cal-title', 'aria-live': 'polite' }, T.monthName(month)), next));
      holder.appendChild(h('div', { class: 'stat-row' },
        stat(money(SM.received_cents), 'Recebido no mês', 'good'),
        stat(money(SM.pending_cents), 'A receber' + (SM.pending_count ? ' (' + SM.pending_count + (SM.pending_count === 1 ? ' sessão)' : ' sessões)') : ''), SM.pending_cents ? 'warn' : ''),
        stat(money(SM.expenses_cents), 'Despesas'),
        stat(money(SM.result_cents), 'Resultado', SM.result_cents < 0 ? 'warn' : 'good')));
      var pr = pct(SM.received_cents, SM.prev_received_cents);
      holder.appendChild(h('div', { class: 'btn-row compact mb16' }, UI.button('Relatório do mês em PDF', { variant: 'ghost', icon: 'file-text', onclick: function () {
        var b = this, r = monthRange(month);
        UI.busy(b, true);
        Promise.all([fin().payments(r[0], r[1]), fin().expenses(r[0], r[1]), API.pro.settings()]).then(function (x) {
          UI.busy(b, false);
          P.preview('Relatório de ' + T.monthName(month), S.monthDocument(month, x[0], x[1], x[2]));
        }).catch(function (e) { UI.busy(b, false); Diag.error('relatorio-mes', e); UI.toast(UI.errorText(e)); });
      } })));
      holder.appendChild(h('p', { class: 'small muted' }, SM.prev_received_cents || SM.prev_expenses_cents
        ? 'Mês anterior: recebido ' + money(SM.prev_received_cents) + (pr == null ? '' : ' (' + (pr > 0 ? '+' : '') + pr + '%)') + ', despesas ' + money(SM.prev_expenses_cents) + '. Sessões realizadas no mês: ' + SM.sessions_done + '.'
        : 'Sessões realizadas no mês: ' + SM.sessions_done + '.'));
      var t = UI.tabs({ label: 'Seções do financeiro', value: tab, cls: 'dense', onChange: function (k) { tab = k; },
        tabs: [['recebido', 'Recebido'], ['receber', 'A receber' + (SM.pending_count ? ' (' + SM.pending_count + ')' : '')], ['recibos', 'Recibos'], ['despesas', 'Despesas']],
        render: function (k) { return k === 'receber' ? pendingPanel() : k === 'recibos' ? receiptsPanel() : k === 'despesas' ? expensesPanel() : receivedPanel(); } });
      holder.appendChild(t.el);
    }
    load();
    return node;
  };

  /* ---------------------------------------------------------------- relatório do mês (papel, livro caixa simples) */
  S.monthDocument = function (month, pays, exps, st) {
    var kids = [], rec = pays.reduce(function (n, x) { return n + x.amount_cents; }, 0), desp = exps.reduce(function (n, x) { return n + x.amount_cents; }, 0);
    kids.push(P.head('RELATÓRIO FINANCEIRO', st));
    kids.push(h('p', null, h('b', null, T.monthName(month))));
    kids.push(P.grid([{ t: 'Recebido', r: true }, { t: 'Despesas', r: true }, { t: 'Resultado', r: true }], [[money(rec), money(desp), money(rec - desp)]]));
    kids.push(P.section('Recebimentos (' + pays.length + ')'));
    if (pays.length) kids.push(P.grid([{ t: 'Data' }, { t: 'Paciente' }, { t: 'Forma' }, { t: 'Recibo' }, { t: 'Valor', r: true }],
      pays.slice().sort(function (a, b) { return a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0; }).map(function (p) {
        return [UI.fmtDate(p.paid_on), p.name, C.methodLabel(p.method), p.receipt && !p.receipt.canceled ? p.receipt.number : '', money(p.amount_cents)];
      })));
    else kids.push(h('p', null, 'Sem recebimentos no mês.'));
    kids.push(P.section('Despesas (' + exps.length + ')'));
    if (exps.length) kids.push(P.grid([{ t: 'Data' }, { t: 'Descrição' }, { t: 'Categoria' }, { t: 'Valor', r: true }],
      exps.slice().sort(function (a, b) { return a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : 0; }).map(function (e) {
        return [UI.fmtDate(e.paid_on), e.description, C.categoryLabel(e.category), money(e.amount_cents)];
      })));
    else kids.push(h('p', null, 'Sem despesas no mês.'));
    kids.push(P.cityDate(st, UI.today()));
    kids.push(P.signature(st));
    kids.push(P.foot(st));
    return P.paper(kids.filter(Boolean));
  };

  /* ---------------------------------------------------------------- extrato do paciente (papel) */
  var SESSION_WORD = { done: 'Realizada', no_show: 'Falta cobrada' };
  var PAY_WORD = { paid: 'Pago', pending: 'A receber', none: 'Sem valor' };
  S.statementDocument = function (R, D, st) {
    var a = D.account, kids = [], name = R.social_name || R.full_name;
    kids.push(P.head('EXTRATO FINANCEIRO', st));
    kids.push(P.section('Paciente'));
    kids.push(P.kvTable([['Nome', name], ['Sessões pagas', String(a.paid)], ['Sessões realizadas ou cobradas', String(a.used)], ['Saldo de sessões', (a.balance > 0 ? '+' : '') + a.balance],
      ['Total pago', money(a.total_paid_cents)], ['A receber', a.pending_cents ? money(a.pending_cents) + ' (' + a.pending_count + (a.pending_count === 1 ? ' sessão)' : ' sessões)') : 'Nada em aberto'],
      ['Último pagamento', a.last_payment ? UI.fmtDate(a.last_payment) : '']]));
    kids.push(P.section('Pagamentos (' + D.payments.length + ')'));
    if (D.payments.length) kids.push(P.grid([{ t: 'Data' }, { t: 'Forma' }, { t: 'Sessões' }, { t: 'Recibo' }, { t: 'Valor', r: true }],
      D.payments.slice().sort(function (x, y) { return x.paid_on < y.paid_on ? -1 : 1; }).map(function (p) {
        return [UI.fmtDate(p.paid_on), C.methodLabel(p.method), p.appointment_id ? '1' : String(p.sessions).replace('.', ','), p.receipt && !p.receipt.canceled ? p.receipt.number : '', money(p.amount_cents)];
      })));
    else kids.push(h('p', null, 'Nenhum pagamento registrado.'));
    if (D.sessions.length) {
      kids.push(P.section('Sessões'));
      kids.push(P.grid([{ t: 'Data' }, { t: 'Situação' }, { t: 'Pagamento' }, { t: 'Valor', r: true }],
        D.sessions.slice().sort(function (x, y) { return x.starts_at < y.starts_at ? -1 : 1; }).map(function (s) {
          return [UI.fmtDate(T.dayOf(s.starts_at)), SESSION_WORD[s.status] || s.status, PAY_WORD[s.payment_status] || '', s.price_cents ? money(s.price_cents) : ''];
        })));
    }
    kids.push(P.cityDate(st, UI.today()));
    kids.push(P.signature(st));
    kids.push(P.foot(st));
    return P.paper(kids.filter(Boolean));
  };

  /* ---------------------------------------------------------------- aba Financeiro da ficha */
  S.financePanel = function (ctx, R, F) {
    if (!isVerifiedPro(ctx)) return h('div', null, S.crpNotice((ctx.me.professional || {}).verification), UI.empty('lock', 'Libera quando o seu CRP for confirmado', 'O financeiro do paciente fica disponível depois da confirmação.'));
    var box = h('div', null, UI.loading()), name = R.social_name || R.full_name;
    var target = F && F.payer === 'guardian' && R.guardian_phone ? { name: R.guardian_name || name, phone: R.guardian_phone } : { name: name, phone: R.phone };
    function load() {
      fin().patient(R.record_id).then(function (D) { draw(D); }).catch(function (e) { failBox(box, e, 'financeiro-paciente'); });
    }
    function draw(D) {
      clear(box);
      var a = D.account;
      box.appendChild(h('div', { class: 'stat-row' }, stat(String(a.paid), 'sessões pagas'), stat(String(a.used), 'realizadas ou cobradas'),
        stat((a.balance > 0 ? '+' : '') + a.balance, a.balance < 0 ? 'sessões a pagar' : 'saldo de sessões', a.balance < 0 ? 'warn' : (a.balance > 0 ? 'good' : '')), stat(money(a.total_paid_cents), 'total pago')));
      if (a.pending_count) {
        var rec = UI.button('Receber agora', { auto: true, icon: 'wallet', onclick: function () { S.paymentSheet({ record: { id: R.record_id, name: name }, preset: { cents: a.pending_cents, sessions: a.pending_count }, onDone: load }); } });
        rec.classList.add('sm');
        box.appendChild(h('section', { class: 'card warn-card' },
          h('h2', null, a.pending_count + (a.pending_count === 1 ? ' sessão sem pagamento' : ' sessões sem pagamento') + ', ' + money(a.pending_cents)),
          h('p', { class: 'small mb16' }, D.pending_dates.slice(0, 8).map(dm).join(', ') + (D.pending_dates.length > 8 ? '...' : '')),
          h('div', { class: 'btn-row' }, rec, chargeLink(target.phone, target.name, a.pending_count, a.pending_cents, ctx))));
      } else if (a.used) box.appendChild(UI.notice('ok', 'Tudo em dia: as sessões realizadas estão pagas.'));
      if (a.upcoming_covered) box.appendChild(h('p', { class: 'small muted' }, a.upcoming_covered + (a.upcoming_covered === 1 ? ' sessão marcada já está paga.' : ' sessões marcadas já estão pagas.')));
      var acts = h('div', { class: 'btn-row compact mb16' }, UI.button('Novo pagamento', { icon: 'plus', onclick: function () { S.paymentSheet({ record: { id: R.record_id, name: name }, onDone: load }); } }),
        UI.button('Extrato em PDF', { variant: 'ghost', icon: 'download', onclick: function (ev) {
          var b = ev.currentTarget; UI.busy(b, true);
          API.pro.settings().then(function (st) { UI.busy(b, false); P.preview('Extrato de ' + UI.firstName(name), S.statementDocument(R, D, st)); })
            .catch(function (e) { UI.busy(b, false); Diag.error('extrato', e); UI.toast(UI.errorText(e)); });
        } }));
      box.appendChild(acts);
      if (!D.payments.length) box.appendChild(UI.empty('wallet', 'Nenhum pagamento registrado', 'Registre o primeiro pagamento deste paciente. Se ele pagar vários de uma vez, informe quantas sessões o valor cobre.'));
      else {
        box.appendChild(h('div', { class: 'group-title' }, 'Pagamentos'));
        box.appendChild(h('div', { class: 'group' }, D.payments.map(function (p) {
          return payRow(p, { onClick: function () { S.paymentSheet({ payment: p, record: { id: R.record_id, name: name }, onDone: load }); } });
        })));
      }
      if (D.sessions.length) {
        box.appendChild(h('div', { class: 'group-title' }, 'Sessões cobradas'));
        box.appendChild(h('div', { class: 'group' }, D.sessions.slice(0, 12).map(function (s) {
          return h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('calendar-days', 20)),
            h('span', { class: 'grow' }, h('span', { class: 't' }, UI.fmtDate(T.dayOf(s.starts_at)) + ' às ' + T.hmOf(s.starts_at)), h('span', { class: 's' }, (SESSION_WORD[s.status] || s.status) + (s.price_cents ? ' · ' + money(s.price_cents) : ''))),
            h('span', { class: 'badge ' + (s.payment_status === 'paid' ? 'ok' : (s.payment_status === 'pending' ? 'warn' : '')) }, PAY_WORD[s.payment_status] || ''));
        })));
        if (D.sessions.length > 12) box.appendChild(h('p', { class: 'small muted' }, 'Mostrando as 12 mais recentes. O extrato em PDF traz todas.'));
      }
    }
    load();
    return box;
  };
})();
