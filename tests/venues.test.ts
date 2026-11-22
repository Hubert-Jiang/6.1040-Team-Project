import { expect, test } from "bun:test";
import { openTableUrl } from "../src/venues/opentable.ts";
import { searchVenues } from "../src/venues/places.ts";

/** A stand-in for fetch that records the one request it gets and answers with `body` and `status`. */
function fakeGoogle(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json(body, { status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

test("a venue search asks Google for only the fields it returns", async () => {
  const google = fakeGoogle({
    places: [
      { id: "abc", displayName: { text: "Oleana", languageCode: "en" }, formattedAddress: "134 Hampshire St, Cambridge, MA", googleMapsUri: "https://maps.google.com/?cid=1" },
      // a place with no name is left out
      { id: "def" },
    ],
  });
  const venues = await searchVenues({ query: " tapas ", area: "Kendall Square" }, { key: "test-key", fetch: google.fetch });
  expect(venues).toEqual([{ id: "abc", name: "Oleana", address: "134 Hampshire St, Cambridge, MA", mapsUrl: "https://maps.google.com/?cid=1" }]);

  const [{ url, init }] = google.calls;
  expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
  expect(init.method).toBe("POST");
  expect(init.headers).toMatchObject({ "X-Goog-Api-Key": "test-key", "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri" });
  expect(JSON.parse(init.body as string)).toEqual({ textQuery: "tapas near Kendall Square", pageSize: 5 });
});

test("an empty query looks for restaurants, and long text is cut to 100 characters", async () => {
  const google = fakeGoogle({});
  expect(await searchVenues({ area: "Kendall Square" }, { key: "test-key", fetch: google.fetch })).toEqual([]);
  await searchVenues({ query: "x".repeat(500), area: "Kendall Square" }, { key: "test-key", fetch: google.fetch });
  expect(google.calls.map(({ init }) => JSON.parse(init.body as string).textQuery)).toEqual(["restaurants near Kendall Square", `${"x".repeat(100)} near Kendall Square`]);
});

test("the lookup answers with no venues when it cannot run", async () => {
  const google = fakeGoogle({ error: { status: "PERMISSION_DENIED" } }, 403);
  // no key and no area never reach Google
  expect(await searchVenues({ area: "Kendall Square" }, { key: "", fetch: google.fetch })).toEqual([]);
  expect(await searchVenues({ query: "tapas", area: "  " }, { key: "test-key", fetch: google.fetch })).toEqual([]);
  expect(google.calls).toHaveLength(0);
  // a refused key and a dropped connection are swallowed
  expect(await searchVenues({ area: "Kendall Square" }, { key: "bad-key", fetch: google.fetch })).toEqual([]);
  const down = (async () => { throw new Error("offline"); }) as unknown as typeof globalThis.fetch;
  expect(await searchVenues({ area: "Kendall Square" }, { key: "test-key", fetch: down })).toEqual([]);
});

test("an OpenTable link carries the venue, the party size, and the local time", () => {
  // midnight UTC on Dec 3 is 7 PM on Dec 2 in Cambridge
  const url = openTableUrl({ venue: "Café Sushi & Grill", partySize: 5, time: new Date("2026-12-03T00:00:00Z") });
  expect(url).toBe("https://www.opentable.com/s?term=Caf%C3%A9+Sushi+%26+Grill&covers=5&dateTime=2026-12-02T19%3A00");
  // daylight time shifts the hour
  expect(new URL(openTableUrl({ venue: "Oleana", partySize: 2, time: new Date("2026-07-02T00:00:00Z") })).searchParams.get("dateTime")).toBe("2026-07-01T20:00");
  expect(() => openTableUrl({ venue: "Oleana", partySize: 0, time: new Date() })).toThrow(RangeError);
  expect(() => openTableUrl({ venue: "Oleana", partySize: 2, time: new Date("never") })).toThrow(RangeError);
});
