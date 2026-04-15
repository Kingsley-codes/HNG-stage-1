import { randomBytes } from "crypto";

//Generates a UUID v7 (timestamp-based UUID)

export const generateUUIDv7 = (): string => {
  // Get current timestamp in milliseconds
  const timestamp = Date.now();

  // Generate random bytes for the remaining parts
  const randomBytesBuffer = randomBytes(10);

  // Convert timestamp to hex and pad to 12 characters (48 bits)
  const timestampHex = timestamp.toString(16).padStart(12, "0");

  // UUID v7 format:
  const timeLow = timestampHex.slice(0, 8);
  const timeMid = timestampHex.slice(8, 12);

  // time_high_and_version: first 4 bits of timestamp (from remaining) + version 7
  const timeHighAndVersion = "7" + timestampHex.slice(12, 15);

  // clock_seq_and_variant: set variant to 10xx (8, 9, a, or b)
  const clockSeqHigh = randomBytesBuffer[0];
  const variant = (clockSeqHigh & 0x3f) | 0x80; // Set bits 6-7 to 10
  const clockSeqLow = randomBytesBuffer[1];
  const clockSeq = ((variant << 8) | clockSeqLow).toString(16).padStart(4, "0");

  // node: 6 random bytes
  const node = Array.from(randomBytesBuffer.slice(2, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${timeLow}-${timeMid}-${timeHighAndVersion}-${clockSeq}-${node}`;
};

/**
 * Validates if a string is a valid UUID v7
 */
export const isValidUUIDv7 = (uuid: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};
