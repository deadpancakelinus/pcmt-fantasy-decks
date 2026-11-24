-- Riot IDs: every current player's PCMT.gg name and Riot ID (name#tag), for pulling 4Ks and 5Ks from Riot match data.
-- Staff and site admins only (Riot IDs are not shown on the site). Safe to run again: it never overwrites a Riot ID.
--   player    players.js id (e.g. kaydeg-s4)
--   pcmt_name the name PCMT.gg shows for them (e.g. Sting for stingray-s4)
--   riot_name, riot_tag  their Riot ID, e.g. Slowbro + Dino = Slowbro#Dino
--   puuid     Riot's account id (stays the same when someone renames), filled in when a game is matched
--   region    HenrikDev region: na or eu
--   source    staff (typed on the backend) or auto (found by matching a game's stats)

create table if not exists public.riot_ids (
  player     text primary key,
  pcmt_name  text not null,
  team       text,
  region     text not null default 'na' check (region in ('na', 'eu')),
  riot_name  text,
  riot_tag   text,
  puuid      text unique,
  source     text check (source in ('staff', 'auto')),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check ((riot_name is null) = (riot_tag is null))
);
alter table public.riot_ids enable row level security;

drop policy if exists "staff read riot ids" on public.riot_ids;
create policy "staff read riot ids" on public.riot_ids for select
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff add riot ids" on public.riot_ids;
create policy "staff add riot ids" on public.riot_ids for insert
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff change riot ids" on public.riot_ids;
create policy "staff change riot ids" on public.riot_ids for update
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch())
  with check (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());
drop policy if exists "staff remove riot ids" on public.riot_ids;
create policy "staff remove riot ids" on public.riot_ids for delete
  using (exists (select 1 from public.pcmt_admins a where a.user_id = auth.uid()) or public.is_freshbatch());

