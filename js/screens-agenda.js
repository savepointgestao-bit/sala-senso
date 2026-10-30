/* Psicólogo: agenda (pedidos para aprovar, semana, fechar dias e horas, horários de atendimento), marcar consulta direto,
   avaliações anônimas e a tela Atendimento (WhatsApp, avisos que quer receber, link de cadastro). */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};
  var T = UI.dt;

  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function iso(day, hm) { return new Date(T.at(day, hm)).toISOString(); }
  var MODE = { in_person: 'Presencial', online: 'Online' };
  var STATUS = { requested: ['warn', 'Pedido'], reschedule_proposed: ['warn', 'Aguardando o paciente'], scheduled: ['ok', 'Confirmada'], done: ['ok', 'Realizada'], no_show: ['', 'Faltou'] };

  /* "150,00" -> 15000. Vazio = null. Inválido = NaN. */
  function parseMoney(str) {
    var s = String(str || '').replace(/[^\d,.]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    var v = Number(s);
    return isFinite(v) && v >= 0 && v <= 10000 ? Math.round(v * 100) : NaN;
  }
  function moneyText(cents) { return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','); }
  function pageLock(ctx, active, title, sub) {
    var pro = ctx.me.professional || {};
    return S.shell(ctx, active, [UI.pageHead(title), S.crpNotice(pro.verification), UI.empty('lock', 'Libera quando o seu CRP for confirmado')]);
  }
  function isVerifiedPro(ctx) { return !!(ctx.me.professional && ctx.me.professional.verification === 'verified'); }

  /* ---------------------------------------------------------------- marcar ou editar uma consulta
     o.record = { id, name } (paciente já escolhido), o.appt = consulta existente (editar), o.day e o.time = dia e horário iniciais, o.onDone().
     Marcando: dá para repetir (toda semana, a cada 15 dias, todo mês). Editando uma consulta de série: só esta ou esta e as próximas. */
  S.newAppointmentSheet = function (o) {
    o = o || {};
    var appt = o.appt || null, rec = o.record || null;
    var area = h('div', null, UI.loading());
    var sh = UI.sheet({ title: appt ? 'Remarcar ou editar' : 'Marcar consulta', content: area });
    Promise.all([API.agenda.get(), appt || rec ? Promise.resolve(null) : API.pro.patients(), !appt && rec ? API.pro.ficha(rec.id).catch(function () { return null; }) : Promise.resolve(null)]).then(function (r) {
      var set = r[0].settings, patients = r[1], fic = r[2];
      /* Valor, duração e modalidade da ficha do paciente valem no lugar dos padrões da agenda. */
      var fMode = fic && fic.modality === 'online' && set.accepts_online ? 'online' : (fic && fic.modality === 'in_person' && set.accepts_in_person ? 'in_person' : null);
      clear(area);
      if (!appt && !rec && !patients.length) {
        area.appendChild(UI.empty('users', 'Cadastre um paciente primeiro', 'Para marcar uma consulta, a pessoa precisa estar na sua lista.', h('button', { type: 'button', class: 'btn auto', onclick: function () { sh.close('go'); S.patientSheet(null, function (id) { go('#/pacientes/' + id); }); } }, 'Novo paciente')));
        return;
      }
      var who = null;
      if (!appt && !rec) {
        who = UI.field({ label: 'Paciente', type: 'select', options: patients.map(function (p) { return [p.record_id, p.full_name + (p.verified ? '' : ' (por conferir)')]; }) });
      }
      var day = UI.field({ label: 'Dia', type: 'date', required: true, value: appt ? T.dayOf(appt.starts_at) : (o.day || T.today()) });
      var now = new Date(), nextH = Math.min(20, Math.max(8, +T.hmOf(Date.now()).slice(0, 2) + 1));
      var time = UI.field({ label: 'Horário', type: 'time', required: true, value: appt ? T.hmOf(appt.starts_at) : (o.time || (nextH < 10 ? '0' : '') + nextH + ':00') });
      var dur = UI.field({ label: 'Duração (minutos)', type: 'number', inputmode: 'numeric', required: true, value: String(appt ? appt.duration_minutes : (fic && fic.session_minutes) || set.session_minutes) });
      dur.input.min = '15'; dur.input.max = '240'; dur.input.step = '5';
      var mode = appt ? appt.mode : (fMode || (set.accepts_in_person ? 'in_person' : 'online'));
      var seg = UI.segmented({ label: 'Tipo de atendimento', value: mode, options: [['in_person', 'Presencial'], ['online', 'Online']], onChange: function (v) { mode = v; link.el.classList.toggle('hide', v !== 'online'); } });
      var price = UI.field({ label: 'Valor (R$)', optional: true, inputmode: 'decimal', maxlength: 12, value: moneyText(appt ? appt.price_cents : (fic && fic.session_price_cents != null ? fic.session_price_cents : set.price_cents)), hint: 'Deixe em branco para usar o valor padrão da agenda.' });
      var link = UI.field({ label: 'Link da videochamada', optional: true, type: 'url', maxlength: 300, value: appt && appt.meeting_url ? appt.meeting_url : '', placeholder: 'https://' });
      link.el.classList.toggle('hide', mode !== 'online');
      /* Repetir (só ao marcar) e alcance da mudança (só ao editar uma consulta de série). */
      var rep = null, count = null, scope = 'one', scopeBox = null;
      if (!appt) {
        rep = UI.field({ label: 'Repetir', type: 'select', options: [['none', 'Não repete'], ['weekly', 'Toda semana'], ['biweekly', 'A cada 15 dias'], ['monthly', 'Todo mês']], value: 'none' });
        count = UI.field({ label: 'Quantas consultas ao todo', type: 'number', inputmode: 'numeric', value: '8', hint: 'Conta com a primeira. De 2 a 60. Horário já ocupado fica de fora.' });
        count.input.min = '2'; count.input.max = '60'; count.input.step = '1';
        count.el.classList.add('hide');
        count.input.addEventListener('input', function () { count.clearError(); });
        rep.input.addEventListener('change', function () { count.el.classList.toggle('hide', rep.value() === 'none'); });
      } else if (appt.status === 'scheduled' && appt.series_id && appt.series_after > 0) {
        var scopeSeg = UI.segmented({ label: 'Aplicar a', value: 'one', options: [['one', 'Só esta'], ['following', 'Esta e as próximas (' + (appt.series_after + 1) + ')']], onChange: function (v) { scope = v; } });
        scopeBox = h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Aplicar a'), scopeSeg.el, h('p', { class: 'small muted mb0' }, 'Se mudar o dia ou o horário, as próximas andam o mesmo tanto.'));
      }
      var general = h('div', { 'aria-live': 'polite' });
      var btn = UI.button(appt ? 'Salvar' : (rep ? 'Marcar consulta' : 'Salvar'), { type: 'submit' });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); general.textContent = '';
        var bads = [];
        function bad(f, m) { f.setError(m); bads.push(f.input); }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day.value())) bad(day, 'Escolha o dia.');
        if (!/^\d{2}:\d{2}$/.test(time.value())) bad(time, 'Escolha o horário.');
        var d = Number(dur.value());
        if (!(d >= 15 && d <= 240)) bad(dur, 'Use de 15 a 240 minutos.');
        var cents = parseMoney(price.value());
        if (cents !== null && isNaN(cents)) bad(price, 'Confira o valor.');
        var url = link.value().trim();
        if (mode === 'online' && url && !/^https?:\/\//i.test(url)) bad(link, 'O link deve começar com https://');
        var every = rep ? rep.value() : 'none', n = count ? Number(count.value()) : 0;
        if (every !== 'none' && !(n >= 2 && n <= 60 && n % 1 === 0)) bad(count, 'Use de 2 a 60 consultas.');
        if (bads.length) { S.focusFirst(bads); return; }
        var data = { startsAt: iso(day.value(), time.value()), duration: d, mode: mode, priceCents: cents, meetingUrl: mode === 'online' ? url : '' };
        UI.busy(btn, true);
        var p;
        if (appt) p = scope === 'following' ? API.agenda.updateFollowing(appt.id, data) : API.agenda.update(appt.id, data);
        else if (every !== 'none') p = API.agenda.createSeries(Object.assign({ recordId: rec ? rec.id : who.value(), every: every, count: n }, data));
        else p = API.agenda.create(Object.assign({ recordId: rec ? rec.id : who.value() }, data));
        p.then(function (r) {
          var skipped = r && r.skipped && r.skipped.length ? r.skipped : null;
          var done = appt ? (scope === 'following' && r && r.updated > 1 ? r.updated + ' consultas atualizadas.' : 'Consulta atualizada.')
            : (every !== 'none' && r && r.created > 1 ? r.created + ' consultas marcadas.' : 'Consulta marcada.');
          if (o.onDone) o.onDone();
          if (!skipped) { sh.close('done'); UI.toast(done, 'circle-check'); return; }
          /* Alguns horários já estavam ocupados: mostra quais ficaram de fora. */
          clear(area);
          area.appendChild(h('div', null, UI.notice('ok', done),
            UI.notice('warn', (skipped.length === 1 ? '1 horário já estava ocupado e ficou de fora: ' : skipped.length + ' horários já estavam ocupados e ficaram de fora: ') + skipped.map(function (x) { return T.whenLabel(x); }).join('; ') + '.'),
            h('div', { class: 'dialog-actions' }, UI.button('Entendi', { onclick: function () { sh.close('done'); } }))));
        }).catch(function (e) {
          UI.busy(btn, false); Diag.error('marcar-consulta', e);
          var all = every !== 'none' && /slot_taken/.test(String((e && e.message) || ''));
          general.appendChild(UI.notice('bad', all ? 'Todos esses horários já estão ocupados. Escolha outro dia ou horário.' : UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.')));
        });
      } },
        rec ? h('p', { class: 'lead' }, 'Paciente: ', h('b', null, rec.name)) : (appt ? h('p', { class: 'lead' }, 'Paciente: ', h('b', null, appt.full_name)) : who.el),
        scopeBox, h('div', { class: 'grid2' }, day.el, time.el), rep ? rep.el : null, count ? count.el : null, dur.el,
        h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Tipo de atendimento'), seg.el), link.el, price.el, general, btn);
      area.appendChild(form);
    }).catch(function (e) { Diag.error('marcar-consulta-carregar', e); clear(area); area.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível abrir agora.'))); });
    return sh;
  };

  /* ---------------------------------------------------------------- horários livres
     Mostra, dia a dia, os horários vagos dentro do atendimento (menos consultas e dias fechados). Tocar num horário abre "Marcar consulta" já preenchida. */
  S.freeSlotsSheet = function (o) {
    o = o || {};
    var span = 14, info = h('p', { class: 'muted small' }), list = h('div', { 'aria-live': 'polite' }, UI.loading());
    var seg = UI.segmented({ label: 'Período', value: '14', options: [['7', '7 dias'], ['14', '14 dias'], ['30', '30 dias']], onChange: function (v) { span = +v; load(); } });
    var sh = UI.sheet({ title: 'Horários livres', content: h('div', null, seg.el, info, list), focus: null });
    function load() {
      clear(list); list.appendChild(UI.loading());
      API.agenda.freeSlots(T.today(), span).then(function (r) {
        clear(list);
        if (!r.has_hours) {
          info.textContent = '';
          list.appendChild(UI.empty('clock', 'Defina seus horários de atendimento', 'Os horários livres saem dos dias e horas em que você atende. Configure na aba Horários da agenda.',
            h('a', { class: 'btn auto', href: '#/agenda?aba=ajustes', onclick: function () { sh.close('go'); } }, 'Abrir horários')));
          return;
        }
        info.textContent = 'Consultas de ' + r.duration + ' minutos. Toque num horário para marcar.';
        if (!r.days.length) { list.appendChild(UI.empty('calendar-x', 'Sem horário livre nesse período', 'Tente um período maior ou ajuste seus horários de atendimento.')); return; }
        r.days.forEach(function (d) {
          list.appendChild(h('div', { class: 'group-title' }, T.dayLabel(d.day)));
          list.appendChild(h('div', { class: 'slot-grid', role: 'group', 'aria-label': 'Horários de ' + T.dayLabel(d.day) }, d.slots.map(function (hm) {
            return h('button', { type: 'button', class: 'slot-btn', onclick: function () { sh.close('go'); S.newAppointmentSheet({ day: d.day, time: hm, record: o.record || null, onDone: o.onDone }); } }, hm);
          })));
        });
      }).catch(function (e) { Diag.error('horarios-livres', e); clear(list); list.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível carregar os horários agora.'))); });
    }
    load();
    return sh;
  };

  /* ---------------------------------------------------------------- responder a um pedido */
  function reasonSheet(o) {
    var reason = UI.field({ label: o.label || 'Recado para o paciente', type: 'textarea', optional: true, rows: 3, maxlength: 300, placeholder: o.placeholder || '' });
    var extra = o.extra ? o.extra() : null;
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button(o.ok, { type: 'submit', variant: o.danger ? 'danger' : null });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      var pre = o.validate ? o.validate() : null;
      if (pre) { general.appendChild(UI.notice('warn', pre)); return; }
      UI.busy(btn, true);
      o.run(reason.value().trim()).then(function () { sh.close('done'); UI.toast(o.done, 'circle-check'); o.reload(); })
        .catch(function (e) { UI.busy(btn, false); Diag.error(o.tag, e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível agora. Tente de novo.'))); });
    } }, o.text ? h('p', { class: 'muted' }, o.text) : null, extra && extra.node, reason.el, general, btn);
    sh = UI.sheet({ title: o.title, content: form });
    return sh;
  }
  function proposeSheet(a, reload) {
    var day = UI.field({ label: 'Novo dia', type: 'date', required: true, value: T.dayOf(a.starts_at), min: T.today() });
    var time = UI.field({ label: 'Novo horário', type: 'time', required: true, value: T.hmOf(a.starts_at) });
    return reasonSheet({ title: 'Sugerir outro horário', text: a.full_name + ' pediu ' + T.whenLabel(a.starts_at) + '. Escolha o horário que fica bom para você.', ok: 'Enviar sugestão',
      extra: function () { return { node: h('div', { class: 'grid2' }, day.el, time.el) }; },
      validate: function () { return /^\d{4}-\d{2}-\d{2}$/.test(day.value()) && /^\d{2}:\d{2}$/.test(time.value()) ? (T.at(day.value(), time.value()) < Date.now() ? 'Escolha um horário que ainda não passou.' : null) : 'Escolha o dia e o horário.'; },
      run: function (reason) { return API.agenda.respond(a.id, 'propose', iso(day.value(), time.value()), reason); }, done: 'Sugestão enviada. Avisamos o(a) paciente.', reload: reload, tag: 'sugerir-horario' });
  }
  function declineSheet(a, reload) {
    return reasonSheet({ title: 'Recusar o pedido', text: a.full_name + ' pediu ' + T.whenLabel(a.starts_at) + '. O(a) paciente é avisado(a). Se preferir outro horário, use “Sugerir outro horário”.', ok: 'Recusar pedido', danger: true,
      placeholder: 'Ex.: nesse dia não atendo.', run: function (reason) { return API.agenda.respond(a.id, 'decline', null, reason); }, done: 'Pedido recusado.', reload: reload, tag: 'recusar-pedido' });
  }
  function approve(a, btn, reload) {
    UI.busy(btn, true);
    API.agenda.respond(a.id, 'approve').then(function () { UI.toast('Consulta confirmada. Avisamos o(a) paciente.', 'circle-check'); reload(); })
      .catch(function (e) { UI.busy(btn, false); Diag.error('aprovar-pedido', e); UI.toast(UI.errorText(e, 'Não foi possível confirmar agora.')); });
  }

  /* ---------------------------------------------------------------- ações de uma consulta */
  function paySheet(a, reload) {
    var method = UI.field({ label: 'Forma de pagamento', type: 'select', options: window.Clinic.PAY_METHODS, value: 'pix' });
    var sh = UI.sheet({ title: 'Registrar pagamento', content: [h('p', { class: 'muted' }, 'Consulta de ' + T.whenLabel(a.starts_at) + ' · ' + UI.money(a.price_cents)), method.el,
      h('div', { class: 'dialog-actions' }, UI.button('Marcar como pago', { onclick: function (ev) {
        UI.busy(ev.currentTarget, true);
        API.agenda.markPaid(a.id, true, method.value()).then(function () { sh.close('done'); UI.toast('Pagamento registrado.', 'circle-check'); reload(); })
          .catch(function (e) { UI.busy(ev.currentTarget, false); Diag.error('marcar-pago', e); UI.toast(UI.errorText(e)); });
      } }))] });
  }
  /* Falta: pergunta se vai cobrar (entra em "A receber" como uma sessão) ou não. */
  function noShowSheet(a, reload) {
    var s;
    function mark(charge, btn) {
      UI.busy(btn, true);
      API.agenda.setStatus(a.id, 'no_show').then(function () { return charge ? null : API.agenda.setCharge(a.id, false); })
        .then(function () { s.close('done'); UI.toast(charge ? 'Falta registrada e cobrada.' : 'Falta registrada, sem cobrança.', 'circle-check'); reload(); })
        .catch(function (e) { UI.busy(btn, false); Diag.error('registrar-falta', e); UI.toast(UI.errorText(e)); });
    }
    s = UI.sheet({ title: 'Cobrar a falta?', content: [h('p', { class: 'muted' }, a.full_name + ' não compareceu em ' + T.whenLabel(a.starts_at) + '. Se você cobrar, a falta entra em “A receber” como uma sessão. Dá para mudar depois.'),
      h('div', { class: 'btn-row' }, UI.button('Cobrar a falta', { onclick: function (ev) { mark(true, ev.currentTarget); } }), UI.button('Não cobrar', { variant: 'ghost', onclick: function (ev) { mark(false, ev.currentTarget); } }))] });
  }
  function apptSheet(a, reload) {
    var future = Date.parse(a.starts_at) > Date.now();
    var sh, rows = [];
    function row(icon, title, sub, fn, cls) {
      rows.push(h('button', { type: 'button', class: 'item' + (cls ? ' ' + cls : ''), onclick: function () { fn(); } }, h('span', { class: 'ico-box' }, UI.svg(icon, 20)),
        h('span', null, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null)));
    }
    function setStatus(status, ok) {
      API.agenda.setStatus(a.id, status).then(function () { sh.close('done'); UI.toast(ok, 'circle-check'); reload(); }).catch(function (e) { Diag.error('status-consulta', e); UI.toast(UI.errorText(e)); });
    }
    if (a.status === 'requested') {
      row('circle-check', 'Aprovar', 'Confirma o horário pedido', function () { sh.close('go'); approve(a, h('button'), reload); });
      row('calendar-days', 'Sugerir outro horário', 'O(a) paciente escolhe se aceita', function () { sh.close('go'); proposeSheet(a, reload); });
      row('ban', 'Recusar', 'Avisa o(a) paciente', function () { sh.close('go'); declineSheet(a, reload); }, 'danger');
    }
    if (a.status === 'scheduled') {
      if (!future) {
        row('circle-check', 'Marcar como realizada', 'A consulta aconteceu', function () { setStatus('done', 'Marcada como realizada.'); });
        row('user-x', 'Marcar falta', 'O(a) paciente não compareceu', function () { sh.close('go'); noShowSheet(a, reload); });
      }
      row('pencil', 'Remarcar ou editar', a.series_after > 0 ? 'Só esta, ou esta e as próximas' : 'Mudar dia, horário, tipo ou valor', function () { sh.close('go'); S.newAppointmentSheet({ appt: a, onDone: reload }); });
      if (a.mode === 'online' && a.meeting_url) rows.push(h('a', { class: 'item', href: a.meeting_url, target: '_blank', rel: 'noopener' }, h('span', { class: 'ico-box' }, UI.svg('video', 20)), h('span', null, h('span', { class: 't' }, 'Abrir a videochamada'), h('span', { class: 's' }, 'Abre o link em outra aba'))));
      if (future) row('calendar-x', a.series_after > 0 ? 'Cancelar só esta' : 'Cancelar consulta', 'Avisa o(a) paciente', function () {
        sh.close('go');
        reasonSheet({ title: 'Cancelar a consulta', text: a.full_name + ', ' + T.whenLabel(a.starts_at) + '. O(a) paciente é avisado(a).', ok: 'Cancelar consulta', danger: true, placeholder: 'Ex.: preciso remarcar, desculpe o transtorno.',
          run: function (reason) { return API.agenda.setStatus(a.id, 'canceled_by_professional', reason); }, done: 'Consulta cancelada.', reload: reload, tag: 'cancelar-consulta' });
      }, 'danger');
      if (future && a.series_after > 0) row('calendar-x', 'Cancelar esta e as próximas', (a.series_after + 1) + ' consultas, avisa o(a) paciente', function () {
        sh.close('go');
        reasonSheet({ title: 'Cancelar esta e as próximas', text: a.full_name + ', a partir de ' + T.whenLabel(a.starts_at) + ': ' + (a.series_after + 1) + ' consultas. O(a) paciente é avisado(a).', ok: 'Cancelar ' + (a.series_after + 1) + ' consultas', danger: true,
          placeholder: 'Ex.: vou viajar, desculpe o transtorno.', run: function (reason) { return API.agenda.cancelFollowing(a.id, reason); }, done: 'Consultas canceladas.', reload: reload, tag: 'cancelar-proximas' });
      }, 'danger');
    }
    if (a.status === 'done' || a.status === 'no_show') {
      row('refresh-cw', 'Voltar para “confirmada”', 'Desfaz o registro de ' + (a.status === 'done' ? 'realizada' : 'falta'), function () { setStatus('scheduled', 'Consulta voltou para confirmada.'); });
      row('pencil', 'Editar', 'Dia, horário, tipo ou valor', function () { sh.close('go'); S.newAppointmentSheet({ appt: a, onDone: reload }); });
    }
    if (a.status === 'no_show') {
      if (a.charge !== false) row('ban', 'Não cobrar a falta', 'Sai de “A receber”', function () {
        API.agenda.setCharge(a.id, false).then(function () { sh.close('done'); UI.toast('A falta não será cobrada.', 'circle-check'); reload(); }).catch(function (e) { Diag.error('nao-cobrar-falta', e); UI.toast(UI.errorText(e)); });
      });
      else row('wallet', 'Cobrar a falta', 'Entra em “A receber”', function () {
        API.agenda.setCharge(a.id, true).then(function () { sh.close('done'); UI.toast('A falta será cobrada.', 'circle-check'); reload(); }).catch(function (e) { Diag.error('cobrar-falta', e); UI.toast(UI.errorText(e)); });
      });
    }
    if (['scheduled', 'done'].indexOf(a.status) >= 0 || (a.status === 'no_show' && a.charge !== false)) {
      if (a.payment_status === 'paid') row('banknote', 'Pagamento recebido', 'Toque para desfazer', function () {
        API.agenda.markPaid(a.id, false).then(function () { sh.close('done'); UI.toast('Pagamento desmarcado.', 'circle-check'); reload(); }).catch(function (e) { Diag.error('desfazer-pago', e); UI.toast(UI.errorText(e)); });
      });
      else if (a.price_cents != null) row('banknote', 'Registrar pagamento', UI.money(a.price_cents), function () { sh.close('go'); paySheet(a, reload); });
      else row('banknote', 'Registrar pagamento', 'Informe o valor recebido', function () { sh.close('go'); S.paymentSheet({ record: { id: a.record_id, name: a.full_name }, preset: { appointment_id: a.id }, onDone: reload }); });
    }
    rows.push(h('a', { class: 'item', href: '#/pacientes/' + a.record_id, onclick: function () { sh.close('go'); } }, h('span', { class: 'ico-box' }, UI.svg('user', 20)), h('span', null, h('span', { class: 't' }, 'Abrir a ficha de ' + UI.firstName(a.full_name)))));
    var st = STATUS[a.status] || ['', a.status];
    var metas = h('div', { class: 'metas mb16' }, h('span', { class: 'meta' }, UI.svg(a.mode === 'online' ? 'video' : 'map-pin', 14), MODE[a.mode] || a.mode), h('span', { class: 'meta' }, UI.svg('clock', 14), a.duration_minutes + ' min'),
      a.price_cents != null ? h('span', { class: 'meta' }, UI.svg('banknote', 14), UI.money(a.price_cents) + (a.payment_status === 'paid' ? ' (pago)' : '')) : null,
      a.series_id ? h('span', { class: 'meta' }, UI.svg('refresh-cw', 14), a.series_after > 0 ? 'Repete, mais ' + a.series_after : 'Última da série') : null);
    sh = UI.sheet({ title: a.full_name, content: [h('p', { class: 'lead mb0' }, T.whenLabel(a.status === 'reschedule_proposed' ? a.proposed_starts_at : a.starts_at), ' ', h('span', { class: 'badge ' + st[0] }, st[1])), metas,
      a.patient_note ? UI.notice('info', 'Recado do paciente: ' + a.patient_note) : null, h('div', { class: 'group' }, rows)], focus: null });
    return sh;
  }
  S.apptSheet = apptSheet;

  function apptRow(a, reload) {
    var st = STATUS[a.status] || ['', a.status];
    var start = a.status === 'reschedule_proposed' ? a.proposed_starts_at : a.starts_at;
    var parts = [MODE[a.mode] || a.mode, a.duration_minutes + ' min'];
    if (a.price_cents != null) parts.push(UI.money(a.price_cents) + (a.payment_status === 'paid' ? ' (pago)' : ''));
    if (a.series_id) parts.push('Repete');
    return h('button', { type: 'button', class: 'appt-row ' + a.status, onclick: function () { apptSheet(a, reload); }, 'aria-label': a.full_name + ', ' + T.hmOf(start) + ', ' + st[1] },
      h('span', { class: 'when' }, T.hmOf(start)),
      h('span', { class: 'grow' }, h('span', { class: 't' }, a.full_name), h('span', { class: 's' }, parts.join(' · '))),
      h('span', { class: 'badge ' + st[0] }, st[1]));
  }
  S.apptRow = apptRow;

  /* ---------------------------------------------------------------- aba Pedidos */
  function requestsPanel(state) {
    var box = h('div', null, UI.loading());
    function reload() { state.reload(); }
    var from = T.today();
    API.agenda.view(from, T.addDays(from, 60)).then(function (v) {
      clear(box);
      var asks = v.pending.filter(function (a) { return a.status === 'requested'; }), waiting = v.pending.filter(function (a) { return a.status === 'reschedule_proposed'; });
      state.setCount(asks.length);
      if (!asks.length && !waiting.length) {
        box.appendChild(UI.empty('inbox', 'Nenhum pedido agora', 'Quando um paciente pedir uma consulta, ela aparece aqui para você aprovar, recusar ou sugerir outro horário.'));
        return;
      }
      asks.forEach(function (a) {
        var ap = UI.button('Aprovar', { auto: true, icon: 'circle-check', onclick: function (ev) { approve(a, ev.currentTarget, reload); } });
        box.appendChild(h('article', { class: 'card appt requested' },
          h('div', { class: 'appt-head' }, h('div', { class: 'grow' }, h('div', { class: 'appt-when' }, T.whenLabel(a.starts_at)), h('a', { class: 'small', href: '#/pacientes/' + a.record_id }, a.full_name)), h('span', { class: 'badge warn' }, 'Novo pedido')),
          h('div', { class: 'metas' }, h('span', { class: 'meta' }, UI.svg(a.mode === 'online' ? 'video' : 'map-pin', 14), MODE[a.mode] || a.mode), h('span', { class: 'meta' }, UI.svg('clock', 14), a.duration_minutes + ' min'),
            a.price_cents != null ? h('span', { class: 'meta' }, UI.svg('banknote', 14), UI.money(a.price_cents)) : null),
          a.patient_note ? h('p', { class: 'small mb0' }, h('b', null, 'Recado: '), a.patient_note) : null,
          h('div', { class: 'btn-row mt16' }, ap,
            h('button', { type: 'button', class: 'btn ghost auto', onclick: function () { proposeSheet(a, reload); } }, UI.svg('calendar-days', 18), 'Sugerir outro horário'),
            h('button', { type: 'button', class: 'btn ghost auto danger-link', onclick: function () { declineSheet(a, reload); } }, 'Recusar'))));
      });
      if (waiting.length) {
        box.appendChild(h('div', { class: 'group-title' }, 'Esperando a resposta do paciente'));
        waiting.forEach(function (a) {
          box.appendChild(h('article', { class: 'card appt reschedule_proposed' },
            h('div', { class: 'appt-head' }, h('div', { class: 'grow' }, h('div', { class: 'appt-when' }, T.whenLabel(a.proposed_starts_at)), h('a', { class: 'small', href: '#/pacientes/' + a.record_id }, a.full_name)), h('span', { class: 'badge warn' }, 'Sugestão enviada')),
            h('p', { class: 'small muted mb0' }, 'O pedido era para ' + T.whenLabel(a.starts_at) + '. Avisamos você quando ' + UI.firstName(a.full_name) + ' responder.')));
        });
      }
    }).catch(function (e) { Diag.error('pedidos', e); clear(box); box.appendChild(UI.notice('bad', 'Não foi possível carregar os pedidos agora.')); });
    return box;
  }

  /* ---------------------------------------------------------------- aba Agenda (semana) */
  function weekStartOf(day) { return T.addDays(day, -T.dow(day)); }
  function blockLabel(b, day) {
    var d0 = T.at(day, '00:00'), d1 = T.at(T.addDays(day, 1), '00:00'), s = Date.parse(b.starts_at), e = Date.parse(b.ends_at);
    if (s <= d0 && e >= d1) return 'Dia fechado';
    return 'Fechado ' + (s > d0 ? 'a partir das ' + T.hmOf(s) : 'até ' + T.hmOf(e)) + (s > d0 && e < d1 ? ' até ' + T.hmOf(e) : '');
  }
  function weekPanel(state, startDay) {
    var box = h('div'), list = h('div', { 'aria-live': 'polite' }, UI.loading());
    var week = weekStartOf(startDay || T.today());
    var title = h('div', { class: 'cal-title', 'aria-live': 'polite' });
    function reload() { draw(); state.reloadCount(); }
    var prev = h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Semana anterior', onclick: function () { week = T.addDays(week, -7); draw(); } }, UI.svg('chevron-left', 20));
    var next = h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Próxima semana', onclick: function () { week = T.addDays(week, 7); draw(); } }, UI.svg('chevron-right', 20));
    var todayBtn = h('button', { type: 'button', class: 'btn ghost sm auto', onclick: function () { week = weekStartOf(T.today()); draw(); } }, 'Hoje');
    box.appendChild(h('div', { class: 'cal-bar' }, prev, h('div', { class: 'row-gap' }, title, todayBtn), next));
    box.appendChild(list);
    function draw() {
      var end = T.addDays(week, 6);
      title.textContent = T.dayLabel(week, false) + ' a ' + T.dayLabel(end, false);
      clear(list); list.appendChild(UI.loading());
      API.agenda.view(week, end).then(function (v) {
        clear(list);
        /* Uma sugestão de horário (aguardando o paciente) aparece no dia sugerido, e não no dia que o paciente pediu. */
        var all = v.appointments.filter(function (a) { return a.status !== 'reschedule_proposed'; })
          .concat((v.pending || []).filter(function (a) { return a.status === 'reschedule_proposed' && T.dayOf(a.proposed_starts_at) >= week && T.dayOf(a.proposed_starts_at) <= end; }));
        var total = all.length;
        for (var i = 0; i < 7; i++) {
          var day = T.addDays(week, i), items = all.filter(function (a) { return T.dayOf(a.status === 'reschedule_proposed' ? a.proposed_starts_at : a.starts_at) === day; })
            .sort(function (a, b) { return (a.status === 'reschedule_proposed' ? Date.parse(a.proposed_starts_at) : Date.parse(a.starts_at)) - (b.status === 'reschedule_proposed' ? Date.parse(b.proposed_starts_at) : Date.parse(b.starts_at)); });
          var blocks = v.blocks.filter(function (b) { return Date.parse(b.starts_at) < T.at(T.addDays(day, 1), '00:00') && Date.parse(b.ends_at) > T.at(day, '00:00'); });
          var isToday = day === T.today();
          var head = h('div', { class: 'day-head' + (isToday ? ' today' : '') }, h('b', null, T.dayLabel(day)));
          var rows = [];
          blocks.forEach(function (b) { rows.push(h('div', { class: 'appt-row block' }, h('span', { class: 'when' }, UI.svg('ban', 18)), h('span', { class: 'grow' }, h('span', { class: 't' }, blockLabel(b, day)), b.reason ? h('span', { class: 's' }, b.reason) : null))); });
          items.forEach(function (a) { rows.push(apptRow(a, reload)); });
          list.appendChild(h('section', { class: 'day-sec', 'aria-label': T.dayLabel(day) }, head, rows.length ? h('div', { class: 'group' }, rows) : h('p', { class: 'muted small day-empty' }, 'Sem consultas'),
            null));
        }
        if (!total) list.appendChild(h('p', { class: 'muted center small' }, 'Nenhuma consulta nesta semana.'));
      }).catch(function (e) { Diag.error('semana', e); clear(list); list.appendChild(UI.notice('bad', 'Não foi possível carregar a agenda agora.')); });
    }
    draw();
    return box;
  }

  /* ---------------------------------------------------------------- aba Fechar horários */
  function rangeText(b) {
    var s = Date.parse(b.starts_at), e = Date.parse(b.ends_at), d0 = T.dayOf(s), d1 = T.dayOf(e - 1);
    var full = T.hmOf(s) === '00:00' && T.hmOf(e) === '00:00';
    if (full) return d0 === d1 ? T.dayLabel(d0) + ', dia inteiro' : T.dayLabel(d0) + ' até ' + T.dayLabel(d1);
    if (d0 === d1) return T.dayLabel(d0) + ', das ' + T.hmOf(s) + ' às ' + T.hmOf(e);
    return T.dayLabel(d0) + ' ' + T.hmOf(s) + ' até ' + T.dayLabel(d1) + ' ' + T.hmOf(e);
  }
  function blocksPanel(state) {
    var box = h('div'), listBox = h('div', { 'aria-live': 'polite' }, UI.loading());
    var kind = 'day';
    var from = UI.field({ label: 'Dia', type: 'date', required: true, min: T.today(), value: T.today() });
    var to = UI.field({ label: 'Até o dia', type: 'date', optional: true, min: T.today(), hint: 'Deixe em branco para fechar só um dia.' });
    var t0 = UI.field({ label: 'Das', type: 'time', value: '12:00' }), t1 = UI.field({ label: 'Até às', type: 'time', value: '14:00' });
    var times = h('div', { class: 'grid2 hide' }, t0.el, t1.el);
    var seg = UI.segmented({ label: 'O que fechar', value: kind, options: [['day', 'Dia inteiro'], ['hours', 'Alguns horários']], onChange: function (v) { kind = v; times.classList.toggle('hide', v !== 'hours'); } });
    var reason = UI.field({ label: 'Motivo', optional: true, maxlength: 120, placeholder: 'Ex.: férias, congresso', hint: 'Só você vê.' });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Fechar', { type: 'submit' });
    var form = h('form', { class: 'card', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      var bads = [];
      function bad(f, m) { f.setError(m); bads.push(f.input); }
      var d0 = from.value(), d1 = to.value() || d0;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d0)) bad(from, 'Escolha o dia.');
      else if (d1 < d0) bad(to, 'O último dia vem depois do primeiro.');
      var s, e;
      if (!bads.length) {
        if (kind === 'day') { s = iso(d0, '00:00'); e = iso(T.addDays(d1, 1), '00:00'); }
        else {
          if (!t0.value() || !t1.value() || t1.value() <= t0.value()) bad(t1, 'O horário final vem depois do inicial.');
          s = iso(d0, t0.value()); e = iso(d1, t1.value());
        }
      }
      if (!bads.length && Date.parse(e) < Date.now()) bad(from, 'Esse período já passou.');
      if (bads.length) { S.focusFirst(bads); return; }
      UI.busy(btn, true);
      API.agenda.blockAdd(s, e, reason.value().trim()).then(function (r) {
        UI.busy(btn, false); reason.input.value = ''; to.input.value = '';
        UI.toast('Período fechado. Os pacientes não veem esses horários.', 'circle-check');
        if (r && r.conflicts) general.appendChild(UI.notice('warn', r.conflicts === 1 ? 'Atenção: 1 consulta já marcada cai nesse período. Ela não foi cancelada. Remarque ou cancele na aba Agenda.' : 'Atenção: ' + r.conflicts + ' consultas já marcadas caem nesse período. Elas não foram canceladas. Remarque ou cancele na aba Agenda.'));
        loadList();
      }).catch(function (er) { UI.busy(btn, false); Diag.error('fechar-horarios', er); general.appendChild(UI.notice('bad', UI.errorText(er, 'Não foi possível fechar agora.'))); });
    } }, h('h2', null, 'Fechar um período'), h('p', { class: 'muted small' }, 'Férias, feriado, um compromisso. Os pacientes deixam de ver esses horários para marcar consulta.'),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'O que fechar'), seg.el), h('div', { class: 'grid2' }, from.el, to.el), times, reason.el, general, btn);
    function loadList() {
      API.agenda.get().then(function (g) {
        clear(listBox);
        if (!g.blocks.length) { listBox.appendChild(h('p', { class: 'muted small' }, 'Nada fechado por enquanto.')); return; }
        listBox.appendChild(h('div', { class: 'group-title' }, 'Fechados agora'));
        listBox.appendChild(h('div', { class: 'group' }, g.blocks.map(function (b) {
          return h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('ban', 20)), h('span', { class: 'grow' }, h('span', { class: 't' }, rangeText(b)), b.reason ? h('span', { class: 's' }, b.reason) : null),
            h('button', { type: 'button', class: 'btn ghost sm auto', onclick: function (ev) {
              UI.busy(ev.currentTarget, true);
              API.agenda.blockRemove(b.id).then(function () { UI.toast('Período reaberto.', 'circle-check'); loadList(); }).catch(function (er) { UI.busy(ev.currentTarget, false); UI.toast(UI.errorText(er)); });
            } }, 'Reabrir'));
        })));
      }).catch(function (e) { Diag.error('fechamentos', e); clear(listBox); listBox.appendChild(UI.notice('bad', 'Não foi possível carregar os períodos fechados.')); });
    }
    box.appendChild(form); box.appendChild(listBox);
    loadList();
    return box;
  }

  /* ---------------------------------------------------------------- aba Horários de atendimento */
  var WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  var WEEK_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  function settingsPanel(state) {
    var box = h('div', null, UI.loading());
    API.agenda.get().then(function (g) {
      clear(box);
      var s = g.settings;
      var hours = {};
      WEEK_ORDER.forEach(function (d) { hours[d] = []; });
      g.hours.forEach(function (x) { hours[x.weekday].push({ starts: x.starts, ends: x.ends }); });

      var enabled = UI.toggle({ value: s.booking_enabled, label: 'Receber pedidos de consulta pelo Senso' });
      var inP = UI.checkbox({ label: 'Atendo presencialmente' }), onl = UI.checkbox({ label: 'Atendo online' });
      inP.input.checked = !!s.accepts_in_person; onl.input.checked = !!s.accepts_online;
      function choice(label, key, opts, value) { return UI.field({ label: label, type: 'select', options: opts.map(function (o) { return [String(o[0]), o[1]]; }), value: String(value) }); }
      var sess = choice('Duração da consulta', 'session_minutes', [[30, '30 minutos'], [40, '40 minutos'], [45, '45 minutos'], [50, '50 minutos'], [60, '1 hora'], [75, '1h15'], [90, '1h30']], s.session_minutes);
      if (!sess.input.querySelector('option[value="' + s.session_minutes + '"]')) { sess.input.appendChild(h('option', { value: String(s.session_minutes) }, s.session_minutes + ' minutos')); sess.input.value = String(s.session_minutes); }
      var buf = choice('Folga entre consultas', 'buffer_minutes', [[0, 'Nenhuma'], [5, '5 minutos'], [10, '10 minutos'], [15, '15 minutos'], [20, '20 minutos'], [30, '30 minutos']], s.buffer_minutes);
      var step = choice('Oferecer horários a cada', 'step_minutes', [[15, '15 minutos'], [20, '20 minutos'], [30, '30 minutos'], [45, '45 minutos'], [60, '1 hora'], [90, '1h30'], [120, '2 horas']], s.step_minutes);
      var notice = choice('Antecedência mínima', 'min_notice_hours', [[0, 'Sem antecedência'], [2, '2 horas'], [6, '6 horas'], [12, '12 horas'], [24, '1 dia'], [48, '2 dias'], [72, '3 dias']], s.min_notice_hours);
      var ahead = choice('Até quantos dias à frente', 'max_days_ahead', [[14, '14 dias'], [30, '30 dias'], [60, '60 dias'], [90, '90 dias'], [120, '120 dias']], s.max_days_ahead);
      [[notice, s.min_notice_hours], [ahead, s.max_days_ahead]].forEach(function (p) {
        if (!p[0].input.querySelector('option[value="' + p[1] + '"]')) { p[0].input.appendChild(h('option', { value: String(p[1]) }, String(p[1]))); p[0].input.value = String(p[1]); }
      });
      var price = UI.field({ label: 'Valor da consulta (R$)', optional: true, inputmode: 'decimal', maxlength: 12, value: moneyText(s.price_cents), hint: 'Aparece para o paciente na hora de pedir.' });
      var office = UI.field({ label: 'Endereço ou recado do consultório', type: 'textarea', optional: true, rows: 3, maxlength: 300, value: s.office_note || '', hint: 'Aparece nas consultas presenciais. Ex.: Rua X, 123, sala 4.' });

      var hoursBox = h('div', { class: 'hours-edit' });
      function drawHours() {
        clear(hoursBox);
        WEEK_ORDER.forEach(function (d) {
          var list = hours[d];
          var rows = list.map(function (r, i) {
            var a = h('input', { type: 'time', value: r.starts, 'aria-label': WEEK_NAME[d] + ', começa às', onchange: function () { r.starts = a.value; } });
            var b = h('input', { type: 'time', value: r.ends, 'aria-label': WEEK_NAME[d] + ', termina às', onchange: function () { r.ends = b.value; } });
            return h('div', { class: 'hours-row' }, a, h('span', { class: 'muted' }, 'até'), b,
              h('button', { type: 'button', class: 'linkbtn small danger-link', 'aria-label': 'Remover horário de ' + WEEK_NAME[d], onclick: function () { list.splice(i, 1); drawHours(); } }, 'Remover'));
          });
          hoursBox.appendChild(h('div', { class: 'hours-day' }, h('div', { class: 'hours-name' }, h('b', null, WEEK_NAME[d])),
            h('div', { class: 'grow' }, rows.length ? rows : h('span', { class: 'muted small' }, 'Não atende'),
              h('button', { type: 'button', class: 'linkbtn small', onclick: function () { list.push(list.length ? { starts: '14:00', ends: '18:00' } : { starts: '09:00', ends: '12:00' }); drawHours(); } }, '+ Adicionar horário'))));
        });
      }
      drawHours();
      var preset = h('button', { type: 'button', class: 'btn ghost sm auto', onclick: function () {
        [1, 2, 3, 4, 5].forEach(function (d) { hours[d] = [{ starts: '09:00', ends: '12:00' }, { starts: '14:00', ends: '18:00' }]; }); drawHours();
      } }, 'Preencher segunda a sexta (9h às 12h e 14h às 18h)');

      var general = h('div', { 'aria-live': 'polite' });
      var save = UI.button('Salvar', { type: 'submit' });
      save.classList.add('mt16');
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); general.textContent = '';
        if (!inP.checked() && !onl.checked()) { general.appendChild(UI.notice('warn', 'Marque pelo menos um tipo de atendimento.')); return; }
        var cents = parseMoney(price.value());
        if (cents !== null && isNaN(cents)) { price.setError('Confira o valor.'); price.input.focus(); return; }
        var list = [];
        for (var i = 0; i < WEEK_ORDER.length; i++) {
          var d = WEEK_ORDER[i];
          for (var j = 0; j < hours[d].length; j++) {
            var r = hours[d][j];
            if (!r.starts || !r.ends || r.ends <= r.starts) { general.appendChild(UI.notice('warn', WEEK_NAME[d] + ': o horário final vem depois do inicial.')); return; }
            list.push({ weekday: d, starts: r.starts, ends: r.ends });
          }
        }
        if (enabled.get() && !list.length) { general.appendChild(UI.notice('warn', 'Para receber pedidos, coloque pelo menos um horário de atendimento.')); return; }
        UI.busy(save, true);
        API.agenda.save({ booking_enabled: enabled.get(), session_minutes: +sess.value(), buffer_minutes: +buf.value(), step_minutes: +step.value(), min_notice_hours: +notice.value(),
          max_days_ahead: +ahead.value(), price_cents: cents, accepts_in_person: inP.checked(), accepts_online: onl.checked(), office_note: office.value().trim(), hours: list })
          .then(function () { UI.busy(save, false); UI.toast('Horários salvos.', 'circle-check'); })
          .catch(function (e) { UI.busy(save, false); Diag.error('salvar-agenda', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora.'))); });
      } },
        h('section', { class: 'card' }, h('div', { class: 'item flat' }, h('span', null, h('span', { class: 't' }, 'Receber pedidos de consulta pelo Senso'), h('span', { class: 's' }, 'Seus pacientes confirmados escolhem um horário livre e você aprova.')), enabled.el),
          h('div', { class: 'mt16' }, inP.el, onl.el)),
        h('section', { class: 'card' }, h('h2', null, 'Horários de atendimento'), h('p', { class: 'muted small' }, 'Os horários livres que o paciente vê saem daqui, menos o que você já marcou ou fechou.'), hoursBox, h('div', { class: 'mt16' }, preset)),
        h('section', { class: 'card' }, h('h2', null, 'Regras'), sess.el, buf.el, step.el, notice.el, ahead.el),
        h('section', { class: 'card' }, h('h2', null, 'Valor e local'), price.el, office.el,
          h('p', { class: 'small muted mb0' }, 'Pagamento pelo Senso: em breve. Por enquanto você registra o pagamento na consulta.')),
        general, save);
      box.appendChild(form);
    }).catch(function (e) { Diag.error('ajustes-agenda', e); clear(box); box.appendChild(UI.notice('bad', 'Não foi possível carregar os ajustes agora.')); });
    return box;
  }

  /* ---------------------------------------------------------------- tela Agenda */
  S.agenda = function (ctx, q) {
    if (!isVerifiedPro(ctx)) return pageLock(ctx, 'agenda', 'Agenda', 'Pedidos, consultas e horários');
    var newBtn = h('button', { type: 'button', class: 'btn auto sm', onclick: function () { S.newAppointmentSheet({ day: q && /^\d{4}-\d{2}-\d{2}$/.test(q.d || '') ? q.d : null, onDone: function () { state.reload(); } }); } }, UI.svg('calendar-plus', 18), 'Marcar consulta');
    var freeBtn = h('button', { type: 'button', class: 'btn ghost auto sm', onclick: function () { S.freeSlotsSheet({ onDone: function () { state.reload(); } }); } }, UI.svg('clock', 18), 'Horários livres');
    var holder = h('div');
    var node = S.shell(ctx, 'agenda', [UI.pageHead('Agenda', null, h('div', { class: 'row-gap' }, freeBtn, newBtn)), holder]);
    var tabNames = ['pedidos', 'semana', 'fechar', 'ajustes'];
    var firstTab = tabNames.indexOf(q && q.aba) >= 0 ? q.aba : (q && q.d ? 'semana' : null);
    var count = 0, tabsApi = null;
    var state = {
      reload: function () { build(); },
      reloadCount: function () { /* a contagem é refeita ao abrir a aba Pedidos */ },
      setCount: function (n) { count = n; var b = holder.querySelector('[data-tab="pedidos"]'); if (b) b.textContent = 'Pedidos' + (n ? ' (' + n + ')' : ''); }
    };
    var cur = null;
    function build() {
      clear(holder);
      var start = firstTab || cur || 'pedidos';
      tabsApi = UI.tabs({ label: 'Seções da agenda', value: start, tabs: [['pedidos', 'Pedidos'], ['semana', 'Agenda'], ['fechar', 'Fechar'], ['ajustes', 'Horários']], onChange: function (k) { cur = k; },
        render: function (k) {
          if (k === 'pedidos') return requestsPanel(state);
          if (k === 'semana') return weekPanel(state, q && /^\d{4}-\d{2}-\d{2}$/.test(q.d || '') ? q.d : null);
          if (k === 'fechar') return blocksPanel(state);
          return settingsPanel(state);
        } });
      cur = start; firstTab = null;
      holder.appendChild(tabsApi.el);
      Array.prototype.forEach.call(holder.querySelectorAll('.seg button'), function (b, i) { b.setAttribute('data-tab', tabNames[i]); });
    }
    build();
    return node;
  };

  /* ---------------------------------------------------------------- avaliações (anônimas) */
  S.proReviews = function (ctx) {
    if (!isVerifiedPro(ctx)) return pageLock(ctx, 'avaliacoes', 'Avaliações', 'O que os pacientes acharam das consultas');
    var holder = h('div', null, UI.loading());
    var node = S.shell(ctx, 'avaliacoes', [UI.pageHead('Avaliações'), holder]);
    API.pro.reviews().then(function (r) {
      clear(holder);
      holder.appendChild(UI.notice('info', 'As avaliações são anônimas. Você não vê quem avaliou nem qual consulta foi.'));
      if (r.hidden) {
        holder.appendChild(UI.empty('star', 'Ainda é cedo para mostrar', 'Para proteger o anonimato, a média e os comentários só aparecem a partir de ' + r.needed + ' avaliações. Você tem ' + r.count + '.'));
        return;
      }
      var st = UI.stars({ readonly: true, value: Math.round(r.avg), label: 'Média', size: 22 });
      holder.appendChild(h('div', { class: 'stat-row' }, h('div', { class: 'stat' }, h('b', null, Charts.fmt1(r.avg) + ' / 5'), h('span', null, 'média geral')), h('div', { class: 'stat' }, h('b', null, String(r.count)), h('span', null, r.count === 1 ? 'avaliação' : 'avaliações'))));
      holder.appendChild(h('div', { class: 'card' }, h('div', { class: 'row-gap' }, st.el, h('b', null, Charts.fmt1(r.avg))), h('h2', { class: 'mt16' }, 'Como ficaram as notas'),
        Charts.bars([5, 4, 3, 2, 1].map(function (s) { return { label: s + (s === 1 ? ' estrela' : ' estrelas'), value: (r.distribution || {})[s] || 0 }; }), { max: Math.max(1, r.count), int: true, label: 'Quantidade de avaliações por nota' })));
      if (r.by_month && r.by_month.length) {
        holder.appendChild(h('div', { class: 'card' }, h('h2', null, 'Média por mês'), h('p', { class: 'muted small' }, 'Só meses com 3 avaliações ou mais.'),
          Charts.bars(r.by_month.map(function (m) { return { label: T.MON3[+m.month.slice(5, 7) - 1] + '/' + m.month.slice(2, 4), value: m.avg, sub: '(' + m.n + ')' }; }), { mood: true, label: 'Média de estrelas por mês' })));
      }
      var liked = (r.comments || []).filter(function (c) { return c.liked; }), sug = (r.comments || []).filter(function (c) { return c.suggestion; });
      function commentList(title, items, key) {
        if (!items.length) return null;
        return h('section', null, h('div', { class: 'group-title' }, title), items.map(function (c) {
          return h('article', { class: 'card review' }, UI.stars({ readonly: true, value: c.stars, label: 'Nota', size: 16 }).el, h('p', { class: 'mb0' }, c[key]));
        }));
      }
      var a = commentList('O que acharam', liked, 'liked'), b = commentList('Sugestões', sug, 'suggestion');
      if (a) holder.appendChild(a);
      if (b) holder.appendChild(b);
      if (!a && !b) holder.appendChild(h('p', { class: 'muted center' }, 'Ninguém deixou comentário ainda, só notas.'));
    }).catch(function (e) { Diag.error('avaliacoes', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar as avaliações agora.')); });
    return node;
  };

  /* ---------------------------------------------------------------- Atendimento: WhatsApp, avisos e link de cadastro */
  var PREF_LABEL = { requests: ['calendar-plus', 'Pedidos de consulta', ''], replies: ['calendar-check', 'Respostas dos pacientes', ''],
    cancellations: ['calendar-x', 'Cancelamentos', ''], birthdays: ['cake', 'Aniversários', ''], new_patients: ['user-plus', 'Pedidos de vínculo e encaminhamentos', ''] };

  function whatsappCard() {
    var holder = h('section', { class: 'card' }, UI.loading());
    API.pro.contact().then(function (c) {
      clear(holder);
      var phone = UI.phoneField({ label: 'WhatsApp que seus pacientes vão usar', value: c.whatsapp_phone || c.suggested_phone || '', hint: 'Com DDD.' });
      var on = UI.toggle({ value: c.whatsapp_enabled, label: 'Mostrar o botão “Falar com meu psicólogo(a)” para meus pacientes' });
      var general = h('div', { 'aria-live': 'polite' });
      var btn = UI.button('Salvar', { type: 'submit' });
      var test = h('a', { class: 'btn ghost auto', href: '#', target: '_blank', rel: 'noopener', onclick: function (ev) {
        var l = UI.waLink(phone.value(), 'Teste do Senso.');
        if (!l) { ev.preventDefault(); phone.setError('Digite o número com DDD.'); phone.input.focus(); return; }
        ev.currentTarget.href = l;
      } }, UI.svg('external-link', 18), 'Testar o número');
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); general.textContent = '';
        if (on.get() && !UI.phoneOk(phone.value())) { phone.setError('Digite o número com DDD para ligar o botão.'); phone.input.focus(); return; }
        if (phone.value().trim() && !UI.phoneOk(phone.value())) { phone.setError('Confira o número, com DDD.'); phone.input.focus(); return; }
        UI.busy(btn, true);
        API.pro.saveContact(on.get(), phone.value().trim()).then(function () { UI.busy(btn, false); UI.toast('WhatsApp salvo.', 'circle-check'); })
          .catch(function (e) { UI.busy(btn, false); Diag.error('whatsapp', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora.'))); });
      } }, h('div', { class: 'item flat' }, h('span', { class: 't' }, 'Botão de WhatsApp para pacientes'), on.el),
        phone.el, general, h('div', { class: 'btn-row' }, btn, test));
      holder.appendChild(h('div', { class: 'row' }, h('span', { class: 'ico-box' }, UI.svg('message-circle', 22)), h('div', { class: 'grow' }, h('h2', { class: 'mb0' }, 'WhatsApp'))));
      holder.appendChild(form);
    }).catch(function (e) { Diag.error('contato', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar o WhatsApp agora.')); });
    return holder;
  }

  function prefsCard() {
    var holder = h('section', { class: 'card' }, UI.loading());
    API.notify.prefs().then(function (p) {
      clear(holder);
      var off = (p.off || []).slice();
      holder.appendChild(h('div', { class: 'row' }, h('span', { class: 'ico-box' }, UI.svg('bell', 22)), h('div', { class: 'grow' }, h('h2', { class: 'mb0' }, 'Avisos no sininho'))));
      var rows = (p.groups || []).map(function (g) {
        var meta = PREF_LABEL[g.key] || ['bell', g.key, ''];
        var tg = UI.toggle({ value: g.on, label: meta[1], onChange: function (v) {
          var next = off.filter(function (k) { return k !== g.key; });
          if (!v) next.push(g.key);
          return API.notify.setPrefs(next).then(function () { off = next; UI.toast(v ? 'Vai receber esse aviso.' : 'Não vai receber esse aviso.', 'circle-check'); }).catch(function (e) { UI.toast(UI.errorText(e)); throw e; });
        } });
        return h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg(meta[0], 20)), h('span', { class: 'grow' }, h('span', { class: 't' }, meta[1]), h('span', { class: 's' }, meta[2])), tg.el);
      });
      holder.appendChild(h('div', { class: 'group mt16' }, rows));
    }).catch(function (e) { Diag.error('avisos-prefs', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar as opções de aviso agora.')); });
    return holder;
  }

  S.service = function (ctx) {
    return S.shell(ctx, 'atendimento', [UI.pageHead('Atendimento'),
      whatsappCard(), S.inviteCard(), prefsCard(),
      h('a', { class: 'cta-card strip', href: '#/agenda?aba=ajustes' }, h('span', { class: 'ico-box' }, UI.svg('calendar-days', 22)), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Horários e valor da consulta')), h('span', { class: 'btn auto sm' }, 'Abrir'))]);
  };
})();
