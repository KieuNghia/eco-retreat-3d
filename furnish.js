"use strict";

window.createFurnisher = function ({
  scene,
  canvas,
  getData,
  getCamera,
  getFurniture,
  getPreviews,
  makeGhost,
  syncFurniture,
  setMode,
  onStart,
  onResize,
  shadowsDirty,
  applyModel,
}) {
  const $ = (id) => document.getElementById(id),
    catalog = window.furnitureCatalog,
    ray = new THREE.Raycaster(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    history = [],
    future = [];
  let active = false,
    selected = -1,
    pending = null,
    drag = null,
    ghost = null,
    pendingAngle = 0,
    cameraTool = false,
    refreshPending = false;
  // Sparse by catalog index: undefined = not rendered yet, false = failed.
  const previews = [],
    requested = new Set();
  let previewsPending = false;
  function fillPreviews() {
    document.querySelectorAll(".catalog-item").forEach((button) => {
      const image = button.querySelector("img"),
        src = previews[Number(button.dataset.catalogIndex)];
      if (image && src) {
        image.src = src;
        image.hidden = false;
      }
    });
  }
  function requestPreviews() {
    if (previewsPending) return;
    const category = $("furnishCategory").value,
      missing = [];
    catalog.forEach((f, i) => {
      if (
        previews[i] === undefined &&
        !requested.has(i) &&
        (!category || category === "all" || f.category === category)
      )
        missing.push(i);
      });
    if (!missing.length) return;
    previewsPending = true;
    missing.forEach((i) => requested.add(i));
    Promise.resolve()
      .then(() => getPreviews(catalog, missing))
      .then((images) => {
        for (const { index, src } of images) previews[index] = src;
      })
      .catch((e) => {
        console.warn("Превью недоступны", e);
        for (const i of missing)
          if (previews[i] === undefined) previews[i] = false;
      })
      .finally(() => {
        previewsPending = false;
        fillPreviews();
        // Category may have changed while a render was in flight.
        if (active) requestPreviews();
      });
  }
  const outline = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xe98b24, depthTest: false }),
  );
  outline.name = "furniture-selection";
  outline.renderOrder = 110;
  outline.visible = false;
  scene.add(outline);
  const clone = (v) => JSON.parse(JSON.stringify(v)),
    current = () => getData().furniture[selected],
    limit = 60;
  // Undo entries are inverse operations, not whole-array snapshots: adding or
  // moving one item stores one small record instead of a copy of the model.
  // Both stacks are capped, so a long session stays bounded in memory.
  function pushOp(entry) {
    history.push(entry);
    if (history.length > limit) history.shift();
    future.length = 0;
  }
  const { polygon, overlap, wall, heightOf } = Eco.collisions,
    footprintCache = new WeakMap();
  function footprint(f) {
    const key = [f.x, f.z, f.w, f.d, f.rotation || 0].join("|");
    const cached = footprintCache.get(f);
    if (cached?.key === key) return cached.polygon;
    const result = polygon(f);
    footprintCache.set(f, { key, polygon: result });
    return result;
  }
  function scheduleRefresh() {
    if (refreshPending) return;
    refreshPending = true;
    setTimeout(() => {
      refreshPending = false;
      refresh();
    }, 16);
  }
  function warning(f) {
    const p = footprint(f),
      d = getData();
    if (p.some((v) => v.x < 0 || v.z < 0 || v.x > d.width || v.z > d.depth))
      return "Предмет выходит за границы квартиры.";
    if (
      d.walls.some(
        (w) =>
          w.kind !== "sliding" && overlap(p, polygon(wall(w, d.wallThickness))),
      )
    )
      return "Пересечение со стеной или остеклением.";
    if (
      f.type !== "rug" &&
      d.furniture.some(
        (o, i) =>
          i !== selected &&
          o.type !== "rug" &&
          Math.min((f.y || 0) + heightOf(f), (o.y || 0) + heightOf(o)) -
            Math.max(f.y || 0, o.y || 0) >
            0.005 &&
          overlap(p, footprint(o)),
      )
    )
      return "Пересечение с другой мебелью. Допустимо, например, для стула под столом.";
    return "Место свободно. Проверьте удобство проходов в режиме прогулки.";
  }
  function refresh() {
    const f = current();
    $("furnishSelection").hidden = !f;
    $("furnishEmpty").hidden = !!f;
    $("furnishUndo").disabled = !history.length;
    $("furnishRedo").disabled = !future.length;
    outline.visible = active && !!f;
    if (!f) return;
    const g = getFurniture().children[selected];
    if (g) {
      g.position.set(f.x, f.y || 0, f.z);
      g.rotation.y = f.rotation || 0;
      shadowsDirty();
    }
    outline.geometry.dispose();
    outline.geometry = new THREE.BufferGeometry().setFromPoints(
      footprint(f).map((p) => new THREE.Vector3(p.x, (f.y || 0) + 0.015, p.z)),
    );
    const msg = warning(f);
    $("furnishWarning").textContent = msg;
    outline.material.color.set(msg.startsWith("Место") ? 0x1b937f : 0xe66b28);
    $("furnishName").textContent =
      f.name ||
      {
        bed: "Кровать",
        sofa: "Диван",
        wardrobe: "Шкаф",
        rug: "Ковёр",
        desk: "Рабочий стол",
        diningChair: "Стул",
        basin: "Раковина",
        toilet: "Унитаз",
      }[f.type] ||
      f.type;
    $("furnishHeightLabel").textContent = [
      "coffee",
      "side",
      "dining",
      "desk",
    ].includes(f.type)
      ? "Высота столешницы, м"
      : "Высота корпуса, м";
    const bounds = g
      ? new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3())
      : { y: 1 };
    for (const [id, v] of Object.entries({
      furnishW: f.w,
      furnishD: f.d,
      furnishH: f.h || g?.userData.bodyHeight || bounds.y,
      furnishX: f.x,
      furnishZ: f.z,
      furnishY: f.y || 0,
      furnishAngle: ((f.rotation || 0) * 180) / Math.PI,
    }))
      $(id).value = Number(v.toFixed(3));
    $("furnishColor").value = f.color || "#b7a184";
  }
  function clearGhost() {
    if (!ghost) return;
    scene.remove(ghost);
    Eco.geometry.dispose(ghost);
    ghost = null;
  }
  function cancelPlacement() {
    pending = null;
    pendingAngle = 0;
    clearGhost();
    document
      .querySelectorAll(".catalog-item")
      .forEach((b) => b.classList.remove("chosen"));
  }
  function magneticPosition(f, x, z, excludeIndex, e) {
    if (!$('furnishMagnet').checked || e?.ctrlKey)
      return { x, z, rotation: f.rotation || 0, targetIndex: -1 };
    return Eco.snapFurniture(getData(), { ...f, x, z }, excludeIndex);
  }
  function previewAt(p, e) {
    if (!ghost || !p) return;
    const f = catalog[pending];
    const position = magneticPosition(
      { ...f, rotation: pendingAngle }, snap(p.x), snap(p.z), -1, e,
    );
    ghost.position.set(position.x, f.y || 0, position.z);
    ghost.rotation.y = position.rotation ?? pendingAngle;
    ghost.visible = true;
  }
  function renderCatalog() {
    const category = $("furnishCategory").value;
    $("furnishCatalog").innerHTML = "";
    catalog.forEach((f, i) => {
      if (category && category !== "all" && f.category !== category) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "catalog-item";
      b.dataset.catalogIndex = i;
      b.setAttribute(
        "aria-label",
        f.name + " — " + f.w + " × " + f.d + " × " + f.h + " м",
      );
      const image = document.createElement("img");
      image.alt = f.name;
      image.width = 130;
      image.height = 90;
      image.draggable = false;
      if (previews?.[i]) image.src = previews[i];
      else {
        image.hidden = true;
      }
      const name = document.createElement("strong");
      name.textContent = f.name;
      const size = document.createElement("span");
      size.textContent = f.w + " × " + f.d + " × " + f.h + " м";
      b.appendChild(image);
      b.appendChild(name);
      b.appendChild(size);
      b.onclick = () => {
        cancelPlacement();
        cameraTool = false;
        $("furnishCamera").classList.remove("active");
        pending = i;
        b.classList.add("chosen");
        ghost = makeGhost(f);
        scene.add(ghost);
        ghost.name = "placement-preview";
        ghost.visible = false;
        ghost.traverse((o) => {
          if (o.material) {
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material]) {
              m.transparent = true;
              m.opacity = 0.45;
              m.depthWrite = false;
            }
            o.castShadow = false;
          }
        });
        $("furnishMessage").textContent =
          `${f.name}: щёлкните по полу для добавления. R — поворот, Esc — отмена.`;
      };
      $("furnishCatalog").appendChild(b);
    });
    if (active) requestPreviews();
  }
  $("furnishCategory").innerHTML =
    '<option value="all">Весь каталог</option>' +
    [...new Set(catalog.map((f) => f.category))]
      .map((s) => `<option>${s}</option>`)
      .join("");
  $("furnishCategory").onchange = renderCatalog;
  renderCatalog();
  function finishDrag() {
    if (drag?.moved) {
      syncFurniture();
      refresh();
    }
    drag = null;
  }
  function toggle(value) {
    finishDrag();
    active = value;
    cancelPlacement();
    cameraTool = false;
    $("furnishCamera").classList.remove("active");
    $("furnishPanel").hidden = !active;
    $("furnish").classList.toggle("active", active);
    $("furnish").setAttribute("aria-pressed", String(active));
    document.body.classList.toggle("furnishing", active);
    if (active) {
      onStart();
      $("furniture").checked = true;
      setMode("orbit");
      requestPreviews();
      $("furnishMessage").textContent =
        "Выберите предмет в каталоге или перетащите существующий в 3D.";
    }
    onResize();
    refresh();
  }
  $("furnish3D").onclick = () => setMode("orbit");
  $("furnishTop").onclick = () => setMode("plan");
  $("furnishCamera").onclick = () => {
    finishDrag();
    cameraTool = !cameraTool;
    clearGhost();
    $("furnishCamera").classList.toggle("active", cameraTool);
    $("furnishMessage").textContent = cameraTool
      ? "Камера: левая кнопка вращает обзор, правая сдвигает. Нажмите «Камера» ещё раз для расстановки."
      : "Перетаскивайте мебель левой кнопкой. Alt + левая — вращать камеру.";
    if (cameraTool) cancelPlacement();
  };
  $("furnish").onclick = () => toggle(!active);
  $("furnishClose").onclick = () => toggle(false);
  function point(e) {
    const r = canvas.getBoundingClientRect();
    getCamera().updateMatrixWorld(true);
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        1 - ((e.clientY - r.top) / r.height) * 2,
      ),
      getCamera(),
    );
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }
  function snap(n) {
    return $("furnishSnap").checked ? Math.round(n / 0.05) * 0.05 : n;
  }
  function down(e) {
    if (
      !active ||
      !getFurniture().visible ||
      cameraTool ||
      e.button !== 0 ||
      e.shiftKey ||
      e.altKey
    )
      return false;
    const p = point(e);
    if (!p) return true;
    if (pending !== null) {
      const d = getData();
      if (p.x < 0 || p.z < 0 || p.x > d.width || p.z > d.depth) {
        $("furnishMessage").textContent = "Выберите точку внутри квартиры.";
        return true;
      }
      if (d.furniture.length >= 500) {
        $("furnishMessage").textContent = "Достигнут лимит: 500 предметов.";
        return true;
      }
      const f = clone(catalog[pending]);
      delete f.category;
      f.rotation = pendingAngle;
      const position = magneticPosition(f, snap(p.x), snap(p.z), -1, e);
      f.x = position.x;
      f.z = position.z;
      if (position.rotation !== undefined) f.rotation = position.rotation;
      d.furniture.push(f);
      selected = d.furniture.length - 1;
      pushOp({ kind: "remove", index: selected, item: clone(f) });
      cancelPlacement();
      syncFurniture();
      refresh();
      $("furnishMessage").textContent = position.targetIndex !== -1
        ? "Добавлено с магнитной привязкой. Ctrl отключает магнит при перетаскивании."
        : "Добавлено. Перетаскивайте предмет, меняйте размеры или поворачивайте.";
      return true;
    }
    const root = getFurniture();
    root.updateMatrixWorld(true);
    let hits = ray.intersectObject(root, true);
    hits.sort(
      (a, b) =>
        (a.object.parent?.userData.furnitureType === "rug") -
          (b.object.parent?.userData.furnitureType === "rug") ||
        a.distance - b.distance,
    );
    let hit = hits[0]?.object;
    while (hit && hit.parent !== root) hit = hit.parent;
    selected = hit ? root.children.indexOf(hit) : -1;
    refresh();
    if (current())
      drag = {
        x: p.x,
        z: p.z,
        fx: current().x,
        fz: current().z,
        angle: current().rotation || 0,
        moved: false,
      };
    return !!current();
  }
  function move(e) {
    if (active && pending !== null && !e.buttons) {
      previewAt(point(e), e);
      return false;
    }
    if (!active || !drag) return false;
    const p = point(e);
    if (!p) return true;
    const f = current(),
      position = magneticPosition(
        f,
        snap(drag.fx + p.x - drag.x),
        snap(drag.fz + p.z - drag.z),
        selected,
        e,
      ),
      x = position.x,
      z = position.z,
      // A snap squares the item to the face it joined; releasing the magnet puts
      // back the angle the user had set before the drag started.
      rotation =
        position.targetIndex === -1
          ? drag.angle
          : (position.rotation ?? drag.angle);
    if (f.x === x && f.z === z && f.rotation === rotation) return true;
    if (!drag.moved) {
      pushOp({ kind: "patch", index: selected, before: clone(current()) });
      drag.moved = true;
    }
    f.x = x;
    f.z = z;
    f.rotation = rotation;
    scheduleRefresh();
    if (position.targetIndex !== -1)
      $("furnishMessage").textContent = "Магнитная привязка. Удерживайте Ctrl для свободного перемещения.";
    else if (drag.magnetHint) $("furnishMessage").textContent = "Свободное перемещение.";
    drag.magnetHint = position.targetIndex !== -1;
    return true;
  }
  function change(fn) {
    if (!current()) return;
    pushOp({ kind: "patch", index: selected, before: clone(current()) });
    fn(current());
    syncFurniture();
    refresh();
  }
  $("furnishRotateLeft").onclick = () =>
    change((f) => (f.rotation = (f.rotation || 0) + Math.PI / 2));
  $("furnishRotateRight").onclick = () =>
    change((f) => (f.rotation = (f.rotation || 0) - Math.PI / 2));
  $("furnishDelete").onclick = () => {
    if (!current()) return;
    pushOp({ kind: "insert", index: selected, item: clone(current()) });
    getData().furniture.splice(selected, 1);
    selected = -1;
    syncFurniture();
    refresh();
  };
  $("furnishDuplicate").onclick = () => {
    if (!current() || getData().furniture.length >= 500) return;
    const f = clone(current());
    delete f.id;
    f.x += 0.25;
    f.z += 0.25;
    getData().furniture.push(f);
    selected = getData().furniture.length - 1;
    pushOp({ kind: "remove", index: selected, item: clone(f) });
    syncFurniture();
    refresh();
  };
  $("furnishApply").onclick = () => {
    if (!current()) return;
    const v = {
      w: +$("furnishW").value,
      d: +$("furnishD").value,
      h: +$("furnishH").value,
      x: +$("furnishX").value,
      z: +$("furnishZ").value,
      rotation: (+$("furnishAngle").value * Math.PI) / 180,
      color: $("furnishColor").value,
      y: +$("furnishY").value,
    };
    if (
      !Object.values(v).slice(0, 6).every(Number.isFinite) ||
      !Number.isFinite(v.y) ||
      v.y < 0 ||
      v.y + v.h > getData().ceiling ||
      v.w < 0.1 ||
      v.w > 6 ||
      v.d < 0.1 ||
      v.d > 6 ||
      v.h < 0.02 ||
      v.h > getData().ceiling ||
      Math.abs(v.x) > 30 ||
      Math.abs(v.z) > 30
    ) {
      $("furnishWarning").textContent =
        "Размеры X/Z: 0,1–6 м; высота от 0,02 м. Низ ≥ 0, верх не выше потолка. Координаты: ±30 м.";
      return;
    }
    change((f) => Object.assign(f, v));
  };
  // Undo applies the stored inverse and remembers the state it displaced, so
  // redo is the mirror of undo without a second snapshot.
  function perform(entry) {
    const items = getData().furniture;
    if (entry.kind === "model") {
      entry.after = clone(getData());
      applyModel(entry.before);
      return true;
    }
    const i = entry.index;
    if (entry.kind === "remove") {
      if (i < 0 || i >= items.length) return false;
      entry.item = clone(items[i]);
      items.splice(i, 1);
      return true;
    }
    if (entry.kind === "insert") {
      if (i < 0 || i > items.length) return false;
      items.splice(i, 0, clone(entry.item));
      return true;
    }
    if (entry.kind !== "patch" || i < 0 || i >= items.length) return false;
    entry.after = clone(items[i]);
    items[i] = clone(entry.before);
    return true;
  }
  function revert(entry) {
    const items = getData().furniture;
    if (entry.kind === "model") {
      entry.before = clone(getData());
      applyModel(entry.after);
      return true;
    }
    const i = entry.index;
    if (entry.kind === "remove") {
      if (i < 0 || i > items.length) return false;
      items.splice(i, 0, clone(entry.item));
      return true;
    }
    if (entry.kind === "insert") {
      if (i < 0 || i >= items.length) return false;
      items.splice(i, 1);
      return true;
    }
    if (entry.kind !== "patch" || entry.after === undefined) return false;
    if (i < 0 || i >= items.length) return false;
    items[i] = clone(entry.after);
    return true;
  }
  function step(stack, other, run) {
    const entry = stack.pop();
    if (!entry) return;
    if (!run(entry)) {
      $("furnishMessage").textContent =
        "Отмена невозможна: предмет изменился вне истории.";
      return;
    }
    other.push(entry);
    if (other.length > limit) other.shift();
    selected = -1;
    cancelPlacement();
    syncFurniture();
    refresh();
  }
  $("furnishUndo").onclick = () => step(history, future, perform);
  $("furnishRedo").onclick = () => step(future, history, revert);
  $("furnishSave").onclick = () => $("export").onclick();
  $("furnishLoad").onclick = () => $("import").click();
  function key(e) {
    if (
      !active ||
      document.querySelector("dialog[open]") ||
      /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName)
    )
      return false;
    let handled = true;
    if (e.code === "Escape") {
      cancelPlacement();
      $("furnishMessage").textContent = "Добавление отменено.";
    } else if (e.code === "Delete" || e.code === "Backspace")
      $("furnishDelete").onclick();
    else if (e.code === "KeyR") {
      if (pending !== null) {
        pendingAngle -= Math.PI / 2;
        if (ghost) ghost.rotation.y = pendingAngle;
      } else $("furnishRotateRight").onclick();
    } else if (e.ctrlKey && e.code === "KeyZ") $("furnishUndo").onclick();
    else if (e.ctrlKey && e.code === "KeyY") $("furnishRedo").onclick();
    else handled = false;
    if (handled) e.preventDefault();
    return handled;
  }
  return {
    get active() {
      return active;
    },
    down,
    move,
    hideGhost: () => {
      if (ghost) ghost.visible = false;
    },
    up: finishDrag,
    key,
    close: () => toggle(false),
    pushOp,
    resetSelection: () => {
      selected = -1;
      cancelPlacement();
      drag = null;
      refresh();
    },
  };
};
