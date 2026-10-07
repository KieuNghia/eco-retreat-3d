"use strict";
window.Eco = window.Eco || {};
Eco.buildApartment = function (data) {
  const { mat, texture, box, dispose } = Eco.geometry;
  const world = new THREE.Group(),
    furniture = new THREE.Group(),
    wallMeshes = [],
    wallRects = [],
    glass = [],
    labels = [],
    wallColliders = [];
  world.name = "apartment";
  furniture.name = "furniture";
  world.add(furniture);
  const tex = {
    wood: texture("wood"),
    tile: texture("tile"),
    grass: texture("grass"),
  };
  const shapeKey = (f) =>
    JSON.stringify([f.type, f.w, f.d, f.h, f.color, f.basinShape]);
  function obstacle(x, z, w, d) {
    wallColliders.push({ x, z, w, d, rotation: 0 });
  }
  function addWall(s) {
    const dx = s.x2 - s.x1,
      dz = s.z2 - s.z1,
      len = Math.hypot(dx, dz),
      x = (s.x1 + s.x2) / 2,
      z = (s.z1 + s.z2) / 2,
      t = s.thickness || data.wallThickness;
    if (
      (!s.kind || s.kind === "wall") &&
      (Math.abs(dx) < 1e-8 || Math.abs(dz) < 1e-8)
    ) {
      const w = Math.abs(dx) + t,
        d = Math.abs(dz) + t;
      wallRects.push({
        x1: x - w / 2,
        x2: x + w / 2,
        z1: z - d / 2,
        z2: z + d / 2,
      });
      obstacle(x, z, w, d);
      return;
    }
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = -Math.atan2(dz, dx);
    world.add(group);
    if (s.kind === "wall") {
      const m = box(
        group,
        0,
        data.ceiling / 2,
        0,
        len,
        data.ceiling,
        t,
        "#e9e3d8",
      );
      wallMeshes.push(m);
      box(group, 0, 0.045, 0, len, 0.09, t + 0.025, "#c4b9a4");
    } else if (s.kind === "rail") {
      box(group, 0, 0.1, 0, len, 0.2, 0.16, "#a39681");
      box(group, 0, 1.03, 0, len, 0.07, 0.08, "#514d41");
      for (let j = -len / 2; j < len / 2; j += 0.18)
        box(group, j, 0.58, 0, 0.025, 0.88, 0.025, "#554d3d");
    } else {
      let sill = s.kind === "window" ? 0.72 : 0;
      if (sill) box(group, 0, sill / 2, 0, len, sill, t, "#e9e3d8");
      const gl = box(
        group,
        0,
        (sill + 2.45) / 2,
        0,
        len,
        2.45 - sill,
        0.035,
        mat("#9ec6d3", {
          transparent: true,
          opacity: 0.18,
          roughness: 0.15,
          depthWrite: false,
        }),
      );
      glass.push(gl);
      for (let j = -len / 2; j <= len / 2 + 0.01; j += len / 2)
        box(
          group,
          j,
          (sill + 2.45) / 2,
          0,
          0.035,
          2.45 - sill,
          0.06,
          "#534f46",
        );
      box(group, 0, 2.45, 0, len, 0.065, 0.09, "#534f46");
      if (s.kind === "sliding") {
        gl.visible = false;
        gl.userData.hidden = true;
        /* Glass is shown stacked at side, central passage stays open. */ const panel =
          box(
            group,
            -len * 0.37,
            1.22,
            0,
            len * 0.25,
            2.44,
            0.035,
            mat("#a3c4ce", { transparent: true, opacity: 0.22 }),
          );
        glass.push(panel);
      }
    }
    if (s.kind !== "sliding")
      wallColliders.push(Eco.collisions.wall(s, data.wallThickness));
  }
  // Union the wall footprints so corners have one continuous surface, including steps in thickness.
  function closeWallJoints() {
    const xs = [...new Set(wallRects.flatMap((r) => [r.x1, r.x2]))].sort(
        (a, b) => a - b,
      ),
      zs = [...new Set(wallRects.flatMap((r) => [r.z1, r.z2]))].sort(
        (a, b) => a - b,
      ),
      nx = xs.length - 1,
      nz = zs.length - 1,
      occupied = Array.from({ length: nx }, () => Array(nz).fill(false)),
      v = [],
      h = data.ceiling / 2;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = (xs[i] + xs[i + 1]) / 2,
          z = (zs[j] + zs[j + 1]) / 2;
        occupied[i][j] = wallRects.some(
          (r) => x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2,
        );
      }
    const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        if (occupied[i][j]) {
          const x = xs[i],
            X = xs[i + 1],
            z = zs[j],
            Z = zs[j + 1];
          quad([x, h, z], [x, h, Z], [X, h, Z], [X, h, z]);
          quad([x, -h, z], [X, -h, z], [X, -h, Z], [x, -h, Z]);
          if (i === 0 || !occupied[i - 1][j])
            quad([x, -h, z], [x, -h, Z], [x, h, Z], [x, h, z]);
          if (i === nx - 1 || !occupied[i + 1][j])
            quad([X, -h, Z], [X, -h, z], [X, h, z], [X, h, Z]);
          if (j === 0 || !occupied[i][j - 1])
            quad([X, -h, z], [x, -h, z], [x, h, z], [X, h, z]);
          if (j === nz - 1 || !occupied[i][j + 1])
            quad([x, -h, Z], [X, -h, Z], [X, h, Z], [x, h, Z]);
        }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat("#e9e3d8"));
    mesh.name = "continuous-walls";
    mesh.position.y = h;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
    wallMeshes.push(mesh);
  }

  function label(l) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 80;
    const q = c.getContext("2d");
    q.fillStyle = "#ffffffeb";
    q.fillRect(0, 0, 512, 80);
    q.fillStyle = "#25404d";
    q.font = "600 25px Segoe UI";
    q.textAlign = "center";
    q.fillText(l.text, 256, 50);
    let t = new THREE.CanvasTexture(c),
      s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: t,
          depthTest: false,
          transparent: true,
        }),
      );
    s.position.set(l.x, 0.95, l.z);
    s.scale.set(2.1, 0.33, 1);
    s.renderOrder = 20;
    world.add(s);
    labels.push(s);
  }

  function syncFurniture(items) {
    Eco.modelState.ensureIds(items);
    const existing = new Map(
      furniture.children.map((g) => [g.userData.furnitureId, g]),
    );
    const staging = new THREE.Group(),
      ordered = [];
    try {
      for (const f of items) {
        let g = existing.get(f.id);
        const key = shapeKey(f);
        if (!g || g.userData.shapeKey !== key) {
          g = Eco.makeFurniture(f, staging);
          g.userData.shapeKey = key;
        }
        ordered.push(g);
      }
    } catch (error) {
      dispose(staging);
      throw error;
    }
    const keep = new Set(ordered);
    for (const g of [...furniture.children])
      if (!keep.has(g)) {
        furniture.remove(g);
        dispose(g);
      }
    ordered.forEach((g, i) => {
      const f = items[i];
      furniture.add(g);
      g.position.set(f.x, f.y || 0, f.z);
      g.rotation.y = f.rotation || 0;
      g.userData.furnitureId = f.id;
    });
    furniture.children = ordered;
  }
  function release() {
    dispose(world);
    Object.values(tex).forEach((t) => t.dispose());
  }
  try {
    box(
      world,
      data.width / 2,
      -0.13,
      data.depth / 2,
      data.width + 0.15,
      0.22,
      data.depth + 0.15,
      "#b6b2a5",
    );
    for (const f of data.floors) {
      const t = tex[f.kind].clone();
      t.needsUpdate = true;
      t.repeat.set(
        f.w / (f.kind === "wood" ? 1.8 : 0.65),
        f.d / (f.kind === "wood" ? 3.4 : 0.65),
      );
      box(
        world,
        f.x + f.w / 2,
        -0.008,
        f.z + f.d / 2,
        f.w,
        0.025,
        f.d,
        mat("#ffffff", { map: t }),
      );
    }
    data.walls.forEach(addWall);
    closeWallJoints();
    syncFurniture(data.furniture);
    data.labels.forEach(label);
  } catch (error) {
    release();
    throw error;
  }
  return {
    world,
    furniture,
    wallMeshes,
    glass,
    labels,
    wallColliders,
    syncFurniture,
    dispose: release,
  };
};
