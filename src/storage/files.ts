import * as fs from "fs";
import * as path from "path";

/**
 * Read and parse a JSON file. Returns null if file doesn't exist.
 */
export function readJSON<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw new Error(`Failed to read JSON from ${filePath}: ${err.message}`);
  }
}

/**
 * Write data as JSON to a file. Creates parent directories if needed.
 */
export function writeJSON<T>(filePath: string, data: T): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Read a JSONL file. Returns an array of parsed objects.
 * Returns empty array if file doesn't exist.
 */
export function readJSONL<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as T);
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw new Error(`Failed to read JSONL from ${filePath}: ${err.message}`);
  }
}

/**
 * Append a single record to a JSONL file.
 */
export function appendJSONL<T>(filePath: string, record: T): void {
  ensureDir(path.dirname(filePath));
  const line = JSON.stringify(record) + "\n";
  fs.appendFileSync(filePath, line, "utf-8");
}

/**
 * Update a specific record in a JSONL file by matching a predicate.
 * Rewrites the entire file (necessary for JSONL updates).
 */
export function updateJSONL<T>(
  filePath: string,
  predicate: (record: T) => boolean,
  updater: (record: T) => T
): number {
  const records = readJSONL<T>(filePath);
  let updated = 0;
  const newRecords = records.map((record) => {
    if (predicate(record)) {
      updated++;
      return updater(record);
    }
    return record;
  });
  if (updated > 0) {
    ensureDir(path.dirname(filePath));
    const content = newRecords.map((r) => JSON.stringify(r)).join("\n") + "\n";
    fs.writeFileSync(filePath, content, "utf-8");
  }
  return updated;
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Check if a file exists.
 */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Copy a file from source to destination. Creates parent directories.
 */
export function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * Move a file from source to destination. Creates parent directories.
 */
export function moveFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.renameSync(src, dest);
}

/**
 * List files in a directory matching an optional extension filter.
 */
export function listFiles(dirPath: string, ext?: string): string[] {
  try {
    const entries = fs.readdirSync(dirPath);
    if (ext) {
      return entries.filter((e) => e.endsWith(ext));
    }
    return entries;
  } catch (err: any) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}
