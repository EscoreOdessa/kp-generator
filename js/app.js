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

      setStatus("Читаємо Google Sheet...");
      const data = await KpSheets.loadCalcFromSheet(sheetUrl);
      const pdv = data.pdv, modelData = data.model;
      if (!pdv.categories.length) {
        throw new Error('У вкладці "' + KP_CONFIG.SHEET_TAB_PDV + '" не знайдено жодного рядка з даними. Перевір назву вкладки й формат таблиці.');
      }

      // Зображення розкладки/візуалізації
      const imgFiles = document.getElementById("in-images").files;
      const images = await KpImages.readAll(imgFiles);

      let objectName = document.getElementById("in-object").value.trim();
      if (!objectName) {
        try {
          const name = await KpSheets.getObjectNameFromSheet(sheetUrl);
          if (name) objectName = name;
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
