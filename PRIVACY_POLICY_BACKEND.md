# Privacy Policy

Effective date: December 11, 2025  
Contact: privacy@justzhu.com

## What We Store

- **Accounts**: username, email, password hash, session token, profile fields (bio, location text, avatar key), and per-user counts (posts, followers, following).
- **Content**: cat posts (IDs, name/title, description, tags, created time, image object key, optional latitude/longitude), collections (IDs, owner username, name, description, visibility flag, counts, timestamps), likes, follows, and collection membership records.
- **Media**: avatars and cat images are stored as objects in the configured Cloudflare R2 bucket. The database only stores the R2 object keys.
- **Session security**: session tokens are randomized strings stored in the `users` table and are rotated on each login. Passwords are stored only as hashes (never plaintext).

## How We Use and Process Data

- **Account and authentication**: create accounts, validate credentials by comparing password hashes, issue session tokens, and look up users by session token for authenticated requests.
- **Core app features**: render feeds, profiles, follows, likes, and collections via provider Supabase.
- **Media delivery**: serve images from Cloudflare R2 via a cloudflare CDN; when you change an avatar, the prior avatar object is deleted when possible.
- **Metrics**: maintain per-user counts (post, follower, following) and per-collection cat counts.

## Sharing and Transfers

- **Other users**: posts, tags, counts, and profile fields you choose to share are viewable in the app.
- **Vendors**: data is stored in Supabase (Postgres database) and Cloudflare (Workers runtime and R2 object storage). These vendors process data under their platform terms and security controls.
- **Legal/safety**: data may be disclosed if required by law or to protect the service and users.
- **No sale of data**: we do not sell personal information.

## Logs and Diagnostics

- Cloudflare Workers may record request metadata (time, URL, IP as provided by Cloudflare, user agent) and error traces for reliability and abuse prevention. Supabase may log database events for operations and auditing. Log retention follows provider defaults unless legally required to keep longer.

## Security Measures

- TLS for data in transit between the Worker, Supabase, and R2.
- Provider-managed encryption at rest for Supabase Postgres and Cloudflare R2.
- Session tokens scoped to one user and rotated on login; stored server-side only.
- Avatar replacement attempts to delete prior R2 objects to minimize residual data.
- Access to Supabase and R2 is restricted via secrets configured in the worker environment.

## Data Retention and Deletion

- Account, profile, and content records stay active while your account exists. If you request deletion, we remove account rows and associated content where possible and delete corresponding R2 media objects; backups and provider logs may persist for a limited time under provider policies or legal requirements.
- Metrics and relational integrity may require retaining minimal derived records (e.g., counts) after deletion, but they will no longer be linked to an active account.

## Your Controls

- Update profile fields and delete content in-app where supported.
- Disable location tagging; location coordinates are only stored when you choose to attach them to a post.
- Revoke camera, photos, microphone, or location permissions in your device settings (core posting features may require them).
- Request account deletion or data export at `privacy@justzhu.com`. We will verify ownership via your account email before actioning requests.

## Children's Privacy

- Pawparazzi is not intended for children under 13, and we do not knowingly collect personal information from them.

## Changes

- We may update this policy. Material changes will be communicated in-app or via appropriate channels. Continued use after updates means you accept the revised policy.
