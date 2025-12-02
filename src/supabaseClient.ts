import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type SupabaseClientType = SupabaseClient<any, "public", any>;

export function getSupabaseClient(env: Env): SupabaseClientType {
	const supabaseUrl = env.SUPABASE_URL;
	const supabaseKey = env.SUPABASE_SECRET;

	if (!supabaseUrl || !supabaseKey) {
		throw new Error("Supabase environment configuration is missing");
	}

	return createClient(supabaseUrl, supabaseKey, {
		global: { fetch },
		auth: {
			persistSession: false,
		},
	});
}


