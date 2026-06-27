/**
 * Local data-pipeline script — parses the real WhatsApp exports from the
 * gitignored `data/raw/` directory and loads them into the linked Supabase
 * project through `supabase-axi db query`.
 *
 * This never runs in CI and never touches the repo: the raw files and the
 * generated SQL stay local. Run with:
 *
 *   SUPABASE_ACCESS_TOKEN="$(cat ~/.who-said-it-supabase-token)" \
 *     node scripts/load-chats.ts
 *
 * Requires `supabase-axi` on PATH and the directory linked to the project.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWhatsAppChat } from "../lib/parser/index.ts";
import type { ParsedChat } from "../lib/parser/types.ts";

const RAW_DIR = join(import.meta.dirname, "..", "data", "raw");

// Maps each raw export file to its human-readable chat name.
const SOURCES = [
  { file: "familia_en_thailande.txt", name: "Familia en Thailande" },
  { file: "familia_di_redbar.txt", name: "Familia di Redbar" },
  { file: "familia_di_patatas.txt", name: "Familia di Patatas" },
];

const BATCH = 200; // messages per INSERT call

function sql(literal: string): string {
  return `'${literal.replace(/'/g, "''")}'`;
}

function runQuery(statement: string): void {
  execFileSync("supabase-axi", ["db", "query", statement], {
    stdio: ["ignore", "ignore", "inherit"],
    env: process.env,
  });
}

function loadChat(chat: ParsedChat): void {
  console.log(
    `\n→ ${chat.name} (${chat.slug}): ${chat.participants.length} participants, ${chat.messages.length} messages`,
  );

  // Idempotent: drop the chat (cascades) and re-insert chat + participants.
  const participantValues = chat.participants
    .map((p) => `(${sql(p)})`)
    .join(",");
  runQuery(`
    delete from public.chats where slug = ${sql(chat.slug)};
    with c as (
      insert into public.chats (slug, name)
      values (${sql(chat.slug)}, ${sql(chat.name)})
      returning id
    )
    insert into public.participants (chat_id, display_name)
    select c.id, v.display_name
    from c, (values ${participantValues}) as v(display_name);
  `);

  // Insert messages in batches, resolving ids by slug + display_name.
  for (let i = 0; i < chat.messages.length; i += BATCH) {
    const slice = chat.messages.slice(i, i + BATCH);
    const rows = slice
      .map(
        (m) =>
          `(${sql(m.participant)}, ${sql(m.body)}, ${sql(
            m.sent_at.toISOString(),
          )}, ${m.seq})`,
      )
      .join(",");
    runQuery(`
      insert into public.messages (chat_id, participant_id, body, sent_at, seq)
      select ch.id, pa.id, v.body, v.sent_at::timestamptz, v.seq
      from (values ${rows}) as v(sender, body, sent_at, seq)
      join public.chats ch on ch.slug = ${sql(chat.slug)}
      join public.participants pa
        on pa.chat_id = ch.id and pa.display_name = v.sender;
    `);
    console.log(`   loaded ${Math.min(i + BATCH, chat.messages.length)}/${chat.messages.length}`);
  }
}

function main(): void {
  if (!process.env.SUPABASE_ACCESS_TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required (export it first).");
  }
  for (const src of SOURCES) {
    const path = join(RAW_DIR, src.file);
    if (!existsSync(path)) {
      console.warn(`! skipping ${src.file} — not found in data/raw/`);
      continue;
    }
    const raw = readFileSync(path, "utf8");
    const chat = parseWhatsAppChat(raw, { name: src.name });
    loadChat(chat);
  }
  console.log("\n✓ done");
}

main();
