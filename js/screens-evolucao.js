/* Psicólogo: evolução por sessão (lista, nova evolução ligada a uma sessão, rascunhos) e prontuário em PDF.
   Texto cifrado no servidor. Só componentes do site. */
(function () {
  'use strict';
  var h = UI.h, C = window.Clinic, P = window.PrintDoc;
  var S = window.Screens = window.Screens || {};

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function txt(s) { return String(s == null ? '' : s).trim(); }
  var SESSION_STATUS = { scheduled: 'Marcada', done: 'Realizada', no_show: 'Faltou', canceled_by_patient: 'Cancelada pelo paciente', canceled_by_professional: 'Cancelada por você', reschedule_proposed: 'Remarcação proposta' };
  var MODE = { in_person: 'Presencial', online: 'Online' };

  function sessionLabel(s) { return UI.fmtDate(UI.dt.dayOf(s.starts_at)) + ' às ' + UI.dt.hmOf(s.starts_at); }
  function moodText(m) { return m + '/5, ' + Charts.MOOD[m - 1].toLowerCase(); }

  /* ---------------------------------------------------------------- janela: nova evolução ou editar
     o.note = evolução existente | null, o.sessions = sessões do paciente, o.preset = { appointment_id, doc_date }, o.onSaved() */
  S.noteSheet = function (R, o) {
    var note = o.note || null, preset = o.preset || {}, today = UI.today();
    var linkedId = note ? note.appointment_id : preset.appointment_id || null;
    var free = (o.sessions || []).filter(function (s) { return s.id === linkedId || (!s.has_note && s.status !== 'canceled_by_patient' && s.status !== 'canceled_by_professional'); });
    var date = UI.field({ label: 'Data', type: 'date', required: true, max: today, min: '1900-01-01', value: note ? note.doc_date : (preset.doc_date || today) });
    var appt = UI.field({ label: 'Sessão', type: 'select', options: [['', 'Sem sessão ligada']].concat(free.map(function (s) { return [s.id, sessionLabel(s) + ' (' + (SESSION_STATUS[s.status] || s.status) + ')']; })), value: linkedId || '' });
    appt.input.addEventListener('change', function () {
      var s = free.filter(function (x) { return x.id === appt.value(); })[0];
      if (s) date.input.value = UI.dt.dayOf(s.starts_at) > today ? today : UI.dt.dayOf(s.starts_at);
    });
    var title = UI.field({ label: 'Título', optional: true, maxlength: 120, value: note ? note.title || '' : '', placeholder: 'Ex.: Primeira sessão' });
    var mood = UI.field({ label: 'Humor do paciente na sessão', type: 'select', options: [['', 'Não registrar']].concat(Charts.MOOD.map(function (m, i) { return [String(i + 1), (i + 1) + ', ' + m]; })), value: note && note.mood ? String(note.mood) : '' });
    var demand = UI.field({ label: 'Demanda ou tema', type: 'textarea', rows: 2, cls: 'short', maxlength: 4000, value: note ? note.demand || '' : '' });
    var interv = UI.field({ label: 'Intervenções', type: 'textarea', rows: 2, cls: 'short', maxlength: 4000, value: note ? note.interventions || '' : '' });
    var body = UI.field({ label: 'Observações e evolução', type: 'textarea', rows: 6, cls: 'mid', maxlength: 20000, value: note ? note.body || '' : '' });
    var plan = UI.field({ label: 'Plano e próximos passos', type: 'textarea', rows: 2, cls: 'short', maxlength: 4000, value: note ? note.plan || '' : '' });
    var personal = UI.checkbox({ label: 'Anotação só minha: não entra no prontuário impresso' });
    personal.input.checked = !!(note && note.personal);
    var isDraft = !!(note && note.draft);
    var reviewed = isDraft ? UI.checkbox({ label: 'Já revisei este texto e ele vale como registro' }) : null;
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button(note ? 'Salvar evolução' : 'Registrar evolução', { type: 'submit' });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); clear(general);
      var bads = [];
      if (!date.value() || date.value() > today) { date.setError('Escolha a data da sessão.'); bads.push(date.input); }
      if (!txt(demand.value()) && !txt(interv.value()) && !txt(body.value()) && !txt(plan.value())) { body.setError('Escreva ao menos um dos campos.'); bads.push(body.input); }
      if (bads.length) { S.focusFirst(bads); return; }
      var patch = { doc_date: date.value(), appointment_id: appt.value() || null, title: txt(title.value()), mood: mood.value() ? Number(mood.value()) : null,
        demand: txt(demand.value()), interventions: txt(interv.value()), body: txt(body.value()), plan: txt(plan.value()), personal: personal.checked() };
      if (note) patch.id = note.id;
      if (reviewed && reviewed.checked()) patch.draft = false;
      UI.busy(btn, true);
      API.pro.saveDoc(R.record_id, patch).then(function () {
        sh.close('done'); UI.toast(note ? 'Evolução salva.' : 'Evolução registrada.', 'circle-check'); o.onSaved();
      }).catch(function (e) {
        UI.busy(btn, false); Diag.error('salvar-evolucao', e);
        general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
      });
    } },
      note && note.origin === 'ia' ? UI.notice('info', 'Este texto foi gerado por IA' + (isDraft ? ' e ainda é um rascunho. Leia, ajuste o que precisar e marque como revisado.' : ' e já foi revisado por você.')) : null,
      h('div', { class: 'grid2' }, date.el, appt.el), title.el, mood.el, demand.el, interv.el, body.el, plan.el, personal.el, reviewed ? reviewed.el : null, general, btn);
    sh = UI.sheet({ title: note ? 'Editar evolução' : 'Nova evolução', content: form, wide: true, focus: body.input });
    return sh;
  };

  /* ---------------------------------------------------------------- aba Evolução */
  var FIELDS = [['demand', 'Demanda ou tema'], ['interventions', 'Intervenções'], ['body', 'Observações e evolução'], ['plan', 'Plano e próximos passos']];

  S.evolutionPanel = function (ctx, R, F) {
    var box = h('div', null, UI.loading());
    var notes = [], sessions = [];

    function noteCard(n) {
      var tags = [];
      if (n.mood) tags.push(h('span', { class: 'tag' }, 'Humor ' + moodText(n.mood)));
      if (n.origin === 'ia') tags.push(h('span', { class: 'badge soft' }, 'Gerado por IA'));
      if (n.draft) tags.push(h('span', { class: 'badge warn' }, 'Rascunho'));
      if (n.personal) tags.push(h('span', { class: 'badge' }, 'Só minha'));
      var ap = n.appointment_id ? sessions.filter(function (s) { return s.id === n.appointment_id; })[0] : null;
      var parts = FIELDS.filter(function (f) { return n[f[0]]; }).map(function (f) { return h('div', { class: 'nf' }, h('b', null, f[1]), h('p', { class: 'pt-body' }, n[f[0]])); });
      return h('article', { class: 'card pt-entry note-card' },
        h('div', { class: 'appt-head' }, h('div', { class: 'appt-when' }, UI.dt.dayLabel(n.doc_date)), h('div', { class: 'row-gap' }, tags)),
        n.title ? h('h3', null, n.title) : null,
        ap ? h('div', { class: 'small muted' }, 'Sessão de ' + sessionLabel(ap) + ', ' + (MODE[ap.mode] || '').toLowerCase()) : null,
        parts,
        h('div', { class: 'btn-row mt16' },
          h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { S.noteSheet(R, { note: n, sessions: sessions, onSaved: load }); } }, UI.svg('pencil', 16), n.draft ? 'Revisar' : 'Editar'),
          h('button', { type: 'button', class: 'btn ghost auto sm danger-link', onclick: function () {
            UI.confirmBox({ title: 'Apagar esta evolução?', text: 'O texto some para sempre. Isso não tem volta.', ok: 'Apagar', danger: true }).then(function (yes) {
              if (!yes) return;
              return API.pro.deleteDoc(n.id).then(function () { UI.toast('Evolução apagada.', 'circle-check'); return load(); });
            }).catch(function (e) { Diag.error('apagar-evolucao', e); UI.toast(UI.errorText(e)); });
          } }, UI.svg('trash-2', 16), 'Apagar')));
    }

    /* Sessões já realizadas (ou que já passaram) sem evolução. */
    function pending() {
      var now = Date.now();
      return sessions.filter(function (s) { return !s.has_note && (s.status === 'done' || (s.status === 'scheduled' && new Date(s.starts_at).getTime() < now)); });
    }

    function draw() {
      clear(box);
      var drafts = notes.filter(function (n) { return n.draft; }).length;
      box.appendChild(h('div', { class: 'sec-title' }, h('h2', null, 'Evolução das sessões'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn auto sm', onclick: function () { S.noteSheet(R, { sessions: sessions, onSaved: load }); } }, UI.svg('plus', 16), 'Nova evolução'),
          h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { S.recordSheet(R, F); } }, UI.svg('file-text', 16), 'Prontuário em PDF'))));
      box.appendChild(h('p', { class: 'small muted' }, 'O que você escreve aqui fica cifrado e só você lê. Não vai para o paciente nem para colegas.'));
      if (drafts) box.appendChild(UI.notice('warn', drafts === 1 ? '1 rascunho esperando a sua revisão. Ele não entra no prontuário até você revisar.' : drafts + ' rascunhos esperando a sua revisão. Eles não entram no prontuário até você revisar.'));
      var pend = pending();
      if (pend.length) {
        box.appendChild(h('section', { class: 'card' }, h('h2', null, pend.length === 1 ? '1 sessão sem evolução' : pend.length + ' sessões sem evolução'),
          h('div', { class: 'group' }, pend.slice(0, 5).map(function (s) {
            return h('button', { type: 'button', class: 'item', onclick: function () { S.noteSheet(R, { sessions: sessions, preset: { appointment_id: s.id, doc_date: UI.dt.dayOf(s.starts_at) }, onSaved: load }); } },
              h('span', { class: 'ico-box' }, UI.svg('calendar-check', 20)), h('span', { class: 'grow' }, h('span', { class: 't' }, sessionLabel(s)), h('span', { class: 's' }, 'Escrever a evolução desta sessão')),
              h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
          })), pend.length > 5 ? h('p', { class: 'small muted mt8 mb0' }, 'Mostrando as 5 mais recentes.') : null));
      }
      if (!notes.length) {
        box.appendChild(UI.empty('notebook-pen', 'Nenhuma evolução ainda', 'Registre o que foi trabalhado em cada sessão. Dá para ligar a evolução a uma consulta da agenda.',
          h('button', { type: 'button', class: 'btn auto', onclick: function () { S.noteSheet(R, { sessions: sessions, onSaved: load }); } }, 'Registrar a primeira')));
        return;
      }
      notes.forEach(function (n) { box.appendChild(noteCard(n)); });
    }

    function load() {
      return Promise.all([API.pro.docs(R.record_id, 'note', 300), API.pro.sessions(R.record_id, 300)]).then(function (r) { notes = r[0]; sessions = r[1]; draw(); })
        .catch(function (e) { Diag.error('evolucao', e); clear(box); box.appendChild(UI.notice('bad', 'Não foi possível carregar as evoluções agora. Atualize a página.')); });
    }
    load();
    return box;
  };

  /* ---------------------------------------------------------------- prontuário em PDF */
  S.recordDocument = function (R, F, st, notes, sessions, extra) {
    F = F || { clinical: {} };
    var c = F.clinical || {}, kids = [];
    var age = UI.ageFrom(R.birth_date);
    kids.push(P.head('PRONTUÁRIO PSICOLÓGICO', st));
    kids.push(P.section('Identificação'));
    kids.push(P.kvTable([['Nome', R.social_name ? R.social_name + ' (nome no cadastro: ' + R.full_name + ')' : R.full_name],
      ['Nascimento', R.birth_date ? UI.fmtDate(R.birth_date) + (age != null && age >= 0 ? ' (' + age + ' anos)' : '') : ''], ['CPF', c.cpf ? C.maskCpf(c.cpf) : ''], ['Gênero', c.gender], ['Estado civil', c.civil],
      ['Profissão', c.job], ['Escolaridade', c.education], ['Celular', R.phone ? UI.formatPhone(R.phone) : ''], ['E-mail', R.email], ['Endereço', [c.address, c.city].filter(Boolean).join(', ')],
      ['Responsável', [R.guardian_name || c.resp_name, c.resp_kin ? '(' + c.resp_kin + ')' : '', R.guardian_phone ? UI.formatPhone(R.guardian_phone) : (c.resp_phone ? UI.formatPhone(c.resp_phone) : ''), c.resp_cpf ? 'CPF ' + C.maskCpf(c.resp_cpf) : ''].filter(Boolean).join(' ')],
      ['Contato de emergência', [c.emerg_name, c.emerg_phone ? UI.formatPhone(c.emerg_phone) : ''].filter(Boolean).join(', ')]]));
    var care = P.kvTable([['Início do acompanhamento', F.started_on ? UI.fmtDate(F.started_on) : ''], ['Situação', C.statusInfo(R.status || 'active').label], ['Modalidade', C.LABEL.modality[F.modality]],
      ['Frequência', C.LABEL.frequency[F.frequency]], ['Tipo de atendimento', F.care_type && F.care_type !== 'individual' ? C.LABEL.care[F.care_type] + (c.participants ? ': ' + c.participants : '') : ''],
      ['Convênio', c.insurance], ['Encaminhado por', c.referred_by], ['Consentimento (TCLE)', c.tcle_accepted ? 'Assinado' + (c.tcle_date ? ' em ' + UI.fmtDate(c.tcle_date) : '') : '']]);
    if (care) { kids.push(P.section('Atendimento')); kids.push(care); }
    var clin = P.kvTable([['Queixa ou demanda', c.complaint], ['Histórico e anamnese', c.history], ['Hipótese diagnóstica ou CID', c.cid], ['Observações gerais', c.notes]]);
    if (clin) { kids.push(P.section('Informações clínicas')); kids.push(clin); }
    if (extra && S.clinicalPaperBlocks) S.clinicalPaperBlocks(extra.meds || [], extra.plans || [], extra.scales || []).forEach(function (n) { kids.push(n); });

    var shown = notes.filter(function (n) { return !n.personal && !n.draft; }).sort(function (a, b) { return a.doc_date < b.doc_date ? -1 : a.doc_date > b.doc_date ? 1 : (a.created_at < b.created_at ? -1 : 1); });
    var drafts = notes.filter(function (n) { return n.draft && !n.personal; }).length;
    kids.push(P.section('Registro de evolução (' + shown.length + ')'));
    if (!shown.length) kids.push(h('p', null, 'Nenhum registro.'));
    shown.forEach(function (n) {
      var ap = n.appointment_id ? sessions.filter(function (s) { return s.id === n.appointment_id; })[0] : null;
      var line = [UI.fmtDate(n.doc_date) + (ap ? ' ' + UI.dt.hmOf(ap.starts_at) : ''), n.title, n.mood ? 'humor ' + n.mood + '/5' : ''].filter(Boolean).join(' · ');
      var node = h('div', { class: 'note' }, h('div', { class: 'nh' }, line));
      FIELDS.forEach(function (f) { if (n[f[0]]) node.appendChild(h('div', { class: 'f' }, h('b', null, f[1] + ': '), n[f[0]])); });
      kids.push(node);
    });
    if (drafts) kids.push(h('p', null, drafts === 1 ? '1 rascunho ainda não revisado ficou de fora deste documento.' : drafts + ' rascunhos ainda não revisados ficaram de fora deste documento.'));

    var real = sessions.filter(function (s) { return s.status !== 'scheduled' || new Date(s.starts_at).getTime() < Date.now(); }).sort(function (a, b) { return a.starts_at < b.starts_at ? -1 : 1; });
    if (real.length) {
      var count = function (st2) { return real.filter(function (s) { return s.status === st2; }).length; };
      kids.push(P.section('Sessões (' + real.length + ')'));
      kids.push(h('p', null, count('done') + ' realizadas, ' + count('no_show') + ' faltas, ' + (count('canceled_by_patient') + count('canceled_by_professional')) + ' canceladas.'));
      kids.push(P.grid([{ t: 'Data' }, { t: 'Horário' }, { t: 'Modalidade' }, { t: 'Situação' }],
        real.map(function (s) { return [UI.fmtDate(UI.dt.dayOf(s.starts_at)), UI.dt.hmOf(s.starts_at), MODE[s.mode] || '', SESSION_STATUS[s.status] || s.status]; })));
    }
    kids.push(P.cityDate(st, UI.today()));
    kids.push(P.signature(st));
    kids.push(P.foot(st, 'Documento sigiloso, de uso exclusivo do profissional responsável pelo atendimento.'));
    return P.paper(kids.filter(Boolean));
  };

  S.recordSheet = function (R, F) {
    var body = h('div', null, UI.loading()), sh = UI.sheet({ title: 'Prontuário', wide: true, content: body });
    function more(kind) { return API.pro.docs(R.record_id, kind, 500).catch(function () { return []; }); }
    Promise.all([API.pro.settings(), API.pro.docs(R.record_id, 'note', 500), API.pro.sessions(R.record_id, 1000), more('med'), more('plan'), more('scale')]).then(function (r) {
      sh.close('swap');
      var doc = S.recordDocument(R, F, r[0], r[1], r[2], { meds: r[3], plans: r[4], scales: r[5] });
      P.preview('Prontuário de ' + UI.firstName(R.social_name || R.full_name), doc);
    }).catch(function (e) { Diag.error('prontuario', e); clear(body); body.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível montar o prontuário agora. Tente de novo.'))); });
    return sh;
  };
})();
