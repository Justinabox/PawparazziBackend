import { HttpError } from "../errors";
import type { Cat, CatRecord, GuestUser } from "../models";
import { buildPublicR2Url } from "../r2";
import type { SupabaseClientType } from "../supabaseClient";
import { GuestService } from "./guestService";

export async function mapCatRecordsWithMetadata(
	rows: CatRecord[],
	env: Env,
	supabase: SupabaseClientType,
	sessionUsername: string | null,
): Promise<Cat[]> {
	if (!rows.length) {
		return [];
	}

	const uniqueUsernames = Array.from(new Set(rows.map((row) => row.username)));
	const guestService = new GuestService(supabase, env);
	const guestMap = await guestService.fetchGuests(uniqueUsernames, sessionUsername);
	const catIds = rows.map((row) => row.id);
	const likedIds =
		sessionUsername && catIds.length
			? await fetchUserLikedCatIds(supabase, sessionUsername, catIds)
			: new Set<string>();

	return rows.map((row) =>
		mapCatRecordToApi(row, env, {
			poster: guestMap.get(row.username) ?? buildFallbackGuest(row.username),
			userLiked: likedIds.has(row.id),
		}),
	);
}

export async function fetchUserLikedCatIds(
	supabase: SupabaseClientType,
	username: string,
	catIds: string[],
): Promise<Set<string>> {
	if (!catIds.length) {
		return new Set<string>();
	}

	const { data, error } = await supabase
		.from("likes")
		.select("cat_id")
		.eq("username", username)
		.in("cat_id", catIds);

	if (error) {
		throw new HttpError("Failed to fetch liked cats", 500);
	}

	const likedRows = (data ?? []) as { cat_id: string }[];

	return new Set(likedRows.map((row) => row.cat_id));
}

type CatRecordExtras = {
	poster: GuestUser;
	userLiked?: boolean;
};

export function mapCatRecordToApi(
	row: CatRecord,
	env: Env,
	extras: CatRecordExtras,
): Cat {
	return {
		id: row.id,
		name: row.name,
		tags: row.tags ?? [],
		created_at: row.created_at,
		description: row.description,
		location: {
			latitude: row.location_latitude,
			longitude: row.location_longitude,
		},
		image_url: buildPublicR2Url(row.r2_path, env),
		likes: row.likes ?? 0,
		poster: extras.poster,
		user_liked: extras.userLiked ?? false,
	};
}

export function buildFallbackGuest(username: string): GuestUser {
	return {
		username,
		bio: null,
		location: null,
		avatar_url: null,
		post_count: 0,
		follower_count: 0,
		following_count: 0,
		is_followed: null,
		collections: [],
		collections_next_cursor: null,
	};
}
