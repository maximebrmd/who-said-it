/** Shared types for the WhatsApp export parser. */

export interface ParsedMessage {
  /** Display name of the sender (normalized). */
  participant: string;
  /** Clean message body (media placeholders, control chars, mentions stripped). */
  body: string;
  /** Parsed timestamp. */
  sent_at: Date;
  /** 0-based position of the message within the chat, in chronological order. */
  seq: number;
}

export interface ParsedChat {
  /** URL-safe identifier derived from the chat name. */
  slug: string;
  /** Human-readable chat name. */
  name: string;
  /** Distinct participant display names, in order of first appearance. */
  participants: string[];
  /** Clean, ordered messages. */
  messages: ParsedMessage[];
}
