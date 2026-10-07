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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  $("viewport").appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(
      58,
      innerWidth / innerHeight,
      0.03,
      150,
    ),
    planCamera = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 100);
  camera.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight("#f4f8ff", "#9a8265", 1.6));
  const sun = new THREE.DirectionalLight("#fff4de", 3.1);
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
  const fill = new THREE.DirectionalLight("#dcefff", 0.6);
  fill.position.set(12, 8, -6);
  scene.add(fill);

  return { scene, renderer, camera, planCamera, sun };
};
