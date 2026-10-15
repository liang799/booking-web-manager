/** UC2-02: the number of slots a booker may offer in one session. */
export const MIN_SESSION_SLOTS = 2;
export const MAX_SESSION_SLOTS = 30;

export function isValidSlotCount(totalSlots: number): boolean {
  return Number.isSafeInteger(totalSlots) &&
    totalSlots >= MIN_SESSION_SLOTS && totalSlots <= MAX_SESSION_SLOTS;
}
