import { fail, handleRouteError, ok } from "../responses";
import { getSupabaseClient } from "../supabaseClient";
import {
	parseBodyFields,
	parseFollowAction,
	parseFollowCursor,
	parseLimitParam,
	validateSessionToken,
	validateUsername,
} from "../validation";
import { UserService } from "../services/userService";
import { FollowService } from "../services/followService";

/**
 * POST /user/follow
 * Body: { session_token: string; target_username: string; action?: "follow"|"unfollow" }
 * Response: { status: "followed" | "unfollowed" }
 */
export async function handleFollowUserRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const targetUsername = fields.target_username ?? null;
		const actionInput = fields.action ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			const status = sessionError === "Missing session_token" ? 401 : 400;
			return fail(sessionError, status);
		}

		const usernameError = validateUsername(targetUsername);
		if (usernameError) {
			return fail(usernameError, 400);
		}

		const { action, error: actionError } = parseFollowAction(actionInput);
		if (actionError) {
			return fail(actionError, 400);
		}

		const supabase = getSupabaseClient(env);
		const userService = new UserService(supabase, env);
		const followService = new FollowService(supabase, userService, env);

		if (action === "follow") {
			await followService.followUser(sessionToken!, targetUsername!);
			return ok({ status: "followed" });
		}

		await followService.unfollowUser(sessionToken!, targetUsername!);
		return ok({ status: "unfollowed" });
	} catch (err) {
		return handleRouteError(err);
	}
}

/**
 * GET /user/listFollowers
 * Query/body: username (+ optional cursor, limit)
 * Response: { followers: FollowerSummary[]; next_cursor: string | null }
 */
export async function handleListFollowersRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const fields = await parseBodyFields(request);

		const username =
			url.searchParams.get("username") ?? fields.username ?? null;
		const limitParam =
			url.searchParams.get("limit") ?? fields.limit ?? undefined;
		const cursorParam =
			url.searchParams.get("cursor") ?? fields.cursor ?? undefined;

		const usernameError = validateUsername(username);
		if (usernameError) {
			return fail(usernameError, 400);
		}

		const { limit, error: limitError } = parseLimitParam(limitParam, 25, 100);
		if (limitError) {
			return fail(limitError, 400);
		}

		const { cursor, error: cursorError } = parseFollowCursor(cursorParam ?? null);
		if (cursorError) {
			return fail(cursorError, 400);
		}

		const supabase = getSupabaseClient(env);
		const userService = new UserService(supabase, env);
		const followService = new FollowService(supabase, userService, env);

		const { followers, nextCursor } = await followService.listFollowers(
			username!,
			{ limit, cursor },
		);

		return ok({ followers, next_cursor: nextCursor });
	} catch (err) {
		return handleRouteError(err);
	}
}


