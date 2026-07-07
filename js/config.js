// config.js — одноразові налаштування. Дивись README.md, розділ
// "Google Cloud / Sheets API" — як отримати GOOGLE_API_KEY.
window.KP_CONFIG = {
  // Ключ Google Cloud API з увімкненим Google Sheets API (лише читання).
  // Той самий проєкт можна перевикористати з ses-calculator (там уже є
  // ключ для Maps API) — просто увімкни там ще й "Google Sheets API".
  GOOGLE_API_KEY: "AIzaSyDrh0z0gHcxjcGVVsIeLqxe7XiNr9gL_ls",

  // Назви вкладок у файлі-розрахунку — мають співпадати з реальними
  // назвами вкладок у Google Sheets. Якщо назви вкладок трохи відрізняються
  // (наприклад "ПДВ " з пробілом), онови тут.
  SHEET_TAB_PDV: "ПДВ",
  SHEET_TAB_MODEL: "Моделювання Фін. показників роботи СЕС",
    // Назва об'єкта береться з комірки A1 цієї вкладки (не з назви файлу
    // Google Sheets — назва файлу часто службова/технічна).
    SHEET_TAB_OBJECT_NAME: "Кошторис_Наявність обладнання",

  // Компанія — статичні дані для футера/умов (сторінка "Що входить та умови").
  COMPANY: {
    name: 'ТОВ «ЕСКОРЕ»',
    tagline: "Сонячні електростанції під ключ\nдля дому та бізнесу — Одеса та область",
    address: "65000, м. Одеса, вул. Леонтовича, 16-а",
    phone: "+38 075 410 00 16",
    email: "info@escore.com.ua",
    site: "escore.com.ua",
  },

  // Бізнес-правила за замовчуванням (можна перекрити у формі перед генерацією).
  DEFAULTS: {
    vatRate: 0.20,
    prepaymentPct: 70,
    validDays: 14,
    warrantyMonths: 24,
    leadTimeWeeks: "6–8",
    tariffUsdPerKwh: 0.33,
  },
};
