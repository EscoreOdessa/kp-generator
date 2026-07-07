// pdf-report.js — робота із завантаженим PDF-звітом по генерації
// (наприклад, експорт з PVsyst/PVGIS чи іншої програми моделювання).
//
// Свідоме рішення: цифри для розрахунків (річна генерація, економія,
// окупність) беруться з вкладки "Моделювання" в Google Sheets — там вони
// вже порахован і надійні. PDF-звіт у v1 використовується як додаток-
// підтвердження: перша сторінка рендериться в картинку і вставляється в
// КП. Якщо треба автоматично витягувати конкретні цифри саме з цього PDF
// (а не з таблиці) — знадобиться зразок такого файлу, щоб написати парсер
// під його реальну структуру (наразі зразка немає).
//
// Використовує pdf.js (CDN, підключено в index.html).

(function () {
  async function renderFirstPageToDataUrl(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
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

  window.KpPdfReport = { renderFirstPageToDataUrl, tryExtractAnnualGenerationKwh };
})();
