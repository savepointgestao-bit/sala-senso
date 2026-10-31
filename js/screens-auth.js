/* Telas de entrada: login, cadastro, confirmacao de e-mail, senha, 2 fatores e espera de verificacao do CRP. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};
  var NS = 'http://www.w3.org/2000/svg';

  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
  function qs(obj) { return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&'); }

  /* Traduz erros do servidor para frases claras. */
  function friendly(e) {
    var c = String((e && e.code) || ''), m = String((e && e.message) || '');
    if (c === 'invalid_credentials' || /invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (c === 'email_not_confirmed' || /not confirmed/i.test(m)) return 'EMAIL_NOT_CONFIRMED';
    if (c === 'invalid_code' || /invalid totp|mfa_verification_failed|invalid.*code/i.test(m + c)) return 'Código incorreto. Digite o número que aparece agora no app.';
    if (c === '429' || /rate.?limit|too many/i.test(c + m)) return 'Muitas tentativas. Espere alguns minutos.';
    if (c === 'weak_password' || /weak|password should/i.test(c + m)) return 'Senha fraca. Use 10 ou mais caracteres, com letras e números.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
    if (/database error saving new user/i.test(m)) return 'Não foi possível criar a conta. Confira os dados: nome completo, celular, data de nascimento e, para menores de 18 anos, o responsável.';
    if (/guardian_required|guardian_invalid/.test(m)) return 'Para menores de 18 anos, informe o nome e o celular de um responsável.';
    if (/birth_date_required|birth_date_invalid/.test(m)) return 'Confira a data de nascimento.';
    if (/phone_invalid/.test(m)) return 'Confira o número de celular.';
    if (/consent_required/.test(m)) return 'Aceite os termos para continuar.';
    if (/full_name_invalid/.test(m)) return 'Digite seu nome completo.';
    if (c === '23505' || /duplicate key|professionals_crp_unique/i.test(m)) return 'Já existe uma conta com esse CRP. Fale com o suporte.';
    if (c === '23514' || /professionals|crp/i.test(m)) return 'CRP inválido. Confira a região e o número.';
    if (/provider is not enabled|unsupported provider|not enabled/i.test(m)) return 'Esta forma de entrar ainda não está ativa. Use e-mail e senha.';
    return null;
  }
  S._friendly = friendly;
  function unexpected(where, e) { Diag.error(where, e); return 'Algo deu errado. Tente de novo em instantes.'; }

  /* Painel lateral (so no computador): circulos concentricos, uma frase e tres pontos. */
  function art() {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 640 640'); s.setAttribute('class', 'side-art'); s.setAttribute('aria-hidden', 'true');
    [70, 150, 235, 315].forEach(function (r) { var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', '320'); c.setAttribute('cy', '320'); c.setAttribute('r', String(r)); s.appendChild(c); });
    [[0.9, 150], [3.4, 235], [5.4, 315], [2.1, 70]].forEach(function (d) {
      var c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'dot'); c.setAttribute('r', '6');
      c.setAttribute('cx', String(Math.round(320 + d[1] * Math.cos(d[0])))); c.setAttribute('cy', String(Math.round(320 + d[1] * Math.sin(d[0])))); s.appendChild(c);
    });
    return s;
  }
  function sidePanel() {
    function li(icon, text) { return h('li', null, UI.svg(icon, 20), text); }
    return h('aside', { class: 'auth-side' }, art(), UI.brand('#/entrar'),
      h('div', { class: 'side-copy' },
        h('h2', null, 'Cuidado que continua entre as sessões.'),
        h('ul', { class: 'side-list' }, li('calendar', 'Agenda e pagamentos num só lugar'), li('notebook-pen', 'Diário privado do paciente'), li('shield-check', 'Dados protegidos pela LGPD'))));
  }

  function authPage(children, o) {
    o = o || {};
    return h('div', { class: 'auth-wrap' }, sidePanel(),
      h('main', { class: 'auth-main' },
        h('div', { class: 'auth-top' }, UI.brand('#/entrar'), h('a', { class: 'help', href: '#/suporte' }, UI.svg('life-buoy', 18), 'Ajuda')),
        h('div', { class: 'auth-box' }, o.back ? UI.backLink(o.back.href, o.back.text) : null, children)));
  }
  function statusIcon(icon, kind) { return h('div', { class: 'status-ico' + (kind ? ' ' + kind : '') }, UI.svg(icon, 30)); }
  function legalLink(slug, text) { return h('a', { href: '#/legal/' + slug, target: '_blank', rel: 'noopener' }, text); }
  S.authPage = authPage;
  S.statusIcon = statusIcon;

  /* ---------------------------------------------------------------- entrar com Google ou Microsoft */
  function mark(kind) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', kind === 'google' ? '0 0 48 48' : '0 0 21 21'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'oauth-mark');
    function el(tag, attrs) { var n = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); }); svg.appendChild(n); }
    if (kind === 'google') {
      el('path', { fill: '#EA4335', d: 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z' });
      el('path', { fill: '#4285F4', d: 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z' });
      el('path', { fill: '#FBBC05', d: 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z' });
      el('path', { fill: '#34A853', d: 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z' });
    } else {
      el('rect', { x: '1', y: '1', width: '9', height: '9', fill: '#F25022' }); el('rect', { x: '11', y: '1', width: '9', height: '9', fill: '#7FBA00' });
      el('rect', { x: '1', y: '11', width: '9', height: '9', fill: '#00A4EF' }); el('rect', { x: '11', y: '11', width: '9', height: '9', fill: '#FFB900' });
    }
    return svg;
  }
  /* Dois botoes (Google e Microsoft). PSI_CONFIG.oauth.<provedor>: true = funciona; 'soon' = aparece apagado e nao clicavel, com
     "Em breve"; false = some da tela. A pagina sai para o provedor e volta
     logada; quem ainda nao tem cadastro cai em "Completar cadastro". o.role = tipo de conta ja escolhido; o.keep = funcao que diz
     se "Manter conectado" esta marcado. */
  function oauthBlock(o) {
    o = o || {};
    var on = (window.PSI_CONFIG || {}).oauth || { google: true, microsoft: true };
    var general = h('div', { 'aria-live': 'polite' });
    var buttons = [];
    function make(provider, kind, name, state) {
      var label = 'Continuar com ' + name;
      if (state === 'soon') {
        return h('button', { type: 'button', class: 'btn ghost oauth soon', 'data-provider': kind, disabled: true, 'aria-disabled': 'true' },
          mark(kind), h('span', null, label), h('span', { class: 'oauth-soon' }, 'Em breve'));
      }
      var txt = h('span', null, label);
      var b = h('button', { type: 'button', class: 'btn ghost oauth', 'data-provider': kind }, mark(kind), txt);
      b.addEventListener('click', function () {
        general.textContent = '';
        buttons.forEach(function (x) { x.disabled = true; });
        txt.textContent = 'Abrindo ' + name + '...';
        b.setAttribute('aria-busy', 'true');
        Diag.log('oauth:' + kind);
        API.oauth(provider, { role: o.role || null, keep: o.keep ? o.keep() : true }).then(function () { go('#/inicio'); }).catch(function (e) {
          buttons.forEach(function (x) { x.disabled = false; });
          txt.textContent = label; b.removeAttribute('aria-busy');
          general.appendChild(UI.notice('bad', friendly(e) || unexpected('oauth', e)));
        });
      });
      buttons.push(b);
      return b;
    }
    var list = [];
    if (on.google !== false) list.push(make('google', 'google', 'Google', on.google));
    if (on.microsoft !== false) list.push(make('azure', 'microsoft', 'Microsoft', on.microsoft));
    if (!list.length) return null;
    return h('div', { class: 'oauth-block' }, h('div', { class: 'oauth-list' }, list), general);
  }
  function sep(text) { return h('div', { class: 'auth-sep' }, text); }

  /* ---------------------------------------------------------------- entrar */
  S.login = function (q) {
    var email = UI.field({ label: 'E-mail', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, value: q.email || '' });
    var pw = UI.field({ label: 'Senha', type: 'password', autocomplete: 'current-password', toggle: true, required: true });
    var keep = UI.checkbox({ label: 'Manter conectado' });
    keep.input.checked = true;
    var inApp = !!window.Android;      /* no app a sessao sempre fica guardada: sem a caixinha */
    var general = h('div', { 'aria-live': 'polite' });
    var resend = h('div', { class: 'hide' });
    var btn = UI.button('Entrar', { type: 'submit' });

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      general.textContent = ''; resend.classList.add('hide');
      var bad = false;
      if (!UI.emailValid(email.value())) { email.setError('Digite um e-mail válido.'); bad = true; }
      if (!pw.value()) { pw.setError('Digite sua senha.'); bad = true; }
      if (bad) { (email.el.classList.contains('has-error') ? email : pw).input.focus(); return; }
      UI.busy(btn, true);
      API.signIn(email.value(), pw.value(), keep.checked()).then(function () {
        Diag.log('login:ok'); if (window.Idle) window.Idle.fresh(); go('#/inicio');
      }).catch(function (e) {
        UI.busy(btn, false);
        var f = friendly(e);
        if (f === 'EMAIL_NOT_CONFIRMED') {
          while (resend.firstChild) resend.removeChild(resend.firstChild);
          resend.appendChild(UI.notice('warn', h('span', null, h('b', null, 'Confirme seu e-mail. '), 'Enviamos um link quando você criou a conta.')));
          resend.appendChild(UI.button('Reenviar e-mail', { variant: 'ghost', onclick: function (ev2) {
            UI.busy(ev2.currentTarget, true);
            API.resendConfirmation(email.value()).then(function () { go('#/confirmar-email?' + qs({ email: email.value().trim() })); }).catch(function () { UI.busy(ev2.currentTarget, false); UI.toast('Não deu para reenviar agora.'); });
          } }));
          resend.classList.remove('hide');
          return;
        }
        Diag.log('login:erro');
        general.appendChild(UI.notice('bad', f || unexpected('login', e)));
      });
    } },
      q.confirmado ? UI.notice('ok', 'E-mail confirmado. Agora é só entrar.') : null,
      q.motivo === 'inatividade' ? UI.notice('info', 'Saímos da sua conta porque ficou um tempo parado. Entre de novo.') : null,
      q.motivo === 'oauth' ? UI.notice('bad', 'Não deu para entrar com essa conta. Tente de novo ou use e-mail e senha.') : null,
      email.el, pw.el,
      h('div', { class: 'row between' }, inApp ? null : keep.el, h('div', { class: 'field' }, h('a', { href: '#/esqueci-senha' }, 'Esqueci a senha'))),
      general, resend, btn);

    var social = oauthBlock({ keep: function () { return keep.checked(); } });
    return authPage([h('h1', null, 'Entrar'), social, social ? sep('ou entre com e-mail') : null, form,
      h('p', { class: 'auth-foot' }, 'Não tem conta? ', h('a', { href: '#/criar-conta' }, 'Criar conta'))]);
  };

  /* ---------------------------------------------------------------- escolher perfil */
  S.chooseRole = function () {
    function choice(href, icon, title, desc) {
      return h('a', { class: 'choice', href: href }, h('span', { class: 'ico-box' }, UI.svg(icon, 22)), h('span', null, h('b', null, title), h('span', { class: 'd' }, desc)), h('span', { class: 'go' }, UI.svg('chevron-right', 20)));
    }
    var social = oauthBlock();
    return authPage([
      h('h1', null, 'Criar conta'),
      choice('#/criar-conta/profissional', 'calendar', 'Sou psicólogo(a)', 'Agenda, pacientes e recibos'),
      choice('#/criar-conta/paciente', 'user', 'Sou paciente', 'Sessões e diário. Gratuito'),
      social ? sep('ou crie a conta com') : null, social,
      h('p', { class: 'auth-foot' }, 'Já tem conta? ', h('a', { href: '#/entrar' }, 'Entrar'))
    ], { back: { href: '#/entrar', text: 'Entrar' } });
  };

  /* ---------------------------------------------------------------- cadastro do profissional */
  S.signupProfessional = function () {
    var name = UI.field({ label: 'Nome completo', autocomplete: 'name', required: true, autocapitalize: 'words', maxlength: 120 });
    var email = UI.field({ label: 'E-mail', type: 'email', autocomplete: 'email', inputmode: 'email', required: true });
    var phone = UI.field({ label: 'Celular', type: 'tel', autocomplete: 'tel', inputmode: 'tel', optional: true, maxlength: 30 });
    var crp = UI.field({ label: 'CRP', inputmode: 'numeric', required: true, placeholder: '06/123456', maxlength: 11, hint: 'Região e número, como na carteira.' });
    crp.input.addEventListener('input', function () { var f = UI.formatCrp(crp.input.value); if (f !== crp.input.value) crp.input.value = f; });
    var pw = UI.field({ label: 'Senha', type: 'password', autocomplete: 'new-password', toggle: true, required: true });
    var meter = UI.strengthMeter(function () { return email.value(); });
    pw.input.addEventListener('input', function () { meter.update(pw.value()); });
    var terms = UI.checkbox({ label: h('span', null, 'Aceito os ', legalLink('termos-profissional', 'Termos de Uso'), ' e a ', legalLink('privacidade', 'Política de Privacidade'), '.') });
    var dpa = UI.checkbox({ label: h('span', null, 'Aceito o ', legalLink('contrato-dados', 'Contrato de Tratamento de Dados'), ', como responsável pelos dados dos meus pacientes.') });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Criar conta', { type: 'submit' });

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      general.textContent = '';
      var firstBad = null;
      function bad(f, msg) { f.setError(msg); if (!firstBad) firstBad = f.input; }
      if (name.value().trim().length < 2 || name.value().trim().split(/\s+/).length < 2) bad(name, 'Digite nome e sobrenome.');
      if (!UI.emailValid(email.value())) bad(email, 'Digite um e-mail válido.');
      var c = UI.parseCrp(crp.value());
      if (!c) bad(crp, 'CRP inválido. Use região de 01 a 24 e o número, como 06/123456.');
      var pc = UI.passwordCheck(pw.value(), email.value());
      if (!pc.valid) bad(pw, 'A senha ainda não atende aos requisitos.');
      if (!terms.checked()) { terms.setError('Aceite os Termos e a Política para continuar.'); if (!firstBad) firstBad = terms.input; }
      if (!dpa.checked()) { dpa.setError('Aceite o Contrato para continuar.'); if (!firstBad) firstBad = dpa.input; }
      if (firstBad) { firstBad.focus(); return; }
      UI.busy(btn, true);
      API.signUp('professional', { fullName: name.value().trim(), email: email.value().trim(), phone: phone.value().trim(), crpRegion: c.region, crpNumber: c.number, password: pw.value() })
        .then(function () { Diag.log('signup:profissional:ok'); go('#/confirmar-email?' + qs({ email: email.value().trim() })); })
        .catch(function (e) { UI.busy(btn, false); general.appendChild(UI.notice('bad', friendly(e) || unexpected('signup-pro', e))); });
    } },
      name.el, email.el, phone.el, crp.el,
      pw.el, meter.el,
      UI.notice('info', 'Conferimos seu CRP em até 1 dia útil. Depois do primeiro acesso, recomendamos ativar a verificação em duas etapas.'),
      terms.el, dpa.el, general, btn);

    var socialPro = oauthBlock({ role: 'professional' });
    return authPage([h('h1', null, 'Cadastro de psicólogo(a)'), socialPro, socialPro ? sep('ou preencha com e-mail') : null, form], { back: { href: '#/criar-conta', text: 'Voltar' } });
  };

  /* ---------------------------------------------------------------- cadastro do paciente */
  S.signupPatient = function () {
    var pf = S.patientForm({ code: S.invite.get() });
    var email = UI.field({ label: 'E-mail', type: 'email', autocomplete: 'email', inputmode: 'email', required: true });
    var pw = UI.field({ label: 'Senha', type: 'password', autocomplete: 'new-password', toggle: true, required: true });
    var meter = UI.strengthMeter(function () { return email.value(); });
    pw.input.addEventListener('input', function () { meter.update(pw.value()); });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Criar conta', { type: 'submit' });

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      general.textContent = '';
      var r = pf.collect(), bads = r.bads.slice();
      if (!UI.emailValid(email.value())) { email.setError('Digite um e-mail válido.'); bads.push(email.input); }
      if (!UI.passwordCheck(pw.value(), email.value()).valid) { pw.setError('A senha ainda não atende aos requisitos.'); bads.push(pw.input); }
      if (S.focusFirst(bads)) return;
      UI.busy(btn, true);
      API.signUp('patient', Object.assign({ email: email.value().trim(), password: pw.value() }, r.data))
        .then(function () { Diag.log('signup:paciente:ok'); S.invite.clear(); go('#/confirmar-email?' + qs({ email: email.value().trim() })); })
        .catch(function (e) { UI.busy(btn, false); general.appendChild(UI.notice('bad', friendly(e) || unexpected('signup-pat', e))); });
    } },
      pf.parts.identity, email.el, pw.el, meter.el, pf.parts.invite, pf.parts.consent, general, btn);

    var socialPat = oauthBlock({ role: 'patient' });
    return authPage([h('h1', null, 'Cadastro de paciente'), h('p', { class: 'lead' }, 'Leva 1 minuto. Só pedimos o essencial.'), socialPat, socialPat ? sep('ou preencha com e-mail') : null, form], { back: { href: '#/criar-conta', text: 'Voltar' } });
  };

  /* ---------------------------------------------------------------- completar cadastro (depois de entrar com Google ou Microsoft) */
  S.completeSignup = function (ctx) {
    var acct = ctx.auth || {};
    var provider = (acct.providers || [])[0] === 'azure' ? 'Microsoft' : ((acct.providers || [])[0] === 'google' ? 'Google' : '');
    var role = acct.roleHint || null;

    var roleSeg = UI.segmented({ label: 'Tipo de conta', value: role, options: [['professional', 'Sou psicólogo(a)'], ['patient', 'Sou paciente']], onChange: function (v) { role = v; roleErr.classList.add('hide'); drawRole(); } });
    var roleErr = h('div', { class: 'err hide', role: 'alert' }, 'Escolha o tipo de conta.');

    var name = UI.field({ label: 'Nome completo', autocomplete: 'name', required: true, autocapitalize: 'words', maxlength: 120, value: acct.name || '' });
    /* psicologo */
    var phone = UI.field({ label: 'Celular', type: 'tel', autocomplete: 'tel', inputmode: 'tel', optional: true, maxlength: 30 });
    var crp = UI.field({ label: 'CRP', inputmode: 'numeric', required: true, placeholder: '06/123456', maxlength: 11, hint: 'Região e número, como na carteira.' });
    crp.input.addEventListener('input', function () { var f = UI.formatCrp(crp.input.value); if (f !== crp.input.value) crp.input.value = f; });
    var termsPro = UI.checkbox({ label: h('span', null, 'Aceito os ', legalLink('termos-profissional', 'Termos de Uso'), ' e a ', legalLink('privacidade', 'Política de Privacidade'), '.') });
    var dpa = UI.checkbox({ label: h('span', null, 'Aceito o ', legalLink('contrato-dados', 'Contrato de Tratamento de Dados'), ', como responsável pelos dados dos meus pacientes.') });
    /* paciente */
    var pf = S.patientForm({ nameField: name, code: S.invite.get() });

    var proBox = h('div', { class: 'hide' }, phone.el, crp.el,
      UI.notice('info', 'Conferimos seu CRP em até 1 dia útil. Depois do primeiro acesso, recomendamos ativar a verificação em duas etapas.'), termsPro.el, dpa.el);
    var patBox = h('div', { class: 'hide' }, pf.parts.identity, pf.parts.invite, pf.parts.consent);
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Concluir cadastro', { type: 'submit' });

    function drawRole() {
      proBox.classList.toggle('hide', role !== 'professional');
      patBox.classList.toggle('hide', role !== 'patient');
    }

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      general.textContent = '';
      var bads = [], data;
      if (!role) { roleErr.classList.remove('hide'); roleSeg.el.querySelector('button').focus(); return; }
      if (role === 'professional') {
        if (name.value().trim().split(/\s+/).length < 2 || name.value().trim().length < 3) { name.setError('Digite nome e sobrenome.'); bads.push(name.input); }
        data = { fullName: name.value().trim() };
        var c = UI.parseCrp(crp.value());
        if (!c) { crp.setError('CRP inválido. Use região de 01 a 24 e o número, como 06/123456.'); bads.push(crp.input); } else { data.crpRegion = c.region; data.crpNumber = c.number; }
        data.phone = phone.value().trim();
        if (!termsPro.checked()) { termsPro.setError('Aceite os Termos e a Política para continuar.'); bads.push(termsPro.input); }
        if (!dpa.checked()) { dpa.setError('Aceite o Contrato para continuar.'); bads.push(dpa.input); }
      } else {
        var r = pf.collect(); data = r.data; bads = r.bads;
      }
      if (S.focusFirst(bads)) return;
      UI.busy(btn, true);
      API.completeSignup(role, data).then(function () { Diag.log('signup:completo:' + role); S.invite.clear(); go('#/inicio'); })
        .catch(function (e) {
          UI.busy(btn, false);
          if (/already_completed/.test(String((e && e.message) || ''))) { go('#/inicio'); return; }
          general.appendChild(UI.notice('bad', friendly(e) || unexpected('complete-signup', e)));
        });
    } },
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Como você vai usar o Senso?'), roleSeg.el, roleErr),
      name.el, proBox, patBox, general, btn);
    drawRole();

    return authPage([
      h('h1', null, 'Complete seu cadastro'),
      UI.notice('info', h('span', null, provider ? 'Você entrou com ' + provider : 'Você entrou', acct.email ? ' como ' : '', acct.email ? h('b', null, acct.email) : null, '. Faltam só alguns dados para liberar sua conta.')),
      form,
      h('p', { class: 'auth-foot' }, 'Conta errada? ', h('button', { type: 'button', class: 'linkbtn', onclick: function () { API.signOut().then(function () { go('#/entrar'); }); } }, 'Sair'))]);
  };

  /* ---------------------------------------------------------------- confirmar e-mail */
  S.confirmEmail = function (q) {
    var email = q.email || '';
    var left = 0, timer = null;
    var again = UI.button('Reenviar e-mail', { variant: 'ghost', onclick: function () {
      if (left > 0) return;
      UI.busy(again, true);
      API.resendConfirmation(email).then(function () { UI.busy(again, false); UI.toast('E-mail reenviado.', 'circle-check'); cooldown(60); }).catch(function () { UI.busy(again, false); UI.toast('Não deu para reenviar agora.'); });
    } });
    function cooldown(sec) {
      left = sec; again.disabled = true;
      clearInterval(timer);
      timer = setInterval(function () {
        left -= 1;
        if (left <= 0) { clearInterval(timer); again.disabled = false; again.textContent = 'Reenviar e-mail'; }
        else again.textContent = 'Reenviar e-mail (' + left + 's)';
      }, 1000);
      again.textContent = 'Reenviar e-mail (' + left + 's)';
    }
    if (!email) again.disabled = true; else cooldown(60);

    var demo = API.mode === 'demo' ? UI.notice('warn', h('span', null, 'Modo demonstração: nenhum e-mail foi enviado. ',
      h('button', { type: 'button', class: 'linkbtn', onclick: function () { API.demoConfirmEmail(email).then(function () { go('#/entrar?' + qs({ confirmado: '1', email: email })); }); } }, 'Simular o clique no link'))) : null;

    return authPage([statusIcon('mail-check'),
      h('h1', null, 'Confira seu e-mail'),
      h('p', { class: 'lead' }, email ? h('span', null, 'Enviamos um link para ', h('b', null, email), '. Veja também o spam.') : 'Enviamos um link de confirmação. Veja também o spam.'),
      demo,
      h('a', { class: 'btn', href: '#/entrar' }, 'Já confirmei, entrar'),
      h('div', { class: 'row-actions' }, again, h('p', { class: 'small muted center mb0' }, 'E-mail errado? ', h('a', { href: '#/criar-conta' }, 'Refazer cadastro')))]);
  };

  /* ---------------------------------------------------------------- esqueci a senha */
  S.forgot = function () {
    var email = UI.field({ label: 'E-mail', type: 'email', autocomplete: 'email', inputmode: 'email', required: true });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Enviar link', { type: 'submit' });
    var box = h('div');
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      if (!UI.emailValid(email.value())) { email.setError('Digite um e-mail válido.'); email.input.focus(); return; }
      UI.busy(btn, true);
      API.resetPassword(email.value()).then(function () { done(); }).catch(function (e) {
        var f = friendly(e);
        if (f && /Muitas|conexão/.test(f)) { UI.busy(btn, false); general.appendChild(UI.notice('bad', f)); } else done();   // sem revelar se o e-mail existe
      });
    } }, email.el, general, btn);
    function done() {
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(UI.notice('ok', 'Se houver uma conta com esse e-mail, o link já foi enviado.'));
      box.appendChild(h('a', { class: 'btn ghost', href: '#/entrar' }, 'Voltar para entrar'));
    }
    box.appendChild(form);
    return authPage([h('h1', null, 'Esqueci a senha'), h('p', { class: 'lead' }, 'Enviamos um link para você criar outra.'), box], { back: { href: '#/entrar', text: 'Entrar' } });
  };

  /* ---------------------------------------------------------------- nova senha (apos link do e-mail ou dentro da conta) */
  S.resetPassword = function (q) {
    var pw = UI.field({ label: 'Nova senha', type: 'password', autocomplete: 'new-password', toggle: true, required: true });
    var meter = UI.strengthMeter(function () { return ''; });
    pw.input.addEventListener('input', function () { meter.update(pw.value()); });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Salvar senha', { type: 'submit' });
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      if (!UI.passwordCheck(pw.value(), '').valid) { pw.setError('A senha ainda não atende aos requisitos.'); pw.input.focus(); return; }
      UI.busy(btn, true);
      API.updatePassword(pw.value()).then(function () { if (window.Idle) window.Idle.fresh(); go('#/senha-alterada'); })
        .catch(function (e) { UI.busy(btn, false); general.appendChild(UI.notice('bad', friendly(e) || unexpected('reset', e))); });
    } }, pw.el, meter.el, general, btn);
    return authPage([h('h1', null, 'Nova senha'), form], q.interna ? { back: { href: '#/conta', text: 'Conta' } } : {});
  };

  /* ---------------------------------------------------------------- 2 fatores: configurar */
  function otpField() {
    return UI.field({ label: 'Código de 6 números', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, required: true, placeholder: '000000' });
  }
  /* No modo demonstracao nao existe app autenticador: o codigo e sempre 123456. */
  function demoOtpNotice(otp, submit) {
    if (API.mode !== 'demo') return null;
    return UI.notice('warn', h('span', null, 'Modo demonstração: não precisa do Google Authenticator (o QR abaixo é só ilustração). O código aqui é sempre 123456. ',
      h('button', { type: 'button', class: 'linkbtn', onclick: function () { otp.input.value = '123456'; submit(); } }, 'Usar 123456')));
  }
  /* o.required = false: psicologo que ainda nao ativou, na versao recomendada (abre pela Conta ou pelo aviso do inicio) */
  S.mfaSetup = function (o) {
    var required = !(o && o.required === false);
    var otp = otpField(); otp.el.classList.add('otp');
    var holder = h('div', null, h('p', { class: 'muted' }, 'Gerando o código...'));
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Ativar', { type: 'submit' });
    var factorId = null;

    API.mfa.enroll().then(function (d) {
      factorId = d.factorId;
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      holder.appendChild(h('div', { class: 'qr' }, h('img', { src: d.qrUrl, alt: 'Código QR para o aplicativo autenticador', width: '180', height: '180' })));
      holder.appendChild(h('details', { class: 'mt8 mb16' }, h('summary', null, 'Não consigo escanear'),
        h('p', { class: 'small mt8' }, 'No app, escolha digitar chave e informe:'), h('div', { class: 'secret' }, d.secret)));
    }).catch(function (e) { while (holder.firstChild) holder.removeChild(holder.firstChild); holder.appendChild(UI.notice('bad', friendly(e) || unexpected('mfa-enroll', e))); });

    function submit() {
      general.textContent = '';
      var code = otp.value().replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) { otp.setError('Digite os 6 números do app.'); otp.input.focus(); return; }
      if (!factorId) return;
      UI.busy(btn, true);
      API.mfa.verify(factorId, code).then(function () { Diag.log('mfa:ativado'); UI.toast('Verificação em duas etapas ativada.', 'shield-check'); go(required ? '#/inicio' : '#/conta'); })
        .catch(function (e) { UI.busy(btn, false); otp.setError(friendly(e) || 'Não foi possível confirmar.'); otp.input.focus(); });
    }
    otp.input.addEventListener('input', function () { if (otp.value().replace(/\s/g, '').length === 6) submit(); });

    return authPage([
      h('h1', null, 'Verificação em duas etapas'),
      h('p', { class: 'lead' }, required ? 'Obrigatória para proteger os dados dos pacientes. Leva 1 minuto.' : 'Recomendada para proteger os dados dos seus pacientes, mesmo que alguém descubra sua senha. Leva 1 minuto.'),
      demoOtpNotice(otp, submit),
      h('ol', { class: 'steps' },
        h('li', null, 'Abra um app autenticador (Google Authenticator, Authy ou similar).'),
        h('li', null, 'Escaneie o código abaixo.'),
        h('li', null, 'Digite o código de 6 números que o app mostrar.')),
      holder,
      h('form', { novalidate: true, onsubmit: function (ev) { ev.preventDefault(); submit(); } }, otp.el, general, btn),
      required ? h('p', { class: 'auth-foot' }, h('button', { type: 'button', class: 'linkbtn', onclick: function () { API.signOut().then(function () { go('#/entrar'); }); } }, 'Sair e fazer depois')) : null],
      required ? {} : { back: { href: '#/conta', text: 'Conta' } });
  };

  /* ---------------------------------------------------------------- 2 fatores: pedir o codigo no login */
  S.mfaVerify = function () {
    var otp = otpField(); otp.el.classList.add('otp');
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Confirmar', { type: 'submit' });
    var factorId = null;
    API.mfa.status().then(function (s) { factorId = s.factorId; });
    function submit() {
      var code = otp.value().replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) { otp.setError('Digite os 6 números do app.'); otp.input.focus(); return; }
      if (!factorId) return;
      UI.busy(btn, true);
      API.mfa.verify(factorId, code).then(function () { Diag.log('mfa:ok'); go('#/inicio'); })
        .catch(function (e) { UI.busy(btn, false); otp.setError(friendly(e) || 'Não foi possível confirmar.'); otp.input.focus(); });
    }
    otp.input.addEventListener('input', function () { if (otp.value().replace(/\s/g, '').length === 6) submit(); });
    return authPage([statusIcon('shield-check'),
      h('h1', null, 'Código de verificação'),
      h('p', { class: 'lead' }, 'Digite o código do seu app autenticador.'),
      demoOtpNotice(otp, submit),
      h('form', { novalidate: true, onsubmit: function (ev) { ev.preventDefault(); submit(); } }, otp.el, general, btn),
      h('div', { class: 'row-actions' },
        h('p', { class: 'small muted center mb0' }, 'Perdeu o app? ', h('a', { href: '#/suporte' }, 'Falar com o suporte')),
        h('p', { class: 'center mb0' }, h('button', { type: 'button', class: 'linkbtn', onclick: function () { API.signOut().then(function () { go('#/entrar'); }); } }, 'Usar outra conta')))]);
  };

  /* ---------------------------------------------------------------- erro e link vencido */
  S.errorPage = function (msg, retry) {
    return authPage([statusIcon('circle-alert', 'bad'), h('h1', null, 'Algo deu errado'), h('p', { class: 'lead' }, msg),
      retry ? UI.button('Tentar de novo', { onclick: retry }) : null,
      h('div', { class: 'row-actions' },
        h('a', { class: 'btn ghost', href: '#/suporte' }, 'Falar com o suporte'),
        h('p', { class: 'center mb0' }, h('button', { type: 'button', class: 'linkbtn', onclick: function () { API.signOut().then(function () { go('#/entrar'); }); } }, 'Sair')))]);
  };
  S.expiredLink = function () {
    return authPage([statusIcon('clock', 'warn'), h('h1', null, 'Link vencido'), h('p', { class: 'lead' }, 'O link vale por pouco tempo e só funciona uma vez.'),
      h('a', { class: 'btn', href: '#/esqueci-senha' }, 'Pedir um novo link')]);
  };
})();
