"use strict";
window.Eco = window.Eco || {};
// Conceptual kitchen modules, not manufacturer-specific installation drawings.
Eco.kitchenTypes = new Set([
  "baseCabinet",
  "drawerCabinet",
  "wallCabinet",
  "tallCabinet",
  "ovenHousing",
  "worktop",
  "kitchenSink",
  "cooktop",
  "oven",
  "microwave",
  "dishwasher",
  "hood",
]);
Eco.buildKitchen = function (f, g, decor) {
  const { box, cylinder } = Eco.geometry,
    w = f.w,
    d = f.d,
    h = f.h || 0.86,
    c = f.color || "#d5c5ae";
  const b = (x, y, z, W, H, D, color = c) => box(g, x, y, z, W, H, D, color);
  const handle = (x, y) =>
    b(x, y, d / 2 - 0.005, Math.min(0.18, w * 0.55), 0.018, 0.02, "#5f6869");
  const shell = (bottom = 0) => {
    b(-w / 2 + 0.009, (h + bottom) / 2, 0, 0.018, h - bottom, d);
    b(w / 2 - 0.009, (h + bottom) / 2, 0, 0.018, h - bottom, d);
    b(0, bottom + 0.009, 0, w, 0.018, d);
    b(0, h - 0.009, 0, w, 0.018, d);
    b(0, (h + bottom) / 2, -d / 2 + 0.009, w, h - bottom, 0.018);
  };
  if (
    [
      "baseCabinet",
      "drawerCabinet",
      "wallCabinet",
      "tallCabinet",
      "ovenHousing",
    ].includes(f.type)
  ) {
    const bottom = f.type === "wallCabinet" ? 0 : 0.1;
    shell(bottom);
    if (bottom) b(0, bottom / 2, -0.025, w - 0.04, bottom, d - 0.05, "#656561");
    if (f.type === "ovenHousing") {
      // Open 60 cm niche: oven is a separate catalog item.
      b(0, 0.115, 0, w - 0.036, 0.018, d - 0.018);
      b(0, h - 0.06, d / 2 - 0.018, w - 0.036, 0.1, 0.018);
    } else if (f.type === "drawerCabinet") {
      for (let i = 0; i < 3; i++) {
        const height = (h - bottom) / 3,
          y = bottom + height * (i + 0.5);
        b(0, y, d / 2 - 0.02, w - 0.04, height - 0.009, 0.02);
        handle(0, y + height * 0.32);
      }
    } else {
      const n = w > 0.65 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + ((i + 0.5) * w) / n;
        b(
          x,
          (h + bottom) / 2,
          d / 2 - 0.02,
          w / n - 0.008,
          h - bottom - 0.008,
          0.02,
        );
        handle(x, h - 0.09);
      }
    }
    if (["baseCabinet", "drawerCabinet", "ovenHousing"].includes(f.type)) {
      const top = b(0, h - 0.02, 0, w, 0.04, d, "#d8d3c7");
      top.name = "integrated-worktop";
    }
  } else if (f.type === "worktop") {
    b(0, h / 2, 0, w, h, d);
    b(0, h * 0.55, d / 2 - 0.002, w, 0.006, 0.004, "#9b9386");
  } else if (f.type === "kitchenSink") {
    // Integrated sink base. Faucet is an accessory above the stated worktop height.
    b(0, (h - 0.04) / 2, 0, w, h - 0.04, d);
    const top = b(0, h - 0.025, 0, w, 0.05, d, "#d8d3c7");
    top.name = "integrated-worktop";
    box(decor, 0, 0.001, -d * 0.06, w * 0.75, 0.012, d * 0.7, "#929d9e");
    box(decor, 0, 0.009, -d * 0.06, w * 0.62, 0.006, d * 0.55, "#37494b");
    b(0, (h - 0.14) / 2 + 0.08, d / 2 - 0.02, w - 0.018, h - 0.18, 0.02);
    handle(0, h - 0.15);
    cylinder(decor, w * 0.25, 0.14, -d * 0.35, 0.014, 0.28, "#969f9e");
    box(decor, w * 0.25, 0.275, -d * 0.22, 0.028, 0.028, d * 0.3, "#969f9e");
  } else if (f.type === "cooktop") {
    b(0, h / 2, 0, w, h, d, "#252c30");
    const cols = w < 0.4 ? [0] : [-w * 0.25, w * 0.25];
    for (const x of cols)
      for (const z of [-d * 0.23, d * 0.23]) {
        cylinder(
          g,
          x,
          h + 0.001,
          z,
          Math.min((w / (cols.length * 2)) * 0.72, d * 0.18),
          0.002,
          "#8c969a",
        );
        cylinder(
          g,
          x,
          h + 0.003,
          z,
          Math.min((w / (cols.length * 2)) * 0.62, d * 0.16),
          0.002,
          "#363f44",
        );
      }
    for (let i = 0; i < 4; i++)
      b(
        (i - 1.5) * w * 0.08,
        h + 0.006,
        d * 0.39,
        w * 0.025,
        0.002,
        0.013,
        "#d8ddd9",
      );
  } else if (f.type === "oven" || f.type === "microwave") {
    b(0, h / 2, 0, w, h, d, c);
    b(-w * 0.06, h * 0.46, d / 2 - 0.008, w * 0.75, h * 0.64, 0.012, "#24343b");
    b(-w * 0.06, h * 0.47, d / 2 - 0.001, w * 0.57, h * 0.44, 0.008, "#475a61");
    if (f.type === "oven") {
      b(0, h * 0.87, d / 2 - 0.004, w * 0.92, h * 0.16, 0.01, "#a9b1b2");
      b(0, h * 0.72, d / 2 + 0.005, w * 0.65, 0.025, 0.025, "#666f71");
      for (const x of [-w * 0.32, w * 0.32]) {
        const knob = cylinder(
          g,
          x,
          h * 0.87,
          d / 2 + 0.006,
          h * 0.038,
          0.022,
          "#50595d",
        );
        knob.rotation.x = Math.PI / 2;
      }
    } else {
      b(w * 0.36, h * 0.65, d / 2 - 0.001, w * 0.15, h * 0.24, 0.01, "#263c3f");
      b(w * 0.26, h * 0.42, d / 2 + 0.005, 0.018, h * 0.4, 0.025, "#abb5b7");
    }
  } else if (f.type === "dishwasher") {
    b(0, h / 2, 0, w, h, d, c);
    b(0, h * 0.47, d / 2 - 0.018, w - 0.015, h * 0.88, 0.022, "#c4cccb");
    b(0, h * 0.94, d / 2 - 0.01, w, 0.07, 0.02, "#69767b");
    handle(0, h * 0.85);
    b(w * 0.25, h * 0.945, d / 2 + 0.003, w * 0.17, 0.027, 0.005, "#244d53");
  } else if (f.type === "hood") {
    b(0, h * 0.2, 0, w, h * 0.4, d, "#929fa4");
    b(0, h * 0.68, -d * 0.2, w * 0.4, h * 0.64, d * 0.55, "#b7c2c5");
    for (const x of [-w * 0.3, w * 0.3])
      b(x, h * 0.02, 0, w * 0.15, 0.006, d * 0.5, "#e9dfb7");
  }
};
