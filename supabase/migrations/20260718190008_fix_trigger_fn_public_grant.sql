-- The earlier revoke only touched anon/authenticated; PostgreSQL also grants
-- EXECUTE to PUBLIC by default on function creation, which anon/authenticated
-- inherit from. Revoke that too — these are trigger-only functions.
revoke execute on function public.fn_apply_medicao() from public;
revoke execute on function public.handle_new_user() from public;
