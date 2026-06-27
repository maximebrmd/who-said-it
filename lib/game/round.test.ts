import { describe, expect, it } from "vitest";
import {
  buildPickNameRound,
  buildYesNoRound,
  gradePickName,
  gradeYesNo,
  isPlayableMessage,
  shuffle,
} from "./round";
import type { Message } from "./types";

/** Deterministic RNG: cycles through a fixed list of [0,1) values. */
function seededRng(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

const msg: Message = { id: "1", body: "this is a real message", author: "Alice" };
const participants = ["Alice", "Bob", "Carol", "Dave", "Erin"];

describe("isPlayableMessage", () => {
  it("rejects ultra-short messages", () => {
    expect(isPlayableMessage("ok")).toBe(false);
    expect(isPlayableMessage("   ")).toBe(false);
  });

  it("rejects emoji-only / low-letter messages", () => {
    expect(isPlayableMessage("😂😂😂😂😂😂😂😂")).toBe(false);
    expect(isPlayableMessage("123456789012345")).toBe(false);
  });

  it("accepts a normal sentence", () => {
    expect(isPlayableMessage("Are we still meeting tomorrow?")).toBe(true);
  });

  it("rejects overly long messages", () => {
    expect(isPlayableMessage("a word ".repeat(60))).toBe(false);
  });
});

describe("buildYesNoRound", () => {
  it("claims the true author when rng < 0.5", () => {
    const round = buildYesNoRound(msg, participants, seededRng([0.1]));
    expect(round.claim).toBe("Alice");
    expect(round.claimIsTrue).toBe(true);
  });

  it("claims a different participant when rng >= 0.5", () => {
    // First value (>=0.5) picks the false branch; second indexes the others.
    const round = buildYesNoRound(msg, participants, seededRng([0.9, 0]));
    expect(round.claim).not.toBe("Alice");
    expect(round.claimIsTrue).toBe(false);
    expect(participants).toContain(round.claim);
  });

  it("always claims true when there is only one participant", () => {
    const round = buildYesNoRound(msg, ["Alice"], seededRng([0.99]));
    expect(round.claim).toBe("Alice");
    expect(round.claimIsTrue).toBe(true);
  });
});

describe("buildPickNameRound", () => {
  it("includes the true author and caps the number of choices", () => {
    const round = buildPickNameRound(msg, participants, seededRng([0.3, 0.6, 0.1, 0.8]));
    expect(round.choices).toContain("Alice");
    expect(round.choices).toHaveLength(4);
    expect(new Set(round.choices).size).toBe(round.choices.length); // no dupes
  });

  it("uses all participants when there are few", () => {
    const round = buildPickNameRound(msg, ["Alice", "Bob"], seededRng([0.2, 0.7]));
    expect(round.choices.sort()).toEqual(["Alice", "Bob"]);
  });
});

describe("grading", () => {
  it("grades Yes/No correctly", () => {
    const trueRound = buildYesNoRound(msg, participants, seededRng([0.1]));
    expect(gradeYesNo(trueRound, true).correct).toBe(true);
    expect(gradeYesNo(trueRound, false).correct).toBe(false);

    const falseRound = buildYesNoRound(msg, participants, seededRng([0.9, 0]));
    expect(gradeYesNo(falseRound, false).correct).toBe(true);
    expect(gradeYesNo(falseRound, true).correct).toBe(false);
  });

  it("grades Pick-the-name correctly and reveals the author", () => {
    const round = buildPickNameRound(msg, participants, seededRng([0.3, 0.6, 0.1, 0.8]));
    expect(gradePickName(round, "Alice")).toEqual({ correct: true, author: "Alice" });
    expect(gradePickName(round, "Bob").correct).toBe(false);
  });
});

describe("shuffle", () => {
  it("preserves all elements", () => {
    const result = shuffle([1, 2, 3, 4, 5], seededRng([0.5, 0.2, 0.9, 0.1]));
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
