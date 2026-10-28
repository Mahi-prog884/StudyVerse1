const PAGES=[['camp','Camp'],['library','Library'],['history','History'],['arena','Arena'],['book','Spellbook'],['sage','Sage'],['fire','Campfire'],['trophy','Trophies'],['board','Leaderboard'],['me','Profile']];
const RANKS=['Apprentice','Scout','Scholar','Ranger','Sage','Archmage'];
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=a=>a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
const re=w=>new RegExp('\\b'+w+'\\b','i');
const STOP=new Set('which these those their there about would should could because between through while where when what with from have that this into using used also each than then them they your chapter section figure table after before under over most some many other such being only very more does were been will shall within without across however therefore'.split(' '));
let S={src:'',name:'',aiSummary:'',docId:null,xp:0,streak:0,day:'',dq:{d:'',b:0,c:0,f:0},battles:0,wins:0,flawless:0,best:0,focus:0,known:[],log:[],badges:[]};
let noSave=false,AI={on:false,provider:'',model:'',reason:''},SG=[],sageBusy=false;
let D={sents:[],terms:[],summary:'',cards:[]},ci=0,flipped=false,B={q:[],i:0,hearts:3,hits:0,combo:0,answered:false,boss:''};
const BADGES=[['first','First Light','Load your first scroll',()=>!!S.src],['win','Boss Slayer','Win a battle',()=>S.wins>0],['flaw','Untouched','Win without losing a heart',()=>S.flawless>0],['combo','On Fire','Reach a 5-answer combo',()=>S.best>=5],['cards','Collector','Master 10 words',()=>S.known.length>=10],['rest','Deep Focus','Finish a 25-minute rest',()=>S.focus>=25],['streak','Regular','Study 3 days in a row',()=>S.streak>=3],['lvl','Rising Star','Reach level 5',()=>lvl()>=5]];
let saveTimer=null,saving=false;
async function pushState(){if(saving||noSave)return;saving=true;try{const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(S)});if(r.status===401){location.href='/login';return}}catch(e){}saving=false}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(pushState,600)}
async function load(){try{const r=await fetch('/api/state');if(r.status===401){location.href='/login';return false}const j=await r.json();if(j.state)Object.assign(S,j.state)}catch(e){toast('Could not reach the server. Progress may not save.')}return true}
async function logout(){clearTimeout(saveTimer);await pushState();await fetch('/api/logout',{method:'POST'});location.href='/login'}
addEventListener('pagehide',()=>{if(noSave)return;try{fetch('/api/state',{method:'PUT',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify(S)})}catch(e){}});
function toast(m){let t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),2800)}
function theme(){let r=document.documentElement,d=r.dataset.theme==='dark'||(!r.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);r.dataset.theme=d?'light':'dark';try{localStorage.setItem('studyverse-theme',r.dataset.theme)}catch(e){}}
const lvl=()=>Math.floor(S.xp/60)+1;
function touch(){let t=new Date().toDateString();if(S.day!==t){S.streak=S.day===new Date(Date.now()-864e5).toDateString()?S.streak+1:1;S.day=t}if(S.dq.d!==t)S.dq={d:t,b:0,c:0,f:0}}
function award(n,m){let b=lvl();touch();S.xp+=n;if(m)S.log.unshift({m,n,at:new Date().toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})});S.log=S.log.slice(0,30);
 BADGES.forEach(x=>{if(!S.badges.includes(x[0])&&x[3]()){S.badges.push(x[0]);setTimeout(()=>toast('Badge unlocked: '+x[1]),700)}});
 if(lvl()>b)toast('Level up! You are now level '+lvl());save();head()}
function head(){$('lvTag').textContent='LV '+lvl()}
function show(id){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('on',p.id===id));document.querySelectorAll('#nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.p===id?'page':'false'));
 if(id==='camp')renderCamp();if(id==='library')renderLib();if(id==='arena'&&!B.q.length)bStart();if(id==='book')renderCard();if(id==='sage')renderSage();if(id==='board')renderBoard();if(id==='history')renderHistory();if(id==='me')renderProfile();if(id==='trophy')renderTrophy();scrollTo(0,0)}
