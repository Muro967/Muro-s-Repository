import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = path.join(root, "public/icons/source.svg");
const source = await readFile(sourcePath);
const outputDirectory = path.join(root, "public/icons");
await mkdir(outputDirectory, { recursive: true });

const icons = [
  { path: path.join(outputDirectory, "icon-192.png"), size: 192 },
  { path: path.join(outputDirectory, "icon-512.png"), size: 512 },
  { path: path.join(root, "public/apple-touch-icon.png"), size: 180 },
];

for (const icon of icons) {
  const image = sharp(source, { density: 144 }).resize(icon.size, icon.size, { fit: "cover" });
  const metadata = await image.png({ compressionLevel: 9, adaptiveFiltering: false }).toFile(icon.path);
  if (metadata.width !== icon.size || metadata.height !== icon.size || metadata.format !== "png") {
    throw new Error(`Invalid generated PNG dimensions: ${icon.path}`);
  }
  process.stdout.write(`${path.relative(root, icon.path)} ${metadata.width}x${metadata.height}\n`);
}
