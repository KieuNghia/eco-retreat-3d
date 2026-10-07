"use strict";
window.Eco = window.Eco || {};
Eco.geometry = (() => {
  function mat(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra });
  }
  function texture(kind) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const q = c.getContext("2d");
    let seed = 29;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    q.fillStyle =
      kind === "wood" ? "#c8a576" : kind === "grass" ? "#688052" : "#d6cebc";
    q.fillRect(0, 0, 512, 512);
    if (kind === "wood") {
      for (let i = 0; i < 8; i++) {
        q.fillStyle = `hsl(34,${30 + rnd() * 12}%,${61 + rnd() * 12}%)`;
        q.fillRect(i * 64, 0, 63, 512);
        q.strokeStyle = "#886a4b55";
        q.strokeRect(i * 64, 0, 64, 512);
        for (let j = 0; j < 35; j++) {
          q.strokeStyle = "#795c3b15";
          q.beginPath();
          q.moveTo(i * 64 + rnd() * 62, 0);
          q.lineTo(i * 64 + rnd() * 62, 512);
          q.stroke();
        }
        q.fillStyle = "#72583e40";
        q.fillRect(i * 64, (i % 3) * 165, 64, 2);
      }
    } else if (kind === "tile") {
      q.strokeStyle = "#9e978744";
      q.lineWidth = 3;
      q.strokeRect(0, 0, 512, 512);
    } else {
      for (let i = 0; i < 5000; i++) {
        q.fillStyle = rnd() > 0.5 ? "#274c2622" : "#a9b97833";
        q.fillRect(rnd() * 512, rnd() * 512, 2, 7);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function box(parent, x, y, z, w, h, d, color, extra = {}) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      typeof color === "string" ? mat(color) : color,
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    Object.assign(m, extra);
    return m;
  }
  function cylinder(parent, x, y, z, r, h, color, top = r) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(top, r, h, 24),
      mat(color),
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(parent, x, y, z, rx, ry, rz, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat(color));
    m.position.set(x, y, z);
    m.scale.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  function dispose(root) {
    root.traverse((o) => {
      o.geometry?.dispose();
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.map?.dispose();
          m.dispose();
        }
    });
  }
  return { mat, texture, box, cylinder, sphere, dispose };
})();
