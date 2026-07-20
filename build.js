const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");
const target = process.argv.includes("--firefox") ? "firefox" : "chrome";

const DIST = path.join(__dirname, "dist");

function copyStaticFiles() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const publicDir = path.join(__dirname, "public");
  for (const file of fs.readdirSync(publicDir)) {
    if (file === "manifest.json" || file === "manifest.firefox.json") continue;
    const src = path.join(publicDir, file);
    const dest = path.join(DIST, file);
    fs.cpSync(src, dest, { recursive: true });
  }

  // Pick the right manifest for the target browser, always naming it manifest.json in dist/
  const manifestSrc = target === "firefox" ? "manifest.firefox.json" : "manifest.json";
  fs.copyFileSync(path.join(publicDir, manifestSrc), path.join(DIST, "manifest.json"));

  console.log(`Copied static assets for target: ${target}`);
}

const buildOptions = {
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
    options: "src/options.ts",
  },
  bundle: true,
  outdir: DIST,
  format: "iife", // classic scripts — no ES-module quirks in either browser
  target: "es2020",
  sourcemap: true,
  logLevel: "info",
};

async function run() {
  copyStaticFiles();

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching for changes... (Ctrl+C to stop)");
  } else {
    await esbuild.build(buildOptions);
    console.log(`Build complete → dist/ (target: ${target})`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
