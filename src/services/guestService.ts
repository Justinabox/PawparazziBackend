import type { Collection, CollectionRow, GuestUser } from "../models";
import { CollectionService } from "./collectionService";
import { UserService } from "./userService";
import type { SupabaseClientType } from "../supabaseClient";
import { buildOptionalPublicR2Url } from "../r2";
import { HttpError } from "../errors";

export class GuestService {
	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly env: Env,
		private readonly collectionService = new CollectionService(
			supabase,
			new UserService(supabase, env),
		),
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
				collections: [],
				collections_next_cursor: null,
			});
		}

		await this.populateCollections(guestMap);

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

	private async populateCollections(
		guestMap: Map<string, GuestUser>,
	): Promise<void> {
		const entries = Array.from(guestMap.entries());
		for (const [username, guest] of entries) {
			const { rows, nextCursor } = await this.collectionService.listCollectionsForUser(
				username,
				{ limit: 10, cursor: null },
			);
			const ownerGuest = this.buildCollectionOwner(guest);
			const collections = rows.map((row) =>
				this.mapCollectionRowToApi(row, ownerGuest),
			);
			guest.collections = collections;
			guest.collections_next_cursor = nextCursor;
		}
	}

	private buildCollectionOwner(guest: GuestUser): GuestUser {
		return {
			...guest,
			collections: [],
			collections_next_cursor: null,
		};
	}

	private mapCollectionRowToApi(
		row: CollectionRow,
		owner: GuestUser,
	): Collection {
		return {
			id: row.id,
			owner,
			name: row.name,
			description: row.description,
			cat_count: Number(row.cat_count ?? 0),
			created_at: row.created_at,
		};
	}
}
