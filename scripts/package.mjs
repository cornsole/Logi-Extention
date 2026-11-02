import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const distRoot = resolve(projectRoot, "dist");

async function buildTarget(name, manifestFile) {
  const target = resolve(distRoot, name);
  await mkdir(target, { recursive: true });
  await cp(resolve(projectRoot, "src"), resolve(target, "src"), { recursive: true });
  const manifest = await readFile(resolve(projectRoot, manifestFile), "utf8");
  await writeFile(resolve(target, "manifest.json"), manifest);
}

await rm(distRoot, { recursive: true, force: true });
await Promise.all([
  buildTarget("chrome", "manifest.json"),
  buildTarget("firefox", "manifest.firefox.json"),
]);

console.log("Built dist/chrome and dist/firefox");
