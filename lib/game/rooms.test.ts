import { describe, expect, it } from "vitest";
import { buildRoundsPayload } from "./rooms";
import type { ChatData } from "./data";

/** Deterministic Rng: cycles through a fixed sequence so tests are stable. */
function seededRng(seq: number[]): () => number {
  let i = 0;
  return () => seq[i++ % seq.length];
}

const data: ChatData = {
  participants: ["Alice", "Bob", "Carol", "Dave"],
  messages: [
    { id: "m1", body: "first playable message body", author: "Alice" },
    { id: "m2", body: "second playable message body", author: "Bob" },
    { id: "m3", body: "third playable message body", author: "Carol" },
  ],
};

describe("buildRoundsPayload", () => {
  it("yes-no rounds carry the author, claim, and claim_is_true (no choices)", () => {
    const rounds = buildRoundsPayload("yes-no", data, 3, seededRng([0.1, 0.9, 0.3, 0.7]));
    expect(rounds).toHaveLength(3);
    for (const r of rounds) {
      expect(typeof r.message_id).toBe("string");
      expect(typeof r.body).toBe("string");
      expect(typeof r.author).toBe("string");
      expect(typeof r.claim).toBe("string");
      expect(typeof r.claim_is_true).toBe("boolean");
      expect(r.choices).toBeUndefined();
    }
  });

  it("a true claim names the real author; a false claim names someone else", () => {
    const rounds = buildRoundsPayload("yes-no", data, 3, seededRng([0.1, 0.9, 0.3, 0.7]));
    for (const r of rounds) {
      if (r.claim_is_true) expect(r.claim).toBe(r.author);
      else expect(r.claim).not.toBe(r.author);
    }
  });

  it("pick-name rounds include the author among shuffled choices (no claim)", () => {
    const rounds = buildRoundsPayload("pick-name", data, 3, seededRng([0.2, 0.5, 0.8, 0.4]));
    for (const r of rounds) {
      expect(r.choices).toBeDefined();
      expect(r.choices).toContain(r.author);
      expect(new Set(r.choices).size).toBe(r.choices!.length); // distinct
      expect(r.claim).toBeUndefined();
      expect(r.claim_is_true).toBeUndefined();
    }
  });

  it("caps the number of rounds at the number of available messages", () => {
    const rounds = buildRoundsPayload("pick-name", data, 10, seededRng([0.3]));
    expect(rounds).toHaveLength(3);
  });

  it("always produces at least one round even if count is 0", () => {
    const rounds = buildRoundsPayload("yes-no", data, 0, seededRng([0.3]));
    expect(rounds.length).toBeGreaterThanOrEqual(1);
  });

  it("is deterministic for a given Rng sequence", () => {
    const a = buildRoundsPayload("pick-name", data, 3, seededRng([0.2, 0.5, 0.8, 0.4]));
    const b = buildRoundsPayload("pick-name", data, 3, seededRng([0.2, 0.5, 0.8, 0.4]));
    expect(a).toEqual(b);
  });
});
