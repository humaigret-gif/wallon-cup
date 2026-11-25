-- 00 : DIAGNOSTIC (lecture seule). Colle chaque bloc dans Supabase > SQL Editor et envoie-moi les résultats.

-- A. Les comptes ont-ils bien un profil ? (profil vide = onglet Administration bloqué)
select u.email, p.pseudo, p.is_admin, p.wc
from auth.users u left join public.profiles p on p.id = u.id
order by u.created_at;

-- B. Qui est administrateur ?
select pseudo, is_admin from public.profiles where is_admin;

-- C. Politiques de sécurité en place
select tablename, policyname, cmd from pg_policies where schemaname='public' order by 1,2;

-- D. Le trigger de création de profil existe-t-il ?
select tgname from pg_trigger where tgname = 'on_auth_user_created';

-- E. Un visiteur non connecté / n'importe quel connecté peut-il lancer l'enregistrement des scores ?
select has_function_privilege('anon','public.record_match_result(uuid,integer,integer)','execute') as anon_peut,
       has_function_privilege('authenticated','public.record_match_result(uuid,integer,integer)','execute') as connecte_peut;

-- F. Les classements de poules sont-ils remplis ?
select gender, pool, count(*) from public.standings group by 1,2 order by 1,2;
