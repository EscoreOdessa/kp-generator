// pdf-report.js — робота із PDF-звітом по генерації (наприклад, експорт з
// PVsyst/PVGIS чи іншої програми моделювання).
//
// Свідоме рішення: цифри для розрахунків (річна генерація, економія,
// окупність) беруться з вкладки "Моделювання" в Google Sheets — там вони
// вже пораховані й надійні. PDF-звіт використовується як картинка-
// підтвердження: конкретна сторінка (і, за потреби, лише її фрагмент)
// рендериться в зображення і вставляється в КП (сторінка "04", джерело
// файлу — Google Drive-посилання, див. js/drive.js і app.js).
//
// Використовує pdf.js (CDN, підключено в index.html).

(function () {
  // Рендерить одну вже завантажену (pdf.js) сторінку документа в
  // dataURL-картинку, за потреби вирізаючи лише прямокутник crop
  // (частки 0..1 від розмірів відрендереної сторінки). Спільна логіка
  // для renderPdfPageToDataUrl() і renderPvsystShadingPage() нижче, щоб
  // не парсити той самий PDF двічі.
  async function renderPageFromDoc(pdf, pageNum, crop) {
    const n = Math.min(Math.max(pageNum || 1, 1), pdf.numPages);
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (!crop) return canvas.toDataURL("image/png");

    const sx = Math.round((crop.left || 0) * canvas.width);
    const sy = Math.round((crop.top || 0) * canvas.height);
    const sw = Math.round((crop.width != null ? crop.width : 1) * canvas.width);
    const sh = Math.round((crop.height != null ? crop.height : 1) * canvas.height);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    cropCanvas.getContext("2d").drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return cropCanvas.toDataURL("image/png");
  }

  // source: ArrayBuffer (напр. з Google Drive) або File (з <input type=file>).
  // pageNum: 1-based номер сторінки; якщо виходить за межі документа —
  // береться найближча існуюча сторінка (не кидає помилку).
  // crop (опційно): {top,left,width,height} у частках 0..1 від розмірів
  // відрендереної сторінки — якщо задано, повертається не вся сторінка,
  // а лише цей прямокутник (напр. щоб вирізати конкретну діаграму зі
  // звіту PVsyst, ігноруючи шапку/підпис навколо неї — див.
  // KP_CONFIG.PVSYST_CROP у config.js).
  async function renderPdfPageToDataUrl(source, pageNum, crop) {
    const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    return renderPageFromDoc(pdf, pageNum, crop);
  }

  // Лишено для сумісності зі старим API (файл із <input type=file>,
  // раніше використовувалось на сторінці "Технічне рішення").
  async function renderFirstPageToDataUrl(file) {
    return renderPdfPageToDataUrl(file, 1);
  }

  // ---------- Автопошук сторінки з діаграмою затінення PVsyst ----------
  // Проблема (Анна, 2026-07-15): номер сторінки з 3D-діаграмою "Near
  // shading: perspective view" РІЗНИЙ у різних файлах PvSyst.pdf (залежить
  // від кількості попередніх розділів звіту в конкретному проєкті) — тому
  // жорстко зашитий KP_CONFIG.PVSYST_PAGE (=5) підходив лише для одного
  // конкретного файлу.
  // Рішення: скануємо текстовий шар КОЖНОЇ сторінки PDF (pdf.js
  // getTextContent — це не OCR, а текстовий шар, який PVsyst завжди
  // вставляє в свій PDF-експорт) і шукаємо підпис під діаграмою. Патерни
  // впорядковані від найспецифічнішого до найзагальнішого — це важливо,
  // бо в звітах PVsyst зазвичай є сторінка "Зміст", де так само
  // зустрічається слово "Near shading" саме як назва розділу (без
  // "perspective view" поруч) — щоб не зупинитись на змісті, спершу
  // пробуємо найточніший патерн по ВСІХ сторінках, і лише якщо він ніде
  // не знайшовся — послаблюємо пошук.
  const PVSYST_SHADING_PATTERNS = [
    /near\s*shading\s*[:\-]?\s*perspective\s*view/i, // точний підпис під діаграмою (найнадійніший)
    /perspective\s*view/i, // сама діаграма підписана лише так, без "Near shading" попереду
    /near\s*shading/i, // останній резерв — може зловити й сторінку змісту
  ];

  // Повертає {dataUrl, pageNum, autoDetected}. Якщо жоден патерн не
  // знайдено на жодній сторінці — використовує fallbackPage (типово
  // KP_CONFIG.PVSYST_PAGE) і autoDetected:false, щоб виклик міг про це
  // попередити (fail-soft: сторінка все одно рендериться, просто,
  // можливо, не та — це видно і виправляється вручну, а не мовчки ламає
  // всю генерацію КП).
  async function renderPvsystShadingPage(source, crop, fallbackPage) {
    const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    const pageTexts = new Array(pdf.numPages + 1); // 1-based, кешуємо — кожна сторінка читається лише раз
    async function textOf(p) {
      if (pageTexts[p] == null) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        pageTexts[p] = content.items.map((it) => it.str).join(" ");
      }
      return pageTexts[p];
    }

    let foundPage = null;
    for (const pattern of PVSYST_SHADING_PATTERNS) {
      for (let p = 1; p <= pdf.numPages; p++) {
        const text = await textOf(p);
        if (pattern.test(text)) { foundPage = p; break; }
      }
      if (foundPage) break;
    }

    const pageNum = foundPage || Math.min(Math.max(fallbackPage || 1, 1), pdf.numPages);
    const dataUrl = await renderPageFromDoc(pdf, pageNum, crop);
    return { dataUrl, pageNum, autoDetected: !!foundPage };
  }

  async function tryExtractAnnualGenerationKwh(file) {
    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = "";
      for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += " " + content.items.map((it) => it.str).join(" ");
      }
      // Шаблони на кшталт "164 362 кВт·год" / "164362 kWh" поруч зі словом
      // "рік"/"річн"/"year". Це м'яка евристика, не гарантія.
      const m =
        text.match(/([\d\s.,]{4,12})\s*кВт[·*]?год[^.]{0,20}(рік|річн)/i) ||
        text.match(/(рік|річн)[^.]{0,20}?([\d\s.,]{4,12})\s*кВт[·*]?год/i) ||
        text.match(/([\d,.\s]{4,12})\s*kWh\s*\/?\s*year/i);
      if (!m) return null;
      const raw = (m[1].match(/[\d.,\s]+/) ? m[1] : m[2]).replace(/[^\d]/g, "");
      const n = parseInt(raw, 10);
      return isNaN(n) ? null : n;
    } catch (e) {
      console.warn("PDF text extraction failed (non-fatal):", e);
      return null;
    }
  }

  window.KpPdfReport = {
    renderPdfPageToDataUrl,
    renderFirstPageToDataUrl,
    renderPvsystShadingPage,
    tryExtractAnnualGenerationKwh,
  };
})();