function analyse(t){
 D.sents=(t.match(/[^.!?]+[.!?]+/g)||[t]).map(s=>s.trim()).filter(s=>s.length>30);
 let f={},first={};(t.match(/[A-Za-z][A-Za-z-]{4,}/g)||[]).forEach((w,i)=>{w=w.toLowerCase();if(STOP.has(w))return;f[w]=(f[w]||0)+1;if(!(w in first))first[w]=i});
 D.terms=Object.keys(f).sort((a,b)=>f[b]-f[a]||first[a]-first[b]).slice(0,24);
 let sc=D.sents.map((s,i)=>{let l=s.toLowerCase(),v=0;D.terms.forEach(w=>{if(l.includes(w))v+=f[w]});return{i,s,v:v/Math.sqrt(s.length)}}).filter(o=>o.s.length<320);
 // one best sentence per slice of the document, so a 19-page PDF is covered start to finish
 let n=Math.min(14,Math.max(5,Math.round(sc.length/12))),per=Math.ceil(sc.length/n),pick=[];
 for(let k=0;k<sc.length;k+=per){let best=sc.slice(k,k+per).sort((a,b)=>b.v-a.v)[0];if(best)pick.push(best)}
 D.summary=pick.sort((a,b)=>a.i-b.i).map(o=>'• '+o.s).join('\n')||t.slice(0,900);
 D.cards=D.terms.map(w=>{let s=D.sents.find(x=>x.length<240&&re(w).test(x));return s?{w,q:s.replace(re(w),'_____'),s}:null}).filter(Boolean).slice(0,12)}
async function prepare(t,n){t=t.replace(/[\uE000-\uF8FF\uFFFD\u25A1]/g,' ').replace(/\s+/g,' ').trim();let id=null,fresh=true,doc=null;
 try{doc=await api('POST','/api/docs',{name:n,text:t});id=doc.id;fresh=!doc.existing;if(doc.existing)n=doc.name}catch(e){toast('Could not save to history: '+e.message)}
 S.src=t;S.name=n;S.docId=id;S.aiSummary=(doc&&doc.summary)||'';SG=(doc&&doc.chat)||[];S.known=[];B.q=[];analyse(t);
 if(fresh){award(10,'Found a scroll: '+n);toast('Scroll loaded and saved to History. +10 XP')}else{save();toast('Opened from your History')}
 show('library')}
async function readPDF(){
 let f=$('pdf').files[0],st=$('ust');if(!f){st.textContent='Choose a PDF first, or paste your notes below.';return}
 st.textContent='Unrolling the scroll…';
 try{const B2='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  if(!window.pdfjsLib)await new Promise((ok,no)=>{let e=document.createElement('script');e.src=B2+'pdf.min.js';e.onload=ok;e.onerror=no;document.head.appendChild(e)});
  pdfjsLib.GlobalWorkerOptions.workerSrc=B2+'pdf.worker.min.js';
  let pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise,pg=[];
  for(let i=1;i<=pdf.numPages;i++){st.textContent='Reading page '+i+' of '+pdf.numPages+'…';let c=await(await pdf.getPage(i)).getTextContent();pg.push(c.items.map(x=>x.str).join(' '))}
  let t=pg.join(' ').replace(/\s+/g,' ').trim();
  if(t.length<60){st.textContent='No selectable text found. This may be a scanned PDF. Paste the text instead.';return}
  st.textContent='';prepare(t,f.name+' ('+pdf.numPages+' pages)')
 }catch(e){st.textContent='The PDF couldn’t be read. Check your connection, or paste your notes below.'}}
