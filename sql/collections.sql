-- Collections schema and atomic helpers.
-- Run this file against your Supabase database (e.g. via `supabase db push`)
-- so collection endpoints can operate with consistent counts.

create table if not exists public.collections (
	id uuid primary key,
	owner_username text not null references public.users (username) on delete cascade,
	name text not null,
	description text,
	is_public boolean not null default true,
	cat_count integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (owner_username, name)
);

create table if not exists public.collection_cats (
	collection_id uuid not null references public.collections (id) on delete cascade,
	cat_id uuid not null references public.cats (id) on delete cascade,
	added_at timestamptz not null default now(),
	primary key (collection_id, cat_id)
);

create index if not exists collection_cats_collection_idx
	on public.collection_cats (collection_id, added_at desc);

create index if not exists collection_cats_cat_idx
	on public.collection_cats (cat_id);

create or replace function public.create_collection_with_count(
	p_id uuid,
	p_owner_username text,
	p_name text,
	p_description text
) returns public.collections
language sql
as $$
with inserted as (
	insert into public.collections (
		id,
		owner_username,
		name,
		description,
		is_public
	)
	values (
		p_id,
		p_owner_username,
		p_name,
		nullif(trim(p_description), ''),
		true
	)
	on conflict (owner_username, name) do nothing
	returning *
)
select * from inserted;
$$;

create or replace function public.add_cat_to_collection_with_count(
	p_collection_id uuid,
	p_cat_id uuid,
	p_owner_username text
) returns integer
language sql
as $$
with target as (
	select id
	from public.collections
	where id = p_collection_id and owner_username = p_owner_username
),
inserted as (
	insert into public.collection_cats (collection_id, cat_id)
	select id, p_cat_id from target
	on conflict (collection_id, cat_id) do nothing
	returning 1
),
updated as (
	update public.collections
	set cat_count = cat_count + coalesce((select count(*) from inserted), 0),
		updated_at = now()
	where id = p_collection_id
		and owner_username = p_owner_username
	returning cat_count
)
select cat_count from updated;
$$;

create or replace function public.remove_cat_from_collection_with_count(
	p_collection_id uuid,
	p_cat_id uuid,
	p_owner_username text
) returns integer
language sql
as $$
with target as (
	select id
	from public.collections
	where id = p_collection_id and owner_username = p_owner_username
),
deleted as (
	delete from public.collection_cats
	using target
	where collection_cats.collection_id = target.id
		and collection_cats.cat_id = p_cat_id
	returning 1
),
updated as (
	update public.collections
	set cat_count = greatest(
			cat_count - coalesce((select count(*) from deleted), 0),
			0
		),
		updated_at = now()
	where id = p_collection_id
		and owner_username = p_owner_username
	returning cat_count
)
select cat_count from updated;
$$;
