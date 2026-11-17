const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert"),
  path = require("path");

// All paths are script-relative to the repo root.
const SRC = path.resolve(__dirname, "..");
const THREE = require(path.join(SRC, "vendor/three.min.js"));

let draw,
  latest,
  canvas,
  previewRenders = 0,
  handlers = {},
  nodes = {};
const gradient = { addColorStop() {} };
const ctx2d = new Proxy(
  {},
  {
    get: (_t, k) =>
      k === "createLinearGradient" || k === "createRadialGradient"
        ? () => gradient
        : () => {},
  },
);
const el = (id = "") => ({
  id,
  checked: true,
  value: "",
  style: {},
  dataset: {},
  userData: {},
  classList: { toggle() {}, add() {}, remove() {} },
  addEventListener(n, f) {
    this[n] = f;
  },
  children: [],
  set innerHTML(v) {
    this.html = v;
    this.children = [];
  },
  get innerHTML() {
    return this.html || "";
  },
  toDataURL() {
    return "data:image/png;base64,test";
  },
  appendChild(o) {
    this.children.push(o);
  },
  getContext() {
    return ctx2d;
  },
  querySelector(sel) {
    return sel === "img" ? this.children[0] : null;
  },
  showModal() {},
  close() {},
  click() {},
  setPointerCapture() {},
  setAttribute() {},
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 1440, height: 900 };
  },
});
THREE.WebGLRenderer = class {
  constructor() {
    this.domElement = el();
    canvas ??= this.domElement;
    this.shadowMap = {};
  }
  setPixelRatio() {}
  setSize() {}
  dispose() {}
  render(scene, camera) {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    latest = { scene, camera };
    if (this.domElement !== canvas) {
      previewRenders++;
      const meshes = [];
      scene.traverse((o) => {
        if (o.isMesh) meshes.push(o);
      });
      assert(meshes.length > 0, "Preview contains geometry");
      for (const m of meshes) {
        const b = new THREE.Box3().setFromObject(m);
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              const p = new THREE.Vector3(x, y, z).project(camera);
              assert(
                Math.abs(p.x) <= 1.01 && Math.abs(p.y) <= 1.01,
                "Furniture preview fits frame",
              );
            }
      }
    }
  }
};
const document = {
  getElementById: (id) => (nodes[id] ??= el(id)),
  createElement: () => el(),
  body: el(),
  querySelector: () => null,
  querySelectorAll: (sel) =>
    sel === ".catalog-item" ? (nodes.furnishCatalog?.children ?? []) : [],
  exitPointerLock() {},
};
const sandbox = {
  THREE,
  document,
  window: { THREE },
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  performance: { now: () => 0 },
  console,
  requestAnimationFrame: (f) => (draw = f),
  addEventListener: (n, f) => (handlers[n] = f),
  Blob,
  URL,
  setTimeout,
  clearTimeout,
};
// Map-backed localStorage: autosave and restore run headless, and a blocked
// store is exercised by clearing the map rather than deleting the global.
const storage = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    get: (k) => map.get(k),
    set: (k, v) => map.set(k, String(v)),
  };
})();
sandbox.localStorage = storage;
sandbox.window = sandbox;
vm.createContext(sandbox);

// Read index.html from the repo root to determine which scripts to load.
const htmlSrc = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const scripts = [
  ...htmlSrc.matchAll(/<script src="([^"]+)"><\/script>/g),
].map((m) => m[1]);

// If --bundle is passed, also verify the bundle contains every source.
const bundleHtml = process.argv.includes("--bundle")
  ? fs.readFileSync(path.join(SRC, "Eco-Retreat.html"), "utf8")
  : null;
