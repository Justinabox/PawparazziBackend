-- Metrics helpers for users (post, follower, following counts).
-- Run this file against your Supabase database (e.g. via `supabase db push`)
-- so the metrics-aware services have corresponding RPC functions.

create or replace function public.create_cat_with_post_count(
	p_id uuid,
	p_name text,
	p_tags text[],
	p_username text,
	p_description text,
	p_location_latitude double precision,
	p_location_longitude double precision,
	p_r2_path text
) returns public.cats
language sql
as $$
with inserted as (
	insert into public.cats (
		id,
		name,
		tags,
		username,
		description,
		location_latitude,
		location_longitude,
		r2_path
	)
	values (
		p_id,
		p_name,
		p_tags,
		p_username,
		p_description,
		p_location_latitude,
		p_location_longitude,
		p_r2_path
	)
	returning *
),
updated as (
	update public.users
	set post_count = coalesce(post_count, 0) + coalesce((select count(*) from inserted), 0)
	where username = p_username
	returning 1
)
select * from inserted;
$$;

create or replace function public.follow_user_with_counts(
	p_follower_username text,
	p_followee_username text
) returns table (follower_following_count bigint, followee_follower_count bigint)
language sql
as $$
with inserted as (
	insert into public.follows (follower_username, followee_username)
	values (p_follower_username, p_followee_username)
	on conflict (follower_username, followee_username) do nothing
	returning 1
),
update_follower as (
	update public.users
	set following_count = coalesce(following_count, 0) + coalesce((select count(*) from inserted), 0)
	where username = p_follower_username
	returning following_count
),
update_followee as (
	update public.users
	set follower_count = coalesce(follower_count, 0) + coalesce((select count(*) from inserted), 0)
	where username = p_followee_username
	returning follower_count
)
select
	(select following_count from update_follower),
	(select follower_count from update_followee);
$$;

create or replace function public.unfollow_user_with_counts(
	p_follower_username text,
	p_followee_username text
) returns table (follower_following_count bigint, followee_follower_count bigint)
language sql
as $$
with deleted as (
	delete from public.follows
	where follower_username = p_follower_username and followee_username = p_followee_username
	returning 1
),
update_follower as (
	update public.users
	set following_count = greatest(coalesce(following_count, 0) - coalesce((select count(*) from deleted), 0), 0)
	where username = p_follower_username
	returning following_count
),
update_followee as (
	update public.users
	set follower_count = greatest(coalesce(follower_count, 0) - coalesce((select count(*) from deleted), 0), 0)
	where username = p_followee_username
	returning follower_count
)
select
	(select following_count from update_follower),
	(select follower_count from update_followee);
$$;
