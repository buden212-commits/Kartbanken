import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function pooledDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("pgbouncer=true")) return url;
  // Neon pooler caches prepared statements; disable after schema changes.
  if (!url.includes("-pooler")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true`;
}

function createPrismaClient(): PrismaClient {
  const url = pooledDatabaseUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
