const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert"),
  path = require("path");

// Guard for the floor shimmer. Two things change the floor only when the camera turns,
// and both are invisible in a still frame:
//   1. the sketch drew room rectangles across walls and doorways, so several of them
//      cover the same ground at one height. Equal depths cannot be ranked by the depth
//      buffer, so the pair swaps every frame: the corridor into the wardrobe, the
//      wardrobe into the master bedroom, the bathroom threshold and the strip past the
//      bedroom-2 partition all fight this way;
//   2. the projection spent its depth range on the empty space around a 13 m room, so
//      the bits left over are coarser than anything sub-millimetre.
// Fixes asserted here: each patch that still covers an earlier one is lifted by 3 mm,
// paint order decides, and each mode carries a depth range its own camera can see.
// Headless: 24 depth bits is what Chromium reports for the app's WebGL2 drawing buffer,
// but every assertion below is written as a depth *step*, so it holds while a step stays
// a fraction of the lift rather than for one exact buffer width.
const SRC = path.resolve(__dirname, "..");
const THREE = require(path.join(SRC, "vendor/three.min.js"));

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
  children: [],
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }),
  appendChild(o) {
    this.children.push(o);
  },
});
const sandbox = {
  THREE,
  document: {
    getElementById: (id) => el(id),
    createElement: (tag) => el(tag),
    body: el(),
    querySelector: () => null,
    querySelectorAll: () => [],
  },
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  console,
  performance: { now: () => 0 },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of [
  "kitchen-mesh.js",
  "model-state.js",
  "collisions.js",
  "geometry.js",
  "furniture-mesh.js",
  "apartment-scene.js",
  "furniture-catalog.js",
  "renderer.js",
  "navigation.js",
  "model.js",
])
  vm.runInContext(fs.readFileSync(path.join(SRC, file), "utf8"), sandbox);

const Eco = sandbox.Eco;
// A WebGLRenderer without a GL context is not buildable; only the anisotropy ceiling
// and the camera range matter here, so prefilterEnvironment() keeps taking its guard.
THREE.WebGLRenderer = class {
  constructor() {
    this.capabilities = { getMaxAnisotropy: () => 16 };
    this.domElement = el("canvas");
    this.shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false };
  }
  setSize() {}
  setPixelRatio() {}
  render() {}
};

const data = Eco.modelState.prepare(sandbox.makeApartment()),
  built = Eco.createRenderer(data),
  navigation = Eco.createNavigation({
    camera: built.camera,
    planCamera: built.planCamera,
    getData: () => data,
    isBlocked: () => false,
  });

// --- the ceiling crosses into the maps the floors sample, and only up to 8 ---
const ceiling = Eco.geometry.setMaxAnisotropy(
  built.renderer.capabilities.getMaxAnisotropy(),
);
assert.equal(ceiling, 8, "16 samples asked for, 8 is enough for a 512 px map");

// --- the built scene, where the fight actually happens ---
const world = Eco.buildApartment(data).world,
  patches = world.children.filter(
    (o) => o.isMesh && o.userData.unitBox && o.userData.dims[1] === 0.025,
  );
assert.equal(
  patches.length,
  data.floors.length,
  "Every room keeps one floor box: nothing split, nothing dropped",
);
assert(
  patches.every((m) => m.material.map.anisotropy === 8 && m.material.map.generateMipmaps),
  `Every floor samples its map anisotropically (${patches.length} of ${data.floors.length}), mipmapped`,
);

const face = (m) => ({
  x1: m.position.x - m.scale.x / 2,
  x2: m.position.x + m.scale.x / 2,
  z1: m.position.z - m.scale.z / 2,
  z2: m.position.z + m.scale.z / 2,
  top: m.position.y + m.scale.y / 2,
});
const rects = patches.map(face),
  fromData = data.floors.map((r) => ({ x1: r.x, x2: r.x + r.w, z1: r.z, z2: r.z + r.d }));

