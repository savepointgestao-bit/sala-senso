/* Equipe: fila de verificacao de CRP e chamados de suporte. So aparece para contas de admin com dois fatores;
   o banco confere de novo a cada pedido (funcoes admin_*), entao esconder o menu nao e a protecao, so a conveniencia. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  var PRO_FILTER = [['pending', 'Pendentes'], ['verified', 'Verificados'], ['suspended', 'Suspensos'], ['rejected', 'Recusados']];
  var TICKET_FILTER = [['open', 'Abertos'], ['answered', 'Respondidos'], ['closed', 'Fechados']];
  var CATEGORY = { duvida: 'Dúvida', erro: 'Algo não funciona', sugestao: 'Sugestão', conta: 'Conta e acesso', pagamento: 'Pagamentos', privacidade: 'Privacidade e dados' };

  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : UI.fmtDate(UI.ymd(d)); }

  function errText(e) {
    var m = String((e && e.message) || '') + ' ' + String((e && e.code) || '');
    if (/recent_login_required/.test(m)) return 'Confirme sua identidade de novo e tente outra vez.';
    if (/not_allowed/.test(m)) return 'Sem permissão. Confira se o segundo fator está ativo.';
    if (/not_found/.test(m)) return 'Este item não existe mais. Atualize a lista.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return 'Não foi possível concluir agora. Tente de novo.';
  }

  /* Janela com um campo de anotacao obrigatorio. Devolve Promise<string|null> (null = cancelou). */
  function noteDialog(o) {
    return new Promise(function (resolve) {
      var prev = document.activeElement, done = false, ov;
      function finish(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey);
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
        resolve(v);
      }
      function onKey(ev) { if (ev.key === 'Escape') finish(null); }
      var note = UI.field({ label: o.label, type: 'textarea', rows: 3, maxlength: 500, hint: o.hint });
      var ok = UI.button(o.confirm, { type: 'submit', variant: o.danger ? 'danger' : null });
      var cancel = UI.button('Cancelar', { variant: 'ghost', onclick: function () { finish(null); } });
      var form = h('form', { novalidate: true, onsubmit: function (ev) {
        ev.preventDefault();
        var v = note.value().trim();
        if (v.length < 5) { note.setError('Escreva em poucas palavras (mínimo 5 letras).'); note.input.focus(); return; }
        finish(v);
      } }, h('h2', { id: 'nd-t' }, o.title), h('p', null, o.text), note.el, h('div', { class: 'dialog-actions' }, ok, cancel));
      ov = h('div', { class: 'overlay' }, h('div', { class: 'dialog form', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'nd-t' }, form));
      document.body.appendChild(ov);
      document.addEventListener('keydown', onKey);
      note.input.focus();
    });
  }

  /* Verificar libera acesso a dados de pacientes: o banco exige login recente; aqui pedimos senha e codigo antes. */
  function ensureFresh() {
    return API.authFresh(10).then(function (fresh) {
      if (fresh) return true;
      return S.confirmIdentity({ needsCode: true, back: 'equipe', title: 'Confirme que é você', text: 'Verificar um CRP libera o acesso a dados de pacientes.', confirmLabel: 'Confirmar' });
    });
  }

  var DECISION = {
    verified: { title: 'Verificar CRP', confirm: 'Verificar', hint: 'Fica registrado com seu nome e a data.', label: 'Como você conferiu?', toast: 'CRP verificado',
      text: function (p) { return p.full_name + ', CRP ' + p.crp_region + '/' + p.crp_number + '.'; } },
    rejected: { title: 'Recusar cadastro', confirm: 'Recusar', danger: true, hint: 'Fica registrado. A pessoa não acessa dados de pacientes.', label: 'Motivo', toast: 'Cadastro recusado',
      text: function (p) { return p.full_name + ' não terá acesso a pacientes.'; } },
    suspended: { title: 'Suspender acesso', confirm: 'Suspender', danger: true, hint: 'Corta o acesso agora. Fica registrado.', label: 'Motivo', toast: 'Acesso suspenso',
      text: function (p) { return p.full_name + ' perde o acesso aos pacientes imediatamente.'; } }
  };

  function decide(p, status, refresh) {
    var d = DECISION[status];
    return noteDialog({ title: d.title, text: d.text(p), label: d.label, hint: d.hint, confirm: d.confirm, danger: d.danger }).then(function (note) {
      if (note === null) return;
      return (status === 'verified' ? ensureFresh() : Promise.resolve(true)).then(function (ok) {
        if (!ok) return;
        return API.admin.setVerification(p.id, status, note).then(function () { UI.toast(d.toast, 'circle-check'); refresh(); });
      });
    }).catch(function (e) { Diag.error('equipe', e); UI.toast(errText(e), 'circle-alert'); });
  }

  function actionBtn(label, o) {
    var b = UI.button(label, { variant: o.variant, onclick: function () { b.disabled = true; Promise.resolve(o.run()).then(function () { b.disabled = false; }, function () { b.disabled = false; }); } });
    b.classList.add('sm', 'auto');
    return b;
  }

  function proCard(p, refresh) {
    var acts = [];
    if (p.verification === 'pending') {
      acts.push(actionBtn('Verificar', { run: function () { return decide(p, 'verified', refresh); } }));
      acts.push(actionBtn('Recusar', { variant: 'ghost', run: function () { return decide(p, 'rejected', refresh); } }));
    } else if (p.verification === 'verified') {
      acts.push(actionBtn('Suspender', { variant: 'ghost', run: function () { return decide(p, 'suspended', refresh); } }));
    } else {
      acts.push(actionBtn('Verificar de novo', { variant: 'ghost', run: function () { return decide(p, 'verified', refresh); } }));
    }
    return h('div', { class: 'card person' },
      h('div', { class: 'head' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, UI.initials(p.full_name)),
        h('div', { class: 'who' }, h('b', null, p.full_name), h('span', null, 'CRP ' + p.crp_region + '/' + p.crp_number))),
      h('div', { class: 'meta' }, h('span', null, p.email), h('span', null, 'Cadastro em ' + day(p.created_at) + (p.verified_at ? '. Verificado em ' + day(p.verified_at) : ''))),
      p.verification_note ? h('p', { class: 'note' }, h('b', null, 'Anotação: '), p.verification_note) : null,
      h('div', { class: 'actions' }, acts));
  }

  function ticketCard(t, refresh) {
    function setStatus(status, msg) {
      return API.admin.setTicketStatus(t.id, status).then(function () { UI.toast(msg, 'circle-check'); refresh(); })
        .catch(function (e) { Diag.error('equipe', e); UI.toast(errText(e), 'circle-alert'); });
    }
    var acts = [];
    if (UI.emailValid(t.user_email)) {
      acts.push(h('a', { class: 'btn sm auto', href: 'mailto:' + t.user_email + '?subject=' + encodeURIComponent('Re: ' + t.subject), rel: 'noopener' }, UI.svg('mail', 18), 'Responder por e-mail'));
    }
    if (t.status === 'open') acts.push(actionBtn('Marcar respondido', { variant: 'ghost', run: function () { return setStatus('answered', 'Marcado como respondido'); } }));
    if (t.status !== 'closed') acts.push(actionBtn('Fechar', { variant: 'ghost', run: function () { return setStatus('closed', 'Chamado fechado'); } }));
    else acts.push(actionBtn('Reabrir', { variant: 'ghost', run: function () { return setStatus('open', 'Chamado reaberto'); } }));
    var tech = null;
    if (t.diagnostics) {
      tech = h('details', { class: 'faq' }, h('summary', null, 'Informações técnicas'),
        h('div', { class: 'body' }, h('pre', { class: 'preview' }, JSON.stringify(t.diagnostics, null, 2)),
          h('p', { class: 'small muted' }, [t.app_version ? 'Versão ' + t.app_version : '', t.platform || ''].filter(Boolean).join('. '))));
    }
    return h('div', { class: 'card person' },
      h('div', { class: 'head' }, h('div', { class: 'who' }, h('b', null, t.subject), h('span', null, CATEGORY[t.category] || t.category)),
        h('span', { class: 'tag' }, day(t.created_at))),
      h('div', { class: 'meta' }, h('span', null, t.user_name), h('span', null, t.user_email)),
      h('p', { class: 'msg' }, t.message),
      tech,
      h('div', { class: 'actions' }, acts));
  }

  S.team = function (ctx) {
    var tab = 'pro', filters = { pro: 'pending', tix: 'open' };
    var holder = h('div', { 'aria-live': 'polite' });
    var filterHolder = h('div', { class: 'filter' });
    var seq = 0;

    function empty(text) { return h('div', { class: 'empty' }, h('span', { class: 'ico-box' }, UI.svg('check', 28)), h('h2', null, 'Nada por aqui'), h('p', null, text)); }

    function load() {
      var my = ++seq;
      clear(holder); holder.appendChild(h('p', { class: 'muted' }, 'Carregando...'));
      if (tab === 'seg') { securityPanel(my); return; }
      var isPro = tab === 'pro';
      (isPro ? API.admin.professionals(filters.pro) : API.admin.tickets(filters.tix)).then(function (rows) {
        if (my !== seq) return;
        clear(holder);
        if (!rows.length) {
          holder.appendChild(empty(isPro ? (filters.pro === 'pending' ? 'Nenhum cadastro esperando conferência.' : 'Nenhum psicólogo nesta situação.') : (filters.tix === 'open' ? 'Nenhum chamado aberto.' : 'Nenhum chamado nesta situação.')));
          return;
        }
        rows.forEach(function (r) { holder.appendChild(isPro ? proCard(r, load) : ticketCard(r, load)); });
      }).catch(function (e) {
        if (my !== seq) return;
        Diag.error('equipe', e);
        clear(holder); holder.appendChild(UI.notice('bad', errText(e)));
      });
    }

    /* Verificacao em duas etapas dos psicologos: quantos usam e a chave que torna obrigatorio. So numeros, sem nomes. */
    function securityPanel(my) {
      API.admin.mfaAdoption().then(function (a) {
        if (my !== seq) return;
        clear(holder);
        var pct = a.professionals ? Math.round(a.with_mfa * 100 / a.professionals) : 0;
        var status = h('p', { class: 'mb0', 'aria-live': 'polite' });
        var sw = UI.toggle({ value: !!a.required, label: 'Tornar obrigatória para psicólogos', onChange: function (next) {
          var step = next
            ? S.confirmIdentity({ needsCode: true, back: 'equipe', title: 'Tornar a verificação obrigatória', confirmLabel: 'Tornar obrigatória', text: 'Psicólogos que ainda não ativaram vão precisar ativar no próximo acesso. Quem já ativou não muda.' })
            : ensureFresh();
          return step.then(function (ok) {
            if (!ok) throw new Error('cancelado');
            return API.admin.setMfaRequired(next);
          }).then(function () {
            UI.toast(next ? 'Agora é obrigatória para psicólogos.' : 'Voltou a ser recomendada.', 'shield-check');
            a.required = next; draw();
          }).catch(function (e) {
            if (!(e && e.message === 'cancelado')) { Diag.error('equipe', e); UI.toast(errText(e), 'circle-alert'); }
            throw e;
          });
        } });
        function draw() {
          status.textContent = a.required ? 'Obrigatória: psicólogos sem o app autenticador não entram até ativar.' : 'Recomendada: psicólogos veem o aviso e ativam se quiserem.';
        }
        draw();
        holder.appendChild(h('div', { class: 'card person' },
          h('div', { class: 'head' }, h('div', { class: 'who' }, h('b', null, 'Verificação em duas etapas'), h('span', null, 'Psicólogos cadastrados'))),
          h('p', { class: 'stat mb0' }, h('b', null, a.with_mfa + ' de ' + a.professionals), ' já ativaram' + (a.professionals ? ' (' + pct + '%)' : '') + '.'),
          h('div', { class: 'sw-row' }, h('span', { class: 't' }, 'Tornar obrigatória para psicólogos'), sw.el),
          status));
        holder.appendChild(h('p', { class: 'small muted' }, 'Para a equipe e para os psicólogos a verificação é recomendada, com aviso até ativar. Pacientes não usam. Quem já ativou o app sempre precisa do código, mesmo com a chave desligada.'));
      }).catch(function (e) {
        if (my !== seq) return;
        Diag.error('equipe', e);
        clear(holder); holder.appendChild(UI.notice('bad', errText(e)));
      });
    }

    function drawFilter() {
      clear(filterHolder);
      if (tab === 'seg') return;
      var isPro = tab === 'pro';
      var f = UI.field({ label: isPro ? 'Mostrar' : 'Mostrar chamados', type: 'select', options: isPro ? PRO_FILTER : TICKET_FILTER });
      f.input.value = isPro ? filters.pro : filters.tix;
      f.input.addEventListener('change', function () { filters[isPro ? 'pro' : 'tix'] = f.value(); load(); });
      filterHolder.appendChild(f.el);
    }

    var seg = UI.segmented({ label: 'Seção', value: tab, options: [['pro', 'Psicólogos'], ['tix', 'Suporte'], ['seg', 'Segurança']], onChange: function (v) { tab = v; drawFilter(); load(); } });
    drawFilter(); load();

    var cfg = (window.PSI_CONFIG && window.PSI_CONFIG.team) || {};
    var lookup = cfg.crpLookupUrl && /^https:\/\//.test(cfg.crpLookupUrl)
      ? h('a', { class: 'btn ghost sm auto', href: cfg.crpLookupUrl, target: '_blank', rel: 'noopener noreferrer' }, UI.svg('id-card', 18), 'Consultar CRP no CFP') : null;

    return S.shell(ctx, 'equipe', [
      h('div', { class: 'hello' }, h('div', { class: 'grow' }, h('h1', null, 'Equipe'), h('div', { class: 'sub' }, 'Conferência de CRP, suporte e segurança')), lookup),
      S.mfaTip(ctx),
      seg.el, filterHolder, holder
    ]);
  };
})();
