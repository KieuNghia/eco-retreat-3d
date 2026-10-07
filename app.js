"use strict";
const $ = (id) => document.getElementById(id),
  status = $("status");
try {
  if (!window.THREE)
    throw Error(
      "Не удалось загрузить библиотеку 3D. Распакуйте весь ZIP, сохранив папку vendor.",
    );
  start();
} catch (e) {
  status.textContent = "Не удалось открыть 3D: " + e.message;
  status.style.background = "#8a2930";
  console.error(e);
}
function start() {
  let data = Eco.modelState.prepare(makeApartment()),
    mode = "orbit",
    apartment,
    world,
    labels = [],
    furniture,
    wallMeshes = [],
    glass = [],
    drag = null,
    last = performance.now();
  const { scene, renderer, camera, planCamera, sun } = Eco.createRenderer(data);
  const navigation = Eco.createNavigation({
      camera,
      planCamera,
      getData: () => data,
      isBlocked: blocked,
    }),
    keys = navigation.keys;
  let furnisher;
  const measure = createMeasureTools({
    scene,
    canvas: renderer.domElement,
    getData: () => data,
    getCamera: () => (mode === "plan" ? planCamera : camera),
    getWorld: () => world,
  });
  // Construct off-scene, then atomically publish. Failed builds retain the old apartment.
  function rebuild(candidate = data) {
    const next = Eco.buildApartment(candidate),
      previous = apartment;
    scene.add(next.world);
    apartment = next;
    data = candidate;
    ({ world, furniture, labels, wallMeshes, glass } = next);
    if (previous) {
      scene.remove(previous.world);
      previous.dispose();
    }
    measure.clear();
    updateVisibility();
    updateEditor();
  }
  function syncFurniture() {
    apartment.syncFurniture(data.furniture);
    updateVisibility();
    updateEditor();
  }
  function updateVisibility() {
    const cut = mode !== "walk" && $("low").checked;
    wallMeshes.forEach((m) => {
      m.scale.y = cut ? 0.27 : 1;
      m.position.y = (data.ceiling * m.scale.y) / 2;
    });
    labels.forEach((s) => (s.visible = mode !== "walk" && $("labels").checked));
    furniture.visible = $("furniture").checked;
    furniture.traverse((g) => {
      if (g.userData.furnitureGlass) g.visible = mode !== "plan";
    });
    glass.forEach((g) => {
      if (g.userData.hidden) return;
      g.visible = mode !== "plan";
    });
  }
  function resize() {
    const rect = $("viewport").getBoundingClientRect(),
      w = rect.width || innerWidth,
      h = rect.height || innerHeight;
    renderer.setSize(w, h);
    navigation.resize(w, h);
  }
  function setMode(m) {
    if (m === "walk" && furnisher?.active) furnisher.close();
    mode = m;
    keys.clear();
    document.body.classList.toggle("walk", m === "walk");
    $("crosshair").hidden = m !== "walk";
    for (const id of ["walk", "plan", "orbit"])
      $(id).classList.toggle("active", m === id);
    if (m !== "walk") document.exitPointerLock?.();
    navigation.setMode(m);
    updateVisibility();
    resize();
    $("hint").textContent =
      m === "walk"
        ? "WASD / стрелки — идти · мышь с зажатой кнопкой — смотреть · клик — захват мыши · Esc — курсор"
        : m === "plan"
          ? "План ориентирован как оригинал · 3D-обзор — объёмная модель"
          : "Левая кнопка — вращать · правая / Shift — сдвигать · WASD — перемещать · колесо — масштаб";
    status.textContent =
      m === "walk"
        ? "Прогулка · коллизии включены · высота " + data.eye.toFixed(2) + " м"
        : m === "plan"
          ? "Вид сверху · расположение мебели по оригиналу"
          : "Объёмная модель по исходной картинке";
  }
  function blocked(x, z) {
    const r = 0.17;
    if (x < r || z < r || x > data.width - r || z > data.depth - r) return true;
    if (
      apartment.wallColliders.some((b) =>
        Eco.collisions.circleIntersects(x, z, r, b),
      )
    )
      return true;
    return (
      furniture.visible &&
      data.furniture.some(
        (f) =>
          f.type !== "rug" &&
          (f.y || 0) < data.eye + 0.15 &&
          Eco.collisions.circleIntersects(x, z, r, f),
      )
    );
  }
  renderer.domElement.addEventListener("contextmenu", (e) =>
    e.preventDefault(),
  );
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (furnisher.down(e)) {
      renderer.domElement.setPointerCapture(e.pointerId);
      return;
    }
    drag = {
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      moved: false,
      pan: e.button === 2 || e.shiftKey,
    };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (furnisher.move(e)) return;
    measure.hover(e);
    const lock = document.pointerLockElement === renderer.domElement;
    if (!lock && !drag) return;
    const previousX = drag?.x,
      previousY = drag?.y;
    let dx = lock ? e.movementX : e.clientX - drag.x,
      dy = lock ? e.movementY : e.clientY - drag.y;
    if (drag) {
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
    }
    navigation.look(
      dx,
      dy,
      drag?.pan,
      drag?.pan
        ? {
            previousX,
            previousY,
            currentX: e.clientX,
            currentY: e.clientY,
            canvas: renderer.domElement,
          }
        : null,
    );
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    furnisher.up();
    const click = drag && !drag.moved && drag.button === 0;
    drag = null;
    if (click && measure.active) {
      measure.click(e);
      return;
    }
    if (
      click &&
      mode === "walk" &&
      document.pointerLockElement !== renderer.domElement
    ) {
      try {
        const p = renderer.domElement.requestPointerLock?.();
        p?.catch(() => {
          status.textContent =
            "Захват мыши недоступен: смотрите, удерживая кнопку мыши.";
        });
      } catch {
        status.textContent = "Для обзора удерживайте кнопку мыши.";
      }
    }
  });
  renderer.domElement.addEventListener("pointerleave", () =>
    furnisher.hideGhost(),
  );
  renderer.domElement.addEventListener("pointercancel", () => {
    drag = null;
    furnisher.up();
  });
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      navigation.zoom(e.deltaY);
    },
    { passive: false },
  );
  addEventListener("keydown", (e) => {
    if (furnisher.key(e)) return;
    if (
      document.querySelector("dialog[open]") ||
      /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName)
    )
      return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    ) {
      keys.add(e.code);
      e.preventDefault();
    }
    if (e.code === "KeyT") setMode(mode === "plan" ? "orbit" : "plan");
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());
  document.querySelectorAll("[data-key]").forEach((b) => {
    b.onpointerdown = (e) => {
      e.preventDefault();
      keys.add(b.dataset.key);
      b.setPointerCapture(e.pointerId);
    };
    b.onpointerup = b.onpointercancel = () => keys.delete(b.dataset.key);
  });
  for (const m of ["orbit", "walk", "plan"]) $(m).onclick = () => setMode(m);
  $("reset").onclick = () => {
    navigation.reset();
    setMode(mode);
  };
  for (const id of ["low", "labels", "furniture"])
    $(id).onchange = updateVisibility;
  const referenceViewer = Eco.createReferenceViewer();
  function open(id) {
    keys.clear();
    document.exitPointerLock?.();
    $(id).showModal();
  }
  $("drawingOpen").onclick = () => {
    measure.plan();
    open("drawing");
  };
  $("reference").onclick = () => {
    referenceViewer.reset();
    open("source");
  };
  $("edit").onclick = () => {
    updateEditor();
    open("editor");
  };
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  function updateEditor() {
    for (const [id, key] of [
      ["width", "width"],
      ["depth", "depth"],
      ["height", "ceiling"],
      ["eye", "eye"],
    ])
      $(id).value = data[key];
    $("json").value = JSON.stringify(data, null, 2);
    $("area").textContent =
      "Габаритный прямоугольник: " +
      (data.width * data.depth).toFixed(2) +
      " м². Чистая площадь меньше из-за стен. База из беседы: 86,4 м².";
  }
  function apply(d) {
    const candidate = Eco.modelState.prepare(d);
    rebuild(candidate);
    furnisher.reset();
    navigation.modelChanged();
    sun.position.set(data.width / 2, 10, -6);
    sun.target.position.set(data.width / 2, 0, data.depth / 2);
    resize();
    setMode(mode);
    $("error").textContent = "Модель загружена.";
  }
  function reportError(error) {
    $("error").textContent = error.message;
    status.textContent = error.message;
  }
  $("applyDimensions").onclick = () => {
    try {
      const d = JSON.parse(JSON.stringify(data)),
        w = +$("width").value,
        z = +$("depth").value,
        sx = w / d.width,
        sz = z / d.depth;
      if (w < 9 || w > 12 || z < 7 || z > 10)
        throw Error("Габариты: ширина 9–12 м, глубина 7–10 м.");
      d.width = w;
      d.depth = z;
      d.ceiling = +$("height").value;
      d.eye = +$("eye").value;
      for (const v of d.walls) {
        v.x1 *= sx;
        v.x2 *= sx;
        v.z1 *= sz;
        v.z2 *= sz;
      }
      for (const arr of [d.furniture, d.floors])
        for (const v of arr) {
          v.x *= sx;
          v.z *= sz;
          v.w *= sx;
          v.d *= sz;
        }
      for (const l of d.labels) {
        l.x *= sx;
        l.z *= sz;
      }
      d.spawn.x *= sx;
      d.spawn.z *= sz;
      apply(d);
    } catch (e) {
      reportError(e);
    }
  };
  $("applyJson").onclick = () => {
    try {
      apply(JSON.parse($("json").value));
    } catch (e) {
      reportError(e);
    }
  };
  $("export").onclick = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "eco-retreat-model.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("import").onchange = async (e) => {
    try {
      const f = e.target.files[0];
      if (f) {
        if (f.size > 1000000) throw Error("Файл слишком большой.");
        apply(JSON.parse(await f.text()));
      }
    } catch (err) {
      reportError(err);
    }
    e.target.value = "";
  };
  furnisher = createFurnisher({
    scene,
    canvas: renderer.domElement,
    getData: () => data,
    getCamera: () => (mode === "plan" ? planCamera : camera),
    getFurniture: () => furniture,
    getPreviews: Eco.furniturePreviews,
    makeGhost: (f) => Eco.makeFurniture({ ...f, x: 0, z: 0, rotation: 0 }),
    syncFurniture,
    setMode,
    onResize: resize,
    onStart: () => {
      keys.clear();
      document.exitPointerLock?.();
      if (measure.active) tapeToggle();
      navigation.frameApartment();
      $("low").checked = true;
    },
  });
  const tapeToggle = $("tape").onclick;
  $("tape").onclick = () => {
    if (furnisher.active) furnisher.close();
    tapeToggle();
  };
  rebuild();
  resize();
  setMode("orbit");
  addEventListener("resize", resize);
  function frame(t) {
    const dt = Math.min((t - last) / 1000, 0.05);
    last = t;
    const editing =
      document.querySelector("dialog[open]") ||
      /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName);
    navigation.update(dt, !editing);
    renderer.render(scene, mode === "plan" ? planCamera : camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
