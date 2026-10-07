"use strict";
Eco.createNavigation = function ({ camera, planCamera, getData, isBlocked }) {
  const keys = new Set(),
    target = new THREE.Vector3();
  let mode = "orbit",
    yaw = 0,
    pitch = 0,
    angle = 0.1,
    elevation = 1.06,
    distance = 14.7;
  function center() {
    const d = getData();
    target.set(d.width / 2, 0.2, d.depth / 2);
  }
  center();
  function setMode(value) {
    mode = value;
    keys.clear();
    if (mode !== "walk") return;
    const d = getData();
    if (!camera.userData.walkPosition) {
      camera.position.set(d.spawn.x, d.eye, d.spawn.z);
      yaw = d.spawn.yaw;
      pitch = 0;
    } else camera.position.copy(camera.userData.walkPosition);
    camera.position.y = d.eye;
  }
  function resize(width, height) {
    const d = getData(),
      a = width / height;
    camera.aspect = a;
    camera.updateProjectionMatrix();
    const size = Math.max(d.depth / 2 + 1.25, (d.width / 2 + 2) / a);
    Object.assign(planCamera, {
      left: -size * a,
      right: size * a,
      top: size,
      bottom: -size,
    });
    planCamera.updateProjectionMatrix();
  }
  function clampTarget() {
    const d = getData();
    target.x = Math.max(-3, Math.min(d.width + 3, target.x));
    target.z = Math.max(-3, Math.min(d.depth + 3, target.z));
  }
  // Keep the point under the cursor fixed on the floor while dragging the camera.
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    ray = new THREE.Raycaster();
  function floorPoint(x, y, canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    camera.updateMatrixWorld(true);
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        1 - ((y - rect.top) / rect.height) * 2,
      ),
      camera,
    );
    if (ray.ray.direction.y >= -0.05) return null;
    const point = ray.ray.intersectPlane(floor, new THREE.Vector3());
    return point && point.distanceTo(camera.position) < 50 ? point : null;
  }
  function panByPointer(previousX, previousY, currentX, currentY, canvas) {
    const previous = floorPoint(previousX, previousY, canvas),
      current = floorPoint(currentX, currentY, canvas);
    if (!previous || !current) return false;
    const oldX = target.x,
      oldZ = target.z;
    target.x += previous.x - current.x;
    target.z += previous.z - current.z;
    clampTarget();
    camera.position.x += target.x - oldX;
    camera.position.z += target.z - oldZ;
    camera.updateMatrixWorld(true);
    return true;
  }
  function look(dx, dy, pan, pointer) {
    if (mode === "walk") {
      yaw -= dx * 0.003;
      pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.003));
    } else if (mode === "orbit") {
      if (pan) {
        if (
          !pointer ||
          !panByPointer(
            pointer.previousX,
            pointer.previousY,
            pointer.currentX,
            pointer.currentY,
            pointer.canvas,
          )
        ) {
          // At the horizon the ground plane cannot be picked; use a bounded screen-space step.
          const k =
            (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) /
            (pointer?.canvas?.getBoundingClientRect().height || 800);
          const vertical = Math.min(
            k / Math.max(Math.sin(elevation), 0.3),
            k * 3,
          );
          target.x +=
            -Math.cos(angle) * dx * k + Math.sin(angle) * dy * vertical;
          target.z +=
            Math.sin(angle) * dx * k - Math.cos(angle) * dy * vertical;
          clampTarget();
        }
      } else {
        angle -= dx * 0.006;
        elevation = Math.max(0.3, Math.min(1.49, elevation + dy * 0.004));
      }
    }
  }
  function zoom(delta) {
    distance = Math.max(4, Math.min(40, distance + delta * 0.012));
  }
  function move(dx, dz) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.04));
    for (let i = 0; i < n; i++) {
      if (!isBlocked(camera.position.x + dx / n, camera.position.z))
        camera.position.x += dx / n;
      if (!isBlocked(camera.position.x, camera.position.z + dz / n))
        camera.position.z += dz / n;
    }
  }
  function update(dt, allowKeyboard = true) {
    const d = getData();
    const f = allowKeyboard
      ? Number(keys.has("KeyW") || keys.has("ArrowUp")) -
        Number(keys.has("KeyS") || keys.has("ArrowDown"))
      : 0;
    const s = allowKeyboard
      ? Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"))
      : 0;
    const n = Math.hypot(f, s) || 1;
    if (mode === "walk") {
      move(
        ((-Math.sin(yaw) * f + Math.cos(yaw) * s) * dt * 1.6) / n,
        ((-Math.cos(yaw) * f - Math.sin(yaw) * s) * dt * 1.6) / n,
      );
      camera.rotation.set(pitch, yaw, 0);
      camera.position.y = d.eye;
      camera.userData.walkPosition = camera.position.clone();
    } else if (mode === "orbit") {
      target.x += ((-Math.sin(angle) * f + Math.cos(angle) * s) * dt * 2) / n;
      target.z += ((-Math.cos(angle) * f - Math.sin(angle) * s) * dt * 2) / n;
      clampTarget();
      camera.position.set(
        target.x + Math.sin(angle) * Math.cos(elevation) * distance,
        target.y + Math.sin(elevation) * distance,
        target.z + Math.cos(angle) * Math.cos(elevation) * distance,
      );
      camera.lookAt(target);
    } else {
      planCamera.position.set(d.width / 2, 20, d.depth / 2);
      planCamera.up.set(0, 0, -1);
      planCamera.lookAt(d.width / 2, 0, d.depth / 2);
    }
  }
  function reset() {
    camera.userData.walkPosition = null;
    angle = 0.1;
    elevation = 1.06;
    distance = 14.7;
    center();
    setMode(mode);
  }
  function modelChanged() {
    camera.userData.walkPosition = null;
    center();
  }
  function frameApartment() {
    center();
    elevation = 0.68;
    distance = Math.max(
      16,
      (getData().width / 2 + 1) /
        (Math.tan((camera.fov * Math.PI) / 360) * Math.max(0.4, camera.aspect)),
    );
  }
  return {
    keys,
    setMode,
    resize,
    look,
    zoom,
    update,
    reset,
    modelChanged,
    frameApartment,
  };
};
