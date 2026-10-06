import { strict as assert } from "node:assert";
import { test } from "node:test";
import { appointmentTimeInput, appointmentTimeToUtc } from "../../src/lib/appointment-time.ts";

test("converts a Dubai local time independently of the device time zone", () => {
  assert.equal(appointmentTimeToUtc("2026-10-07T09:30", "Asia/Dubai"), "2026-10-07T05:30:00Z");
});
test("keeps fractional-hour time zones and UTC day boundaries", () => {
  assert.equal(appointmentTimeToUtc("2026-10-07T00:15", "Asia/Kathmandu"), "2026-10-06T18:30:00Z");
});
test("formats a datetime-local default in the displayed zone", () => {
  assert.equal(appointmentTimeInput("2026-10-07T05:30:00Z", "Asia/Dubai"), "2026-10-07T09:30");
  assert.equal(appointmentTimeInput(new Date("2026-10-07T05:30:00Z"), "UTC"), "2026-10-07T05:30");
});
test("rejects a spring DST gap instead of moving the requested time forward", () => {
  assert.throws(() => appointmentTimeToUtc("2026-03-08T02:30", "America/New_York"), /daylight-saving/);
});
test("rejects a repeated fall DST time instead of guessing an occurrence", () => {
  assert.throws(() => appointmentTimeToUtc("2026-11-01T01:30", "America/New_York"), /daylight-saving/);
});
test("uses the correct summer and winter offsets for unambiguous times", () => {
  assert.equal(appointmentTimeToUtc("2026-07-01T09:00", "America/New_York"), "2026-07-01T13:00:00Z");
  assert.equal(appointmentTimeToUtc("2026-12-01T09:00", "America/New_York"), "2026-12-01T14:00:00Z");
});
test("rejects malformed dates, invalid zones and already-offset values", () => {
  assert.throws(() => appointmentTimeToUtc("2026-02-30T09:00", "UTC"), /valid local time/);
  assert.throws(() => appointmentTimeToUtc("2026-10-07T09:00", "Unknown/Zone"), /IANA/);
  assert.throws(() => appointmentTimeToUtc("2026-10-07T09:00Z", "UTC"), /complete local/);
  assert.throws(() => appointmentTimeToUtc("", "UTC"), /complete local/);
});
