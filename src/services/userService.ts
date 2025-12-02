import type { SupabaseClientType } from "../supabaseClient";
import type { UserProfile } from "../models";
import { AuthError, ConflictError, HttpError } from "../errors";
import { generateSessionToken } from "../validation";

export class UserService {
	constructor(private readonly supabase: SupabaseClientType) {}

	async isUsernameAvailable(username: string): Promise<boolean> {
		const { error, count } = await this.supabase
			.from("users")
			.select("username", { count: "exact", head: true })
			.eq("username", username);

		if (error) {
			throw new HttpError("Failed to check username availability", 500);
		}

		return (count ?? 0) === 0;
	}

	async registerUser(
		username: string,
		passwordHash: string,
		email: string,
	): Promise<{ sessionToken: string; user: UserProfile }> {
		const available = await this.isUsernameAvailable(username);
		if (!available) {
			throw new ConflictError("Username is already taken");
		}

		const sessionToken = generateSessionToken();

		const { data, error } = await this.supabase
			.from("users")
			.insert({
				username,
				password_hash: passwordHash,
				email,
				session_token: sessionToken,
			})
			.select("username,bio,location,email")
			.single();

		if (error || !data) {
			throw new HttpError("Failed to register user", 500);
		}

		return {
			sessionToken,
			user: {
				username: data.username,
				bio: data.bio,
				location: data.location,
				email: data.email,
			},
		};
	}

	async loginUser(
		username: string,
		passwordHash: string,
	): Promise<{ sessionToken: string; user: UserProfile }> {
		const { data, error } = await this.supabase
			.from("users")
			.select("username,bio,location,email,password_hash")
			.eq("username", username)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to login", 500);
		}

		if (!data || data.password_hash !== passwordHash) {
			throw new AuthError("Invalid username or password");
		}

		const sessionToken = generateSessionToken();

		const { error: updateError } = await this.supabase
			.from("users")
			.update({ session_token: sessionToken })
			.eq("username", username);

		if (updateError) {
			throw new HttpError("Failed to create session token", 500);
		}

		const user: UserProfile = {
			username: data.username,
			bio: data.bio,
			location: data.location,
			email: data.email,
		};

		return { sessionToken, user };
	}

	private async getUserBySessionTokenInternal(
		sessionToken: string,
	): Promise<{ profile: UserProfile; passwordHash: string }> {
		const { data, error } = await this.supabase
			.from("users")
			.select("username,bio,location,email,password_hash")
			.eq("session_token", sessionToken)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to load user by session token", 500);
		}

		if (!data) {
			throw new AuthError("Invalid session token");
		}

		const profile: UserProfile = {
			username: data.username,
			bio: data.bio,
			location: data.location,
			email: data.email,
		};

		return { profile, passwordHash: data.password_hash };
	}

	async getUserBySessionToken(sessionToken: string): Promise<UserProfile> {
		const { profile } = await this.getUserBySessionTokenInternal(sessionToken);
		return profile;
	}

	async updateUserProfile(
		sessionToken: string,
		bio: string | null,
		location: string | null,
	): Promise<UserProfile> {
		// Ensure session token is valid and get username
		const { profile } = await this.getUserBySessionTokenInternal(sessionToken);

		const { data, error } = await this.supabase
			.from("users")
			.update({ bio, location })
			.eq("username", profile.username)
			.select("username,bio,location,email")
			.single();

		if (error || !data) {
			throw new HttpError("Failed to update profile", 500);
		}

		return {
			username: data.username,
			bio: data.bio,
			location: data.location,
			email: data.email,
		};
	}

	async changePassword(
		sessionToken: string,
		currentPasswordHash: string,
		newPasswordHash: string,
	): Promise<void> {
		const { profile, passwordHash } = await this.getUserBySessionTokenInternal(
			sessionToken,
		);

		if (passwordHash !== currentPasswordHash) {
			throw new AuthError("Invalid current password");
		}

		const { error } = await this.supabase
			.from("users")
			.update({ password_hash: newPasswordHash })
			.eq("username", profile.username);

		if (error) {
			throw new HttpError("Failed to change password", 500);
		}
	}
}


