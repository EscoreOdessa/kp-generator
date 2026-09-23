// compare.js — сторінка "Порівняння розрахунків" (compare.html).
// Запит Анни, 2026-09-23: порівняти АКТУАЛЬНИЙ розрахунок з ПОПЕРЕДНІМ
// (попередній шаблон "попереднього розрахунку" або шаблон, з якого
// формується КП — у них однаковий скелет: розділи 1/2/3 з нумерованими
// рядками) і на виході отримати таблицю розбіжностей по позиціях
// (найменування, кількість, націнка, ціна за од. з націнкою, вартість з
// націнкою) + аналітичний коментар "що змінилось і чому".
// Детальна розшифровка з вкладки "Кошторис" НЕ потрібна — лише позиції
// вкладок ПДВ / варіанту "C" (внутрішньо Готівка_ФОП).
//
// Файл самодостатній: власний fetch і парсер (не чіпає sheets.js, щоб
// основний генератор КП лишався незмінним). Колонки шукаються за текстом
// заголовків — як і в sheets.js.
(function () {
  "use strict";

  // ---------------------------------------------------------------- утиліти
  function extractId(urlOrId) {
    const m = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : String(urlOrId).trim();
  }
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/["'`ʼ’«»]/g, "").replace(/\s+/g, " ").trim();
  }
  function numeric(v) {
    if (v == null) return null;
    let s = String(v).replace(/^[^\d\-]*/, "").replace(/[^0-9,.\-]/g, "");
    if (s === "" || s === "-") return null;
    s = s.replace(/,/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function findCol(header, keywords, occurrence, exclude) {
    const idxs = [];
    header.forEach((cell, i) => {
      const c = norm(cell);
      if (exclude && exclude.some((kw) => c.includes(kw))) return;
      if (keywords.every((kw) => c.includes(kw))) idxs.push(i);
    });
    if (!idxs.length) return -1;
    return occurrence === "last" ? idxs[idxs.length - 1] : idxs[0];
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  const nf2 = new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 });
  function money(v) {
    if (v == null || isNaN(v)) return "—";
    return (v < 0 ? "−$" : "$") + nf2.format(Math.abs(v));
  }
  function signedMoney(v) {
    if (v == null || isNaN(v)) return "—";
    if (Math.abs(v) < 0.005) return "$0,00";
    return (v > 0 ? "+$" : "−$") + nf2.format(Math.abs(v));
  }
  function num(v) { return v == null || isNaN(v) ? "—" : nf0.format(v); }
  function pct(v) { return v == null || isNaN(v) ? "—" : nf0.format(Math.round(v * 100) / 100) + "%"; }
  function signedPct(v) {
    if (v == null || !isFinite(v)) return "";
    if (Math.abs(v) < 0.05) return "0%";
    return (v > 0 ? "+" : "−") + nf0.format(Math.round(Math.abs(v) * 10) / 10) + "%";
  }
  function relPct(a, b) { return a ? ((b - a) / Math.abs(a)) * 100 : null; }
  const EPS = 0.005;
  const same = (a, b, eps) => Math.abs((a || 0) - (b || 0)) < (eps || EPS);

  // ---------------------------------------------------------------- Sheets API
  async function apiGet(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`HTTP ${res.status}. ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  async function fetchMeta(id) {
    const key = window.KP_CONFIG.GOOGLE_API_KEY;
    return apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${key}&fields=properties.title,sheets.properties.title`);
  }
  async function fetchValues(id, tab, range) {
    const key = window.KP_CONFIG.GOOGLE_API_KEY;
    const r = encodeURIComponent(`'${tab}'!${range || "A1:AF400"}`);
    const json = await apiGet(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${r}?key=${key}`);
    return json.values || [];
  }

  // Назви вкладок у старих файлах можуть трохи відрізнятись — шукаємо
  // спершу точну назву з config.js, потім за ключовим словом.
  function pickTabs(titles) {
    const cfg = window.KP_CONFIG;
    const byNorm = (t) => titles.find((x) => norm(x) === norm(t));
    const pdv = byNorm(cfg.SHEET_TAB_PDV) || titles.find((x) => /(^|\W)пдв(\W|$)/i.test(x) && !/моделюв/i.test(x));
    const cash = byNorm(cfg.SHEET_TAB_CASH) || titles.find((x) => /готівк|фоп/i.test(x));
    const kosht = byNorm(cfg.SHEET_TAB_OBJECT_NAME) || titles.find((x) => /кошторис/i.test(x));
    return { pdv, cash, kosht };
  }

  // ---------------------------------------------------------------- парсер вкладки
  const SECTION_LABELS = { "1": "Обладнання", "2": "Кабельна група та витратні матеріали", "3": "Роботи" };

  function colsFor(mode, header) {
    if (mode === "pdv") {
      return {
        name: findCol(header, ["найменування"], "first"),
        qty: findCol(header, ["к-сть"], "first"),
        markup: findCol(header, ["націнк"], "first"),
        // "Ціна нетто без ПДВ за одиницю" (закупка нетто, БЕЗ націнки)
        purchase: findCol(header, ["ціна", "нетто", "без пдв", "за одиницю"], "first", ["націнкою", "прибуток"]),
        unit: findCol(header, ["ціна", "нетто", "без пдв", "з націнкою"], "last", ["прибуток"]),
        line: findCol(header, ["сума", "нетто", "без пдв", "з націнкою"], "last", ["прибуток"]),
      };
    }
    return {
      name: findCol(header, ["найменування"], "first"),
      qty: findCol(header, ["к-сть"], "first"),
      markup: findCol(header, ["націнк"], "first"),
      purchase: findCol(header, ["ціна закупки"], "first", ["грн"]),
      unit: findCol(header, ["ціна", "клієнта"], "first", ["закупки", "прибуток", "грн"]),
      line: findCol(header, ["сума", "клієнта"], "first", ["грн", "закупки", "прибуток", "фактичн"]),
    };
  }

  function parseTab(rows, mode) {
    let h = rows.findIndex((r) => (r || []).some((c) => norm(c).includes("найменування")));
    if (h < 0) return null;
    const cols = colsFor(mode, rows[h] || []);
    if (cols.name < 0 || cols.qty < 0) return null;
    const sections = [];
    const items = [];
    let cur = null;
    let seen = 0;
    for (let i = h + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const a = String(row[0] == null ? "" : row[0]).trim();
      const name = String(row[cols.name] == null ? "" : row[cols.name]).trim();
      if (/^загальна калькуляція|^разом/.test(norm(name))) continue;
      if (/^\d+$/.test(a) && name) {
        cur = { code: a, name, label: SECTION_LABELS[a] || name };
        sections.push(cur);
        seen = 0;
        continue;
      }
      if (!cur) continue;
      const blank = row.every((c) => c == null || String(c).trim() === "");
      if (blank) { if (seen) cur = null; continue; }
      if (!name) continue;
      seen++;
      const qty = numeric(row[cols.qty]);
      if (!qty) continue; // К-сть порожня / 0 — позиції немає в розрахунку
      let markup = cols.markup >= 0 ? numeric(row[cols.markup]) : null;
      let purchase = cols.purchase >= 0 ? numeric(row[cols.purchase]) : null;
      let unit = cols.unit >= 0 ? numeric(row[cols.unit]) : null;
      let line = cols.line >= 0 ? numeric(row[cols.line]) : null;
      if (line == null && unit != null) line = unit * qty;
      if (unit == null && line != null) unit = line / qty;
      if (purchase == null && unit != null && markup != null) purchase = unit / (1 + markup / 100);
      items.push({
        section: cur.code, sectionLabel: cur.label, code: a, name, qty,
        markup, purchase, unit: unit || 0, line: line || 0, row: i + 1,
      });
    }
    const total = items.reduce((s, it) => s + it.line, 0);
    return { sections, items, total, cols };
  }

  // Показник за текстом підпису: рядок, де якась комірка містить усі
  // keywords; значення — перша числова комірка праворуч (preferUsd — перша,
  // що починається з "$").
  function findParam(rows, keywords, exclude, preferUsd) {
    for (const row of rows) {
      if (!row) continue;
      for (let j = 0; j < row.length; j++) {
        const c = norm(row[j]);
        if (!c || !keywords.every((k) => c.includes(k))) continue;
        if (exclude && exclude.some((k) => c.includes(k))) continue;
        let firstNum = null;
        for (let k = j + 1; k < Math.min(row.length, j + 6); k++) {
          const raw = String(row[k] == null ? "" : row[k]).trim();
          if (!raw) continue;
          if (norm(raw) === c) continue; // той самий підпис (об'єднана комірка)
          const v = numeric(raw);
          if (v == null) { if (firstNum == null && /[a-zа-яіїє]/i.test(raw) && !/^(грн|\$)/i.test(raw)) break; continue; }
          if (preferUsd && raw.startsWith("$")) return v;
          if (firstNum == null) firstNum = v;
          if (!preferUsd) return v;
        }
        if (firstNum != null) return firstNum;
      }
    }
    return null;
  }

  function parseParams(rows, mode) {
    const p = {
      rate: findParam(rows, ["курс дол"]),
      panelW: findParam(rows, ["потужність одного фотоелемента"]),
      totalKw: findParam(rows, ["потужність всіх панелей"]),
      costPerKw: findParam(rows, ["вартість 1 квт сес"], ["собівартість"], true),
      bargain: findParam(rows, ["під торг"]),
      bonus: findParam(rows, ["партнерський бонус"]),
    };
    if (mode === "pdv") {
      p.budgetNetto = findParam(rows, ["бюджет про", "нетто без пдв"], null, true);
      p.budgetBrutto = findParam(rows, ["бюджет про", "брутто з пдв"], null, true);
      p.margin = findParam(rows, ["маржинальність проєкта"]) ?? findParam(rows, ["маржинальність проекта"]);
    }
    return p;
  }

  // Завантажує один файл: метадані → вкладки → парс обох режимів (щоб
  // "Авто" могло вибрати заповнений).
  async function loadCalc(url) {
    const id = extractId(url);
    if (!id) throw new Error("Порожнє посилання");
    let meta;
    try { meta = await fetchMeta(id); } catch (e) {
      throw new Error(`Не вдалось відкрити таблицю (${e.message}). Перевірте, що вона відкрита «за посиланням».`);
    }
    const titles = (meta.sheets || []).map((s) => s.properties.title);
    const tabs = pickTabs(titles);
    const out = { id, title: meta.properties && meta.properties.title, titles, tabs, modes: {} };
    const jobs = [];
    if (tabs.pdv) jobs.push(fetchValues(id, tabs.pdv).then((rows) => { out.modes.pdv = { tab: tabs.pdv, rows, data: parseTab(rows, "pdv"), params: parseParams(rows, "pdv") }; }));
    if (tabs.cash) jobs.push(fetchValues(id, tabs.cash).then((rows) => { out.modes.cash = { tab: tabs.cash, rows, data: parseTab(rows, "cash"), params: parseParams(rows, "cash") }; }));
    if (tabs.kosht) jobs.push(fetchValues(id, tabs.kosht, "A1").then((v) => { out.objectName = v[0] && v[0][0] ? String(v[0][0]).trim() : null; }).catch(() => {}));
    await Promise.all(jobs);
    if (!out.modes.pdv && !out.modes.cash) throw new Error(`У файлі «${out.title || id}» не знайдено вкладок «ПДВ» / «Готівка_ФОП». Є: ${titles.join(", ")}`);
    return out;
  }

  function chooseMode(calc, wanted) {
    const has = (m) => calc.modes[m] && calc.modes[m].data;
    if (wanted === "pdv" || wanted === "cash") {
      if (has(wanted)) return wanted;
      throw new Error(`У файлі «${calc.title}» немає вкладки для режиму «${wanted === "pdv" ? "ПДВ" : "C"}».`);
    }
    const tp = has("pdv") ? calc.modes.pdv.data.total : 0;
    const tc = has("cash") ? calc.modes.cash.data.total : 0;
    if (tp > 0 && tc <= 0) return "pdv";
    if (tc > 0 && tp <= 0) return "cash";
    if (tp > 0 && tc > 0) return "pdv";
    return has("pdv") ? "pdv" : "cash";
  }

  // ---------------------------------------------------------------- зіставлення
  function nameKey(s) {
    return norm(s).replace(/або аналог/g, "").replace(/[.,;:()\-–—\/]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(s) { return new Set(nameKey(s).split(" ").filter((t) => t.length > 2)); }
  function similarity(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((t) => { if (B.has(t)) inter++; });
    return inter / Math.min(A.size, B.size);
  }
  // Тип обладнання — для зіставлення "та сама роль, інша модель".
  function equipType(name) {
    const n = norm(name);
    if (/доставк/.test(n)) return "delivery";
    if (/панел|фем|фотомодул|модул[ьі] сонячн/.test(n)) return "panel";
    if (/інвертор/.test(n)) return "inverter";
    if (/акумулятор|аккумулятор|акб|батаре|lifepo|bms/.test(n)) return "battery";
    if (/кріплен|конструкц|навіс/.test(n)) return "mount";
    if (/лічильник|облік/.test(n)) return "meter";
    return null;
  }
  // Ключова характеристика обладнання з назви — щоб порівнювати не лише
  // ціну за штуку, а й ціну за Вт / кВт / кВт·год, коли модель інша.
  const SPEC_UNIT = { panel: "Вт", inverter: "кВт", battery: "кВт·год" };
  function specOf(name) {
    const t = equipType(name);
    const n = String(name || "");
    const f = (m) => (m ? parseFloat(m[1].replace(",", ".")) : null);
    if (t === "panel") return { type: t, value: f(n.match(/(\d{3,4})\s*(?:вт|w|wp)(?![a-zа-яі])/i)) };
    if (t === "inverter") return { type: t, value: f(n.match(/(\d+(?:[.,]\d+)?)\s*(?:квт|кв|kw|k(?:tl)?|к)(?![a-zа-яі])/i)) };
    if (t === "battery") return { type: t, value: f(n.match(/(\d+(?:[.,]\d+)?)\s*(?:kwh|квт\s*[·*]?\s*г(?:од)?|квт|kw)/i)) };
    return { type: t, value: null };
  }
  const TYPE_LABEL = { panel: "Сонячні панелі", inverter: "Інвертор", battery: "Акумуляторна батарея", mount: "Кріплення", delivery: "Доставка", meter: "Облік" };

  function matchItems(prev, curr) {
    const pairs = [];
    const usedP = new Set(), usedC = new Set();
    const sectionsOrder = [];
    [...prev, ...curr].forEach((it) => { if (!sectionsOrder.includes(it.section)) sectionsOrder.push(it.section); });
    const link = (pi, ci, how) => { usedP.add(pi); usedC.add(ci); pairs.push({ p: prev[pi], c: curr[ci], how }); };
    const tryPass = (test, how) => {
      prev.forEach((p, pi) => {
        if (usedP.has(pi)) return;
        let best = -1, bestScore = 0;
        curr.forEach((c, ci) => {
          if (usedC.has(ci) || c.section !== p.section) return;
          const s = test(p, c);
          if (s > bestScore) { bestScore = s; best = ci; }
        });
        if (best >= 0) link(pi, best, how);
      });
    };
    // 1) однакова назва в тому ж розділі
    tryPass((p, c) => (nameKey(p.name) === nameKey(c.name) ? 1 : 0), "name");
    // 2) обладнання: той самий тип (інвертор ↔ інвертор) — заміна моделі
    tryPass((p, c) => {
      if (p.section !== "1") return 0;
      const tp = equipType(p.name), tc = equipType(c.name);
      if (!tp || tp !== tc) return 0;
      return 1 + (p.code === c.code ? 0.5 : 0) + similarity(p.name, c.name);
    }, "type");
    // 3) той самий номер рядка + схожа назва
    tryPass((p, c) => (p.code === c.code && similarity(p.name, c.name) >= 0.34 ? 1 + similarity(p.name, c.name) : 0), "code");
    // 4) просто схожа назва (роботи в різних шаблонах звуться по-різному)
    tryPass((p, c) => { const s = similarity(p.name, c.name); return s >= 0.5 ? s : 0; }, "similar");

    prev.forEach((p, pi) => { if (!usedP.has(pi)) pairs.push({ p, c: null, how: "removed" }); });
    curr.forEach((c, ci) => { if (!usedC.has(ci)) pairs.push({ p: null, c, how: "added" }); });

    const secRank = (s) => sectionsOrder.indexOf(s);
    const rowOf = (x) => (x.c ? x.c.row : x.p.row) + (x.c ? 0 : 0.5);
    pairs.sort((x, y) => secRank((x.c || x.p).section) - secRank((y.c || y.p).section) || rowOf(x) - rowOf(y));
    return pairs;
  }

  // Розклад зміни вартості позиції на фактори:
  //   вартість = к-сть × закупка × (1 + націнка)
  //   Δк-сть  = (q2−q1) × p1 × (1+m1)
  //   Δзакупка = q2 × (p2−p1) × (1+m1)
  //   Δнацінка = q2 × p2 × (m2−m1)
  // Сума трьох = повна зміна (залишок — округлення в таблиці).
  function analysePair(pair) {
    const { p, c } = pair;
    const r = { pair, dLine: (c ? c.line : 0) - (p ? p.line : 0), fx: { qty: 0, price: 0, equip: 0, markup: 0, added: 0, removed: 0, other: 0 }, notes: [], changed: false };
    if (!p) { r.fx.added = c.line; r.notes.push("нова позиція"); r.changed = true; return r; }
    if (!c) { r.fx.removed = -p.line; r.notes.push("позицію виключено"); r.changed = true; return r; }
    const nameChanged = nameKey(p.name) !== nameKey(c.name);
    const canFactor = p.purchase != null && c.purchase != null && p.markup != null && c.markup != null;
    if (canFactor) {
      const m1 = p.markup / 100, m2 = c.markup / 100;
      r.fx.qty = (c.qty - p.qty) * p.purchase * (1 + m1);
      r.fx.price = c.qty * (c.purchase - p.purchase) * (1 + m1);
      r.fx.markup = c.qty * c.purchase * (m2 - m1);
    } else {
      r.fx.qty = (c.qty - p.qty) * p.unit;
      r.fx.price = c.qty * (c.unit - p.unit);
    }
    r.fx.other = r.dLine - r.fx.qty - r.fx.price - r.fx.markup;
    if (Math.abs(r.fx.other) < 0.05) { r.fx.price += r.fx.other; r.fx.other = 0; }
    // Інша модель обладнання (інвертор ↔ інвертор, панелі ↔ панелі…):
    // різниця в ціні за одиницю — це НЕ подорожчання в постачальника, а
    // інше обладнання. Виносимо її в окремий фактор "заміна обладнання".
    const isSwap = nameChanged && (c.section === "1" || !!equipType(c.name)) && !!equipType(c.name) && equipType(c.name) === equipType(p.name);
    if (isSwap) {
      r.isSwap = true;
      r.fx.equip = r.fx.price; r.fx.price = 0;
      r.specP = specOf(p.name); r.specC = specOf(c.name);
      const u = SPEC_UNIT[r.specC.type];
      r.notes.push(u && r.specP.value && r.specC.value && r.specP.value !== r.specC.value
        ? `інша модель (${num(r.specP.value)} → ${num(r.specC.value)} ${u})` : "інша модель");
    } else if (nameChanged) r.notes.push("інша назва");
    if (!same(p.qty, c.qty, 1e-6)) r.notes.push(`к-сть ${num(p.qty)} → ${num(c.qty)}`);
    if (canFactor && !same(p.purchase, c.purchase)) r.notes.push(`закупка ${money(p.purchase)} → ${money(c.purchase)} (${signedPct(relPct(p.purchase, c.purchase))})`);
    if (!canFactor && !same(p.unit, c.unit)) r.notes.push(`ціна за од. ${money(p.unit)} → ${money(c.unit)}`);
    if (p.markup != null && c.markup != null && !same(p.markup, c.markup, 0.01)) r.notes.push(`націнка ${pct(p.markup)} → ${pct(c.markup)}`);
    r.changed = nameChanged || Math.abs(r.dLine) >= EPS || r.notes.length > 0;
    return r;
  }

  // ---------------------------------------------------------------- порівняння
  function compare(prevCalc, currCalc, wantedMode) {
    const mP = chooseMode(prevCalc, wantedMode);
    const mC = chooseMode(currCalc, wantedMode);
    const P = prevCalc.modes[mP], C = currCalc.modes[mC];
    const pairs = matchItems(P.data.items, C.data.items);
    const rows = pairs.map(analysePair);

    const secMap = new Map();
    const secOf = (code, label) => {
      if (!secMap.has(code)) secMap.set(code, { code, label, prev: 0, curr: 0, fx: { qty: 0, price: 0, equip: 0, markup: 0, added: 0, removed: 0, other: 0 }, rows: [] });
      return secMap.get(code);
    };
    rows.forEach((r) => {
      const it = r.pair.c || r.pair.p;
      const s = secOf(it.section, it.sectionLabel);
      s.prev += r.pair.p ? r.pair.p.line : 0;
      s.curr += r.pair.c ? r.pair.c.line : 0;
      Object.keys(s.fx).forEach((k) => { s.fx[k] += r.fx[k]; });
      s.rows.push(r);
    });
    const sections = [...secMap.values()].sort((a, b) => a.code.localeCompare(b.code, "uk", { numeric: true }));
    const total = { prev: P.data.total, curr: C.data.total, fx: { qty: 0, price: 0, equip: 0, markup: 0, added: 0, removed: 0, other: 0 } };
    sections.forEach((s) => Object.keys(total.fx).forEach((k) => { total.fx[k] += s.fx[k]; }));

    return {
      prev: { calc: prevCalc, mode: mP, tab: P.tab, params: P.params, data: P.data },
      curr: { calc: currCalc, mode: mC, tab: C.tab, params: C.params, data: C.data },
      rows, sections, total,
    };
  }

  // ---------------------------------------------------------------- аналітичний коментар
  const MODE_LABEL = { pdv: "ПДВ (ціни без ПДВ)", cash: "C (без ПДВ, готівка)" };

  function describeRow(r) {
    const { p, c } = r.pair;
    const nm = (c || p).name;
    if (!p) return `додано «${esc(c.name)}» — ${num(c.qty)} × ${money(c.unit)} = <b>${signedMoney(r.dLine)}</b>`;
    if (!c) return `виключено «${esc(p.name)}» (було ${num(p.qty)} × ${money(p.unit)}) — <b>${signedMoney(r.dLine)}</b>`;
    const parts = [];
    if (nameKey(p.name) !== nameKey(c.name)) parts.push(`замінено «${esc(p.name)}» на «${esc(c.name)}»`);
    const bits = [];
    const add = (label, v) => { if (Math.abs(v) >= 0.5) bits.push(`${label} ${signedMoney(v)}`); };
    if (!same(p.qty, c.qty, 1e-6)) add(`кількість ${num(p.qty)} → ${num(c.qty)}:`, r.fx.qty);
    if (r.isSwap && p.purchase != null && c.purchase != null && !same(p.purchase, c.purchase)) add(`інше обладнання, закупка за од. ${money(p.purchase)} → ${money(c.purchase)} (${signedPct(relPct(p.purchase, c.purchase))}):`, r.fx.equip);
    else if (r.pair.p.purchase != null && r.pair.c.purchase != null && !same(p.purchase, c.purchase)) add(`ціна закупки ${money(p.purchase)} → ${money(c.purchase)} (${signedPct(relPct(p.purchase, c.purchase))}):`, r.fx.price);
    else if (!same(p.unit, c.unit) && Math.abs(r.fx.price + r.fx.equip) >= 0.5 && (p.purchase == null || c.purchase == null)) add(`${r.isSwap ? "інше обладнання, " : ""}ціна за од. ${money(p.unit)} → ${money(c.unit)}:`, r.fx.price + r.fx.equip);
    if (p.markup != null && c.markup != null && !same(p.markup, c.markup, 0.01)) add(`націнка ${pct(p.markup)} → ${pct(c.markup)}:`, r.fx.markup);
    const head = parts.length ? parts[0] : `«${esc(nm)}»`;
    return `${head} — вартість ${money(p.line)} → ${money(c.line)} (<b>${signedMoney(r.dLine)}</b>)${bits.length ? "; з них " + bits.join("; ") : ""}`;
  }

  function buildCommentary(res) {
    const out = [];
    const d = res.total.curr - res.total.prev;
    const rp = relPct(res.total.prev, res.total.curr);
    const warn = [];
    if (res.prev.mode !== res.curr.mode) {
      warn.push(`Розрахунки зроблені в різних режимах: попередній — ${MODE_LABEL[res.prev.mode]}, актуальний — ${MODE_LABEL[res.curr.mode]}. Частина різниці може пояснюватись податковим режимом, а не зміною комплектації.`);
    }
    if (!res.prev.data.items.length) warn.push("У попередньому розрахунку не знайдено жодної позиції з кількістю > 0 — перевірте посилання / вибраний режим.");
    if (!res.curr.data.items.length) warn.push("В актуальному розрахунку не знайдено жодної позиції з кількістю > 0 — перевірте посилання / вибраний режим.");

    // 1. Головне
    if (Math.abs(d) < 0.5) {
      out.push(`<p class="cmp-lead">Загальна вартість для клієнта практично не змінилась: <b>${money(res.total.prev)}</b> → <b>${money(res.total.curr)}</b>.</p>`);
    } else {
      out.push(`<p class="cmp-lead">Загальна вартість для клієнта ${d > 0 ? "<span class=\"up\">зросла</span>" : "<span class=\"down\">зменшилась</span>"} на <b>${money(Math.abs(d))}</b> (${signedPct(rp)}): <b>${money(res.total.prev)}</b> → <b>${money(res.total.curr)}</b>.</p>`);
    }

    // 2. По розділах
    const secLines = res.sections
      .map((s) => ({ s, d: s.curr - s.prev }))
      .filter((x) => Math.abs(x.d) >= 0.5)
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .map((x) => `${esc(x.s.label)}: <b>${signedMoney(x.d)}</b> (${money(x.s.prev)} → ${money(x.s.curr)})`);
    if (secLines.length) out.push(`<p><b>Де змінилось:</b> ${secLines.join("; ")}.</p>`);

    // 3. Чому — фактори
    const fx = res.total.fx;
    const fxParts = [];
    const fxAdd = (label, v) => { if (Math.abs(v) >= 0.5) fxParts.push(`${label} <b>${signedMoney(v)}</b>`); };
    fxAdd("зміна кількості", fx.qty);
    fxAdd("заміна обладнання на інші моделі", fx.equip);
    fxAdd("зміна цін закупки (те саме обладнання)", fx.price);
    fxAdd("зміна націнки", fx.markup);
    fxAdd("нові позиції", fx.added);
    fxAdd("виключені позиції", fx.removed);
    fxAdd("інше / округлення", fx.other);
    if (fxParts.length) {
      const main = [["зміна кількості", fx.qty], ["заміна обладнання", fx.equip], ["зміна цін закупки", fx.price], ["зміна націнки", fx.markup], ["нові позиції", fx.added], ["виключені позиції", fx.removed]]
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      out.push(`<p><b>Чому:</b> ${fxParts.join("; ")}. Найбільший внесок — ${main[0]}.</p>`);
    }

    // 3a. Заміна обладнання — окремим блоком, з порівнянням за характеристикою
    const swaps = res.rows.filter((r) => r.isSwap);
    if (swaps.length) {
      const li = swaps.map((r) => {
        const { p, c } = r.pair;
        const u = SPEC_UNIT[r.specC.type];
        const bits = [`«${esc(p.name)}» → «${esc(c.name)}»`];
        const sp = r.specP.value, sc = r.specC.value;
        if (u && sp && sc) {
          const perP = (p.purchase != null ? p.purchase : p.unit) / sp;
          const perC = (c.purchase != null ? c.purchase : c.unit) / sc;
          const perLabel = u === "Вт" ? "за 1 Вт" : `за 1 ${u}`;
          const fmtPer = (v) => (v < 1 ? "$" + v.toFixed(3).replace(".", ",") : money(v));
          bits.push(`${num(sp)} → ${num(sc)} ${u} на одиницю`);
          if (r.specC.type === "panel") bits.push(`потужність масиву ${num(Math.round(p.qty * sp) / 1000)} → ${num(Math.round(c.qty * sc) / 1000)} кВт`);
          else if (!(p.qty === 1 && c.qty === 1)) bits.push(`разом ${num(p.qty * sp)} → ${num(c.qty * sc)} ${u}`);
          bits.push(`закупка ${perLabel}: ${fmtPer(perP)} → ${fmtPer(perC)} (${signedPct(relPct(perP, perC))})`);
        }
        bits.push(`вплив заміни на вартість <b>${signedMoney(r.fx.equip)}</b>`);
        return `<li>${bits.join("; ")}</li>`;
      });
      out.push(`<p><b>Заміна обладнання:</b></p><ul>${li.join("")}</ul>`);
    }

    // 4. Ключові зміни по позиціях (найбільші за модулем)
    const changed = res.rows.filter((r) => r.changed);
    const top = changed.slice().sort((a, b) => Math.abs(b.dLine) - Math.abs(a.dLine));
    const withMoney = top.filter((r) => Math.abs(r.dLine) >= 0.5);
    const shown = withMoney.slice(0, 8);
    if (shown.length) {
      out.push(`<p><b>Ключові зміни:</b></p><ul>${shown.map((r) => `<li>${describeRow(r)}</li>`).join("")}</ul>`);
      if (withMoney.length > shown.length) out.push(`<p class="cmp-muted">Інші, дрібніші зміни (${withMoney.length - shown.length}) — у таблиці нижче.</p>`);
    }
    const worksSec = res.sections.find((s) => s.code === "3");
    if (worksSec && worksSec.rows.some((r) => !r.pair.p) && worksSec.rows.some((r) => !r.pair.c)) {
      out.push(`<p class="cmp-muted">Роботи в розрахунках розбиті на різні позиції (інші назви рядків), тому частина з них показана як «нова» / «виключена» — для робіт показовіший підсумок розділу: ${money(worksSec.prev)} → ${money(worksSec.curr)} (${signedMoney(worksSec.curr - worksSec.prev)}).</p>`);
    }
    const renamedOnly = top.filter((r) => Math.abs(r.dLine) < 0.5 && r.pair.p && r.pair.c && nameKey(r.pair.p.name) !== nameKey(r.pair.c.name));
    if (renamedOnly.length) {
      out.push(`<p><b>Змінились лише назви (вартість та сама):</b> ${renamedOnly.map((r) => `«${esc(r.pair.p.name)}» → «${esc(r.pair.c.name)}»`).join("; ")}.</p>`);
    }

    // 5. Технічні параметри
    const pp = res.prev.params, cp = res.curr.params;
    const par = [];
    if (pp.totalKw && cp.totalKw && !same(pp.totalKw, cp.totalKw, 0.01)) par.push(`потужність панелей ${num(pp.totalKw)} → ${num(cp.totalKw)} кВт`);
    if (pp.panelW && cp.panelW && !same(pp.panelW, cp.panelW, 0.5)) par.push(`потужність одного модуля ${num(pp.panelW)} → ${num(cp.panelW)} Вт`);
    if (pp.costPerKw && cp.costPerKw && !same(pp.costPerKw, cp.costPerKw, 0.5)) par.push(`вартість 1 кВт ${money(pp.costPerKw)} → ${money(cp.costPerKw)} (${signedPct(relPct(pp.costPerKw, cp.costPerKw))})`);
    if (pp.rate && cp.rate && !same(pp.rate, cp.rate, 0.005)) par.push(`курс ${nf2.format(pp.rate)} → ${nf2.format(cp.rate)} грн/$ (на суми в $ не впливає, змінює суму в гривні)`);
    if (pp.margin != null && cp.margin != null && !same(pp.margin, cp.margin, 0.01)) par.push(`маржинальність проєкту ${pct(pp.margin)} → ${pct(cp.margin)}`);
    if (par.length) out.push(`<p><b>Параметри:</b> ${par.join("; ")}.</p>`);

    if (!changed.length) out.push(`<p>Розбіжностей по позиціях не знайдено — розрахунки збігаються.</p>`);
    return { html: out.join(""), warnings: warn };
  }

  // ---------------------------------------------------------------- рендер
  function cls(v) { return Math.abs(v) < 0.5 ? "" : v > 0 ? "up" : "down"; }

  function renderSummary(res) {
    const d = res.total.curr - res.total.prev;
    return `
      <div class="cmp-kpis">
        <div class="cmp-kpi"><div class="k">Попередній</div><div class="v">${money(res.total.prev)}</div><div class="s">${esc(MODE_LABEL[res.prev.mode])}</div></div>
        <div class="cmp-kpi"><div class="k">Актуальний</div><div class="v">${money(res.total.curr)}</div><div class="s">${esc(MODE_LABEL[res.curr.mode])}</div></div>
        <div class="cmp-kpi ${cls(d)}"><div class="k">Різниця</div><div class="v">${signedMoney(d)}</div><div class="s">${signedPct(relPct(res.total.prev, res.total.curr)) || "&nbsp;"}</div></div>
      </div>`;
  }

  function renderSectionTable(res) {
    const tr = res.sections.map((s) => {
      const d = s.curr - s.prev;
      return `<tr><td>${esc(s.label)}</td><td class="n">${money(s.prev)}</td><td class="n">${money(s.curr)}</td><td class="n ${cls(d)}">${signedMoney(d)}</td><td class="n">${signedPct(relPct(s.prev, s.curr))}</td>
        <td class="n f">${fxCell(s.fx.qty)}</td><td class="n f">${fxCell(s.fx.equip)}</td><td class="n f">${fxCell(s.fx.price)}</td><td class="n f">${fxCell(s.fx.markup)}</td><td class="n f">${fxCell(s.fx.added + s.fx.removed)}</td></tr>`;
    }).join("");
    const t = res.total, d = t.curr - t.prev;
    return `
      <h2>Підсумок по розділах</h2>
      <div class="cmp-scroll"><table class="cmp-table">
        <thead><tr><th>Розділ</th><th>Попередній</th><th>Актуальний</th><th>Δ, $</th><th>Δ, %</th><th>через к-сть</th><th>заміна обладнання</th><th>через ціну закупки</th><th>через націнку</th><th>нові / виключені</th></tr></thead>
        <tbody>${tr}</tbody>
        <tfoot><tr><td>Разом</td><td class="n">${money(t.prev)}</td><td class="n">${money(t.curr)}</td><td class="n ${cls(d)}">${signedMoney(d)}</td><td class="n">${signedPct(relPct(t.prev, t.curr))}</td>
          <td class="n f">${fxCell(t.fx.qty)}</td><td class="n f">${fxCell(t.fx.equip)}</td><td class="n f">${fxCell(t.fx.price)}</td><td class="n f">${fxCell(t.fx.markup)}</td><td class="n f">${fxCell(t.fx.added + t.fx.removed)}</td></tr></tfoot>
      </table></div>`;
  }
  function fxCell(v) { return Math.abs(v) < 0.5 ? "" : `<span class="${cls(v)}">${signedMoney(v)}</span>`; }

  function pv(a, b, fmt, eps) {
    // пара значень "було / стало" з підсвіткою зміни
    const A = a == null ? "—" : fmt(a), B = b == null ? "—" : fmt(b);
    const ch = a != null && b != null && !same(a, b, eps);
    return `<td class="n${ch ? " ch" : ""}">${A}</td><td class="n${ch ? " ch" : ""}">${B}</td>`;
  }

  function renderDetailTable(res, showUnchanged) {
    let body = "";
    res.sections.forEach((s) => {
      const rows = s.rows.filter((r) => showUnchanged || r.changed);
      body += `<tr class="sec"><td colspan="12">${esc(s.label)}</td></tr>`;
      if (!rows.length) { body += `<tr><td colspan="12" class="cmp-muted">Без змін</td></tr>`; return; }
      rows.forEach((r) => {
        const { p, c } = r.pair;
        const status = !p ? "added" : !c ? "removed" : r.changed ? "changed" : "same";
        const nameCell = p && c && nameKey(p.name) !== nameKey(c.name)
          ? `<span class="old">${esc(p.name)}</span><br>${esc(c.name)}`
          : esc((c || p).name);
        body += `<tr class="st-${status}">
          <td class="name">${nameCell}</td>
          ${pv(p && p.qty, c && c.qty, num, 1e-6)}
          ${pv(p && p.markup, c && c.markup, pct, 0.01)}
          ${pv(p && p.unit, c && c.unit, money)}
          ${pv(p && p.line, c && c.line, money)}
          <td class="n ${cls(r.dLine)}"><b>${signedMoney(r.dLine)}</b></td>
          <td class="n">${p && c ? signedPct(relPct(p.line, c.line)) : ""}</td>
          <td class="why">${esc(r.notes.join("; "))}</td>
        </tr>`;
      });
    });
    return `
      <h2>Розбіжності по позиціях</h2>
      <div class="cmp-scroll"><table class="cmp-table detail">
        <thead>
          <tr><th rowspan="2">Найменування</th><th colspan="2">Кількість</th><th colspan="2">Націнка</th><th colspan="2">Ціна за од. з націнкою</th><th colspan="2">Вартість з націнкою</th><th rowspan="2">Δ, $</th><th rowspan="2">Δ, %</th><th rowspan="2">Що змінилось</th></tr>
          <tr><th>попер.</th><th>акт.</th><th>попер.</th><th>акт.</th><th>попер.</th><th>акт.</th><th>попер.</th><th>акт.</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table></div>`;
  }

  function renderParams(res) {
    const pp = res.prev.params, cp = res.curr.params;
    const list = [
      ["Курс дол. США, грн", "rate", (v) => nf2.format(v), 0.005],
      ["Потужність одного модуля, Вт", "panelW", num, 0.5],
      ["Потужність усіх панелей, кВт", "totalKw", num, 0.01],
      ["Вартість 1 кВт СЕС", "costPerKw", money, 0.5],
      ["Під торг", "bargain", pct, 0.01],
      ["Партнерський бонус", "bonus", pct, 0.01],
      ["Бюджет проєкту нетто без ПДВ", "budgetNetto", money, 0.5],
      ["Бюджет проєкту брутто з ПДВ", "budgetBrutto", money, 0.5],
      ["Маржинальність проєкту", "margin", pct, 0.01],
    ];
    const tr = list.filter(([, k]) => (pp[k] != null && pp[k] !== 0) || (cp[k] != null && cp[k] !== 0)).map(([label, k, f, eps]) => {
      const a = pp[k], b = cp[k];
      const ch = a != null && b != null && !same(a, b, eps);
      return `<tr${ch ? ' class="st-changed"' : ""}><td>${label}</td><td class="n">${a == null ? "—" : f(a)}</td><td class="n">${b == null ? "—" : f(b)}</td></tr>`;
    }).join("");
    if (!tr) return "";
    return `<h2>Параметри розрахунку</h2><div class="cmp-scroll"><table class="cmp-table narrow"><thead><tr><th>Показник</th><th>Попередній</th><th>Актуальний</th></tr></thead><tbody>${tr}</tbody></table></div>`;
  }

  function fileLabel(side) {
    const c = side.calc;
    const url = `https://docs.google.com/spreadsheets/d/${c.id}/edit`;
    return `<a href="${url}" target="_blank" rel="noopener">${esc(c.objectName || c.title || c.id)}</a> <span class="cmp-muted">(${esc(c.title || "")}${c.title ? ", " : ""}вкладка «${esc(side.tab)}»)</span>`;
  }

  function renderAll(res, showUnchanged) {
    const com = buildCommentary(res);
    return `
      <div class="cmp-files">
        <div><span class="tag">Попередній</span> ${fileLabel(res.prev)}</div>
        <div><span class="tag cur">Актуальний</span> ${fileLabel(res.curr)}</div>
      </div>
      ${com.warnings.map((w) => `<div class="cmp-warn">${esc(w)}</div>`).join("")}
      ${renderSummary(res)}
      <div class="cmp-comment"><h2>Висновок</h2>${com.html}</div>
      ${renderSectionTable(res)}
      ${renderDetailTable(res, showUnchanged)}
      ${renderParams(res)}
      <p class="cmp-muted cmp-foot">Суми — для клієнта, з націнкою, у доларах (у режимі ПДВ — нетто без ПДВ; «закупка» теж нетто без ПДВ). Вплив факторів рахується як: вартість = кількість × ціна закупки × (1 + націнка); сума впливів дорівнює зміні вартості. Якщо модель обладнання інша, різниця в ціні закупки відноситься до «заміни обладнання», а не до зміни цін.</p>`;
  }

  // ---------------------------------------------------------------- UI
  let lastRes = null;
  function $(id) { return document.getElementById(id); }
  function setStatus(msg, isErr) {
    const el = $("cmp-status");
    el.textContent = msg || "";
    el.className = "status-msg" + (isErr ? " error" : "");
  }
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  async function run() {
    const a = $("in-prev").value.trim(), b = $("in-curr").value.trim();
    if (!a || !b) { setStatus("Вкажіть обидва посилання.", true); return; }
    const mode = (document.querySelector('input[name="cmp-mode"]:checked') || {}).value || "auto";
    storeSet("cmp-prev", a); storeSet("cmp-curr", b);
    $("btn-compare").disabled = true;
    setStatus("Завантажую таблиці…");
    $("cmp-result").innerHTML = "";
    $("cmp-tools").hidden = true;
    try {
      const [P, C] = await Promise.all([
        loadCalc(a).catch((e) => { throw new Error("Попередній розрахунок: " + e.message); }),
        loadCalc(b).catch((e) => { throw new Error("Актуальний розрахунок: " + e.message); }),
      ]);
      lastRes = compare(P, C, mode);
      draw();
      setStatus("");
      $("cmp-tools").hidden = false;
    } catch (e) {
      console.error(e);
      setStatus(e.message || String(e), true);
    } finally {
      $("btn-compare").disabled = false;
    }
  }
  function draw() {
    if (!lastRes) return;
    $("cmp-result").innerHTML = renderAll(lastRes, $("in-show-same").checked);
  }
  async function copyResult() {
    const el = $("cmp-result");
    try {
      const html = `<meta charset="utf-8">${el.innerHTML}`;
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([el.innerText], { type: "text/plain" }),
      })]);
      setStatus("Скопійовано — можна вставити в лист, Google Docs чи Sheets.");
    } catch (e) {
      const r = document.createRange(); r.selectNodeContents(el);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand("copy"); s.removeAllRanges();
      setStatus("Скопійовано.");
    }
  }
  function downloadCsv() {
    if (!lastRes) return;
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const n = (v) => (v == null || isNaN(v) ? "" : String(Math.round(v * 100) / 100).replace(".", ","));
    const lines = [["Розділ", "Найменування (попер.)", "Найменування (акт.)", "К-сть попер.", "К-сть акт.", "Націнка попер., %", "Націнка акт., %", "Ціна за од. попер., $", "Ціна за од. акт., $", "Вартість попер., $", "Вартість акт., $", "Δ, $", "Що змінилось"].map(q).join(";")];
    lastRes.rows.forEach((r) => {
      const { p, c } = r.pair;
      lines.push([ (c || p).sectionLabel, p && p.name, c && c.name, n(p && p.qty), n(c && c.qty), n(p && p.markup), n(c && c.markup), n(p && p.unit), n(c && c.unit), n(p && p.line), n(c && c.line), n(r.dLine), r.notes.join("; ") ].map((v, i) => (i >= 3 && i <= 11 ? v : q(v))).join(";"));
    });
    lines.push(["Разом", "", "", "", "", "", "", "", "", n(lastRes.total.prev), n(lastRes.total.curr), n(lastRes.total.curr - lastRes.total.prev), ""].map((v, i) => (i >= 9 && i <= 11 ? v : q(v))).join(";"));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Порівняння_${(lastRes.curr.calc.objectName || lastRes.curr.calc.title || "розрахунку").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 60)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function init() {
    const qs = new URLSearchParams(location.search);
    $("in-prev").value = qs.get("prev") || storeGet("cmp-prev") || "";
    $("in-curr").value = qs.get("curr") || storeGet("cmp-curr") || "";
    $("btn-compare").addEventListener("click", run);
    $("btn-swap").addEventListener("click", () => { const t = $("in-prev").value; $("in-prev").value = $("in-curr").value; $("in-curr").value = t; });
    $("in-show-same").addEventListener("change", draw);
    $("btn-copy").addEventListener("click", copyResult);
    $("btn-csv").addEventListener("click", downloadCsv);
    $("btn-print").addEventListener("click", () => window.print());
    [$("in-prev"), $("in-curr")].forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); }));
  }

  window.KpCompare = { specOf, equipType, parseTab, parseParams, matchItems, analysePair, compare, buildCommentary, renderAll, pickTabs, chooseMode };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
