import { AuthError, HttpError } from "../errors";
import type {
	Collection,
	CollectionListPayload,
	CollectionDetailPayload,
	CollectionCountPayload,
	CollectionRow,
	CatRecord,
	GuestUser,
} from "../models";
import { ok, fail, handleRouteError } from "../responses";
import { getSupabaseClient, type SupabaseClientType } from "../supabaseClient";
import {
	CollectionService,
	decodeCollectionListCursor,
} from "../services/collectionService";
import { UserService } from "../services/userService";
import { mapCatRecordsWithMetadata } from "../services/catMappingService";
import { GuestService } from "../services/guestService";
import { buildFallbackGuest } from "../services/catMappingService";
import {
	parseBodyFields,
	parseLimitParam,
	validateCollectionDescription,
	validateCollectionName,
	validateSessionToken,
	validateUsername,
	isValidUuid,
} from "../validation";

type CollectionCursorPayload = {
	added_at: string;
	cat_id: string;
};

type CollectionCatRow = {
	cat_id: string;
	added_at: string;
	cat: CatRecord;
};

export async function handleCreateCollectionRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const name = fields.name ?? null;
		const description = fields.description ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		const nameError = validateCollectionName(name);
		if (nameError) {
			return fail(nameError, 400);
		}

		const descriptionError = validateCollectionDescription(description);
		if (descriptionError) {
			return fail(descriptionError, 400);
		}

		const { collectionService, guestService } = getCollectionDependencies(env);
		const collectionRow = await collectionService.createCollection(
			sessionToken!,
			name!,
			description,
		);

		const ownerGuest =
			(await guestService.fetchGuests(
				[collectionRow.owner_username],
				collectionRow.owner_username,
			).then((map) => map.get(collectionRow.owner_username))) ??
			buildFallbackGuest(collectionRow.owner_username);

		return ok<{ collection: Collection }>(
			{ collection: mapCollectionRowToApi(collectionRow, ownerGuest) },
			201,
		);
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleListCollectionsRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const username = url.searchParams.get("username");
		const rawLimit = url.searchParams.get("limit");
		const rawCursor = url.searchParams.get("cursor");

		if (!username) {
			return fail("Missing username", 400);
		}

		const usernameError = validateUsername(username);
		if (usernameError) {
			return fail(usernameError, 400);
		}

		const { limit, error: limitError } = parseLimitParam(rawLimit, 10);
		if (limitError) {
			return fail(limitError, 400);
		}

		const { cursor, error: cursorError } = decodeCollectionListCursor(rawCursor);
		if (cursorError) {
			return fail(cursorError, 400);
		}

		const { collectionService, guestService } = getCollectionDependencies(env);
		const { rows, nextCursor } = await collectionService.listCollectionsForUser(
			username,
			{ limit, cursor },
		);
		const owner =
			(await guestService
				.fetchGuests([username], null)
				.then((map) => map.get(username))) ?? buildFallbackGuest(username);

		const collections = rows.map((row) => mapCollectionRowToApi(row, owner));

		return ok<CollectionListPayload>({ collections, next_cursor: nextCursor });
	} catch (err) {
		return handleRouteError(err);
	}
}

