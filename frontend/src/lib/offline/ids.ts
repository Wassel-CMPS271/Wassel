// Random ids for the offline queue: an item's local id, its clientRequestId (the
// idempotency key the server dedups on, docs/contracts/driver-gps-offline.md) and a
// tab's id for the storage lease. crypto.randomUUID only exists in a secure context
// (HTTPS or localhost), so a page served over plain HTTP falls back to
// crypto.getRandomValues, which every browser has everywhere. There is no Math.random
// fallback: a key that can collide would let the server merge two different taps.

type RandomSource = Partial<Pick<Crypto, "randomUUID" | "getRandomValues">>;

export function newId(source: RandomSource | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === "function") {
    try {
      return source.randomUUID();
    } catch {
      // Fall through to getRandomValues.
    }
  }
  if (typeof source?.getRandomValues === "function") {
    return uuidFromBytes(source.getRandomValues(new Uint8Array(16)));
  }
  throw new Error("No secure random source to make an id");
}

// RFC 4122 version 4: set the version and variant bits, then format as 8-4-4-4-12 hex.
function uuidFromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
