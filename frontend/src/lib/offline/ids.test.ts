import { describe, expect, it, vi } from "vitest";
import { newId } from "./ids";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function getRandomValues<T extends ArrayBufferView | null>(array: T): T {
  return globalThis.crypto.getRandomValues(array as unknown as Uint8Array) as unknown as T;
}

describe("newId", () => {
  it("uses crypto.randomUUID when there is one", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555" as const);

    expect(newId({ randomUUID, getRandomValues })).toBe("11111111-2222-4333-8444-555555555555");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("falls back to getRandomValues outside a secure context (no randomUUID)", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId({ getRandomValues })));

    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it("falls back when randomUUID throws", () => {
    const randomUUID = vi.fn(() => {
      throw new Error("Not allowed");
    }) as unknown as Crypto["randomUUID"];

    expect(newId({ randomUUID, getRandomValues })).toMatch(UUID_V4);
  });

  it("sets the version and variant bits whatever the random bytes are", () => {
    const allOnes = <T extends ArrayBufferView | null>(array: T): T => {
      (array as Uint8Array).fill(0xff);
      return array;
    };

    expect(newId({ getRandomValues: allOnes })).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("refuses to make an id with no secure random source", () => {
    expect(() => newId({})).toThrow("No secure random source");
  });

  it("uses the page's crypto by default", () => {
    expect(newId()).toMatch(UUID_V4);
  });
});
