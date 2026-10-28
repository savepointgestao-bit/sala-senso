/* Paciente: "Meu psicólogo(a)", consultas (pedir, acompanhar, avaliar) e o Lab. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
  function refresh() { window.dispatchEvent(new HashChangeEvent('hashchange')); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function crp(x) { return x.crp_region && x.crp_number ? 'CRP ' + x.crp_region + '/' + x.crp_number : ''; }
  var MODE = { in_person: 'Presencial', online: 'Online' };

  /* ---------------------------------------------------------------- Meu psicólogo(a) */
  /* Campo para colar o link do convite e vincular (quando a pessoa já tem conta). */
  function linkBox(onLinked) {
    var code = UI.field({ label: 'Link ou código do convite', maxlength: 200, placeholder: 'Cole aqui o link que seu psicólogo(a) mandou' });
    var out = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Conferir', { onclick: function () {
      out.textContent = '';
      var c = S.invite.parse(code.value());
      if (!c) { code.setError('Cole o link inteiro ou o código.'); code.input.focus(); return; }
      UI.busy(btn, true);
      API.invite.info(c).then(function (info) {
        UI.busy(btn, false);
        if (!info || !info.ok) { out.appendChild(UI.notice('warn', 'Não encontramos esse convite. Confira com seu psicólogo(a) ou peça um link novo.')); return; }
        S.invite.set(c);
        go('#/convite?c=' + c);
      }).catch(function (e) { UI.busy(btn, false); Diag.error('colar-convite', e); out.appendChild(UI.notice('bad', UI.errorText(e))); });
    } });
    return h('div', null, code.el, out, btn);
  }

  S.myPsychologist = function (ctx) {
    var holder = h('div', null, UI.loading());
    var node = S.shell(ctx, 'psicologo', [UI.pageHead('Meu psicólogo(a)', 'Quem acompanha você e o que ele(a) vê'), holder]);

    function proCard(x, contact) {
      var auto = UI.toggle({ value: x.auto_share, label: 'Compartilhar automaticamente os textos novos com ' + x.name, onChange: function (v) {
        return API.sharing.setAuto(x.professional_id, v).then(function () { UI.toast(v ? 'Os próximos textos do diário serão compartilhados.' : 'Os próximos textos ficam só com você.', 'circle-check'); })
          .catch(function (e) { UI.toast(UI.errorText(e)); throw e; });
      } });
      var wa = contact && contact.whatsapp ? UI.waLink(contact.whatsapp, 'Olá, ' + UI.firstName(x.name) + '. Aqui é ' + UI.firstName(ctx.me.profile.full_name) + '.') : null;
      var waiting = contact && contact.verified === false;
      var open = contact && contact.booking_enabled && !waiting;
      return h('section', { class: 'card pro-card', 'aria-label': x.name },
        h('div', { class: 'invite-who' }, UI.avatar(x.name, { size: 'lg' }),
          h('div', { class: 'grow' }, h('b', null, x.name), h('div', { class: 'muted small' }, crp(x)), h('div', { class: 'mt8' }, x.verified ? h('span', { class: 'badge ok' }, UI.svg('badge-check', 14), 'CRP verificado') : h('span', { class: 'badge warn' }, 'CRP em análise')))),
        h('div', { class: 'btn-row mt16' },
          wa ? h('a', { class: 'btn', href: wa, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), 'Falar pelo WhatsApp') : null,
          open ? h('a', { class: 'btn ' + (wa ? 'ghost' : ''), href: '#/consultas' }, UI.svg('calendar-plus', 18), 'Pedir consulta') : null),
        waiting ? h('div', { class: 'mt16' }, UI.notice('warn', h('span', null, h('b', null, 'Aguardando a conferência do cadastro. '), x.name + ' vai conferir os seus dados. Assim que confirmar, você pode pedir consultas por aqui e avisamos você.'))) : null,
        !wa ? h('p', { class: 'small muted mt16 mb0' }, 'Seu psicólogo(a) ainda não colocou o WhatsApp aqui.') : null,
        h('div', { class: 'group-title' }, 'Seu diário com ele(a)'),
        h('div', { class: 'group' }, h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('share-2', 20)),
          h('span', null, h('span', { class: 't' }, 'Compartilhar os textos novos'), h('span', { class: 's' }, x.shared_entries ? x.shared_entries + (x.shared_entries === 1 ? ' registro compartilhado' : ' registros compartilhados') : 'Nenhum registro compartilhado ainda')), auto.el)),
        h('p', { class: 'group-hint' }, 'Para compartilhar só um registro, abra ele no Diário e ligue a opção. Você pode desligar quando quiser.'),
        h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'linkbtn small danger-link', onclick: function () {
          UI.confirmBox({ title: 'Desvincular de ' + x.name + '?', text: 'Ele(a) deixa de ver seu humor e os textos compartilhados. O histórico de consultas e o cadastro dele(a) ficam com o próprio psicólogo(a).', ok: 'Desvincular', danger: true }).then(function (yes) {
            if (!yes) return;
            return API.sharing.unlink(x.professional_id).then(function () { UI.toast('Vínculo desfeito.', 'circle-check'); refresh(); });
          }).catch(function (e) { UI.toast(UI.errorText(e)); });
        } }, 'Desvincular')));
    }

    Promise.all([API.sharing.mine(), API.booking.psychologists().catch(function () { return []; })]).then(function (r) {
      clear(holder);
      var list = r[0], contacts = {};
      r[1].forEach(function (c) { contacts[c.professional_id] = c; });
      var pend = S.pendingInvite(); if (pend) holder.appendChild(pend);
      if (!list.length) {
        holder.appendChild(UI.empty('heart-handshake', 'Você ainda não está vinculado(a)', 'Seu psicólogo(a) manda um link para você. Ao aceitar, vocês ficam conectados: ele(a) acompanha seu humor e você pede consultas por aqui.'));
        holder.appendChild(h('div', { class: 'card' }, h('h2', null, 'Tenho um link'), linkBox()));
      } else {
        list.forEach(function (x) { holder.appendChild(proCard(x, contacts[x.professional_id])); });
        holder.appendChild(h('details', { class: 'invite-more mt24' }, h('summary', null, 'Vincular outro psicólogo(a)'), linkBox()));
      }
      holder.appendChild(h('div', { class: 'group-title' }, 'O que o(a) psicólogo(a) vê'));
      holder.appendChild(h('div', { class: 'card' }, h('ul', { class: 'plain-list what-list mb0' },
        h('li', null, UI.svg('check', 18), 'Seu nome, celular, e-mail e data de nascimento.'),
        h('li', null, UI.svg('check', 18), 'Seu humor, energia e ansiedade, com a média de cada dia.'),
        h('li', null, UI.svg('check', 18), 'Suas consultas e os pedidos que você faz.'),
        h('li', null, UI.svg('lock', 18), 'O texto do diário só aparece se você compartilhar.'),
        h('li', null, UI.svg('lock', 18), 'A avaliação da consulta é anônima.'))));
    }).catch(function (e) { Diag.error('meu-psicologo', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar agora. Atualize a página.')); });
    return node;
  };

  /* ---------------------------------------------------------------- consultas */
  function statusBadge(a) {
    var m = { requested: ['warn', 'Aguardando resposta'], scheduled: ['ok', 'Confirmada'], reschedule_proposed: ['warn', 'Novo horário sugerido'], declined: ['bad', 'Não aceita'],
      canceled_by_patient: ['', 'Cancelada'], canceled_by_professional: ['bad', 'Cancelada pelo psicólogo(a)'], done: ['ok', 'Realizada'], no_show: ['', 'Faltou'] }[a.status] || ['', a.status];
    if (a.status === 'scheduled' && a.past) return h('span', { class: 'badge' }, 'Já aconteceu');
    return h('span', { class: 'badge ' + m[0] }, m[1]);
  }

  function reviewSheet(a, onDone) {
    var stars = UI.stars({ label: 'Nota da consulta', size: 34 });
    var liked = UI.field({ label: 'O que você achou da consulta?', type: 'textarea', optional: true, rows: 3, maxlength: 1000 });
    var sug = UI.field({ label: 'Alguma sugestão?', type: 'textarea', optional: true, rows: 3, maxlength: 1000 });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Enviar avaliação', { type: 'submit' });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      if (!stars.get()) { general.appendChild(UI.notice('warn', 'Escolha de 1 a 5 estrelas.')); return; }
      UI.busy(btn, true);
      API.booking.review(a.id, stars.get(), liked.value().trim(), sug.value().trim()).then(function () { sh.close('done'); UI.toast('Obrigado pela avaliação.', 'circle-check'); onDone(); })
        .catch(function (e) { UI.busy(btn, false); Diag.error('avaliar', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível enviar agora. Tente de novo.'))); });
    } },
      UI.notice('info', h('span', null, h('b', null, 'Sua avaliação é anônima. '), a.professional_name + ' vê a nota e o texto, mas não vê quem avaliou nem qual consulta foi. Não escreva seu nome nem dados que identifiquem você ou outras pessoas.')),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Como foi?'), stars.el), liked.el, sug.el, general, btn);
    sh = UI.sheet({ title: 'Avaliar a consulta', content: form, focus: null });
    return sh;
  }

  function apptCard(a, reload) {
    var when = a.status === 'reschedule_proposed' ? a.proposed_starts_at : a.starts_at;
    var future = Date.parse(when) > Date.now();
    var details = [];
    details.push(h('span', { class: 'meta' }, UI.svg(a.mode === 'online' ? 'video' : 'map-pin', 14), MODE[a.mode] || a.mode));
    details.push(h('span', { class: 'meta' }, UI.svg('clock', 14), a.duration_minutes + ' min'));
    if (a.price_cents != null) details.push(h('span', { class: 'meta' }, UI.svg('banknote', 14), UI.money(a.price_cents) + (a.payment_status === 'paid' ? ' (pago)' : '')));
    var extra = [];
    if (a.status === 'scheduled' && a.mode === 'in_person' && a.office_note) extra.push(h('p', { class: 'small muted mb0' }, UI.svg('map-pin', 14), ' ', a.office_note));
    if (a.status === 'scheduled' && a.mode === 'online') extra.push(a.meeting_url ? h('a', { class: 'btn sm auto', href: a.meeting_url, target: '_blank', rel: 'noopener' }, UI.svg('video', 16), 'Entrar na consulta') : h('p', { class: 'small muted mb0' }, 'O link da videochamada aparece aqui quando o(a) psicólogo(a) enviar.'));
    if (a.status === 'declined' && a.decline_reason) extra.push(h('p', { class: 'small mb0' }, 'Recado: ', a.decline_reason));
    if (a.status === 'canceled_by_professional' && a.decline_reason) extra.push(h('p', { class: 'small mb0' }, 'Recado: ', a.decline_reason));
    if (a.status === 'reschedule_proposed') {
      extra.push(h('p', { class: 'small mb0' }, 'Seu pedido era para ', h('b', null, UI.dt.whenLabel(a.starts_at)), '. ', a.decline_reason ? 'Recado: ' + a.decline_reason : ''));
    }
    var actions = [];
    if (a.status === 'reschedule_proposed') {
      actions.push(UI.button('Aceitar', { auto: true, onclick: function (ev) {
        UI.busy(ev.currentTarget, true);
        API.booking.respond(a.id, true).then(function () { UI.toast('Consulta confirmada.', 'circle-check'); reload(); }).catch(function (e) { UI.busy(ev.currentTarget, false); UI.toast(UI.errorText(e)); });
      } }));
      actions.push(UI.button('Recusar', { variant: 'ghost', auto: true, onclick: function (ev) {
        UI.busy(ev.currentTarget, true);
        API.booking.respond(a.id, false).then(function () { UI.toast('Horário recusado.', 'circle-check'); reload(); }).catch(function (e) { UI.busy(ev.currentTarget, false); UI.toast(UI.errorText(e)); });
      } }));
    }
    if (['requested', 'scheduled', 'reschedule_proposed'].indexOf(a.status) >= 0 && future && a.status !== 'reschedule_proposed') {
      actions.push(UI.button(a.status === 'requested' ? 'Cancelar pedido' : 'Cancelar consulta', { variant: 'ghost', auto: true, onclick: function () {
        UI.confirmBox({ title: a.status === 'requested' ? 'Cancelar o pedido?' : 'Cancelar a consulta?', text: UI.dt.whenLabel(a.starts_at) + ' com ' + a.professional_name + '.', ok: 'Cancelar', cancel: 'Voltar', danger: true }).then(function (yes) {
          if (!yes) return;
          return API.booking.cancel(a.id).then(function () { UI.toast('Cancelado.', 'circle-check'); reload(); });
        }).catch(function (e) { UI.toast(UI.errorText(e)); });
      } }));
    }
    if (a.status === 'scheduled' && a.price_cents != null && a.payment_status !== 'paid' && future) {
      actions.push(h('button', { type: 'button', class: 'btn ghost sm auto', disabled: true, 'aria-disabled': 'true' }, UI.svg('banknote', 16), 'Pagar agora', h('span', { class: 'oauth-soon' }, 'Em breve')));
    }
    if (a.can_review) actions.push(UI.button('Avaliar consulta', { auto: true, icon: 'star', onclick: function () { reviewSheet(a, reload); } }));
    return h('article', { class: 'card appt ' + a.status },
      h('div', { class: 'appt-head' }, h('div', { class: 'grow' }, h('div', { class: 'appt-when' }, UI.dt.whenLabel(when)), h('div', { class: 'muted small' }, 'com ' + a.professional_name)), statusBadge(a)),
      h('div', { class: 'metas' }, details), extra, actions.length ? h('div', { class: 'btn-row mt16' }, actions) : null);
  }

  /* Janela para pedir uma consulta. */
  function bookingSheet(psy, onDone, pre) {
    var open = psy.filter(function (x) { return x.booking_enabled && x.verified !== false; });
    var proId = (pre && open.some(function (x) { return x.professional_id === pre; })) ? pre : open[0].professional_id;
    var sel = open.length > 1 ? UI.field({ label: 'Com quem', type: 'select', options: open.map(function (x) { return [x.professional_id, x.full_name]; }) }) : null;
    if (sel) { sel.input.value = proId; sel.input.addEventListener('change', function () { proId = sel.input.value; load(); }); }
    var area = h('div', { 'aria-live': 'polite' });
    var sh = UI.sheet({ title: 'Pedir uma consulta', wide: true, content: [sel ? sel.el : null, area] });

    function load() {
      clear(area); area.appendChild(UI.loading('Buscando horários...'));
      var from = UI.dt.today();
      Promise.all([API.booking.info(proId), API.booking.slots(proId, from, 21)]).then(function (r) { draw(r[0], r[1]); })
        .catch(function (e) { Diag.error('horarios', e); clear(area); area.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível buscar os horários agora.'))); });
    }
    function draw(info, slots) {
      clear(area);
      var name = info.name;
      if (!info.enabled) { area.appendChild(UI.notice('info', name + ' ainda não abriu a agenda para pedidos. Fale com ele(a) pelo WhatsApp em "Meu psicólogo(a)".')); return; }
      var byDay = {}, days = [];
      slots.forEach(function (s) { var d = UI.dt.dayOf(s.starts_at); if (!byDay[d]) { byDay[d] = []; days.push(d); } byDay[d].push(s); });
      if (!days.length) { area.appendChild(UI.empty('calendar-x', 'Sem horários livres agora', 'Não há horários nos próximos 21 dias. Fale com ' + name + ' pelo WhatsApp.')); return; }
      var pick = { day: null, slot: null }, dayBtns = [], slotBox = h('div', { class: 'slot-grid', role: 'group', 'aria-label': 'Horários' });
      var mode = info.accepts_in_person ? 'in_person' : 'online';
      var modeSeg = info.accepts_in_person && info.accepts_online ? UI.segmented({ label: 'Tipo de atendimento', value: mode, options: [['in_person', 'Presencial'], ['online', 'Online']], onChange: function (v) { mode = v; } }) : null;
      var note = UI.field({ label: 'Quer deixar um recado?', type: 'textarea', optional: true, rows: 2, maxlength: 300, placeholder: 'Ex.: prefiro de manhã.' });
      var general = h('div', { 'aria-live': 'polite' });
      var send = UI.button('Pedir consulta', { disabled: true });
      send.disabled = true;
      function chooseDay(d) {
        pick.day = d; pick.slot = null; send.disabled = true;
        dayBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-day') === d ? 'true' : 'false'); });
        clear(slotBox);
        byDay[d].forEach(function (s) {
          slotBox.appendChild(h('button', { type: 'button', class: 'slot-btn', 'aria-pressed': 'false', onclick: function (ev) {
            pick.slot = s; send.disabled = false;
            Array.prototype.forEach.call(slotBox.children, function (c) { c.setAttribute('aria-pressed', c === ev.currentTarget ? 'true' : 'false'); });
          } }, UI.dt.hmOf(s.starts_at)));
        });
      }
      var strip = h('div', { class: 'day-strip', role: 'group', 'aria-label': 'Dias com horário' }, days.map(function (d) {
        var b = h('button', { type: 'button', class: 'day-btn', 'data-day': d, 'aria-pressed': 'false', onclick: function () { chooseDay(d); } },
          h('span', { class: 'w' }, UI.dt.WEEK3[UI.dt.dow(d)]), h('span', { class: 'n' }, String(+d.slice(8))), h('span', { class: 'm' }, UI.dt.MON3[+d.slice(5, 7) - 1]));
        dayBtns.push(b); return b;
      }));
      send.addEventListener('click', function () {
        general.textContent = '';
        if (!pick.slot) return;
        UI.busy(send, true);
        API.booking.request(proId, pick.slot.starts_at, mode, note.value().trim()).then(function () {
          sh.close('done'); UI.toast('Pedido enviado. Avisamos quando ' + UI.firstName(name) + ' responder.', 'circle-check'); onDone();
        }).catch(function (e) {
          UI.busy(send, false); send.disabled = false;
          Diag.error('pedir-consulta', e);
          general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível enviar o pedido agora.')));
          if (/slot_taken/.test(String((e && e.message) || ''))) load();
        });
      });
      area.appendChild(h('p', { class: 'muted' }, 'Consulta de ' + info.session_minutes + ' minutos com ', h('b', null, name), '. O pedido vai para ele(a) aprovar.'));
      area.appendChild(h('div', { class: 'lbl' }, '1. Escolha o dia')); area.appendChild(strip);
      area.appendChild(h('div', { class: 'lbl mt16' }, '2. Escolha o horário'));
      slotBox.appendChild(h('p', { class: 'muted small mb0' }, 'Escolha um dia para ver os horários.'));
      area.appendChild(slotBox);
      if (modeSeg) area.appendChild(h('div', { class: 'field mt16' }, h('div', { class: 'lbl' }, '3. Tipo de atendimento'), modeSeg.el));
      area.appendChild(h('div', { class: 'mt16' }, note.el));
      if (info.office_note) area.appendChild(h('p', { class: 'small muted' }, UI.svg('map-pin', 14), ' ', info.office_note));
      if (info.price_cents != null) area.appendChild(h('div', { class: 'price-line' }, h('span', null, 'Valor da consulta'), h('b', null, UI.money(info.price_cents))));
      area.appendChild(h('p', { class: 'small muted' }, 'Pagamento online: em breve. Por enquanto, combine o pagamento direto com o(a) psicólogo(a).'));
      area.appendChild(general); area.appendChild(send);
    }
    load();
    return sh;
  }

  S.appointments = function (ctx, q) {
    var holder = h('div', null, UI.loading());
    var openBtn = h('button', { type: 'button', class: 'btn auto sm hide' }, UI.svg('calendar-plus', 18), 'Pedir consulta');
    var node = S.shell(ctx, 'consultas', [h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Consultas'), h('p', null, 'Seus pedidos e horários')), openBtn), holder]);
    var psy = [], auto = q && q.novo;

    function reload() { load(); }
    function load() {
      Promise.all([API.booking.mine(), API.booking.psychologists()]).then(function (r) {
        var list = r[0]; psy = r[1];
        clear(holder);
        var canBook = psy.some(function (x) { return x.booking_enabled && x.verified !== false; });
        var waiting = psy.filter(function (x) { return x.verified === false; });
        openBtn.classList.toggle('hide', !canBook);
        openBtn.onclick = function () { bookingSheet(psy, reload); };
        if (!psy.length) {
          holder.appendChild(UI.empty('heart-handshake', 'Primeiro, vincule-se ao seu psicólogo(a)', 'Com o vínculo você pede consultas por aqui.', h('a', { class: 'btn auto', href: '#/psicologo' }, 'Vincular agora')));
          return;
        }
        waiting.forEach(function (x) {
          holder.appendChild(UI.notice('warn', h('span', null, h('b', null, 'Aguardando ' + x.full_name + ' conferir o seu cadastro. '), 'Assim que ele(a) confirmar, você pode pedir consultas por aqui e avisamos você.')));
        });
        if (!canBook && !waiting.length) holder.appendChild(UI.notice('info', 'Seu psicólogo(a) ainda não abriu a agenda para pedidos. Você pode combinar pelo WhatsApp em "Meu psicólogo(a)".'));
        var live = list.filter(function (a) { return ['requested', 'reschedule_proposed'].indexOf(a.status) >= 0 || (a.status === 'scheduled' && !a.past); });
        var hist = list.filter(function (a) { return live.indexOf(a) < 0; });
        live.sort(function (a, b) { return Date.parse(a.status === 'reschedule_proposed' ? a.proposed_starts_at : a.starts_at) - Date.parse(b.status === 'reschedule_proposed' ? b.proposed_starts_at : b.starts_at); });
        if (canBook && !live.length && !hist.length) {
          holder.appendChild(UI.empty('calendar-plus', 'Nenhuma consulta ainda', 'Escolha um horário livre e peça. Seu psicólogo(a) confirma.', h('button', { type: 'button', class: 'btn auto', onclick: function () { bookingSheet(psy, reload); } }, 'Pedir uma consulta')));
        }
        if (live.length) { holder.appendChild(h('div', { class: 'group-title' }, 'Próximas e pedidos')); live.forEach(function (a) { holder.appendChild(apptCard(a, reload)); }); }
        if (hist.length) { holder.appendChild(h('div', { class: 'group-title' }, 'Histórico')); hist.forEach(function (a) { holder.appendChild(apptCard(a, reload)); }); }
        if (auto && canBook) { auto = false; bookingSheet(psy, reload, q.p); }
      }).catch(function (e) { Diag.error('consultas', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar suas consultas agora. Atualize a página.')); });
    }
    load();
    return node;
  };

  /* ---------------------------------------------------------------- Lab (só pacientes; por enquanto só a porta) */
  S.lab = function (ctx) {
    return S.shell(ctx, 'lab', [UI.pageHead('Lab', 'Ferramentas novas, só para pacientes'),
      h('div', { class: 'card lab-card' }, h('div', { class: 'ico-box lg' }, UI.svg('flask-conical', 30)), h('span', { class: 'badge soft' }, 'Em breve'),
        h('h2', null, 'Estamos preparando o Lab'),
        h('p', { class: 'muted' }, 'Aqui vão ficar exercícios e experimentos para você cuidar da cabeça entre as sessões. É uma área só sua: seu psicólogo(a) não tem acesso.'),
        h('p', { class: 'muted small mb0' }, 'Tem uma ideia do que gostaria de ver aqui? Conte pelo ', h('a', { href: '#/suporte' }, 'Suporte'), '.'))]);
  };
})();
