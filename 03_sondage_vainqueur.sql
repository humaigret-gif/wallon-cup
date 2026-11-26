-- 03 : SONDAGE « QUI VA GAGNER LE TOURNOI ? » (masculin et féminin séparés, +150 WC si bon prono)
-- À exécuter une seule fois dans Supabase > SQL Editor. Sûr à relancer.
-- Prérequis : 01_securite.sql (fonction is_admin) et 02_seed_standings.sql (liste des équipes).

-- 1. État du sondage pour chaque compétition
create table if not exists public.winner_status (
  gender text primary key check (gender in ('M','F')),
  poll_open boolean not null default true,
  winner text,
  awarded boolean not null default false
);
insert into public.winner_status(gender) values ('M'),('F') on conflict do nothing;

-- 2. Choix des joueurs (un choix par joueur et par compétition)
create table if not exists public.winner_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gender text not null check (gender in ('M','F')),
  team text not null,
  awarded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, gender)
);

alter table public.winner_status enable row level security;
alter table public.winner_picks enable row level security;

-- 3. Règles d'accès
drop policy if exists "winner status readable by everyone" on public.winner_status;
create policy "winner status readable by everyone" on public.winner_status
  for select to anon, authenticated using (true);

drop policy if exists "user reads own winner picks" on public.winner_picks;
drop policy if exists "user inserts own winner picks" on public.winner_picks;
drop policy if exists "user updates own winner picks" on public.winner_picks;

create policy "user reads own winner picks" on public.winner_picks
  for select to authenticated using (auth.uid() = user_id);

create policy "user inserts own winner picks" on public.winner_picks
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.winner_status s
                where s.gender = winner_picks.gender and s.poll_open and s.winner is null)
    and exists (select 1 from public.standings st
                where st.gender = winner_picks.gender and st.team = winner_picks.team));

create policy "user updates own winner picks" on public.winner_picks
  for update to authenticated
  using (auth.uid() = user_id
    and exists (select 1 from public.winner_status s
                where s.gender = winner_picks.gender and s.poll_open and s.winner is null))
  with check (auth.uid() = user_id
    and exists (select 1 from public.winner_status s
                where s.gender = winner_picks.gender and s.poll_open and s.winner is null)
    and exists (select 1 from public.standings st
                where st.gender = winner_picks.gender and st.team = winner_picks.team));

-- Droits stricts : le champ « awarded » n'est pas modifiable par les joueurs, rien n'est supprimable
revoke all on public.winner_status from anon, authenticated;
grant select on public.winner_status to anon, authenticated;
revoke all on public.winner_picks from anon, authenticated;
grant select on public.winner_picks to authenticated;
grant insert (user_id, gender, team) on public.winner_picks to authenticated;
grant update (user_id, gender, team) on public.winner_picks to authenticated;

-- 4. Fermer / rouvrir le sondage (admin uniquement)
create or replace function public.set_winner_poll_open(p_gender text, p_open boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  update public.winner_status set poll_open = p_open where gender = p_gender and winner is null;
  if not found then raise exception 'Sondage introuvable ou vainqueur déjà désigné'; end if;
end; $$;

-- 5. Désigner le vainqueur et verser +150 WC aux bons pronos (admin uniquement, une seule fois)
create or replace function public.set_tournament_winner(p_gender text, p_team text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.winner_status%rowtype;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  select * into s from public.winner_status where gender = p_gender for update;
  if not found then raise exception 'Compétition inconnue'; end if;
  if s.winner is not null then raise exception 'Le vainqueur a déjà été enregistré'; end if;
  if not exists (select 1 from public.standings where gender = p_gender and team = p_team) then
    raise exception 'Équipe inconnue'; end if;
  update public.winner_status set winner = p_team, poll_open = false, awarded = true where gender = p_gender;
  update public.profiles set wc = wc + 150
    where id in (select user_id from public.winner_picks
                 where gender = p_gender and team = p_team and awarded = false);
  update public.winner_picks set awarded = true
    where gender = p_gender and team = p_team and awarded = false;
end; $$;

revoke all on function public.set_winner_poll_open(text, boolean) from public, anon, authenticated;
revoke all on function public.set_tournament_winner(text, text) from public, anon, authenticated;
grant execute on function public.set_winner_poll_open(text, boolean) to authenticated;
grant execute on function public.set_tournament_winner(text, text) to authenticated;  -- le contrôle admin est dans la fonction

-- 6. Vérification : doit afficher 2 lignes (M et F), sondage ouvert, sans vainqueur
select * from public.winner_status order by gender;
