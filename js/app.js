// app.js — зшиває форму, парсинг Google Sheets / PDF / зображень і рендер.
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

  // ---- Демо-дані (реальні цифри з референсного КП Grand Marine) ----
  // Кнопка "Демо" дозволяє перевірити вигляд документа без підключення
  // до Google Sheets API (наприклад, поки не налаштований GOOGLE_API_KEY).
  function demoModel() {
    return {
      pdv: {
        nettoTotal: 77604.52,
        categories: [
          {
            code: "1", name: "Основне технічне обладнання та система кріплення",
            items: [
              { code: "1.1", name: "Сонячна панель Longi LR8-66HGD-620M", qty: 241, unitNetto: 107.63, lineNetto: 25939.31 },
              { code: "1.2", name: "Мережевий інвертор Solax X3-MGA-50KG2", qty: 4, unitNetto: 1904.00, lineNetto: 7616.00 },
              { code: "1.3", name: "Лічильник Solax DTSU 666", qty: 8, unitNetto: 232.40, lineNetto: 1859.20 },
              { code: "1.4", name: "Моніторинг Solax Power Pocket Wi-Fi+Lan", qty: 4, unitNetto: 49.47, lineNetto: 197.87 },
              { code: "1.5", name: "Трансформатор струму ТС 800/5", qty: 24, unitNetto: 74.67, lineNetto: 1792.00 },
              { code: "1.6", name: "Контролер експорту мережі", qty: 1, unitNetto: 1450.40, lineNetto: 1450.40 },
              { code: "1.7", name: "Оцинкована система кріплень", qty: 241, unitNetto: 18.67, lineNetto: 4498.68 },
              { code: "1.8", name: "Конструкція паркінгу (металоконструкція)", qty: 1, unitNetto: 8026.67, lineNetto: 8026.67 },
              { code: "1.9", name: "Доставка обладнання", qty: 1, unitNetto: 2000.00, lineNetto: 2000.00 },
            ],
          },
          {
            code: "2", name: "Кабельна група та витратні матеріали",
            items: [
              { code: "2.1", name: "PV-кабель для підключення фотомодулів, 6 мм² (Німеччина)", qty: 2200, unitNetto: 1.21, lineNetto: 2669.25 },
              { code: "2.2", name: "Автоматика захисту змінного струму (AC)", qty: 1, unitNetto: 1260.00, lineNetto: 1260.00 },
              { code: "2.3", name: "Автоматика захисту фотомодулів (DC)", qty: 1, unitNetto: 681.33, lineNetto: 681.33 },
              { code: "2.4", name: "Кабельно-провідникова продукція + конектори MC4", qty: 1, unitNetto: 2800.00, lineNetto: 2800.00 },
              { code: "2.5", name: "Витратні матеріали", qty: 1, unitNetto: 541.33, lineNetto: 541.33 },
            ],
          },
          {
            code: "3", name: "Послуги: МБР, ЕМР, ПНР",
            items: [
              { code: "3.1", name: "Будівельно-монтажні роботи", qty: 241, unitNetto: 21.28, lineNetto: 5128.48 },
              { code: "3.2", name: "Електромонтажні роботи", qty: 1, unitNetto: 2856.00, lineNetto: 2856.00 },
              { code: "3.3", name: "Прокладання електричного кабелю", qty: 1, unitNetto: 2800.00, lineNetto: 2800.00 },
              { code: "3.4", name: "Монтаж заземлення", qty: 1, unitNetto: 537.60, lineNetto: 537.60 },
              { code: "3.5", name: "Будівельно-монтажні роботи конструкції паркінгу", qty: 1, unitNetto: 4480.00, lineNetto: 4480.00 },
              { code: "3.6", name: "Підйомні механізми", qty: 1, unitNetto: 246.40, lineNetto: 246.40 },
              { code: "3.7", name: "Доставка / паливо", qty: 1, unitNetto: 224.00, lineNetto: 224.00 },
            ],
          },
        ],
      },
      model: {
        stationCostUsd: 77604.52, costPerKw: 519.50, capacityKw: 149.42,
        annualGenKwh: 164362, annualSavingsUsd: 54787, paybackYears: 1.7, tariff: 0.33,
        months: [
          { month: "Січень", generation: 6600 }, { month: "Лютий", generation: 8200 },
          { month: "Березень", generation: 12800 }, { month: "Квітень", generation: 16400 },
          { month: "Травень", generation: 19200 }, { month: "Червень", generation: 20100 },
          { month: "Липень", generation: 20500 }, { month: "Серпень", generation: 18800 },
          { month: "Вересень", generation: 14900 }, { month: "Жовтень", generation: 11000 },
          { month: "Листопад", generation: 6800 }, { month: "Грудень", generation: 5262 },
        ],
      },
    };
  }

  async function handleGenerate() {
    const btn = document.getElementById("btn-generate");
    btn.disabled = true;
    setStatus("Обробка...");
    try {
      const sheetUrl = document.getElementById("in-sheet-url").value.trim();
      const useDemo = document.getElementById("chk-demo").checked;

      let pdv, modelData;
      if (useDemo || !sheetUrl) {
        const d = demoModel();
        pdv = d.pdv; modelData = d.model;
      } else {
        setStatus("Читаємо Google Sheet...");
        const data = await KpSheets.loadCalcFromSheet(sheetUrl);
        pdv = data.pdv; modelData = data.model;
        if (!pdv.categories.length) {
          throw new Error('У вкладці "' + KP_CONFIG.SHEET_TAB_PDV + '" не знайдено жодного рядка з даними. Перевір назву вкладки й формат таблиці.');
        }
      }

      // Зображення розкладки/візуалізації
      const imgFiles = document.getElementById("in-images").files;
      const images = await KpImages.readAll(imgFiles);

      // PDF звіту генерації (опційно)
      let pdvReportImage = null;
      const pdfFile = document.getElementById("in-genpdf").files[0];
      if (pdfFile) {
        setStatus("Обробка PDF звіту генерації...");
        pdvReportImage = await KpPdfReport.renderFirstPageToDataUrl(pdfFile);
      }

      let objectName = document.getElementById("in-object").value.trim();
      if (!objectName && sheetUrl && !useDemo) {
        try {
          const title = await KpSheets.getSpreadsheetTitle(sheetUrl);
          if (title) objectName = title.trim();
        } catch (e) { /* non-fatal */ }
      }
      if (!objectName) objectName = "Grand Marine";

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
        pdvReportImage,
        pdv,
        model: modelData,
      };

      KpRender.render(model);
      document.getElementById("kp-doc").scrollIntoView({ behavior: "smooth" });
      setStatus("Готово. Перевірте документ нижче і натисніть «Друк / зберегти як PDF».");
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), true);
    } finally {
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
    document.getElementById("btn-print").addEventListener("click", () => window.print());

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

    document.getElementById("in-genpdf").addEventListener("change", (e) => {
      const nameEl = document.getElementById("genpdf-filename");
      const f = e.target.files && e.target.files[0];
      nameEl.textContent = f ? f.name : "";
    });

    wireDropzone("drop-images", "in-images");
    wireDropzone("drop-genpdf", "in-genpdf");

    // Запобіжник: якщо файл випадково впустили повз обидві зони скидання,
    // не даємо браузеру замінити сторінку цим файлом.
    ["dragover", "drop"].forEach((evt) =>
      window.addEventListener(evt, (e) => {
        if (!e.target.closest || !e.target.closest(".dropzone")) e.preventDefault();
      })
    );
  });
})();
