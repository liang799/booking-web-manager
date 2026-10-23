import { Email } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Email", () => {
  test("constructor_WhenStandardAddress_PreservesExactAddress", () => {
    // Input
    const address = "owner@example.com";

    // Log
    const email = new Email(address);

    // Oracle
    expect(email.toString()).toBe("owner@example.com");
  });

  test("constructor_WhenMixedCaseAndPlusTag_PreservesExactAddress", () => {
    // Input
    const address = "Owner+bookings@Example.COM";

    // Log
    const email = new Email(address);

    // Oracle
    expect(email.toString()).toBe("Owner+bookings@Example.COM");
  });

  test("constructor_WhenLocalhostDomain_PreservesExactAddress", () => {
    // Input
    const address = "owner@localhost";

    // Log
    const email = new Email(address);

    // Oracle
    expect(email.toString()).toBe("owner@localhost");
  });

  test("constructor_WhenAddressHasEmpty_ThrowsInvalidInput", () => {
    // Input
    const address = "";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasWhitespaceOnly_ThrowsInvalidInput", () => {
    // Input
    const address = " ";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasMissingAtSign_ThrowsInvalidInput", () => {
    // Input
    const address = "owner.example.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasMissingLocalPart_ThrowsInvalidInput", () => {
    // Input
    const address = "@example.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasMissingDomain_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasConsecutiveAtSigns_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@@example.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasMultipleAtSigns_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@example@com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasLeadingSpace_ThrowsInvalidInput", () => {
    // Input
    const address = " owner@example.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasTrailingSpace_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@example.com ";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasSpaceInLocalPart_ThrowsInvalidInput", () => {
    // Input
    const address = "own er@example.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasSpaceInDomain_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@exam ple.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasTab_ThrowsInvalidInput", () => {
    // Input
    const address = "owner\t@example.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasTrailingNewline_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@example.com\n";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasTrailingCrLf_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@example.com\r\n";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasUnicodeLineSeparator_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@example.com\u2028";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenAddressHasNonBreakingSpace_ThrowsInvalidInput", () => {
    // Input
    const address = "owner@\u00a0example.com";

    // Log & Oracle
    expect(() => new Email(address)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  test("constructor_WhenMutationIsAttempted_PreservesPublicSurface", () => {
    // Input
    const email = new Email("owner@example.com");

    // Log
    const valueChanged = Reflect.set(email, "value", "other@example.com");
    const methodChanged = Reflect.set(
      email,
      "toString",
      () => "other@example.com",
    );

    // Oracle
    expect(Object.isFrozen(email)).toBe(true);
    expect(valueChanged).toBe(false);
    expect(methodChanged).toBe(false);
    expect(email.toString()).toBe("owner@example.com");
  });

  test("equals_WhenSameText_ReturnsTrue", () => {
    // Input
    const email = new Email("Owner@example.com");
    const other = new Email("Owner@example.com");

    // Log
    const equalAddresses = email.equals(other);

    // Oracle
    expect(equalAddresses).toBe(true);
  });

  test("equals_WhenDifferentLocalCase_ReturnsFalse", () => {
    // Input
    const email = new Email("Owner@example.com");
    const other = new Email("owner@example.com");

    // Log
    const equalAddresses = email.equals(other);

    // Oracle
    expect(equalAddresses).toBe(false);
  });

  test("equals_WhenDifferentDomainCase_ReturnsFalse", () => {
    // Input
    const email = new Email("Owner@example.com");
    const other = new Email("Owner@EXAMPLE.COM");

    // Log
    const equalAddresses = email.equals(other);

    // Oracle
    expect(equalAddresses).toBe(false);
  });

  test("equals_WhenDifferentAddress_ReturnsFalse", () => {
    // Input
    const email = new Email("Owner@example.com");
    const other = new Email("other@example.com");

    // Log
    const equalAddresses = email.equals(other);

    // Oracle
    expect(equalAddresses).toBe(false);
  });
});
