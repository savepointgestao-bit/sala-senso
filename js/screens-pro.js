/* Psicólogo: lista de pacientes, ficha do paciente (com a conferência do cadastro), cadastro manual e aniversariantes. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function plain(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function rel(day) {
    var t = UI.dt.today();
    if (day === t) return 'hoje';
    if (day === UI.dt.addDays(t, -1)) return 'ontem';
    return UI.fmtDate(day);
  }
  function meta(icon, text, cls) { return h('span', { class: 'meta' + (cls ? ' ' + cls : '') }, UI.svg(icon, 14), text); }
  var WEEKDAY = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var MODE = { in_person: 'Presencial', online: 'Online' };
  var STATUS = { scheduled: ['ok', 'Confirmada'], done: ['ok', 'Realizada'], no_show: ['', 'Faltou'], canceled_by_patient: ['', 'Cancelada pelo paciente'], canceled_by_professional: ['', 'Cancelada por você'] };

  /* Selos do cadastro (lista e ficha). */
  function badges(p, full) {
    var out = [];
    if (p.transferred_at) { out.push(h('span', { class: 'badge soft' }, UI.svg('arrow-right', 14), 'Transferido' + (p.transferred_to_name ? ' para ' + p.transferred_to_name : ''))); return out; }
    if (!p.verified) out.push(h('span', { class: 'badge warn' }, UI.svg('hourglass', 14), 'Por conferir'));
    else if (full) out.push(h('span', { class: 'badge ok' }, UI.svg('circle-check', 14), 'Cadastro confirmado'));
    if (p.minor) out.push(h('span', { class: 'badge minor' }, 'Menor de 18'));
    out.push(p.linked ? h('span', { class: 'badge soft' }, UI.svg('link', 14), 'Com conta') : h('span', { class: 'badge' }, 'Sem conta'));
    if (p.status && p.status !== 'active') out.push(S.statusBadge(p.status));
    return out;
  }
  function ageText(birth) {
    var a = UI.ageFrom(birth);
    return a == null || a < 0 ? '' : a + (a === 1 ? ' ano' : ' anos');
  }

  /* ---------------------------------------------------------------- cadastro: novo paciente e edição
     rec = item de pro.patients() ou do relatório; vazio = novo. onSaved(id, isNew). prefill = { name, phone } para um cadastro novo (vindo da lista de espera). */
  S.patientSheet = function (rec, onSaved, prefill) {
    prefill = prefill || {};
    var isNew = !rec, linked = !!(rec && rec.linked);
    var today = UI.today();
    var name = UI.field({ label: 'Nome completo', required: true, autocapitalize: 'words', maxlength: 120, value: rec ? rec.full_name : (prefill.name || '') });
    var email = UI.field({ label: 'E-mail', type: 'email', required: true, inputmode: 'email', maxlength: 200, value: rec ? rec.email || '' : '',
      hint: 'Obrigatório. Se o paciente criar uma conta com esse e-mail, ela se junta a este cadastro.' });
    var phone = UI.phoneField({ label: 'Celular', optional: true, value: rec ? rec.phone || '' : (prefill.phone || ''), hint: 'Pode deixar em branco se a pessoa não tem celular.' });
    var birth = UI.field({ label: 'Data de nascimento', type: 'date', required: true, max: today, min: '1900-01-01', value: rec ? rec.birth_date || '' : '', hint: 'Para lembrarmos do aniversário.' });
    var gName = UI.field({ label: 'Nome do responsável', autocapitalize: 'words', maxlength: 120, value: rec ? rec.guardian_name || '' : '' });
    var gPhone = UI.phoneField({ label: 'Celular do responsável', required: true, value: rec ? rec.guardian_phone || '' : '' });
    var minorBox = h('div', { class: 'hide minor-box' },
      UI.notice('info', h('span', null, h('b', null, 'Menor de 18 anos. '), 'Guarde o contato de um responsável. Depois, na ficha, registre que ele(a) autorizou o atendimento.')), gName.el, gPhone.el);
    function isMinor() { var a = UI.ageFrom(birth.value()); return a !== null && a >= 0 && a < 18; }
    function checkAge() { minorBox.classList.toggle('hide', !isMinor()); }
    birth.input.addEventListener('input', checkAge); birth.input.addEventListener('change', checkAge);
    checkAge();
    if (linked) { name.input.disabled = true; email.input.disabled = true; phone.input.disabled = true; }

    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button(isNew ? 'Cadastrar paciente' : 'Salvar', { type: 'submit' });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      var bads = [];
      function bad(f, m) { f.setError(m); bads.push(f.input); }
      if (!linked) {
        if (name.value().trim().length < 2) bad(name, 'Digite o nome do paciente.');
        if (!email.value().trim()) bad(email, 'Digite o e-mail do paciente.');
        else if (!UI.emailValid(email.value())) bad(email, 'Confira o e-mail.');
        if (phone.value().trim() && !UI.phoneOk(phone.value())) bad(phone, 'Confira o número, com DDD.');
      }
      var a = UI.ageFrom(birth.value());
      if (a === null || a < 0 || a > 120) bad(birth, 'Informe a data de nascimento.');
      var minor = isMinor();
      if (minor) {
        if (gName.value().trim().length < 2) bad(gName, 'Digite o nome do responsável.');
        if (!UI.phoneOk(gPhone.value())) bad(gPhone, 'Digite o celular do responsável.');
      }
      if (bads.length) { S.focusFirst(bads); return; }
      UI.busy(btn, true);
      API.pro.savePatient({ id: rec ? rec.record_id : null, name: name.value().trim(), phone: phone.value().trim(), email: email.value().trim(), birth: birth.value(),
        guardianName: minor ? gName.value().trim() : null, guardianPhone: minor ? gPhone.value().trim() : null }).then(function (id) {
        sh.close('done');
        UI.toast(isNew ? 'Paciente cadastrado.' : 'Cadastro salvo.', 'circle-check');
        onSaved(id || (rec && rec.record_id), isNew);
      }).catch(function (e) {
        UI.busy(btn, false); Diag.error('salvar-paciente', e);
        general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
      });
    } },
      linked ? UI.notice('info', 'Nome, e-mail e celular vêm da conta do paciente e só ele(a) altera. Aqui você completa a data de nascimento e o responsável.')
        : (isNew ? UI.notice('info', 'Como é você quem está cadastrando, o cadastro já nasce confirmado.') : null),
      name.el, email.el, phone.el, birth.el, minorBox, general, btn);
    sh = UI.sheet({ title: isNew ? 'Novo paciente' : 'Editar cadastro', content: form, focus: isNew ? name.input : null });
    return sh;
  };

  /* ---------------------------------------------------------------- aniversariantes */
  function birthdayCard(list) {
    if (!list.length) return null;
    var rows = list.slice(0, 6).map(function (b) {
      var when = b.days_until === 0 ? 'hoje' : (b.days_until === 1 ? 'amanhã' : 'em ' + b.days_until + ' dias (' + UI.dt.dayLabel(b.next, false) + ')');
      var msg = 'Oi, ' + UI.firstName(b.full_name) + '! Passando para desejar um feliz aniversário. Muita saúde e paz!';
      var wa = b.phone ? UI.waLink(b.phone, msg) : null;
      return h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('cake', 20)),
        h('a', { class: 'grow', href: '#/pacientes/' + b.record_id }, h('span', { class: 't' }, b.full_name), h('span', { class: 's' }, 'Faz ' + b.turning + ' anos ' + when)),
        wa ? h('a', { class: 'btn ghost sm auto', href: wa, target: '_blank', rel: 'noopener', 'aria-label': 'Parabenizar ' + b.full_name + ' pelo WhatsApp' }, UI.svg('message-circle', 16), 'Parabenizar') : null);
    });
    return h('section', { 'aria-label': 'Aniversariantes' }, h('div', { class: 'group-title' }, 'Aniversários nos próximos 30 dias'), h('div', { class: 'group' }, rows));
  }
  S.birthdayCard = birthdayCard;

  /* ---------------------------------------------------------------- lista de pacientes */
  var FILTERS = [['all', 'Todos'], ['verify', 'Por conferir'], ['minor', 'Menores'], ['nolink', 'Sem conta'], ['paused', 'Em pausa'], ['closed', 'Encerrados'], ['moved', 'Transferidos']];

  function patientRow(p) {
    var ms = [];
    if (p.pending_requests) ms.push(meta('hourglass', p.pending_requests + (p.pending_requests === 1 ? ' pedido de consulta' : ' pedidos de consulta'), 'hot'));
    if (p.next_appointment) ms.push(meta('calendar-check', 'Próxima: ' + UI.dt.whenLabel(p.next_appointment)));
    if (p.sessions_done) ms.push(meta('circle-check', p.sessions_done + (p.sessions_done === 1 ? ' sessão' : ' sessões')));
    if (p.last_mood_day) ms.push(meta('smile', 'Humor: ' + rel(p.last_mood_day)));
    if (!ms.length) ms.push(meta('calendar', 'Sem consultas ainda'));
    return h('a', { class: 'card pt-item', href: '#/pacientes/' + p.record_id },
      UI.avatar(p.social_name || p.full_name),
      h('div', { class: 'grow' }, h('div', { class: 'pt-name' }, p.social_name || p.full_name), h('div', { class: 'row-gap' }, badges(p)), h('div', { class: 'metas' }, ms)),
      h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
  }

  S.patients = function (ctx, q) {
    var pro = ctx.me.professional || {};
    var okPro = pro.verification === 'verified';
    var newBtn = h('button', { type: 'button', class: 'btn auto sm', onclick: function () { S.patientSheet(null, function (id) { go('#/pacientes/' + id); }); } }, UI.svg('user-plus', 18), 'Novo paciente');
    var holder = h('div', null, okPro ? UI.loading() : null);
    var node = S.shell(ctx, 'pacientes', [UI.pageHead('Pacientes', null, okPro ? newBtn : null), holder]);
    if (!okPro) {
      holder.appendChild(S.crpNotice(pro.verification));
      holder.appendChild(UI.empty('lock', 'Libera quando o seu CRP for confirmado', 'Enquanto isso, você pode explorar o resto do Senso.'));
      return node;
    }
    var all = [], births = [], reqs = [], wait = [], transfers = { incoming: [], outgoing: [] }, filter = FILTERS.some(function (f) { return f[0] === (q && q.f); }) || (q && q.f) === 'wait' ? q.f : 'all', term = '';
    var listBox = h('div', { 'aria-live': 'polite' }), chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar pacientes' });
    var search = UI.field({ label: 'Buscar paciente', type: 'search', placeholder: 'Nome, e-mail ou celular', maxlength: 80 });
    search.input.addEventListener('input', function () { term = plain(search.value()); drawList(); });

    function isMoved(p) { return !!p.transferred_at; }
    function inFilter(p, k) {
      if (k === 'moved') return isMoved(p);
      if (isMoved(p)) return false;
      if (k === 'verify') return !p.verified;
      if (k === 'minor') return !!p.minor;
      if (k === 'nolink') return !p.linked;
      if (k === 'paused') return p.status === 'paused';
      if (k === 'closed') return p.status === 'discharged' || p.status === 'dropped' || p.status === 'referred';
      return true;
    }
    function matches(p) {
      if (!inFilter(p, filter)) return false;
      if (!term) return true;
      return plain(p.full_name + ' ' + (p.social_name || '') + ' ' + (p.email || '') + ' ' + UI.digits(p.phone)).indexOf(term) >= 0 || (UI.digits(term) && UI.digits(p.phone).indexOf(UI.digits(term)) >= 0);
    }
    function drawChips() {
      clear(chips);
      FILTERS.forEach(function (f) {
        var n = all.filter(function (p) { return inFilter(p, f[0]); }).length;
        if (f[0] !== 'all' && f[0] !== filter && !n) return;
        chips.appendChild(h('button', { type: 'button', class: 'chip', 'aria-pressed': filter === f[0] ? 'true' : 'false', onclick: function () { filter = f[0]; drawChips(); drawList(); } }, f[1] + (f[0] === 'all' ? '' : ' (' + n + ')')));
      });
      chips.appendChild(h('button', { type: 'button', class: 'chip', 'data-filter': 'wait', 'aria-pressed': filter === 'wait' ? 'true' : 'false', onclick: function () { filter = 'wait'; drawChips(); drawList(); } }, 'Lista de espera (' + wait.length + ')'));
    }
    function loadWait() { return API.pro.waitlist().then(function (w) { wait = w; drawChips(); drawList(); }).catch(function (e) { Diag.error('lista-de-espera', e); UI.toast(UI.errorText(e)); }); }
    function drawList() {
      clear(listBox);
      if (filter === 'wait') { listBox.appendChild(S.waitlistView(wait, term, loadWait)); return; }
      var rows = all.filter(matches).sort(function (a, b) {
        if (a.verified !== b.verified) return a.verified ? 1 : -1;
        return a.full_name.localeCompare(b.full_name, 'pt-BR');
      });
      if (!rows.length) {
        listBox.appendChild(UI.empty('search', 'Ninguém por aqui', term || filter !== 'all' ? 'Nenhum paciente com esse filtro. Limpe a busca para ver todos.' : ''));
        return;
      }
      rows.forEach(function (p) { listBox.appendChild(patientRow(p)); });
    }
    function draw() {
      clear(holder);
      var trBox = S.transfersSection(transfers, onChange), rqBox = S.linkRequestsSection(reqs, all.filter(function (p) { return !p.linked && !isMoved(p); }), onChange);
      if (trBox) holder.appendChild(trBox);
      if (rqBox) holder.appendChild(rqBox);
      if (!all.length) {
        holder.appendChild(UI.empty('users', 'Nenhum paciente ainda', 'Cadastre quem você atende, ou mande o seu link de cadastro para a pessoa criar a própria conta e pedir para ser seu paciente.',
          h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn auto', onclick: function () { S.patientSheet(null, function (id) { go('#/pacientes/' + id); }); } }, UI.svg('user-plus', 18), 'Cadastrar paciente'),
            h('a', { class: 'btn ghost auto', href: '#/inicio' }, UI.svg('link', 18), 'Ver meu link'))));
        return;
      }
      var toVerify = all.filter(function (p) { return !p.verified && !isMoved(p); }).length;
      var pending = all.reduce(function (s, p) { return s + (p.pending_requests || 0); }, 0);
      if (pending) holder.appendChild(S.pendingStrip('calendar-plus', pending === 1 ? '1 pedido de consulta esperando você' : pending + ' pedidos de consulta esperando você', '#/agenda?aba=pedidos', 'Responder'));
      if (toVerify) holder.appendChild(S.pendingStrip('hourglass', toVerify === 1 ? '1 cadastro para conferir' : toVerify + ' cadastros para conferir', '#/pacientes?f=verify', 'Conferir'));
      holder.appendChild(search.el);
      drawChips(); holder.appendChild(chips);
      drawList(); holder.appendChild(listBox);
      var bc = birthdayCard(births); if (bc) holder.appendChild(bc);
    }
    /* depois de aceitar ou recusar: recarrega a lista (e abre a ficha, se veio um cadastro) */
    function onChange(recordId) { if (recordId) { go('#/pacientes/' + recordId); return; } load(); }
    function load() {
      return Promise.all([API.pro.patients(), API.pro.birthdays(30).catch(function () { return []; }), API.pro.linkRequests().catch(function () { return []; }),
        API.pro.transfers().catch(function () { return { incoming: [], outgoing: [] }; }), API.pro.waitlist().catch(function () { return []; })]).then(function (r) { all = r[0]; births = r[1]; reqs = r[2]; transfers = r[3]; wait = r[4]; draw(); })
        .catch(function (e) { Diag.error('pacientes', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar os pacientes agora. Atualize a página.')); });
    }
    load();
    return node;
  };

  /* ---------------------------------------------------------------- ficha do paciente */
  function stat(value, label, tone) { return h('div', { class: 'stat' + (tone ? ' ' + tone : '') }, h('b', null, value), h('span', null, label)); }
  function card(title, body, sub) {
    return h('section', { class: 'card' }, h('h2', null, title), sub ? h('p', { class: 'muted small' }, sub) : null, body);
  }

  S.patientFile = function (ctx, id, q) {
    var holder = h('div', null, UI.loading());
    var node = S.shell(ctx, 'pacientes', [UI.backLink('#/pacientes', 'Pacientes'), holder]);
    var R = null, F = null, X = { linkReq: null, transfer: null }, tab = ['resumo', 'diario', 'consultas', 'evolucao', 'clinico', 'financeiro', 'documentos', 'cadastro'].indexOf(q && q.aba) >= 0 ? q.aba : 'resumo', days = 90;

    function fail(e) {
      Diag.error('ficha-paciente', e);
      clear(holder);
      holder.appendChild(/not_found|not_allowed/.test(String((e && e.message) || ''))
        ? UI.empty('user-x', 'Paciente não encontrado', 'Esse cadastro não existe ou não é seu.', h('a', { class: 'btn auto', href: '#/pacientes' }, 'Voltar para a lista'))
        : UI.notice('bad', 'Não foi possível carregar a ficha agora. Atualize a página.'));
    }
    /* A ficha vem do relatório; o que não está nele (transferência, pedido de vínculo em aberto) vem da lista, dos pedidos e dos encaminhamentos. */
    function load() {
      return Promise.all([API.pro.report(id, days), API.pro.patients().catch(function () { return []; }), API.pro.linkRequests().catch(function () { return []; }),
        API.pro.transfers().catch(function () { return { incoming: [], outgoing: [] }; }), API.pro.ficha(id).catch(function () { return null; })]).then(function (r) {
        R = r[0]; F = r[4];
        var item = r[1].filter(function (x) { return x.record_id === R.record_id; })[0];
        R.transferred_at = item ? item.transferred_at : null; R.transferred_to_name = item ? item.transferred_to_name : null;
        R.status = item ? item.status : 'active'; R.social_name = F ? F.social_name : (item ? item.social_name : null);
        X.linkReq = r[2].filter(function (x) { return x.origin === 'professional' && x.record_id === R.record_id; })[0] || null;
        X.transfer = (r[3].outgoing || []).filter(function (x) { return x.record_id === R.record_id && x.status === 'pending'; })[0] || null;
        draw();
      }).catch(fail);
    }

    /* ------ cabeçalho e conferência */
    function header() {
      var wa = R.phone ? UI.waLink(R.phone, 'Olá, ' + UI.firstName(R.full_name) + '. Aqui é ' + UI.firstName(ctx.me.profile.full_name) + '.') : null;
      var bits = [R.social_name ? 'Nome no cadastro: ' + R.full_name : '', ageText(R.birth_date), R.email].filter(Boolean).join(' · ');
      return h('section', { class: 'card pt-header' },
        h('div', { class: 'invite-who' }, UI.avatar(R.social_name || R.full_name, { size: 'lg', level: R.level }),
          h('div', { class: 'grow' }, h('h1', { class: 'mb0' }, R.social_name || R.full_name), bits ? h('div', { class: 'muted small' }, bits) : null, h('div', { class: 'row-gap mt8' }, badges(R, true)))),
        R.transferred_at ? h('div', { class: 'mt16' }, UI.notice('info', 'Transferido' + (R.transferred_to_name ? ' para ' + R.transferred_to_name : '') + ' em ' + UI.fmtDate(UI.dt.dayOf(R.transferred_at)) + '. O cadastro fica aqui só para você consultar.'))
        : h('div', { class: 'btn-row mt16' },
          h('button', { type: 'button', class: 'btn', onclick: function () { S.newAppointmentSheet({ record: { id: R.record_id, name: R.full_name }, onDone: load }); } }, UI.svg('calendar-plus', 18), 'Marcar consulta'),
          wa ? h('a', { class: 'btn ghost', href: wa, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), 'WhatsApp') : null));
    }
    function verifyBanner() {
      if (R.verified || R.transferred_at) return null;
      var btn = UI.button('Confirmar cadastro', { auto: true, icon: 'badge-check', onclick: function () {
        UI.busy(btn, true);
        API.pro.setVerified(R.record_id, true).then(function () {
          UI.toast(R.linked ? 'Cadastro confirmado. Avisamos o(a) paciente.' : 'Cadastro confirmado.', 'circle-check');
          return load();
        }).catch(function (e) { UI.busy(btn, false); Diag.error('confirmar-cadastro', e); UI.toast(UI.errorText(e)); });
      } });
      return h('section', { class: 'cta-card verify-card', role: 'region', 'aria-label': 'Conferir o cadastro' }, h('span', { class: 'ico-box' }, UI.svg('badge-check', 22)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, 'Confirme que esse cadastro é de quem você atende'),
          h('div', { class: 's' }, R.linked ? 'A pessoa aceitou o seu pedido, mas o e-mail da conta é diferente do cadastro. Confira nome, e-mail e celular. Enquanto você não confirmar, ela não consegue marcar consulta.'
            : 'Enquanto o cadastro não for confirmado, ele fica marcado como pendente.')),
        btn);
    }

    /* ------ resumo: humor */
    /* Vincular a conta: pelo celular do cadastro (o paciente aceita) ou pelo link de cadastro (você aceita). */
    function linkCard() {
      var box = h('section', { class: 'card' }, h('h2', null, R.linked ? 'Vínculo com a conta' : 'Este paciente ainda não tem conta ligada a você'));
      if (R.transferred_at) { box.appendChild(h('p', { class: 'muted mb0' }, 'Este paciente foi transferido. Para acompanhar de novo, o colega ou o próprio paciente precisa pedir o vínculo.')); return box; }
      if (R.linked) {
        box.appendChild(h('p', { class: 'muted' }, 'Ao desvincular, você deixa de ver o humor e os textos compartilhados. O cadastro fica com você.'));
        box.appendChild(h('button', { type: 'button', class: 'btn ghost auto danger-link', onclick: function () {
          UI.confirmBox({ title: 'Desvincular a conta de ' + R.full_name + '?', text: 'Você deixa de acompanhar o humor dele(a). O cadastro fica com você.', ok: 'Desvincular', danger: true }).then(function (yes) {
            if (!yes) return;
            return API.pro.unlinkPatient(R.record_id).then(function () { UI.toast('Vínculo desfeito.', 'circle-check'); return load(); });
          }).catch(function (e) { UI.toast(UI.errorText(e)); });
        } }, 'Desvincular conta'));
        return box;
      }
      box.appendChild(h('p', { class: 'muted' }, 'Com a conta no Senso, você acompanha o humor dele(a) e ele(a) marca consultas por aqui. Quem vincula é você.'));
      var out = h('div', { 'aria-live': 'polite' });
      if (X.linkReq) {
        var cancel = h('button', { type: 'button', class: 'linkbtn small danger-link', onclick: function () {
          cancel.disabled = true;
          API.pro.cancelLinkRequest(X.linkReq.id).then(function () { UI.toast('Pedido cancelado.', 'info'); return load(); })
            .catch(function (e) { cancel.disabled = false; Diag.error('cancelar-pedido', e); UI.toast(UI.errorText(e)); });
        } }, 'Cancelar pedido');
        box.appendChild(UI.notice('warn', h('span', null, h('b', null, 'Pedido enviado. '), 'Esperando ' + UI.firstName(R.full_name) + ' aceitar. Avisamos você. ', cancel)));
      } else {
        var btn = UI.button('Vincular pelo celular', { icon: 'link', onclick: function () {
          UI.clear(out); UI.busy(btn, true);
          API.pro.requestLink(R.record_id).then(function (r) {
            if (r && r.ok) { UI.toast(r.status === 'linked' ? 'Pronto! A conta foi vinculada.' : (r.status === 'already_requested' ? 'O pedido já estava enviado.' : 'Pedido enviado. Avisamos você quando ' + UI.firstName(R.full_name) + ' aceitar.'), 'circle-check'); return load(); }
            UI.busy(btn, false);
            out.appendChild(UI.notice(r && r.error === 'already_linked' ? 'info' : 'warn', S.linkError(r && r.error)));
          }).catch(function (e) { UI.busy(btn, false); Diag.error('vincular-celular', e); out.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível vincular agora. Tente de novo.'))); });
        } });
        box.appendChild(h('p', { class: 'small muted' }, R.phone ? 'Procuramos uma conta de paciente com o celular do cadastro, ' + UI.formatPhone(R.phone) + '. A pessoa recebe o pedido e aceita.'
          : 'Este cadastro não tem celular. Edite o cadastro e coloque o celular para vincular.'));
        if (R.phone) box.appendChild(btn);
        box.appendChild(out);
      }
      box.appendChild(h('div', { class: 'group-title' }, 'Ou mande o seu link de cadastro'));
      var linkBox = h('div');
      box.appendChild(linkBox);
      API.invite.mine().then(function (st) {
        if (!st || !st.enabled) { linkBox.appendChild(h('p', { class: 'small muted mb0' }, 'O seu link de cadastro está desativado. Ative na tela Atendimento.')); return; }
        var url = S.invite.url(st.code);
        var msg = 'Olá, ' + UI.firstName(R.full_name) + '! Aqui está o meu link para você criar a sua conta no Senso e pedir para ser meu paciente: ' + url;
        var wa = UI.waLink(R.phone, msg);
        linkBox.appendChild(h('p', { class: 'small muted' }, 'A pessoa cria a conta pelo link e faz um pedido. Você aceita em Pacientes, e a conta se junta a este cadastro.'));
        linkBox.appendChild(h('div', { class: 'btn-row' },
          UI.button('Copiar link', { icon: 'copy', variant: 'ghost', onclick: function () { UI.copyText(url).then(function () { UI.toast('Link copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar.'); }); } }),
          wa ? h('a', { class: 'btn ghost', href: wa, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), 'Enviar pelo WhatsApp') : null));
      }).catch(function () { /* sem o link, o resto da ficha continua */ });
      return box;
    }

    /* Transferir o paciente para um colega (pelo CRP). */
    function transferCard() {
      if (R.transferred_at) return null;
      var box = h('section', { class: 'card' }, h('h2', null, 'Transferir paciente'));
      if (X.transfer) {
        var cancel = h('button', { type: 'button', class: 'linkbtn small danger-link', onclick: function () {
          cancel.disabled = true;
          API.pro.cancelTransfer(X.transfer.id).then(function () { UI.toast('Encaminhamento cancelado.', 'info'); return load(); })
            .catch(function (e) { cancel.disabled = false; Diag.error('cancelar-encaminhamento', e); UI.toast(UI.errorText(e)); });
        } }, 'Cancelar encaminhamento');
        box.appendChild(UI.notice('warn', h('span', null, h('b', null, 'Encaminhamento enviado. '), 'Esperando ' + X.transfer.to_name + ' (CRP ' + X.transfer.to_crp_region + '/' + X.transfer.to_crp_number + ') aceitar. ', cancel)));
        return box;
      }
      box.appendChild(h('p', { class: 'muted' }, 'Encaminhe o cadastro para um colega pelo CRP. Prontuário, financeiro e diário não passam.'));
      box.appendChild(h('button', { type: 'button', class: 'btn ghost auto', onclick: function () { S.transferSheet(R, load); } }, UI.svg('arrow-right', 18), 'Transferir para outro psicólogo(a)'));
      return box;
    }

    function moodSection(box) {
      var m = R.mood;
      clear(box);
      if (!m || !m.days_with_record) {
        box.appendChild(UI.empty('smile', 'Sem registros de humor no período', 'Quando o paciente registrar o humor no diário, o calendário e os gráficos aparecem aqui.'));
        return;
      }
      var stats = [stat(Charts.fmt1(m.avg_mood) + '/5', 'Humor médio'),
        stat(String(m.days_with_record), (m.days_with_record === 1 ? 'dia com registro (' : 'dias com registro (') + m.tracking_rate + '%)'),
        stat(String(m.low_days), m.low_days === 1 ? 'dia de humor baixo' : 'dias de humor baixo', m.low_days ? 'warn' : '')];
      if (m.avg_anxiety != null) stats.push(stat(Charts.fmt1(m.avg_anxiety) + '/5', 'Ansiedade média'));
      if (m.avg_energy != null) stats.push(stat(Charts.fmt1(m.avg_energy) + '/5', 'Energia média'));
      if (m.trend != null) stats.push(stat((m.trend > 0 ? '+' : '') + Charts.fmt1(m.trend), 'vs. 2 semanas antes', m.trend <= -1 ? 'warn' : (m.trend >= 1 ? 'good' : '')));
      stats.push(stat(m.streak_current + (m.streak_current === 1 ? ' dia' : ' dias'), 'seguidos registrando'));
      box.appendChild(h('div', { class: 'stat-row' }, stats));
      if (m.low_days) box.appendChild(UI.notice('info', (m.low_days === 1 ? 'Foi 1 dia' : 'Foram ' + m.low_days + ' dias') + ' com humor 1 ou 2 no período. O último foi ' + rel(m.last_low_day) + '.'));
      var from = UI.dt.addDays(UI.dt.today(), -R.period_days);
      box.appendChild(card('Calendário do humor', Charts.calendar(m.days, { min: from }), 'Cor de cada dia: a média dos registros. Toque em um dia para ver o humor de manhã, tarde e noite.'));
      box.appendChild(card('Evolução', Charts.line(m.series, { from: from, to: UI.dt.today(), metrics: ['mood'] })));
      var wk = m.by_weekday || [];
      box.appendChild(card('Humor médio por dia da semana', Charts.bars(WEEKDAY.map(function (d, i) { return { label: d, value: wk[i] == null ? null : wk[i] }; }), { mood: true, label: 'Humor médio por dia da semana' })));
      var bp = m.by_period || {};
      box.appendChild(card('Humor médio por horário do dia', Charts.bars([['Manhã', bp.morning], ['Tarde', bp.afternoon], ['Noite', bp.evening]].map(function (x) { return { label: x[0], value: x[1] == null ? null : x[1] }; }), { mood: true, label: 'Humor médio por horário do dia' }),
        'Pela hora do registro: manhã até 11h59, tarde de 12h às 17h59, noite a partir das 18h.'));
      var dist = m.distribution || {};
      box.appendChild(card('Quantos dias em cada humor', Charts.bars([5, 4, 3, 2, 1].map(function (v) { return { label: Charts.MOOD[v - 1], value: dist[v] || 0 }; }), { max: Math.max(1, m.days_with_record), int: true, label: 'Dias em cada humor' })));
      var hi = [];
      if (m.best) hi.push(h('li', null, 'Melhor dia: ', h('b', null, UI.fmtDate(m.best.date)), ' (' + Charts.fmt1(m.best.mood) + '/5)'));
      if (m.worst) hi.push(h('li', null, 'Dia mais difícil: ', h('b', null, UI.fmtDate(m.worst.date)), ' (' + Charts.fmt1(m.worst.mood) + '/5)'));
      if (m.streak_best) hi.push(h('li', null, 'Maior sequência registrando: ', h('b', null, m.streak_best + (m.streak_best === 1 ? ' dia' : ' dias'))));
      if (hi.length) box.appendChild(card('Destaques', h('ul', { class: 'plain-list' }, hi)));
    }

    function summaryPanel() {
      var box = h('div');
      if (!R.linked) { box.appendChild(linkCard()); var tcu = transferCard(); if (tcu) box.appendChild(tcu); return box; }
      if (!R.consent) { box.appendChild(UI.notice('info', 'Esse paciente não autorizou (ou retirou a autorização do) diário. Você não vê o humor dele(a).')); return box; }
      var moodBox = h('div', { 'aria-live': 'polite' });
      var seg = UI.segmented({ label: 'Período', value: String(days), options: [['30', '30 dias'], ['90', '90 dias'], ['365', '1 ano']], onChange: function (v) {
        days = +v; moodBox.setAttribute('aria-busy', 'true');
        API.pro.report(id, days).then(function (r) { R = r; moodBox.removeAttribute('aria-busy'); moodSection(moodBox); })
          .catch(function (e) { moodBox.removeAttribute('aria-busy'); Diag.error('periodo', e); UI.toast(UI.errorText(e)); });
      } });
      box.appendChild(h('div', { class: 'sec-title' }, h('h2', null, 'Acompanhamento do humor'), seg.el));
      box.appendChild(h('p', { class: 'small muted' }, 'Você vê humor, energia e ansiedade. O texto do diário só aparece quando o paciente compartilha (aba Diário).'));
      moodSection(moodBox);
      box.appendChild(moodBox);
      return box;
    }

    /* ------ diário compartilhado */
    function diaryPanel() {
      var box = h('div', null, UI.loading());
      if (!R.linked) { clear(box); box.appendChild(UI.empty('notebook-pen', 'Sem conta, sem diário', 'O diário aparece quando o paciente cria a conta e compartilha.')); return box; }
      if (!R.consent) { clear(box); box.appendChild(UI.notice('info', 'Esse paciente não autorizou o diário.')); return box; }
      API.pro.sharedEntries(id, 90).then(function (list) {
        clear(box);
        box.appendChild(UI.notice('info', 'Aqui ficam só os textos que o paciente escolheu compartilhar com você, dos últimos 90 dias.'));
        if (!list.length) { box.appendChild(UI.empty('lock', 'Nenhum texto compartilhado ainda', 'O diário é do paciente. Quando ele(a) compartilhar um registro, ele aparece aqui.')); return; }
        list.forEach(function (e) {
          var vals = [];
          if (e.mood != null) vals.push(h('span', { class: 'val' }, 'Humor ', h('b', null, e.mood + '/5')));
          if (e.energy != null) vals.push(h('span', { class: 'val' }, 'Energia ', h('b', null, e.energy + '/5')));
          if (e.anxiety != null) vals.push(h('span', { class: 'val' }, 'Ansiedade ', h('b', null, e.anxiety + '/5')));
          box.appendChild(h('article', { class: 'card pt-entry' },
            h('div', { class: 'appt-head' }, h('div', { class: 'appt-when' }, UI.dt.dayLabel(e.entry_date)), e.entry_time ? h('span', { class: 'tag time' }, String(e.entry_time).slice(0, 5)) : null),
            vals.length ? h('div', { class: 'pt-vals' }, vals) : null,
            e.tags && e.tags.length ? h('div', { class: 'chips' }, e.tags.map(function (t) { return h('span', { class: 'tag' }, t); })) : null,
            e.body ? h('p', { class: 'pt-body' }, e.body) : null));
        });
      }).catch(function (e) { Diag.error('diario-compartilhado', e); clear(box); box.appendChild(UI.notice('bad', 'Não foi possível carregar os textos agora.')); });
      return box;
    }

    /* ------ consultas do paciente */
    function sessionsPanel() {
      var s = R.sessions, box = h('div');
      box.appendChild(h('div', { class: 'stat-row' }, stat(String(s.done), 'realizadas'), stat(String(s.upcoming), 'marcadas'), stat(String(s.no_show), 'faltas', s.no_show ? 'warn' : ''), stat(String(s.canceled), 'canceladas')));
      var lines = [];
      if (s.next) lines.push(h('li', null, 'Próxima: ', h('b', null, UI.dt.whenLabel(s.next))));
      if (s.last) lines.push(h('li', null, 'Última realizada: ', h('b', null, UI.dt.whenLabel(s.last))));
      if (lines.length) box.appendChild(h('ul', { class: 'plain-list mb16' }, lines));
      if (!s.recent.length) {
        box.appendChild(UI.empty('calendar-plus', 'Nenhuma consulta ainda', 'Marque a primeira consulta deste paciente.',
          h('button', { type: 'button', class: 'btn auto', onclick: function () { S.newAppointmentSheet({ record: { id: R.record_id, name: R.full_name }, onDone: load }); } }, 'Marcar consulta')));
        return box;
      }
      box.appendChild(h('div', { class: 'group' }, s.recent.map(function (a) {
        var st = STATUS[a.status] || ['', a.status];
        return h('a', { class: 'item', href: '#/agenda?d=' + UI.dt.dayOf(a.starts_at) }, h('span', { class: 'ico-box' }, UI.svg(a.mode === 'online' ? 'video' : 'map-pin', 20)),
          h('span', { class: 'grow' }, h('span', { class: 't' }, UI.dt.whenLabel(a.starts_at)), h('span', { class: 's' }, MODE[a.mode] || a.mode)), h('span', { class: 'badge ' + st[0] }, st[1]));
      })));
      box.appendChild(h('p', { class: 'small muted' }, 'Mostrando as 12 mais recentes.'));
      return box;
    }

    /* ------ cadastro */
    function registerPanel() {
      var box = h('div');
      var rows = [['Nome', R.full_name], ['E-mail', R.email], ['Celular', R.phone ? UI.formatPhone(R.phone) : 'Não informado'],
        ['Nascimento', R.birth_date ? UI.fmtDate(R.birth_date) + (ageText(R.birth_date) ? ' (' + ageText(R.birth_date) + ')' : '') : 'Não informada'],
        ['Cadastrado em', UI.fmtDate(UI.dt.dayOf(R.created_at))], ['Conta no Senso', R.linked ? 'Sim, vinculada a você' : 'Não']];
      var kv = h('dl', { class: 'kv' });
      rows.forEach(function (r) { if (r[1]) { kv.appendChild(h('dt', null, r[0])); kv.appendChild(h('dd', null, r[1])); } });
      var actions = [h('button', { type: 'button', class: 'btn ghost auto', onclick: function () { S.patientSheet(R, load); } }, UI.svg('pencil', 18), 'Editar cadastro')];
      if (R.verified) actions.push(h('button', { type: 'button', class: 'btn ghost auto', onclick: function () {
        UI.confirmBox({ title: 'Desfazer a conferência?', text: 'O cadastro volta a ficar “por conferir” e o paciente não consegue marcar consulta até você confirmar de novo.', ok: 'Desfazer' }).then(function (yes) {
          if (!yes) return;
          return API.pro.setVerified(R.record_id, false).then(function () { UI.toast('Conferência desfeita.', 'circle-check'); return load(); });
        }).catch(function (e) { UI.toast(UI.errorText(e)); });
      } }, 'Desfazer conferência'));
      box.appendChild(h('section', { class: 'card' }, h('h2', null, 'Dados do paciente'), kv, h('div', { class: 'btn-row mt16' }, actions)));

      if (R.minor) {
        var gwa = R.guardian_phone ? UI.waLink(R.guardian_phone, 'Olá! Aqui é ' + UI.firstName(ctx.me.profile.full_name) + ', psicólogo(a) de ' + UI.firstName(R.full_name) + '.') : null;
        var auth = UI.toggle({ value: R.guardian_authorized, label: 'Autorização do responsável registrada', onChange: function (v) {
          return API.pro.setGuardianAuth(R.record_id, v).then(function () { R.guardian_authorized = v; UI.toast(v ? 'Autorização registrada.' : 'Autorização removida.', 'circle-check'); })
            .catch(function (e) { UI.toast(UI.errorText(e)); throw e; });
        } });
        var gkv = h('dl', { class: 'kv' });
        gkv.appendChild(h('dt', null, 'Responsável')); gkv.appendChild(h('dd', null, R.guardian_name || 'Não informado'));
        gkv.appendChild(h('dt', null, 'Celular')); gkv.appendChild(h('dd', null, R.guardian_phone ? UI.formatPhone(R.guardian_phone) : 'Não informado'));
        box.appendChild(h('section', { class: 'card' }, h('h2', null, 'Responsável'), UI.notice('info', 'Menores de 18 anos podem usar o Senso, mas o atendimento envolve o responsável. Confirme com ele(a) antes de atender e registre aqui.'),
          gkv, gwa ? h('div', { class: 'btn-row mt16' }, h('a', { class: 'btn ghost auto', href: gwa, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), 'Falar com o responsável')) : null,
          h('div', { class: 'item flat mt16' }, h('span', null, h('span', { class: 't' }, 'Autorização do responsável'), h('span', { class: 's' }, 'Marque quando ele(a) autorizar.')), auth.el)));
      }
      if (!R.transferred_at) {
        box.appendChild(h('section', { class: 'card' }, h('h2', null, 'Situação do paciente'),
          h('div', { class: 'item flat' }, h('span', null, h('span', { class: 't' }, S.statusBadge(R.status || 'active'))),
            h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { S.statusSheet(R, load); } }, 'Mudar'))));
      }
      if (F) S.fichaCards(R, F, function () { S.fichaSheet(R, F, load); }).forEach(function (n) { box.appendChild(n); });
      box.appendChild(linkCard());
      var tc = transferCard(); if (tc) box.appendChild(tc);
      return box;
    }

    function panel(k) {
      if (k === 'diario') return diaryPanel();
      if (k === 'consultas') return sessionsPanel();
      if (k === 'evolucao') return S.evolutionPanel(ctx, R, F);
      if (k === 'clinico') return S.clinicalPanel(ctx, R, F);
      if (k === 'financeiro') return S.financePanel(ctx, R, F);
      if (k === 'documentos') return S.documentsPanel(ctx, R, F, load);
      if (k === 'cadastro') return registerPanel();
      return summaryPanel();
    }
    function draw() {
      clear(holder);
      holder.appendChild(header());
      var v = verifyBanner(); if (v) holder.appendChild(v);
      var t = UI.tabs({ label: 'Seções da ficha', value: tab, cls: 'dense', tabs: [['resumo', 'Resumo'], ['diario', 'Diário'], ['consultas', 'Consultas'], ['evolucao', 'Evolução'], ['clinico', 'Clínico'], ['financeiro', 'Financeiro'], ['documentos', 'Documentos'], ['cadastro', 'Cadastro']], render: panel, onChange: function (k) { tab = k; } });
      holder.appendChild(t.el);
    }
    load();
    return node;
  };
})();
