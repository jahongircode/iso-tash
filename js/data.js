// =====================================================================
//  Маленький кэш (IndexedDB) — для фото из Wikimedia Commons.
// =====================================================================
(function () {
  const DB = { db: null };
  DB.open = () => new Promise((res) => {
    try { const r = indexedDB.open("tashkent-pixel-map-3d", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => { DB.db = r.result; res(); }; r.onerror = () => res(); } catch (e) { res(); }
  });
  DB.get = (k) => new Promise((res) => { if (!DB.db) return res(null); try { const q = DB.db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } });
  DB.set = (k, v) => { if (!DB.db) return; try { DB.db.transaction("kv", "readwrite").objectStore("kv").put(v, k); } catch (e) {} };
  TPM.DB = DB;
  TPM.cached = async (key, loader) => {
    const hit = await DB.get(key);
    if (hit && Date.now() - hit.t < 30 * 864e5) return hit.d;
    const d = await loader(); DB.set(key, { t: Date.now(), d }); return d;
  };
})();
