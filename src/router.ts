import {
	handleChangeAvatarRequest,
	handleChangePasswordRequest,
	handleCheckUsernameRequest,
	handleLoginRequest,
	handleRegisterRequest,
	handleUpdateUserRequest,
} from "./routes/userRoutes";
import {
	handleFollowUserRequest,
	handleListFollowersRequest,
} from "./routes/followRoutes";
import {
	handleCatsRequest,
	handleCreateCatRequest,
	handleGetCatRequest,
	handleLikeCatRequest,
	handleRemoveLikeCatRequest,
	handleListCatsRequest,
	handleSearchCatsByTagsRequest,
} from "./routes/cats";

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

	if (url.pathname === "/users/changeAvatar" && request.method === "POST") {
		return handleChangeAvatarRequest(request, env);
	}

	if (url.pathname === "/users/follow" && request.method === "POST") {
		return handleFollowUserRequest(request, env);
	}

	if (url.pathname === "/users/listFollowers" && request.method === "GET") {
		return handleListFollowersRequest(request, env);
	}

	// Cats routes
	if (url.pathname === "/cats/post" && request.method === "POST") {
		return handleCreateCatRequest(request, env);
	}

	if (url.pathname === "/cats/list" && request.method === "GET") {
		return handleListCatsRequest(request, env);
	}

	if (url.pathname === "/cats/get" && request.method === "GET") {
		return handleGetCatRequest(request, env);
	}

	if (url.pathname === "/cats/search/tags" && request.method === "GET") {
		return handleSearchCatsByTagsRequest(request, env);
	}

	if (url.pathname === "/cats/like" && request.method === "POST") {
		return handleLikeCatRequest(request, env);
	}

	if (url.pathname === "/cats/removeLike" && request.method === "POST") {
		return handleRemoveLikeCatRequest(request, env);
	}

	if (url.pathname === "/cats" && request.method === "GET") {
		return handleCatsRequest(request, env);
	}

	// Default root response kept for tests / simple health checks
	if (url.pathname === "/") {
		return new Response("Hello World!", { status: 200 });
	}

	return new Response("Not found", { status: 404 });
}


