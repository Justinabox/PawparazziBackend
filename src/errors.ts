export class HttpError extends Error {
	status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.name = "HttpError";
		this.status = status;
	}
}

export class AuthError extends HttpError {
	constructor(message = "Unauthorized") {
		super(message, 401);
		this.name = "AuthError";
	}
}

export class ConflictError extends HttpError {
	constructor(message = "Conflict") {
		super(message, 409);
		this.name = "ConflictError";
	}
}


