/* Suporte (contatos, perguntas frequentes com prints, envio de informacoes) e leitor dos textos legais. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  var CATEGORIES = [
    ['duvida', 'Dúvida'], ['erro', 'Algo não funciona'], ['sugestao', 'Sugestão'],
    ['conta', 'Conta e acesso'], ['pagamento', 'Pagamentos'], ['privacidade', 'Privacidade e dados']
  ];

  /* Pagina: dentro da moldura se a pessoa esta logada; senao, pagina simples com a marca. */
  function page(ctx, active, children, back) {
    if (ctx) return S.shell(ctx, active, children);
    return h('div', { class: 'pub' }, h('div', { class: 'pub-top' }, UI.brand('#/entrar'), h('a', { class: 'help', href: back || '#/entrar' }, UI.svg('arrow-left', 18), 'Voltar')), h('main', null, children));
  }

  function contacts() {
    var c = (window.PSI_CONFIG && window.PSI_CONFIG.support) || {};
    var items = [];
    if (c.whatsapp && /^\d{10,15}$/.test(c.whatsapp)) {
      items.push(h('a', { class: 'contact', href: 'https://wa.me/' + c.whatsapp, target: '_blank', rel: 'noopener noreferrer' },
        h('span', { class: 'ico-box' }, UI.svg('phone', 20)), h('span', null, h('div', { class: 't' }, 'WhatsApp'), h('div', { class: 's' }, 'Conversa direta'))));
    }
    if (c.email && UI.emailValid(c.email)) {
      items.push(h('a', { class: 'contact', href: 'mailto:' + c.email + '?subject=' + encodeURIComponent('Suporte Senso'), rel: 'noopener' },
        h('span', { class: 'ico-box' }, UI.svg('mail', 20)), h('span', null, h('div', { class: 't' }, 'E-mail'), h('div', { class: 's' }, c.email))));
    }
    if (!items.length) return null;
    var meta = [c.hours, c.answerTime].filter(Boolean).join('. ');
    return h('div', null, h('div', { class: 'contacts' }, items), meta ? h('p', { class: 'group-hint' }, meta + (/[.!]$/.test(meta) ? '' : '.')) : null);
  }

  function faqBlock() {
    var list = h('div', { class: 'group' });
    var items = (window.FAQ || []).map(function (f) {
      var body = h('div', { class: 'body' }, f.a.map(function (p) { return h('p', null, p); }));
      if (f.shot) {
        var img = h('img', { class: 'shot', src: 'assets/faq/' + f.shot + '.png', alt: 'Print da tela: ' + f.q, loading: 'lazy' });
        img.addEventListener('error', function () { if (img.parentNode) img.parentNode.removeChild(img); });
        body.appendChild(img);
      }
      var d = h('details', { class: 'faq' }, h('summary', null, f.q), body);
      d._text = (f.q + ' ' + f.a.join(' ')).toLowerCase();
      list.appendChild(d);
      return d;
    });
    var none = h('p', { class: 'muted hide' }, 'Nada encontrado. Tente outra palavra ou envie sua pergunta abaixo.');
    var search = UI.field({ label: 'Buscar nas perguntas', type: 'search', placeholder: 'Buscar: senha, e-mail, CRP' });
    search.el.querySelector('label').classList.add('sr-only');
    search.input.addEventListener('input', function () {
      var q = search.value().trim().toLowerCase(), shown = 0;
      items.forEach(function (d) { var ok = !q || d._text.indexOf(q) >= 0; d.classList.toggle('hide', !ok); if (ok) shown++; });
      none.classList.toggle('hide', shown > 0);
    });
    return h('div', null, search.el, list, none);
  }

  function ticketError(e) {
    var m = String((e && e.message) || '') + ' ' + String((e && e.code) || '');
    if (/too_many_tickets/.test(m)) return 'Você já enviou muitos pedidos hoje. Tente amanhã.';
    if (/diagnostics_consent_required/.test(m)) return 'Para incluir as informações técnicas, precisamos da sua autorização.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return 'Não foi possível enviar agora. Tente de novo em instantes.';
  }

  function sendForm(ctx, q) {
    var box = h('div', { class: 'card', id: 'enviar' });
    if (!ctx) {
      box.appendChild(h('p', { class: 'muted' }, 'Entre na sua conta para enviar uma mensagem. Se não consegue entrar, use os contatos acima.'));
      box.appendChild(h('a', { class: 'btn ghost', href: '#/entrar' }, 'Entrar'));
      return box;
    }
    var cat = UI.field({ label: 'Assunto', type: 'select', options: CATEGORIES });
    if (q && q.categoria && CATEGORIES.some(function (c) { return c[0] === q.categoria; })) cat.input.value = q.categoria;
    var msg = UI.field({ label: 'Mensagem', type: 'textarea', maxlength: 4000, rows: 5, hint: 'Não escreva senhas nem dados de pacientes.' });

    var previewPre = h('pre', { class: 'preview' }, '');
    var previewBox = h('details', { class: 'faq hide' }, h('summary', null, 'Ver o que será enviado'), h('div', { class: 'body' }, previewPre));
    previewBox.addEventListener('toggle', function () { if (previewBox.open) previewPre.textContent = JSON.stringify(Diag.report({ tela: (location.hash.split('?')[0] || '#/').slice(0, 40) }), null, 2); });
    var tech = UI.toggle({ value: false, label: 'Incluir informações técnicas', onChange: function (v) { previewBox.classList.toggle('hide', !v); if (!v) previewBox.open = false; } });
    var techRow = h('div', { class: 'group' },
      h('div', { class: 'item' }, h('span', { class: 'ico-box' }, UI.svg('activity', 20)),
        h('span', null, h('span', { class: 't' }, 'Incluir informações técnicas'), h('span', { class: 's' }, 'Versão, aparelho e últimos passos')), tech.el),
      previewBox);
    var general = h('div', { 'aria-live': 'polite' });
    var btn = UI.button('Enviar', { type: 'submit' });

    var form = h('form', { novalidate: true, onsubmit: function (ev) {
      ev.preventDefault(); general.textContent = '';
      if (msg.value().trim().length < 10) { msg.setError('Conte um pouco mais (pelo menos 10 letras).'); msg.input.focus(); return; }
      UI.busy(btn, true);
      var withTech = tech.get();
      var text = msg.value().trim();
      var subject = (text.split('\n')[0] || text).slice(0, 100);
      var step = withTech ? API.hasConsent('diagnostics').then(function (g) { return g ? true : API.setConsent('diagnostics', true); }) : Promise.resolve(true);
      step.then(function () {
        return API.createSupportTicket({
          category: cat.value(), subject: subject, message: text,
          appVersion: (window.PSI_CONFIG && window.PSI_CONFIG.docVersion) || null, platform: Diag.redact(navigator.userAgent).slice(0, 190),
          diagnostics: withTech ? Diag.report({ tela: (location.hash.split('?')[0] || '#/').slice(0, 40) }) : null
        });
      }).then(function (r) {
        Diag.log('suporte:enviou');
        clear(box);
        box.appendChild(h('div', { class: 'status-ico' }, UI.svg('circle-check-big', 30)));
        box.appendChild(h('h2', null, 'Recebemos seu pedido'));
        box.appendChild(h('p', { class: 'muted' }, 'Protocolo ', h('b', null, String(r.id).slice(0, 8)), '. ' + (((window.PSI_CONFIG || {}).support || {}).answerTime || 'Vamos responder em breve.') + ' A resposta chega no e-mail da sua conta.'));
        box.appendChild(h('a', { class: 'btn ghost', href: '#/inicio' }, 'Voltar ao início'));
      }).catch(function (e) { UI.busy(btn, false); Diag.error('suporte', e); general.appendChild(UI.notice('bad', ticketError(e))); });
    } }, cat.el, msg.el, techRow,
      h('p', { class: 'group-hint mb16' }, 'Ao incluir, você autoriza o suporte a usar essas informações só para resolver este pedido.'),
      general, btn);
    box.appendChild(form);
    return box;
  }

  S.support = function (ctx, q) {
    var c = contacts();
    return page(ctx, 'suporte', [h('h1', { class: 'mb16' }, 'Suporte'),
      c,
      faqBlock(),
      h('div', { class: 'group-title' }, 'Enviar mensagem'),
      sendForm(ctx, q || {})]);
  };

  /* ---------------------------------------------------------------- textos legais */
  var LEGAL = {
    'privacidade': 'Política de Privacidade',
    'termos-paciente': 'Termos de Uso (paciente)',
    'termos-profissional': 'Termos de Uso (psicólogo)',
    'contrato-dados': 'Contrato de Tratamento de Dados'
  };
  S.legal = function (ctx, slug) {
    var title = LEGAL[slug];
    var body = h('div', { class: 'legal-text', tabindex: '0' });
    if (!title) {
      body.textContent = 'Documento não encontrado.';
      title = 'Documento';
    } else {
      body.textContent = 'Carregando...';
      fetch('legal/' + slug + '.txt', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
        .then(function (t) { body.textContent = t; })
        .catch(function (e) { Diag.error('legal', e); body.textContent = 'Não foi possível abrir o texto agora. Tente de novo.'; });
    }
    var content = [h('h1', { class: 'mb16' }, title),
      UI.notice('warn', 'Versão de trabalho, em revisão jurídica. Os campos entre [COLCHETES] são preenchidos antes do lançamento.'),
      h('div', { class: 'card' }, body)];
    return page(ctx, 'conta', content, ctx ? '#/conta' : '#/entrar');
  };
})();
