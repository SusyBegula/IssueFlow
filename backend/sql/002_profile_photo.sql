alter table app_users add column avatar_url text
    check (avatar_url is null or length(avatar_url) <= 350000);
