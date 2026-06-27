import type { ParsedChat, ParsedMessage } from "./types";

/**
 * Parser for WhatsApp "Export Chat" .txt files.
 *
 * Line format: `[D.M.YYYY, HH.MM.SS] Sender Name: message`
 * A message continues across lines until the next line that starts with a
 * `[timestamp]`. System/notification lines (encryption notice, "X added Y",
 * etc.) carry no `Sender: ` structure, so they are recognised as non-messages
 * and dropped while still terminating the previous message.
 *
 * Sender display names are normalised to a clean, recognisable first name
 * (see `cleanFirstName`); within a chat, clashes are disambiguated minimally.
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

// Attached-media markers, anywhere in a message (a caption may sit next to one,
// e.g. "Is this anyone's? image omitted"). We strip the marker, then keep the
// caption only if substantial guessable text remains.
const MEDIA_MARKER_SRC =
  "<\\s*Media\\s+omitted\\s*>|\\b(?:image|photo|video|audio|sticker|gif|document|contact card|media)\\s+omitted\\b";
const MEDIA_DETECT_RE = new RegExp(MEDIA_MARKER_SRC, "i");
const MEDIA_STRIP_RE = new RegExp(MEDIA_MARKER_SRC, "gi");
const MEDIA_CAPTION_MIN_LETTERS = 8;

// Trailing inline marker WhatsApp adds to edited messages.
const EDITED_MARKER_RE = /<this message was edited>\s*$/i;

// Sender-side guard: words that signal a system line even if a stray colon
// snuck into the entry text.
const SYSTEM_SENDER_RE =
  /\b(changed|added|removed|left|joined|created|deleted|encrypted|pinned)\b/i;

// Any link or shared location makes a message un-guessable, so messages that
// contain one (even incidentally) are dropped entirely. Covers protocols, www,
// bare domains with a path, common web TLDs, map/short-link hosts, and the
// various location-share forms (geo: coords, "Location:", 📍 pins).
const LINK_RES: RegExp[] = [
  /\bhttps?:\/\//i,
  /\bwww\.[a-z0-9-]/i,
  /\b(?:maps\.google|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl|g\.co|maps\.apple\.com|osm\.org|openstreetmap\.org)\b/i,
  // dotted host whose last label before a path is alphabetic, e.g. foo.com/bar
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/\S*/i,
  // bare domain on a common web TLD, e.g. example.com
  /\b[a-z0-9-]+\.(?:com|net|org|io|app|dev|me|tv|info|xyz|gl|ly|gg|page)\b/i,
  /\bgeo:-?\d/i,
  /\blocation:/i,
  /📍/u,
  /\bshared (?:a )?(?:live )?location\b/i,
];

/** True if the message contains any URL/link or a shared location. */
export function containsLink(body: string): boolean {
  return LINK_RES.some((re) => re.test(body));
}

const LATIN_LETTER_RE = /\p{L}/gu;

function stripInvisibles(text: string): string {
  // Drop the @-mention isolates but keep the readable name (the isolate chars
  // themselves are removed by INVISIBLE_RE, leaving `@Name`).
  return text.replace(INVISIBLE_RE, "");
}

function cleanBody(raw: string): string {
  return raw.replace(EDITED_MARKER_RE, "").trim();
}

function countLetters(text: string): number {
  return text.match(LATIN_LETTER_RE)?.length ?? 0;
}

