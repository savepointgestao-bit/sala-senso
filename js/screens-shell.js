/* Moldura da area logada: menu lateral (computador), barra de baixo com "Mais" (celular), sininho de avisos nos dois perfis
   e, para o paciente, o botao "Preciso de ajuda" sempre a vista. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }

  /* ---------------------------------------------------------------- menus */
  /* Suporte, Meu psicólogo(a) e Avaliações moraram no menu; agora ficam dentro da Conta (os endereços continuam os mesmos). */
  var UNDER_ACCOUNT = { suporte: 1, psicologo: 1, avaliacoes: 1 };
  S.menuFor = function (ctx) {
    var p = ctx.me.profile, pro = p.role === 'professional';
    var adminMode = !!ctx.admin && (ctx.mode || 'admin') === 'admin';
    if (adminMode) return { main: [['equipe', '#/equipe', 'shield-check', 'Equipe'], ['conta', '#/conta', 'user', 'Conta']], more: [] };
    if (pro) {
      return { main: [['inicio', '#/inicio', 'house', 'Início'], ['pacientes', '#/pacientes', 'users', 'Pacientes'], ['agenda', '#/agenda', 'calendar-days', 'Agenda'],
        ['financeiro', '#/financeiro', 'wallet', 'Financeiro'], ['atendimento', '#/atendimento', 'message-circle', 'Atendimento'], ['conta', '#/conta', 'user', 'Conta']], more: [] };
    }
    return { main: [['inicio', '#/inicio', 'house', 'Início'], ['diario', '#/diario', 'notebook-pen', 'Diário'], ['consultas', '#/consultas', 'calendar-days', 'Consultas'],
      ['lab', '#/lab', 'flask-conical', 'Lab'], ['conta', '#/conta', 'user', 'Conta']], more: [] };
  };

  /* ---------------------------------------------------------------- sininho */
  var bells = [], pollTimer = null;
  function timeAgo(iso) {
    var s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h';
    var d = UI.dt.dayOf(iso);
    return UI.dt.dayLabel(d, false);
  }
  var KIND_ICON = { appointment_requested: 'calendar-plus', appointment_approved: 'calendar-check', appointment_accepted: 'calendar-check', appointment_declined: 'calendar-x', appointment_refused: 'calendar-x',
    appointment_proposed: 'calendar-days', appointment_scheduled: 'calendar-check', appointment_moved: 'calendar-days', appointment_canceled: 'calendar-x', birthday: 'cake', patient_linked: 'user-plus', record_verified: 'circle-check',
    link_request: 'user-plus', link_invite: 'heart-handshake', link_accepted: 'circle-check', link_declined: 'user-x', transfer_received: 'arrow-right', transfer_accepted: 'circle-check', transfer_declined: 'user-x' };

  function setCounts(n) { bells.forEach(function (b) { b.set(n); }); }
  function refreshCount() {
    if (!bells.length || document.visibilityState === 'hidden') return;
    API.notify.list(1).then(function (r) { setCounts(r.unread || 0); }).catch(function () { /* sem sininho, sem problema */ });
  }
  function openBell(ctx) {
    var list = h('div', { class: 'notes', 'aria-live': 'polite' }, UI.loading());
    var sh;
    function draw(r) {
      UI.clear(list);
      if (!r.items.length) { list.appendChild(h('p', { class: 'muted center' }, 'Nenhum aviso por enquanto.')); return; }
      r.items.forEach(function (n) {
        var inner = [h('span', { class: 'ico-box' + (n.read ? '' : ' hot') }, UI.svg(KIND_ICON[n.kind] || 'bell', 20)),
          h('span', { class: 'grow' }, h('span', { class: 't' }, n.title), n.body ? h('span', { class: 's' }, n.body) : null, h('span', { class: 'when' }, timeAgo(n.created_at))),
          n.read ? null : h('i', { class: 'unread', 'aria-label': 'Não lido' })];
        var open = function () {
          API.notify.markRead([n.id]).catch(function () { /* ignore */ }).then(function () { refreshCount(); });
          sh.close('go');
          if (n.link) go(n.link);
        };
        list.appendChild(h('button', { type: 'button', class: 'bell-item' + (n.read ? '' : ' unread-row'), onclick: open }, inner));
      });
    }
    var all = UI.button('Marcar todas como lidas', { variant: 'ghost', onclick: function () {
      API.notify.markRead(null).then(function () { setCounts(0); return API.notify.list(30); }).then(draw);
    } });
    var isPro = ctx.me.profile.role === 'professional';
    sh = UI.sheet({ title: 'Avisos', content: [list, h('div', { class: 'bell-foot' }, all,
      isPro ? h('a', { class: 'btn ghost', href: '#/atendimento', onclick: function () { sh.close('go'); } }, UI.svg('sliders-horizontal', 18), 'Escolher o que receber') : null)] });
    API.notify.list(30).then(function (r) { setCounts(r.unread || 0); draw(r); }).catch(function (e) {
      Diag.error('avisos', e); UI.clear(list); list.appendChild(UI.notice('bad', 'Não foi possível carregar os avisos agora.'));
    });
  }
  function bellButton(ctx) {
    var n = h('span', { class: 'bell-n hide', 'aria-hidden': 'true' });
    var b = h('button', { type: 'button', class: 'bell', 'aria-label': 'Avisos', onclick: function () { openBell(ctx); } }, UI.svg('bell', 22), n);
    bells.push({ set: function (c) {
      n.textContent = c > 9 ? '9+' : String(c);
      n.classList.toggle('hide', !c);
      b.setAttribute('aria-label', c ? 'Avisos, ' + c + (c === 1 ? ' não lido' : ' não lidos') : 'Avisos');
    } });
    return b;
  }

  /* ---------------------------------------------------------------- moldura */
  S.shell = function (ctx, active, content) {
    var p = ctx.me.profile, pro = p.role === 'professional';
    var adminMode = !!ctx.admin && (ctx.mode || 'admin') === 'admin';
    var menu = S.menuFor(ctx), all = menu.main.concat(menu.more);
    if (UNDER_ACCOUNT[active]) active = 'conta';
    var activeMore = menu.more.some(function (it) { return it[0] === active; });
    bells = [];
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    var withBell = !adminMode;
    /* So dentro do app do celular: avisa o bloqueio (nome na tela do PIN) e os lembretes (reprogramar os avisos). */
    if (window.AppLock) AppLock.touch(ctx);
    if (window.AppReminders) AppReminders.touch(ctx);
    var lockBtn = window.AppLock && AppLock.enabled() && S.lockButton ? S.lockButton() : null;

    function link(it) { return h('a', { href: it[1], 'aria-current': active === it[0] ? 'page' : null }, UI.svg(it[2], 22), h('span', null, it[3])); }
    function me(size) { return UI.avatar(p.full_name, { size: size, level: !pro && ctx.progress ? ctx.progress.level : null }); }
    function helpBtn(cls) {
      return h('a', { class: 'help-btn ' + cls, href: '#/ajuda', 'aria-current': active === 'ajuda' ? 'page' : null, 'aria-label': 'Preciso de ajuda' }, UI.svg('life-buoy', 20), h('span', { class: 'lbl' }, 'Preciso de ajuda'));
    }
    var withHelp = !pro && !adminMode;

    var moreBtn = menu.more.length ? h('button', { type: 'button', class: 'more-btn', 'aria-current': activeMore ? 'page' : null, 'aria-haspopup': 'dialog', onclick: function () {
      var rows = menu.more.map(function (it) {
        return h('a', { class: 'item', href: it[1], onclick: function () { sh.close('go'); } }, h('span', { class: 'ico-box' }, UI.svg(it[2], 20)), h('span', { class: 't' }, it[3]), h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
      });
      var sh = UI.sheet({ title: 'Mais', content: h('div', { class: 'group' }, rows) });
    } }, UI.svg('ellipsis', 22), h('span', null, 'Mais')) : null;

    var node = h('div', { class: 'app' },
      h('aside', { class: 'side' },
        h('div', { class: 'side-top' }, UI.brand('#/inicio'), withBell ? bellButton(ctx) : null),
        h('nav', { 'aria-label': 'Menu principal' }, all.map(link)),
        withHelp ? helpBtn('side-help') : null,
        S.modeSwitch(ctx, true),
        h('div', { class: 'me' }, me(),
          h('div', { class: 'who' }, h('b', null, p.full_name), h('span', null, S.roleLabel(ctx))))),
      h('div', null,
        h('header', { class: 'mhead' }, UI.brand('#/inicio'),
          h('div', { class: 'mhead-right' },
            ctx.admin ? h('a', { class: 'mhead-mode', href: '#/conta', 'aria-label': 'Modo de teste: ' + S.roleLabel(ctx) + '. Trocar em Conta' }, S.roleLabel(ctx)) : null,
            withHelp ? helpBtn('mhead-help') : null,
            lockBtn,
            withBell ? bellButton(ctx) : null,
            h('a', { class: 'mhead-me', href: '#/conta', 'aria-label': 'Minha conta' }, me()))),
        h('main', { class: 'main', id: 'conteudo' }, content)),
      h('nav', { class: 'bottom', 'aria-label': 'Menu' }, menu.main.map(link), moreBtn));
    if (withBell) {
      refreshCount();
      pollTimer = setInterval(refreshCount, 60000);
    }
    return node;
  };

  /* Cartao de aviso fixo no topo do inicio quando ha novidade importante (ex.: pedidos de consulta aguardando). */
  S.pendingStrip = function (icon, text, href, actionLabel) {
    return h('a', { class: 'cta-card strip', href: href }, h('span', { class: 'ico-box' }, UI.svg(icon, 22)), h('div', { class: 'grow' }, h('div', { class: 't' }, text)),
      h('span', { class: 'btn auto sm' }, actionLabel || 'Ver'));
  };
})();
