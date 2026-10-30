/** UC2-02: the number of slots a booker may offer in one session. */
export const MIN_SESSION_SLOTS = 1;
export const MAX_SESSION_SLOTS = 30;
/** Historical sessions offered 30 guest places before the booker was counted. */
export const MAX_STORED_SESSION_SLOTS = MAX_SESSION_SLOTS + 1;

export function isValidSlotCount(totalSlots: number): boolean {
  return Number.isSafeInteger(totalSlots) &&
    totalSlots >= MIN_SESSION_SLOTS && totalSlots <= MAX_SESSION_SLOTS;
}
