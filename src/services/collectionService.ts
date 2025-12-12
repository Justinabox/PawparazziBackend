
import { ConflictError, HttpError } from "../errors";
import type { CollectionRow } from "../models";
import type { SupabaseClientType } from "../supabaseClient";
import { UserService } from "./userService";

const CREATE_COLLECTION_FN = "create_collection_with_count";
const ADD_CAT_FN = "add_cat_to_collection_with_count";
const REMOVE_CAT_FN = "remove_cat_from_collection_with_count";

export class CollectionService {
	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly userService: UserService,
	) {}

	async createCollection(
		sessionToken: string,
		name: string,
		description: string | null,
	): Promise<CollectionRow> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);
		const collectionId = crypto.randomUUID();
		const sanitizedDescription =
			description && description.trim().length > 0 ? description.trim() : null;

		const { data, error } = await this.supabase.rpc(CREATE_COLLECTION_FN, {
			p_id: collectionId,
			p_owner_username: username,
			p_name: name.trim(),
			p_description: sanitizedDescription,
		});

		if (error) {
			throw new HttpError("Failed to create collection", 500);
		}

		const record = this.unwrapSingleRow<CollectionRow>(data);
		if (!record) {
			throw new ConflictError("A collection with this name already exists");
		}

		return record;
	}

	async listCollectionsForUser(
		username: string,
		options: { limit: number; cursor: CollectionListCursor | null },
	): Promise<{ rows: CollectionRow[]; nextCursor: string | null }> {
		let query = this.supabase
			.from("collections")
			.select("*")
			.eq("owner_username", username)
			.order("created_at", { ascending: false })
			.order("id", { ascending: false })
			.limit(options.limit + 1);

		if (options.cursor) {
			query = query.or(buildCollectionListCursorClause(options.cursor));
		}

		const { data, error } = await query;

		if (error) {
			throw new HttpError("Failed to list collections", 500);
		}

		const rows = (data ?? []) as CollectionRow[];
		const hasMore = rows.length > options.limit;
		const visibleRows = hasMore ? rows.slice(0, options.limit) : rows;
		const nextCursor = hasMore ? encodeCollectionListCursor(rows[options.limit]) : null;

		return { rows: visibleRows, nextCursor };
	}

	async getCollectionById(collectionId: string): Promise<CollectionRow> {
		const { data, error } = await this.supabase
			.from("collections")
			.select("*")
			.eq("id", collectionId)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to load collection", 500);
		}

		if (!data) {
			throw new HttpError("Collection not found", 404);
		}

		return data as CollectionRow;
	}

	async updateCollection(
		sessionToken: string,
		collectionId: string,
		updates: { name?: string | null; description?: string | null },
	): Promise<CollectionRow> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);
		await this.assertCollectionOwner(collectionId, username);

		const payload: Partial<CollectionRow> = {
			updated_at: new Date().toISOString(),
		};

		if (typeof updates.name === "string") {
			payload.name = updates.name.trim();
		}

		if (updates.description !== undefined) {
			payload.description =
				updates.description && updates.description.trim().length > 0
					? updates.description.trim()
					: null;
		}

		const { data, error } = await this.supabase
			.from("collections")
			.update(payload)
			.eq("id", collectionId)
			.eq("owner_username", username)
			.select("*")
			.maybeSingle();

		if (error) {
			if ((error as { code?: string }).code === "23505") {
				throw new ConflictError("A collection with this name already exists");
			}
			throw new HttpError("Failed to update collection", 500);
		}

		if (!data) {
			throw new HttpError("Collection not found", 404);
		}

		return data as CollectionRow;
	}

	async deleteCollection(
		sessionToken: string,
		collectionId: string,
	): Promise<void> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);

		const { data, error } = await this.supabase
			.from("collections")
			.delete()
			.eq("id", collectionId)
			.eq("owner_username", username)
			.select("id")
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to delete collection", 500);
		}

		if (!data) {
			throw new HttpError("Collection not found or access denied", 404);
		}
	}

	async addCatToCollection(
		sessionToken: string,
		collectionId: string,
		catId: string,
	): Promise<number> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);
		await this.assertCollectionOwner(collectionId, username);
		await this.ensureCatExists(catId);

		const { data, error } = await this.supabase.rpc(ADD_CAT_FN, {
			p_collection_id: collectionId,
			p_cat_id: catId,
			p_owner_username: username,
		});

		if (error) {
			throw new HttpError("Failed to save cat to collection", 500);
		}

		const count = this.unwrapSingleRow<number>(data);
		if (count === null || count === undefined) {
			throw new HttpError("Collection not found", 404);
		}

		return Number(count);
	}

	async removeCatFromCollection(
		sessionToken: string,
		collectionId: string,
		catId: string,
	): Promise<number> {
		const { username } = await this.userService.getUserBySessionToken(
			sessionToken,
		);
		await this.assertCollectionOwner(collectionId, username);
		await this.ensureCatExists(catId);

		const { data, error } = await this.supabase.rpc(REMOVE_CAT_FN, {
			p_collection_id: collectionId,
			p_cat_id: catId,
			p_owner_username: username,
		});

		if (error) {
			throw new HttpError("Failed to remove cat from collection", 500);
		}

		const count = this.unwrapSingleRow<number>(data);
		if (count === null || count === undefined) {
			throw new HttpError("Collection not found", 404);
		}

		return Number(count);
	}

	private async assertCollectionOwner(
		collectionId: string,
		username: string,
	): Promise<CollectionRow> {
		const record = await this.getCollectionById(collectionId);
		if (record.owner_username !== username) {
			throw new HttpError("Forbidden", 403);
		}
		return record;
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

	private unwrapSingleRow<T>(rowOrRows: T | T[] | null): T | null {
		if (Array.isArray(rowOrRows)) {
			return rowOrRows[0] ?? null;
		}
		return rowOrRows;
	}
}

export type CollectionListCursor = {
	created_at: string;
	id: string;
};

export function encodeCollectionListCursor(row: CollectionRow): string {
	const payload = JSON.stringify({
		created_at: row.created_at,
		id: row.id,
	});
	return base64Encode(payload);
}

export function decodeCollectionListCursor(
	rawCursor: string | null,
): { cursor: CollectionListCursor | null; error: string | null } {
	if (!rawCursor) {
		return { cursor: null, error: null };
	}

	try {
		const parsed = JSON.parse(base64Decode(rawCursor)) as Partial<CollectionListCursor>;
		if (typeof parsed.created_at === "string" && typeof parsed.id === "string") {
			return { cursor: { created_at: parsed.created_at, id: parsed.id }, error: null };
		}
		return { cursor: null, error: "Invalid cursor" };
	} catch {
		return { cursor: null, error: "Invalid cursor" };
	}
}

export function buildCollectionListCursorClause(cursor: CollectionListCursor): string {
	return `and(created_at.lt.${cursor.created_at}),and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`;
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