import type { SupabaseClientType } from "../supabaseClient";
import type { UserProfile } from "../models";
import { AuthError, ConflictError, HttpError } from "../errors";
import {
	generateSessionToken,
	normalizeEmail,
	type ParsedBase64Image,
} from "../validation";
import { buildOptionalPublicR2Url } from "../r2";

type UserRecord = {
	username: string;
	bio: string | null;
	location: string | null;
	email: string;
	r2_avatar: string | null;
};

type UserRecordWithPassword = UserRecord & { password_hash: string };

export class UserService {
	constructor(
		private readonly supabase: SupabaseClientType,
		private readonly env: Env,
	) {}

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

	async isEmailAvailable(email: string): Promise<boolean> {
		const { error, count } = await this.supabase
			.from("users")
			.select("email", { count: "exact", head: true })
			.eq("email", email);

		if (error) {
			throw new HttpError("Failed to check email availability", 500);
		}

		return (count ?? 0) === 0;
	}

	async registerUser(
		username: string,
		passwordHash: string,
		email: string,
	): Promise<{ sessionToken: string; user: UserProfile }> {
		const normalizedEmail = normalizeEmail(email);
		if (!normalizedEmail) {
			throw new HttpError("Invalid email address", 500);
		}

		const [usernameAvailable, emailAvailable] = await Promise.all([
			this.isUsernameAvailable(username),
			this.isEmailAvailable(normalizedEmail),
		]);

		if (!usernameAvailable) {
			throw new ConflictError("Username is already taken");
		}

		if (!emailAvailable) {
			throw new ConflictError("Email is already registered");
		}

		const sessionToken = generateSessionToken();

		const { data, error } = await this.supabase
			.from("users")
			.insert({
				username,
				password_hash: passwordHash,
				email: normalizedEmail,
				session_token: sessionToken,
			})
			.select("username,bio,location,email,r2_avatar")
			.single();

		if (error || !data) {
			throw new HttpError("Failed to register user", 500);
		}

		return {
			sessionToken,
			user: this.mapUserRecordToProfile(data as UserRecord),
		};
	}

	async loginUser(
		email: string,
		passwordHash: string,
	): Promise<{ sessionToken: string; user: UserProfile }> {
		const normalizedEmail = normalizeEmail(email);
		if (!normalizedEmail) {
			throw new AuthError("Invalid email or password");
		}

		const { data, error } = await this.supabase
			.from("users")
			.select("username,bio,location,email,password_hash,r2_avatar")
			.eq("email", normalizedEmail)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to login", 500);
		}

		if (!data || data.password_hash !== passwordHash) {
			throw new AuthError("Invalid email or password");
		}

		const sessionToken = generateSessionToken();

		const { error: updateError } = await this.supabase
			.from("users")
			.update({ session_token: sessionToken })
			.eq("email", normalizedEmail);

		if (updateError) {
			throw new HttpError("Failed to create session token", 500);
		}

		const user = this.mapUserRecordToProfile(data as UserRecord);

		return { sessionToken, user };
	}

	private async getUserRecordBySessionToken(
		sessionToken: string,
	): Promise<UserRecordWithPassword> {
		const { data, error } = await this.supabase
			.from("users")
			.select("username,bio,location,email,password_hash,r2_avatar")
			.eq("session_token", sessionToken)
			.maybeSingle();

		if (error) {
			throw new HttpError("Failed to load user by session token", 500);
		}

		if (!data) {
			throw new AuthError("Invalid session token");
		}

		return data as UserRecordWithPassword;
	}

	async getUserBySessionToken(sessionToken: string): Promise<UserProfile> {
		const record = await this.getUserRecordBySessionToken(sessionToken);
		return this.mapUserRecordToProfile(record);
	}

	async updateUserProfile(
		sessionToken: string,
		bio: string | null,
		location: string | null,
	): Promise<UserProfile> {
		// Ensure session token is valid and get username
		const record = await this.getUserRecordBySessionToken(sessionToken);

		const { data, error } = await this.supabase
			.from("users")
			.update({ bio, location })
			.eq("username", record.username)
			.select("username,bio,location,email,r2_avatar")
			.single();

		if (error || !data) {
			throw new HttpError("Failed to update profile", 500);
		}

		return this.mapUserRecordToProfile(data as UserRecord);
	}

	async changePassword(
		sessionToken: string,
		currentPasswordHash: string,
		newPasswordHash: string,
	): Promise<void> {
		const record = await this.getUserRecordBySessionToken(sessionToken);
		const passwordHash = record.password_hash;

		if (passwordHash !== currentPasswordHash) {
			throw new AuthError("Invalid current password");
		}

		const { error } = await this.supabase
			.from("users")
			.update({ password_hash: newPasswordHash })
			.eq("username", record.username);

		if (error) {
			throw new HttpError("Failed to change password", 500);
		}
	}

	async changeAvatar(
		sessionToken: string,
		avatar: ParsedBase64Image,
		r2Bucket: Env["R2_BUCKET"],
	): Promise<UserProfile> {
		const record = await this.getUserRecordBySessionToken(sessionToken);
		const newKey = `avatars/${record.username}/${crypto.randomUUID()}.${
			avatar.extension
		}`;

		await r2Bucket.put(newKey, avatar.arrayBuffer, {
			httpMetadata: { contentType: avatar.contentType },
		});

		if (record.r2_avatar) {
			await r2Bucket.delete(record.r2_avatar).catch(() => {});
		}

		const { data, error } = await this.supabase
			.from("users")
			.update({ r2_avatar: newKey })
			.eq("username", record.username)
			.select("username,bio,location,email,r2_avatar")
			.single();

		if (error || !data) {
			throw new HttpError("Failed to update avatar", 500);
		}

		return this.mapUserRecordToProfile(data as UserRecord);
	}

	private mapUserRecordToProfile(record: UserRecord): UserProfile {
		return {
			username: record.username,
			bio: record.bio,
			location: record.location,
			email: record.email,
			avatar_url: buildOptionalPublicR2Url(record.r2_avatar, this.env),
		};
	}
}


