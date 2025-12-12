import { HttpError } from "../errors";
import type { Comment, GuestUser } from "../models";
import type { SupabaseClientType } from "../supabaseClient";
import { buildFallbackGuest } from "./catMappingService";
import { GuestService } from "./guestService";
import { UserService } from "./userService";

type ListOptions = {
	page: number;
	limit: number;
	sessionUsername: string | null;
};

type CommentRow = {
	comment_id: string;
	cat_id: string;
	username: string;
	comment: string;
	comment_at: string;
};

export class CommentService {
	private readonly guestService: GuestService;

	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly env: Env,
		private readonly userService = new UserService(supabase, env),
	) {
		this.guestService = new GuestService(supabase, env);
	}

	async createComment(
		sessionToken: string,
		catId: string,
		comment: string,
	): Promise<Comment> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		await this.assertCatExists(catId);

		const trimmed = comment.trim();

		const guestMap = await this.guestService.fetchGuests([username], username);
		const guest = guestMap.get(username) ?? null;

		const { data, error } = await this.supabase
			.from("comments")
			.insert({
				cat_id: catId,
				username,
				comment: trimmed,
			})
			.select("comment_id,cat_id,username,comment,comment_at")
			.single();

		if (error || !data) {
			throw new HttpError("Failed to create comment", 500);
		}

		return this.mapRowToComment(
			data as CommentRow,
			username,
			username,
			guest,
		);
	}

	async listComments(
		catId: string,
		options: ListOptions,
	): Promise<{ comments: Comment[]; nextPage: number | null }> {
		await this.assertCatExists(catId);

		const start = (options.page - 1) * options.limit;
		const end = start + options.limit;

		const { data, error } = await this.supabase
			.from("comments")
			.select("comment_id,cat_id,username,comment,comment_at")
			.eq("cat_id", catId)
			.order("comment_at", { ascending: false })
			.order("comment_id", { ascending: false })
			.range(start, end);

		if (error || !data) {
			throw new HttpError("Failed to list comments", 500);
		}

		const rows = data as CommentRow[];
		const hasMore = rows.length > options.limit;
		const visibleRows = hasMore ? rows.slice(0, options.limit) : rows;
		const comments = await this.mapRowsToComments(
			visibleRows,
			options.sessionUsername,
		);

		return { comments, nextPage: hasMore ? options.page + 1 : null };
	}

	async deleteOwnComment(sessionToken: string, commentId: string): Promise<void> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		const { data, error } = await this.supabase
			.from("comments")
			.select("comment_id,cat_id,username,comment,comment_at")
			.eq("comment_id", commentId)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to load comment", 500);
		}

		if (!data) {
			throw new HttpError("Comment not found", 404);
		}

		const row = data as CommentRow;

		if (row.username !== username) {
			throw new HttpError("Cannot delete another user's comment", 403);
		}

		const { error: deleteError } = await this.supabase
			.from("comments")
			.delete()
			.eq("comment_id", commentId);

		if (deleteError) {
			throw new HttpError("Failed to delete comment", 500);
		}
	}

	private async mapRowsToComments(
		rows: CommentRow[],
		sessionUsername: string | null,
	): Promise<Comment[]> {
		if (!rows.length) {
			return [];
		}

		const usernames = Array.from(new Set(rows.map((row) => row.username)));
		const guests = await this.guestService.fetchGuests(
			usernames,
			sessionUsername,
		);

		return rows.map((row) =>
			this.mapRowToComment(
				row,
				row.username,
				sessionUsername ?? undefined,
				guests.get(row.username) ?? null,
			),
		);
	}

	private mapRowToComment(
		row: CommentRow,
		ownerUsername: string,
		sessionUsername?: string,
		guest?: GuestUser | null,
	): Comment {
		const user =
			guest ??
			buildFallbackGuest(ownerUsername);

		return {
			comment_id: row.comment_id,
			cat_id: row.cat_id,
			comment: row.comment,
			comment_at: row.comment_at,
			user,
			is_owner: sessionUsername ? row.username === sessionUsername : false,
		};
	}

	private async assertCatExists(catId: string): Promise<void> {
		const { data, error } = await this.supabase
			.from("cats")
			.select("id")
			.eq("id", catId)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to validate cat", 500);
		}

		if (!data) {
			throw new HttpError("Cat not found", 404);
		}
	}
}

