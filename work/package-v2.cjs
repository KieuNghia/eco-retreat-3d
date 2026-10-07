"use strict";
const fs = require("fs"),
  path = require("path");
const dir = path.resolve("outputs/eco-retreat-v2");
const read = (name) => {
  const target = path.resolve(dir, name);
  if (!target.startsWith(dir + path.sep)) throw Error("Asset outside project");
  return fs.readFileSync(target, "utf8");
};
let html = read("index.html");
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g,
  (_, name) => "<style>" + read(name) + "</style>",
);
html = html.replace(
  /<script\s+src="([^"]+)"\s*><\/script>/g,
  (_, name) =>
    "<script>" + read(name).replace(/<\/script/gi, "<\\/script") + "</script>",
);
html = html.replace(
  'src="reference.png"',
  () =>
    `src="data:image/png;base64,${fs.readFileSync(path.join(dir, "reference.png")).toString("base64")}"`,
);
if (/<script\s+src=|<link\s+rel="stylesheet"/.test(html))
  throw Error("Unbundled project asset");
fs.writeFileSync(path.join(dir, "Eco-Retreat.html"), html);
console.log("Self-contained HTML generated; bytes:", Buffer.byteLength(html));
