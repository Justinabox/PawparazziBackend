import { HttpError } from "../errors";
import type { SupabaseClientType } from "../supabaseClient";
import { UserService } from "./userService";

export class CatLikeService {
	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly userService: UserService,
	) {}

	async likeCat(sessionToken: string, catId: string): Promise<number> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		await this.ensureCatExists(catId);

		const { error } = await this.supabase.from("likes").upsert(
			{
				cat_id: catId,
				username,
			},
			{
				onConflict: "cat_id,username",
			},
		);

		if (error) {
			throw new HttpError("Failed to like cat", 500);
		}

		return this.refreshCatLikeCount(catId);
	}

	async unlikeCat(sessionToken: string, catId: string): Promise<number> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		await this.ensureCatExists(catId);

		const { error } = await this.supabase
			.from("likes")
			.delete()
			.eq("cat_id", catId)
			.eq("username", username);

		if (error) {
			throw new HttpError("Failed to remove like", 500);
		}

		return this.refreshCatLikeCount(catId);
	}

	private async ensureCatExists(catId: string): Promise<void> {
		const { data, error } = await this.supabase
			.from("cats")
			.select("id")
			.eq("id", catId)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to lookup cat", 500);
		}

		if (!data) {
			throw new HttpError("Cat not found", 404);
		}
	}

	private async refreshCatLikeCount(catId: string): Promise<number> {
		const { count, error } = await this.supabase
			.from("likes")
			.select("*", { count: "exact", head: true })
			.eq("cat_id", catId);

		if (error) {
			throw new HttpError("Failed to count likes", 500);
		}

		const totalLikes = count ?? 0;

		const { error: updateError } = await this.supabase
			.from("cats")
			.update({ likes: totalLikes })
			.eq("id", catId);

		if (updateError) {
			throw new HttpError("Failed to persist like count", 500);
		}

		return totalLikes;
	}
}

