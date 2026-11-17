"use strict";
window.Eco = window.Eco || {};

// Magnetic edge alignment for furniture placement. Coordinates remain metres.
// Solid walls and the room bounds are targets as well, so pressing an item
// against a wall joins it instead of refusing to snap.
Eco.snapFurniture = function (data, moving, excludeIndex = -1) {
  const { polygon, overlap, penetration, wall, heightOf } = Eco.collisions;
  const threshold = 0.2;
  // cos ~26°. The editor rotates in 15° steps, so a 0.99 test only ever joined
  // 90° multiples; 0.9 lets an angled item snap and then be squared to the face.
  const parallel = 0.9;
  const quarter = Math.PI / 2;
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
  const axes = (rotation) => {
    const c = Math.cos(rotation || 0), s = Math.sin(rotation || 0);
    return [{ x: c, z: -s }, { x: s, z: c }];
  };
  // Squares the mover onto the nearest axis of the target by the smallest angle,
  // so a 15° draft becomes flush without flipping the item to a stranger angle.
  const align = (from, to) => {
    const norm = (a) => ((a % quarter) + quarter) % quarter;
    let delta = norm(to) - norm(from);
    if (delta > quarter / 2) delta -= quarter;
    if (delta < -quarter / 2) delta += quarter;
    const rotation = from + delta;
    // Squaring should report the axis exactly, not the residue of the modulo.
    const axis = Math.round(rotation / quarter) * quarter;
    return Math.abs(rotation - axis) < 1e-9 ? axis : rotation;
  };
  const verticalOverlap = (a, b) =>
    Math.min((a.y || 0) + heightOf(a), (b.y || 0) + heightOf(b)) -
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

  // Room edges: furniture along a glazed boundary still wants to be flush. The
  // boxes sit outside the apartment, so they are never themselves an obstacle.
  const bounds = [
    { x: data.width / 2, z: -0.25, w: data.width, d: 0.5, rotation: 0 },
    { x: data.width / 2, z: data.depth + 0.25, w: data.width, d: 0.5, rotation: 0 },
    { x: -0.25, z: data.depth / 2, w: 0.5, d: data.depth, rotation: 0 },
    { x: data.width + 0.25, z: data.depth / 2, w: 0.5, d: data.depth, rotation: 0 },
  ];

  let best = null;
  function consider(target, targetIndex, lateralAllowed) {
    const targetPoints = polygon(target),
      targetAxes = axes(target.rotation),
      targetRotation = target.rotation || 0;
    const startRotation = moving.rotation || 0,
      startAxes = axes(startRotation),
      startPoints = polygon({ ...moving, rotation: startRotation });
    for (const base of targetAxes)
      for (const sign of [-1, 1]) {
        const normal = { x: base.x * sign, z: base.z * sign };
        if (Math.max(...startAxes.map((axis) => Math.abs(dot(normal, axis)))) < parallel)
          continue;
        const rotation = align(startRotation, targetRotation);
        const points =
          rotation === startRotation ? startPoints : polygon({ ...moving, rotation });
        const tangent = { x: -normal.z, z: normal.x };
        const a = project(points, normal), b = project(targetPoints, normal);
        const at = project(points, tangent), bt = project(targetPoints, tangent);
        if (Math.min(at.max, bt.max) - Math.max(at.min, bt.min) < 0.08) continue;
        // The signed shift that makes the mover flush with this face: positive when
        // it is short of the face, negative when it is sunk into it. Pushing out by
        // the overlap depth lands short of flush, which is what made dragging a
        // cabinet into a partition inert: the candidate still intersected the wall
        // and was rejected.
        const gap = b.min - a.max;
        const sunk = penetration(points, targetPoints);
        if (sunk > threshold + 1e-6) continue;
        // Only an actual interpenetration may push further than the threshold: that
        // is the item being pressed into the face, and the shift lands it flush.
        // A negative gap without overlap means the item is already past the face.
        if (sunk <= 0 && Math.abs(gap) > threshold + 1e-6) continue;
        let lateral = 0;
        if (lateralAllowed && cabinets.has(moving.type) && cabinets.has(target.type)) {
          const choices = [bt.min - at.min, bt.max - at.max];
          const nearest = choices.reduce((x, y) => (Math.abs(x) < Math.abs(y) ? x : y));
          if (Math.abs(nearest) <= 0.12) lateral = nearest;
        }
        let candidate = {
          ...moving,
          rotation,
          x: moving.x + normal.x * gap + tangent.x * lateral,
          z: moving.z + normal.z * gap + tangent.z * lateral,
        };
        if (!clear(candidate) && lateral) {
          lateral = 0;
          candidate = {
            ...moving,
            rotation,
            x: moving.x + normal.x * gap,
            z: moving.z + normal.z * gap,
          };
        }
        if (!clear(candidate)) continue;
        const score = Math.hypot(gap, lateral) + Math.abs(rotation - startRotation) * 0.5;
        if (!best || score < best.score)
          best = {
            x: candidate.x,
            z: candidate.z,
            rotation,
            targetIndex,
            score,
          };
      }
  }

  // -1 is reserved for "no snap", so wall and boundary targets are encoded below it.
  // A glazed segment is a face to sit flush against too; sliding panels and rails
  // are not, because they are not solid boundaries.
  data.walls.forEach((w, i) => {
    if (w.kind !== "wall" && w.kind !== "window") return;
    consider(wall(w, data.wallThickness), -(i + 2), cabinets.has(moving.type));
  });
  bounds.forEach((edge, i) => consider(edge, -(data.walls.length + i + 2), false));
  data.furniture.forEach((other, i) => {
    if (i === excludeIndex || ignored.has(other.type) || !verticalOverlap(moving, other))
      return;
    consider(other, i, cabinets.has(moving.type) && cabinets.has(other.type));
  });

  return best
    ? { x: best.x, z: best.z, rotation: best.rotation, targetIndex: best.targetIndex }
    : original;
};
