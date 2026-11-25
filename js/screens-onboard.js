/* Convite do psicólogo e cadastro do paciente: link único, página do convite, formulário simples (nome, celular, nascimento,
   responsável para menores de 18 anos) e o cartão do link na tela do psicólogo. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }

  /* ---------------------------------------------------------------- convite guardado no aparelho (vale 3 dias) */
  var KEY = 'psi_invite', TTL = 3 * 86400000;
  var Invite = S.invite = {
    get: function () {
      try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v.c === 'string' && Date.now() - v.t < TTL) return v.c; } catch (e) { /* sem armazenamento */ }
      return null;
    },
    set: function (c) { try { localStorage.setItem(KEY, JSON.stringify({ c: c, t: Date.now() })); } catch (e) { /* ignore */ } },
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
    /* Aceita o link inteiro ou só o código. */
    parse: function (text) {
      var s = String(text || '').trim();
      var m = /[?&]c=([A-Za-z0-9]{6,20})/.exec(s) || /^([A-Za-z0-9]{6,20})$/.exec(s);
      return m ? m[1].toLowerCase() : null;
    },
    url: function (code) {
      var base = /^https?:$/.test(location.protocol) ? location.origin + location.pathname : ((window.PSI_CONFIG || {}).portalUrl || '');
      return base + '#/convite?c=' + code;
    }
  };

  function crpText(info) { return info.crp_region && info.crp_number ? 'CRP ' + info.crp_region + '/' + info.crp_number : ''; }
  function proBadge(info) {
    return info.verified ? h('span', { class: 'badge ok' }, UI.svg('badge-check', 14), 'CRP verificado') : h('span', { class: 'badge warn' }, 'CRP em análise');
  }
  function proLine(info) {
    return h('div', { class: 'invite-who' }, UI.avatar(info.name, { size: 'lg' }),
      h('div', { class: 'grow' }, h('b', null, info.name), h('div', { class: 'muted small' }, crpText(info)), h('div', { class: 'mt8' }, proBadge(info))));
  }

  /* O que a pessoa precisa saber antes de aceitar (mesmo texto no convite e no cadastro). */
  var WHAT_HAPPENS = [
    ['link', 'Você já fica vinculado(a) a ele(a), sem precisar de aprovação.'],
    ['user', 'Ele(a) vê seu nome, celular e data de nascimento.'],
    ['smile', 'Ele(a) acompanha o seu humor, a energia e a ansiedade que você registrar.'],
    ['lock', 'O texto do diário é só seu. Só vai para ele(a) se você escolher compartilhar.'],
    ['calendar-plus', 'Você já pode marcar consulta pelo Senso.']
  ];
  function whatList() { return h('ul', { class: 'plain-list what-list' }, WHAT_HAPPENS.map(function (w) { return h('li', null, UI.svg(w[0], 18), w[1]); })); }

  /* ---------------------------------------------------------------- página do convite (#/convite?c=CODIGO) */
  S.inviteLanding = function (ctx, q) {
    var code = Invite.parse(q && q.c);
    var box = h('div', null, UI.loading());
    var role = ctx ? ctx.me.profile.role : null;

    function bad(text) {
      Invite.clear();
      UI.clear(box);
      box.appendChild(S.statusIcon('ban', 'warn'));
      box.appendChild(h('h1', null, 'Convite não encontrado'));
      box.appendChild(h('p', { class: 'lead' }, text || 'Esse link não existe, foi trocado ou está desativado. Peça um link novo ao seu psicólogo(a).'));
      box.appendChild(ctx ? h('a', { class: 'btn', href: '#/inicio' }, 'Ir para o início') : h('a', { class: 'btn', href: '#/entrar' }, 'Ir para o login'));
    }

    /* Paciente logado que ja tem vinculo: com esse psicologo (same) ou com outro (other). */
    function alreadyLinked(info, same) {
      Invite.clear();
      UI.clear(box);
      box.appendChild(S.statusIcon(same ? 'circle-check' : 'info', same ? 'ok' : 'warn'));
      box.appendChild(h('h1', null, same ? 'Você já é paciente de ' + info.name : 'Você já possui vínculo com um profissional'));
      box.appendChild(h('p', { class: 'lead' }, same ? 'Esse vínculo já está ativo. Não precisa fazer nada.'
        : 'Sua conta já está ligada a outro psicólogo(a). Para mudar, fale com quem acompanha você hoje: ele(a) pode encaminhar você.'));
      box.appendChild(h('div', { class: 'stack mt24' }, h('a', { class: 'btn', href: same ? '#/psicologo' : '#/inicio' }, same ? 'Ver meu psicólogo(a)' : 'Ir para o início')));
    }

    function good(info) {
      if (ctx && role === 'patient' && (info.mine === 'same' || info.mine === 'other')) { alreadyLinked(info, info.mine === 'same'); return; }
      Invite.set(code);
      UI.clear(box);
      box.appendChild(h('h1', null, 'Você foi convidado(a)'));
      box.appendChild(proLine(info));
      box.appendChild(h('p', { class: 'lead mt16' }, info.name + ' usa o Senso para cuidar de você entre as sessões.'));
      box.appendChild(h('div', { class: 'group-title' }, 'O que acontece ao entrar'));
      box.appendChild(whatList());
      if (!ctx) {
        box.appendChild(h('div', { class: 'stack mt24' }, h('a', { class: 'btn', href: '#/criar-conta/paciente' }, 'Criar minha conta'),
          h('a', { class: 'btn ghost', href: '#/entrar' }, 'Já tenho conta')));
        return;
      }
      if (role !== 'patient') {
        box.appendChild(UI.notice('info', 'Esse link é para pacientes. Para você, ele não faz nada.'));
        box.appendChild(h('a', { class: 'btn ghost', href: '#/inicio' }, 'Voltar'));
        return;
      }
      var accept = UI.checkbox({ label: 'Entendi e quero ser paciente de ' + info.name + ' no Senso.' });
      var general = h('div', { 'aria-live': 'polite' });
      var btn = UI.button('Vincular', { onclick: function () {
        general.textContent = '';
        if (!accept.checked()) { accept.setError('Marque para continuar.'); accept.input.focus(); return; }
        UI.busy(btn, true);
        API.invite.use(code, true).then(function (r) {
          if (r && r.ok) {
            Invite.clear();
            UI.toast('Pronto! Você está vinculado(a) a ' + (r.name || info.name) + '.', 'circle-check');
            go('#/psicologo'); return;
          }
          UI.busy(btn, false);
          var e = r && r.error;
          if (e === 'already_linked') { alreadyLinked(info, true); return; }
          if (e === 'linked_elsewhere') { alreadyLinked(info, false); return; }
          if (e === 'invalid_code') return bad();
          general.appendChild(UI.notice('bad', e === 'consent_required' ? 'Falta a sua autorização dos dados de saúde. Fale com o suporte.' : 'Não foi possível vincular agora. Tente de novo.'));
        }).catch(function (e) { UI.busy(btn, false); Diag.error('convite', e); general.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível vincular agora. Tente de novo.'))); });
      } });
      box.appendChild(h('div', { class: 'mt24' }, accept.el, general, btn));
    }

    if (!code) bad();
    else API.invite.info(code).then(function (info) { if (info && info.ok) good(info); else bad(); }).catch(function (e) { Diag.error('convite-info', e); bad('Não foi possível abrir o convite agora. Tente de novo em instantes.'); });
    return S.authPage([box]);
  };

  /* Cartão do início do paciente: tem convite guardado e ainda não aceitou. */
  S.pendingInvite = function (alreadyLinkedIds) {
    var code = Invite.get();
    if (!code) return null;
    var holder = h('div');
    API.invite.info(code).then(function (info) {
      if (!info || !info.ok || (info.mine && info.mine !== 'none')) { Invite.clear(); return; }
      holder.appendChild(S.pendingStrip('link', 'Convite de ' + info.name + ': vincular sua conta', '#/convite?c=' + code, 'Ver convite'));
    }).catch(function () { /* sem o cartão, sem problema */ });
    return holder;
  };

  /* ---------------------------------------------------------------- formulário do paciente (cadastro e "completar cadastro")
     Devolve { parts: { identity, invite, consent }, collect() -> { data, bads } }.
     o.nameField: reaproveita o campo de nome da tela (completar cadastro). */
  S.patientForm = function (o) {
    o = o || {};
    var today = UI.today();
    var name = o.nameField || UI.field({ label: 'Nome completo', autocomplete: 'name', required: true, autocapitalize: 'words', maxlength: 120 });
    var phone = UI.phoneField({ label: 'Celular (WhatsApp) com DDD', required: true, hint: 'Por ele chegam os lembretes das consultas e você marca, remarca ou cancela pelo WhatsApp.' });
    var birth = UI.field({ label: 'Data de nascimento', type: 'date', autocomplete: 'bday', required: true, max: today, min: '1900-01-01', hint: 'Para lembrarmos do seu aniversário.' });
    var gName = UI.field({ label: 'Nome do responsável', autocapitalize: 'words', maxlength: 120 });
    var gPhone = UI.phoneField({ label: 'Celular (WhatsApp) do responsável', required: true, hint: 'Os lembretes das consultas vão para este número.' });
    var minorBox = h('div', { class: 'hide minor-box' },
      UI.notice('info', h('span', null, h('b', null, 'Você tem menos de 18 anos. '), 'Pode criar a conta, mas precisamos do contato de um responsável. O(a) psicólogo(a) poderá pedir a autorização dele(a) antes de atender.')),
      gName.el, gPhone.el);
    function isMinor() { var a = UI.ageFrom(birth.value()); return a !== null && a >= 0 && a < 18; }
    function checkAge() { minorBox.classList.toggle('hide', !isMinor()); }
    birth.input.addEventListener('input', checkAge); birth.input.addEventListener('change', checkAge);

    /* convite (obrigatorio: paciente so cria conta pelo link do psicologo, que ja vincula) */
    var st = { code: null, info: null, accept: null, failed: false };
    var invBox = h('div', { 'aria-live': 'polite', tabindex: '-1' });
    function drawInvite() {
      UI.clear(invBox);
      if (st.info) {
        st.accept = UI.checkbox({ label: 'Entendi e quero ser paciente de ' + st.info.name + ' no Senso.' });
        invBox.appendChild(h('div', { class: 'invite-card' }, h('div', { class: 'lbl' }, 'Convite de'), proLine(st.info), whatList(), st.accept.el));
        return;
      }
      st.accept = null;
      invBox.appendChild(st.failed ? UI.notice('bad', 'Esse link não vale mais. Peça um link novo ao seu psicólogo(a).') : UI.loading());
    }
    function lookup(code) {
      if (!code) { st.failed = true; drawInvite(); return Promise.resolve(); }
      return API.invite.info(code).then(function (info) {
        if (info && info.ok) { st.code = code; st.info = info; Invite.set(code); }
        else { st.failed = true; Invite.clear(); }
        drawInvite();
      }).catch(function () { st.failed = true; drawInvite(); });
    }
    drawInvite();
    lookup(o.code);

    var terms = UI.checkbox({ label: h('span', null, 'Aceito os ', h('a', { href: '#/legal/termos-paciente', target: '_blank', rel: 'noopener' }, 'Termos de Uso'), ' e a ', h('a', { href: '#/legal/privacidade', target: '_blank', rel: 'noopener' }, 'Política de Privacidade'), '.') });
    var health = UI.checkbox({ label: 'Autorizo o uso dos meus dados de saúde no portal.' });
    var consentBox = h('div', { class: 'consent-box' }, h('details', null, h('summary', null, 'Sobre seus dados de saúde'),
      h('p', null, 'Guardamos a agenda das suas sessões, seus pagamentos e, se você usar, seu diário. Isso indica que você faz acompanhamento psicológico, por isso são dados de saúde.'),
      h('p', null, 'Usamos só para o portal funcionar. Não vendemos nem fazemos anúncios. Você pode baixar uma cópia ou apagar a conta quando quiser.')));

    function collect() {
      var bads = [];
      function bad(f, m) { f.setError(m); bads.push(f.input); }
      var nm = name.value().trim();
      if (nm.length < 3 || nm.split(/\s+/).length < 2) bad(name, 'Digite nome e sobrenome.');
      if (!UI.phoneOk(phone.value())) bad(phone, 'Digite o celular com DDD.');
      var a = UI.ageFrom(birth.value());
      if (a === null || a < 0 || a > 120) bad(birth, 'Informe a data de nascimento.');
      var minor = isMinor();
      checkAge();
      if (minor) {
        if (gName.value().trim().length < 2) bad(gName, 'Digite o nome do responsável.');
        if (!UI.phoneOk(gPhone.value())) bad(gPhone, 'Digite o celular do responsável.');
      }
      if (!st.info) { bads.push(invBox); }
      else if (st.accept && !st.accept.checked()) { st.accept.setError('Marque para continuar.'); bads.push(st.accept.input); }
      if (!terms.checked()) { terms.setError('Aceite os Termos e a Política para continuar.'); bads.push(terms.input); }
      if (!health.checked()) { health.setError('Sem essa autorização não dá para criar a conta.'); bads.push(health.input); }
      var data = { fullName: nm, phone: phone.value().trim(), birthDate: birth.value() };
      if (minor) { data.guardianName = gName.value().trim(); data.guardianPhone = gPhone.value().trim(); }
      if (st.info && st.code) { data.inviteCode = st.code; data.acceptLink = !!(st.accept && st.accept.checked()); }
      return { data: data, bads: bads };
    }

    return {
      parts: { identity: (o.nameField ? [] : [name.el]).concat([phone.el, birth.el, minorBox]), invite: invBox, consent: [terms.el, health.el, consentBox, S.waNotice()] },
      collect: collect
    };
  };

  /* Foca o primeiro campo com erro na ordem da tela. */
  /* Aviso do WhatsApp ligado por padrao (desde 25/11/2026): quem cria a conta fica sabendo antes, e sabe que pode desligar. */
  S.waNotice = function (role) {
    return h('p', { class: 'small muted wa-notice' }, UI.svg('message-circle', 14), ' ', role === 'professional'
      ? 'O lembrete automático das consultas pelo WhatsApp do Senso já vem ligado para os seus pacientes. Você pode desligar quando quiser em Atendimento.'
      : 'Ao criar a conta, você passa a receber pelo WhatsApp do Senso os lembretes das suas consultas, e pode marcar, remarcar ou cancelar por lá. Para não receber mais, desligue em Conta ou responda SAIR.');
  };

  S.focusFirst = function (list) {
    var items = list.filter(Boolean);
    if (!items.length) return false;
    items.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
    try { items[0].focus(); } catch (e) { /* ignore */ }
    return true;
  };

  /* ---------------------------------------------------------------- cartão do link (tela do psicólogo) */
  S.inviteCard = function () {
    var holder = h('section', { class: 'card invite-link', 'aria-label': 'Link de cadastro' }, UI.loading());
    function draw(st) {
      UI.clear(holder);
      var url = Invite.url(st.code);
      var msg = 'Oi! Aqui está o meu link para você criar sua conta no Senso e ficar ligado(a) a mim: ' + url;
      var copy = UI.button('Copiar link', { icon: 'copy', onclick: function () {
        UI.copyText(url).then(function () { UI.toast('Link copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar. Selecione o link e copie.'); });
      } });
      var wa = h('a', { class: 'btn ghost', href: 'https://wa.me/?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), 'Enviar pelo WhatsApp');
      var on = UI.toggle({ value: st.enabled, label: 'Link ativo', onChange: function (v) {
        return API.invite.setEnabled(v).then(function (r) { draw(r); UI.toast(v ? 'Link ativado.' : 'Link desativado.', 'circle-check'); }).catch(function (e) { UI.toast(UI.errorText(e)); throw e; });
      } });
      var regen = UI.button('Gerar outro link', { variant: 'ghost', onclick: function () {
        UI.confirmBox({ title: 'Gerar outro link?', text: 'O link de agora para de funcionar na hora. Quem já se vinculou continua vinculado(a). Você precisará mandar o novo link.', ok: 'Gerar outro' }).then(function (yes) {
          if (!yes) return;
          return API.invite.regenerate().then(function (r) { draw(r); UI.toast('Novo link criado.', 'circle-check'); });
        }).catch(function (e) { UI.toast(UI.errorText(e)); });
      } });
      holder.appendChild(h('div', { class: 'row' }, h('span', { class: 'ico-box' }, UI.svg('link', 22)),
        h('div', { class: 'grow' }, h('h2', { class: 'mb0' }, 'Seu link de cadastro'), h('p', { class: 'muted small mb0' }, 'Quem entrar por ele faz um pedido e você aceita.'))));
      holder.appendChild(h('div', { class: 'linkbox mt16', tabindex: '0', role: 'textbox', 'aria-readonly': 'true', 'aria-label': 'Seu link de cadastro' }, url));
      if (!st.enabled) holder.appendChild(UI.notice('warn', 'O link está desativado. Quem abrir não consegue fazer o pedido.'));
      holder.appendChild(h('div', { class: 'btn-row mt16' }, copy, wa));
      if (st.pending) holder.appendChild(S.pendingStrip('user-plus', st.pending === 1 ? '1 pedido de vínculo esperando você' : st.pending + ' pedidos de vínculo esperando você', '#/pacientes', 'Responder'));
      holder.appendChild(h('details', { class: 'invite-more mt16' }, h('summary', null, 'Mais opções'),
        h('div', { class: 'item flat' }, h('span', null, h('span', { class: 't' }, 'Link ativo'), h('span', { class: 's' }, 'Desligue para não receber novos pedidos.')), on.el), regen));
    }
    API.invite.mine().then(draw).catch(function (e) {
      Diag.error('link-convite', e); UI.clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar o seu link agora.'));
    });
    return holder;
  };

  /* Versão de uma linha (Início do psicólogo que já tem pacientes): o link com Copiar. As outras opções ficam em Conta, WhatsApp, link e avisos. */
  S.inviteMini = function () {
    var holder = h('section', { class: 'card invite-mini', 'aria-label': 'Link de cadastro' }, UI.loading());
    API.invite.mine().then(function (st) {
      UI.clear(holder);
      var url = Invite.url(st.code);
      var copy = UI.button('Copiar', { icon: 'copy', variant: 'ghost', onclick: function () {
        UI.copyText(url).then(function () { UI.toast('Link copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar. Abra Conta, WhatsApp, link e avisos.'); });
      } });
      copy.classList.add('auto', 'sm');
      holder.appendChild(h('div', { class: 'row' }, h('span', { class: 'ico-box' }, UI.svg('link', 20)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, 'Seu link de cadastro'), h('div', { class: 's' }, st.enabled ? 'Mande para novos pacientes.' : 'Desativado. Ative em Conta, WhatsApp, link e avisos.')),
        st.enabled ? copy : null));
    }).catch(function (e) {
      Diag.error('link-convite', e); UI.clear(holder); holder.appendChild(UI.notice('bad', 'Não foi possível carregar o seu link agora. Veja em Conta, WhatsApp, link e avisos.'));
    });
    return holder;
  };
})();
