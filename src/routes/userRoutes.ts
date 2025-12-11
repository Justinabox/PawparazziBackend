import { AuthError, ConflictError } from "../errors";
import { fail, handleRouteError, ok } from "../responses";
import { getSupabaseClient } from "../supabaseClient";
import {
	AVATAR_IMAGE_MAX_BYTES,
	isValidEmail,
	isValidSha256Hex,
	normalizeEmail,
	parseBase64Image,
	parseBodyFields,
	validateSessionToken,
	validateUsername,
} from "../validation";
import { UserService } from "../services/userService";
import { GuestService } from "../services/guestService";

export async function handleGetUserProfileRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		let sessionToken = url.searchParams.get("session_token");
		let targetUsername = url.searchParams.get("username");

		if (!sessionToken) {
			const fields = await parseBodyFields(request);
			sessionToken = fields.session_token ?? null;
			targetUsername = targetUsername ?? fields.username ?? null;
		}

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401, { user: null });
		}

		const supabase = getSupabaseClient(env);
		const service = new UserService(supabase, env);
		const requester = await service.getUserBySessionToken(sessionToken!);

		if (targetUsername) {
			const usernameError = validateUsername(targetUsername);
			if (usernameError) {
				return fail(usernameError, 400, { user: null });
			}
		}

		if (targetUsername && targetUsername !== requester.username) {
			const guestService = new GuestService(supabase, env);
			const guestMap = await guestService.fetchGuests(
				[targetUsername],
				requester.username,
			);
			const guest = guestMap.get(targetUsername);
			if (!guest) {
				return fail("User not found", 404, { user: null });
			}
			return ok({ user: guest });
		}

		return ok({ user: requester });
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status, { user: null });
		}
		return handleRouteError(err);
	}
}

export async function handleCheckUsernameRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		let username = url.searchParams.get("username");

		// Also support body-based username for flexibility
		if (!username) {
			const fields = await parseBodyFields(request);
			username = fields.username;
		}

		const validationError = validateUsername(username);
		if (validationError) {
			return fail(validationError, 400, { available: false });
		}

		const supabase = getSupabaseClient(env);
		const service = new UserService(supabase, env);

		const available = await service.isUsernameAvailable(username!);
		return ok({ available });
	} catch (err) {
		return handleRouteError(err);
	}
}

export async function handleRegisterRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const username = fields.username ?? null;
		const passwordHash = fields.passwd_hash ?? null;
		const email = normalizeEmail(fields.email ?? null);

		const usernameError = validateUsername(username);
		if (usernameError) {
			return fail(usernameError, 400, { session_token: "" });
		}

		if (!isValidSha256Hex(passwordHash)) {
			return fail("Invalid passwd_hash (expected sha256 hex string)", 400, {
				session_token: "",
			});
		}

		if (!email) {
			return fail("Invalid email address", 400, { session_token: "" });
		}

		if (!isValidEmail(email)) {
			return fail("Invalid email address", 400, { session_token: "" });
		}

		const supabase = getSupabaseClient(env);
		const service = new UserService(supabase, env);

		const { sessionToken } = await service.registerUser(
			username!,
			passwordHash!,
			email,
		);

		return ok({ session_token: sessionToken });
	} catch (err) {
		if (err instanceof ConflictError) {
			return fail(err.message, err.status, { session_token: "" });
		}
		return handleRouteError(err);
	}
}

export async function handleLoginRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const email = normalizeEmail(fields.email ?? null);
		const passwordHash = fields.passwd_hash ?? null;

		if (!email) {
			return fail("Invalid email address", 400, {
				session_token: "",
				user: null,
			});
		}

		if (!isValidEmail(email)) {
			return fail("Invalid email address", 400, {
				session_token: "",
				user: null,
			});
		}

		if (!isValidSha256Hex(passwordHash)) {
			return fail("Invalid passwd_hash (expected sha256 hex string)", 400, {
				session_token: "",
				user: null,
			});
		}

		const supabase = getSupabaseClient(env);
		const service = new UserService(supabase, env);

		const { sessionToken, user } = await service.loginUser(email, passwordHash!);

		return ok({ session_token: sessionToken, user });
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status, {
				session_token: "",
				user: null,
			});
		}
		return handleRouteError(err);
	}
}

export async function handleUpdateUserRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const bio = fields.bio ?? null;
		const location = fields.location ?? null;

		if (!sessionToken) {
			return fail("Missing session_token", 401);
		}

		const supabase = getSupabaseClient(env);
		const service = new UserService(supabase, env);

		const updatedUser = await service.updateUserProfile(
			sessionToken,
			bio,
			location,
		);

		// Return updated user for convenience, but keep structure similar
		return ok({ user: updatedUser });
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleChangePasswordRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const currentHash = fields.current_passwd_hash ?? null;
		const newHash = fields.new_passwd_hash ?? null;

		if (!sessionToken) {
			return fail("Missing session_token", 401);
		}

		if (!isValidSha256Hex(currentHash)) {
			return fail(
				"Invalid current_passwd_hash (expected sha256 hex string)",
				400,
			);
		}

		if (!isValidSha256Hex(newHash)) {
			return fail(
				"Invalid new_passwd_hash (expected sha256 hex string)",
				400,
			);
		}

		const supabase = getSupabaseClient(env);
		const service = new UserService(supabase, env);

		await service.changePassword(sessionToken, currentHash!, newHash!);

		return ok({});
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleChangeAvatarRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const avatarBase64 = fields.avatar_base64 ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		const { image, error, status } = parseBase64Image(avatarBase64, {
			fieldName: "avatar_base64",
			maxBytes: AVATAR_IMAGE_MAX_BYTES,
		});

		if (!image || error) {
			return fail(error ?? "Invalid avatar_base64", status ?? 400);
		}

		const supabase = getSupabaseClient(env);
		const service = new UserService(supabase, env);
		const user = await service.changeAvatar(sessionToken!, image, env.R2_BUCKET);

		return ok({ user });
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}


