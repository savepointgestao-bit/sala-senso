/* Conquistas: aba do perfil (Conta). Individuais: cada pessoa ve so as suas, o outro lado nunca recebe estes numeros.
   O servidor entrega os numeros (get_my_achievements); os marcos ficam aqui. */
(function () {
  'use strict';
  var h = UI.h;
  var S = window.Screens = window.Screens || {};

  function n(v) { return Number(v).toLocaleString('pt-BR'); }
  function plural(v, one, many) { return v === 1 ? one : many; }
  function money(cents) { return 'R$ ' + n(Math.round(cents / 100)); }

  /* soon: trilha que ainda depende de um recurso que nao existe no portal (aparece como "Em breve" ate ter numero). */
  var TRACKS = {
    patient: [
      { key: 'diary_texts', icon: 'notebook-pen', title: 'Textos escritos', desc: 'Registros do diário com texto.', tiers: [1, 10, 30, 100, 365], fmt: function (v) { return n(v) + ' ' + plural(v, 'texto', 'textos'); } },
      { key: 'checkins', icon: 'smile', title: 'Check-ins de humor', desc: 'Vezes que você registrou como estava.', tiers: [1, 10, 30, 100, 365], fmt: function (v) { return n(v) + ' ' + plural(v, 'check-in', 'check-ins'); } },
      { key: 'best_streak', icon: 'zap', title: 'Maior sequência', desc: 'Dias seguidos com registro.', tiers: [3, 7, 14, 30, 100], fmt: function (v) { return n(v) + ' ' + plural(v, 'dia', 'dias'); } },
      { key: 'days_total', icon: 'activity', title: 'Dias com registro', desc: 'Dias em que você cuidou de você, seguidos ou não.', tiers: [7, 30, 100, 365], fmt: function (v) { return n(v) + ' ' + plural(v, 'dia', 'dias'); } },
      { key: 'sessions_confirmed', icon: 'heart-handshake', title: 'Sessões confirmadas', desc: 'Presenças confirmadas por você.', tiers: [1, 10, 25, 50, 100], soon: 'Chega junto com a agenda de sessões.', fmt: function (v) { return n(v) + ' ' + plural(v, 'sessão', 'sessões'); } }
    ],
    professional: [
      { key: 'sessions_done', icon: 'calendar-days', title: 'Consultas realizadas', desc: 'Sessões marcadas como realizadas na sua agenda.', tiers: [1, 10, 50, 100, 250, 500, 1000], fmt: function (v) { return n(v) + ' ' + plural(v, 'consulta', 'consultas'); } },
      { key: 'patients_linked', icon: 'users', title: 'Pacientes acompanhados', desc: 'Pacientes vinculados a você no portal.', tiers: [1, 5, 10, 25, 50, 100], fmt: function (v) { return n(v) + ' ' + plural(v, 'paciente', 'pacientes'); } },
      { key: 'revenue_cents', icon: 'wallet', title: 'Faturamento', desc: 'Total recebido pelo portal.', tiers: [100000, 1000000, 5000000, 10000000, 50000000, 100000000], money: true, soon: 'Chega junto com os pagamentos.', fmt: function (v) { return money(v); } },
      { key: 'months', icon: 'clock', title: 'Tempo no Senso', desc: 'Meses desde que você criou a conta.', tiers: [1, 6, 12, 24, 36], fmt: function (v) { return n(v) + ' ' + plural(v, 'mês', 'meses'); } }
    ]
  };

  function tierLabel(t, tr) { return tr.money ? money(t) : n(t); }

  function trackCard(tr, stats) {
    var raw = stats[tr.key];
    var value = raw == null ? 0 : Number(raw) || 0;
    var soon = !!tr.soon && !(value > 0);
    var got = soon ? 0 : tr.tiers.filter(function (t) { return value >= t; }).length;
    var next = soon ? null : tr.tiers.filter(function (t) { return value < t; })[0];
    var prev = got ? tr.tiers[got - 1] : 0;

    var chips = tr.tiers.map(function (t, i) {
      var cls = 'tier' + (i < got ? ' got' : (!soon && i === got ? ' next' : ''));
      return h('li', { class: cls }, i < got ? UI.svg('check', 14) : null, h('span', null, tierLabel(t, tr)),
        h('span', { class: 'sr-only' }, i < got ? ', conquistado' : ', ainda não'));
    });

    var head = h('div', { class: 'top' },
      h('span', { class: 'ico-box' }, UI.svg(tr.icon, 22)),
      h('div', { class: 'grow' }, h('h3', null, tr.title), h('div', { class: 's' }, tr.desc)),
      soon ? h('span', { class: 'pill' }, 'Em breve') : h('span', { class: 'cnt' }, got + '/' + tr.tiers.length));

    var mid = null;
    if (soon) {
      mid = h('p', { class: 'now soon' }, tr.soon);
    } else {
      var fill = h('i');
      var pct = next == null ? 100 : Math.max(0, Math.min(100, Math.round((value - prev) / (next - prev) * 100)));
      requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = pct + '%'; }); });
      mid = h('div', null,
        h('div', { class: 'now' }, h('b', null, tr.fmt(value)), next == null ? '. Todos os marcos conquistados.' : '. Próximo marco: ' + (tr.money ? money(next) : n(next)) + '.'),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': tr.title, 'aria-valuemin': '0', 'aria-valuemax': String(next == null ? value : next), 'aria-valuenow': String(value) }, fill));
    }
    return h('section', { class: 'card track' + (soon ? ' off' : ''), 'data-track': tr.key }, head, mid, h('ul', { class: 'tiers plain-list', 'aria-label': 'Marcos de ' + tr.title }, chips));
  }

  /* Total de marcos ja conquistados (trilhas "em breve" nao entram na conta). */
  S.achievementTotals = function (role, stats) {
    var got = 0, total = 0;
    (TRACKS[role] || []).forEach(function (tr) {
      var v = stats[tr.key] == null ? 0 : Number(stats[tr.key]) || 0;
      if (tr.soon && !(v > 0)) return;
      total += tr.tiers.length;
      got += tr.tiers.filter(function (t) { return v >= t; }).length;
    });
    return { got: got, total: total };
  };

  /* Painel da aba. Pacientes tambem veem as molduras da foto. */
  S.achievements = function (ctx) {
    var p = ctx.me.profile, role = p.role === 'professional' ? 'professional' : 'patient';
    var holder = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Carregando...'));
    Promise.all([API.achievements(), role === 'patient' ? API.progress() : Promise.resolve(null)]).then(function (r) {
      var stats = r[0] || {}, prog = r[1];
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      var t = S.achievementTotals(role, stats);
      holder.appendChild(h('div', { class: 'ach-sum' }, h('span', { class: 'ico-box' }, UI.svg('trophy', 24)),
        h('div', null, h('div', { class: 't' }, t.got + ' de ' + t.total + ' marcos conquistados'),
          h('div', { class: 's' }, role === 'patient' ? 'Cada marco é um passo seu. Sem pressa e sem cobrança.' : 'Seus números de trabalho. Só você vê esta aba.'))));
      TRACKS[role].forEach(function (tr) { holder.appendChild(trackCard(tr, stats)); });
      if (prog) holder.appendChild(S.frameShelf(prog.level, p.full_name));
      holder.appendChild(h('p', { class: 'group-hint' }, 'As conquistas são individuais: ' + (role === 'patient' ? 'seu psicólogo(a) não vê esta aba.' : 'seus pacientes não veem esta aba.')));
    }).catch(function (e) {
      Diag.error('conquistas', e);
      while (holder.firstChild) holder.removeChild(holder.firstChild);
      holder.appendChild(UI.notice('bad', 'Não foi possível carregar as conquistas agora. Atualize a página.'));
    });
    return holder;
  };
})();
