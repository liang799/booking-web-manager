import { Email } from "@/domain";
import { describe, expect, test } from "vitest";

describe("Email address integrity and equality", () => {
  describe("Address preservation and immutability", () => {
    test("constructor_WhenStandardAddress_PreservesExactAddress", () => {
      const address = "owner@example.com";

      const email = new Email(address);

      expect(email.toString()).toBe("owner@example.com");
    });

    test("constructor_WhenMixedCaseAndPlusTag_PreservesExactAddress", () => {
      const address = "Owner+bookings@Example.COM";

      const email = new Email(address);

      expect(email.toString()).toBe("Owner+bookings@Example.COM");
    });

    test("constructor_WhenLocalhostDomain_PreservesExactAddress", () => {
      const address = "owner@localhost";

      const email = new Email(address);

      expect(email.toString()).toBe("owner@localhost");
    });

    test("constructor_WhenMutationIsAttempted_PreservesPublicSurface", () => {
      const email = new Email("owner@example.com");

      const valueChanged = Reflect.set(email, "value", "other@example.com");
      const methodChanged = Reflect.set(
        email,
        "toString",
        () => "other@example.com",
      );

      expect(Object.isFrozen(email)).toBe(true);
      expect(valueChanged).toBe(false);
      expect(methodChanged).toBe(false);
      expect(email.toString()).toBe("owner@example.com");
    });
  });

  describe("Address structure", () => {
    test("constructor_WhenAddressHasEmpty_ThrowsInvalidInput", () => {
      const address = "";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasMissingAtSign_ThrowsInvalidInput", () => {
      const address = "owner.example.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasMissingLocalPart_ThrowsInvalidInput", () => {
      const address = "@example.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasMissingDomain_ThrowsInvalidInput", () => {
      const address = "owner@";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasConsecutiveAtSigns_ThrowsInvalidInput", () => {
      const address = "owner@@example.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasMultipleAtSigns_ThrowsInvalidInput", () => {
      const address = "owner@example@com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Whitespace rejection", () => {
    test("constructor_WhenAddressHasWhitespaceOnly_ThrowsInvalidInput", () => {
      const address = " ";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasLeadingSpace_ThrowsInvalidInput", () => {
      const address = " owner@example.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasTrailingSpace_ThrowsInvalidInput", () => {
      const address = "owner@example.com ";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasSpaceInLocalPart_ThrowsInvalidInput", () => {
      const address = "own er@example.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasSpaceInDomain_ThrowsInvalidInput", () => {
      const address = "owner@exam ple.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasTab_ThrowsInvalidInput", () => {
      const address = "owner\t@example.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasTrailingNewline_ThrowsInvalidInput", () => {
      const address = "owner@example.com\n";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasTrailingCrLf_ThrowsInvalidInput", () => {
      const address = "owner@example.com\r\n";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasUnicodeLineSeparator_ThrowsInvalidInput", () => {
      const address = "owner@example.com\u2028";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });

    test("constructor_WhenAddressHasNonBreakingSpace_ThrowsInvalidInput", () => {
      const address = "owner@\u00a0example.com";

      expect(() => new Email(address)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
    });
  });

  describe("Exact address equality", () => {
    test("equals_WhenSameText_ReturnsTrue", () => {
      const email = new Email("Owner@example.com");
      const other = new Email("Owner@example.com");

      const equalAddresses = email.equals(other);

      expect(equalAddresses).toBe(true);
    });

    test("equals_WhenDifferentLocalCase_ReturnsFalse", () => {
      const email = new Email("Owner@example.com");
      const other = new Email("owner@example.com");

      const equalAddresses = email.equals(other);

      expect(equalAddresses).toBe(false);
    });

    test("equals_WhenDifferentDomainCase_ReturnsFalse", () => {
      const email = new Email("Owner@example.com");
      const other = new Email("Owner@EXAMPLE.COM");

      const equalAddresses = email.equals(other);

      expect(equalAddresses).toBe(false);
    });

    test("equals_WhenDifferentAddress_ReturnsFalse", () => {
      const email = new Email("Owner@example.com");
      const other = new Email("other@example.com");

      const equalAddresses = email.equals(other);

      expect(equalAddresses).toBe(false);
    });
  });
});
