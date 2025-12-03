import { AuthError, HttpError } from "../errors";
import type {
	Cat,
	CatRecord,
	CatListPayload,
	CatResponsePayload,
	CatLikePayload,
} from "../models";
import { ok, fail, handleRouteError } from "../responses";
import { getSupabaseClient, type SupabaseClientType } from "../supabaseClient";
import { CatLikeService } from "../services/catLikeService";
import { UserService } from "../services/userService";
import { buildOptionalPublicR2Url, buildPublicR2Url } from "../r2";
import {
	parseBase64Image,
	parseBodyFields,
	parseCatTags,
	parseCoordinate,
	parseLimitParam,
	validateCatDescription,
	validateCatName,
	validateSessionToken,
	validateTagSearchMode,
	validateUsername,
	isValidUuid,
} from "../validation";

type CursorPayload = {
	created_at: string;
	id: string;
};

export function handleCatsRequest(request: Request, env: Env): Promise<Response> {
	// Backwards compatibility for the older /cats endpoint by delegating to the list handler.
	return handleListCatsRequest(request, env);
}

export async function handleCreateCatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const name = fields.name ?? null;
		const description = fields.description ?? null;
		const tagsRaw = fields.tags ?? null;
		const latitudeRaw = fields.location_latitude ?? null;
		const longitudeRaw = fields.location_longitude ?? null;
		const imageBase64 = fields.image_base64 ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		const nameError = validateCatName(name);
		if (nameError) {
			return fail(nameError, 400);
		}

		const descriptionError = validateCatDescription(description);
		if (descriptionError) {
			return fail(descriptionError, 400);
		}

		const { tags, error: tagsError } = parseCatTags(tagsRaw);
		if (tagsError) {
			return fail(tagsError, 400);
		}

		const { value: latitude, error: latitudeError } = parseCoordinate(
			latitudeRaw,
			"latitude",
		);
		if (latitudeError) {
			return fail(latitudeError, 400);
		}

		const { value: longitude, error: longitudeError } = parseCoordinate(
			longitudeRaw,
			"longitude",
		);
		if (longitudeError) {
			return fail(longitudeError, 400);
		}

		const { image, error: imageError, status: imageStatus } =
			parseBase64Image(imageBase64);
		if (!image || imageError) {
			return fail(imageError ?? "Invalid image_base64", imageStatus ?? 400);
		}

		const supabase = getSupabaseClient(env);
		const username = await resolveUsernameBySessionToken(
			supabase,
			sessionToken!,
		);

		const catId = crypto.randomUUID();
		const sanitizedName = name!.trim();
		const sanitizedDescription =
			description && description.trim().length > 0
				? description.trim()
				: null;

		const r2Key = `cats/${catId}.${image.extension}`;
		await env.R2_BUCKET.put(r2Key, image.arrayBuffer, {
			httpMetadata: { contentType: image.contentType },
		});

		const { data, error } = await supabase
			.from("cats")
			.insert({
				id: catId,
				name: sanitizedName,
				tags: tags.length ? tags : null,
				username,
				description: sanitizedDescription,
				location_latitude: latitude,
				location_longitude: longitude,
				r2_path: r2Key,
			})
			.select("*")
			.single();

		if (error || !data) {
			throw new HttpError("Failed to create cat", 500);
		}

		const [cat] = await mapCatsWithMetadata(
			[data as CatRecord],
			env,
			supabase,
			username,
		);

		return ok<CatResponsePayload>({ cat }, 201);
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleListCatsRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const rawLimit = url.searchParams.get("limit");
		const rawCursor = url.searchParams.get("cursor");
		const usernameFilter = url.searchParams.get("username");
		const sessionToken = url.searchParams.get("session_token");
		let sessionUsername: string | null = null;

		if (usernameFilter) {
			const usernameError = validateUsername(usernameFilter);
			if (usernameError) {
				return fail(usernameError, 400);
			}
		}

		const { limit, error: limitError } = parseLimitParam(rawLimit);
		if (limitError) {
			return fail(limitError, 400);
		}

		const { cursor, error: cursorError } = decodeCursor(rawCursor);
		if (cursorError) {
			return fail(cursorError, 400);
		}

		const supabase = getSupabaseClient(env);

		if (sessionToken) {
			const sessionError = validateSessionToken(sessionToken);
			if (sessionError) {
				return fail(sessionError, 401);
			}

			sessionUsername = await resolveUsernameBySessionToken(
				supabase,
				sessionToken,
			);
		}

		let query = supabase
			.from("cats")
			.select("*")
			.order("created_at", { ascending: false })
			.order("id", { ascending: false })
			.limit(limit + 1);

		if (usernameFilter) {
			query = query.eq("username", usernameFilter);
		}

		if (cursor) {
			query = query.or(buildCursorClause(cursor));
		}

		const { data, error } = await query;
		if (error) {
			throw new HttpError("Failed to fetch cats", 500);
		}

		const rows = (data ?? []) as CatRecord[];
		const hasMore = rows.length > limit;
		const visibleRows = hasMore ? rows.slice(0, limit) : rows;
		const nextCursor = hasMore ? encodeCursor(rows[limit]) : null;

		const cats = await mapCatsWithMetadata(
			visibleRows,
			env,
			supabase,
			sessionUsername,
		);

		return ok<CatListPayload>({
			cats,
			next_cursor: nextCursor,
		});
	} catch (err) {
		return handleRouteError(err);
	}
}

