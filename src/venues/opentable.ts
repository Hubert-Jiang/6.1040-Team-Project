// OpenTable reads the time as the restaurant's local time, and our gatherings are around MIT
const TIME_ZONE = "America/New_York";

/**
 * Returns the OpenTable search page for `venue` with the party size and time filled in, so a host can
 * place the booking by hand. `partySize` counts everyone at the table, the host included.
 * Raises a RangeError for a party size below 1 or an invalid time.
 */
export function openTableUrl({ venue, partySize, time }: { venue: string; partySize: number; time: Date }): string {
  if (!Number.isInteger(partySize) || partySize < 1) throw new RangeError("party size must be a whole number of at least 1");
  if (Number.isNaN(time.getTime())) throw new RangeError("time must be a valid date");
  // the Swedish locale formats as "2026-12-02 19:00:00", which is one character away from what OpenTable takes
  const local = time.toLocaleString("sv-SE", { timeZone: TIME_ZONE });
  const url = new URL("https://www.opentable.com/s");
  url.searchParams.set("term", venue.trim());
  url.searchParams.set("covers", String(partySize));
  url.searchParams.set("dateTime", local.slice(0, 16).replace(" ", "T"));
  return url.href;
}
