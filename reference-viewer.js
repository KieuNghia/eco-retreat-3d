"use strict";
Eco.createReferenceViewer = function () {
  const $ = (id) => document.getElementById(id);
  let sourceZoom = 1,
    sourceX = 0,
    sourceY = 0,
    sourceDrag = null;
  function renderSource() {
    sourceZoom = Math.max(1, Math.min(8, sourceZoom));
    $("sourceImage").style.transform =
      `translate(${sourceX}px,${sourceY}px) scale(${sourceZoom})`;
    $("sourceScale").textContent = Math.round(sourceZoom * 100) + "%";
  }
  function resetSource() {
    sourceZoom = 1;
    sourceX = 0;
    sourceY = 0;
    renderSource();
  }
  $("sourcePlus").onclick = () => {
    sourceZoom *= 1.25;
    renderSource();
  };
  $("sourceMinus").onclick = () => {
    sourceZoom /= 1.25;
    if (sourceZoom <= 1) {
      sourceX = sourceY = 0;
    }
    renderSource();
  };
  $("sourceReset").onclick = resetSource;
  $("sourceViewport").addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      sourceZoom *= e.deltaY < 0 ? 1.18 : 1 / 1.18;
      if (sourceZoom <= 1) {
        sourceX = sourceY = 0;
      }
      renderSource();
    },
    { passive: false },
  );
  $("sourceViewport").addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    sourceDrag = { x: e.clientX, y: e.clientY };
    $("sourceViewport").setPointerCapture(e.pointerId);
  });
  $("sourceViewport").addEventListener("pointermove", (e) => {
    if (!sourceDrag) return;
    sourceX += e.clientX - sourceDrag.x;
    sourceY += e.clientY - sourceDrag.y;
    sourceDrag.x = e.clientX;
    sourceDrag.y = e.clientY;
    renderSource();
  });
  $("sourceViewport").addEventListener("pointerup", () => (sourceDrag = null));
  $("sourceViewport").addEventListener(
    "pointercancel",
    () => (sourceDrag = null),
  );

  return { reset: resetSource };
};
