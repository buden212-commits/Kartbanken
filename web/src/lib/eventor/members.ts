const CACHE_MS = 15 * 60 * 1000;
const DEFAULT_ORGANISATION_ID = "575";

export type ClubMemberMatch =
  | { status: "match"; via: "email" | "name" }
  | { status: "ambiguous_name" }
  | { status: "not_member" }
  | { status: "unavailable" }
  | { status: "not_configured" };

type ParsedPerson = {
  id: string;
  emails: string[];
  nameKeys: string[];
};

type MemberIndex = {
  emailToId: Map<string, string>;
  uniqueNameToId: Map<string, string>;
  ambiguousNames: Set<string>;
};

type CacheEntry = {
  expiresAt: number;
  index: MemberIndex;
};

let cache: CacheEntry | null = null;

const HYPHEN = /[\u2010\u2011\u2012\u2013\u2014\u2015-]/g;

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(HYPHEN, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Förnamn (ett eller flera) plus efternamn, i båda ordningarna. */
export function nameLookupKeys(givenNames: string[], familyName: string): string[] {
  const givens = givenNames
    .flatMap((name) => normalizePersonName(name).split(" "))
    .filter(Boolean);
  const family = normalizePersonName(familyName);
  if (!family || givens.length === 0) return [];

  const allGiven = givens.join(" ");
  const first = givens[0];
  return unique([
    `${allGiven} ${family}`,
    `${family} ${allGiven}`,
    `${first} ${family}`,
    `${family} ${first}`,
  ]);
}

export function googleNameLookupKeys(input: {
  givenName?: string | null;
  familyName?: string | null;
  fullName?: string | null;
}): string[] {
  const given = input.givenName?.trim() ?? "";
  const family = input.familyName?.trim() ?? "";
  if (given && family) return nameLookupKeys([given], family);

  const parts = normalizePersonName(input.fullName ?? "")
    .split(" ")
    .filter(Boolean);
  if (parts.length < 2) return [];
  return nameLookupKeys(parts.slice(0, -1), parts[parts.length - 1]);
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseEventorPersons(xml: string): ParsedPerson[] {
  const blocks = xml.match(/<Person\b[^>]*>[\s\S]*?<\/Person>/g) ?? [];
  const persons: ParsedPerson[] = [];

  for (const block of blocks) {
    const id = block.match(/<PersonId>([^<]+)<\/PersonId>/)?.[1]?.trim();
    if (!id) continue;

    const family = decodeXml(block.match(/<Family>([^<]*)<\/Family>/)?.[1] ?? "");
    const givens = [...block.matchAll(/<Given\b[^>]*>([^<]*)<\/Given>/g)].map((match) =>
      decodeXml(match[1] ?? ""),
    );
    const emails = unique(
      [
        ...[...block.matchAll(/\bmailAddress="([^"]*)"/g)].map((match) => match[1] ?? ""),
        ...[...block.matchAll(/<MailAddress>([^<]*)<\/MailAddress>/g)].map((match) => match[1] ?? ""),
      ]
        .map((email) => decodeXml(email).trim().toLowerCase())
        .filter((email) => email.includes("@")),
    );

    persons.push({
      id,
      emails,
      nameKeys: nameLookupKeys(givens, family),
    });
  }

  return persons;
}

export function indexEventorPersons(persons: ParsedPerson[]): MemberIndex {
  const emailToId = new Map<string, string>();
  const nameToIds = new Map<string, Set<string>>();

  for (const person of persons) {
    for (const email of person.emails) {
      emailToId.set(email, person.id);
    }
    for (const key of person.nameKeys) {
      const ids = nameToIds.get(key) ?? new Set<string>();
      ids.add(person.id);
      nameToIds.set(key, ids);
    }
  }

  const uniqueNameToId = new Map<string, string>();
  const ambiguousNames = new Set<string>();
  for (const [key, ids] of nameToIds) {
    if (ids.size === 1) {
      uniqueNameToId.set(key, [...ids][0]);
    } else {
      ambiguousNames.add(key);
    }
  }

  return { emailToId, uniqueNameToId, ambiguousNames };
}

export function matchClubMember(
  index: MemberIndex,
  query: {
    email: string;
    givenName?: string | null;
    familyName?: string | null;
    fullName?: string | null;
  },
): Exclude<ClubMemberMatch, { status: "unavailable" } | { status: "not_configured" }> {
  const email = query.email.trim().toLowerCase();
  if (email && index.emailToId.has(email)) {
    return { status: "match", via: "email" };
  }

  const keys = googleNameLookupKeys(query);
  const hits = new Set<string>();
  let ambiguous = false;
  for (const key of keys) {
    const id = index.uniqueNameToId.get(key);
    if (id) hits.add(id);
    else if (index.ambiguousNames.has(key)) ambiguous = true;
  }

  if (hits.size === 1) return { status: "match", via: "name" };
  if (hits.size > 1 || ambiguous) return { status: "ambiguous_name" };
  return { status: "not_member" };
}

function organisationId(): string | null {
  const raw = process.env.EVENTOR_ORGANISATION_ID?.trim() || DEFAULT_ORGANISATION_ID;
  return /^\d+$/.test(raw) ? raw : null;
}

async function loadMemberIndex(): Promise<
  { ok: true; index: MemberIndex } | { ok: false; status: "unavailable" | "not_configured" }
> {
  const apiKey = process.env.EVENTOR_API_KEY?.trim();
  const orgId = organisationId();
  if (!apiKey || !orgId) return { ok: false, status: "not_configured" };

  if (cache && cache.expiresAt > Date.now()) {
    return { ok: true, index: cache.index };
  }

  const url = `https://eventor.orientering.se/api/persons/organisations/${orgId}?includeContactDetails=true`;

  try {
    const response = await fetch(url, {
      headers: {
        ApiKey: apiKey,
        Accept: "application/xml",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { ok: false, status: "unavailable" };

    const xml = await response.text();
    const index = indexEventorPersons(parseEventorPersons(xml));
    cache = { expiresAt: Date.now() + CACHE_MS, index };
    return { ok: true, index };
  } catch (err) {
    console.error("[eventor] Kunde inte hämta medlemmar:", err);
    return { ok: false, status: "unavailable" };
  }
}

export async function findClubMember(query: {
  email: string;
  givenName?: string | null;
  familyName?: string | null;
  fullName?: string | null;
}): Promise<ClubMemberMatch> {
  const loaded = await loadMemberIndex();
  if (!loaded.ok) return { status: loaded.status };
  return matchClubMember(loaded.index, query);
}

/** Tömmer cachen. Används i tester. */
export function clearEventorMemberCache(): void {
  cache = null;
}
