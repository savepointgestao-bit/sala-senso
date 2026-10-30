/* Lembretes de consulta no celular (so dentro do APK; no navegador este arquivo nao faz nada).
   Os avisos nascem NO APARELHO: o portal le a agenda (psicologo) ou as consultas marcadas (paciente) e entrega a lista para o Android,
   que agenda os alarmes. Nada de nome ou horario passa por servidor de terceiros. Sem nome na notificacao, a menos que a pessoa ligue.
   Na tela bloqueada o Android mostra so "Voce tem um lembrete". Ao sair da conta, a lista e apagada do aparelho. */
(function () {
  'use strict';
  var A = window.Android;
  if (!A) return;
  var h = UI.h, S = window.Screens = window.Screens || {}, T = UI.dt;

  var LS = 'psi_reminders';
  var DEF = { on: false, ant: 60, sum: false, sumAt: '07:30', evo: false, nm: false };
  var ANT = [[-1, 'Sem aviso antes'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes']];
  var SIX = 6 * 3600000, THREE = 3 * 3600000, DAY = 86400000, MAX_ITEMS = 150;

  function call(name) {
    try { var f = A[name]; return typeof f === 'function' ? f.apply(A, Array.prototype.slice.call(arguments, 1)) : undefined; } catch (e) { return undefined; }
  }
  function refresh() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

  /* ---------------------------------------------------------------- opcoes (ficam neste celular) */
  /* Uma chave por conta: quem entra neste celular depois nao herda os lembretes de quem usou antes. */
  function keyOf(ctx) {
    var id = ctx && ctx.me && ctx.me.profile && ctx.me.profile.id;
    return LS + (id ? '_' + String(id).replace(/[^A-Za-z0-9-]/g, '') : '');
  }
  function load(ctx) {
    var o = {};
    try { o = JSON.parse(localStorage.getItem(keyOf(ctx)) || '{}') || {}; } catch (e) { o = {}; }
    var L = {};
    Object.keys(DEF).forEach(function (k) { L[k] = o[k] === undefined || typeof o[k] !== typeof DEF[k] ? DEF[k] : o[k]; });
    if (!ANT.some(function (a) { return a[0] === L.ant; })) L.ant = DEF.ant;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(L.sumAt)) L.sumAt = DEF.sumAt;
    return L;
  }
  function store(L, ctx) { try { localStorage.setItem(keyOf(ctx), JSON.stringify(L)); } catch (e) { /* sem armazenamento: vale ate fechar */ } }

  /* ---------------------------------------------------------------- montar a lista */
  /* "Hoje", "Amanha" ou o dia, contando a partir do momento em que o aviso toca. */
  function dayWord(fireMs, day) {
    var fd = T.dayOf(fireMs);
    if (fd === day) return 'Hoje';
    if (T.addDays(fd, 1) === day) return 'Amanhã';
    return T.dayLabel(day);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* Psicologo. v = resposta de API.agenda.view. So as consultas confirmadas ('scheduled' ainda sem baixa) geram aviso. */
  function buildPro(v, L, now) {
    var items = [];
    var live = ((v && v.appointments) || []).filter(function (a) { return a && a.status === 'scheduled' && a.starts_at && isFinite(Date.parse(a.starts_at)); });
    live.forEach(function (a) {
      var st = Date.parse(a.starts_at), en = st + (Number(a.duration_minutes) || 50) * 60000;
      var nm = L.nm ? UI.firstName(a.full_name) : '', hm = T.hmOf(st), day = T.dayOf(st);
      if (L.ant >= 0 && st > now) {
        var t = st - L.ant * 60000;
        if (t > now - SIX) {
          items.push({ id: 'p' + a.id + '@' + t, t: t, title: nm ? 'Sessão com ' + nm : 'Lembrete de sessão',
            text: dayWord(t, day) + ' às ' + hm + (a.mode === 'online' ? ', online' : '') });
        }
      }
      if (L.evo) {
        var te = en + 10 * 60000;
        if (te > now - SIX) {
          items.push({ id: 'e' + a.id + '@' + te, t: te, title: 'Sessão para registrar',
            text: nm ? 'Registre a sessão com ' + nm + ' (' + hm + ').' : 'Registre a sessão das ' + hm + '.' });
        }
      }
    });
    if (L.sum) {
      var t0 = T.dayOf(now);
      for (var i = 0; i <= 14; i++) {
        var d = T.addDays(t0, i);
        var dayList = live.filter(function (a) { return T.dayOf(a.starts_at) === d; }).sort(function (a, b) { return Date.parse(a.starts_at) - Date.parse(b.starts_at); });
        if (!dayList.length) continue;
        var ts = T.at(d, L.sumAt);
        if (ts <= now - THREE) continue;
        var names = dayList.slice(0, 6).map(function (a) { return T.hmOf(a.starts_at) + (L.nm ? ' ' + UI.firstName(a.full_name) : ''); }).join(', ');
        items.push({ id: 'd' + d + '@' + ts, t: ts, title: 'Agenda de hoje', text: plural(dayList.length, 'sessão', 'sessões') + ': ' + names + (dayList.length > 6 ? '...' : '') });
      }
    }
    items.sort(function (a, b) { return a.t - b.t; });
    return items.slice(0, MAX_ITEMS);
  }

  /* Paciente. list = resposta de API.booking.mine. */
  function buildPatient(list, L, now) {
    var items = [];
    if (L.ant < 0) return items;
    (list || []).forEach(function (a) {
      if (!a || a.status !== 'scheduled' || !a.starts_at) return;
      var st = Date.parse(a.starts_at);
      if (!isFinite(st) || st <= now || st > now + 21 * DAY) return;
      var t = st - L.ant * 60000;
      if (t <= now - SIX) return;
      var nm = L.nm && a.professional_name ? UI.firstName(a.professional_name) : '';
      items.push({ id: 'c' + a.id + '@' + t, t: t, title: nm ? 'Consulta com ' + nm : 'Lembrete de consulta',
        text: dayWord(t, T.dayOf(st)) + ' às ' + T.hmOf(st) + (a.mode === 'online' ? ', online' : '') });
    });
    items.sort(function (a, b) { return a.t - b.t; });
    return items.slice(0, MAX_ITEMS);
  }

  /* ---------------------------------------------------------------- entregar ao Android */
  var EMPTY = JSON.stringify({ v: 1, items: [] }), lastJson = null;
  function push(items) {
    var json = JSON.stringify({ v: 1, items: items });
    call('scheduleReminders', json);
    lastJson = json;
  }
  function clearAll() { if (lastJson !== EMPTY) push([]); }

  var ctxNow = null, timer = null, lastSync = 0, seq = 0;
  function kindOf(ctx) {
    if (!ctx || !ctx.me || !ctx.me.profile) return null;
    if (ctx.admin && (ctx.mode || 'admin') === 'admin') return null;     /* equipe no modo Administrador nao tem agenda */
    return ctx.me.profile.role === 'professional' ? 'pro' : 'patient';
  }
  function run(force) {
    var kind = kindOf(ctxNow);
    if (!kind) return Promise.resolve();
    if (!force && Date.now() - lastSync < 120000) return Promise.resolve();
    var L = load(ctxNow);
    if (!L.on) { clearAll(); return Promise.resolve(); }
    lastSync = Date.now();
    var my = ++seq, today = T.today();
    var p;
    try {
      p = kind === 'pro' ? API.agenda.view(T.addDays(today, -1), T.addDays(today, 21)) : API.booking.mine();
    } catch (e) { return Promise.resolve(); }
    return Promise.resolve(p).then(function (data) {
      if (my !== seq || !ctxNow) return;
      var now = Date.now();
      push(kind === 'pro' ? buildPro(data, L, now) : buildPatient(data, L, now));
    }).catch(function (e) {
      /* sem rede ou erro: fica a lista que ja estava agendada */
      lastSync = 0;
      if (window.Diag) Diag.error('lembretes', e);
    });
  }
  /* Agenda a sincronizacao em instantes (junta pedidos seguidos). force ignora o intervalo minimo de 2 minutos. */
  function soon(force, ms) {
    clearTimeout(timer);
    timer = setTimeout(function () { run(!!force); }, ms == null ? 700 : ms);
  }

  /* Mexeu na agenda (marcar, mover, cancelar, responder pedido): reprograma os avisos. */
  function watch(ns, skip) {
    var o = window.API && API[ns];
    if (!o) return;
    Object.keys(o).forEach(function (k) {
      var f = o[k];
      if (typeof f !== 'function' || skip.indexOf(k) >= 0 || f.__rem) return;
      var g = function () {
        var r = f.apply(o, arguments);
        if (r && typeof r.then === 'function') r.then(function () { soon(true, 1500); }, function () { /* quem chamou trata */ });
        return r;
      };
      g.__rem = true;
      o[k] = g;
    });
  }
  watch('agenda', ['view', 'get', 'freeSlots']);
  watch('booking', ['psychologists', 'info', 'slots', 'mine', 'review']);

  /* Saiu da conta: a lista de avisos sai do aparelho junto. */
  API.onAuth(function (ev) {
    if (ev !== 'SIGNED_OUT') return;
    ctxNow = null; seq++;
    clearTimeout(timer);
    push([]);
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && ctxNow) soon(true, 1200); });

  /* ---------------------------------------------------------------- tela Lembretes (em Conta) */
  function status() { return String(call('notifStatus') || 'off'); }

  function swRow(icon, title, sub, tg) {
    return h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg(icon, 20)),
      h('span', { class: 'grow' }, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), tg.el);
  }

  S.reminders = function (ctx) {
    var L = load(ctx), kind = kindOf(ctx), pro = kind === 'pro', pending = false, sh;
    var what = pro ? 'sessão' : 'consulta';

    window.__notifPerm = function (ok) {
      if (!pending) return;
      pending = false;
      if (ok) { L.on = true; store(L, ctx); soon(true, 200); UI.toast('Lembretes ligados.', 'circle-check'); onT.set(true); }
      else UI.toast('As notificações estão bloqueadas para o Senso. Libere nas configurações do Android.');
      paint();
    };

    var warn = h('div');
    var more = h('div', { class: 'rem-more' });
    var onT = UI.toggle({ value: L.on, label: 'Lembretes neste celular', onChange: function (v) {
      if (!v) { L.on = false; store(L, ctx); soon(true, 200); paint(); return; }
      if (status() === 'ok') { L.on = true; store(L, ctx); soon(true, 200); paint(); return; }
      pending = true;
      if (window.AppLock) AppLock.hold();       /* o pedido de permissao do Android tira o app de cena */
      call('requestNotifPermission');
      return Promise.reject(new Error('pending'));   /* o botao volta a "desligado" ate o Android responder */
    } });

    function paint() {
      UI.clear(warn);
      more.classList.toggle('hide', !L.on);
      if (L.on && status() === 'off') {
        warn.appendChild(UI.notice('warn', h('span', null, 'As notificações do Senso estão desligadas no Android, então os avisos não vão aparecer. ',
          h('button', { type: 'button', class: 'linkbtn', onclick: function () { if (window.AppLock) AppLock.hold(); call('openNotifSettings'); } }, 'Abrir configurações'))));
      }
    }

    var ant = UI.field({ type: 'select', label: 'Aviso antes da ' + what, options: ANT, value: String(L.ant) });
    ant.input.value = String(L.ant);
    ant.input.addEventListener('change', function () { L.ant = Number(ant.input.value); store(L, ctx); soon(true, 400); });
    more.appendChild(ant.el);

    if (pro) {
      var sumAt = UI.field({ type: 'time', label: 'Horário do resumo', value: L.sumAt });
      var sumBox = h('div', { class: L.sum ? '' : 'hide' }, sumAt.el);
      sumAt.input.addEventListener('change', function () {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sumAt.input.value)) return;
        L.sumAt = sumAt.input.value; store(L, ctx); soon(true, 400);
      });
      var sumT = UI.toggle({ value: L.sum, label: 'Resumo da agenda do dia', onChange: function (v) { L.sum = v; store(L, ctx); sumBox.classList.toggle('hide', !v); soon(true, 400); } });
      var evoT = UI.toggle({ value: L.evo, label: 'Lembrar de registrar a sessão', onChange: function (v) { L.evo = v; store(L, ctx); soon(true, 400); } });
      more.appendChild(h('div', { class: 'group' }, swRow('calendar-days', 'Resumo da agenda do dia', 'Um aviso de manhã com as sessões do dia', sumT),
        swRow('notebook-pen', 'Lembrar de registrar a sessão', 'Um aviso 10 minutos depois do fim, se a sessão ainda não foi baixada', evoT)));
      more.appendChild(sumBox);
    }

    var nmT = UI.toggle({ value: L.nm, label: pro ? 'Mostrar o nome do paciente no aviso' : 'Mostrar o nome do psicólogo(a) no aviso', onChange: function (v) { L.nm = v; store(L, ctx); soon(true, 400); } });
    more.appendChild(h('div', { class: 'group' }, swRow('eye', pro ? 'Mostrar o nome do paciente no aviso' : 'Mostrar o nome do psicólogo(a) no aviso',
      'Desligado, o aviso mostra só o horário. Na tela bloqueada o Android mostra apenas "Você tem um lembrete".', nmT)));

    more.appendChild(h('div', { class: 'al-actions' }, UI.button('Enviar aviso de teste', { variant: 'ghost', icon: 'bell', onclick: function () {
      if (status() !== 'ok') { UI.toast('As notificações do Senso estão desligadas no Android.'); return; }
      call('testNotification');
    } })));
    more.appendChild(h('p', { class: 'small muted' }, 'Alguns celulares (Xiaomi, Samsung, Motorola) fecham apps para economizar bateria. Se os avisos atrasarem ou não chegarem, libere o Senso em Configurações, Bateria, "Sem restrições".'));
    more.appendChild(h('p', { class: 'small muted' }, 'Os avisos são refeitos sempre que você abre o app ou muda a agenda. O horário pode variar alguns minutos pela economia de bateria.'));

    sh = UI.sheet({ title: 'Lembretes', onClose: function () { window.__notifPerm = function () { /* sem uso fora desta tela */ }; refresh(); }, content: [
      h('div', { class: 'rem-all' },
        h('p', { class: 'muted' }, pro ? 'Receba um aviso antes de cada sessão. Os avisos são feitos no próprio celular, a partir da sua agenda.' : 'Receba um aviso antes de cada consulta marcada. Os avisos são feitos no próprio celular.'),
        h('div', { class: 'group' }, swRow('bell', 'Lembretes neste celular', 'Precisa da permissão de notificações do Android', onT)),
        warn, more)] });
    paint();
    return sh;
  };

  /* Linha "Lembretes" do grupo "Neste celular" da tela Conta. */
  S.remindersRow = function (ctx) {
    if (!kindOf(ctx)) return null;
    var on = load(ctx).on;
    return h('button', { type: 'button', class: 'item', onclick: function () { S.reminders(ctx); } }, h('span', { class: 'ico-box' }, UI.svg('bell-ring', 20)),
      h('span', { class: 't' }, 'Lembretes'), h('span', { class: 'badge tag ' + (on ? 'ok' : '') }, on ? 'Ligados' : 'Desligados'), h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
  };

  window.AppReminders = {
    touch: function (ctx) { ctxNow = ctx; if (kindOf(ctx)) soon(false); },
    soon: soon,
    build: { pro: buildPro, patient: buildPatient }
  };
})();
