import type { BodyFields } from "./models";

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

export function isValidSha256Hex(hash: string | null | undefined): boolean {
	if (!hash) return false;
	return /^[a-f0-9]{64}$/i.test(hash);
}

export async function parseBodyFields(request: Request): Promise<BodyFields> {
	const contentType = request.headers.get("content-type") || "";

	// JSON body
	if (contentType.includes("application/json")) {
		const json = await request.json().catch(() => ({}));
		const fields: BodyFields = {};
		if (json && typeof json === "object") {
			for (const [key, value] of Object.entries(
				json as Record<string, unknown>,
			)) {
				if (typeof value === "string") {
					fields[key] = value;
				}
			}
		}
		return fields;
	}

	// Form body (x-www-form-urlencoded or multipart)
	if (
		contentType.includes("application/x-www-form-urlencoded")
		|| contentType.includes("multipart/form-data")
	) {
		const formData = await request.formData();
		const fields: BodyFields = {};
		for (const [key, value] of formData.entries()) {
			if (typeof value === "string") {
				fields[key] = value;
			}
		}
		return fields;
	}

	// Fallback: treat raw body as URL-encoded query string
	const text = await request.text();
	const params = new URLSearchParams(text);
	const fields: BodyFields = {};
	params.forEach((value, key) => {
		fields[key] = value;
	});
	return fields;
}


