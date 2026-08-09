import { getStorageBackend, type StorageBackend } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

export type MapStorageRow = {
  id: string;
  slug: string;
  title: string;
  versionBytes: number;
  versionCount: number;
  checkoutFileCount: number;
  courseCount: number;
};

export type MonthlyUploadStat = {
  monthKey: string;
  monthLabel: string;
  bytes: number;
  count: number;
};

export type StorageDashboardData = {
  backend: StorageBackend;
  totals: {
    versionBytes: number;
    versionCount: number;
    mapCount: number;
    checkoutFileCount: number;
    courseCount: number;
  };
  maps: MapStorageRow[];
  monthlyUploads: MonthlyUploadStat[];
};

function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString("sv-SE", { month: "short", year: "numeric" });
}

function buildRecentMonthKeys(months: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(date));
  }
  return keys;
}

export async function getStorageDashboardData(): Promise<StorageDashboardData> {
  const [maps, versionGroups, recentVersions, checkoutCounts, courseCounts] = await Promise.all([
    prisma.mapFile.findMany({
      select: { id: true, slug: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.mapVersion.groupBy({
      by: ["mapFileId"],
      _sum: { fileSizeBytes: true },
      _count: { id: true },
    }),
    prisma.mapVersion.findMany({
      where: {
        uploadedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1),
        },
      },
      select: { uploadedAt: true, fileSizeBytes: true },
    }),
    prisma.mapCheckout.findMany({
      select: {
        mapFileId: true,
        exportStoragePath: true,
        checkinStoragePath: true,
      },
    }),
    prisma.course.groupBy({
      by: ["mapFileId"],
      _count: { id: true },
    }),
  ]);

  const versionByMap = new Map(
    versionGroups.map((row) => [
      row.mapFileId,
      {
        bytes: row._sum.fileSizeBytes ?? 0,
        count: row._count.id,
      },
    ]),
  );

  const checkoutByMap = new Map<string, number>();
  for (const checkout of checkoutCounts) {
    let files = 0;
    if (checkout.exportStoragePath) files += 1;
    if (checkout.checkinStoragePath) files += 1;
    if (files === 0) continue;
    checkoutByMap.set(checkout.mapFileId, (checkoutByMap.get(checkout.mapFileId) ?? 0) + files);
  }

  const courseByMap = new Map(courseCounts.map((row) => [row.mapFileId, row._count.id]));

  const mapRows: MapStorageRow[] = maps.map((map) => {
    const version = versionByMap.get(map.id);
    return {
      id: map.id,
      slug: map.slug,
      title: map.title,
      versionBytes: version?.bytes ?? 0,
      versionCount: version?.count ?? 0,
      checkoutFileCount: checkoutByMap.get(map.id) ?? 0,
      courseCount: courseByMap.get(map.id) ?? 0,
    };
  });

  mapRows.sort((a, b) => b.versionBytes - a.versionBytes);

  const monthlyKeys = buildRecentMonthKeys(6);
  const monthlyMap = new Map<string, { bytes: number; count: number }>(
    monthlyKeys.map((key) => [key, { bytes: 0, count: 0 }]),
  );

  for (const version of recentVersions) {
    const key = monthKey(version.uploadedAt);
    const bucket = monthlyMap.get(key);
    if (!bucket) continue;
    bucket.bytes += version.fileSizeBytes;
    bucket.count += 1;
  }

  const monthlyUploads = monthlyKeys.map((key) => {
    const bucket = monthlyMap.get(key)!;
    return {
      monthKey: key,
      monthLabel: monthLabel(key),
      bytes: bucket.bytes,
      count: bucket.count,
    };
  });

  const totals = mapRows.reduce(
    (acc, row) => {
      acc.versionBytes += row.versionBytes;
      acc.versionCount += row.versionCount;
      acc.checkoutFileCount += row.checkoutFileCount;
      acc.courseCount += row.courseCount;
      return acc;
    },
    {
      versionBytes: 0,
      versionCount: 0,
      mapCount: mapRows.length,
      checkoutFileCount: 0,
      courseCount: 0,
    },
  );

  let backend: StorageBackend = "local";
  try {
    backend = getStorageBackend();
  } catch {
    backend = "blob";
  }

  return {
    backend,
    totals,
    maps: mapRows,
    monthlyUploads,
  };
}
