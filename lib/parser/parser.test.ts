import { describe, expect, it } from "vitest";
import { cleanFirstName, isLinkDominated, parseWhatsAppChat, slugify } from "./index";

// All fixtures below are SYNTHETIC — made-up names and messages. No real chat
// content lives in the repo. \u escapes stand in for the invisible control
// characters WhatsApp embeds in real exports.
const LRM = "‎"; // LEFT-TO-RIGHT MARK
const ISO_START = "⁨"; // FIRST STRONG ISOLATE (@-mention wrapper open)
const ISO_END = "⁩"; // POP DIRECTIONAL ISOLATE (@-mention wrapper close)

function parse(raw: string) {
  return parseWhatsAppChat(raw, { name: "Test Chat" });
}

describe("parseWhatsAppChat", () => {
  it("parses a basic single message with timestamp and seq", () => {
    const chat = parse("[5.3.2025, 21.14.03] Alice: hello world");
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({
      participant: "Alice",
      body: "hello world",
      seq: 0,
    });
    expect(chat.messages[0].sent_at.toISOString()).toBe(
      "2025-03-05T21:14:03.000Z",
    );
  });

  it("groups multi-line messages until the next timestamp", () => {
    const raw = [
      "[1.1.2024, 09.00.00] Bob: line one",
      "line two",
      "line three",
      "[1.1.2024, 09.01.00] Bob: next message",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0].body).toBe("line one\nline two\nline three");
    expect(chat.messages[1].body).toBe("next message");
  });

  it("drops media placeholder messages", () => {
    const raw = [
      "[1.1.2024, 09.00.00] Alice: image omitted",
      "[1.1.2024, 09.00.01] Alice: video omitted",
      "[1.1.2024, 09.00.02] Alice: audio omitted",
      "[1.1.2024, 09.00.03] Alice: sticker omitted",
      "[1.1.2024, 09.00.04] Alice: GIF omitted",
      "[1.1.2024, 09.00.05] Alice: Contact card omitted",
      `[1.1.2024, 09.00.06] Alice: ${LRM}<Media omitted>`,
      "[1.1.2024, 09.00.07] Alice: a real message",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.messages.map((m) => m.body)).toEqual(["a real message"]);
  });

  it("drops system / notification lines", () => {
    const raw = [
      `[1.1.2024, 08.00.00] ${LRM}Messages and calls are end-to-end encrypted. Tap to learn more.`,
      `[1.1.2024, 08.00.01] ${LRM}Alice added Bob`,
      `[1.1.2024, 08.00.02] ${LRM}Bob left`,
      `[1.1.2024, 08.00.03] ${LRM}Alice changed the subject to "Trip"`,
      `[1.1.2024, 08.00.04] ${LRM}Alice changed this group's icon`,
      "[1.1.2024, 08.00.05] Alice: a real message",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0].body).toBe("a real message");
  });

  it("strips invisible control characters from sender and body", () => {
    const raw = `[1.1.2024, 09.00.00] Alice: hi${LRM} there`;
    const chat = parse(raw);
    expect(chat.messages[0].body).toBe("hi there");
  });

  it("normalizes a non-contact sender to a clean first name", () => {
    const raw = `[1.1.2024, 09.00.00] ${LRM}~ Tom Rozand: this is a real message`;
    const chat = parse(raw);
    expect(chat.messages[0].participant).toBe("Tom");
  });

  it("drops link-dominated messages but keeps incidental links", () => {
    const raw = [
      "[1.1.2024, 09.00.00] Alice: https://maps.app.goo.gl/abcdef123",
      "[1.1.2024, 09.00.01] Bob: www.youtube.com/watch?v=xyz",
      "[1.1.2024, 09.00.02] Carol: check this place out https://maps.app.goo.gl/xyz",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.messages.map((m) => m.body)).toEqual([
      "check this place out https://maps.app.goo.gl/xyz",
    ]);
  });

  it("unwraps @-mention isolates but keeps the name readable", () => {
    const raw = `[1.1.2024, 09.00.00] Alice: hey @${ISO_START}Bob Smith${ISO_END} ok?`;
    const chat = parse(raw);
    expect(chat.messages[0].body).toBe("hey @Bob Smith ok?");
  });

  it("drops empty / whitespace-only messages", () => {
    const raw = [
      "[1.1.2024, 09.00.00] Alice:   ",
      "[1.1.2024, 09.00.01] Alice: real",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.messages.map((m) => m.body)).toEqual(["real"]);
  });

  it("strips the trailing edited marker", () => {
    const raw =
      "[1.1.2024, 09.00.00] Alice: oops typo <This message was edited>";
    const chat = parse(raw);
    expect(chat.messages[0].body).toBe("oops typo");
  });

  it("collects participants de-duped in first-appearance order", () => {
    const raw = [
      "[1.1.2024, 09.00.00] Alice: hi",
      "[1.1.2024, 09.00.01] Bob: hey",
      "[1.1.2024, 09.00.02] Alice: again",
      "[1.1.2024, 09.00.03] Carol: hello",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.participants).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("assigns contiguous 0-based seq after dropping noise", () => {
    const raw = [
      "[1.1.2024, 09.00.00] Alice: one",
      "[1.1.2024, 09.00.01] Alice: image omitted",
      "[1.1.2024, 09.00.02] Bob: two",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.messages.map((m) => m.seq)).toEqual([0, 1]);
    expect(chat.messages.map((m) => m.body)).toEqual(["one", "two"]);
  });

  it("normalizes CRLF line endings", () => {
    const raw =
      "[1.1.2024, 09.00.00] Alice: a\r\nb\r\n[1.1.2024, 09.00.01] Bob: c\r\n";
    const chat = parse(raw);
    expect(chat.messages[0].body).toBe("a\nb");
    expect(chat.messages[1].body).toBe("c");
  });

  it("keeps colons inside the message body", () => {
    const chat = parse("[1.1.2024, 09.00.00] Alice: ratio is 3:1 today");
    expect(chat.messages[0].participant).toBe("Alice");
    expect(chat.messages[0].body).toBe("ratio is 3:1 today");
  });
});

