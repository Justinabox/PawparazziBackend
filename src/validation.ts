import type { BodyFields } from "./models";

export const CAT_NAME_MAX_LENGTH = 100;
export const CAT_DESCRIPTION_MAX_LENGTH = 500;
export const CAT_TAGS_MAX = 10;
export const CAT_TAG_MAX_LENGTH = 32;
export const CAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
export const AVATAR_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const COLLECTION_NAME_MAX_LENGTH = 100;
export const COLLECTION_DESCRIPTION_MAX_LENGTH = 500;
export const COMMENT_MAX_LENGTH = 500;

const ALLOWED_IMAGE_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
] as const;

type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

const MIME_EXTENSION_MAP: Record<AllowedImageMimeType, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

export function generateSessionToken(): string {
	const bytes = new Uint8Array(32); // 32 bytes -> 64 hex chars
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateUsername(
	username: string | null | undefined,
): string | null {
	if (!username) return "Missing username";
	if (username.length < 4 || username.length > 32) {
		return "Username must be between 4 and 32 characters long";
	}
	return null;
}

export function isValidEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return re.test(email);
}

export function normalizeEmail(email: string | null | undefined): string | null {
	if (!email) return null;
	return email.trim().toLowerCase();
}

export function isValidSha256Hex(hash: string | null | undefined): boolean {
	if (!hash) return false;
	return /^[a-f0-9]{64}$/i.test(hash);
}

export async function parseBodyFields(request: Request): Promise<BodyFields> {
	const contentType = request.headers.get("content-type") || "";

	const fields: BodyFields = {};

	// JSON-only body parsing; all user endpoints now expect JSON with the same field names.
	if (contentType.includes("application/json")) {
		const json = await request.json().catch(() => ({}));
		if (json && typeof json === "object") {
			for (const [key, value] of Object.entries(
				json as Record<string, unknown>,
			)) {
				if (typeof value === "string") {
					fields[key] = value;
				}
			}
		}
	}

	return fields;
}

export function validateSessionToken(
	sessionToken: string | null | undefined,
): string | null {
	if (!sessionToken) {
		return "Missing session_token";
	}

	if (!isValidSha256Hex(sessionToken)) {
		return "Invalid session_token";
	}

	return null;
}

export function validateCatName(name: string | null | undefined): string | null {
	if (!name || !name.trim()) {
		return "Missing name";
	}

	if (name.length > CAT_NAME_MAX_LENGTH) {
		return `Name must be <= ${CAT_NAME_MAX_LENGTH} characters`;
	}

	return null;
}

export function validateCatDescription(
	description: string | null | undefined,
): string | null {
	if (!description) {
		return null;
	}

	if (description.length > CAT_DESCRIPTION_MAX_LENGTH) {
		return `Description must be <= ${CAT_DESCRIPTION_MAX_LENGTH} characters`;
	}

	return null;
}

export function validateCollectionName(
	name: string | null | undefined,
): string | null {
	if (!name || !name.trim()) {
		return "Missing name";
	}

	if (name.length > COLLECTION_NAME_MAX_LENGTH) {
		return `Name must be <= ${COLLECTION_NAME_MAX_LENGTH} characters`;
	}

	return null;
}

export function validateCollectionDescription(
	description: string | null | undefined,
): string | null {
	if (!description) {
		return null;
	}

	if (description.length > COLLECTION_DESCRIPTION_MAX_LENGTH) {
		return `Description must be <= ${COLLECTION_DESCRIPTION_MAX_LENGTH} characters`;
	}

	return null;
}

export function validateComment(
	comment: string | null | undefined,
): string | null {
	if (comment === null || comment === undefined) {
		return "Missing comment";
	}

	const trimmed = comment.trim();
	if (!trimmed) {
		return "Comment cannot be empty";
	}

	if (trimmed.length > COMMENT_MAX_LENGTH) {
		return `Comment must be <= ${COMMENT_MAX_LENGTH} characters`;
	}

	return null;
}

export function parseCatTags(
	rawTags: string | null | undefined,
): { tags: string[]; error: string | null } {
	if (!rawTags) {
		return { tags: [], error: null };
	}

	const normalized = rawTags
		.split(",")
		.map((tag) => tag.trim().toLowerCase())
		.filter(Boolean);

	const uniqueTags = Array.from(new Set(normalized));

	if (uniqueTags.length > CAT_TAGS_MAX) {
		return { tags: [], error: `Too many tags (max ${CAT_TAGS_MAX})` };
	}

	if (uniqueTags.some((tag) => tag.length > CAT_TAG_MAX_LENGTH)) {
		return {
			tags: [],
			error: `Tags must be <= ${CAT_TAG_MAX_LENGTH} characters`,
		};
	}

	return { tags: uniqueTags, error: null };
}

