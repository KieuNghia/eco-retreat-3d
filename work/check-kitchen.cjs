"use strict";
const assert = require("assert");
const {
  THREE,
  sandbox,
  nodes,
  draw,
  modelNow,
  selectPoint,
  getScene,
} = require("./check-model.cjs");
const E = sandbox.Eco,
  catalog = sandbox.furnitureCatalog;
assert(
  !sandbox
    .makeApartment()
    .furniture.some((f) => ["kitchen", "counter"].includes(f.type)),
  "Old kitchen removed from default scene",
);
assert(
  sandbox.makeApartment().furniture.some((f) => f.type === "dining"),
  "Dining area preserved",
);
assert.equal(catalog.filter((f) => E.kitchenTypes.has(f.type)).length, 27);
assert(!catalog.some((f) => f.type === "worktop"), "Standalone countertops removed from catalog");
assert.equal(catalog.filter((f) => f.type === "fridge").length, 2);
for (const f of catalog.filter((f) => E.kitchenTypes.has(f.type))) {
  const item = { ...f, x: 2, z: 4 },
    g = E.makeFurniture(item);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g.getObjectByName("furniture-body"));
  assert(Math.abs(b.max.y - (f.y + f.h)) < 1e-6, f.name + " top elevation");
  assert(b.min.y >= f.y - 1e-6, f.name + " bottom elevation");
  E.geometry.dispose(g);
}
for (const type of ["baseCabinet", "drawerCabinet", "ovenHousing", "kitchenSink"]) {
  const f = catalog.find((item) => item.type === type);
  const g = E.makeFurniture({ ...f, x: 0, z: 0 });
  g.updateMatrixWorld(true);
  const slab = g.getObjectByName("integrated-worktop");
  assert(slab, `${type} includes its own countertop`);
  const top = new THREE.Box3().setFromObject(slab);
  assert(Math.abs(top.max.y - f.h) < 1e-6, `${type} countertop top matches catalog height`);
  E.geometry.dispose(g);
}
assert(E.modelState.prepare({ ...modelNow(), furniture: [{ type: "worktop", x: 3, z: 4, w: .6, d: .62, h: .04, y: .86, color: "#c5beaf" }] }).furniture.length === 1, "Legacy standalone worktop remains importable");
const original = modelNow();
nodes.json.value = JSON.stringify({ ...original, furniture: [] });
nodes.applyJson.onclick();
nodes.furnishTop.onclick();
draw(22000);
const add = (type, w) => {
  const i = catalog.findIndex((f) => f.type === type && (!w || f.w === w));
  nodes.furnishCatalog.children[i].onclick();
  selectPoint(3, 4);
  draw(22100);
};
add("baseCabinet", 0.6);
add("cooktop", 0.6);
assert.equal(
  modelNow().furniture.at(-1).y,
  0.9,
  "Cooktop is installed at worktop height",
);
assert(
  nodes.furnishWarning.textContent.startsWith("Место"),
  "Vertically separated blocks do not warn about overlap",
);
nodes.furnishY.value = "1";
nodes.furnishApply.onclick();
draw(22200);
assert.equal(modelNow().furniture.at(-1).y, 1);
assert.equal(
  getScene().getObjectByName("furniture").children.at(-1).position.y,
  1,
  "Height applies to mesh",
);
nodes.furnishUndo.onclick();
assert.equal(
  modelNow().furniture.at(-1).y,
  0.9,
  "Undo restores mounting height",
);
nodes.furnishRedo.onclick();
assert.equal(modelNow().furniture.at(-1).y, 1, "Redo restores mounting height");
const saved = modelNow();
nodes.json.value = JSON.stringify(saved);
nodes.applyJson.onclick();
draw(22300);
assert.deepStrictEqual(
  modelNow().furniture,
  saved.furniture,
  "Elevation survives JSON roundtrip",
);
const live = getScene().getObjectByName("apartment"),
  invalid = JSON.parse(JSON.stringify(saved));
invalid.furniture[0].y = 3;
nodes.json.value = JSON.stringify(invalid);
nodes.applyJson.onclick();
assert.strictEqual(
  getScene().getObjectByName("apartment"),
  live,
  "Invalid elevation does not replace scene",
);
nodes.edit.onclick();
console.log("Kitchen removal, integrated countertops, 27 kitchen modules, mounting height and JSON checks OK");