-- Every player in the store now (NA Season 4 and EMEA), with their PCMT.gg name.
insert into public.riot_ids (player, pcmt_name, team, region) values
  ('heef', 'heef', 'FaZe', 'eu'),
  ('dragonflyod', 'dragonflyod', 'FaZe', 'eu'),
  ('kramvi', 'Kramvi', 'FaZe', 'eu'),
  ('thorny', 'thorny', 'FaZe', 'eu'),
  ('nana', 'nana', 'FaZe', 'eu'),
  ('night-emea', 'Night', 'ATLC', 'eu'),
  ('optimus', 'Optimus', 'ATLC', 'eu'),
  ('sky', 'Sky', 'ATLC', 'eu'),
  ('bonkashi', 'bonkashi', 'ATLC', 'eu'),
  ('ria', 'ria', 'ATLC', 'eu'),
  ('becosh', 'Becosh', 'SEAL', 'eu'),
  ('hmmmdead', 'hmmmdead', 'SEAL', 'eu'),
  ('dovie', 'Dovie', 'SEAL', 'eu'),
  ('eva', 'Eva', 'SEAL', 'eu'),
  ('otaka', 'otaka', 'SEAL', 'eu'),
  ('ghrf6', 'Ghrf6', 'SEAL', 'eu'),
  ('shipty', 'shipty', 'HOT', 'eu'),
  ('tonnoman', 'Tonnoman', 'HOT', 'eu'),
  ('sovaraa', 'sovaraa', 'HOT', 'eu'),
  ('hioz', 'Hioz', 'HOT', 'eu'),
  ('duck', 'Duck', 'HOT', 'eu'),
  ('bi0', 'bi0', 'HOT', 'eu'),
  ('kai', 'Kai', 'NIP', 'eu'),
  ('pandyro', 'Pandyro', 'NIP', 'eu'),
  ('sb', 'SB', 'NIP', 'eu'),
  ('goofy', 'goofy', 'NIP', 'eu'),
  ('jinno', 'jinno', 'NIP', 'eu'),
  ('mide', 'mide', 'LARP', 'eu'),
  ('oddlqt', 'oddlqt', 'LARP', 'eu'),
  ('kaiser', 'Kaiser', 'LARP', 'eu'),
  ('ellie', 'Ellie', 'LARP', 'eu'),
  ('synth', 'synth', 'LARP', 'eu'),
  ('sinderinho', 'sinderinho', 'XTC', 'eu'),
  ('alexx', 'alex', 'XTC', 'eu'),
  ('zidin', 'ZiDin', 'XTC', 'eu'),
  ('yessi', 'Yessi', 'XTC', 'eu'),
  ('riyako', 'Riyako', 'XTC', 'eu'),
  ('k9', 'k9', 'SOG', 'eu'),
  ('luna', 'luna', 'SOG', 'eu'),
  ('faye', 'faye', 'SOG', 'eu'),
  ('magmoz', 'magmoz', 'SOG', 'eu'),
  ('charlotte', 'Charlotte', 'SOG', 'eu'),
  ('autumn', 'autumn', 'SOG', 'eu'),
  ('alet', 'alet', 'SOG', 'eu'),
  ('jamit', 'Jamit', 'NOOT', 'eu'),
  ('king', 'King', 'NOOT', 'eu'),
  ('taylorgzz', 'taylorgzz', 'NOOT', 'eu'),
  ('haike', 'Haike', 'NOOT', 'eu'),
  ('pengu', 'Pengu', 'NOOT', 'eu'),
  ('asra', 'asra', 'NATS', 'eu'),
  ('reoken', 'reoken', 'NATS', 'eu'),
  ('spolen', 'Spolen', 'NATS', 'eu'),
  ('danaxa', 'danaxa', 'NATS', 'eu'),
  ('sy', 'sy', 'NATS', 'eu'),
  ('denial', 'denial', 'NATS', 'eu'),
  ('claps-s4', 'claps', 'FNC', 'na'),
  ('psyclone-s4', 'psyclone', 'FNC', 'na'),
  ('nameless-s4', 'nameless', 'FNC', 'na'),
  ('sylos-s4', 'Sylos', 'FNC', 'na'),
  ('radical-s4', 'radical', 'FNC', 'na'),
  ('crocman-s4', 'MrCrocMan', 'PRX', 'na'),
  ('jaden-s4', 'Jaden', 'PRX', 'na'),
  ('toastemup-s4', 'ToastEmUp', 'PRX', 'na'),
  ('tawn-s4', 'tawngay', 'PRX', 'na'),
  ('hankyjanky-s4', 'hankyjanky', 'PRX', 'na'),
  ('josh-s4', 'Josh', 'NBR', 'na'),
  ('art-s4', 'art', 'NBR', 'na'),
  ('makya-s4', 'makya', 'NBR', 'na'),
  ('platy-s4', 'platy', 'NBR', 'na'),
  ('lore-s4', 'lore', 'NBR', 'na'),
  ('avi-s4', 'avi', 'LOUD', 'na'),
  ('sizeable-s4', 'Sizeable', 'LOUD', 'na'),
  ('dino-s4', 'dino', 'LOUD', 'na'),
  ('roro-s4', 'roro', 'LOUD', 'na'),
  ('tenyaku-s4', 'tenyaku', 'LOUD', 'na'),
  ('haych-s4', 'haych', 'DEI', 'na'),
  ('snowfall-s4', 'snowfall', 'DEI', 'na'),
  ('lazy-s4', 'lazynottired', 'DEI', 'na'),
  ('slow-s4', 'slow', 'DEI', 'na'),
  ('teklo-s4', 'teklologik', 'DEI', 'na'),
  ('panda-s4', 'Panda', 'DEI', 'na'),
  ('james-s4', 'james', 'EDM', 'na'),
  ('jaypee-s4', 'jaypee', 'EDM', 'na'),
  ('li-s4', 'li', 'EDM', 'na'),
  ('corina-s4', 'corina', 'EDM', 'na'),
  ('hascan-s4', 'hascan', 'EDM', 'na'),
  ('izz-s4', 'izz', 'EDG', 'na'),
  ('ethan-s4', 'ethan', 'EDG', 'na'),
  ('dunkn-s4', 'dunkn', 'EDG', 'na'),
  ('xyn-s4', 'xyn', 'EDG', 'na'),
  ('neckolas-s4', 'Neckolas', 'EDG', 'na'),
  ('lucas-s4', 'lucas', 'WBG', 'na'),
  ('pavel-s4', 'pavel', 'WBG', 'na'),
  ('caleb-s4', 'caleb', 'WBG', 'na'),
  ('igneous-s4', 'igneous', 'WBG', 'na'),
  ('tery-s4', 'tery', 'WBG', 'na'),
  ('angus-s4', 'angus', 'TANK', 'na'),
  ('ahsum-s4', 'Ahsum', 'TANK', 'na'),
  ('kaydeg-s4', 'kaydeg', 'TANK', 'na'),
  ('linus-s4', 'linus', 'TANK', 'na'),
  ('androobee-s4', 'androobee', 'TANK', 'na'),
  ('abstracq-s4', 'abstracq', 'GENG', 'na'),
  ('masao-s4', 'masao', 'GENG', 'na'),
  ('derpid-s4', 'Derpid', 'GENG', 'na'),
  ('timothy-s4', 'timothy', 'GENG', 'na'),
  ('krspy-s4', 'Krspy', 'GENG', 'na'),
  ('stingray-s4', 'Sting', 'BLG', 'na'),
  ('amara-s4', 'amara', 'BLG', 'na'),
  ('phuzzy-s4', 'phuzzy', 'BLG', 'na'),
  ('asher-s4', 'asher', 'BLG', 'na'),
  ('caesparz-s4', 'caesparz', 'BLG', 'na'),
  ('colt-s4', 'colt', 'SRG', 'na'),
  ('pietamoon-s4', 'pietamoon', 'SRG', 'na'),
  ('pumpkin-s4', 'Pumpkin', 'SRG', 'na'),
  ('platinum-s4', 'platinum', 'SRG', 'na'),
  ('paul-s4', 'pants', 'SRG', 'na'),
  ('cooleo-s4', 'cooleo', 'DRX', 'na'),
  ('derpina-s4', 'derpina', 'DRX', 'na'),
  ('rudra-s4', 'rudra', 'DRX', 'na'),
  ('woup-s4', 'Woup', 'DRX', 'na'),
  ('twon-s4', 'twon', 'DRX', 'na'),
  ('apple-s4', 'apple', 'CR', 'na'),
  ('nolan-s4', 'nolan', 'CR', 'na'),
  ('jooah-s4', 'Jooah', 'CR', 'na'),
  ('ceiliuir-s4', 'Ceiliuir', 'CR', 'na'),
  ('nut-s4', 'Nut', 'CR', 'na'),
  ('night-s4', 'night', 'XLG', 'na'),
  ('skye-s4', 'skye', 'XLG', 'na'),
  ('ender-s4', 'Ender', 'XLG', 'na'),
  ('longclaw-s4', 'longclaw', 'XLG', 'na'),
  ('nova-s4', 'nova', 'XLG', 'na'),
  ('darshan-s4', 'darshan', 'NRG', 'na'),
  ('blitz-s4', 'blitz', 'NRG', 'na'),
  ('dorito-s4', 'Dorito', 'NRG', 'na'),
  ('hades-s4', 'Hades', 'NRG', 'na'),
  ('valentia-s4', 'Valentia', 'NRG', 'na')
