import type { CommentListPayload, CommentResponsePayload } from "../models";
import { fail, handleRouteError, ok } from "../responses";
import { getSupabaseClient } from "../supabaseClient";
import {
	parseBodyFields,
	parseLimitParam,
	parsePageParam,
	validateComment,
	validateSessionToken,
	isValidUuid,
} from "../validation";
import { CommentService } from "../services/commentService";
import { UserService } from "../services/userService";

export async function handleAddCommentRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const catId = fields.cat_id ?? null;
		const comment = fields.comment ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			const status = sessionError === "Missing session_token" ? 401 : 400;
			return fail(sessionError, status);
		}

		if (!catId) {
			return fail("Missing cat_id", 400);
		}

		if (!isValidUuid(catId)) {
			return fail("Invalid cat_id", 400);
		}

		const commentError = validateComment(comment);
		if (commentError) {
			return fail(commentError, 400);
		}

		const supabase = getSupabaseClient(env);
		const commentService = new CommentService(supabase, env);

		const created = await commentService.createComment(
			sessionToken!,
			catId,
			comment!,
		);

		return ok<CommentResponsePayload>({ comment: created }, 201);
	} catch (err) {
		return handleRouteError(err);
	}
}

export async function handleListCommentsRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const catId = url.searchParams.get("cat_id");
		const rawPage = url.searchParams.get("page");
		const rawLimit = url.searchParams.get("limit");
		const sessionToken = url.searchParams.get("session_token");

		if (!catId) {
			return fail("Missing cat_id", 400);
		}

		if (!isValidUuid(catId)) {
			return fail("Invalid cat_id", 400);
		}

		const { page, error: pageError } = parsePageParam(rawPage);
		if (pageError) {
			return fail(pageError, 400);
		}

		const { limit, error: limitError } = parseLimitParam(rawLimit, 20, 50);
		if (limitError) {
			return fail(limitError, 400);
		}

		const supabase = getSupabaseClient(env);
		const userService = new UserService(supabase, env);
		let sessionUsername: string | null = null;

		if (sessionToken) {
			const sessionError = validateSessionToken(sessionToken);
			if (sessionError) {
				const status = sessionError === "Missing session_token" ? 401 : 400;
				return fail(sessionError, status);
			}

			const user = await userService.getUserBySessionToken(sessionToken);
			sessionUsername = user.username;
		}

		const commentService = new CommentService(supabase, env, userService);
		const { comments, nextPage } = await commentService.listComments(catId, {
			page,
			limit,
			sessionUsername,
		});

		return ok<CommentListPayload>({
			comments,
			next_page: nextPage,
		});
	} catch (err) {
		return handleRouteError(err);
	}
}

export async function handleDeleteCommentRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const commentId = fields.comment_id ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			const status = sessionError === "Missing session_token" ? 401 : 400;
			return fail(sessionError, status);
		}

		if (!commentId) {
			return fail("Missing comment_id", 400);
		}

		if (!isValidUuid(commentId)) {
			return fail("Invalid comment_id", 400);
		}

		const supabase = getSupabaseClient(env);
		const commentService = new CommentService(supabase, env);

		await commentService.deleteOwnComment(sessionToken!, commentId);

		return ok({ status: "deleted" });
	} catch (err) {
		return handleRouteError(err);
	}
}

