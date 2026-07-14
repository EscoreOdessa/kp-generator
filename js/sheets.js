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
// Виняток — parseBudgetCells() нижче, яка навмисно читає фіксовані адреси
// комірок (те саме рішення, що й для "Фінансових показників" у
// parseModelSheet, за проханням Анни).

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
    let s = String(v);
    // Валютні префікси на кшталт "грн." самі містять крапку, яку легко
    // переплутати з десятковим роздільником ("грн.12.34" без цієї стрічки
    // ставало б "0.12" замість "12.34") — прибираємо весь буквено-символьний
    // префікс одразу, до першої цифри чи мінуса.
    s = s.replace(/^[^\d\-]*/, "");
    s = s.replace(/[^0-9,.\-]/g, "");
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
        row: i + 1, // реальний номер рядка на вкладці (1-індексований, "B3"=3) —
        // навмисно зберігаємо, бо позиція в масиві НЕ завжди співпадає з
        // номером рядка (порожні/нульові рядки-заглушки пропускаються вище,
        // тому "8-й елемент масиву" міг непомітно виявитись рядком 11, а не
        // рядком 10 — саме так у бюджет просочувався сторонній рядок
        // "Доставка до нас..."). Все, що фільтрує позиції за конкретним
        // діапазоном рядків (див. findBudgetEquipItems() у kp-render.js),
        // має звірятись з цим полем, а не з індексом у масиві.
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

  // ---------- Бюджет реалізації (сторінка "03 Бюджет реалізації") ----------
  // ПЕРЕРОБЛЕНО (2026-07-14): раніше групові підсумки й "Разом без ПДВ" /
  // "Загальна вартість з ПДВ" читались за ФІКСОВАНИМИ адресами комірок
  // (L2/L12/L22/L32/E44), у припущенні що кожен блок категорії в ПДВ-таблиці
  // завжди рівно 10 рядків. У реальних файлах це не так — зайвий нетоварний
  // рядок (як-от "Доставка до нас...") чи задвоєна нумерація зсуває всі
  // наступні категорії вниз, і фіксовані адреси тоді читають геть не ті
  // комірки (звідси й "зникнення" сум — вони мовчки ставали null/0).
  // Тепер підсумки рахуються з уже розібраних `categories` (кожен `item`
  // несе свій справжній номер рядка, див. `row` у parsePdvSheet вище) —
  // це працює правильно незалежно від того, скільки зайвих/порожніх рядків
  // трапилось у файлі.
  function findEquipCategoryIndex(categories) {
    return categories.findIndex((c) => {
      const n = c.name.toLowerCase();
      return n.includes("техн") && n.includes("облад");
    });
  }
  function sumLineNetto(items) {
    return (items || []).reduce((s, it) => s + (it.lineNetto || 0), 0);
  }
  // ПДВ-ставка: шукаємо в файлі комірку, де в тому самому тексті трапляється
  // і "ПДВ", і відсоток (напр. " обов'язок ПДВ 20%") — так само, як інші
  // парсери в цьому проєкті, за текстом, а не за координатами. Якщо в
  // конкретному файлі такого підпису нема — використовуємо стандартну
  // українську ставку 20% як розумний дефолт (а не залишаємо суму порожньою).
  function findVatPercent(rows) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const raw = row[c];
        if (raw == null) continue;
        if (!norm(raw).includes("пдв")) continue;
        const m = String(raw).match(/(\d+(?:[.,]\d+)?)\s*%/);
        if (m) return parseFloat(m[1].replace(",", "."));
      }
    }
    return null;
  }
  // Діапазон рядків для позицій обладнання, що виводяться в таблиці
  // бюджету — B3:B10 (запит Анни, 2026-07-13/07-14): див. однойменну
  // константу KP_CONFIG.BUDGET_EQUIP_ROW_RANGE (config.js) та
  // findBudgetEquipItems() у kp-render.js, яка застосовує той самий
  // діапазон до списку, що показується в таблиці. Тут — ті самі 8 позицій
  // (за реальним номером рядка, не за індексом масиву) враховуються і в
  // ціну групи "Обладнання", щоб сума завжди відповідала показаним рядкам.
  function parseBudgetCells(pdv, rows) {
    const range = (window.KP_CONFIG && window.KP_CONFIG.BUDGET_EQUIP_ROW_RANGE) || { start: 3, end: 10 };
    const equipIdx = findEquipCategoryIndex(pdv.categories);
    const equipCat = equipIdx >= 0 ? pdv.categories[equipIdx] : null;
    const equipItems = equipCat
      ? equipCat.items.filter((it) => it.row != null && it.row >= range.start && it.row <= range.end)
      : [];
    const materialsCat = equipIdx >= 0 ? pdv.categories[equipIdx + 1] : null;
    const worksCat = equipIdx >= 0 ? pdv.categories[equipIdx + 2] : null;

    const equipmentCost = sumLineNetto(equipItems);
    const materialsCost = sumLineNetto(materialsCat && materialsCat.items);
    const worksCost = sumLineNetto(worksCat && worksCat.items);
    const nettoTotal = equipmentCost + materialsCost + worksCost;

    const vatPercent = findVatPercent(rows);
    const vatRate = vatPercent != null ? vatPercent / 100 : 0.2; // 0.2 = дефолт 20%, якщо не знайдено в файлі
    const grossTotal = nettoTotal * (1 + vatRate);
    const vat = grossTotal - nettoTotal;

    return { equipmentCost, materialsCost, worksCost, nettoTotal, grossTotal, vat };
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

    // ---- Точні комірки для сторінки "Фінансові показники" (запит Анни,
    // 2026-07-08) ----
    // На відміну від решти парсера (пошук за текстом підпису), ці 4
    // показники + помісячна економія читаються за фіксованими адресами
    // комірок — так попросила Анна, бо верхня панель показників на цій
    // вкладці має завжди однакову розкладку.
    const cell = (r, c) => (rows[r] && rows[r][c] != null ? rows[r][c] : null);
    const annualSavings100 = numeric(cell(0, 7));   // H1 — Річна економія, 100% споживання
    const paybackAtTariff = numeric(cell(0, 9));    // J1 — Термін окупності при діючому тарифі
    const totalEffect30y = numeric(cell(52, 1));    // B53 — Загальний економічний ефект за 30 років
    const lcoe30Uah = numeric(cell(1, 7));          // H2 — LCOE30, з ПДВ, грн/кВт·год

    // Помісячна економія (стовпець "Дохід", D7:D18) з підписами місяців
    // (A7:A18) — окремо від "months" вище (той масив — генерація, кВт·год,
    // не грошова економія).
    const monthlySavings = [];
    for (let r = 6; r <= 17; r++) {
      const label = cell(r, 0);
      if (!label) continue;
      monthlySavings.push({ month: String(label).trim(), amount: numeric(cell(r, 3)) });
    }

    return {
      stationCostUsd, costPerKw, capacityKw, annualGenKwh, annualGenPerKw,
      gen30y, income30y, lcoe30, annualSavingsUsd, paybackYears, tariff, months,
      annualSavings100, paybackAtTariff, totalEffect30y, lcoe30Uah, monthlySavings,
    };
  }

  async function loadCalcFromSheet(sheetUrlOrId) {
    const id = extractSpreadsheetId(sheetUrlOrId);
    const [pdvRows, modelRows] = await Promise.all([
      fetchSheetValues(id, window.KP_CONFIG.SHEET_TAB_PDV),
      fetchSheetValues(id, window.KP_CONFIG.SHEET_TAB_MODEL),
    ]);
    const pdv = parsePdvSheet(pdvRows);
    return {
      pdv,
      model: parseModelSheet(modelRows),
      budget: parseBudgetCells(pdv, pdvRows),
    };
  }

  window.KpSheets = { loadCalcFromSheet, extractSpreadsheetId, parsePdvSheet, parseModelSheet, parseBudgetCells };
})();

