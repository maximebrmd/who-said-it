/** Domain types for the who-said-it game (decoupled from the DB row shapes). */

export interface Chat {
  slug: string;
  name: string;
}

export interface Message {
  id: string;
  body: string;
  /** Display name of the true author. */
  author: string;
}

/** The two answer mechanics, chosen on the start screen. */
export type GameMode = "yes-no" | "pick-name";

/** A round shares the same message+author logic; the mode shapes the answer UI. */
export interface YesNoRound {
  mode: "yes-no";
  message: Message;
  /** The name shown as the claimed author. */
  claim: string;
  /** Whether the claim is the true author. */
  claimIsTrue: boolean;
}

export interface PickNameRound {
  mode: "pick-name";
  message: Message;
  /** Candidate names to choose from (includes the true author), shuffled. */
  choices: string[];
}

export type Round = YesNoRound | PickNameRound;

/** Result of grading a player's answer for any mode. */
export interface AnswerResult {
  correct: boolean;
  /** The true author, for the reveal. */
  author: string;
}
