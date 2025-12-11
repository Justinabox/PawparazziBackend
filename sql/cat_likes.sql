-- Atomic helpers for cat like mutations.
-- Run this file against your Supabase database (e.g. via `supabase db push`)
-- so the CatLikeService RPC calls have corresponding functions.

create or replace function public.like_cat_with_count(
	p_cat_id uuid,
	p_username text
) returns integer
language sql
as $$
with inserted as (
	insert into public.likes (cat_id, username)
	values (p_cat_id, p_username)
	on conflict (cat_id, username) do nothing
	returning 1
),
updated as (
	update public.cats
	set likes = coalesce(likes, 0) + coalesce((select count(*) from inserted), 0)
	where id = p_cat_id
	returning likes
)
select likes from updated;
$$;

create or replace function public.unlike_cat_with_count(
	p_cat_id uuid,
	p_username text
) returns integer
language sql
as $$
with deleted as (
	delete from public.likes
	where cat_id = p_cat_id and username = p_username
	returning 1
),
updated as (
	update public.cats
	set likes = greatest(coalesce(likes, 0) - coalesce((select count(*) from deleted), 0), 0)
	where id = p_cat_id
	returning likes
)
select likes from updated;
$$;
