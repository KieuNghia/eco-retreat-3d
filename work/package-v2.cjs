"use strict";
const fs = require("fs"),
  path = require("path");
// All paths are relative to the repo root, not a staging directory.
const SRC = path.resolve(__dirname, "..");

function read(name) {
  // Resolve through SRC so no one can escape via "foo/../../../etc"
  const target = path.resolve(SRC, name);
  if (!target.startsWith(SRC + path.sep)) throw Error("Asset outside project: " + name);
  return fs.readFileSync(target, "utf8");
}

let html = read("index.html");
const sourceScripts = [...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)].map((m) => m[1]);
if (sourceScripts[0] !== "vendor/three.min.js") throw Error("Expected vendor/three.min.js as first script in index.html");

// Inline CSS — also escape </style in case any stylesheet contains it.
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g,
  (_, name) => "<style>" + read(name).replace(/<\/style/gi, "<\\/style") + "</style>",
);

// Inline JS — escape closing script tag.
html = html.replace(
  /<script\s+src="([^"]+)"\s*><\/script>/g,
  (_, name) =>
    "<script>" + read(name).replace(/<\/script/gi, "<\\/script") + "</script>",
);

// Inline reference.png as base64 data URI.
html = html.replace(
  'src="reference.png"',
  () =>
    `src="data:image/png;base64,${fs.readFileSync(path.join(SRC, "reference.png")).toString("base64")}"`,
);

// Guard: vendor/three.min.js must be first, and nothing was left unbundled.
if (/<script\s+src=|<link\s+rel="stylesheet"|@import\b|url\(\s*https?:|(?:src|href)\s*=\s*["']\/(?!\/)|url\(\s*\/(?!\/)/i.test(html)) {
  throw Error("Unbundled or remote project asset");
}

const output = path.join(SRC, "Eco-Retreat.html");
if (process.argv.includes("--check")) {
  const committed = fs.readFileSync(output, "utf8");
  if (committed !== html) {
    console.error("Bundle drift detected. Run `npm run build` to regenerate Eco-Retreat.html.");
    process.exitCode = 1;
  } else {
    console.log("Bundle matches sources; bytes:", Buffer.byteLength(html));
  }
} else {
  // Write the bundle to the repo root — this is what the repo ships.
  fs.writeFileSync(output, html);
  console.log("Self-contained HTML generated; bytes:", Buffer.byteLength(html));
}
