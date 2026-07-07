// sheets.js — читання файлу-розрахунку (Google Sheets) через Sheets API v4
// публічним API-ключем (без OAuth). Працює тільки якщо таблиця відкрита
// за посиланням ("Anyone with the link can view") — так само, як цей
// проєкт зараз і зроблено.
//
// ВАЖЛИВО: конкретні назви колонок у вкладках ПДВ / Моделювання можуть з
// часом трохи змінюватись. Тому тут навмисно НЕ використовуються жорсткі
// координати комірок (A1, C14 і т.п.) — натомість парсер шукає потрібні
// колонки/значення за текстом заголовків/підписів. Якщо в майбутньому
// парсинг "зʼїде", перевір спочатку KP_CONFIG.SHEET_TAB_PDV /
// SHEET_TAB_MODEL (назви вкладок) і ключові слова нижче (HEADERS_*).

(function () {
  function extractSpreadsheetId(urlOrId) {
    const m = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : String(urlOrId).trim();
  }

  async function fetchSheetValues(spreadsheetId, sheetName) {
    const key = window.KP_CONFIG.GOOGLE_API_KEY;
    const range = encodeURIComponent(`'${sheetName}'!A1:AF400`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${key}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Не вдалось прочитати вкладку "${sheetName}" (HTTP ${res.status}). ` +
        `Перевір: 1) таблиця відкрита "за посиланням", 2) GOOGLE_API_KEY у js/config.js правильний ` +
        `і має увімкнений Google Sheets API. ${body.slice(0, 200)}`
      );
    }
    const json = await res.json();
    return json.values || [];
  }

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/["'`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function numeric(v) {
    if (v == null) return null;
    let s = String(v).replace(/[^0-9,.\-]/g, "");
    if (s === "" || s === "-") return null;
    // У цих таблицях кома завжди роздільник тисяч (напр. "$3,083.03",
    // "1,577"), крапка — десяткова. Тому кому просто прибираємо, а не
    // перетворюємо на крапку — інакше "1,577" (тисяча п'ятсот) зламається
    // на "1.577".
    s = s.replace(/,/g, "");
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function findColIndex(headerRow, keywords, occurrence, exclude) {
    // occurrence: "first" | "last" — яке саме співпадіння взяти, якщо в
    // рядку заголовків трапляється кілька схожих колонок.
    // exclude: масив слів-стоп-слів — колонки, де вони зустрічаються,
    // пропускаємо навіть якщо всі keywords теж співпали (напр. колонка
    // "ПРИБУТОК сума нетто без ПДВ" містить ті самі слова, що й колонка
    // "Сума продажу нетто без ПДВ", але це геть різні цифри).
    const idxs = [];
    headerRow.forEach((cell, i) => {
      const c = norm(cell);
      if (exclude && exclude.some((kw) => c.includes(kw))) return;
      if (keywords.every((kw) => c.includes(kw))) idxs.push(i);
    });
    if (idxs.length === 0) return -1;
    return occurrence === "last" ? idxs[idxs.length - 1] : idxs[0];
  }

  // ---------- Вкладка ПДВ (номенклатура, ціни, ПДВ) ----------
  function parsePdvSheet(rows) {
    // Знаходимо рядок заголовків — перший рядок, що містить "найменування".
    let headerRowIdx = rows.findIndex((r) => r.some((c) => norm(c).includes("найменування")));
    if (headerRowIdx === -1) headerRowIdx = 0;
    const header = rows[headerRowIdx] || [];

    const colName = findColIndex(header, ["найменування"], "first");
    const colQty = findColIndex(header, ["к-сть"], "first");
    // Клієнтська ціна/сума — це найправіша колонка "ціна нетто без пдв" /
    // "сума ... нетто" / "сума ... брутто" (в цій таблиці зліва йдуть
    // собівартість/закупівля, справа — фінальні цифри для клієнта).
    const colUnitNetto = findColIndex(header, ["ціна", "нетто", "без пдв"], "last", ["прибуток"]);
    const colLineNetto = findColIndex(header, ["сума", "нетто", "без пдв"], "last", ["прибуток"]);
    const colLineBrutto = findColIndex(header, ["сума", "брутто"], "last", ["прибуток"]);

    const categories = [];
    let currentCat = null;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const a = norm(row[0]);
      const name = (row[colName] || "").toString().trim();

      if (/^загальна калькуляція|^разом/.test(norm(name))) continue; // підсумковий рядок — рахуємо самі

      const isCategoryHeader = /^\d+$/.test(a); // "1", "2", "3" (без крапки)
      if (isCategoryHeader && name) {
        currentCat = { code: a, name, items: [] };
        categories.push(currentCat);
        continue;
      }
      if (!currentCat) continue;

      const qty = numeric(row[colQty]);
      const unit = colUnitNetto >= 0 ? numeric(row[colUnitNetto]) : null;
      const lineNetto = colLineNetto >= 0 ? numeric(row[colLineNetto]) : null;
      const lineBrutto = colLineBrutto >= 0 ? numeric(row[colLineBrutto]) : null;

      if (!name) continue; // порожні рядки-заглушки пропускаємо
      if ((!qty || qty === 0) && (!lineNetto || lineNetto === 0)) continue; // нульові заглушки

      currentCat.items.push({
        code: a,
        name,
        qty: qty || 0,
        unitNetto: unit || 0,
        lineNetto: lineNetto != null ? lineNetto : (unit || 0) * (qty || 0),
        lineBrutto: lineBrutto != null ? lineBrutto : null,
      });
    }

    const nettoTotal = categories.reduce(
      (s, c) => s + c.items.reduce((s2, it) => s2 + it.lineNetto, 0), 0
    );
    return { categories, nettoTotal };
  }

  // ---------- Вкладка "Моделювання Фін. показників роботи СЕС" ----------
  function findLabelValue(rows, keywords, exclude) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const cell = norm(row[c]);
        if (!cell) continue;
        if (exclude && exclude.some((kw) => cell.includes(kw))) continue;
        if (keywords.every((kw) => cell.includes(kw))) {
          // значення зазвичай у наступній комірці того ж рядка
          for (let c2 = c + 1; c2 < Math.min(c + 4, row.length); c2++) {
            const v = numeric(row[c2]);
            if (v !== null) return v;
          }
        }
      }
    }
    return null;
  }

  function parseModelSheet(rows) {
    // Рядки 1-3 вкладки "Моделювання" — це панель ключових показників.
    // Кілька підписів там дуже схожі один на одного ("Вартість СЕС" /
    // "Вартість 1 кВт СЕС", "Річна генерація" / "Річна генерація 1 кВт"),
    // тому для точних збігів явно виключаємо сусідні варіанти.
    const stationCostUsd = findLabelValue(rows, ["вартість", "сес"], ["1 квт"]);
    const costPerKw = findLabelValue(rows, ["вартість", "1 квт"]);
    const capacityKw = findLabelValue(rows, ["потужність", "сес"]); // потужність фотомодулів (панелей)
    const annualGenKwh = findLabelValue(rows, ["річна", "генерація"], ["1 квт"]);
    const annualGenPerKw = findLabelValue(rows, ["річна", "генерація", "1 квт"]);
    const gen30y = findLabelValue(rows, ["генерація", "30 рок"]);
    const income30y = findLabelValue(rows, ["сумарний", "дохід"]);
    const lcoe30 = findLabelValue(rows, ["lcoe", "30 рок"]);
    const annualSavingsUsd = findLabelValue(rows, ["річна", "економія"]);
    const paybackYears = findLabelValue(rows, ["термін", "окупності"]);
    const tariff = findLabelValue(rows, ["тариф"]);

    // Помісячна генерація: шукаємо рядок-заголовок з "місяць", потім
    // читаємо до 12 наступних рядків (Січень..Грудень) з колонкою
    // "генерація".
    let headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === "місяць"));
    const months = [];
    if (headerIdx !== -1) {
      const header = rows[headerIdx];
      const colMonth = findColIndex(header, ["місяць"], "first");
      const colGen = findColIndex(header, ["генерація"], "first");
      for (let i = headerIdx + 1; i < rows.length && months.length < 12; i++) {
        const row = rows[i] || [];
        const label = (row[colMonth] || "").toString().trim();
        if (!label || /разом/i.test(label)) break;
        months.push({ month: label, generation: numeric(row[colGen]) || 0 });
      }
    }

    return {
      stationCostUsd, costPerKw, capacityKw, annualGenKwh, annualGenPerKw,
      gen30y, income30y, lcoe30, annualSavingsUsd, paybackYears, tariff, months,
    };
  }

  async function loadCalcFromSheet(sheetUrlOrId) {
    const id = extractSpreadsheetId(sheetUrlOrId);
    const [pdvRows, modelRows] = await Promise.all([
      fetchSheetValues(id, window.KP_CONFIG.SHEET_TAB_PDV),
      fetchSheetValues(id, window.KP_CONFIG.SHEET_TAB_MODEL),
    ]);
    return {
      pdv: parsePdvSheet(pdvRows),
      model: parseModelSheet(modelRows),
    };
  }

  window.KpSheets = { loadCalcFromSheet, extractSpreadsheetId, parsePdvSheet, parseModelSheet };
})();

// Окремо: назва файлу в Google Sheets (використовується як підказка для
// поля "Об'єкт", якщо менеджер його не заповнив вручну).
window.KpSheets.getSpreadsheetTitle = async function (sheetUrlOrId) {
  const id = window.KpSheets.extractSpreadsheetId(sheetUrlOrId);
  const key = window.KP_CONFIG.GOOGLE_API_KEY;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${key}&fields=properties.title`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return (json.properties && json.properties.title) || null;
};
