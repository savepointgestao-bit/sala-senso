/* API de DEMONSTRACAO: mesma interface da API real, tudo na memoria do navegador (some ao recarregar).
   Serve para ver e testar as telas sem servidor. Codigo de 2 fatores aceito: 123456. */
(function () {
  'use strict';
  var users = {};          // email -> { id, password, confirmed, meta, factor, consents[] }
  var session = null;      // { email, aal }
  var tickets = [];
  var listeners = [];
  var seq = 0;
  var lastAuth = 0;        // quando a pessoa confirmou a identidade (senha ou codigo), como o amr do token
  var keepFlag = true;
  var mfaRequired = false;   /* como no banco: 2 fatores do psicologo e recomendado; a equipe pode tornar obrigatorio */
  var adminMfaRequired = true;   /* como no banco (require_admin_mfa = 'true' por padrao): so a conta de admin e OBRIGADA a usar o codigo; os outros, nao */
  var roleHint = null;       /* tipo de conta escolhido antes de entrar com Google ou Microsoft */

  function err(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function emit(ev) { listeners.forEach(function (f) { try { f(ev); } catch (e) { /* ignore */ } }); }
  function tick(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 60); }); }
  function cur() { return session ? users[session.email] : null; }
  function recent() { return Date.now() - lastAuth <= 600000; }

  /* Mesmas regras do banco para baixar ou apagar dados: profissional com 2 fatores e identidade confirmada ha ate 10 min. */
  /* Igual ao banco: o codigo (aal2) vale sempre para quem cadastrou o app autenticador; sem app, so se a obrigatoriedade estiver ligada. */
  function mfaOk(u) { return session.aal === 'aal2' || (!mfaRequired && !(u.factor && u.factor.verified)); }
  /* Conta de equipe valida: admin E (codigo confirmado, ou sem app cadastrado enquanto a obrigatoriedade da equipe estiver desligada). */
  function adminOk(u) { return !!(u && u.admin && session && (session.aal === 'aal2' || (!adminMfaRequired && !(u.factor && u.factor.verified)))); }
  function sensitive(u) {
    if (!u || !session) throw err('not_allowed', 'not_allowed');
    if (u.role === 'professional' && !mfaOk(u)) throw err('mfa_required', 'mfa_required');
    if (Date.now() - lastAuth > 600000) throw err('recent_login_required', 'recent_login_required');
  }

  var QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/>' +
    '<path fill="#000" d="M1 1h7v7H1zM21 1h7v7h-7zM1 21h7v7H1zM3 3h3v3H3zM23 3h3v3h-3zM3 23h3v3H3zM10 1h2v2h-2zM13 3h3v2h-3zM10 6h2v3h-2zM15 7h3v2h-3zM1 10h2v3H1zM5 11h3v2H5zM10 11h4v2h-4zM16 10h2v4h-2zM20 11h3v2h-3zM25 10h3v3h-3zM2 15h4v2H2zM8 15h2v3H8zM12 15h3v2h-3zM18 16h3v3h-3zM23 15h2v4h-2zM27 16h1v3h-1zM10 20h3v2h-3zM14 19h2v4h-2zM18 21h4v2h-4zM24 21h3v3h-3zM10 25h2v3h-2zM14 25h5v2h-5zM21 25h2v3h-2zM25 26h3v2h-3z"/></svg>';

  /* ---- gamificacao e diario: espelham as regras do banco (supabase/migrations) ---- */
  var PER_LEVEL = 10, DAILY_CAP = 3, TAGS = ['calmo', 'ansioso', 'triste', 'irritado', 'grato', 'cansado', 'animado', 'sozinho', 'esperancoso', 'sobrecarregado', 'tranquilo', 'com_medo'];
  function spDay(offset) {
    var d = new Date(); if (offset) d.setDate(d.getDate() - offset);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function sumPts(list) { return round1(list.reduce(function (s, e) { return s + e.points; }, 0)); }
  function award(u, kind, pts, ref) {
    var day = spDay();
    if (sumPts(u.xp.filter(function (e) { return e.day === day; })) + pts > DAILY_CAP) return;
    if (u.xp.some(function (e) { return e.kind === kind && e.ref === ref; })) return;
    u.xp.push({ kind: kind, points: pts, ref: ref, day: day });
  }
  function progressOf(u) {
    var xp = sumPts(u.xp), day = spDay();
    var week = {}; for (var i = 0; i < 7; i++) week[spDay(i)] = true;
    var days = {}; u.xp.forEach(function (e) { if (week[e.day]) days[e.day] = true; });
    return {
      xp: xp, level: Math.floor(xp / PER_LEVEL) + 1, xp_per_level: PER_LEVEL, xp_into_level: round1(xp - Math.floor(xp / PER_LEVEL) * PER_LEVEL),
      xp_today: sumPts(u.xp.filter(function (e) { return e.day === day; })), daily_cap: DAILY_CAP, days_this_week: Object.keys(days).length, entries: u.diary.length
    };
  }
  function copyEntry(e) { return { id: e.id, entry_date: e.entry_date, entry_time: e.entry_time || '12:00:00', mood: e.mood, energy: e.energy, anxiety: e.anxiety, tags: e.tags.slice(), body: e.body, updated_at: e.updated_at }; }
  function inScale(v) { return v == null || (v >= 1 && v <= 5 && v % 1 === 0); }

  var api = {
    mode: 'demo',
    session: function () { return tick(session ? { email: session.email } : null); },
    onAuth: function (cb) { listeners.push(cb); },

    signUp: function (role, data) {
      var email = String(data.email).trim().toLowerCase();
      if (users[email]) return tick({ needsConfirmation: true });   // igual ao Supabase: nao revela se o e-mail ja existe
      /* Mesmas regras do banco (private.create_account). Pelo cadastro por e-mail o Supabase so devolve "Database error saving new user". */
      var bad = care().profileRules(role, data);
      if (bad) return tick(null).then(function () { throw err('unexpected_failure', 'Database error saving new user'); });
      seq += 1;
      var meta = Object.assign({}, data);
      if (role === 'patient' && !care().isMinor(meta.birthDate)) { meta.guardianName = null; meta.guardianPhone = null; }
      var u = users[email] = { id: 'demo-' + seq, password: data.password, confirmed: false, role: role, meta: meta, factor: null, verification: 'pending', created: new Date().toISOString(), diary: [], xp: [],
        consents: [{ kind: 'terms', granted: true }, { kind: 'privacy', granted: true }, { kind: role === 'professional' ? 'dpa' : 'portal_health_data', granted: true }] };
      care().afterCreate(u, email, role, data);
      return tick({ needsConfirmation: true });
    },
    resendConfirmation: function () { return tick(true); },
    demoConfirmEmail: function (email) { var u = users[String(email).toLowerCase()]; if (u) { u.confirmed = true; u.confirmedAt = new Date().toISOString(); } return tick(true); },
    demoVerify: function () { var u = cur(); if (u) { u.verification = 'verified'; care().seedExamples(u); } return tick(true); },
    demoMakeAdmin: function (email) { var u = users[String(email).toLowerCase()]; if (u) u.admin = true; return tick(true); },

    signIn: function (email, password, keepSession) {
      var u = users[String(email).trim().toLowerCase()];
      if (!u || u.password !== password) return tick(null).then(function () { throw err('invalid_credentials', 'Invalid login credentials'); });
      if (!u.confirmed) return tick(null).then(function () { throw err('email_not_confirmed', 'Email not confirmed'); });
      session = { email: String(email).trim().toLowerCase(), aal: 'aal1' };
      lastAuth = Date.now(); keepFlag = keepSession !== false;
      emit('SIGNED_IN');
      return tick(true);
    },
    /* Google e Microsoft de mentira: uma conta de exemplo para cada. Na primeira vez nao tem cadastro (cai em "Completar cadastro"). */
    oauth: function (provider, o) {
      o = o || {};
      var p = provider === 'azure' ? 'azure' : 'google';
      if (o.back && session) { lastAuth = Date.now(); return tick(true); }   /* confirmar a identidade de novo, sem sair */
      var email = p === 'google' ? 'ana.souza@gmail.example' : 'bruno.lima@outlook.example';
      var u = users[email];
      if (!u) {
        seq += 1;
        u = users[email] = { id: 'demo-' + seq, password: null, provider: p, confirmed: true, role: null, meta: null, factor: null, verification: 'pending', created: new Date().toISOString(), diary: [], xp: [], consents: [] };
      }
      roleHint = o.role === 'professional' || o.role === 'patient' ? o.role : null;
      session = { email: email, aal: 'aal1' };
      lastAuth = Date.now(); keepFlag = o.keep !== false;
      emit('SIGNED_IN');
      return tick(true);
    },
    takeOauthReturn: function () { return null; },
    account: function () {
      var u = cur();
      return tick(null).then(function () {
        if (!u) throw err('not_allowed', 'not_allowed');
        var name = u.meta ? u.meta.fullName : (u.provider === 'google' ? 'Ana Souza' : 'Bruno Lima');
        return { email: session.email, hasPassword: !!u.password, providers: u.provider ? [u.provider] : [], name: name, confirmedAt: u.confirmedAt || null, roleHint: roleHint };
      });
    },
    signOut: function () { session = null; roleHint = null; emit('SIGNED_OUT'); return tick(true); },
    signOutOthers: function () { return tick(true); },
    keepsSession: function () { return keepFlag; },
    authFresh: function (minutes) { return tick(!!session && Date.now() - lastAuth < (minutes || 10) * 60000 - 20000); },
    reauth: function (password, code) {
      var u = cur();
      if (!u || !u.password || u.password !== password) return tick(null).then(function () { throw err('invalid_credentials', 'Invalid login credentials'); });
      if ((u.factor && u.factor.verified) || (u.admin && adminMfaRequired)) {
        if (String(code || '').replace(/\s/g, '') !== '123456') return tick(null).then(function () { throw err('invalid_code', 'Invalid TOTP code'); });
        session.aal = 'aal2';
      }
      lastAuth = Date.now();
      return tick(true);
    },
    demoAgeLogin: function (seconds) { lastAuth -= seconds * 1000; return true; },
    resetPassword: function () { return tick(true); },
    updatePassword: function (pw) { var u = cur(); if (u) u.password = pw; return tick(true); },
    updateEmail: function (email) {
      var u = cur(), e = String(email || '').trim().toLowerCase();
      return tick(null).then(function () {
        if (!u) throw err('not_allowed', 'not_allowed');
        if (users[e] && users[e] !== u) throw err('email_exists', 'A user with this email address has already been registered');
        delete users[session.email]; users[e] = u; session.email = e;   /* no Supabase so muda depois do clique no link; a demonstracao troca na hora */
        care().syncProfile(u, session.email);
        return true;
      });
    },
    /* Mesmas regras do banco: paciente nao deixa o nascimento em branco e, sendo menor de 18 anos, precisa do responsavel. */
    updateProfile: function (d) {
      var u = cur();
      return tick(null).then(function () {
        if (!u || !u.meta) throw err('not_allowed', 'not_allowed');
        var m = u.meta, next = { fullName: m.fullName, phone: m.phone, birthDate: m.birthDate, guardianName: m.guardianName, guardianPhone: m.guardianPhone };
        if (d.fullName != null) next.fullName = d.fullName;
        if (d.phone !== undefined) next.phone = d.phone || null;
        if (d.birthDate) next.birthDate = d.birthDate;
        if (d.guardianName !== undefined) next.guardianName = d.guardianName || null;
        if (d.guardianPhone !== undefined) next.guardianPhone = d.guardianPhone || null;
        if (u.role === 'patient') {
          var bad = care().birthRules(next.birthDate, next.guardianName, next.guardianPhone);
          if (bad) throw err('P0001', bad);
        }
        u.meta = Object.assign({}, m, next);
        care().syncProfile(u, session.email);
        return true;
      });
    },

    me: function () {
      var u = cur();
      if (!u || !u.role) return tick(null);   /* entrou com Google/Microsoft e ainda nao completou o cadastro */
      var m = u.meta;
      return tick({
        profile: { id: u.id, role: u.role, full_name: m.fullName, email: session.email, phone: m.phone || null, birth_date: m.birthDate || null, guardian_name: m.guardianName || null, guardian_phone: m.guardianPhone || null },
        professional: u.role === 'professional' ? { crp_region: m.crpRegion, crp_number: m.crpNumber, verification: u.verification } : null
      });
    },

    policy: function () {
      var u = cur();
      return tick(null).then(function () {
        if (!u) throw err('not_allowed', 'not_allowed');
        var admin = !!u.admin;
        return { profile_complete: !!u.role, role: u.role || null, is_admin: admin, mfa_required: (admin && adminMfaRequired) || (u.role === 'professional' && mfaRequired), mfa_enrolled: !!(u.factor && u.factor.verified),
          test_mode: admin ? (u.mode || 'admin') : null };
      });
    },
    completeSignup: function (role, d) {
      var u = cur();
      return tick(null).then(function () {
        if (!u) throw err('not_allowed', 'not_allowed');
        if (u.role) throw err('P0001', 'already_completed');
        var bad = care().profileRules(role, d);
        if (bad === 'crp') throw err('23514', 'professionals check violation');
        if (bad) throw err('P0001', bad);
        u.role = role; u.verification = 'pending';
        u.meta = { fullName: d.fullName, phone: d.phone || '', birthDate: d.birthDate || null, crpRegion: d.crpRegion, crpNumber: d.crpNumber,
          guardianName: care().isMinor(d.birthDate) ? d.guardianName : null, guardianPhone: care().isMinor(d.birthDate) ? d.guardianPhone : null };
        u.consents = [{ kind: 'terms', granted: true }, { kind: 'privacy', granted: true }, { kind: role === 'professional' ? 'dpa' : 'portal_health_data', granted: true }];
        roleHint = null;
        care().afterCreate(u, session.email, role, d);
        return true;
      });
    },

    mfa: {
      status: function () {
        var u = cur();
        return tick({ enrolled: !!(u && u.factor && u.factor.verified), verified: !!(session && session.aal === 'aal2'), factorId: u && u.factor ? u.factor.id : null });
      },
      enroll: function () {
        var u = cur();
        u.factor = { id: 'factor-' + u.id, verified: false };
        return tick({ factorId: u.factor.id, qrUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(QR_SVG), secret: 'JBSW Y3DP EHPK 3PXP' });
      },
      verify: function (factorId, code) {
        var u = cur();
        if (String(code).replace(/\s/g, '') !== '123456') return tick(null).then(function () { throw err('invalid_code', 'Invalid TOTP code'); });
        if (u.factor) u.factor.verified = true;
        session.aal = 'aal2'; lastAuth = Date.now();
        return tick(true);
      },
      unenroll: function () { var u = cur(); if (u) u.factor = null; return tick(true); }
    },

    /* consentimentos */
    hasConsent: function (kind) {
      var u = cur(); var last = null;
      (u ? u.consents : []).forEach(function (c) { if (c.kind === kind) last = c.granted; });
      return tick(!!last);
    },
    setConsent: function (kind, granted) { cur().consents.push({ kind: kind, granted: granted }); return tick(true); },

    /* suporte */
    createSupportTicket: function (t) {
      var u = cur();
      if (t.diagnostics && !(u.consents.filter(function (c) { return c.kind === 'diagnostics'; }).pop() || {}).granted) return tick(null).then(function () { throw err('diagnostics_consent_required'); });
      var row = {}; Object.keys(t).forEach(function (k) { row[k] = t[k]; });
      row.id = 'ticket-' + (tickets.length + 1); row.status = 'open'; row.created_at = new Date().toISOString();
      row.user_name = u.meta.fullName; row.user_email = session.email;
      tickets.push(row);
      return tick({ id: row.id });
    },
    _tickets: function () { return tickets; },

    /* equipe: mesmas regras do banco (conta de admin; o codigo so e exigido de quem cadastrou o app ou se a chave da equipe estiver ligada) */
    admin: {
      professionals: function (status) {
        var u = cur(), want = status || 'pending';
        if (!adminOk(u)) return tick([]);
        return tick(Object.keys(users).map(function (k) { return users[k]; }).filter(function (x) { return x.role === 'professional' && x.verification === want; }).map(function (x) {
          return { id: x.id, full_name: x.meta.fullName, email: Object.keys(users).filter(function (e) { return users[e] === x; })[0], crp_region: x.meta.crpRegion, crp_number: x.meta.crpNumber,
            created_at: x.created, verification: x.verification, verification_note: x.note || null, verified_at: x.verifiedAt || null };
        }));
      },
      setVerification: function (id, status, note) {
        var u = cur();
        return tick(null).then(function () {
          if (!adminOk(u)) throw err('not_allowed', 'not_allowed');
          var t = Object.keys(users).map(function (k) { return users[k]; }).filter(function (x) { return x.id === id && x.role === 'professional'; })[0];
          if (status === 'verified' && Date.now() - lastAuth > 600000) throw err('recent_login_required', 'recent_login_required');
          if (!t) throw err('professional_not_found', 'professional_not_found');
          t.verification = status; t.note = String(note || '').trim().slice(0, 500) || null; t.verifiedAt = status === 'verified' ? new Date().toISOString() : null;
          return true;
        });
      },
      tickets: function (status) {
        var u = cur(), want = status || 'open';
        if (!adminOk(u)) return tick([]);
        return tick(tickets.filter(function (t) { return t.status === want; }).map(function (t) {
          return { id: t.id, created_at: t.created_at, category: t.category, subject: t.subject, message: t.message, app_version: t.appVersion || null, platform: t.platform || null,
            diagnostics: t.diagnostics || null, status: t.status, user_name: t.user_name, user_email: t.user_email };
        }));
      },
      setTicketStatus: function (id, status) {
        var u = cur();
        return tick(null).then(function () {
          if (!adminOk(u)) throw err('not_allowed', 'not_allowed');
          if (['open', 'answered', 'closed'].indexOf(status) < 0) throw err('invalid_status', 'invalid_status');
          var t = tickets.filter(function (x) { return x.id === id; })[0];
          if (!t) throw err('ticket_not_found', 'ticket_not_found');
          t.status = status; return true;
        });
      },
      mfaAdoption: function () {
        var u = cur();
        return tick(null).then(function () {
          if (!adminOk(u)) throw err('not_allowed', 'not_allowed');
          var pros = Object.keys(users).map(function (k) { return users[k]; }).filter(function (x) { return x.role === 'professional'; });
          return { professionals: pros.length, with_mfa: pros.filter(function (x) { return x.factor && x.factor.verified; }).length, required: mfaRequired };
        });
      },
      setMfaRequired: function (required) {
        var u = cur();
        return tick(null).then(function () {
          if (!adminOk(u)) throw err('not_allowed', 'not_allowed');
          if (typeof required !== 'boolean') throw err('invalid_data', 'invalid_data');
          if (!recent()) throw err('recent_login_required', 'recent_login_required');
          mfaRequired = required; return true;
        });
      },
      /* Modo de teste da conta de equipe: 'admin', 'professional' ou 'patient'. No modo paciente a conta vira de paciente de verdade (igual ao banco). */
      setMode: function (mode) {
        var u = cur();
        return tick(null).then(function () {
          if (!adminOk(u)) throw err('not_allowed', 'not_allowed');
          if (['admin', 'professional', 'patient'].indexOf(mode) < 0) throw err('invalid_data', 'invalid_data');
          if (!u.role) throw err('profile_required', 'profile_required');
          if (mode === 'patient') {
            if (!u.meta.birthDate) u.meta.birthDate = '1990-01-01';
            u.role = 'patient';
            if (!u.consents.some(function (c) { return c.kind === 'portal_health_data' && c.granted; })) u.consents.push({ kind: 'portal_health_data', granted: true, doc_version: '1.2', at: new Date().toISOString() });
          } else {
            if (!u.meta || !u.meta.crpNumber) throw err('professional_profile_required', 'professional_profile_required');
            u.role = 'professional';
          }
          u.mode = mode;
          return { mode: mode, role: u.role };
        });
      }
    },

    /* gamificacao e diario (so paciente) */
    progress: function () {
      var u = cur();
      if (!u || u.role !== 'patient') return tick(null).then(function () { throw err('not_allowed'); });
      return tick(progressOf(u));
    },
    achievements: function () {
      var u = cur();
      if (!u) return tick(null).then(function () { throw err('not_allowed'); });
      if (u.role === 'professional') return tick({ role: 'professional', sessions_done: 312, patients_linked: 4, months: 14, revenue_cents: null });   // numeros de exemplo
      var days = {}; u.xp.forEach(function (e) { days[e.day] = true; });
      var list = Object.keys(days).sort(), best = 0, run = 0, prev = null;
      list.forEach(function (d) {
        run = prev && Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z')) / 864e5) === 1 ? run + 1 : 1;
        if (run > best) best = run;
        prev = d;
      });
      var count = function (k) { return u.xp.filter(function (e) { return e.kind === k; }).length; };
      return tick({ role: 'patient', diary_texts: count('diary_entry'), checkins: count('mood_checkin'), days_total: list.length, best_streak: best,
        current_streak: prev && (prev === spDay(0) || prev === spDay(1)) ? run : 0, sessions_confirmed: count('session_confirm') });
    },
    demoGrantXp: function (points) {   // so para testes: simula dias de uso (fora da semana e do teto de hoje)
      var u = cur(); seq += 1;
      u.xp.push({ kind: 'diary_entry', points: points, ref: 'demo-' + seq, day: spDay(10 + seq) });
      return tick(true);
    },
    /* direitos do titular */
    exportMyData: function () {
      var u = cur();
      return tick(null).then(function () {
        sensitive(u);
        u.exports = (u.exports || 0) + 1;
        if (u.exports > 5) throw err('rate_limited', 'rate_limited');
        return { exported_at: new Date().toISOString(), profile: { full_name: u.meta.fullName, email: session.email, role: u.role }, consents: u.consents, diary_entries: u.diary.map(copyEntry), xp_events: u.xp, care: care().exportFor(u) };
      });
    },
    deleteMyAccount: function () { var u = cur(); return tick(null).then(function () { sensitive(u); care().afterDelete(u); delete users[session.email]; session = null; emit('SIGNED_OUT'); return true; }); }
  };

  /* Parte de cuidado (vinculo, diario com hora, agenda, avisos, avaliacoes) fica em api-demo-care.js e usa estas pecas. */
  function care() { return api._care; }
  api._core = {
    users: function () { return users; }, cur: cur, session: function () { return session; }, tick: tick, err: err, spDay: spDay, round1: round1,
    progressOf: progressOf, award: award, copyEntry: copyEntry, inScale: inScale, mfaOk: mfaOk, next: function () { seq += 1; return seq; }, PER_LEVEL: PER_LEVEL, TAGS: TAGS
  };
  window.API_DEMO = api;
})();
