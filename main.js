import { createClient } from '@supabase/supabase-js';
import './style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const teams = {
  M: ['MP A','MPSI-2I A','PSI B','PCE A','PC A','MPSI A','PCE B','MPSI-2I B','PSI A','PCSI 1 A','MP B','MPSI B','MPE','PCSI 2','PCSI 1 B','PC B'],
  F: ['PSI F','PC F','MPSI F','PCSI 2 F','PCE F','MPE MPSI-2I F','PCSI 1 F']
};
const pools = {
  M: [
    {name:'Poule A',teams:['MP A','MPSI-2I A','PSI B','PCE A']},
    {name:'Poule B',teams:['PC A','MPSI A','PCE B','MPSI-2I B']},
    {name:'Poule C',teams:['PSI A','PCSI 1 A','MP B','MPSI B']},
    {name:'Poule D',teams:['MPE','PCSI 2','PCSI 1 B','PC B']}
  ],
  F: [
    {name:'Poule A',teams:['PSI F','PC F','MPSI F','PCSI 2 F']},
    {name:'Poule B',teams:['PCE F','MPE MPSI-2I F','PCSI 1 F']}
  ]
};
const seed = [
 ['M','Poule A','PCE A',1,1,0,0,2,0,2,3],['M','Poule A','MP A',1,0,1,0,2,2,0,1],['M','Poule A','MPSI-2I A',1,0,1,0,2,2,0,1],['M','Poule A','PSI B',1,0,0,1,0,2,-2,0],
 ['M','Poule B','PC A',2,2,0,0,8,1,7,6],['M','Poule B','MPSI A',1,1,0,0,7,2,5,3],['M','Poule B','PCE B',1,0,0,1,0,3,-3,0],['M','Poule B','MPSI-2I B',2,0,0,2,3,12,-9,0],
 ['M','Poule C','PSI A',2,2,0,0,18,1,17,6],['M','Poule C','PCSI 1 A',0,0,0,0,0,0,0,0],['M','Poule C','MP B',1,0,0,1,0,7,-7,0],['M','Poule C','MPSI B',1,0,0,1,1,11,-10,0],
 ['M','Poule D','PCSI 2',2,2,0,0,5,1,4,6],['M','Poule D','MPE',1,1,0,0,3,1,2,3],['M','Poule D','PCSI 1 B',2,0,0,2,2,5,-3,0],['M','Poule D','PC B',1,0,0,1,0,3,-3,0],
 ['F','Poule A','PSI F',1,1,0,0,5,0,5,3],['F','Poule A','PCSI 2 F',1,1,0,0,3,0,3,3],['F','Poule A','PC F',2,1,0,1,3,3,0,3],['F','Poule A','MPSI F',2,0,0,2,0,8,-8,0],
 ['F','Poule B','PCE F',1,1,0,0,4,1,3,3],['F','Poule B','MPE MPSI-2I F',0,0,0,0,0,0,0,0],['F','Poule B','PCSI 1 F',1,0,0,1,1,4,-3,0]
];
let session=null, profile=null, page='home', gender='M', pollRefreshTimer=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>new Date(s+'T12:00:00').toLocaleDateString('fr-FR');
function shell(){ $('#app').innerHTML=`
<header><div class="top"><b>⚽ WALLON CUP <small>TOURNOI INTERCLASSES</small></b><span id="who">Invité</span></div><div class="hero"><small>LE TOURNOI SE JOUE AUSSI DANS LES PRONOS</small><h1>MON PRONO<br>DE LA WALLON CUP</h1><p>Pronostique les matchs, cumule des WC et grimpe au classement.</h1><p>An original idea from Les Pains De La Prépa.</p></div></header>
<main><nav>${[['home','Accueil'],['pronostics','Pronostics'],['classement','Classement'],['poules','Les poules'],['admin','Administration']].map(([id,t])=>`<button data-page="${id}">${t}</button>`).join('')}</nav><div id="view"></div></main><footer>Les WC sont des points virtuels sans valeur monétaire : ils ne peuvent être ni achetés, ni vendus, ni misés.C'est pas Winamax ici. Merci au CONSTANTINA pour leur confiance. Ce site a été 100% crée par un gars qui a 4 de moyenne en info btw.</footer>`;
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()});
}
let profileError=null;
async function getProfile(){if(!session)return null;const {data,error}=await supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle();profileError=error?(error.message+' ['+(error.code||'?')+']'):null;return data;}
async function refresh(){if(!supabase){shell();$('#view').innerHTML=`<section class="card"><h2>Configuration nécessaire</h2><p>Le site est prêt à être relié à sa base de données. Ajoute les clés Supabase dans le fichier <code>.env</code> en suivant le guide fourni.</p></section>`;return;}const {data:{session:s}}=await supabase.auth.getSession();session=s;profile=await getProfile();render();}
async function render(){
 if(pollRefreshTimer){clearInterval(pollRefreshTimer);pollRefreshTimer=null;}
 if(!$('#app').innerHTML)shell();
 $('#who').innerHTML=session?`${esc(profile?.pseudo||session.user.email)} <button class="link" id="logout">Déconnexion</button>`:`<button class="link" id="login">Connexion / inscription</button>`;
 $('#logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();session=null;profile=null;render()});
 $('#login')?.addEventListener('click',auth);
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const v=$('#view');
 if(page==='home'){
  let matches=await supabase.from('matches').select('*').order('match_date').order('match_time').limit(4);
  let board=await supabase.from('profiles').select('pseudo,wc').order('wc',{ascending:false}).limit(5);
  let wst=await supabase.from('winner_status').select('*');
  let wmine=session?await supabase.from('winner_picks').select('gender,team').eq('user_id',session.user.id):{data:[]};
  let pollResults=await supabase.rpc('get_winner_poll_results');
  v.innerHTML=`<div class="grid"><section class="card"><small>MON SOLDE (Wallon Cup)</small><strong class="big">${profile?.wc??'—'} WC</strong></section><section class="card"><small>JE SUIS</small><strong class="big">${profile?esc(profile.pseudo):'Invité'}</strong></section><section class="card wide"><h2>⚽ Résultats et prochains matchs</h2>${(matches.data||[]).map(m=>matchLine(m)).join('')||'<p class="muted">Les organisateurs ajouteront les matchs ici.</p>'}<button class="primary" id="goP">Voir les pronostics</button></section>${pollCard(wst.data,wmine.data,pollResults.data)}<section class="card"><h2>🏆 En tête</h2>${(board.data||[]).map((x,i)=>`<p>${['🥇','🥈','🥉','4.','5.'][i]} ${esc(x.pseudo)} <b class="right">${x.wc} WC</b></p>`).join('')||'<p>Pas encore de joueurs.</p>'}</section></div>`;
  $('#goP').onclick=()=>{page='pronostics';render()};
  v.querySelectorAll('[data-wpick]').forEach(btn=>btn.onclick=()=>saveWinnerPick(btn.dataset.wpick));
  // Actualise uniquement les résultats toutes les 3 secondes, sans exposer les votes individuels.
  pollRefreshTimer=setInterval(async()=>{
   const {data,error}=await supabase.rpc('get_winner_poll_results');
   if(!error)updatePollResults(data||[]);
  },3000);
 } else if(page==='pronostics'){
  let {data=[]}=await supabase.from('matches').select('*').is('home_score',null).order('match_date').order('match_time');
  v.innerHTML=`<section class="card"><h2>Mes pronostics</h2><div class="notice"><b>Barème :</b> score exact +100 WC ; bon écart de buts +50 WC ; bon résultat +25 WC. Les récompenses ne se cumulent pas. Aucun WC n'est misé.</div>${data.map(m=>`<div class="match"><div><b>${esc(m.home_team)} – ${esc(m.away_team)}</b><small>${fmtDate(m.match_date)} · ${m.match_time}</small></div><div class="scores"><input type="number" min="0" id="h${m.id}" placeholder="–"><b>:</b><input type="number" min="0" id="a${m.id}" placeholder="–"><button class="primary small" data-pick="${m.id}">Valider</button></div></div>`).join('')||'<p class="muted">Aucun match ouvert aux pronostics.</p>'}</section>`;
  v.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>savePick(b.dataset.pick));
 } else if(page==='classement'){
  let {data=[]}=await supabase.from('profiles').select('pseudo,team,wc').order('wc',{ascending:false});
  v.innerHTML=`<section class="card"><h2>🏆 Classement général</h2><div class="scroll"><table><tr><th>Rang</th><th>Pseudo</th><th>Équipe</th><th>WC</th></tr>${data.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.pseudo)}</td><td>${esc(x.team)}</td><td><b>${x.wc}</b></td></tr>`).join('')}</table></div></section>`;
 } else if(page==='poules'){
  v.innerHTML=`<section class="card"><h2>Classements des poules</h2><div class="tabs"><button data-g="M">Masculin</button><button data-g="F">Féminin</button></div><div id="poule-content"></div></section>`;
  v.querySelectorAll('[data-g]').forEach(b=>{b.classList.toggle('active',b.dataset.g===gender);b.onclick=()=>{gender=b.dataset.g;render()}});
  const {data=[]}=await supabase.from('standings').select('*').eq('gender',gender).order('pool').order('points',{ascending:false}).order('goal_difference',{ascending:false});
  $('#poule-content').innerHTML=pools[gender].map(p=>`<h3>${p.name}</h3><div class="scroll"><table><tr><th>Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>BP</th><th>BC</th><th>DB</th><th>Pts</th></tr>${(data.filter(x=>x.pool===p.name)).map(x=>`<tr><td>${esc(x.team)}</td><td>${x.played}</td><td>${x.won}</td><td>${x.drawn}</td><td>${x.lost}</td><td>${x.goals_for}</td><td>${x.goals_against}</td><td>${x.goal_difference}</td><td><b>${x.points}</b></td></tr>`).join('')}</table></div>`).join('');
 } else if(page==='admin'){
  if(!profile?.is_admin){v.innerHTML=`<section class="card"><h2>Administration réservée</h2><p>${!session?'Connecte-toi avec un compte administrateur.':!profile?'Ton compte est connecté mais le profil n\'a pas pu être lu. Détail technique : '+esc(profileError||('aucune ligne pour l\'id '+session.user.id))+'.':'Ce compte n\'est pas administrateur. Le super-administrateur doit activer is_admin sur ton profil dans Supabase.'}</p></section>`;return;}
  const {data:ms=[]}=await supabase.from('matches').select('*').order('match_date');
  const {data:wst=[]}=await supabase.from('winner_status').select('*');
  v.innerHTML=`<div class="grid"><section class="card"><h2>Ajouter un match</h2><label>Compétition</label><select id="g"><option value="M">Masculin</option><option value="F">Féminin</option></select><label>Poule</label><select id="pool"></select><label>Équipe 1</label><select id="home"></select><label>Équipe 2</label><select id="away"></select><label>Date</label><input type="date" id="date"><label>Heure</label><select id="time"><option>18:15</option><option>18:50</option></select><button class="primary" id="add">Ajouter le match</button></section><section class="card"><h2>Saisir un résultat</h2><select id="match">${ms.filter(m=>m.home_score===null).map(m=>`<option value="${m.id}">${esc(m.home_team)} – ${esc(m.away_team)} (${m.match_date})</option>`).join('')}</select><div class="scores"><input type="number" id="rs1" placeholder="Score 1"><b>:</b><input type="number" id="rs2" placeholder="Score 2"></div><button class="primary" id="result">Enregistrer le score</button></section></div>${adminWinnerCard(wst)}<section class="card"><h2>Matchs programmés</h2>${ms.map(matchLine).join('')||'Aucun match ajouté.'}</section>`;
  setupAdmin();
 }
}
function pollResultsHTML(g,results){
 const rows=(results||[]).filter(x=>x.gender===g && Number(x.votes)>0).sort((a,b)=>b.votes-a.votes||a.team.localeCompare(b.team));
 if(!rows.length)return '<p class="muted">Aucun vote pour le moment.</p>';
 const total=Number(rows[0].total_votes)||0;
 return `<div class="poll-results"><p class="muted">${total} vote${total>1?'s':''} au total · résultats anonymes</p>${rows.map(r=>{
  const pct=Number(r.percentage)||0;
  return `<div class="poll-result"><div class="poll-result-head"><b>${esc(r.team)}</b><strong>${pct}%</strong></div><div class="poll-result-track"><span style="width:${pct}%"></span></div></div>`;
 }).join('')}</div>`;
}
function updatePollResults(results){
 ['M','F'].forEach(g=>{
  const el=$('#poll-results-'+g);
  if(el)el.innerHTML=pollResultsHTML(g,results);
 });
}
function pollCard(st,mine,results){
 const rows=['M','F'].map(g=>{
  const label=g==='M'?'Masculin':'Féminin';
  const s=(st||[]).find(x=>x.gender===g);
  const pick=(mine||[]).find(x=>x.gender===g)?.team||'';
  let body;
  if(!s)body='<p class="muted">Sondage bientôt disponible.</p>';
  else if(s.winner)body=`<p>Vainqueur : <b>${esc(s.winner)}</b>${pick?(pick===s.winner?' · 🎉 Ton prono était bon : +150 WC !':` · Ton choix : ${esc(pick)}`):''}</p>`;
  else if(!s.poll_open)body=`<p class="muted">Sondage fermé.${pick?` Ton choix : <b>${esc(pick)}</b>`:''}</p>`;
  else body=`<div class="poll"><select id="wp-${g}"><option value="">Choisis une équipe</option>${teams[g].map(t=>`<option${t===pick?' selected':''}>${esc(t)}</option>`).join('')}</select><button class="primary small" data-wpick="${g}">${pick?'Modifier':'Valider'}</button></div>`;
  return `<h3>${label}</h3>${body}<div id="poll-results-${g}">${pollResultsHTML(g,results)}</div>`;
 }).join('');
 return `<section class="card wide"><h2>🏅 Qui va gagner le tournoi ?</h2><div class="notice"><b>Sondage :</b> trouve le vainqueur du tournoi masculin et du tournoi féminin. Bon prono : +150 WC pour chaque compétition. Tu as jusqu'a la veille du premier quart de final pour te décider après cela le sondage sera fermé. Que la meilleur équipe gagne!</div>${rows}</section>`;
}
async function saveWinnerPick(g){
 if(!session)return alert('Connecte-toi pour participer au sondage narvalo.');
 const team=$('#wp-'+g).value;
 if(!team)return alert('Choisis ton équipe ou celle que tu supportes.');
 const {error}=await supabase.from('winner_picks').upsert({user_id:session.user.id,gender:g,team},{onConflict:'user_id,gender'});
 if(error)alert(error.code==='42501'?'Le sondage est fermé.':error.message);else alert('Ton prono est enregistré !');
 render();
}
function adminWinnerCard(st){
 const rows=['M','F'].map(g=>{
  const label=g==='M'?'Masculin':'Féminin';
  const s=(st||[]).find(x=>x.gender===g);
  if(!s)return `<h3>${label}</h3><p class="muted">Lance d'abord supabase/03_sondage_vainqueur.sql.</p>`;
  if(s.winner)return `<h3>${label}</h3><p>Vainqueur enregistré : <b>${esc(s.winner)}</b> (+150 WC déjà versés).</p>`;
  return `<h3>${label} · sondage ${s.poll_open?'ouvert':'fermé'}</h3><div class="poll"><button class="primary small" data-wclose="${g}" data-open="${s.poll_open?'0':'1'}">${s.poll_open?'Fermer le sondage':'Rouvrir le sondage'}</button></div><label>Désigner le vainqueur</label><div class="poll"><select id="ww-${g}"><option value="">Choisis l'équipe gagnante</option>${teams[g].map(t=>`<option>${esc(t)}</option>`).join('')}</select><button class="primary small" data-wwin="${g}">Valider le vainqueur</button></div>`;
 }).join('');
 return `<section class="card"><h2>🏅 Vainqueur du tournoi</h2>${rows}</section>`;
}
function matchLine(m){return `<div class="match"><div><b>${esc(m.home_team)} – ${esc(m.away_team)}</b><small>${fmtDate(m.match_date)} · ${m.match_time} · ${m.gender==='M'?'Masculin':'Féminin'} ${esc(m.pool)}</small></div>${m.home_score===null?'À jouer':`<b>${m.home_score} – ${m.away_score}</b>`}</div>`}
async function auth(){let email=prompt('Adresse mail :');if(!email)return;let password=prompt('Mot de passe (au moins 8 caractères) :');if(!password)return;let mode=confirm('OK pour créer un compte. Annuler pour se connecter.');if(mode){let pseudo=prompt('Choisis ton pseudo :');let team=prompt('Équipe / classe exacte :');if(!pseudo||!team)return;let {error}=await supabase.auth.signUp({email,password,options:{data:{pseudo,team}}});if(error)alert(error.message);else alert('Compte créé ! Vérifie ton adresse mail si la confirmation est activée.');}else{let {error}=await supabase.auth.signInWithPassword({email,password});if(error)alert(error.message);}await refresh();}
async function savePick(id){if(!session)return alert('Connecte-toi pour pronostiquer.');let h=$('#h'+id).value,a=$('#a'+id).value;if(h===''||a==='')return alert('Saisis les deux scores.');let {error}=await supabase.from('predictions').upsert({match_id:id,user_id:session.user.id,home_score:+h,away_score:+a},{onConflict:'match_id,user_id'});alert(error?(error.code==='42501'?'Pronostics fermés pour ce match (coup d\'envoi passé ou résultat saisi).':error.message):'Pronostic enregistré !');}
async function setupAdmin(){
 const g=$('#g'),pool=$('#pool'),home=$('#home'),away=$('#away');
 function options(){let ps=pools[g.value];pool.innerHTML=ps.map(p=>`<option>${p.name}</option>`).join('');fillTeams();}
 function fillTeams(){let p=pools[g.value].find(x=>x.name===pool.value);let opts=p.teams.map(t=>`<option>${esc(t)}</option>`).join('');home.innerHTML=opts;away.innerHTML=opts;}
 g.onchange=options;pool.onchange=fillTeams;options();
 $('#add').onclick=async()=>{let payload={gender:g.value,pool:pool.value,home_team:home.value,away_team:away.value,match_date:$('#date').value,match_time:$('#time').value};if(!payload.match_date||payload.home_team===payload.away_team)return alert('Vérifie la date et les équipes.');let {error}=await supabase.from('matches').insert(payload);if(error)alert(error.message);else render();};
 document.querySelectorAll('[data-wclose]').forEach(btn=>btn.onclick=async()=>{const {error}=await supabase.rpc('set_winner_poll_open',{p_gender:btn.dataset.wclose,p_open:btn.dataset.open==='1'});if(error)alert(error.message);else render();});
 document.querySelectorAll('[data-wwin]').forEach(btn=>btn.onclick=async()=>{const g=btn.dataset.wwin,t=$('#ww-'+g).value;if(!t)return alert('Choisis une équipe.');if(!confirm('Confirmer '+t+' comme vainqueur ? Les +150 WC seront versés et ce choix est définitif.'))return;const {error}=await supabase.rpc('set_tournament_winner',{p_gender:g,p_team:t});if(error)alert(error.message);else{alert('Vainqueur enregistré, +150 WC versés aux bons pronos.');render();}});
 $('#result').onclick=async()=>{let id=$('#match').value,h=$('#rs1').value,a=$('#rs2').value;if(!id||h===''||a==='')return alert('Choisis un match et saisis le score.');let {error}=await supabase.rpc('record_match_result',{p_match_id:id,p_home_score:+h,p_away_score:+a});if(error)alert(error.message);else{alert('Résultat enregistré, WC attribués et classement actualisé.');render();}};
}
shell();
if(supabase){supabase.auth.onAuthStateChange((_e,s)=>{session=s;setTimeout(async()=>{profile=await getProfile();render()},0)});refresh();}
