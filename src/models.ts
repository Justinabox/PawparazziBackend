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
	username: string;
	description: string | null;
	location: CatLocation;
	image_url: string;
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
};

export type CatResponsePayload = {
	cat: Cat;
};

export type CatListPayload = {
	cats: Cat[];
	next_cursor: string | null;
};

export type TagSearchMode = "any" | "all";

export type FollowRecord = {
	follower_username: string;
	followee_username: string;
	followed_at: string;
};

export type FollowerSummary = {
	username: string;
	bio: string | null;
	location: string | null;
	followed_at: string;
};


