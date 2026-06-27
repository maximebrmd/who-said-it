import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Whether the app is wired to a real Supabase project. */
export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client (anon key, read-only via RLS). Returns null when no
 * Supabase env is configured so the app can fall back to the synthetic sample.
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;
  cached ??= createClient<Database>(url!, anonKey!);
  return cached;
}
