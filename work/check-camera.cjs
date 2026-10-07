"use strict";
const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert");
const THREE = require("../outputs/eco-retreat-v2/vendor/three.min.js");
const sandbox = { THREE, Eco: {} };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync("outputs/eco-retreat-v2/navigation.js", "utf8"),
  sandbox,
);
const data = {
    width: 10.5,
    depth: 8.23,
    eye: 1.65,
    spawn: { x: 5, z: 4, yaw: 0 },
  },
  camera = new THREE.PerspectiveCamera(58, 1200 / 800, 0.03, 150),
  plan = new THREE.OrthographicCamera(-7, 7, 7, -7, 0.1, 100),
  navigation = sandbox.Eco.createNavigation({
    camera,
    planCamera: plan,
    getData: () => data,
    isBlocked: () => false,
  }),
  canvas = {
    getBoundingClientRect: () => ({
      left: 30,
      top: 20,
      width: 1200,
      height: 800,
    }),
  };
navigation.resize(1200, 800);
navigation.setMode("orbit");
function project(p) {
  camera.updateMatrixWorld(true);
  const v = p.clone().project(camera);
  return { x: 30 + (v.x + 1) * 600, y: 20 + (1 - v.y) * 400 };
}
function anchoredDrag(p, dx, dy) {
  navigation.update(0);
  const first = project(p),
    from = camera.position.clone();
  navigation.look(dx, dy, true, {
    previousX: first.x,
    previousY: first.y,
    currentX: first.x + dx,
    currentY: first.y + dy,
    canvas,
  });
  navigation.update(0);
  const after = project(p);
  assert(
    Math.abs(after.x - first.x - dx) < 0.1,
    "Dragged floor point follows cursor horizontally",
  );
  assert(
    Math.abs(after.y - first.y - dy) < 0.1,
    "Dragged floor point follows cursor vertically",
  );
  assert.equal(camera.position.y, from.y, "Pan stays parallel to floor");
  return from;
}
const point = new THREE.Vector3(5.2, 0, 4.2);
anchoredDrag(point, 0, -100);
anchoredDrag(point, 0, 100);
navigation.look(160, -70, false); // another azimuth and elevation
anchoredDrag(point, 80, 95);
anchoredDrag(point, -80, -95);
navigation.frameApartment();
anchoredDrag(point, 0, -120); // shallower 3D furnishing view
console.log(
  "Right-button floor pan follows cursor vertically and horizontally at multiple angles",
);