// Окремо: назва файлу в Google Sheets. Раніше використовувалась як
// підказка для поля "Об'єкт", але назва файлу часто службова/технічна —
// тепер замість неї беремо комірку A1 вкладки SHEET_TAB_OBJECT_NAME (див.
// getObjectNameFromSheet нижче). Функцію лишаємо про запас (може знадобитись
// деінде), просто вона більше не викликається з app.js.
window.KpSheets.getSpreadsheetTitle = async function (sheetUrlOrId) {
  const id = window.KpSheets.extractSpreadsheetId(sheetUrlOrId);
  const key = window.KP_CONFIG.GOOGLE_API_KEY;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}?key=${key}&fields=properties.title`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return (json.properties && json.properties.title) || null;
};

// Назва об'єкта береться з комірки A1 вкладки "Кошторис_Наявність
// обладнання" (KP_CONFIG.SHEET_TAB_OBJECT_NAME) — саме туди менеджери
// вписують робочу назву об'єкта (напр. "№ [назва об'єкта] (попередньо)").
window.KpSheets.getObjectNameFromSheet = async function (sheetUrlOrId) {
  const id = window.KpSheets.extractSpreadsheetId(sheetUrlOrId);
  const key = window.KP_CONFIG.GOOGLE_API_KEY;
  const sheetName = window.KP_CONFIG.SHEET_TAB_OBJECT_NAME;
  const range = encodeURIComponent(`'${sheetName}'!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const v = json.values && json.values[0] && json.values[0][0];
  return v ? String(v).trim() : null;
};
