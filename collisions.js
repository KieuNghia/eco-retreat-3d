"use strict";
window.Eco = window.Eco || {};
Eco.collisions = (() => {
  function polygon(f) {
    const c = Math.cos(f.rotation || 0),
      s = Math.sin(f.rotation || 0);
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, z]) => ({
      x: f.x + (c * x * f.w) / 2 + (s * z * f.d) / 2,
      z: f.z - (s * x * f.w) / 2 + (c * z * f.d) / 2,
    }));
  }
  // Axes of an oriented box, used for separating-axis tests.
  function axes(p) {
    return p.slice(0, 4).map((v, i) => {
      const n = p[(i + 1) % 4],
        length = Math.hypot(n.x - v.x, n.z - v.z) || 1;
      return { x: -(n.z - v.z) / length, z: (n.x - v.x) / length };
    });
  }
  function overlap(a, b) {
    return [a, b].every((p) =>
      p.every((v, i) => {
        const n = p[(i + 1) % 4],
          axis = { x: -(n.z - v.z), z: n.x - v.x };
        const length = Math.hypot(axis.x, axis.z);
        const pa = a.map((q) => (q.x * axis.x + q.z * axis.z) / length);
        const pb = b.map((q) => (q.x * axis.x + q.z * axis.z) / length);
        return (
          Math.min(Math.max(...pa), Math.max(...pb)) -
            Math.max(Math.min(...pa), Math.min(...pb)) >
          0.005
        );
      }),
    );
  }
  // How deep two boxes interpenetrate, in metres: 0 when they do not overlap.
  // This is the distance needed to push one of them back apart.
  function penetration(a, b) {
    let depth = Infinity;
    for (const axis of [...axes(a), ...axes(b)]) {
      const pa = a.map((q) => q.x * axis.x + q.z * axis.z);
      const pb = b.map((q) => q.x * axis.x + q.z * axis.z);
      const depthOnAxis =
        Math.min(Math.max(...pa), Math.max(...pb)) -
        Math.max(Math.min(...pa), Math.min(...pb));
      if (depthOnAxis <= 0) return 0;
      depth = Math.min(depth, depthOnAxis);
    }
    return depth;
  }
  function circleIntersects(x, z, r, b) {
    // Rotate the walker into the object's local coordinates: no oversized world AABB.
    const c = Math.cos(b.rotation || 0),
      s = Math.sin(b.rotation || 0);
    const dx = x - b.x,
      dz = z - b.z,
      lx = c * dx - s * dz,
      lz = s * dx + c * dz;
    const ex = Math.max(Math.abs(lx) - b.w / 2, 0),
      ez = Math.max(Math.abs(lz) - b.d / 2, 0);
    return ex * ex + ez * ez < r * r;
  }
  function wall(w, defaultThickness) {
    const t = w.thickness || defaultThickness;
    return {
      x: (w.x1 + w.x2) / 2,
      z: (w.z1 + w.z2) / 2,
      w: Math.hypot(w.x2 - w.x1, w.z2 - w.z1) + t,
      d: t,
      rotation: -Math.atan2(w.z2 - w.z1, w.x2 - w.x1),
    };
  }
  // One height default for every consumer: an item without h is a 1 m body.
  const heightOf = (f) => f.h ?? 1;
  return { polygon, overlap, penetration, circleIntersects, wall, heightOf };
})();
