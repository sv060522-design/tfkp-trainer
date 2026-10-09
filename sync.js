// Optional account sync. Browser-only study remains available without an account.
(() => {
  'use strict';
  const TASK='tfkp-trainer-progress-v2',THEORY='tfkp-trainer-theory-progress-v1';
  const META='tfkp-account-sync-v1',GUEST='tfkp-account-guest-v1',CACHE=META+'-pending-';
  const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const ids=window.TFKP_SYNC_IDS||{tasks:[],topics:[],cards:[]};
  const allowed=Object.fromEntries(Object.entries(ids).map(([k,v])=>[k,new Set(v)]));
  let meta=read(META,{user:null,records:{},pending:{}}),csrf='',configured=null,message='',timer,flight,epoch=0;
  if(!obj(meta)||!obj(meta.records)||!obj(meta.pending))meta={user:null,records:{},pending:{}};
  let user=meta.user||null,observed=snapshot(),clockOffset=0,lastStamp=0,busy=false;
  function snapshot(tasks=read(TASK,{}),theory=read(THEORY,{topics:{},cards:{}})){
    const result={};
    for(const [id,v] of Object.entries(tasks))if(allowed.tasks.has(id)&&obj(v)){
      const status=v.learningStatus||(v.solved?'solved-self':'not-started');
      result['tasks:'+id]={learningStatus:status,solved:['solved-self','solved-hint'].includes(status),starred:!!v.starred};
    }
    for(const [id,v] of Object.entries(theory.topics||{}))if(allowed.topics.has(id)&&typeof v==='boolean')result['topics:'+id]=v;
    for(const [id,v] of Object.entries(theory.cards||{}))if(allowed.cards.has(id)&&['new','known','repeat'].includes(v))result['cards:'+id]=v;
    return result;
  }
  function storeMeta(){
    meta.user=user;
    try{localStorage.setItem(META,JSON.stringify(meta));if(user)localStorage.setItem(CACHE+user.id,JSON.stringify(meta));return true;}
    catch{message='Не удалось сохранить очередь синхронизации. Экспортируй прогресс перед закрытием.';return false;}
  }
  function operation(value){
    const at=Math.max(Date.now()+clockOffset,lastStamp+1);lastStamp=at;
    return {value:value===undefined?null:value,at,op:crypto.randomUUID()};
  }
  function changed(domain){
    if(!user)return;
    const now=snapshot();
    for(const key of new Set([...Object.keys(observed),...Object.keys(now)])){
      if(domain&&!(domain==='theory'?/^(cards|topics):/.test(key):key.startsWith('tasks:')))continue;
      if(!same(observed[key],now[key]))meta.pending[key]=operation(now[key]);
    }
    observed=now;storeMeta();schedule();
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>synchronize(),650);updateLabels();}
  function writeLocal(tasks,theory){
    const oldTask=localStorage.getItem(TASK),oldTheory=localStorage.getItem(THEORY);
    try{localStorage.setItem(TASK,JSON.stringify(tasks));localStorage.setItem(THEORY,JSON.stringify(theory));}
    catch(e){try{if(oldTask===null)localStorage.removeItem(TASK);else localStorage.setItem(TASK,oldTask);if(oldTheory===null)localStorage.removeItem(THEORY);else localStorage.setItem(THEORY,oldTheory);}catch{}throw Error('Браузер не смог обновить местную копию. Предыдущие отметки сохранены.');}
    observed=snapshot();window.dispatchEvent(new Event('tfkp:progress-changed'));
  }
  function applyRecords(records){
    const tasks={},theory={topics:{},cards:{}},old=read(TASK,{}),values={...records,...meta.pending};
    // Preserve legacy fields on known task records; cloud storage only holds study marks.
    for(const [key,entry] of Object.entries(values)){
      const i=key.indexOf(':'),domain=key.slice(0,i),id=key.slice(i+1);if(!allowed[domain]?.has(id)||entry.value===null)continue;
      if(domain==='tasks')tasks[id]={...(old[id]||{}),...entry.value,updatedAt:new Date(entry.at).toISOString()};
      else theory[domain][id]=entry.value;
      lastStamp=Math.max(lastStamp,entry.at||0);
    }
    writeLocal(tasks,theory);
  }
  function backupGuest(){localStorage.setItem(GUEST,JSON.stringify({tasks:read(TASK,{}),theory:read(THEORY,{topics:{},cards:{}})}));}
  function restoreGuest(){const guest=read(GUEST,{tasks:{},theory:{topics:{},cards:{}}});writeLocal(guest.tasks,guest.theory);}
  async function request(action,extra={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch('/api/account',{method:action?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:action?{'Content-Type':'application/json','X-TFKP-CSRF':csrf}:{},body:action?JSON.stringify({action,userId:user?.id,...extra}):undefined,signal:controller.signal});
      let value;try{value=await r.json();}catch{throw Error('Вход пока недоступен. Прогресс сохраняется в браузере.');}
      if(value.serverTime)clockOffset=value.serverTime-Date.now();
      if(!r.ok)throw Object.assign(Error(value.error||'Не удалось синхронизировать отметки.'),{status:r.status});
      return value;
    }finally{clearTimeout(timeout);}
  }
  async function connect(value,{seed=false,anonymous=null}={}){
    if(!value.user)return;
    const cached=read(CACHE+value.user.id,null);
    user=value.user;csrf=value.csrf;configured=true;
    meta={user,records:value.progress?.records||{},pending:cached?.user?.id===user.id&&obj(cached.pending)?cached.pending:{}};
    if(seed)for(const [key,v] of Object.entries(anonymous||{}))meta.pending[key]=operation(v);
    storeMeta();applyRecords(meta.records);message='';updateLabels();
    if(Object.keys(meta.pending).length)await synchronize();
  }
  async function loadSession(){
    const token=++epoch;
    try{
      const value=await request();if(token!==epoch)return;
      configured=value.configured;
      if(!value.configured){message='Синхронизация ещё не подключена. Отметки сохраняются только в этом браузере.';updateLabels();return;}
      if(value.user){
        if(user?.id!==value.user.id){if(!user){if(!localStorage.getItem(GUEST))backupGuest();}else storeMeta();}
        await connect(value);
      }else if(user){csrf='';message='Сеанс закончился. Войди снова; местные отметки и очередь сохранены.';}
      else message='';
    }catch{message=user?'Нет связи с сервером. Изменения сохранены в браузере и ждут синхронизации.':'Вход временно недоступен. Можно продолжать без входа.';}
    updateLabels();
  }
  function synchronize(){
    if(flight)return flight;
    if(!user||!csrf||configured!==true)return Promise.resolve(false);
    const account=user.id,token=epoch,batch={...meta.pending};
    message='Синхронизирую…';updateLabels();
    flight=(async()=>{
      try{
        const value=await request('sync',{changes:batch});if(token!==epoch||account!==user?.id)return false;
        const records=value.progress?.records||{};
        for(const [key,v] of Object.entries(meta.pending)){
          const saved=records[key];if(saved&&(saved.at>v.at||(saved.at===v.at&&saved.op>=v.op)))delete meta.pending[key];
        }
        meta.records=records;storeMeta();applyRecords(records);
        message=Object.keys(meta.pending).length?'Новые отметки ждут синхронизации.':'Отметки сохранены на сервере.';
        return true;
      }catch(e){
        if(e.status===401){csrf='';message='Войди снова. Несохранённые отметки остались в браузере.';}
        else if(e.status===409){csrf='';message=e.message;}
        else message=e.message||'Нет связи. Отметки ждут синхронизации.';
        return false;
      }finally{flight=null;updateLabels();if(user&&csrf&&Object.keys(meta.pending).length&&token===epoch&&message==='Новые отметки ждут синхронизации.')schedule();}
    })();
    return flight;
  }
  function buttonLabel(){return user?'Аккаунт: '+user.nickname:'Вход и синхронизация';}
  function updateLabels(){
    for(const n of document.querySelectorAll('.account-open'))n.textContent=buttonLabel();
    const status=document.getElementById('sync-status');if(status)status.textContent=message;
    const submit=document.getElementById('account-submit');if(submit)submit.disabled=busy;
  }
  function close(){const dialog=document.getElementById('account-dialog');dialog?.close();dialog?.remove();}
  function mount(){updateLabels();}
  function open(){
    close();const dialog=document.createElement('dialog');dialog.id='account-dialog';dialog.className='account-dialog';
    dialog.innerHTML=`<div class="account-heading"><h2>Вход и синхронизация</h2><button data-sync-action="close" aria-label="Закрыть окно входа">×</button></div><p>Вход необязателен. После входа одним ником и паролем отметки задач, прочитанные разделы и карточки теории будут общими на телефоне и компьютере.</p>
      <p id="sync-status" role="status">${E(message||'Проверяю подключение…')}</p>
      ${configured===false?'<p>Хранилище для аккаунтов ещё не подключено владельцем сайта. Сейчас можно заниматься без входа и переносить отметки через экспорт и импорт.</p><button data-sync-action="check">Проверить подключение</button>':user&&csrf?`<p>Ты вошёл как <strong>${E(user.nickname)}</strong>.</p><div class="account-actions"><button data-sync-action="sync">Синхронизировать сейчас</button><button data-sync-action="merge-guest">Добавить местные отметки</button><button data-sync-action="logout">Выйти</button></div><p class="task-meta">Местные отметки добавляются для вопросов, которых ещё нет в аккаунте. После выхода вернётся прогресс без входа, сохранённый в этом браузере.</p>`:configured===true?`<form id="account-form"><label>Ник<input id="account-nickname" name="username" autocomplete="username" minlength="3" maxlength="32" required value="${E(user?.nickname||'')}"></label><label>Пароль<input id="account-password" name="password" type="password" autocomplete="current-password" minlength="10" maxlength="128" required></label><label class="account-choice"><input id="account-register" type="checkbox">Создать новый аккаунт</label><p class="task-meta">Ник: 3–32 буквы, цифры, точки, дефисы или подчёркивания. Пароль: минимум 10 символов. Сохрани пароль: восстановления по почте пока нет.</p><button id="account-submit" class="primary" type="submit">Войти</button></form><p class="task-meta">В новом аккаунте текущие отметки перенесутся автоматически. При входе в существующий аккаунт местная копия сохранится отдельно.</p>`:'<button data-sync-action="check">Проверить подключение</button>'}
      <p class="task-meta">В аккаунте хранятся ник и учебные отметки. Пароль хранится в виде хеша; он не сохраняется в коде сайта или в браузерном хранилище.</p>`;
    document.body.append(dialog);dialog.showModal();
    dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
    dialog.addEventListener('cancel',()=>dialog.remove());
    document.getElementById('account-register')?.addEventListener('change',e=>{document.getElementById('account-submit').textContent=e.target.checked?'Создать аккаунт':'Войти';document.getElementById('account-password').autocomplete=e.target.checked?'new-password':'current-password';});
    document.getElementById('account-form')?.addEventListener('submit',authenticate);
    updateLabels();
  }
  async function authenticate(e){
    e.preventDefault();if(busy)return;busy=true;message='Проверяю вход…';updateLabels();
    const register=document.getElementById('account-register').checked;
    const name=document.getElementById('account-nickname').value,pass=document.getElementById('account-password').value,anonymous=snapshot();
    try{
      const value=await request(register?'register':'login',{nickname:name,password:pass});
      if(user)storeMeta();else backupGuest();++epoch;
      await connect(value,{seed:register,anonymous});busy=false;open();
    }catch(e){message=e.message||'Не удалось войти. Текущие отметки сохранены.';}
    finally{busy=false;const p=document.getElementById('account-password');if(p)p.value='';updateLabels();}
  }
  async function logout(){
    if(busy||!user)return;busy=true;updateLabels();
    try{
      await synchronize();storeMeta();await request('logout');++epoch;user=null;csrf='';meta={user:null,records:{},pending:{}};storeMeta();restoreGuest();message='Ты вышел. Показан прогресс без входа.';busy=false;open();
    }catch(e){message=e.message||'Не удалось выйти. Повтори при появлении связи.';}
    finally{busy=false;updateLabels();}
  }
  function mergeGuest(){
    const guest=read(GUEST,null);if(!guest)return;
    const values=snapshot(guest.tasks,guest.theory);
    for(const [key,v] of Object.entries(values))if(!Object.hasOwn(meta.records,key)&&!Object.hasOwn(meta.pending,key))meta.pending[key]=operation(v);
    storeMeta();applyRecords(meta.records);schedule();message='Местные отметки добавлены. Уже существующие отметки аккаунта сохранены.';updateLabels();
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest('[data-sync-action]');if(!a)return;e.preventDefault();
    const action=a.dataset.syncAction;
    if(action==='open')open();else if(action==='close')close();else if(action==='sync')synchronize();else if(action==='logout')logout();else if(action==='merge-guest')mergeGuest();else if(action==='check')loadSession().then(open);
  });
  window.addEventListener('storage',e=>{
    if(e.key===TASK||e.key===THEORY){changed(e.key===TASK?'tasks':'theory');return;}
    if(e.key===META){const other=read(META,null);if(!other)return;if(other.user?.id!==user?.id){++epoch;user=other.user||null;meta=other;csrf='';observed=snapshot();loadSession();return;}meta.records=other.records||meta.records;for(const [key,v] of Object.entries(other.pending||{})){const mine=meta.pending[key];if(!mine||v.at>mine.at||(v.at===mine.at&&v.op>mine.op))meta.pending[key]=v;}schedule();}
  });
  window.addEventListener('online',()=>loadSession());
  window.addEventListener('focus',()=>{if(user&&csrf)synchronize();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user&&csrf)synchronize();});
  setInterval(()=>{if(!document.hidden&&user&&csrf)synchronize();},30000);
  window.TFKPSync={changed,mount,buttonLabel,synchronize,loadSession,open};
  loadSession();
})();
