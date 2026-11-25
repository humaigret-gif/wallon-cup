-- Mon prono de la Wallon Cup : schéma initial Supabase
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 pseudo text not null unique,
 team text not null,
 wc integer not null default 500 check (wc >= 0),
 is_admin boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.matches (
 id uuid primary key default gen_random_uuid(),
 gender text not null check (gender in ('M','F')),
 pool text not null,
 home_team text not null,
 away_team text not null,
 match_date date not null,
 match_time text not null check (match_time in ('18:15','18:50')),
 home_score integer,
 away_score integer,
 created_at timestamptz not null default now(),
 check (home_team <> away_team),
 check ((home_score is null and away_score is null) or (home_score >= 0 and away_score >= 0))
);
create table if not exists public.predictions (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.matches(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 home_score integer not null check(home_score >= 0),
 away_score integer not null check(away_score >= 0),
 awarded boolean not null default false,
 created_at timestamptz not null default now(),
 unique(match_id,user_id)
);
create table if not exists public.standings (
 id uuid primary key default gen_random_uuid(),
 gender text not null check(gender in ('M','F')),
 pool text not null,
 team text not null,
 played integer not null default 0,
 won integer not null default 0,
 drawn integer not null default 0,
 lost integer not null default 0,
 goals_for integer not null default 0,
 goals_against integer not null default 0,
 goal_difference integer not null default 0,
 points integer not null default 0,
 unique(gender,pool,team)
);

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.predictions enable row level security;
alter table public.standings enable row level security;

create policy "profiles readable by signed in users" on public.profiles for select to authenticated using (true);
create policy "user creates own profile" on public.profiles for insert to authenticated with check (auth.uid()=id);
create policy "user updates own profile" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id);
create policy "matches readable by everyone" on public.matches for select to anon,authenticated using (true);
create policy "standings readable by everyone" on public.standings for select to anon,authenticated using (true);
create policy "predictions readable only by owner" on public.predictions for select to authenticated using (auth.uid()=user_id);
create policy "user inserts own predictions" on public.predictions for insert to authenticated with check (auth.uid()=user_id);
create policy "user updates own predictions" on public.predictions for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Create a profile automatically with 500 WC after signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,pseudo,team,wc)
 values(new.id, coalesce(new.raw_user_meta_data->>'pseudo',split_part(new.email,'@',1)),
        coalesce(new.raw_user_meta_data->>'team','À définir'),500);
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Result recording: awards 50/20/10 WC once and refreshes the relevant group.
create or replace function public.record_match_result(p_match_id uuid,p_home_score integer,p_away_score integer)
returns void language plpgsql security definer set search_path=public as $$
declare m public.matches%rowtype; p record; pts integer;
begin
 select * into m from public.matches where id=p_match_id for update;
 if not found or m.home_score is not null then raise exception 'Match introuvable ou résultat déjà saisi'; end if;
 if p_home_score<0 or p_away_score<0 then raise exception 'Score invalide'; end if;
 update public.matches set home_score=p_home_score,away_score=p_away_score where id=p_match_id;
 for p in select * from public.predictions where match_id=p_match_id and awarded=false loop
   pts:=0;
   if p.home_score=p_home_score and p.away_score=p_away_score then pts:=50;
   elsif (p.home_score-p.away_score)=(p_home_score-p_away_score) then pts:=20;
   elsif sign(p.home_score-p.away_score)=sign(p_home_score-p_away_score) then pts:=10;
   end if;
   update public.profiles set wc=wc+pts where id=p.user_id;
   update public.predictions set awarded=true where id=p.id;
 end loop;
 update public.standings set
  played=played+1,
  won=won+case when team=m.home_team and p_home_score>p_away_score or team=m.away_team and p_away_score>p_home_score then 1 else 0 end,
  drawn=drawn+case when p_home_score=p_away_score then 1 else 0 end,
  lost=lost+case when team=m.home_team and p_home_score<p_away_score or team=m.away_team and p_away_score<p_home_score then 1 else 0 end,
  goals_for=goals_for+case when team=m.home_team then p_home_score else p_away_score end,
  goals_against=goals_against+case when team=m.home_team then p_away_score else p_home_score end,
  goal_difference=(goals_for+case when team=m.home_team then p_home_score else p_away_score end)-(goals_against+case when team=m.home_team then p_away_score else p_home_score end),
  points=points+case when p_home_score=p_away_score then 1 when team=m.home_team and p_home_score>p_away_score or team=m.away_team and p_away_score>p_home_score then 3 else 0 end
 where gender=m.gender and pool=m.pool and team in (m.home_team,m.away_team);
end; $$;

-- IMPORTANT: set the first super-admin manually in Supabase SQL editor:
-- update public.profiles set is_admin=true where pseudo='TON_PSEUDO';
-- Restrict execution of result function to admins only in production before launch.
revoke all on function public.record_match_result(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.record_match_result(uuid,integer,integer) to authenticated;
