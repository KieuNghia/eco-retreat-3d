"use strict";
window.Eco = window.Eco || {};

// Magnetic edge alignment for furniture placement. Coordinates remain metres.
Eco.snapFurniture = function (data, moving, excludeIndex = -1) {
  const { polygon, overlap, wall } = Eco.collisions;
  const threshold = 0.2;
  const ignored = new Set([
    "rug", "plant", "toilet", "basin", "bath", "wallShower",
    "cornerShower", "shower", "cooktop", "oven", "microwave", "hood",
  ]);
  const cabinets = new Set([
    "wardrobe", "cabinet", "shelf", "shoeCabinet", "fridge", "washer",
    "baseCabinet", "drawerCabinet", "wallCabinet", "tallCabinet",
    "ovenHousing", "kitchenSink", "dishwasher", "counter",
  ]);
  const original = { x: moving.x, z: moving.z, targetIndex: -1 };
  if (ignored.has(moving.type)) return original;
  const project = (points, axis) => {
    const values = points.map((p) => p.x * axis.x + p.z * axis.z);
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  const dot = (a, b) => a.x * b.x + a.z * b.z;
  const axes = (f) => {
    const c = Math.cos(f.rotation || 0), s = Math.sin(f.rotation || 0);
    return [{ x: c, z: -s }, { x: s, z: c }];
  };
  const verticalOverlap = (a, b) =>
    Math.min((a.y || 0) + (a.h || 1), (b.y || 0) + (b.h || 1)) -
      Math.max(a.y || 0, b.y || 0) > 0.05;
  function clear(candidate) {
    const points = polygon(candidate);
    if (points.some((p) => p.x < 0 || p.z < 0 || p.x > data.width || p.z > data.depth))
      return false;
    if (data.walls.some((w) => w.kind !== "sliding" && overlap(points, polygon(wall(w, data.wallThickness)))))
      return false;
    return !data.furniture.some((other, i) =>
      i !== excludeIndex &&
      other.type !== "rug" &&
      verticalOverlap(candidate, other) &&
      overlap(points, polygon(other)),
    );
  }
  const movingPoints = polygon(moving), movingAxes = axes(moving);
  let best = null;
  for (let i = 0; i < data.furniture.length; i++) {
    const other = data.furniture[i];
    if (i === excludeIndex || ignored.has(other.type) || !verticalOverlap(moving, other))
      continue;
    const otherPoints = polygon(other), otherAxes = axes(other);
    for (const base of movingAxes)
      for (const sign of [-1, 1]) {
        const normal = { x: base.x * sign, z: base.z * sign };
        if (Math.max(...otherAxes.map((axis) => Math.abs(dot(normal, axis)))) < 0.99)
          continue;
        const tangent = { x: -normal.z, z: normal.x };
        const a = project(movingPoints, normal), b = project(otherPoints, normal);
        const at = project(movingPoints, tangent), bt = project(otherPoints, tangent);
        const gap = b.min - a.max;
        if (gap < -0.08 || gap > threshold ||
            Math.min(at.max, bt.max) - Math.max(at.min, bt.min) < 0.08)
          continue;
        let lateral = 0;
        if (cabinets.has(moving.type) && cabinets.has(other.type)) {
          const choices = [bt.min - at.min, bt.max - at.max];
          const nearest = choices.reduce((x, y) => Math.abs(x) < Math.abs(y) ? x : y);
          if (Math.abs(nearest) <= 0.12) lateral = nearest;
        }
        let candidate = {
          ...moving,
          x: moving.x + normal.x * gap + tangent.x * lateral,
          z: moving.z + normal.z * gap + tangent.z * lateral,
        };
        if (!clear(candidate) && lateral) {
          lateral = 0;
          candidate = {
            ...moving,
            x: moving.x + normal.x * gap,
            z: moving.z + normal.z * gap,
          };
        }
        if (!clear(candidate)) continue;
        const score = Math.hypot(gap, lateral);
        if (!best || score < best.score)
          best = { x: candidate.x, z: candidate.z, targetIndex: i, score };
      }
  }
  return best ? { x: best.x, z: best.z, targetIndex: best.targetIndex } : original;
};
