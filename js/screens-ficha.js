/* Psicólogo: ficha completa do paciente (identificação, contato, responsável, atendimento, clínico e consentimento),
   situação do paciente (ativo, pausa, alta...) e dados profissionais usados nos recibos. Só componentes do site. */
(function () {
  'use strict';
  var h = UI.h, C = window.Clinic;
  var S = window.Screens = window.Screens || {};

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function txt(s) { return String(s == null ? '' : s).trim(); }

  /* ---------------------------------------------------------------- situação do paciente */
  S.statusBadge = function (st) {
    var i = C.statusInfo(st);
    return h('span', { class: 'badge ' + i.tone }, i.label);
  };

  S.statusSheet = function (R, onDone) {
    var cur = R.status || 'active', sh, general = h('div', { 'aria-live': 'polite' });
    var rows = C.STATUS.map(function (s) {
      var b = h('button', { type: 'button', class: 'item', role: 'radio', 'aria-checked': s[0] === cur ? 'true' : 'false', onclick: function () {
        if (s[0] === cur) { sh.close('same'); return; }
        b.disabled = true; clear(general);
        API.pro.setStatus(R.record_id, s[0]).then(function () {
          sh.close('done'); UI.toast('Situação: ' + s[1] + '.', 'circle-check'); onDone();
        }).catch(function (e) { b.disabled = false; Diag.error('situacao-paciente', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível mudar agora. Tente de novo.'))); });
      } }, h('span', { class: 't' }, s[1]), s[0] === cur ? h('span', { class: 'ico-box' }, UI.svg('circle-check', 20)) : null);
      return b;
    });
    sh = UI.sheet({ title: 'Situação de ' + UI.firstName(R.full_name), content: [
      h('p', { class: 'muted' }, 'Quem está de alta, interrompeu ou foi encaminhado sai dos avisos de aniversário. Nada é apagado, e você pode voltar para Ativo quando quiser.'),
      h('div', { class: 'group', role: 'radiogroup', 'aria-label': 'Situação do paciente' }, rows), general] });
    return sh;
  };

  /* ---------------------------------------------------------------- leitura: cartões da ficha */
  function cl(F) { return (F && F.clinical) || {}; }

  function kvList(rows) {
    var kv = h('dl', { class: 'kv' }), n = 0;
    rows.forEach(function (r) { if (r[1]) { n += 1; kv.appendChild(h('dt', null, r[0])); kv.appendChild(h('dd', null, r[1])); } });
    return n ? kv : null;
  }
  function longText(title, value) {
    if (!value) return null;
    return h('div', { class: 'mt16' }, h('div', { class: 'group-title' }, title), h('p', { class: 'pt-body' }, value));
  }

  /* Cartão "Ficha": mostra só o que foi preenchido. */
  S.fichaCards = function (R, F, onEdit) {
    var c = cl(F), d = (F && F.defaults) || {};
    var price = F.session_price_cents != null ? C.money(F.session_price_cents) : (d.price_cents != null ? C.money(d.price_cents) + ' (padrão)' : '');
    var mins = F.session_minutes != null ? F.session_minutes + ' min' : (d.minutes ? d.minutes + ' min (padrão)' : '');
    var ident = kvList([['Nome social', F.social_name], ['CPF', c.cpf ? C.maskCpf(c.cpf) : ''], ['Gênero', c.gender], ['Estado civil', c.civil], ['Profissão', c.job], ['Escolaridade', c.education],
      ['Endereço', [c.address, c.city].filter(Boolean).join(', ')]]);
    var resp = kvList([['Responsável', c.resp_name], ['Parentesco', c.resp_kin], ['CPF do responsável', c.resp_cpf ? C.maskCpf(c.resp_cpf) : ''], ['Celular do responsável', c.resp_phone ? UI.formatPhone(c.resp_phone) : ''],
      ['Contato de emergência', c.emerg_name], ['Celular de emergência', c.emerg_phone ? UI.formatPhone(c.emerg_phone) : '']]);
    var started = F.started_on ? UI.fmtDate(F.started_on) : '';
    var care = kvList([['Tipo de atendimento', C.LABEL.care[F.care_type] && F.care_type !== 'individual' ? C.LABEL.care[F.care_type] : ''], ['Participantes', c.participants], ['Início do acompanhamento', started],
      ['Modalidade', C.LABEL.modality[F.modality]], ['Frequência', C.LABEL.frequency[F.frequency]], ['Duração da sessão', mins], ['Valor da sessão', price],
      ['Preferência de horário', c.pref_time], ['Convênio', c.insurance], ['Encaminhado por', c.referred_by],
      ['Quem paga', F.payer && F.payer !== 'self' ? C.LABEL.payer[F.payer] : ''], ['Nome de quem paga', c.payer_name], ['CPF de quem paga', c.payer_cpf ? C.maskCpf(c.payer_cpf) : '']]);
    var tcle = c.tcle_accepted ? 'Aceito' + (c.tcle_date ? ' em ' + UI.fmtDate(c.tcle_date) : '') : '';
    var clin = kvList([['CID ou hipótese', c.cid], ['Termo de consentimento (TCLE)', tcle]]);
    var texts = [longText('Queixa principal', c.complaint), longText('Histórico', c.history), longText('Observações', c.notes)].filter(Boolean);
    var any = ident || resp || care || clin || texts.length;

    var edit = h('button', { type: 'button', class: 'btn ghost auto', onclick: onEdit }, UI.svg('pencil', 18), any ? 'Editar ficha' : 'Preencher ficha');
    var box = h('section', { class: 'card' }, h('h2', null, 'Ficha completa'));
    if (!any) {
      box.appendChild(h('p', { class: 'muted' }, 'Identificação, atendimento, queixa e histórico. Só você vê, cifrado.'));
      box.appendChild(edit);
      return [box];
    }
    box.appendChild(h('p', { class: 'small muted' }, 'Só você vê estes dados. Ficam cifrados.'));
    [['Identificação', ident], ['Responsável e emergência', resp], ['Atendimento', care], ['Clínico', clin]].forEach(function (s) {
      if (!s[1]) return;
      box.appendChild(h('div', { class: 'group-title' }, s[0]));
      box.appendChild(s[1]);
    });
    texts.forEach(function (t) { box.appendChild(t); });
    box.appendChild(h('div', { class: 'btn-row mt16' }, edit));
    return [box];
  };

  /* ---------------------------------------------------------------- edição: janela "Ficha completa" */
  S.fichaSheet = function (R, F, onSaved) {
    var c = cl(F), d = F.defaults || {}, minor = !!R.minor, today = UI.today();
    var sh;

    var social = UI.field({ label: 'Nome social', optional: true, autocapitalize: 'words', maxlength: 120, value: F.social_name || '', hint: 'Se preencher, é o nome que aparece nas telas.' });
    var cpf = C.cpfField({ label: 'CPF', optional: true, value: c.cpf || '' });
    var gender = UI.field({ label: 'Gênero', type: 'select', options: C.listOpts(C.LISTS.gender), value: c.gender || '' });
    var civil = UI.field({ label: 'Estado civil', type: 'select', options: C.listOpts(C.LISTS.civil), value: c.civil || '' });
    var job = UI.field({ label: 'Profissão', optional: true, maxlength: 100, autocapitalize: 'sentences', value: c.job || '' });
    var edu = UI.field({ label: 'Escolaridade', type: 'select', options: C.listOpts(C.LISTS.education), value: c.education || '' });
    var address = UI.field({ label: 'Endereço', optional: true, maxlength: 200, autocapitalize: 'words', value: c.address || '' });
    var city = UI.field({ label: 'Cidade', optional: true, maxlength: 80, autocapitalize: 'words', value: c.city || '' });

    var rName = UI.field({ label: 'Nome do responsável', optional: true, maxlength: 120, autocapitalize: 'words', value: c.resp_name || '' });
    var rKin = UI.field({ label: 'Parentesco', optional: true, maxlength: 60, value: c.resp_kin || '', placeholder: 'Mãe, pai, tutor...' });
    var rCpf = C.cpfField({ label: 'CPF do responsável', optional: true, value: c.resp_cpf || '' });
    var rPhone = UI.phoneField({ label: 'Celular do responsável', optional: true, value: c.resp_phone || '' });
    var eName = UI.field({ label: 'Contato de emergência', optional: true, maxlength: 120, autocapitalize: 'words', value: c.emerg_name || '' });
    var ePhone = UI.phoneField({ label: 'Celular de emergência', optional: true, value: c.emerg_phone || '' });

    var careType = UI.field({ label: 'Tipo de atendimento', type: 'select', options: C.opts(C.LABEL.care), value: F.care_type || 'individual' });
    var parts = UI.field({ label: 'Participantes', type: 'textarea', rows: 2, cls: 'short', maxlength: 500, value: c.participants || '', hint: 'Quem participa das sessões (casal, família ou grupo).' });
    var partsBox = h('div', { class: 'hide' }, parts.el);
    var started = UI.field({ label: 'Início do acompanhamento', type: 'date', min: '1900-01-01', value: F.started_on || '' });
    var modality = UI.field({ label: 'Modalidade', type: 'select', options: C.opts(C.LABEL.modality, 'Não definida'), value: F.modality || '' });
    var freq = UI.field({ label: 'Frequência', type: 'select', options: C.opts(C.LABEL.frequency, 'Não definida'), value: F.frequency || '' });
    var mins = UI.field({ label: 'Duração da sessão (min)', inputmode: 'numeric', maxlength: 3, value: F.session_minutes != null ? String(F.session_minutes) : '',
      placeholder: d.minutes ? 'Padrão: ' + d.minutes : '' });
    var price = UI.field({ label: 'Valor da sessão (R$)', inputmode: 'decimal', maxlength: 10, value: C.moneyText(F.session_price_cents),
      placeholder: d.price_cents != null ? 'Padrão: ' + C.moneyText(d.price_cents) : '150,00', hint: 'Se ficar em branco, vale o valor padrão da sua agenda.' });
    var pref = UI.field({ label: 'Preferência de horário', optional: true, maxlength: 100, value: c.pref_time || '', placeholder: 'Terças à tarde' });
    var insurance = UI.field({ label: 'Convênio', optional: true, maxlength: 100, value: c.insurance || '' });
    var referred = UI.field({ label: 'Encaminhado por', optional: true, maxlength: 120, value: c.referred_by || '' });
    var payer = UI.field({ label: 'Quem paga as sessões', type: 'select', options: C.opts(C.LABEL.payer), value: F.payer || 'self' });
    var pName = UI.field({ label: 'Nome de quem paga', optional: true, maxlength: 120, autocapitalize: 'words', value: c.payer_name || '' });
    var pCpf = C.cpfField({ label: 'CPF de quem paga', optional: true, value: c.payer_cpf || '', hint: 'Sai no recibo no lugar do CPF do paciente.' });
    var payerBox = h('div', { class: 'hide' }, pName.el, pCpf.el);

    var complaint = UI.field({ label: 'Queixa principal', type: 'textarea', rows: 4, cls: 'mid', maxlength: 4000, value: c.complaint || '' });
    var history = UI.field({ label: 'Histórico', type: 'textarea', rows: 5, maxlength: 12000, value: c.history || '', hint: 'Histórico de saúde, familiar e de tratamentos anteriores.' });
    var cid = UI.field({ label: 'CID ou hipótese diagnóstica', optional: true, maxlength: 200, value: c.cid || '' });
    var notes = UI.field({ label: 'Observações', type: 'textarea', rows: 3, cls: 'short', maxlength: 4000, value: c.notes || '' });

    var tcle = UI.checkbox({ label: 'Termo de consentimento (TCLE) aceito pelo paciente' });
    tcle.input.checked = !!c.tcle_accepted;
    var tcleDate = UI.field({ label: 'Data do aceite', type: 'date', max: today, min: '1900-01-01', value: c.tcle_date || '' });
    var tcleBox = h('div', { class: 'hide' }, tcleDate.el);

    function sync() {
      partsBox.classList.toggle('hide', careType.value() === 'individual');
      payerBox.classList.toggle('hide', payer.value() !== 'other');
      tcleBox.classList.toggle('hide', !tcle.checked());
    }
    [careType.input, payer.input].forEach(function (i) { i.addEventListener('change', sync); });
    tcle.input.addEventListener('change', function () { if (tcle.checked() && !tcleDate.value()) tcleDate.input.value = today; sync(); });
    sync();

    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Salvar ficha', { type: 'submit' });

    function section(title, nodes) { return [h('div', { class: 'group-title' }, title)].concat(nodes); }
    var respNodes = minor
      ? [UI.notice('info', 'Nome e celular do responsável deste menor ficam no cadastro. Aqui você completa parentesco e CPF.'), h('div', { class: 'grid2' }, rKin.el, rCpf.el)]
      : [h('div', { class: 'grid2' }, rName.el, rKin.el, rCpf.el, rPhone.el)];

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [];
      function bad(f, m) { f.setError(m); bads.push(f.input); }
      function cpfOk(f, label) { if (txt(f.value()) && !C.validCpf(f.value())) bad(f, 'Confira o CPF' + (label || '') + '.'); }
      if (txt(social.value()) && txt(social.value()).length < 2) bad(social, 'O nome social precisa ter ao menos 2 letras.');
      cpfOk(cpf);
      if (!minor) { cpfOk(rCpf, ' do responsável'); if (txt(rPhone.value()) && !UI.phoneOk(rPhone.value())) bad(rPhone, 'Confira o número, com DDD.'); }
      else cpfOk(rCpf, ' do responsável');
      if (txt(ePhone.value()) && !UI.phoneOk(ePhone.value())) bad(ePhone, 'Confira o número, com DDD.');
      if (payer.value() === 'other') cpfOk(pCpf, ' de quem paga');
      var m = null, pr = null;
      if (txt(mins.value())) { m = Number(txt(mins.value())); if (!isFinite(m) || m % 1 !== 0 || m < 5 || m > 600) bad(mins, 'Use de 5 a 600 minutos.'); }
      if (txt(price.value())) { pr = C.parseMoney(price.value()); if (pr !== null && isNaN(pr)) bad(price, 'Confira o valor.'); }
      if (started.value() && started.value() > UI.dt.addDays(today, 365)) bad(started, 'Essa data está longe demais.');
      if (bads.length) { S.focusFirst(bads); return; }

      var individual = careType.value() === 'individual', other = payer.value() === 'other', accepted = tcle.checked();
      var clinical = {
        cpf: txt(cpf.value()), gender: gender.value(), civil: civil.value(), job: txt(job.value()), education: edu.value(), address: txt(address.value()), city: txt(city.value()),
        resp_kin: txt(rKin.value()), resp_cpf: txt(rCpf.value()),
        emerg_name: txt(eName.value()), emerg_phone: txt(ePhone.value()),
        participants: individual ? '' : txt(parts.value()),
        pref_time: txt(pref.value()), insurance: txt(insurance.value()), referred_by: txt(referred.value()),
        payer_name: other ? txt(pName.value()) : '', payer_cpf: other ? txt(pCpf.value()) : '',
        complaint: txt(complaint.value()), history: txt(history.value()), cid: txt(cid.value()), notes: txt(notes.value()),
        tcle_accepted: accepted ? true : null, tcle_date: accepted ? (tcleDate.value() || today) : null
      };
      if (!minor) { clinical.resp_name = txt(rName.value()); clinical.resp_phone = txt(rPhone.value()); }
      UI.busy(btn, true);
      API.pro.saveFicha(R.record_id, {
        social_name: txt(social.value()), started_on: started.value() || null, session_price_cents: pr, session_minutes: m,
        modality: modality.value() || null, frequency: freq.value() || null, care_type: careType.value(), payer: payer.value(), clinical: clinical
      }).then(function () {
        sh.close('done'); UI.toast('Ficha salva.', 'circle-check'); onSaved();
      }).catch(function (e) {
        UI.busy(btn, false); Diag.error('salvar-ficha', e);
        general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
      });
    } },
      UI.notice('info', 'Preencha o que fizer sentido. Tudo é opcional e fica cifrado, só você vê.'),
      section('Identificação', [social.el, h('div', { class: 'grid2' }, cpf.el, gender.el, civil.el, edu.el), job.el]),
      section('Contato', [address.el, city.el]),
      section('Responsável e emergência', respNodes.concat([h('div', { class: 'grid2' }, eName.el, ePhone.el)])),
      section('Atendimento', [careType.el, partsBox, h('div', { class: 'grid2' }, started.el, modality.el, freq.el, mins.el, price.el, pref.el), insurance.el, referred.el, payer.el, payerBox]),
      section('Clínico', [complaint.el, history.el, cid.el, notes.el]),
      section('Consentimento', [tcle.el, tcleBox]),
      general, btn);
    sh = UI.sheet({ title: 'Ficha de ' + UI.firstName(F.social_name || R.full_name), content: form, wide: true, focus: social.input });
    return sh;
  };

  /* ---------------------------------------------------------------- dados profissionais e recibos (na Conta) */
  S.proSettingsSheet = function (ctx, onSaved) {
    var body = h('div', null, UI.loading()), sh = UI.sheet({ title: 'Dados profissionais e recibos', content: body, wide: true });
    API.pro.settings().then(function (st) {
      clear(body);
      var doc = C.docField({ label: 'CPF ou CNPJ', optional: true, value: st.document || '', hint: 'Sai no recibo, junto com o seu CRP.' });
      var address = UI.field({ label: 'Endereço do consultório', optional: true, maxlength: 200, autocapitalize: 'words', value: st.address || '' });
      var city = UI.field({ label: 'Cidade', optional: true, maxlength: 80, autocapitalize: 'words', value: st.city || '' });
      var foot = UI.field({ label: 'Rodapé do recibo', type: 'textarea', rows: 3, cls: 'short', maxlength: 300, value: st.receipt_footer || '', hint: 'Por exemplo: "Recibo para fins de reembolso junto ao plano de saúde."' });
      var auto = UI.checkbox({ label: 'Gerar o recibo sozinho quando eu marcar a sessão como paga' });
      auto.input.checked = !!st.receipt_auto;
      var sig = st.signature || null, sigBox = h('div', { class: 'sig-box' }), sigErr = h('div', { class: 'err hide', role: 'alert' });
      var drop;
      function drawSig() {
        clear(sigBox);
        if (sig) sigBox.appendChild(h('img', { class: 'sig-img', src: sig, alt: 'Sua assinatura' }));
        else sigBox.appendChild(h('p', { class: 'small muted mb0' }, 'Sem assinatura. O recibo sai sem imagem de assinatura.'));
        if (drop) drop.classList.toggle('hide', !sig);
      }
      var file = h('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'hide', 'aria-label': 'Escolher imagem da assinatura', onchange: function () {
        var f = file.files && file.files[0]; file.value = '';
        if (!f) return;
        sigErr.classList.add('hide');
        C.imageFromFile(f, { maxW: 400, maxH: 160, limit: 180000, type: f.type === 'image/jpeg' ? 'jpeg' : 'png' }).then(function (url) { sig = url; drawSig(); })
          .catch(function () { sigErr.textContent = 'Não foi possível usar essa imagem. Tente um PNG ou JPEG menor.'; sigErr.classList.remove('hide'); });
      } });
      var pick = UI.button('Escolher imagem', { variant: 'ghost', auto: true, icon: 'pencil', onclick: function () { file.click(); } });
      drop = UI.button('Remover', { variant: 'ghost', auto: true, onclick: function () { sig = null; drawSig(); } });
      drawSig();
      var general = h('div', { 'aria-live': 'polite' });
      var btn = UI.button('Salvar', { type: 'submit' });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); clear(general);
        if (txt(doc.value()) && !C.validDoc(doc.value())) { doc.setError('Confira o CPF ou CNPJ.'); doc.input.focus(); return; }
        UI.busy(btn, true);
        API.pro.saveSettings({ document: txt(doc.value()), address: txt(address.value()), city: txt(city.value()), receipt_footer: txt(foot.value()), receipt_auto: auto.checked(), signature: sig || '' })
          .then(function () { sh.close('done'); UI.toast('Dados salvos.', 'circle-check'); if (onSaved) onSaved(); })
          .catch(function (e) { UI.busy(btn, false); Diag.error('dados-profissionais', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.'))); });
      } },
        UI.notice('info', 'Estes dados aparecem nos recibos e nos documentos que você emitir. Nome e CRP vêm da sua conta: ' + st.name + ', CRP ' + st.crp + '.'),
        doc.el, address.el, city.el, foot.el, auto.el,
        h('div', { class: 'group-title' }, 'Assinatura'), sigBox, sigErr, h('div', { class: 'btn-row' }, pick, drop), file,
        general, btn);
      body.appendChild(form);
    }).catch(function (e) { Diag.error('dados-profissionais-ler', e); clear(body); body.appendChild(UI.notice('bad', 'Não foi possível carregar agora. Feche e tente de novo.')); });
    return sh;
  };
})();