/** Remove attached-media markers and tidy the leftover whitespace. */
export function stripMediaMarkers(body: string): string {
  return body
    .replace(MEDIA_STRIP_RE, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
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

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

interface NameParts {
  /** Title-cased first name, e.g. "Nico", "Kanitta", "Lucía". */
  first: string;
  /** Initial of a Latin last name, if any, e.g. "R" for "Tom Rozand". */
  lastInitial: string | null;
  /** A parenthetical qualifier, title-cased, e.g. "Average". */
  tag: string | null;
}

/** Decompose a messy display name into a clean first name + disambiguators. */
export function parseName(raw: string): NameParts {
  const stripped = stripInvisibles(raw).replace(/^~\s*/, "");

  // Pull out the first parenthetical qualifier before discarding the brackets.
  const parenMatch = stripped.match(/\(([^)]*)\)/);
  const tagWord = parenMatch
    ? toLatinTokens(parenMatch[1])[0] ?? null
    : null;

  const tokens = toLatinTokens(stripped.replace(/\([^)]*\)/g, " "));
  return {
    first: tokens[0] ? titleCase(tokens[0]) : "Someone",
    lastInitial: tokens[1] ? tokens[1].charAt(0).toUpperCase() : null,
    tag: tagWord ? titleCase(tagWord) : null,
  };
}

/** Latin-script word tokens only — drops emoji, symbols and non-Latin scripts. */
function toLatinTokens(text: string): string[] {
  return text
    .replace(/[^\p{Script=Latin}\s'’.-]/gu, " ")
    .split(/[\s.]+/)
    .map((t) => t.replace(/^['’-]+|['’-]+$/g, ""))
    .filter(Boolean);
}

/** Clean a single display name to its title-cased first name (no disambiguation). */
export function cleanFirstName(raw: string): string {
  return parseName(raw).first;
}

/**
 * Build a raw-name -> clean-name map for a chat, processing names in the given
 * order. Clashes on the same first name are disambiguated minimally: a last
 * initial, then a parenthetical tag, then a numeric suffix.
 */
function buildNameMap(rawNames: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();

  for (const raw of rawNames) {
    const { first, lastInitial, tag } = parseName(raw);
    let name = first;
    if (used.has(name)) {
      const candidates = [
        lastInitial && `${first} ${lastInitial}.`,
        tag && `${first} (${tag})`,
      ].filter(Boolean) as string[];
      name = candidates.find((c) => !used.has(c)) ?? "";
      if (!name) {
        let n = 2;
        while (used.has(`${first} ${n}`)) n++;
        name = `${first} ${n}`;
      }
    }
    used.add(name);
    map.set(raw, name);
  }
  return map;
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

interface RawMessage {
  sender: string;
  body: string;
  sent_at: Date;
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

  const collected: RawMessage[] = [];
  const rawOrder: string[] = [];
  const seenRaw = new Set<string>();

  let pending: PendingMessage | null = null;

  const flush = () => {
    if (!pending) return;
    let body = cleanBody(pending.bodyLines.join("\n"));
    if (MEDIA_DETECT_RE.test(body)) {
      // Strip the attachment marker; drop the message unless a substantial,
      // guessable caption remains.
      body = stripMediaMarkers(body);
      if (countLetters(body) < MEDIA_CAPTION_MIN_LETTERS) {
        pending = null;
        return;
      }
    }
    if (body && !containsLink(body)) {
      if (!seenRaw.has(pending.sender)) {
        seenRaw.add(pending.sender);
        rawOrder.push(pending.sender);
      }
      collected.push({ sender: pending.sender, body, sent_at: pending.sent_at });
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

    const sender = message[1].trim();
    if (!sender || SYSTEM_SENDER_RE.test(sender)) continue;

    pending = {
      sender,
      bodyLines: [message[2]],
      sent_at: parseTimestamp(d, m, y, hh, mm, ss),
    };
  }
  flush();

  // Resolve messy raw sender names to clean, disambiguated display names.
  const nameMap = buildNameMap(rawOrder);
  const messages: ParsedMessage[] = collected.map((m, i) => ({
    participant: nameMap.get(m.sender)!,
    body: m.body,
    sent_at: m.sent_at,
    seq: i,
  }));

  return {
    slug: meta.slug ?? slugify(meta.name),
    name: meta.name,
    participants: rawOrder.map((r) => nameMap.get(r)!),
    messages,
  };
}

export type { ParsedChat, ParsedMessage };
