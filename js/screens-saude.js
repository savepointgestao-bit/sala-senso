/* Saude do psicologo: nota de 0 a 100 (consultorio e voce), pontos de atencao e o aviso de cuidado proprio quando a agenda
   passa do limite de atendimentos. O calculo e do banco (pro_health_report); aqui so desenha e liga cada ponto a tela certa. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  var LEVEL = { ok: ['ok', 'Em dia'], warn: ['warn', 'Atenção'], bad: ['bad', 'Precisa de cuidado'], info: ['', 'Sem dado'] };
  var SELF_CARE = 'Cuidar de você também é cuidar dos seus pacientes. Uma pausa entre as sessões e um dia de descanso na semana ajudam a manter a escuta atenta.';

  function levelBadge(level) { var l = LEVEL[level] || LEVEL.info; return h('span', { class: 'badge ' + l[0] }, l[1]); }

  function bigScore(rep) {
    var ring = UI.ring(rep.score, 100);
    ring.setAttribute('class', 'ring health-ring ' + rep.level);
    ring.setAttribute('width', '96'); ring.setAttribute('height', '96');
    return h('div', { class: 'card health-score' },
      h('div', { class: 'health-ring-wrap', role: 'img', 'aria-label': 'Saúde: ' + rep.score + '%' }, ring, h('b', { class: 'health-num' }, rep.score + '%')),
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'Sua saúde no Senso'),
        h('p', { class: 'muted mb0' }, rep.level === 'ok' ? (rep.attention.length ? 'Quase tudo em dia. Veja os pontos de atenção.' : 'Tudo em dia. Continue assim.') : (rep.level === 'warn' ? 'Alguns pontos pedem atenção.' : 'Vale olhar os pontos abaixo com calma.')),
        h('div', { class: 'mt8' }, levelBadge(rep.level))));
  }

  function itemRow(it) {
    var inner = [h('span', { class: 'ico-box ' + (LEVEL[it.level] || LEVEL.info)[0] }, UI.svg(it.level === 'ok' ? 'circle-check' : (it.level === 'info' ? 'info' : 'triangle-alert'), 20)),
      h('span', { class: 'grow' }, h('span', { class: 't' }, it.title), h('span', { class: 's' }, it.text)),
      it.score == null ? null : h('span', { class: 'health-pts' }, it.score + '%')];
    return it.link && it.level !== 'ok' ? h('a', { class: 'item', href: it.link }, inner) : h('div', { class: 'item' }, inner);
  }

  S.health = function (ctx) {
    var holder = h('div', { 'aria-live': 'polite' }, UI.loading());
    var verified = ctx.me.professional && ctx.me.professional.verification === 'verified';
    if (!verified) {
      clear(holder);
      holder.appendChild(UI.notice('info', 'A saúde do consultório aparece depois que o seu CRP for confirmado.'));
    } else {
      API.pro.health().then(function (rep) {
        clear(holder);
        holder.appendChild(bigScore(rep));
        var you = rep.parts.filter(function (p) { return p.key === 'voce'; })[0];
        var tired = you && you.items.some(function (i) { return i.level === 'warn' || i.level === 'bad'; });
        if (tired) holder.appendChild(h('div', { class: 'card self-care' }, h('span', { class: 'ico-box' }, UI.svg('heart-pulse', 22)),
          h('div', null, h('b', null, 'Um lembrete de cuidado'), h('p', { class: 'mb0' }, SELF_CARE))));
        if (rep.attention.length) {
          holder.appendChild(h('div', { class: 'group-title' }, 'Pontos de atenção'));
          holder.appendChild(h('div', { class: 'group' }, rep.attention.map(itemRow)));
        }
        rep.parts.forEach(function (p) {
          holder.appendChild(h('div', { class: 'group-title' }, p.title + (p.score == null ? '' : ': ' + p.score + '%')));
          holder.appendChild(h('div', { class: 'group' }, p.items.map(itemRow)));
        });
        holder.appendChild(h('p', { class: 'small muted' }, 'A nota junta o consultório (60%) e você (40%). ' +
          (rep.limits.daily || rep.limits.weekly ? 'Limite de atendimentos: ' + [rep.limits.daily ? rep.limits.daily + ' por dia' : null, rep.limits.weekly ? rep.limits.weekly + ' por semana' : null].filter(Boolean).join(' e ') + '.'
            : 'O limite de atendimentos ainda não foi definido.')));
      }).catch(function (e) {
        Diag.error('saude', e);
        clear(holder); holder.appendChild(UI.notice('bad', UI.errorText(e, 'Não foi possível montar o relatório agora. Tente de novo.')));
      });
    }
    return S.shell(ctx, 'saude', [h('div', { class: 'hello' }, h('div', { class: 'grow' }, h('h1', null, 'Saúde'),
      h('div', { class: 'sub' }, 'Como está o seu consultório e a sua carga de trabalho'))), holder]);
  };

  /* Nota de rodape do aviso (PROVISORIA, o Luis vai reformular): de onde vem a referencia de carga. Nao ha limite oficial. */
  function refNote() {
    return h('p', { class: 'small muted ref-note' }, 'Referência: não existe limite oficial (CFP e APA não definem um número). Como base de mercado, a ',
      h('a', { href: 'https://www.talkspace.com/blog/how-many-clients-do-therapists-have/', target: '_blank', rel: 'noopener noreferrer' }, 'Talkspace'),
      ' cita uma média de 6 a 9 atendimentos por dia e até cerca de 20 por semana, e o CFP apoia a jornada de 30 horas semanais.');
  }

  /* Antes de marcar: se o dia ou a semana passar do limite, mostra a sugestao de pausa e pergunta. Promise<boolean>.
     Sem limite definido, sem rede ou com erro: deixa marcar (o aviso nao pode travar a agenda). */
  S.workloadGuard = function (ymd, series) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) || !API.pro || !API.pro.workload) return Promise.resolve(true);
    return API.pro.workload(ymd).then(function (w) {
      var overDay = w.daily_limit && w.day_count + 1 > w.daily_limit;
      var overWeek = w.weekly_limit && w.week_count + 1 > w.weekly_limit;
      if (!overDay && !overWeek) return true;
      var lines = [];
      if (overDay) lines.push('Com esta, serão ' + (w.day_count + 1) + ' atendimentos no dia (seu limite é ' + w.daily_limit + ').');
      if (overWeek) lines.push('Na semana, serão ' + (w.week_count + 1) + ' (seu limite é ' + w.weekly_limit + ').');
      if (series) lines.push('Conferimos o primeiro dia da série.');
      return UI.confirmBox({ title: 'Que tal uma pausa?', text: lines.join(' ') + ' ' + SELF_CARE, node: refNote(), ok: 'Marcar mesmo assim', cancel: 'Escolher outro horário' });
    }).catch(function (e) { Diag.error('carga', e); return true; });
  };
})();
