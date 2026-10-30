/* Utilitarios do consultorio (ficha, evolucao, financeiro, documentos): dinheiro, CPF e CNPJ, listas de opcoes e rotulos.
   Mesmas regras do banco (private.valid_cpf, private.valid_cnpj). Sem dependencias alem de window.UI. */
(function () {
  'use strict';

  /* "150,00" -> 15000. Vazio = null. Invalido = NaN. */
  function parseMoney(str, max) {
    var s = String(str || '').replace(/[^\d,.]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    var v = Number(s);
    return isFinite(v) && v >= 0 && v <= (max || 10000) ? Math.round(v * 100) : NaN;
  }
  function moneyText(cents) { return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','); }
  function money(cents) { var n = cents || 0; return (n < 0 ? '-' : '') + 'R$ ' + (Math.abs(n) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

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
  function maskCpf(s) {
    var d = digits(s).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  function maskCnpj(s) {
    var d = digits(s).slice(0, 14);
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  /* CPF (11 digitos) ou CNPJ (14), conforme o tamanho. */
  function maskDoc(s) { return digits(s).length > 11 ? maskCnpj(s) : maskCpf(s); }
  function validDoc(s) { var n = digits(s).length; return n === 11 ? validCpf(s) : n === 14 ? validCnpj(s) : false; }

  /* Campo de texto que formata CPF enquanto a pessoa digita. Devolve o campo do UI.field. */
  function cpfField(o) {
    var f = UI.field(Object.assign({ inputmode: 'numeric', maxlength: 14, placeholder: '000.000.000-00' }, o));
    if (f.input.value) f.input.value = maskCpf(f.input.value);
    f.input.addEventListener('input', function () { f.input.value = maskCpf(f.input.value); });
    return f;
  }
  function docField(o) {
    var f = UI.field(Object.assign({ inputmode: 'numeric', maxlength: 18, placeholder: 'CPF ou CNPJ' }, o));
    if (f.input.value) f.input.value = maskDoc(f.input.value);
    f.input.addEventListener('input', function () { f.input.value = maskDoc(f.input.value); });
    return f;
  }

  /* Situacao do paciente: chave do banco, rotulo e tom do selo. */
  var STATUS = [['active', 'Ativo', 'ok'], ['paused', 'Em pausa', 'warn'], ['discharged', 'Alta', 'soft'], ['dropped', 'Interrompeu', 'bad'], ['referred', 'Encaminhado', 'soft']];
  function statusInfo(k) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i][0] === k) return { key: k, label: STATUS[i][1], tone: STATUS[i][2] }; return { key: k, label: String(k || ''), tone: '' }; }

  var LABEL = {
    modality: { in_person: 'Presencial', online: 'Online', hybrid: 'Híbrido' },
    frequency: { weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal', single: 'Avulso' },
    care: { individual: 'Individual', couple: 'Casal', family: 'Família', group: 'Grupo' },
    payer: { self: 'O próprio paciente', guardian: 'Responsável', other: 'Outra pessoa' }
  };
  function opts(map, blank) { var out = blank ? [['', blank]] : []; Object.keys(map).forEach(function (k) { out.push([k, map[k]]); }); return out; }
  var LISTS = {
    gender: ['Feminino', 'Masculino', 'Não binário', 'Outro', 'Prefiro não informar'],
    civil: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)'],
    education: ['Fundamental', 'Médio', 'Superior incompleto', 'Superior completo', 'Pós-graduação']
  };
  function listOpts(list, blank) { return [['', blank || 'Não informado']].concat(list.map(function (x) { return [x, x]; })); }

  /* Foto ou assinatura vinda de um arquivo, reduzida num canvas. Devolve Promise<data URL>. Tenta de novo menor se passar do limite. */
  function imageFromFile(file, o) {
    o = o || {};
    var maxW = o.maxW || 400, maxH = o.maxH || 160, limit = o.limit || 180000, jpeg = o.type === 'jpeg';
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { reject(new Error('image_invalid')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image_invalid')); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var scale = Math.min(1, maxW / img.width, maxH / img.height), out = '';
        for (var i = 0; i < 4; i++) {
          var w = Math.max(1, Math.round(img.width * scale)), hh = Math.max(1, Math.round(img.height * scale));
          var c = document.createElement('canvas'); c.width = w; c.height = hh;
          var cx = c.getContext('2d');
          if (jpeg) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); }
          cx.drawImage(img, 0, 0, w, hh);
          out = c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.85);
          if (out.length <= limit) { resolve(out); return; }
          scale *= 0.7;
        }
        reject(new Error('image_invalid'));
      };
      img.src = url;
    });
  }

  /* Valor por extenso (pt-BR): 150,00 vira "cento e cinquenta reais". Recebe centavos. */
  var W_U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  var W_D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  var W_C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function under1000(n) {
    if (n === 100) return 'cem';
    var c = Math.floor(n / 100), r = n % 100, out = [];
    if (c) out.push(W_C[c]);
    if (r) {
      if (r < 20) out.push(W_U[r]);
      else { var d = Math.floor(r / 10), u = r % 10; out.push(W_D[d] + (u ? ' e ' + W_U[u] : '')); }
    }
    return out.join(' e ');
  }
  function intWords(n) {
    n = Math.floor(n);
    if (n === 0) return 'zero';
    var g = [], bil = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), mi = Math.floor((n % 1e6) / 1e3), r = n % 1000;
    if (bil) g.push({ t: under1000(bil) + (bil > 1 ? ' bilhões' : ' bilhão'), v: bil });
    if (mil) g.push({ t: under1000(mil) + (mil > 1 ? ' milhões' : ' milhão'), v: mil });
    if (mi) g.push({ t: mi === 1 ? 'mil' : under1000(mi) + ' mil', v: mi });
    if (r) g.push({ t: under1000(r), v: r });
    var res = g[0].t;
    for (var i = 1; i < g.length; i++) res += ((g[i].v < 100 || g[i].v % 100 === 0) ? ' e ' : ' ') + g[i].t;
    return res;
  }
  function moneyWords(cents) {
    cents = Math.max(0, Math.round(Number(cents) || 0));
    var reais = Math.floor(cents / 100), cs = cents % 100, parts = [];
    if (reais > 0 || cs === 0) {
      var w = intWords(reais);
      if (reais > 0 && reais % 1000000 === 0) w += ' de';
      parts.push(w + (reais === 1 ? ' real' : ' reais'));
    }
    if (cs > 0) parts.push(intWords(cs) + (cs === 1 ? ' centavo' : ' centavos'));
    return parts.join(' e ');
  }

  /* Formas de pagamento e categorias de despesa (as mesmas chaves do banco). */
  var PAY_METHODS = [['pix', 'Pix'], ['cash', 'Dinheiro'], ['debit', 'Cartão de débito'], ['credit', 'Cartão de crédito'], ['card', 'Cartão'], ['transfer', 'Transferência'], ['boleto', 'Boleto'], ['insurance', 'Convênio'], ['other', 'Outra']];
  var EXPENSE_CATS = [['rent', 'Aluguel'], ['supplies', 'Material'], ['supervision', 'Supervisão'], ['taxes', 'Impostos'], ['marketing', 'Divulgação'], ['transport', 'Transporte'], ['other', 'Outras']];
  function labelIn(list, k, fallback) { for (var i = 0; i < list.length; i++) if (list[i][0] === k) return list[i][1]; return fallback == null ? '' : fallback; }
  function methodLabel(k) { return k ? labelIn(PAY_METHODS, k, 'Outra') : 'Não informada'; }
  function categoryLabel(k) { return labelIn(EXPENSE_CATS, k, 'Outras'); }

  window.Clinic = { imageFromFile: imageFromFile, parseMoney: parseMoney, moneyText: moneyText, money: money, digits: digits, validCpf: validCpf, validCnpj: validCnpj, validDoc: validDoc,
    maskCpf: maskCpf, maskCnpj: maskCnpj, maskDoc: maskDoc, cpfField: cpfField, docField: docField,
    moneyWords: moneyWords, PAY_METHODS: PAY_METHODS, EXPENSE_CATS: EXPENSE_CATS, methodLabel: methodLabel, categoryLabel: categoryLabel,
    STATUS: STATUS, statusInfo: statusInfo, LABEL: LABEL, opts: opts, LISTS: LISTS, listOpts: listOpts };
})();
