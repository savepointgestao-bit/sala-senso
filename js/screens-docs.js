/* Psicólogo: aba Documentos da ficha. Declaração de comparecimento, contrato e TCLE (com assinatura na tela), relatório psicológico
   (Res. CFP 06/2019), encaminhamento, cópias guardadas na ficha e anexos (fotos e PDF, cifrados no servidor). Só componentes do site. */
(function () {
  'use strict';
  var h = UI.h, C = window.Clinic, P = window.PrintDoc;
  var S = window.Screens = window.Screens || {};

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function txt(s) { return String(s == null ? '' : s).trim(); }
  function failBox(box, e, tag) { Diag.error(tag, e); clear(box); box.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível carregar agora. Atualize a página.'))); }
  function card(title, head, body) { return h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), head || null), body); }
  function nameOf(R) { return R.social_name || R.full_name; }
  function lines(text) { var out = []; String(text || '').split('\n').forEach(function (l, i) { if (i) out.push(h('br')); out.push(l); }); return out; }
  function sessionLabel(s) { return UI.fmtDate(UI.dt.dayOf(s.starts_at)) + ' às ' + UI.dt.hmOf(s.starts_at); }
  var SESSION_STATUS = { scheduled: 'Marcada', done: 'Realizada' };
  var ICON = { declaration: 'file-text', tcle: 'pen-line', report: 'files', referral: 'file-text' };

  /* ---------------------------------------------------------------- dados do paciente para os papéis */
  function who(R, F) {
    var c = (F && F.clinical) || {};
    return { name: R.full_name, cpf: c.cpf || '', minor: !!R.minor, resp: R.guardian_name || c.resp_name || '', respCpf: c.resp_cpf || '', respKin: c.resp_kin || '', c: c,
      age: R.birth_date ? UI.ageFrom(R.birth_date) : null, sig: c.tcle_signature || '', signedOn: c.tcle_date || '' };
  }
  function sigBlock(img, name, role) {
    var box = h('div', { class: 'sig' });
    box.appendChild(img ? h('img', { src: img, alt: '' }) : h('div', { class: 'sig-gap' }));
    box.appendChild(h('div', { class: 'line' }));
    box.appendChild(h('b', null, name));
    box.appendChild(h('br')); box.appendChild(document.createTextNode(role));
    return box;
  }
  function footer(st, extra) { return P.foot(st, extra || (st && st.receipt_footer) || null); }

  /* ---------------------------------------------------------------- os quatro papéis */
  function declarationPaper(R, F, st, f) {
    var x = who(R, F), day = f.issue_date || UI.today(), kids = [P.head('DECLARAÇÃO DE COMPARECIMENTO', st, day)];
    kids.push(h('p', null, 'Declaro, para os devidos fins, que ', h('b', null, x.name), x.cpf ? [', portador(a) do CPF ', h('b', null, C.maskCpf(x.cpf))] : null,
      ', compareceu a atendimento psicológico no dia ', h('b', null, UI.fmtDate(f.date)),
      f.start ? [', no horário das ', h('b', null, f.start), f.end ? [' às ', h('b', null, f.end)] : null] : null, '.'));
    if (f.purpose) kids.push(h('p', null, lines(f.purpose)));
    kids.push(h('p', null, 'Por ser verdade, firmo a presente declaração.'));
    kids.push(P.cityDate(st, day));
    kids.push(P.signature(st));
    kids.push(footer(st));
    return P.paper(kids.filter(Boolean));
  }

  function tcleClauses(x, f) {
    var minor = x.minor, online = f.mode === 'Online' || f.mode === 'Híbrido', cl = [];
    function cla(title, parts) { return [h('b', null, title + ' ')].concat(parts); }
    cl.push(cla('Do objeto.', ['O objeto deste contrato é a prestação de serviços de psicologia (acompanhamento psicológico), conforme o Código de Ética Profissional do Psicólogo. O processo depende também do engajamento do(a) paciente. Não há garantia de resultados específicos nem de prazo para o término.']));
    cl.push(cla('Dos atendimentos.', ['As sessões têm duração de ' + (f.minutes || 50) + ' minutos, com frequência ' + String(f.frequency || 'semanal').toLowerCase() + ', na modalidade ' + String(f.mode || 'presencial').toLowerCase() +
      (f.schedule ? ', em ' + f.schedule : ', em dia e horário combinados entre as partes') + '.']));
    cl.push(cla('Dos valores e do pagamento.', [f.fee_cents ? ['Cada sessão custa ', h('b', null, C.money(f.fee_cents)), ' (' + C.moneyWords(f.fee_cents) + '). '] : 'O valor de cada sessão será combinado entre as partes. ',
      'O pagamento é feito ' + (f.pay_when || 'ao final de cada sessão') + ', por ' + (f.pay_methods || 'meio combinado') + '. Será emitido recibo a cada pagamento. Eventual reajuste será informado com antecedência.']));
    var hrs = f.notice_hours == null ? 24 : f.notice_hours;
    cl.push(cla('Das faltas e cancelamentos.', ['Desmarcações devem ser avisadas com no mínimo ', h('b', null, hrs + ' horas'), ' de antecedência, sem cobrança. ' +
      (f.charge_absence ? 'Faltas sem aviso dentro desse prazo serão cobradas, pois o horário permanece reservado.' : 'Faltas sem aviso não serão cobradas, mas podem levar à revisão do horário reservado.') +
      ' Atrasos não prorrogam o horário de término. A remarcação depende da disponibilidade da agenda.']));
    cl.push(cla('Do sigilo.', ['As informações compartilhadas nos atendimentos são sigilosas e protegidas pelo Código de Ética Profissional. O sigilo só pode ser rompido nos casos previstos em lei e no Código de Ética, como risco grave à vida ou à integridade do(a) paciente ou de terceiros e determinação judicial, e, nessas situações, apenas no limite do estritamente necessário.' +
      (minor ? ' No atendimento de crianças e adolescentes, os responsáveis serão informados sobre o que for necessário ao processo, preservando-se, sempre que possível, o conteúdo íntimo das sessões.' : '')]));
    cl.push(cla('Do registro e dos dados pessoais.', ['O(a) psicólogo(a) manterá registro documental (prontuário) de cada atendimento, guardado em local seguro pelo prazo mínimo previsto na regulamentação profissional. Os dados pessoais são tratados conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), apenas para a prestação do serviço, e o(a) paciente pode solicitar informações sobre eles.']));
    if (online) cl.push(cla('Do atendimento online.', ['Nas sessões online, o(a) paciente compromete-se a estar em local reservado e com conexão adequada, e a não gravar nem transmitir a sessão sem autorização. Em caso de falha de conexão, a sessão será retomada ou remarcada. O atendimento segue a Resolução CFP nº 11/2018.']));
    cl.push(cla('Da comunicação e das emergências.', ['A comunicação por mensagens limita-se a assuntos de agendamento e organização. Este serviço não é de urgência: em crise ou risco imediato, procure o SAMU (192), o CVV (188, 24 horas) ou o pronto-socorro mais próximo.']));
    cl.push(cla('Do encerramento.', ['O acompanhamento pode ser encerrado por qualquer das partes, preferencialmente com uma sessão de fechamento para avaliar o percurso.']));
    if (f.extra) cl.push(cla('Disposições adicionais.', [lines(f.extra)]));
    return cl;
  }
  function tcleParty(x) {
    return [h('b', null, x.name), x.cpf ? ', CPF ' + C.maskCpf(x.cpf) : '',
      x.minor ? [', representado(a) por ', h('b', null, x.resp || '____________________'), x.respCpf ? ', CPF ' + C.maskCpf(x.respCpf) : '', x.respKin ? ' (' + x.respKin + ')' : ''] : ''];
  }
  function tcleDocPaper(R, F, st, f) {
    var x = who(R, F), day = x.signedOn || f.signed_on || f.issue_date || UI.today(), pro = st || {}, kids = [];
    kids.push(h('div', { class: 'doc-head' }, h('div', null, h('h1', { class: 'sm' }, 'CONTRATO TERAPÊUTICO E TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO')),
      h('div', { class: 'doc-no' }, pro.name || '', pro.crp ? [h('br'), 'CRP ' + pro.crp] : null)));
    kids.push(h('p', null, 'Pelo presente instrumento, de um lado ', h('b', null, pro.name || '____________________'), ', psicólogo(a)', pro.crp ? ', CRP ' + pro.crp : '',
      pro.document ? ', CPF/CNPJ ' + C.maskDoc(pro.document) : '', ', doravante ', h('b', null, 'PSICÓLOGO(A)'), ', e, de outro, ', tcleParty(x), ', doravante ', h('b', null, 'PACIENTE'),
      ', firma-se este contrato, regido pelas cláusulas seguintes.'));
    kids.push(h('ol', null, tcleClauses(x, f).map(function (c) { return h('li', null, c); })));
    kids.push(h('p', null, 'Declaro que li e compreendi este documento, tive a oportunidade de esclarecer minhas dúvidas e concordo, de forma livre e esclarecida, com as condições acima.'));
    kids.push(P.cityDate(st, day));
    kids.push(h('div', { class: 'sigrow' }, sigBlock(x.sig, x.minor ? (x.resp || 'Responsável legal') : x.name, x.minor ? 'Responsável legal' : 'Paciente'),
      sigBlock(pro.signature, pro.name || 'Psicólogo(a)', 'Psicólogo(a)' + (pro.crp ? ' · CRP ' + pro.crp : ''))));
    kids.push(footer(st));
    return P.paper(kids.filter(Boolean));
  }

  function reportPaper(R, F, st, f) {
    var x = who(R, F), day = f.issue_date || UI.today(), pro = st || {}, kids = [];
    kids.push(P.head('RELATÓRIO PSICOLÓGICO', st, day));
    kids.push(P.section('1. Identificação'));
    kids.push(P.kvTable([['Autor(a)', (pro.name || '') + (pro.crp ? ' - CRP ' + pro.crp : '')],
      ['Interessado(a)', x.name + (x.age != null && x.age >= 0 ? ' (' + x.age + ' anos)' : '') + (x.cpf ? ', CPF ' + C.maskCpf(x.cpf) : '')], ['Solicitante', f.requester], ['Finalidade', f.purpose]]));
    [['2. Descrição da demanda', f.demand], ['3. Procedimento', f.procedure], ['4. Análise', f.analysis], ['5. Conclusão', f.conclusion]].forEach(function (b) {
      kids.push(P.section(b[0])); kids.push(h('p', null, b[1] ? lines(b[1]) : ' '));
    });
    kids.push(P.cityDate(st, day));
    kids.push(P.signature(st));
    kids.push(h('p', { class: 'small' }, 'Este documento tem caráter sigiloso e não pode ser utilizado para fins diferentes da finalidade indicada. As informações aqui contidas restringem-se ao necessário para essa finalidade.'));
    kids.push(footer(st));
    return P.paper(kids.filter(Boolean));
  }

  function referralPaper(R, F, st, f) {
    var x = who(R, F), day = f.issue_date || UI.today(), kids = [P.head('ENCAMINHAMENTO', st, day)];
    kids.push(h('p', null, 'A(o) ', h('b', null, f.to), f.specialty ? ' (' + f.specialty + ')' : '', ','));
    kids.push(h('p', null, 'Encaminho ', h('b', null, x.name), x.age != null && x.age >= 0 ? ', ' + x.age + ' anos' : '', ', em acompanhamento psicológico',
      F && F.started_on ? ' desde ' + UI.fmtDate(F.started_on) : '', ', para avaliação e conduta', f.specialty ? ' em ' + f.specialty : '', ', pelo seguinte motivo:'));
    kids.push(h('p', null, lines(f.reason)));
    if (f.notes) kids.push(h('p', null, h('b', null, 'Observações: '), lines(f.notes)));
    if (f.want_feedback) kids.push(h('p', null, 'Solicito, se possível, retorno sobre a avaliação realizada, para integração do cuidado.'));
    kids.push(h('p', null, 'Coloco-me à disposição para esclarecimentos. Atenciosamente,'));
    kids.push(P.cityDate(st, day));
    kids.push(P.signature(st));
    kids.push(h('p', { class: 'small' }, 'Documento sigiloso, destinado exclusivamente ao(à) destinatário(a) indicado(a).'));
    kids.push(footer(st));
    return P.paper(kids.filter(Boolean));
  }
  var BUILD = { declaration: declarationPaper, tcle: tcleDocPaper, report: reportPaper, referral: referralPaper };

  /* ---------------------------------------------------------------- assinatura na tela */
  function signaturePad(title, who2, cb) {
    var cv = h('canvas', { class: 'sigpad', width: 640, height: 240, role: 'img', 'aria-label': 'Área para assinar com o dedo ou o mouse' });
    var g = cv.getContext('2d'), drawing = false, dirty = false, last = null;
    g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }
    cv.addEventListener('pointerdown', function (e) {
      drawing = true; last = pos(e);
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignora */ }
      g.beginPath(); g.arc(last.x, last.y, 1.4, 0, 6.3); g.fillStyle = '#111'; g.fill(); dirty = true; e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) { if (!drawing) return; var q = pos(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(q.x, q.y); g.stroke(); last = q; e.preventDefault(); });
    function up() { drawing = false; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    var err = h('div', { class: 'err hide', role: 'alert' }, 'Faça a assinatura primeiro.');
    var sh = UI.sheet({ title: title, wide: true, content: [
      h('p', { class: 'muted' }, 'Peça para ' + who2 + ' assinar com o dedo no quadro abaixo.'), cv, h('div', { class: 'sigline' }, h('span', null, 'assinatura')), err,
      h('div', { class: 'btn-row mt16' },
        UI.button('Confirmar assinatura', { icon: 'check', onclick: function () {
          if (!dirty) { err.classList.remove('hide'); return; }
          var data = cv.toDataURL('image/png');
          if (data.length > 110000) { /* reduz para caber no limite da ficha */
            var small = document.createElement('canvas'); small.width = 400; small.height = 150;
            var sg = small.getContext('2d'); sg.fillStyle = '#fff'; sg.fillRect(0, 0, 400, 150); sg.drawImage(cv, 0, 0, 400, 150);
            data = small.toDataURL('image/png');
          }
          sh.close('swap'); cb(data);
        } }),
        UI.button('Limpar', { variant: 'ghost', onclick: function () { g.clearRect(0, 0, cv.width, cv.height); dirty = false; err.classList.add('hide'); } }))] });
    return sh;
  }

  /* ---------------------------------------------------------------- mostrar o papel (com os botões de cada tipo) */
  /* o = { docId, fresh, reload, edit(fields), refresh() }  fresh: acabou de sair do formulário (ainda não guardado, ou alterado) */
  function showDoc(type, R, F, f, o) {
    var body = h('div', null, UI.loading()), first = UI.firstName(nameOf(R)), title = C.DOC_TYPES[type] + ' de ' + first;
    var sh0 = UI.sheet({ title: C.DOC_TYPES[type], wide: true, content: body });
    API.pro.settings().then(function (st) {
      var savedId = o.docId || null, sh;
      var node = BUILD[type](R, F, st, f);
      var extra = [];
      if (o.fresh) {
        var saveBtn = UI.button(savedId ? 'Atualizar cópia na ficha' : 'Guardar cópia na ficha', { variant: 'ghost', icon: 'files', onclick: function () {
          UI.busy(saveBtn, true);
          API.pro.saveDoc(R.record_id, savedId ? { id: savedId, data: { type: type, fields: f } } : { kind: 'document', title: C.DOC_TYPES[type], data: { type: type, fields: f } }).then(function (id) {
            savedId = savedId || id;
            saveBtn.setAttribute('data-label', 'Cópia guardada na ficha'); UI.busy(saveBtn, false); saveBtn.disabled = true;
            UI.toast('Cópia guardada na ficha.', 'circle-check'); if (o.reload) o.reload();
          }).catch(function (e) { UI.busy(saveBtn, false); Diag.error('guardar-documento', e); UI.toast(UI.errorText(e, 'Não foi possível guardar agora. Tente de novo.')); });
        } });
        extra.push(saveBtn);
      }
      extra.push(UI.button('Editar dados', { variant: 'ghost', icon: 'pencil', onclick: function () { sh.close('swap'); o.edit(f, savedId); } }));
      if (type === 'tcle') {
        var minor = R.minor;
        extra.push(UI.button('Assinar na tela', { variant: 'ghost', icon: 'pen-line', onclick: function () {
          sh.close('swap');
          signaturePad('Assinatura ' + (minor ? 'do responsável' : 'do paciente'), minor ? 'o responsável' : 'o paciente', function (data) {
            var day = UI.today();
            API.pro.saveFicha(R.record_id, { clinical: { tcle_accepted: true, tcle_date: day, tcle_signature: data } }).then(function () {
              F.clinical = Object.assign({}, F.clinical, { tcle_accepted: true, tcle_date: day, tcle_signature: data });
              UI.toast('Assinatura registrada. TCLE marcado como assinado.', 'circle-check');
              if (o.refresh) o.refresh();
              showDoc(type, R, F, f, o);
            }).catch(function (e) { Diag.error('assinar-tcle', e); UI.toast(UI.errorText(e, 'Não foi possível salvar a assinatura. Tente de novo.')); showDoc(type, R, F, f, o); });
          });
        } }));
        if (!(F.clinical && F.clinical.tcle_accepted)) extra.push(UI.button('Assinado no papel', { variant: 'ghost', icon: 'check', onclick: function (ev) {
          var b = ev.currentTarget, day = UI.today();
          UI.busy(b, true);
          API.pro.saveFicha(R.record_id, { clinical: { tcle_accepted: true, tcle_date: day } }).then(function () {
            F.clinical = Object.assign({}, F.clinical, { tcle_accepted: true, tcle_date: day });
            sh.close('swap'); UI.toast('TCLE marcado como assinado em papel.', 'circle-check');
            if (o.refresh) o.refresh();
          }).catch(function (e) { UI.busy(b, false); Diag.error('tcle-papel', e); UI.toast(UI.errorText(e)); });
        } }));
      }
      if (!o.fresh && o.docId) extra.push(UI.button('Apagar', { variant: 'ghost', icon: 'trash-2', onclick: function () {
        S.confirmDelete(sh, { id: o.docId, title: 'Apagar esta cópia?', text: 'A cópia guardada some da ficha. Isso não tem volta.', done: 'Cópia apagada.', tag: 'apagar-documento', after: o.reload }, function () { showDoc(type, R, F, f, o); });
      } }));
      sh0.close('swap');
      sh = P.preview(title, node, extra);
    }).catch(function (e) { Diag.error('documento', e); clear(body); body.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível montar o documento agora. Tente de novo.'))); });
  }

  /* ---------------------------------------------------------------- formulários */
  function fieldsOf(list) { return list.map(function (x) { return x.el; }); }

  function declarationForm(R, F, init, ctl) {
    var today = UI.today(), f0 = init || {};
    var body = h('div', null, UI.loading()), sh = UI.sheet({ title: 'Declaração de comparecimento', wide: true, content: body });
    API.pro.sessions(R.record_id, 300).catch(function () { return []; }).then(function (list) {
      var past = list.filter(function (s) { return (s.status === 'done' || (s.status === 'scheduled' && new Date(s.starts_at).getTime() < Date.now())); });
      var pick = UI.field({ label: 'Sessão', type: 'select', optional: true, options: [['', 'Escolher a data e o horário na mão']].concat(past.slice(0, 60).map(function (s) { return [s.id, sessionLabel(s) + ' (' + (SESSION_STATUS[s.status] || s.status) + ')']; })) });
      var date = UI.field({ label: 'Data do comparecimento', type: 'date', required: true, max: today, min: '1900-01-01', value: f0.date || today });
      var start = UI.field({ label: 'Início', type: 'time', optional: true, value: f0.start || '' });
      var end = UI.field({ label: 'Fim', type: 'time', optional: true, value: f0.end || '' });
      var purpose = UI.field({ label: 'Finalidade ou observação', type: 'textarea', rows: 2, cls: 'short', optional: true, maxlength: 300, value: f0.purpose || '', placeholder: 'Ex.: Para apresentação no trabalho.' });
      pick.input.addEventListener('change', function () {
        var s = past.filter(function (x) { return x.id === pick.value(); })[0];
        if (!s) return;
        date.input.value = UI.dt.dayOf(s.starts_at); start.input.value = UI.dt.hmOf(s.starts_at);
        end.input.value = UI.dt.hmOf(new Date(Date.parse(s.starts_at) + (s.duration_minutes || 50) * 60000).toISOString());
      });
      var general = h('div', { 'aria-live': 'polite' }), btn = UI.button('Ver documento', { type: 'submit' });
      clear(body);
      body.appendChild(h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); clear(general);
        if (!date.value() || date.value() > today) { date.setError('Escolha a data do comparecimento.'); date.input.focus(); return; }
        if (start.value() && end.value() && end.value() < start.value()) { end.setError('O fim não pode ser antes do início.'); end.input.focus(); return; }
        var f = { date: date.value(), issue_date: f0.issue_date || today };
        if (start.value()) f.start = start.value();
        if (end.value() && start.value()) f.end = end.value();
        if (txt(purpose.value())) f.purpose = txt(purpose.value());
        sh.close('swap'); ctl.show('declaration', f);
      } }, past.length ? pick.el : null, h('div', { class: 'grid2' }, date.el, h('div')), h('div', { class: 'grid2' }, start.el, end.el), purpose.el, general, btn));
    });
    return sh;
  }

  function tcleForm(R, F, init, ctl) {
    var c = (F && F.clinical) || {}, f0 = init || {}, sh;
    var freqDefault = f0.frequency || C.LABEL.frequency[F && F.frequency] || 'Semanal', modeDefault = f0.mode || C.LABEL.modality[F && F.modality] || 'Presencial';
    var fee = UI.field({ label: 'Valor da sessão (R$)', inputmode: 'decimal', maxlength: 10, optional: true,
      value: f0.fee_cents != null ? C.moneyText(f0.fee_cents) : (F && F.session_price_cents != null ? C.moneyText(F.session_price_cents) : '') });
    var mins = UI.field({ label: 'Duração (min)', inputmode: 'numeric', maxlength: 3, value: String(f0.minutes || (F && F.session_minutes) || 50) });
    var freq = UI.field({ label: 'Frequência', type: 'select', options: C.TCLE_FREQ.map(function (x) { return [x, x]; }), value: freqDefault });
    var mode = UI.field({ label: 'Modalidade', type: 'select', options: C.TCLE_MODE.map(function (x) { return [x, x]; }), value: modeDefault });
    var sched = UI.field({ label: 'Dia e horário combinados', optional: true, maxlength: 100, value: f0.schedule || c.pref_time || '', placeholder: 'Ex.: terças às 18h' });
    var when = UI.field({ label: 'Quando é pago', type: 'select', options: C.TCLE_WHEN.map(function (x) { return [x, x]; }), value: f0.pay_when || C.TCLE_WHEN[0] });
    var methods = UI.field({ label: 'Formas de pagamento aceitas', maxlength: 120, value: f0.pay_methods || 'Pix, dinheiro ou cartão' });
    var hours = UI.field({ label: 'Aviso mínimo para desmarcar (horas)', inputmode: 'numeric', maxlength: 3, value: String(f0.notice_hours != null ? f0.notice_hours : 24) });
    var charge = UI.checkbox({ label: 'Faltas sem aviso dentro desse prazo são cobradas' });
    charge.input.checked = init ? !!f0.charge_absence : true;
    var extra = UI.field({ label: 'Cláusulas adicionais', type: 'textarea', rows: 3, cls: 'short', optional: true, maxlength: 2000, value: f0.extra || '' });
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button('Ver documento', { type: 'submit' });
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [], cents = null, m = Number(txt(mins.value())), hr = Number(txt(hours.value()));
      if (txt(fee.value())) { cents = C.parseMoney(fee.value()); if (cents === null || isNaN(cents)) { fee.setError('Confira o valor.'); bads.push(fee.input); } }
      if (!isFinite(m) || m % 1 !== 0 || m < 5 || m > 600) { mins.setError('Use de 5 a 600 minutos.'); bads.push(mins.input); }
      if (!txt(hours.value()) || !isFinite(hr) || hr % 1 !== 0 || hr < 0 || hr > 168) { hours.setError('Use de 0 a 168 horas.'); bads.push(hours.input); }
      if (!txt(methods.value())) { methods.setError('Informe as formas de pagamento.'); bads.push(methods.input); }
      if (bads.length) { S.focusFirst(bads); return; }
      var f = { minutes: m, frequency: freq.value(), mode: mode.value(), pay_when: when.value(), pay_methods: txt(methods.value()), notice_hours: hr, issue_date: f0.issue_date || UI.today() };
      if (cents) f.fee_cents = cents;
      if (txt(sched.value())) f.schedule = txt(sched.value());
      if (charge.checked()) f.charge_absence = true;
      if (txt(extra.value())) f.extra = txt(extra.value());
      sh.close('swap'); ctl.show('tcle', f);
    } },
      h('p', { class: 'small muted' }, 'Modelo com cláusulas usuais. Confira e ajuste ao seu contexto antes de usar. Ele não substitui a orientação do seu Conselho Regional.'),
      h('div', { class: 'grid2' }, fee.el, mins.el), h('div', { class: 'grid2' }, freq.el, mode.el), sched.el, when.el, methods.el, hours.el, charge.el, extra.el, general, btn);
    sh = UI.sheet({ title: 'Contrato e TCLE', wide: true, content: form, focus: fee.input });
    return sh;
  }

  function reportForm(R, F, init, ctl) {
    var f0 = init || {}, c = (F && F.clinical) || {}, body = h('div', null, UI.loading()), sh = UI.sheet({ title: 'Relatório psicológico', wide: true, content: body });
    (init ? Promise.resolve([]) : API.pro.sessions(R.record_id, 1000).catch(function () { return []; })).then(function (list) {
      var done = list.filter(function (s) { return s.status === 'done'; }).sort(function (a, b) { return a.starts_at < b.starts_at ? -1 : 1; });
      var proc = f0.procedure || 'Foram realizados ' + done.length + (done.length === 1 ? ' atendimento psicológico' : ' atendimentos psicológicos') +
        (done.length ? ', entre ' + UI.fmtDate(UI.dt.dayOf(done[0].starts_at)) + ' e ' + UI.fmtDate(UI.dt.dayOf(done[done.length - 1].starts_at)) : '') +
        ', na modalidade ' + String(C.LABEL.modality[F && F.modality] || 'presencial').toLowerCase() + ', com utilização de entrevistas e observação clínica.';
      var requester = UI.field({ label: 'Solicitante ou interessado', required: true, maxlength: 200, value: f0.requester || 'O(A) próprio(a) paciente', placeholder: 'Ex.: o(a) próprio(a) paciente, escola, empresa' });
      var purpose = UI.field({ label: 'Finalidade do relatório', type: 'textarea', rows: 2, cls: 'short', required: true, maxlength: 500, value: f0.purpose || '', placeholder: 'Ex.: Apresentar à escola o acompanhamento realizado.' });
      var demand = UI.field({ label: '1. Descrição da demanda', type: 'textarea', rows: 4, cls: 'mid', optional: true, maxlength: 4000, value: f0.demand != null ? f0.demand : (c.complaint || '') });
      var procedure = UI.field({ label: '2. Procedimento', type: 'textarea', rows: 4, cls: 'mid', optional: true, maxlength: 4000, value: proc });
      var analysis = UI.field({ label: '3. Análise', type: 'textarea', rows: 6, cls: 'mid', optional: true, maxlength: 8000, value: f0.analysis || '', hint: 'Descreva a compreensão do caso de forma objetiva, sem juízos de valor e sem detalhes que não respondam à finalidade.' });
      var conclusion = UI.field({ label: '4. Conclusão', type: 'textarea', rows: 4, cls: 'mid', optional: true, maxlength: 4000, value: f0.conclusion || '' });
      var date = UI.field({ label: 'Data do documento', type: 'date', required: true, min: '1900-01-01', value: f0.issue_date || UI.today() });
      var general = h('div', { 'aria-live': 'polite' }), btn = UI.button('Ver documento', { type: 'submit' });
      clear(body);
      body.appendChild(h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); clear(general);
        var bads = [];
        if (!txt(requester.value())) { requester.setError('Informe quem solicitou.'); bads.push(requester.input); }
        if (!txt(purpose.value())) { purpose.setError('Informe a finalidade.'); bads.push(purpose.input); }
        if (!date.value()) { date.setError('Escolha a data.'); bads.push(date.input); }
        if (bads.length) { S.focusFirst(bads); return; }
        var f = { requester: txt(requester.value()), purpose: txt(purpose.value()), issue_date: date.value() };
        [['demand', demand], ['procedure', procedure], ['analysis', analysis], ['conclusion', conclusion]].forEach(function (p) { if (txt(p[1].value())) f[p[0]] = txt(p[1].value()); });
        sh.close('swap'); ctl.show('report', f);
      } }, h('p', { class: 'small muted' }, 'Estrutura da Resolução CFP nº 06/2019: identificação, demanda, procedimento, análise e conclusão. Inclua só o necessário para a finalidade (princípio do mínimo necessário).'),
        requester.el, purpose.el, demand.el, procedure.el, analysis.el, conclusion.el, date.el, general, btn));
    });
    return sh;
  }

  function referralForm(R, F, init, ctl) {
    var f0 = init || {}, sh;
    var to = UI.field({ label: 'Para (profissional ou serviço)', required: true, maxlength: 200, value: f0.to || '', placeholder: 'Ex.: Dr(a). Nome, UBS, CAPS' });
    var spec = UI.field({ label: 'Especialidade ou serviço indicado', optional: true, maxlength: 120, value: f0.specialty || '', placeholder: 'Ex.: psiquiatria, neurologia' });
    var reason = UI.field({ label: 'Motivo do encaminhamento', type: 'textarea', rows: 4, cls: 'mid', required: true, maxlength: 4000, value: f0.reason || '', hint: 'Resuma só o necessário para o outro profissional.' });
    var notes = UI.field({ label: 'Observações e cuidados', type: 'textarea', rows: 3, cls: 'short', optional: true, maxlength: 2000, value: f0.notes || '' });
    var back = UI.checkbox({ label: 'Solicitar retorno ou devolutiva do profissional' });
    back.input.checked = init ? !!f0.want_feedback : true;
    var date = UI.field({ label: 'Data do documento', type: 'date', required: true, min: '1900-01-01', value: f0.issue_date || UI.today() });
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button('Ver documento', { type: 'submit' });
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [];
      if (!txt(to.value())) { to.setError('Informe para quem é o encaminhamento.'); bads.push(to.input); }
      if (!txt(reason.value())) { reason.setError('Informe o motivo.'); bads.push(reason.input); }
      if (!date.value()) { date.setError('Escolha a data.'); bads.push(date.input); }
      if (bads.length) { S.focusFirst(bads); return; }
      var f = { to: txt(to.value()), reason: txt(reason.value()), issue_date: date.value() };
      if (txt(spec.value())) f.specialty = txt(spec.value());
      if (txt(notes.value())) f.notes = txt(notes.value());
      if (back.checked()) f.want_feedback = true;
      sh.close('swap'); ctl.show('referral', f);
    } }, to.el, spec.el, reason.el, notes.el, back.el, date.el, general, btn);
    sh = UI.sheet({ title: 'Encaminhamento', wide: true, content: form, focus: to.input });
    return sh;
  }
  var FORM = { declaration: declarationForm, tcle: tcleForm, report: reportForm, referral: referralForm };

  /* ---------------------------------------------------------------- anexos */
  function readB64(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () { var d = String(rd.result); resolve(d.slice(d.indexOf(',') + 1)); };
      rd.onerror = function () { reject(new Error('file_invalid')); };
      rd.readAsDataURL(file);
    });
  }
  /* Foto vira JPEG de até 1800 px; PDF segue como está. Devolve { b64, mime, size, name } */
  function prepareFile(file) {
    var isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name || ''), isImg = /^image\//.test(file.type);
    if (!isPdf && !isImg) return Promise.reject(new Error('file_type_invalid'));
    var base = String(file.name || 'Anexo').replace(/\.[^.]+$/, '') || 'Anexo';
    if (isPdf) {
      if (file.size > C.ATT_MAX) return Promise.reject(new Error('file_too_large'));
      return readB64(file).then(function (b64) { return { b64: b64, mime: 'application/pdf', size: file.size, name: base + '.pdf', label: base }; });
    }
    return C.imageFromFile(file, { maxW: 1800, maxH: 1800, limit: 6400000, type: 'jpeg' }).then(function (url) {
      var b64 = url.slice(url.indexOf(',') + 1);
      return { b64: b64, mime: 'image/jpeg', size: Math.floor(b64.length * 3 / 4), name: base + '.jpg', label: base };
    });
  }

  function saveToDevice(name, mime, b64) {
    try {
      if (window.Native && Native.saveBinary) { UI.toast('Arquivo salvo em ' + Native.saveBinary(name, mime, b64, true), 'circle-check'); return; }
      var bin = atob(b64), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr], { type: mime })), a = h('a', { href: url, download: name });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      UI.toast('Arquivo baixado.', 'circle-check');
    } catch (e) { Diag.error('baixar-anexo', e); UI.toast('Não deu para salvar o arquivo.'); }
  }

  function attachmentSheet(R, doc, reload) {
    var d = doc.data || {}, isImg = /^image\//.test(d.mime), sh, body = h('div', null, UI.loading());
    sh = UI.sheet({ title: d.label || doc.title, wide: true, content: body });
    API.pro.attachmentGet(doc.id).then(function (a) {
      clear(body);
      var label = UI.field({ label: 'Nome do anexo', maxlength: 120, value: a.label || d.label || '' });
      if (isImg) body.appendChild(h('div', { class: 'att-view' }, h('img', { src: 'data:' + a.mime + ';base64,' + a.content_b64, alt: a.label || 'Anexo' })));
      else body.appendChild(h('div', { class: 'att-view pdf' }, h('span', { class: 'ico-box lg' }, UI.svg('file-text', 28)), h('b', null, a.file_name), h('span', { class: 'small muted' }, 'Documento PDF. Use o botão abaixo para abrir em outro app.')));
      body.appendChild(h('p', { class: 'small muted' }, C.fmtSize(a.size) + ' · adicionado em ' + UI.fmtDate(a.doc_date)));
      var general = h('div', { 'aria-live': 'polite' });
      body.appendChild(h('div', { class: 'btn-row mt16' },
        UI.button(isImg ? 'Salvar ou compartilhar' : 'Abrir ou compartilhar', { auto: true, icon: 'download', onclick: function () { saveToDevice(a.file_name, a.mime, a.content_b64); } })));
      body.appendChild(h('form', { class: 'mt16', novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); clear(general);
        if (!txt(label.value())) { label.setError('Digite um nome.'); label.input.focus(); return; }
        var b = ev.currentTarget.querySelector('button[type=submit]'); UI.busy(b, true);
        API.pro.attachmentSave(R.record_id, { id: doc.id, label: txt(label.value()) }).then(function () { sh.close('done'); UI.toast('Nome salvo.', 'circle-check'); reload(); })
          .catch(function (e) { UI.busy(b, false); Diag.error('renomear-anexo', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.'))); });
      } }, label.el, general, UI.button('Salvar nome', { type: 'submit', variant: 'ghost', auto: true })));
      body.appendChild(h('button', { type: 'button', class: 'btn ghost danger-link mt8', onclick: function () {
        S.confirmDelete(sh, { id: doc.id, title: 'Apagar este anexo?', text: 'O arquivo some para sempre. Isso não tem volta.', done: 'Anexo apagado.', tag: 'apagar-anexo', after: reload }, function () { attachmentSheet(R, doc, reload); });
      } }, UI.svg('trash-2', 18), 'Apagar anexo'));
    }).catch(function (e) { Diag.error('abrir-anexo', e); clear(body); body.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível abrir o anexo agora. Tente de novo.'))); });
    return sh;
  }

  function newAttachmentSheet(R, prep, reload) {
    var label = UI.field({ label: 'Nome do anexo', maxlength: 120, value: prep.label.slice(0, 120) });
    var date = UI.field({ label: 'Data do documento', type: 'date', max: UI.dt.addDays(UI.today(), 1), min: '1900-01-01', value: UI.today() });
    var general = h('div', { 'aria-live': 'polite' }), btn = UI.button('Guardar anexo', { type: 'submit' }), sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      if (!txt(label.value())) { label.setError('Digite um nome.'); label.input.focus(); return; }
      UI.busy(btn, true);
      API.pro.attachmentSave(R.record_id, { label: txt(label.value()), file_name: prep.name, mime: prep.mime, content_b64: prep.b64, doc_date: date.value() || UI.today() }).then(function () {
        sh.close('done'); UI.toast('Anexo guardado.', 'circle-check'); reload();
      }).catch(function (e) { UI.busy(btn, false); Diag.error('guardar-anexo', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível guardar agora. Tente de novo.'))); });
    } }, h('p', { class: 'muted' }, prep.name + ' · ' + C.fmtSize(prep.size)), label.el, date.el, general, btn);
    sh = UI.sheet({ title: 'Novo anexo', content: form, focus: label.input });
    return sh;
  }

  function pickFile(R, reload) {
    var inp = h('input', { type: 'file', accept: 'image/*,application/pdf', class: 'sr-only', 'aria-label': 'Escolher foto ou PDF', tabindex: '-1' });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (inp.parentNode) inp.parentNode.removeChild(inp);
      if (!f) return;
      prepareFile(f).then(function (prep) {
        if (prep.size > C.ATT_MAX) throw new Error('file_too_large');
        newAttachmentSheet(R, prep, reload);
      }).catch(function (e) { Diag.error('preparar-anexo', e); UI.toast(UI.errorText(e, 'Não foi possível ler o arquivo.')); });
    });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 120000);
  }

  /* ---------------------------------------------------------------- aba Documentos */
  S.documentsPanel = function (ctx, R, F, reloadFicha) {
    F = F || { clinical: {} };
    var verified = !!(ctx.me.professional && ctx.me.professional.verification === 'verified');
    var box = h('div'), statusBox = h('div'), emitBox = h('div'), savedBox = h('div', null, UI.loading()), attBox = h('div', null, UI.loading());
    var saved = [], atts = [];

    function ctl() {
      return {
        show: function (type, f, extra) {
          showDoc(type, R, F, f, Object.assign({ fresh: true, reload: loadSaved, refresh: drawStatus, edit: function (fields, docId) { openForm(type, fields, docId); } }, extra || {}));
        }
      };
    }
    function openForm(type, init, docId) {
      var c = ctl();
      c.show = (function (orig) { return function (t, f) { orig(t, f, { docId: docId || null }); }; })(c.show);
      FORM[type](R, F, init || null, c);
    }

    function drawStatus() {
      clear(statusBox);
      var c = F.clinical || {};
      statusBox.appendChild(c.tcle_accepted
        ? UI.notice('ok', 'Contrato e TCLE assinados' + (c.tcle_date ? ' em ' + UI.fmtDate(c.tcle_date) : '') + '.')
        : UI.notice('info', 'Contrato e TCLE ainda não assinados.'));
    }

    function drawEmit() {
      clear(emitBox);
      if (!verified) emitBox.appendChild(UI.notice('warn', 'Os documentos levam o seu CRP, então liberam depois que ele for confirmado.'));
      var subs = { declaration: 'Data e horário de uma sessão', tcle: 'Com assinatura na tela', report: 'Resolução CFP 06/2019', referral: 'Para outro profissional' };
      emitBox.appendChild(h('div', { class: 'group' }, ['declaration', 'tcle', 'report', 'referral'].map(function (t) {
        return h('button', { type: 'button', class: 'item', disabled: verified ? null : true, onclick: function () { openForm(t, null, null); } },
          h('span', { class: 'ico-box' }, UI.svg(ICON[t], 20)), h('span', { class: 'grow' }, h('span', { class: 't' }, C.DOC_TYPES[t]), h('span', { class: 's' }, subs[t])),
          h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
      })));
    }

    function savedSub(d) {
      var f = (d.data && d.data.fields) || {};
      if (d.data.type === 'declaration') return 'Comparecimento em ' + UI.fmtDate(f.date);
      if (d.data.type === 'report') return f.purpose || '';
      if (d.data.type === 'referral') return 'Para ' + f.to;
      return f.mode ? f.frequency + ', ' + f.mode.toLowerCase() : '';
    }
    function drawSaved() {
      clear(savedBox);
      if (!saved.length) { savedBox.appendChild(UI.empty('files', 'Nenhuma cópia guardada', 'Use "Guardar cópia na ficha" ao gerar um documento.')); return; }
      savedBox.appendChild(h('div', { class: 'group' }, saved.map(function (d) {
        var t = d.data.type;
        return h('button', { type: 'button', class: 'item', onclick: function () {
          showDoc(t, R, F, d.data.fields || {}, { fresh: false, docId: d.id, reload: loadSaved, refresh: drawStatus, edit: function (fields, docId) { openForm(t, fields, docId || d.id); } });
        } }, h('span', { class: 'ico-box' }, UI.svg(ICON[t] || 'file-text', 20)),
          h('span', { class: 'grow' }, h('span', { class: 't' }, C.DOC_TYPES[t] || d.title), h('span', { class: 's' }, [UI.fmtDate(d.doc_date), savedSub(d)].filter(Boolean).join(' · '))),
          h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
      })));
    }
    function loadSaved() {
      return API.pro.docs(R.record_id, 'document', 200).then(function (l) {
        saved = l.filter(function (d) { return d.data && C.DOC_TYPES[d.data.type]; }).sort(function (a, b) { return a.doc_date < b.doc_date ? 1 : a.doc_date > b.doc_date ? -1 : 0; });
        drawSaved();
      }).catch(function (e) { failBox(savedBox, e, 'documentos-guardados'); });
    }

    function drawAtts() {
      clear(attBox);
      attBox.appendChild(h('p', { class: 'small muted' }, 'Laudos, exames e PDFs. Até ' + C.fmtSize(C.ATT_MAX) + ' cada, cifrados.'));
      if (!atts.length) { attBox.appendChild(UI.empty('paperclip', 'Nenhum anexo')); return; }
      attBox.appendChild(h('div', { class: 'group' }, atts.map(function (a) {
        var d = a.data || {};
        return h('button', { type: 'button', class: 'item', onclick: function () { attachmentSheet(R, a, loadAtts); } },
          h('span', { class: 'ico-box' }, UI.svg(/^image\//.test(d.mime) ? 'image' : 'file-text', 20)),
          h('span', { class: 'grow' }, h('span', { class: 't' }, d.label || a.title), h('span', { class: 's' }, UI.fmtDate(a.doc_date) + ' · ' + C.fmtSize(d.size))),
          h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
      })));
    }
    function loadAtts() {
      return API.pro.docs(R.record_id, 'attachment', 200).then(function (l) {
        atts = l.slice().sort(function (a, b) { return a.doc_date < b.doc_date ? 1 : a.doc_date > b.doc_date ? -1 : 0; });
        drawAtts();
      }).catch(function (e) { failBox(attBox, e, 'anexos'); });
    }

    drawStatus(); drawEmit();
    box.appendChild(statusBox);
    box.appendChild(card('Emitir documento', null, emitBox));
    box.appendChild(card('Cópias guardadas', null, savedBox));
    box.appendChild(card('Anexos', UI.button('Adicionar arquivo', { auto: true, icon: 'upload', onclick: function () { pickFile(R, loadAtts); } }), attBox));
    loadSaved(); loadAtts();
    return box;
  };
})();
