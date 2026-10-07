"use strict";
// Shared model coordinates: x/z in metres; dimensions are segment axes, not clear room sizes.
window.createMeasureTools = function ({
  scene,
  canvas,
  getData,
  getCamera,
  getWorld,
}) {
  const $ = (id) => document.getElementById(id),
    fmt = (n) => n.toFixed(3),
    escape = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  let active = false,
    points = [],
    group = new THREE.Group();
  scene.add(group);
  group.name = "floor-tape";
  const ray = new THREE.Raycaster(),
    plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function clear() {
    points = [];
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
    $("tapeResult").textContent = "Выберите первую точку.";
  }
  function draw(end) {
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
    const a = points[0];
    if (!a) return;
    for (const p of [a, end].filter(Boolean)) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xe74820, depthTest: false }),
      );
      m.position.copy(p);
      m.position.y = 0.06;
      m.renderOrder = 100;
      group.add(m);
    }
    if (end) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.x, 0.06, a.z),
          new THREE.Vector3(end.x, 0.06, end.z),
        ]),
        line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color: 0xe74820, depthTest: false }),
        );
      line.renderOrder = 100;
      group.add(line);
      $("tapeResult").textContent =
        `${fmt(Math.hypot(a.x - end.x, a.z - end.z))} м · ΔX ${fmt(Math.abs(a.x - end.x))} · ΔZ ${fmt(Math.abs(a.z - end.z))}`;
    }
  }
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    getCamera().updateMatrixWorld(true);
    getWorld().updateMatrixWorld(true);
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      getCamera(),
    );
    let p = null;
    if ($("tapeSurface").checked) {
      const hits = ray.intersectObject(getWorld(), true).filter((h) => {
        let o = h.object;
        while (o) {
          if (!o.visible) return false;
          o = o.parent;
        }
        return h.object.isMesh && !h.object.material.transparent;
      });
      if (hits.length) p = hits[0].point.clone();
    } else p = ray.ray.intersectPlane(plane, new THREE.Vector3());
    const d = getData();
    if (
      !p ||
      p.x < -0.5 ||
      p.z < -0.5 ||
      p.x > d.width + 0.5 ||
      p.z > d.depth + 0.5
    )
      return null;
    p.y = 0;
    return p;
  }
  $("tape").onclick = () => {
    active = !active;
    document.exitPointerLock?.();
    $("tape").classList.toggle("active", active);
    $("tape").setAttribute("aria-pressed", String(active));
    $("tapePanel").hidden = !active;
    group.visible = active;
    if (active) clear();
  };
  $("tapeClear").onclick = clear;
  function click(e) {
    const p = pick(e);
    if (!p) {
      $("tapeResult").textContent =
        "Точка вне плана. Наведите на пол квартиры.";
      return;
    }
    if (points.length === 2) clear();
    points.push(p);
    draw(points[1]);
    if (points.length === 1)
      $("tapeResult").textContent = "Первая точка выбрана. Выберите вторую.";
  }
  function hover(e) {
    if (active && points.length === 1) {
      const p = pick(e);
      if (p) draw(p);
    }
  }
  let zoom = 1;
  function scale() {
    $("drawingSvg").style.width = zoom * 100 + "%";
    $("drawingZoom").textContent = Math.round(zoom * 100) + "%";
  }
  $("drawingPlus").onclick = () => {
    zoom = Math.min(4, zoom * 1.25);
    scale();
  };
  $("drawingMinus").onclick = () => {
    zoom = Math.max(1, zoom / 1.25);
    scale();
  };
  function plan() {
    const d = getData(),
      S = 100,
      pad = 100,
      W = d.width * S + 2 * pad,
      H = d.depth * S + 2 * pad;
    const X = (x) => pad + x * S,
      Z = (z) => pad + z * S;
    let svg = `<svg id="drawingSvg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Размерный план квартиры"><rect width="${W}" height="${H}" fill="#fff"/>`,
      rows = "";
    for (const f of d.floors)
      svg += `<rect x="${X(f.x)}" y="${Z(f.z)}" width="${f.w * S}" height="${f.d * S}" fill="${f.kind === "grass" ? "#e2eddf" : f.kind === "wood" ? "#f6efe3" : "#eaf0f2"}"/>`;
    for (const f of d.furniture)
      svg += `<rect x="${(-f.w * S) / 2}" y="${(-f.d * S) / 2}" width="${f.w * S}" height="${f.d * S}" transform="translate(${X(f.x)} ${Z(f.z)}) rotate(${(-(f.rotation || 0) * 180) / Math.PI})" fill="none" stroke="#b8b7af" stroke-width="1.5"/>`;
    d.walls.forEach((w, i) => {
      const n = i + 1,
        len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1),
        t = w.thickness || d.wallThickness,
        kind =
          {
            wall: "Стена",
            window: "Окно",
            sliding: "Раздвижное остекление",
            rail: "Ограждение",
          }[w.kind] || "Стена",
        color = w.kind === "wall" ? "#354956" : "#64a6ba";
      const dx = w.x2 - w.x1,
        dz = w.z2 - w.z1,
        nx = len ? -dz / len : 0,
        nz = len ? dx / len : 1,
        offset = 22 + (i % 3) * 15,
        mx = X((w.x1 + w.x2) / 2) + nx * offset,
        mz = Z((w.z1 + w.z2) / 2) + nz * offset;
      svg += `<g class="wall-dimension" data-segment="${n}"><title>${n}. ${kind}: ${fmt(len)} м, толщина ${fmt(t)} м</title><line class="wall-stroke" x1="${X(w.x1)}" y1="${Z(w.z1)}" x2="${X(w.x2)}" y2="${Z(w.z2)}" stroke="${color}" stroke-width="${t * S}" stroke-linecap="square"/><line x1="${X((w.x1 + w.x2) / 2)}" y1="${Z((w.z1 + w.z2) / 2)}" x2="${mx}" y2="${mz}" stroke="#708494"/><text x="${mx}" y="${mz}" class="dim-label">${n}: ${fmt(len)}</text></g>`;
      rows += `<tr data-segment="${n}" tabindex="0"><td>${n}</td><td>${kind}</td><td>${fmt(len)}</td><td>${fmt(t)}</td></tr>`;
    });
    for (const l of d.labels)
      svg += `<text x="${X(l.x)}" y="${Z(l.z)}" class="room-label">${escape(l.text)}</text>`;
    svg += `<path d="M ${pad} 35 H ${X(d.width)} M ${pad} 25 V 45 M ${X(d.width)} 25 V 45" fill="none" stroke="#203b4a"/><text x="${W / 2}" y="25" class="dim-label">X: ${fmt(d.width)} м</text><path d="M 35 ${pad} V ${Z(d.depth)} M 25 ${pad} H 45 M 25 ${Z(d.depth)} H 45" fill="none" stroke="#203b4a"/><text transform="translate(22 ${H / 2}) rotate(-90)" class="dim-label">Z: ${fmt(d.depth)} м</text></svg>`;
    $("drawingCanvas").innerHTML = svg;
    $("drawingRows").innerHTML = rows;
    zoom = 1;
    scale();
    function select(n) {
      document
        .querySelectorAll("#drawing [data-segment]")
        .forEach((el) =>
          el.classList.toggle("selected", el.dataset.segment === n),
        );
      const w = d.walls[Number(n) - 1];
      $("drawingSelected").textContent =
        `Участок ${n}: ${fmt(Math.hypot(w.x2 - w.x1, w.z2 - w.z1))} м · толщина ${fmt(w.thickness || d.wallThickness)} м`;
    }
    document.querySelectorAll("#drawing [data-segment]").forEach((el) => {
      el.onclick = () => select(el.dataset.segment);
      el.onkeydown = (e) => {
        if (e.key === "Enter") select(el.dataset.segment);
      };
    });
    $("drawingSelected").textContent =
      "Нажмите на стену или строку таблицы, чтобы выделить участок.";
  }
  return {
    get active() {
      return active;
    },
    clear,
    click,
    hover,
    plan,
  };
};