export function parseCoordinate(
	value: string | null | undefined,
	type: "latitude" | "longitude",
): { value: number | null; error: string | null } {
	if (!value) {
		return { value: null, error: null };
	}

	const parsed = Number.parseFloat(value);
	if (Number.isNaN(parsed)) {
		return { value: null, error: `Invalid ${type}` };
	}

	if (type === "latitude" && (parsed < -90 || parsed > 90)) {
		return { value: null, error: "Latitude must be between -90 and 90" };
	}

	if (type === "longitude" && (parsed < -180 || parsed > 180)) {
		return { value: null, error: "Longitude must be between -180 and 180" };
	}

	return { value: parsed, error: null };
}

export function parseLimitParam(
	rawLimit: string | null | undefined,
	defaultValue = 20,
	maxValue = 50,
): { limit: number; error: string | null } {
	if (!rawLimit) {
		return { limit: defaultValue, error: null };
	}

	const parsed = Number.parseInt(rawLimit, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return { limit: defaultValue, error: "Invalid limit" };
	}

	return { limit: Math.min(parsed, maxValue), error: null };
}

export function parsePageParam(
	rawPage: string | null | undefined,
	defaultValue = 1,
): { page: number; error: string | null } {
	if (!rawPage) {
		return { page: defaultValue, error: null };
	}

	const parsed = Number.parseInt(rawPage, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return { page: defaultValue, error: "Invalid page" };
	}

	return { page: parsed, error: null };
}

export function validateTagSearchMode(
	mode: string | null | undefined,
): { mode: "any" | "all"; error: string | null } {
	if (!mode) {
		return { mode: "any", error: null };
	}

	if (mode !== "any" && mode !== "all") {
		return { mode: "any", error: "Invalid mode (expected any|all)" };
	}

	return { mode, error: null };
}

export function isValidUuid(value: string | null | undefined): boolean {
	if (!value) return false;
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(value);
}

export type FollowAction = "follow" | "unfollow";

export function parseFollowAction(
	rawAction: string | null | undefined,
): { action: FollowAction; error: string | null } {
	if (!rawAction) {
		return { action: "follow", error: null };
	}

	if (rawAction !== "follow" && rawAction !== "unfollow") {
		return { action: "follow", error: "Invalid action (expected follow|unfollow)" };
	}

	return { action: rawAction, error: null };
}

export function parseFollowCursor(
	rawCursor: string | null | undefined,
): { cursor: string | null; error: string | null } {
	if (!rawCursor) {
		return { cursor: null, error: null };
	}

	const timestamp = Date.parse(rawCursor);
	if (Number.isNaN(timestamp)) {
		return { cursor: null, error: "Invalid cursor" };
	}

	return { cursor: new Date(timestamp).toISOString(), error: null };
}

export type ParsedBase64Image = {
	arrayBuffer: ArrayBuffer;
	byteLength: number;
	contentType: AllowedImageMimeType;
	extension: string;
};

type ParseBase64ImageOptions = {
	fieldName?: string;
	maxBytes?: number;
};

export function parseBase64Image(
	base64: string | null | undefined,
	options?: ParseBase64ImageOptions,
): { image: ParsedBase64Image | null; error: string | null; status?: number } {
	const fieldName = options?.fieldName ?? "image_base64";
	const maxBytes = options?.maxBytes ?? CAT_IMAGE_MAX_BYTES;

	if (!base64) {
		return { image: null, error: `Missing ${fieldName}`, status: 400 };
	}

	let working = base64.trim();
	let contentType: AllowedImageMimeType = "image/jpeg";

	const dataUrlMatch = working.match(/^data:(.+);base64,(.*)$/);
	if (dataUrlMatch) {
		const detectedType = dataUrlMatch[1];
		if (ALLOWED_IMAGE_MIME_TYPES.includes(detectedType as AllowedImageMimeType)) {
			contentType = detectedType as AllowedImageMimeType;
		} else {
			return {
				image: null,
				error: `Unsupported content type for ${fieldName}`,
				status: 400,
			};
		}
		working = dataUrlMatch[2];
	}

	if (!dataUrlMatch) {
		// If the caller omitted the prefix we still need to ensure the mime type is allowed.
		contentType = "image/jpeg";
	}

	let binaryString: string;
	try {
		binaryString = atob(working);
	} catch {
		return {
			image: null,
			error: `Invalid base64 payload for ${fieldName}`,
			status: 400,
		};
	}

	if (!binaryString.length) {
		return { image: null, error: `${fieldName} data is empty`, status: 400 };
	}

	if (binaryString.length > maxBytes) {
		return {
			image: null,
			error: `${fieldName} exceeds ${maxBytes / (1024 * 1024)}MB limit`,
			status: 413,
		};
	}

	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i += 1) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	return {
		image: {
			arrayBuffer: bytes.buffer,
			byteLength: bytes.byteLength,
			contentType,
			extension: MIME_EXTENSION_MAP[contentType],
		},
		error: null,
	};
}
