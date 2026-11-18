"use strict";
// One shared off-screen WebGL context, created on first use and reused across
// editor opens and category changes instead of being rebuilt per open.
//
// The buffer is sized for the card it lands in rather than a fixed 260×180: catalog
// images are the panel's content width minus item padding (~266 CSS px here) and are
// laid out at aspect 13/9 (furnish.css:139-147), so a 260×180 buffer is upscaled on a
// 2× display and reads soft. The context is rebuilt only if that target width changes.
const PREVIEW_ASPECT = 13 / 9,
  MIN_WIDTH = 260,
  MAX_WIDTH = 512;
let previewContext = null,
  contextWidth = 0;

// Device pixels the thumbnail has to fill: card width × display density, capped so the
// off-screen buffer stays small even on a 3× phone.
function previewWidth() {
  const card =
    document.querySelector("#furnishCatalog .catalog-item img")?.clientWidth ??
    MIN_WIDTH;
  const density = Math.min(devicePixelRatio || 1, 2);
  return Math.round(Math.min(Math.max(card * density, MIN_WIDTH), MAX_WIDTH));
}

function getPreviewContext(width) {
  if (previewContext && contextWidth === width) return previewContext;
  // A stale context is released, not left resident: rebuilding would otherwise
  // accumulate a second WebGL context per width change.
  previewContext?.r.dispose();
  const height = Math.round(width / PREVIEW_ASPECT);
  const r = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  r.setSize(width, height);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.2;
  const s = new THREE.Scene();
  s.background = new THREE.Color("#edf2ee");
  s.add(new THREE.HemisphereLight("#ffffff", "#8a7660", 2.4));
  const light = new THREE.DirectionalLight("#fff1df", 2.8);
  light.position.set(3, 6, 5);
  s.add(light);
  const c = new THREE.OrthographicCamera(-2, 2, 1.4, -1.4, 0.01, 50);
  previewContext = { r, s, c, width, height };
  contextWidth = width;
  return previewContext;
}

Eco.furniturePreviews = async function (catalog, wantedIndices) {
  const wanted = wantedIndices ?? catalog.map((_, i) => i),
    { r, s, c, width, height } = getPreviewContext(previewWidth()),
    thumbnails = [];
  for (let k = 0; k < wanted.length; k++) {
    const i = wanted[k],
      f = catalog[i],
      g = Eco.makeFurniture({ ...f, x: 0, z: 0, rotation: 0 }, s, true);
    try {
      g.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(g),
        center = bounds.getCenter(new THREE.Vector3());
      c.position.copy(center).add(new THREE.Vector3(4, 3.1, 5));
      c.lookAt(center);
      c.updateMatrixWorld(true);
      let mx = 0,
        my = 0;
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const p = new THREE.Vector3(x, y, z).applyMatrix4(
              c.matrixWorldInverse,
            );
            mx = Math.max(mx, Math.abs(p.x));
            my = Math.max(my, Math.abs(p.y));
          }
      const half = Math.max(my, mx / (width / height), 0.2) * 1.18;
      Object.assign(c, {
        left: (-half * width) / height,
        right: (half * width) / height,
        top: half,
        bottom: -half,
      });
      c.updateProjectionMatrix();
      r.render(s, c);
      thumbnails.push({ index: i, src: r.domElement.toDataURL("image/png") });
    } finally {
      s.remove(g);
      Eco.geometry.dispose(g);
    }
    // Yield regularly so rendering previews does not monopolize the main thread.
    if (k % 3 === 2 && k < wanted.length - 1)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return thumbnails;
};
