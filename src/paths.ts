import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export function pathIsWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function nearestExistingPath(candidate: string): Promise<string> {
  let current = candidate;
  for (;;) {
    try {
      await lstat(current);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new Error(`No existing ancestor found for ${candidate}.`);
      current = parent;
    }
  }
}

export async function resolveConfinedPath(
  projectRoot: string,
  configuredPath: string,
): Promise<string> {
  const resolved = path.resolve(projectRoot, configuredPath);
  if (!pathIsWithin(projectRoot, resolved)) {
    throw new Error(`Path escapes the project root: ${configuredPath}`);
  }

  const existing = await nearestExistingPath(resolved);
  const [realRoot, realExisting] = await Promise.all([realpath(projectRoot), realpath(existing)]);
  if (!pathIsWithin(realRoot, realExisting)) {
    throw new Error(`Path resolves through a symlink outside the project root: ${configuredPath}`);
  }
  return resolved;
}

export function assertConfinedPattern(pattern: string): void {
  if (path.isAbsolute(pattern)) throw new Error(`Agent path pattern must be relative: ${pattern}`);
  const segments = pattern.replaceAll("\\", "/").split("/");
  if (segments.includes(".."))
    throw new Error(`Agent path pattern escapes the project root: ${pattern}`);
}
