// kp-render.js — будує розмітку комерційної пропозиції (до 11 сторінок
// А4, альбомна орієнтація — сторінки "04" (PvSyst) і "05" (сезонні
// погодинні графіки) опційні й з'являються лише якщо вказано відповідне
// посилання; останні дві сторінки — "Гарантійний термін..." і контакти
// менеджера — фіксовані, без КП-номера/бейджа, завжди останні)
// з даних, зібраних у app.js (таблиця розрахунків + PDF генерації +
// зображення), і малює діаграми помісячної/погодинної генерації через
// Chart.js.

(function () {
  const fmtUsd = (n) =>
    n === null || n === undefined || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString("en-US");
  const fmtNum = (n, d = 0) =>
    n === null || n === undefined || isNaN(n) ? "—" : Number(n).toLocaleString("uk-UA", { maximumFractionDigits: d });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function pad2(n) { return String(n).padStart(2, "0"); }
  function defaultKpNumber(d) {
    return "КП-" + String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "-" + pad2(d.getHours()) + pad2(d.getMinutes());
  }
  function fmtDate(d) { return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear(); }

  function pageHeader(meta, pageLabel) {
    return `
      <div class="kp-header">
        <img class="logo" src="data:image/png;base64,${ESCORE_LOGO_B64}" alt="escore" />
        <div class="doc-meta">
          <strong>КОМЕРЦІЙНА ПРОПОЗИЦІЯ</strong><br/>
          № ${esc(meta.kpNumber)} · від ${esc(meta.kpDateStr)}<br/>
          Дійсна ${esc(meta.validDays)} календарних днів
        </div>
      </div>`;
  }

  // ---------- Сторінка 1 — титульний слайд ----------
  // Взято з референсної презентації (запит Анни, 2026-07-07): фото заходу
  // на СЕС завжди фіксоване (assets/hero-bg.jpg), а не фото завантаженого
  // об'єкта. Напис під фото складається з типу станції (мережева/гібридна)
  // і потужності — тих самих даних, що вже рахує buildTechSpec, тому він
  // сам оновлюється під кожен новий файл-розрахунок.
  function pageHero(m) {
    return `
    <section class="kp-page hero-page">
      <div class="hero-bg" style="background-image:url('assets/hero-bg.jpg')"></div>
      <div class="hero-overlay"></div>
      <img class="hero-logo" src="assets/logo-white.png" alt="escore" />
      <div class="hero-title">${cap(m.tech.stationType)} сонячна<br/>електростанція${m.tech.stationCapacityKw ? `<br/>${fmtNum(m.tech.stationCapacityKw, 2)} кВт` : ""}</div>
    </section>`;
  }

  // ---------- Сторінка 2 — "Чому саме ESCORE?" ----------
  // Контент (сертифікат + асоціації) — 1:1 з референсної презентації,
  // не залежить від даних розрахунку. Перекладено з альбомної презентації
  // під наш (тепер теж альбомний) формат сторінки — сертифікат зліва,
  // пункти й сітка логотипів справа (запит Анни, 2026-07-07).
  // Оновлено 2026-07-13 (запит Анни): сітка логотипів тепер 2 колонки x
  // 3 рядки (було 3x2) — плашки виходять більшими й краще заповнюють
  // сторінку. Кожен логотип обгорнуто в .logo-tile — однакова
  // фіксована висота-рамка для всіх плашок, щоб вони виглядали
  // однакового розміру незалежно від пропорцій вихідного файлу.
  // "СУП" (Спілка Українських Підприємців) — єдина плашка, що раніше
  // була темно-синім/чорним фото з блакитними літерами (погано читалась,
  // не пасувала до решти білих плашок). Замінено на зображення з білим
  // фоном assets/logo-sup-white.jpg (запит Анни, 2026-07-14).
  function pageWhyEscore() {
    return `
    <section class="kp-page why-page">
      <div class="why-banner">Чому саме ESCORE?</div>
      <div class="why-body">
        <div class="why-cert"><img src="assets/cert.jpg" alt="Сертифікат ISO 9001"/></div>
        <div class="why-content">
          <div class="why-point"><span class="chk">✓</span> Ми маємо СЕРТИФІКАТ на систему управління якістю</div>
          <div class="why-point"><span class="chk">✓</span> Ми є членами таких асоціацій:</div>
          <div class="why-logos">
            <div class="logo-tile"><img src="assets/logo-women.jpg" alt="Жіночий енергоклуб України"/></div>
            <div class="logo-tile"><img src="assets/logo-sup-white.jpg" alt="Спілка Українських Підприємців"/></div>
            <div class="logo-tile"><img src="assets/logo-asau.jpg" alt="Асоціація сонячної енергетики України"/></div>
            <div class="logo-tile"><img src="assets/logo-tpp.jpg" alt="Торгово-Промислова палата України"/></div>
            <div class="logo-tile"><img src="assets/logo-onpu.jpg" alt="Одеська політехніка"/></div>
            <div class="logo-tile"><img src="assets/logo-employers.jpg" alt="Об'єднання організацій роботодавців Одеської області"/></div>
          </div>
        </div>
      </div>
    </section>`;
  }

  // ---------- Сторінка 3 — обкладинка (дані по проєкту) ----------
  // Клас "cover-page" (фікс переповнення при друку, 2026-07-13, див.
  // однойменний коментар у style.css): фіксує висоту сторінки на
  // --page-h і масштабує фото розташування панелей через object-fit,
  // щоб контент завжди вміщувався в одну фізичну сторінку PDF, а не
  // "перетікав" на сторінку без заголовка.
  function pageCover(m) {
    const hero = m.images[0];
    return `
    <section class="kp-page cover-page">
      ${pageHeader(m.meta, "cover")}
      <div class="kp-eyebrow">Сонячна електростанція під ключ</div>
      <div class="kp-title">${cap(m.tech.stationType)} СЕС «${esc(m.meta.object)}»${m.tech.stationCapacityKw ? " — " + fmtNum(m.tech.stationCapacityKw, 2) + " кВт" : ""}</div>
      <div class="kp-desc">
        Тип рішення: <b>${esc(m.tech.stationType)} сонячна електростанція</b>${m.tech.hasBattery ? " та акумуляторна система (автономія / резерв)" : ""} — генерація
        власної електроенергії для потреб об'єкта зі зниженням витрат на електропостачання.
      </div>
      <!-- Об'єкт/Виконавець збільшено та виділено картками (запит Анни,
           2026-07-07) — той самий візуальний стиль, що й у stat-card. -->
      <div class="meta-grid">
        <div><div class="k">Об'єкт</div><div class="v">${esc(m.meta.object) || "—"}</div></div>
        <div><div class="k">Виконавець</div><div class="v">${esc(m.meta.company.name)}</div></div>
      </div>
      <!-- Підпис над фото замість підпису під фото з назвою файлу (запит
           Анни, 2026-07-07): великий заголовок "Розташування панелей на
           об'єкті" без імені файлу зображення. -->
      ${hero ? `<div class="hero-caption-title">Розташування панелей на об'єкті</div><div class="hero-img"><img src="${hero.url}"/></div>` : ""}
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${m.tech.stationCapacityKw ? fmtNum(m.tech.stationCapacityKw, 2) : "—"} кВт</div><div class="lbl">Потужність інверторної групи, ${m.tech.invertersQty || "—"} шт</div></div>
        <div class="stat-card"><div class="num">${m.tech.panelsQty || "—"} шт</div><div class="lbl">${esc(m.tech.panelModel || "Панелі")}</div></div>
        <!-- Потужність масиву фотомодулів — комірка B3 вкладки "Моделювання
             Фін. показників роботи СЕС" (підпис "Потужність СЕС" у сусідній
             комірці A3). Беремо вже готове значення m.model.capacityKw, яке
             парситься саме з цієї комірки в sheets.js (parseModelSheet) —
             замінює собою картку моделі гібридного інвертора (запит Анни,
             2026-07-07). -->
        <div class="stat-card"><div class="num">${m.model.capacityKw ? fmtNum(m.model.capacityKw, 2) : "—"} кВт</div><div class="lbl">Потужність масиву фотомодулів</div></div>
        <div class="stat-card"><div class="num">${m.tech.batteryQty || "—"} шт</div><div class="lbl">${esc(m.tech.batteryModel || "Акумулятори")}</div></div>
      </div>
    </section>`;
  }

  // ---------- Сторінка 2 — про проєкт + технічні показники генерації + галерея ----------
  // Технічні показники генерації (річна генерація, генерація 1 кВт, за 30
  // років) і стовпчикова діаграма помісячної генерації навмисно живуть тут,
  // а не на сторінці "Економічна вигода" — там лишились тільки грошові
  // показники (тариф, економія, окупність, дохід, LCOE). Розділення
  // технічних і фінансових даних — свідоме рішення (запит Анни, 2026-07-07).
  //
  // Оновлено 2026-07-13 (запит Анни): (1) назва панелі показується БЕЗ
  // технічного префіксу "PV модуль"/"Фотомодуль" — він потрібен лише для
  // розпізнавання рядка як панелі в buildTechSpec (regex isPanel вище),
  // але в тексті виглядає зайвим/канцелярським; (2) одразу після інформації
  // про сонячні панелі додано аналогічний блок про інвертор (модель +
  // кількість), якого тут раніше не було зовсім (інвертор фігурував лише
  // на сторінці-обкладинці як кВт потужності, без назви моделі).
  function stripEquipPrefix(name) {
    return String(name || "").replace(/^\s*(PV\s*модул[ья]?|фотомодул[ья]?)\s*/i, "").trim();
  }

  function pageAbout(m) {
    const gallery = m.images.slice(1);
    const chartId = "kp-gen-chart";
    // Опис обладнання формується з даних (панелі/інвертор/батарея), а не
    // хардкодиться, щоб при завантаженні нового файлу-розрахунку текст сам
    // оновлювався. Назва інвертора/батареї з файлу-розрахунку вже сама
    // містить слово "інвертор"/"акумуляторна батарея" (напр. "Мережевий
    // інвертор Solax X3-MGA-50KG2") — тому тут більше НЕ додаємо це слово
    // окремим текстовим лейблом попереду, щоб воно не повторювалось двічі
    // поспіль в одному реченні (запит Анни, 2026-07-14).
    const equipParts = [];
    if (m.tech.panelModel) equipParts.push(`сонячні панелі <b>${esc(stripEquipPrefix(m.tech.panelModel))}</b>${m.tech.panelsQty ? ` (${m.tech.panelsQty} шт)` : ""}`);
    if (m.tech.inverterModel) equipParts.push(`<b>${esc(m.tech.inverterModel)}</b>${m.tech.invertersQty ? ` (${m.tech.invertersQty} шт)` : ""}`);
    if (m.tech.hasBattery && m.tech.batteryModel) equipParts.push(`<b>${esc(m.tech.batteryModel)}</b>${m.tech.batteryQty ? ` (${m.tech.batteryQty} шт)` : ""}`);
    const hasGenStats = m.model.annualGenKwh || m.model.annualGenPerKw || m.model.gen30y;
    return `
    <section class="kp-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">01</span> Про проєкт</div>
      <div class="kp-body">
        <p>Пропонуємо будівництво ${esc(m.tech.stationTypeGen)} сонячної електростанції${m.tech.stationCapacityKw ? " потужністю <b>" + fmtNum(m.tech.stationCapacityKw, 2) + " кВт</b>" : ""}
        для об'єкта «${esc(m.meta.object)}». Рішення забезпечує генерацію власної електроенергії у денні години,
        коли зазвичай споживання найактивніше, зі зниженням витрат на електропостачання.${m.tech.hasBattery ? " Станція комплектується акумуляторною батареєю для автономної роботи / резервного живлення." : ""}</p>
        ${equipParts.length ? `<p>Основне обладнання: ${equipParts.join(", ")}.</p>` : ""}
        <p>Повний цикл робіт «під ключ»: проєктування, постачання обладнання, монтаж, підключення, пусконалагодження та запуск.</p>
      </div>
      ${hasGenStats ? `
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${m.model.annualGenKwh ? fmtNum(m.model.annualGenKwh) : "—"}</div><div class="lbl">Річна генерація, кВт·год</div></div>
        <div class="stat-card"><div class="num">${m.model.annualGenPerKw ? fmtNum(m.model.annualGenPerKw) : "—"}</div><div class="lbl">Річна генерація 1 кВт, кВт·год</div></div>
        <div class="stat-card"><div class="num">${m.model.gen30y ? fmtNum(m.model.gen30y) : "—"}</div><div class="lbl">Генерація за 30 років, кВт·год</div></div>
      </div>` : ""}
      ${m.model.months.length ? `<div class="chart-wrap"><canvas id="${chartId}"></canvas></div>` : ""}
      ${gallery.length ? `<div class="gallery">${gallery.map((g, i) => `<figure><img src="${g.url}"/><figcaption>Зображення ${i + 2}${g.name ? " — " + esc(g.name) : ""}</figcaption></figure>`).join("")}</div>` : ""}
    </section>`;
  }

  // ---------- Сторінка 02 — фінансові показники ----------
  // Повністю перероблена сторінка (запит Анни, 2026-07-08): була "Технічне
  // рішення" (список обладнання), стала "Фінансові показники" — 5 цифр,
  // які читаються за ФІКСОВАНИМИ адресами комірок вкладки "Моделювання
  // Фін. показників роботи СЕС" (не за текстом підпису, як решта парсера —
  // так навмисно попросила Анна, бо верхня панель показників там завжди
  // однакової розкладки): H1, J1, B53, H2, і місячна економія A7:A18/D7:D18
  // (див. sheets.js parseModelSheet). Перемикач місяця — реальний <select>,
  // прихований на друку класом .no-print, значення підмінюється на клієнті
  // без повторного звернення до Google Sheets (див. wireFinMonthSelect()
  // нижче, викликається з render()).
  // Оновлено 2026-07-13 (запит Анни, "розподілити зміст на весь лист"):
  // додано клас "fin-page" (той самий фіксовано-висотний flex-стовпець,
  // що й у інших "особливих" сторінок) + внутрішня обгортка ".fin-content"
  // з flex:1 і justify-content:space-between, щоб блоки (текст-вступ,
  // benefit-strip, картка місячної економії, 2 фінансові картки)
  // рівномірно розтягувались на всю висоту сторінки, а не тулились угорі
  // з порожнечею знизу.
  const UK_MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
    "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

  function pageTech(m) {
    const monthly = m.model.monthlySavings || [];
    const nowMonthName = UK_MONTHS[new Date().getMonth()];
    let defaultIdx = monthly.findIndex((x) => x.month === nowMonthName);
    if (defaultIdx < 0) defaultIdx = 0;
    const year = new Date().getFullYear();
    const defaultItem = monthly[defaultIdx];
    const optionsHtml = monthly
      .map((x, i) => `<option value="${i}"${i === defaultIdx ? " selected" : ""}>${esc(x.month)}</option>`)
      .join("");
    return `
    <section class="kp-page fin-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">02</span> Фінансові показники</div>
      <div class="fin-content">
        <div class="kp-body">
          <p>Нижче — ключові фінансові показники проєкту, розраховані на основі поточного тарифу на електроенергію
          та фактичних параметрів станції. Вони дозволяють оцінити реальну економічну вигоду від впровадження СЕС
          як у короткостроковій, так і в довгостроковій перспективі.</p>
        </div>
        <div class="benefit-strip">
          <div class="benefit-box green">
            <div class="cap">Річна економія, за умови 100% споживання згенерованої е/е</div>
            <div class="big">${m.model.annualSavings100 != null ? fmtUsd(m.model.annualSavings100) : "—"}</div>
          </div>
          <div class="benefit-box dark">
            <div class="cap">Строк окупності проєкту при діючому тарифі</div>
            <div class="big">${m.model.paybackAtTariff != null ? fmtNum(m.model.paybackAtTariff, 2) + " року" : "—"}</div>
          </div>
        </div>
        <div class="fin-month-card">
          <div>
            <div class="lbl">Потенційна місячна економія, за умови 100% споживання, у
            <span id="fin-month-label">${defaultItem ? esc(defaultItem.month) : "—"}</span> ${year} р.</div>
            <div class="val" id="fin-month-value">${defaultItem && defaultItem.amount != null ? fmtUsd(defaultItem.amount) : "—"}</div>
          </div>
          ${monthly.length ? `<select id="fin-month-select" class="no-print">${optionsHtml}</select>` : ""}
        </div>
        <div class="stat-cards cols-2">
          <div class="stat-card">
            <div class="num">${m.model.totalEffect30y != null ? fmtUsd(m.model.totalEffect30y) : "—"}</div>
            <div class="lbl">Загальний економічний ефект від впровадження СЕС за 30 років експлуатації</div>
          </div>
          <div class="stat-card">
            <div class="num">${m.model.lcoe30Uah != null ? fmtNum(m.model.lcoe30Uah, 2) + " грн / 1 кВт·г" : "—"}</div>
            <div class="lbl">LCOE30 — собівартість 1 кВт·год сонячної електроенергії від СЕС, з ПДВ</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  // Підміна значення картки "Потенційна місячна економія" при виборі іншого
  // місяця у випадаючому списку — дані вже завантажені (monthlySavings),
  // повторний запит до Google Sheets не потрібен.
  function wireFinMonthSelect(model) {
    const sel = document.getElementById("fin-month-select");
    const monthly = model.model.monthlySavings || [];
    if (!sel || !monthly.length) return;
    sel.addEventListener("change", () => {
      const item = monthly[Number(sel.value)];
      const labelEl = document.getElementById("fin-month-label");
      const valEl = document.getElementById("fin-month-value");
      if (!item || !labelEl || !valEl) return;
      labelEl.textContent = item.month;
      valEl.textContent = item.amount != null ? fmtUsd(item.amount) : "—";
    });
  }

  // ---------- Сторінка 4 — бюджет реалізації ----------
  // Структура — 1:1 з референсного слайду "Бюджет реалізації" (запит
  // Анни, 2026-07-13): три групи (Обладнання / Витратні матеріали /
  // Роботи), кожна зі своєю мержованою колонкою підсумку. Позиції групи
  // "Обладнання" читаються ДИНАМІЧНО з категорії "Основне технічне
  // обладнання та система кріплення" вкладки ПДВ (назва — колонка B,
  // кількість — колонка C, як завжди в цьому проєкті — пошук за текстом,
  // не за координатами), обмежені діапазоном рядків B3:B10 (див.
  // findBudgetEquipItems() нижче). "Витратні матеріали" й "Роботи" —
  // фіксований перелік найменувань зі стандартного шаблону (кількість
  // завжди 1, не з файлу — так попросила Анна). Підсумкові суми (Вартість
  // без ПДВ по кожній групі, Разом без ПДВ, Загальна вартість з ПДВ)
  // РАХУЮТЬСЯ з уже розібраних категорій ПДВ-вкладки (sheets.js,
  // parseBudgetCells) — НЕ за фіксованими адресами комірок (той підхід
  // ламався, коли в файлі траплялись зайві/задвоєні рядки — див. докладний
  // коментар над parseBudgetCells у sheets.js).
  const BUDGET_MATERIALS = [
    "PV кабель для підключення фотомодулів, 6мм, Німеччина",
    "Автоматика захисту змінного струму",
    "Кабельно-провідникова продукція + конектори MC4",
    "Автоматика захисту фотоелектричних модулів (постійний струм)",
    "Витратні матеріали",
  ];
  const BUDGET_WORKS = [
    "Будівельно-монтажні роботи",
    "Електро-монтажні роботи",
    "Прокладка електричного кабелю",
    "Підйомні механізми",
    "Доставка обладнання",
  ];

  function findBudgetEquipItems(pdv) {
    const cat = pdv.categories.find((c) => {
      const n = c.name.toLowerCase();
      return n.includes("техн") && n.includes("облад");
    });
    if (!cat) return [];
    const range = (window.KP_CONFIG && window.KP_CONFIG.BUDGET_EQUIP_ROW_RANGE) || { start: 3, end: 10 };
    return cat.items.filter((it) => it.row != null && it.row >= range.start && it.row <= range.end);
  }

  function budgetGroupRows(items, getName, getQty, priceVal, catLabel, groupClass) {
    if (!items.length) return "";
    // Довгі підписи підрозділів (напр. "Автоматика захисту фотоелектричних
    // модулів (постійний струм)" — з'явились разом із "Розширеним
    // бюджетом", 2026-07-18) не влазять в один рядок повернутого на 90°
    // тексту при короткому блоці рядків, як короткі "Обладнання"/"Роботи".
    // Клас "long" вмикає менший шрифт + перенос рядків (див. style.css) —
    // без цього текст просто вилазив би за межі мержованої комірки.
    const catClass = "budget-cat" + (catLabel && catLabel.length > 20 ? " long" : "");
    return items.map((it, i) => {
      const name = getName(it);
      const qty = getQty(it);
      const first = i === 0;
      return `<tr class="${groupClass}">
        ${first ? `<td class="${catClass}" rowspan="${items.length}"><span>${esc(catLabel)}</span></td>` : ""}
        <td contenteditable="true">${esc(name)}</td>
        <td class="num" contenteditable="true">${qty == null ? "—" : fmtNum(qty)}</td>
        ${first ? `<td class="num budget-price" rowspan="${items.length}"><span contenteditable="true">${fmtUsd(priceVal)}</span></td>` : ""}
      </tr>`;
    }).join("");
  }

  // "Розширений бюджет" (запит Анни, 2026-07-18, обговорено окремо перед
  // кодом — детальний план збережено в пам'яті проєкту): коли увімкнено
  // чекбокс на формі (m.budgetDetail не null — заповнюється в app.js з
  // KpSheets.loadCalcFromSheet(..., {budgetDetail:true})), група
  // "Витратні матеріали" замінюється на 3 підрозділи з РЕАЛЬНИМИ назвами
  // комплектуючих (з вкладки "Кошторис_Наявність обладнання") замість
  // хардкод-переліку BUDGET_MATERIALS. Кожен підрозділ — той самий
  // budgetGroupRows(), просто без кількості (getQty завжди null, "—") і з
  // ціною, вже підрахованою в sheets.js findBudgetDetailPrices(). Якщо
  // чекбокс вимкнено АБО вкладку Кошторис не вдалось прочитати/розпарсити
  // (m.budgetDetail лишається null, fail-soft — див. sheets.js), сторінка
  // просто повертається до старого хардкод-списку — не ламається.
  function budgetDetailNames(n) { return n; }
  function budgetDetailQty() { return null; }

  function budgetDetailSubsections(m) {
    const detail = m.budgetDetail;
    if (!detail) return null;
    return [
      { items: detail.ac && detail.ac.items, price: detail.ac && detail.ac.price, label: "Автоматика захисту змінного струму" },
      { items: detail.dc && detail.dc.items, price: detail.dc && detail.dc.price, label: "Автоматика захисту фотоелектричних модулів (постійний струм)" },
      { items: detail.cable && detail.cable.items, price: detail.cable && detail.cable.price, label: "Кабельно-провідникова продукція + конектори МС4" },
    ];
  }

  function budgetTable(bodyHtml, priceHeader, tfootHtml) {
    return `<table class="budget-table">
      <thead>
        <tr>
          <th colspan="2">Найменування</th>
          <th class="num">Кількість</th>
          <th class="num">${priceHeader}</th>
        </tr>
      </thead>
      <tbody>${bodyHtml}</tbody>
      ${tfootHtml ? `<tfoot>${tfootHtml}</tfoot>` : ""}
    </table>`;
  }

  function budgetNotesAside() {
    return `<aside class="budget-notes">
      <div class="note"><span class="chk">✓</span><div><b>Остаточна вартість</b> проєкту затверджується після узгодження технічних рішень</div></div>
      <div class="note"><span class="chk">✓</span><div><b>Оплата</b> здійснюється в національній валюті за комерційним курсом на дату виконання платежу</div></div>
      <div class="note"><span class="chk">✓</span><div>Пропозиція дійсна протягом <b>3 днів</b></div></div>
    </aside>`;
  }

  // "Розширений бюджет" — розбиття на 2 сторінки (запит Анни, 2026-07-18,
  // ПІСЛЯ живої перевірки): при реальній кількості позицій у "Кабельно-
  // провідникова продукція" (у тестовому файлі — 18) три деталізовані
  // підрозділи разом з "Обладнання"/"Роботи"/підсумками НЕ вміщались в
  // одну сторінку з фіксованою висотою (.budget-page{overflow:hidden}) —
  // "Роботи" й підсумкові суми просто зникали (обрізались), хоча в даних
  // вони були. Анна обрала явний варіант "розбити на 2 сторінки" замість
  // стиснення шрифту (шрифт і так вже стиснутий до межі читабельності) чи
  // обрізання списку (вона explicitly НЕ хоче ховати реальні позиції
  // клієнта). Сторінка "03" (з бейджем) — Обладнання + короткі підрозділи
  // AC/DC (завжди короткі, по 3-5 позицій — з практики розрахунків СЕС).
  // Друга сторінка (без бейджа, повторний хедер) — Кабельно-провідникова
  // продукція (найбільш "довгий" підрозділ) + Роботи + підсумкові суми +
  // примітки. Загальна нумерація наступних сторінок (04 PvSyst, 05
  // сезонні графіки) НЕ зсувається — друга сторінка бюджету навмисно без
  // власного номера, як і сторінки "Гарантія"/"Менеджер" наприкінці
  // документа. У звичайному режимі (чекбокс вимкнено, m.budgetDetail
  // null) поведінка 1:1 стара — одна сторінка "03", без змін.
  function pageBudget(m) {
    const equip = findBudgetEquipItems(m.pdv);
    const equipRows = equip.length ? equip : [{ name: "—", qty: null }];
    const b = m.budget || {};
    // Режим "C" (без ПДВ, запит Анни 2026-07-18) — не показуємо ані рядок
    // податку, ані слово "ПДВ" в підписах підсумку/шапки таблиці взагалі.
    const noVat = m.clientMode === "cash";
    const priceHeader = noVat ? "Вартість, $" : "Вартість<br/>без ПДВ, $";
    const totalsHtml = noVat
      ? `<tr class="sum grand"><td colspan="3">Загальна вартість:</td><td class="num" contenteditable="true">${fmtUsd(b.nettoTotal)}</td></tr>`
      : `<tr class="sum"><td colspan="3">Разом без ПДВ:</td><td class="num" contenteditable="true">${fmtUsd(b.nettoTotal)}</td></tr>
            <tr class="sum"><td colspan="3">ПДВ</td><td class="num" contenteditable="true">${fmtUsd(b.vat)}</td></tr>
            <tr class="sum grand"><td colspan="3">Загальна вартість з ПДВ:</td><td class="num" contenteditable="true">${fmtUsd(b.grossTotal)}</td></tr>`;

    const sub = budgetDetailSubsections(m);
    const equipHtml = budgetGroupRows(equipRows, (it) => it.name, (it) => it.qty, b.equipmentCost, "Обладнання", "grp-equip");
    const worksHtml = budgetGroupRows(BUDGET_WORKS, (n) => n, () => 1, b.worksCost, "Роботи", "grp-works");

    if (!sub) {
      // Стара однасторінкова версія (чекбокс вимкнено) — без змін.
      const materialsHtml = budgetGroupRows(BUDGET_MATERIALS, (n) => n, () => 1, b.materialsCost, "Витратні матеріали", "grp-mat");
      return `
      <section class="kp-page budget-page">
        ${pageHeader(m.meta)}
        <div class="section-title"><span class="num-badge">03</span> Бюджет реалізації</div>
        <div class="budget-layout">
          ${budgetTable(equipHtml + materialsHtml + worksHtml, priceHeader, totalsHtml)}
          ${budgetNotesAside()}
        </div>
      </section>`;
    }

    // Розширений бюджет — 2 сторінки. AC/DC — на першій сторінці разом з
    // Обладнання (завжди короткі); Кабельно-провідникова продукція
    // (найдовший підрозділ) переноситься на другу сторінку разом з
    // Роботи й підсумками, щоб перша сторінка не переповнювалась.
    const acHtml = budgetGroupRows(sub[0].items && sub[0].items.length ? sub[0].items : ["—"], budgetDetailNames, budgetDetailQty, sub[0].price, sub[0].label, "grp-mat");
    const dcHtml = budgetGroupRows(sub[1].items && sub[1].items.length ? sub[1].items : ["—"], budgetDetailNames, budgetDetailQty, sub[1].price, sub[1].label, "grp-mat");
    const cableHtml = budgetGroupRows(sub[2].items && sub[2].items.length ? sub[2].items : ["—"], budgetDetailNames, budgetDetailQty, sub[2].price, sub[2].label, "grp-mat");

    // Перебалансовано ПІСЛЯ другої живої перевірки (2026-07-18, той самий
    // день): початковий розподіл (AC+DC на 1-й, Кабельна продукція+Роботи+
    // підсумки на 2-й) все одно переповнював 2-гу сторінку — 18 рядків
    // кабельної групи + 5 рядків Роботи + 3 підсумкові = 26 рядків більше,
    // ніж будь-коли вміщувалось в одну сторінку. Роботи (завжди рівно 5
    // хардкод-рядків) перенесено на 1-шу сторінку — вона й так мала багато
    // вільного місця (Обладнання+AC+DC ≈ 15 рядків), а 2-га лишається лише
    // з Кабельно-провідниковою продукцією (найдовший підрозділ, до ~18-20
    // рядків з практики) + підсумками — це майже точно той самий обсяг
    // (~21-22 рядки разом з шапкою/футером), що й стара однасторінкова
    // версія без деталізації, яка, за попереднім досвідом, влазить.
    const page1 = `
    <section class="kp-page budget-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">03</span> Бюджет реалізації</div>
      <div class="budget-table-wrap">
        ${budgetTable(equipHtml + acHtml + dcHtml + worksHtml, priceHeader, null)}
      </div>
    </section>`;

    const page2 = `
    <section class="kp-page budget-page">
      ${pageHeader(m.meta)}
      <div class="section-title">Бюджет реалізації (продовження)</div>
      <div class="budget-layout">
        ${budgetTable(cableHtml, priceHeader, totalsHtml)}
        ${budgetNotesAside()}
      </div>
    </section>`;

    return page1 + page2;
  }

  // ---------- Сторінка 04 — імітаційна модель СЕС (PvSyst) ----------
  const SHADING_POINTS = [
    "Ваше обладнання та температурний режим його роботи",
    "Локальні затінення від оточуючих об'єктів",
    "Розташування сонячних панелей (кут нахилу, азимут)",
    "Метеодані за минулі 15 років на основі бази даних Meteonorm 8.1",
    "Втрати в кабельних лініях",
    "Втрати електроенергії через запилення панелей",
  ];

  function pageShading(m) {
    if (!m.pvsystImage) return "";
    return `
    <section class="kp-page shading-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">04</span> Ми створили <b class="accent">імітаційну модель вашої СЕС</b> та врахували:</div>
      <div class="shading-layout">
        <div class="shading-timeline">
          ${SHADING_POINTS.map((p) => `<div class="shading-item"><span class="dot"></span>${esc(p)}</div>`).join("")}
        </div>
        <div class="shading-img"><img src="${m.pvsystImage}"/></div>
      </div>
    </section>`;
  }

  // ---------- Сторінка 05 — порівняння погодинної генерації ----------
  function pageSeasonal(m) {
    if (!m.seasonalHourly || !m.seasonalHourly.series.length) return "";
    return `
    <section class="kp-page seasonal-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">05</span> Порівняння погодинної генерації СЕС на прикладі січня / квітня / липня / жовтня</div>
      <div class="seasonal-chart-wrap"><canvas id="kp-seasonal-chart"></canvas></div>
    </section>`;
  }

  const SEASONAL_COLORS = { jan: "#4C7A72", apr: "#05554B", jul: "#F5C518", oct: "#B3592E" };

  function wireSeasonalChart(model) {
    const seasonal = model.seasonalHourly;
    if (!seasonal || !seasonal.series.length || !window.Chart) return;
    const ctx = document.getElementById("kp-seasonal-chart");
    if (!ctx) return;
    new Chart(ctx, {
      type: "line",
      data: {
        labels: seasonal.hours.map((h) => h + "H"),
        datasets: seasonal.series.map((s) => ({
          label: s.label,
          data: s.data,
          borderColor: SEASONAL_COLORS[s.key] || "#05554B",
          backgroundColor: SEASONAL_COLORS[s.key] || "#05554B",
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.35,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { color: "#1B1F1E", font: { size: 12, weight: "600" }, usePointStyle: true, boxWidth: 8 },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: "#5B6864", font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grid: { color: "#E1E6E2" },
            border: { display: false },
            ticks: { color: "#5B6864", font: { size: 10 } },
            title: { display: true, text: "кВт", color: "#5B6864" },
          },
        },
      },
    });
  }

  // ---------- Сторінка — "Гарантійний термін та термін використання" ----------
  function pageWarranty(m) {
    return `
    <section class="kp-page warranty-page">
      <img class="logo" src="data:image/png;base64,${ESCORE_LOGO_B64}" alt="escore" />
      <div class="warranty-banner">Гарантійний термін та термін використання</div>
      <div class="warranty-table-wrap">
        <table class="warranty-table">
          <thead>
            <tr><th>Компоненти СЕС</th><th>Гарантія</th><th>Термін використання*</th></tr>
          </thead>
          <tbody>
            <tr><td>Генерація фотоелектричних модулів</td><td contenteditable="true">30 років</td><td rowspan="5" class="wu" contenteditable="true">до 35 років</td></tr>
            <tr><td>Цілісність фотоелектричних модулів</td><td contenteditable="true">12 років</td></tr>
            <tr><td>Система кріплень</td><td contenteditable="true">5 років</td></tr>
            <tr><td>Монтажні роботи</td><td rowspan="2" contenteditable="true">3 роки</td></tr>
            <tr><td>Кабельно-провідникова продукція</td></tr>
            <tr><td>Захисні пристрої та автоматика</td><td rowspan="2" contenteditable="true">5 років</td><td rowspan="2" class="wu" contenteditable="true">до 20 років</td></tr>
            <tr><td>Інвертори</td></tr>
            <tr><td>Онлайн-моніторинг параметрів роботи сонячної електростанції</td><td colspan="2" class="wu-life" contenteditable="true">безстроково</td></tr>
          </tbody>
        </table>
      </div>
    </section>`;
  }

  // ---------- Остання сторінка — контакти менеджера ----------
  function pageManager(m) {
    const mgr = window.KP_CONFIG.MANAGER;
    return `
    <section class="kp-page manager-page">
      <img class="logo" src="data:image/png;base64,${ESCORE_LOGO_B64}" alt="escore" />
      <div class="manager-body">
        <div class="manager-photo-col">
          <div class="manager-photo"><img src="${mgr.photo}" alt="${esc(mgr.name)}"/></div>
          <div class="manager-name">${esc(mgr.name)}</div>
          <div class="manager-role">${esc(mgr.position)}</div>
        </div>
        <div class="manager-contacts">
          <div class="mc-block">
            <div class="mc-title">Написати мені</div>
            <div class="mc-val"><a href="mailto:${esc(mgr.email)}">${esc(mgr.email)}</a></div>
          </div>
          <div class="mc-row">
            <div class="mc-block">
              <div class="mc-title">Подзвонити нам</div>
              <div class="mc-val">${esc(mgr.phone)}</div>
            </div>
            <div class="mc-block">
              <div class="mc-title">Адреса</div>
              <div class="mc-val">${esc(mgr.address).replace(/\n/g, "<br/>")}</div>
            </div>
          </div>
          <div class="mc-block">
            <div class="mc-title">Соціальні мережі</div>
            <div class="mc-val">instagram: ${esc(mgr.instagram)}</div>
            <div class="mc-val">facebook: ${esc(mgr.facebook)}</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function buildTechSpec(pdv) {
    const specItems = [];
    let panelModel = null, panelsQty = 0, inverterModel = null, invertersQty = 0;
    let batteryModel = null, batteryQty = 0;
    let isHybrid = false, hasBattery = false, inverterKwTotal = 0;
    pdv.categories.forEach((cat) => {
      cat.items.forEach((it) => {
        const n = it.name.toLowerCase();
        const looksLikeAccessory = /кабел|провід|конектор|мс4|mc4|кріпленн|стійк/.test(n);
        const isPanel = !looksLikeAccessory && (/^фем$/i.test(it.code || "") || /панел/.test(n) || /^pv\s*модул/.test(n) || /^фотомодул/.test(n));
        if (isPanel) { panelModel = it.name; panelsQty += it.qty; }
        if (/інвертор/.test(n)) {
          inverterModel = it.name; invertersQty += it.qty;
          if (/г[іи]брид/.test(n)) isHybrid = true;
          const kwMatch = it.name.match(/(\d+(?:[.,]\d+)?)\s*k(?!wh)/i);
          if (kwMatch) inverterKwTotal += parseFloat(kwMatch[1].replace(",", ".")) * (it.qty || 1);
        }
        if (/акумулятор|акб\b|batter/.test(n)) { hasBattery = true; batteryModel = it.name; batteryQty += it.qty; }
        if (it.qty > 0) {
          specItems.push({ label: it.name, value: `${it.qty} шт` });
        }
      });
    });
    const hybrid = isHybrid || hasBattery;
    const stationType = hybrid ? "гібридна" : "мережева";
    const stationTypeGen = hybrid ? "гібридної" : "мережевої";
    return {
      specItems: specItems.slice(0, 12), panelModel, panelsQty, inverterModel, invertersQty,
      batteryModel, batteryQty,
      stationType, stationTypeGen, hasBattery,
      stationCapacityKw: inverterKwTotal || null,
    };
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function tierColors(values) {
    const n = values.length;
    const order = values.map((_, i) => i).sort((a, b) => (values[b] || 0) - (values[a] || 0));
    const tierSize = Math.ceil(n / 3);
    const colors = new Array(n);
    order.forEach((idx, rank) => {
      if (rank < tierSize) colors[idx] = "#F5C518";
      else if (rank < tierSize * 2) colors[idx] = "#05554B";
      else colors[idx] = "#82CFC4";
    });
    return colors;
  }

  const genDataLabelsPlugin = {
    id: "genDataLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, di) => {
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((bar, i) => {
          const value = dataset.data[i];
          if (value === null || value === undefined) return;
          ctx.save();
          ctx.fillStyle = "#1B1F1E";
          ctx.font = "600 11px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(fmtNum(value), bar.x, bar.y - 6);
          ctx.restore();
        });
      });
    },
  };

  function render(model) {
    const now = new Date();
    model.meta.kpNumber = model.meta.kpNumber || defaultKpNumber(now);
    model.meta.kpDateStr = model.meta.kpDateStr || fmtDate(now);
    model.meta.company = window.KP_CONFIG.COMPANY;
    model.tech = buildTechSpec(model.pdv);

    const html = [
      pageHero(model),
      pageWhyEscore(),
      pageCover(model),
      pageAbout(model),
      pageTech(model),
      pageBudget(model),
      pageShading(model),
      pageSeasonal(model),
      pageWarranty(model),
      pageManager(model),
    ].join("\n");

    const holder = document.getElementById("kp-doc");
    holder.innerHTML = html;
    holder.classList.add("ready");

    wireFinMonthSelect(model);
    wireSeasonalChart(model);

    if (model.model.months.length && window.Chart) {
      const ctx = document.getElementById("kp-gen-chart");
      if (ctx) {
        const genValues = model.model.months.map((m) => m.generation);
        new Chart(ctx, {
          type: "bar",
          data: {
            labels: model.model.months.map((m) => m.month),
            datasets: [{
              label: "Генерація, кВт·год",
              data: genValues,
              backgroundColor: tierColors(genValues),
              borderRadius: 4,
              maxBarThickness: 46,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 28 } },
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, border: { display: false } },
              y: { display: false, beginAtZero: true, grid: { display: false }, border: { display: false } },
            },
          },
          plugins: [genDataLabelsPlugin],
        });
      }
    }
  }

  window.KpRender = { render };
})();
