import { PrismaClient } from "@prisma/client";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { hashPassword } from "../src/lib/auth/password";
import { sha256 } from "../src/lib/hash";
import { Role } from "../src/lib/roles";
import { buildMapVersionPath, uploadFile } from "../src/lib/storage";

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Hoppar över admin-seed: sätt INITIAL_ADMIN_EMAIL och INITIAL_ADMIN_PASSWORD i .env");
    return null;
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      passwordHash,
      role: Role.ADMIN,
      approvedAt: new Date(),
    },
    update: {
      passwordHash,
      role: Role.ADMIN,
      approvedAt: new Date(),
    },
  });

  console.log(`Admin-konto redo: ${email}`);
  return admin;
}

async function seedExampleMap(adminId: string | null) {
  const repoRoot = path.resolve(__dirname, "../..");
  const exampleDir = path.join(repoRoot, "Exempelfil");

  let ocdFiles: string[];
  try {
    const entries = await readdir(exampleDir);
    ocdFiles = entries.filter((f) => f.toLowerCase().endsWith(".ocd"));
  } catch {
    console.log("Hoppar över exempelkarta: Exempelfil/ saknas");
    return;
  }

  if (ocdFiles.length === 0) {
    console.log("Hoppar över exempelkarta: ingen .ocd i Exempelfil/");
    return;
  }

  const slug = "mora-vast-med-venjan";
  const existing = await prisma.mapFile.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Exempelkarta finns redan: ${slug}`);
    return;
  }

  const filename = ocdFiles.find((f) => f.includes("20260227")) ?? ocdFiles[0];
  const filePath = path.join(exampleDir, filename);
  const buffer = await readFile(filePath);

  const map = await prisma.mapFile.create({
    data: {
      slug,
      title: "Mora Väst med Venjan",
      description: "Exempelkarta från Exempelfil/ (dev-seed)",
      createdById: adminId,
    },
  });

  const storagePath = buildMapVersionPath(map.id, 1);
  const storedRef = await uploadFile(storagePath, buffer);

  await prisma.mapVersion.create({
    data: {
      mapFileId: map.id,
      versionNumber: 1,
      storagePath: storedRef,
      originalFilename: filename,
      fileSizeBytes: buffer.byteLength,
      contentHash: sha256(buffer),
      uploadedById: adminId,
      comment: "Seed från Exempelfil/",
      parseStatus: "PENDING",
      isRecommended: true,
    },
  });

  console.log(`Exempelkarta skapad: ${map.title} (${filename})`);
}

async function main() {
  const admin = await seedAdmin();
  await seedExampleMap(admin?.id ?? null);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
