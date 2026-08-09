import { readFileSync, writeFileSync } from "fs";

/** Kopierar DATABASE_URL från .env.vercel till .env för lokal utveckling. */
const vercel = readFileSync(".env.vercel", "utf8");

function readQuoted(key: string): string | null {
  const line = vercel.split("\n").find((row) => row.startsWith(`${key}=`));
  if (!line) return null;
  const match = line.match(/^[^=]+="(.*)"\s*$/);
  return match?.[1] ?? null;
}

const databaseUrl = readQuoted("DATABASE_URL");
const databaseUrlUnpooled = readQuoted("DATABASE_URL_UNPOOLED");
const authSecret = readQuoted("AUTH_SECRET");

if (!databaseUrl || !databaseUrlUnpooled) {
  console.error("Saknar DATABASE_URL i .env.vercel. Kör: npx vercel env pull .env.vercel --yes");
  process.exit(1);
}

const lines = [
  `AUTH_SECRET=${authSecret ?? "dev-secret-change-in-production-use-openssl-rand-base64-32"}`,
  "AUTH_URL=http://localhost:3000",
  "INITIAL_ADMIN_EMAIL=buud212@gmail.com",
  "INITIAL_ADMIN_PASSWORD=admin12345",
  `DATABASE_URL=${JSON.stringify(databaseUrl)}`,
  `DATABASE_URL_UNPOOLED=${JSON.stringify(databaseUrlUnpooled)}`,
  "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  "STORAGE_BACKEND=local",
  "STORAGE_ROOT=./storage",
  "",
];

writeFileSync(".env", lines.join("\n"));
console.log("Uppdaterade .env med PostgreSQL-URL:er från .env.vercel");
