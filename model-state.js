"use strict";
window.Eco = window.Eco || {};

// Version 2 remains readable. New IDs are additive and survive JSON round trips.
Eco.modelState = (() => {
  const furnitureTypes = new Set([
    ...Eco.kitchenTypes,
    "rug",
    "bed",
    "sofa",
    "chair",
    "outdoorChair",
    "diningChair",
    "coffee",
    "side",
    "dining",
    "desk",
    "officeDesk",
    "officeChair",
    "wardrobe",
    "kitchen",
    "counter",
    "washer",
    "toilet",
    "basin",
    "bath",
    "wallShower",
    "cornerShower",
    "shower",
    "cabinet",
    "shelf",
    "fridge",
    "tv",
    "plant",
  ]);
  let nextId = 1;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function ensureIds(items) {
    const used = new Set(
      items.map((item) => item.id).filter((id) => typeof id === "string"),
    );
    const seen = new Set();
    for (const item of items) {
      if (typeof item.id !== "string" || !item.id || seen.has(item.id)) {
        do {
          item.id = "furniture-" + nextId++;
        } while (used.has(item.id));
        used.add(item.id);
      }
      seen.add(item.id);
    }
    return items;
  }
  function validate(d) {
    const fail = (message) => {
      throw new Error("Модель не загружена: " + message);
    };
    const object = (v) =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
    const coords = (v, keys) =>
      object(v) && keys.every((k) => number(v[k], -60, 60));
    if (!object(d) || d.version !== 2) fail("нужен JSON модели версии 2.");
    if (
      !number(d.width, 1, 30) ||
      !number(d.depth, 1, 30) ||
      !number(d.ceiling, 2, 5) ||
      !number(d.eye, 0.3, d.ceiling - 0.1) ||
      !number(d.wallThickness, 0.05, 0.5)
    )
      fail("неверные габариты, высота или толщина стен.");
    for (const key of ["walls", "floors", "furniture", "labels"]) {
      if (!Array.isArray(d[key]) || d[key].length > 500)
        fail(key + ": нужен массив до 500 объектов.");
    }
    // Bound the coordinate-grid wall union; arbitrary 500-wall imports could exhaust memory.
    if (d.walls.length > 200) fail("допускается до 200 участков стен.");
    for (const w of d.walls) {
      if (
        !coords(w, ["x1", "z1", "x2", "z2"]) ||
        Math.hypot(w.x2 - w.x1, w.z2 - w.z1) < 0.01
      )
        fail("пустой или некорректный участок стены.");
      if (w.kind === undefined) w.kind = "wall";
      if (!["wall", "window", "sliding", "rail"].includes(w.kind))
        fail("неизвестный тип стены.");
      if (w.thickness !== undefined && !number(w.thickness, 0.05, 0.8))
        fail("толщина участка должна быть от 0,05 до 0,8 м.");
    }
    for (const floor of d.floors) {
      if (
        !coords(floor, ["x", "z"]) ||
        !number(floor.w, 0.01, 60) ||
        !number(floor.d, 0.01, 60)
      )
        fail("неверные размеры пола.");
      if (!["wood", "tile", "grass"].includes(floor.kind))
        fail("неизвестный материал пола: " + String(floor.kind).slice(0, 40));
    }
    for (const f of d.furniture) {
      if (!object(f)) fail("неверный объект мебели.");
      if (f.y !== undefined && !number(f.y, 0, d.ceiling - 0.02))
        fail("неверная высота установки мебели.");
      if (f.h !== undefined && (f.y || 0) + f.h > d.ceiling + 0.001)
        fail("предмет выше потолка.");
      if (
        !coords(f, ["x", "z"]) ||
        !number(f.w, 0.1, 10) ||
        !number(f.d, 0.1, 10) ||
        (f.h !== undefined && !number(f.h, 0.02, 5))
      )
        fail("неверные размеры или координаты мебели.");
      if (!furnitureTypes.has(f.type)) fail("неизвестный тип мебели.");
      if (f.rotation !== undefined && !number(f.rotation, -100000, 100000))
        fail("неверный угол мебели.");
      if (
        f.color !== undefined &&
        (typeof f.color !== "string" || !/^#[0-9a-f]{6}$/i.test(f.color))
      )
        fail("цвет мебели должен иметь вид #aabbcc.");
      if (
        f.name !== undefined &&
        (typeof f.name !== "string" || f.name.length > 200)
      )
        fail("неверное название мебели.");
      if (f.id !== undefined && (typeof f.id !== "string" || f.id.length > 100))
        fail("неверный идентификатор мебели.");
      if (
        f.basinShape !== undefined &&
        !["rectangular", "round"].includes(f.basinShape)
      )
        fail("неизвестная форма раковины.");
    }
    for (const l of d.labels)
      if (
        !coords(l, ["x", "z"]) ||
        typeof l.text !== "string" ||
        l.text.length > 200
      )
        fail("неверная подпись помещения.");
    if (!coords(d.spawn, ["x", "z"]) || !number(d.spawn.yaw, -100000, 100000))
      fail("неверная начальная позиция.");
  }
  function prepare(value) {
    // Never normalize the caller's object, or mutate the currently displayed model.
    const candidate = clone(value);
    validate(candidate);
    ensureIds(candidate.furniture);
    return candidate;
  }
  return { clone, prepare, ensureIds, validate };
})();
