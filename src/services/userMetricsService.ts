import { HttpError } from "../errors";
import type { CatRecord } from "../models";
import type { SupabaseClientType } from "../supabaseClient";

const CREATE_CAT_FN = "create_cat_with_post_count";
const FOLLOW_FN = "follow_user_with_counts";
const UNFOLLOW_FN = "unfollow_user_with_counts";

type CreateCatWithCountParams = {
	id: string;
	name: string;
	tags: string[] | null;
	username: string;
	description: string | null;
	location_latitude: number | null;
	location_longitude: number | null;
	r2_path: string;
};

type FollowMetricsRow = {
	follower_following_count: number | string | null;
	followee_follower_count: number | string | null;
};

type FollowMetricsResult = {
	follower_following_count: number;
	followee_follower_count: number;
};

export class UserMetricsService {
	constructor(private readonly supabase: SupabaseClientType) {}

	async createCatWithPostCount(
		params: CreateCatWithCountParams,
	): Promise<CatRecord> {
		const { data, error } = await this.supabase.rpc(CREATE_CAT_FN, {
			p_id: params.id,
			p_name: params.name,
			p_tags: params.tags,
			p_username: params.username,
			p_description: params.description,
			p_location_latitude: params.location_latitude,
			p_location_longitude: params.location_longitude,
			p_r2_path: params.r2_path,
		});

		if (error) {
			throw new HttpError("Failed to create cat", 500);
		}

		const record = this.unwrapSingleRow<CatRecord>(data);
		return record;
	}

	async followWithCounts(
		followerUsername: string,
		followeeUsername: string,
	): Promise<FollowMetricsResult> {
		return this.executeFollowMutation(
			FOLLOW_FN,
			followerUsername,
			followeeUsername,
			"Failed to follow user",
		);
	}

	async unfollowWithCounts(
		followerUsername: string,
		followeeUsername: string,
	): Promise<FollowMetricsResult> {
		return this.executeFollowMutation(
			UNFOLLOW_FN,
			followerUsername,
			followeeUsername,
			"Failed to unfollow user",
		);
	}

	private async executeFollowMutation(
		functionName: typeof FOLLOW_FN | typeof UNFOLLOW_FN,
		followerUsername: string,
		followeeUsername: string,
		errorMessage: string,
	): Promise<FollowMetricsResult> {
		const { data, error } = await this.supabase.rpc(functionName, {
			p_follower_username: followerUsername,
			p_followee_username: followeeUsername,
		});

		if (error) {
			throw new HttpError(errorMessage, 500);
		}

		const counts = this.unwrapSingleRow<Partial<FollowMetricsRow>>(data);

		return {
			follower_following_count: Number(counts.follower_following_count ?? 0),
			followee_follower_count: Number(counts.followee_follower_count ?? 0),
		};
	}

	private unwrapSingleRow<T>(rowOrRows: T | T[] | null): T {
		const row = Array.isArray(rowOrRows) ? rowOrRows[0] : rowOrRows;

		if (!row) {
			throw new HttpError("Metrics operation returned no results", 500);
		}

		return row;
	}
}
