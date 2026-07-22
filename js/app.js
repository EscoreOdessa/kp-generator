// app.js — зшиває форму, парсинг Google Sheets / зображень і рендер.
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function setStatus(msg, isError) {
    const el = document.getElementById("status");
    el.textContent = msg || "";
    el.classList.toggle("error", !!isError);
  }

  // "Розділи КП" (запит Анни, 2026-07-20) — 4 чекбокси на формі
  // (index.html #in-sec-*), наразі впливають ЛИШЕ на формат "Документ"
  // (kp-render.js renderDocument() читає model.sections; формат
  // "Презентація" поки не чіпаємо — домовленість "потім подивимось").
  //
  // "Розумний дефолт": якщо менеджер конкретний чекбокс жодного разу не
  // чіпав руками (немає data-touched, виставляється у wireSectionCheckboxes()
  // нижче), app.js сам знімає з нього позначку в момент генерації, коли у
  // щойно завантаженому файлі-розрахунку немає відповідних даних — напр.
  // "Фінансові показники", коли клієнту рахували лише обладнання без
  // тарифу/моделі (усі 5 полів вкладки "Моделювання" порожні). Будь-який
  // чекбокс, який менеджер сам поставив/зняв, "розумний дефолт" більше НЕ
  // чіпає при наступних генераціях у цій самій сесії форми.
  const SECTION_CHECKBOX_IDS = {
    tech: "in-sec-tech",
    finance: "in-sec-finance",
    budget: "in-sec-budget",
    warranty: "in-sec-warranty",
  };

  function wireSectionCheckboxes() {
    Object.values(SECTION_CHECKBOX_IDS).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => { el.dataset.touched = "1"; });
    });
  }

  // Сигнал "чи є дані для цього розділу" — рахується з уже завантаженого
  // data (result of KpSheets.loadCalcFromSheet), ДО побудови m.tech
  // (buildTechSpec рахується всередині kp-render.js, тут для "tech" досить
  // грубішого сигналу — чи взагалі є хоч якась номенклатура на вкладці).
  function sectionHasData(key, data) {
    const modelData = data.model || {};
    const budget = data.budget || {};
    if (key === "tech") {
      return !!(data.pdv && data.pdv.categories && data.pdv.categories.length);
    }
    if (key === "finance") {
      return modelData.annualSavings100 != null || modelData.paybackAtTariff != null ||
        modelData.totalEffect30y != null || modelData.lcoe30Uah != null ||
        !!(modelData.monthlySavings && modelData.monthlySavings.length);
    }
    if (key === "budget") {
      return !!(budget.nettoTotal || budget.grossTotal || budget.equipmentCost);
    }
    // "warranty" — статична таблиця, не залежить від файлу-розрахунку:
    // сигналу "нема даних" тут просто не існує, тож розумний дефолт завжди
    // лишає розділ увімкненим (менеджер все одно може зняти позначку
    // вручну, якщо для конкретної угоди гарантія не потрібна).
    return true;
  }

  function resolveSections(data) {
    const sections = {};
    Object.keys(SECTION_CHECKBOX_IDS).forEach((key) => {
      const el = document.getElementById(SECTION_CHECKBOX_IDS[key]);
      if (!el) { sections[key] = true; return; }
      if (el.dataset.touched !== "1") {
        el.checked = sectionHasData(key, data);
      }
      sections[key] = el.checked;
    });
    return sections;
  }

  async function handleGenerate() {
    const btn = document.getElementById("btn-generate");
    btn.disabled = true;
    setStatus("Обробка...");
    try {
      const sheetUrl = document.getElementById("in-sheet-url").value.trim();
      if (!sheetUrl) {
        throw new Error("Вкажіть посилання на Google Sheet з розрахунком.");
      }

      // Тип розрахунку — тумблер "ПДВ" / "C" на формі (запит Анни,
      // 2026-07-18). Внутрішньо "C" відповідає вкладці KP_CONFIG.SHEET_TAB_CASH
      // (Готівка_ФОП, без ПДВ) — але саму назву вкладки й слова
      // "готівка"/"ФОП" ніде користувачу не показуємо, навіть у повідомленнях
      // про помилку нижче.
      const modeInput = document.querySelector('input[name="in-mode"]:checked');
      const mode = modeInput ? modeInput.value : "pdv";
      // "Документ" (запит Анни, 2026-07-19) — незалежний від тумблера ПДВ/C
      // і від "Розширеного бюджету" перемикач формату виводу: "presentation"
      // (нинішні слайди, render()) або "document" (компактний портретний
      // документ, renderDocument()) — обидва читають той самий model нижче.
      // Зберігаємо обраний формат у data-атрибут #kp-doc (не просто читаємо
      // радіо-кнопку знову в handleSavePdf), щоб кнопка друку завжди
      // друкувала саме те, що ЗАРАЗ відображено, навіть якщо менеджер
      // перемкнув тумблер формату ПІСЛЯ генерації, не натиснувши "Сформувати
      // КП" повторно.
      const formatInput = document.querySelector('input[name="in-format"]:checked');
      const format = formatInput ? formatInput.value : "presentation";
      // "Розширений бюджет" (запит Анни, 2026-07-18) — незалежний чекбокс,
      // не пов'язаний з тумблером ПДВ/C вище. Якщо увімкнено, sheets.js
      // додатково читає вкладку "Кошторис_Наявність обладнання" й повертає
      // data.budgetDetail (fail-soft: null, якщо вкладка не читається/не
      // має очікуваної структури — сторінка "03" тоді сама впаде назад на
      // стандартний хардкод-список, див. kp-render.js).
      const budgetDetailOn = document.getElementById("in-budget-detail").checked;
      // "Без сонячних панелей" (запит Анни, 2026-07-22) — див. коментар
      // над полем #in-no-panels в index.html. За замовчуванням (чекбокс
      // вимкнено) hasPanels = true, тобто нинішня поведінка не міняється.
      const hasPanels = !document.getElementById("in-no-panels").checked;

      setStatus("Читаємо Google Sheet...");
      const data = await KpSheets.loadCalcFromSheet(sheetUrl, mode, { budgetDetail: budgetDetailOn });
      const pdv = data.pdv, modelData = data.model;
      if (!pdv.categories.length) {
        const modeLabel = mode === "cash" ? "C" : "ПДВ";
        throw new Error('У вкладці варіанту "' + modeLabel + '" не знайдено жодного рядка з даними. Перевір файл-розрахунок.');
      }

      // "Розділи КП" — розв'язуємо фінальний стан 4 чекбоксів (з урахуванням
      // "розумного дефолту" для нечіпаних вручну) ЗАРАЗ, одразу після
      // завантаження даних, — щоб і сам чекбокс на екрані показав те, що
      // реально піде в документ, а не лишався розсинхронізованим.
      const sections = resolveSections(data);

      // Зображення розкладки/візуалізації
      const imgFiles = document.getElementById("in-images").files;
      const images = await KpImages.readAll(imgFiles);

      // Звіт PvSyst.pdf з Google Drive (опційно) — сторінка "04" КП.
      // Якщо поле порожнє або файл не вдалось завантажити/відрендерити,
      // сторінка просто не додається до документа (не критична помилка,
      // решта КП формується як завжди).
      //
      // Сторінка з діаграмою "Near shading: perspective view" шукається
      // АВТОМАТИЧНО за текстовим шаром PDF (renderPvsystShadingPage,
      // js/pdf-report.js) — номер цієї сторінки різний у різних файлах
      // PVsyst, тому більше не покладаємось лише на фіксований
      // KP_CONFIG.PVSYST_PAGE. Той конфіг лишається як РЕЗЕРВНИЙ номер на
      // випадок, якщо автопошук нічого не знайде (нетиповий звіт/інша
      // мова експорту) — про це попереджаємо в консоль, щоб було видно,
      // що варто перевірити сторінку вручну.
      let pvsystImage = null;
      const pvsystUrl = document.getElementById("in-pvsyst-url").value.trim();
      if (pvsystUrl) {
        try {
          setStatus("Завантажуємо звіт PVsyst.pdf з Google Drive...");
          const buf = await KpDrive.fetchDriveFileArrayBuffer(pvsystUrl);
          const shading = await KpPdfReport.renderPvsystShadingPage(buf, KP_CONFIG.PVSYST_CROP, KP_CONFIG.PVSYST_PAGE || 5);
          pvsystImage = shading.dataUrl;
          if (shading.autoDetected) {
            console.info(`PVsyst.pdf: сторінку з діаграмою затінення знайдено автоматично (стор. ${shading.pageNum}).`);
          } else {
            console.warn(`PVsyst.pdf: не вдалось автоматично знайти сторінку з діаграмою затінення — використано резервну сторінку ${shading.pageNum} з config.js (KP_CONFIG.PVSYST_PAGE). Перевір сторінку "04" вручну.`);
          }
        } catch (e) {
          console.warn("PVsyst.pdf: не вдалось завантажити/відрендерити (не критично):", e);
        }
      }

      // Сезонні погодинні графіки (Google Sheets, опційно) — сторінка "05"
      // КП. Той самий "необов'язково, fail-soft" підхід, що й у PvSyst.pdf
      // вище: якщо поле порожнє або файл не вдалось завантажити/розпарсити
      // (не знайдено таблиці "0H..23H" на жодній вкладці) — сторінка просто
      // не додається до документа.
      let seasonalHourly = null;
      const seasonalUrl = document.getElementById("in-seasonal-url").value.trim();
      if (seasonalUrl) {
        try {
          setStatus("Завантажуємо сезонні погодинні графіки...");
          seasonalHourly = await KpSeasonal.fetchSeasonalHourly(seasonalUrl);
        } catch (e) {
          console.warn("Сезонні графіки: не вдалось завантажити/розпарсити (не критично):", e);
        }
      }

      // Назва об'єкта (запит Анни, 2026-07-19) — тепер показується в КП
      // ЛИШЕ якщо менеджер сам вписав її в поле "Об'єкт" на формі. Раніше
      // тут був fallback на автоматичне читання комірки A1 вкладки
      // "Кошторис_Наявність обладнання" (KpSheets.getObjectNameFromSheet),
      // а якщо і там було порожньо — на плейсхолдер "[Назва об'єкта]" — обидва
      // прибрані навмисно: порожній objectName ("") тепер означає "нічого не
      // писати", а не "підстав щось замість". kp-render.js (objectLabel/
      // objectClause) сам ховає всі місця, де мала б бути назва (заголовки,
      // речення "для об'єкта «...»"), коли m.meta.object порожній.
      const objectName = document.getElementById("in-object").value.trim();

      const model = {
        meta: {
          object: objectName,
          address: document.getElementById("in-address").value.trim(),
          client: document.getElementById("in-client").value.trim(),
          kpNumber: document.getElementById("in-kpnum").value.trim(),
          validDays: Number(document.getElementById("in-validdays").value) || KP_CONFIG.DEFAULTS.validDays,
          tiltAngle: document.getElementById("in-tilt").value.trim(),
        },
        overrides: {
          vatRate: (Number(document.getElementById("in-vat").value) || 20) / 100,
          prepaymentPct: Number(document.getElementById("in-prepay").value) || KP_CONFIG.DEFAULTS.prepaymentPct,
          tariffUsdPerKwh: Number(document.getElementById("in-tariff").value) || KP_CONFIG.DEFAULTS.tariffUsdPerKwh,
          leadTimeWeeks: KP_CONFIG.DEFAULTS.leadTimeWeeks,
          warrantyMonths: KP_CONFIG.DEFAULTS.warrantyMonths,
        },
        images,
        pdv,
        model: modelData,
        budget: data.budget,
        budgetDetail: data.budgetDetail || null,
        pvsystImage,
        seasonalHourly,
        clientMode: mode,
        sections,
        hasPanels,
      };

      const docHolder = document.getElementById("kp-doc");
      docHolder.dataset.format = format;
      if (format === "document") {
        KpRender.renderDocument(model);
      } else {
        KpRender.render(model);
      }
      docHolder.scrollIntoView({ behavior: "smooth" });
      setStatus("Готово. Перевірте документ нижче і натисніть «Друк / зберегти як PDF».");
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), true);
    } finally {
      btn.disabled = false;
    }
  }

  // Чекаємо, поки всі <img> усередині кореня довантажаться (важливо перед
  // html2canvas-рендером у handleSavePdf() нижче — незавантажене/недекодоване
  // зображення може вийти порожнім на знімку).
  async function waitForImages(root) {
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      })
    );
  }

  // Формування PDF через html2canvas + jsPDF (запит Анни, 2026-07-13,
  // після двох невдалих спроб полагодити нативний друк браузера —
  // window.print()/@media print: перша сторінка друкувалась суцільно
  // білою (position:absolute-елементи не дають .kp-page висоти, коли
  // @media print скидає min-height у auto — сторінка "схлопується" в 0),
  // а сторінка "Бюджет реалізації" (використовує display:grid для
  // колонки таблиці + колонки приміток) "перетікала" на сирітську
  // сторінку без заголовка, бо Chrome під час друку часто не вміє
  // розбивати grid-контейнери по межі сторінки — переносить їх цілком.
  // Замість того щоб ганятись за кожним новим сюрпризом @media print
  // окремо, кожна .kp-page тепер рендериться html2canvas() у картинку
  // ТОЧНО як показано на екрані (жодні правила друку не задіяні), і
  // картинки вставляються в PDF одна на сторінку через jsPDF — це
  // гарантує, що PDF завжди виглядає так само, як прев'ю на екрані,
  // незалежно від браузера користувача.
  // "Документ" (запит Анни, 2026-07-19) — друк НАТИВНИМ window.print(), а не
  // html2canvas+jsPDF: контент документа природно переливається між
  // сторінками (немає фіксованих "слайдів"), із чим браузер сам добре
  // справляється через @page doc-page + page-break-inside:avoid у
  // style.css — саме той сценарій, у якому html2canvas-скріншот кожної
  // "сторінки" окремо не має сенсу (сторінок як дискретних елементів DOM
  // тут просто немає, є один безперервний .doc-root). Див. коментар над
  // тумблером формату в index.html і план у пам'яті
  // kp_generator_document_mode_plan.
  async function handleSavePdfDocument(doc, btn) {
    btn.disabled = true;
    try {
      await waitForImages(doc);
      window.print();
      setStatus("Відкрито діалог друку — оберіть «Зберегти як PDF».");
    } catch (err) {
      console.error(err);
      setStatus("Не вдалось відкрити діалог друку: " + (err.message || err), true);
    } finally {
      btn.disabled = false;
    }
  }

  async function handleSavePdf() {
    const btn = document.getElementById("btn-print");
    const doc = document.getElementById("kp-doc");
    const format = doc.dataset.format || "presentation";

    if (format === "document") {
      if (!doc.querySelector(".doc-root")) {
        setStatus("Спочатку сформуйте КП.", true);
        return;
      }
      await handleSavePdfDocument(doc, btn);
      return;
    }

    const pages = doc.querySelectorAll(".kp-page");
    if (!pages.length) {
      setStatus("Спочатку сформуйте КП.", true);
      return;
    }
    btn.disabled = true;
    // Ховаємо елементи, які не мають потрапити на знімок (напр. <select>
    // вибору місяця на сторінці "Фінансові показники") — раніше це робив
    // клас .no-print через @media print, але html2canvas рендерить живий
    // DOM, а не print-версію, тому ховаємо вручну на час знімку.
    const hidden = doc.querySelectorAll(".no-print");
    hidden.forEach((el) => {
      el.dataset.__prevDisplay = el.style.display;
      el.style.display = "none";
    });
    try {
      await waitForImages(doc);
      const { jsPDF } = window.jspdf;
      let pdf = null;
      for (let i = 0; i < pages.length; i++) {
        setStatus(`Формуємо PDF... сторінка ${i + 1} з ${pages.length}`);
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        if (!pdf) {
          pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        } else {
          pdf.addPage("a4", "landscape");
        }
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
      }
      let filename = "KP.pdf";
      const metaEl = doc.querySelector(".doc-meta");
      if (metaEl) {
        const m = metaEl.textContent.match(/№\s*([^\s·]+)/);
        if (m) filename = "KP-" + m[1] + ".pdf";
      }
      pdf.save(filename);
      setStatus("PDF збережено.");
    } catch (err) {
      console.error(err);
      setStatus("Не вдалось сформувати PDF: " + (err.message || err), true);
    } finally {
      hidden.forEach((el) => {
        el.style.display = el.dataset.__prevDisplay || "";
        delete el.dataset.__prevDisplay;
      });
      btn.disabled = false;
    }
  }

  // Перетягування файлу прямо на звичайний <input type="file"> у Chrome
  // не завжди спрацьовує надійно — якщо не влучити точно у вузьке поле,
  // браузер за замовчуванням просто відкриє файл замість завантаження.
  // Тому робимо всю картку "зоною скидання": ловимо dragover/drop на
  // ній, підміняємо .files інпута через DataTransfer і самі стріляємо
  // подію "change", щоб спрацював наявний обробник перегляду.
  function wireDropzone(zoneId, inputId, onDrop) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    if (!zone || !input) return;
    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add("drag");
      })
    );
    ["dragleave", "dragend"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.remove("drag");
      })
    );
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove("drag");
      const dropped = e.dataTransfer && e.dataTransfer.files;
      if (!dropped || !dropped.length) return;
      const dt = new DataTransfer();
      Array.from(dropped).forEach((f) => dt.items.add(f));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (onDrop) onDrop(input.files);
    });
  }

  ready(() => {
    document.getElementById("btn-generate").addEventListener("click", handleGenerate);
    document.getElementById("btn-print").addEventListener("click", handleSavePdf);
    wireSectionCheckboxes();

    document.getElementById("in-images").addEventListener("change", async (e) => {
      const list = document.getElementById("img-thumbs");
      list.innerHTML = "";
      const imgs = await KpImages.readAll(e.target.files);
      imgs.forEach((im) => {
        const i = document.createElement("img");
        i.src = im.url;
        list.appendChild(i);
      });
    });

    wireDropzone("drop-images", "in-images");

    // Запобіжник: якщо файл випадково впустили повз обидві зони скидання,
    // не даємо браузеру замінити сторінку цим файлом.
    ["dragover", "drop"].forEach((evt) =>
      window.addEventListener(evt, (e) => {
        if (!e.target.closest || !e.target.closest(".dropzone")) e.preventDefault();
      })
    );
  });
})();
