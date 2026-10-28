/* Camada de API do portal. As telas so falam com window.API. Aqui ela usa o Supabase de verdade;
   sem configuracao (supabaseUrl vazio) cai no modo demonstracao (api-demo.js). */
(function () {
  'use strict';
  var cfg = window.PSI_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) { window.API = window.API_DEMO; return; }

  /* "Manter conectado": escolha guardada no aparelho. Sem manter, a sessao fica so na aba (some ao fechar). */
  var KEEP = 'psi_keep';
  function keep() { try { return localStorage.getItem(KEEP) !== '0'; } catch (e) { return true; } }
  var storage = {
    getItem: function (k) { try { return (keep() ? localStorage : sessionStorage).getItem(k); } catch (e) { return null; } },
    setItem: function (k, v) { try { (keep() ? localStorage : sessionStorage).setItem(k, v); } catch (e) { /* ignore */ } },
    removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storage: storage }
  });

  function wrap(e) { var x = new Error(e && e.message ? e.message : 'erro'); x.code = (e && (e.code || e.status)) ? String(e.code || e.status) : 'unknown'; return x; }
  function ok(res) { if (res.error) throw wrap(res.error); return res.data; }
  /* Sem fragmento (#): o Supabase acrescenta ?code=... e o proprio cliente troca por sessao. O app decide a tela pelo evento. */
  function redirect() { return location.origin + location.pathname; }
  /* Entrar com Google ou Microsoft: antes de sair da pagina guardamos na aba o que precisa sobreviver ao redirecionamento
     (tipo de conta escolhido, volta para a Conta, hora). So vale por 10 minutos e e lido uma vez. */
  var RET = 'psi_oauth', ROLE = 'psi_role';
  function ses() { try { return window.sessionStorage; } catch (e) { return null; } }
  function roleHint() { var s = ses(), v = null; try { v = s && s.getItem(ROLE); } catch (e) { /* ignore */ } return v === 'professional' || v === 'patient' ? v : null; }
  var listeners = [];
  sb.auth.onAuthStateChange(function (event) { listeners.forEach(function (f) { try { f(event); } catch (e) { /* ignore */ } }); });

  var DIARY_COLS = 'id, entry_date, period, mood, energy, anxiety, tags, body, updated_at';

  window.API = {
    mode: 'live',
    session: function () { return sb.auth.getSession().then(function (r) { return r.data && r.data.session ? { email: r.data.session.user.email } : null; }); },
    onAuth: function (cb) { listeners.push(cb); },

    signUp: function (role, d) {
      var meta = { role: role, full_name: d.fullName, doc_version: cfg.docVersion, accept_terms: true, accept_privacy: true };
      if (d.phone) meta.phone = d.phone;
      if (role === 'professional') { meta.crp_region = d.crpRegion; meta.crp_number = d.crpNumber; meta.accept_dpa = true; }
      else {
        meta.birth_date = d.birthDate; meta.accept_health_data = true;
        if (d.guardianName) meta.guardian_name = d.guardianName;
        if (d.guardianPhone) meta.guardian_phone = d.guardianPhone;
        if (d.inviteCode) { meta.invite_code = d.inviteCode; meta.accept_link = !!d.acceptLink; }
      }
      return sb.auth.signUp({ email: d.email.trim(), password: d.password, options: { data: meta, emailRedirectTo: redirect() } })
        .then(function (r) { if (r.error) throw wrap(r.error); return { needsConfirmation: !(r.data && r.data.session) }; });
    },
    resendConfirmation: function (email) { return sb.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirect() } }).then(ok); },
    signIn: function (email, password, keepSession) {
      try { localStorage.setItem(KEEP, keepSession ? '1' : '0'); } catch (e) { /* ignore */ }
      return sb.auth.signInWithPassword({ email: email.trim(), password: password }).then(ok).then(function () { return true; });
    },
    /* Entrar (ou criar conta) com Google ou Microsoft. A pagina sai para o provedor e volta com a sessao; por isso a promessa
       so resolve se o redirecionamento falhar antes. "back" pede para voltar a uma tela (Conta ou Equipe) depois de confirmar a identidade de novo. */
    oauth: function (provider, o) {
      o = o || {};
      var p = provider === 'azure' ? 'azure' : 'google';
      try { localStorage.setItem(KEEP, o.keep === false ? '0' : '1'); } catch (e) { /* ignore */ }
      var s = ses();
      try {
        if (s) {
          s.setItem(RET, JSON.stringify({ t: Date.now(), back: o.back === 'conta' || o.back === 'equipe' ? o.back : null }));
          if (o.role === 'professional' || o.role === 'patient') s.setItem(ROLE, o.role); else if (!o.back) s.removeItem(ROLE);
        }
      } catch (e) { /* ignore */ }
      var opts = { redirectTo: redirect(), queryParams: { prompt: 'select_account' } };
      if (p === 'azure') opts.scopes = 'email';
      return sb.auth.signInWithOAuth({ provider: p, options: opts }).then(ok).then(function () { return new Promise(function () { /* a pagina esta saindo */ }); });
    },
    /* Voltou do provedor? Devolve { back } uma unica vez (ou null). */
    takeOauthReturn: function () {
      var s = ses(), v = null;
      try { v = s && s.getItem(RET); if (s) s.removeItem(RET); } catch (e) { return null; }
      try { v = v ? JSON.parse(v) : null; } catch (e) { return null; }
      return v && typeof v.t === 'number' && Date.now() - v.t < 600000 ? { back: v.back === 'conta' || v.back === 'equipe' ? v.back : null } : null;
    },
    /* Como a pessoa entra: e-mail, se tem senha, quais provedores e o nome que o provedor informou (para preencher o cadastro). */
    account: function () {
      return sb.auth.getUser().then(ok).then(function (d) {
        var u = d.user || {}, ids = u.identities || [], md = u.user_metadata || {};
        return {
          email: u.email || '',
          hasPassword: ids.some(function (i) { return i.provider === 'email'; }) || !ids.length,
          providers: ids.map(function (i) { return i.provider; }).filter(function (x) { return x === 'google' || x === 'azure'; }),
          name: String(md.full_name || md.name || '').slice(0, 120),
          confirmedAt: u.email_confirmed_at || null,
          roleHint: roleHint()
        };
      });
    },
    signOut: function () { var s = ses(); try { if (s) { s.removeItem(ROLE); s.removeItem(RET); } } catch (e) { /* ignore */ } return sb.auth.signOut().then(function () { return true; }); },
    signOutOthers: function () { return sb.auth.signOut({ scope: 'others' }).then(ok).then(function () { return true; }); },
    keepsSession: function () { return keep(); },
    /* Confirmou a identidade ha pouco? Le a data do ultimo login (senha ou codigo) que o Supabase grava no token (amr).
       O banco confere de novo; aqui serve so para nao pedir a senha sem necessidade. */
    authFresh: function (minutes) {
      return sb.auth.getSession().then(function (r) {
        var s = r.data && r.data.session, p = null;
        try { p = JSON.parse(decodeURIComponent(escape(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return false; }
        var t = 0;
        (Array.isArray(p.amr) ? p.amr : []).forEach(function (a) { if (a && typeof a.timestamp === 'number' && a.timestamp > t) t = a.timestamp; });
        return t > Date.now() / 1000 - (minutes || 10) * 60 + 20;
      }).catch(function () { return false; });
    },
    /* Confirma a identidade de novo: senha e, para quem tem autenticador, o codigo de 6 digitos. */
    reauth: function (password, code) {
      return sb.auth.getUser().then(ok).then(function (d) {
        return sb.auth.signInWithPassword({ email: d.user.email, password: password });
      }).then(ok).then(function () {
        if (!code) return true;
        return sb.auth.mfa.listFactors().then(ok).then(function (l) {
          var f = (l.totp || []).filter(function (x) { return x.status === 'verified'; })[0];
          return f ? window.API.mfa.verify(f.id, code) : true;
        });
      }).then(function () { return true; });
    },
    resetPassword: function (email) { return sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect() }).then(ok).then(function () { return true; }); },
    updatePassword: function (pw) { return sb.auth.updateUser({ password: pw }).then(ok).then(function () { return true; }); },
    /* Trocar o e-mail: o Supabase manda um link de confirmacao para o endereco novo (e para o antigo, se a opcao estiver ligada).
       O e-mail so muda de verdade quando a pessoa clica no link. */
    updateEmail: function (email) { return sb.auth.updateUser({ email: email.trim() }, { emailRedirectTo: redirect() }).then(ok).then(function () { return true; }); },
    /* Dados da propria conta: nome, celular, nascimento e responsavel (so o que vier preenchido muda). O banco confere:
       paciente nao deixa o nascimento em branco e, sendo menor de 18 anos, precisa do responsavel. */
    updateProfile: function (d) {
      var row = {};
      if (d.fullName != null) row.full_name = d.fullName;
      if (d.phone !== undefined) row.phone = d.phone ? d.phone : null;
      if (d.birthDate) row.birth_date = d.birthDate;
      if (d.guardianName !== undefined) row.guardian_name = d.guardianName ? d.guardianName : null;
      if (d.guardianPhone !== undefined) row.guardian_phone = d.guardianPhone ? d.guardianPhone : null;
      return sb.auth.getUser().then(ok).then(function (r) {
        return sb.from('profiles').update(row).eq('id', r.user.id).select('id').single();
      }).then(ok).then(function () { return true; });
    },

    me: function () {
      return sb.auth.getUser().then(function (u) {
        if (!u.data || !u.data.user) return null;
        return Promise.all([
          sb.from('profiles').select('id, role, full_name, email, phone, birth_date, guardian_name, guardian_phone').eq('id', u.data.user.id).maybeSingle(),
          sb.from('professionals').select('crp_region, crp_number, verification').eq('id', u.data.user.id).maybeSingle()
        ]).then(function (r) {
          if (r[0].error) throw wrap(r[0].error);
          if (!r[0].data) return null;
          return { profile: r[0].data, professional: r[1].data || null };
        });
      });
    },

    /* Situacao da conta para decidir a tela: cadastro completo, tipo, equipe, 2 fatores exigido e cadastrado (vem do banco). */
    policy: function () { return sb.rpc('my_auth_policy').then(ok); },
    /* Completa o cadastro de quem entrou com Google ou Microsoft. As mesmas regras do cadastro por e-mail valem no banco. */
    completeSignup: function (role, d) {
      var data = { role: role, full_name: d.fullName, doc_version: cfg.docVersion, accept_terms: true, accept_privacy: true };
      if (d.phone) data.phone = d.phone;
      if (role === 'professional') { data.crp_region = d.crpRegion; data.crp_number = d.crpNumber; data.accept_dpa = true; }
      else {
        data.birth_date = d.birthDate; data.accept_health_data = true;
        if (d.guardianName) data.guardian_name = d.guardianName;
        if (d.guardianPhone) data.guardian_phone = d.guardianPhone;
        if (d.inviteCode) { data.invite_code = d.inviteCode; data.accept_link = !!d.acceptLink; }
      }
      return sb.rpc('complete_signup', { p_data: data }).then(ok).then(function () {
        var s = ses(); try { if (s) s.removeItem(ROLE); } catch (e) { /* ignore */ }
        return true;
      });
    },

    mfa: {
      status: function () {
        return Promise.all([sb.auth.mfa.listFactors(), sb.auth.mfa.getAuthenticatorAssuranceLevel()]).then(function (r) {
          var f = (r[0].data && r[0].data.totp || []).filter(function (x) { return x.status === 'verified'; })[0];
          var aal = r[1].data || {};
          return { enrolled: !!f, verified: aal.currentLevel === 'aal2', factorId: f ? f.id : null };
        });
      },
      enroll: function () {
        /* remove tentativas antigas nao verificadas para nao acumular */
        return sb.auth.mfa.listFactors().then(function (l) {
          var old = (l.data && l.data.all || []).filter(function (x) { return x.status !== 'verified'; });
          return Promise.all(old.map(function (x) { return sb.auth.mfa.unenroll({ factorId: x.id }); }));
        }).then(function () { return sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Aplicativo autenticador' }); })
          .then(ok).then(function (d) { return { factorId: d.id, qrUrl: d.totp.qr_code, secret: d.totp.secret.replace(/(.{4})/g, '$1 ').trim() }; });
      },
      verify: function (factorId, code) {
        return sb.auth.mfa.challenge({ factorId: factorId }).then(ok).then(function (c) {
          return sb.auth.mfa.verify({ factorId: factorId, challengeId: c.id, code: String(code).replace(/\s/g, '') });
        }).then(ok).then(function () { return true; });
      },
      /* Desativa o autenticador (so no modo recomendado; o Supabase exige o segundo fator ativo para remover) */
      unenroll: function (factorId) {
        return sb.auth.mfa.unenroll({ factorId: factorId }).then(ok).then(function () { return sb.auth.refreshSession(); }).then(function () { return true; });
      }
    },

    /* Equipe (so contas de admin; o banco exige 2 fatores em toda funcao admin_*) */
    admin: {
      professionals: function (status) { return sb.rpc('admin_list_pending', { p_status: status || 'pending' }).then(ok); },
      setVerification: function (id, status, note) {
        return sb.rpc('admin_set_verification', { p_professional: id, p_status: status, p_note: note || null }).then(ok).then(function () { return true; });
      },
      tickets: function (status) { return sb.rpc('admin_list_tickets', { p_status: status || 'open' }).then(ok); },
      setTicketStatus: function (id, status) { return sb.rpc('admin_set_ticket_status', { p_ticket: id, p_status: status }).then(ok).then(function () { return true; }); },
      /* Dois fatores dos psicologos: so numeros (quantos usam) e se a obrigatoriedade esta ligada */
      mfaAdoption: function () { return sb.rpc('admin_mfa_adoption').then(ok); },
      setMfaRequired: function (required) { return sb.rpc('admin_set_mfa_required', { p_required: !!required }).then(ok).then(function () { return true; }); },
      /* Modo de teste da conta de equipe: 'admin', 'professional' ou 'patient'. O banco recusa quem nao e da equipe. */
      setMode: function (mode) { return sb.rpc('admin_set_mode', { p_mode: mode }).then(ok); }
    },

    hasConsent: function (kind) {
      return sb.from('consents').select('granted').eq('kind', kind).order('id', { ascending: false }).limit(1).maybeSingle().then(ok).then(function (d) { return !!(d && d.granted); });
    },
    setConsent: function (kind, granted) {
      return sb.from('consents').insert({ kind: kind, doc_version: cfg.docVersion, granted: granted }).then(ok).then(function () { return true; });
    },

    createSupportTicket: function (t) {
      return sb.rpc('create_support_ticket', { p_category: t.category, p_subject: t.subject, p_message: t.message, p_app_version: t.appVersion || null, p_platform: t.platform || null, p_diagnostics: t.diagnostics || null })
        .then(ok).then(function (id) { return { id: id }; });
    },

    /* gamificacao e diario do paciente (XP e nivel sao calculados so no servidor) */
    progress: function () { return sb.rpc('get_my_progress').then(ok); },
    /* conquistas: so os numeros da propria pessoa (os marcos ficam na tela) */
    achievements: function () { return sb.rpc('get_my_achievements').then(ok); },
    /* O texto do diario e cifrado no servidor: a leitura vem da visao diary_entries_read (decifrada, so para o dono),
       a gravacao vai na tabela (o banco cifra ao gravar e nunca guarda o texto em claro). */
    diary: {
      list: function () {
        return sb.from('diary_entries_read').select(DIARY_COLS).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(300).then(ok);
      },
      get: function (id) { return sb.from('diary_entries_read').select(DIARY_COLS).eq('id', id).maybeSingle().then(ok); },
      /* Grava pelo banco (save_diary_entry): periodo (manha, tarde, noite ou o dia todo), compartilhamento e XP ficam numa funcao so.
         e.share: true compartilha com os psicologos vinculados; false nao; ausente segue o "compartilhar automatico". */
      save: function (e) {
        return sb.rpc('save_diary_entry', { p_date: e.entry_date, p_period: e.period || null, p_mood: e.mood == null ? null : e.mood, p_energy: e.energy == null ? null : e.energy,
          p_anxiety: e.anxiety == null ? null : e.anxiety, p_tags: e.tags || [], p_body: e.body || '', p_id: e.id || null, p_share: e.share == null ? null : !!e.share })
          .then(ok).then(function (r) {
            return sb.from('diary_entries_read').select(DIARY_COLS).eq('id', r.id).single().then(ok).then(function (row) { row.created = !!r.created; return row; });
          });
      },
      /* Humor de cada dia: a media dos periodos registrados (com um so, e o proprio humor). */
      moodDays: function (days) { return sb.rpc('my_mood_days', { p_days: days || 30 }).then(ok); },
      remove: function (id) { return sb.from('diary_entries').delete().eq('id', id).then(ok).then(function () { return true; }); }
    },

    /* Link unico do psicologo. info e aberta a todos (so nome e CRP); o resto exige conta. */
    invite: {
      info: function (code) { return sb.rpc('invite_info', { p_code: String(code || '') }).then(ok); },
      mine: function () { return sb.rpc('my_invite_link').then(ok); },
      regenerate: function () { return sb.rpc('regenerate_invite_link').then(ok); },
      setEnabled: function (on) { return sb.rpc('set_invite_enabled', { p_on: !!on }).then(ok); },
      /* Paciente que ja tem conta: devolve { ok, error?, name? } (erros: patients_only, consent_required, invalid_code, already_linked). */
      use: function (code, accept) { return sb.rpc('use_invite_link', { p_code: String(code || ''), p_accept: !!accept }).then(ok); }
    },

    /* Paciente: com quem compartilha o diario. share liga ou desliga UMA anotacao; setAuto liga o "compartilhar as novas automaticamente". */
    sharing: {
      mine: function () { return sb.rpc('my_sharing').then(ok); },
      setAuto: function (professionalId, on) { return sb.rpc('set_diary_auto_share', { p_professional: professionalId, p_on: !!on }).then(ok).then(function () { return true; }); },
      share: function (entryId, professionalId, shared) { return sb.rpc('share_entry', { p_entry: entryId, p_professional: professionalId, p_shared: !!shared }).then(ok).then(function () { return true; }); },
      entryShares: function () { return sb.from('diary_shares').select('entry_id, professional_id').limit(2000).then(ok); },
      unlink: function (professionalId) { return sb.rpc('unlink_professional', { p_professional: professionalId }).then(ok).then(function () { return true; }); }
    },

    /* psicologo: acompanhamento, pacientes (com ou sem conta), relatorio, aniversarios, avaliacoes e WhatsApp. O banco confere tudo de novo. */
    pro: {
      overview: function (days) { return sb.rpc('pro_patients_overview', { p_days: days || 30 }).then(ok); },
      sharedEntries: function (recordId, days) { return sb.rpc('pro_shared_entries', { p_record: recordId, p_days: days || 90 }).then(ok); },
      linkedPatients: function () { return sb.rpc('pro_linked_patients').then(ok); },
      unlinkPatient: function (recordId) { return sb.rpc('unlink_patient', { p_record: recordId }).then(ok).then(function () { return true; }); },
      patients: function () { return sb.rpc('pro_patient_list').then(ok); },
      /* d = { id (vazio = novo), name, phone, email, birth ('AAAA-MM-DD'), guardianName, guardianPhone }. Devolve o id da ficha. */
      savePatient: function (d) {
        return sb.rpc('pro_save_patient', { p_record: d.id || null, p_name: d.name, p_phone: d.phone || null, p_email: d.email || null, p_birth: d.birth || null,
          p_guardian_name: d.guardianName || null, p_guardian_phone: d.guardianPhone || null }).then(ok);
      },
      /* o psicologo confere (on = true) ou desfaz a conferencia do cadastro de um paciente */
      setVerified: function (recordId, on) { return sb.rpc('pro_set_record_verified', { p_record: recordId, p_verified: on !== false }).then(ok).then(function () { return true; }); },
      setGuardianAuth: function (recordId, on) { return sb.rpc('pro_set_guardian_authorization', { p_record: recordId, p_authorized: !!on }).then(ok).then(function () { return true; }); },
      birthdays: function (days) { return sb.rpc('pro_birthdays', { p_days: days || 30 }).then(ok); },
      report: function (recordId, days) { return sb.rpc('pro_patient_report', { p_record: recordId, p_days: days || 90 }).then(ok); },
      reviews: function () { return sb.rpc('pro_reviews').then(ok); },
      contact: function () { return sb.rpc('pro_contact_get').then(ok); },
      saveContact: function (enabled, phone) { return sb.rpc('pro_contact_save', { p_enabled: !!enabled, p_phone: phone || null }).then(ok); }
    },

    /* psicologo: agenda (horarios de atendimento, bloqueios, pedidos e consultas) */
    agenda: {
      get: function () { return sb.rpc('agenda_get').then(ok); },
      save: function (p) { return sb.rpc('agenda_save', { p: p }).then(ok).then(function () { return true; }); },
      blockAdd: function (startIso, endIso, reason) { return sb.rpc('agenda_block_add', { p_start: startIso, p_end: endIso, p_reason: reason || null }).then(ok); },
      blockRemove: function (id) { return sb.rpc('agenda_block_remove', { p_id: id }).then(ok).then(function () { return true; }); },
      view: function (fromYmd, toYmd) { return sb.rpc('pro_agenda', { p_from: fromYmd, p_to: toYmd }).then(ok); },
      /* d = { recordId, startsAt, duration, mode, priceCents, meetingUrl } */
      create: function (d) {
        return sb.rpc('pro_create_appointment', { p_record: d.recordId, p_starts_at: d.startsAt, p_duration: d.duration || null, p_mode: d.mode || 'in_person',
          p_price_cents: d.priceCents == null ? null : d.priceCents, p_meeting_url: d.meetingUrl || null }).then(ok);
      },
      update: function (id, d) {
        return sb.rpc('pro_update_appointment', { p_id: id, p_starts_at: d.startsAt || null, p_duration: d.duration || null, p_mode: d.mode || null,
          p_price_cents: d.priceCents == null ? null : d.priceCents, p_meeting_url: d.meetingUrl == null ? null : d.meetingUrl }).then(ok).then(function () { return true; });
      },
      setStatus: function (id, status, reason) { return sb.rpc('pro_set_appointment_status', { p_id: id, p_status: status, p_reason: reason || null }).then(ok).then(function () { return true; }); },
      /* action: 'approve' | 'decline' | 'propose' (propose leva o novo horario em newStartsAt) */
      respond: function (id, action, newStartsAt, reason) {
        return sb.rpc('pro_respond_request', { p_id: id, p_action: action, p_new_starts_at: newStartsAt || null, p_reason: reason || null }).then(ok).then(function () { return true; });
      },
      markPaid: function (id, paid, method) { return sb.rpc('pro_mark_paid', { p_id: id, p_paid: !!paid, p_method: method || null }).then(ok).then(function () { return true; }); }
    },

    /* paciente: ver horarios, pedir consulta, responder sugestao, cancelar, avaliar */
    booking: {
      psychologists: function () { return sb.rpc('my_psychologists').then(ok); },
      info: function (professionalId) { return sb.rpc('booking_info', { p_professional: professionalId }).then(ok); },
      slots: function (professionalId, fromYmd, days) { return sb.rpc('available_slots', { p_professional: professionalId, p_from: fromYmd || null, p_days: days || 14 }).then(ok); },
      request: function (professionalId, startsAt, mode, note) {
        return sb.rpc('request_appointment', { p_professional: professionalId, p_starts_at: startsAt, p_mode: mode || 'in_person', p_note: note || null }).then(ok);
      },
      respond: function (id, accept) { return sb.rpc('respond_proposal', { p_id: id, p_accept: !!accept }).then(ok).then(function () { return true; }); },
      cancel: function (id) { return sb.rpc('cancel_my_appointment', { p_appointment: id }).then(ok).then(function () { return true; }); },
      mine: function () { return sb.rpc('my_appointments').then(ok); },
      review: function (id, stars, liked, suggestion) {
        return sb.rpc('submit_review', { p_appointment: id, p_stars: stars, p_liked: liked || null, p_suggestion: suggestion || null }).then(ok).then(function () { return true; });
      }
    },

    /* central de avisos (sininho). O psicologo escolhe o que quer receber; o paciente recebe tudo. */
    notify: {
      list: function (limit) { return sb.rpc('my_notifications', { p_limit: limit || 30 }).then(ok); },
      markRead: function (ids) { return sb.rpc('mark_notifications_read', { p_ids: ids && ids.length ? ids : null }).then(ok).then(function () { return true; }); },
      prefs: function () { return sb.rpc('my_notification_prefs').then(ok); },
      setPrefs: function (off) { return sb.rpc('set_notification_prefs', { p_off: off || [] }).then(ok).then(function () { return true; }); }
    },

    exportMyData: function () { return sb.rpc('export_my_data').then(ok); },
    deleteMyAccount: function () { return sb.rpc('delete_my_account').then(ok).then(function () { return sb.auth.signOut(); }).then(function () { return true; }); }
  };
})();