function usePaste(){let t=$('paste').value.trim();if(t.length<60){toast('Paste at least a few sentences first');return}prepare(t,'Pasted notes')}
function emptyBox(msg){return '<p>'+msg+'</p><div class="row" style="margin-top:14px"><button class="btn" onclick="show(\'library\')">Go to the Library</button></div>'}
function renderLib(){$('srcName').textContent=S.src?'Source: '+S.name:'No scroll loaded.';$('sumBody').textContent=S.src?(S.aiSummary||D.summary):'Load a scroll to see its summary.';$('aiSum').hidden=!(AI.on&&S.src);$('aiSum').textContent=S.aiSummary?'Rewrite with AI':'Summarize with AI';$('sumNote').textContent=S.aiSummary?'This summary was written by an AI model'+(AI.model?' ('+AI.model+')':'')+'. Check it against your notes.':'The summary is extractive: it picks the sentences richest in key terms.'+(AI.on?' Use the AI button for a written summary.':'');$('terms').innerHTML=D.terms.slice(0,18).map(w=>'<span class="chip">'+esc(w)+'</span>').join('')||'<span class="dim">Names appear after you load a scroll.</span>'}
function dl(){if(!S.src){toast('Load a scroll first');return}let a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['StudyVerse notes\n\nSource: '+S.name+'\n\nSummary\n'+D.summary+'\n\nKey terms\n'+D.terms.join(', ')+'\n'],{type:'text/plain'}));a.download='StudyVerse_Notes.txt';a.click();URL.revokeObjectURL(a.href)}
async function aiPost(path,body){const r=await fetch('/api/ai/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(r.status===401){location.href='/login';throw new Error('Logged out')}
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'The Sage could not answer.');return j}
async function aiSummarize(){if(!S.src){toast('Load a scroll first');return}let b=$('aiSum'),st=$('aiSt');b.disabled=true;st.textContent='The Sage is reading your scroll… long documents can take a minute.';
 try{let j=await aiPost('summary',S.docId?{docId:S.docId}:{text:S.src.slice(0,30000)});S.aiSummary=j.summary;save();st.textContent='';renderLib()}
 catch(e){st.textContent=e.message}b.disabled=false}
function renderSage(){let el=$('chat');
 $('sageSt').textContent=!AI.on?'The Sage is asleep because no AI is connected. '+(AI.reason||'Add your key to the .env file and restart the server.')+' Look at the terminal where the server runs: it says "AI: ON" or "AI: OFF" when it starts.':(S.src?'Ask anything about: '+S.name:'No scroll loaded, so the Sage will answer from general knowledge.')+' · Model: '+AI.model;
 $('sq').disabled=$('sageGo').disabled=!AI.on||sageBusy;
 el.innerHTML=!AI.on?'<p class="dim">The chat is turned off until the AI is connected.</p>':SG.length?SG.map(m=>'<div class="msg '+m.role+'"><b class="px">'+(m.role==='user'?'You':'Sage')+'</b><p>'+esc(m.content)+'</p></div>').join('')+(sageBusy?'<div class="msg assistant"><b class="px">Sage</b><p class="dim">Thinking…</p></div>':''):'<p class="dim">Try: “Explain the main idea in simple words” or “Quiz me on this chapter.”</p>';
 el.scrollTop=el.scrollHeight}
async function sageSend(){let box=$('sq'),t=box.value.trim();if(!t||sageBusy||!AI.on)return;
 SG.push({role:'user',content:t});box.value='';sageBusy=true;renderSage();
 try{let j=await aiPost('chat',S.docId?{docId:S.docId,message:t}:{text:S.src.slice(0,20000),messages:SG.slice(-12)});SG.push({role:'assistant',content:j.reply})}
 catch(e){SG.push({role:'assistant',content:'The Sage stumbled: '+e.message})}
 sageBusy=false;renderSage();box.focus()}
