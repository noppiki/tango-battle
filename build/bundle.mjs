import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = resolve(projectRoot, "js/main.js");
const htmlPath = resolve(projectRoot, "index.html");
const stylesheetPath = resolve(projectRoot, "css/style.css");
const wordsPath = resolve(projectRoot, "data/words.json");
const outputPath = resolve(projectRoot, "dist/eiken_pre2_game.html");

const moduleScriptPattern =
  /<script\s+type=["']module["']\s+src=["'](?:\.\/)?js\/main\.js["']\s*><\/script>/i;
const manifestLinkPattern =
  /\s*<link\b(?=[^>]*\brel=["'][^"']*\bmanifest\b[^"']*["'])[^>]*>\s*/gi;
const stylesheetLinkPattern =
  /<link\b(?=[^>]*\brel=["'][^"']*\bstylesheet\b[^"']*["'])(?=[^>]*\bhref=["'](?:\.\/)?css\/style\.css["'])[^>]*>/gi;
const scriptPattern = /\s*<script\b[^>]*>[\s\S]*?<\/script>\s*/gi;

function inlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

function removeServiceWorkerRegistration(htmlSource) {
  return htmlSource.replace(scriptPattern, (script) => {
    const isRegistrationScript =
      /\bsrc=["'](?:\.\/)?js\/pwa-register\.js["']/i.test(script) ||
      script.includes("navigator.serviceWorker") && /\.register\s*\(/.test(script);
    return isRegistrationScript ? "\n" : script;
  });
}

// Matches any referenced PNG under img/ (items, ui, …) or icons/, tolerating a
// leading ./ or ../ (CSS uses ../img/ui/…, JS/HTML use bare img/… or icons/…).
// Group 1 is the clean project-relative path used to read the file from disk;
// the full match (prefix included) is what gets replaced by the data URI.
const assetPattern = /(?:\.\.?\/)*(img\/[\w-]+\/[\w-]+\.png|icons\/[\w-]+\.png)/g;

// Inline every referenced img/ + icons/ PNG (in the bundled JS string paths, the
// inlined stylesheet and any HTML src/href) as a base64 data URI so the
// single-file build is fully offline with no raw asset paths left behind.
async function inlineAssets(source) {
  const paths = new Set();
  for (const match of source.matchAll(assetPattern)) {
    paths.add(match[1]);
  }
  if (paths.size === 0) {
    return source;
  }
  const dataUris = {};
  await Promise.all(
    [...paths].map(async (relPath) => {
      const buffer = await readFile(resolve(projectRoot, relPath));
      dataUris[relPath] = `data:image/png;base64,${buffer.toString("base64")}`;
    })
  );
  return source.replace(assetPattern, (_match, relPath) => dataUris[relPath]);
}

async function inlineStylesheet(htmlSource) {
  if (!stylesheetLinkPattern.test(htmlSource)) {
    return htmlSource;
  }

  const stylesheet = await readFile(stylesheetPath, "utf8");
  return htmlSource.replace(
    stylesheetLinkPattern,
    () => `<style>\n${stylesheet}\n</style>`
  );
}

async function bundleApplication() {
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: "iife",
    target: "es2019",
    minify: false,
    write: false,
  });

  const output = result.outputFiles[0];
  if (!output) {
    throw new Error("esbuild did not produce a JavaScript bundle.");
  }
  return output.text;
}

async function buildSingleFile() {
  const [htmlSource, wordsSource, bundledJavaScript] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(wordsPath, "utf8"),
    bundleApplication(),
  ]);

  const words = JSON.parse(wordsSource);
  const wordsAssignment = `window.WORDS=${JSON.stringify(words).replaceAll("<", "\\u003c")};`;
  const scripts = `<script>${wordsAssignment}</script>\n<script>${inlineScript(bundledJavaScript)}</script>`;

  // TODO: js/main.js must check window.WORDS before attempting fetch so this
  // embedded dataset is used directly in the single-file distribution.
  if (!moduleScriptPattern.test(htmlSource)) {
    throw new Error("Could not find the js/main.js module script in index.html.");
  }

  const htmlWithInlineStyles = await inlineStylesheet(htmlSource);
  const htmlWithBundle = removeServiceWorkerRegistration(htmlWithInlineStyles)
    .replace(manifestLinkPattern, "\n")
    .replace(moduleScriptPattern, scripts);
  const outputHtml = await inlineAssets(htmlWithBundle);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, outputHtml, "utf8");
}

await buildSingleFile();
