-- Read-only inventory. No personal records or credentials are selected.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in
('workspaces','workspace_members','parts','board_columns','part_photos','part_events','part_sales','company_events','app_configuration','user_preferences')
order by table_name,ordinal_position;
