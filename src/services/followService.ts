import type { SupabaseClientType } from "../supabaseClient";
import type { FollowEdge, GuestUser } from "../models";
import { HttpError } from "../errors";
import { UserService } from "./userService";
import { UserMetricsService } from "./userMetricsService";
import { GuestService } from "./guestService";

type ListFollowersOptions = {
	limit: number;
	cursor: string | null;
};

export class FollowService {
	private readonly metricsService: UserMetricsService;
	private readonly guestService: GuestService;

	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly userService: UserService,
		private readonly env: Env,
	) {
		this.metricsService = new UserMetricsService(supabase);
		this.guestService = new GuestService(supabase, env);
	}

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

		await this.metricsService.followWithCounts(follower.username, targetUsername);
	}

	async unfollowUser(
		sessionToken: string,
		targetUsername: string,
	): Promise<void> {
		const follower = await this.userService.getUserBySessionToken(sessionToken);

		if (follower.username === targetUsername) {
			throw new HttpError("Users cannot unfollow themselves", 400);
		}

		await this.metricsService.unfollowWithCounts(
			follower.username,
			targetUsername,
		);
	}

	async listFollowers(
		sessionToken: string,
		options: ListFollowersOptions,
		targetUsername?: string | null,
	): Promise<{ followers: FollowEdge[]; nextCursor: string | null }> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		if (targetUsername && targetUsername !== username) {
			throw new HttpError("Users may only list their own followers", 403);
		}

		let query = this.supabase
			.from("follows")
			.select("follower_username,followed_at")
			.eq("followee_username", username)
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

		const guestProfiles = await this.guestService.fetchGuests(
			followerUsernames,
			username,
		);

		const followers: FollowEdge[] = followersSlice.map((row) => ({
			user:
				guestProfiles.get(row.follower_username) ??
				this.buildFallbackGuest(row.follower_username),
			followed_at: row.followed_at,
		}));

		const nextCursor =
			hasMore && followersSlice.length > 0
				? followersSlice[followersSlice.length - 1].followed_at
				: null;

		return { followers, nextCursor };
	}

	async listFollowing(
		sessionToken: string,
		options: ListFollowersOptions,
		targetUsername?: string | null,
	): Promise<{ following: FollowEdge[]; nextCursor: string | null }> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		if (targetUsername && targetUsername !== username) {
			throw new HttpError("Users may only list their own following", 403);
		}

		let query = this.supabase
			.from("follows")
			.select("followee_username,followed_at")
			.eq("follower_username", username)
			.order("followed_at", { ascending: false });

		if (options.cursor) {
			query = query.lt("followed_at", options.cursor);
		}

		const { data, error } = await query.limit(options.limit + 1);

		if (error || !data) {
			throw new HttpError("Failed to list following", 500);
		}

		const hasMore = data.length > options.limit;
		const followingSlice = hasMore ? data.slice(0, options.limit) : data;
		const followeeUsernames = followingSlice.map(
			(row) => row.followee_username as string,
		);

		const guestProfiles = await this.guestService.fetchGuests(
			followeeUsernames,
			username,
		);

		const following: FollowEdge[] = followingSlice.map((row) => ({
			user:
				guestProfiles.get(row.followee_username) ??
				this.buildFallbackGuest(row.followee_username),
			followed_at: row.followed_at,
		}));

		const nextCursor =
			hasMore && followingSlice.length > 0
				? followingSlice[followingSlice.length - 1].followed_at
				: null;

		return { following, nextCursor };
	}

	private buildFallbackGuest(username: string): GuestUser {
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
}


