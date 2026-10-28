/* Roteador do portal: decide a tela pela URL (#/rota) e pela situacao da pessoa (logada, 2 fatores, CRP verificado). */
(function () {
  'use strict';
  var h = UI.h, S = window.Screens;

  /* ---------------------------------------------------------------- tema (claro, escuro ou automatico) */
  var TK = 'psi_theme';
  function applyTheme(v) {
    var r = document.documentElement;
    if (v === 'light' || v === 'dark') r.setAttribute('data-theme', v); else r.removeAttribute('data-theme');
  }
  window.Theme = {
    get: function () { try { return localStorage.getItem(TK) || 'auto'; } catch (e) { return 'auto'; } },
    set: function (v) { try { if (v === 'auto') localStorage.removeItem(TK); else localStorage.setItem(TK, v); } catch (e) { /* ignore */ } applyTheme(v); }
  };
  applyTheme(window.Theme.get());

  /* ---------------------------------------------------------------- rotas */
  function parse() {
    var raw = (location.hash || '').replace(/^#\/?/, '');
    var i = raw.indexOf('?');
    var path = (i >= 0 ? raw.slice(0, i) : raw).replace(/\/+$/, '');
    var q = {};
    if (i >= 0) raw.slice(i + 1).split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      try { q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) { /* ignore */ }
    });
    return { path: path, q: q };
  }

  var PUBLIC_ONLY = {
    'entrar': function (q) { return S.login(q); },
    'criar-conta': function () { return S.chooseRole(); },
    'criar-conta/profissional': function () { return S.signupProfessional(); },
    'criar-conta/paciente': function () { return S.signupPatient(); },
    'confirmar-email': function (q) { return S.confirmEmail(q); },
    'esqueci-senha': function () { return S.forgot(); }
  };
  var TITLES = {
    'entrar': 'Entrar', 'criar-conta': 'Criar conta', 'criar-conta/profissional': 'Cadastro de psicólogo(a)', 'criar-conta/paciente': 'Cadastro de paciente',
    'confirmar-email': 'Confirme seu e-mail', 'esqueci-senha': 'Esqueci a senha', 'redefinir-senha': 'Nova senha', 'inicio': 'Início', 'conta': 'Conta', 'suporte': 'Suporte', 'diario': 'Diário', 'equipe': 'Equipe',
    'completar-cadastro': 'Completar cadastro', 'ativar-2fa': 'Verificação em duas etapas'
  };

  /* Rotas da area logada. who: quem pode abrir ('patient', 'professional' ou 'any'). build recebe (ctx, query, match). */
  function screen(name) {
    return function () {
      var f = S[name];
      if (typeof f !== 'function') return null;
      return f.apply(S, arguments);
    };
  }
  var ROUTES = [
    { re: /^inicio$/, who: 'any', title: 'Início', build: function (ctx) { return ctx.me.profile.role === 'professional' ? S.homeProfessional(ctx) : S.homePatient(ctx); } },
    { re: /^conta$/, who: 'any', title: 'Conta', build: function (ctx) { return S.account(ctx); } },
    { re: /^diario$/, who: 'patient', title: 'Diário', build: function (ctx) { return S.diary(ctx); } },
    { re: /^diario\/([A-Za-z0-9-]+)$/, who: 'patient', title: function (m) { return m[1] === 'novo' ? 'Novo registro' : 'Editar registro'; },
      build: function (ctx, q, m) { return S.diaryEditor(ctx, m[1] === 'novo' ? null : m[1]); } },
    { re: /^consultas$/, who: 'patient', title: 'Consultas', build: function (ctx, q) { return S.appointments(ctx, q); } },
    { re: /^psicologo$/, who: 'patient', title: 'Meu psicólogo(a)', build: function (ctx) { return S.myPsychologist(ctx); } },
    { re: /^lab$/, who: 'patient', title: 'Lab', build: function (ctx) { return S.lab(ctx); } },
    { re: /^ajuda$/, who: 'patient', title: 'Preciso de ajuda', build: screen('help') },
    { re: /^pacientes$/, who: 'professional', title: 'Pacientes', build: function (ctx, q) { return screen('patients')(ctx, q); } },
    { re: /^pacientes\/([A-Za-z0-9-]+)$/, who: 'professional', title: 'Ficha do paciente', build: function (ctx, q, m) { return screen('patientFile')(ctx, m[1], q); } },
    { re: /^agenda$/, who: 'professional', title: 'Agenda', build: function (ctx, q) { return screen('agenda')(ctx, q); } },
    { re: /^avaliacoes$/, who: 'professional', title: 'Avaliações', build: function (ctx) { return screen('proReviews')(ctx); } },
    { re: /^atendimento$/, who: 'professional', title: 'Atendimento', build: function (ctx) { return screen('service')(ctx); } }
  ];
  function matchRoute(path) {
    for (var i = 0; i < ROUTES.length; i++) {
      var m = ROUTES[i].re.exec(path);
      if (m) return { r: ROUTES[i], m: m };
    }
    return null;
  }

  /* ---------------------------------------------------------------- saida por inatividade
     Psicologo: sempre. Paciente: so se nao marcou "Manter conectado". A ultima atividade fica no aparelho (vale entre abas),
     entao fechar o navegador e voltar depois do limite tambem sai. */
  var pendingReason = null;   /* motivo da saida automatica: aparece uma vez na tela de entrada */
  var Idle = window.Idle = (function () {
    var LAST = 'psi_last', STEP = 15000, timer = null, limit = 0, mem = 0, memStamp = 0, on = false;
    var EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
    function read() { try { return Number(localStorage.getItem(LAST)) || 0; } catch (e) { return 0; } }
    function write(t) { try { localStorage.setItem(LAST, String(t)); } catch (e) { /* ignore */ } }
    function touch() { var t = Date.now(); mem = t; if (t - memStamp > STEP) { memStamp = t; write(t); } }
    function check() {
      if (!on) return;
      if (Date.now() - Math.max(mem, read()) > limit) expire();
    }
    function expire() {
      stop();
      Diag.log('sessao:inatividade');
      pendingReason = 'inatividade';
      API.signOut().then(function () { render(); });
    }
    function onVisible() { if (document.visibilityState === 'visible') check(); }
    function stop() {
      on = false;
      if (timer) { clearInterval(timer); timer = null; }
      EVENTS.forEach(function (n) { document.removeEventListener(n, touch, true); });
      document.removeEventListener('visibilitychange', onVisible);
    }
    return {
      /* Chamado depois de entrar: zera o relogio (senao uma marca antiga de outra sessao derrubaria a pessoa na hora). */
      fresh: function () { pendingReason = null; mem = Date.now(); memStamp = mem; write(mem); },
      start: function (role) {
        var mins = Number(((window.PSI_CONFIG || {}).idleMinutes || {})[role === 'professional' ? 'professional' : 'patient']) || 0;
        if (role !== 'professional' && API.keepsSession()) mins = 0;
        if (!mins) { stop(); return; }
        if (on && limit === mins * 60000) return;
        stop();
        limit = mins * 60000; on = true;
        if (Date.now() - read() > limit && read() > 0) { expire(); return; }
        touch();
        EVENTS.forEach(function (n) { document.addEventListener(n, touch, { capture: true, passive: true }); });
        document.addEventListener('visibilitychange', onVisible);
        timer = setInterval(check, STEP);
      },
      stop: function () { stop(); try { localStorage.removeItem(LAST); } catch (e) { /* ignore */ } }
    };
  })();

  var wasAuthed = null, token = 0, queued = false;

  function mount(node, title) { UI.mount(node, title); }

  function errorPage(msg, retry) { return S.errorPage(msg, retry ? render : null); }

  /* Monta o contexto da pessoa logada: perfil, como entra (senha ou Google/Microsoft), se e da equipe e a situacao do 2FA.
     Quem entrou com Google ou Microsoft e ainda nao completou o cadastro volta com me = null. */
  function loadContext() {
    return Promise.all([API.me(), API.policy(), API.account()]).then(function (r) {
      var me = r[0], pol = r[1], acct = r[2];
      if (!me) return { me: null, policy: pol, auth: acct };
      var admin = !!pol.is_admin;
      var base = (me.profile.role === 'professional' || admin)
        ? API.mfa.status().then(function (m) {
          /* Com app autenticador cadastrado, o codigo e sempre pedido. Sem app: so se for obrigatorio (equipe sempre; psicologo, se a chave estiver ligada). */
          return { me: me, admin: admin, policy: pol, auth: acct, mfa: m, mfaOk: m.enrolled ? m.verified : !pol.mfa_required };
        })
        : Promise.resolve({ me: me, admin: false, policy: pol, auth: acct, mfaOk: true });
      return base.then(function (ctx) {
        /* Modo de teste da equipe: sem escolha ainda = Administrador. Quem nao e da equipe nao tem modo. */
        ctx.mode = ctx.admin ? (pol.test_mode || 'admin') : null;
        /* O nivel do paciente (moldura da foto) aparece na moldura do portal. Sem nivel, segue sem moldura. */
        if (me.profile.role !== 'patient' || !ctx.mfaOk) return ctx;
        return API.progress().then(function (pr) { ctx.progress = pr; return ctx; }, function () { return ctx; });
      });
    });
  }

  function run() {
    queued = false;
    var my = ++token;
    var r = parse();
    var path = r.path, q = r.q;
    var isOpen = path === 'suporte' || path === 'convite' || path.indexOf('legal/') === 0;

    document.getElementById('demo-banner').classList.toggle('hide', API.mode !== 'demo');
    Diag.log('rota:' + (path || 'raiz'));

    API.session().then(function (sess) {
      if (my !== token) return;
      wasAuthed = !!sess;
      if (!sess) Idle.stop();

      /* Acabou de voltar do Google ou da Microsoft: zera o relogio de inatividade e, se foi para confirmar a identidade, volta a tela de onde saiu (Conta ou Equipe). */
      if (sess) {
        var back = API.takeOauthReturn();
        if (back) {
          Idle.fresh();
          if (back.back && path !== back.back) { location.hash = '#/' + back.back; return; }
        }
      }

      /* Telas abertas a todos: suporte e textos legais. Se ha sessao completa, usam a moldura logada. */
      if (isOpen) {
        var build = function (ctx) {
          if (path === 'convite') return mount(S.inviteLanding(ctx, q), 'Convite');
          mount(path === 'suporte' ? S.support(ctx, q) : S.legal(ctx, path.slice(6)), path === 'suporte' ? 'Suporte' : 'Documento');
        };
        if (!sess) return build(null);
        return loadContext().then(function (c) { if (my !== token) return; build(c.me && c.mfaOk ? c : null); });
      }

      /* Senha trocada: aviso depois da nova senha. */
      if (path === 'senha-alterada') {
        if (!sess) { location.hash = '#/entrar'; return; }
        return mount(S.passwordDone(), 'Senha alterada');
      }

      /* Nova senha: precisa de sessao (vinda do link do e-mail ou da conta). */
      if (path === 'redefinir-senha') {
        if (!sess) return mount(S.expiredLink(), 'Link vencido');
        return mount(S.resetPassword(q), TITLES['redefinir-senha']);
      }

      /* Telas de quem ainda nao entrou. Quem ja entrou vai direto para o inicio. */
      if (PUBLIC_ONLY[path]) {
        if (sess) { location.hash = '#/inicio'; return; }
        if (path === 'entrar' && pendingReason) q.motivo = pendingReason;
        return mount(PUBLIC_ONLY[path](q), TITLES[path]);
      }

      /* Daqui para baixo: area logada. */
      if (!sess) { location.hash = '#/entrar'; return; }
      var found = matchRoute(path);
      if (['equipe', 'completar-cadastro', 'ativar-2fa'].indexOf(path) < 0 && !found) { location.hash = '#/inicio'; return; }

      return loadContext().then(function (ctx) {
        if (my !== token) return;
        /* Entrou com Google ou Microsoft e ainda nao tem cadastro: so a tela de completar cadastro abre. */
        if (!ctx.me) {
          if (path !== 'completar-cadastro') { location.hash = '#/completar-cadastro'; return; }
          return mount(S.completeSignup(ctx), TITLES['completar-cadastro']);
        }
        if (path === 'completar-cadastro') { location.hash = '#/inicio'; return; }
        var pro = ctx.me.profile.role === 'professional';
        var needMfa = pro || ctx.admin;
        Idle.start(needMfa ? 'professional' : 'patient');
        if (needMfa && !ctx.mfa.enrolled && ctx.policy.mfa_required) return mount(S.mfaSetup({ required: true }), 'Verificação em duas etapas');
        if (needMfa && ctx.mfa.enrolled && !ctx.mfa.verified) return mount(S.mfaVerify(), 'Código de verificação');
        if (path === 'ativar-2fa') {
          if (!needMfa || ctx.mfa.enrolled) { location.hash = '#/conta'; return; }
          return mount(S.mfaSetup({ required: false }), TITLES['ativar-2fa']);
        }
        if (path === 'inicio' && ctx.admin && ctx.mode === 'admin') { location.hash = '#/equipe'; return; }
        if (path === 'equipe') {
          if (!ctx.admin || ctx.mode !== 'admin') { location.hash = '#/inicio'; return; }
          return mount(S.team(ctx), TITLES.equipe);
        }
        /* Equipe no modo Administrador so usa Equipe, Conta e Suporte; as telas de psicologo e de paciente ficam para os outros modos. */
        if (ctx.admin && ctx.mode === 'admin' && path !== 'conta') { location.hash = '#/equipe'; return; }
        if (!found) { location.hash = '#/inicio'; return; }
        var rt = found.r;
        if ((rt.who === 'patient' && pro) || (rt.who === 'professional' && !pro)) { location.hash = '#/inicio'; return; }
        var node = rt.build(ctx, q, found.m);
        if (!node) { location.hash = '#/inicio'; return; }
        return mount(node, typeof rt.title === 'function' ? rt.title(found.m) : rt.title);
      });
    }).catch(function (e) {
      if (my !== token) return;
      Diag.error('rota', e);
      mount(errorPage(/failed to fetch|network|load failed/i.test(String(e && e.message)) ? 'Sem conexão com o servidor. Verifique sua internet e tente de novo.' : 'Não foi possível abrir esta tela agora.', true), 'Erro');
    });
  }

  /* Junta varios pedidos de atualizacao do mesmo instante em um so. */
  function render() { if (queued) return; queued = true; setTimeout(run, 0); }

  window.addEventListener('hashchange', render);

  API.onAuth(function (ev) {
    if (ev === 'SIGNED_OUT') { wasAuthed = false; Idle.stop(); render(); }
    else if (ev === 'PASSWORD_RECOVERY') { if (location.hash === '#/redefinir-senha') render(); else location.hash = '#/redefinir-senha'; }
    else if (ev === 'SIGNED_IN') { if (!wasAuthed) render(); }   /* o Supabase repete SIGNED_IN ao voltar para a aba: nao redesenhar, senao apaga o que a pessoa digitou */
  });

  /* Voltou do Google ou da Microsoft com erro (ou a pessoa cancelou): o provedor devolve ?error=... na URL. */
  if (/[?&#]error(_code|_description)?=/.test(location.search + location.hash) && !/error_code=otp_expired/.test(location.search + location.hash)) {
    pendingReason = 'oauth';
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    location.hash = '#/entrar';
  }
  /* Voltar do provedor pelo botao do navegador restaura a pagina antiga com botoes travados: redesenha. */
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) render(); });

  if (!location.hash) location.replace('#/entrar');
  render();
})();
