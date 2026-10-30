/* Conta: dados da pessoa (ver e editar), trocar e-mail, "senha alterada" e o aviso de boas-vindas depois de confirmar o e-mail. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }
  function refresh() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

  function row(label, value) { return value ? h('div', { class: 'item' }, h('span', { class: 't' }, label), h('span', { class: 'v' }, value)) : null; }
  function actionRow(icon, title, sub, onclick) {
    return h('button', { type: 'button', class: 'item', onclick: onclick }, h('span', { class: 'ico-box' }, UI.svg(icon, 20)),
      h('span', null, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
  }

  /* ---------------------------------------------------------------- dados da pessoa */
  S.profileGroup = function (ctx) {
    var p = ctx.me.profile, pro = ctx.me.professional, isPat = p.role === 'patient';
    var age = isPat && p.birth_date ? UI.ageFrom(p.birth_date) : null;
    var minor = age !== null && age < 18;
    var auth = ctx.auth || { hasPassword: true };
    return h('div', { class: 'group' },
      row('Nome', p.full_name), row('E-mail', p.email), row('Celular', p.phone),
      isPat ? row('Nascimento', p.birth_date ? UI.fmtDate(p.birth_date) + (age !== null ? ' (' + age + ' anos)' : '') : '') : null,
      minor ? row('Responsável', [p.guardian_name, p.guardian_phone].filter(Boolean).join(', ')) : null,
      ctx.admin ? row('Perfil', S.roleLabel(ctx)) : null, /* so a equipe precisa ver em que modo esta */
      pro ? h('div', { class: 'item' }, h('span', { class: 't' }, 'CRP'), h('span', { class: 'v' }, pro.crp_region + '/' + pro.crp_number + ' ',
        pro.verification === 'verified' ? h('span', { class: 'badge ok' }, 'CRP verificado') : h('span', { class: 'badge warn' }, 'Em análise'))) : null,
      actionRow('square-pen', 'Editar meus dados', null, function () { S.editProfile(ctx); }),
      pro && pro.verification === 'verified' && S.proSettingsSheet ? actionRow('file-text', 'Dados profissionais e recibos', null, function () { S.proSettingsSheet(ctx); }) : null,
      auth.hasPassword ? actionRow('mail', 'Trocar e-mail', null, function () { S.changeEmail(ctx); }) : null);
  };

  /* ---------------------------------------------------------------- editar dados */
  S.editProfile = function (ctx) {
    var p = ctx.me.profile, isPat = p.role === 'patient', today = UI.today();
    var name = UI.field({ label: 'Nome completo', autocomplete: 'name', required: true, autocapitalize: 'words', maxlength: 120, value: p.full_name });
    var phone = UI.phoneField({ label: 'Celular com DDD', optional: !isPat, value: p.phone || '' });
    var birth = isPat ? UI.field({ label: 'Data de nascimento', type: 'date', autocomplete: 'bday', required: true, max: today, min: '1900-01-01', value: p.birth_date || '' }) : null;
    var gName = isPat ? UI.field({ label: 'Nome do responsável', autocapitalize: 'words', maxlength: 120, value: p.guardian_name || '' }) : null;
    var gPhone = isPat ? UI.phoneField({ label: 'Celular do responsável', value: p.guardian_phone || '' }) : null;
    var minorBox = isPat ? h('div', { class: 'hide' }, UI.notice('info', 'Para menores de 18 anos, o contato de um responsável é necessário.'), gName.el, gPhone.el) : null;
    function isMinor() { if (!isPat) return false; var a = UI.ageFrom(birth.value()); return a !== null && a >= 0 && a < 18; }
    function checkAge() { if (minorBox) minorBox.classList.toggle('hide', !isMinor()); }
    if (isPat) { birth.input.addEventListener('input', checkAge); birth.input.addEventListener('change', checkAge); checkAge(); }
    var general = h('div', { 'aria-live': 'polite' });
    var save = UI.button('Salvar', { type: 'submit' });
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      var bads = [];
      function bad(f, m) { f.setError(m); bads.push(f.input); }
      var nm = name.value().trim();
      if (nm.length < 3 || nm.split(/\s+/).length < 2) bad(name, 'Digite nome e sobrenome.');
      if (isPat ? !UI.phoneOk(phone.value()) : (phone.value().trim() && !UI.phoneOk(phone.value()))) bad(phone, 'Digite o celular com DDD.');
      var d = { fullName: nm, phone: phone.value().trim() };
      if (isPat) {
        var a = UI.ageFrom(birth.value());
        if (a === null || a < 0 || a > 120) bad(birth, 'Informe a data de nascimento.'); else d.birthDate = birth.value();
        if (isMinor()) {
          if (gName.value().trim().length < 2) bad(gName, 'Digite o nome do responsável.');
          if (!UI.phoneOk(gPhone.value())) bad(gPhone, 'Digite o celular do responsável.');
          d.guardianName = gName.value().trim(); d.guardianPhone = gPhone.value().trim();
        } else { d.guardianName = ''; d.guardianPhone = ''; }
      }
      if (S.focusFirst(bads)) return;
      UI.busy(save, true);
      API.updateProfile(d).then(function () { sh.close('saved'); UI.toast('Dados atualizados.', 'circle-check'); refresh(); })
        .catch(function (e) { UI.busy(save, false); Diag.error('editar-dados', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível salvar agora. Tente de novo.'))); });
    } }, name.el, phone.el, isPat ? birth.el : null, minorBox, general, save);
    sh = UI.sheet({ title: 'Meus dados', content: form });
    return sh;
  };

  /* ---------------------------------------------------------------- trocar e-mail */
  S.changeEmail = function (ctx) {
    var email = UI.field({ label: 'Novo e-mail', type: 'email', autocomplete: 'email', inputmode: 'email', required: true });
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Enviar link', { type: 'submit' });
    var body = h('div');
    var sh;
    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      var v = email.value().trim().toLowerCase();
      if (!UI.emailValid(v)) { email.setError('Digite um e-mail válido.'); email.input.focus(); return; }
      if (v === String(ctx.me.profile.email || '').toLowerCase()) { email.setError('Esse já é o seu e-mail.'); email.input.focus(); return; }
      UI.busy(btn, true);
      API.updateEmail(v).then(function () {
        UI.clear(body);
        body.appendChild(UI.notice('ok', h('span', null, h('b', null, 'Quase lá. '), 'Enviamos um link para ', h('b', null, v), '. O e-mail só muda depois que você clicar nele. Veja também o spam.')));
        body.appendChild(UI.button('Fechar', { onclick: function () { sh.close('done'); refresh(); } }));
      }).catch(function (e) {
        UI.busy(btn, false);
        var m = String((e && e.message) || '') + ' ' + String((e && e.code) || '');
        if (/already|registered|email_exists/i.test(m)) email.setError('Esse e-mail já está em uso.');
        else if (/rate|too many|429/i.test(m)) general.appendChild(UI.notice('bad', 'Muitas tentativas. Espere alguns minutos.'));
        else { Diag.error('trocar-email', e); general.appendChild(UI.notice('bad', 'Não foi possível trocar agora. Tente de novo.')); }
      });
    } }, h('p', { class: 'muted' }, 'Seu e-mail de agora é ', h('b', null, ctx.me.profile.email), '.'), email.el, general, btn);
    body.appendChild(form);
    sh = UI.sheet({ title: 'Trocar e-mail', content: body });
    return sh;
  };

  /* ---------------------------------------------------------------- senha alterada (#/senha-alterada) */
  S.passwordDone = function () {
    var others = UI.button('Sair dos outros aparelhos', { variant: 'ghost', onclick: function () {
      UI.busy(others, true);
      API.signOutOthers().then(function () { UI.busy(others, false); UI.toast('Outros aparelhos desconectados.', 'circle-check'); others.disabled = true; })
        .catch(function () { UI.busy(others, false); UI.toast('Não deu para desconectar agora.'); });
    } });
    return S.authPage([S.statusIcon('circle-check'), h('h1', null, 'Senha alterada'),
      h('p', { class: 'lead' }, 'Pronto, sua senha nova já vale. Se você não reconhece essa troca, fale com o suporte agora.'),
      h('a', { class: 'btn', href: '#/inicio' }, 'Continuar'),
      h('div', { class: 'row-actions' }, others, h('p', { class: 'small muted center mb0' }, 'Quem estiver usando sua conta em outro aparelho fica de fora.'))]);
  };

  /* ---------------------------------------------------------------- boas-vindas (e-mail confirmado) e e-mail novo */
  function seenKey(id) { return 'psi_welcome_' + id; }
  function lastEmailKey(id) { return 'psi_email_' + id; }
  S.welcomeCard = function (ctx) {
    var a = ctx.auth || {}, id = ctx.me.profile.id, notes = [];
    var email = String(ctx.me.profile.email || a.email || '').toLowerCase();
    try {
      var before = localStorage.getItem(lastEmailKey(id));
      if (before && email && before !== email) notes.push(['mail-check', 'E-mail alterado', 'Seu e-mail agora é ' + email + '.']);
      if (email) localStorage.setItem(lastEmailKey(id), email);
      var fresh = a.confirmedAt && Date.now() - Date.parse(a.confirmedAt) < 30 * 60000;
      if (fresh && !localStorage.getItem(seenKey(id))) {
        notes.push(['circle-check', 'E-mail confirmado', ctx.me.profile.role === 'professional' ? 'Sua conta está pronta. Conferimos seu CRP em até 1 dia útil.' : 'Sua conta está pronta. Que bom ter você aqui.']);
        localStorage.setItem(seenKey(id), '1');
      }
    } catch (e) { /* sem armazenamento: sem aviso */ }
    if (!notes.length) return null;
    var box = h('div', { class: 'welcome', role: 'status' }, notes.map(function (n) {
      return h('div', { class: 'cta-card welcome-card' }, h('span', { class: 'ico-box' }, UI.svg(n[0], 22)), h('div', { class: 'grow' }, h('div', { class: 't' }, n[1]), h('div', { class: 's' }, n[2])),
        h('button', { type: 'button', class: 'linkbtn small', onclick: function (ev) { var c = ev.currentTarget.closest('.welcome-card'); if (c && c.parentNode) c.parentNode.removeChild(c); } }, 'Ok'));
    }));
    return box;
  };
})();