function sageClear(){SG=[];if(S.docId)api('PUT','/api/docs/'+S.docId,{clearChat:true}).catch(()=>{});renderSage()}
async function api(method,path,body){const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 if(r.status===401){location.href='/login';throw new Error('Logged out')}
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Request failed');return j}
async function renderBoard(){let list=$('boardList'),note=$('boardMe');list.innerHTML='<p class="dim">Loading…</p>';note.textContent='';
 try{clearTimeout(saveTimer);await pushState();let j=await api('GET','/api/leaderboard');
  list.innerHTML=j.board.length?j.board.map(r=>'<div class="lrow'+(r.me?' me':'')+'"><span class="lb-rank px">#'+r.rank+'</span><span class="lb-name">'+esc(r.username)+'</span><span class="lb-lv sm">LV '+r.level+'</span><b class="lb-xp">'+r.xp+' XP</b></div>').join(''):'<p class="dim">No heroes on the board yet. Earn some XP!</p>';
  note.textContent=!j.me.listed?'You are hidden from the leaderboard. Turn it on in Profile.':(j.me.rank>20?'Your rank: #'+j.me.rank+' with '+j.me.xp+' XP.':'')}
 catch(e){list.innerHTML='<p class="dim">'+esc(e.message)+'</p>'}}
function say(id,m,ok){let e=$(id);e.textContent=m;e.style.color=ok?'var(--mint)':'var(--red)'}
async function renderProfile(){let box=$('profInfo');box.innerHTML='<p class="dim">Loading…</p>';
 try{clearTimeout(saveTimer);await pushState();let p=await api('GET','/api/profile'),s=p.stats;
  box.innerHTML='<h2 class="px" style="margin-bottom:8px">'+esc(p.username)+'</h2><p class="dim sm">Adventuring since '+new Date(p.joined).toLocaleDateString([],{day:'numeric',month:'long',year:'numeric'})+'</p>'+
  '<div class="cols" style="gap:10px;margin-top:14px"><p>Level: <b>'+p.level+'</b></p><p>Total XP: <b>'+p.xp+'</b></p><p>Battles won: <b>'+s.wins+'</b> of '+s.battles+'</p><p>Flawless wins: <b>'+s.flawless+'</b></p><p>Best combo: <b>'+s.best+'</b></p><p>Words mastered: <b>'+s.words+'</b></p><p>Focus minutes: <b>'+s.focus+'</b></p><p>Badges: <b>'+s.badges+'</b></p></div>';
  $('boardOpt').checked=p.show_on_board}
 catch(e){box.innerHTML='<p class="dim">'+esc(e.message)+'</p>'}}
async function setBoardOpt(){let c=$('boardOpt');try{await api('PUT','/api/profile',{show_on_board:c.checked});say('boardMsg',c.checked?'You are on the leaderboard.':'You are hidden from the leaderboard.',true)}catch(e){c.checked=!c.checked;say('boardMsg',e.message)}}
async function changePw(){let cur=$('pwCur').value,n1=$('pwNew').value,n2=$('pwNew2').value;
 if(!cur||!n1){say('pwMsg','Fill in both password fields.');return}
 if(n1!==n2){say('pwMsg','The new passwords do not match.');return}
 $('pwGo').disabled=true;
 try{await api('POST','/api/password',{current:cur,next:n1});$('pwCur').value=$('pwNew').value=$('pwNew2').value='';say('pwMsg','Password changed. Other devices were logged out.',true)}
 catch(e){say('pwMsg',e.message)}$('pwGo').disabled=false}
async function deleteAcct(){let pw=$('delPw').value;if(!pw){say('delMsg','Enter your password to confirm.');return}
 if(!confirm('Delete your account and ALL your progress forever? This cannot be undone.'))return;
 try{await api('DELETE','/api/account',{password:pw});noSave=true;location.href='/login'}catch(e){say('delMsg',e.message)}}
function fmtDate(t){return new Date(t).toLocaleString([],{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
let HIST={};
async function renderHistory(){let el=$('histList');el.innerHTML='<p class="dim">Loading…</p>';
 try{let j=await api('GET','/api/docs');HIST=Object.fromEntries(j.docs.map(d=>[d.id,d.name]));
  el.innerHTML=j.docs.length?j.docs.map(d=>'<div class="hrow'+(d.id===S.docId?' cur':'')+'"><div class="hmain"><b class="hname">'+esc(d.name)+'</b>'+(d.id===S.docId?' <span class="chip">Open now</span>':'')+
   '<p class="sm dim">Last used '+fmtDate(d.updated_at)+' · '+d.chars.toLocaleString()+' characters'+(d.has_summary?' · AI summary':'')+(d.msgs?' · '+d.msgs+' chat messages':'')+'</p></div>'+
   '<div class="row"><button class="btn hbtn" onclick="openDoc('+d.id+')">Open</button><button class="btn alt hbtn" onclick="renameDoc('+d.id+')">Rename</button><button class="btn red hbtn" onclick="deleteDoc('+d.id+')">Delete</button></div></div>').join('')
   :'<p class="dim">Nothing here yet. Upload a PDF or paste notes in the Library and it will be saved automatically.</p>'}
 catch(e){el.innerHTML='<p class="dim">'+esc(e.message)+'</p>'}}
async function openDoc(id){try{let d=(await api('GET','/api/docs/'+id)).doc;
  S.src=d.text;S.name=d.name;S.docId=d.id;S.aiSummary=d.summary||'';SG=d.chat||[];S.known=[];B.q=[];analyse(d.text);save();toast('Opened “'+d.name+'” from History');show('library')}
 catch(e){toast(e.message)}}
async function renameDoc(id){let n=prompt('New name:',HIST[id]||'');if(n===null||!n.trim())return;
 try{await api('PUT','/api/docs/'+id,{name:n.trim()});if(S.docId===id)S.name=n.trim().slice(0,200);save();renderHistory()}catch(e){toast(e.message)}}
async function deleteDoc(id){if(!confirm('Delete this document and its saved summary and chat from your history?'))return;
 try{await api('DELETE','/api/docs/'+id);if(S.docId===id){S.docId=null;SG=[];S.aiSummary='';save()}renderHistory()}catch(e){toast(e.message)}}
function sprite(n){let h=0;for(const c of n)h=(h*31+c.charCodeAt(0))%360;
 const R=['...XXXXXX...','..XXXXXXXX..','.XXXXXXXXXX.','.XWWXXXXWWX.','.XWKXXXXWKX.','.XXXXXXXXXX.','.XXKWKWKWXX.','.XXXKKKKXXX.','XXXXXXXXXXXX','XXXXXXXXXXXX','XX.XX..XX.XX'];
 const C={X:'hsl('+h+',55%,52%)',W:'#fff',K:'#17231d'};let o='<svg viewBox="0 0 12 11" shape-rendering="crispEdges" role="img" aria-label="Boss monster">';
 R.forEach((r,y)=>[...r].forEach((c,x)=>{if(c!=='.')o+='<rect x="'+x+'" y="'+y+'" width="1" height="1" fill="'+C[c]+'"/>'}));return o+'</svg>'}
const hearts=n=>'♥'.repeat(n)+'<s>'+'♥'.repeat(3-n)+'</s>';
async function bStart(mode){let el=$('arenaBody');if(!S.src){el.innerHTML=emptyBox('No dungeon yet. Load a scroll to summon a boss.');return}
 if(AI.on&&mode!=='classic'){el.innerHTML='<p class="px" role="status">The Sage is conjuring a boss from your notes…</p>';
  try{let j=await aiPost('quiz',S.docId?{docId:S.docId,count:7}:{text:S.src.slice(0,30000),count:7});
   B={q:j.questions.map(x=>({a:x.options[x.answer],q:x.question,e:x.explanation,o:shuffle(x.options)})),i:0,hearts:3,hits:0,combo:0,answered:false,boss:D.terms[0]||'Scroll',ai:true};bRender();return}
  catch(e){toast('The Sage failed ('+e.message+'). Using classic questions.')}}
 let pool=shuffle(D.cards).slice(0,7);if(pool.length<4){el.innerHTML=emptyBox('This scroll is too short for a boss. Load a longer chapter.');return}
 B={q:pool.map(c=>({a:c.w,q:c.q,o:shuffle([c.w,...shuffle(D.terms.filter(x=>x!==c.w)).slice(0,3)])})),i:0,hearts:3,hits:0,combo:0,answered:false,boss:D.terms[0]};bRender()}
function bRender(){let el=$('arenaBody');if(B.i>=B.q.length||B.hearts<=0){bEnd();return}let q=B.q[B.i];B.answered=false;
 el.innerHTML='<div class="arena"><div class="boss" id="boss">'+sprite(B.boss)+'<div class="px" style="margin-top:6px">The '+esc(B.boss)+' Golem</div><div class="hp"><i id="hpb" style="width:'+(B.q.length-B.hits)/B.q.length*100+'%"></i></div></div>'+
 '<div id="qa"><div class="row" style="justify-content:space-between"><span class="px">Round '+(B.i+1)+' of '+B.q.length+'</span><span class="hearts" id="hh2">'+hearts(B.hearts)+'</span></div><p class="qt">'+esc(q.q)+'</p><div id="opts">'+q.o.map((o,k)=>'<button class="opt" onclick="bPick('+k+')">'+esc(o)+'</button>').join('')+'</div><div id="fb"></div></div></div>'}
function bPick(k){if(B.answered)return;B.answered=true;let q=B.q[B.i],ok=q.o[k]===q.a,bs=document.querySelectorAll('#opts button');
 bs.forEach((b,j)=>{b.disabled=true;if(q.o[j]===q.a)b.classList.add('ok');else if(j===k)b.classList.add('no')});
 if(ok){B.hits++;B.combo++;S.best=Math.max(S.best,B.combo);let g=5+Math.min(B.combo,4);award(g,'');$('boss').classList.add('hit');$('hpb').style.width=(B.q.length-B.hits)/B.q.length*100+'%';
  $('fb').innerHTML='<p class="px" style="margin-top:12px;color:var(--mint)">Hit! +'+g+' XP'+(B.combo>1?' · Combo x'+B.combo:'')+'</p>'}
 else{B.hearts--;B.combo=0;$('qa').classList.add('hurt');$('hh2').innerHTML=hearts(B.hearts);$('fb').innerHTML='<p class="px" style="margin-top:12px;color:var(--red)">Ouch! The answer was “'+esc(q.a)+'”.</p>'}
 $('fb').innerHTML+=(q.e?'<p class="sm" style="margin-top:8px">'+esc(q.e)+'</p>':'')+'<div class="row" style="margin-top:12px"><button class="btn" onclick="B.i++;bRender()">'+(B.hearts<=0||B.i+1>=B.q.length?'See result':'Next round')+'</button></div>';save()}
function bEnd(){let win=B.hearts>0,flaw=win&&B.hearts===3;S.battles++;
 if(win){S.wins++;S.dq.b=1;if(flaw)S.flawless++;award(20+(flaw?15:0),'Defeated the '+B.boss+' Golem ('+B.hits+'/'+B.q.length+')')}else award(0,'Retreated from the '+B.boss+' Golem ('+B.hits+'/'+B.q.length+')');
 $('arenaBody').innerHTML='<div class="boss">'+sprite(B.boss)+'</div><h2 style="text-align:center;margin:10px 0">'+(win?(flaw?'Flawless victory!':'Victory!'):'You retreated')+'</h2><p style="text-align:center">'+B.hits+' of '+B.q.length+' hits landed. '+(win?'+'+(20+(flaw?15:0))+' bonus XP.':'Study the Spellbook, then try again.')+'</p><div class="row" style="justify-content:center;margin-top:18px"><button class="btn" onclick="bStart()">Fight again</button>'+(AI.on?'<button class="btn alt" onclick="bStart(\'classic\')">Classic questions</button>':'')+'<button class="btn alt" onclick="show(\'book\')">Open the Spellbook</button></div>'}
function renderCard(){let el=$('flash');if(!D.cards.length){$('cc').textContent='No cards';$('cm').textContent='';el.innerHTML=emptyBox('Your Spellbook is empty. Load a scroll to fill it.')}
 else{ci%=D.cards.length;let c=D.cards[ci];$('cc').textContent='Card '+(ci+1)+' of '+D.cards.length;$('cm').textContent=S.known.length+' mastered';
  el.innerHTML=flipped?'<span class="chip" style="justify-self:center">'+esc(c.w)+'</span><p class="t">'+esc(c.s)+'</p>':'<span class="sm dim">Which word fits the blank?</span><p class="t">'+esc(c.q)+'</p>'}
 $('owned').innerHTML=S.known.map(w=>'<span class="chip">'+esc(w)+'</span>').join('')||'<span class="dim">Master a card to add it here.</span>'}
function flip(){flipped=!flipped;renderCard()}
function rate(g){let c=D.cards[ci];if(!c){toast('Load a scroll first');return}
 if(g&&!S.known.includes(c.w)){S.known.push(c.w);S.dq.c++;award(3,'Mastered the word “'+c.w+'”')}if(!g)S.known=S.known.filter(x=>x!==c.w);save();ci++;flipped=false;renderCard()}
function renderCamp(){let L=lvl(),into=S.xp%60;$('rank').textContent=RANKS[Math.min(L-1,5)]+' · Level '+L;$('xpb').style.width=into/60*100+'%';$('xpt').textContent=into+' / 60 XP to level '+(L+1);
 $('streak').textContent=S.streak>1?S.streak+'-day streak. Come back tomorrow to keep it.':'Study today to start a streak.';
 let q=[['Load a scroll',!!S.src],['Win a battle',!!S.dq.b],['Master 3 words',S.dq.c>=3],['Finish a campfire rest',!!S.dq.f]];
 $('quests').innerHTML=q.map(x=>'<div class="quest '+(x[1]?'d':'')+'"><i>'+(x[1]?'✓':'')+'</i><span>'+x[0]+'</span></div>').join('');
 let st=[['library','The Library','Load notes and read the summary.',!!S.src?'Scroll loaded':'Start here',1],['arena','The Arena','Fight a boss built from your notes.',S.wins+' wins',!!S.src],['book','The Spellbook','Flip cards and collect words.',S.known.length+' owned',!!S.src],['fire','The Campfire','Rest and focus for bonus XP.',S.focus+' min',1]];
 $('map').innerHTML=st.map(s=>'<button class="stn '+(s[4]?'':'lock')+'" onclick="'+(s[4]?'show(\''+s[0]+'\')':'toast(\'Load a scroll first\')')+'"><h3>'+s[1]+'</h3><p class="sm dim">'+s[2]+'</p><span class="tag '+(s[4]?'g':'')+'">'+(s[4]?s[3]:'Locked')+'</span></button>').join('');
 $('log').innerHTML=S.log.length?S.log.slice(0,8).map(a=>'<div><span>'+esc(a.m)+'</span><span class="dim">'+(a.n?'+'+a.n+' XP · ':'')+esc(a.at)+'</span></div>').join(''):'<p class="dim">Your adventure starts with the first scroll.</p>';
 let g=$('go');g.textContent=S.src?'Enter the arena':'Load your first scroll';g.onclick=()=>show(S.src?'arena':'library')}
function renderTrophy(){$('stats').innerHTML='<div class="cols" style="gap:10px"><p>Battles won: <b>'+S.wins+'</b> of '+S.battles+'</p><p>Flawless wins: <b>'+S.flawless+'</b></p><p>Best combo: <b>'+S.best+'</b></p><p>Words mastered: <b>'+S.known.length+'</b></p><p>Focus minutes: <b>'+S.focus+'</b></p><p>Total XP: <b>'+S.xp+'</b></p></div>';
 $('badges').innerHTML=BADGES.map(x=>{let on=S.badges.includes(x[0]);return '<div class="bd '+(on?'':'off')+'"><h3>'+x[1]+'</h3><p class="sm">'+x[2]+'</p><span class="tag '+(on?'g':'')+'">'+(on?'Unlocked':'Locked')+'</span></div>'}).join('')}
function clearAll(){if(!confirm('Erase all XP, badges and history? Your loaded scroll stays.'))return;Object.assign(S,{xp:0,streak:0,day:'',dq:{d:'',b:0,c:0,f:0},battles:0,wins:0,flawless:0,best:0,focus:0,known:[],log:[],badges:[]});save();head();renderTrophy()}
let T={left:1500,total:1500,h:null,end:0};const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
function draw(){$('tm').textContent=fmt(T.left);$('tb').style.width=((T.total-T.left)/T.total*100)+'%'}
function setDur(){T.total=T.left=Number($('dur').value)*60;draw()}
function tStart(){if(T.h)return;if(T.left<=0)setDur();T.end=Date.now()+T.left*1000;T.h=setInterval(()=>{T.left=Math.max(0,Math.round((T.end-Date.now())/1000));draw();if(T.left<=0){tPause();S.focus+=T.total/60;S.dq.f=1;award(10,'Rested at the campfire ('+T.total/60+' min)');toast('Rest complete. +10 XP')}},250)}
function tPause(){clearInterval(T.h);T.h=null}
function tReset(){tPause();setDur()}
$('dur').addEventListener('change',()=>{if(!T.h)setDur()});
$('nav').innerHTML=PAGES.map(p=>'<button data-p="'+p[0]+'" onclick="show(\''+p[0]+'\')">'+p[1]+'</button>').join('');
(async()=>{const me=await fetch('/api/me');if(me.status===401){location.href='/login';return}const u=(await me.json()).user;$('who').textContent=u.username;if(!(await load()))return;try{let st=await(await fetch('/api/ai/status')).json();AI.on=!!st.enabled;AI.provider=st.provider||'';AI.model=st.model||'';AI.reason=st.reason||''}catch(e){}if(S.docId){try{let d=(await api('GET','/api/docs/'+S.docId)).doc;SG=d.chat||[];if(d.summary)S.aiSummary=d.summary}catch(e){S.docId=null}}touch();if(S.src)analyse(S.src);head();show('camp')})();
