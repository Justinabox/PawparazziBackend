import {
	handleChangePasswordRequest,
	handleCheckUsernameRequest,
	handleLoginRequest,
	handleRegisterRequest,
	handleUpdateUserRequest,
} from "./routes/userRoutes";
import { handleCatsRequest } from "./routes/cats";

export async function handleRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const url = new URL(request.url);

	// User-related routes
	if (url.pathname === "/users/checkUsername" && request.method === "GET") {
		return handleCheckUsernameRequest(request, env);
	}

	if (url.pathname === "/users/register" && request.method === "POST") {
		return handleRegisterRequest(request, env);
	}

	if (url.pathname === "/users/login" && request.method === "POST") {
		return handleLoginRequest(request, env);
	}

	if (url.pathname === "/users/update" && request.method === "POST") {
		return handleUpdateUserRequest(request, env);
	}

	if (url.pathname === "/users/changePassword" && request.method === "POST") {
		return handleChangePasswordRequest(request, env);
	}

	// Existing example route
	if (url.pathname === "/cats") {
		return handleCatsRequest(env);
	}

	// Default root response kept for tests / simple health checks
	if (url.pathname === "/") {
		return new Response("Hello World!", { status: 200 });
	}

	return new Response("Not found", { status: 404 });
}


