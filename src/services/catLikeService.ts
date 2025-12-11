import { HttpError } from "../errors";
import type { SupabaseClientType } from "../supabaseClient";
import { UserService } from "./userService";

const LIKE_FN = "like_cat_with_count";
const UNLIKE_FN = "unlike_cat_with_count";

export class CatLikeService {
	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly userService: UserService,
	) {}

	async likeCat(sessionToken: string, catId: string): Promise<number> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		return this.executeLikeMutation({
			functionName: LIKE_FN,
			catId,
			username,
			errorMessage: "Failed to like cat",
		});
	}

	async unlikeCat(sessionToken: string, catId: string): Promise<number> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		return this.executeLikeMutation({
			functionName: UNLIKE_FN,
			catId,
			username,
			errorMessage: "Failed to remove like",
		});
	}

	private async executeLikeMutation({
		functionName,
		catId,
		username,
		errorMessage,
	}: {
		functionName: typeof LIKE_FN | typeof UNLIKE_FN;
		catId: string;
		username: string;
		errorMessage: string;
	}): Promise<number> {
		const { data, error } = await this.supabase.rpc(functionName, {
			p_cat_id: catId,
			p_username: username,
		});

		if (error) {
			throw new HttpError(errorMessage, 500);
		}

		if (data === null) {
			throw new HttpError("Cat not found", 404);
		}

		return data as number;
	}
}

