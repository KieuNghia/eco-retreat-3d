"use strict";
window.Eco = window.Eco || {};
Eco.makeFurniture = (() => {
  function makeFurniture(f, parent = new THREE.Group()) {
    const { mat, box, cylinder, sphere } = Eco.geometry;
    const object = new THREE.Group(),
      g = new THREE.Group(),
      decor = new THREE.Group();
    object.userData.furnitureType = f.type;
    object.userData.furnitureId = f.id;
    g.userData.furnitureType = f.type;
    g.name = "furniture-body";
    decor.name = "furniture-accessories";
    object.add(g, decor);
    parent.add(object);
    const addGlass = (m) => {
      m.userData.furnitureGlass = true;
    };
    const w = f.w,
      d = f.d,
      c = f.color || "#b7a184",
      b = (x, y, z, ww, hh, dd, col) => box(g, x, y, z, ww, hh, dd, col || c);
    if (f.type === "rug") {
      b(0, 0.018, 0, w, 0.015, d, c);
    }
    if (Eco.kitchenTypes.has(f.type)) {
      Eco.buildKitchen(f, g, decor);
    } else if (f.type === "bed") {
      b(0, 0.19, 0, w, 0.28, d, "#846449");
      b(0, 0.43, 0, w * 0.97, 0.23, d * 0.96, "#f4efe3");
      b(w * 0.49, 0.65, 0, 0.09, 0.9, d * 1.02, "#baa383");
      b(-w * 0.18, 0.57, 0, w * 0.59, 0.08, d * 0.96, c);
      for (const zz of [-d * 0.24, d * 0.24]) {
        let p = b(w * 0.3, 0.61, zz, w * 0.22, 0.12, d * 0.43, "#fff8ed");
        p.rotation.z = -0.08;
      }
    } else if (f.type === "sofa") {
      b(0, 0.26, 0, w, 0.34, d, c);
      b(-w * 0.39, 0.57, 0, w * 0.2, 0.67, d, c);
      for (const z of [-d * 0.46, d * 0.46])
        b(0, 0.46, z, w, 0.35, d * 0.13, c);
      for (const z of [-d * 0.24, d * 0.24])
        b(w * 0.07, 0.47, z, w * 0.72, 0.17, d * 0.43, "#ede2cd");
      let pillow = b(-w * 0.08, 0.68, d * 0.18, 0.3, 0.32, 0.36, "#6c7152");
      pillow.rotation.z = 0.2;
    } else if (["chair", "outdoorChair", "diningChair"].includes(f.type)) {
      b(0, 0.42, 0, w, 0.12, d, c);
      b(0, 0.69, d * 0.44, w, 0.52, 0.08, c);
      for (const x of [-w * 0.38, w * 0.38])
        for (const z of [-d * 0.36, d * 0.36])
          b(x, 0.2, z, 0.045, 0.4, 0.045, "#755d40");
      if (f.type !== "diningChair")
        for (const x of [-w * 0.45, w * 0.45])
          b(x, 0.59, 0, 0.07, 0.2, d, "#947e5e");
    } else if (f.type === "officeChair") {
      b(0, 0.13, 0, w * 0.9, 0.05, 0.055, "#4d585e");
      b(0, 0.13, 0, 0.055, 0.05, d * 0.9, "#4d585e");
      for (const [x, z] of [
        [-w * 0.43, 0],
        [w * 0.43, 0],
        [0, -d * 0.43],
        [0, d * 0.43],
      ])
        cylinder(g, x, 0.055, z, 0.045, 0.07, "#30383c");
      cylinder(g, 0, 0.3, 0, 0.045, 0.4, "#5d686d");
      b(0, 0.49, -d * 0.04, w * 0.78, 0.12, d * 0.72, c);
      b(0, 0.81, d * 0.34, w * 0.76, 0.56, d * 0.12, c);
      b(0, 0.83, d * 0.405, w * 0.63, 0.45, 0.02, "#a4afb1");
      for (const x of [-w * 0.36, w * 0.36]) {
        b(x, 0.61, 0, 0.035, 0.22, 0.035, "#4d585e");
        b(x, 0.73, -d * 0.03, 0.06, 0.045, d * 0.48, "#4d585e");
      }
    } else if (f.type === "officeDesk") {
      b(0, 0.725, 0, w, 0.05, d, c);
      for (const x of [-w * 0.43, w * 0.43])
        for (const z of [-d * 0.4, d * 0.4])
          b(x, 0.35, z, 0.045, 0.7, 0.045, "#596266");
      b(0, 0.77, -d * 0.03, 0.36, 0.025, 0.23, "#343e45");
      b(0, 0.785, -d * 0.01, 0.32, 0.006, 0.18, "#87959b");
      b(0, 0.95, -d * 0.19, 0.36, 0.38, 0.02, "#2e3942");
      b(0, 0.96, -d * 0.19 + 0.012, 0.32, 0.32, 0.006, "#527f9b");
    } else if (["coffee", "side", "dining", "desk"].includes(f.type)) {
      const top =
        f.type === "coffee" ? 0.41 : f.type === "side" ? 0.54 : 0.7825;
      const thick = f.type === "coffee" || f.type === "side" ? 0.06 : 0.065;
      if (f.type === "coffee" || f.type === "side") {
        const m = cylinder(g, 0, top - thick / 2, 0, 1, thick, c);
        m.scale.set(w / 2, 1, d / 2);
        cylinder(
          g,
          0,
          (top - thick) / 2,
          0,
          Math.min(w, d) * 0.23,
          top - thick,
          c,
        );
      } else {
        b(0, top - thick / 2, 0, w, thick, d, c);
        for (const x of [-w * 0.4, w * 0.4])
          for (const z of [-d * 0.4, d * 0.4])
            b(x, (top - thick) / 2, z, 0.05, top - thick, 0.05, "#7d6241");
      }
      if (f.type === "side") {
        cylinder(decor, 0, 0.02, 0, 0.08, 0.03, "#aa7947");
        cylinder(decor, 0, 0.18, 0, 0.1, 0.2, "#fff1ce");
      }
      if (f.type === "dining") {
        cylinder(decor, 0, 0.08, 0, 0.065, 0.16, "#798574");
        sphere(decor, 0, 0.25, 0, 0.13, 0.15, 0.13, "#477046");
        for (const z of [-d * 0.28, d * 0.28])
          for (const x of [-w * 0.26, w * 0.26])
            cylinder(
              decor,
              x,
              0.009,
              z,
              Math.min(0.105, w * 0.15, d * 0.15),
              0.013,
              "#f4f0df",
            );
      }
    } else if (f.type === "wardrobe") {
      b(0, 1.08, 0, w, 2.16, d, c);
      let alongZ = d > w,
        n = Math.max(2, Math.round((alongZ ? d : w) / 0.5));
      for (let j = 0; j < n; j++) {
        if (alongZ) {
          b(
            -w * 0.51,
            1.08,
            -d / 2 + ((j + 0.5) * d) / n,
            0.015,
            2.12,
            d / n - 0.014,
            "#d3bc98",
          );
          b(
            -w * 0.53,
            1.05,
            -d / 2 + ((j + 0.5) * d) / n,
            0.02,
            0.16,
            0.018,
            "#655c4b",
          );
        } else {
          b(
            -w / 2 + ((j + 0.5) * w) / n,
            1.08,
            d * 0.51,
            w / n - 0.014,
            2.12,
            0.015,
            "#d3bc98",
          );
          b(
            -w / 2 + ((j + 0.5) * w) / n,
            1.05,
            d * 0.53,
            0.018,
            0.16,
            0.02,
            "#655c4b",
          );
        }
      }
    } else if (f.type === "kitchen") {
      b(0, 0.46, 0, w, 0.9, d, c);
      b(0, 0.94, 0, w + 0.03, 0.055, d, "#e0d8c7");
      b(-w * 0.3, 1.8, 0, w * 0.45, 0.6, d * 0.75, c);
      for (let j = -d / 2 + 0.3; j < d / 2; j += 0.6)
        b(w * 0.51, 0.47, j, 0.015, 0.72, 0.56, "#a68561");
      b(0, 1.25, d * 0.4, w, 2.5, d * 0.19, "#bd956b");
    } else if (f.type === "counter") {
      b(0, 0.46, 0, w, 0.89, d, c);
      b(0, 0.94, 0, w, 0.06, d, "#ddd8cb");
      b(0, 0.976, -d * 0.28, w * 0.86, 0.014, 0.46, "#292c2c");
      for (const z of [-d * 0.28 - 0.1, -d * 0.28 + 0.1])
        cylinder(g, 0, 0.992, z, 0.068, 0.01, "#737879");
      b(0, 0.976, d * 0.27, w * 0.88, 0.016, 0.43, "#949e9a");
      cylinder(g, 0, 1.1, d * 0.44, 0.014, 0.24, "#868f8e");
    } else if (f.type === "washer") {
      b(0, 0.44, 0, w, 0.88, d, "#ecece5");
      let m = cylinder(g, w * 0.505, 0.43, 0, 0.19, 0.04, "#4f5d62");
      m.rotation.z = Math.PI / 2;
    } else if (f.type === "toilet") {
      b(0, 0.35, -d * 0.37, w * 0.85, 0.68, d * 0.2, "#eeeae1");
      sphere(g, 0, 0.3, d * 0.05, w * 0.43, 0.24, d * 0.43, "#f5f4ed");
      let seat = cylinder(g, 0, 0.49, d * 0.08, 1, 0.035, "#dddcd5");
      seat.scale.set(w * 0.34, 1, d * 0.3);
    } else if (f.type === "basin") {
      b(0, 0.42, 0, w, 0.8, d, "#c5af8c");
      b(0, 0.85, 0, w, 0.07, d, "#efe8dc");
      if (f.basinShape === "rectangular") {
        b(0, 0.91, 0, w * 0.83, 0.08, d * 0.75, "#faf8ee");
        b(0, 0.954, 0, w * 0.65, 0.008, d * 0.56, "#c0c8c6");
      } else cylinder(g, 0, 0.91, 0, Math.min(w, d) * 0.34, 0.09, "#faf8ee");
      cylinder(g, 0, 1.03, -d * 0.35, 0.015, 0.27, "#8b9798");
    } else if (f.type === "bath") {
      b(0, 0.27, 0, w, 0.54, d, "#f4eee4");
      b(0, 0.549, 0, w * 0.86, 0.02, d * 0.68, "#acb8b6");
      cylinder(g, w * 0.46, 0.69, 0, 0.015, 0.27, "#a3aaa8");
      b(w * 0.4, 0.82, 0, w * 0.13, 0.025, 0.025, "#a3aaa8");
    } else if (f.type === "wallShower") {
      b(0, 0.035, 0, w, 0.06, d, "#d1cbbd");
      const panel = b(
        -w / 2,
        1,
        0,
        0.02,
        1.96,
        d,
        mat("#b7d4d8", { transparent: true, opacity: 0.2, depthWrite: false }),
      );
      panel.castShadow = false;
      addGlass(panel);
      for (const z of [-d / 2, d / 2])
        b(-w / 2, 1, z, 0.025, 1.98, 0.025, "#aaa88d");
      b(-w / 2, 1.98, 0, 0.025, 0.025, d, "#aaa88d");
      cylinder(g, w * 0.43, 1.25, d * 0.16, 0.014, 1.4, "#afb2a9");
      b(w * 0.29, 1.91, d * 0.16, w * 0.29, 0.025, 0.025, "#afb2a9");
      b(w * 0.14, 1.9, d * 0.16, 0.17, 0.03, 0.17, "#bac1bd");
    } else if (f.type === "cornerShower") {
      const pts = [
          [-w / 2, -d * 0.12],
          [-w * 0.12, -d / 2],
          [w / 2, -d / 2],
          [w / 2, d / 2],
          [-w / 2, d / 2],
        ],
        shape = new THREE.Shape();
      pts.forEach(([x, z], i) =>
        i ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
      );
      shape.closePath();
      const tray = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.065, bevelEnabled: false }),
        mat("#d1cbbd"),
      );
      tray.rotation.x = -Math.PI / 2;
      tray.position.y = 0.015;
      tray.receiveShadow = true;
      g.add(tray);
      for (const [a, c] of [
        [pts[4], pts[0]],
        [pts[0], pts[1]],
        [pts[1], pts[2]],
      ]) {
        const dx = c[0] - a[0],
          dz = c[1] - a[1],
          len = Math.hypot(dx, dz),
          x = (a[0] + c[0]) / 2,
          z = (a[1] + c[1]) / 2;
        const panel = b(
          x,
          1,
          z,
          len,
          1.94,
          0.02,
          mat("#b7d4d8", {
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
          }),
        );
        panel.rotation.y = -Math.atan2(dz, dx);
        panel.castShadow = false;
        addGlass(panel);
        const rail = b(x, 1.98, z, len, 0.025, 0.025, "#aaa88d");
        rail.rotation.y = panel.rotation.y;
      }
      for (const [x, z] of [pts[0], pts[1], pts[4]])
        b(x, 1, z, 0.025, 1.98, 0.025, "#aaa88d");
      cylinder(g, w * 0.43, 1.24, d * 0.14, 0.014, 1.35, "#afb2a9");
      b(w * 0.31, 1.86, d * 0.14, w * 0.24, 0.025, 0.025, "#afb2a9");
      b(w * 0.18, 1.86, d * 0.14, 0.16, 0.025, 0.16, "#b6bcb9");
    } else if (f.type === "shower") {
      b(0, 0.04, 0, w, 0.07, d, "#d1cbbd");
      let gl = b(
        w / 2,
        1,
        0,
        0.02,
        1.94,
        d,
        mat("#b7d4d8", { transparent: true, opacity: 0.18, depthWrite: false }),
      );
      addGlass(gl);
      b(w / 2, 1, d / 2, 0.025, 2, 0.025, "#aaa88d");
      cylinder(g, w * 0.35, 1.28, -d * 0.36, 0.012, 1.4, "#afb2a9");
    } else if (f.type === "cabinet") {
      b(0, 0.42, 0, w, 0.84, d, c);
      for (let j = 0; j < 3; j++) {
        b(0, 0.15 + j * 0.26, d * 0.51, w * 0.96, 0.23, 0.02, "#d2bb97");
        b(0, 0.15 + j * 0.26, d * 0.54, w * 0.2, 0.025, 0.025, "#675c4e");
      }
    } else if (f.type === "shelf") {
      for (const x of [-w / 2, w / 2]) b(x, 0.9, 0, 0.03, 1.8, d, c);
      for (let j = 0; j <= 5; j++) b(0, j * 0.35 + 0.025, 0, w, 0.04, d, c);
      b(0, 0.9, -d * 0.48, w, 1.8, 0.025, c);
    } else if (f.type === "fridge") {
      b(0, 0.925, 0, w, 1.85, d, c);
      for (const [y, h] of [
        [0.42, 0.78],
        [1.34, 0.99],
      ]) {
        b(0, y, d * 0.51, w * 0.98, h, 0.025, c);
        b(w * 0.34, y, d * 0.55, 0.025, h * 0.35, 0.035, "#727c80");
      }
    } else if (f.type === "tv") {
      b(0, 0.25, 0, w, 0.5, d, c);
      b(0, 0.65, 0, 0.04, 0.3, 0.04, "#4b5050");
      b(0, 1.0, 0, w * 0.87, 0.6, 0.055, "#293940");
      b(0, 1.0, 0.031, w * 0.82, 0.54, 0.01, "#506a78");
    } else if (f.type === "plant") {
      cylinder(g, 0, 0.2, 0, w * 0.27, 0.4, "#a39b83", w * 0.34);
      for (let j = 0; j < 7; j++) {
        let a = j * 2.4;
        sphere(
          g,
          Math.cos(a) * w * 0.23,
          0.45 + (j % 3) * 0.19,
          Math.sin(a) * d * 0.22,
          w * 0.27,
          0.27,
          d * 0.23,
          j % 2 ? "#527340" : "#3f613b",
        );
      }
    }
    // Measure the unrotated body only. Accessories never change furniture dimensions.
    g.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(g),
      size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    if (size.x > 0 && size.z > 0) {
      g.scale.x = w / size.x;
      g.scale.z = d / size.z;
      g.position.x = -center.x * g.scale.x;
      g.position.z = -center.z * g.scale.z;
    }
    if (Number.isFinite(f.h) && f.h > 0 && bounds.max.y > 0)
      g.scale.y = f.h / bounds.max.y;
    object.userData.bodyHeight = Number.isFinite(f.h) ? f.h : bounds.max.y;
    decor.position.y = object.userData.bodyHeight;
    object.position.set(f.x || 0, f.y || 0, f.z || 0);
    object.rotation.y = f.rotation || 0;
    return object;
  }

  return makeFurniture;
})();
