-- Arena mode — a campaign type optimized for combat testing. Drops the
-- existing setting_mode check constraint and recreates it with the new value.
alter table public.campaigns
  drop constraint if exists campaigns_setting_mode_check;

alter table public.campaigns
  add constraint campaigns_setting_mode_check
  check (setting_mode in ('homebrew', 'module', 'generated', 'arena'));
