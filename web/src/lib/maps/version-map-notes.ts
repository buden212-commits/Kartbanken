import { extractOcadMapNotes } from "@/lib/ocad/ocad-map-notes";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";

export async function ensureVersionMapNotes(version: {
  id: string;
  storagePath: string;
  mapNotes: string | null;
}): Promise<string> {
  if (version.mapNotes !== null) return version.mapNotes;

  const buffer = await readStoredFile(version.storagePath);
  const mapNotes = extractOcadMapNotes(buffer);
  await prisma.mapVersion.update({
    where: { id: version.id },
    data: { mapNotes },
  });
  return mapNotes;
}