export async function handleGetCatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const id = url.searchParams.get("id");
		const sessionToken = url.searchParams.get("session_token");
		let sessionUsername: string | null = null;

		if (!id) {
			return fail("Missing id", 400);
		}

		if (!isValidUuid(id)) {
			return fail("Invalid id", 400);
		}

		const supabase = getSupabaseClient(env);

		if (sessionToken) {
			const sessionError = validateSessionToken(sessionToken);
			if (sessionError) {
				return fail(sessionError, 401);
			}

			sessionUsername = await resolveUsernameBySessionToken(
				supabase,
				sessionToken,
			);
		}

		const { data, error } = await supabase
			.from("cats")
			.select("*")
			.eq("id", id)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to load cat", 500);
		}

		if (!data) {
			return fail("Cat not found", 404);
		}

		const [cat] = await mapCatsWithMetadata(
			[data as CatRecord],
			env,
			supabase,
			sessionUsername,
		);

		return ok<CatResponsePayload>({ cat });
	} catch (err) {
		return handleRouteError(err);
	}
}

export async function handleSearchCatsByTagsRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const tagsParam = url.searchParams.get("tags");
		const modeParam = url.searchParams.get("mode");
		const rawLimit = url.searchParams.get("limit");
		const rawCursor = url.searchParams.get("cursor");
		const sessionToken = url.searchParams.get("session_token");
		let sessionUsername: string | null = null;

		if (!tagsParam) {
			return fail("Missing tags", 400);
		}

		const { tags, error: tagsError } = parseCatTags(tagsParam);
		if (tagsError) {
			return fail(tagsError, 400);
		}

		if (!tags.length) {
			return fail("At least one tag is required", 400);
		}

		const { mode, error: modeError } = validateTagSearchMode(modeParam);
		if (modeError) {
			return fail(modeError, 400);
		}

		const { limit, error: limitError } = parseLimitParam(rawLimit);
		if (limitError) {
			return fail(limitError, 400);
		}

		const { cursor, error: cursorError } = decodeCursor(rawCursor);
		if (cursorError) {
			return fail(cursorError, 400);
		}

		const supabase = getSupabaseClient(env);

		if (sessionToken) {
			const sessionError = validateSessionToken(sessionToken);
			if (sessionError) {
				return fail(sessionError, 401);
			}

			sessionUsername = await resolveUsernameBySessionToken(
				supabase,
				sessionToken,
			);
		}

		let query = supabase
			.from("cats")
			.select("*")
			.order("created_at", { ascending: false })
			.order("id", { ascending: false })
			.limit(limit + 1);

		if (mode === "all") {
			query = query.contains("tags", tags);
		} else {
			query = query.overlaps("tags", tags);
		}

		if (cursor) {
			query = query.or(buildCursorClause(cursor));
		}

		const { data, error } = await query;
		if (error) {
			console.error(
				"Failed to search cats (tags search query error)",
				JSON.stringify(
					{
						error,
						mode,
						tags,
						cursor,
						limit,
					},
					null,
					2,
				),
			);
			throw new HttpError("Failed to search cats", 500);
		}

		const rows = (data ?? []) as CatRecord[];
		const hasMore = rows.length > limit;
		const visibleRows = hasMore ? rows.slice(0, limit) : rows;
		const nextCursor = hasMore ? encodeCursor(rows[limit]) : null;
		const cats = await mapCatsWithMetadata(
			visibleRows,
			env,
			supabase,
			sessionUsername,
		);

		return ok<CatListPayload>({
			cats,
			next_cursor: nextCursor,
		});
	} catch (err) {
		return handleRouteError(err);
	}
}

export function handleLikeCatRequest(request: Request, env: Env): Promise<Response> {
	return handleCatLikeMutation(request, env, "like");
}

export function handleRemoveLikeCatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	return handleCatLikeMutation(request, env, "remove");
}

async function resolveUsernameBySessionToken(
	supabase: SupabaseClientType,
	sessionToken: string,
): Promise<string> {
	const { data, error } = await supabase
		.from("users")
		.select("username")
		.eq("session_token", sessionToken)
		.maybeSingle();

	if (error) {
		throw new HttpError("Failed to validate session token", 500);
	}

	if (!data) {
		throw new AuthError("Invalid session token");
	}

	return data.username as string;
}

