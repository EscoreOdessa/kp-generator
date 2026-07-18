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

      setStatus("Читаємо Google Sheet...");
      const data = await KpSheets.loadCalcFromSheet(sheetUrl, mode);
      const pdv = data.pdv, modelData = data.model;
      if (!pdv.categories.length) {
        const modeLabel = mode === "cash" ? "C" : "ПДВ";
        throw new Error('У вкладці варіанту "' + modeLabel + '" не знайдено жодного рядка з даними. Перевір файл-розрахунок.');
      }

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

      let objectName = document.getElementById("in-object").value.trim();
      if (!objectName) {
        try {
          const name = await KpSheets.getObjectNameFromSheet(sheetUrl);
          if (name) objectName = name;
        } catch (e) { /* non-fatal */ }
      }
      if (!objectName) objectName = "[Назва об'єкта]";

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
        pvsystImage,
        seasonalHourly,
        clientMode: mode,
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
  async function handleSavePdf() {
    const btn = document.getElementById("btn-print");
    const doc = document.getElementById("kp-doc");
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
