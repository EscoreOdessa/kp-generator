// kp-render.js — будує розмітку комерційної пропозиції (9 сторінок А4,
// альбомна орієнтація)
// з даних, зібраних у app.js (таблиця розрахунків + PDF генерації +
// зображення), і малює діаграму помісячної генерації через Chart.js.

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

  function footerDark(company) {
    return `
      <div class="footer-dark">
        <div>
          <div class="fname">escore</div>
          <div class="fsub">${esc(company.tagline).replace(/\n/g, "<br/>")}</div>
        </div>
        <div class="fcontact">
          <div><b>${esc(company.name)}</b></div>
          <div>${esc(company.address)}</div>
          <div>тел.: ${esc(company.phone)} · ${esc(company.email)}</div>
          <div>${esc(company.site)}</div>
        </div>
      </div>
      <div class="disclaimer">
        Комерційна пропозиція має інформаційний характер і не є публічною офертою. Остаточна вартість визначається
        договором після робочого проєктування та узгодження специфікації обладнання.
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
            <img src="assets/logo-women.jpg" alt="Жіночий енергоклуб України"/>
            <img src="assets/logo-sup.jpg" alt="Спілка Українських Підприємців"/>
            <img src="assets/logo-asau.jpg" alt="Асоціація сонячної енергетики України"/>
            <img src="assets/logo-tpp.jpg" alt="Торгово-Промислова палата України"/>
            <img src="assets/logo-onpu.jpg" alt="Одеська політехніка"/>
            <img src="assets/logo-employers.jpg" alt="Об'єднання організацій роботодавців Одеської області"/>
          </div>
        </div>
      </div>
    </section>`;
  }

  // ---------- Сторінка 3 — обкладинка (дані по проєкту) ----------
  function pageCover(m) {
    const hero = m.images[0];
    return `
    <section class="kp-page">
      ${pageHeader(m.meta, "cover")}
      <div class="kp-eyebrow">Сонячна електростанція під ключ</div>
      <div class="kp-title">${cap(m.tech.stationType)} СЕС «${esc(m.meta.object)}»${m.tech.stationCapacityKw ? " — " + fmtNum(m.tech.stationCapacityKw, 2) + " кВт" : ""}</div>
      <div class="kp-desc">
        Тип рішення: <b>${esc(m.tech.stationType)} сонячна електростанція</b>${m.tech.hasBattery ? " з акумуляторною батареєю (автономія / резерв)" : ""} — генерація
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
  function pageAbout(m) {
    const gallery = m.images.slice(1);
    const chartId = "kp-gen-chart";
    // Опис обладнання формується з даних (панелі/батарея), а не хардкодиться,
    // щоб при завантаженні нового файлу-розрахунку текст сам оновлювався.
    const equipParts = [];
    if (m.tech.panelModel) equipParts.push(`сонячні панелі <b>${esc(m.tech.panelModel)}</b>${m.tech.panelsQty ? ` (${m.tech.panelsQty} шт)` : ""}`);
    if (m.tech.hasBattery && m.tech.batteryModel) equipParts.push(`акумуляторна батарея <b>${esc(m.tech.batteryModel)}</b>${m.tech.batteryQty ? ` (${m.tech.batteryQty} шт)` : ""}`);
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

  // ---------- Сторінка 3 — технічне рішення ----------
  function pageTech(m) {
    const items = m.tech.specItems;
    return `
    <section class="kp-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">02</span> Технічне рішення</div>
      <div class="split-list">
        ${items.map((it) => `<div class="spec-item"><b>${esc(it.label)}</b>${esc(it.value)}</div>`).join("")}
      </div>
      ${m.pdvReportImage ? `<div class="hero-img" style="margin-top:22px;"><img src="${m.pdvReportImage}"/></div><div class="caption">Додаток: розрахунок генерації електроенергії.</div>` : ""}
    </section>`;
  }

  // ---------- Сторінка 4 — номенклатура ----------
  function pageNomenclature(m) {
    const rows = [];
    m.pdv.categories.forEach((cat) => {
      const subtotal = cat.items.reduce((s, it) => s + it.lineNetto, 0);
      rows.push(`<tr class="cat"><td>${esc(cat.code)}</td><td>${esc(cat.name)}</td><td></td><td class="num"></td><td class="num">${fmtUsd(subtotal)}</td></tr>`);
      cat.items.forEach((it) => {
        rows.push(`<tr><td>${esc(it.code)}</td><td>${esc(it.name)}</td><td class="num">${fmtNum(it.qty)}</td><td class="num">${fmtUsd(it.unitNetto)}</td><td class="num">${fmtUsd(it.lineNetto)}</td></tr>`);
      });
    });
    return `
    <section class="kp-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">03</span> Номенклатура товарів і послуг</div>
      <table class="kp-table">
        <thead><tr><th>№</th><th>Найменування</th><th class="num">К-сть</th><th class="num">Ціна за од., $</th><th class="num">Сума, $</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>
      <div class="caption">* Ціни вказано в доларах США (USD), без ПДВ. Обсяги та специфікація уточнюються за результатами робочого проєктування.</div>
    </section>`;
  }

  // ---------- Сторінка 5 — вартість проєкту ----------
  // Підсумкові цифри тут навмисно беруться напряму з вкладки "Моделювання"
  // (рядки 1-3: "Вартість СЕС", "Вартість 1 кВт СЕС", "Потужність СЕС",
  // "Термін окупності") — це вже готовий, узгоджений розрахунок автора
  // таблиці (враховує ПДВ, бонуси, комісії тощо), а не наша власна
  // прикидка "нетто × 1.2".
  function pageCost(m) {
    const netto = m.pdv.nettoTotal;
    const vatRate = m.overrides.vatRate;
    // "Вартість СЕС" з Моделювання — це вже фінальна сума до сплати; якщо
    // її раптом немає (порожня вкладка), рахуємо запасний варіант netto×(1+ПДВ).
    const total = m.model.stationCostUsd != null ? m.model.stationCostUsd : netto * (1 + vatRate);
    const prepPct = m.overrides.prepaymentPct;
    const prepay = total * (prepPct / 100);
    const balance = total - prepay;
    return `
    <section class="kp-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">04</span> Вартість проєкту</div>
      <div class="cost-box">
        <div class="cost-row"><span>Бюджет проєкту, нетто без ПДВ</span><b>${fmtUsd(netto)}</b></div>
        <div class="cost-row total"><span>Вартість СЕС — РАЗОМ до сплати</span><span>${fmtUsd(total)}</span></div>
      </div>
      <div class="stat-cards">
        <div class="stat-card"><div class="num">${m.model.costPerKw ? fmtUsd(m.model.costPerKw) : "—"}</div><div class="lbl">Вартість 1 кВт СЕС</div></div>
        <div class="stat-card"><div class="num">${m.model.capacityKw ? fmtNum(m.model.capacityKw, 2) : "—"} кВт</div><div class="lbl">Потужність фотомодулів</div></div>
        <div class="stat-card"><div class="num">${m.model.paybackYears ? fmtNum(m.model.paybackYears, 2) : "—"}</div><div class="lbl">Термін окупності, років</div></div>
      </div>
      <div class="pay-split">
        <div class="pay-card"><div class="amt">${fmtUsd(prepay)}</div><div class="lbl">Передоплата · ${prepPct}% — замовлення обладнання, мобілізація</div></div>
        <div class="pay-card"><div class="amt">${fmtUsd(balance)}</div><div class="lbl">Залишок · ${100 - prepPct}% — після пусконалагодження і здачі</div></div>
      </div>
    </section>`;
  }

  // ---------- Сторінка 6 — економічна вигода (лише грошові показники) ----------
  // Технічні показники генерації і діаграма перенесені на сторінку "Про
  // проєкт" (pageAbout) — тут навмисно лишили тільки фінанси.
  function pageEconomics(m) {
    const gen = m.model.annualGenKwh; // потрібен лише для розрахунку savings нижче
    const tariff = m.overrides.tariffUsdPerKwh;
    const savings = m.model.annualSavingsUsd || (gen && tariff ? gen * tariff : null);
    const monthlySavings = savings ? savings / 12 : null;
    // Термін окупності — беремо готове значення з вкладки "Моделювання"
    // (те саме число, що й на сторінці "Вартість проєкту"), а не рахуємо
    // самі — щоб в КП не було двох різних цифр окупності.
    const payback = m.model.paybackYears;
    return `
    <section class="kp-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">05</span> Економічна вигода та проста окупність</div>
      <div class="kp-body"><p>Розрахунок виконано з припущення, що станція повністю віддає згенеровану електроенергію на потреби
      об'єкта, заміщуючи купівлю електроенергії у постачальника за тарифом ≈ $${tariff}/кВт·год.</p></div>
      <div class="stat-cards">
        <div class="stat-card"><div class="num">$${tariff}</div><div class="lbl">Тариф заміщення / кВт·год</div></div>
        <div class="stat-card"><div class="num">${monthlySavings ? fmtUsd(monthlySavings) : "—"}</div><div class="lbl">Економія на місяць</div></div>
        <div class="stat-card"><div class="num">${payback ? fmtNum(payback, 2) : "—"}</div><div class="lbl">Проста окупність, років</div></div>
        <div class="stat-card"><div class="num">${m.model.income30y ? fmtUsd(m.model.income30y) : "—"}</div><div class="lbl">Сумарний дохід за 30 років</div></div>
        <div class="stat-card"><div class="num">${m.model.lcoe30 ? fmtNum(m.model.lcoe30, 2) + " грн" : "—"}</div><div class="lbl">LCOE за 30 років</div></div>
      </div>
      <div class="benefit-strip">
        <div class="benefit-box green"><div class="cap">Реальна економічна вигода</div><div class="big">${savings ? fmtUsd(savings) : "—"} / рік</div></div>
        <div class="benefit-box dark"><div class="cap">Проста окупність</div><div class="big">${payback ? "≈ " + fmtNum(payback, 2) : "—"} року</div></div>
      </div>
    </section>`;
  }

  // ---------- Сторінка 7 — умови + футер ----------
  function pageTerms(m) {
    const c = m.meta.company;
    return `
    <section class="kp-page">
      ${pageHeader(m.meta)}
      <div class="section-title"><span class="num-badge">06</span> Що входить та умови</div>
      <div class="terms-list">
        <div class="t-row"><b>Повний цикл «під ключ»</b> проєктування, постачання обладнання, монтаж, підключення, пусконалагодження та запуск.</div>
        <div class="t-row"><b>Термін реалізації</b> орієнтовно ${esc(m.overrides.leadTimeWeeks)} тижнів від передоплати.</div>
        <div class="t-row"><b>Гарантія</b> на монтажні роботи — ${esc(m.overrides.warrantyMonths)} міс.; на обладнання — згідно з гарантією виробників.</div>
        <div class="t-row"><b>Оплата</b> ${m.overrides.prepaymentPct}% передоплата / ${100 - m.overrides.prepaymentPct}% після здачі. Ціни зафіксовано на строк дії пропозиції — ${esc(m.meta.validDays)} днів.</div>
      </div>
      ${footerDark(c)}
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
        // Панелі в різних файлах називають по-різному: "панель", "PV
        // модуль", "фотомодуль", код рядка "ФЕМ" тощо. Явно виключаємо
        // кабельні/кріпильні позиції — їхні назви часто згадують "для
        // фотомодулів", але самі панелями не є.
        const looksLikeAccessory = /кабел|провід|конектор|мс4|mc4|кріпленн|стійк/.test(n);
        const isPanel = !looksLikeAccessory && (/^фем$/i.test(it.code || "") || /панел/.test(n) || /^pv\s*модул/.test(n) || /^фотомодул/.test(n));
        if (isPanel) { panelModel = it.name; panelsQty += it.qty; }
        if (/інвертор/.test(n)) {
          inverterModel = it.name; invertersQty += it.qty;
          if (/г[іи]брид/.test(n)) isHybrid = true;
          // Потужність станції визначаємо за інвертором (не за панелями) —
          // витягуємо кВт з назви моделі, напр. "SUN-30K-..." → 30,
          // "X3-MGA-50KG2" → 50.
          const kwMatch = it.name.match(/(\d+(?:[.,]\d+)?)\s*k(?!wh)/i);
          if (kwMatch) inverterKwTotal += parseFloat(kwMatch[1].replace(",", ".")) * (it.qty || 1);
        }
        if (/акумулятор|акб\b|batter/.test(n)) { hasBattery = true; batteryModel = it.name; batteryQty += it.qty; }
        if (it.qty > 0) {
          specItems.push({ label: it.name, value: `${it.qty} шт` });
        }
      });
    });
    // Тип станції визначається виключно з даних (назва інвертора у вкладці
    // ПДВ) — ніколи не хардкодиться, бо один і той самий шаблон КП
    // використовується і для мережевих, і для гібридних станцій.
    const hybrid = isHybrid || hasBattery;
    const stationType = hybrid ? "гібридна" : "мережева";       // "Гібридна СЕС" / "Мережева СЕС"
    const stationTypeGen = hybrid ? "гібридної" : "мережевої";  // "...будівництво гібридної СЕС"
    return {
      specItems: specItems.slice(0, 12), panelModel, panelsQty, inverterModel, invertersQty,
      batteryModel, batteryQty,
      stationType, stationTypeGen, hasBattery,
      stationCapacityKw: inverterKwTotal || null, // потужність за інвертором — головна цифра в КП
    };
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Кольори стовпчиків діаграми генерації — 3 рівні за значенням (як на
  // вкладці "Моделювання Фін. показників роботи СЕС"): найвищі місяці —
  // жовтий, середні — темно-зелений, найнижчі — світло-зелений. Рівні
  // рахуються від фактичних даних (ранжування), а не хардкодяться по
  // місяцях, бо порядок місяців з найвищою генерацією не завжди той самий.
  function tierColors(values) {
    const n = values.length;
    const order = values.map((_, i) => i).sort((a, b) => (values[b] || 0) - (values[a] || 0));
    const tierSize = Math.ceil(n / 3);
    const colors = new Array(n);
    order.forEach((idx, rank) => {
            if (rank < tierSize) colors[idx] = "#F5C518";           // найвищі — жовтий
      else if (rank < tierSize * 2) colors[idx] = "#05554B";  // середні — фірмовий зелений (з логотипа)
      else colors[idx] = "#82CFC4";                            // найнижчі — світлий відтінок фірмового зеленого;
    return colors;
  }

  // Підписи значень генерації над кожним стовпчиком — замінюють вісь Y
  // (яку прибрано разом з лініями сітки за запитом Анни, 2026-07-07).
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
      pageNomenclature(model),
      pageCost(model),
      pageEconomics(model),
      pageTerms(model),
    ].join("\n");

    const holder = document.getElementById("kp-doc");
    holder.innerHTML = html;
    holder.classList.add("ready");

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
