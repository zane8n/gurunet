const hostedFallbacks = [
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
];

export function runtimeDatabaseUrl() {
  const candidates = [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ...hostedFallbacks.map((name) => [name, process.env[name]] as const),
  ] as const;

  const hosted = candidates.find(([, value]) => value && !isLocalDatabaseUrl(value));
  const local = candidates.find(([, value]) => value);

  if (isHostedRuntime()) {
    if (hosted?.[1]) return hosted[1];
    throw new Error(
      "Missing hosted database URL. Set DATABASE_URL to your Neon connection string in Vercel.",
    );
  }

  if (local?.[1]) return local[1];
  throw new Error("Missing DATABASE_URL.");
}

function isHostedRuntime() {
  return process.env.VERCEL === "1" || process.env.CI === "1";
}

function isLocalDatabaseUrl(value: string) {
  return /@(localhost|127\.0\.0\.1)(:|\/)/i.test(value) || /\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(value);
}
