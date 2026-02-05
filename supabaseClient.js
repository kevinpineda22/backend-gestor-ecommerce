import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_KEY?.trim();

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL no está definida");
}

if (!SUPABASE_KEY) {
  throw new Error("SUPABASE_KEY no está definida");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: false,
    },
  }
);

export default supabase;
