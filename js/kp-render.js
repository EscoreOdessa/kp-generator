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

  // Назва об'єкта (напр. «Швейні виробництва») тепер показується ЛИШЕ якщо
  // її вписано вручну в поле "Об'єкт" на формі (запит Анни, 2026-07-19) —
  // раніше, коли поле лишалось порожнім, app.js підставляв назву,
  // автоматично прочитану з комірки A1 вкладки "Кошторис_Наявність
  // обладнання", а якщо і там було порожньо — плейсхолдер "[Назва об'єкта]".
  // Тепер app.js більше НІЧОГО туди не підставляє (m.meta.object лишається
  // порожнім рядком, якщо поле форми порожнє) — обидва хелпери нижче
  // повертають "", коли m.meta.object порожній, щоб жоден заголовок/речення
  // з назвою об'єкта не "ламався" на порожніх лапках «».
  function objectLabel(m) { return m.meta.object ? ` «${esc(m.meta.object)}»` : ""; }
  function objectClause(m) { return m.meta.object ? ` для об'єкта «${esc(m.meta.object)}»` : ""; }

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
      <div class="hero-title">${m.hasPanels === false ? "Джерело безперебійного<br/>живлення" : `${cap(m.tech.stationType)} сонячна<br/>електростанція`}${m.tech.stationCapacityKw ? `<br/>${fmtNum(m.tech.stationCapacityKw, 2)} кВт` : ""}</div>
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
      <div class="kp-title">${m.hasPanels === false ? "Джерело безперебійного живлення" : `${cap(m.tech.stationType)} СЕС`}${objectLabel(m)}${m.tech.stationCapacityKw ? " — " + fmtNum(m.tech.stationCapacityKw, 2) + " кВт" : ""}</div>
      <div class="kp-desc">
        Тип рішення: <b>${esc(stationNameNom(m))}</b>${m.hasPanels !== false && m.tech.hasBattery ? " та акумуляторна система (автономія / резерв)" : ""} — ${m.hasPanels === false ? "автономне резервне живлення об'єкта на акумуляторах, без сонячної генерації." : "генерація власної електроенергії для потреб об'єкта зі зниженням витрат на електропостачання."}
      </div>
      <!-- Плашки "Об'єкт"/"Виконавець" (.meta-grid) прибрано повністю
           (запит Анни, 2026-07-23) — раніше тут стояли дві картки з
           назвою об'єкта й компанією-виконавцем. -->
      <!-- Підпис над фото замість підпису під фото з назвою файлу (запит
           Анни, 2026-07-07): великий заголовок "Розташування панелей на
           об'єкті" без імені файлу зображення. -->
      ${hero ? `<div class="hero-caption-title">Розташування панелей на об'єкті</div><div class="hero-img"><img src="${hero.url}"/></div>` : ""}
      <!-- "Без панелей" (запит Анни, 2026-07-22, див. #in-no-panels в
           index.html/app.js): ховає картки "Панелі" й "Потужність масиву
           фотомодулів" (обидві стосуються генерації), лишаючи тільки
           інвертор + акумулятори — тоді картки на 2 колонки (cols-2,
           той самий клас, що вже є в style.css для fin-page), а не на 4,
           щоб не лишати порожній простір у сітці. m.hasPanels typeof
           перевіряється явно на false, а не просто falsy — старі виклики
           без цього поля (якщо колись з'являться) мають лишати нинішню
           поведінку (з панелями), а не ламатись.
           Картки "Сонячні панелі" (2-га) й "Ємність акумуляторної групи"
           (4-та, запит Анни, 2026-07-23): 2-га картка тепер завжди показує
           статичний підпис "Сонячні панелі" замість назви конкретної
           моделі панелі (число — та сама кількість панелей); 4-та картка
           замінена з "кількість + модель акумулятора" на ємність
           акумуляторної групи в кВт·год — фіксована комірка з файлу-
           розрахунку (L39 на вкладці ПДВ / O40 на вкладці Готівка_ФОП,
           залежно від режиму — див. sheets.js parseAccumulatorCapacityKwh),
           а не з назви позиції в номенклатурі. -->
      <div class="stat-cards${m.hasPanels === false ? " cols-2" : ""}">
        <div class="stat-card"><div class="num">${m.tech.stationCapacityKw ? fmtNum(m.tech.stationCapacityKw, 2) : "—"} кВт</div><div class="lbl">Потужність інверторної групи, ${m.tech.invertersQty || "—"} шт</div></div>
        ${m.hasPanels === false ? "" : `<div class="stat-card"><div class="num">${m.tech.panelsQty || "—"} шт</div><div class="lbl">Сонячні панелі</div></div>
        <!-- Потужність масиву фотомодулів — комірка B3 вкладки "Моделювання
             Фін. показників роботи СЕС" (підпис "Потужність СЕС" у сусідній
             комірці A3). Беремо вже готове значення m.model.capacityKw, яке
             парситься саме з цієї комірки в sheets.js (parseModelSheet) —
             замінює собою картку моделі гібридного інвертора (запит Анни,
             2026-07-07). -->
        <div class="stat-card"><div class="num">${m.model.capacityKw ? fmtNum(m.model.capacityKw, 2) : "—"} кВт</div><div class="lbl">Потужність масиву фотомодулів</div></div>`}
        <div class="stat-card"><div class="num">${m.accumulatorCapacityKwh != null ? fmtNum(m.accumulatorCapacityKwh, 2) : "—"} кВт·год</div><div class="lbl">Ємність акумуляторної групи</div></div>
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
        <p>Пропонуємо будівництво ${esc(stationNameGen(m))}${m.tech.stationCapacityKw ? " потужністю <b>" + fmtNum(m.tech.stationCapacityKw, 2) + " кВт</b>" : ""}${objectClause(m)}. ${m.hasPanels === false
          ? "Рішення забезпечує безперебійне живлення критичних навантажень об'єкта від акумуляторної системи під час перебоїв електропостачання."
          : `Рішення забезпечує генерацію власної електроенергії у денні години, коли зазвичай споживання найактивніше, зі зниженням витрат на електропостачання.${m.tech.hasBattery ? " Станція комплектується акумуляторною батареєю для автономної роботи / резервного живлення." : ""}`}</p>
        ${equipParts.length ? `<p>Основне обладнання: ${equipParts.join(", ")}.</p>` : ""}
        <p>Повний цикл робіт «під ключ»: проєктування, постачання обладнання, монтаж, підключення, пусконалагодження та запуск.</p>
      </div>
      ${hasGenStats ? `
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${m.model.annualGenKwh ? fmtNum(m.model.annualGenKwh) : "—"}</div><div class="lbl">Річна генерація, кВт·год</div></div>
        <div class="stat-card"><div class="num">${m.model.annualGenPerKw ? fmtNum(m.model.annualGenPerKw) : "—"}</div><div class="lbl">Річна генерація 1 кВт, кВт·год</div></div>
        <div class="stat-card"><div class="num">${m.model.gen30y ? fmtNum(m.model.gen30y) : "—"}</div><div class="lbl">Генерація за 30 років, кВт·год</div></div>
      </div>` : ""}
      <!-- "Без панелей" (2026-07-22): графік помісячної генерації ховаємо
           навіть якщо m.model.months технічно не порожній (рядки в файлі
           можуть бути з нульовими значеннями) — без панелей генерації
           нема, графік був би просто порожнім/пласким. -->
      ${(m.hasPanels !== false && m.model.months.length) ? `<div class="chart-wrap"><canvas id="${chartId}"></canvas></div>` : ""}
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
  // Роботи), кожна зі своєю мержованою колонкою підсумку. Позиції груп
  // "Обладнання" й "Роботи" читаються ДИНАМІЧНО з номенклатурної вкладки
  // (ПДВ або варіант "C") — "Обладнання" з категорії "Основне технічне
  // обладнання та система кріплення" (findBudgetEquipItems), "Роботи" з
  // категорії "Послуги МБР, ЕМР, ПНР та інше" (findBudgetWorksItems,
  // додано 2026-07-23 — раніше "Роботи" були фіксованим переліком назв
  // зі стандартного шаблону, кількість завжди 1; тепер, як і "Обладнання",
  // рядок потрапляє в таблицю лише якщо в файлі колонка "К-сть ввести
  // значення" не порожня й більша нуля — той самий фільтр, що вже
  // застосовується до ВСІХ категорій номенклатури на рівні парсера, див.
  // sheets.js parseNomenclatureSheet, виправлення 2026-07-22). "Обладнання"
  // додатково виключає службові нотатки менеджера (див.
  // findBudgetEquipItems() нижче — ВИПРАВЛЕНО 2026-07-22, раніше тут був
  // жорсткий діапазон рядків B3:B10, який відрізав реальні позиції в
  // файлах з більш ніж 8 позиціями обладнання). "Витратні матеріали" —
  // фіксований перелік найменувань зі стандартного шаблону (кількість
  // завжди 1, не з файлу — так попросила Анна; замінюється на 3 реальні
  // підрозділи лише в режимі "Розширений бюджет", див. нижче). Підсумкові
  // суми (Вартість без ПДВ по кожній групі, Разом без ПДВ, Загальна
  // вартість з ПДВ) РАХУЮТЬСЯ з уже розібраних категорій ПДВ-вкладки
  // (sheets.js, parseBudgetCells) — НЕ за фіксованими адресами комірок
  // (той підхід ламався, коли в файлі траплялись зайві/задвоєні рядки —
  // див. докладний коментар над parseBudgetCells у sheets.js).
  const BUDGET_MATERIALS = [
    "PV кабель для підключення фотомодулів, 6мм, Німеччина",
    "Автоматика захисту змінного струму",
    "Кабельно-провідникова продукція + конектори MC4",
    "Автоматика захисту фотоелектричних модулів (постійний струм)",
    "Витратні матеріали",
  ];

  // Розпізнає "службові" рядки-нотатки менеджера в категорії "Обладнання"
  // (напр. "Доставка до нас. Не робимо націнку! Вписати суму доставок по
  // усім позиціям") — не реальна позиція обладнання, не має потрапляти в
  // таблицю бюджету. ВИПРАВЛЕНО (2026-07-22): раніше для цього був
  // жорсткий діапазон рядків B3:B10 (KP_CONFIG.BUDGET_EQUIP_ROW_RANGE) —
  // ламалось, щойно РЕАЛЬНИХ позицій обладнання в файлі було більше 8
  // (нотатка зсувалась на рядок 11+, а фіксований діапазон замість неї
  // відрізав останню справжню позицію — реальний випадок: позиція
  // "Індивідуальне кріплення" $20,000 у рядку 11 зникала з бюджету).
  // Дублює однойменну функцію в sheets.js (окремі файли, спільного
  // модуля тут немає) — тримай в синхроні, якщо міняєш одну з них.
  function isStrayEquipNote(name) {
    const n = String(name || "").toLowerCase();
    return n.includes("не робимо націнку") || n.includes("вписати суму доставок");
  }

  function findBudgetEquipItems(pdv) {
    const cat = pdv.categories.find((c) => {
      const n = c.name.toLowerCase();
      return n.includes("техн") && n.includes("облад");
    });
    if (!cat) return [];
    return cat.items.filter((it) => !isStrayEquipNote(it.name));
  }

  // "Роботи" — додано 2026-07-23 (запит Анни): раніше фіксований
  // хардкод-перелік (BUDGET_WORKS), тепер, як і "Обладнання" вище,
  // читається ДИНАМІЧНО з категорії "3" номенклатурної вкладки (позиційно
  // — рівно через дві категорії після "Обладнання", той самий підхід, що
  // вже застосовується в sheets.js parseBudgetCells для worksCat). Рядки
  // з порожньою/нульовою кількістю тут вже не потрапляють — цей фільтр
  // застосовується для ВСІХ категорій одразу на рівні парсера (див.
  // sheets.js parseNomenclatureSheet, виправлення 2026-07-22), тому
  // додаткової фільтрації тут не потрібно.
  function findBudgetWorksItems(pdv) {
    const equipIdx = pdv.categories.findIndex((c) => {
      const n = c.name.toLowerCase();
      return n.includes("техн") && n.includes("облад");
    });
    const cat = equipIdx >= 0 ? pdv.categories[equipIdx + 2] : null;
    return cat ? cat.items : [];
  }

  // opts.showPrice (додано 2026-07-23, ПЕРЕРОБЛЕНО 2026-07-23 того ж дня
  // після повторного звіту Анни — "білий стовпчик") — за замовчуванням true.
  // Коли підрозділ розрізає між сторінками динамічна пагінація
  // (paginateBudgetSections нижче), кожен ФРАГМЕНТ підрозділу рендериться
  // окремим викликом budgetGroupRows; showPrice:false ставиться на всіх
  // фрагментах, КРІМ першого — так сума ціни підрозділу не дублюється.
  // КРИТИЧНО: сама комірка <td class="budget-price"> (пофарбована в колір
  // групи) рендериться ЗАВЖДИ на першому рядку будь-якого фрагмента,
  // незалежно від showPrice — лише її ВМІСТ (число) залежить від showPrice.
  // Раніше (перша версія фіксу) комірку взагалі не рендерили, коли
  // showPrice=false — а таблиця розбита на кілька <table> по сторінках, тож
  // rowspan не може "дотягнутись" через межу сторінки: рядок без цієї
  // комірки лишався коротшим за решту (3 <td> замість 4), і бракуючий
  // простір браузер малював прозорим/білим — не кольором фону рядка. Це і
  // був "білий стовпчик" на сторінці-продовженні. Тепер комірка з кольором
  // є завжди, порожня чи з числом — тож "дірки" в колонці ціни принципово
  // неможливі, незалежно від того, скільки разів і де саме розрізано
  // підрозділ.
  function budgetGroupRows(items, getName, getQty, priceVal, catLabel, groupClass, opts) {
    if (!items.length) return "";
    opts = opts || {};
    const showPrice = opts.showPrice !== false;
    // Довгі підписи підрозділів (напр. "Автоматика захисту фотоелектричних
    // модулів (постійний струм)" — з'явились разом із "Розширеним
    // бюджетом", 2026-07-18) не влазять в один рядок повернутого на 90°
    // тексту при короткому блоці рядків, як короткі "Обладнання"/"Роботи".
    // Клас "long" вмикає менший шрифт + перенос рядків (див. style.css) —
    // без цього текст просто вилазив би за межі мержованої комірки.
    const catClass = "budget-cat" + (catLabel && catLabel.length > 20 ? " long" : "");
    // opts.separator (запит Анни, 2026-07-19, після першого живого тесту) —
    // додає товщу верхню лінію на першому рядку підрозділу: АС і DC мають
    // однаковий колір фону (обидва grp-mat), тож без цього кордону межа між
    // ними візуально губилась. Реалізовано як клас на <tr>, а не властивість
    // .budget-cat — так лінія проходить через ВСІ комірки рядка (назва,
    // кількість, і саму мержовану комірку категорії/ціни), суцільною через
    // всю ширину таблиці.
    return items.map((it, i) => {
      const name = getName(it);
      const qty = getQty(it);
      const first = i === 0;
      const rowClass = groupClass + (first && opts.separator ? " grp-sep" : "");
      return `<tr class="${rowClass}">
        ${first ? `<td class="${catClass}" rowspan="${items.length}"><span>${esc(catLabel)}</span></td>` : ""}
        <td contenteditable="true">${esc(name)}</td>
        <td class="num" contenteditable="true">${qty == null ? "—" : fmtNum(qty)}</td>
        ${first ? `<td class="num budget-price" rowspan="${items.length}">${showPrice ? `<span contenteditable="true">${fmtUsd(priceVal)}</span>` : ""}</td>` : ""}
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
  // Кількість тепер реальна (запит Анни, 2026-07-19): collectKoshtorysItems
  // у sheets.js повертає {name, qty} замість голого рядка (qty — колонка
  // "Кіл-сть" вкладки Кошторис), тому й тут беремо поле, а не завжди "—".
  function budgetDetailNames(it) { return it.name; }
  function budgetDetailQty(it) { return it.qty; }

  function budgetDetailSubsections(m) {
    const detail = m.budgetDetail;
    if (!detail) return null;
    return [
      { items: detail.ac && detail.ac.items, price: detail.ac && detail.ac.price, label: "Автоматика захисту змінного струму" },
      { items: detail.dc && detail.dc.items, price: detail.dc && detail.dc.price, label: "Автоматика захисту фотоелектричних модулів (постійний струм)" },
      { items: detail.cable && detail.cable.items, price: detail.cable && detail.cable.price, label: "Кабельно-провідникова продукція + конектори МС4" },
    ];
  }

  // Винесено окремо (2026-07-23, разом з динамічною пагінацією нижче) —
  // потрібен і тут (справжній рендер таблиці), і в measureAvailableHeight()
  // нижче (вимірювання "скільки місця лишається під рядки" на порожній
  // таблиці з тим самим заголовком).
  function budgetTheadHtml(priceHeader) {
    return `<tr>
        <th colspan="2">Найменування</th>
        <th class="num">Кількість</th>
        <th class="num">${priceHeader}</th>
      </tr>`;
  }

  function budgetTable(bodyHtml, priceHeader, tfootHtml) {
    return `<table class="budget-table">
      <thead>${budgetTheadHtml(priceHeader)}</thead>
      <tbody>${bodyHtml}</tbody>
      ${tfootHtml ? `<tfoot>${tfootHtml}</tfoot>` : ""}
    </table>`;
  }

  // opts.detail (запит Анни, 2026-07-19) — у режимі "Розширений бюджет"
  // додає 4-ту примітку праворуч від таблиці: комплектуючі підбираються з
  // конкретної вкладки Кошторис на момент розрахунку, і якщо саме цієї
  // позиції вже нема в наявності, менеджер замінює її аналогом — тому
  // список підрядку може відрізнятись від фінальної поставки. У звичайному
  // (не розширеному) режимі ця примітка не показується — там і так немає
  // детального переліку комплектуючих, який вона пояснює.
  function budgetNotesAside(opts) {
    opts = opts || {};
    return `<aside class="budget-notes">
      <div class="note"><span class="chk">✓</span><div><b>Остаточна вартість</b> проєкту затверджується після узгодження технічних рішень</div></div>
      <div class="note"><span class="chk">✓</span><div><b>Оплата</b> здійснюється в національній валюті за комерційним курсом на дату виконання платежу</div></div>
      <div class="note"><span class="chk">✓</span><div>Пропозиція дійсна протягом <b>3 днів</b></div></div>
      ${opts.detail ? `<div class="note"><span class="chk">✓</span><div>У разі відсутності позиції підбирається аналог</div></div>` : ""}
    </aside>`;
  }

  // ---------- Динамічна пагінація бюджету (переписано 2026-07-23) ----------
  // РАНІШЕ (2026-07-18/19) тут було ЖОРСТКО зашито рівно 2 сторінки:
  // 1-ша — Обладнання+AC+DC (2-колоночний .budget-layout з примітками
  // праворуч), 2-га — Кабельно-провідникова продукція+Роботи+підсумки (на
  // всю ширину). Розрахунок "скільки рядків влазить" був ЛЮДСЬКОЮ ОЦІНКОЮ
  // за попереднім тестовим файлом (~15 рядків на 1-й сторінці, ~18-20 на
  // 2-й) — і на реальному робочому файлі Анни (2026-07-23) ця оцінка
  // виявилась замалою: 2-га сторінка знову не вмістила Кабельну продукцію+
  // Роботи+підсумки повністю (частина знову обрізалась/зникала, той самий
  // клас багу, що й раніше). Замість того щоб знову підбирати числа "на
  // око" під ЦЕЙ конкретний файл (і знову зламатись на наступному, довшому
  // файлі), пагінація тепер рахується ДИНАМІЧНО — реальним вимірюванням
  // висоти в живому DOM (сторінки й так рендеряться в браузері, а не лише
  // в PDF-скріншот, тож можна дозволити собі один додатковий прохід
  // "виміряти, потім намалювати"):
  //   1) measureAvailableHeight() рендерить ПОРОЖНЮ сторінку (з реальним
  //      заголовком+назвою) у прихований (visibility:hidden,
  //      position:absolute; left:-99999px) вузол поза екраном і читає
  //      clientHeight області, що відводиться під таблицю (той самий
  //      flex:1-розтягнутий контейнер, що й у справжньому рендері) —
  //      окремо для 1-ї сторінки (2-колоночний layout+примітки) і для
  //      сторінок-продовжень (на всю ширину).
  //   2) measureRowsHtml()/measureTfootHtml() рендерять КОНКРЕТНИЙ HTML
  //      рядків (ту саму розмітку, що піде у фінальний документ, з
  //      правильною шириною колонок) і читають природну (не розтягнуту)
  //      висоту таблиці — так дізнаємось, скільки саме пікселів займе
  //      будь-який набір рядків.
  //   3) paginateBudgetSections() жадібно заповнює сторінки: бере
  //      підрозділи по черзі (Обладнання → AC/DC/Кабельна+Роботи або
  //      Матеріали+Роботи), і для кожного домірує, скільки позицій
  //      влазить у залишок місця на поточній сторінці; якщо підрозділ не
  //      влазить цілком — розрізає ЙОГО (не між підрозділами, а
  //      всередині, якщо треба) і переносить лишок на нову сторінку
  //      (з новою мержованою коміркою назви підрозділу, з припискою
  //      "(продовження)" для наочності). Підсумки (totalsHtml) теж
  //      перевіряються на "чи влазять" — якщо ні, отримують окрему
  //      сторінку. Кількість сторінок-продовжень тепер НЕ обмежена
  //      двома — стільки, скільки реально потрібно під конкретний файл.
  // Загальна нумерація наступних сторінок (04 PvSyst, 05 сезонні графіки)
  // як і раніше НЕ зсувається — сторінки-продовження бюджету навмисно без
  // власного номера, як і сторінки "Гарантія"/"Менеджер" наприкінці
  // документа.
  function getMeasureHost() {
    const host = document.createElement("div");
    host.style.position = "absolute";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.visibility = "hidden";
    host.style.pointerEvents = "none";
    document.body.appendChild(host);
    return host;
  }

  function getPageContentWidth() {
    const cs = getComputedStyle(document.documentElement);
    const pageW = parseFloat(cs.getPropertyValue("--page-w")) || 1123;
    const pagePad = parseFloat(cs.getPropertyValue("--page-pad")) || 46;
    return pageW - pagePad * 2;
  }

  // Природна (нерозтягнута) висота набору <tr> — вимірюється через
  // style="height:auto" на самій таблиці, що перекриває CSS-правило
  // ".budget-table-wrap table.budget-table{height:100%}" (inline-стиль має
  // вищий пріоритет за клас) — інакше таблиця завжди повертала б повну
  // висоту сторінки незалежно від кількості рядків.
  function measureRowsHtml(rowsHtml, wide, host) {
    const width = getPageContentWidth();
    const markup = wide
      ? `<div style="width:${width}px"><table class="budget-table" style="height:auto"><tbody>${rowsHtml}</tbody></table></div>`
      : `<div class="budget-layout" style="width:${width}px;height:auto"><table class="budget-table" style="height:auto"><tbody>${rowsHtml}</tbody></table><aside class="budget-notes"></aside></div>`;
    host.innerHTML = markup;
    return host.querySelector("table.budget-table").offsetHeight;
  }

  function measureTfootHtml(tfootHtml, wide, host) {
    const width = getPageContentWidth();
    const markup = wide
      ? `<div style="width:${width}px"><table class="budget-table" style="height:auto"><tfoot>${tfootHtml}</tfoot></table></div>`
      : `<div class="budget-layout" style="width:${width}px;height:auto"><table class="budget-table" style="height:auto"><tfoot>${tfootHtml}</tfoot></table><aside class="budget-notes"></aside></div>`;
    host.innerHTML = markup;
    return host.querySelector("table.budget-table").offsetHeight;
  }

  // Реальна доступна висота під таблицю на сторінці бюджету — рендеримо
  // справжню структуру сторінки (заголовок+назва+обгортка) БЕЗ height:auto
  // перекриття, щоб .budget-layout/.budget-table-wrap природно розтягнулись
  // через flex:1 (той самий механізм, що й у справжньому документі) і
  // читаємо їхню clientHeight — це і є "скільки місця під рядки лишається".
  function measureAvailableHeight(m, wide, priceHeader, host) {
    const headerHtml = pageHeader(m.meta);
    const titleHtml = wide
      ? `<div class="section-title">Бюджет реалізації (продовження)</div>`
      : `<div class="section-title"><span class="num-badge">03</span> Бюджет реалізації</div>`;
    const theadHtml = `<thead>${budgetTheadHtml(priceHeader)}</thead>`;
    const bodyHtml = wide
      ? `<div class="budget-table-wrap"><table class="budget-table">${theadHtml}<tbody></tbody></table></div>`
      : `<div class="budget-layout"><table class="budget-table">${theadHtml}<tbody></tbody></table>${budgetNotesAside({ detail: true })}</div>`;
    host.innerHTML = `<section class="kp-page budget-page">${headerHtml}${titleHtml}${bodyHtml}</section>`;
    const wrap = host.querySelector(wide ? ".budget-table-wrap" : ".budget-layout");
    return wrap.clientHeight;
  }

  // Найбільша к-сть позицій із початку items, чий рендер (buildHtmlFn)
  // влазить у freeHeight пікселів. buildHtmlFn(subset, isFinalSubset) сам
  // вирішує, чи показувати ціну підрозділу (isFinalSubset — це справді
  // остання позиція ВСЬОГО підрозділу, а не лише цього фрагмента).
  function fitItemsToHeight(items, buildHtmlFn, freeHeight, wide, host) {
    let best = { k: 0, html: "", height: 0 };
    if (freeHeight <= 0) return best;
    for (let k = 1; k <= items.length; k++) {
      const isFinal = k === items.length;
      const html = buildHtmlFn(items.slice(0, k), isFinal);
      const height = measureRowsHtml(html, wide, host);
      if (height <= freeHeight) {
        best = { k, html, height };
      } else {
        break;
      }
    }
    return best;
  }

  function buildBudgetSections(m, b) {
    const equip = findBudgetEquipItems(m.pdv);
    const equipRows = equip.length ? equip : [{ name: "—", qty: null }];
    const works = findBudgetWorksItems(m.pdv);
    const worksRows = works.length ? works : [{ name: "—", qty: null }];
    const sub = budgetDetailSubsections(m);

    const sections = [
      { items: equipRows, nameFn: (it) => it.name, qtyFn: (it) => it.qty, price: b.equipmentCost, label: "Обладнання", groupClass: "grp-equip", separator: false },
    ];
    if (sub) {
      const acItems = sub[0].items && sub[0].items.length ? sub[0].items : [{ name: "—", qty: null }];
      const dcItems = sub[1].items && sub[1].items.length ? sub[1].items : [{ name: "—", qty: null }];
      const cableItems = sub[2].items && sub[2].items.length ? sub[2].items : [{ name: "—", qty: null }];
      sections.push({ items: acItems, nameFn: budgetDetailNames, qtyFn: budgetDetailQty, price: sub[0].price, label: sub[0].label, groupClass: "grp-mat", separator: true });
      sections.push({ items: dcItems, nameFn: budgetDetailNames, qtyFn: budgetDetailQty, price: sub[1].price, label: sub[1].label, groupClass: "grp-mat", separator: true });
      // ВИПРАВЛЕНО (2026-07-23, запит Анни): раніше тут стояло separator:
      // false — межа DC/Кабельна лишалась без лінії, хоча обидва
      // підрозділи мають однаковий фон (grp-mat), і межа між ними так само
      // губилась, як колись губилась межа AC/DC (див. коментар над
      // budgetGroupRows). Тепер лінія є на КОЖНІЙ межі підрозділів.
      sections.push({ items: cableItems, nameFn: budgetDetailNames, qtyFn: budgetDetailQty, price: sub[2].price, label: sub[2].label, groupClass: "grp-mat", separator: true });
      sections.push({ items: worksRows, nameFn: (it) => it.name, qtyFn: (it) => it.qty, price: b.worksCost, label: "Роботи", groupClass: "grp-works", separator: true });
    } else {
      sections.push({ items: BUDGET_MATERIALS.map((n) => ({ name: n, qty: 1 })), nameFn: (it) => it.name, qtyFn: (it) => it.qty, price: b.materialsCost, label: "Витратні матеріали", groupClass: "grp-mat", separator: false });
      sections.push({ items: worksRows, nameFn: (it) => it.name, qtyFn: (it) => it.qty, price: b.worksCost, label: "Роботи", groupClass: "grp-works", separator: false });
    }
    return sections;
  }

  function paginateBudgetSections(m, sections, priceHeader, totalsHtml) {
    const host = getMeasureHost();
    try {
      const availNarrow = measureAvailableHeight(m, false, priceHeader, host);
      const availWide = measureAvailableHeight(m, true, priceHeader, host);

      const pages = [{ wide: false, rowsHtml: "", usedHeight: 0, availableHeight: availNarrow }];
      const currentPage = () => pages[pages.length - 1];
      const startNewPage = () => { pages.push({ wide: true, rowsHtml: "", usedHeight: 0, availableHeight: availWide }); };

      sections.forEach((section) => {
        let remaining = section.items.slice();
        let isFirstFragment = true;
        let guard = 0;
        while (remaining.length && guard++ < 60) {
          const page = currentPage();
          const freeHeight = page.availableHeight - page.usedHeight;
          const fit = fitItemsToHeight(
            remaining,
            // ВИПРАВЛЕНО (2026-07-23, повторний звіт Анни): ціну показували
            // лише на ОСТАННЬОМУ фрагменті підрозділу (isFinal), щоб не
            // дублювати суму, якщо підрозділ розрізає між сторінками. На
            // практиці це давало "порожню білу колонку" саме там, де читач
            // найбільше очікує побачити ціну — біля перших позицій
            // підрозділу, а сама ціна "спливала" лише на одній з наступних
            // сторінок, далеко від переліку. Тепер ціна показується на
            // ПЕРШОМУ фрагменті (isFirstFragment) — одразу видно вартість
            // підрозділу, де б його не розрізало; жодного дублювання це не
            // створює (кожен підрозділ фрагментується на кілька <tr>, але
            // ціна — це один мержований <td> з rowspan, що належить рівно
            // одному фрагменту).
            (subset) => budgetGroupRows(
              subset, section.nameFn, section.qtyFn,
              isFirstFragment ? section.price : null,
              section.label + (isFirstFragment ? "" : " (продовження)"),
              section.groupClass,
              { separator: section.separator && isFirstFragment, showPrice: isFirstFragment }
            ),
            freeHeight, page.wide, host
          );
          if (fit.k === 0) {
            // Нічого не влазить у залишок поточної сторінки. Якщо сторінка
            // взагалі порожня (usedHeight===0) і навіть ОДНА позиція не
            // влазить у ЦІЛУ сторінку — це вже патологічний випадок
            // (абсурдно довга назва), приймаємо перевищення для 1 позиції,
            // щоб не зациклитись на порожніх сторінках.
            if (page.usedHeight === 0) {
              const forcedHtml = budgetGroupRows(
                remaining.slice(0, 1), section.nameFn, section.qtyFn,
                isFirstFragment ? section.price : null,
                section.label + (isFirstFragment ? "" : " (продовження)"),
                section.groupClass,
                { separator: section.separator && isFirstFragment, showPrice: isFirstFragment }
              );
              page.rowsHtml += forcedHtml;
              page.usedHeight += measureRowsHtml(forcedHtml, page.wide, host);
              remaining = remaining.slice(1);
              isFirstFragment = false;
              if (remaining.length) startNewPage();
              continue;
            }
            startNewPage();
            continue;
          }
          page.rowsHtml += fit.html;
          page.usedHeight += fit.height;
          remaining = remaining.slice(fit.k);
          isFirstFragment = false;
          if (remaining.length) startNewPage();
        }
      });

      let page = currentPage();
      const freeHeight = page.availableHeight - page.usedHeight;
      const totalsHeight = measureTfootHtml(totalsHtml, page.wide, host);
      if (totalsHeight > freeHeight) {
        startNewPage();
        page = currentPage();
      }
      page.totalsHtml = totalsHtml;

      return pages.map((p) => {
        if (!p.wide) {
          return `
          <section class="kp-page budget-page">
            ${pageHeader(m.meta)}
            <div class="section-title"><span class="num-badge">03</span> Бюджет реалізації</div>
            <div class="budget-layout">
              ${budgetTable(p.rowsHtml, priceHeader, p.totalsHtml || null)}
              ${budgetNotesAside({ detail: true })}
            </div>
          </section>`;
        }
        return `
        <section class="kp-page budget-page">
          ${pageHeader(m.meta)}
          <div class="section-title">Бюджет реалізації (продовження)</div>
          <div class="budget-table-wrap">
            ${budgetTable(p.rowsHtml, priceHeader, p.totalsHtml || null)}
          </div>
        </section>`;
      }).join("");
    } finally {
      host.remove();
    }
  }

  function pageBudget(m) {
    const b = m.budget || {};
    // Режим "C" (без ПДВ, запит Анни 2026-07-18) — не показуємо ані рядок
    // податку, ані слово "ПДВ" в підписах підсумку/шапки таблиці взагалі.
    const noVat = m.clientMode === "cash";
    const priceHeader = noVat ? "Вартість, $" : "Вартість<br/>без ПДВ, $";
    // Підписи підсумків (запит Анни, 2026-07-19): раніше `colspan="3"`
    // об'єднував і мержовану колонку категорії (де, наприклад, і так уже
    // стоїть вертикальна назва останнього підрозділу над цим рядком), тому
    // текст-центрувався по всій ширині трьох колонок — виглядало як
    // "у повітрі", не під колонкою назв. Тепер — окрема порожня `<td>` для
    // колонки категорії (та сама ширина, що й у решти рядків, просто без
    // тексту — рядок підсумку сам собою не належить жодному підрозділу) +
    // `colspan="2"` лише на назву/кількість з `text-align:left` (клас
    // "sum-label", див. style.css) — тепер підпис починається точно під
    // колонкою "Найменування", як і просила Анна.
    const totalsHtml = noVat
      ? `<tr class="sum grand"><td></td><td colspan="2" class="sum-label">Загальна вартість:</td><td class="num" contenteditable="true">${fmtUsd(b.nettoTotal)}</td></tr>`
      : `<tr class="sum"><td></td><td colspan="2" class="sum-label">Разом без ПДВ:</td><td class="num" contenteditable="true">${fmtUsd(b.nettoTotal)}</td></tr>
            <tr class="sum"><td></td><td colspan="2" class="sum-label">ПДВ</td><td class="num" contenteditable="true">${fmtUsd(b.vat)}</td></tr>
            <tr class="sum grand"><td></td><td colspan="2" class="sum-label">Загальна вартість з ПДВ:</td><td class="num" contenteditable="true">${fmtUsd(b.grossTotal)}</td></tr>`;

    const sections = buildBudgetSections(m, b);
    return paginateBudgetSections(m, sections, priceHeader, totalsHtml);
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
  // Внутрішня розмітка таблиці винесена в окрему функцію (запит Анни,
  // 2026-07-19, разом з форматом "Документ") — та сама таблиця 1:1
  // переюзається і на слайді (pageWarranty нижче), і в docSectionWarranty()
  // (renderDocument), щоб не дублювати розмітку/дані в двох місцях.
  function warrantyTableHtml() {
    return `<table class="warranty-table">
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
    </table>`;
  }

  function pageWarranty(m) {
    return `
    <section class="kp-page warranty-page">
      <img class="logo" src="data:image/png;base64,${ESCORE_LOGO_B64}" alt="escore" />
      <div class="warranty-banner">Гарантійний термін та термін використання</div>
      <div class="warranty-table-wrap">
        ${warrantyTableHtml()}
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
    let isHybrid = false, inverterKwTotal = 0;
    // batteryMatches (запит Анни, 2026-07-20, другий баг того ж дня): усі
    // позиції, назва яких згадує акумулятор/АКБ/батарею, збираються сюди
    // замість того, щоб одразу перезаписувати batteryModel/сумувати
    // batteryQty по ходу циклу (як було раніше). Причина: розширення
    // регулярки для акб трохи вище (той самий день, попередній фікс) почало
    // заодно ловити аксесуари, які лише ЗГАДУЮТЬ АКБ у дужках — напр. "Шафа
    // 3U-H-RACK (12 АКБ)" (стійка ПІД акумулятори, сама акумулятором не є) —
    // і якщо такий рядок траплявся в Кошторисі ПІСЛЯ реальної позиції "АКБ
    // Deye BOS-G PRO...", він мовчки перезаписував і назву, і сумарну
    // кількість (стара логіка додавала qty кожного збігу до однієї
    // спільної суми) — картка "Акумулятор" показувала назву й кількість
    // шафи замість самого акумулятора. Див. sectionHasData нижче.
    const batteryMatches = [];
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
        // Було: /акумулятор|акб\b|batter/ — \b (межа слова) у JS визначається
        // лише через ASCII-літери ([A-Za-z0-9_]), тому вона НІКОЛИ не
        // спрацьовує навколо кириличного тексту: "акб" в кінці рядка/перед
        // пробілом не вважається "межею", і ця альтернатива мовчки ніколи не
        // матчилась. Якщо позиція в Кошторисі названа просто "АКБ ..." (без
        // слова "акумулятор"), станція розпізнавалась як мережева, хоча
        // акумулятор фактично був — саме цей баг помітила Анна 2026-07-20
        // ("Тип станції" показав "мережева" при гібридному інверторі + АКБ).
        // Фікс: (?<![а-яіїєґ])...(?![а-яіїєґ]) — власна, кирилично-свідома
        // межа слова замість \b. Також додано корінь "батаре" (батарея) —
        // ще одне поширене позначення, яке раніше взагалі не розпізнавалось.
        if (/акумулятор|батаре|(?<![а-яіїєґ])акб(?![а-яіїєґ])|batter/.test(n)) {
          // isPrimary — назва позиції ПОЧИНАЄТЬСЯ з ключового слова (сам
          // акумулятор є "головним" предметом рядка), на відміну від
          // аксесуара, де слово лише десь ЗГАДУЄТЬСЯ в описі (типовий
          // приклад — "Шафа 3U-H-RACK (12 АКБ)", починається з "шафа").
          const isPrimary = /^(акумулятор|батаре|акб|batter)/.test(n);
          batteryMatches.push({ name: it.name, qty: it.qty, isPrimary });
        }
        if (it.qty > 0) {
          specItems.push({ label: it.name, value: `${it.qty} шт` });
        }
      });
    });
    const hasBattery = batteryMatches.length > 0;
    let batteryModel = null, batteryQty = 0;
    if (hasBattery) {
      // Пріоритет — перший "первинний" збіг (isPrimary); якщо жодного
      // немає (усі знайдені рядки — лише згадки в описі аксесуарів),
      // повертаємось до старої поведінки — перший будь-який збіг. Кількість
      // і назва беруться ЛИШЕ з цього одного обраного рядка — більше НЕ
      // сумуються по всіх збігах одразу (сума "аксесуар + сам акумулятор"
      // не мала жодного сенсу — саме це й спричиняло баг вище).
      const chosen = batteryMatches.find((m) => m.isPrimary) || batteryMatches[0];
      batteryModel = chosen.name;
      batteryQty = chosen.qty;
    }
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
  // "Без панелей" (запит Анни, 2026-07-22, терміново): без сонячних панелей
  // це вже не "сонячна електростанція" (гібридна/мережева), а система
  // резервного живлення на акумуляторах — тому назва станції по всьому
  // документу підміняється на "Джерело безперебійного живлення". Два
  // відмінки (називний і родовий) — бо фраза вживається в різних
  // граматичних контекстах ("Джерело..." як заголовок і "будівництво
  // джерела..." в тексті). m.hasPanels === false перевіряється явно
  // (не просто falsy), щоб виклики без цього поля не ламались.
  function stationNameNom(m) {
    return m.hasPanels === false ? "Джерело безперебійного живлення" : `${cap(m.tech.stationType)} сонячна електростанція`;
  }
  function stationNameGen(m) {
    return m.hasPanels === false ? "джерела безперебійного живлення" : `${m.tech.stationTypeGen} сонячної електростанції`;
  }

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

  // ---------- "Документ" (запит Анни, 2026-07-19) — другий формат виводу:
  // компактний портретний документ (лого+назва компанії, коротка преамбула,
  // решта даних — таблицями), замість "слайдів". Читає ТОЙ САМИЙ model, що
  // й render()/pageXxx() вище — жодного нового парсингу не потрібно, і всі
  // "розвилки" презентації (ПДВ/C, Розширений бюджет, опційні PvSyst/
  // сезонні дані) працюють ідентично, бо це одні й ті самі поля model.
  // Друкується НАТИВНИМ window.print() (див. app.js), НЕ html2canvas+jsPDF
  // — детальний план і обґрунтування: пам'ять kp_generator_document_mode_plan.
  function docTable(headCells, bodyHtml, tfootHtml) {
    return `<table class="doc-table">
      <thead><tr>${headCells.map((h) => `<th${h.num ? ' class="num"' : ""}>${esc(h.label)}</th>`).join("")}</tr></thead>
      <tbody>${bodyHtml}</tbody>
      ${tfootHtml ? `<tfoot>${tfootHtml}</tfoot>` : ""}
    </table>`;
  }

  // Проста 2-колонкова таблиця "показник — значення" для технічних/
  // фінансових показників (rows: [[підпис, значення-як-текст], ...]) —
  // рядки з порожнім/null значенням автоматично пропускаються (той самий
  // "не показуємо, якщо нема даних" підхід, що й у stat-card'ах на слайдах).
  function docKvTable(rows) {
    const body = rows
      .filter((r) => r[1] != null && r[1] !== "")
      .map((r) => `<tr><td>${esc(r[0])}</td><td class="num">${r[1]}</td></tr>`)
      .join("");
    if (!body) return "";
    return `<table class="doc-table doc-kv"><tbody>${body}</tbody></table>`;
  }

  // opts.avoidBreak (запит Анни, 2026-07-19): короткі секції — де таблиця
  // не така довга, щоб МУСИЛА розбиватись на кілька сторінок при друку —
  // отримують клас "doc-section-avoid-break" (page-break-inside:avoid у
  // style.css), щоб браузер не розривав їх посередині, залишаючи заголовок
  // на одній сторінці, а рядки таблиці на наступній. Навмисно НЕ
  // застосовується до "Бюджет реалізації" — та таблиця може бути довгою
  // (особливо з увімкненим Розширеним бюджетом), і примусова заборона
  // розриву там або не спрацює (таблиця однаково довша за сторінку), або
  // залишить велику порожню зону внизу попередньої сторінки — для неї й
  // так є власний, точковий page-break-inside:avoid на кожному <tr>
  // (table.doc-table tr{...} у style.css), який дозволяє розбивати МІЖ
  // рядками, просто не посередині одного рядка.
  function docSection(title, innerHtml, opts) {
    if (!innerHtml) return "";
    opts = opts || {};
    const cls = "doc-section" + (opts.avoidBreak ? " doc-section-avoid-break" : "");
    return `<div class="${cls}"><h2>${esc(title)}</h2>${innerHtml}</div>`;
  }

  function docHeader(m) {
    return `<div class="doc-header">
      <div>
        <img class="logo" src="data:image/png;base64,${ESCORE_LOGO_B64}" alt="escore" />
        <div class="doc-company">${esc(m.meta.company.name)}</div>
      </div>
      <div class="doc-meta">
        <strong>КОМЕРЦІЙНА ПРОПОЗИЦІЯ</strong><br/>
        № ${esc(m.meta.kpNumber)} · від ${esc(m.meta.kpDateStr)}<br/>
        Дійсна ${esc(m.meta.validDays)} календарних днів
      </div>
    </div>`;
  }

  function docTitle(m) {
    // "Без панелей" (2026-07-22, третє термінове уточнення того ж дня):
    // формат "Документ" мав свою окрему копію цього заголовка, яку перший
    // прохід (для формату "Презентація") не зачепив — той самий
    // stationNameNom(m) helper, що вже використовується на обкладинці
    // слайд-формату.
    return `<div class="doc-title">${esc(stationNameNom(m))}${objectLabel(m)}${m.tech.stationCapacityKw ? " — " + fmtNum(m.tech.stationCapacityKw, 2) + " кВт" : ""}</div>`;
  }

  // Той самий текст-абзац, що й на слайді "Про проект" (pageAbout вище) —
  // не дублюємо копірайтинг, переюзаємо ту саму логіку побудови речення з
  // m.tech (сама оновлюється під кожен файл-розрахунок).
  function docPreamble(m) {
    const equipParts = [];
    if (m.tech.panelModel) equipParts.push(`сонячні панелі <b>${esc(stripEquipPrefix(m.tech.panelModel))}</b>${m.tech.panelsQty ? ` (${m.tech.panelsQty} шт)` : ""}`);
    if (m.tech.inverterModel) equipParts.push(`<b>${esc(m.tech.inverterModel)}</b>${m.tech.invertersQty ? ` (${m.tech.invertersQty} шт)` : ""}`);
    if (m.tech.hasBattery && m.tech.batteryModel) equipParts.push(`<b>${esc(m.tech.batteryModel)}</b>${m.tech.batteryQty ? ` (${m.tech.batteryQty} шт)` : ""}`);
    return `<div class="doc-preamble">
      <p>Пропонуємо будівництво ${esc(stationNameGen(m))}${m.tech.stationCapacityKw ? " потужністю <b>" + fmtNum(m.tech.stationCapacityKw, 2) + " кВт</b>" : ""}${objectClause(m)}. ${m.hasPanels === false
        ? "Рішення забезпечує безперебійне живлення критичних навантажень об'єкта від акумуляторної системи під час перебоїв електропостачання."
        : `Рішення забезпечує генерацію власної електроенергії у денні години, коли зазвичай споживання найактивніше, зі зниженням витрат на електропостачання.${m.tech.hasBattery ? " Станція комплектується акумуляторною батареєю для автономної роботи / резервного живлення." : ""}`}</p>
      ${equipParts.length ? `<p>Основне обладнання: ${equipParts.join(", ")}.</p>` : ""}
      <p>Повний цикл робіт «під ключ»: проєктування, постачання обладнання, монтаж, підключення, пусконалагодження та запуск.</p>
    </div>`;
  }

  function docTechTable(m) {
    // Було: `m.tech.hasBattery ? "гібридна" : "мережева"` — окремий,
    // локальний перерахунок типу станції, що ігнорував isHybrid (ознаку
    // "гібридний" у НАЗВІ інвертора, buildTechSpec) і не використовував уже
    // готове m.tech.stationType (яке коректно об'єднує isHybrid || hasBattery,
    // buildTechSpec вище). Через це ця сторінка могла розійтись з рештою
    // документа (hero/обкладинка/преамбула — усі беруть m.tech.stationType) —
    // напр. якщо назва інвертора містить "гібрид", а окрема позиція АКБ з
    // якоїсь причини не розпізналась, тут все одно вийшла б "мережева", хоча
    // на інших сторінках уже стояло "гібридна". Фікс: одне джерело істини —
    // m.tech.stationType, як і скрізь інде в цьому файлі.
    return docKvTable([
      ["Тип станції", m.tech.stationType],
      ["Потужність інверторної групи", m.tech.stationCapacityKw ? fmtNum(m.tech.stationCapacityKw, 2) + " кВт" : null],
      ["Інвертор", m.tech.inverterModel ? esc(m.tech.inverterModel) + (m.tech.invertersQty ? ` — ${m.tech.invertersQty} шт` : "") : null],
      ["Сонячні панелі", m.tech.panelModel ? esc(stripEquipPrefix(m.tech.panelModel)) + (m.tech.panelsQty ? ` — ${m.tech.panelsQty} шт` : "") : null],
      ["Потужність масиву фотомодулів", m.model.capacityKw ? fmtNum(m.model.capacityKw, 2) + " кВт" : null],
      ["Акумулятор", m.tech.hasBattery && m.tech.batteryModel ? esc(m.tech.batteryModel) + (m.tech.batteryQty ? ` — ${m.tech.batteryQty} шт` : "") : null],
      ["Річна генерація", m.model.annualGenKwh ? fmtNum(m.model.annualGenKwh) + " кВт·год" : null],
      ["Річна генерація на 1 кВт", m.model.annualGenPerKw ? fmtNum(m.model.annualGenPerKw) + " кВт·год" : null],
      ["Генерація за 30 років", m.model.gen30y ? fmtNum(m.model.gen30y) + " кВт·год" : null],
    ]);
  }

  function docFinTable(m) {
    return docKvTable([
      ["Річна економія (100% споживання)", m.model.annualSavings100 != null ? fmtUsd(m.model.annualSavings100) : null],
      ["Строк окупності при діючому тарифі", m.model.paybackAtTariff != null ? fmtNum(m.model.paybackAtTariff, 2) + " року" : null],
      ["Загальний економічний ефект за 30 років", m.model.totalEffect30y != null ? fmtUsd(m.model.totalEffect30y) : null],
      ["LCOE30 (собівартість 1 кВт·год)", m.model.lcoe30Uah != null ? fmtNum(m.model.lcoe30Uah, 2) + " грн/кВт·год" : null],
    ]);
  }

  // Бюджет — та сама логіка/дані, що й pageBudget() вище (findBudgetEquipItems,
  // findBudgetWorksItems, budgetDetailSubsections/BUDGET_MATERIALS,
  // Розширений бюджет теж працює тут ідентично), просто БЕЗ повернутих на
  // 90° підписів категорій — у документа немає обмеження ширини "слайду",
  // тому категорія — звичайний виділений рядок-заголовок над своїми
  // позиціями. Це заразом прибирає весь клас "обрізаної літери" багів,
  // задокументованих для .budget-cat у kp_generator_status — тут цей
  // підхід просто не потрібен.
  function docBudgetTable(m) {
    const equip = findBudgetEquipItems(m.pdv);
    const equipRows = equip.length ? equip : [{ name: "—", qty: null }];
    const works = findBudgetWorksItems(m.pdv);
    const worksRows = works.length ? works : [{ name: "—", qty: null }];
    const b = m.budget || {};
    const noVat = m.clientMode === "cash";
    const priceHeader = noVat ? "Вартість, $" : "Вартість без ПДВ, $";

    const catRow = (label, price) =>
      `<tr class="doc-cat-row"><td colspan="2">${esc(label)}</td><td class="num">${fmtUsd(price)}</td></tr>`;
    const itemRows = (items, getName, getQty) =>
      items.map((it) => {
        const q = getQty(it);
        return `<tr><td>${esc(getName(it))}</td><td class="num">${q == null ? "—" : fmtNum(q)}</td><td></td></tr>`;
      }).join("");

    let body = catRow("Обладнання", b.equipmentCost) + itemRows(equipRows, (it) => it.name, (it) => it.qty);

    const sub = budgetDetailSubsections(m);
    if (sub) {
      sub.forEach((s) => {
        const items = s.items && s.items.length ? s.items : [{ name: "—", qty: null }];
        body += catRow(s.label, s.price) + itemRows(items, budgetDetailNames, budgetDetailQty);
      });
    } else {
      body += catRow("Витратні матеріали", b.materialsCost) + itemRows(BUDGET_MATERIALS.map((n) => ({ name: n, qty: 1 })), (it) => it.name, (it) => it.qty);
    }
    body += catRow("Роботи", b.worksCost) + itemRows(worksRows, (it) => it.name, (it) => it.qty);

    const totalsHtml = noVat
      ? `<tr class="grand"><td colspan="2">Загальна вартість:</td><td class="num">${fmtUsd(b.nettoTotal)}</td></tr>`
      : `<tr><td colspan="2">Разом без ПДВ:</td><td class="num">${fmtUsd(b.nettoTotal)}</td></tr>
         <tr><td colspan="2">ПДВ</td><td class="num">${fmtUsd(b.vat)}</td></tr>
         <tr class="grand"><td colspan="2">Загальна вартість з ПДВ:</td><td class="num">${fmtUsd(b.grossTotal)}</td></tr>`;

    return docTable(
      [{ label: "Найменування" }, { label: "Кількість", num: true }, { label: priceHeader, num: true }],
      body,
      totalsHtml
    );
  }

  function docPvsystBlock(m) {
    if (!m.pvsystImage) return "";
    return `<div class="doc-img-wrap"><img src="${m.pvsystImage}"/><div class="cap">Карта затінення / 3D-модель об'єкта (PVsyst)</div></div>`;
  }

  function docManagerBlock() {
    const mgr = window.KP_CONFIG.MANAGER;
    return `<div class="doc-manager">
      <b>${esc(mgr.name)}</b>, ${esc(mgr.position)}<br/>
      ${esc(mgr.email)} · ${esc(mgr.phone)}<br/>
      ${esc(mgr.address).replace(/,?\n/g, ", ")}
    </div>`;
  }

  function renderDocument(model) {
    const now = new Date();
    model.meta.kpNumber = model.meta.kpNumber || defaultKpNumber(now);
    model.meta.kpDateStr = model.meta.kpDateStr || fmtDate(now);
    model.meta.company = window.KP_CONFIG.COMPANY;
    model.tech = buildTechSpec(model.pdv);

    // "Розділи КП" (запит Анни, 2026-07-20) — 4 чекбокси на формі
    // (index.html #in-sec-*), передаються через app.js як model.sections.
    // Наразі діють ЛИШЕ тут, у форматі "Документ" — presentation-версія
    // (render() нижче) навмисно НЕ чіпається, за домовленістю з Анною
    // ("давай поки для Документа, з Презентацією подивимось пізніше").
    // Фолбек на всі true — про всяк випадок, якщо колись щось викличе
    // renderDocument() без цього поля (напр. старий кеш app.js).
    const sections = model.sections || { tech: true, finance: true, budget: true, warranty: true };

    const html = `
    <div class="doc-root">
      ${docHeader(model)}
      ${docTitle(model)}
      ${docSection("Технічне рішення", sections.tech ? docPreamble(model) : "", { avoidBreak: true })}
      ${docSection("Технічні характеристики", sections.tech ? docTechTable(model) : "", { avoidBreak: true })}
      ${docSection("Фінансові показники", sections.finance ? docFinTable(model) : "", { avoidBreak: true })}
      ${docSection("Бюджет реалізації", sections.budget ? docBudgetTable(model) : "")}
      ${docSection("Імітаційна модель СЕС", docPvsystBlock(model), { avoidBreak: true })}
      ${docSection("Гарантійний термін та термін використання", sections.warranty ? warrantyTableHtml() : "", { avoidBreak: true })}
      ${docManagerBlock()}
    </div>`;

    const holder = document.getElementById("kp-doc");
    holder.innerHTML = html;
    holder.classList.add("ready");
  }

  function render(model) {
    const now = new Date();
    model.meta.kpNumber = model.meta.kpNumber || defaultKpNumber(now);
    model.meta.kpDateStr = model.meta.kpDateStr || fmtDate(now);
    model.meta.company = window.KP_CONFIG.COMPANY;
    model.tech = buildTechSpec(model.pdv);

    // "Без панелей" (2026-07-22): сторінка "02 Фінансові показники" вся
    // про економію/окупність від генерації — без панелей нема що на ній
    // показувати, тож не додаємо її до документа взагалі (сторінка "03
    // Бюджет реалізації" просто йде одразу після "01" — той самий
    // прийнятний "розрив" у нумерації, що вже є для опційних сторінок
    // "04"/"05" — PvSyst/сезонні графіки — коли їх немає).
    // "Без панелей" (2026-07-22, друге термінове уточнення того ж дня):
    // сторінка гарантій/термінів використання ("Гарантійний термін та
    // термін використання") теж вся про компоненти сонячної генерації
    // (фотомодулі, інвертори тощо) — без панелей прибираємо і її, лишаючи
    // сторінку менеджера останньою і єдиною "закриваючою" сторінкою.
    const html = [
      pageHero(model),
      pageWhyEscore(),
      pageCover(model),
      pageAbout(model),
      model.hasPanels === false ? "" : pageTech(model),
      pageBudget(model),
      pageShading(model),
      pageSeasonal(model),
      model.hasPanels === false ? "" : pageWarranty(model),
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

  window.KpRender = { render, renderDocument };
})();
