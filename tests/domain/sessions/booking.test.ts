import { Booking, Money } from "@/domain";
import { describe, expect, test } from "vitest";

const details = {
  venueName: "Court",
  region: "North",
  sport: "Badminton",
  totalCost: Money.fromCents(100),
  startAt: new Date("2026-10-01"),
  endAt: new Date("2026-10-02"),
};

describe("Booking", () => {
  test("constructor_WhenCostIsZero_ThrowsRangeError", () => {
    // Input
    const invalidDetails = { ...details, totalCost: Money.fromCents(0) };

    // Log & Oracle
    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenVenueIsBlank_ThrowsRangeError", () => {
    // Input
    const invalidDetails = { ...details, venueName: " " };

    // Log & Oracle
    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenStartEqualsEnd_ThrowsRangeError", () => {
    // Input
    const invalidDetails = { ...details, startAt: details.endAt };

    // Log & Oracle
    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenEndDateIsInvalid_ThrowsRangeError", () => {
    // Input
    const invalidDetails = { ...details, endAt: new Date(Number.NaN) };

    // Log & Oracle
    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenSourceAndExposedDatesAreMutated_PreservesTimes", () => {
    // Input
    const input = { ...details, startAt: new Date(details.startAt) };

    // Log
    const booking = new Booking(input);
    input.startAt.setFullYear(2000);
    booking.startAt.setFullYear(2001);
    booking.endAt.setFullYear(2002);

    // Oracle
    expect(booking.startAt).toEqual(details.startAt);
    expect(booking.endAt).toEqual(details.endAt);
  });

  test("equals_WhenValuesMatch_ReturnsTrue", () => {
    // Input
    const booking = new Booking(details);
    const identicalBooking = new Booking(details);

    // Log
    const equalBookings = booking.equals(identicalBooking);

    // Oracle
    expect(equalBookings).toBe(true);
  });

  test("equals_WhenVenueDiffers_ReturnsFalse", () => {
    // Input
    const booking = new Booking(details);
    const otherVenueBooking = new Booking({ ...details, venueName: "Other" });

    // Log
    const equalBookings = booking.equals(otherVenueBooking);

    // Oracle
    expect(equalBookings).toBe(false);
  });

  test("hasStarted_WhenTimeEqualsStart_ReturnsTrue", () => {
    // Input
    const booking = new Booking(details);

    // Log
    const hasStarted = booking.hasStarted(details.startAt);

    // Oracle
    expect(hasStarted).toBe(true);
  });

  test("hasEnded_WhenTimeEqualsEnd_ReturnsTrue", () => {
    // Input
    const booking = new Booking(details);

    // Log
    const hasEnded = booking.hasEnded(details.endAt);

    // Oracle
    expect(hasEnded).toBe(true);
  });
});
