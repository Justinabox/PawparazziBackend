import { jsonResponse } from "../responses";
import { getSupabaseClient } from "../supabaseClient";

export async function handleCatsRequest(env: Env): Promise<Response> {
	const supabase = getSupabaseClient(env);

	const { data, error } = await supabase.from("cats").select("*");

	if (error) {
		return jsonResponse(
			{
				success: false,
				error: error.message,
			},
			500,
		);
	}

	return jsonResponse(
		{
			success: true,
			error: "",
			cats: data ?? [],
		},
		200,
	);
}


