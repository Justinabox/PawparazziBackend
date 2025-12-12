export type ApiSuccess<T extends object = {}> = T & {
	success: true;
	error: "";
};

export type ApiFailure<T extends object = {}> = T & {
	success: false;
	error: string;
};

export type ApiResponse<T extends object = {}> = ApiSuccess<T> | ApiFailure<T>;

export type UserProfile = {
	username: string;
	bio: string | null;
	location: string | null;
	email: string;
	avatar_url: string | null;
	post_count: number;
	follower_count: number;
	following_count: number;
};

export type GuestUser = {
	username: string;
	bio: string | null;
	location: string | null;
	avatar_url: string | null;
	post_count: number;
	follower_count: number;
	following_count: number;
	is_followed: boolean | null;
	collections: Collection[];
	collections_next_cursor: string | null;
};

export type BodyFields = Record<string, string>;

export type CatLocation = {
	latitude: number | null;
	longitude: number | null;
};

export type Cat = {
	id: string;
	name: string;
	tags: string[];
	created_at: string;
	description: string | null;
	location: CatLocation;
	image_url: string;
	likes: number;
	poster: GuestUser;
	user_liked: boolean;
};

export type CatRecord = {
	id: string;
	name: string;
	tags: string[] | null;
	created_at: string;
	username: string;
	description: string | null;
	location_latitude: number | null;
	location_longitude: number | null;
	r2_path: string;
	likes: number | null;
};

export type CatResponsePayload = {
	cat: Cat;
};

export type CatListPayload = {
	cats: Cat[];
	next_cursor: string | null;
};

export type CatLikePayload = {
	cat_id: string;
	likes: number;
	liked: boolean;
};

export type Comment = {
	comment_id: string;
	cat_id: string;
	comment: string;
	comment_at: string;
	user: GuestUser;
	is_owner: boolean;
};

export type CommentResponsePayload = {
	comment: Comment;
};

export type CommentListPayload = {
	comments: Comment[];
	next_page: number | null;
};

export type TagSearchMode = "any" | "all";

export type FollowRecord = {
	follower_username: string;
	followee_username: string;
	followed_at: string;
};

export type FollowEdge = {
	user: GuestUser;
	followed_at: string;
};

export type CollectionRow = {
	id: string;
	owner_username: string;
	name: string;
	description: string | null;
	is_public: boolean;
	cat_count: number | string | null;
	created_at: string;
	updated_at: string;
};

export type Collection = {
	id: string;
	owner: GuestUser;
	name: string;
	description: string | null;
	cat_count: number;
	created_at: string;
};

export type CollectionRecord = Collection & {
	is_public: boolean;
	updated_at: string;
};

export type CollectionListPayload = {
	collections: Collection[];
	next_cursor: string | null;
};

export type CollectionDetailPayload = {
	collection: Collection;
	cats: Cat[];
	next_cursor: string | null;
};

export type CollectionCountPayload = {
	collection_id: string;
	cat_count: number;
};


