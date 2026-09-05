export type TileBuildProgress = {
  total: number;
  done: number;
  remaining: number;
  percent: number;
  currentZ: number | null;
  maxZPregen: number | null;
  /** True while preview/OCD is prepared before tile count is known. */
  preparing: boolean;
};

export function tileBuildProgressFromVersion(version: {
  tileStatus: string;
  tileBuildTotal: number | null;
  tileBuildDone: number | null;
  tileBuildCurrentZ: number | null;
  tileBuildMaxZPregen: number | null;
}): TileBuildProgress | null {
  if (version.tileStatus !== "PROCESSING") return null;

  if (version.tileBuildTotal == null || version.tileBuildTotal <= 0) {
    return {
      total: 0,
      done: 0,
      remaining: 0,
      percent: 0,
      currentZ: null,
      maxZPregen: null,
      preparing: true,
    };
  }

  const total = version.tileBuildTotal;
  const done = Math.min(total, Math.max(0, version.tileBuildDone ?? 0));
  const remaining = Math.max(0, total - done);
  const percent = Math.min(100, Math.round((done / total) * 100));
  return {
    total,
    done,
    remaining,
    percent,
    currentZ:
      version.tileBuildCurrentZ != null && version.tileBuildCurrentZ >= 0
        ? version.tileBuildCurrentZ
        : null,
    maxZPregen: version.tileBuildMaxZPregen,
    preparing: false,
  };
}
