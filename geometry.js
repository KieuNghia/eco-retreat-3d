"use strict";
window.Eco = window.Eco || {};
Eco.geometry = (() => {
  // Geometry and materials are shared between rebuilds, so ownership is counted:
  // every creation claims one use, teardown releases one use per referencing mesh,
  // and only the last release disposes the resource. Tiny shared primitives are pinned.
  const counts = new Map(),
    pinned = new Set(),
    textureCache = new Map(),
    materialCache = new Map(),
    geometryCache = new Map(),
    mergedGeometryCache = new Map(),
    mergedGeometryRefs = new Map();
  const mapSlots = [
    "map",
    "alphaMap",
    "lightMap",
    "emissiveMap",
    "roughnessMap",
    "metalnessMap",
    "normalMap",
    "bumpMap",
    "aoMap",
  ];
  function pin(resource) {
    pinned.add(resource);
    return resource;
  }
  function own(resource) {
    if (resource && !pinned.has(resource))
      counts.set(resource, (counts.get(resource) ?? 0) + 1);
    return resource;
  }
  function ownMaterial(material) {
    if (!material) return material;
    for (const slot of mapSlots) if (material[slot]) own(material[slot]);
    return own(material);
  }
  function release(resource) {
    if (!resource || pinned.has(resource)) return;
    const shared = mergedGeometryRefs.get(resource);
    if (shared) {
      if (--shared.refs === 0) {
        mergedGeometryRefs.delete(resource);
        mergedGeometryCache.delete(shared.key);
        resource.dispose?.();
      }
      return;
    }
    const left = (counts.get(resource) ?? 1) - 1;
    if (left > 0) {
      counts.set(resource, left);
      return;
    }
    counts.delete(resource);
    resource.dispose?.();
  }
  function releaseMaterial(material) {
    if (!material) return;
    for (const slot of mapSlots) if (material[slot]) release(material[slot]);
    release(material);
  }
  // Thin foils and dust-sized chips only add shadow-map cost, so they stop casting.
  function solid(w, h, d) {
    const dimensions = [w, h, d].map(Math.abs);
    return !(
      Math.max(...dimensions) < 0.15 ||
      Math.min(...dimensions) <= 0.02 ||
      dimensions.filter((n) => n < 0.06).length >= 2
    );
  }
  function mat(color, extra = {}) {
    // A material is reusable only when it is a plain color plus plain options:
    // anything holding another resource (a cloned floor texture, for instance) is private.
    const plain = Object.keys(extra).every((k) => {
      const v = extra[k];
      return (
        v === null ||
        typeof v === "boolean" ||
        typeof v === "number" ||
        typeof v === "string"
      );
    });
    const key = plain
      ? `${
          typeof color === "string"
            ? color
            : typeof color === "number"
              ? `0x${color.toString(16)}`
              : "default"
        }|${JSON.stringify(
          Object.keys(extra)
            .sort()
            .map((k) => [k, extra[k]]),
        )}`
      : null;
    const make = () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.78,
        envMapIntensity: 0.35,
        ...extra,
      });
    if (!key) return ownMaterial(make());
    const hit = materialCache.get(key);
    if (hit) return hit;
    const material = pin(make());
    materialCache.set(key, material);
    return material;
  }
  function texture(kind) {
    const hit = textureCache.get(kind);
    if (hit) return hit;
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
    // Base maps stay for the page lifetime: floors clone them, and clones are released
    // with the material that owns them.
    textureCache.set(kind, t);
    return pin(t);
  }
  // One unit box serves every rectangular part: the dimensions move to mesh scale,
  // so a rebuild never uploads another identical box of vertex data.
  const unitBox = pin(new THREE.BoxGeometry(1, 1, 1));
  const unitSphere = pin(new THREE.SphereGeometry(1, 16, 10));
  function box(parent, x, y, z, w, h, d, color, extra = {}) {
    const m = new THREE.Mesh(
      unitBox,
      typeof color === "string" ? mat(color, extra) : ownMaterial(color),
    );
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = solid(w, h, d);
    m.receiveShadow = true;
    m.userData.unitBox = true;
    m.userData.dims = [w, h, d];
    parent.add(m);
    Object.assign(m, extra);
    return m;
  }
  function cylinder(parent, x, y, z, r, h, color, top = r) {
    const size = `${top}|${r}|${h}`;
    let geometry = geometryCache.get(size);
    if (!geometry) {
      geometry = pin(new THREE.CylinderGeometry(top, r, h, 24));
      geometryCache.set(size, geometry);
    }
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(x, y, z);
    m.castShadow = solid(r, h, r);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(parent, x, y, z, rx, ry, rz, color) {
    const m = new THREE.Mesh(unitSphere, mat(color));
    m.position.set(x, y, z);
    m.scale.set(rx, ry, rz);
    m.castShadow = solid(rx, ry, rz);
    parent.add(m);
    return m;
  }
  // Fewer draw calls: rectangular parts of one group that share a material become one
  // baked mesh. Named parts (the app finds them by name), glass parts (the app toggles
  // them on their own) and private or transparent materials stay as they are. Baking the
  // child transforms keeps the group bounds, and therefore every measured dimension,
  // exactly where the individual parts put them.
  function mergeBoxes(parent, minParts = 3, shapeKey = "") {
    const groups = new Map();
    for (const part of [...parent.children])
      if (
        part.isMesh &&
        part.userData.unitBox &&
        !part.name &&
        !part.userData.furnitureGlass &&
        !part.material.transparent
      ) {
        const list = groups.get(part.material);
        if (list) list.push(part);
        else groups.set(part.material, [part]);
      }
    const sourceIndex = unitBox.index;
    for (const [material, parts] of groups) {
      if (parts.length < minParts) continue;
      const srcPos = unitBox.attributes.position,
        srcNormal = unitBox.attributes.normal,
        srcUv = unitBox.attributes.uv,
        vertexCount = srcPos.count;
      const position = [],
        normal = [],
        uv = [],
        index = [];
      const point = new THREE.Vector3(),
        direction = new THREE.Vector3(),
        transform = new THREE.Matrix4(),
        turn = new THREE.Matrix3();
      parts.forEach((part, i) => {
        part.updateMatrix();
        transform.copy(part.matrix);
        turn.getNormalMatrix(transform);
        for (let k = 0; k < vertexCount; k++) {
          position.push(
            ...point.fromBufferAttribute(srcPos, k).applyMatrix4(transform)
              .toArray(),
          );
          normal.push(
            ...direction
              .fromBufferAttribute(srcNormal, k)
              .applyNormalMatrix(turn)
              .normalize()
              .toArray(),
          );
          uv.push(srcUv.getX(k), srcUv.getY(k));
        }
        for (let k = 0; k < sourceIndex.count; k++)
          index.push(sourceIndex.array[k] + i * vertexCount);
      });
      // The merged mesh keeps one reference to the material, so the other parts
      // hand their claim back here instead of at teardown.
      for (let extra = 1; extra < parts.length; extra++)
        releaseMaterial(material);
      const sharedKey = shapeKey ? `${shapeKey}|${material.uuid}` : null;
      let geometry = sharedKey ? mergedGeometryCache.get(sharedKey) : null;
      if (geometry) {
        mergedGeometryRefs.get(geometry).refs++;
      } else {
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(position, 3),
        );
        geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(index);
        geometry.computeBoundingSphere();
        if (sharedKey) {
          mergedGeometryCache.set(sharedKey, geometry);
          mergedGeometryRefs.set(geometry, { key: sharedKey, refs: 1 });
        }
      }
      const merged = new THREE.Mesh(geometry, material);
      merged.castShadow = parts.some((p) => p.castShadow);
      merged.receiveShadow = parts.some((p) => p.receiveShadow);
      parts.forEach((part) => {
        parent.remove(part);
        part.geometry !== unitBox || part;
      });
      parent.add(merged);
    }
    return parent;
  }
  function dispose(root) {
    root.traverse((o) => {
      if (o.geometry) release(o.geometry);
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          releaseMaterial(m);
    });
  }
  return {
    mat,
    texture,
    box,
    cylinder,
    sphere,
    mergeBoxes,
    dispose,
    release,
    pin,
  };
})();
