import type { SupabaseClientType } from "../supabaseClient";
import type { FollowerSummary } from "../models";
import { HttpError } from "../errors";
import { UserService } from "./userService";
import { buildOptionalPublicR2Url } from "../r2";

type ListFollowersOptions = {
	limit: number;
	cursor: string | null;
};

export class FollowService {
	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly userService: UserService,
		private readonly env: Env,
	) {}

	async followUser(sessionToken: string, targetUsername: string): Promise<void> {
		const follower = await this.userService.getUserBySessionToken(sessionToken);

		if (follower.username === targetUsername) {
			throw new HttpError("Users cannot follow themselves", 400);
		}

		const { data: targetExists, error: targetError } = await this.supabase
			.from("users")
			.select("username")
			.eq("username", targetUsername)
			.maybeSingle();

		if (targetError) {
			throw new HttpError("Failed to lookup target user", 500);
		}

		if (!targetExists) {
			throw new HttpError("Target user not found", 404);
		}

		const { error } = await this.supabase
			.from("follows")
			.upsert(
				{
					follower_username: follower.username,
					followee_username: targetUsername,
				},
				{
					onConflict: "follower_username,followee_username",
				},
			);

		if (error) {
			throw new HttpError("Failed to follow user", 500);
		}
	}

	async unfollowUser(
		sessionToken: string,
		targetUsername: string,
	): Promise<void> {
		const follower = await this.userService.getUserBySessionToken(sessionToken);

		if (follower.username === targetUsername) {
			throw new HttpError("Users cannot unfollow themselves", 400);
		}

		const { error } = await this.supabase
			.from("follows")
			.delete()
			.eq("follower_username", follower.username)
			.eq("followee_username", targetUsername);

		if (error) {
			throw new HttpError("Failed to unfollow user", 500);
		}
	}

	async listFollowers(
		targetUsername: string,
		options: ListFollowersOptions,
	): Promise<{ followers: FollowerSummary[]; nextCursor: string | null }> {
		const { data: targetExists, error: targetError } = await this.supabase
			.from("users")
			.select("username")
			.eq("username", targetUsername)
			.maybeSingle();

		if (targetError) {
			throw new HttpError("Failed to lookup user", 500);
		}

		if (!targetExists) {
			throw new HttpError("User not found", 404);
		}

		let query = this.supabase
			.from("follows")
			.select("follower_username,followed_at")
			.eq("followee_username", targetUsername)
			.order("followed_at", { ascending: false });

		if (options.cursor) {
			query = query.lt("followed_at", options.cursor);
		}

		const { data, error } = await query.limit(options.limit + 1);

		if (error || !data) {
			throw new HttpError("Failed to list followers", 500);
		}

		const hasMore = data.length > options.limit;
		const followersSlice = hasMore ? data.slice(0, options.limit) : data;

		const followerUsernames = followersSlice.map(
			(row) => row.follower_username,
		);

		const profileMap = new Map<
			string,
			{ bio: string | null; location: string | null; r2_avatar: string | null }
		>();

		if (followerUsernames.length > 0) {
			const { data: profiles, error: profileError } = await this.supabase
				.from("users")
				.select("username,bio,location,r2_avatar")
				.in("username", followerUsernames);

			if (profileError || !profiles) {
				throw new HttpError("Failed to load follower profiles", 500);
			}

			for (const profile of profiles) {
				profileMap.set(profile.username, {
					bio: profile.bio,
					location: profile.location,
					r2_avatar: profile.r2_avatar ?? null,
				});
			}
		}

		const followers: FollowerSummary[] = followersSlice.map((row) => {
			const profile = profileMap.get(row.follower_username);

			return {
				username: row.follower_username,
				bio: profile?.bio ?? null,
				location: profile?.location ?? null,
				avatar_url: buildOptionalPublicR2Url(
					profile?.r2_avatar ?? null,
					this.env,
				),
				followed_at: row.followed_at,
			};
		});

		const nextCursor =
			hasMore && followersSlice.length > 0
				? followersSlice[followersSlice.length - 1].followed_at
				: null;

		return { followers, nextCursor };
	}
}


