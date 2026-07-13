// pdf-report.js — робота із PDF-звітом по генерації (наприклад, експорт з
// PVsyst/PVGIS чи іншої програми моделювання).
//
// Свідоме рішення: цифри для розрахунків (річна генерація, економія,
// окупність) беруться з вкладки "Моделювання" в Google Sheets — там вони
// вже пораховані й надійні. PDF-звіт використовується як картинка-
// підтвердження: конкретна сторінка рендериться в зображення і
// вставляється в КП (сторінка "04", джерело файлу — Google Drive-
// посилання, див. js/drive.js і app.js).
//
// Використовує pdf.js (CDN, підключено в index.html).

(function () {
  // source: ArrayBuffer (напр. з Google Drive) або File (з <input type=file>).
  // pageNum: 1-based номер сторінки; якщо виходить за межі документа —
  // береться найближча існуюча сторінка (не кидає помилку).
  async function renderPdfPageToDataUrl(source, pageNum) {
    const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const n = Math.min(Math.max(pageNum || 1, 1), pdf.numPages);
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
  }

  // Лишено для сумісності зі старим API (файл із <input type=file>,
  // раніше використовувалось на сторінці "Технічне рішення").
  async function renderFirstPageToDataUrl(file) {
    return renderPdfPageToDataUrl(file, 1);
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

  window.KpPdfReport = { renderPdfPageToDataUrl, renderFirstPageToDataUrl, tryExtractAnnualGenerationKwh };
})();
