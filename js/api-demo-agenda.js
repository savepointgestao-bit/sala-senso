/* Modo demonstracao, parte da agenda: horarios de atendimento, dias fechados, pedidos de consulta, aprovar, recusar,
   sugerir outro horario, cancelar, avaliacao anonima. Espelha as regras do banco (migracao agenda_online) para
   testar as telas sem servidor. */
(function () {
  'use strict';
  var api = window.API_DEMO, core = api._core, care = api._care, H = care.helpers;
  var S = H.S, P = H.P, tick = core.tick, pgErr = H.pgErr, nid = H.nid;
  var at = H.at, dayOf = H.dayOf, hmOf = H.hmOf, addDays = H.addDays, dow = H.dow, whenText = H.whenText, iso = H.iso, mins = H.mins, hmFrom = H.hmFrom, today = H.today;
  var MIN = 60000, HOUR = 3600000, DAY = 86400000;

  function ms(v) { var t = typeof v === 'number' ? v : Date.parse(v); return isNaN(t) ? null : t; }
  function pro() { return H.needPro(); }

  /* ---------------------------------------------------------------- ocupacao e horarios livres */
  function apptStart(a) { return a.status === 'reschedule_proposed' ? a.proposedStartsAt : a.startsAt; }
  /* Ocupado? Conta consulta marcada, horario sugerido (o novo) e pedido com menos de 48 h. buffer = folga entre consultas. */
  function busy(proId, start, minutes, excludeId, buffer) {
    buffer = buffer || 0;
    var s2 = start, e2 = start + (minutes + buffer) * MIN;
    return S.appts.some(function (a) {
      if (a.proId !== proId || a.id === excludeId) return false;
      var live = a.status === 'scheduled' || a.status === 'reschedule_proposed' || (a.status === 'requested' && a.createdAt > Date.now() - 48 * HOUR);
      if (!live) return false;
      var s1 = apptStart(a), e1 = s1 + (a.duration + buffer) * MIN;
      return s1 < e2 && s2 < e1;
    });
  }
  function blocked(u, start, end) {
    return P(u).blocks.some(function (b) { return b.start < end && start < b.end; });
  }
  /* Todos os inicios possiveis entre duas datas (AAAA-MM-DD), como private.free_slots. */
  function freeSlots(u, from, to) {
    var g = P(u).settings, out = [];
    if (!g.booking_enabled) return out;
    var now = Date.now();
    for (var d = from; d <= to; d = addDays(d, 1)) {
      P(u).hours.filter(function (h) { return h.weekday === dow(d); }).forEach(function (h) {
        var span = mins(h.ends) - mins(h.starts);
        for (var m = 0; m <= span - g.session_minutes; m += g.step_minutes) {
          var t = at(d, hmFrom(mins(h.starts) + m));
          if (t < now + g.min_notice_hours * HOUR || t > now + g.max_days_ahead * DAY) continue;
          if (busy(u.id, t, g.session_minutes, null, g.buffer_minutes)) continue;
          if (blocked(u, t, t + g.session_minutes * MIN)) continue;
          out.push(t);
        }
      });
    }
    return out.sort(function (a, b) { return a - b; });
  }

  /* ---------------------------------------------------------------- formatos de saida */
  function apptJson(a) {
    var r = H.recById(a.recordId);
    return { id: a.id, record_id: a.recordId, full_name: r ? r.name : '', phone: r ? r.phone : null, linked: !!(r && r.userId), starts_at: iso(a.startsAt), duration_minutes: a.duration,
      mode: a.mode, meeting_url: a.meetingUrl || null, status: a.status, proposed_starts_at: iso(a.proposedStartsAt), patient_note: a.patientNote || null,
      decline_reason: a.declineReason || null, price_cents: a.priceCents == null ? null : a.priceCents, payment_status: a.paymentStatus, requested_by_patient: !!a.requestedByPatient,
      created_at: iso(a.createdAt), series_id: a.seriesId || null, charge: a.charge !== false, patient_confirmed_at: confirmedOf(a),
      series_after: a.seriesId ? S.appts.filter(function (x) { return x.seriesId === a.seriesId && x.proId === a.proId && x.id !== a.id && x.startsAt > a.startsAt && x.status === 'scheduled'; }).length : 0 };
  }
  function userOfRecord(recordId) { var r = H.recById(recordId); return r ? r.userId : null; }
  function mineAppt(proId, id) { return S.appts.filter(function (a) { return a.id === id && a.proId === proId; })[0] || null; }

  /* Dia da n-esima consulta da serie. Mensal conta a partir da primeira e ajusta o fim do mes (31 de janeiro, 28 de fevereiro, 31 de marco). */
  function addMonths(day, n) {
    var y = +day.slice(0, 4), m = +day.slice(5, 7) - 1, d = +day.slice(8, 10), t = m + n, y2 = y + Math.floor(t / 12), m2 = ((t % 12) + 12) % 12;
    var last = new Date(Date.UTC(y2, m2 + 1, 0)).getUTCDate();
    function z(k) { return (k < 10 ? '0' : '') + k; }
    return y2 + '-' + z(m2 + 1) + '-' + z(Math.min(d, last));
  }
  function seriesDay(day, every, i) { return every === 'weekly' ? addDays(day, 7 * i) : every === 'biweekly' ? addDays(day, 14 * i) : addMonths(day, i); }

  /* O gatilho do banco: uma consulta "marcada" nao pode sobrepor outra. */
  function guard(a, excludeSelf) {
    if (a.status === 'scheduled' && busy(a.proId, a.startsAt, a.duration, excludeSelf ? a.id : null, 0)) throw pgErr('slot_taken');
  }

  /* ---------------------------------------------------------------- psicologo: configurar a agenda */
  function validTime(v) { return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(v || '')); }
  function inRange(v, lo, hi) { return typeof v === 'number' && v % 1 === 0 && v >= lo && v <= hi; }

  api.agenda = {
    get: function () {
      var u = pro();
      return tick(null).then(function () {
        var pr = P(u);
        return { settings: Object.assign({}, pr.settings),
          hours: pr.hours.slice().sort(function (a, b) { return a.weekday - b.weekday || (a.starts < b.starts ? -1 : 1); }).map(function (h) { return { weekday: h.weekday, starts: h.starts, ends: h.ends }; }),
          blocks: pr.blocks.filter(function (b) { return b.end > Date.now(); }).sort(function (a, b) { return a.start - b.start; })
            .map(function (b) { return { id: b.id, starts_at: iso(b.start), ends_at: iso(b.end), reason: b.reason }; }),
          verified: u.verification === 'verified' };
      });
    },
    save: function (p) {
      var u = pro();
      return tick(null).then(function () {
        if (!p || typeof p !== 'object') throw pgErr('invalid_data');
        var cur = P(u).settings;
        function pick(k, d) { return p[k] == null ? d : p[k]; }
        var next = {
          booking_enabled: p.booking_enabled == null ? false : p.booking_enabled, session_minutes: pick('session_minutes', 50), buffer_minutes: pick('buffer_minutes', 10),
          step_minutes: pick('step_minutes', 60), min_notice_hours: pick('min_notice_hours', 12), max_days_ahead: pick('max_days_ahead', 60),
          price_cents: p.price_cents == null ? null : p.price_cents, accepts_in_person: p.accepts_in_person == null ? true : p.accepts_in_person,
          accepts_online: p.accepts_online == null ? true : p.accepts_online, office_note: String(p.office_note || '').trim() || null };
        if (typeof next.booking_enabled !== 'boolean' || typeof next.accepts_in_person !== 'boolean' || typeof next.accepts_online !== 'boolean') throw pgErr('invalid_data');
        if (!inRange(next.session_minutes, 15, 240) || !inRange(next.buffer_minutes, 0, 120) || [15, 20, 30, 45, 60, 90, 120].indexOf(next.step_minutes) < 0 ||
            !inRange(next.min_notice_hours, 0, 336) || !inRange(next.max_days_ahead, 1, 365) || (next.price_cents != null && !inRange(next.price_cents, 0, 1000000)) ||
            !(next.accepts_in_person || next.accepts_online) || (next.office_note && next.office_note.length > 300)) throw pgErr('invalid_data');
        var hours = p.hours == null ? [] : p.hours;
        if (!Array.isArray(hours) || hours.length > 42) throw pgErr('invalid_data');
        var list = hours.map(function (w) {
          if (!w || !inRange(Number(w.weekday), 0, 6) || !validTime(w.starts) || !validTime(w.ends)) throw pgErr('invalid_data');
          var s = String(w.starts).slice(0, 5), e = String(w.ends).slice(0, 5);
          if (e <= s) throw pgErr('invalid_data');
          return { weekday: Number(w.weekday), starts: s, ends: e };
        });
        for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
          if (list[i].weekday === list[j].weekday && list[i].starts < list[j].ends && list[j].starts < list[i].ends) throw pgErr('hours_overlap');
        }
        P(u).settings = next; P(u).hours = list;
        return true;
      });
    },
    blockAdd: function (startIso, endIso, reason) {
      var u = pro();
      return tick(null).then(function () {
        var s = ms(startIso), e = ms(endIso);
        if (s == null || e == null || e <= s || e > s + 120 * DAY || e < Date.now()) throw pgErr('invalid_data');
        if (P(u).blocks.filter(function (b) { return b.end > Date.now(); }).length >= 200) throw pgErr('too_many_blocks');
        var b = { id: nid('block'), start: s, end: e, reason: String(reason || '').trim().slice(0, 120) || null };
        P(u).blocks.push(b);
        var conflicts = S.appts.filter(function (a) {
          if (a.proId !== u.id || ['scheduled', 'requested', 'reschedule_proposed'].indexOf(a.status) < 0) return false;
          var st = apptStart(a);
          return st < e && s < st + a.duration * MIN;
        }).length;
        return { id: b.id, conflicts: conflicts };
      });
    },
    blockRemove: function (id) {
      var u = pro();
      return tick(null).then(function () {
        var n = P(u).blocks.length;
        P(u).blocks = P(u).blocks.filter(function (b) { return b.id !== id; });
        if (P(u).blocks.length === n) throw pgErr('not_found');
        return true;
      });
    },
    /* ---- ver e mexer na agenda (so psicologo com CRP verificado) */
    view: function (from, to) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        var a0 = at(from, '00:00'), a1 = at(addDays(to, 1), '00:00');
        if (!from || !to || to < from || Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z') > 62 * DAY) throw pgErr('invalid_data');
        var mineAll = S.appts.filter(function (a) { return a.proId === u.id; });
        return {
          appointments: mineAll.filter(function (a) { return a.startsAt >= a0 && a.startsAt < a1 && ['declined', 'canceled_by_patient', 'canceled_by_professional'].indexOf(a.status) < 0; })
            .sort(function (a, b) { return a.startsAt - b.startsAt; }).map(apptJson),
          pending: mineAll.filter(function (a) { return (a.status === 'requested' || a.status === 'reschedule_proposed') && (a.proposedStartsAt || a.startsAt) > Date.now() - DAY; })
            .sort(function (a, b) { return a.createdAt - b.createdAt; }).map(apptJson),
          blocks: P(u).blocks.filter(function (b) { return b.start < a1 && b.end > a0; }).sort(function (a, b) { return a.start - b.start; })
            .map(function (b) { return { id: b.id, starts_at: iso(b.start), ends_at: iso(b.end), reason: b.reason }; })
        };
      });
    },
    create: function (d) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        var r = H.myRec(u, d.recordId);
        if (!r) throw pgErr('not_found');
        var t = ms(d.startsAt);
        if (t == null || t < Date.now() - 400 * DAY || t > Date.now() + 800 * DAY) throw pgErr('invalid_time');
        var g = P(u).settings, dur = d.duration || g.session_minutes || 50;
        if (dur < 15 || dur > 240) throw pgErr('invalid_data');
        var a = { id: nid('appt'), proId: u.id, recordId: r.id, startsAt: t, duration: dur, mode: d.mode || 'in_person', meetingUrl: String(d.meetingUrl || '').trim() || null, status: 'scheduled',
          proposedStartsAt: null, patientNote: null, declineReason: null, priceCents: d.priceCents != null ? d.priceCents : g.price_cents, paymentStatus: 'none', requestedByPatient: false,
          createdAt: Date.now(), decidedAt: Date.now() };
        guard(a, false);
        S.appts.push(a);
        H.notify(r.userId, 'appointment_scheduled', 'Consulta marcada', 'Sua consulta ficou para ' + whenText(t) + '.', '#/consultas');
        return a.id;
      });
    },
    update: function (id, d) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        var a = mineAppt(u.id, id);
        if (!a) throw pgErr('not_found');
        if (a.status !== 'scheduled' && a.status !== 'requested') throw pgErr('invalid_status');
        var before = { startsAt: a.startsAt, duration: a.duration };
        var next = Object.assign({}, a);
        if (d.startsAt) next.startsAt = ms(d.startsAt);
        if (d.duration) next.duration = d.duration;
        if (d.mode) next.mode = d.mode;
        if (d.priceCents != null) next.priceCents = d.priceCents;
        if (d.meetingUrl != null) next.meetingUrl = String(d.meetingUrl).trim() || null;
        if (next.status === 'scheduled' && (next.startsAt !== before.startsAt || next.duration !== before.duration)) guard(next, true);
        Object.assign(a, next);
        if (d.startsAt && next.startsAt !== before.startsAt) H.notify(userOfRecord(a.recordId), 'appointment_moved', 'Horário da consulta mudou', 'Agora é ' + whenText(a.startsAt) + '.', '#/consultas');
        return true;
      });
    },
    setStatus: function (id, status, reason) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        if (['done', 'no_show', 'canceled_by_professional', 'scheduled'].indexOf(status) < 0) throw pgErr('invalid_status');
        var a = mineAppt(u.id, id);
        if (!a) throw pgErr('not_found');
        var isEnd = status === 'done' || status === 'no_show';
        if (isEnd && a.status !== 'scheduled' && a.status !== 'done' && a.status !== 'no_show') throw pgErr('invalid_status');
        if (isEnd && a.startsAt > Date.now()) throw pgErr('too_early');
        if (status === 'canceled_by_professional' && ['scheduled', 'requested', 'reschedule_proposed'].indexOf(a.status) < 0) throw pgErr('invalid_status');
        if (status === 'scheduled' && a.status !== 'done' && a.status !== 'no_show') throw pgErr('invalid_status');
        var next = Object.assign({}, a, { status: status });
        if (status === 'scheduled') guard(next, true);
        Object.assign(a, next);
        a.decidedAt = Date.now();
        if (status === 'canceled_by_professional') {
          a.declineReason = String(reason || '').trim().slice(0, 300) || null;
          H.notify(userOfRecord(a.recordId), 'appointment_canceled', 'Consulta cancelada', 'A consulta de ' + whenText(a.startsAt) + ' foi cancelada.', '#/consultas');
        }
        return true;
      });
    },
    /* Serie de consultas: semanal, quinzenal ou mensal, de 2 a 60. Horario ocupado e pulado e devolvido. */
    createSeries: function (d) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        if (['weekly', 'biweekly', 'monthly'].indexOf(d.every) < 0 || !inRange(d.count, 2, 60)) throw pgErr('invalid_data');
        var r = H.myRec(u, d.recordId);
        if (!r) throw pgErr('not_found');
        var t = ms(d.startsAt);
        if (t == null || t < Date.now() - DAY) throw pgErr('invalid_time');
        var base = dayOf(t), hm = hmOf(t);
        if (at(seriesDay(base, d.every, d.count - 1), hm) > Date.now() + 800 * DAY) throw pgErr('invalid_time');
        var g = P(u).settings, dur = d.duration || g.session_minutes || 50;
        if (dur < 15 || dur > 240) throw pgErr('invalid_data');
        var sid = nid('ser'), created = [], skipped = [];
        for (var i = 0; i < d.count; i++) {
          var when = at(seriesDay(base, d.every, i), hm);
          if (busy(u.id, when, dur, null, 0)) { skipped.push(iso(when)); continue; }
          var a = { id: nid('appt'), proId: u.id, recordId: r.id, startsAt: when, duration: dur, mode: d.mode || 'in_person', meetingUrl: String(d.meetingUrl || '').trim() || null, status: 'scheduled',
            proposedStartsAt: null, patientNote: null, declineReason: null, priceCents: d.priceCents != null ? d.priceCents : g.price_cents, paymentStatus: 'none', requestedByPatient: false,
            createdAt: Date.now(), decidedAt: Date.now(), seriesId: sid };
          S.appts.push(a); created.push(a);
        }
        if (!created.length) throw pgErr('slot_taken');
        H.notify(r.userId, 'appointment_scheduled', 'Consultas marcadas', created.length + ' consultas marcadas, a primeira em ' + whenText(created[0].startsAt) + '.', '#/consultas');
        return { series_id: sid, created: created.length, skipped: skipped };
      });
    },
    /* "Esta e as proximas": cancela esta e as seguintes marcadas da mesma serie (sem serie, so esta). Devolve quantas. */
    cancelFollowing: function (id, reason) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        var a = mineAppt(u.id, id);
        if (!a) throw pgErr('not_found');
        if (['scheduled', 'requested', 'reschedule_proposed'].indexOf(a.status) < 0) throw pgErr('invalid_status');
        var why = String(reason || '').trim().slice(0, 300) || null;
        var list = S.appts.filter(function (x) { return x.proId === u.id && (x.id === a.id || (a.seriesId && x.seriesId === a.seriesId && x.startsAt > a.startsAt && x.status === 'scheduled')); });
        list.forEach(function (x) { x.status = 'canceled_by_professional'; x.declineReason = why; x.decidedAt = Date.now(); });
        H.notify(userOfRecord(a.recordId), 'appointment_canceled', list.length > 1 ? 'Consultas canceladas' : 'Consulta cancelada',
          list.length > 1 ? 'As ' + list.length + ' consultas a partir de ' + whenText(a.startsAt) + ' foram canceladas.' : 'A consulta de ' + whenText(a.startsAt) + ' foi cancelada.', '#/consultas');
        return list.length;
      });
    },
    /* "Esta e as proximas": muda horario (as seguintes andam o mesmo tanto), duracao, modalidade, valor e link. */
    updateFollowing: function (id, d) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        var a = mineAppt(u.id, id);
        if (!a) throw pgErr('not_found');
        if (a.status !== 'scheduled') throw pgErr('invalid_status');
        if (d.duration != null && !inRange(d.duration, 15, 240)) throw pgErr('invalid_data');
        if (d.priceCents != null && !(d.priceCents >= 0 && d.priceCents <= 1000000)) throw pgErr('invalid_data');
        var delta = 0;
        if (d.startsAt) {
          var t = ms(d.startsAt);
          if (t == null || t < Date.now() - 400 * DAY || t > Date.now() + 800 * DAY) throw pgErr('invalid_time');
          delta = t - a.startsAt;
        }
        var list = S.appts.filter(function (x) { return x.proId === u.id && x.status === 'scheduled' && (x.id === a.id || (a.seriesId && x.seriesId === a.seriesId && x.startsAt > a.startsAt)); })
          .sort(function (x, y) { return delta > 0 ? y.startsAt - x.startsAt : x.startsAt - y.startsAt; });
        var snap = list.map(function (x) { return Object.assign({}, x); }), updated = 0, skipped = [];
        try {
          list.forEach(function (x) {
            var start = x.startsAt + delta, dur = d.duration || x.duration;
            if ((start !== x.startsAt || dur !== x.duration) && busy(u.id, start, dur, x.id, 0)) {
              if (x.id === a.id) throw pgErr('slot_taken');
              skipped.push(iso(x.startsAt)); return;
            }
            x.startsAt = start; x.duration = dur;
            if (d.mode) x.mode = d.mode;
            if (d.priceCents != null) x.priceCents = d.priceCents;
            if (d.meetingUrl != null) x.meetingUrl = String(d.meetingUrl).trim() || null;
            updated++;
          });
        } catch (e) { list.forEach(function (x, i) { Object.assign(x, snap[i]); }); throw e; }
        if (delta) H.notify(userOfRecord(a.recordId), 'appointment_moved', updated > 1 ? 'Horários das consultas mudaram' : 'Horário da consulta mudou',
          'Agora é ' + whenText(a.startsAt) + (updated > 1 ? ', e as seguintes acompanham.' : '.'), '#/consultas');
        return { updated: updated, skipped: skipped };
      });
    },
    /* Horarios vagos dentro do atendimento (nao depende do pedido online nem da antecedencia minima). */
    freeSlots: function (from, days, duration) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        var n = days == null ? 21 : days;
        if (!inRange(n, 1, 62) || (duration != null && !inRange(duration, 15, 240))) throw pgErr('invalid_data');
        var g = P(u).settings, dur = duration || g.session_minutes || 50, step = g.step_minutes || 60, buf = g.buffer_minutes == null ? 10 : g.buffer_minutes;
        var d0 = from || today(), now = Date.now(), out = [];
        for (var i = 0; i < n; i++) {
          var day = addDays(d0, i), seen = {}, slots = [];
          P(u).hours.filter(function (h) { return h.weekday === dow(day); }).forEach(function (h) {
            var span = mins(h.ends) - mins(h.starts);
            for (var m = 0; m <= span - dur; m += step) {
              var hm = hmFrom(mins(h.starts) + m), t = at(day, hm);
              if (t <= now || seen[hm] || busy(u.id, t, dur, null, buf) || blocked(u, t, t + dur * MIN)) continue;
              seen[hm] = 1; slots.push(hm);
            }
          });
          slots.sort();
          if (slots.length) out.push({ day: day, slots: slots });
        }
        return { has_hours: P(u).hours.length > 0, duration: dur, days: out };
      });
    },
    respond: function (id, action, newStartsAt, reason) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        if (['approve', 'decline', 'propose'].indexOf(action) < 0) throw pgErr('invalid_data');
        var a = mineAppt(u.id, id);
        if (!a) throw pgErr('not_found');
        if (a.status !== 'requested') throw pgErr('invalid_status');
        var patient = userOfRecord(a.recordId), name = H.nameOf(u);
        if (action === 'approve') {
          if (a.startsAt < Date.now()) throw pgErr('invalid_time');
          var next = Object.assign({}, a, { status: 'scheduled' });
          guard(next, true);
          Object.assign(a, next);
          a.decidedAt = Date.now();
          if (a.priceCents == null) a.priceCents = P(u).settings.price_cents;
          H.notify(patient, 'appointment_approved', 'Consulta confirmada', name + ' confirmou ' + whenText(a.startsAt) + '.', '#/consultas');
        } else if (action === 'decline') {
          a.status = 'declined'; a.decidedAt = Date.now(); a.declineReason = String(reason || '').trim().slice(0, 300) || null;
          H.notify(patient, 'appointment_declined', 'Pedido não aceito', 'O horário de ' + whenText(a.startsAt) + ' não ficou disponível. Você pode escolher outro.', '#/consultas');
        } else {
          var t = ms(newStartsAt);
          if (t == null || t < Date.now() || t > Date.now() + 400 * DAY) throw pgErr('invalid_time');
          if (busy(u.id, t, a.duration, a.id, 0)) throw pgErr('slot_taken');
          a.status = 'reschedule_proposed'; a.proposedStartsAt = t; a.decidedAt = Date.now(); a.declineReason = String(reason || '').trim().slice(0, 300) || null;
          H.notify(patient, 'appointment_proposed', 'Outro horário sugerido', name + ' sugeriu ' + whenText(t) + '. Toque para aceitar ou recusar.', '#/consultas');
        }
        return true;
      });
    },
    markPaid: function (id, paid, method) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!H.verifiedPro(u)) throw pgErr('not_allowed');
        if (typeof paid !== 'boolean') paid = !!paid;
        var a = mineAppt(u.id, id);
        if (!a) throw pgErr('not_found');
        a.paymentStatus = paid ? 'paid' : 'none';
        return true;
      });
    }
  };

  /* ---------------------------------------------------------------- paciente: ver horarios, pedir, responder, cancelar, avaliar */
  function patient() { return H.needPatient(); }
  function linkedPro(u, proId) {
    var p = H.byId(proId);
    if (!p || !H.linked(proId, u.id)) throw pgErr('not_linked');
    return p;
  }
  function mineOfPatient(u) {
    var recs = S.records.filter(function (r) { return r.userId === u.id; }).map(function (r) { return r.id; });
    return S.appts.filter(function (a) { return recs.indexOf(a.recordId) >= 0; });
  }
  function endOf(a) { return (a.proposedStartsAt || a.startsAt) + a.duration * MIN; }
  /* Confirmacao de presenca: vale so para o horario, o tipo e a situacao de quando foi dada (igual ao gatilho do banco: mudou, zerou). */
  function sigOf(a) { return a.startsAt + '|' + a.mode + '|' + a.status; }
  function confirmedOf(a) {
    if (a.confirmedAt && a.confirmSig !== sigOf(a)) { a.confirmedAt = null; a.confirmSig = null; }
    return a.confirmedAt ? iso(a.confirmedAt) : null;
  }
  function reviewable(a) { return (a.status === 'done' || (a.status === 'scheduled' && a.startsAt + a.duration * MIN < Date.now())) && !S.receipts[a.id]; }

  var booking = api.booking;
  booking.info = function (proId) {
    var u = patient();
    return tick(null).then(function () {
      var p = linkedPro(u, proId);
      var g = P(p).settings;
      return { professional_id: p.id, name: H.nameOf(p), enabled: p.verification === 'verified' && !!g.booking_enabled, session_minutes: g.session_minutes, price_cents: g.price_cents,
        accepts_in_person: g.accepts_in_person, accepts_online: g.accepts_online, office_note: g.office_note, min_notice_hours: g.min_notice_hours,
        verified: !!(H.recFor(proId, u.id) || {}).verifiedAt };
    });
  };
  booking.slots = function (proId, from, days) {
    var u = patient();
    return tick(null).then(function () {
      var p = linkedPro(u, proId);
      if (p.verification !== 'verified') return [];
      var d0 = from || today(), n = Math.min(Math.max(days || 14, 1), 31), len = P(p).settings.session_minutes;
      return freeSlots(p, d0, addDays(d0, n - 1)).map(function (t) { return { starts_at: iso(t), ends_at: iso(t + len * MIN) }; });
    });
  };
  booking.request = function (proId, startsAt, mode, note) {
    var u = core.cur();
    return tick(null).then(function () {
      if (!H.isPatientUser(u)) throw pgErr('patients_only');
      var rec = H.recFor(proId, u.id);
      if (!rec) throw pgErr('not_linked');
      if (!rec.verifiedAt) throw pgErr('not_verified');
      var p = H.byId(proId), g = P(p).settings;
      if (p.verification !== 'verified' || !g.booking_enabled) throw pgErr('booking_closed');
      mode = mode || 'in_person';
      if ((mode === 'online' && !g.accepts_online) || (mode === 'in_person' && !g.accepts_in_person)) throw pgErr('mode_not_accepted');
      var t = ms(startsAt);
      if (t == null || t < Date.now() + HOUR || t > Date.now() + 400 * DAY) throw pgErr('invalid_time');
      if (S.appts.filter(function (a) { return a.recordId === rec.id && (a.status === 'requested' || a.status === 'reschedule_proposed'); }).length >= 3) throw pgErr('too_many_requests');
      var day = dayOf(t);
      if (freeSlots(p, day, day).indexOf(t) < 0) throw pgErr('slot_taken');
      var a = { id: nid('appt'), proId: p.id, recordId: rec.id, startsAt: t, duration: g.session_minutes, mode: mode, meetingUrl: null, status: 'requested', proposedStartsAt: null,
        patientNote: String(note || '').trim().slice(0, 300) || null, declineReason: null, priceCents: g.price_cents, paymentStatus: 'none', requestedByPatient: true,
        createdAt: Date.now(), decidedAt: null };
      S.appts.push(a);
      H.notify(p.id, 'appointment_requested', 'Novo pedido de consulta', H.nameOf(u) + ' pediu ' + whenText(t) + '.', '#/agenda');
      return a.id;
    });
  };
  booking.respond = function (id, accept) {
    var u = patient();
    return tick(null).then(function () {
      var a = mineOfPatient(u).filter(function (x) { return x.id === id; })[0];
      if (!a || a.status !== 'reschedule_proposed') throw pgErr('appointment_not_found');
      var name = H.nameOf(u);
      if (accept) {
        if (a.proposedStartsAt < Date.now()) throw pgErr('invalid_time');
        var next = Object.assign({}, a, { status: 'scheduled', startsAt: a.proposedStartsAt, proposedStartsAt: null });
        guard(next, true);
        Object.assign(a, next);
        a.decidedAt = Date.now();
        H.notify(a.proId, 'appointment_accepted', 'Horário aceito', name + ' aceitou ' + whenText(a.startsAt) + '.', '#/agenda');
      } else {
        a.status = 'canceled_by_patient'; a.proposedStartsAt = null; a.decidedAt = Date.now();
        H.notify(a.proId, 'appointment_refused', 'Horário sugerido recusado', name + ' não pôde no novo horário.', '#/agenda');
      }
      return true;
    });
  };
  booking.cancel = function (id) {
    var u = core.cur();
    return tick(null).then(function () {
      if (!u) throw pgErr('not_allowed');
      var a = mineOfPatient(u).filter(function (x) { return x.id === id; })[0];
      if (!a || ['requested', 'scheduled', 'reschedule_proposed'].indexOf(a.status) < 0 || (a.proposedStartsAt || a.startsAt) <= Date.now()) throw pgErr('appointment_not_found');
      var when = a.proposedStartsAt || a.startsAt;
      a.status = 'canceled_by_patient'; a.proposedStartsAt = null; a.decidedAt = Date.now();
      H.notify(a.proId, 'appointment_canceled', 'Consulta cancelada pelo paciente', H.nameOf(u) + ' cancelou ' + whenText(when) + '.', '#/agenda');
      return true;
    });
  };
  booking.confirmAttendance = function (id) {
    var u = patient();
    return tick(null).then(function () {
      var okRecs = S.records.filter(function (r) { return r.userId === u.id && r.verifiedAt; }).map(function (r) { return r.id; });
      var a = mineOfPatient(u).filter(function (x) { return x.id === id && okRecs.indexOf(x.recordId) >= 0; })[0];
      if (!a) throw pgErr('appointment_not_found');
      if (a.status !== 'scheduled') throw pgErr('invalid_status');
      if (a.startsAt + a.duration * MIN <= Date.now()) throw pgErr('too_late');
      var done = confirmedOf(a);
      if (done) return done;
      a.confirmedAt = Date.now(); a.confirmSig = sigOf(a);
      H.notify(a.proId, 'appointment_confirmed', 'Presença confirmada', H.nameOf(u) + ' confirmou presença em ' + whenText(a.startsAt) + '.', '#/agenda');
      return iso(a.confirmedAt);
    });
  };
  booking.mine = function () {
    var u = patient();
    return tick(null).then(function () {
      var okRecs = S.records.filter(function (r) { return r.userId === u.id && r.verifiedAt; }).map(function (r) { return r.id; });
      return mineOfPatient(u).filter(function (a) { return okRecs.indexOf(a.recordId) >= 0; }).sort(function (a, b) { return b.startsAt - a.startsAt; }).slice(0, 100).map(function (a) {
        var p = H.byId(a.proId), g = P(p).settings, sched = a.status === 'scheduled';
        return { id: a.id, professional_id: a.proId, professional_name: H.nameOf(p), starts_at: iso(a.startsAt), duration_minutes: a.duration, mode: a.mode,
          meeting_url: sched ? a.meetingUrl : null, office_note: sched ? g.office_note : null, status: a.status, proposed_starts_at: iso(a.proposedStartsAt),
          decline_reason: a.declineReason || null, price_cents: a.priceCents == null ? null : a.priceCents, payment_status: a.paymentStatus, patient_note: a.patientNote || null,
          patient_confirmed_at: confirmedOf(a), past: endOf(a) < Date.now(), can_review: reviewable(a) };
      });
    });
  };
  booking.review = function (id, stars, liked, suggestion) {
    var u = patient();
    return tick(null).then(function () {
      if (!(stars >= 1 && stars <= 5) || stars % 1 !== 0) throw pgErr('invalid_stars');
      var a = mineOfPatient(u).filter(function (x) { return x.id === id; })[0];
      if (!a) throw pgErr('appointment_not_found');
      if (!(a.status === 'done' || (a.status === 'scheduled' && a.startsAt + a.duration * MIN < Date.now()))) throw pgErr('too_early');
      if (S.receipts[a.id]) throw pgErr('already_reviewed');
      S.receipts[a.id] = u.id;
      /* a avaliacao nao guarda quem avaliou nem qual consulta: so o psicologo, a nota, os textos e o mes */
      S.reviews.push({ proId: a.proId, stars: stars, liked: String(liked || '').trim().slice(0, 1000) || null, suggestion: String(suggestion || '').trim().slice(0, 1000) || null,
        month: dayOf(Date.now()).slice(0, 7) + '-01' });
      return true;
    });
  };

  /* ---------------------------------------------------------------- exemplos do modo demonstracao */
  function nextWorkday(from, skip) {
    var d = addDays(from, skip);
    while (dow(d) === 0 || dow(d) === 6) d = addDays(d, 1);
    return d;
  }
  var baseSeed = care.seedExamples;
  care.seedExamples = function (u) {
    var first = !u.seeded;
    baseSeed(u);
    if (!first) return;
    var pr = P(u);
    pr.settings = { booking_enabled: true, session_minutes: 50, buffer_minutes: 10, step_minutes: 60, min_notice_hours: 12, max_days_ahead: 60, price_cents: 20000,
      accepts_in_person: true, accepts_online: true, office_note: 'Rua das Acácias, 120, sala 4. Chegue 5 minutos antes.' };
    pr.hours = [];
    for (var w = 1; w <= 5; w++) { pr.hours.push({ weekday: w, starts: '08:00', ends: '12:00' }); pr.hours.push({ weekday: w, starts: '14:00', ends: '18:00' }); }
    function rec(name) { return S.records.filter(function (r) { return r.proId === u.id && r.name.indexOf(name) === 0; })[0]; }
    function add(name, day, hm, status, extra) {
      var r = rec(name); if (!r) return;
      S.appts.push(Object.assign({ id: nid('appt'), proId: u.id, recordId: r.id, startsAt: at(day, hm), duration: 50, mode: 'in_person', meetingUrl: null, status: status, proposedStartsAt: null,
        patientNote: null, declineReason: null, priceCents: 20000, paymentStatus: 'none', requestedByPatient: false, createdAt: Date.now() - 3 * HOUR, decidedAt: null }, extra || {}));
    }
    add('Marina', addDays(today(), -7), '14:00', 'done', { paymentStatus: 'paid' });
    add('Marina', addDays(today(), -14), '14:00', 'done', { paymentStatus: 'paid' });
    add('João', addDays(today(), -8), '09:00', 'no_show');
    add('Marina', nextWorkday(today(), 2), '14:00', 'scheduled');
    add('João', nextWorkday(today(), 3), '09:00', 'requested', { requestedByPatient: true, patientNote: 'Prefiro de manhã, se der.' });
    [[5, 'Muito acolhedor e claro.', 'Poderia mandar um resumo no fim.'], [5, 'Me senti ouvida.', null], [4, null, 'Mais horários à noite.'], [5, 'Ajudou muito.', null]].forEach(function (x, i) {
      S.reviews.push({ proId: u.id, stars: x[0], liked: x[1], suggestion: x[2], month: i < 2 ? addDays(today(), -35).slice(0, 7) + '-01' : today().slice(0, 7) + '-01' });
    });
  };

  /* Como no servidor, todo erro chega como promessa recusada (nada de excecao na hora da chamada). */
  ['agenda', 'booking', 'pro', 'notify', 'invite', 'sharing', 'diary'].forEach(function (ns) {
    var o = api[ns];
    Object.keys(o).forEach(function (k) {
      var f = o[k];
      if (typeof f !== 'function') return;
      o[k] = function () { try { return Promise.resolve(f.apply(o, arguments)); } catch (e) { return Promise.reject(e); } };
    });
  });

  /* So para testes: cria uma consulta que ja passou (marcada ha 2 dias) para o paciente logado, com o primeiro psicologo vinculado. */
  api.demoPastAppointment = function () {
    var u = patient();
    var r = S.records.filter(function (x) { return x.userId === u.id; })[0];
    if (!r) return tick(null);
    var g = P(H.byId(r.proId)).settings;
    var a = { id: nid('appt'), proId: r.proId, recordId: r.id, startsAt: at(addDays(today(), -2), '10:00'), duration: g.session_minutes, mode: 'in_person', meetingUrl: null, status: 'scheduled',
      proposedStartsAt: null, patientNote: null, declineReason: null, priceCents: g.price_cents, paymentStatus: 'none', requestedByPatient: false, createdAt: Date.now() - 3 * DAY, decidedAt: Date.now() - 3 * DAY };
    S.appts.push(a);
    return tick(a.id);
  };
})();
