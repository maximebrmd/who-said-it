import type { ParsedChat, ParsedMessage } from "./types";

/**
 * Parser for WhatsApp "Export Chat" .txt files.
 *
 * Line format: `[D.M.YYYY, HH.MM.SS] Sender Name: message`
 * A message continues across lines until the next line that starts with a
 * `[timestamp]`. System/notification lines (encryption notice, "X added Y",
 * etc.) carry no `Sender: ` structure, so they are recognised as non-messages
 * and dropped while still terminating the previous message.
 */

// Header: a line that begins with a `[D.M.YYYY, HH.MM.SS]` stamp.
// Captures the timestamp parts and the remaining entry text.
const HEADER_RE =
  /^\[(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2})\.(\d{2})\.(\d{2})\]\s?([\s\S]*)$/;

// Within an entry, a real message looks like `Sender Name: body`.
// The timestamp uses dots, so the first colon separates sender from body.
const MESSAGE_RE = /^([^:]{1,50}):\s?([\s\S]*)$/;

// Invisible / direction-control characters WhatsApp sprinkles into exports.
// U+200B (ZWSP), U+200E/200F (LRM/RLM), U+202A–202E (embeddings),
// U+2066–2069 (isolates), U+FEFF (BOM).
const INVISIBLE_RE =
  /[​‎‏‪-‮⁦-⁩﻿]/g;

// Media placeholders that make up an entire message body.
const MEDIA_RE =
  /^<?\s*(image|video|audio|sticker|GIF|document|Contact card|Media)( card)?\s+omitted\s*>?$/i;

// Trailing inline marker WhatsApp adds to edited messages.
const EDITED_MARKER_RE = /<this message was edited>\s*$/i;

// Sender-side guard: words that signal a system line even if a stray colon
// snuck into the entry text.
const SYSTEM_SENDER_RE =
  /\b(changed|added|removed|left|joined|created|deleted|encrypted|pinned)\b/i;

function stripInvisibles(text: string): string {
  // Drop the @-mention isolates but keep the readable name (the isolate chars
  // themselves are removed by INVISIBLE_RE, leaving `@Name`).
  return text.replace(INVISIBLE_RE, "");
}

function normalizeSender(raw: string): string {
  // Non-contact senders are prefixed with `~ `; drop it.
  return raw.replace(/^~\s*/, "").trim();
}

function cleanBody(raw: string): string {
  return raw.replace(EDITED_MARKER_RE, "").trim();
}

function isMediaOnly(body: string): boolean {
  return MEDIA_RE.test(body.trim());
}

interface PendingMessage {
  sender: string;
  bodyLines: string[];
  sent_at: Date;
}

function parseTimestamp(
  d: string,
  m: string,
  y: string,
  hh: string,
  mm: string,
  ss: string,
): Date {
  // Build in UTC so parsing is deterministic regardless of the host timezone.
  return new Date(
    Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss),
    ),
  );
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "chat"
  );
}

/**
 * Parse a raw WhatsApp export into a clean, ordered chat structure.
 *
 * @param raw  Full file contents.
 * @param meta Chat name (and optional slug) to attach to the result.
 */
export function parseWhatsAppChat(
  raw: string,
  meta: { name: string; slug?: string },
): ParsedChat {
  const text = raw.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");

  const messages: ParsedMessage[] = [];
  const participantOrder: string[] = [];
  const seenParticipants = new Set<string>();

  let pending: PendingMessage | null = null;

  const flush = () => {
    if (!pending) return;
    const body = cleanBody(pending.bodyLines.join("\n"));
    if (body && !isMediaOnly(body)) {
      if (!seenParticipants.has(pending.sender)) {
        seenParticipants.add(pending.sender);
        participantOrder.push(pending.sender);
      }
      messages.push({
        participant: pending.sender,
        body,
        sent_at: pending.sent_at,
        seq: messages.length,
      });
    }
    pending = null;
  };

  for (const rawLine of lines) {
    const line = stripInvisibles(rawLine);
    const header = HEADER_RE.exec(line);

    if (!header) {
      // Continuation of the current message (multi-line body).
      if (pending) pending.bodyLines.push(rawLine.replace(INVISIBLE_RE, ""));
      continue;
    }

    // New entry begins: finalise whatever came before.
    flush();

    const [, d, m, y, hh, mm, ss, entry] = header;
    const message = MESSAGE_RE.exec(entry);
    if (!message) continue; // system/notification line — no sender.

    const sender = normalizeSender(message[1]);
    if (!sender || SYSTEM_SENDER_RE.test(message[1])) continue;

    pending = {
      sender,
      bodyLines: [message[2]],
      sent_at: parseTimestamp(d, m, y, hh, mm, ss),
    };
  }
  flush();

  return {
    slug: meta.slug ?? slugify(meta.name),
    name: meta.name,
    participants: participantOrder,
    messages,
  };
}

export type { ParsedChat, ParsedMessage };