const bundleScripts = bundleHtml
  ? [...bundleHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  : null;

if (bundleScripts) {
  assert.equal(
    bundleScripts.length,
    scripts.length,
    "Bundle includes every source script",
  );
  // The standalone file must open by double-click with nothing fetched, so every
  // asset — including the reference drawing — has to be inside it.
  assert(
    !/<script\s+src=|<link\s+rel="stylesheet"|@import\b/i.test(bundleHtml),
    "The bundle loads nothing outside itself",
  );
  assert(
    bundleHtml.includes('src="data:image/png;base64,'),
    "Reference drawing is inlined in the bundle",
  );
  assert(
    !bundleHtml.includes('src="reference.png"'),
    "No dangling reference.png in the bundle",
  );
  const inlined = bundleHtml.match(/src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
  assert(
    inlined &&
      Buffer.from(inlined[1], "base64").equals(
        fs.readFileSync(path.join(SRC, "reference.png")),
      ),
    "Inlined reference is the byte-identical drawing",
  );
  assert(
    fs.readFileSync(path.join(SRC, "index.html"), "utf8").includes('src="reference.png"'),
    "The source build still keeps the drawing as a separate file",
  );
  // The local vendor is loaded above; retain the instrumented WebGLRenderer.
  for (let i = 1; i < bundleScripts.length; i++)
    vm.runInContext(bundleScripts[i], sandbox, {
      filename: "bundle:" + scripts[i],
    });
} else {
  // Load from repo root sources, skipping vendor (already loaded above).
  for (const file of scripts)
    if (!file.startsWith("vendor/"))
      vm.runInContext(
        fs.readFileSync(path.join(SRC, file), "utf8"),
        sandbox,
        { filename: file },
      );
}

assert(draw, "Scene initialises");
draw(16);
let meshes = 0,
  visibleInFrustum = 0;
const frustum = new THREE.Frustum().setFromProjectionMatrix(
  new THREE.Matrix4().multiplyMatrices(
    latest.camera.projectionMatrix,
    latest.camera.matrixWorldInverse,
  ),
);
latest.scene.traverse((o) => {
  if (o.isMesh) {
    meshes++;
    for (const n of o.matrixWorld.elements) assert(Number.isFinite(n));
    if (frustum.intersectsObject(o)) visibleInFrustum++;
  }
});
assert(meshes > 200);
assert(visibleInFrustum > 200);
console.log({ meshes, visibleInFrustum });

const partition = latest.scene.getObjectByName("continuous-walls");
assert(partition);
for (let z = 3.4; z < 4.5; z += 0.025) {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(6.6, 0.35, z),
    new THREE.Vector3(1, 0, 0),
    0,
    1,
  );
  assert(
    ray.intersectObject(partition).length,
    "No unintended aperture between bedrooms at " + z,
  );
}
console.log("Shared bedroom wall is continuous in rendered geometry");

nodes.walk.onclick();
draw(32);
const start = latest.camera.position.clone();
assert.equal(start.y, 1.65);
handlers.keydown({ code: "KeyW", preventDefault() {} });
for (let i = 0; i < 20; i++) draw(48 + i * 16);
handlers.keyup({ code: "KeyW" });
assert(
  latest.camera.position.distanceTo(start) > 0.3,
  "Walk moves from initial position",
);
handlers.keydown({ code: "KeyW", preventDefault() {} });
for (let i = 0; i < 1000; i++) draw(400 + i * 16);
handlers.keyup({ code: "KeyW" });
assert(
  latest.camera.position.z > 0.17,
  "Wall collision prevents leaving envelope",
);
console.log("Movement and wall collision OK");

nodes.plan.onclick();
draw(18000);
assert(latest.camera.isOrthographicCamera);
nodes.edit.onclick();
nodes.width.value = "11";
nodes.applyDimensions.onclick();
assert(!nodes.error.textContent.includes("Ошибка"));
const data = JSON.parse(nodes.json.value);
assert.equal(data.width, 11);
assert(
  Math.abs(
    data.furniture[0].x - (sandbox.makeApartment().furniture[0].x * 11) / 10.5,
  ) < 1e-8,
);
console.log("Plan camera and geometry resizing OK");

draw(18100);
nodes.drawingOpen.onclick();
assert.equal(
  (nodes.drawingRows.innerHTML.match(/<tr /g) || []).length,
  data.walls.length,
  "Every model wall has a dimension row",
);
assert(
  nodes.drawingCanvas.innerHTML.includes("X: 11.000 м"),
  "Drawing uses resized model",
);

document.getElementById("tapeSurface").checked = false;
nodes.tape.onclick();
function selectPoint(x, z) {
  const p = new THREE.Vector3(x, 0, z).project(latest.camera),
    e = {
      clientX: (p.x + 1) * 720,
      clientY: (1 - p.y) * 450,
      button: 0,
      pointerId: 1,
    };
  canvas.pointerdown(e);
  canvas.pointerup(e);
}
selectPoint(2, 2);
selectPoint(5, 6);
assert(
  nodes.tapeResult.textContent.startsWith("5.000 м"),
  "Floor tape measures 3-4-5 diagonal exactly",
);
assert.equal(latest.scene.getObjectByName("floor-tape").children.length, 3);

selectPoint(3, 3);
assert(
  nodes.tapeResult.textContent.includes("Первая точка"),
  "Third click starts new measurement",
);
nodes.tapeClear.onclick();
assert.equal(latest.scene.getObjectByName("floor-tape").children.length, 0);

nodes.tapeSurface.checked = true;
selectPoint(0, 2);
selectPoint(0, 4);
assert(
  nodes.tapeResult.textContent.startsWith("2.000 м"),
  "Wall hits projected to floor",
);
nodes.tape.onclick();
assert(nodes.tapePanel.hidden);
console.log(
  "2D wall schedule, resize, diagonal tape, wall projection, restart and clear OK",
);

const modelNow = () => JSON.parse(nodes.json.value);
const count = modelNow().furniture.length;

nodes.tape.onclick();
nodes.furnish.onclick();
draw(18200);
assert(
  !nodes.furnishPanel.hidden && nodes.tapePanel.hidden,
  "Editor and tape are mutually exclusive",
);
assert(latest.camera.isPerspectiveCamera, "Furnishing opens in 3D");

// Keep legacy exact-coordinate gesture assertions independent of the new magnet.
document.getElementById("furnishMagnet").checked = false;
nodes.furnishTop.onclick();
draw(18250);
assert.equal(
  nodes.furnishCatalog.children.length,
  sandbox.window.furnitureCatalog.length,
);
nodes.furnishCatalog.children[0].onclick();
selectPoint(2, 2);
draw(18300);
assert.equal(
  modelNow().furniture.length,
  count + 1,
  "Add catalog item on floor",
);
assert.equal(modelNow().furniture.at(-1).w, 2);

nodes.furnishRotateRight.onclick();
draw(18400);
assert(Math.abs(modelNow().furniture.at(-1).rotation + Math.PI / 2) < 1e-8);

nodes.furnishW.value = "1.8";
nodes.furnishD.value = "1.4";
nodes.furnishH.value = ".8";
nodes.furnishApply.onclick();
draw(18500);
assert.equal(modelNow().furniture.at(-1).d, 1.4, "Editable dimensions");
assert.equal(modelNow().furniture.at(-1).h, 0.8);

function pointerAt(x, z) {
  const p = new THREE.Vector3(x, 0, z).project(latest.camera);
  return {
    clientX: (p.x + 1) * 720,
    clientY: (1 - p.y) * 450,
    button: 0,
    pointerId: 1,
  };
}
canvas.pointerdown(pointerAt(2, 2));
canvas.pointermove(pointerAt(2.4, 2.6));
canvas.pointerup(pointerAt(2.4, 2.6));
draw(18600);
assert(
  Math.abs(modelNow().furniture.at(-1).x - 2.4) < 1e-8,
  "Drag furniture in X",
);
assert(
  Math.abs(modelNow().furniture.at(-1).z - 2.6) < 1e-8,
  "Drag furniture in Z",
);

nodes.furnishDuplicate.onclick();
assert.equal(modelNow().furniture.length, count + 2);
nodes.furnishDelete.onclick();
assert.equal(modelNow().furniture.length, count + 1);
nodes.furnishUndo.onclick();
assert.equal(modelNow().furniture.length, count + 2);
nodes.furnishRedo.onclick();
assert.equal(modelNow().furniture.length, count + 1);

nodes.furnishCatalog.children[20].onclick();
selectPoint(0, 2);
assert(
  nodes.furnishWarning.textContent.includes("границ") ||
    nodes.furnishWarning.textContent.includes("стен"),
  "Warn about wall intersection",
);

nodes.walk.onclick();
assert(nodes.furnishPanel.hidden, "Walking exits furnishing");
draw(18700);
assert.equal(latest.camera.position.y, 1.65);

nodes.furnish.onclick();
nodes.tape.onclick();
assert(nodes.furnishPanel.hidden && !nodes.tapePanel.hidden);
nodes.tape.onclick();
nodes.furnish.onclick();
nodes.furnishCatalog.children[1].onclick();
handlers.keydown({ code: "Escape", preventDefault() {} });
const beforeCancel = modelNow().furniture.length;
selectPoint(3, 3);
assert.equal(modelNow().furniture.length, beforeCancel);
console.log(
  "Furniture catalog/add/drag/resize/rotate/duplicate/delete/undo/redo/warnings/mode switching OK",
);

nodes.furnish3D.onclick();
draw(18800);
assert(latest.camera.isPerspectiveCamera);
nodes.furnishCatalog.children[10].onclick();
canvas.pointermove(pointerAt(3, 5));
let ghost = latest.scene.getObjectByName("placement-preview");
assert(ghost?.visible, "Ghost follows cursor in 3D");
assert(
  Math.abs(ghost.position.x - 3) < 1e-8 &&
    Math.abs(ghost.position.z - 5) < 1e-8,
);
handlers.keydown({ code: "KeyR", preventDefault() {} });
assert(Math.abs(ghost.rotation.y + Math.PI / 2) < 1e-8);
selectPoint(3, 5);
draw(18900);
assert(!latest.scene.getObjectByName("placement-preview"));
assert(
  Math.abs(modelNow().furniture.at(-1).rotation + Math.PI / 2) < 1e-8,
  "Preview rotation carried into placed model",
);

const cameraBefore = latest.camera.position.clone(),
  itemsBefore = JSON.stringify(modelNow().furniture);
const from = pointerAt(3, 5),
  to = { ...from, clientX: from.clientX + 50, clientY: from.clientY + 10 };
canvas.pointerdown({ ...from, altKey: true });
canvas.pointermove({ ...to, altKey: true, buttons: 1 });
canvas.pointerup(to);
draw(19000);
assert(
  latest.camera.position.distanceTo(cameraBefore) > 0.1,
  "Alt-drag orbits even over furniture",
);
assert.equal(
  JSON.stringify(modelNow().furniture),
  itemsBefore,
  "Orbit does not move furniture",
);

nodes.furnishCamera.onclick();
const prior = latest.camera.position.clone();
canvas.pointerdown(from);
canvas.pointermove({ ...to, buttons: 1 });
canvas.pointerup(to);
draw(19100);
assert(latest.camera.position.distanceTo(prior) > 0.1, "Camera tool orbits");
nodes.furnishCamera.onclick();
console.log(
  "All catalog previews fit frames; 3D editor, placement ghost, rotation and camera gestures OK",
);

const movedBefore = modelNow().furniture.at(-1),
  viewBefore = latest.camera.position.clone();
const surface = new THREE.Vector3(movedBefore.x, 0.41, movedBefore.z).project(
    latest.camera,
  ),
  startDrag = {
    clientX: (surface.x + 1) * 720,
    clientY: (1 - surface.y) * 450,
    button: 0,
    pointerId: 1,
  };
const pickRay = new THREE.Raycaster();
pickRay.setFromCamera(new THREE.Vector2(surface.x, surface.y), latest.camera);
const floorHit = pickRay.ray.intersectPlane(
  new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  new THREE.Vector3(),
);
canvas.pointerdown(startDrag);
canvas.pointermove({
  ...pointerAt(floorHit.x + 0.3, floorHit.z + 0.4),
  buttons: 1,
});
canvas.pointerup(pointerAt(floorHit.x + 0.3, floorHit.z + 0.4));
draw(19200);
assert(
  Math.abs(modelNow().furniture.at(-1).x - movedBefore.x - 0.3) < 1e-7,
  "Furniture moves horizontally in perspective",
);
assert(Math.abs(modelNow().furniture.at(-1).z - movedBefore.z - 0.4) < 1e-7);
assert(
  latest.camera.position.distanceTo(viewBefore) < 1e-8,
  "Moving furniture does not orbit camera",
);
console.log("Perspective dragging preserves floor position and camera");

// The magnet in the live editor: pressing a cabinet into a partition joins it and
// squares an angled draft, Ctrl keeps the move free, and undo restores the draft.
document.getElementById("furnishMagnet").checked = true;
const layout = modelNow();
const collide = sandbox.Eco.collisions;
const cabinets = sandbox.window.furnitureCatalog.filter(
  (f) => f.type === "wardrobe" || f.type === "cabinet",
);
// Find an interior partition whose flush spot is free of other walls and furniture;
// otherwise every candidate there is blocked and the magnet stays inert.
const freeAt = (w, item) => {
  const points = collide.polygon({
    x: (w.x1 + w.x2) / 2,
    z: w.z1 + (w.thickness ?? layout.wallThickness) / 2 + item.d / 2,
    w: item.w,
    d: item.d,
  });
  return (
    points.every((p) => p.x > 0 && p.z > 0 && p.x < layout.width && p.z < layout.depth) &&
    !layout.walls.some(
      (other) =>
        other !== w &&
        other.kind !== "sliding" &&
        collide.overlap(points, collide.polygon(collide.wall(other, layout.wallThickness))),
    ) &&
    !layout.furniture.some(
      (f) => f.type !== "rug" && collide.overlap(points, collide.polygon(f)),
    )
  );
};
const attempt = layout.walls
  .filter(
    (w) => w.kind === "wall" && w.z1 === w.z2 && w.z1 > 0 && w.z1 < layout.depth,
  )
  .flatMap((w) => cabinets.map((item) => ({ w, item })))
  .find(({ w, item }) => freeAt(w, item));
assert(attempt, "The layout has an interior partition with room to snap against");
const partitionWall = attempt.w,
  wardrobe = attempt.item,
  flushZ = partitionWall.z1 + (partitionWall.thickness ?? layout.wallThickness) / 2 + wardrobe.d / 2,
  wallCentre = (partitionWall.x1 + partitionWall.x2) / 2;
nodes.furnishCatalog.children[sandbox.window.furnitureCatalog.indexOf(wardrobe)].onclick();
draw(19260);
// Deliberately pressed 0.1 m through the partition face.
const pressed = pointerAt(wallCentre, flushZ - 0.1);
canvas.pointermove(pressed);
canvas.pointerdown(pressed);
canvas.pointerup(pressed);
draw(19300);
const placed = modelNow().furniture.at(-1);
assert.equal(placed.type, wardrobe.type, "The catalog item was placed");
assert(Math.abs(placed.z - flushZ) < 1e-6, "Placement joins the partition");
assert(
  nodes.furnishMessage.textContent.includes("магнитной привязкой"),
  "Placement reports the magnet",
);

const draftAngle = (15 * Math.PI) / 180;
nodes.furnishAngle.value = "15";
nodes.furnishApply.onclick();
draw(19330);
assert(Math.abs(modelNow().furniture.at(-1).rotation - draftAngle) < 1e-9);

const onItem = (x, z, y = 0.41) => {
  const p = new THREE.Vector3(x, y, z).project(latest.camera);
  return {
    clientX: (p.x + 1) * 720,
    clientY: (1 - p.y) * 450,
    button: 0,
    pointerId: 1,
  };
};
// A drag moves by the difference of two floor hits, so the target is built from the
// floor point the down ray hit: the item stays on its own line rather than drifting
// sideways into a neighbouring wall.
const dragRay = new THREE.Raycaster(),
  floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const floorOf = (event) => {
  dragRay.setFromCamera(
    new THREE.Vector2(event.clientX / 720 - 1, 1 - event.clientY / 450),
    latest.camera,
  );
  return dragRay.ray.intersectPlane(floorPlane, new THREE.Vector3());
};

// Drag away with Ctrl held: no join, the draft angle survives.
const awayDown = onItem(placed.x, placed.z),
  awayFrom = floorOf(awayDown),
  awayTo = pointerAt(awayFrom.x, awayFrom.z + 0.35);
canvas.pointerdown(awayDown);
canvas.pointermove({ ...awayTo, buttons: 1, ctrlKey: true });
canvas.pointerup(awayTo);
draw(19360);
const free = modelNow().furniture.at(-1);
assert(free.z > flushZ + 0.3, "Ctrl drag leaves the magnet inactive");
assert(Math.abs(free.rotation - draftAngle) < 1e-9, "Ctrl drag keeps the draft angle");

// Drag back onto the partition: the magnet joins and squares the draft.
const joinDown = onItem(free.x, free.z),
  joinFrom = floorOf(joinDown),
  joinTo = pointerAt(joinFrom.x, joinFrom.z + (flushZ + 0.05 - free.z));
canvas.pointerdown(joinDown);
canvas.pointermove({ ...joinTo, buttons: 1 });
canvas.pointerup(joinTo);
draw(19390);
const joinedAgain = modelNow().furniture.at(-1);
assert(Math.abs(joinedAgain.z - flushZ) < 1e-6, "Dragging into the partition joins it");
assert.equal(joinedAgain.rotation, 0, "The draft is squared to the partition");
nodes.furnishUndo.onclick();
draw(19420);
const reverted = modelNow().furniture.at(-1);
assert(
  Math.abs(reverted.rotation - draftAngle) < 1e-9,
  "Undo restores the angle the magnet squared away",
);
assert(Math.abs(reverted.z - free.z) < 1e-6, "Undo restores the pre-drag position");
console.log("Magnet joins partitions in the editor and squares angled drafts");

const snap = sandbox.Eco.snapFurniture;
const snapData = {
  width: 10,
  depth: 10,
  wallThickness: 0.16,
  walls: [],
  furniture: [{ type: "wardrobe", x: 4, z: 4, w: 1, d: 0.6, h: 2 }],
};
const cabinet = { type: "wardrobe", x: 5.63, z: 4.08, w: 2, d: 0.6, h: 2 };
const joined = snap(snapData, cabinet);
assert(Math.abs(joined.x - 5.5) < 1e-8);
assert(Math.abs(joined.z - 4) < 1e-8, "Cabinet ends align");
assert.equal(joined.targetIndex, 0);
assert.equal(snap(snapData, { ...cabinet, x: 5.85 }).targetIndex, -1);

snapData.furniture[0].rotation = Math.PI / 2;
const rotated = snap(
  snapData,
  { ...cabinet, x: 4.08, z: 5.63, rotation: Math.PI / 2 },
);
assert(Math.abs(rotated.x - 4) < 1e-8 && Math.abs(rotated.z - 5.5) < 1e-8);

snapData.furniture[0].rotation = 0;
snapData.furniture.push({ type: "wardrobe", x: 5.5, z: 4, w: 0.2, d: 0.6, h: 2 });
// A join that would leave the cabinet through the obstacle is refused: the magnet
// settles flush on one of its faces instead.
const settled = snap(snapData, cabinet);
assert(
  !collide.overlap(
    collide.polygon({ ...cabinet, ...settled }),
    collide.polygon(snapData.furniture[1]),
  ),
  "A snap never lands inside an obstacle",
);
assert(
  Math.abs(Math.abs(settled.z - 4) - 0.6) < 1e-6,
  "The cabinet ends flush against the obstacle",
);

snapData.furniture = [{ type: "dining", x: 4, z: 4, w: 1.2, d: 0.8, h: 0.75 }];
const chair = snap(
  snapData,
  { type: "diningChair", x: 5.07, z: 4, w: 0.6, d: 0.55, h: 0.9 },
);
assert.equal(chair.targetIndex, 0);
assert(Math.abs(chair.x - 4.9) < 1e-8, "Chair meets table edge");

// Walls and room edges are magnet targets too: pressing an item on them joins it
// instead of refusing, and an angled draft is squared to the face it joined.
const wallData = {
  width: 8,
  depth: 6,
  wallThickness: 0.16,
  walls: [{ x1: 0, x2: 8, z1: 1, z2: 1, kind: "wall" }],
  furniture: [],
};
const flush = snap(wallData, { type: "wardrobe", x: 4, z: 1.18, w: 1.8, d: 0.6, h: 2.2 });
assert(flush.targetIndex < 0, "Wall snap reports a wall target");
assert(Math.abs(flush.z - 1.38) < 1e-6, "A cabinet sunk into a partition is pushed flush");

const angled = snap(wallData, {
  type: "wardrobe",
  x: 4,
  z: 1.2,
  w: 1.8,
  d: 0.6,
  h: 2.2,
  rotation: (15 * Math.PI) / 180,
});
assert(angled.targetIndex < 0, "A 15° draft still snaps to the partition");
assert(Math.abs(angled.rotation) < 1e-9, "The draft is squared to the wall axis");
assert(Math.abs(angled.z - 1.38) < 1e-6);

const openRoom = { width: 8, depth: 6, wallThickness: 0.16, walls: [], furniture: [] };
const edge = snap(openRoom, { type: "wardrobe", x: 7.6, z: 3, w: 0.6, d: 1.8, h: 2.2 });
assert(edge.targetIndex < 0, "Room edge reports a boundary target");
assert(Math.abs(edge.x - 7.7) < 1e-6, "Furniture joins the room edge");

// Only near-parallel faces join (cos ~26°), so the coarser 30° and 45° drafts are
// left alone rather than squared to the nearest axis. A refused snap reports no
// rotation at all, and the editor then keeps the angle the draft was given.
for (const degrees of [30, 45]) {
  const untouched = snap(openRoom, {
    type: "wardrobe",
    x: 7.6,
    z: 3,
    w: 0.6,
    d: 1.8,
    h: 2.2,
    rotation: (degrees * Math.PI) / 180,
  });
  assert.equal(untouched.targetIndex, -1, `A ${degrees}° draft is not snapped`);
  assert(
    Math.abs(untouched.x - 7.6) < 1e-9 && Math.abs(untouched.z - 3) < 1e-9,
    `A ${degrees}° draft is not moved`,
  );
  assert.equal(
    untouched.rotation,
    undefined,
    `A ${degrees}° draft keeps the angle the editor asked for`,
  );
}
assert.equal(sandbox.Eco.collisions.heightOf({}), 1, "One shared height default");

console.log(
  "Furniture magnet joins cabinets and chairs without crossing obstacles",
);

// Undo must survive edits made outside the furniture editor: a dimension change
// rebuilds the whole model, so it is recorded as a model delta, not discarded.
const layoutBefore = JSON.stringify(modelNow());
nodes.width.value = "11.5";
nodes.applyDimensions.onclick();
draw(19300);
assert.equal(modelNow().width, 11.5, "Model-level edit applies");
nodes.furnishUndo.onclick();
assert.equal(modelNow().width, 11, "Undo survives a model-level edit");
assert.equal(JSON.stringify(modelNow()), layoutBefore, "Undo restores the whole model");
nodes.furnishRedo.onclick();
assert.equal(modelNow().width, 11.5, "Redo replays the model-level edit");
nodes.furnishUndo.onclick();
assert.equal(modelNow().width, 11, "Undo again returns the previous model");
assert.equal(JSON.stringify(modelNow()), layoutBefore, "Model roundtrip is lossless");
console.log("Undo and redo survive model-level edits");

// The checks below change the layout, so they work from the state the previous
// checks left behind and put it back intact for the async checks.
const pristine = JSON.stringify(modelNow());
const uiFields = {
  width: nodes.width.value,
  depth: nodes.depth.value,
  height: nodes.height.value,
  eye: nodes.eye.value,
};
const loadModel = (model) => {
  nodes.json.value = typeof model === "string" ? model : JSON.stringify(model);
  nodes.applyJson.onclick();
  draw(19500);
};
const restoreLayout = () => {
  loadModel(pristine);
  for (const id of Object.keys(uiFields)) nodes[id].value = uiFields[id];
  assert.equal(JSON.stringify(modelNow()), pristine, "The layout is restored intact");
};
// Wall crossings, envelope containment and item-item interpenetration for a model.
const audit = (d) => {
  const walls = d.walls
    .filter((w) => w.kind !== "sliding")
    .map((w) => collide.polygon(collide.wall(w, d.wallThickness)));
  const items = d.furniture.filter((f) => f.type !== "rug");
  const footprints = items.map((f) => collide.polygon(f));
  return {
    crossing: items.flatMap((f, i) =>
      walls.flatMap(
        (wallPoints, j) =>
          collide.penetration(footprints[i], wallPoints) > 0.015 ?
            [`${f.id}:wall${j}`] :
            [],
      ),
    ),
    outside: items
      .filter(
        (f, i) =>
          footprints[i].some(
            (p) =>
              p.x < -1e-6 ||
              p.z < -1e-6 ||
              p.x > d.width + 1e-6 ||
              p.z > d.depth + 1e-6,
          ),
      )
      .map((f) => f.id),
    overlaps: footprints.flatMap((a, i) =>
      footprints.slice(i + 1).flatMap((b, j) => {
        const depth = collide.penetration(a, b);
        return depth > 0.015 ?
          [{ pair: `${items[i].id}+${items[i + j + 1].id}`, depth }] :
          [];
      }),
    ),
  };
};

// A burst that mixes furniture edits with a model-level edit must unwind in exact
// reverse order: six undos return the starting model, six redos replay every step.
document.getElementById("furnishMagnet").checked = false;
// The magnet checks above leave the editor open; clicking it again would close it.
if (nodes.furnishPanel.hidden) nodes.furnish.onclick();
const burst = modelNow();
const startCount = burst.furniture.length;
// Find a catalog item that has a floor spot clear of walls and other furniture, so
// none of the burst's edits is refused by a collision halfway through.
const fitsAt = (item, x, z) => {
  const points = collide.polygon({ x, z, w: item.w, d: item.d, rotation: 0 });
  return (
    points.every((p) => p.x > 0 && p.z > 0 && p.x < burst.width && p.z < burst.depth) &&
    !burst.walls.some(
      (w) =>
        w.kind !== "sliding" &&
        collide.overlap(points, collide.polygon(collide.wall(w, burst.wallThickness))),
    ) &&
    !burst.furniture.some(
      (f) => f.type !== "rug" && collide.overlap(points, collide.polygon(f)),
    )
  );
};
const spotFor = (item) => {
  for (let x = 0.4; x <= burst.width - 0.4; x += 0.2)
    for (let z = 0.4; z <= burst.depth - 0.4; z += 0.2) {
      // The click is a ray, so only accept a spot the camera can actually reach:
      // a point behind a wall or off frame never places an item.
      const hit = floorOf(pointerAt(x, z));
      if (!hit || Math.abs(hit.x - x) > 0.2 || Math.abs(hit.z - z) > 0.2) continue;
      if (fitsAt(item, hit.x, hit.z)) return { x: hit.x, z: hit.z };
    }
  return null;
};
const placement = sandbox.window.furnitureCatalog
  .map((item, index) => ({ item, index, spot: spotFor(item) }))
  .find((candidate) => candidate.spot);
assert(placement, "The layout has a free floor spot for the mixed burst");
assert.equal(
  nodes.furnishCatalog.children.length,
  sandbox.window.furnitureCatalog.length,
  "The catalog shows every item, so card positions match",
);
const spot = placement.spot;
nodes.furnishCatalog.children[placement.index].onclick();
selectPoint(spot.x, spot.z);
nodes.furnishW.value = String(placement.item.w * 0.8);
nodes.furnishD.value = String(placement.item.d * 0.8);
nodes.furnishH.value = String(placement.item.h * 0.8);
nodes.furnishApply.onclick();
nodes.furnishDuplicate.onclick();
nodes.furnishDelete.onclick();
selectPoint(spot.x, spot.z);
nodes.furnishRotateRight.onclick();
nodes.width.value = "11.5";
nodes.depth.value = uiFields.depth;
nodes.applyDimensions.onclick();
draw(19560);
assert.equal(modelNow().furniture.length, startCount + 1, "The burst adds one item");
assert.equal(modelNow().width, 11.5, "The burst resizes the apartment");
const burstEnd = JSON.stringify(modelNow());
assert.notEqual(burstEnd, pristine, "The burst changed the model");
for (let i = 0; i < 6; i++) nodes.furnishUndo.onclick();
draw(19600);
assert.equal(JSON.stringify(modelNow()), pristine, "Six undos rewind the mixed burst");
assert.equal(modelNow().furniture.length, startCount, "Rewinding removes the added item");
for (let i = 0; i < 6; i++) nodes.furnishRedo.onclick();
draw(19640);
assert.equal(JSON.stringify(modelNow()), burstEnd, "Six redos replay the mixed burst");
restoreLayout();
console.log("Interleaved furniture and model edits rewind and replay exactly");

// Resizing must never push furniture through a wall or outside the room, and an
// aspect-preserving resize must scale existing overlaps exactly, not invent new ones.
// The audit runs on the shipped apartment rather than the model the editor checks
// have mutated, so "no crossings" is a real requirement, not a comparison.
const shipped = sandbox.Eco.modelState.prepare(sandbox.makeApartment());
loadModel(shipped);
const reference = audit(shipped);
assert.deepEqual(reference.crossing, [], "The shipped layout crosses no wall");
assert.deepEqual(reference.outside, [], "The shipped layout fits the envelope");
for (const [w, z] of [[9, 7], [12, 7], [9, 10], [12, 10]]) {
  nodes.width.value = String(w);
  nodes.depth.value = String(z);
  nodes.applyDimensions.onclick();
  draw(19700);
  const resized = modelNow();
  assert.equal(resized.width, w, `Resized to ${w} m wide`);
  assert.equal(resized.depth, z, `Resized to ${z} m deep`);
  const a = audit(resized);
  assert.deepEqual(a.crossing, [], `Nothing crosses a wall at ${w}×${z}`);
  assert.deepEqual(a.outside, [], `Nothing leaves the envelope at ${w}×${z}`);
}
for (const k of [1.05, 0.95]) {
  nodes.width.value = String(shipped.width * k);
  nodes.depth.value = String(shipped.depth * k);
  nodes.applyDimensions.onclick();
  draw(19760);
  const scaled = audit(modelNow());
  assert.equal(
    scaled.overlaps.length,
    reference.overlaps.length,
    `Overlap count at k=${k}`,
  );
  scaled.overlaps.forEach((hit, i) => {
    assert.equal(hit.pair, reference.overlaps[i].pair, `Same overlap pair at k=${k}`);
    assert(
      Math.abs(hit.depth - reference.overlaps[i].depth * k) < 1e-6,
      `Overlap scales exactly at k=${k}`,
    );
  });
}
restoreLayout();
console.log(
  "Resizing keeps furniture clear of walls, inside the room and unchanged in overlap",
);

// A rotated cabinet is collided with its real footprint, not an axis-aligned box: a
// walker stops on the corner that juts into the lane and passes freely beside it.
const cornerLane = (x) => ({
  version: 2,
  width: 10,
  depth: 8,
  ceiling: 2.8,
  eye: 1.65,
  wallThickness: 0.16,
  walls: [
    { x1: 0, z1: 0, x2: 10, z2: 0, kind: "wall" },
    { x1: 0, z1: 8, x2: 10, z2: 8, kind: "wall" },
    { x1: 0, z1: 0, x2: 0, z2: 8, kind: "wall" },
    { x1: 10, z1: 0, x2: 10, z2: 8, kind: "wall" },
  ],
  floors: [],
  labels: [],
  furniture: [
    {
      id: "corner-wardrobe",
      type: "wardrobe",
      x: 5,
      z: 5,
      w: 2.4,
      d: 0.6,
      h: 2.4,
      rotation: Math.PI / 4,
    },
  ],
  spawn: { x, y: 1.65, z: 7.2, yaw: 0 },
});
const lane = (x) => {
  loadModel(cornerLane(x));
  nodes.walk.onclick();
  assert(nodes.furnishPanel.hidden, "Walking exits furnishing");
  handlers.keydown({ code: "KeyW", preventDefault() {} });
  for (let i = 0; i < 250; i++) draw(19820 + i * 16);
  handlers.keyup({ code: "KeyW" });
  const position = latest.camera.position;
  assert(Math.abs(position.x - x) < 1e-6, "Walking straight keeps the lane");
  assert(
    !collide.circleIntersects(position.x, position.z, 0.17, cornerLane(x).furniture[0]),
    "The walker never enters the rotated footprint",
  );
  return position;
};
// The corner nearest this lane reaches z 6.06. An axis-aligned box of the same
// cabinet reaches z 5.3, so a walker would pass through the swept footprint.
const blockedLane = lane(4.4);
assert(blockedLane.z > 5.9, "The walker stops on the jutting corner");
assert(blockedLane.z < 6.6, "The walker stops at the corner, not past it");
// Just outside the corner the same lane stays open, so a walker walks past it.
const openLane = lane(3.7);
assert(openLane.z < 4.5, "The lane beside the corner stays open");
restoreLayout();
nodes.furnish.onclick();
assert(latest.camera.isPerspectiveCamera, "Editing returns to the 3D camera");
console.log(
  "The walker is collided with rotated furniture, not with an axis-aligned box",
);

async function checkLazyPreviews() {
  for (
    let k = 0;
    k < 200 && previewRenders < sandbox.furnitureCatalog.length;
    k++
  )
    await new Promise((r) => setTimeout(r, 0));
  assert.equal(
    previewRenders,
    sandbox.furnitureCatalog.length,
    "Lazy previews render each catalog item exactly once",
  );
  assert(
    nodes.furnishCatalog.children.every((b) =>
      b.children[0].src.startsWith("data:image/png"),
    ),
    "Every catalog card has preview",
  );
  console.log("Lazy per-category previews render into cards exactly once");
}

async function waitForSaved(after) {
  const key = sandbox.Eco.autosave.KEY;
  for (let k = 0; k < 40; k++) {
    await new Promise((r) => setTimeout(r, 100));
    const raw = storage.get(key);
    if (!raw) continue;
    const stored = JSON.parse(raw);
    if (stored.savedAt > after && stored.data?.version === 2) return stored;
  }
  return null;
}

async function checkAutosave() {
  const key = sandbox.Eco.autosave.KEY,
    last = modelNow().furniture.at(-1),
    before = JSON.stringify(modelNow());
  storage.clear();
  assert.equal(
    nodes.savedAt.textContent,
    "Изменения автосохраняются в этом браузере",
    "Footer starts with the idle notice",
  );

  // A manual download is a checkpoint too, and its file name is timestamped.
  nodes.export.onclick();
  assert(
    /^Скачан eco-retreat-model-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/.test(
      nodes.error.textContent,
    ),
    "Export reports a timestamped file name",
  );
  assert(storage.get(key), "Manual export records a checkpoint");
  assert(
    /^eco-retreat-model-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/.test(
      sandbox.Eco.autosave.exportName(),
    ),
    "Export name format",
  );

  // An edit is buffered, not written on every gesture; pagehide flushes it, and
  // Undo still returns the item to its previous rotation.
  storage.clear();
  selectPoint(last.x, last.z);
  nodes.furnishRotateRight.onclick();
  assert.equal(storage.get(key), undefined, "Autosave waits for the edit burst");
  nodes.furnishUndo.onclick();
  assert.equal(JSON.stringify(modelNow()), before, "Undo restores the rotation");
  handlers.pagehide?.();
  const flushed = JSON.parse(storage.get(key));
  assert(
    flushed?.savedAt > 0 && flushed.data?.version === 2,
    "pagehide flushes pending changes",
  );
  assert(
    /^Автосохранение · \d{2}:\d{2}$/.test(nodes.savedAt.textContent),
    "Footer reports the last save time",
  );

  const loaded = sandbox.Eco.autosave.load();
  assert(loaded?.model && loaded.savedAt > 0, "Stored model loads back");
  assert.equal(
    JSON.stringify(loaded.model.furniture),
    JSON.stringify(modelNow().furniture),
    "Furniture survives the autosave roundtrip",
  );

  storage.set(key, "{не json");
  assert.equal(sandbox.Eco.autosave.load(), null, "Corrupt autosave is ignored");
  assert.equal(storage.get(key), undefined, "Corrupt entry is dropped");

  // The debounce timer writes on its own, without a flush. Other checkers share
  // this sandbox and edit the model concurrently, so only the write itself is
  // asserted, not the exact snapshot.
  storage.clear();
  const since = Date.now();
  nodes.applyDimensions.onclick();
  assert.equal(storage.get(key), undefined, "Model-level edit is buffered");
  assert(await waitForSaved(since), "Debounced autosave stores the model");
  assert(
    /^Автосохранение · \d{2}:\d{2}$/.test(nodes.savedAt.textContent),
    "Footer reports the debounced save time",
  );
  console.log(
    "Autosave debounce, pagehide flush, timestamped export and corrupt-entry recovery OK",
  );
}

// The downloaded file has to load back exactly: export → import → export returns the
// same bytes. The guards for size, item count, wall count and version run before the
// scene is rebuilt, so a refused file leaves the live model untouched.
async function checkImportRoundTrip() {
  const captured = [];
  const realURL = sandbox.URL;
  sandbox.URL = {
    createObjectURL: (blob) => (captured.push(blob), "blob:eco-retreat"),
    revokeObjectURL() {},
  };
  const send = async (text) => {
    await nodes.import.onchange({
      target: { files: [{ size: text.length, text: async () => text }], value: "" },
    });
    assert.equal(nodes.import.value, "", "The file field is cleared after a load attempt");
  };
  try {
    nodes.export.onclick();
    assert.equal(captured.length, 1, "Export hands the browser one file");
    const payload = await captured[0].text();
    assert.equal(payload, nodes.json.value, "The downloaded file mirrors the JSON field");

    await send(payload);
    assert.equal(nodes.error.textContent, "Модель загружена.", "The exported file loads back");
    assert.deepEqual(modelNow(), JSON.parse(payload), "Import reproduces the exported model");
    nodes.export.onclick();
    assert.equal(
      await captured[1].text(),
      payload,
      "Export → import → export is byte-identical",
    );

    // A draft can leave a coordinate as negative zero; it must not survive a round trip.
    const model = JSON.parse(payload);
    const negZero = JSON.stringify({
      ...model,
      furniture: [
        ...model.furniture,
        { id: "neg-zero", type: "chair", x: 0, z: 5, w: 0.5, d: 0.5, h: 0.9, rotation: 0 },
      ],
    }).replace('"rotation":0}', '"rotation":-0}');
    assert(negZero.includes('"rotation":-0'), "The test file really carries negative zero");
    await send(negZero);
    assert.equal(nodes.error.textContent, "Модель загружена.", "Negative zero loads without error");
    assert(
      modelNow().furniture.every((f) => !Object.is(f.rotation, -0) && !Object.is(f.x, -0)),
      "Negative zero is not kept in the live model",
    );
    nodes.export.onclick();
    const reexported = await captured[captured.length - 1].text();
    assert(
      !/"(?:x|z|w|d|h|rotation)": -0(?![0-9.])/.test(reexported),
      "Negative zero never comes back out of export",
    );
    assert.equal(
      JSON.parse(reexported).furniture.length,
      model.furniture.length + 1,
      "The imported item is exported back",
    );

    loadModel(pristine);
    const intact = JSON.stringify(modelNow());
    await send(JSON.stringify({ ...shipped, note: "x".repeat(1_100_000) }));
    assert.equal(nodes.error.textContent, "Файл слишком большой.", "A file over 1 MB is refused");
    assert.equal(JSON.stringify(modelNow()), intact, "A refused file leaves the scene intact");

    await send(
      JSON.stringify({
        ...shipped,
        furniture: [
          ...shipped.furniture,
          ...Array.from({ length: 501 - shipped.furniture.length }, (_, i) => ({
            id: "over-" + i,
            type: "chair",
            x: 5,
            z: 5,
            w: 0.5,
            d: 0.5,
            h: 0.9,
          })),
        ],
      }),
    );
    assert(
      nodes.error.textContent.includes("нужен массив до 500 объектов."),
      "More than 500 objects are refused",
    );
    assert.equal(JSON.stringify(modelNow()), intact, "An over-counted file leaves the scene intact");

    await send(
      JSON.stringify({
        ...shipped,
        walls: Array.from({ length: 201 }, (_, i) => ({
          x1: 0,
          z1: 0.2 + i * 0.03,
          x2: 10,
          z2: 0.2 + i * 0.03,
          kind: "wall",
        })),
      }),
    );
    assert(
      nodes.error.textContent.includes("допускается до 200 участков стен."),
      "More than 200 wall segments are refused",
    );
    assert.equal(JSON.stringify(modelNow()), intact, "An over-long wall list leaves the scene intact");

    await send(JSON.stringify({ ...shipped, version: 1 }));
    assert(
      nodes.error.textContent.includes("нужен JSON модели версии 2."),
      "A version 1 model is refused rather than half-read",
    );
    assert.equal(JSON.stringify(modelNow()), intact, "A version 1 file leaves the scene intact");

    loadModel(pristine);
    assert.equal(JSON.stringify(modelNow()), pristine, "The model is back after the round trip");
    console.log(
      "Export and import roundtrip byte-identical; size, count and version guards refuse bad files",
    );
  } finally {
    sandbox.URL = realURL;
  }
}

module.exports = {
  THREE,
  sandbox,
  nodes,
  draw,
  modelNow,
  selectPoint,
  storage,
  getScene: () => latest.scene,
  // The round trip rewrites the model and footer, so it runs after the autosave checks.
  previewDone: Promise.all([
    checkLazyPreviews(),
    checkAutosave().then(checkImportRoundTrip),
  ]).catch((e) => {
    console.error(e);
    process.exitCode = 1;
  }),
};
