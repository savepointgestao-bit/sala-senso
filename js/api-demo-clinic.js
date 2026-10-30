/* Modo demonstracao, parte do consultorio (porte do app antigo): ficha completa, dados do psicologo, evolucao, financeiro,
   escalas, medicamentos, planos, documentos, anexos e importacao. Espelha as regras do banco (supabase/migrations/2026102913*) para
   testar as telas sem servidor. Tudo na memoria do navegador. */
(function () {
  'use strict';
  var api = window.API_DEMO, core = api._core, care = api._care, H = care.helpers;
  var S = H.S, tick = core.tick, pgErr = H.pgErr, nid = H.nid, today = H.today, addDays = H.addDays;
  var C = S.clinic = { ficha: {}, settings: {} };

  function pro() { return H.needVerified(); }
  function mine(u, id) { var r = H.myRec(u, id); if (!r) throw pgErr('not_found'); return r; }
  function str(v) { return v == null ? '' : String(v); }
  function digits(s) { return str(s).replace(/\D/g, ''); }

  /* ------------------------------------------------------------ CPF e CNPJ (como private.valid_cpf e valid_cnpj) */
  function validCpf(s) {
    var d = digits(s), i, sum, r;
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    for (sum = 0, i = 0; i < 9; i++) sum += +d[i] * (10 - i);
    r = (sum * 10) % 11; if (r === 10) r = 0;
    if (r !== +d[9]) return false;
    for (sum = 0, i = 0; i < 10; i++) sum += +d[i] * (11 - i);
    r = (sum * 10) % 11; if (r === 10) r = 0;
    return r === +d[10];
  }
  function validCnpj(s) {
    var d = digits(s), w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], i, sum, r;
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
    for (sum = 0, i = 0; i < 12; i++) sum += +d[i] * w1[i];
    r = sum % 11; r = r < 2 ? 0 : 11 - r;
    if (r !== +d[12]) return false;
    for (sum = 0, i = 0; i < 13; i++) sum += +d[i] * w2[i];
    r = sum % 11; r = r < 2 ? 0 : 11 - r;
    return r === +d[13];
  }
  var DATA_IMG = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/;
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s; }

  /* ------------------------------------------------------------ bloco clinico (como private.clinical_patch) */
  var SPEC = { cpf: 'cpf', gender: 40, civil: 40, job: 100, education: 40, address: 200, city: 80, resp_name: 120, resp_kin: 60, resp_cpf: 'cpf', resp_phone: 30,
    emerg_name: 120, emerg_phone: 30, pref_time: 100, insurance: 100, referred_by: 120, payer_name: 120, payer_cpf: 'cpf', participants: 500,
    complaint: 4000, history: 12000, cid: 200, notes: 4000, tcle_accepted: 'bool', tcle_date: 'date', tcle_signature: 'image' };
  function clinicalPatch(old, patch) {
    var out = Object.assign({}, old || {});
    if (patch == null) return out;
    if (typeof patch !== 'object' || Array.isArray(patch)) throw pgErr('invalid_data');
    Object.keys(patch).forEach(function (k) {
      var t = SPEC[k], v = patch[k];
      if (t === undefined) throw pgErr('invalid_field');
      if (v === null || (typeof v === 'string' && v.trim() === '') || (t === 'bool' && v === false)) { delete out[k]; return; }
      if (typeof t === 'number') {
        if (typeof v !== 'string') throw pgErr('invalid_data');
        var s = v.trim();
        if (s.length > t) throw pgErr('field_too_long');
        out[k] = s;
      } else if (t === 'cpf') {
        if (!validCpf(String(v).trim())) throw pgErr('cpf_invalid');
        out[k] = digits(v);
      } else if (t === 'bool') {
        if (typeof v !== 'boolean') throw pgErr('invalid_data');
        out[k] = true;
      } else if (t === 'date') {
        if (!validDate(String(v))) throw pgErr('date_invalid');
        out[k] = String(v);
      } else if (t === 'image') {
        if (String(v).length > 120000 || !DATA_IMG.test(String(v))) throw pgErr('image_invalid');
        out[k] = String(v);
      }
    });
    if (!out.tcle_accepted) { delete out.tcle_accepted; delete out.tcle_date; delete out.tcle_signature; }
    if (JSON.stringify(out).length > 200000) throw pgErr('too_large');
    return out;
  }

  /* ------------------------------------------------------------ ficha extra do paciente */
  var FICHA_KEYS = ['social_name', 'started_on', 'session_price_cents', 'session_minutes', 'modality', 'frequency', 'care_type', 'payer', 'clinical'];
  function fichaOf(id) { return C.ficha[id] || (C.ficha[id] = { social_name: null, started_on: null, session_price_cents: null, session_minutes: null, modality: null, frequency: null, care_type: 'individual', payer: 'self', clinical: {}, updated_at: null }); }
  function agendaDefaults(u) {
    var g = H.P(u).settings;
    return { price_cents: g.price_cents == null ? null : g.price_cents, minutes: g.session_minutes || 50 };
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  api.pro.ficha = function (recordId) {
    return tick(null).then(function () {
      var u = pro(); mine(u, recordId);
      var f = fichaOf(recordId);
      return Object.assign({ record_id: recordId }, copy(f), { defaults: agendaDefaults(u) });
    });
  };
  api.pro.saveFicha = function (recordId, p) {
    return tick(null).then(function () {
      var u = pro(); mine(u, recordId);
      if (p == null || typeof p !== 'object' || Array.isArray(p)) throw pgErr('invalid_data');
      Object.keys(p).forEach(function (k) { if (FICHA_KEYS.indexOf(k) < 0) throw pgErr('invalid_field'); });
      var f = fichaOf(recordId), n = Object.assign({}, f);
      function has(k) { return Object.prototype.hasOwnProperty.call(p, k); }
      if (has('social_name')) {
        var sn = str(p.social_name).trim() || null;
        if (sn && (sn.length < 2 || sn.length > 120)) throw pgErr('social_name_invalid');
        n.social_name = sn;
      }
      if (has('started_on')) {
        var d = str(p.started_on) || null;
        if (d && (!validDate(d) || d < '1900-01-01' || d > addDays(today(), 365))) throw pgErr('date_invalid');
        n.started_on = d;
      }
      if (has('session_price_cents')) {
        var pr = p.session_price_cents === null || p.session_price_cents === '' ? null : Number(p.session_price_cents);
        if (pr !== null && (!isFinite(pr) || pr % 1 !== 0 || pr < 0 || pr > 1000000)) throw pgErr('price_invalid');
        n.session_price_cents = pr;
      }
      if (has('session_minutes')) {
        var mi = p.session_minutes === null || p.session_minutes === '' ? null : Number(p.session_minutes);
        if (mi !== null && (!isFinite(mi) || mi % 1 !== 0 || mi < 5 || mi > 600)) throw pgErr('minutes_invalid');
        n.session_minutes = mi;
      }
      if (has('modality')) {
        var mo = str(p.modality) || null;
        if (mo && ['in_person', 'online', 'hybrid'].indexOf(mo) < 0) throw pgErr('modality_invalid');
        n.modality = mo;
      }
      if (has('frequency')) {
        var fr = str(p.frequency) || null;
        if (fr && ['weekly', 'biweekly', 'monthly', 'single'].indexOf(fr) < 0) throw pgErr('frequency_invalid');
        n.frequency = fr;
      }
      if (has('care_type')) {
        var ct = str(p.care_type) || 'individual';
        if (['individual', 'couple', 'family', 'group'].indexOf(ct) < 0) throw pgErr('care_type_invalid');
        n.care_type = ct;
      }
      if (has('payer')) {
        var py = str(p.payer) || 'self';
        if (['self', 'guardian', 'other'].indexOf(py) < 0) throw pgErr('payer_invalid');
        n.payer = py;
      }
      var clin = has('clinical') ? clinicalPatch(f.clinical, p.clinical) : Object.assign({}, f.clinical);
      if (n.care_type === 'individual') delete clin.participants;
      if (n.payer !== 'other') { delete clin.payer_name; delete clin.payer_cpf; }
      n.clinical = clin;
      n.updated_at = new Date().toISOString();
      C.ficha[recordId] = n;
      return true;
    });
  };

  var STATUSES = ['active', 'paused', 'discharged', 'dropped', 'referred'];
  api.pro.setStatus = function (recordId, status) {
    return tick(null).then(function () {
      var u = pro();
      if (STATUSES.indexOf(status) < 0) throw pgErr('status_invalid');
      mine(u, recordId).status = status;
      return true;
    });
  };

  /* A lista de pacientes passa a trazer o nome social. */
  var listOrig = api.pro.patients;
  api.pro.patients = function () {
    return listOrig.apply(api.pro, arguments).then(function (list) {
      list.forEach(function (it) { var f = C.ficha[it.record_id]; it.social_name = f ? f.social_name : null; });
      return list;
    });
  };

  /* ------------------------------------------------------------ dados do psicologo */
  function settingsOf(u) { return C.settings[u.id] || (C.settings[u.id] = { document: null, address: null, city: null, receipt_footer: null, receipt_auto: false, signature: null }); }
  api.pro.settings = function () {
    return tick(null).then(function () {
      var u = pro(), s = settingsOf(u), m = u.meta || {}, d = agendaDefaults(u);
      return Object.assign({ name: m.fullName, email: H.emailOf(u), phone: m.phone || null, crp: (m.crpRegion || '06') + '/' + (m.crpNumber || ''),
        default_price_cents: d.price_cents, default_minutes: d.minutes }, copy(s));
    });
  };
  api.pro.saveSettings = function (p) {
    return tick(null).then(function () {
      var u = pro();
      if (p == null || typeof p !== 'object' || Array.isArray(p)) throw pgErr('invalid_data');
      Object.keys(p).forEach(function (k) { if (['document', 'address', 'city', 'receipt_footer', 'receipt_auto', 'signature'].indexOf(k) < 0) throw pgErr('invalid_field'); });
      var s = Object.assign({}, settingsOf(u));
      function has(k) { return Object.prototype.hasOwnProperty.call(p, k); }
      if (has('document')) {
        var doc = digits(p.document) || null;
        if (doc && !(validCpf(doc) || validCnpj(doc))) throw pgErr('document_invalid');
        s.document = doc;
      }
      if (has('address')) { s.address = str(p.address).trim() || null; if (s.address && s.address.length > 200) throw pgErr('field_too_long'); }
      if (has('city')) { s.city = str(p.city).trim() || null; if (s.city && s.city.length > 80) throw pgErr('field_too_long'); }
      if (has('receipt_footer')) { s.receipt_footer = str(p.receipt_footer).trim() || null; if (s.receipt_footer && s.receipt_footer.length > 300) throw pgErr('field_too_long'); }
      if (has('receipt_auto')) { if (typeof p.receipt_auto !== 'boolean') throw pgErr('invalid_data'); s.receipt_auto = p.receipt_auto; }
      if (has('signature')) {
        var sg = str(p.signature) || null;
        if (sg && (sg.length > 200000 || !DATA_IMG.test(sg))) throw pgErr('image_invalid');
        s.signature = sg;
      }
      C.settings[u.id] = s;
      return true;
    });
  };

  /* ------------------------------------------------------------ evolucao e demais documentos (pro_docs) */
  C.docs = [];
  var DOC_KINDS = ['note'];
  var TEXTS = [['title', 120], ['demand', 4000], ['interventions', 4000], ['body', 20000], ['plan', 4000]];
  function docOut(d) { return { id: d.id, kind: d.kind, doc_date: d.docDate, appointment_id: d.apptId, mood: d.mood, origin: d.origin, draft: d.draft, personal: d.personal, created_at: d.createdAt, updated_at: d.updatedAt,
    title: d.title, demand: d.demand, interventions: d.interventions, body: d.body, plan: d.plan }; }
  function myDoc(u, id, recordId) { return C.docs.filter(function (d) { return d.id === id && d.proId === u.id && (!recordId || d.recordId === recordId); })[0] || null; }
  function apptOk(u, recordId, id) { return S.appts.some(function (a) { return a.id === id && a.proId === u.id && a.recordId === recordId; }); }

  api.pro.docs = function (recordId, kind, limit) {
    return tick(null).then(function () {
      var u = pro(); mine(u, recordId);
      var n = Math.max(1, Math.min(Number(limit) || 200, 500));
      return C.docs.filter(function (d) { return d.recordId === recordId && d.proId === u.id && (!kind || d.kind === kind); })
        .sort(function (a, b) { return a.docDate < b.docDate ? 1 : a.docDate > b.docDate ? -1 : b.seq - a.seq; }).slice(0, n).map(docOut);
    });
  };
  api.pro.saveDoc = function (recordId, p) {
    return tick(null).then(function () {
      var u = pro();
      if (p == null || typeof p !== 'object' || Array.isArray(p)) throw pgErr('invalid_data');
      Object.keys(p).forEach(function (k) { if (['id', 'kind', 'doc_date', 'appointment_id', 'mood', 'origin', 'draft', 'personal', 'title', 'demand', 'interventions', 'body', 'plan'].indexOf(k) < 0) throw pgErr('invalid_field'); });
      mine(u, recordId);
      function has(k) { return Object.prototype.hasOwnProperty.call(p, k); }
      var maxDay = addDays(today(), 1), now = new Date().toISOString(), old = null, d;
      if (has('id') && p.id !== null) {
        old = myDoc(u, p.id, recordId);
        if (!old) throw pgErr('not_found');
        if (has('kind') && p.kind !== old.kind) throw pgErr('invalid_kind');
        d = Object.assign({}, old);
      } else {
        d = { id: nid('doc'), seq: C.docs.length + 1, proId: u.id, recordId: recordId, kind: str(p.kind) || 'note', docDate: today(), apptId: null, mood: null, origin: 'manual', draft: false, personal: false,
          title: null, demand: null, interventions: null, body: null, plan: null, createdAt: now, updatedAt: now };
      }
      if (DOC_KINDS.indexOf(d.kind) < 0) throw pgErr('invalid_kind');
      if (has('doc_date')) {
        if (!validDate(str(p.doc_date)) || p.doc_date < '1900-01-01' || p.doc_date > maxDay) throw pgErr('date_invalid');
        d.docDate = p.doc_date;
      }
      if (has('appointment_id')) {
        if (p.appointment_id === null || p.appointment_id === '') d.apptId = null;
        else { if (!apptOk(u, recordId, p.appointment_id)) throw pgErr('appointment_invalid'); d.apptId = p.appointment_id; }
      }
      if (has('mood')) {
        if (p.mood === null || p.mood === '') d.mood = null;
        else { var m = Number(p.mood); if (!isFinite(m) || m % 1 !== 0 || m < 1 || m > 5) throw pgErr('mood_invalid'); d.mood = m; }
      }
      if (has('origin')) { if (['manual', 'ia'].indexOf(p.origin) < 0) throw pgErr('origin_invalid'); d.origin = p.origin; }
      if (has('draft')) { if (typeof p.draft !== 'boolean') throw pgErr('invalid_data'); d.draft = p.draft; }
      if (has('personal')) { if (typeof p.personal !== 'boolean') throw pgErr('invalid_data'); d.personal = p.personal; }
      TEXTS.forEach(function (tx) {
        var k = tx[0];
        if (!has(k)) return;
        if (p[k] !== null && typeof p[k] !== 'string') throw pgErr('invalid_data');
        var v = str(p[k]).trim() || null;
        if (v && v.length > tx[1]) throw pgErr('field_too_long');
        d[k] = v;
      });
      if (d.kind === 'note' && !d.demand && !d.interventions && !d.body && !d.plan) throw pgErr('note_empty');
      d.updatedAt = now;
      if (old) C.docs[C.docs.indexOf(old)] = d; else C.docs.push(d);
      return d.id;
    });
  };
  api.pro.deleteDoc = function (id) {
    return tick(null).then(function () {
      var u = pro(), d = myDoc(u, id);
      if (!d) throw pgErr('not_found');
      C.docs.splice(C.docs.indexOf(d), 1);
      return true;
    });
  };
  api.pro.sessions = function (recordId, limit) {
    return tick(null).then(function () {
      var u = pro(); mine(u, recordId);
      var n = Math.max(1, Math.min(Number(limit) || 300, 1000));
      return S.appts.filter(function (a) { return a.recordId === recordId && a.proId === u.id && a.status !== 'requested'; })
        .sort(function (a, b) { return b.startsAt - a.startsAt; }).slice(0, n).map(function (a) {
          return { id: a.id, starts_at: H.iso(a.startsAt), duration_minutes: a.duration, mode: a.mode, status: a.status, price_cents: a.priceCents == null ? null : a.priceCents,
            payment_status: a.paymentStatus || 'none', has_note: C.docs.some(function (d) { return d.apptId === a.id && d.kind === 'note'; }) };
        });
    });
  };
  /* ------------------------------------------------------------ lista de espera (pro_waitlist) */
  C.waitlist = [];
  var WAIT_TEXTS = [['name', 120], ['phone', 30], ['prefer', 200], ['notes', 1000]];
  function waitOut(w) { return { id: w.id, since: w.since, created_at: w.createdAt, name: w.name, phone: w.phone, prefer: w.prefer, notes: w.notes }; }
  function myWait(u, id) { return C.waitlist.filter(function (w) { return w.id === id && w.proId === u.id; })[0] || null; }
  api.pro.waitlist = function () {
    return tick(null).then(function () {
      var u = pro();
      return C.waitlist.filter(function (w) { return w.proId === u.id; })
        .sort(function (a, b) { return a.since < b.since ? -1 : a.since > b.since ? 1 : a.seq - b.seq; }).map(waitOut);
    });
  };
  api.pro.saveWaitlist = function (p) {
    return tick(null).then(function () {
      var u = pro();
      if (p == null || typeof p !== 'object' || Array.isArray(p)) throw pgErr('invalid_data');
      Object.keys(p).forEach(function (k) { if (['id', 'since', 'name', 'phone', 'prefer', 'notes'].indexOf(k) < 0) throw pgErr('invalid_field'); });
      function has(k) { return Object.prototype.hasOwnProperty.call(p, k); }
      var old = null, w;
      if (has('id') && p.id !== null) {
        old = myWait(u, p.id);
        if (!old) throw pgErr('not_found');
        w = Object.assign({}, old);
      } else {
        if (C.waitlist.filter(function (x) { return x.proId === u.id; }).length >= 200) throw pgErr('waitlist_full');
        w = { id: nid('wait'), seq: C.waitlist.length + 1, proId: u.id, since: today(), name: null, phone: null, prefer: null, notes: null, createdAt: new Date().toISOString() };
      }
      if (has('since')) {
        if (!validDate(str(p.since)) || p.since < '2000-01-01' || p.since > addDays(today(), 1)) throw pgErr('date_invalid');
        w.since = p.since;
      }
      WAIT_TEXTS.forEach(function (tx) {
        var k = tx[0];
        if (!has(k)) return;
        if (p[k] !== null && typeof p[k] !== 'string') throw pgErr('invalid_data');
        var v = str(p[k]).trim() || null;
        if (v && v.length > tx[1]) throw pgErr('field_too_long');
        w[k] = v;
      });
      if (!w.name) throw pgErr('name_required');
      if (old) C.waitlist[C.waitlist.indexOf(old)] = w; else C.waitlist.push(w);
      return w.id;
    });
  };
  api.pro.deleteWaitlist = function (id) {
    return tick(null).then(function () {
      var u = pro(), w = myWait(u, id);
      if (!w) throw pgErr('not_found');
      C.waitlist.splice(C.waitlist.indexOf(w), 1);
      return true;
    });
  };

  /* ------------------------------------------------------------ dados de exemplo para a demonstracao */
  var seedOrig = care.seedExamples;
  care.seedExamples = function (u) {
    var first = !u.seeded;
    seedOrig(u);
    if (!first) return;
    var recs = S.records.filter(function (r) { return r.proId === u.id; });
    var marina = recs.filter(function (r) { return r.name.indexOf('Marina') === 0; })[0];
    if (marina) {
      C.ficha[marina.id] = { social_name: null, started_on: addDays(today(), -120), session_price_cents: 20000, session_minutes: 50, modality: 'online', frequency: 'weekly', care_type: 'individual', payer: 'self',
        clinical: { cpf: '52998224725', gender: 'Feminino', civil: 'Casado(a)', job: 'Professora', education: 'Superior completo', address: 'Rua das Flores, 100', city: 'Ribeirão Preto',
          emerg_name: 'Carlos', emerg_phone: '(16) 99999-0000', pref_time: 'terças às 14h', insurance: 'Particular', complaint: 'Ansiedade no trabalho e dificuldade para dormir.',
          history: 'Sem tratamentos anteriores. Mãe com histórico de ansiedade.', notes: 'Prefere sessões online.', tcle_accepted: true, tcle_date: addDays(today(), -118) },
        updated_at: new Date().toISOString() };
    }
    [['Beatriz Lima', '(16) 99111-2233', 'Noites, depois das 19h', 'Indicada pela Dra. Ana.', -18], ['Rafael Nunes', '(16) 99222-3344', 'Sábado de manhã', null, -6]].forEach(function (x, i) {
      C.waitlist.push({ id: nid('wait'), seq: C.waitlist.length + 1, proId: u.id, since: addDays(today(), x[4]), name: x[0], phone: x[1], prefer: x[2], notes: x[3], createdAt: new Date().toISOString() });
    });
    if (marina) {
      var done = S.appts.filter(function (x) { return x.recordId === marina.id && x.status === 'done'; }).sort(function (x, y) { return x.startsAt - y.startsAt; });
      var texts = [['Retomada do trabalho', 'Relatou melhora do sono depois de organizar a rotina da noite. Ainda se cobra muito no trabalho.', 3, 'Cobrança excessiva no trabalho', 'Psicoeducação sobre cobrança e sono', 'Registrar os pensamentos de cobrança durante a semana'],
        ['Pensamentos de cobrança', 'Trouxe o registro dos pensamentos. Identificamos o padrão "se eu errar, todos vão notar". Saiu da sessão mais leve.', 4, 'Pensamento "se eu errar, todos vão notar"', 'Reestruturação cognitiva', 'Aplicar o questionamento socrático em duas situações']];
      texts.forEach(function (x, i) {
        var ap = done[i];
        C.docs.push({ id: nid('doc'), seq: C.docs.length + 1, proId: u.id, recordId: marina.id, kind: 'note', docDate: ap ? H.dayOf(ap.startsAt) : addDays(today(), -14 + 7 * i), apptId: ap ? ap.id : null,
          mood: x[2], origin: 'manual', draft: false, personal: false, title: x[0], demand: x[3], interventions: x[4], body: x[1], plan: x[5], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      });
    }
  };

  /* Como no servidor, todo erro chega como promessa recusada. */
  ['ficha', 'saveFicha', 'setStatus', 'settings', 'saveSettings', 'patients', 'docs', 'saveDoc', 'deleteDoc', 'sessions', 'waitlist', 'saveWaitlist', 'deleteWaitlist'].forEach(function (k) {
    var f = api.pro[k];
    api.pro[k] = function () { try { return Promise.resolve(f.apply(api.pro, arguments)); } catch (e) { return Promise.reject(e); } };
  });

  api._clinic = { C: C, mine: mine, pro: pro, validCpf: validCpf, validCnpj: validCnpj, validDate: validDate, copy: copy, str: str, digits: digits, DATA_IMG: DATA_IMG };
})();
