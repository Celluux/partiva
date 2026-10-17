begin;
alter policy members_read on public.workspace_members using(partiva_private.member(workspace_id) and (user_id=(select auth.uid()) or partiva_private.can('admin')));
alter policy preferences_read on public.user_preferences using(user_id=(select auth.uid()) and partiva_private.member(workspace_id));
commit;
