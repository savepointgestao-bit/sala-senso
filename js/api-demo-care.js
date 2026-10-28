/* Modo demonstracao, parte do cuidado: link do psicologo, cadastro com nascimento e responsavel, pacientes (com e sem conta),
   diario com periodos e compartilhamento, relatorio, aniversarios, avaliacoes anonimas, avisos e WhatsApp.
   Espelha as regras do banco (supabase/migrations) para as telas poderem ser testadas sem servidor. */
(function () {
  'use strict';
  var api = window.API_DEMO, core = api._core;
  var err = core.err, tick = core.tick, spDay = core.spDay, round1 = core.round1;
  function pgErr(msg) { return err('P0001', msg); }

  /* ------------------------------------------------------------ estado (some ao recarregar) */
  var S = api._state = { records: [], appts: [], reviews: [], receipts: {}, notes: [], shares: {}, auto: {} };
  var seq = 0;
  function nid(p) { seq += 1; return p + '-' + seq; }

  /* ------------------------------------------------------------ tempo (Sao Paulo, sem horario de verao) */
  var TZ = 'America/Sao_Paulo';
  var FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function parts(ms) { var o = {}; FMT.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; }); return o; }
  function dayOf(ms) { var p = parts(ms); return p.year + '-' + p.month + '-' + p.day; }
  function hmOf(ms) { var p = parts(ms); return p.hour + ':' + p.minute; }
  function at(day, hm) { return Date.parse(day + 'T' + hm + ':00-03:00'); }
  function addDays(day, n) { return dayOf(Date.parse(day + 'T12:00:00-03:00') + n * 86400000); }
  function dow(day) { return new Date(Date.parse(day + 'T12:00:00-03:00')).getUTCDay(); }
  function whenText(ms) { var p = parts(ms); return p.day + '/' + p.month + ' às ' + p.hour + ':' + p.minute; }
  function iso(ms) { return ms == null ? null : new Date(ms).toISOString(); }
  function mins(hm) { var m = /^(\d{2}):(\d{2})/.exec(hm); return +m[1] * 60 + +m[2]; }
  function hmFrom(total) { function z(n) { return (n < 10 ? '0' : '') + n; } return z(Math.floor(total / 60)) + ':' + z(total % 60); }
  function today() { return spDay(0); }

  /* ------------------------------------------------------------ pessoas */
  function users() { return core.users(); }
  function byId(id) { var us = users(); for (var k in us) if (us[k].id === id) return us[k]; return null; }
  function emailOf(u) { var us = users(); for (var k in us) if (us[k] === u) return k; return ''; }
  function me() { var u = core.cur(); if (!u) throw err('not_allowed', 'not_allowed'); return u; }
  function nameOf(u) { return u && u.meta ? u.meta.fullName : ''; }
  function isPro(u) { return u && u.role === 'professional'; }
  function isPatient(u) { return u && u.role === 'patient'; }
  function verifiedPro(u) {
    return !!(u && u.role === 'professional' && u.verification === 'verified' && core.mfaOk(u));
  }
  function needVerified() { var u = core.cur(); if (!verifiedPro(u)) throw err('not_allowed', 'not_allowed'); return u; }
  function needPro() { var u = core.cur(); if (!isPro(u)) throw err('not_allowed', 'not_allowed'); return u; }
  function needPatient() { var u = core.cur(); if (!isPatient(u)) throw err('not_allowed', 'not_allowed'); return u; }
  function consent(u, kind) { var g = null; (u.consents || []).forEach(function (c) { if (c.kind === kind) g = c.granted; }); return !!g; }

  /* estado do psicologo (link, agenda, contato, preferencias de aviso) */
  var ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
  function newCode() {
    var out = '';
    for (var i = 0; i < 10; i++) out += ALPHA[Math.floor(Math.random() * ALPHA.length)];
    return out;
  }
  function P(u) {
    if (!u.pro) {
      u.pro = { code: newCode(), enabled: true, off: [], contact: { enabled: false, phone: null }, hours: [], blocks: [],
        settings: { booking_enabled: false, session_minutes: 50, buffer_minutes: 10, step_minutes: 60, min_notice_hours: 12, max_days_ahead: 60,
          price_cents: null, accepts_in_person: true, accepts_online: true, office_note: null } };
    }
    return u.pro;
  }
  function proByCode(code) {
    var c = String(code || '').trim().toLowerCase(), us = users();
    for (var k in us) {
      var u = us[k];
      if (u.role === 'professional' && P(u).code === c && P(u).enabled && (u.verification === 'pending' || u.verification === 'verified')) return u;
    }
    return null;
  }

  /* ------------------------------------------------------------ regras de idade e responsavel */
  function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d)); }
  function isMinor(birth) {
    if (!validDate(birth)) return false;
    var limit = addDays(today(), 0), y = +limit.slice(0, 4) - 18;
    var lim = y + limit.slice(4);        // mesmo dia e mes, 18 anos atras
    return birth > lim;
  }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function guardianOk(n, p) { return String(n || '').trim().length >= 2 && String(n || '').trim().length <= 120 && digits(p).length >= 8 && String(p || '').length <= 30; }
  /* Devolve o nome do erro do banco ou null. */
  function birthRules(birth, gName, gPhone) {
    if (!birth) return 'birth_date_required';
    if (!validDate(birth) || birth > today() || birth < '1900-01-01') return 'birth_date_invalid';
    if (isMinor(birth) && !guardianOk(gName, gPhone)) return 'guardian_required';
    return null;
  }
  function profileRules(role, d) {
    var name = String(d.fullName || '').trim();
    if (name.length < 2 || name.length > 120) return 'full_name_invalid';
    if (role === 'patient') {
      var bad = birthRules(d.birthDate, d.guardianName, d.guardianPhone);
      if (bad) return bad;
      /* link valido exige o aceite; codigo que nao existe e ignorado em silencio, como no banco */
      if (d.inviteCode && proByCode(d.inviteCode) && d.acceptLink !== true) return 'consent_required';
      return null;
    }
    if (!d.crpRegion || !/^[0-9]{3,8}$/.test(d.crpNumber || '')) return 'crp';
    if (d.birthDate && (!validDate(d.birthDate) || d.birthDate > today() || d.birthDate < '1900-01-01')) return 'birth_date_invalid';
    return null;
  }

  /* ------------------------------------------------------------ fichas (patient_records) */
  function key8(p) { var d = digits(p); return d.length >= 8 ? d.slice(-8) : null; }
  function recFor(proId, userId) { return S.records.filter(function (r) { return r.proId === proId && r.userId === userId; })[0] || null; }
  function recById(id) { return S.records.filter(function (r) { return r.id === id; })[0] || null; }
  function myRec(pro, rid) { var r = recById(rid); return r && r.proId === pro.id ? r : null; }
  function linked(proId, userId) { return !!recFor(proId, userId); }

  /* Liga a conta ao psicologo do codigo (cria a ficha ou reaproveita a ficha cadastrada na mao com o mesmo celular ou e-mail). */
  function linkByCode(u, email, code) {
    var pro = proByCode(code);
    if (!pro || !isPatient(u)) return pro;
    if (linked(pro.id, u.id)) return pro;
    var m = u.meta || {};
    var rec = S.records.filter(function (r) {
      return r.proId === pro.id && !r.userId && ((key8(m.phone) && key8(r.phone) === key8(m.phone)) || (email && r.email && r.email.toLowerCase() === email.toLowerCase()));
    })[0];
    var matched = !!rec, sameMail = false;
    if (rec) {
      /* reaproveitou um cadastro do psicologo: a conferencia so continua se o e-mail tambem bate (celular sozinho nao prova quem e) */
      sameMail = String(rec.email || '').toLowerCase() === String(email || '').toLowerCase();
      rec.userId = u.id; rec.name = m.fullName; rec.phone = m.phone || rec.phone; rec.email = email; rec.birth = m.birthDate || rec.birth;
      rec.guardianName = m.guardianName || rec.guardianName; rec.guardianPhone = m.guardianPhone || rec.guardianPhone;
      if (!sameMail) rec.verifiedAt = null;
    } else {
      rec = { id: nid('rec'), proId: pro.id, userId: u.id, name: m.fullName, phone: m.phone || null, email: email, birth: m.birthDate || null,
        guardianName: m.guardianName || null, guardianPhone: m.guardianPhone || null, guardianAuthAt: null, verifiedAt: null, status: 'active', createdAt: Date.now() };
      S.records.push(rec);
    }
    var link = '#/pacientes/' + rec.id;
    if (matched && rec.verifiedAt) notify(pro.id, 'patient_linked', 'Paciente vinculado', m.fullName + ' criou a conta e já está ligado(a) ao cadastro que você fez.', link);
    else if (matched) notify(pro.id, 'patient_linked', 'Confira o cadastro', m.fullName + ' criou a conta e parece ser o cadastro que você fez, mas o e-mail é outro. Confirme se é a mesma pessoa.', link);
    else notify(pro.id, 'patient_linked', 'Confira o cadastro', m.fullName + ' entrou pelo seu link. Confirme se é seu paciente.', link);
    return pro;
  }

  /* depois que o perfil muda, as fichas ligadas acompanham (nome, celular, e-mail, nascimento, responsavel) */
  function syncProfile(u, email) {
    var m = u.meta || {};
    S.records.forEach(function (r) {
      if (r.userId !== u.id) return;
      r.name = m.fullName; r.phone = m.phone || null; r.email = email;
      r.birth = m.birthDate || r.birth; r.guardianName = m.guardianName || r.guardianName; r.guardianPhone = m.guardianPhone || r.guardianPhone;
    });
  }

  /* ------------------------------------------------------------ avisos */
  var CATEGORY = { appointment_requested: 'requests', appointment_accepted: 'replies', appointment_refused: 'replies', appointment_canceled: 'cancellations', birthday: 'birthdays', patient_linked: 'new_patients' };
  function notify(userId, kind, title, body, link) {
    if (!userId) return;
    var u = byId(userId);
    if (u && u.pro && u.pro.off.indexOf(CATEGORY[kind] || 'other') >= 0) return;
    S.notes.push({ id: nid('note'), userId: userId, kind: kind, title: title.slice(0, 120), body: body ? body.slice(0, 300) : null, link: link ? link.slice(0, 200) : null, readAt: null, createdAt: Date.now() });
  }
  function nextBirthday(birth, day) {
    var y = +day.slice(0, 4), m = +birth.slice(5, 7), d = +birth.slice(8, 10);
    function inYear(yy) {
      var last = new Date(Date.UTC(yy, m, 0)).getUTCDate(), dd = Math.min(d, last);
      return yy + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
    }
    return inYear(y) >= day ? inYear(y) : inYear(y + 1);
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
  function birthdayNotices(u) {
    var t = today(), start = at(t, '00:00');
    S.records.filter(function (r) { return r.proId === u.id && r.birth && r.status !== 'discharged' && nextBirthday(r.birth, t) === t; }).forEach(function (r) {
      var dup = S.notes.some(function (n) { return n.userId === u.id && n.kind === 'birthday' && n.link === '#/pacientes/' + r.id && n.createdAt >= start; });
      if (!dup) notify(u.id, 'birthday', 'Aniversário hoje', r.name + ' faz ' + (+t.slice(0, 4) - +r.birth.slice(0, 4)) + ' anos hoje.', '#/pacientes/' + r.id);
    });
  }

  api.notify = {
    list: function (limit) {
      var u = me();
      return tick(null).then(function () {
        if (verifiedPro(u)) birthdayNotices(u);
        var mine = S.notes.filter(function (n) { return n.userId === u.id; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
        return { unread: mine.filter(function (n) { return !n.readAt; }).length,
          items: mine.slice(0, Math.min(Math.max(limit || 30, 1), 100)).map(function (n) { return { id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: !!n.readAt, created_at: iso(n.createdAt) }; }) };
      });
    },
    markRead: function (ids) {
      var u = me();
      S.notes.forEach(function (n) { if (n.userId === u.id && !n.readAt && (!ids || !ids.length || ids.indexOf(n.id) >= 0)) n.readAt = Date.now(); });
      return tick(true);
    },
    prefs: function () {
      var u = needPro();
      var off = P(u).off;
      return tick({ off: off.slice(), groups: ['requests', 'replies', 'cancellations', 'birthdays', 'new_patients'].map(function (k) { return { key: k, on: off.indexOf(k) < 0 }; }) });
    },
    setPrefs: function (off) {
      var u = needPro();
      return tick(null).then(function () {
        off = off || [];
        var valid = ['requests', 'replies', 'cancellations', 'birthdays', 'new_patients'];
        if (off.length > 5 || off.some(function (k) { return valid.indexOf(k) < 0; })) throw pgErr('invalid_data');
        P(u).off = off.filter(function (k, i) { return off.indexOf(k) === i; }).sort();
        return true;
      });
    }
  };

  /* ------------------------------------------------------------ link do psicologo */
  api.invite = {
    info: function (code) {
      var pro = proByCode(code);
      return tick(pro ? { ok: true, name: nameOf(pro), crp_region: pro.meta.crpRegion, crp_number: pro.meta.crpNumber, verified: pro.verification === 'verified' } : { ok: false });
    },
    mine: function () {
      var u = needPro();
      return tick({ code: P(u).code, enabled: P(u).enabled, linked: S.records.filter(function (r) { return r.proId === u.id && r.userId; }).length });
    },
    regenerate: function () { var u = needPro(); P(u).code = newCode(); return api.invite.mine(); },
    setEnabled: function (on) { var u = needPro(); P(u).enabled = !!on; return api.invite.mine(); },
    use: function (code, accept) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!isPatient(u)) return { ok: false, error: 'patients_only' };
        if (!consent(u, 'portal_health_data')) return { ok: false, error: 'consent_required' };
        var pro = proByCode(code);
        if (!pro) return { ok: false, error: 'invalid_code' };
        if (linked(pro.id, u.id)) return { ok: false, error: 'already_linked' };
        if (accept !== true) return { ok: false, error: 'consent_required' };
        linkByCode(u, emailOf(u), code);
        return { ok: true, professional_id: pro.id, name: nameOf(pro) };
      });
    }
  };

  /* ------------------------------------------------------------ diario com periodos e compartilhamento */
  var PERIODS = ['morning', 'afternoon', 'evening'];
  function validEntryScale(v) { return core.inScale(v); }
  function shareKey(entryId, proId) { return entryId + '|' + proId; }
  function isShared(entryId, proId) { return !!S.shares[shareKey(entryId, proId)]; }
  function myPros(u) { return S.records.filter(function (r) { return r.userId === u.id; }).map(function (r) { return r.proId; }); }
  function entryPeriodBusy(u, date, period, exceptId) {
    return period && u.diary.some(function (e) { return e.id !== exceptId && e.entry_date === date && e.period === period; });
  }

  /* Humor de cada dia: cada "vaga" (manha, tarde, noite e sem periodo) conta uma vez, pelo registro mais recente; o dia vale a media. */
  function moodDays(u, fromDay) {
    var slots = {};
    u.diary.filter(function (e) { return e.entry_date >= fromDay && e.mood != null; }).sort(function (a, b) { return a.created - b.created; }).forEach(function (e) {
      slots[e.entry_date + '|' + (e.period || 'day')] = e.mood;
    });
    var days = {};
    Object.keys(slots).forEach(function (k) { var d = k.split('|'); (days[d[0]] = days[d[0]] || {})[d[1]] = slots[k]; });
    return Object.keys(days).sort().reverse().map(function (d) {
      var v = days[d], vals = Object.keys(v).map(function (k) { return v[k]; });
      var avg = round1(vals.reduce(function (s, x) { return s + x; }, 0) / vals.length);
      return { date: d, mood: avg, n: vals.length, morning: v.morning == null ? null : v.morning, afternoon: v.afternoon == null ? null : v.afternoon,
        evening: v.evening == null ? null : v.evening, whole: v.day == null ? null : v.day };
    });
  }
  function ordered(u) {
    return u.diary.slice().sort(function (a, b) { return a.entry_date === b.entry_date ? (a.created < b.created ? 1 : -1) : (a.entry_date < b.entry_date ? 1 : -1); });
  }

  api.diary = {
    list: function () { var u = me(); return tick(ordered(u).map(core.copyEntry)); },
    get: function (id) { var e = me().diary.filter(function (x) { return x.id === id; })[0]; return tick(e ? core.copyEntry(e) : null); },
    save: function (d) {
      var u = core.cur();
      return tick(null).then(function () {
        if (!isPatient(u)) throw pgErr('not_allowed');
        if (!consent(u, 'diary')) throw pgErr('consent_required');
        var tags = d.tags || [], body = String(d.body || '').trim();
        var date = d.entry_date || today();
        if (date > addDays(today(), 1) || date < addDays(today(), -366)) throw pgErr('invalid_date');
        var period = d.period || null;
        if (period && PERIODS.indexOf(period) < 0) throw pgErr('invalid_period');
        if (period && d.mood == null) throw pgErr('period_needs_mood');
        if (d.mood == null && d.energy == null && d.anxiety == null && !tags.length && !body) throw pgErr('empty_entry');
        if (tags.length > 6 || tags.some(function (t) { return core.TAGS.indexOf(t) < 0; }) || body.length > 20000 || !validEntryScale(d.mood) || !validEntryScale(d.energy) || !validEntryScale(d.anxiety)) throw err('23514', 'check violation');
        var e = null, created = false;
        if (d.id) {
          e = u.diary.filter(function (x) { return x.id === d.id; })[0];
          if (!e) throw pgErr('not_found');
          if (entryPeriodBusy(u, date, period, e.id)) throw pgErr('period_taken');
        } else if (period) {
          e = u.diary.filter(function (x) { return x.entry_date === date && x.period === period; })[0] || null;
        }
        if (!e) { e = { id: 'entry-' + core.next(), created: core.next() }; u.diary.push(e); created = true; }
        e.entry_date = date; e.period = period; e.mood = d.mood == null ? null : d.mood; e.energy = d.energy == null ? null : d.energy;
        e.anxiety = d.anxiety == null ? null : d.anxiety; e.tags = tags.slice(); e.body = body; e.updated_at = new Date().toISOString();
        if (d.share === true) myPros(u).forEach(function (p) { S.shares[shareKey(e.id, p)] = true; });
        else if (d.share === false) Object.keys(S.shares).forEach(function (k) { if (k.indexOf(e.id + '|') === 0) delete S.shares[k]; });
        else if (created) myPros(u).forEach(function (p) { if (S.auto[u.id + '|' + p]) S.shares[shareKey(e.id, p)] = true; });
        if (body.length >= 10) core.award(u, 'diary_entry', 1, e.id);
        if (e.mood != null) core.award(u, 'mood_checkin', 0.5, e.id);
        var out = core.copyEntry(e); out.created = created;
        return out;
      });
    },
    moodDays: function (days) { var u = needPatient(); return tick(moodDays(u, addDays(today(), -Math.min(Math.max(days || 30, 1), 366)))); },
    remove: function (id) {
      var u = me();
      u.diary = u.diary.filter(function (x) { return x.id !== id; });
      Object.keys(S.shares).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete S.shares[k]; });
      return tick(true);   /* o XP ja ganho nao some */
    }
  };

  api.sharing = {
    mine: function () {
      var u = needPatient();
      return tick(S.records.filter(function (r) { return r.userId === u.id; }).map(function (r) {
        var pro = byId(r.proId);
        return { professional_id: pro.id, name: nameOf(pro), crp_region: pro.meta.crpRegion, crp_number: pro.meta.crpNumber, verified: pro.verification === 'verified',
          linked_at: iso(r.createdAt), auto_share: !!S.auto[u.id + '|' + pro.id],
          shared_entries: u.diary.filter(function (e) { return isShared(e.id, pro.id); }).length };
      }).filter(function (x) { var p = byId(x.professional_id); return p.verification === 'pending' || p.verification === 'verified'; }));
    },
    setAuto: function (proId, on) {
      var u = needPatient();
      return tick(null).then(function () {
        if (!linked(proId, u.id)) throw pgErr('not_linked');
        if (on && !consent(u, 'diary')) throw pgErr('consent_required');
        S.auto[u.id + '|' + proId] = !!on;
        return true;
      });
    },
    share: function (entryId, proId, shared) {
      var u = needPatient();
      return tick(null).then(function () {
        if (!u.diary.some(function (e) { return e.id === entryId; })) throw pgErr('not_found');
        if (shared) {
          if (!linked(proId, u.id)) throw pgErr('not_linked');
          if (!consent(u, 'diary')) throw pgErr('consent_required');
          S.shares[shareKey(entryId, proId)] = true;
        } else delete S.shares[shareKey(entryId, proId)];
        return true;
      });
    },
    entryShares: function () {
      var u = needPatient();
      return tick(Object.keys(S.shares).map(function (k) { var p = k.split('|'); return { entry_id: p[0], professional_id: p[1] }; })
        .filter(function (x) { return u.diary.some(function (e) { return e.id === x.entry_id; }); }));
    },
    unlink: function (proId) {
      var u = needPatient();
      return tick(null).then(function () {
        var r = recFor(proId, u.id);
        if (!r) throw pgErr('not_linked');
        r.userId = null;
        Object.keys(S.shares).forEach(function (k) { var p = k.split('|'); if (p[1] === proId && u.diary.some(function (e) { return e.id === p[0]; })) delete S.shares[k]; });
        delete S.auto[u.id + '|' + proId];
        return true;
      });
    }
  };

  /* ------------------------------------------------------------ psicologo: acompanhamento, pacientes, relatorio */
  function checkinsOf(u, days) {
    var from = addDays(today(), -days);
    return u.diary.filter(function (c) { return c.entry_date >= from && (c.mood != null || c.energy != null || c.anxiety != null); })
      .sort(function (a, b) { return a.entry_date === b.entry_date ? b.created - a.created : (a.entry_date < b.entry_date ? 1 : -1); })
      .map(function (c) { return { entry_date: c.entry_date, period: c.period || null, mood: c.mood, energy: c.energy, anxiety: c.anxiety }; });
  }
  function sharedCount(u, proId) { return u.diary.filter(function (e) { return isShared(e.id, proId); }).length; }

  var pro = api.pro = {
    overview: function (days) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw err('not_allowed', 'not_allowed');
        var span = Math.min(Math.max(Number(days) || 30, 1), 90);
        return S.records.filter(function (r) { return r.proId === pu.id && r.userId; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(function (r) {
          var pt = byId(r.userId);
          if (!consent(pt, 'diary')) return { record_id: r.id, full_name: r.name, consent: false, verified: !!r.verifiedAt, linked_at: iso(r.createdAt) };
          var pr = core.progressOf(pt);
          return { record_id: r.id, full_name: r.name, consent: true, verified: !!r.verifiedAt, linked_at: iso(r.createdAt), level: pr.level, xp_into_level: pr.xp_into_level, xp_per_level: pr.xp_per_level,
            days_this_week: pr.days_this_week, shared_entries: sharedCount(pt, pu.id), days: moodDays(pt, addDays(today(), -span)), checkins: checkinsOf(pt, span) };
        });
      });
    },
    sharedEntries: function (recordId, days) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw err('not_allowed', 'not_allowed');
        var r = myRec(pu, recordId);
        if (!r || !r.userId) throw pgErr('not_linked');
        var pt = byId(r.userId);
        if (!consent(pt, 'diary')) return [];
        var from = addDays(today(), -Math.min(Math.max(days || 90, 1), 366));
        return ordered(pt).filter(function (e) { return isShared(e.id, pu.id) && e.entry_date >= from; }).map(function (e) {
          return { id: e.id, entry_date: e.entry_date, period: e.period || null, mood: e.mood, energy: e.energy, anxiety: e.anxiety, tags: e.tags.slice(), body: e.body, created_at: iso(e.created) };
        });
      });
    },
    linkedPatients: function () {
      var pu = needPro();
      return tick(S.records.filter(function (r) { return r.proId === pu.id && r.userId; }).map(function (r) {
        return { record_id: r.id, user_id: r.userId, full_name: r.name, email: r.email, phone: r.phone, birth_date: r.birth, linked_at: iso(r.createdAt) };
      }));
    },
    unlinkPatient: function (recordId) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw err('not_allowed', 'not_allowed');
        var r = myRec(pu, recordId);
        if (!r || !r.userId) throw pgErr('not_linked');
        var uid = r.userId, pt = byId(uid);
        r.userId = null;
        Object.keys(S.shares).forEach(function (k) { var p = k.split('|'); if (p[1] === pu.id && pt.diary.some(function (e) { return e.id === p[0]; })) delete S.shares[k]; });
        delete S.auto[uid + '|' + pu.id];
        return true;
      });
    },
    patients: function () {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw err('not_allowed', 'not_allowed');
        return S.records.filter(function (r) { return r.proId === pu.id; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); }).map(function (r) {
          var pt = r.userId ? byId(r.userId) : null, c = !!(pt && consent(pt, 'diary'));
          var mine = S.appts.filter(function (a) { return a.recordId === r.id; });
          var nextAp = mine.filter(function (a) { return a.status === 'scheduled' && a.startsAt > Date.now(); }).map(function (a) { return a.startsAt; }).sort()[0];
          var moods = c ? pt.diary.filter(function (e) { return e.mood != null; }).map(function (e) { return e.entry_date; }).sort().pop() : null;
          return { record_id: r.id, full_name: r.name, phone: r.phone, email: r.email, birth_date: r.birth, status: r.status, created_at: iso(r.createdAt), linked: !!r.userId, verified: !!r.verifiedAt,
            minor: isMinor(r.birth), guardian_name: r.guardianName, guardian_phone: r.guardianPhone, guardian_authorized: !!r.guardianAuthAt, consent: c,
            next_appointment: nextAp ? iso(nextAp) : null, sessions_done: mine.filter(function (a) { return a.status === 'done'; }).length,
            pending_requests: mine.filter(function (a) { return a.status === 'requested'; }).length, last_mood_day: moods || null };
        });
      });
    },
    savePatient: function (d) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw pgErr('not_allowed');
        var name = String(d.name || '').trim(), phone = String(d.phone || '').trim() || null, email = String(d.email || '').trim().toLowerCase() || null;
        var gn = String(d.guardianName || '').trim() || null, gp = String(d.guardianPhone || '').trim() || null, birth = d.birth || null;
        if (name.length < 2 || name.length > 120) throw pgErr('full_name_invalid');
        if (phone && (phone.length > 30 || digits(phone).length < 8)) throw pgErr('phone_invalid');
        if (email && (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) throw pgErr('email_invalid');
        if (birth && (!validDate(birth) || birth > today() || birth < '1900-01-01')) throw pgErr('birth_date_invalid');
        if (gn && (gn.length < 2 || gn.length > 120)) throw pgErr('guardian_invalid');
        if (gp && (gp.length > 30 || digits(gp).length < 8)) throw pgErr('phone_invalid');
        if (!d.id) {
          if (!birth) throw pgErr('birth_date_required');
          if (isMinor(birth) && !gn) throw pgErr('guardian_required');
          if (!email) throw pgErr('email_required');
          var r = { id: nid('rec'), proId: pu.id, userId: null, name: name, phone: phone, email: email, birth: birth,
            guardianName: isMinor(birth) ? gn : null, guardianPhone: isMinor(birth) ? gp : null, guardianAuthAt: null, verifiedAt: Date.now(), status: 'active', createdAt: Date.now() };
          S.records.push(r);
          return r.id;
        }
        var rec = myRec(pu, d.id);
        if (!rec) throw pgErr('not_found');
        if (!rec.userId && !email) throw pgErr('email_required');
        if (!rec.userId) {
          rec.name = name; rec.phone = phone; rec.email = email; rec.birth = birth || rec.birth; rec.guardianName = gn || rec.guardianName; rec.guardianPhone = gp || rec.guardianPhone;
        } else {
          rec.birth = rec.birth || birth; rec.guardianName = rec.guardianName || gn; rec.guardianPhone = rec.guardianPhone || gp;
        }
        return rec.id;
      });
    },
    /* conferir (ou desfazer) o cadastro de um paciente; o paciente com conta recebe um aviso na primeira conferencia */
    setVerified: function (recordId, on) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw pgErr('not_allowed');
        var r = myRec(pu, recordId);
        if (!r) throw pgErr('not_found');
        if (on === false) r.verifiedAt = null;
        else if (!r.verifiedAt) {
          r.verifiedAt = Date.now();
          if (r.userId) notify(r.userId, 'record_verified', 'Cadastro confirmado', nameOf(pu) + ' confirmou seu cadastro. Agora você já pode pedir consulta.', '#/consultas');
        }
        return true;
      });
    },
    setGuardianAuth: function (recordId, on) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw pgErr('not_allowed');
        var r = myRec(pu, recordId);
        if (!r) throw pgErr('not_found');
        r.guardianAuthAt = on === false ? null : Date.now();
        return true;
      });
    },
    birthdays: function (days) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw pgErr('not_allowed');
        var t = today(), lim = Math.min(Math.max(days || 30, 1), 366);
        return S.records.filter(function (r) { return r.proId === pu.id && r.birth && r.status !== 'discharged'; }).map(function (r) {
          var nxt = nextBirthday(r.birth, t);
          return { record_id: r.id, full_name: r.name, phone: r.phone, birth_date: r.birth, linked: !!r.userId, next: nxt, days_until: daysBetween(t, nxt), turning: +nxt.slice(0, 4) - +r.birth.slice(0, 4) };
        }).filter(function (x) { return x.days_until <= lim; }).sort(function (a, b) { return a.next === b.next ? (a.full_name < b.full_name ? -1 : 1) : (a.next < b.next ? -1 : 1); });
      });
    },
    report: function (recordId, days) {
      var pu = core.cur();
      return tick(null).then(function () {
        if (!verifiedPro(pu)) throw pgErr('not_allowed');
        var r = myRec(pu, recordId);
        if (!r) throw pgErr('not_found');
        var span = Math.min(Math.max(days || 90, 7), 366), from = addDays(today(), -span);
        var pt = r.userId ? byId(r.userId) : null, c = !!(pt && consent(pt, 'diary'));
        var mine = S.appts.filter(function (a) { return a.recordId === r.id; });
        var sessions = {
          done: mine.filter(function (a) { return a.status === 'done'; }).length, no_show: mine.filter(function (a) { return a.status === 'no_show'; }).length,
          canceled: mine.filter(function (a) { return a.status === 'canceled_by_patient' || a.status === 'canceled_by_professional'; }).length,
          upcoming: mine.filter(function (a) { return a.status === 'scheduled' && a.startsAt > Date.now(); }).length,
          next: (function () { var x = mine.filter(function (a) { return a.status === 'scheduled' && a.startsAt > Date.now(); }).map(function (a) { return a.startsAt; }).sort()[0]; return x ? iso(x) : null; })(),
          last: (function () { var x = mine.filter(function (a) { return a.status === 'done'; }).map(function (a) { return a.startsAt; }).sort().pop(); return x ? iso(x) : null; })(),
          recent: mine.filter(function (a) { return ['declined', 'requested', 'reschedule_proposed'].indexOf(a.status) < 0; }).sort(function (a, b) { return b.startsAt - a.startsAt; }).slice(0, 12)
            .map(function (a) { return { id: a.id, starts_at: iso(a.startsAt), status: a.status, mode: a.mode }; })
        };
        var out = { record_id: r.id, full_name: r.name, phone: r.phone, email: r.email, birth_date: r.birth, created_at: iso(r.createdAt), minor: isMinor(r.birth),
          guardian_name: r.guardianName, guardian_phone: r.guardianPhone, guardian_authorized: !!r.guardianAuthAt, linked: !!r.userId, verified: !!r.verifiedAt, consent: c, period_days: span,
          level: null, xp_into_level: null, xp_per_level: null, days_this_week: null, sessions: sessions, mood: null };
        if (c) {
          var pr = core.progressOf(pt);
          out.level = pr.level; out.xp_into_level = pr.xp_into_level; out.xp_per_level = pr.xp_per_level; out.days_this_week = pr.days_this_week;
          out.mood = moodReport(pt, from, span, pu.id);
        }
        return out;
      });
    },
    reviews: function () {
      var pu = needPro();
      return tick(null).then(function () {
        var mine = S.reviews.filter(function (x) { return x.proId === pu.id; });
        if (mine.length < 3) return { count: mine.length, hidden: true, needed: 3 };
        var dist = {}; [1, 2, 3, 4, 5].forEach(function (s) { dist[s] = mine.filter(function (x) { return x.stars === s; }).length; });
        var months = {};
        mine.forEach(function (x) { (months[x.month] = months[x.month] || []).push(x.stars); });
        function avg(l) { return Math.round(l.reduce(function (s, x) { return s + x; }, 0) / l.length * 100) / 100; }
        var comments = mine.filter(function (x) { return x.liked || x.suggestion; }).map(function (x) { return { stars: x.stars, liked: x.liked, suggestion: x.suggestion }; });
        comments.sort(function (a, b) { return (a.liked || a.suggestion || '') < (b.liked || b.suggestion || '') ? -1 : 1; });   /* sem data, ordem que nao revela quando */
        return { count: mine.length, hidden: false, avg: avg(mine.map(function (x) { return x.stars; })), distribution: dist,
          by_month: Object.keys(months).sort().filter(function (k) { return months[k].length >= 3; }).map(function (k) { return { month: k, n: months[k].length, avg: avg(months[k]) }; }),
          comments: comments };
      });
    },
    contact: function () {
      var u = needPro();
      var c = P(u).contact, ph = u.meta.phone || null;
      return tick({ whatsapp_enabled: c.enabled, whatsapp_phone: c.phone, profile_phone: ph, suggested_phone: waNumber(ph) });
    },
    saveContact: function (enabled, phone) {
      var u = needPro();
      return tick(null).then(function () {
        var n = waNumber(phone);
        if (String(phone || '').trim() && !n) throw pgErr('phone_invalid');
        if (enabled && !n) throw pgErr('phone_invalid');
        P(u).contact = { enabled: !!enabled, phone: n };
        return { whatsapp_enabled: !!enabled, whatsapp_phone: n };
      });
    }
  };

  /* Numero no formato do link do WhatsApp: so digitos, com 55 na frente. */
  function waNumber(p) {
    var d = digits(p).replace(/^0+/, '');
    return d.length >= 10 && d.length <= 11 ? '55' + d : (d.length >= 12 && d.length <= 13 ? d : null);
  }

  /* Relatorio de humor (mesmos numeros do banco) */
  function moodReport(pt, from, span, proId) {
    var m = moodDays(pt, from);                    // do mais novo para o mais antigo
    var asc = m.slice().reverse();
    var ea = {};
    pt.diary.filter(function (d) { return d.entry_date >= from; }).forEach(function (d) { (ea[d.entry_date] = ea[d.entry_date] || []).push(d); });
    function avgOf(list, f) { var v = list.map(f).filter(function (x) { return x != null; }); return v.length ? round1(v.reduce(function (s, x) { return s + x; }, 0) / v.length) : null; }
    var eaDay = {};
    Object.keys(ea).forEach(function (k) { eaDay[k] = { energy: avgOf(ea[k], function (x) { return x.energy; }), anxiety: avgOf(ea[k], function (x) { return x.anxiety; }) }; });
    var daysAll = {};
    m.forEach(function (x) { daysAll[x.date] = true; }); Object.keys(eaDay).forEach(function (k) { daysAll[k] = true; });
    var moodByDay = {}; m.forEach(function (x) { moodByDay[x.date] = x.mood; });
    var series = Object.keys(daysAll).sort().map(function (d) { return { date: d, mood: moodByDay[d] == null ? null : moodByDay[d], energy: eaDay[d] ? eaDay[d].energy : null, anxiety: eaDay[d] ? eaDay[d].anxiety : null }; });
    function avgMood(list) { return list.length ? round1(list.reduce(function (s, x) { return s + x.mood; }, 0) / list.length) : null; }
    function avgOfNums(list) { var v = list.filter(function (x) { return x != null; }); return v.length ? round1(v.reduce(function (s, x) { return s + x; }, 0) / v.length) : null; }
    // sequencias de dias seguidos com registro
    var runs = [], cur = null;
    asc.forEach(function (x) {
      if (cur && daysBetween(cur.e, x.date) === 1) { cur.e = x.date; cur.n += 1; } else { cur = { s: x.date, e: x.date, n: 1 }; runs.push(cur); }
    });
    var t = today(), curRun = runs.filter(function (r) { return r.e >= addDays(t, -1); }).sort(function (a, b) { return b.e < a.e ? -1 : 1; })[0];
    var best = m.slice().sort(function (a, b) { return b.mood - a.mood || (a.date < b.date ? 1 : -1); })[0];
    var worst = m.slice().sort(function (a, b) { return a.mood - b.mood || (a.date < b.date ? 1 : -1); })[0];
    var lows = m.filter(function (x) { return x.mood <= 2; });
    var recent = m.filter(function (x) { return x.date > addDays(t, -14); }), prior = m.filter(function (x) { return x.date <= addDays(t, -14) && x.date > addDays(t, -28); });
    var byWeekday = [0, 1, 2, 3, 4, 5, 6].map(function (g) { return avgMood(m.filter(function (x) { return dow(x.date) === g; })); });
    var dist = {}; [1, 2, 3, 4, 5].forEach(function (v) { dist[v] = m.filter(function (x) { return Math.round(x.mood) === v; }).length; });
    var shared = pt.diary.filter(function (e) { return isShared(e.id, proId); });
    return {
      days: m, series: series, avg_mood: avgMood(m), avg_energy: avgOfNums(Object.keys(eaDay).map(function (k) { return eaDay[k].energy; })),
      avg_anxiety: avgOfNums(Object.keys(eaDay).map(function (k) { return eaDay[k].anxiety; })), days_with_record: m.length, tracking_rate: Math.round(m.length / span * 100),
      best: best ? { date: best.date, mood: best.mood } : null, worst: worst ? { date: worst.date, mood: worst.mood } : null,
      low_days: lows.length, last_low_day: lows.length ? lows[0].date : null,
      trend: recent.length && prior.length ? round1(avgMood(recent) - avgMood(prior)) : null,
      by_period: { morning: avgOfNums(m.map(function (x) { return x.morning; })), afternoon: avgOfNums(m.map(function (x) { return x.afternoon; })),
        evening: avgOfNums(m.map(function (x) { return x.evening; })), whole: avgOfNums(m.map(function (x) { return x.whole; })) },
      by_weekday: byWeekday, distribution: dist, streak_current: curRun ? curRun.n : 0, streak_best: runs.reduce(function (s, r) { return Math.max(s, r.n); }, 0),
      shared_entries: shared.length, last_shared: shared.length ? shared.map(function (e) { return e.entry_date; }).sort().pop() : null
    };
  }

  /* ------------------------------------------------------------ paciente: meus psicologos */
  api.booking = api.booking || {};
  api.booking.psychologists = function () {
    var u = needPatient();
    return tick(S.records.filter(function (r) { return r.userId === u.id; }).map(function (r) {
      var p = byId(r.proId), c = P(p).contact;
      return { professional_id: p.id, full_name: nameOf(p), whatsapp: c.enabled ? c.phone : null, verified: !!r.verifiedAt, booking_enabled: !!P(p).settings.booking_enabled };
    }));
  };

  /* ------------------------------------------------------------ ganchos usados por api-demo.js */
  api._care = {
    profileRules: profileRules, birthRules: birthRules, isMinor: isMinor, syncProfile: syncProfile,
    afterCreate: function (u, email, role, data) {
      if (role === 'patient' && data.inviteCode && data.acceptLink === true) linkByCode(u, email, data.inviteCode);
      if (role === 'professional') P(u);
    },
    afterDelete: function (u) {
      S.records = S.records.filter(function (r) { return r.proId !== u.id; });
      S.records.forEach(function (r) { if (r.userId === u.id) r.userId = null; });
      S.appts = S.appts.filter(function (a) { return a.proId !== u.id; });
      S.notes = S.notes.filter(function (n) { return n.userId !== u.id; });
      Object.keys(S.receipts).forEach(function (k) { if (S.receipts[k] === u.id) delete S.receipts[k]; });
    },
    exportFor: function (u) {
      return { notifications: S.notes.filter(function (n) { return n.userId === u.id; }).map(function (n) { return { kind: n.kind, title: n.title, body: n.body, created_at: iso(n.createdAt) }; }),
        reviews_sent: Object.keys(S.receipts).filter(function (k) { return S.receipts[k] === u.id; }).length };
    },
    seedExamples: function (u) {
      if (u.seeded) return; u.seeded = true;
      P(u);
      var seeds = [
        { name: 'Marina Souza', email: 'marina.souza@exemplo.demo', xp: 85.5, week: 5, mood: [4, 3, 4, 5, 4, null, 4, 3, 3, 4, 2, 3, 4, 3], energy: 3, anxiety: 2, birth: '1991-03-14' },
        { name: 'João Pereira', email: 'joao.pereira@exemplo.demo', xp: 31, week: 2, mood: [2, null, 3, 2, null, 2, 3, 2, 1, 2, null, 3, 2, 2], energy: 2, anxiety: 4, birth: '1984-11-02' },
        { name: 'Rafael Lima', email: 'rafael.lima@exemplo.demo', xp: 4, week: 1, mood: [null, null, null, null, null, null, null, null, null, null, null, null, 3, 4], energy: 4, anxiety: 3, birth: '1999-07-21' },
        { name: 'Carla Mendes', email: 'carla.mendes@exemplo.demo', consent: false, birth: '1976-05-30' }
      ];
      seeds.forEach(function (sd) {
        var id = core.next(), pt = users()[sd.email] = { id: 'demo-' + id, password: null, confirmed: true, role: 'patient', meta: { fullName: sd.name, phone: '', birthDate: sd.birth }, factor: null,
          verification: null, created: new Date().toISOString(), diary: [], xp: [], consents: [{ kind: 'portal_health_data', granted: true }] };
        if (sd.consent !== false) {
          pt.consents.push({ kind: 'diary', granted: true });
          pt.xp.push({ kind: 'seed', points: sd.xp, ref: 'seed', day: spDay(30) });
          for (var w = 0; w < sd.week; w++) pt.xp.push({ kind: 'seed', points: 0, ref: 'seed-w' + w, day: spDay(w) });
          sd.mood.forEach(function (m, i) {
            var off = 13 - i;
            if (m == null) return;
            pt.diary.push({ id: 'entry-' + core.next(), created: core.next(), entry_date: spDay(off), period: null, mood: m, energy: Math.min(5, Math.max(1, sd.energy + (i % 3) - 1)),
              anxiety: Math.min(5, Math.max(1, sd.anxiety + (i % 2))), tags: [], body: '', updated_at: new Date().toISOString() });
          });
        }
        S.records.push({ id: 'rec-demo-' + (S.records.length + 1), proId: u.id, userId: pt.id, name: sd.name, phone: null, email: sd.email, birth: sd.birth, guardianName: null, guardianPhone: null,
          guardianAuthAt: null, verifiedAt: Date.now() - 20 * 86400000, status: 'active', createdAt: Date.now() - 20 * 86400000 });
      });
    },
    helpers: { S: S, P: P, byId: byId, emailOf: emailOf, nameOf: nameOf, verifiedPro: verifiedPro, needVerified: needVerified, needPro: needPro, needPatient: needPatient,
      recById: recById, recFor: recFor, myRec: myRec, linked: linked, isPatientUser: isPatient, notify: notify, pgErr: pgErr, nid: nid, at: at, dayOf: dayOf, hmOf: hmOf, addDays: addDays, dow: dow, whenText: whenText,
      iso: iso, mins: mins, hmFrom: hmFrom, today: today, consent: consent, isMinor: isMinor }
  };
})();
