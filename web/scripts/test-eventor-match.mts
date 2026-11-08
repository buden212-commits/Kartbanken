#!/usr/bin/env tsx
/**
 * Matchning av Eventor-medlemmar mot e-post och unikt namn.
 * Run: npx tsx scripts/test-eventor-match.mts
 */
import {
  indexEventorPersons,
  matchClubMember,
  normalizePersonName,
  parseEventorPersons,
} from "../src/lib/eventor/members";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error("FAIL:", message);
  }
}

const fixture = `<?xml version="1.0" encoding="utf-8"?>
<PersonList>
  <Person sex="M">
    <PersonName><Family>Björkman</Family><Given sequence="1">Kalle</Given></PersonName>
    <PersonId>1</PersonId>
    <Tele mailAddress="Kalle@Example.com" />
  </Person>
  <Person sex="F">
    <PersonName>
      <Family>Svensson</Family>
      <Given sequence="1">Anna</Given>
      <Given sequence="2">Maria</Given>
    </PersonName>
    <PersonId>2</PersonId>
    <Tele mailAddress="anna@example.com" />
  </Person>
  <Person sex="M">
    <PersonName><Family>Svensson</Family><Given sequence="1">Anna</Given></PersonName>
    <PersonId>3</PersonId>
  </Person>
  <Person sex="F">
    <PersonName><Family>Karlsson</Family><Given sequence="1">Karl-Johan</Given></PersonName>
    <PersonId>4</PersonId>
    <Tele><MailAddress>kj@example.com</MailAddress></Tele>
  </Person>
</PersonList>`;

const index = indexEventorPersons(parseEventorPersons(fixture));

assert(normalizePersonName("Björkman-Kalle") === "bjorkman kalle", "normaliserar accent och bindestreck");
assert(
  matchClubMember(index, { email: "kalle@example.com" }).status === "match",
  "e-postträff är skiftlägesokänslig",
);
assert(
  matchClubMember(index, {
    email: "other@example.com",
    givenName: "Kalle",
    familyName: "Björkman",
  }).status === "match",
  "unikt namn träffar",
);
assert(
  matchClubMember(index, {
    email: "other@example.com",
    fullName: "Bjorkman Kalle",
  }).status === "match",
  "omvänt namn utan accent träffar",
);
assert(
  matchClubMember(index, {
    email: "other@example.com",
    givenName: "Anna",
    familyName: "Svensson",
  }).status === "ambiguous_name",
  "delat för- och efternamn är tvetydigt",
);
assert(
  matchClubMember(index, {
    email: "other@example.com",
    givenName: "Anna Maria",
    familyName: "Svensson",
  }).status === "match",
  "alla förnamn plus efternamn är unikt",
);
assert(
  matchClubMember(index, {
    email: "other@example.com",
    givenName: "Karl Johan",
    familyName: "Karlsson",
  }).status === "match",
  "bindestreck i Eventor matchar mellanslag",
);
assert(
  matchClubMember(index, { email: "kj@example.com" }).status === "match",
  "e-post i element träffar",
);
assert(
  matchClubMember(index, {
    email: "nobody@example.com",
    givenName: "Nils",
    familyName: "Ingen",
  }).status === "not_member",
  "okänd person är inte medlem",
);

const apiKey = process.env.EVENTOR_API_KEY?.trim();
if (apiKey) {
  const orgId = process.env.EVENTOR_ORGANISATION_ID?.trim() || "575";
  const response = await fetch(
    `https://eventor.orientering.se/api/persons/organisations/${orgId}?includeContactDetails=true`,
    { headers: { ApiKey: apiKey, Accept: "application/xml" } },
  );
  assert(response.ok, `Eventor svarade ${response.status}`);
  const persons = parseEventorPersons(await response.text());
  const withEmail = persons.filter((person) => person.emails.length > 0).length;
  assert(persons.length > 100, `för få personer: ${persons.length}`);
  assert(withEmail > 100, `för få e-postadresser: ${withEmail}`);
  console.log(`live: ${persons.length} personer, ${withEmail} med e-post`);
} else {
  console.log("Hoppar över live-uppslag: EVENTOR_API_KEY saknas");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
