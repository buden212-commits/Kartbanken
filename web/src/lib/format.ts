function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** Swedish local time (CET/CEST). */
export const APP_TIME_ZONE = "Europe/Stockholm";

const dateTimeFormatOptions = {
  timeZone: APP_TIME_ZONE,
} as const;

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString("sv-SE", {
    ...dateTimeFormatOptions,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDateOnly(date: Date | string): string {
  return new Date(date).toLocaleString("sv-SE", {
    ...dateTimeFormatOptions,
    dateStyle: "medium",
  });
}

export function formatTimeOnly(date: Date | string): string {
  return new Date(date).toLocaleString("sv-SE", {
    ...dateTimeFormatOptions,
    timeStyle: "short",
  });
}

export { formatBytes };
