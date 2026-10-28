const $=id=>document.getElementById(id);
let mode='login';
function setMode(m){
  mode=m;const reg=m==='register';
  $('tabLogin').setAttribute('aria-selected',!reg);$('tabReg').setAttribute('aria-selected',reg);
  $('title').textContent=reg?'Create your hero':'Welcome back';
  $('sub').textContent=reg?'Sign up to save your progress on any device.':'Log in to continue your quest.';
  $('go').textContent=reg?'Create account':'Log in';
  $('uh').hidden=$('ph').hidden=!reg;
  $('p').autocomplete=reg?'new-password':'current-password';
  $('err').textContent='';
}
$('tabLogin').onclick=()=>setMode('login');
$('tabReg').onclick=()=>setMode('register');
$('f').addEventListener('submit',async e=>{
  e.preventDefault();
  const username=$('u').value.trim(),password=$('p').value;
  if(!username||!password){$('err').textContent='Enter a hero name and password.';return}
  $('go').disabled=true;$('err').textContent='';
  try{
    const r=await fetch('/api/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const j=await r.json().catch(()=>({}));
    if(r.ok){location.href='/';return}
    $('err').textContent=j.error||'Something went wrong. Try again.';
  }catch(_){$('err').textContent='Cannot reach the server.'}
  $('go').disabled=false;
});
// already signed in? skip straight to the app
fetch('/api/me').then(r=>{if(r.ok)location.href='/'}).catch(()=>{});
