export function getRuntimeEnv(name: string) {
  return process.env[name];
}

export function requireRuntimeEnv(name: string) {
  const value = getRuntimeEnv(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
