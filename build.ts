/// <reference types="bun-types" />
import { rm, mkdir, cp } from "node:fs/promises";

const OUT = "dist";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const result = await Bun.build({
  entrypoints: ["src/content/index.ts"],
  outdir: OUT,
  target: "browser",
  minify: true,
  naming: "[dir]/[name].[ext]",
  root: "src",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Flatten content/index.js -> content.js so the manifest path is stable.
await cp(`${OUT}/content/index.js`, `${OUT}/content.js`);
await rm(`${OUT}/content`, { recursive: true, force: true });

await cp("src/manifest.json", `${OUT}/manifest.json`);
await cp("src/icon128.png", `${OUT}/icon128.png`);

console.log(`Built extension to ./${OUT}`);
