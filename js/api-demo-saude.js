/* Modo demonstracao: saude do psicologo (relatorio de 0 a 100) e limite de atendimentos. Espelha o banco
   (supabase/migrations/20261124140000_saude_e_limite.sql): mesmos itens, mesmas faixas e os mesmos pesos provisorios. */
(function () {
  'use strict';
  var api = window.API_DEMO, core = api._core, H = api._care.helpers, C = api._clinic ? api._clinic.C : { docs: [] };
  var S = H.S, tick = core.tick, pgErr = H.pgErr, dayOf = H.dayOf, addDays = H.addDays, today = H.today;
  var DAY = 86400000, MIN = 60000;

  var COUNTS = { scheduled: 1, done: 1, reschedule_proposed: 1 };
  function count(proId, from, to) {
    return S.appts.filter(function (a) { var d = dayOf(a.startsAt); return a.proId === proId && COUNTS[a.status] && d >= from && d <= to; }).length;
  }
  function monday(day) { var w = H.dow(day); return addDays(day, w === 0 ? -6 : 1 - w); }
  function item(key, part, title, score, text, link) {
    if (score != null) score = Math.max(0, Math.min(100, Math.round(score)));
    return { key: key, part: part, title: title, score: score, level: score == null ? 'info' : (score >= 80 ? 'ok' : (score >= 50 ? 'warn' : 'bad')), text: text, link: link };
  }
  function plural(n, one, many) { return n + (n === 1 ? one : many); }

  api.pro = api.pro || {};
  api.pro.workload = function (ymd) {
    var u = H.needPro();
    return tick(null).then(function () {
      var day = ymd || today(), mon = monday(day);
      return { day: day, week_start: mon, daily_limit: core.workload.daily, weekly_limit: core.workload.weekly, day_count: count(u.id, day, day), week_count: count(u.id, mon, addDays(mon, 6)) };
    });
  };

  api.pro.health = function () {
    var u = H.needVerified();
    return tick(null).then(function () {
      var now = Date.now(), t = today(), mon = monday(t), items = [], n, m, done, ns, rate;
      var mine = S.appts.filter(function (a) { return a.proId === u.id; });
      var dl = core.workload.daily, wl = core.workload.weekly;

      n = S.records.filter(function (r) { return r.proId === u.id && r.userId && !r.verifiedAt && (r.status === 'active' || r.status === 'paused' || !r.status); }).length;
      items.push(item('conferir', 'consultorio', 'Cadastros por conferir', 100 - 25 * n,
        n === 0 ? 'Todos os cadastros com conta estão conferidos.' : plural(n, ' cadastro esperando', ' cadastros esperando') + ' você conferir.', '#/pacientes?f=verify'));

      n = mine.filter(function (a) { return a.status === 'requested' && a.startsAt > now; }).length;
      m = (S.requests || []).filter(function (q) { return q.proId === u.id && q.origin === 'patient' && q.status === 'pending' && q.expiresAt > now; }).length;
      items.push(item('pedidos', 'consultorio', 'Pedidos esperando resposta', 100 - 20 * (n + m),
        n + m === 0 ? 'Nenhum pedido esperando.' : plural(n + m, ' pedido esperando', ' pedidos esperando') + ' sua resposta.', '#/agenda?aba=pedidos'));

      n = mine.filter(function (a) { return a.paymentStatus === 'pending' && a.startsAt < now - 30 * DAY; }).length;
      items.push(item('pagamentos', 'consultorio', 'Pagamentos atrasados', 100 - 10 * n,
        n === 0 ? 'Nenhuma sessão sem pagamento há mais de 30 dias.' : plural(n, ' sessão sem pagamento', ' sessões sem pagamento') + ' há mais de 30 dias.', '#/financeiro?aba=receber'));

      var recent = mine.filter(function (a) { return a.status === 'done' && a.startsAt >= now - 30 * DAY && a.startsAt <= now; });
      done = recent.length;
      n = recent.filter(function (a) {
        return !C.docs.some(function (d) { return d.proId === u.id && d.kind === 'note' && (d.apptId === a.id || (d.recordId === a.recordId && d.docDate === dayOf(a.startsAt))); });
      }).length;
      items.push(item('evolucoes', 'consultorio', 'Evoluções em dia', done === 0 ? null : 100 * (done - n) / done,
        done === 0 ? 'Sem sessões realizadas nos últimos 30 dias.' : (n === 0 ? 'Todas as sessões dos últimos 30 dias têm evolução.' : n + ' de ' + done + ' sessões dos últimos 30 dias estão sem evolução.'), '#/pacientes'));

      var last60 = mine.filter(function (a) { return a.startsAt >= now - 60 * DAY && a.startsAt <= now; });
      done = last60.filter(function (a) { return a.status === 'done'; }).length; ns = last60.filter(function (a) { return a.status === 'no_show'; }).length;
      rate = done + ns === 0 ? null : 100 * ns / (done + ns);
      items.push(item('faltas', 'consultorio', 'Faltas', rate == null ? null : (rate <= 10 ? 100 : 100 - (rate - 10) * 3),
        rate == null ? 'Sem consultas nos últimos 60 dias.' : Math.round(rate) + '% de faltas nos últimos 60 dias (' + ns + ' de ' + (done + ns) + ').' + (rate > 10 ? ' A confirmação de presença e o lembrete por WhatsApp ajudam.' : ''), '#/agenda'));

      var mfa = !!(u.factor && u.factor.verified);
      items.push(item('seguranca', 'consultorio', 'Segurança da conta', mfa ? 100 : 40,
        mfa ? 'Verificação em duas etapas ativa.' : 'Ative a verificação em duas etapas: você cuida de dados de saúde.', '#/ativar-2fa'));
      var hours = !!(H.P(u).hours && H.P(u).hours.length);
      items.push(item('horarios', 'consultorio', 'Horários de atendimento', hours ? 100 : 60,
        hours ? 'Seus horários de atendimento estão definidos.' : 'Defina seus horários de atendimento para os pacientes pedirem consulta.', '#/atendimento'));

      n = count(u.id, t, t);
      items.push(item('carga_dia', 'voce', 'Atendimentos hoje', dl == null ? null : (n <= dl ? 100 : 100 - 25 * (n - dl)),
        dl == null ? plural(n, ' atendimento hoje.', ' atendimentos hoje.') + ' Limite diário ainda não definido.'
          : (n <= dl ? n + ' de ' + dl + ' atendimentos hoje.' : n + ' atendimentos hoje, acima do limite de ' + dl + '. Se puder, reserve uma pausa entre as sessões: cuidar de você também é cuidar dos seus pacientes.'), '#/agenda'));
      n = count(u.id, mon, addDays(mon, 6));
      items.push(item('carga_semana', 'voce', 'Atendimentos na semana', wl == null ? null : (n <= wl ? 100 : 100 - 10 * (n - wl)),
        wl == null ? plural(n, ' atendimento nesta semana.', ' atendimentos nesta semana.') + ' Limite semanal ainda não definido.'
          : (n <= wl ? n + ' de ' + wl + ' atendimentos nesta semana.' : n + ' atendimentos nesta semana, acima do limite de ' + wl + '. Considere aliviar a agenda e separar um tempo para descansar.'), '#/agenda'));

      var run = 0, best = 0;
      for (var i = -13; i <= 6; i++) { var d = addDays(t, i); if (count(u.id, d, d) > 0) { run += 1; best = Math.max(best, run); } else run = 0; }
      items.push(item('descanso', 'voce', 'Dias de descanso', best >= 7 ? 40 : (best === 6 ? 70 : 100),
        best >= 6 ? best + ' dias seguidos com atendimento. Reserve pelo menos um dia de descanso na semana.' : 'Você tem dias de descanso entre os atendimentos.', '#/agenda'));

      var next = mine.filter(function (a) { return (a.status === 'scheduled' || a.status === 'reschedule_proposed') && a.startsAt >= now && a.startsAt < now + 7 * DAY; })
        .sort(function (a, b) { return a.startsAt - b.startsAt; });
      var chain = 0, cbest = 0, prevEnd = null;
      next.forEach(function (a) {
        chain = prevEnd != null && a.startsAt < prevEnd + 10 * MIN ? chain + 1 : 1;
        cbest = Math.max(cbest, chain); prevEnd = a.startsAt + (a.duration || 50) * MIN;
      });
      items.push(item('intervalos', 'voce', 'Intervalos entre sessões', cbest >= 6 ? 40 : (cbest >= 4 ? 70 : 100),
        cbest >= 4 ? cbest + ' sessões seguidas sem 10 minutos de intervalo nos próximos 7 dias. Uma pausa curta entre elas ajuda a manter a atenção.' : 'Suas sessões têm intervalo para respirar.', '#/agenda'));

      function avg(part) { var xs = items.filter(function (x) { return x.part === part && x.score != null; }); return xs.length ? xs.reduce(function (s, x) { return s + x.score; }, 0) / xs.length : null; }
      var a = avg('consultorio'), b = avg('voce');
      var score = Math.round(a == null && b == null ? 100 : (b == null ? a : (a == null ? b : a * 0.6 + b * 0.4)));
      return {
        score: score, level: score >= 80 ? 'ok' : (score >= 50 ? 'warn' : 'bad'),
        parts: [{ key: 'consultorio', title: 'Consultório', weight: 60, score: a == null ? null : Math.round(a), items: items.filter(function (x) { return x.part === 'consultorio'; }) },
          { key: 'voce', title: 'Você', weight: 40, score: b == null ? null : Math.round(b), items: items.filter(function (x) { return x.part === 'voce'; }) }],
        attention: items.filter(function (x) { return x.level === 'warn' || x.level === 'bad'; }).sort(function (x, y) { return x.score - y.score; }),
        limits: { daily: dl, weekly: wl }, generated_at: new Date().toISOString()
      };
    });
  };
})();
