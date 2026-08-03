/**
 * Tests for click tracking abuse protection.
 * Validates the in-memory deduplication logic in isolation.
 */

// Replicate the deduplication logic from click/route.ts for isolated testing
const MAX_ENTRIES = 50_000;
const seen = new Map<string, true>();

function alreadySeen(key: string): boolean {
  if (seen.has(key)) return true;
  if (seen.size >= MAX_ENTRIES) {
    const firstKey = seen.keys().next().value;
    if (firstKey !== undefined) seen.delete(firstKey);
  }
  seen.set(key, true);
  return false;
}

beforeEach(() => seen.clear());

describe('click deduplication', () => {
  test('first call for a key returns false (not seen)', () => {
    expect(alreadySeen('campaign1:192.168.1.1')).toBe(false);
  });

  test('second call for same key returns true (duplicate)', () => {
    alreadySeen('campaign1:192.168.1.1');
    expect(alreadySeen('campaign1:192.168.1.1')).toBe(true);
  });

  test('different IPs for same campaign are tracked independently', () => {
    expect(alreadySeen('campaign1:1.1.1.1')).toBe(false);
    expect(alreadySeen('campaign1:2.2.2.2')).toBe(false);
    expect(alreadySeen('campaign1:1.1.1.1')).toBe(true);
    expect(alreadySeen('campaign1:2.2.2.2')).toBe(true);
  });

  test('same IP for different campaigns is tracked independently', () => {
    expect(alreadySeen('campaign1:1.1.1.1')).toBe(false);
    expect(alreadySeen('campaign2:1.1.1.1')).toBe(false);
    expect(alreadySeen('campaign1:1.1.1.1')).toBe(true);
    expect(alreadySeen('campaign2:1.1.1.1')).toBe(true);
  });

  test('eviction occurs when MAX_ENTRIES is reached', () => {
    // Fill to MAX_ENTRIES - 1 with dummy keys
    for (let i = 0; i < MAX_ENTRIES - 1; i++) {
      seen.set(`dummy:${i}`, true);
    }
    // The first unique key should not be seen
    expect(alreadySeen('trigger:eviction')).toBe(false);
    expect(seen.size).toBe(MAX_ENTRIES);
    // Add one more to trigger eviction of 'dummy:0'
    expect(alreadySeen('another:key')).toBe(false);
    expect(seen.has('dummy:0')).toBe(false); // evicted
    expect(seen.size).toBe(MAX_ENTRIES);
  });
});
