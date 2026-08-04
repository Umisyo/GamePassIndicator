import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(root, "dist");
const watch = process.argv.includes("--watch");

// 配信URLは環境変数 CATALOG_BASE_URL で上書きできる（未指定なら config.ts の既定値）。
const catalogBaseUrl = process.env.CATALOG_BASE_URL;

/** @type {import("esbuild").BuildOptions} */
const shared = {
  bundle: true,
  target: "chrome110",
  legalComments: "none",
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
  define: {
    __CATALOG_BASE_URL__: JSON.stringify(catalogBaseUrl ?? ""),
  },
};

const entries = [
  // content script は classic script として読み込まれるため IIFE。
  { in: "src/content.ts", out: "content.js", format: "iife" },
  { in: "src/content-list.ts", out: "content-list.js", format: "iife" },
  // service worker / options は type: module なので ESM。
  { in: "src/background.ts", out: "background.js", format: "esm" },
  { in: "src/options.ts", out: "options.js", format: "esm" },
];

async function copyStatic() {
  await cp(resolve(root, "manifest.json"), resolve(outdir, "manifest.json"));
  await cp(resolve(root, "options.html"), resolve(outdir, "options.html"));
  await cp(resolve(root, "src/styles.css"), resolve(outdir, "styles.css"));
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

if (watch) {
  const contexts = await Promise.all(
    entries.map((e) =>
      esbuild.context({
        ...shared,
        entryPoints: [resolve(root, e.in)],
        outfile: resolve(outdir, e.out),
        format: e.format,
      })
    )
  );
  await copyStatic();
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching... (静的アセットの変更時は再実行してください)");
} else {
  await Promise.all(
    entries.map((e) =>
      esbuild.build({
        ...shared,
        entryPoints: [resolve(root, e.in)],
        outfile: resolve(outdir, e.out),
        format: e.format,
      })
    )
  );
  await copyStatic();
  console.log(`built -> ${outdir}`);
}
