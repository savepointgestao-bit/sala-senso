/* Paciente: "Preciso de ajuda" (acalmar e pedir apoio). Três caminhos: ansiedade ou pânico, pensamentos de morrer ou de se machucar,
   e falar com alguém. Conteúdo baseado em práticas reconhecidas (respiração lenta, aterramento, plano de segurança de Stanley e Brown,
   linhas de apoio do Brasil). Não substitui atendimento de emergência. O texto precisa de revisão de um(a) psicólogo(a) antes do lançamento. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function go(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }

  /* Faixa de emergência: sempre no topo, com ligação direta no celular. */
  function emergencyStrip() {
    function call(num, name, sub, cls) {
      return h('a', { class: 'sos-call ' + (cls || ''), href: 'tel:' + num, 'aria-label': 'Ligar para ' + name + ', ' + num + '. ' + sub },
        h('span', { class: 'sos-num' }, UI.svg('phone-call', 20), num), h('span', { class: 'sos-name' }, name), h('span', { class: 'sos-sub' }, sub));
    }
    return h('section', { class: 'sos', 'aria-label': 'Ligue agora' },
      h('div', { class: 'sos-head' }, h('span', { class: 'ico-box' }, UI.svg('shield-alert', 22)),
        h('div', null, h('h2', { class: 'mb0' }, 'Em perigo agora?'), h('p', { class: 'small mb0' }, 'Ligue. É de graça e a ligação é na hora.'))),
      h('div', { class: 'sos-grid' },
        call('188', 'CVV', '24 horas, apoio emocional', 'main'),
        call('192', 'SAMU', 'Emergência de saúde'),
        call('190', 'Polícia', 'Risco imediato')),
      h('p', { class: 'small mb0 sos-note' }, 'Se for mais fácil, vá a uma UPA ou pronto-socorro e diga que está mal emocionalmente. Peça para alguém ficar com você.'));
  }

  /* ---------------------------------------------------------------- respiração guiada (4 s para inspirar, 6 s para soltar) */
  function breathing() {
    var circle = h('div', { class: 'breath-circle', 'aria-hidden': 'true' }), label = h('div', { class: 'breath-label', 'aria-live': 'polite' }, 'Toque em começar'), count = h('div', { class: 'breath-count', 'aria-hidden': 'true' });
    var cycles = h('p', { class: 'small muted center mb0' }, 'Repita por 2 a 5 minutos.');
    var PHASES = [{ text: 'Inspire pelo nariz', secs: 4, cls: 'in' }, { text: 'Solte devagar pela boca', secs: 6, cls: 'out' }];
    var timer = null, ph = 0, left = 0, n = 0;
    var btn = UI.button('Começar', { icon: 'wind', onclick: function () { if (timer) stop(); else start(); } });
    function paint() {
      var p = PHASES[ph];
      label.textContent = p.text; count.textContent = String(left);
      circle.className = 'breath-circle ' + p.cls;
    }
    function tick() {
      if (!document.body.contains(circle)) { stop(true); return; }
      left -= 1;
      if (left <= 0) { ph = (ph + 1) % PHASES.length; left = PHASES[ph].secs; if (ph === 0) { n += 1; cycles.textContent = n + (n === 1 ? ' respiração completa' : ' respirações completas') + '. Repita por 2 a 5 minutos.'; } paint(); }
      else count.textContent = String(left);
    }
    function start() {
      ph = 0; left = PHASES[0].secs; paint();
      timer = setInterval(tick, 1000);
      btn.lastChild.textContent = 'Parar';
    }
    function stop(silent) {
      if (timer) { clearInterval(timer); timer = null; }
      if (silent) return;
      circle.className = 'breath-circle'; label.textContent = 'Toque em começar'; count.textContent = '';
      btn.lastChild.textContent = 'Começar';
    }
    return h('div', { class: 'breath' }, h('div', { class: 'breath-stage' }, circle, h('div', { class: 'breath-text' }, count, label)), cycles, h('div', { class: 'btn-row center-row' }, btn));
  }

  /* ---------------------------------------------------------------- aterramento 5-4-3-2-1 */
  var GROUND = [['5', 'coisas que você consegue VER', 'Olhe em volta e diga em voz baixa o que vê: a cor da parede, um objeto, a luz.'],
    ['4', 'coisas que você consegue TOCAR', 'O tecido da roupa, a mesa, o chão sob os pés, a temperatura do ar.'],
    ['3', 'sons que você consegue OUVIR', 'Perto ou longe: um carro, uma voz, o ventilador, a sua respiração.'],
    ['2', 'cheiros que você consegue SENTIR', 'Se não sentir nenhum, lembre de dois cheiros de que gosta.'],
    ['1', 'gosto que você consegue PERCEBER', 'O gosto da boca agora, ou de algo de que você gosta.']];
  function grounding() {
    var i = 0, box = h('div', { class: 'ground', 'aria-live': 'polite' });
    function draw() {
      clear(box);
      if (i >= GROUND.length) {
        box.appendChild(h('div', { class: 'ground-step done' }, h('b', null, 'Muito bem.'), h('p', { class: 'mb0' }, 'Solte o ar devagar e perceba como o corpo está agora. Se ainda estiver forte, repita o exercício ou volte para a respiração.')));
        box.appendChild(h('div', { class: 'btn-row' }, UI.button('Fazer de novo', { variant: 'ghost', onclick: function () { i = 0; draw(); } })));
        return;
      }
      var g = GROUND[i];
      box.appendChild(h('div', { class: 'ground-step' }, h('span', { class: 'ground-n', 'aria-hidden': 'true' }, g[0]), h('div', null, h('b', null, 'Encontre ' + g[0] + ' ' + g[1]), h('p', { class: 'small muted mb0' }, g[2]))));
      box.appendChild(h('div', { class: 'btn-row' }, UI.button(i === GROUND.length - 1 ? 'Terminei' : 'Próximo', { onclick: function () { i += 1; draw(); } })));
    }
    draw();
    return box;
  }

  function step(n, title, body) {
    return h('li', { class: 'help-step' }, h('span', { class: 'help-n', 'aria-hidden': 'true' }, String(n)), h('div', null, h('b', null, title), body ? h('p', { class: 'mb0' }, body) : null));
  }
  function block(title, kids, cls) { return h('section', { class: 'card help-block ' + (cls || '') }, h('h2', null, title), kids); }

  /* ---------------------------------------------------------------- 1. ansiedade e pânico */
  function anxietyPanel(ctx, D) {
    var wa = D.waLink;
    return h('div', null,
      h('p', { class: 'lead' }, 'O que você está sentindo é real, e passa. Uma crise de ansiedade ou de pânico costuma chegar ao pico em cerca de 10 minutos e depois diminui. Você vai ficar bem.'),
      block('1. Respire devagar', [h('p', { class: 'muted' }, 'Soltar o ar mais devagar do que puxar ajuda o corpo a sair do modo alerta. Siga o círculo: 4 segundos para encher, 6 para esvaziar.'), breathing()]),
      block('2. Volte para o presente (5-4-3-2-1)', [h('p', { class: 'muted' }, 'Quando a cabeça corre, os sentidos ajudam a ancorar. Vá no seu ritmo.'), grounding()]),
      block('3. Cuide do corpo', h('ul', { class: 'plain-list what-list' },
        [['Apoie os dois pés no chão e sinta o peso do corpo na cadeira ou no chão.'], ['Beba água em goles pequenos.'], ['Afrouxe a roupa e relaxe os ombros e a mandíbula.'],
          ['Diga para si: “Isso é ansiedade. Vai passar. Já passei por isso antes.”'], ['Não lute contra a sensação. Deixe passar como uma onda: ela sobe, chega ao pico e desce.'], ['Se der, evite café, energético e álcool nas próximas horas.']].map(function (t) { return h('li', null, UI.svg('check', 18), t[0]); }))),
      UI.notice('warn', h('span', null, h('b', null, 'Procure atendimento agora (SAMU 192 ou pronto-socorro) se: '), 'a dor no peito for forte ou se espalhar para o braço ou a mandíbula, a falta de ar não melhorar, você desmaiar, ou for a primeira vez que sente algo assim. Esses sinais precisam ser avaliados por um médico.')),
      block('Depois que passar', [h('p', { class: 'muted' }, 'Anotar o que aconteceu ajuda você e o seu psicólogo(a) a entender o que dispara as crises.'),
        h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: '#/diario/novo' }, UI.svg('notebook-pen', 18), 'Registrar no diário'),
          wa ? h('a', { class: 'btn ghost', href: wa, target: '_blank', rel: 'noopener' }, UI.svg('message-circle', 18), 'Avisar meu psicólogo(a)') : null)]));
  }

  /* ---------------------------------------------------------------- 2. pensamentos de morrer ou de se machucar */
  var PLAN_FIELDS = [['signs', 'Sinais de que a crise está chegando', 'Pensamentos, situações ou sentimentos que me avisam.'],
    ['alone', 'O que posso fazer sozinho(a) para me acalmar', 'Respirar, tomar banho, ouvir música, caminhar.'],
    ['people', 'Pessoas e lugares que me distraem', 'Com quem posso ficar? Onde posso ir?'],
    ['help', 'Pessoas a quem posso pedir ajuda', 'Nome e telefone de quem sabe de mim.'],
    ['pros', 'Profissionais e serviços', 'Meu psicólogo(a), CVV 188, SAMU 192, CAPS ou UPA mais perto.'],
    ['safe', 'Como deixar o ambiente mais seguro', 'O que posso afastar de perto de mim, e quem pode guardar.']];
  function planKey(ctx) { return 'psi_plano_' + String((ctx.me.profile && ctx.me.profile.id) || 'x'); }
  function loadPlan(ctx) { try { return JSON.parse(localStorage.getItem(planKey(ctx)) || '{}') || {}; } catch (e) { return {}; } }

  function safetyPlan(ctx) {
    var saved = loadPlan(ctx), fields = {};
    var general = h('div', { 'aria-live': 'polite' });
    var list = PLAN_FIELDS.map(function (f, i) {
      var fld = UI.field({ label: (i + 1) + '. ' + f[1], type: 'textarea', rows: 2, maxlength: 400, optional: true, hint: f[2], value: saved[f[0]] || '' });
      fields[f[0]] = fld; return fld.el;
    });
    function data() { var o = {}; PLAN_FIELDS.forEach(function (f) { o[f[0]] = fields[f[0]].value().trim(); }); return o; }
    var save = UI.button('Guardar neste aparelho', { icon: 'check', onclick: function () {
      try { localStorage.setItem(planKey(ctx), JSON.stringify(data())); general.textContent = ''; UI.toast('Plano guardado neste aparelho.', 'circle-check'); }
      catch (e) { general.appendChild(UI.notice('warn', 'Não deu para guardar neste aparelho. Use “Copiar” e salve no seu celular.')); }
    } });
    var copy = UI.button('Copiar', { variant: 'ghost', icon: 'copy', onclick: function () {
      var d = data(), txt = 'Meu plano de segurança\n\n' + PLAN_FIELDS.map(function (f, i) { return (i + 1) + '. ' + f[1] + '\n' + (d[f[0]] || '(em branco)'); }).join('\n\n') + '\n\nCVV 188 (24 h) | SAMU 192';
      UI.copyText(txt).then(function () { UI.toast('Plano copiado.', 'circle-check'); }, function () { UI.toast('Não deu para copiar.'); });
    } });
    return h('details', { class: 'invite-more help-plan' }, h('summary', null, 'Montar meu plano de segurança'),
      h('p', { class: 'muted small' }, 'Um plano escrito antes da crise ajuda a saber o que fazer quando ela vier. Ele fica só neste aparelho. Leve para a sessão e revise com o seu psicólogo(a).'),
      list, general, h('div', { class: 'btn-row' }, save, copy));
  }

  function crisisPanel(ctx, D) {
    var wa = D.waLink;
    return h('div', null,
      h('p', { class: 'lead' }, 'Obrigado por procurar ajuda. Pensar em se machucar ou em morrer é um sinal de que a dor está grande demais, e não de que você é fraco(a) ou de que não tem saída. Esses pensamentos podem diminuir com apoio, mesmo quando agora não parece.'),
      block('Agora, o mais importante', h('ul', { class: 'plain-list what-list' }, [
        'Ligue para o CVV no 188 (24 horas, de graça) e converse com alguém. Se estiver em risco imediato, ligue 192 (SAMU) ou vá a uma UPA ou pronto-socorro.',
        'Não fique sozinho(a). Avise uma pessoa de confiança e peça para ela ficar com você.',
        'Afaste de perto de você o que pode ser usado para se machucar (remédios em excesso, armas, objetos). Peça a alguém para guardar. Isso reduz o risco enquanto a crise passa.',
        'Evite álcool e outras drogas agora. Eles aumentam a impulsividade.'].map(function (t) { return h('li', null, UI.svg('check', 18), t); })), 'urgent'),
      h('div', { class: 'sos-inline' }, h('a', { class: 'btn', href: 'tel:188' }, UI.svg('phone-call', 18), 'Ligar para o CVV (188)'), h('a', { class: 'btn ghost', href: 'tel:192' }, UI.svg('phone-call', 18), 'Ligar para o SAMU (192)')),
      block('Enquanto a crise passa', [h('p', { class: 'muted' }, 'A vontade de se machucar costuma ter ondas: ela sobe e desce. Ganhar tempo já ajuda.'), breathing()]),
      block('Meu plano de segurança', [h('p', { class: 'muted' }, 'Este é um passo a passo usado por profissionais de saúde mental (Plano de Segurança de Stanley e Brown). Preencha com calma, de preferência junto com o seu psicólogo(a).'),
        h('ol', { class: 'help-steps' }, [
          step(1, 'Reconheça os sinais', 'Quais pensamentos, situações ou sentimentos avisam que a crise está vindo?'),
          step(2, 'Acalme-se sozinho(a)', 'O que já ajudou antes: respirar, banho, música, caminhar, falar com um animal de estimação.'),
          step(3, 'Procure distração com outras pessoas', 'Ir a um lugar com gente, ligar para alguém só para conversar sobre outra coisa.'),
          step(4, 'Peça ajuda a quem confia', 'Escolha 2 ou 3 pessoas e deixe os telefones à mão. Diga: “Não estou bem. Pode ficar comigo?”'),
          step(5, 'Chame os profissionais', 'Seu psicólogo(a), CVV 188, SAMU 192, o CAPS mais perto (atendimento gratuito pelo SUS) ou uma UPA.'),
          step(6, 'Deixe o ambiente seguro', 'Afaste o que pode ser usado para se machucar e peça a alguém para guardar.')]),
        safetyPlan(ctx)]),
      wa ? h('div', { class: 'cta-card strip-static' }, h('span', { class: 'ico-box' }, UI.svg('message-circle', 22)), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Conte ao seu psicólogo(a)'), h('div', { class: 's' }, 'Ele(a) precisa saber o que você está passando. Se for urgente, ligue 188 ou 192 em vez de esperar a resposta.')),
        h('a', { class: 'btn auto sm', href: wa, target: '_blank', rel: 'noopener' }, 'Mandar mensagem')) : null,
      block('Estou preocupado(a) com outra pessoa', h('ul', { class: 'plain-list what-list' }, [
        'Pergunte com carinho e sem rodeios se ela está pensando em se matar. Perguntar não coloca a ideia na cabeça de ninguém e pode ser um alívio.',
        'Ouça sem julgar e sem dar sermão. Mostre que ela importa para você.',
        'Não deixe a pessoa sozinha se houver risco. Ajude a afastar o que pode machucar.',
        'Ligue para o CVV (188) para pedir orientação, ou para o SAMU (192) se houver risco imediato. Acompanhe a pessoa até a UPA ou pronto-socorro.'].map(function (t) { return h('li', null, UI.svg('check', 18), t); }))));
  }

  /* ---------------------------------------------------------------- 3. falar com alguém */
  function talkPanel(ctx, D) {
    var items = [];
    D.psy.forEach(function (x) {
      var l = x.whatsapp ? UI.waLink(x.whatsapp, 'Olá, ' + UI.firstName(x.full_name) + '. Aqui é ' + UI.firstName(ctx.me.profile.full_name) + '. Estou precisando conversar.') : null;
      if (l) items.push(h('a', { class: 'item', href: l, target: '_blank', rel: 'noopener' }, h('span', { class: 'ico-box' }, UI.svg('message-circle', 20)),
        h('span', null, h('span', { class: 't' }, 'Falar com ' + x.full_name), h('span', { class: 's' }, 'Abre o WhatsApp. A resposta pode demorar.')), h('span', { class: 'chev' }, UI.svg('external-link', 18))));
    });
    items.push(h('a', { class: 'item', href: 'tel:188' }, h('span', { class: 'ico-box' }, UI.svg('phone-call', 20)),
      h('span', null, h('span', { class: 't' }, 'CVV, ligue 188'), h('span', { class: 's' }, '24 horas, de graça. Também há chat no site cvv.org.br.')), h('span', { class: 'chev' }, UI.svg('chevron-right', 18))));
    if (D.psy.some(function (x) { return x.booking_enabled && x.verified !== false; })) items.push(h('a', { class: 'item', href: '#/consultas?novo=1' }, h('span', { class: 'ico-box' }, UI.svg('calendar-plus', 20)),
      h('span', null, h('span', { class: 't' }, 'Pedir uma consulta'), h('span', { class: 's' }, 'Escolha um horário com o seu psicólogo(a).')), h('span', { class: 'chev' }, UI.svg('chevron-right', 18))));
    var msg = 'Não estou bem agora. Pode conversar comigo ou ficar por perto?';
    return h('div', null,
      h('p', { class: 'lead' }, 'Falar com alguém já alivia. Você não precisa explicar tudo, basta começar.'),
      h('div', { class: 'group' }, items),
      block('Não sei o que dizer', [h('p', { class: 'muted' }, 'Mande uma mensagem simples para alguém de confiança:'), h('div', { class: 'linkbox' }, msg),
        h('div', { class: 'btn-row mt16' }, UI.button('Copiar mensagem', { icon: 'copy', onclick: function () { UI.copyText(msg).then(function () { UI.toast('Mensagem copiada.', 'circle-check'); }, function () { UI.toast('Não deu para copiar.'); }); } }))]),
      block('Atendimento gratuito perto de você', h('p', { class: 'mb0' }, 'O CAPS (Centro de Atenção Psicossocial) atende de graça pelo SUS. Procure o mais perto na Secretaria de Saúde da sua cidade. Em urgência, a UPA e o pronto-socorro funcionam 24 horas.')));
  }

  /* ---------------------------------------------------------------- tela */
  var PATHS = [['ansiedade', 'wind', 'Estou com ansiedade ou pânico', 'Respirar e se acalmar'],
    ['crise', 'hand-heart', 'Estou pensando em me machucar ou em morrer', 'Apoio agora e plano de segurança'],
    ['falar', 'message-circle-heart', 'Quero falar com alguém', 'Seu psicólogo(a), CVV e mais']];

  S.help = function (ctx) {
    var panel = h('div', { 'aria-live': 'polite' }), buttons = [];
    var D = { psy: [], waLink: null };
    var cur = null;
    function show(k, quiet) {
      cur = k;
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-k') === k ? 'true' : 'false'); });
      clear(panel);
      panel.appendChild(k === 'ansiedade' ? anxietyPanel(ctx, D) : (k === 'crise' ? crisisPanel(ctx, D) : talkPanel(ctx, D)));
      if (!quiet) try { panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    }
    var choose = h('div', { class: 'help-paths', role: 'group', 'aria-label': 'O que está acontecendo' }, PATHS.map(function (p) {
      var b = h('button', { type: 'button', class: 'help-path', 'data-k': p[0], 'aria-pressed': 'false', onclick: function () { show(p[0]); } },
        h('span', { class: 'ico-box' }, UI.svg(p[1], 22)), h('span', { class: 'grow' }, h('span', { class: 't' }, p[2]), h('span', { class: 's' }, p[3])), h('span', { class: 'chev' }, UI.svg('chevron-right', 18)));
      buttons.push(b); return b;
    }));
    var node = S.shell(ctx, 'ajuda', [UI.pageHead('Preciso de ajuda', 'Acalmar e pedir apoio'), emergencyStrip(), h('h2', { class: 'help-q' }, 'O que está acontecendo?'), choose, panel,
      h('p', { class: 'small muted help-foot' }, 'Este conteúdo se baseia em práticas reconhecidas de cuidado em saúde mental e não substitui avaliação profissional nem atendimento de emergência. Em caso de risco, ligue 188 ou 192.')]);
    API.booking.psychologists().catch(function () { return []; }).then(function (psy) {
      D.psy = psy;
      var first = psy.filter(function (x) { return x.whatsapp; })[0];
      D.waLink = first ? UI.waLink(first.whatsapp, 'Olá, ' + UI.firstName(first.full_name) + '. Aqui é ' + UI.firstName(ctx.me.profile.full_name) + '.') : null;
      if (cur) show(cur, true);
    });
    return node;
  };
})();