async function mapCatsWithMetadata(
	rows: CatRecord[],
	env: Env,
	supabase: SupabaseClientType,
	sessionUsername: string | null,
): Promise<Cat[]> {
	if (!rows.length) {
		return [];
	}

	const uniqueUsernames = Array.from(new Set(rows.map((row) => row.username)));
	const avatarMap = await fetchPosterAvatars(supabase, env, uniqueUsernames);
	const catIds = rows.map((row) => row.id);
	const likedIds =
		sessionUsername && catIds.length
			? await fetchUserLikedCatIds(supabase, sessionUsername, catIds)
			: new Set<string>();

	return rows.map((row) =>
		mapCatRecordToApi(row, env, {
			posterAvatarUrl: avatarMap.get(row.username) ?? null,
			userLiked: likedIds.has(row.id),
		}),
	);
}

async function fetchPosterAvatars(
	supabase: SupabaseClientType,
	env: Env,
	usernames: string[],
): Promise<Map<string, string | null>> {
	const avatarMap = new Map<string, string | null>();

	if (!usernames.length) {
		return avatarMap;
	}

	const { data, error } = await supabase
		.from("users")
		.select("username,r2_avatar")
		.in("username", usernames);

	if (error) {
		throw new HttpError("Failed to fetch poster avatars", 500);
	}

	const rows =
		(data ?? []) as { username: string; r2_avatar: string | null }[];

	for (const row of rows) {
		avatarMap.set(
			row.username,
			buildOptionalPublicR2Url(row.r2_avatar ?? null, env),
		);
	}

	return avatarMap;
}

async function fetchUserLikedCatIds(
	supabase: SupabaseClientType,
	username: string,
	catIds: string[],
): Promise<Set<string>> {
	if (!catIds.length) {
		return new Set<string>();
	}

	const { data, error } = await supabase
		.from("likes")
		.select("cat_id")
		.eq("username", username)
		.in("cat_id", catIds);

	if (error) {
		throw new HttpError("Failed to fetch liked cats", 500);
	}

	const likedRows = (data ?? []) as { cat_id: string }[];

	return new Set(likedRows.map((row) => row.cat_id));
}

type CatRecordExtras = {
	posterAvatarUrl?: string | null;
	userLiked?: boolean;
};

function mapCatRecordToApi(
	row: CatRecord,
	env: Env,
	extras: CatRecordExtras = {},
): Cat {
	return {
		id: row.id,
		name: row.name,
		tags: row.tags ?? [],
		created_at: row.created_at,
		username: row.username,
		description: row.description,
		location: {
			latitude: row.location_latitude,
			longitude: row.location_longitude,
		},
		image_url: buildPublicR2Url(row.r2_path, env),
		likes: row.likes ?? 0,
		poster_avatar_url: extras.posterAvatarUrl ?? null,
		user_liked: extras.userLiked ?? false,
	};
}

function encodeCursor(row: CatRecord): string {
	const payload = JSON.stringify({
		created_at: row.created_at,
		id: row.id,
	});
	return base64Encode(payload);
}

function decodeCursor(
	rawCursor: string | null,
): { cursor: CursorPayload | null; error: string | null } {
	if (!rawCursor) {
		return { cursor: null, error: null };
	}

	try {
		const json = base64Decode(rawCursor);
		const parsed = JSON.parse(json) as Partial<CursorPayload>;
		if (
			typeof parsed.created_at === "string" &&
			typeof parsed.id === "string"
		) {
			return {
				cursor: {
					created_at: parsed.created_at,
					id: parsed.id,
				},
				error: null,
			};
		}
		return { cursor: null, error: "Invalid cursor" };
	} catch {
		return { cursor: null, error: "Invalid cursor" };
	}
}

function base64Encode(input: string): string {
	const utf8 = new TextEncoder().encode(input);
	let binary = "";
	for (const byte of utf8) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function base64Decode(encoded: string): string {
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

function buildCursorClause(cursor: CursorPayload): string {
	return `and(created_at.lt.${cursor.created_at}),and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
}

type CatLikeMutation = "like" | "remove";

async function handleCatLikeMutation(
	request: Request,
	env: Env,
	action: CatLikeMutation,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const catId = fields.cat_id ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		if (!catId) {
			return fail("Missing cat_id", 400);
		}

		if (!isValidUuid(catId)) {
			return fail("Invalid cat_id", 400);
		}

		const supabase = getSupabaseClient(env);
		const userService = new UserService(supabase, env);
		const likeService = new CatLikeService(supabase, userService);

		const totalLikes =
			action === "like"
				? await likeService.likeCat(sessionToken!, catId)
				: await likeService.unlikeCat(sessionToken!, catId);

		const liked = action === "like";
		return ok<CatLikePayload>({
			cat_id: catId,
			likes: totalLikes,
			liked,
		});
	} catch (err) {
		return handleRouteError(err);
	}
}
