import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function directoryIsEmpty(directory: string): Promise<boolean> {
  try {
    return (await readdir(directory)).length === 0;
  } catch {
    return true;
  }
}

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export async function initializeProject(
  destination: string,
  template: string,
  force = false,
): Promise<string> {
  if (template !== "service") {
    throw new Error(`Unknown template '${template}'. Available templates: service.`);
  }
  const source = path.join(packageRoot(), "templates", template);
  try {
    if (!(await stat(source)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Packaged template is missing: ${source}`);
  }

  const target = path.resolve(destination);
  if (!force && !(await directoryIsEmpty(target))) {
    throw new Error(
      `Destination is not empty: ${target}. Choose an empty directory or pass --force to merge the template.`,
    );
  }
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force });
  return target;
}

export async function collectDiagramSources(root: string): Promise<string[]> {
  const output: string[] = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await collectDiagramSources(fullPath)));
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".drawio")
      output.push(fullPath);
  }
  return output.sort();
}
