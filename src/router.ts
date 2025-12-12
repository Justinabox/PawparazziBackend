import {
	handleChangeAvatarRequest,
	handleChangePasswordRequest,
	handleCheckUsernameRequest,
	handleGetUserProfileRequest,
	handleLoginRequest,
	handleRegisterRequest,
	handleUpdateUserRequest,
} from "./routes/userRoutes";
import {
	handleFollowUserRequest,
	handleListFollowersRequest,
	handleListFollowingRequest,
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
import {
	handleAddCatToCollectionRequest,
	handleCreateCollectionRequest,
	handleDeleteCollectionRequest,
	handleGetCollectionRequest,
	handleListCollectionsRequest,
	handleRemoveCatFromCollectionRequest,
	handleUpdateCollectionRequest,
} from "./routes/collections";
import {
	handleAddCommentRequest,
	handleDeleteCommentRequest,
	handleListCommentsRequest,
} from "./routes/comments";

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

	if (url.pathname === "/users/profile" && request.method === "GET") {
		return handleGetUserProfileRequest(request, env);
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

	if (url.pathname === "/users/listFollowing" && request.method === "GET") {
		return handleListFollowingRequest(request, env);
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

	if (url.pathname === "/cats/comments/add" && request.method === "POST") {
		return handleAddCommentRequest(request, env);
	}

	if (url.pathname === "/cats/comments/list" && request.method === "GET") {
		return handleListCommentsRequest(request, env);
	}

	if (url.pathname === "/cats/comments/delete" && request.method === "POST") {
		return handleDeleteCommentRequest(request, env);
	}

	if (url.pathname === "/cats" && request.method === "GET") {
		return handleCatsRequest(request, env);
	}

	// Collection routes
	if (url.pathname === "/collections/create" && request.method === "POST") {
		return handleCreateCollectionRequest(request, env);
	}

	if (url.pathname === "/collections/list" && request.method === "GET") {
		return handleListCollectionsRequest(request, env);
	}

	if (url.pathname === "/collections/get" && request.method === "GET") {
		return handleGetCollectionRequest(request, env);
	}

	if (url.pathname === "/collections/update" && request.method === "POST") {
		return handleUpdateCollectionRequest(request, env);
	}

	if (url.pathname === "/collections/delete" && request.method === "POST") {
		return handleDeleteCollectionRequest(request, env);
	}

	if (url.pathname === "/collections/addCat" && request.method === "POST") {
		return handleAddCatToCollectionRequest(request, env);
	}

	if (url.pathname === "/collections/removeCat" && request.method === "POST") {
		return handleRemoveCatFromCollectionRequest(request, env);
	}

	// Default root response kept for tests / simple health checks
	if (url.pathname === "/") {
		return new Response("Hello World!", { status: 200 });
	}

	return new Response("Not found", { status: 404 });
}


