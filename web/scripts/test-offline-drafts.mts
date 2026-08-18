/**
 * Enhetstester för utkast-nycklar och nätverksfel.
 * Kör: npx tsx scripts/test-offline-drafts.mts
 */
import {
  createSuggestionDraftId,
  draftHasContent,
  editSuggestionDraftId,
  emptyCreateDraft,
  isNetworkError,
} from "../src/lib/suggestion/offline-drafts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(
  createSuggestionDraftId("mora-vast", "ver1") === "create:mora-vast:ver1",
  "create-id ska vara stabilt per karta+version",
);
assert(editSuggestionDraftId("abc") === "edit:abc", "edit-id ska använda förslags-id");

const empty = emptyCreateDraft({ mapSlug: "mora", versionId: "v1" });
assert(!draftHasContent(empty), "tomt utkast ska inte räknas som innehåll");
assert(empty.clientDraftId.length > 8, "clientDraftId ska genereras");
assert(empty.kind === "create", "kind create");

const withMarking = {
  ...empty,
  markings: [{ type: "Point" as const, coordinates: [1, 2] as [number, number] }],
};
assert(draftHasContent(withMarking), "markering ska räknas som innehåll");

assert(isNetworkError(new TypeError("Failed to fetch")), "TypeError är nätverksfel");
assert(isNetworkError(new Error("NetworkError when attempting to fetch resource.")), "NetworkError-text");
assert(!isNetworkError(new Error("Beskrivning krävs")), "valideringsfel är inte nätverk");

console.log("offline-drafts: ok");
