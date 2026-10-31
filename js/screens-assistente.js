/* Assistente do paciente: conversa de FLUXO FIXO. Botoes e respostas prontas, sem inteligencia artificial e sem texto livre
   interpretado por modelo. O que a pessoa escreve so e comparado com algumas palavras (marcar, cancelar, ajuda...).
   Usa as mesmas chamadas da tela de Consultas (API.booking.*); nao grava a conversa em lugar nenhum. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};
  var TYPE_MS = 420;
  var PLACEHOLDER = 'Escreva, por ex.: marcar, ajuda';

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function pause(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function wa(x, me) { return x.whatsapp ? UI.waLink(x.whatsapp, 'Olá, ' + UI.firstName(x.full_name) + '. Aqui é ' + UI.firstName(me) + '.') : null; }
  function bookable(x) { return !!x.booking_enabled && x.verified !== false; }
  var MODE = { in_person: 'Presencial', online: 'Online' };
  var STATUS = { requested: 'aguardando resposta', scheduled: 'confirmada', reschedule_proposed: 'novo horário sugerido' };

  /* Palavras que levam direto aos telefones de apoio. Na duvida, mostra: errar para o lado do cuidado. */
  var CRISIS = /(me matar|quero morrer|vou morrer|queria morrer|suicid|tirar (a )?minha vida|acabar com (tudo|minha vida)|nao quero mais viver|me machucar|me cortar|automutila|nao aguento mais)/;
  var INTENTS = [
    ['sos', /(socorro|panico|ansiedade|crise|desespero|sem ar|angustia|preciso de ajuda|ajuda agora)/],
    ['mine', /(consultas|proxima consulta|cancelar|desmarcar|remarcar|confirmar)/],
    ['book', /(\bmarcar\b|agendar|nova consulta|horario)/],
    ['talk', /(psicolog|whatsapp|falar com|mensagem)/],
    ['diary', /(diario|registrar|humor|como estou|como me sinto)/],
    ['faq', /(duvida|pagar|pagamento|preco|valor|privacidade|dados|senha|celular|email)/]
  ];

  var FAQ = [
    ['O que meu psicólogo(a) vê?', 'Seus dados de cadastro, o humor, a energia e a ansiedade que você registra, e as suas consultas. O texto do diário só vai para ele(a) se você escolher compartilhar. A avaliação da consulta é anônima.'],
    ['Como escolho se compartilho o diário?', 'Em Conta, abra "Meu psicólogo(a)". Lá você escolhe entre Perguntar, Sempre ou Nunca, e pode mudar quando quiser.'],
    ['Como pago a consulta?', 'O pagamento pelo Senso ainda não está disponível, vem em breve. Por enquanto, combine o pagamento direto com o(a) psicólogo(a).'],
    ['Como mudo meu celular ou e-mail?', 'Em Conta, toque em "Editar meus dados". O e-mail também se troca por lá.'],
    ['Como baixo ou apago meus dados?', 'Em Conta, use "Baixar meus dados" ou a opção de apagar a conta. Os dois pedem a sua senha para confirmar.'],
    ['O que é o Lab?', 'Uma área só sua, com exercícios, jogos e estudo para cuidar da cabeça entre as sessões. Seu psicólogo(a) não tem acesso.']
  ];

  /* Cartoes de ligacao (iguais aos da tela "Preciso de ajuda"). */
  function callCard(num, name, sub, main) {
    return h('a', { class: 'sos-call' + (main ? ' main' : ''), href: 'tel:' + num, 'aria-label': 'Ligar para ' + name + ', ' + num + '. ' + sub },
      h('span', { class: 'sos-num' }, UI.svg('phone-call', 20), num), h('span', { class: 'sos-name' }, name), h('span', { class: 'sos-sub' }, sub));
  }

  S.assistant = function (ctx) {
    var meName = ctx.me.profile.full_name;
    var first = UI.firstName(meName);
    var D = { psy: [], appts: [] };
    var chain = Promise.resolve();
    var inputMode = null;

    var log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa com o assistente' });
    var opts = h('div', { class: 'chat-opts', role: 'group', 'aria-label': 'Respostas rápidas' });
    var input = h('input', { type: 'text', class: 'chat-input', maxlength: 300, autocomplete: 'off', 'aria-label': 'Escreva uma palavra', placeholder: PLACEHOLDER });
    var form = h('form', { class: 'chat-form', novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      var v = input.value.trim();
      if (!v) return;
      input.value = '';
      clear(opts);
      var m = inputMode;
      resetInput();
      later(function () { bubble('me', v); });
      later(function () { if (m) m.onSubmit(v); else route(v); });
    } }, input, h('button', { type: 'submit', class: 'chat-send', 'aria-label': 'Enviar' }, UI.svg('send', 20)));

    var head = h('div', { class: 'chat-head' }, BotAvatar.svg(48, 'ok', BotAvatar.name),
      h('div', { class: 'grow' }, h('h1', null, 'Assistente'), h('p', { class: 'muted small mb0' }, 'Respostas prontas, sem inteligência artificial.')),
      h('a', { class: 'btn ghost sm auto', href: '#/ajuda' }, UI.svg('life-buoy', 18), 'Ajuda agora'));
    var node = S.shell(ctx, 'inicio', [head, h('section', { class: 'chat', 'aria-label': 'Conversa' }, log, opts, form)]);

    /* ------------------------------------------------ mecanica da conversa */
    function later(fn) { chain = chain.then(fn).catch(function (e) { Diag.error('assistente', e); }); return chain; }
    function scroll() { log.scrollTop = log.scrollHeight; }
    function resetInput() { inputMode = null; input.placeholder = PLACEHOLDER; input.removeAttribute('data-mode'); }

    function bubble(kind, content, mood) {
      var b = h('div', { class: 'bubble ' + kind }, content);
      log.appendChild(h('div', { class: 'brow ' + kind }, kind === 'bot' ? h('span', { class: 'bav' }, BotAvatar.svg(30, mood)) : null, b));
      scroll();
      return b;
    }
    /* A resposta do assistente: pontinhos por um instante e depois o texto. */
    function say(content, mood) {
      return later(function () {
        if (!log.isConnected) return null;
        var row = h('div', { class: 'brow bot', 'aria-hidden': 'true' }, h('span', { class: 'bav' }, BotAvatar.svg(30, mood)), h('div', { class: 'bubble bot typing' }, h('i'), h('i'), h('i')));
        log.appendChild(row); scroll();
        return pause(reduced() ? 0 : TYPE_MS).then(function () {
          if (row.parentNode) row.parentNode.removeChild(row);
          if (log.isConnected) bubble('bot', typeof content === 'string' ? h('p', null, content) : content, mood);
        });
      });
    }
    function choose(items) {
      return later(function () {
        if (!log.isConnected) return;
        clear(opts);
        items.forEach(function (it) {
          var kids = [it.icon ? UI.svg(it.icon, 18) : null, it.label];
          if (it.href) {
            opts.appendChild(h('a', { class: 'chip ' + (it.kind || ''), href: it.href, target: it.external ? '_blank' : null, rel: it.external ? 'noopener' : null }, kids));
          } else {
            opts.appendChild(h('button', { type: 'button', class: 'chip ' + (it.kind || ''), onclick: function () { pick(it); } }, kids));
          }
        });
        scroll();
      });
    }
    function pick(it) {
      clear(opts);
      resetInput();
      later(function () { bubble('me', it.say || it.label); });
      later(function () { it.run(); });
    }
    function setInput(mode) {
      return later(function () {
        inputMode = mode;
        input.placeholder = mode.placeholder;
        input.setAttribute('data-mode', 'note');
        input.maxLength = mode.max || 300;
        try { input.focus(); } catch (e) { /* ignore */ }
      });
    }
    function backItem(label) { return { label: label || 'Voltar ao menu', icon: 'arrow-left', kind: 'ghost', run: function () { menu(true); } }; }

    /* ------------------------------------------------ dados */
    function refresh() {
      return Promise.all([API.booking.psychologists().catch(function () { return []; }), API.booking.mine().catch(function () { return []; })]).then(function (r) {
        D.psy = r[0]; D.appts = r[1];
      });
    }
    function whenOf(a) { return a.status === 'reschedule_proposed' ? a.proposed_starts_at : a.starts_at; }
    function isLive(a) { return ['requested', 'reschedule_proposed'].indexOf(a.status) >= 0 || (a.status === 'scheduled' && !a.past); }
    function liveList() { return D.appts.filter(isLive).sort(function (a, b) { return Date.parse(whenOf(a)) - Date.parse(whenOf(b)); }); }
    function failed(e, fallback) { Diag.error('assistente', e); return UI.errorText(e, fallback); }

    /* ------------------------------------------------ menu */
    function menu(again) {
      say(again ? 'Posso ajudar com mais alguma coisa?' : 'O que você quer fazer?');
      choose([
        { label: 'Marcar consulta', icon: 'calendar-plus', run: function () { book(null); } },
        { label: 'Minhas consultas', icon: 'calendar-days', run: mine },
        { label: 'Falar com meu psicólogo(a)', icon: 'message-circle', run: talk },
        { label: 'Registrar como estou', icon: 'notebook-pen', run: diary },
        { label: 'Dúvidas', icon: 'circle-help', run: faq },
        { label: 'Preciso de ajuda agora', icon: 'life-buoy', kind: 'sos', run: function () { sos(false); } }
      ]);
    }

    function route(text) {
      var t = norm(text);
      if (CRISIS.test(t)) { sos(true); return; }
      for (var i = 0; i < INTENTS.length; i++) {
        if (INTENTS[i][1].test(t)) {
          ({ sos: function () { sos(false); }, book: function () { book(null); }, mine: mine, talk: talk, diary: diary, faq: faq })[INTENTS[i][0]]();
          return;
        }
      }
      say('Não entendi essa. Escolha uma das opções abaixo, ou escreva só uma palavra, como "marcar" ou "ajuda".');
      menu(true);
    }

    /* ------------------------------------------------ marcar consulta, passo a passo */
    function noLinkReply() {
      say('Para marcar, primeiro o seu psicólogo(a) precisa vincular você. Ele(a) procura você pelo celular da sua conta, ou manda um link de cadastro.');
      choose([{ label: 'Ver como funciona', icon: 'heart-handshake', href: '#/psicologo' }, backItem()]);
    }
    function book(replace) {
      if (!D.psy.length) { noLinkReply(); return; }
      var open = D.psy.filter(bookable);
      if (!open.length) {
        var waiting = D.psy.filter(function (x) { return x.verified === false; });
        say(waiting.length
          ? 'Estamos aguardando ' + waiting[0].full_name + ' conferir o seu cadastro. Assim que ele(a) confirmar, você marca por aqui e eu aviso você pelo sininho.'
          : 'Seu psicólogo(a) ainda não abriu a agenda para pedidos. Você pode combinar pelo WhatsApp.');
        choose([{ label: 'Falar com meu psicólogo(a)', icon: 'message-circle', run: talk }, backItem()]);
        return;
      }
      if (replace) {
        var same = open.filter(function (x) { return x.professional_id === replace.professional_id; })[0];
        if (!same) { say('No momento, esse(a) psicólogo(a) não está recebendo pedidos. Sua consulta continua como estava.'); menu(true); return; }
        startSlots({ pro: same, replace: replace });
        return;
      }
      if (open.length === 1) { startSlots({ pro: open[0] }); return; }
      say('Com quem você quer marcar?');
      choose(open.map(function (x) { return { label: x.full_name, run: function () { startSlots({ pro: x }); } }; }).concat([backItem('Voltar ao menu')]));
    }

    function startSlots(bk) {
      var id = bk.pro.professional_id, name = UI.firstName(bk.pro.full_name);
      say('Buscando os horários livres de ' + name + '...');
      Promise.all([API.booking.info(id), API.booking.slots(id, UI.dt.today(), 21)]).then(function (r) {
        bk.info = r[0]; bk.byDay = {}; bk.days = []; bk.page = 0; bk.note = ''; bk.slot = null;
        if (!bk.info.enabled) {
          say(bk.info.name + ' ainda não abriu a agenda para pedidos. Fale com ele(a) pelo WhatsApp.');
          choose([{ label: 'Falar com meu psicólogo(a)', icon: 'message-circle', run: talk }, backItem()]);
          return;
        }
        r[1].forEach(function (s) { var d = UI.dt.dayOf(s.starts_at); if (!bk.byDay[d]) { bk.byDay[d] = []; bk.days.push(d); } bk.byDay[d].push(s); });
        if (!bk.days.length) {
          say('Não há horários livres nos próximos 21 dias. Fale com ' + name + ' pelo WhatsApp.');
          choose([{ label: 'Falar com meu psicólogo(a)', icon: 'message-circle', run: talk }, backItem()]);
          return;
        }
        askDay(bk);
      }).catch(function (e) { say(failed(e, 'Não consegui buscar os horários agora. Tente de novo daqui a pouco.')); menu(true); });
    }

    var PER_PAGE = 6;
    function askDay(bk) {
      var from = bk.page * PER_PAGE, part = bk.days.slice(from, from + PER_PAGE);
      say(from ? 'Mais dias com horário livre:' : 'Qual dia fica melhor para você?');
      var items = part.map(function (d) { return { label: UI.dt.dayLabel(d), run: function () { askTime(bk, d); } }; });
      if (from + PER_PAGE < bk.days.length) items.push({ label: 'Mais dias', icon: 'chevron-right', kind: 'ghost', say: 'Mais dias', run: function () { bk.page += 1; askDay(bk); } });
      items.push({ label: 'Desistir', icon: 'x', kind: 'ghost', run: function () { say('Tudo bem, não enviei nada.'); menu(true); } });
      choose(items);
    }
    function askTime(bk, day) {
      say('Horários livres em ' + UI.dt.dayLabel(day) + ':');
      var items = bk.byDay[day].map(function (s) { return { label: UI.dt.hmOf(s.starts_at), say: UI.dt.hmOf(s.starts_at), run: function () { bk.slot = s; askMode(bk); } }; });
      items.push({ label: 'Outro dia', icon: 'arrow-left', kind: 'ghost', run: function () { askDay(bk); } });
      choose(items);
    }
    function askMode(bk) {
      var inP = !!bk.info.accepts_in_person, on = !!bk.info.accepts_online;
      if (inP && on) {
        say('Presencial ou online?');
        choose([{ label: 'Presencial', icon: 'map-pin', run: function () { bk.mode = 'in_person'; askNote(bk); } },
          { label: 'Online', icon: 'video', run: function () { bk.mode = 'online'; askNote(bk); } }]);
        return;
      }
      bk.mode = inP ? 'in_person' : 'online';
      askNote(bk);
    }
    function askNote(bk) {
      say('Quer deixar um recado para ' + UI.firstName(bk.pro.full_name) + '? É opcional.');
      choose([
        { label: 'Sem recado', run: function () { summary(bk); } },
        { label: 'Escrever recado', icon: 'pencil', run: function () {
          say('Escreva o recado aqui embaixo e toque em enviar.');
          setInput({ placeholder: 'Seu recado (até 300 letras)', max: 300, onSubmit: function (v) { bk.note = v; summary(bk); } });
          choose([{ label: 'Pular o recado', kind: 'ghost', run: function () { summary(bk); } }]);
        } }
      ]);
    }
    function summary(bk) {
      var rows = [
        h('li', null, 'Com: ', h('b', null, bk.pro.full_name)),
        h('li', null, 'Quando: ', h('b', null, UI.dt.whenLabel(bk.slot.starts_at))),
        h('li', null, 'Tipo: ', h('b', null, MODE[bk.mode])),
        bk.info.price_cents != null ? h('li', null, 'Valor: ', h('b', null, UI.money(bk.info.price_cents))) : null,
        bk.note ? h('li', null, 'Recado: ', bk.note) : null,
        bk.replace ? h('li', null, 'Troca: a consulta de ' + UI.dt.whenLabel(bk.replace.starts_at) + ' será cancelada depois que o pedido for enviado.') : null
      ];
      say(h('div', null, h('p', null, h('b', null, 'Confira o pedido:')), h('ul', { class: 'sum' }, rows),
        h('p', null, UI.firstName(bk.pro.full_name) + ' confirma o pedido e eu aviso você pelo sininho. O pagamento é combinado direto com ele(a).')));
      choose([
        { label: 'Enviar pedido', icon: 'send', run: function () { sendRequest(bk); } },
        { label: 'Mudar o horário', icon: 'calendar-days', kind: 'ghost', run: function () { askDay(bk); } },
        { label: 'Desistir', icon: 'x', kind: 'ghost', run: function () { say('Tudo bem, não enviei nada.'); menu(true); } }
      ]);
    }
    function sendRequest(bk) {
      var name = UI.firstName(bk.pro.full_name);
      API.booking.request(bk.pro.professional_id, bk.slot.starts_at, bk.mode, bk.note || '').then(function () {
        say('Pedido enviado! ' + name + ' vai responder e eu aviso você pelo sininho.', 'ok');
        if (!bk.replace) return null;
        return API.booking.cancel(bk.replace.id).then(function () {
          say('A consulta antiga foi cancelada.');
        }).catch(function (e) {
          say('O pedido novo foi enviado, mas não consegui cancelar a consulta antiga. Cancele em "Minhas consultas". ' + failed(e, ''));
        });
      }).then(function () { return refresh(); }).then(function () { menu(true); }).catch(function (e) {
        var msg = String((e && e.message) || '');
        if (/slot_taken/.test(msg)) { say('Esse horário acabou de ser ocupado. Vou buscar outros.'); startSlots(bk); return; }
        say(failed(e, 'Não consegui enviar o pedido agora.'));
        menu(true);
      });
    }

    /* ------------------------------------------------ minhas consultas */
    function mine() {
      refresh().then(function () {
        var live = liveList();
        if (!live.length) {
          say('Você não tem consultas marcadas nem pedidos em aberto.');
          choose([{ label: 'Marcar consulta', icon: 'calendar-plus', run: function () { book(null); } }, backItem()]);
          return;
        }
        say(h('div', null, h('p', null, live.length === 1 ? 'Você tem 1 consulta ou pedido em aberto:' : 'Você tem ' + live.length + ' consultas ou pedidos em aberto:'),
          h('ul', { class: 'sum' }, live.map(function (a) {
            return h('li', null, h('b', null, UI.dt.whenLabel(whenOf(a))), ' com ' + a.professional_name + ' (' + (STATUS[a.status] || a.status) + (a.status === 'scheduled' && a.patient_confirmed_at ? ', presença confirmada' : '') + ')');
          })), h('p', null, 'Toque em uma para ver as opções.')));
        choose(live.map(function (a) { return { label: UI.dt.whenLabel(whenOf(a)), icon: 'calendar-days', run: function () { apptActions(a); } }; }).concat([backItem()]));
      }).catch(function (e) { say(failed(e, 'Não consegui carregar suas consultas agora.')); menu(true); });
    }

    function apptActions(a) {
      var items = [], future = Date.parse(whenOf(a)) > Date.now(), name = UI.firstName(a.professional_name);
      var lines = [h('li', null, 'Com: ', h('b', null, a.professional_name)),
        h('li', null, 'Quando: ', h('b', null, UI.dt.whenLabel(whenOf(a)))),
        h('li', null, 'Tipo: ', h('b', null, (MODE[a.mode] || a.mode) + ', ' + a.duration_minutes + ' min')),
        h('li', null, 'Situação: ', h('b', null, STATUS[a.status] || a.status)),
        a.status === 'scheduled' && future ? h('li', null, 'Presença: ', h('b', null, a.patient_confirmed_at ? 'confirmada' : 'ainda não confirmada')) : null];
      if (a.status === 'reschedule_proposed') lines.push(h('li', null, 'Seu pedido era para ' + UI.dt.whenLabel(a.starts_at) + '.' + (a.decline_reason ? ' Recado: ' + a.decline_reason : '')));
      if (a.status === 'scheduled' && a.mode === 'in_person' && a.office_note) lines.push(h('li', null, 'Local: ' + a.office_note));
      say(h('div', null, h('ul', { class: 'sum' }, lines)));

      if (a.status === 'reschedule_proposed') {
        items.push({ label: 'Aceitar o novo horário', icon: 'check', run: function () {
          API.booking.respond(a.id, true).then(function () { say('Consulta confirmada para ' + UI.dt.whenLabel(a.proposed_starts_at) + '.', 'ok'); return refresh(); }).then(function () { menu(true); })
            .catch(function (e) { say(failed(e, 'Não consegui responder agora.')); menu(true); });
        } });
        items.push({ label: 'Recusar', icon: 'x', kind: 'ghost', run: function () {
          API.booking.respond(a.id, false).then(function () { say('Combinado, recusei o novo horário. ' + name + ' será avisado(a).'); return refresh(); }).then(function () { menu(true); })
            .catch(function (e) { say(failed(e, 'Não consegui responder agora.')); menu(true); });
        } });
      }
      if (a.status === 'scheduled' && future && !a.patient_confirmed_at) {
        items.push({ label: 'Vou comparecer', icon: 'circle-check', run: function () {
          API.booking.confirmAttendance(a.id).then(function () { say('Presença confirmada! ' + name + ' foi avisado(a).', 'ok'); return refresh(); }).then(function () { menu(true); })
            .catch(function (e) { say(failed(e, 'Não consegui confirmar agora.')); menu(true); });
        } });
      }
      if (a.status === 'scheduled' && a.mode === 'online' && a.meeting_url) items.push({ label: 'Entrar na consulta', icon: 'video', href: a.meeting_url, external: true });
      if (['requested', 'scheduled'].indexOf(a.status) >= 0 && future) {
        items.push({ label: 'Remarcar', icon: 'calendar-days', kind: 'ghost', run: function () {
          say('Para remarcar, você escolhe um novo horário e só depois eu cancelo esta consulta. Assim você não fica sem nenhuma.');
          book(a);
        } });
      }
      if (['requested', 'scheduled'].indexOf(a.status) >= 0 && future) {
        items.push({ label: a.status === 'requested' ? 'Cancelar pedido' : 'Cancelar consulta', icon: 'calendar-x', kind: 'ghost', run: function () { cancelFlow(a); } });
      }
      items.push({ label: 'Voltar às consultas', icon: 'arrow-left', kind: 'ghost', run: mine });
      choose(items);
    }
    function cancelFlow(a) {
      say('Cancelar ' + (a.status === 'requested' ? 'o pedido' : 'a consulta') + ' de ' + UI.dt.whenLabel(a.starts_at) + ' com ' + a.professional_name + '?');
      choose([
        { label: 'Sim, cancelar', icon: 'calendar-x', kind: 'sos', run: function () {
          API.booking.cancel(a.id).then(function () { say('Pronto, cancelado.'); return refresh(); }).then(function () { menu(true); })
            .catch(function (e) { say(failed(e, 'Não consegui cancelar agora.')); menu(true); });
        } },
        { label: 'Não, voltar', kind: 'ghost', run: mine }
      ]);
    }

    /* ------------------------------------------------ falar com o psicólogo(a), diário, ajuda, dúvidas */
    function talk() {
      if (!D.psy.length) {
        say('Você ainda não está vinculado(a) a um psicólogo(a). Ele(a) procura você pelo celular da sua conta, ou manda um link de cadastro.');
        choose([{ label: 'Ver como funciona', icon: 'heart-handshake', href: '#/psicologo' }, backItem()]);
        return;
      }
      var items = [], missing = [];
      D.psy.forEach(function (x) {
        var link = wa(x, meName);
        if (link) items.push({ label: 'WhatsApp de ' + UI.firstName(x.full_name), icon: 'message-circle', href: link, external: true });
        else missing.push(UI.firstName(x.full_name));
      });
      if (items.length) say('Toque para abrir a conversa pelo WhatsApp:');
      if (missing.length) say(missing.join(' e ') + ' ainda não colocou o WhatsApp no Senso. Você pode pedir um horário por aqui.');
      if (D.psy.some(bookable)) items.push({ label: 'Marcar consulta', icon: 'calendar-plus', kind: 'ghost', run: function () { book(null); } });
      items.push(backItem());
      choose(items);
    }
    function diary() {
      say('Registrar leva um minutinho e ajuda você e seu psicólogo(a) a ver como os dias passam. Abro o diário para você?');
      choose([{ label: 'Abrir o diário', icon: 'notebook-pen', href: '#/diario/novo' }, backItem()]);
    }
    function sos(fromText) {
      say(fromText ? 'Sinto muito que esteja difícil. Obrigado por dizer. Você não precisa passar por isso sozinho(a).' : 'Estou aqui. Vamos com calma, você não precisa passar por isso sozinho(a).', 'care');
      say(h('div', null, h('p', null, 'Se você está em perigo, ou pensando em se machucar, ligue agora. É de graça e atendem na hora:'),
        h('div', { class: 'sos-grid' }, callCard('188', 'CVV', '24 horas, apoio emocional', true), callCard('192', 'SAMU', 'Emergência de saúde'), callCard('190', 'Polícia', 'Risco imediato')),
        h('p', { class: 'mt8' }, 'Se for mais fácil, vá a uma UPA ou pronto-socorro e peça para alguém ficar com você.')), 'care');
      var items = [{ label: 'Respirar e me acalmar', icon: 'wind', href: '#/ajuda' }];
      var link = D.psy.map(function (x) { return wa(x, meName); }).filter(Boolean)[0];
      if (link) items.push({ label: 'Avisar meu psicólogo(a)', icon: 'message-circle', href: link, external: true });
      items.push(backItem());
      choose(items);
    }
    function faq() {
      say('Qual é a sua dúvida?');
      choose(FAQ.map(function (q) {
        return { label: q[0], run: function () {
          say(q[1]);
          choose([{ label: 'Outra dúvida', icon: 'circle-help', run: faq }, { label: 'Falar com o suporte do Senso', icon: 'life-buoy', kind: 'ghost', href: '#/suporte' }, backItem()]);
        } };
      }).concat([backItem()]));
    }

    /* ------------------------------------------------ começo */
    setTimeout(function () {
      refresh().then(function () {
        say('Oi, ' + first + '! Eu sou o assistente do Senso. Sou um programa com respostas prontas: não sou uma pessoa e não uso inteligência artificial.');
        say('Esta conversa fica só aqui no seu aparelho e some quando você sair desta tela.');
        var notes = [];
        var prop = D.appts.filter(function (a) { return a.status === 'reschedule_proposed'; });
        if (prop.length) notes.push(prop.length === 1 ? prop[0].professional_name + ' sugeriu outro horário para uma consulta sua.' : prop.length + ' consultas têm um novo horário sugerido.');
        var next = D.appts.filter(function (a) { return a.status === 'scheduled' && !a.past; }).sort(function (a, b) { return Date.parse(a.starts_at) - Date.parse(b.starts_at); })[0];
        if (next) notes.push('Sua próxima consulta é ' + UI.dt.whenLabel(next.starts_at) + ', com ' + next.professional_name + (next.patient_confirmed_at ? '. Presença confirmada.' : '. Se você vai, toque em "Minhas consultas" e confirme a presença.'));
        var req = D.appts.filter(function (a) { return a.status === 'requested'; }).length;
        if (req) notes.push(req === 1 ? 'Você tem 1 pedido de consulta aguardando resposta.' : 'Você tem ' + req + ' pedidos de consulta aguardando resposta.');
        if (!D.psy.length) notes.push('Você ainda não está vinculado(a) a um psicólogo(a). Quem vincula é ele(a).');
        if (notes.length) say(h('div', null, notes.map(function (t) { return h('p', null, t); })));
        menu(false);
      });
    }, 30);

    return node;
  };
})();
