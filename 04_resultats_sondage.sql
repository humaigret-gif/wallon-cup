-- 04 : AFFICHAGE PUBLIC DES RESULTATS AGREGES DU SONDAGE
-- A executer apres 03_sondage_vainqueur.sql.
-- Les visiteurs voient les totaux et pourcentages, jamais les choix individuels.

create or replace function public.get_winner_poll_results()
returns table (
  gender text,
  team text,
  votes integer,
  total_votes integer,
  percentage integer
)
language sql
security definer
set search_path = public
as $$
  with counts as (
    select
      st.gender,
      st.team,
      count(wp.id)::integer as votes
    from public.standings st
    left join public.winner_picks wp
      on wp.gender = st.gender
     and wp.team = st.team
    group by st.gender, st.team
  ),
  totals as (
    select
      c.gender,
      c.team,
      c.votes,
      sum(c.votes) over (partition by c.gender)::integer as total_votes
    from counts c
  )
  select
    t.gender,
    t.team,
    t.votes,
    t.total_votes,
    case when t.total_votes = 0 then 0
         else round(t.votes * 100.0 / t.total_votes)::integer
    end as percentage
  from totals t
  order by t.gender, t.votes desc, t.team;
$$;

revoke all on function public.get_winner_poll_results() from public;
grant execute on function public.get_winner_poll_results() to anon, authenticated;