on conflict (player) do nothing;

-- Riot IDs found from BLG vs TANK (Nov 23 2026, Haven), matched by kills, deaths and assists.
update public.riot_ids r set riot_name = v.n, riot_tag = v.t, puuid = v.u, source = 'auto', updated_at = now()
from (values
  ('stingray-s4',  'Sting',        'gyray', '810a513d-e49e-5a75-8ce9-33d7a21e493e'),
  ('phuzzy-s4',    'PHUZZYthecat', '69420', '8aa22ab5-6254-5851-bef3-3fb7f7091a78'),
  ('asher-s4',     'Asher',        'The1',  '1e038bd5-7efe-5c06-a09e-1561171bc761'),
  ('caesparz-s4',  'Caesparz',     'NA1',   'b9110e07-e2c8-58b4-9d28-600d7b6d7149'),
  ('amara-s4',     'Thembo',       'Amara', '48cb0c5e-1871-53a3-bccd-e2c42f7b51c9'),
  ('angus-s4',     'Angus',        'swag',  'ad641596-67b7-50b9-80f9-b45ff86c6415'),
  ('kaydeg-s4',    'Slowbro',      'Dino',  '5500adfa-f997-5a7f-ba17-c820b36103e6'),
  ('linus-s4',     'geeked',       'linus', '562a39f5-d427-524e-a458-5755892b7572'),
  ('ahsum-s4',     'Ahsum',        'Melon', 'c1b7d123-89b0-5387-a0a5-96189983f59e'),
  ('androobee-s4', 'androobee',    '888',   '9b221c2c-0331-5f7e-9539-47fc7c8f0517')
) v(p, n, t, u)
where r.player = v.p and r.riot_name is null;
