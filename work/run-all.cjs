"use strict";
// Run verification scripts against the current sources, then check (never
// rewrite) the committed standalone bundle for source drift.
const { execFileSync } = require("child_process");
const path = require("path");

const SRC = path.resolve(__dirname, "..");
const checks = [
  "work/check-model.cjs",
  "work/check-model.cjs --bundle",
  "work/check-refactor.cjs",
  "work/check-camera.cjs",
  "work/check-floor-depth.cjs",
  "work/check-kitchen.cjs",
  "work/audit-layout.cjs",
  "work/audit-draw-calls.cjs",
  "work/package-v2.cjs",
];

let failures = 0;
for (const script of checks) {
  const [file, ...extraArgs] = script.split(" ");
  const args = [path.join(SRC, file), ...extraArgs];
  if (file === "work/package-v2.cjs") args.push("--check");
  process.stdout.write(`${script}${file === "work/package-v2.cjs" ? " --check" : ""}... `);
  try {
    execFileSync(process.execPath, args, { stdio: "inherit", cwd: SRC });
    console.log("OK");
  } catch (error) {
    console.error("FAILED");
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}
