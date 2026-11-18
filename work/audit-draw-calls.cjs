const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert"),
  path = require("path");

// Draw-call and shadow-caster audit. The scene merges each furniture item into a
// handful of baked meshes, so the honest question is not "is the default scene fast"
// but "what does the largest layout the validator accepts cost". This script measures
// that, then asserts the merge policy holds per item so the numbers cannot drift
// silently. It is not a GPU benchmark: there is no real WebGL context here.
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
  classList: { toggle() {}, add() {}, remove() {} },
  children: [],
  getContext: () => ctx2d,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }),
});
const sandbox = {
  THREE,
  document: {
    getElementById: (id) => el(id),
    createElement: () => el(),
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
  "model.js",
])
  vm.runInContext(fs.readFileSync(path.join(SRC, file), "utf8"), sandbox);

const Eco = sandbox.Eco,
  catalog = sandbox.furnitureCatalog;

// One draw call is one visible mesh submitted with one material. The shadow map adds a
// second call for every visible caster, so the total is what the frame actually costs.
function cost(scene) {
  let meshes = 0,
    casters = 0,
    triangles = 0,
    materials = new Set();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    meshes++;
    materials.add(o.material.uuid);
    if (o.castShadow) casters++;
    const g = o.geometry;
    triangles += g.index ? g.index.count / 3 : g.attributes.position?.count / 3;
  });
  return { drawCalls: meshes + casters, meshes, casters, triangles: Math.round(triangles), materials: materials.size };
}

// Worst case the validator accepts: the item cap, one catalog variant per slot, laid
// out on a grid so nothing collapses into a single pile. Catalog dimensions below the
// validator's 0,1 m floor are raised here — the audit measures the largest *accepted*
// layout, and a slimmer item is strictly cheaper.
function maxLayout(data) {
  const d = Eco.modelState.clone(data),
    cols = 12,
    stepX = (d.width - 0.6) / cols,
    stepZ = (d.depth - 0.6) / 13;
  d.furniture = [];
  for (let i = 0; i < 500; i++) {
    const f = JSON.parse(JSON.stringify(catalog[i % catalog.length]));
    delete f.category;
    delete f.id;
    f.w = Math.max(f.w, 0.1);
    f.d = Math.max(f.d, 0.1);
    const row = Math.floor(i / cols);
    f.x = 0.3 + (i % cols) * stepX + (row % 2) * stepX / 2;
    f.z = 0.3 + (row % 13) * stepZ + (row % 3) * 0.1;
    f.rotation = (i % 5) * 0.3;
    d.furniture.push(f);
  }
  return Eco.modelState.prepare(d);
}

const base = Eco.modelState.prepare(sandbox.makeApartment());
const defaultScene = new THREE.Scene();
defaultScene.add(Eco.buildApartment(base).world);
const crowdedScene = new THREE.Scene();
crowdedScene.add(Eco.buildApartment(maxLayout(base)).world);

const measured = { default: cost(defaultScene), max: cost(crowdedScene) };

// Per catalog variant: how many meshes survive the merge, and whether the body casts.
const policy = catalog.map((f) => {
  const scene = new THREE.Scene();
  const item = Eco.makeFurniture({ ...f, x: 0, z: 0, rotation: 0 }, scene);
  const body = item.getObjectByName("furniture-body");
  const parts = body.children.filter((o) => o.isMesh);
  const thin = parts.filter((o) => !o.castShadow);
  let meshes = 0;
  item.traverse((o) => {
    if (o.isMesh) meshes++;
  });
  return {
    type: f.type,
    name: f.name,
    parts: parts.length,
    meshes,
    casts: [...body.children].some((o) => o.isMesh && o.castShadow),
    thinParts: thin.length,
    thinOnly: parts.length > 0 && thin.length === parts.length,
  };
});
// Variants of one type differ only in size, so the policy is reported per type, keeping
// the variant with the most surviving meshes.
const perType = new Map();
for (const p of policy) {
  const hit = perType.get(p.type);
  if (!hit || p.meshes > hit.meshes) perType.set(p.type, p);
}
const worst = [...perType.values()].sort((a, b) => b.meshes - a.meshes);
const thinOnlyCasters = policy.filter((p) => p.thinOnly && p.casts);

console.log(
  JSON.stringify(
    {
      budget: {
        note: "500 items is the validator ceiling (model-state.js). Measured headless, no GPU: draw calls are meshes + visible shadow casters, not a benchmark.",
        defaultDrawCalls: measured.default.drawCalls,
        maxDrawCalls: measured.max.drawCalls,
        shadowShareOfMax:
          Math.round((measured.max.casters / measured.max.drawCalls) * 100) / 100,
      },
      measured,
      meshPolicy: {
        worstMeshesPerType: worst.map((p) => `${p.type}:${p.meshes}`),
        thinOnlyCasters: thinOnlyCasters.map((p) => p.type),
        note: "mergeBoxes() only coalesces groups of >=3 unit boxes sharing one material (geometry.js:220-221), so items with fewer parts per material keep separate meshes.",
      },
      perType: worst.map(
        (p) => `${p.type} ${p.meshes}mesh/${p.parts}parts${p.casts ? " cast" : " no-cast"}`,
      ),
    },
    null,
    2,
  ),
);

// Budget ceilings measured here (378 default, 3477 at the item cap). They are regression
// guards, not targets: an InstancedMesh pass would lower them, and that is the decision
// this audit exists to inform.
assert(measured.default.drawCalls < 400, "Default layout stays under 400 draw calls");
assert(measured.max.drawCalls < 3600, "500-item layout stays under 3600 draw calls");
assert(
  measured.max.casters < measured.max.meshes,
  "Some meshes are non-casting, so the shadow pass is cheaper than the main pass",
);
const worstMeshes = Math.max(...policy.map((p) => p.meshes));
assert(
  worstMeshes <= 10,
  `No catalog type survives the merge above 10 meshes (worst is ${worstMeshes}: ${worst[0]?.type})`,
);
assert(
  !thinOnlyCasters.length,
  `Items made only of thin parts must not cast: ${thinOnlyCasters.map((p) => p.type).join(", ")}`,
);
assert(
  policy.every((p) => p.type !== "rug" || !p.casts),
  "Rugs never cast shadows",
);
