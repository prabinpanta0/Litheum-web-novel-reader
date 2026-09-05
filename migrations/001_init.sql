-- Litheum sync schema (Neon Postgres)
-- Run this against your production branch, or let a migration step apply it.

create table if not exists users (
  id            text primary key,
  email         text unique not null,
  salt          text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- One row per user; holds the whole synced reading state (library, history,
-- bookmarks, plugins) serialized as JSON, so the client contract stays free.
create table if not exists litheum_state (
  user_id    text primary key references users(id),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists litheum_state_updated_at on litheum_state (updated_at);
