import { getSupabase } from "../supabase/client";
import { SAMPLE_CHATS } from "./sample-data";
import { isPlayableMessage } from "./round";
import type { Chat, Message } from "./types";

export interface ChatData {
  participants: string[];
  /** A shuffled batch of playable messages to draw rounds from. */
  messages: Message[];
}

const BATCH_SIZE = 120;

/** List the available chats (real project, or the synthetic samples). */
export async function getChats(): Promise<Chat[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return SAMPLE_CHATS.map(({ slug, name }) => ({ slug, name }));
  }
  const { data, error } = await supabase
    .from("chats")
    .select("slug, name")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

interface MessageRow {
  id: string;
  body: string;
  author: { display_name: string } | { display_name: string }[] | null;
}

function authorName(row: MessageRow): string {
  const a = row.author;
  if (!a) return "Unknown";
  return Array.isArray(a) ? (a[0]?.display_name ?? "Unknown") : a.display_name;
}

/**
 * Fetch a chat's participants and a pseudo-random batch of playable messages.
 * Sampling uses the indexed `rand_key`: pick a random cursor and read forward,
 * wrapping to the start if the tail is short.
 */
export async function getChatData(slug: string): Promise<ChatData> {
  const supabase = getSupabase();
  if (!supabase) {
    const chat = SAMPLE_CHATS.find((c) => c.slug === slug) ?? SAMPLE_CHATS[0];
    return {
      participants: chat.participants,
      messages: chat.messages.filter((m) => isPlayableMessage(m.body)),
    };
  }

  const { data: chat, error: chatErr } = await supabase
    .from("chats")
    .select("id")
    .eq("slug", slug)
    .single();
  if (chatErr) throw chatErr;

  const [{ data: parts, error: pErr }, messages] = await Promise.all([
    supabase.from("participants").select("display_name").eq("chat_id", chat.id),
    fetchMessageBatch(supabase, chat.id),
  ]);
  if (pErr) throw pErr;

  return {
    participants: (parts ?? []).map((p) => p.display_name),
    messages,
  };
}

type Supabase = NonNullable<ReturnType<typeof getSupabase>>;

async function fetchMessageBatch(
  supabase: Supabase,
  chatId: string,
): Promise<Message[]> {
  const cursor = Math.random();
  const select = "id, body, author:participants!inner(display_name)";

  const forward = await supabase
    .from("messages")
    .select(select)
    .eq("chat_id", chatId)
    .gte("rand_key", cursor)
    .order("rand_key")
    .limit(BATCH_SIZE);
  if (forward.error) throw forward.error;

  let rows = (forward.data ?? []) as MessageRow[];
  if (rows.length < BATCH_SIZE) {
    const wrap = await supabase
      .from("messages")
      .select(select)
      .eq("chat_id", chatId)
      .lt("rand_key", cursor)
      .order("rand_key")
      .limit(BATCH_SIZE - rows.length);
    if (wrap.error) throw wrap.error;
    rows = rows.concat((wrap.data ?? []) as MessageRow[]);
  }

  return rows
    .map((r) => ({ id: r.id, body: r.body, author: authorName(r) }))
    .filter((m) => isPlayableMessage(m.body));
}
