/** A restaurant or dining hall found by the lookup, with a Google Maps link to it. */
export interface Venue {
  id: string;
  name: string;
  address: string;
  mapsUrl: string;
}

// Places API (New) Text Search
const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
// Only the fields a Venue needs. These four bill at the Pro tier; adding a price level or rating would move every call to Enterprise.
const FIELDS = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri";
// how many venues one search returns
const LIMIT = 5;
// the longest query or area sent to Google, in characters
const MAX_TEXT = 100;
// how long to wait for Google, in milliseconds
const TIMEOUT = 5_000;

/**
 * Returns up to 5 venues matching `query` near `area`, or restaurants in general when the query is empty.
 * The lookup is optional, so it never raises: a missing key, an empty area, or a failed call returns no venues,
 * and people can still type a venue in by hand.
 */
export async function searchVenues(
  { query = "", area }: { query?: string; area: string },
  { key = process.env.GOOGLE_PLACES_API_KEY, fetch = globalThis.fetch }: { key?: string; fetch?: typeof globalThis.fetch } = {},
): Promise<Venue[]> {
  const what = query.trim().slice(0, MAX_TEXT) || "restaurants";
  const where = area.trim().slice(0, MAX_TEXT);
  if (!key || !where) return [];

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      // the key stays on the server and goes in a header, never in a URL
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({ textQuery: `${what} near ${where}`, pageSize: LIMIT }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const { places = [] } = (await response.json()) as { places?: Place[] };
    // skips anything without an id and a name
    return places.flatMap((place) =>
      place.id && place.displayName?.text
        ? [{ id: place.id, name: place.displayName.text, address: place.formattedAddress ?? "", mapsUrl: place.googleMapsUri ?? "" }]
        : [],
    );
  } catch (error) {
    console.warn(`Google Places didn't answer a venue search: ${error}`);
    return [];
  }
}

// one place in Google's answer, with only the fields asked for
interface Place {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
}
