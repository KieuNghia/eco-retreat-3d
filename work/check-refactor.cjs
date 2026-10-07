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
const E = sandbox.Eco;
const approximately = (a, b, label) =>
  assert(Math.abs(a - b) < 1e-6, label + ": " + a + " vs " + b);

// Every catalog body's local footprint and height match its metadata.
for (const f of sandbox.furnitureCatalog) {
  const g = E.makeFurniture({ ...f, x: 0, y: 0, z: 0 });
  g.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(
    g.getObjectByName("furniture-body"),
  );
  approximately(bounds.max.x - bounds.min.x, f.w, f.name + " width");
  approximately(bounds.max.z - bounds.min.z, f.d, f.name + " depth");
  approximately(bounds.max.y, f.h, f.name + " height");
  E.geometry.dispose(g);
}
console.log("All catalog bodies match declared dimensions");

const d = modelNow();
d.furniture = [
  { type: "dining", x: 3, z: 5, w: 1.2, d: 0.8, h: 0.75, color: "#bf9c73" },
];
nodes.json.value = JSON.stringify(d);
nodes.applyJson.onclick();
draw(20000);
nodes.furnishTop.onclick();
draw(20010);
const world = getScene().getObjectByName("apartment"),
  wall = getScene().getObjectByName("continuous-walls");
const table = getScene().getObjectByName("furniture").children[0];
const body = table.getObjectByName("furniture-body"),
  accessories = table.getObjectByName("furniture-accessories");
approximately(
  new THREE.Box3().setFromObject(body).max.y,
  0.75,
  "Tabletop height excludes vase",
);
assert(
  new THREE.Box3().setFromObject(accessories).min.y >= 0.75 - 1e-6,
  "Accessories sit above tabletop",
);
assert(modelNow().furniture[0].id, "Legacy data gains persistent ID");
const tableId = modelNow().furniture[0].id;

selectPoint(3, 5);
nodes.furnishRotateRight.onclick();
draw(20020);
assert.strictEqual(
  getScene().getObjectByName("apartment"),
  world,
  "Rotation preserves world",
);
assert.strictEqual(
  getScene().getObjectByName("continuous-walls"),
  wall,
  "Rotation preserves walls",
);
assert.strictEqual(
  getScene().getObjectByName("furniture").children[0],
  table,
  "Rotation preserves selected mesh",
);
nodes.furnishCatalog.children[0].onclick();
selectPoint(3, 2);
draw(20030);
const added = getScene().getObjectByName("furniture").children[1];
assert.strictEqual(
  getScene().getObjectByName("furniture").children[0],
  table,
  "Adding leaves unrelated furniture untouched",
);
nodes.furnishW.value = "2.2";
nodes.furnishApply.onclick();
draw(20040);
assert.notStrictEqual(
  getScene().getObjectByName("furniture").children[1],
  added,
  "Resize replaces changed mesh only",
);
assert.strictEqual(getScene().getObjectByName("furniture").children[0], table);
assert.strictEqual(getScene().getObjectByName("continuous-walls"), wall);
nodes.furnishDuplicate.onclick();
const ids = modelNow().furniture.map((f) => f.id);
assert.equal(new Set(ids).size, ids.length);
nodes.furnishUndo.onclick();
nodes.furnishRedo.onclick();
assert.equal(new Set(modelNow().furniture.map((f) => f.id)).size, 3);
assert.equal(modelNow().furniture[0].id, tableId, "ID survives operations");
console.log(
  "Incremental edits preserve walls and unrelated meshes; IDs survive undo/redo",
);

// Both validation errors and unexpected mesh-construction failures retain the live state.
const current = modelNow(),
  live = getScene().getObjectByName("apartment");
let wasDisposed = false;
wall.geometry.addEventListener("dispose", () => (wasDisposed = true));
for (const corrupt of [
  (v) => (v.floors[0].kind = "missing-texture"),
  (v) => (v.furniture[0].type = "unknown-model"),
  (v) => {
    v.walls[0].x2 = v.walls[0].x1;
    v.walls[0].z2 = v.walls[0].z1;
  },
  (v) => (v.furniture[0].rotation = "bad"),
  (v) => (v.furniture[0].color = "javascript:bad"),
  (v) => (v.labels[0].text = {}),
  (v) => (v.furniture[0] = null),
]) {
  const invalid = JSON.parse(JSON.stringify(current));
  corrupt(invalid);
  nodes.json.value = JSON.stringify(invalid);
  nodes.applyJson.onclick();
  draw(20100);
  assert.strictEqual(
    getScene().getObjectByName("apartment"),
    live,
    "Bad import must not replace scene",
  );
  assert(nodes.error.textContent.startsWith("Модель не загружена:"));
  nodes.edit.onclick();
  assert.deepStrictEqual(
    modelNow(),
    current,
    "Bad import must not change data",
  );
}
const realFactory = E.makeFurniture;
E.makeFurniture = () => {
  throw Error("Simulated construction failure");
};
nodes.json.value = JSON.stringify(current);
nodes.applyJson.onclick();
E.makeFurniture = realFactory;
draw(20200);
assert.strictEqual(getScene().getObjectByName("apartment"), live);
assert(!wasDisposed, "Failed import must not dispose live geometry");
nodes.edit.onclick();
assert.deepStrictEqual(modelNow(), current);
console.log(
  "Invalid JSON and build failure leave live scene/data/resources intact",
);

const obb = { x: 0, z: 0, w: 2, d: 1, rotation: Math.PI / 4 };
assert(
  !E.collisions.circleIntersects(1, 1, 0.17, obb),
  "Empty corner of rotated AABB remains walkable",
);
assert(
  E.collisions.circleIntersects(0.5, -0.5, 0.17, obb),
  "Real rotated body blocks movement",
);
assert(!E.collisions.circleIntersects(1.5, 0, 0.17, { ...obb, rotation: 0 }));
assert(
  E.collisions.circleIntersects(1.1, 0, 0.17, { ...obb, rotation: 0 }),
  "Walker radius is respected",
);
console.log("Oriented collision and walker-radius regressions OK");
