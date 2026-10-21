/* Area logada: moldura (menu lateral no computador, barra embaixo no celular), inicio de cada perfil e a tela Conta. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { location.hash = hash; }
  function refresh() { window.dispatchEvent(new HashChangeEvent('hashchange')); }   /* redesenha a tela atual */
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* ---------------------------------------------------------------- moldura */
  S.shell = function (ctx, active, content) {
    var p = ctx.me.profile, pro = p.role === 'professional';
    var items = pro
      ? [['inicio', '#/inicio', 'house', 'Início'], ['conta', '#/conta', 'user', 'Conta'], ['suporte', '#/suporte', 'life-buoy', 'Suporte']]
      : [['inicio', '#/inicio', 'house', 'Início'], ['diario', '#/diario', 'notebook-pen', 'Diário'], ['conta', '#/conta', 'user', 'Conta'], ['suporte', '#/suporte', 'life-buoy', 'Suporte']];
    if (ctx.admin) items.splice(items.length - 1, 0, ['equipe', '#/equipe', 'shield-check', 'Equipe']);
    function link(it) { return h('a', { href: it[1], 'aria-current': active === it[0] ? 'page' : null }, UI.svg(it[2], 22), it[3]); }
    function me(size) { return UI.avatar(p.full_name, { size: size, level: !pro && ctx.progress ? ctx.progress.level : null }); }
    return h('div', { class: 'app' },
      h('aside', { class: 'side' }, UI.brand('#/inicio'),
        h('nav', { 'aria-label': 'Menu principal' }, items.map(link)),
        h('div', { class: 'me' }, me(),
          h('div', { class: 'who' }, h('b', null, p.full_name), h('span', null, pro ? 'Psicólogo(a)' : (ctx.admin ? 'Equipe' : 'Paciente'))))),
      h('div', null,
        h('header', { class: 'mhead' }, UI.brand('#/inicio'), h('a', { class: 'mhead-me', href: '#/conta', 'aria-label': 'Minha conta' }, me())),
        h('main', { class: 'main' }, content)),
      h('nav', { class: 'bottom', 'aria-label': 'Menu' }, items.map(link)));
  };

  function hello(p, sub) {
    return h('div', { class: 'hello' }, h('div', { class: 'grow' }, h('h1', null, UI.greeting(p.full_name)), sub ? h('div', { class: 'sub' }, sub) : null));
  }
  function tile(icon, title) {
    return h('div', { class: 'tile off' }, h('span', { class: 'ico-box' }, UI.svg(icon, 22)), h('span', { class: 't' }, title), h('span', { class: 'pill' }, 'Em breve'));
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
  function patientCard(it) {
    if (!it.consent) {
      return h('div', { class: 'card' }, h('div', { class: 'pt-head' }, UI.avatar(it.full_name),
        h('div', { class: 'who' }, h('b', null, it.full_name), h('span', null, 'Retirou a autorização do diário. Você não vê o check-in.'))));
    }
    var f = UI.frameFor(it.level), last = it.checkins[0];
    var vals = [];
    if (last) {
      if (last.mood != null) vals.push(h('span', { class: 'val' }, 'Humor ', h('b', null, last.mood + '/5'), ' ' + MOOD_LABEL[last.mood - 1]));
      if (last.energy != null) vals.push(h('span', { class: 'val' }, 'Energia ', h('b', null, last.energy + '/5')));
      if (last.anxiety != null) vals.push(h('span', { class: 'val' }, 'Ansiedade ', h('b', null, last.anxiety + '/5')));
    }
    return h('div', { class: 'card' },
      h('div', { class: 'pt-head' }, UI.avatar(it.full_name, { level: it.level }),
        h('div', { class: 'who' }, h('b', null, it.full_name), h('span', null, 'Nível ' + it.level + ', moldura ' + f.name))),
      last ? h('div', { class: 'pt-vals' }, vals) : h('p', { class: 'pt-note mb0' }, 'Sem check-in nos últimos 30 dias.'),
      last ? moodBars(it.checkins) : null,
      h('div', { class: 'pt-foot' }, h('span', null, last ? 'Último check-in: ' + rel(last.entry_date) : ''),
        h('span', null, it.days_this_week + (it.days_this_week === 1 ? ' dia' : ' dias') + ' de uso na semana')));
  }
  S.patientsOverview = function () {
    var holder = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Carregando...'));
    API.pro.overview(30).then(function (list) {
      clear(holder);
      if (!list.length) {
        holder.appendChild(h('div', { class: 'card' }, h('p', { class: 'mb0' }, 'Nenhum paciente vinculado ainda. Quando um paciente se vincular a você, o nível e o check-in aparecem aqui.')));
        return;
      }
      list.forEach(function (it) { holder.appendChild(patientCard(it)); });
      holder.appendChild(h('p', { class: 'pt-note' }, 'Você vê nível, humor, energia e ansiedade. O texto do diário só aparece quando o paciente compartilha.'));
    }).catch(function (e) {
      Diag.error('pacientes', e);
      clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar os pacientes agora. Atualize a página.'));
    });
    return holder;
  };

  /* ---------------------------------------------------------------- aviso: verificacao em duas etapas (recomendada) */
  var TIP = 'psi_tip2fa';
  /* Psicologo (ou equipe) que ainda nao ativou, enquanto a obrigatoriedade esta desligada. "Agora nao" esconde ate fechar a aba. */
  S.mfaTip = function (ctx) {
    var mine = (ctx.me.profile.role === 'professional' || ctx.admin) && ctx.mfa && !ctx.mfa.enrolled && !(ctx.policy && ctx.policy.mfa_required);
    if (!mine) return null;
    try { if (sessionStorage.getItem(TIP) === '1') return null; } catch (e) { /* ignore */ }
    var box = h('div', { class: 'cta-card tip', role: 'region', 'aria-label': 'Recomendação de segurança' },
      h('span', { class: 'ico-box' }, UI.svg('shield-check', 22)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'Proteja sua conta com a verificação em duas etapas'),
        h('div', { class: 's' }, 'É opcional, mas recomendamos: você cuida de dados de saúde. Leva 1 minuto.')),
      h('div', { class: 'tip-actions' },
        h('a', { class: 'btn auto sm', href: '#/ativar-2fa' }, 'Ativar'),
        h('button', { type: 'button', class: 'linkbtn small', onclick: function () {
          try { sessionStorage.setItem(TIP, '1'); } catch (e) { /* ignore */ }
          if (box.parentNode) box.parentNode.removeChild(box);
        } }, 'Agora não')));
    return box;
  };

  /* ---------------------------------------------------------------- inicio: profissional */
  S.homeProfessional = function (ctx) {
    var p = ctx.me.profile, pro = ctx.me.professional;
    var has2fa = !!(ctx.mfa && ctx.mfa.enrolled);
    var steps = [['Conta criada', true], ['CRP verificado', true], ['Verificação em duas etapas', has2fa, '#/ativar-2fa'], ['Convidar o primeiro paciente', false]];
    var done = steps.filter(function (s) { return s[1]; }).length;
    var checklist = h('div', { class: 'group' },
      h('div', { class: 'setup-head' }, UI.ring(done, steps.length), h('div', null, h('div', { class: 't' }, 'Primeiros passos'), h('div', { class: 's' }, done + ' de ' + steps.length))),
      steps.map(function (s) {
        if (!s[1] && s[2]) {
          return h('a', { class: 'item', href: s[2] }, h('span', { class: 'ico-box todo' }), h('span', { class: 't' }, s[0]), h('span', { class: 'tag' }, 'Recomendado'));
        }
        return h('div', { class: 'item' }, h('span', { class: 'ico-box ' + (s[1] ? 'done' : 'todo') }, s[1] ? UI.svg('check', 20) : null),
          h('span', { class: 't' }, s[0]), s[1] ? null : h('span', { class: 'tag' }, 'Em breve'));
      }));
    return S.shell(ctx, 'inicio', [
      hello(p, [h('span', null, 'CRP ' + pro.crp_region + '/' + pro.crp_number), h('span', { class: 'badge ok' }, UI.svg('badge-check', 14), 'CRP verificado')]),
      S.mfaTip(ctx),
      h('div', { class: 'group-title' }, 'Pacientes'),
      S.patientsOverview(),
      checklist,
      h('div', { class: 'group-title' }, 'Chegando'),
      h('div', { class: 'tiles' }, tile('calendar', 'Agenda'), tile('users', 'Cadastro de pacientes'), tile('notebook-pen', 'Diários compartilhados'), tile('wallet', 'Pagamentos'))
    ]);
  };

  /* ---------------------------------------------------------------- inicio: paciente */
  S.homePatient = function (ctx) {
    var p = ctx.me.profile;
    var holder = h('div');
    var prog = null, consent = false, todayMood = null, todayEntry = null;

    function draw() {
      clear(holder);
      holder.appendChild(S.levelCard(prog));
      if (consent) {
        holder.appendChild(S.checkinCard(todayMood, function (m) {
          var before = prog;
          var row = { id: todayEntry ? todayEntry.id : null, entry_date: UI.today(), mood: m, energy: todayEntry ? todayEntry.energy : null, anxiety: todayEntry ? todayEntry.anxiety : null, tags: todayEntry ? todayEntry.tags : [], body: todayEntry ? todayEntry.body : '' };
          return API.diary.save(row).then(function (saved) {
            todayEntry = saved; todayMood = saved.mood;
            return S.afterSave(before);
          }).then(function (after) { prog = after; draw(); });
        }));
      } else {
        holder.appendChild(h('div', { class: 'cta-card' }, h('span', { class: 'ico-box' }, UI.svg('notebook-pen', 22)),
          h('div', { class: 'grow' }, h('div', { class: 't' }, 'Seu diário'), h('div', { class: 's' }, 'Registre como você está e ganhe XP.')),
          h('a', { class: 'btn auto sm', href: '#/diario' }, 'Começar')));
      }
      holder.appendChild(h('div', { class: 'group-title' }, 'Chegando'));
      holder.appendChild(h('div', { class: 'tiles' }, tile('calendar', 'Sessões'), tile('wallet', 'Pagamentos'), tile('heart-handshake', 'Meu psicólogo(a)')));
    }

    Promise.all([API.progress(), API.hasConsent('diary')]).then(function (r) {
      prog = r[0]; consent = r[1];
      return consent ? API.diary.list() : [];
    }).then(function (list) {
      var t = UI.today();
      todayEntry = list.filter(function (e) { return e.entry_date === t; })[0] || null;
      todayMood = todayEntry ? todayEntry.mood : null;
      draw();
    }).catch(function (e) { Diag.error('home-paciente', e); clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar agora. Atualize a página.')); });

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

    var dados = h('div', { class: 'group' },
      row('Perfil', isPro ? 'Psicólogo(a)' : 'Paciente'), row('Celular', p.phone), row('Nascimento', UI.fmtDate(p.birth_date)),
      isPro ? h('div', { class: 'item' }, h('span', { class: 't' }, 'CRP'), h('span', { class: 'v' }, pro.crp_region + '/' + pro.crp_number + ' ',
        pro.verification === 'verified' ? h('span', { class: 'badge ok' }, 'CRP verificado') : h('span', { class: 'badge warn' }, 'Em análise'))) : null);

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
    return S.shell(ctx, 'conta', [h('h1', { class: 'mb16' }, 'Conta'), tabs.el, perfil, conquistas]);
  };
})();