// Ground covered, from either side: the lift may not have clipped or moved a patch.
const union = (rs) => {
  const xs = [...new Set(rs.flatMap((r) => [r.x1, r.x2]))].sort((a, b) => a - b),
    zs = [...new Set(rs.flatMap((r) => [r.z1, r.z2]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++)
    for (let j = 0; j + 1 < zs.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2,
        cz = (zs[j] + zs[j + 1]) / 2;
      if (rs.some((r) => cx > r.x1 && cx < r.x2 && cz > r.z1 && cz < r.z2))
        area += (xs[i + 1] - xs[i]) * (zs[j + 1] - zs[j]);
    }
  return area;
};
assert(
  Math.abs(union(fromData) - union(rects)) < 1e-6,
  "Floor coverage is unchanged: the fix only changed height",
);

let overlapping = 0,
  closestPair = Infinity,
  tallest = -Infinity,
  lowest = Infinity;
for (const r of rects) {
  tallest = Math.max(tallest, r.top);
  lowest = Math.min(lowest, r.top);
}
for (let i = 0; i < rects.length; i++)
  for (let j = i + 1; j < rects.length; j++) {
    const x = Math.min(rects[i].x2, rects[j].x2) - Math.max(rects[i].x1, rects[j].x1),
      z = Math.min(rects[i].z2, rects[j].z2) - Math.max(rects[i].z1, rects[j].z1);
    if (x <= 1e-4 || z <= 1e-4) continue;
    overlapping++;
    closestPair = Math.min(closestPair, Math.abs(rects[i].top - rects[j].top));
    // The room drawn later paints on top: the lift is what makes that order real
    // geometry rather than a race the buffer loses each frame.
    assert(
      rects[j].top > rects[i].top,
      `Patch ${j} sits above the older patch ${i} it covers`,
    );
  }
assert(overlapping >= 4, "The layout still carries the overlapping rectangles that fight");
assert(closestPair >= 0.001, "No two overlapping floors end up coplanar");
assert(tallest - lowest <= 0.008, `Total lift ${(tallest - lowest).toFixed(4)} m stays invisible`);

// --- the depth range each camera is given ---
navigation.setMode("orbit");
assert(
  built.camera.near === 0.12 && built.camera.far === 60,
  "Orbit starts at 0,12 m..60 m",
);
navigation.setMode("walk");
assert(
  built.camera.near === 0.05 && built.camera.far === 40,
  "Walk keeps a small near plane, the camera stays 0,17 m clear of walls",
);
navigation.resize(1440, 900);
assert(
  built.camera.near === 0.05 && built.camera.far === 40,
  "Resizing does not lose the walk range",
);
navigation.setMode("orbit");
assert(built.camera.aspect === 1440 / 900, "Aspect still follows the canvas");

const stepAt = (near, far, d) => (1 / near - 1 / far) / 2 ** 24 * d * d,
  reach = 40 + Math.hypot(data.width, data.depth);
assert(reach < 60, `The farthest point the orbit camera sees (${reach.toFixed(1)} m) is inside its range`);
assert(
  stepAt(0.12, 60, reach) * 2 <= tallest - lowest,
  `The ${tallest - lowest} m lift is at least two depth steps (${stepAt(0.12, 60, reach).toFixed(5)} m) at the farthest point`,
);
assert(
  stepAt(0.05, 40, Math.hypot(data.width, data.depth)) * 2 <= tallest - lowest,
  "In walk mode the same lift is worth far more steps still",
);
assert(
  stepAt(0.03, 150, reach) > closestPair,
  `At the farthest corner the old 0,03..150 m range left a ${stepAt(0.03, 150, reach).toFixed(5)} m step: coarser than the lift, so the pair stayed a race`,
);

console.log(
  JSON.stringify(
    {
      floors: rects.length,
      coplanarOverlapsBefore: overlapping,
      closestPair: +closestPair.toFixed(5),
      totalLift: +(tallest - lowest).toFixed(5),
      anisotropy: ceiling,
      depth: {
        orbit: `${0.12}..${60} m`,
        walk: `${0.05}..${40} m`,
        stepAtFarthestCorner: +stepAt(0.12, 60, reach).toFixed(6),
        stepOfOldRangeAtFarthestCorner: +stepAt(0.03, 150, reach).toFixed(6),
      },
    },
    null,
    2,
  ),
);
