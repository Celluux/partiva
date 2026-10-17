-- Business version conflicts are final HTTP 409 responses, never serialization retries.
begin;
do $$ declare f record; definition text; begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='partiva_private' and p.proname in ('save_part','column_action','part_action','sale_action','company_save') loop
    definition=pg_get_functiondef(f.oid);
    execute replace(definition, 'errcode=''40001''', 'errcode=''PT409''');
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
