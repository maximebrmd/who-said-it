import type {
  AnswerResult,
  GameMode,
  Message,
  PickNameRound,
  Round,
  YesNoRound,
} from "./types";

/** A random source returning a float in [0, 1). Injectable for deterministic tests. */
export type Rng = () => number;

export const MIN_BODY_LENGTH = 15;
export const MAX_BODY_LENGTH = 280;
export const MIN_LETTERS = 8;
export const PICK_NAME_CHOICES = 4;

const LETTER_RE = /\p{L}/gu;

/**
 * A message is playable if it is long enough to be guessable and not just an
 * emoji / single-token blip. Keeps rounds fair and readable on the 3D card.
 */
export function isPlayableMessage(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.length < MIN_BODY_LENGTH || trimmed.length > MAX_BODY_LENGTH) {
    return false;
  }
  const letters = trimmed.match(LETTER_RE);
  return (letters?.length ?? 0) >= MIN_LETTERS;
}

export function pickRandom<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function otherParticipants(author: string, participants: readonly string[]): string[] {
  return participants.filter((p) => p !== author);
}

/**
 * Yes/No round: ~50% of the time claim the true author, otherwise a random
 * different participant. Falls back to a true claim if no other names exist.
 */
export function buildYesNoRound(
  message: Message,
  participants: readonly string[],
  rng: Rng,
): YesNoRound {
  const others = otherParticipants(message.author, participants);
  const claimIsTrue = others.length === 0 || rng() < 0.5;
  const claim = claimIsTrue ? message.author : pickRandom(others, rng);
  return { mode: "yes-no", message, claim, claimIsTrue };
}

/**
 * Pick-the-name round: the true author plus up to PICK_NAME_CHOICES-1 random
 * distinct others (or every participant when there are few), shuffled.
 */
export function buildPickNameRound(
  message: Message,
  participants: readonly string[],
  rng: Rng,
  maxChoices = PICK_NAME_CHOICES,
): PickNameRound {
  const others = shuffle(otherParticipants(message.author, participants), rng);
  const distractors = others.slice(0, Math.max(0, maxChoices - 1));
  const choices = shuffle([message.author, ...distractors], rng);
  return { mode: "pick-name", message, choices };
}

export function buildRound(
  mode: GameMode,
  message: Message,
  participants: readonly string[],
  rng: Rng,
): Round {
  return mode === "yes-no"
    ? buildYesNoRound(message, participants, rng)
    : buildPickNameRound(message, participants, rng);
}

/** Grade a Yes/No answer. `answeredYes` = player claims the name is the author. */
export function gradeYesNo(round: YesNoRound, answeredYes: boolean): AnswerResult {
  return {
    correct: answeredYes === round.claimIsTrue,
    author: round.message.author,
  };
}

/** Grade a Pick-the-name answer against the chosen name. */
export function gradePickName(
  round: PickNameRound,
  pickedName: string,
): AnswerResult {
  return {
    correct: pickedName === round.message.author,
    author: round.message.author,
  };
}
