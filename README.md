# Mon prono de la Wallon Cup

Application Vite + Supabase. Les WC sont des points virtuels de classement uniquement : aucun achat, vente ou mise.

## Lancer en local
1. Installer Node.js.
2. Dans ce dossier : `npm install`
3. Copier `.env.example` en `.env` et renseigner les deux clés Supabase.
4. `npm run dev`

## Préparer Supabase
1. Créer un projet Supabase.
2. Ouvrir SQL Editor et exécuter `supabase/schema.sql`.
3. Dans Authentication > URL Configuration, définir les URL de redirection de votre site.
4. Créer un premier compte sur le site.
5. Dans SQL Editor, promouvoir ce compte : `update public.profiles set is_admin=true where pseudo='TON_PSEUDO';`
6. Insérer les classements initiaux dans `public.standings` à partir du tableau source de la Wallon Cup. Les données des poules sont reprises dans le code de l'interface ; les lignes statistiques doivent être importées avant ouverture publique.

## Variables d'environnement
Voir `.env.example`. N'utilisez JAMAIS la clé `service_role` dans le navigateur.

## Sécurité avant mise en ligne
Le SQL fourni est un squelette de départ, pas une configuration de production. Avant ouverture publique, verrouiller l'écriture des matchs et l'exécution de `record_match_result` aux administrateurs via des politiques/RPC dédiées, vérifier l'identité des administrateurs secondaires, limiter les inscriptions aux élèves autorisés si nécessaire, et tester le verrouillage des pronostics à l'heure du match. Ne partagez jamais la clé `service_role`.
