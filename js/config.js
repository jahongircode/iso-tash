// =====================================================================
//  Tashkent Pixel Map 3D — настройки
// =====================================================================
window.TPM = window.TPM || {};

TPM.config = {
  // старт: сквер Амира Темура; mpp — метров на «пиксель» пиксель-арта
  start: { x: 0, z: 0, mpp: 0.55 },
  minMpp: 0.12, maxMpp: 11,
  elevation: 32,          // угол камеры над горизонтом, градусы
  // граница прокрутки (метры от сквера Амира Темура): весь Ташкент + Новый Ташкент
  boundsM: { w: -16500, e: 37000, n: -17500, s: 20000 },
  treeMpp: 2.6,           // деревья видны, когда приблизились сильнее этого
  carMpp: 1.6,            // машины
  signalMpp: 0.9,         // светофоры
  treeShadowMpp: 0.9,     // деревья отбрасывают тени только вблизи
  treeLodMpp: 1.4,        // дальше этого — упрощённые кроны без теней
  farMpp: 3.0,            // дальше этого — «дальний план» (тайл-текстура + высокие дома)

  quality: {
    // shadowMpp — дальше тени выключаются; farTiles/farRes — лимит и разрешение тайлов дальнего плана;
    // tallH — с какой высоты дом остаётся 3D на дальнем плане
    low:  { label: "Эконом",  px: 3, fps: 30, cars: 70,  shadows: 0,    shadowMpp: 0,   maxTiles: 10, treeMpp: 1.9, farTiles: 30, farRes: 256, tallH: 16 },
    mid:  { label: "Норма",   px: 2, fps: 40, cars: 180, shadows: 1024, shadowMpp: 1.8, maxTiles: 16, treeMpp: 3.0, farTiles: 48, farRes: 512, tallH: 12 },
    high: { label: "Максимум", px: 2, fps: 60, cars: 320, shadows: 2048, shadowMpp: 2.6, maxTiles: 24, treeMpp: 3.0, farTiles: 70, farRes: 512, tallH: 9 },
  },
  signal: { green: 11, yellow: 2.5, allRed: 1.5 },
  cycleSeconds: 300,
};
