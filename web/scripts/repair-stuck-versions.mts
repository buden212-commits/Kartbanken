import { PrismaClient } from "@prisma/client";
import { parseMapVersion } from "../src/lib/ocad/process-version";

const prisma = new PrismaClient();

async function main() {
  const stuck = await prisma.mapVersion.findMany({
    where: {
      OR: [
        { parseStatus: "PROCESSING" },
        { parseStatus: "PENDING" },
        { AND: [{ parseStatus: "OK" }, { previewSvgPath: null }] },
      ],
    },
    select: {
      id: true,
      originalFilename: true,
      parseStatus: true,
      previewSvgPath: true,
      mapFile: { select: { slug: true, title: true } },
    },
    orderBy: { uploadedAt: "desc" },
  });

  console.log("Stuck/missing preview versions:", stuck.length);
  for (const row of stuck) {
    console.log("-", row.mapFile.slug, row.originalFilename, row.parseStatus, row.previewSvgPath);
  }

  for (const row of stuck) {
    console.log("Processing", row.id, row.originalFilename);
    await prisma.mapVersion.update({
      where: { id: row.id },
      data: { parseStatus: "PENDING", parseError: null },
    });
    await parseMapVersion(row.id);
    const fresh = await prisma.mapVersion.findUnique({
      where: { id: row.id },
      select: {
        parseStatus: true,
        objectCount: true,
        previewSvgPath: true,
        parseError: true,
      },
    });
    console.log("Result", fresh);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
