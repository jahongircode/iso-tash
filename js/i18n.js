// =====================================================================
//  Языки интерфейса: русский, английский, узбекский (латиница).
//  Тексты в разметке помечены data-i18n (текст), data-i18n-ph (placeholder),
//  data-i18n-title (title), data-i18n-aria (aria-label).
//  Переводы описаний мест — в js/i18n-places.js.
// =====================================================================
(function () {
  const D = {
    ru: {
      langName: "Русский",
      tagline: "Живая изометрическая карта Ташкента",
      places: "Места", placesMore: " на карте",
      placesTitle: "Места",
      search: "Поиск: базар, мечеть, парк…",
      close: "Закрыть",
      all: "Все",
      empty: "Ничего не найдено — попробуйте другое слово",
      tip: "Совет", gmaps: "Google Maps ↗", route: "Маршрут ↗", prev: "◀ Пред.", next: "След. ▶",
      note: "Часы работы и цены могут меняться — уточняйте перед визитом.",
      photo: "Фото", unknownAuthor: "неизвестен", seeFile: "см. страницу файла",
      settings: "Настройки", time: "Время", anim: "Анимация", quality: "Качество", language: "Язык",
      tAuto: "Авто", tDay: "День", tNight: "Ночь", tCycle: "Цикл",
      animOn: "Вкл", animOff: "Пауза",
      qAuto: "Авто", qLow: "Эконом", qMid: "Норма", qHigh: "Максимум",
      zoomIn: "Приблизить", zoomOut: "Отдалить", rotL: "Повернуть влево (Q)", rotR: "Повернуть вправо (E)",
      compass: "Компас: красная стрелка указывает на север", compassN: "С",
      statB: "Зданий в кадре", statC: "Машин на улицах в кадре",
      bld: ["здание", "здания", "зданий"], car: ["машина", "машины", "машин"],
      data: "Данные", relief: "рельеф",
      city: "Ташкент", region: "Ташкентская область", newCity: "Новый Ташкент · строится",
      seasons: { winter: "зима", spring: "весна", summer: "лето", autumn: "осень" },
      loading: "Загружаю кварталы…",
      noThree: "Не удалось загрузить three.js",
      noGL: "Браузер не поддерживает WebGL — обновите браузер или включите аппаратное ускорение.",
      noJS: "Для работы карты включите JavaScript.",
      mapAria: "Пиксельная карта Ташкента", mmAria: "Мини-карта Ташкента",
      cats: { history: "История", religion: "Мечети и медресе", museum: "Музеи и культура", park: "Парки и отдых", market: "Рынки", modern: "Современный город", sport: "Спорт" },
    },
    en: {
      langName: "English",
      tagline: "A living isometric map of Tashkent",
      places: "Places", placesMore: " on the map",
      placesTitle: "Places",
      search: "Search: bazaar, mosque, park…",
      close: "Close",
      all: "All",
      empty: "Nothing found — try another word",
      tip: "Tip", gmaps: "Google Maps ↗", route: "Directions ↗", prev: "◀ Prev", next: "Next ▶",
      note: "Opening hours and prices may change — check before you go.",
      photo: "Photo", unknownAuthor: "unknown", seeFile: "see file page",
      settings: "Settings", time: "Time", anim: "Animation", quality: "Quality", language: "Language",
      tAuto: "Auto", tDay: "Day", tNight: "Night", tCycle: "Cycle",
      animOn: "On", animOff: "Paused",
      qAuto: "Auto", qLow: "Saver", qMid: "Normal", qHigh: "Maximum",
      zoomIn: "Zoom in", zoomOut: "Zoom out", rotL: "Rotate left (Q)", rotR: "Rotate right (E)",
      compass: "Compass: the red needle points north", compassN: "N",
      statB: "Buildings in view", statC: "Cars on the streets in view",
      bld: ["building", "buildings", "buildings"], car: ["car", "cars", "cars"],
      data: "Data", relief: "terrain",
      city: "Tashkent", region: "Tashkent Region", newCity: "New Tashkent · under construction",
      seasons: { winter: "winter", spring: "spring", summer: "summer", autumn: "autumn" },
      loading: "Loading neighbourhoods…",
      noThree: "Could not load three.js",
      noGL: "Your browser does not support WebGL — update it or turn on hardware acceleration.",
      noJS: "Please enable JavaScript to use the map.",
      mapAria: "Pixel map of Tashkent", mmAria: "Tashkent minimap",
      cats: { history: "History", religion: "Mosques & madrasahs", museum: "Museums & culture", park: "Parks & leisure", market: "Bazaars", modern: "Modern city", sport: "Sport" },
    },
    uz: {
      langName: "O'zbekcha",
      tagline: "Toshkentning jonli izometrik xaritasi",
      places: "Joylar", placesMore: " xaritada",
      placesTitle: "Joylar",
      search: "Qidiruv: bozor, masjid, bog'…",
      close: "Yopish",
      all: "Hammasi",
      empty: "Hech narsa topilmadi — boshqa so'z bilan urinib ko'ring",
      tip: "Maslahat", gmaps: "Google Maps ↗", route: "Yo'nalish ↗", prev: "◀ Oldingi", next: "Keyingi ▶",
      note: "Ish vaqti va narxlar o'zgarishi mumkin — borishdan oldin aniqlang.",
      photo: "Surat", unknownAuthor: "noma'lum", seeFile: "fayl sahifasiga qarang",
      settings: "Sozlamalar", time: "Vaqt", anim: "Animatsiya", quality: "Sifat", language: "Til",
      tAuto: "Avto", tDay: "Kunduz", tNight: "Tun", tCycle: "Sikl",
      animOn: "Yoq", animOff: "Pauza",
      qAuto: "Avto", qLow: "Tejamkor", qMid: "Me'yor", qHigh: "Maksimum",
      zoomIn: "Yaqinlashtirish", zoomOut: "Uzoqlashtirish", rotL: "Chapga burish (Q)", rotR: "O'ngga burish (E)",
      compass: "Kompas: qizil strelka shimolni ko'rsatadi", compassN: "Sh",
      statB: "Kadrdagi binolar", statC: "Kadrdagi ko'chalardagi mashinalar",
      bld: ["bino", "bino", "bino"], car: ["mashina", "mashina", "mashina"],
      data: "Ma'lumotlar", relief: "relyef",
      city: "Toshkent", region: "Toshkent viloyati", newCity: "Yangi Toshkent · qurilmoqda",
      seasons: { winter: "qish", spring: "bahor", summer: "yoz", autumn: "kuz" },
      loading: "Kvartallar yuklanmoqda…",
      noThree: "three.js yuklanmadi",
      noGL: "Brauzer WebGL'ni qo'llab-quvvatlamaydi — brauzerni yangilang yoki apparat tezlashtirishni yoqing.",
      noJS: "Xarita ishlashi uchun JavaScript'ni yoqing.",
      mapAria: "Toshkentning piksel xaritasi", mmAria: "Toshkent mini-xaritasi",
      cats: { history: "Tarix", religion: "Masjid va madrasalar", museum: "Muzey va madaniyat", park: "Bog' va dam olish", market: "Bozorlar", modern: "Zamonaviy shahar", sport: "Sport" },
    },
  };
  const LANGS = ["ru", "en", "uz"];
  const pick = () => {
    try { const s = JSON.parse(localStorage.getItem("tpm3-lang")); if (LANGS.includes(s)) return s; } catch (e) {}
    const q = new URLSearchParams(location.search).get("lang"); if (LANGS.includes(q)) return q;
    const nav = (navigator.languages || [navigator.language || "ru"]).map((x) => String(x).slice(0, 2).toLowerCase());
    for (const n of nav) { if (n === "ru" || n === "uz") return n; if (n === "en") return "en"; }
    return nav.some((n) => ["kk", "ky", "tg", "be", "uk"].includes(n)) ? "ru" : "en";
  };
  const I = TPM.i18n = { langs: LANGS, lang: pick(), dict: D, onChange: [] };
  I.t = (k) => (D[I.lang][k] ?? D.ru[k] ?? k);
  // склонение для русского: 1 здание, 2 здания, 5 зданий
  I.plural = (n, forms) => { if (I.lang !== "ru") return n === 1 ? forms[0] : forms[1]; const m = n % 100, k = n % 10; return m > 10 && m < 20 ? forms[2] : k === 1 ? forms[0] : k > 1 && k < 5 ? forms[1] : forms[2]; };
  // карточка места на текущем языке
  I.place = function (l) {
    const tr = I.lang !== "ru" && TPM.placesL10n && TPM.placesL10n[I.lang] && TPM.placesL10n[I.lang][l.id];
    if (!tr) return { name: l.name, sub: l.uz !== l.name ? l.uz : "", desc: l.desc, facts: l.facts, tip: l.tip };
    const en = TPM.placesL10n.en && TPM.placesL10n.en[l.id];
    const sub = I.lang === "en" ? (l.uz !== tr.name ? l.uz : "") : (en && en.name !== tr.name ? en.name : "");
    return { name: tr.name, sub, desc: tr.desc, facts: tr.facts, tip: tr.tip };
  };
  I.cat = (id) => (D[I.lang].cats[id] || D.ru.cats[id]);
  // кириллица → латиница (для названий кварталов без латинского варианта)
  const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h" };
  I.latin = (s) => String(s).replace(/[а-яёўқғҳ]/gi, (c) => { const r = TR[c.toLowerCase()] ?? c; return c === c.toLowerCase() ? r : r.charAt(0).toUpperCase() + r.slice(1); });
  // название района: в данных есть русское и узбекское («Yunusobod Tumani»)
  I.district = (ru, uz) => {
    if (I.lang === "ru" || !ru) return ru;
    const base = (uz || I.latin(ru)).replace(/\s+tumani$/i, "").replace(/\s+район$/i, "");
    return I.lang === "uz" ? base + " tumani" : base + " District";
  };
  I.apply = function (root = document) {
    document.documentElement.lang = I.lang;
    root.querySelectorAll("[data-i18n]").forEach((e) => { e.textContent = I.t(e.dataset.i18n); });
    root.querySelectorAll("[data-i18n-ph]").forEach((e) => { e.placeholder = I.t(e.dataset.i18nPh); });
    root.querySelectorAll("[data-i18n-title]").forEach((e) => { e.title = I.t(e.dataset.i18nTitle); });
    root.querySelectorAll("[data-i18n-aria]").forEach((e) => { e.setAttribute("aria-label", I.t(e.dataset.i18nAria)); });
  };
  I.set = function (lang) {
    if (!LANGS.includes(lang)) return;
    I.lang = lang;
    try { localStorage.setItem("tpm3-lang", JSON.stringify(lang)); } catch (e) {}
    I.apply();
    for (const f of I.onChange) try { f(lang); } catch (e) { console.warn(e); }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => I.apply()); else I.apply();
})();
