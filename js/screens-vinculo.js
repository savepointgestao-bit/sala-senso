/* Psicólogo: pedidos de vínculo (aceitar ou recusar), encaminhamentos de pacientes entre colegas (pelo CRP) e a janela de transferir.
   Só o psicólogo(a) vincula o paciente: pelo celular do cadastro (o paciente aceita) ou pelo link de cadastro (o psicólogo(a) aceita). */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function crpText(region, number) { return region && number ? 'CRP ' + region + '/' + number : ''; }
  function leftText(iso) {
    var d = Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
    return d <= 0 ? 'vence hoje' : 'vence em ' + d + (d === 1 ? ' dia' : ' dias');
  }
  function ageLine(birth, minor) {
    var a = UI.ageFrom(birth);
    var t = a == null || a < 0 ? '' : a + (a === 1 ? ' ano' : ' anos');
    return minor ? (t ? t + ', menor de 18' : 'menor de 18') : t;
  }

  /* ---------------------------------------------------------------- erros do pedido pelo celular */
  var LINK_ERR = {
    no_account: 'Não achamos uma conta de paciente com esse celular. Peça para a pessoa criar a conta pelo seu link de cadastro, usando este número.',
    phone_ambiguous: 'Mais de uma conta usa esse celular, então não dá para saber qual é. Peça para a pessoa criar a conta pelo seu link de cadastro.',
    phone_required: 'Este cadastro não tem celular. Edite o cadastro e coloque o celular para vincular.',
    already_linked: 'Este paciente já está vinculado a você.'
  };
  S.linkError = function (code) { return LINK_ERR[code] || 'Não foi possível vincular agora. Tente de novo.'; };

  /* ---------------------------------------------------------------- pedidos que chegaram pelo link de cadastro */
  function incomingCard(q, unlinked, onChange) {
    var p = q.patient || {}, match = q.match;
    var opts = [['', match ? 'Cadastro de ' + match.full_name + ' (achado pelo celular ou e-mail)' : 'Criar um cadastro novo']]
      .concat(unlinked.filter(function (r) { return !match || r.record_id !== match.record_id; }).map(function (r) { return [r.record_id, 'Cadastro de ' + r.full_name]; }));
    var sel = unlinked.length ? UI.field({ label: 'Ligar a qual cadastro?', type: 'select', options: opts }) : null;
    var general = h('div', { 'aria-live': 'polite' });
    var yes = UI.button('Aceitar', { onclick: function () { decide(true, yes); } });
    var no = UI.button('Recusar', { variant: 'ghost', onclick: function () { decide(false, no); } });
    function decide(approve, btn) {
      UI.clear(general); UI.busy(btn, true);
      API.pro.decideLink(q.id, approve, approve && sel && sel.input.value ? sel.input.value : null).then(function (recordId) {
        UI.toast(approve ? 'Paciente vinculado. O cadastro já está conferido.' : 'Pedido recusado.', approve ? 'circle-check' : 'info');
        onChange(approve ? recordId : null);
      }).catch(function (e) { UI.busy(btn, false); Diag.error('decidir-pedido', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível responder agora. Tente de novo.'))); });
    }
    var info = [p.phone ? UI.formatPhone(p.phone) : null, p.email, ageLine(p.birth_date, p.minor)].filter(Boolean).join(' · ');
    return h('section', { class: 'card req-card', 'aria-label': 'Pedido de ' + p.name },
      h('div', { class: 'invite-who' }, UI.avatar(p.name || '?'),
        h('div', { class: 'grow' }, h('b', null, p.name), h('div', { class: 'muted small' }, 'pediu para ser seu paciente pelo seu link'), info ? h('div', { class: 'muted small' }, info) : null)),
      match ? UI.notice('info', h('span', null, 'Parece ser o cadastro de ', h('b', null, match.full_name), ', que você já tem. Se aceitar, a conta se junta a ele.')) : null,
      p.minor ? UI.notice('warn', 'É menor de 18 anos. Depois de aceitar, confirme a autorização do responsável na ficha.') : null,
      sel ? sel.el : null,
      h('p', { class: 'small muted' }, 'Aceite só se você reconhece essa pessoa como sua paciente. Aceitar já confere o cadastro. ' + leftText(q.expires_at) + '.'),
      general, h('div', { class: 'btn-row' }, yes, no));
  }

  /* Lista de pedidos de vínculo na tela Pacientes. reqs = pro.linkRequests(); unlinked = fichas sem conta; onChange(recordId|null) recarrega. */
  S.linkRequestsSection = function (reqs, unlinked, onChange) {
    var incoming = reqs.filter(function (q) { return q.origin === 'patient'; });
    var outgoing = reqs.filter(function (q) { return q.origin === 'professional'; });
    if (!incoming.length && !outgoing.length) return null;
    var box = h('section', { 'aria-label': 'Pedidos de vínculo' });
    if (incoming.length) {
      box.appendChild(h('div', { class: 'group-title' }, incoming.length === 1 ? '1 pedido de vínculo' : incoming.length + ' pedidos de vínculo'));
      incoming.forEach(function (q) { box.appendChild(incomingCard(q, unlinked, onChange)); });
    }
    if (outgoing.length) {
      box.appendChild(h('div', { class: 'group-title' }, 'Pedidos que você enviou'));
      box.appendChild(h('div', { class: 'group' }, outgoing.map(function (q) {
        var cancel = h('button', { type: 'button', class: 'linkbtn small danger-link', onclick: function () {
          cancel.disabled = true;
          API.pro.cancelLinkRequest(q.id).then(function () { UI.toast('Pedido cancelado.', 'info'); onChange(null); })
            .catch(function (e) { cancel.disabled = false; Diag.error('cancelar-pedido', e); UI.toast(UI.errorText(e)); });
        } }, 'Cancelar');
        return h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('hourglass', 20)),
          h('a', { class: 'grow', href: q.record_id ? '#/pacientes/' + q.record_id : '#/pacientes' }, h('span', { class: 't' }, q.record_name || 'Paciente'), h('span', { class: 's' }, 'Esperando o paciente aceitar. ' + leftText(q.expires_at) + '.')), cancel);
      })));
    }
    return box;
  };

  /* ---------------------------------------------------------------- encaminhamentos entre colegas */
  var TR_STATUS = { pending: ['warn', 'Aguardando'], accepted: ['ok', 'Aceito'], declined: ['bad', 'Recusado'], canceled: ['', 'Cancelado'] };

  function incomingTransfer(t, onChange) {
    var general = h('div', { 'aria-live': 'polite' });
    var yes = UI.button('Aceitar', { onclick: function () { decide(true, yes); } });
    var no = UI.button('Recusar', { variant: 'ghost', onclick: function () { decide(false, no); } });
    function decide(accept, btn) {
      UI.clear(general); UI.busy(btn, true);
      API.pro.decideTransfer(t.id, accept).then(function (r) {
        if (!accept) { UI.toast('Encaminhamento recusado.', 'info'); onChange(null); return; }
        UI.toast(t.has_account ? 'Paciente recebido. Mandamos o pedido de vínculo para ele(a) decidir.' : 'Paciente recebido. O cadastro já está conferido.', 'circle-check');
        onChange(r && r.record_id);
      }).catch(function (e) { UI.busy(btn, false); Diag.error('decidir-encaminhamento', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível responder agora. Tente de novo.'))); });
    }
    var who = [crpText(t.from_crp_region, t.from_crp_number), leftText(t.expires_at)].filter(Boolean).join(' · ');
    var agePart = t.age != null ? ' (' + t.age + (t.age === 1 ? ' ano' : ' anos') + (t.minor ? ', menor de 18' : '') + ')' : (t.minor ? ' (menor de 18)' : '');
    return h('section', { class: 'card req-card', 'aria-label': 'Encaminhamento de ' + t.from_name },
      h('div', { class: 'invite-who' }, UI.avatar(t.from_name),
        h('div', { class: 'grow' }, h('b', null, t.from_name), h('div', { class: 'muted small' }, who))),
      h('p', { class: 'lead mt16' }, t.from_name + ' quer encaminhar ', h('b', null, t.patient_name), agePart + ' para você.'),
      t.note ? h('p', { class: 'req-note' }, UI.svg('message-circle', 16), t.note) : null,
      h('p', { class: 'small muted' }, 'Ao aceitar, o cadastro (nome, nascimento, celular, e-mail e responsável) passa para você já conferido. Prontuário, financeiro, histórico de consultas e o diário do paciente não passam.'),
      t.has_account ? UI.notice('info', 'O paciente tem conta no Senso. Ao aceitar, mandamos a ele(a) o seu pedido de vínculo, e ele(a) decide.') : null,
      t.minor ? UI.notice('warn', 'É menor de 18 anos. Depois de aceitar, confirme a autorização do responsável na ficha.') : null,
      general, h('div', { class: 'btn-row' }, yes, no));
  }

  /* t = pro.transfers() ({ incoming, outgoing }). */
  S.transfersSection = function (t, onChange) {
    t = t || { incoming: [], outgoing: [] };
    if (!t.incoming.length && !t.outgoing.length) return null;
    var box = h('section', { 'aria-label': 'Encaminhamentos' });
    if (t.incoming.length) {
      box.appendChild(h('div', { class: 'group-title' }, t.incoming.length === 1 ? '1 paciente encaminhado para você' : t.incoming.length + ' pacientes encaminhados para você'));
      t.incoming.forEach(function (x) { box.appendChild(incomingTransfer(x, onChange)); });
    }
    if (t.outgoing.length) {
      box.appendChild(h('div', { class: 'group-title' }, 'Encaminhamentos que você enviou'));
      box.appendChild(h('div', { class: 'group' }, t.outgoing.map(function (x) {
        var st = TR_STATUS[x.status] || ['', x.status];
        var cancel = x.status === 'pending' ? h('button', { type: 'button', class: 'linkbtn small danger-link', onclick: function () {
          cancel.disabled = true;
          API.pro.cancelTransfer(x.id).then(function () { UI.toast('Encaminhamento cancelado.', 'info'); onChange(null); })
            .catch(function (e) { cancel.disabled = false; Diag.error('cancelar-encaminhamento', e); UI.toast(UI.errorText(e)); });
        } }, 'Cancelar') : null;
        return h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('arrow-right', 20)),
          h('a', { class: 'grow', href: '#/pacientes/' + x.record_id }, h('span', { class: 't' }, x.patient_name + ' para ' + x.to_name),
            h('span', { class: 's' }, crpText(x.to_crp_region, x.to_crp_number) + (x.status === 'pending' ? ' · ' + leftText(x.expires_at) : ''))),
          h('span', { class: 'badge ' + st[0] }, st[1]), cancel);
      })));
    }
    return box;
  };

  /* ---------------------------------------------------------------- janela: transferir paciente */
  var PASSES = [
    'Nome, data de nascimento, celular e e-mail do cadastro.',
    'Nome e celular do responsável, se for menor de 18 anos.'
  ];
  var STAYS = [
    'Prontuário e evoluções.',
    'Financeiro, pagamentos e recibos.',
    'Histórico de consultas e avaliações.',
    'O diário e o humor do paciente: são dele(a) e ficam na conta dele(a).',
    'A autorização do responsável: o colega confirma de novo.'
  ];

  /* rec = ficha (record_id, full_name, linked, minor). onDone() recarrega a ficha. */
  S.transferSheet = function (rec, onDone) {
    var crp = UI.field({ label: 'CRP do colega', inputmode: 'numeric', required: true, placeholder: '06/123456', maxlength: 11, hint: 'Ele(a) precisa ter cadastro no Senso, com o CRP confirmado.' });
    var found = null, lookupBox = h('div', { 'aria-live': 'polite' });
    var searchBtn = UI.button('Buscar colega', { variant: 'ghost', onclick: function () { lookup(); } });
    var note = UI.field({ label: 'Recado para o colega', type: 'textarea', optional: true, rows: 3, maxlength: 300, hint: 'Sem informação clínica.' });
    var attest = UI.checkbox({ label: rec.minor
      ? 'Confirmo que o responsável pelo paciente concordou com o encaminhamento e com o envio dos dados de cadastro ao colega.'
      : 'Confirmo que o paciente concordou com o encaminhamento e com o envio dos dados de cadastro ao colega.' });
    var general = h('div', { 'aria-live': 'polite' });
    var send = UI.button('Enviar encaminhamento', { type: 'submit', disabled: true });
    var sh;

    crp.input.addEventListener('input', function () { found = null; send.disabled = true; UI.clear(lookupBox); });
    function lookup() {
      UI.clear(lookupBox); found = null; send.disabled = true;
      var c = UI.parseCrp(crp.value());
      if (!c) { crp.setError('CRP inválido. Use região de 01 a 24 e o número, como 06/123456.'); crp.input.focus(); return Promise.resolve(); }
      UI.busy(searchBtn, true);
      return API.pro.findColleague(c.region, c.number).then(function (r) {
        UI.busy(searchBtn, false);
        if (r && r.ok) {
          found = { region: c.region, number: c.number, name: r.name };
          lookupBox.appendChild(h('div', { class: 'invite-who colleague' }, UI.avatar(r.name), h('div', { class: 'grow' }, h('b', null, r.name), h('div', { class: 'muted small' }, crpText(r.crp_region, r.crp_number)),
            h('div', { class: 'mt8' }, h('span', { class: 'badge ok' }, UI.svg('badge-check', 14), 'CRP verificado')))));
          send.disabled = false;
        } else {
          lookupBox.appendChild(UI.notice('warn', r && r.error === 'crp_invalid' ? 'CRP inválido. Use região de 01 a 24 e o número.'
            : 'Não achamos psicólogo(a) com esse CRP no Senso. Ele(a) precisa ter cadastro e o CRP confirmado. Convide o colega a criar a conta e tente de novo.'));
        }
      }).catch(function (e) { UI.busy(searchBtn, false); Diag.error('buscar-colega', e); lookupBox.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível buscar agora. Tente de novo.'))); });
    }
    crp.input.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); lookup(); } });

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); UI.clear(general);
      if (!found) { crp.setError('Busque o colega pelo CRP antes de enviar.'); crp.input.focus(); return; }
      if (!attest.checked()) { attest.setError('Marque para enviar o encaminhamento.'); attest.input.focus(); return; }
      UI.busy(send, true);
      API.pro.requestTransfer(rec.record_id, found.region, found.number, true, note.value().trim()).then(function (r) {
        if (r && r.ok) { sh.close('done'); UI.toast('Encaminhamento enviado a ' + found.name + '. Avisamos você quando ele(a) responder.', 'circle-check'); onDone(); return; }
        UI.busy(send, false);
        general.appendChild(UI.notice('warn', 'Não achamos psicólogo(a) com esse CRP no Senso.'));
      }).catch(function (e) {
        UI.busy(send, false); Diag.error('encaminhar', e);
        var m = String((e && e.message) || '');
        general.appendChild(UI.notice('bad', /already_pending/.test(m) ? 'Já existe um encaminhamento esperando resposta para este paciente.'
          : (/already_transferred/.test(m) ? 'Este paciente já foi transferido.' : (/same_professional/.test(m) ? 'Esse CRP é o seu.' : UI.errorText(e, 'Não foi possível enviar agora. Tente de novo.')))));
      });
    } },
      h('p', { class: 'mt0' }, 'Encaminhe ', h('b', null, rec.full_name), ' para um colega que usa o Senso. Ele(a) vê só o nome e a idade até aceitar.'),
      crp.el, h('div', { class: 'mb16' }, searchBtn), lookupBox,
      h('div', { class: 'group-title' }, 'O que passa para o colega'),
      h('ul', { class: 'plain-list what-list' }, PASSES.map(function (t) { return h('li', null, UI.svg('check', 18), t); })),
      h('div', { class: 'group-title' }, 'O que não passa'),
      h('ul', { class: 'plain-list what-list' }, STAYS.map(function (t) { return h('li', null, UI.svg('lock', 18), t); })),
      h('div', { class: 'group-title' }, 'Se o colega aceitar'),
      h('ul', { class: 'plain-list what-list' },
        h('li', null, UI.svg('arrow-right', 18), 'O cadastro dele(a) nasce conferido e o seu fica como transferido.'),
        h('li', null, UI.svg('calendar-x', 18), 'As consultas futuras com você são canceladas.'),
        h('li', null, UI.svg('user-x', 18), 'O vínculo da conta e o compartilhamento do diário com você terminam.'),
        rec.linked ? h('li', null, UI.svg('heart-handshake', 18), 'O paciente recebe o pedido de vínculo do colega e decide.') : null),
      note.el, attest.el, general, send);
    sh = UI.sheet({ title: 'Transferir paciente', wide: true, content: form, focus: crp.input });
    return sh;
  };
})();
