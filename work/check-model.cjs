const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const THREE = require("../outputs/eco-retreat-v2/vendor/three.min.js");
let draw,
  latest,
  canvas,
  previewRenders = 0,
  handlers = {},
  nodes = {};
const ctx2d = new Proxy({}, { get: () => () => {} });
const el = (id = "") => ({
  id,
  checked: true,
  value: "",
  style: {},
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
  querySelectorAll: () => [],
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
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const scripts = [
  ...fs
    .readFileSync("outputs/eco-retreat-v2/index.html", "utf8")
    .matchAll(/<script src="([^"]+)"><\/script>/g),
].map((m) => m[1]);
const bundleScripts = process.argv.includes("--bundle")
  ? [
      ...fs
        .readFileSync("outputs/eco-retreat-v2/Eco-Retreat.html", "utf8")
        .matchAll(/<script>([\s\S]*?)<\/script>/g),
    ].map((m) => m[1])
  : null;
if (bundleScripts) {
  assert.equal(
    bundleScripts.length,
    scripts.length,
    "Bundle includes every source script",
  );
  // The local vendor is loaded above; retain the instrumented WebGLRenderer in this test.
  for (let i = 1; i < bundleScripts.length; i++)
    vm.runInContext(bundleScripts[i], sandbox, {
      filename: "bundle:" + scripts[i],
    });
} else
  for (const file of scripts)
    if (!file.startsWith("vendor/"))
      vm.runInContext(
        fs.readFileSync("outputs/eco-retreat-v2/" + file, "utf8"),
        sandbox,
        { filename: file },
      );
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
assert.equal(previewRenders, sandbox.furnitureCatalog.length);
assert(
  nodes.furnishCatalog.children.every((b) =>
    b.children[0].src.startsWith("data:image/png"),
  ),
  "Every catalog card has preview",
);
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
const rotated = snap(snapData, { ...cabinet, x: 4.08, z: 5.63, rotation: Math.PI / 2 });
assert(Math.abs(rotated.x - 4) < 1e-8 && Math.abs(rotated.z - 5.5) < 1e-8);
snapData.furniture[0].rotation = 0;
snapData.furniture.push({ type: "wardrobe", x: 5.5, z: 4, w: 0.2, d: 0.6, h: 2 });
assert.equal(snap(snapData, cabinet).targetIndex, -1, "Blocked snap is rejected");
snapData.furniture = [{ type: "dining", x: 4, z: 4, w: 1.2, d: 0.8, h: 0.75 }];
const chair = snap(snapData, { type: "diningChair", x: 5.07, z: 4, w: 0.6, d: 0.55, h: 0.9 });
assert.equal(chair.targetIndex, 0);
assert(Math.abs(chair.x - 4.9) < 1e-8, "Chair meets table edge");
console.log("Furniture magnet joins cabinets and chairs without crossing obstacles");

module.exports = {
  THREE,
  sandbox,
  nodes,
  draw,
  modelNow,
  selectPoint,
  getScene: () => latest.scene,
};
