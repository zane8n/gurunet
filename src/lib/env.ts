import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envPaths = [
  path.join(process.cwd(), ".env.local"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), "..", ".env"),
];

let loaded = false;

export function loadProjectEnv() {
  if (loaded) return;
  loaded = true;

  for (const filePath of envPaths) {
    if (!existsSync(filePath)) continue;
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;

      const key = trimmed.slice(0, index).trim();
      const value = normalizeEnvValue(key, trimmed.slice(index + 1).trim());
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

export function getEnv(name: string) {
  loadProjectEnv();
  return process.env[name];
}

export function requireEnv(name: string) {
  const value = getEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizeEnvValue(key: string, rawValue: string) {
  let value = rawValue;
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);

  // Handles accidental values like DATABASE_URL="DATABASE_URL="postgresql://..."
  if (value.startsWith(`${key}=`)) value = value.slice(key.length + 1);

  if (value.startsWith('"')) value = value.slice(1);
  if (value.endsWith('"')) value = value.slice(0, -1);
  if (value.startsWith("'")) value = value.slice(1);
  if (value.endsWith("'")) value = value.slice(0, -1);

  return value;
}
