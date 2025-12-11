import type { GuestUser } from "../models";
import type { SupabaseClientType } from "../supabaseClient";
import { buildOptionalPublicR2Url } from "../r2";
import { HttpError } from "../errors";

export class GuestService {
	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly env: Env,
	) {}

	async fetchGuests(
		usernames: string[],
		sessionUsername: string | null,
	): Promise<Map<string, GuestUser>> {
		const guestMap = new Map<string, GuestUser>();

		if (!usernames.length) {
			return guestMap;
		}

		const { data, error } = await this.supabase
			.from("users")
			.select(
				"username,bio,location,r2_avatar,post_count,follower_count,following_count",
			)
			.in("username", usernames);

		if (error || !data) {
			throw new HttpError("Failed to load user profiles", 500);
		}

		const followedSet =
			sessionUsername && usernames.length
				? await this.fetchFollowedUsernames(sessionUsername, usernames)
				: new Set<string>();

		for (const row of data) {
			guestMap.set(row.username, {
				username: row.username,
				bio: row.bio ?? null,
				location: row.location ?? null,
				avatar_url: buildOptionalPublicR2Url(row.r2_avatar ?? null, this.env),
				post_count: Number(row.post_count ?? 0),
				follower_count: Number(row.follower_count ?? 0),
				following_count: Number(row.following_count ?? 0),
				is_followed: sessionUsername
					? followedSet.has(row.username)
					: null,
			});
		}

		return guestMap;
	}

	private async fetchFollowedUsernames(
		sessionUsername: string,
		targetUsernames: string[],
	): Promise<Set<string>> {
		const { data, error } = await this.supabase
			.from("follows")
			.select("followee_username")
			.eq("follower_username", sessionUsername)
			.in("followee_username", targetUsernames);

		if (error) {
			throw new HttpError("Failed to load follow relationships", 500);
		}

		return new Set((data ?? []).map((row) => row.followee_username as string));
	}
}
