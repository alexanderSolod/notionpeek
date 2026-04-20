import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve("notion_peek.md");
const destination = resolve("public/notion_peek.md");

if (existsSync(source)) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
