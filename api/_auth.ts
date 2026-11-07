// Felles tilgangssjekk for serverfunksjonene. Filer som starter med _ blir ikke egne endepunkter på Vercel.
import type { VercelRequest } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export type AuthResult = "ok" | "not_signed_in" | "not_member" | "server_config";

export async function checkMember(req: VercelRequest): Promise<AuthResult> {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return "not_signed_in";
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return "server_config";
  try {
    const sb = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData.user) return "not_signed_in";
    const { data, error } = await sb.rpc("is_member");
    return !error && data === true ? "ok" : "not_member";
  } catch (e) {
    console.error("auth check failed", e);
    return "server_config";
  }
}

export const AUTH_STATUS: Record<Exclude<AuthResult, "ok">, number> = {
  not_signed_in: 401,
  not_member: 403,
  server_config: 500,
};
