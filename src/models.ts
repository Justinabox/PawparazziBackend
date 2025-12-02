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


