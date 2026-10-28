/* Area logada: moldura (menu lateral no computador, barra embaixo no celular), inicio de cada perfil e a tela Conta. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { location.hash = hash; }
  function refresh() { window.dispatchEvent(new HashChangeEvent('hashchange')); }   /* redesenha a tela atual */
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* ---------------------------------------------------------------- moldura */
  /* Rotulo do tipo de conta. A equipe (admin) aparece como "Administrador" no modo padrao; nos modos de teste, como o tipo escolhido. */
  S.roleLabel = function (ctx) {
    if (ctx.admin) return ctx.mode === 'professional' ? 'Psicólogo(a)' : (ctx.mode === 'patient' ? 'Paciente' : 'Administrador');
    return ctx.me.profile.role === 'professional' ? 'Psicólogo(a)' : 'Paciente';
  };

  /* Modo de teste: so a conta de equipe (admin) ve. Alterna entre Administrador, Psicólogo(a) e Paciente. O banco confere de novo
     (admin_set_mode) e, no modo Paciente, troca de verdade o tipo da conta para o portal do paciente funcionar como o de um paciente. */
  var MODES = [['admin', 'Administrador'], ['professional', 'Psicólogo(a)'], ['patient', 'Paciente']];
  function goNow(hash) { if (location.hash === hash) refresh(); else location.hash = hash; }
  S.modeSwitch = function (ctx, compact) {
    if (!ctx.admin) return null;
    var cur = ctx.mode || 'admin';
    var seg = UI.segmented({ label: 'Modo de teste', value: cur, options: compact ? [['admin', 'Admin'], ['professional', 'Psicólogo'], ['patient', 'Paciente']] : MODES, onChange: function (v) {
      if (v === cur) return;
      seg.el.setAttribute('aria-busy', 'true');
      API.admin.setMode(v).then(function () {
        Diag.log('modo:' + v);
        UI.toast('Modo ' + MODES.filter(function (m) { return m[0] === v; })[0][1] + ' ligado.', 'shield-check');
        goNow(v === 'admin' ? '#/equipe' : '#/inicio');
      }).catch(function (e) {
        Diag.error('modo', e);
        seg.set(cur); seg.el.removeAttribute('aria-busy');
        UI.toast(/professional_profile_required/.test(String((e && e.message) || '')) ? 'Esta conta não tem cadastro de psicólogo.' : 'Não deu para trocar o modo agora.');
      });
    } });
    return h('div', { class: 'mode-switch' + (compact ? ' compact' : '') }, seg.el);
  };

  function hello(p, sub) {
    return h('div', { class: 'hello' }, h('div', { class: 'grow' }, h('h1', null, UI.greeting(p.full_name)), sub ? h('div', { class: 'sub' }, sub) : null));
  }

  /* ---------------------------------------------------------------- acompanhamento dos pacientes (psicologo) */
  var MOOD_LABEL = ['Muito mal', 'Mal', 'Mais ou menos', 'Bem', 'Muito bem'];
  function rel(iso) {
    if (iso === UI.today()) return 'hoje';
    var y = new Date(); y.setDate(y.getDate() - 1);
    return iso === UI.ymd(y) ? 'ontem' : UI.fmtDate(iso);
  }
  /* Barras do humor dos ultimos 14 dias (do mais antigo ao mais novo). Sem registro = barra baixinha cinza. */
  function moodBars(checkins) {
    var byDay = {}, days = [], i, d, bars = [], texts = [];
    checkins.forEach(function (c) { if (c.mood != null && !(c.entry_date in byDay)) byDay[c.entry_date] = c.mood; });
    for (i = 13; i >= 0; i--) { d = new Date(); d.setDate(d.getDate() - i); days.push(UI.ymd(d)); }
    days.forEach(function (day) {
      var m = byDay[day];
      bars.push(h('i', { class: 'b' + (m || 0) }));
      texts.push(m ? String(m) : 'sem registro');
    });
    return h('div', { class: 'mood-bars', role: 'img', 'aria-label': 'Humor dos últimos 14 dias, do mais antigo ao mais novo: ' + texts.join(', ') }, bars);
  }
  function verifyBadge(it) { return it.verified === false ? h('span', { class: 'badge warn' }, UI.svg('hourglass', 14), 'Por conferir') : null; }
  function patientCard(it) {
    var href = '#/pacientes/' + it.record_id;
    if (!it.consent) {
      return h('a', { class: 'card pt-link', href: href }, h('div', { class: 'pt-head' }, UI.avatar(it.full_name),
        h('div', { class: 'who' }, h('b', null, it.full_name), verifyBadge(it), h('span', null, 'Retirou a autorização do diário. Você não vê o check-in.'))));
    }
    var f = UI.frameFor(it.level), last = it.checkins[0];
    var vals = [];
    if (last) {
      if (last.mood != null) vals.push(h('span', { class: 'val' }, 'Humor ', h('b', null, last.mood + '/5'), ' ' + MOOD_LABEL[last.mood - 1]));
      if (last.energy != null) vals.push(h('span', { class: 'val' }, 'Energia ', h('b', null, last.energy + '/5')));
      if (last.anxiety != null) vals.push(h('span', { class: 'val' }, 'Ansiedade ', h('b', null, last.anxiety + '/5')));
    }
    return h('a', { class: 'card pt-link', href: href },
      h('div', { class: 'pt-head' }, UI.avatar(it.full_name, { level: it.level }),
        h('div', { class: 'who' }, h('b', null, it.full_name), verifyBadge(it), h('span', null, 'Nível ' + it.level + ', moldura ' + f.name))),
      last ? h('div', { class: 'pt-vals' }, vals) : h('p', { class: 'pt-note mb0' }, 'Sem check-in nos últimos 30 dias.'),
      last ? moodBars(it.checkins) : null,
      h('div', { class: 'pt-foot' }, h('span', null, last ? 'Último check-in: ' + rel(last.entry_date) : ''),
        h('span', null, it.days_this_week + (it.days_this_week === 1 ? ' dia' : ' dias') + ' de uso na semana')));
  }
  /* list opcional: quem já carregou a lista (início do psicólogo) passa aqui e evita buscar de novo. */
  S.patientsOverview = function (list) {
    var holder = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Carregando...'));
    function draw(items) {
      clear(holder);
      if (!items.length) {
        holder.appendChild(h('div', { class: 'card' }, h('p', { class: 'mb0' }, 'Nenhum paciente com conta vinculada ainda. Quando alguém criar a conta pelo seu link, o nível e o check-in aparecem aqui.')));
        return;
      }
      items.forEach(function (it) { holder.appendChild(patientCard(it)); });
      holder.appendChild(h('p', { class: 'pt-note' }, 'Você vê nível, humor, energia e ansiedade. O texto do diário só aparece quando o paciente compartilha.'));
    }
    if (list) { draw(list); return holder; }
    API.pro.overview(30).then(draw).catch(function (e) {
      Diag.error('pacientes', e);
      clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar os pacientes agora. Atualize a página.'));
    });
    return holder;
  };

  /* ---------------------------------------------------------------- aviso: verificacao em duas etapas (recomendada) */
  var TIP = 'psi_tip2fa_ate', TIP_DIAS = 7;
  /* Psicologo (ou equipe) que ainda nao ativou, enquanto a obrigatoriedade esta desligada. "Lembrar em 7 dias" esconde o aviso por 7 dias
     (neste navegador); passados os 7 dias ele volta, e continua voltando ate a pessoa ativar. */
  S.mfaTip = function (ctx) {
    var mine = (ctx.me.profile.role === 'professional' || ctx.admin) && ctx.mfa && !ctx.mfa.enrolled && !(ctx.policy && ctx.policy.mfa_required);
    if (!mine) return null;
    try { var ate = +localStorage.getItem(TIP) || 0; if (ate > Date.now()) return null; } catch (e) { /* sem armazenamento: o aviso aparece sempre */ }
    var box = h('div', { class: 'cta-card tip', role: 'region', 'aria-label': 'Recomendação de segurança' },
      h('span', { class: 'ico-box' }, UI.svg('shield-check', 22)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'Proteja sua conta com a verificação em duas etapas'),
        h('div', { class: 's' }, 'É opcional, mas recomendamos: você cuida de dados de saúde. Leva 1 minuto.')),
      h('div', { class: 'tip-actions' },
        h('a', { class: 'btn auto sm', href: '#/ativar-2fa' }, 'Ativar'),
        h('button', { type: 'button', class: 'linkbtn small', onclick: function () {
          try { localStorage.setItem(TIP, String(Date.now() + TIP_DIAS * 86400000)); } catch (e) { /* ignore */ }
          if (box.parentNode) box.parentNode.removeChild(box);
        } }, 'Lembrar em 7 dias')));
    return box;
  };

  /* CRP ainda nao verificado NAO impede o uso da conta; so trava o que depende da conferencia (pacientes no portal e, no app, recibos e documentos). */
  S.crpNotice = function (ver) {
    if (ver === 'pending') return UI.notice('warn', h('span', null, h('b', null, 'Estamos conferindo o seu CRP. '), 'Costuma levar até 1 dia útil e avisamos por e-mail. Enquanto isso você já usa o Senso; o acompanhamento de pacientes no site, os recibos e os documentos do app liberam quando o CRP for confirmado.'));
    if (ver === 'suspended') return UI.notice('bad', h('span', null, h('b', null, 'Acesso suspenso. '), 'Fale com o ', h('a', { href: '#/suporte' }, 'suporte'), ' para entender o motivo.'));
    return UI.notice('bad', h('span', null, h('b', null, 'Não confirmamos o seu CRP. '), 'O número não confere com o cadastro do conselho. Fale com o ', h('a', { href: '#/suporte' }, 'suporte'), ' para corrigir.'));
  };

  /* ---------------------------------------------------------------- inicio: profissional */
  function proSafe(promise, fallback) { return promise.catch(function (e) { Diag.error('home-psicologo', e); return fallback; }); }

  function proChecklist(ctx, extra) {
    var pro = ctx.me.professional, ver = pro.verification, verified = ver === 'verified';
    var has2fa = !!(ctx.mfa && ctx.mfa.enrolled);
    var steps = [['Conta criada', true], ['CRP verificado', verified, null, ver === 'pending' ? 'Em análise' : 'Pendente'], ['Verificação em duas etapas', has2fa, '#/ativar-2fa'],
      ['Cadastrar ou convidar o primeiro paciente', !!extra.hasPatients, '#/pacientes', 'Comece aqui'], ['Abrir a agenda para pedidos de consulta', !!extra.bookingOn, '#/agenda?aba=ajustes', 'Opcional']];
    var done = steps.filter(function (x) { return x[1]; }).length;
    if (done === steps.length) return null;
    return h('div', { class: 'group' },
      h('div', { class: 'setup-head' }, UI.ring(done, steps.length), h('div', null, h('div', { class: 't' }, 'Primeiros passos'), h('div', { class: 's' }, done + ' de ' + steps.length))),
      steps.map(function (x) {
        if (!x[1] && x[2]) {
          return h('a', { class: 'item', href: x[2] }, h('span', { class: 'ico-box todo' }), h('span', { class: 't' }, x[0]), h('span', { class: 'tag' }, x[3] || 'Recomendado'));
        }
        return h('div', { class: 'item' }, h('span', { class: 'ico-box ' + (x[1] ? 'done' : 'todo') }, x[1] ? UI.svg('check', 20) : null),
          h('span', { class: 't' }, x[0]), x[1] ? null : h('span', { class: 'tag' }, x[3] || 'Em breve'));
      }));
  }

  S.homeProfessional = function (ctx) {
    var p = ctx.me.profile, pro = ctx.me.professional;
    var ver = pro.verification, verified = ver === 'verified';
    var holder = h('div', null, verified ? UI.loading() : null);

    function actionTiles() {
      return h('div', { class: 'tiles' },
        h('button', { type: 'button', class: 'tile act', onclick: function () { S.patientSheet(null, function (id) { go('#/pacientes/' + id); }); } }, h('span', { class: 'ico-box' }, UI.svg('user-plus', 22)), h('span', { class: 't' }, 'Novo paciente'), h('span', { class: 'pill' }, 'Cadastro rápido')),
        h('button', { type: 'button', class: 'tile act', onclick: function () { S.newAppointmentSheet({ onDone: function () { refresh(); } }); } }, h('span', { class: 'ico-box' }, UI.svg('calendar-plus', 22)), h('span', { class: 't' }, 'Marcar consulta'), h('span', { class: 'pill' }, 'Direto na agenda')),
        h('a', { class: 'tile act', href: '#/agenda?aba=semana' }, h('span', { class: 'ico-box' }, UI.svg('calendar-days', 22)), h('span', { class: 't' }, 'Agenda da semana'), h('span', { class: 'pill' }, 'Ver horários')),
        h('a', { class: 'tile act', href: '#/atendimento' }, h('span', { class: 'ico-box' }, UI.svg('message-circle', 22)), h('span', { class: 't' }, 'WhatsApp e avisos'), h('span', { class: 'pill' }, 'Atendimento')));
    }

    function draw(D) {
      clear(holder);
      var toVerify = D.patients.filter(function (x) { return !x.verified; }).length;
      var asks = D.view.pending.filter(function (a) { return a.status === 'requested'; }).length;
      if (asks) holder.appendChild(S.pendingStrip('calendar-plus', asks === 1 ? '1 pedido de consulta esperando você' : asks + ' pedidos de consulta esperando você', '#/agenda?aba=pedidos', 'Responder'));
      if (toVerify) holder.appendChild(S.pendingStrip('hourglass', toVerify === 1 ? '1 cadastro para conferir' : toVerify + ' cadastros para conferir', '#/pacientes?f=verify', 'Conferir'));

      var t = UI.dt.today();
      var todays = D.view.appointments.filter(function (a) { return UI.dt.dayOf(a.status === 'reschedule_proposed' ? a.proposed_starts_at : a.starts_at) === t && a.status !== 'requested'; });
      var later = D.view.appointments.filter(function (a) { return a.status === 'scheduled' && UI.dt.dayOf(a.starts_at) > t; }).slice(0, 3);
      holder.appendChild(h('div', { class: 'group-title' }, 'Hoje'));
      if (todays.length) holder.appendChild(h('div', { class: 'group' }, todays.map(function (a) { return S.apptRow(a, refresh); })));
      else holder.appendChild(h('div', { class: 'card' }, h('p', { class: 'mb0' }, 'Nenhuma consulta hoje.' + (later.length ? ' A próxima é ' + UI.dt.whenLabel(later[0].starts_at) + ', com ' + later[0].full_name + '.' : ''))));
      if (todays.length && later.length) {
        holder.appendChild(h('div', { class: 'group-title' }, 'Próximas'));
        holder.appendChild(h('div', { class: 'group' }, later.map(function (a) { return h('a', { class: 'item', href: '#/agenda?d=' + UI.dt.dayOf(a.starts_at) }, h('span', { class: 'ico-box' }, UI.svg('calendar-check', 20)),
          h('span', { class: 'grow' }, h('span', { class: 't' }, a.full_name), h('span', { class: 's' }, UI.dt.whenLabel(a.starts_at))), h('span', { class: 'chev' }, UI.svg('chevron-right', 18))); })));
      }
      holder.appendChild(h('div', { class: 'group-title' }, 'Atalhos'));
      holder.appendChild(actionTiles());

      holder.appendChild(h('div', { class: 'group-title' }, 'Acompanhamento do humor'));
      holder.appendChild(S.patientsOverview(D.overview));
      var bc = S.birthdayCard ? S.birthdayCard(D.births) : null;
      if (bc) holder.appendChild(bc);
      holder.appendChild(h('div', { class: 'group-title' }, 'Convite'));
      holder.appendChild(S.inviteCard());
      var ck = proChecklist(ctx, { hasPatients: D.patients.length > 0, bookingOn: D.booking });
      if (ck) { holder.appendChild(h('div', { class: 'group-title' }, 'Primeiros passos')); holder.appendChild(ck); }
    }

    if (verified) {
      var t0 = UI.dt.today(), empty = { appointments: [], pending: [], blocks: [] };
      Promise.all([proSafe(API.pro.patients(), []), proSafe(API.agenda.view(t0, UI.dt.addDays(t0, 14)), empty), proSafe(API.pro.birthdays(14), []), proSafe(API.pro.overview(30), []),
        proSafe(API.agenda.get(), { settings: {} })]).then(function (r) {
        draw({ patients: r[0], view: r[1], births: r[2], overview: r[3], booking: !!(r[4].settings && r[4].settings.booking_enabled) });
      });
    } else {
      holder.appendChild(h('div', { class: 'group-title' }, 'Pacientes'));
      holder.appendChild(h('div', { class: 'group' }, h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('lock', 20)),
        h('span', null, h('span', { class: 't' }, 'Acompanhar pacientes e agenda'), h('span', { class: 's' }, 'Libera quando o seu CRP for confirmado')))));
      holder.appendChild(h('div', { class: 'group-title' }, 'Convite'));
      holder.appendChild(S.inviteCard());
      var ck = proChecklist(ctx, {});
      if (ck) { holder.appendChild(h('div', { class: 'group-title' }, 'Primeiros passos')); holder.appendChild(ck); }
    }

    return S.shell(ctx, 'inicio', [
      hello(p, [h('span', null, 'CRP ' + pro.crp_region + '/' + pro.crp_number),
        verified ? h('span', { class: 'badge ok' }, UI.svg('badge-check', 14), 'CRP verificado')
          : h('span', { class: 'badge ' + (ver === 'pending' ? 'warn' : 'bad') }, ver === 'pending' ? 'CRP em análise' : (ver === 'suspended' ? 'Acesso suspenso' : 'CRP não confirmado'))]),
      verified ? null : S.crpNotice(ver),
      API.mode === 'demo' && ver === 'pending' ? UI.notice('warn', h('span', null, 'Modo demonstração. ', h('button', { type: 'button', class: 'linkbtn', onclick: function () { API.demoVerify().then(refresh); } }, 'Simular a verificação do CRP'))) : null,
      S.mfaTip(ctx),
      holder
    ]);
  };

  /* ---------------------------------------------------------------- inicio: paciente */
  function safe(promise, fallback) { return promise.catch(function (e) { Diag.error('home-paciente', e); return fallback; }); }

  S.homePatient = function (ctx) {
    var p = ctx.me.profile;
    var holder = h('div'), D = null;

    function apptStrips() {
      var now = Date.now(), out = [], list = D.appts || [];
      list.filter(function (a) { return a.status === 'reschedule_proposed'; }).forEach(function (a) {
        out.push(S.pendingStrip('calendar-days', a.professional_name + ' sugeriu outro horário: ' + UI.dt.whenLabel(a.proposed_starts_at), '#/consultas', 'Responder'));
      });
      list.filter(function (a) { return a.can_review; }).slice(0, 1).forEach(function () {
        out.push(S.pendingStrip('star', 'Como foi a sua última consulta? Sua opinião é anônima.', '#/consultas', 'Avaliar'));
      });
      var next = list.filter(function (a) { return a.status === 'scheduled' && Date.parse(a.starts_at) > now; }).sort(function (a, b) { return Date.parse(a.starts_at) - Date.parse(b.starts_at); })[0];
      if (next) out.push(S.pendingStrip('calendar-check', 'Próxima consulta: ' + UI.dt.whenLabel(next.starts_at) + ' com ' + next.professional_name, '#/consultas', 'Ver'));
      D.psy.filter(function (x) { return x.verified === false; }).forEach(function (x) {
        out.unshift(S.pendingStrip('hourglass', 'Aguardando ' + x.full_name + ' conferir o seu cadastro. Depois disso você pede consultas por aqui.', '#/psicologo', 'Ver'));
      });
      var waiting = list.filter(function (a) { return a.status === 'requested'; });
      if (waiting.length) out.push(S.pendingStrip('hourglass', waiting.length === 1 ? 'Pedido de consulta aguardando resposta de ' + waiting[0].professional_name : waiting.length + ' pedidos de consulta aguardando resposta', '#/consultas', 'Ver'));
      return out;
    }

    function quick() {
      var tiles = [];
      D.psy.forEach(function (x) {
        var link = x.whatsapp ? UI.waLink(x.whatsapp, 'Olá, ' + UI.firstName(x.full_name) + '. Aqui é ' + UI.firstName(p.full_name) + '.') : null;
        if (link) tiles.push(h('a', { class: 'tile act', href: link, target: '_blank', rel: 'noopener' }, h('span', { class: 'ico-box' }, UI.svg('message-circle', 22)), h('span', { class: 't' }, 'Falar com ' + UI.firstName(x.full_name)), h('span', { class: 'pill' }, 'Abre o WhatsApp')));
      });
      if (D.psy.some(function (x) { return x.booking_enabled && x.verified !== false; })) tiles.push(h('a', { class: 'tile act', href: '#/consultas' }, h('span', { class: 'ico-box' }, UI.svg('calendar-plus', 22)), h('span', { class: 't' }, 'Pedir uma consulta'), h('span', { class: 'pill' }, 'Escolha o horário')));
      tiles.push(h('a', { class: 'tile act help', href: '#/ajuda' }, h('span', { class: 'ico-box' }, UI.svg('life-buoy', 22)), h('span', { class: 't' }, 'Preciso de ajuda'), h('span', { class: 'pill' }, 'Acalmar e pedir apoio')));
      return h('div', { class: 'tiles' }, tiles);
    }

    function draw() {
      clear(holder);
      var wel = S.welcomeCard(ctx); if (wel) holder.appendChild(wel);
      var pend = S.pendingInvite(); if (pend) holder.appendChild(pend);
      apptStrips().forEach(function (n) { holder.appendChild(n); });
      if (!D.pros.length && !D.psy.length) {
        holder.appendChild(h('div', { class: 'cta-card' }, h('span', { class: 'ico-box' }, UI.svg('heart-handshake', 22)),
          h('div', { class: 'grow' }, h('div', { class: 't' }, 'Vincule-se ao seu psicólogo(a)'), h('div', { class: 's' }, 'Com o link que ele(a) mandou, vocês ficam conectados.')),
          h('a', { class: 'btn auto sm', href: '#/psicologo' }, 'Vincular')));
      }
      holder.appendChild(S.levelCard(D.prog));
      if (D.consent) {
        holder.appendChild(S.moodCard({ entries: D.entries, pros: D.pros, shares: D.shares, onSaved: reload }));
      } else {
        holder.appendChild(h('div', { class: 'cta-card' }, h('span', { class: 'ico-box' }, UI.svg('notebook-pen', 22)),
          h('div', { class: 'grow' }, h('div', { class: 't' }, 'Seu diário'), h('div', { class: 's' }, 'Registre como você está e ganhe XP.')),
          h('a', { class: 'btn auto sm', href: '#/diario' }, 'Começar')));
      }
      holder.appendChild(h('div', { class: 'group-title' }, 'Atalhos'));
      holder.appendChild(quick());
    }
    function reload() {
      return load().then(draw).catch(function (e) { Diag.error('home-paciente', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar agora. Atualize a página.')); });
    }
    function load() {
      return Promise.all([API.progress(), API.hasConsent('diary'), safe(API.sharing.mine(), []), safe(API.booking.psychologists(), []), safe(API.booking.mine(), [])]).then(function (r) {
        D = { prog: r[0], consent: r[1], pros: r[2], psy: r[3], appts: r[4], entries: [], shares: [] };
        if (!D.consent) return null;
        return Promise.all([API.diary.list(), safe(API.sharing.entryShares(), [])]).then(function (x) { D.entries = x[0]; D.shares = x[1]; });
      });
    }
    reload();
    return S.shell(ctx, 'inicio', [hello(p), holder]);
  };

  /* ---------------------------------------------------------------- conta */
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function row(label, value) { return value ? h('div', { class: 'item' }, h('span', { class: 't' }, label), h('span', { class: 'v' }, value)) : null; }
  function linkRow(icon, title, href, sub) {
    return h('a', { class: 'item', href: href }, h('span', { class: 'ico-box' }, UI.svg(icon, 20)), h('span', null, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
  }

  /* Janela "Confirme que e voce". Quem entra com senha digita a senha (e o codigo do autenticador, se tiver). Quem entra so com Google
     ou Microsoft entra de novo pelo provedor (a pagina sai e volta). Devolve Promise<boolean>. */
  S.confirmIdentity = function (o) {
    return API.account().catch(function () { return { hasPassword: true, providers: [] }; }).then(function (a) {
      return !a.hasPassword && a.providers.length ? confirmWithProvider(o, a.providers[0]) : confirmWithPassword(o);
    });
  };

  function confirmWithProvider(o, provider) {
    var name = provider === 'azure' ? 'Microsoft' : 'Google';
    return new Promise(function (resolve) {
      var prev = document.activeElement, done = false, ov;
      function finish(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
        resolve(v);
      }
      function onKey(ev) { if (ev.key === 'Escape') finish(false); }
      var general = h('div', { 'aria-live': 'polite' });
      var label = 'Confirmar com ' + name;
      var ok = UI.button(label, { variant: o.danger ? 'danger' : null });
      var cancel = UI.button('Cancelar', { variant: 'ghost', onclick: function () { finish(false); } });
      ok.addEventListener('click', function () {
        general.textContent = '';
        UI.busy(ok, true);
        API.oauth(provider, { back: o.back || 'conta', keep: API.keepsSession() }).then(function () { finish(true); }).catch(function (e) {
          UI.busy(ok, false); ok.textContent = label;
          Diag.error('reauth-oauth', e);
          general.appendChild(UI.notice('bad', 'Não foi possível abrir o ' + name + ' agora. Tente de novo.'));
        });
      });
      ov = h('div', { class: 'overlay' }, h('div', { class: 'dialog form', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cid-t' },
        h('h2', { id: 'cid-t' }, o.title || 'Confirme que é você'),
        h('p', null, 'Por segurança, entre de novo com o ' + name + '. Quando voltar, é só repetir o que estava fazendo.'),
        general, h('div', { class: 'dialog-actions' }, ok, cancel)));
      document.body.appendChild(ov);
      document.addEventListener('keydown', onKey);
      ok.focus();
    });
  }

  function confirmWithPassword(o) {
    return new Promise(function (resolve) {
      var prev = document.activeElement, done = false, ov;
      function finish(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
        resolve(v);
      }
      function onKey(ev) { if (ev.key === 'Escape') finish(false); }
      var pw = UI.field({ label: 'Senha', type: 'password', autocomplete: 'current-password', toggle: true, required: true });
      var code = o.needsCode ? UI.field({ label: 'Código do autenticador', inputmode: 'numeric', maxlength: 7, autocomplete: 'one-time-code', placeholder: '000000' }) : null;
      var general = h('div', { 'aria-live': 'polite' });
      var ok = UI.button(o.confirmLabel || 'Confirmar', { type: 'submit', variant: o.danger ? 'danger' : null });
      var cancel = UI.button('Cancelar', { variant: 'ghost', onclick: function () { finish(false); } });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault(); general.textContent = '';
        var c = code ? code.value().replace(/\s/g, '') : '';
        if (!pw.value()) { pw.setError('Digite sua senha.'); pw.input.focus(); return; }
        if (code && !/^\d{6}$/.test(c)) { code.setError('Digite os 6 números do app.'); code.input.focus(); return; }
        UI.busy(ok, true);
        API.reauth(pw.value(), code ? c : null).then(function () { finish(true); }).catch(function (e) {
          UI.busy(ok, false);
          var cd = String((e && e.code) || ''), m = String((e && e.message) || '');
          if (cd === 'invalid_credentials' || /invalid login/i.test(m)) { pw.setError('Senha incorreta.'); pw.input.focus(); }
          else if (code && (cd === 'invalid_code' || /totp|mfa|code/i.test(cd + m))) { code.setError('Código incorreto. Use o número que aparece agora no app.'); code.input.focus(); }
          else if (cd === '429' || /rate.?limit|too many/i.test(cd + m)) general.appendChild(UI.notice('bad', 'Muitas tentativas. Espere alguns minutos.'));
          else { Diag.error('reauth', e); general.appendChild(UI.notice('bad', 'Não foi possível confirmar agora. Tente de novo.')); }
        });
      } },
        h('h2', { id: 'cid-t' }, o.title || 'Confirme que é você'),
        h('p', null, o.text || 'Por segurança, digite sua senha.'),
        pw.el, code ? code.el : null, general,
        h('div', { class: 'dialog-actions' }, ok, cancel));
      ov = h('div', { class: 'overlay' }, h('div', { class: 'dialog form', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cid-t' }, form));
      document.body.appendChild(ov);
      document.addEventListener('keydown', onKey);
      pw.input.focus();
    });
  }

  function sensitiveError(e) {
    var m = String((e && e.message) || '') + ' ' + String((e && e.code) || '');
    if (/rate_limited/.test(m)) return 'Você já fez isso muitas vezes hoje. Tente amanhã.';
    if (/recent_login_required/.test(m)) return 'Confirme sua identidade de novo e tente outra vez.';
    if (/mfa_required/.test(m)) return 'Termine a verificação em duas etapas e tente de novo.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return null;
  }

  S.account = function (ctx) {
    var me = ctx.me, p = me.profile, pro = me.professional, isPro = p.role === 'professional';

    /* perfil */
    var levelHolder = h('div');
    if (!isPro) {
      API.progress().then(function (pr) { levelHolder.appendChild(S.levelCard(pr, { total: true })); }).catch(function () { /* sem nivel, sem problema */ });
    }
    var head = h('div', { class: 'hello' }, UI.avatar(p.full_name, { size: 'lg', level: !isPro && ctx.progress ? ctx.progress.level : null }),
      h('div', { class: 'grow' }, h('div', { class: 'name-big' }, p.full_name), h('div', { class: 'sub' }, p.email)));

    var dados = S.profileGroup(ctx);

    /* seguranca */
    var othersT = h('span', { class: 't' }, 'Sair dos outros aparelhos');
    var othersBtn = h('button', { type: 'button', class: 'item', onclick: function () {
      othersBtn.disabled = true;
      API.signOutOthers().then(function () { UI.toast('Outros aparelhos desconectados.', 'circle-check'); Diag.log('conta:saiu-outros'); })
        .catch(function (e) { Diag.error('sign-out-others', e); UI.toast('Não deu para desconectar agora.'); })
        .then(function () { othersBtn.disabled = false; });
    } }, h('span', { class: 'ico-box' }, UI.svg('monitor-smartphone', 20)), h('span', null, othersT, h('span', { class: 's' }, 'Encerra o login em celulares e computadores')));
    var auth = ctx.auth || { hasPassword: true, providers: [] };
    var via = auth.providers.map(function (x) { return x === 'azure' ? 'Microsoft' : 'Google'; }).join(' e ');
    var canMfa = isPro || ctx.admin;
    var enrolled = !!(ctx.mfa && ctx.mfa.enrolled);
    var mustMfa = !!(ctx.policy && ctx.policy.mfa_required);
    var mfaRow;
    if (!canMfa) {
      mfaRow = h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('shield-check', 20)), h('span', { class: 't' }, 'Verificação em duas etapas'), h('span', { class: 'badge tag' }, 'Em breve'));
    } else if (enrolled) {
      mfaRow = h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('shield-check', 20)),
        h('span', null, h('span', { class: 't' }, 'Verificação em duas etapas'), h('span', { class: 's' }, mustMfa ? 'Obrigatória para a sua conta' : 'Pedimos o código do app ao entrar')), h('span', { class: 'badge ok tag' }, 'Ativa'));
    } else {
      mfaRow = linkRow('shield-check', 'Verificação em duas etapas', '#/ativar-2fa', 'Recomendada. Protege seus pacientes se alguém descobrir sua senha');
    }
    var mfaOff = null;
    if (canMfa && enrolled && !mustMfa) {
      mfaOff = h('button', { type: 'button', class: 'item', onclick: function () {
        mfaOff.disabled = true;
        S.confirmIdentity({ title: 'Desativar verificação em duas etapas', text: 'Por segurança, confirme sua senha e o código do app.', confirmLabel: 'Desativar', danger: true, needsCode: true, back: 'conta' }).then(function (ok) {
          if (!ok) { mfaOff.disabled = false; return; }
          return API.mfa.unenroll(ctx.mfa.factorId).then(function () { Diag.log('mfa:desativado'); UI.toast('Verificação em duas etapas desativada.', 'shield-check'); refresh(); });
        }).catch(function (e) { mfaOff.disabled = false; Diag.error('mfa-off', e); UI.toast(sensitiveError(e) || 'Não deu para desativar agora.'); });
      } }, h('span', { class: 'ico-box' }, UI.svg('lock', 20)), h('span', { class: 't' }, 'Desativar verificação em duas etapas'));
    }
    var seguranca = h('div', { class: 'group' },
      auth.hasPassword ? linkRow('key-round', 'Alterar senha', '#/redefinir-senha?interna=1')
        : h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('key-round', 20)), h('span', null, h('span', { class: 't' }, 'Você entra com ' + (via || 'sua conta Google ou Microsoft')), h('span', { class: 's' }, 'Sem senha no Senso. A senha é a do ' + (via || 'provedor')))),
      othersBtn,
      mfaRow, mfaOff);

    /* preferencias */
    var theme = UI.segmented({ label: 'Tema', value: (window.Theme && window.Theme.get()) || 'auto', options: [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Escuro']], onChange: function (v) { if (window.Theme) window.Theme.set(v); } });
    var aparencia = h('div', { class: 'group' }, h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('palette', 20)), h('span', { class: 't' }, 'Tema'), theme.el));

    /* privacidade */
    var diag = UI.toggle({ value: false, label: 'Enviar informações técnicas ao suporte', onChange: function (v) {
      return API.setConsent('diagnostics', v).then(function () { UI.toast(v ? 'Autorização salva.' : 'Autorização retirada.', 'circle-check'); }).catch(function (e) { UI.toast('Não deu para salvar. Tente de novo.'); throw e; });
    } });
    diag.el.disabled = true;
    API.hasConsent('diagnostics').then(function (g) { diag.set(g); diag.el.disabled = false; }).catch(function () { /* fica desligado */ });

    var exportT = h('span', { class: 't' }, 'Baixar meus dados');
    function needIdentity(o) {
      o.needsCode = canMfa && enrolled; o.back = 'conta';
      return API.authFresh(10).then(function (fresh) { return fresh ? true : S.confirmIdentity(o); });
    }
    var exportBtn = h('button', { type: 'button', class: 'item', onclick: function () {
      exportBtn.disabled = true;
      needIdentity({ title: 'Baixar meus dados', text: 'Por segurança, confirme sua senha.', confirmLabel: 'Baixar' }).then(function (ok) {
        if (!ok) { exportBtn.disabled = false; return; }
        exportT.textContent = 'Gerando...';
        return API.exportMyData().then(function (d) {
          download('psigestao-meus-dados.json', JSON.stringify(d, null, 2));
          exportBtn.disabled = false; exportT.textContent = 'Baixar meus dados'; UI.toast('Arquivo baixado.', 'download'); Diag.log('conta:exportou');
        });
      }).catch(function (e) { exportBtn.disabled = false; exportT.textContent = 'Baixar meus dados'; Diag.error('export', e); UI.toast(sensitiveError(e) || 'Não deu para gerar agora.'); });
    } }, h('span', { class: 'ico-box' }, UI.svg('download', 20)), exportT);

    var privacidade = h('div', { class: 'group' },
      h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('life-buoy', 20)),
        h('span', null, h('span', { class: 't' }, 'Informações técnicas ao suporte'), h('span', { class: 's' }, 'Você vê tudo antes de enviar')), diag.el),
      exportBtn,
      linkRow('file-text', 'Política de Privacidade', '#/legal/privacidade'),
      linkRow('file-text', 'Termos de Uso', '#/legal/' + (isPro ? 'termos-profissional' : 'termos-paciente')));

    /* apagar conta */
    var typed = UI.field({ label: 'Digite APAGAR para confirmar', autocapitalize: 'characters' });
    var delBtn = UI.button('Apagar para sempre', { variant: 'danger', onclick: function () {
      if (typed.value().trim().toUpperCase() !== 'APAGAR') { typed.setError('Digite APAGAR para confirmar.'); typed.input.focus(); return; }
      UI.busy(delBtn, true);
      needIdentity({ title: 'Apagar conta', text: 'Última confirmação. Digite sua senha para apagar para sempre.', confirmLabel: 'Apagar', danger: true }).then(function (ok) {
        if (!ok) { UI.busy(delBtn, false); return; }
        return API.deleteMyAccount().then(function () { Diag.clear(); UI.toast('Conta apagada.'); go('#/entrar'); });
      }).catch(function (e) { UI.busy(delBtn, false); Diag.error('delete-account', e); typed.setError(sensitiveError(e) || 'Não foi possível apagar agora. Fale com o suporte.'); });
    } });
    var panel = h('div', { class: 'panel hide' },
      UI.notice('bad', h('span', null, h('b', null, 'Não tem volta. '), isPro ? 'Sua conta, seus vínculos e seus dados serão apagados.' : 'Sua conta, seus vínculos, seu diário e seu XP serão apagados.')),
      typed.el, delBtn);
    var openDel = h('button', { type: 'button', class: 'item danger', 'aria-expanded': 'false', onclick: function () {
      var open = panel.classList.toggle('hide') === false;
      openDel.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) typed.input.focus();
    } }, h('span', { class: 'ico-box' }, UI.svg('trash-2', 20)), h('span', { class: 't' }, 'Apagar conta'));
    var apagar = h('div', { class: 'group' }, openDel, panel);

    var sair = UI.button('Sair da conta', { variant: 'ghost', icon: 'log-out', onclick: function () { API.signOut().then(function () { go('#/entrar'); }); } });

    /* abas: Perfil (dados, seguranca, privacidade) e Conquistas (individuais, so da propria pessoa) */
    var perfil = h('div', { id: 'aba-perfil' }, head, levelHolder,
      dados,
      h('div', { class: 'group-title' }, 'Segurança'), seguranca,
      h('div', { class: 'group-title' }, 'Aparência'), aparencia,
      h('div', { class: 'group-title' }, 'Privacidade'), privacidade,
      h('div', { class: 'group-title' }, 'Zona de risco'), apagar,
      h('div', { class: 'row-actions' }, sair));
    var conquistas = h('div', { id: 'aba-conquistas', class: 'hide' });
    var loaded = false;
    var tabs = UI.segmented({ label: 'Seções da conta', value: 'perfil', options: [['perfil', 'Perfil'], ['conquistas', 'Conquistas']], onChange: function (v) {
      perfil.classList.toggle('hide', v !== 'perfil');
      conquistas.classList.toggle('hide', v !== 'conquistas');
      if (v === 'conquistas' && !loaded) { loaded = true; conquistas.appendChild(S.achievements(ctx)); }
    } });
    var modo = ctx.admin ? h('div', { class: 'mode-card' }, h('div', { class: 'group-title' }, 'Modo de teste (só a sua conta vê)'),
      h('p', { class: 'small muted mb8' }, 'Veja o portal como Administrador, Psicólogo(a) ou Paciente. No modo Paciente a conta vira de paciente de verdade, e o app do celular avisa até você voltar para Psicólogo(a) ou Administrador.'),
      S.modeSwitch(ctx, false)) : null;
    return S.shell(ctx, 'conta', [h('h1', { class: 'mb16' }, 'Conta'), modo, tabs.el, perfil, conquistas]);
  };
})();
