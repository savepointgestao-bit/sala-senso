/* Modo demonstracao, parte clinica (porte do app antigo): escalas PHQ-9 e GAD-7, medicamentos, planos de rotina, documentos guardados e anexos.
   Espelha as regras do banco (supabase/migrations/20261029170000_clinico.sql) para testar as telas sem servidor: o servidor soma a escala e
   acha a faixa, cuida do historico de doses, confere cada tipo e cifra o arquivo. Tudo na memoria do navegador. */
(function () {
  'use strict';
  var api = window.API_DEMO, core = api._core, care = api._care, H = care.helpers, K = api._clinic;
  var S = H.S, C = K.C, tick = core.tick, pgErr = H.pgErr, nid = H.nid, today = H.today, addDays = H.addDays;

  C.files = {};   /* id do anexo -> base64 */
  var DOC_KINDS = ['scale', 'med', 'plan', 'document'];
  var ALLOWED = ['id', 'kind', 'doc_date', 'appointment_id', 'mood', 'origin', 'draft', 'personal', 'title', 'demand', 'interventions', 'body', 'plan', 'data'];

  function has(p, k) { return Object.prototype.hasOwnProperty.call(p, k); }
  function isObj(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function ymdLocal(d) { function z(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }

  /* ------------------------------------------------------------ conferidor generico (como private.clean_fields) */
  function cleanFields(p, spec) {
    if (!isObj(p)) throw pgErr('invalid_data');
    Object.keys(p).forEach(function (k) { if (!has(spec, k)) throw pgErr('invalid_field'); });
    var out = {};
    Object.keys(spec).forEach(function (k) {
      var t = spec[k], req = t.slice(-1) === '!';
      if (req) t = t.slice(0, -1);
      var parts = t.split(':'), v = p[k];
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (parts[0] === 'bool' && v === false)) {
        if (req) throw pgErr('field_required');
        return;
      }
      var s;
      switch (parts[0]) {
        case 'text':
          if (typeof v !== 'string') throw pgErr('invalid_data');
          s = v.trim();
          if (s.length > +parts[1]) throw pgErr('field_too_long');
          out[k] = s; break;
        case 'date':
          if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !K.validDate(v) || v < '1900-01-01' || v > '2100-12-31') throw pgErr('date_invalid');
          out[k] = v; break;
        case 'time':
          if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw pgErr('time_invalid');
          out[k] = v; break;
        case 'bool':
          if (typeof v !== 'boolean') throw pgErr('invalid_data');
          out[k] = true; break;
        case 'int':
          if (typeof v !== 'number' || !/^-?\d{1,9}$/.test(String(v)) || v < +parts[1] || v > +parts[2]) throw pgErr('invalid_data');
          out[k] = v; break;
        case 'enum':
          if (typeof v !== 'string' || parts[1].split(',').indexOf(v) < 0) throw pgErr('invalid_data');
          out[k] = v; break;
        default: throw pgErr('invalid_data');
      }
    });
    return out;
  }
  function without(o, k) { var c = Object.assign({}, o); delete c[k]; return c; }

  /* ------------------------------------------------------------ escala */
  function scaleClean(d) {
    if (!isObj(d)) throw pgErr('invalid_data');
    var v = cleanFields(without(d, 'answers'), { scale: 'enum:phq9,gad7!', difficulty: 'int:0:3', notes: 'text:1000' });
    var n = v.scale === 'phq9' ? 9 : 7, a = d.answers;
    if (!Array.isArray(a) || a.length !== n) throw pgErr('answers_invalid');
    var total = 0;
    a.forEach(function (x) {
      if (typeof x !== 'number' || [0, 1, 2, 3].indexOf(x) < 0) throw pgErr('answers_invalid');
      total += x;
    });
    var band = total <= 4 ? 'minimal' : total <= 9 ? 'mild' : total <= 14 ? 'moderate' : (v.scale === 'phq9' && total <= 19) ? 'moderately_severe' : 'severe';
    v.answers = a.slice(); v.total = total; v.band = band; v.risk = v.scale === 'phq9' && a[8] > 0;
    return v;
  }

  /* ------------------------------------------------------------ medicamento */
  function medClean(d, old, created, day) {
    if (!isObj(d)) throw pgErr('invalid_data');
    if (typeof d.name !== 'string' || !d.name.trim()) throw pgErr('med_name_required');
    var v = cleanFields(d, { name: 'text:120', dose: 'text:60', freq: 'text:120', reason: 'text:120', prescriber: 'text:120', start: 'date', status: 'enum:use,stopped', end: 'date', notes: 'text:1000' });
    v.status = v.status || 'use';
    if (v.status === 'stopped') { if (!v.end) v.end = day; } else delete v.end;
    if (v.start && v.end && v.end < v.start) throw pgErr('date_invalid');
    var hist = old && old.history ? old.history.slice() : [];
    if (old && created < day && ((old.dose || null) !== (v.dose || null) || (old.freq || null) !== (v.freq || null))) {
      hist.push({ until: day, dose: old.dose || null, freq: old.freq || null });
      if (hist.length > 30) hist = hist.slice(hist.length - 30);
    }
    if (hist.length) v.history = hist;
    return v;
  }

  /* ------------------------------------------------------------ plano de rotina */
  function planClean(d, day) {
    if (!isObj(d)) throw pgErr('invalid_data');
    var items = d.items;
    if (!Array.isArray(items) || !items.length) throw pgErr('plan_items_required');
    if (items.length > 40) throw pgErr('items_invalid');
    var v = cleanFields(without(d, 'items'), { goal: 'text:2000', start: 'date', review: 'date', status: 'enum:active,done', done_on: 'date', model_id: 'text:40', guidance: 'text:4000', mood_line: 'bool', urgent: 'bool' });
    var out = items.map(function (it) {
      if (!isObj(it)) throw pgErr('items_invalid');
      var c = cleanFields(without(it, 'days'), { id: 'text:40', text: 'text:300!', period: 'enum:morning,afternoon,evening', time: 'time', hint: 'text:200' });
      var days = it.days;
      if (days === undefined || days === null || (Array.isArray(days) && !days.length)) days = [0, 1, 2, 3, 4, 5, 6];
      else if (!Array.isArray(days) || days.length > 7 || days.some(function (x) { return typeof x !== 'number' || [0, 1, 2, 3, 4, 5, 6].indexOf(x) < 0; })) throw pgErr('items_invalid');
      else days = days.filter(function (x, i) { return days.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
      c.days = days;
      if (!c.id) c.id = nid('item');
      return c;
    });
    v.status = v.status || 'active';
    v.items = out;
    if (v.status === 'done') { if (!v.done_on) v.done_on = day; } else delete v.done_on;
    return v;
  }

  /* ------------------------------------------------------------ documento guardado */
  function documentClean(d) {
    if (!isObj(d)) throw pgErr('invalid_data');
    Object.keys(d).forEach(function (k) { if (k !== 'type' && k !== 'fields') throw pgErr('invalid_field'); });
    var SPEC = {
      declaration: { date: 'date!', start: 'time', end: 'time', purpose: 'text:300', issue_date: 'date' },
      tcle: { fee_cents: 'int:0:1000000', minutes: 'int:5:600', frequency: 'text:30', mode: 'text:30', schedule: 'text:100', pay_when: 'text:60', pay_methods: 'text:120',
        notice_hours: 'int:0:168', charge_absence: 'bool', extra: 'text:2000', signed_on: 'date', issue_date: 'date' },
      report: { requester: 'text:200!', purpose: 'text:500!', demand: 'text:4000', procedure: 'text:4000', analysis: 'text:8000', conclusion: 'text:4000', issue_date: 'date' },
      referral: { to: 'text:200!', specialty: 'text:120', reason: 'text:4000!', notes: 'text:2000', want_feedback: 'bool', issue_date: 'date' }
    };
    var spec = typeof d.type === 'string' && has(SPEC, d.type) ? SPEC[d.type] : null;
    if (!spec) throw pgErr('doc_type_invalid');
    return { type: d.type, fields: cleanFields(d.fields == null ? {} : d.fields, spec) };
  }

  var TITLES = { declaration: 'Declaração de comparecimento', tcle: 'Contrato e TCLE', report: 'Relatório psicológico', referral: 'Encaminhamento' };

  /* ------------------------------------------------------------ pro_docs: lista, grava e apaga */
  function byId(id) { return C.docs.filter(function (d) { return d.id === id; })[0] || null; }
  function myDoc(u, id, recordId) { return C.docs.filter(function (d) { return d.id === id && d.proId === u.id && (!recordId || d.recordId === recordId); })[0] || null; }
  function apptOk(u, recordId, id) { return S.appts.some(function (a) { return a.id === id && a.proId === u.id && a.recordId === recordId; }); }
  function text120(v) {
    if (v !== null && typeof v !== 'string') throw pgErr('invalid_data');
    var s = v == null ? '' : v.trim();
    if (s.length > 120) throw pgErr('field_too_long');
    return s || null;
  }

  var origDocs = api.pro.docs, origSave = api.pro.saveDoc, origDelete = api.pro.deleteDoc;

  api.pro.docs = function (recordId, kind, limit) {
    return origDocs.call(api.pro, recordId, kind, limit).then(function (list) {
      return list.map(function (r) {
        var d = byId(r.id);
        return d && d.data ? Object.assign(r, { data: copy(d.data) }) : r;
      });
    });
  };

  api.pro.saveDoc = function (recordId, p) {
    if (isObj(p)) {
      var old0 = has(p, 'id') && p.id !== null ? byId(p.id) : null;
      var kind0 = old0 ? old0.kind : (p.kind ? String(p.kind) : 'note');
      if (kind0 === 'note') return origSave.call(api.pro, recordId, p);
    } else return origSave.call(api.pro, recordId, p);
    return tick(null).then(function () {
      var u = K.pro();
      Object.keys(p).forEach(function (k) { if (ALLOWED.indexOf(k) < 0) throw pgErr('invalid_field'); });
      K.mine(u, recordId);
      var now = new Date().toISOString(), day = today(), old = null, d;
      if (has(p, 'id') && p.id !== null) {
        old = myDoc(u, p.id, recordId);
        if (!old) throw pgErr('not_found');
        if (has(p, 'kind') && p.kind !== old.kind) throw pgErr('invalid_kind');
        d = Object.assign({}, old);
      } else {
        d = { id: nid('doc'), seq: C.docs.length + 1, proId: u.id, recordId: recordId, kind: String(p.kind || 'note'), docDate: day, apptId: null, mood: null, origin: 'manual', draft: false, personal: false,
          title: null, demand: null, interventions: null, body: null, plan: null, data: null, createdAt: now, updatedAt: now };
      }
      if (DOC_KINDS.indexOf(d.kind) < 0) throw pgErr('invalid_kind');
      if (!old && C.docs.filter(function (x) { return x.recordId === recordId && x.kind === d.kind; }).length >= 1000) throw pgErr('limit_reached');
      if (has(p, 'doc_date')) {
        if (!K.validDate(K.str(p.doc_date)) || p.doc_date < '1900-01-01' || p.doc_date > addDays(day, 1)) throw pgErr('date_invalid');
        d.docDate = p.doc_date;
      }
      if (has(p, 'appointment_id')) {
        if (p.appointment_id === null || p.appointment_id === '') d.apptId = null;
        else { if (!apptOk(u, recordId, p.appointment_id)) throw pgErr('appointment_invalid'); d.apptId = p.appointment_id; }
      }
      ['mood', 'origin', 'draft', 'personal', 'demand', 'interventions', 'body', 'plan'].forEach(function (k) { if (has(p, k)) throw pgErr('invalid_field'); });
      if (has(p, 'title')) d.title = text120(p.title);
      if (has(p, 'data')) {
        if (d.kind === 'scale') d.data = scaleClean(p.data);
        else if (d.kind === 'med') d.data = medClean(p.data, old ? old.data : null, old ? ymdLocal(new Date(old.createdAt)) : day, day);
        else if (d.kind === 'plan') d.data = planClean(p.data, day);
        else d.data = documentClean(p.data);
      } else if (!old) throw pgErr('invalid_data');
      if (d.kind === 'med') d.title = d.data.name;
      if (d.kind === 'scale') d.title = d.data.scale === 'phq9' ? 'PHQ-9' : 'GAD-7';
      if (d.kind === 'plan' && !d.title) throw pgErr('plan_title_required');
      if (d.kind === 'document' && !d.title) d.title = TITLES[d.data.type];
      d.updatedAt = now;
      if (old) C.docs[C.docs.indexOf(old)] = d; else C.docs.push(d);
      return d.id;
    });
  };

  api.pro.deleteDoc = function (id) {
    return origDelete.call(api.pro, id).then(function (r) { delete C.files[id]; return r; });
  };

  /* ------------------------------------------------------------ anexos (foto ou PDF, cifrados no banco de verdade) */
  var MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  function plainText(p, k, max) {
    if (!has(p, k)) return null;
    return (function () {
      var v = p[k];
      if (v !== null && typeof v !== 'string') throw pgErr('invalid_data');
      var s = v == null ? '' : v.trim();
      if (s.length > max) throw pgErr('field_too_long');
      return s || null;
    })();
  }
  function b64Bytes(b64) { var s = b64.replace(/\s/g, ''); return Math.floor(s.length * 3 / 4) - (s.slice(-2) === '==' ? 2 : s.slice(-1) === '=' ? 1 : 0); }
  function magicOk(mime, b64) {
    var head;
    try { head = atob(b64.replace(/\s/g, '').slice(0, 24)); } catch (e) { return false; }
    function at(s, off) { return head.substr(off || 0, s.length) === s; }
    if (mime === 'application/pdf') return at('%PDF-');
    if (mime === 'image/jpeg') return at('\xff\xd8\xff');
    if (mime === 'image/png') return at('\x89PNG\r\n\x1a\n');
    return at('RIFF') && at('WEBP', 8);
  }

  api.pro.attachmentSave = function (recordId, p) {
    return tick(null).then(function () {
      var u = K.pro(), day = today(), now = new Date().toISOString();
      if (!isObj(p)) throw pgErr('invalid_data');
      Object.keys(p).forEach(function (k) { if (['id', 'label', 'file_name', 'mime', 'content_b64', 'doc_date'].indexOf(k) < 0) throw pgErr('invalid_field'); });
      K.mine(u, recordId);
      if (has(p, 'id') && p.id !== null) {
        if (has(p, 'content_b64') || has(p, 'file_name') || has(p, 'mime')) throw pgErr('invalid_field');
        var o = myDoc(u, p.id, recordId);
        if (!o || o.kind !== 'attachment') throw pgErr('not_found');
        var lb = plainText(p, 'label', 120);
        if (!lb) throw pgErr('invalid_data');
        o.title = lb; o.data = Object.assign({}, o.data, { label: lb }); o.updatedAt = now;
        return o.id;
      }
      var name = plainText(p, 'file_name', 160), mime = plainText(p, 'mime', 40), label = plainText(p, 'label', 120), b64 = p.content_b64;
      if (!name || !mime || typeof b64 !== 'string' || !b64) throw pgErr('file_invalid');
      if (MIMES.indexOf(mime) < 0) throw pgErr('file_type_invalid');
      if (b64.length > 7000000) throw pgErr('file_too_large');
      if (!/^[A-Za-z0-9+\/\s]*={0,2}\s*$/.test(b64) || b64.replace(/\s/g, '').length % 4 !== 0) throw pgErr('file_invalid');
      var size = b64Bytes(b64);
      if (size <= 0) throw pgErr('file_invalid');
      if (size > 5 * 1024 * 1024) throw pgErr('file_too_large');
      if (!magicOk(mime, b64)) throw pgErr('file_invalid');
      var used = 0;
      C.docs.forEach(function (d) { if (d.proId === u.id && d.kind === 'attachment' && C.files[d.id]) used += C.files[d.id].length; });
      if (used + size * 4 / 3 > 200 * 1024 * 1024) throw pgErr('storage_full');
      if (C.docs.filter(function (d) { return d.recordId === recordId && d.kind === 'attachment'; }).length >= 200) throw pgErr('limit_reached');
      var date = day;
      if (has(p, 'doc_date')) {
        if (!K.validDate(K.str(p.doc_date)) || p.doc_date < '1900-01-01' || p.doc_date > addDays(day, 1)) throw pgErr('date_invalid');
        date = p.doc_date;
      }
      label = label || name.replace(/\.[A-Za-z0-9]{1,5}$/, '');
      var d = { id: nid('doc'), seq: C.docs.length + 1, proId: u.id, recordId: recordId, kind: 'attachment', docDate: date, apptId: null, mood: null, origin: 'manual', draft: false, personal: false,
        title: label, demand: null, interventions: null, body: null, plan: null, data: { label: label, file_name: name, mime: mime, size: size }, createdAt: now, updatedAt: now };
      C.docs.push(d); C.files[d.id] = b64.replace(/\s/g, '');
      return d.id;
    });
  };
  api.pro.attachmentGet = function (id) {
    return tick(null).then(function () {
      var u = K.pro(), d = myDoc(u, id);
      if (!d || d.kind !== 'attachment' || !C.files[d.id]) throw pgErr('not_found');
      return Object.assign(copy(d.data), { id: d.id, record_id: d.recordId, doc_date: d.docDate, content_b64: C.files[d.id] });
    });
  };

  /* ------------------------------------------------------------ dados de exemplo para a demonstracao */
  var seedOrig = care.seedExamples;
  care.seedExamples = function (u) {
    var first = !u.seeded;
    seedOrig(u);
    if (!first) return;
    var marina = S.records.filter(function (r) { return r.proId === u.id && r.name.indexOf('Marina') === 0; })[0];
    if (!marina) return;
    var now = new Date().toISOString();
    function put(kind, date, title, data) {
      C.docs.push({ id: nid('doc'), seq: C.docs.length + 1, proId: u.id, recordId: marina.id, kind: kind, docDate: date, apptId: null, mood: null, origin: 'manual', draft: false, personal: false,
        title: title, demand: null, interventions: null, body: null, plan: null, data: data, createdAt: now, updatedAt: now });
    }
    var d1 = scaleClean({ scale: 'phq9', answers: [2, 2, 2, 1, 2, 2, 1, 1, 0], difficulty: 2 }), d2 = scaleClean({ scale: 'phq9', answers: [1, 1, 1, 1, 1, 1, 0, 0, 0], difficulty: 1, notes: 'Dormindo melhor.' });
    put('scale', addDays(today(), -60), 'PHQ-9', d1);
    put('scale', addDays(today(), -10), 'PHQ-9', d2);
    put('scale', addDays(today(), -10), 'GAD-7', scaleClean({ scale: 'gad7', answers: [2, 1, 2, 1, 0, 1, 1] }));
    put('med', addDays(today(), -90), 'Sertralina', medClean({ name: 'Sertralina', dose: '50 mg', freq: '1x ao dia, de manhã', reason: 'ansiedade', prescriber: 'Dra. Ana Lima, CRM 123456', start: addDays(today(), -90), notes: 'Sem efeitos colaterais relatados.' }, null, today(), today()));
    var plan = window.Clinic.planModel('sono');
    put('plan', addDays(today(), -7), plan.title, planClean({ goal: plan.goal, start: addDays(today(), -7), review: addDays(today(), 7), model_id: 'sono', items: plan.items.map(function (x) { return { text: x.text, days: x.days, period: x.period, time: x.time, hint: x.hint }; }),
      guidance: plan.guidance, mood_line: true, urgent: true }, today()));
  };

  /* Como no servidor, todo erro chega como promessa recusada. */
  ['docs', 'saveDoc', 'deleteDoc', 'attachmentSave', 'attachmentGet'].forEach(function (k) {
    var f = api.pro[k];
    api.pro[k] = function () { try { return Promise.resolve(f.apply(api.pro, arguments)); } catch (e) { return Promise.reject(e); } };
  });

  api._clinico = { cleanFields: cleanFields, scaleClean: scaleClean, medClean: medClean, planClean: planClean, documentClean: documentClean };
})();