describe("cleanFirstName", () => {
  it("collapses to a title-cased first name", () => {
    expect(cleanFirstName("Tom Rozand")).toBe("Tom");
    expect(cleanFirstName("Marina Goldoni")).toBe("Marina");
  });

  it("title-cases all-caps names", () => {
    expect(cleanFirstName("KANITTA")).toBe("Kanitta");
  });

  it("drops joke / qualifier suffixes", () => {
    expect(cleanFirstName("Nico Big Ass")).toBe("Nico");
    expect(cleanFirstName("Lucía Big Tits")).toBe("Lucía");
  });

  it("drops parenthetical tags and non-Latin / emoji decorations", () => {
    expect(cleanFirstName("Luca ก๊าบ ก๊าบ (Average)")).toBe("Luca");
    expect(cleanFirstName("Patatas in Tailandia 🇹🇭")).toBe("Patatas");
    expect(cleanFirstName("~ Peter 🎉")).toBe("Peter");
  });
});

describe("name disambiguation", () => {
  it("disambiguates two participants that share a first name", () => {
    const raw = [
      "[1.1.2024, 09.00.00] Luca: first luca speaking here",
      "[1.1.2024, 09.00.01] Luca (Average): second luca speaking here",
    ].join("\n");
    const chat = parse(raw);
    expect(chat.participants).toEqual(["Luca", "Luca (Average)"]);
    expect(chat.messages.map((m) => m.participant)).toEqual([
      "Luca",
      "Luca (Average)",
    ]);
  });
});

describe("isLinkDominated", () => {
  it("flags bare links and link-only messages", () => {
    expect(isLinkDominated("https://maps.app.goo.gl/abc")).toBe(true);
    expect(isLinkDominated("www.youtu.be/xyz")).toBe(true);
  });

  it("keeps messages with real text around a link", () => {
    expect(isLinkDominated("look at this https://example.com/page")).toBe(false);
    expect(isLinkDominated("no links here at all")).toBe(false);
  });
});

describe("slugify", () => {
  it("produces url-safe slugs", () => {
    expect(slugify("Familia en Thailande")).toBe("familia-en-thailande");
    expect(slugify("Familia di Redbar!")).toBe("familia-di-redbar");
  });
});
