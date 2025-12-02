type EnvWithPublicBase = Env & {
	R2_PUBLIC_BASE_URL?: string;
	CDN_BASE_URL?: string;
};

function normalizeBaseUrl(env: EnvWithPublicBase): string {
	const base = env.R2_PUBLIC_BASE_URL ?? env.CDN_BASE_URL ?? "";
	if (!base) {
		return "";
	}
	return base.endsWith("/") ? base.slice(0, -1) : base;
}

function normalizePath(path: string): string {
	return path.startsWith("/") ? path.slice(1) : path;
}

export function buildPublicR2Url(r2Path: string, env: Env): string {
	const envWithBase = env as EnvWithPublicBase;
	const base = normalizeBaseUrl(envWithBase);
	if (!base) {
		return r2Path;
	}

	return `${base}/${normalizePath(r2Path)}`;
}

export function buildOptionalPublicR2Url(
	r2Path: string | null | undefined,
	env: Env,
): string | null {
	if (!r2Path) {
		return null;
	}
	return buildPublicR2Url(r2Path, env);
}


