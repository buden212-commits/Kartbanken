import { after } from "next/server";

/** Kör async arbete efter att HTTP-svaret skickats (fungerar på Vercel serverless). */
export function runAfterResponse(fn: () => Promise<void>): void {
  after(async () => {
    try {
      await fn();
    } catch (err) {
      console.error("Background task failed:", err);
    }
  });
}
