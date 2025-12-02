import type { ApiResponse } from "./models";
import { HttpError } from "./errors";

export function jsonResponse<T extends object>(
	data: ApiResponse<T>,
	status = 200,
): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export function ok<T extends object = {}>(data: T, status = 200): Response {
	const payload = {
		...(data as T),
		success: true as const,
		error: "" as const,
	};
	return jsonResponse(payload, status);
}

export function fail<T extends object = {}>(
	message: string,
	status = 400,
	extra?: T,
): Response {
	const payload = {
		...(extra ?? ({} as T)),
		success: false as const,
		error: message,
	};
	return jsonResponse(payload, status);
}

export function handleRouteError(err: unknown): Response {
	console.error("Request failed", err);

	if (err instanceof HttpError) {
		return fail(err.message, err.status);
	}

	return fail("Internal server error", 500);
}


