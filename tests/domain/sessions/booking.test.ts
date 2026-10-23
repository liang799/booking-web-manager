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
    const invalidDetails = { ...details, totalCost: Money.fromCents(0) };

    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenVenueIsBlank_ThrowsRangeError", () => {
    const invalidDetails = { ...details, venueName: " " };

    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenStartEqualsEnd_ThrowsRangeError", () => {
    const invalidDetails = { ...details, startAt: details.endAt };

    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenEndDateIsInvalid_ThrowsRangeError", () => {
    const invalidDetails = { ...details, endAt: new Date(Number.NaN) };

    expect(() => new Booking(invalidDetails)).toThrow(RangeError);
  });

  test("constructor_WhenSourceAndExposedDatesAreMutated_PreservesTimes", () => {
    const input = { ...details, startAt: new Date(details.startAt) };

    const booking = new Booking(input);
    input.startAt.setFullYear(2000);
    booking.startAt.setFullYear(2001);
    booking.endAt.setFullYear(2002);

    expect(booking.startAt).toEqual(details.startAt);
    expect(booking.endAt).toEqual(details.endAt);
  });

  test("equals_WhenValuesMatch_ReturnsTrue", () => {
    const booking = new Booking(details);
    const identicalBooking = new Booking(details);

    const equalBookings = booking.equals(identicalBooking);

    expect(equalBookings).toBe(true);
  });

  test("equals_WhenVenueDiffers_ReturnsFalse", () => {
    const booking = new Booking(details);
    const otherVenueBooking = new Booking({ ...details, venueName: "Other" });

    const equalBookings = booking.equals(otherVenueBooking);

    expect(equalBookings).toBe(false);
  });

  test("hasStarted_WhenTimeEqualsStart_ReturnsTrue", () => {
    const booking = new Booking(details);

    const hasStarted = booking.hasStarted(details.startAt);

    expect(hasStarted).toBe(true);
  });

  test("hasEnded_WhenTimeEqualsEnd_ReturnsTrue", () => {
    const booking = new Booking(details);

    const hasEnded = booking.hasEnded(details.endAt);

    expect(hasEnded).toBe(true);
  });
});
