create table app_users (
    id uuid primary key default gen_random_uuid(),
    username text not null unique check (length(username) between 1 and 100),
    password_hash text not null,
    name text not null check (length(trim(name)) between 1 and 100),
    color text not null default 'blue' check (color in ('violet','peach','mint','rose','blue'))
);
create table projects (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 1 and 100),
    description text not null default '' check (length(description) <= 2000),
    code text not null check (code ~ '^[A-Z0-9]{2,6}$'),
    color text not null default 'blue' check (color in ('violet','peach','mint','rose','blue')),
    owner_id uuid not null references app_users(id),
    created_at timestamptz not null default now()
);
create table project_members (
    project_id uuid not null references projects(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    primary key (project_id, user_id)
);
create table issues (
    id uuid primary key default gen_random_uuid(),
    number bigint generated always as identity unique,
    project_id uuid not null references projects(id) on delete cascade,
    title text not null check (length(trim(title)) between 1 and 200),
    description text not null default '' check (length(description) <= 10000),
    status text not null default 'todo' check (status in ('todo','in_progress','blocked','done')),
    priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
    assignee_id uuid references app_users(id) on delete set null,
    created_by uuid not null references app_users(id),
    label text not null default 'General' check (length(label) <= 40),
    due_date date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table sessions (
    token_hash text primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    expires_at timestamptz not null
);
create index on projects(owner_id);
create index on project_members(user_id, project_id);
create index on issues(project_id, status);
create index on issues(assignee_id);
create index on issues(created_by);
create index on sessions(expires_at);
