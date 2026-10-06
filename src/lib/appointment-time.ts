import { Temporal } from "@js-temporal/polyfill";

// A datetime-local value has no offset. Interpret it in the explicitly displayed
// zone rather than silently using the browser's zone or choosing a DST occurrence.
export function appointmentTimeToUtc(localValue: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(localValue)) {
    throw new Error("Choose a complete local date and time.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
  } catch {
    throw new Error("Choose a valid IANA time zone.");
  }
  try {
    return Temporal.PlainDateTime.from(localValue)
      .toZonedDateTime(timeZone, { disambiguation: "reject" })
      .toInstant()
      .toString();
  } catch {
    throw new Error("Choose a valid local time. Times skipped or repeated by a daylight-saving change need a different time.");
  }
}

export function appointmentTimeInput(instant: string | Date, timeZone: string): string {
  return Temporal.Instant.from(instant instanceof Date ? instant.toISOString() : instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
