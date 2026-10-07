"use strict";
Eco.furniturePreviews = function (catalog) {
  const thumbnails = [],
    r = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
  r.setSize(260, 180);
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
  try {
    for (const f of catalog) {
      const g = Eco.makeFurniture({ ...f, x: 0, z: 0, rotation: 0 }, s, true);
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
        const half = Math.max(my, mx / (260 / 180), 0.2) * 1.18;
        Object.assign(c, {
          left: (-half * 260) / 180,
          right: (half * 260) / 180,
          top: half,
          bottom: -half,
        });
        c.updateProjectionMatrix();
        r.render(s, c);
        thumbnails.push(r.domElement.toDataURL("image/png"));
      } finally {
        s.remove(g);
        g.traverse((o) => {
          o.geometry?.dispose();
          if (o.material)
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(
              (m) => m.dispose(),
            );
        });
      }
    }
  } finally {
    r.dispose();
    r.forceContextLoss?.();
  }
  return thumbnails;
};
