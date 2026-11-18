"use strict";
Eco.createRenderer = function (data) {
  const $ = (id) => document.getElementById(id);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dce5e9");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The room barely changes, so shadows stay stale until something actually moves.
  renderer.shadowMap.autoUpdate = false;
  const shadowsDirty = () => (renderer.shadowMap.needsUpdate = true);
  shadowsDirty();
  // Only the renderer knows the driver's anisotropy ceiling, and geometry.js owns
  // the floor maps, so the ceiling crosses here at build time.
  Eco.geometry.setMaxAnisotropy(
    renderer.capabilities?.getMaxAnisotropy?.() ?? 1,
  );
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  $("viewport").appendChild(renderer.domElement);
  // One cheap sky gradient does the ambient work that several bright lights used to do:
  // materials pick it up with envMapIntensity scaled by metalness, so the lights can stay
  // low. It has to be pre-filtered: r160 samples scene.environment as a cube or a CubeUV
  // atlas (WebGLProgram's ENVMAP_TYPE switch reads texture.mapping), so a plain equirect
  // canvas texture compiles a shader that reads a sampler2D as a samplerCube and reflects
  // nothing at all. PMREM turns it into the CubeUV map the shader actually wants.
  const envCanvas = document.createElement("canvas");
  envCanvas.width = 256;
  envCanvas.height = 128;
  const sky = envCanvas.getContext("2d"),
    gradient = sky.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "#eaf2fa");
  gradient.addColorStop(0.48, "#f6f3e8");
  gradient.addColorStop(0.52, "#c9bfa9");
  gradient.addColorStop(1, "#8b8374");
  sky.fillStyle = gradient;
  sky.fillRect(0, 0, 256, 128);
  sky.fillStyle = "#fffaf0";
  sky.beginPath();
  sky.arc(64, 40, 17, 0, 7);
  sky.fill();
  scene.environment = prefilterEnvironment(renderer, envCanvas);
  // Depth precision is the whole point of these numbers: a 0.03 m near plane under
  // a 150 m far plane spends the buffer on the empty space around a 13 m apartment,
  // and the bits left over decide whether two coplanar floor patches agree. navigation
  // re-fits the range per mode; this is the range the orbit view starts with.
  const camera = new THREE.PerspectiveCamera(
      58,
      innerWidth / innerHeight,
      0.12,
      60,
    ),
    planCamera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 100);
  camera.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight("#f4f8ff", "#9a8265", 1.05));
  const sun = new THREE.DirectionalLight("#fff4de", 2.2);
  sun.position.set(data.width / 2, 10, -6);
  sun.target.position.set(data.width / 2, 0, data.depth / 2);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -15,
    right: 15,
    top: 15,
    bottom: -15,
    near: 0.5,
    far: 40,
  });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#dcefff", 0.35);
  fill.position.set(12, 8, -6);
  scene.add(fill);

  return { scene, renderer, camera, planCamera, sun, shadowsDirty };
};

// Turns the sky canvas into the CubeUV texture the envmap shader actually samples. The
// filtered target lives for the page's lifetime — the renderer is built once, and only
// the scene is rebuilt — so it is deliberately not disposed here. A context that cannot
// pre-filter gets no environment at all rather than a texture read with the wrong sampler.
function prefilterEnvironment(renderer, canvas) {
  const source = new THREE.CanvasTexture(canvas);
  source.colorSpace = THREE.SRGBColorSpace;
  source.mapping = THREE.EquirectangularReflectionMapping;
  if (!renderer.capabilities || typeof renderer.getContext !== "function") {
    source.dispose();
    return null;
  }
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const filtered = pmrem.fromEquirectangular(source);
    pmrem.dispose();
    source.dispose();
    return filtered.texture;
  } catch (error) {
    console.warn("Не удалось построить окружение: " + error.message);
    source.dispose();
    return null;
  }
}
