import { getEnv } from "./env";

const hostedFallbacks = [
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "NEON_DATABASE_URL",
];

const prismaGeneratePlaceholderUrl = "postgresql://prisma:prisma@localhost:5432/prisma";

export function databaseUrl() {
  const candidates = [
    ["DATABASE_URL", getEnv("DATABASE_URL")],
    ...hostedFallbacks.map((name) => [name, getEnv(name)] as const),
  ] as const;

  const hosted = candidates.find(([, value]) => value && !isLocalDatabaseUrl(value));
  const local = candidates.find(([, value]) => value);

  if (isHostedRuntime()) {
    if (hosted?.[1]) return hosted[1];
    if (isPrismaGenerateOnlyCommand()) return prismaGeneratePlaceholderUrl;
    throw new Error(
      "Missing hosted database URL. Set DATABASE_URL to your Neon connection string in Vercel, or provide POSTGRES_URL_NON_POOLING / POSTGRES_PRISMA_URL.",
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

function isPrismaGenerateOnlyCommand() {
  const command = `${process.env.npm_lifecycle_event ?? ""} ${process.argv.join(" ")}`;
  return /\b(generate|postinstall)\b/.test(command) && !/\b(migrate|deploy|db\s+push|studio)\b/.test(command);
}