export async function handleGetCollectionRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const url = new URL(request.url);
		const collectionId = url.searchParams.get("collection_id");
		const rawLimit = url.searchParams.get("limit");
		const rawCursor = url.searchParams.get("cursor");
		const sessionToken = url.searchParams.get("session_token");

		if (!collectionId) {
			return fail("Missing collection_id", 400);
		}

		if (!isValidUuid(collectionId)) {
			return fail("Invalid collection_id", 400);
		}

		const { limit, error: limitError } = parseLimitParam(rawLimit);
		if (limitError) {
			return fail(limitError, 400);
		}

		const { cursor, error: cursorError } = decodeCollectionCursor(rawCursor);
		if (cursorError) {
			return fail(cursorError, 400);
		}

		const supabase = getSupabaseClient(env);
		let sessionUsername: string | null = null;

		if (sessionToken) {
			const sessionError = validateSessionToken(sessionToken);
			if (sessionError) {
				return fail(sessionError, 401);
			}

			const { userService } = getCollectionDependencies(env, supabase);
			const { username } = await userService.getUserBySessionToken(
				sessionToken,
			);
			sessionUsername = username;
		}

		const { collectionService, guestService } = getCollectionDependencies(
			env,
			supabase,
		);
		const collectionRow = await collectionService.getCollectionById(collectionId);
		const ownerGuest =
			(await guestService
				.fetchGuests([collectionRow.owner_username], sessionUsername)
				.then((map) => map.get(collectionRow.owner_username))) ??
			buildFallbackGuest(collectionRow.owner_username);

		let query = supabase
			.from("collection_cats")
			.select("cat_id,added_at,cat:cats(*)")
			.eq("collection_id", collectionId)
			.order("added_at", { ascending: false })
			.order("cat_id", { ascending: false })
			.limit(limit + 1);

		if (cursor) {
			query = query.or(buildCollectionCursorClause(cursor));
		}

		const { data, error } = await query;

		if (error) {
			throw new HttpError("Failed to list collection cats", 500);
		}

		const rows = (data ?? []) as CollectionCatRow[];
		const hasMore = rows.length > limit;
		const visibleRows = hasMore ? rows.slice(0, limit) : rows;
		const nextCursor = hasMore ? encodeCollectionCursor(rows[limit]) : null;
		const catRecords = visibleRows
			.map((row) => row.cat)
			.filter((cat): cat is CatRecord => Boolean(cat));

		const cats = await mapCatRecordsWithMetadata(
			catRecords,
			env,
			supabase,
			sessionUsername,
		);

		return ok<CollectionDetailPayload>({
			collection: mapCollectionRowToApi(collectionRow, ownerGuest),
			cats,
			next_cursor: nextCursor,
		});
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleUpdateCollectionRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const collectionId = fields.collection_id ?? null;
		const name = fields.name ?? undefined;
		const description = fields.description ?? undefined;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		if (!collectionId) {
			return fail("Missing collection_id", 400);
		}

		if (!isValidUuid(collectionId)) {
			return fail("Invalid collection_id", 400);
		}

		if (name !== undefined) {
			const nameError = validateCollectionName(name);
			if (nameError) {
				return fail(nameError, 400);
			}
		}

		if (description !== undefined) {
			const descriptionError = validateCollectionDescription(description);
			if (descriptionError) {
				return fail(descriptionError, 400);
			}
		}

		const { collectionService, guestService } = getCollectionDependencies(env);
		const collectionRow = await collectionService.updateCollection(
			sessionToken!,
			collectionId,
			{
				name: name ?? null,
				description: description ?? null,
			},
		);

		const ownerGuest =
			(await guestService
				.fetchGuests([collectionRow.owner_username], collectionRow.owner_username)
				.then((map) => map.get(collectionRow.owner_username))) ??
			buildFallbackGuest(collectionRow.owner_username);

		return ok<{ collection: Collection }>({
			collection: mapCollectionRowToApi(collectionRow, ownerGuest),
		});
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleDeleteCollectionRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const collectionId = fields.collection_id ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		if (!collectionId) {
			return fail("Missing collection_id", 400);
		}

		if (!isValidUuid(collectionId)) {
			return fail("Invalid collection_id", 400);
		}

		const { collectionService } = getCollectionDependencies(env);
		await collectionService.deleteCollection(sessionToken!, collectionId);

		return ok({});
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleAddCatToCollectionRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const collectionId = fields.collection_id ?? null;
		const catId = fields.cat_id ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		if (!collectionId || !catId) {
			return fail("Missing collection_id or cat_id", 400);
		}

		if (!isValidUuid(collectionId)) {
			return fail("Invalid collection_id", 400);
		}

		if (!isValidUuid(catId)) {
			return fail("Invalid cat_id", 400);
		}

		const { collectionService } = getCollectionDependencies(env);
		const catCount = await collectionService.addCatToCollection(
			sessionToken!,
			collectionId,
			catId,
		);

		return ok<CollectionCountPayload>({
			collection_id: collectionId,
			cat_count: catCount,
		});
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

export async function handleRemoveCatFromCollectionRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		const fields = await parseBodyFields(request);
		const sessionToken = fields.session_token ?? null;
		const collectionId = fields.collection_id ?? null;
		const catId = fields.cat_id ?? null;

		const sessionError = validateSessionToken(sessionToken);
		if (sessionError) {
			return fail(sessionError, 401);
		}

		if (!collectionId || !catId) {
			return fail("Missing collection_id or cat_id", 400);
		}

		if (!isValidUuid(collectionId)) {
			return fail("Invalid collection_id", 400);
		}

		if (!isValidUuid(catId)) {
			return fail("Invalid cat_id", 400);
		}

		const { collectionService } = getCollectionDependencies(env);
		const catCount = await collectionService.removeCatFromCollection(
			sessionToken!,
			collectionId,
			catId,
		);

		return ok<CollectionCountPayload>({
			collection_id: collectionId,
			cat_count: catCount,
		});
	} catch (err) {
		if (err instanceof AuthError) {
			return fail(err.message, err.status);
		}
		return handleRouteError(err);
	}
}

function getCollectionDependencies(
	env: Env,
	existingClient?: SupabaseClientType,
): {
	supabase: SupabaseClientType;
	userService: UserService;
	collectionService: CollectionService;
	guestService: GuestService;
} {
	const supabase = existingClient ?? getSupabaseClient(env);
	const userService = new UserService(supabase, env);
	const collectionService = new CollectionService(supabase, userService);
	const guestService = new GuestService(supabase, env);
	return { supabase, userService, collectionService, guestService };
}

function mapCollectionRowToApi(record: CollectionRow, owner: GuestUser): Collection {
	return {
		id: record.id,
		owner,
		name: record.name,
		description: record.description,
		cat_count: Number(record.cat_count ?? 0),
		created_at: record.created_at,
	};
}

function encodeCollectionCursor(row: CollectionCatRow): string {
	const payload = JSON.stringify({
		added_at: row.added_at,
		cat_id: row.cat_id,
	});
	return base64Encode(payload);
}

function decodeCollectionCursor(
	rawCursor: string | null,
): { cursor: CollectionCursorPayload | null; error: string | null } {
	if (!rawCursor) {
		return { cursor: null, error: null };
	}

	try {
		const json = base64Decode(rawCursor);
		const parsed = JSON.parse(json) as Partial<CollectionCursorPayload>;
		if (
			typeof parsed.added_at === "string" &&
			typeof parsed.cat_id === "string"
		) {
			return {
				cursor: {
					added_at: parsed.added_at,
					cat_id: parsed.cat_id,
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

function buildCollectionCursorClause(cursor: CollectionCursorPayload): string {
	return `and(added_at.lt.${cursor.added_at}),and(added_at.eq.${cursor.added_at},cat_id.lt.${cursor.cat_id})`;
}
