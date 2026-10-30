/* Modo demonstracao, parte do financeiro (porte do app antigo): pagamentos, recibos numerados, despesas, A receber, extrato e relatorios.
   Espelha as regras do banco (supabase/migrations/20261029160000_financeiro.sql) para testar as telas sem servidor. Tudo na memoria do navegador. */
(function () {
  'use strict';
  var api = window.API_DEMO, core = api._core, care = api._care, H = care.helpers, K = api._clinic;
  var S = H.S, C = K.C, tick = core.tick, pgErr = H.pgErr, nid = H.nid, today = H.today, addDays = H.addDays, dow = H.dow, dayOf = H.dayOf, hmOf = H.hmOf, iso = H.iso;
  var F = C.fin = { payments: [], receipts: [], counters: {}, expenses: [] };

  var METHODS = ['pix', 'cash', 'debit', 'credit', 'card', 'transfer', 'boleto', 'insurance', 'other'];
  var CATEGORIES = ['rent', 'supplies', 'supervision', 'taxes', 'marketing', 'transport', 'other'];
  var DAY = 86400000;

  function pro() { return K.pro(); }
  function mine(u, id) { return K.mine(u, id); }
  function has(p, k) { return Object.prototype.hasOwnProperty.call(p, k); }
  function str(v) { return v == null ? '' : String(v); }
  function obj(p) { if (p == null || typeof p !== 'object' || Array.isArray(p)) throw pgErr('invalid_data'); return p; }
  function onlyKeys(p, keys) { Object.keys(p).forEach(function (k) { if (keys.indexOf(k) < 0) throw pgErr('invalid_field'); }); }
  function dayMs(d) { return Date.parse(d + 'T12:00:00Z'); }
  function isDay(s) { return K.validDate(str(s)); }
  function monthStart(d) { return d.slice(0, 8) + '01'; }
  function addMonthStart(d, n) {
    var y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n, y2 = y + Math.floor(m / 12), m2 = ((m % 12) + 12) % 12;
    return y2 + '-' + (m2 + 1 < 10 ? '0' : '') + (m2 + 1) + '-01';
  }
  function mondayOf(d) { return addDays(d, -((dow(d) + 6) % 7)); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function floorN(n) { return Math.floor(n + 1e-9); }
  function plainText(p, k, max) {
    if (p[k] !== null && p[k] !== undefined && typeof p[k] !== 'string') throw pgErr('invalid_data');
    var v = str(p[k]).trim() || null;
    if (v && v.length > max) throw pgErr('field_too_long');
    return v;
  }

  /* ------------------------------------------------------------ valor e nome */
  function ficha(recordId) { return C.ficha[recordId] || null; }
  function agendaPrice(proId) { var u = H.byId(proId); var g = u ? H.P(u).settings : null; return g && g.price_cents != null ? g.price_cents : null; }
  function apptPrice(a) {
    if (a.priceCents != null) return a.priceCents;
    var f = ficha(a.recordId);
    if (f && f.session_price_cents != null) return f.session_price_cents;
    var g = agendaPrice(a.proId);
    return g != null ? g : 0;
  }
  function recordLabel(recordId) {
    var r = H.recById(recordId); if (!r) return '';
    var f = ficha(recordId);
    return (f && f.social_name) || r.name;
  }
  function billable(a) { return a.status === 'done' || (a.status === 'no_show' && a.charge !== false); }

  /* ------------------------------------------------------------ situacao de pagamento (private.finance_recompute) */
  function byPaid(a, b) { return a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : a.seq - b.seq; }
  function recompute(recordId) {
    var appts = S.appts.filter(function (a) { return a.recordId === recordId; });
    var pays = F.payments.filter(function (p) { return p.recordId === recordId; });
    var direct = {};
    pays.forEach(function (p) {
      if (!p.apptId) return;
      var a = appts.filter(function (x) { return x.id === p.apptId; })[0];
      if (a && ['scheduled', 'done', 'no_show'].indexOf(a.status) >= 0) direct[a.id] = p;
    });
    var pool = pays.filter(function (p) { return !p.apptId || !direct[p.apptId]; }).sort(byPaid), cum = 0;
    pool.forEach(function (p) { cum = r2(cum + p.sessions); p.cum = cum; });
    var want = appts.filter(function (a) { return !direct[a.id] && (a.status === 'done' || a.status === 'scheduled' || (a.status === 'no_show' && a.charge !== false)); })
      .sort(function (a, b) {
        var ka = a.status === 'scheduled' ? 1 : 0, kb = b.status === 'scheduled' ? 1 : 0;
        return ka - kb || a.startsAt - b.startsAt || (a.id < b.id ? -1 : 1);
      });
    var cover = {};
    want.forEach(function (a, i) {
      var n = i + 1, hit = null;
      for (var k = 0; k < pool.length; k++) if (floorN(pool[k].cum) >= n) { hit = pool[k]; break; }
      if (hit) cover[a.id] = hit;
    });
    appts.forEach(function (a) {
      var d = direct[a.id], c = cover[a.id], ps, pd = null, pm = null;
      if (d || c) { ps = 'paid'; pd = (d || c).paidOn; pm = (d || c).method; }
      else if (billable(a) && apptPrice(a) > 0) ps = 'pending';
      else ps = 'none';
      a.paymentStatus = ps;
      a.paidAt = ps === 'paid' ? H.at(pd, '12:00') : null;
      a.payMethod = ps === 'paid' ? pm : null;
    });
  }
  function recomputeAll() {
    var ids = {};
    S.appts.forEach(function (a) { ids[a.recordId] = 1; });
    F.payments.forEach(function (p) { ids[p.recordId] = 1; });
    Object.keys(ids).forEach(recompute);
  }

  /* ------------------------------------------------------------ recibos */
  function receiptDefaults(recordId) {
    var r = H.recById(recordId); if (!r) return {};
    var f = ficha(recordId), c = (f && f.clinical) || {}, payer = f ? f.payer : 'self';
    if (payer === 'guardian') return { payer_name: c.resp_name || r.guardianName || r.name, payer_cpf: c.resp_cpf || null, beneficiary_name: r.name, beneficiary_cpf: c.cpf || null, referente: 'Sessões de psicoterapia' };
    if (payer === 'other') return { payer_name: c.payer_name || r.name, payer_cpf: c.payer_cpf || null, beneficiary_name: r.name, beneficiary_cpf: c.cpf || null, referente: 'Sessões de psicoterapia' };
    return { payer_name: r.name, payer_cpf: c.cpf || null, beneficiary_name: null, beneficiary_cpf: null, referente: 'Sessões de psicoterapia' };
  }
  function docField(p, k, cnpj) {
    var v = plainText(p, k, 30);
    if (v === null) return null;
    var d = K.digits(v);
    if (K.validCpf(d) || (cnpj && K.validCnpj(d))) return d;
    throw pgErr('cpf_invalid');
  }
  function makeReceipt(u, recordId, paymentId, date, cents, method, data) {
    var def = recordId ? receiptDefaults(recordId) : {};
    obj(data); onlyKeys(data, ['payer_name', 'payer_cpf', 'beneficiary_name', 'beneficiary_cpf', 'referente']);
    var payer = has(data, 'payer_name') ? plainText(data, 'payer_name', 120) : (def.payer_name || null);
    var pcpf = has(data, 'payer_cpf') ? docField(data, 'payer_cpf', true) : (def.payer_cpf || null);
    var ben = has(data, 'beneficiary_name') ? plainText(data, 'beneficiary_name', 120) : (def.beneficiary_name || null);
    var bcpf = has(data, 'beneficiary_cpf') ? docField(data, 'beneficiary_cpf', false) : (def.beneficiary_cpf || null);
    var ref = has(data, 'referente') ? plainText(data, 'referente', 200) : (def.referente || null);
    if (!payer) throw pgErr('payer_required');
    ref = ref || 'Sessões de psicoterapia';
    if (!ben) bcpf = null;
    var year = +date.slice(0, 4), key = u.id + ':' + year;
    F.counters[key] = (F.counters[key] || 0) + 1;
    var seq = F.counters[key];
    var rc = { id: nid('rc'), proId: u.id, recordId: recordId || null, paymentId: paymentId || null, year: year, seq: seq, number: year + '-' + ('0000' + seq).slice(-4), issuedOn: date, cents: cents,
      method: method || null, holder: recordId ? recordLabel(recordId) : null, payerName: payer, payerCpf: pcpf, benName: ben, benCpf: bcpf, ref: ref, canceledAt: null, cancelReason: null, createdAt: Date.now() };
    F.receipts.push(rc);
    return rc;
  }
  function liveReceipt(paymentId) { return F.receipts.filter(function (r) { return r.paymentId === paymentId && !r.canceledAt; })[0] || null; }
  function receiptOf(paymentId) {
    var all = F.receipts.filter(function (r) { return r.paymentId === paymentId; });
    all.sort(function (a, b) { return (a.canceledAt ? 1 : 0) - (b.canceledAt ? 1 : 0) || b.createdAt - a.createdAt; });
    var r = all[0];
    return r ? { id: r.id, number: r.number, canceled: !!r.canceledAt } : null;
  }
  function myReceipt(u, id) { var r = F.receipts.filter(function (x) { return x.id === id && x.proId === u.id; })[0]; if (!r) throw pgErr('not_found'); return r; }

  /* ------------------------------------------------------------ pagamentos */
  function payOut(p, withName) {
    var o = { id: p.id, record_id: p.recordId, appointment_id: p.apptId || null, paid_on: p.paidOn, amount_cents: p.cents, sessions: p.sessions, method: p.method || null, note: p.note || null, receipt: receiptOf(p.id) };
    if (withName) o.name = recordLabel(p.recordId);
    return o;
  }
  function myPay(u, id) { var p = F.payments.filter(function (x) { return x.id === id && x.proId === u.id; })[0]; if (!p) throw pgErr('not_found'); return p; }
  function range(from, to, max) {
    if (!isDay(from) || !isDay(to) || to < from || (dayMs(to) - dayMs(from)) / DAY > max) throw pgErr('range_invalid');
  }

  function savePayment(p) {
    var u = pro();
    obj(p); onlyKeys(p, ['id', 'record_id', 'appointment_id', 'paid_on', 'amount_cents', 'sessions', 'method', 'note', 'receipt']);
    var t = today(), o = null, pay;
    if (has(p, 'id') && p.id !== null) {
      o = myPay(u, p.id);
      if (has(p, 'record_id') && p.record_id !== o.recordId) throw pgErr('invalid_field');
      if (has(p, 'receipt')) throw pgErr('invalid_field');
      pay = Object.assign({}, o);
    } else {
      if (!has(p, 'record_id') || p.record_id === null) throw pgErr('invalid_data');
      mine(u, p.record_id);
      if (!has(p, 'amount_cents')) throw pgErr('amount_invalid');
      pay = { id: nid('pay'), seq: F.payments.length + 1, proId: u.id, recordId: p.record_id, apptId: null, paidOn: t, cents: null, sessions: 1, method: null, note: null, createdAt: Date.now() };
    }
    var live = o ? !!liveReceipt(o.id) : false;
    if (has(p, 'appointment_id')) {
      if (p.appointment_id === null || p.appointment_id === '') pay.apptId = null;
      else {
        var a = S.appts.filter(function (x) { return x.id === p.appointment_id && x.proId === u.id && x.recordId === pay.recordId; })[0];
        if (!a || ['scheduled', 'done', 'no_show'].indexOf(a.status) < 0) throw pgErr('appointment_invalid');
        if (F.payments.some(function (x) { return x.apptId === a.id && (!o || x.id !== o.id); })) throw pgErr('already_paid');
        if (a.paymentStatus === 'paid' && (!o || o.apptId !== a.id)) throw pgErr('already_paid');
        pay.apptId = a.id;
      }
    }
    if (has(p, 'amount_cents')) {
      var c = typeof p.amount_cents === 'number' ? p.amount_cents : (typeof p.amount_cents === 'string' && /^-?\d+$/.test(p.amount_cents) ? Number(p.amount_cents) : NaN);
      if (!isFinite(c) || c % 1 !== 0 || c < 1 || c > 100000000) throw pgErr('amount_invalid');
      pay.cents = c;
    }
    if (has(p, 'paid_on')) {
      if (!isDay(p.paid_on) || p.paid_on < '2000-01-01' || p.paid_on > t) throw pgErr('date_invalid');
      pay.paidOn = p.paid_on;
    }
    if (has(p, 'sessions')) {
      var s = Number(p.sessions);
      if (p.sessions === null || p.sessions === '' || !isFinite(s) || r2(s) < 0 || r2(s) > 500) throw pgErr('sessions_invalid');
      pay.sessions = r2(s);
    }
    if (pay.apptId) pay.sessions = 1;
    if (has(p, 'method')) {
      if (p.method === null || p.method === '') pay.method = null;
      else { if (METHODS.indexOf(p.method) < 0) throw pgErr('method_invalid'); pay.method = p.method; }
    }
    if (has(p, 'note')) pay.note = plainText(p, 'note', 200);
    if (live && (pay.cents !== o.cents || pay.paidOn !== o.paidOn || pay.apptId !== o.apptId)) throw pgErr('payment_has_receipt');
    var rcOut = null;
    if (!o) {
      F.payments.push(pay);
      if (has(p, 'receipt') && p.receipt !== false && p.receipt !== null) {
        if (typeof p.receipt !== 'object' && typeof p.receipt !== 'boolean') throw pgErr('invalid_data');
        try { var rc = makeReceipt(u, pay.recordId, pay.id, pay.paidOn, pay.cents, pay.method, typeof p.receipt === 'object' ? p.receipt : {}); rcOut = { id: rc.id, number: rc.number }; }
        catch (e) { F.payments.pop(); throw e; }
      }
    } else {
      F.payments[F.payments.indexOf(o)] = pay;
    }
    recompute(pay.recordId);
    return { id: pay.id, receipt: rcOut };
  }

  /* ------------------------------------------------------------ API: financeiro */
  var fin = {
    summary: function (ymd) {
      var u = pro(), t = today(), first = monthStart(ymd ? str(ymd) : t);
      if (ymd && !isDay(ymd)) throw pgErr('range_invalid');
      if (first < '2000-01-01' || first > addDays(t, 400)) throw pgErr('range_invalid');
      var next = addMonthStart(first, 1), prev = addMonthStart(first, -1);
      function inP(a, b) { return F.payments.filter(function (p) { return p.proId === u.id && p.paidOn >= a && p.paidOn < b; }); }
      function inE(a, b) { return F.expenses.filter(function (e) { return e.proId === u.id && e.paidOn >= a && e.paidOn < b; }); }
      function sum(list) { return list.reduce(function (n, x) { return n + x.cents; }, 0); }
      var pays = inP(first, next), exps = inE(first, next), rec = sum(pays), exp = sum(exps);
      var pend = S.appts.filter(function (a) { return a.proId === u.id && a.paymentStatus === 'pending'; });
      var by = {};
      pays.forEach(function (p) { var k = p.method || 'other'; by[k] = (by[k] || 0) + p.cents; });
      var recs = {};
      pend.forEach(function (a) { recs[a.recordId] = 1; });
      return { month: first.slice(0, 7), from: first, to: addDays(next, -1), received_cents: rec, expenses_cents: exp, result_cents: rec - exp,
        prev_received_cents: sum(inP(prev, first)), prev_expenses_cents: sum(inE(prev, first)), payments_count: pays.length, expenses_count: exps.length,
        sessions_done: S.appts.filter(function (a) { return a.proId === u.id && a.status === 'done' && dayOf(a.startsAt) >= first && dayOf(a.startsAt) < next; }).length,
        pending_cents: pend.reduce(function (n, a) { return n + apptPrice(a); }, 0), pending_count: pend.length, pending_patients: Object.keys(recs).length,
        by_method: Object.keys(by).map(function (k) { return { method: k, cents: by[k] }; }).sort(function (a, b) { return b.cents - a.cents; }) };
    },
    payments: function (from, to, recordId) {
      var u = pro(); range(from, to, 1830);
      return F.payments.filter(function (p) { return p.proId === u.id && p.paidOn >= from && p.paidOn <= to && (!recordId || p.recordId === recordId); })
        .sort(function (a, b) { return a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : b.seq - a.seq; }).slice(0, 2000).map(function (p) { return payOut(p, true); });
    },
    context: function (recordId) {
      var u = pro(); mine(u, recordId);
      var f = ficha(recordId), g = agendaPrice(u.id), def = receiptDefaults(recordId);
      var pend = S.appts.filter(function (a) { return a.recordId === recordId && a.paymentStatus === 'pending'; }).sort(function (a, b) { return a.startsAt - b.startsAt; });
      var st = C.settings[u.id] || {};
      return { name: recordLabel(recordId), price_cents: f && f.session_price_cents != null ? f.session_price_cents : g, receipt_auto: !!st.receipt_auto,
        payer_name: def.payer_name || null, payer_cpf: def.payer_cpf || null, beneficiary_name: def.beneficiary_name || null, beneficiary_cpf: def.beneficiary_cpf || null, referente: def.referente || null,
        pending_count: pend.length, pending_cents: pend.reduce(function (n, a) { return n + apptPrice(a); }, 0),
        pending_appointments: pend.map(function (a) { return { id: a.id, starts_at: iso(a.startsAt), price_cents: apptPrice(a) }; }) };
    },
    savePayment: function (p) { return savePayment(p); },
    deletePayment: function (id) {
      var u = pro(), p = myPay(u, id);
      if (liveReceipt(id)) throw pgErr('payment_has_receipt');
      F.payments.splice(F.payments.indexOf(p), 1);
      F.receipts.forEach(function (r) { if (r.paymentId === id) r.paymentId = null; });
      recompute(p.recordId);
      return true;
    },
    pending: function () {
      var u = pro(), by = {};
      S.appts.filter(function (a) { return a.proId === u.id && a.paymentStatus === 'pending'; }).sort(function (a, b) { return a.startsAt - b.startsAt; }).forEach(function (a) {
        var o = by[a.recordId] || (by[a.recordId] = { record_id: a.recordId, name: recordLabel(a.recordId), phone: (H.recById(a.recordId) || {}).phone || null, count: 0, cents: 0, since: dayOf(a.startsAt), dates: [] });
        o.count++; o.cents += apptPrice(a); if (o.dates.length < 8) o.dates.push(dayOf(a.startsAt));
      });
      return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.cents - a.cents || (a.name < b.name ? -1 : 1); });
    },
    patient: function (recordId) {
      var u = pro(); mine(u, recordId);
      var pays = F.payments.filter(function (p) { return p.recordId === recordId && p.proId === u.id; });
      var appts = S.appts.filter(function (a) { return a.recordId === recordId && a.proId === u.id; });
      var bill = appts.filter(billable), pend = appts.filter(function (a) { return a.paymentStatus === 'pending'; }).sort(function (a, b) { return a.startsAt - b.startsAt; });
      var paid = floorN(pays.reduce(function (n, p) { return n + p.sessions; }, 0)), last = pays.reduce(function (m, p) { return p.paidOn > m ? p.paidOn : m; }, '');
      return {
        account: { paid: paid, used: bill.length, balance: paid - bill.length, total_paid_cents: pays.reduce(function (n, p) { return n + p.cents; }, 0), last_payment: last || null,
          pending_count: pend.length, pending_cents: pend.reduce(function (n, a) { return n + apptPrice(a); }, 0),
          done: appts.filter(function (a) { return a.status === 'done'; }).length, no_show: appts.filter(function (a) { return a.status === 'no_show'; }).length,
          canceled: appts.filter(function (a) { return a.status === 'canceled_by_patient' || a.status === 'canceled_by_professional'; }).length,
          upcoming_covered: appts.filter(function (a) { return a.status === 'scheduled' && a.paymentStatus === 'paid'; }).length },
        pending_dates: pend.map(function (a) { return dayOf(a.startsAt); }),
        payments: pays.slice().sort(function (a, b) { return a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : b.seq - a.seq; }).map(function (p) { return payOut(p, false); }),
        sessions: bill.sort(function (a, b) { return b.startsAt - a.startsAt; }).slice(0, 400).map(function (a) {
          return { id: a.id, starts_at: iso(a.startsAt), status: a.status, charge: a.charge !== false, price_cents: apptPrice(a), payment_status: a.paymentStatus };
        })
      };
    },
    receipts: function (year) {
      var u = pro(), y = year == null ? +today().slice(0, 4) : Number(year);
      if (!isFinite(y) || y < 2000 || y > 2100) throw pgErr('range_invalid');
      var mineR = F.receipts.filter(function (r) { return r.proId === u.id; });
      var years = []; mineR.forEach(function (r) { if (years.indexOf(r.year) < 0) years.push(r.year); });
      return { year: y, years: years.sort(function (a, b) { return b - a; }),
        items: mineR.filter(function (r) { return r.year === y; }).sort(function (a, b) { return a.issuedOn < b.issuedOn ? 1 : a.issuedOn > b.issuedOn ? -1 : b.seq - a.seq; }).map(function (r) {
          return { id: r.id, number: r.number, issued_on: r.issuedOn, amount_cents: r.cents, method: r.method, record_id: r.recordId, name: r.holder || '', payment_id: r.paymentId, canceled: !!r.canceledAt };
        }) };
    },
    receipt: function (id) {
      var u = pro(), r = myReceipt(u, id), rec = r.recordId ? H.recById(r.recordId) : null;
      return { id: r.id, number: r.number, issued_on: r.issuedOn, amount_cents: r.cents, method: r.method, record_id: r.recordId, payment_id: r.paymentId, canceled: !!r.canceledAt,
        canceled_at: r.canceledAt ? new Date(r.canceledAt).toISOString() : null, cancel_reason: r.cancelReason, payer_name: r.payerName, payer_cpf: r.payerCpf,
        beneficiary_name: r.benName, beneficiary_cpf: r.benCpf, referente: r.ref, phone: rec ? rec.phone || null : null };
    },
    createReceipt: function (p) {
      var u = pro();
      obj(p); onlyKeys(p, ['payment_id', 'record_id', 'issued_on', 'amount_cents', 'method', 'payer_name', 'payer_cpf', 'beneficiary_name', 'beneficiary_cpf', 'referente']);
      var data = {}; ['payer_name', 'payer_cpf', 'beneficiary_name', 'beneficiary_cpf', 'referente'].forEach(function (k) { if (has(p, k)) data[k] = p[k]; });
      var rec, date, cents, method = null, payId = null;
      if (has(p, 'payment_id') && p.payment_id !== null) {
        ['record_id', 'issued_on', 'amount_cents', 'method'].forEach(function (k) { if (has(p, k)) throw pgErr('invalid_field'); });
        var pay = myPay(u, p.payment_id);
        if (liveReceipt(pay.id)) throw pgErr('receipt_exists');
        payId = pay.id; rec = pay.recordId; date = pay.paidOn; cents = pay.cents; method = pay.method;
      } else {
        rec = null;
        if (has(p, 'record_id') && p.record_id !== null) { mine(u, p.record_id); rec = p.record_id; }
        cents = typeof p.amount_cents === 'number' ? p.amount_cents : NaN;
        if (!isFinite(cents) || cents % 1 !== 0 || cents < 1 || cents > 100000000) throw pgErr('amount_invalid');
        date = today();
        if (has(p, 'issued_on')) { if (!isDay(p.issued_on) || p.issued_on < '2000-01-01' || p.issued_on > date) throw pgErr('date_invalid'); date = p.issued_on; }
        if (has(p, 'method') && p.method !== null) { if (METHODS.indexOf(p.method) < 0) throw pgErr('method_invalid'); method = p.method; }
      }
      var rc = makeReceipt(u, rec, payId, date, cents, method, data);
      return { id: rc.id, number: rc.number };
    },
    cancelReceipt: function (id, reason) {
      var u = pro(), r = myReceipt(u, id), why = str(reason).trim() || null;
      if (why && why.length > 200) throw pgErr('field_too_long');
      if (r.canceledAt) throw pgErr('already_canceled');
      r.canceledAt = Date.now(); r.cancelReason = why;
      return true;
    },
    reactivateReceipt: function (id) {
      var u = pro(), r = myReceipt(u, id);
      if (!r.canceledAt) throw pgErr('not_canceled');
      if (r.paymentId && F.receipts.some(function (x) { return x.paymentId === r.paymentId && !x.canceledAt && x.id !== r.id; })) throw pgErr('receipt_exists');
      r.canceledAt = null; r.cancelReason = null;
      return true;
    },
    expenses: function (from, to) {
      var u = pro(); range(from, to, 1830);
      return F.expenses.filter(function (e) { return e.proId === u.id && e.paidOn >= from && e.paidOn <= to; })
        .sort(function (a, b) { return a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : b.seq - a.seq; })
        .map(function (e) { return { id: e.id, paid_on: e.paidOn, amount_cents: e.cents, category: e.category, description: e.desc }; });
    },
    saveExpense: function (p) {
      var u = pro();
      obj(p); onlyKeys(p, ['id', 'paid_on', 'amount_cents', 'category', 'description']);
      var t = today(), o = null, e;
      if (has(p, 'id') && p.id !== null) {
        o = F.expenses.filter(function (x) { return x.id === p.id && x.proId === u.id; })[0];
        if (!o) throw pgErr('not_found');
        e = Object.assign({}, o);
      } else {
        if (!has(p, 'amount_cents')) throw pgErr('amount_invalid');
        if (!has(p, 'category')) throw pgErr('category_invalid');
        if (!has(p, 'description')) throw pgErr('description_required');
        e = { id: nid('exp'), seq: F.expenses.length + 1, proId: u.id, paidOn: t, cents: null, category: null, desc: null };
      }
      if (has(p, 'paid_on')) { if (!isDay(p.paid_on) || p.paid_on < '2000-01-01' || p.paid_on > addDays(t, 31)) throw pgErr('date_invalid'); e.paidOn = p.paid_on; }
      if (has(p, 'amount_cents')) {
        var c = typeof p.amount_cents === 'number' ? p.amount_cents : NaN;
        if (!isFinite(c) || c % 1 !== 0 || c < 1 || c > 100000000) throw pgErr('amount_invalid');
        e.cents = c;
      }
      if (has(p, 'category')) { if (CATEGORIES.indexOf(p.category) < 0) throw pgErr('category_invalid'); e.category = p.category; }
      if (has(p, 'description')) { var d = plainText(p, 'description', 120); if (!d) throw pgErr('description_required'); e.desc = d; }
      if (o) F.expenses[F.expenses.indexOf(o)] = e; else F.expenses.push(e);
      return e.id;
    },
    deleteExpense: function (id) {
      var u = pro(), e = F.expenses.filter(function (x) { return x.id === id && x.proId === u.id; })[0];
      if (!e) throw pgErr('not_found');
      F.expenses.splice(F.expenses.indexOf(e), 1);
      return true;
    },
    report: function (from, to, bucket) {
      var u = pro(), unit = bucket || 'month';
      if (['week', 'month'].indexOf(unit) < 0) throw pgErr('invalid_data');
      range(from, to, 800);
      var pays = F.payments.filter(function (p) { return p.proId === u.id; }), exps = F.expenses.filter(function (e) { return e.proId === u.id; });
      var appts = S.appts.filter(function (a) { return a.proId === u.id; });
      function between(d, a, b) { return d >= a && d <= b; }
      function inRange(a, b) {
        var ps = pays.filter(function (p) { return p.paidOn >= a && p.paidOn < b; }), es = exps.filter(function (e) { return e.paidOn >= a && e.paidOn < b; });
        var ap = appts.filter(function (x) { var d = dayOf(x.startsAt); return d >= a && d < b; });
        return { received_cents: ps.reduce(function (n, p) { return n + p.cents; }, 0), expenses_cents: es.reduce(function (n, e) { return n + e.cents; }, 0),
          done: ap.filter(function (x) { return x.status === 'done'; }).length, no_show: ap.filter(function (x) { return x.status === 'no_show'; }).length,
          canceled: ap.filter(function (x) { return x.status === 'canceled_by_patient' || x.status === 'canceled_by_professional'; }).length };
      }
      var series = [], day = unit === 'week' ? mondayOf(from) : monthStart(from), end = addDays(to, 1);
      while (day <= to) {
        var next = unit === 'week' ? addDays(day, 7) : addMonthStart(day, 1);
        var o = inRange(day > from ? day : from, next < end ? next : end);
        o.start = day; series.push(o);
        day = next;
      }
      var total = inRange(from, end), inAppts = appts.filter(function (x) { return between(dayOf(x.startsAt), from, to); });
      var seen = {}; inAppts.forEach(function (x) { if (x.status === 'done' || x.status === 'no_show') seen[x.recordId] = 1; });
      var by = {}, cat = {}, top = {};
      pays.filter(function (p) { return between(p.paidOn, from, to); }).forEach(function (p) { var k = p.method || 'other'; by[k] = (by[k] || 0) + p.cents; top[p.recordId] = (top[p.recordId] || 0) + p.cents; });
      exps.filter(function (e) { return between(e.paidOn, from, to); }).forEach(function (e) { cat[e.category] = (cat[e.category] || 0) + e.cents; });
      var wd = [0, 0, 0, 0, 0, 0, 0], hrs = {};
      inAppts.filter(function (x) { return x.status === 'done'; }).forEach(function (x) { wd[dow(dayOf(x.startsAt))]++; var h = parseInt(hmOf(x.startsAt).slice(0, 2), 10); hrs[h] = (hrs[h] || 0) + 1; });
      var newP = S.records.filter(function (r) {
        if (r.proId !== u.id) return false;
        var f = ficha(r.id), d = (f && f.started_on) || dayOf(r.createdAt || Date.now());
        return between(d, from, to);
      }).length;
      return { from: from, to: to, bucket: unit, series: series,
        totals: { received_cents: total.received_cents, expenses_cents: total.expenses_cents, done: total.done, no_show: total.no_show, canceled: total.canceled,
          attended_patients: Object.keys(seen).length, new_patients: newP,
          unmarked_past: inAppts.filter(function (x) { return x.status === 'scheduled' && x.startsAt < Date.now(); }).length },
        by_method: Object.keys(by).map(function (k) { return { method: k, cents: by[k] }; }).sort(function (a, b) { return b.cents - a.cents; }),
        by_category: Object.keys(cat).map(function (k) { return { category: k, cents: cat[k] }; }).sort(function (a, b) { return b.cents - a.cents; }),
        top_patients: Object.keys(top).map(function (k) { return { record_id: k, name: recordLabel(k), cents: top[k] }; }).sort(function (a, b) { return b.cents - a.cents; }).slice(0, 6),
        weekday: wd, hours: Object.keys(hrs).map(Number).sort(function (a, b) { return a - b; }).map(function (h) { return { hour: h, n: hrs[h] }; }) };
    }
  };
  api.pro.finance = fin;

  /* ------------------------------------------------------------ agenda: marca de "pago" e falta cobrada */
  var LABELS = { pix: 'pix', dinheiro: 'cash', cash: 'cash', 'cartão de débito': 'debit', 'cartao de debito': 'debit', débito: 'debit', debito: 'debit', debit: 'debit',
    'cartão de crédito': 'credit', 'cartao de credito': 'credit', crédito: 'credit', credito: 'credit', credit: 'credit', cartão: 'card', cartao: 'card', card: 'card',
    transferência: 'transfer', transferencia: 'transfer', transfer: 'transfer', ted: 'transfer', doc: 'transfer', boleto: 'boleto', convênio: 'insurance', convenio: 'insurance', insurance: 'insurance' };
  function methodNorm(t) { var s = str(t).trim().slice(0, 30).toLowerCase(); return s ? (LABELS[s] || 'other') : null; }
  function mineAppt(u, id) { var a = S.appts.filter(function (x) { return x.id === id && x.proId === u.id; })[0]; if (!a) throw pgErr('not_found'); return a; }
  api.agenda.markPaid = function (id, paid, method) {
    return tick(null).then(function () {
      var u = core.cur();
      if (!H.verifiedPro(u)) throw pgErr('not_allowed');
      if (typeof paid !== 'boolean') paid = !!paid;
      var a = mineAppt(u, id), pay = F.payments.filter(function (p) { return p.apptId === id; })[0] || null, meth = methodNorm(method);
      if (paid) {
        if (pay) return true;
        if (['scheduled', 'done', 'no_show'].indexOf(a.status) < 0) throw pgErr('invalid_status');
        if (a.paymentStatus === 'paid') throw pgErr('already_paid');
        var cents = apptPrice(a);
        if (cents <= 0) throw pgErr('price_missing');
        var np = { id: nid('pay'), seq: F.payments.length + 1, proId: u.id, recordId: a.recordId, apptId: id, paidOn: today(), cents: cents, sessions: 1, method: meth, note: null, createdAt: Date.now() };
        F.payments.push(np);
        if ((C.settings[u.id] || {}).receipt_auto) makeReceipt(u, a.recordId, np.id, np.paidOn, cents, meth, {});
      } else if (pay) {
        if (liveReceipt(pay.id)) throw pgErr('payment_has_receipt');
        F.payments.splice(F.payments.indexOf(pay), 1);
        F.receipts.forEach(function (r) { if (r.paymentId === pay.id) r.paymentId = null; });
      } else if (a.paymentStatus === 'paid') {
        throw pgErr('paid_by_package');
      }
      recompute(a.recordId);
      return true;
    });
  };
  api.agenda.setCharge = function (id, charge) {
    return tick(null).then(function () {
      var u = core.cur();
      if (!H.verifiedPro(u)) throw pgErr('not_allowed');
      if (typeof charge !== 'boolean') charge = !!charge;
      var a = mineAppt(u, id);
      if (a.status !== 'no_show') throw pgErr('invalid_status');
      a.charge = charge;
      recompute(a.recordId);
      return true;
    });
  };

  /* ------------------------------------------------------------ dados de exemplo */
  var seedOrig = care.seedExamples;
  care.seedExamples = function (u) {
    var first = !u.seeded;
    seedOrig(u);
    if (!first) return;
    var t = today(), recs = S.records.filter(function (r) { return r.proId === u.id; });
    var marina = recs.filter(function (r) { return r.name.indexOf('Marina') === 0; })[0];
    if (marina) {
      var p1 = { id: nid('pay'), seq: F.payments.length + 1, proId: u.id, recordId: marina.id, apptId: null, paidOn: addDays(t, -6), cents: 40000, sessions: 2, method: 'pix', note: null, createdAt: Date.now() };
      F.payments.push(p1);
      var m1 = addMonthStart(t, -1), m2 = addMonthStart(t, -2);
      [[m1.slice(0, 8) + '10', 60000], [m1.slice(0, 8) + '24', 40000], [m2.slice(0, 8) + '10', 60000], [m2.slice(0, 8) + '24', 20000]].forEach(function (x) {
        F.payments.push({ id: nid('pay'), seq: F.payments.length + 1, proId: u.id, recordId: marina.id, apptId: null, paidOn: x[0], cents: x[1], sessions: 0, method: 'pix', note: 'Histórico', createdAt: Date.now() });
      });
      var rc = makeReceipt(u, marina.id, p1.id, p1.paidOn, p1.cents, p1.method, {});
      rc.createdAt = Date.now() - 6 * DAY;
    }
    [['rent', 'Aluguel da sala', 80000, -3], ['supplies', 'Material de escritório', 5500, -10], ['supervision', 'Supervisão clínica', 25000, -14], ['rent', 'Aluguel da sala', 80000, -33]].forEach(function (x) {
      F.expenses.push({ id: nid('exp'), seq: F.expenses.length + 1, proId: u.id, paidOn: addDays(t, x[3]), cents: x[2], category: x[0], desc: x[1] });
    });
    recomputeAll();
  };

  /* Antes e depois de cada chamada, a situacao de pagamento das consultas fica em dia (no servidor, os gatilhos fazem isso). */
  ['agenda', 'booking', 'pro'].forEach(function (ns) {
    var o = api[ns];
    Object.keys(o).forEach(function (k) {
      var f = o[k];
      if (typeof f !== 'function') return;
      o[k] = function () {
        recomputeAll();
        return f.apply(o, arguments).then(function (r) { recomputeAll(); return r; });
      };
    });
  });
  /* Como no servidor, todo erro chega como promessa recusada. Aplicado so as funcoes novas (as demais ja foram embrulhadas). */
  Object.keys(fin).forEach(function (k) {
    var f = fin[k];
    fin[k] = function () {
      var args = arguments;
      return tick(null).then(function () { recomputeAll(); var r = f.apply(fin, args); recomputeAll(); return r; });
    };
  });

  api._fin = { F: F, recompute: recompute, recomputeAll: recomputeAll, apptPrice: apptPrice, METHODS: METHODS, CATEGORIES: CATEGORIES };
})();
