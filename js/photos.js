// =====================================================================
//  Настоящие фотографии мест из Wikimedia Commons (свободные лицензии).
//  1) главное фото статьи Википедии (ru, затем en);
//  2) если его нет — поиск по Commons.
//  Автор и лицензия берутся из метаданных Commons и показываются под фото.
//  Результат кэшируется в IndexedDB на 30 дней.
// =====================================================================
(function () {
  const P = TPM.photos = {};
  const strip = (html) => { const d = document.createElement("div"); d.innerHTML = html || ""; return (d.textContent || "").replace(/\s+/g, " ").trim(); };
  const api = (host, params) => fetch(`https://${host}/w/api.php?` + new URLSearchParams({ format: "json", origin: "*", ...params })).then((r) => r.json());

  function pick(info, title) {
    if (!info) return null;
    const ok = /image\/(jpeg|png|webp)/.test(info.mime || "") && (info.width || 1000) >= 500;
    if (!ok) return null;
    const m = info.extmetadata || {};
    return {
      src: info.thumburl || info.url,
      page: info.descriptionurl,
      title: (title || "").replace(/^File:/, ""),
      artist: strip(m.Artist && m.Artist.value) || "неизвестен",
      license: strip(m.LicenseShortName && m.LicenseShortName.value) || "см. страницу файла",
      licenseUrl: m.LicenseUrl ? m.LicenseUrl.value : null,
    };
  }
  async function fileInfo(name) {
    const j = await api("commons.wikimedia.org", { action: "query", titles: "File:" + name, prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: "900" });
    const pg = Object.values(j.query.pages)[0];
    if (!pg || pg.missing !== undefined || !pg.imageinfo) return null; // несвободное локальное фото — пропускаем
    return pick(pg.imageinfo[0], pg.title);
  }
  async function fromWiki(spec) {
    const lang = spec.slice(0, 2), title = spec.slice(3); // формат ru:Заголовок
    const j = await api(lang + ".wikipedia.org", { action: "query", prop: "pageimages", piprop: "name", redirects: "1", titles: title });
    const pg = j.query && Object.values(j.query.pages)[0];
    if (!pg || !pg.pageimage) return null;
    return fileInfo(pg.pageimage);
  }
  async function fromSearch(q) {
    const j = await api("commons.wikimedia.org", { action: "query", generator: "search", gsrsearch: q + " filetype:bitmap", gsrnamespace: "6", gsrlimit: "6", prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: "900" });
    if (!j.query) return null;
    const pages = Object.values(j.query.pages).sort((a, b) => (a.index || 0) - (b.index || 0));
    for (const pg of pages) { const r = pick(pg.imageinfo && pg.imageinfo[0], pg.title); if (r) return r; }
    return null;
  }

  const mem = new Map();
  P.get = function (l) {
    if (mem.has(l.id)) return mem.get(l.id);
    const pr = TPM.cached("photo-v1-" + l.id, async () => {
      let err = false;
      for (const w of l.wiki || []) { try { const r = await fromWiki(w); if (r) return r; } catch (e) { err = true; } }
      if (l.q) { try { const r = await fromSearch(l.q); if (r) return r; } catch (e) { err = true; } }
      if (err) throw new Error("network"); // не кэшируем «нет фото», если была ошибка сети
      return { none: true };
    }).catch(() => { mem.delete(l.id); return { none: true }; });
    mem.set(l.id, pr);
    return pr;
  };
})();
