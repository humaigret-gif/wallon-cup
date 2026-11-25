-- 01 : CORRECTIFS SÉCURITÉ + ADMIN  (à exécuter une fois dans Supabase > SQL Editor ; relançable sans risque)

-- 0. Rattrape les comptes créés avant le trigger (profil manquant => Administration inaccessible)
insert into public.profiles(id,pseudo,team,wc)
select u.id, coalesce(u.raw_user_meta_data->>'pseudo', split_part(u.email,'@',1)),
       coalesce(u.raw_user_meta_data->>'team','À définir'), 500
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

-- 1. Fonction « suis-je admin ? » (utilisée par les politiques)
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2. FAILLE 1 : un utilisateur pouvait modifier is_admin et wc de son propre profil
drop policy if exists "user creates own profile" on public.profiles;   -- le trigger s'en charge
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (pseudo, team) on public.profiles to authenticated;       -- seuls ces 2 champs sont modifiables

create or replace function public.protect_profile_fields()
returns trigger language plpgsql as $$
begin
  if current_user in ('anon','authenticated')
     and (new.is_admin is distinct from old.is_admin or new.wc is distinct from old.wc) then
    raise exception 'Modification interdite de is_admin / wc';
  end if;
  return new;
end; $$;
drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields before update on public.profiles
for each row execute procedure public.protect_profile_fields();

-- 3. Les admins peuvent enfin ajouter / supprimer des matchs (avant : aucune politique => bouton bloqué pour tous)
drop policy if exists "admins insert matches" on public.matches;
drop policy if exists "admins delete matches" on public.matches;
create policy "admins insert matches" on public.matches for insert to authenticated with check (public.is_admin());
create policy "admins delete matches" on public.matches for delete to authenticated using (public.is_admin());

-- 4. FAILLE 2 : record_match_result était exécutable par tout utilisateur connecté
create or replace function public.record_match_result(p_match_id uuid, p_home_score integer, p_away_score integer)
returns void language plpgsql security definer set search_path = public as $$
declare m public.matches%rowtype; p record; pts integer;
begin
  if not public.is_admin() then raise exception 'Réservé aux administrateurs'; end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 then
    raise exception 'Score invalide'; end if;
  select * into m from public.matches where id = p_match_id for update;
  if not found or m.home_score is not null then raise exception 'Match introuvable ou résultat déjà saisi'; end if;
  update public.matches set home_score = p_home_score, away_score = p_away_score where id = p_match_id;
  for p in select * from public.predictions where match_id = p_match_id and awarded = false loop
    pts := 0;
    if p.home_score = p_home_score and p.away_score = p_away_score then pts := 50;
    elsif (p.home_score - p.away_score) = (p_home_score - p_away_score) then pts := 20;
    elsif sign(p.home_score - p.away_score) = sign(p_home_score - p_away_score) then pts := 10;
    end if;
    update public.profiles set wc = wc + pts where id = p.user_id;
    update public.predictions set awarded = true where id = p.id;
  end loop;
  update public.standings set
    played = played + 1,
    won  = won  + case when (team = m.home_team and p_home_score > p_away_score) or (team = m.away_team and p_away_score > p_home_score) then 1 else 0 end,
    drawn = drawn + case when p_home_score = p_away_score then 1 else 0 end,
    lost = lost + case when (team = m.home_team and p_home_score < p_away_score) or (team = m.away_team and p_away_score < p_home_score) then 1 else 0 end,
    goals_for = goals_for + case when team = m.home_team then p_home_score else p_away_score end,
    goals_against = goals_against + case when team = m.home_team then p_away_score else p_home_score end,
    goal_difference = (goals_for + case when team = m.home_team then p_home_score else p_away_score end)
                    - (goals_against + case when team = m.home_team then p_away_score else p_home_score end),
    points = points + case when p_home_score = p_away_score then 1
                           when (team = m.home_team and p_home_score > p_away_score) or (team = m.away_team and p_away_score > p_home_score) then 3 else 0 end
  where gender = m.gender and pool = m.pool and team in (m.home_team, m.away_team);
end; $$;
revoke all on function public.record_match_result(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.record_match_result(uuid,integer,integer) to authenticated;  -- le contrôle admin est DANS la fonction

-- 5. FAILLE 3 : pronostics modifiables après le coup d'envoi / après le résultat, et champ « awarded » falsifiable
drop policy if exists "user inserts own predictions" on public.predictions;
drop policy if exists "user updates own predictions" on public.predictions;
create policy "user inserts own predictions" on public.predictions for insert to authenticated
with check (auth.uid() = user_id and exists (
  select 1 from public.matches m where m.id = match_id and m.home_score is null
  and now() < ((m.match_date + m.match_time::time) at time zone 'Europe/Paris')));
create policy "user updates own predictions" on public.predictions for update to authenticated
using (auth.uid() = user_id and exists (
  select 1 from public.matches m where m.id = match_id and m.home_score is null
  and now() < ((m.match_date + m.match_time::time) at time zone 'Europe/Paris')))
with check (auth.uid() = user_id and exists (
  select 1 from public.matches m where m.id = match_id and m.home_score is null
  and now() < ((m.match_date + m.match_time::time) at time zone 'Europe/Paris')));
revoke insert, update, delete on public.predictions from anon, authenticated;
grant insert (match_id, user_id, home_score, away_score) on public.predictions to authenticated;
grant update (match_id, user_id, home_score, away_score) on public.predictions to authenticated;

-- 6. Promouvoir ton compte (par e-mail, plus fiable que le pseudo) : remplace l'adresse puis décommente
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'TON_EMAIL');
