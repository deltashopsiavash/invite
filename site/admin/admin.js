'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let csrf='',settings={},activeTab='invitations',invitations=[],activeInvitation=null;
  const groups=[
    ['صفحه اول',[['personName','اسم شخص (در صفحه اول نمایش داده می‌شه)'],['questionEyebrow','متن بالای عنوان'],['questionTitle','عنوان اصلی'],['questionIntro','توضیح زیر عنوان'],['yesLabel','متن دکمه آره'],['noLabel','متن دکمه نه']]],
    ['انتخاب تاریخ',[['dateEyebrow','متن بالای عنوان'],['dateTitle','عنوان'],['dateIntro','توضیح'],['nextLabel','متن دکمه بعدی']]],
    ['انتخاب غذا',[['foodEyebrow','متن بالای عنوان'],['foodTitle','عنوان'],['foodIntro','توضیح'],['finishLabel','متن دکمه نهایی']]],
    ['پایان دعوت',[['doneEyebrow','متن بالای عنوان'],['doneTitle','عنوان تبریک'],['doneIntro','متن بعد از خلاصه قرار'],['doneNote','یادداشت پایین کارت']]],
    ['پایین سایت',[['footer','متن فوتر']]]
  ];
  const stages=[['question','صفحه اول'],['date','انتخاب تاریخ'],['food','انتخاب غذا'],['done','صفحه نهایی']];
  const defaults={question:'🥺',date:'📅',food:'🍽️',done:'🎉'};
  async function api(url,options={}){
    const headers={...(options.headers||{})};
    if(options.body && !(options.body instanceof FormData))headers['Content-Type']='application/json';
    if(csrf && options.method && options.method!=='GET')headers['X-Invite-CSRF']=csrf;
    const response=await fetch(url,{...options,headers,credentials:'same-origin',cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'ارتباط با سرور برقرار نشد.');
    return result;
  }
  function status(message,bad=false){
    $('status-message').textContent=message;
    $('status-message').style.color=bad?'#b83d72':'#457f9e';
  }
  function toggleAuth(isAuth){
    $('login-box').hidden=isAuth;$('dashboard').hidden=!isAuth;
  }
  async function load(){
    let data;
    try{
      data=await api('/api/admin/session');
    }catch(error){
      toggleAuth(false);
      $('login-error').textContent='بررسی نشست انجام نشد: '+error.message;
      return;
    }
    if(data.authenticated){
      csrf=data.csrf;
      await openDashboard();
    }else toggleAuth(false);
  }
  $('login-form').addEventListener('submit',async(event)=>{
    event.preventDefault();const pass=$('admin-password').value;
    const button=$('login-form').querySelector('button');button.disabled=true;
    $('login-error').textContent='';
    try{
      const data=await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:pass})});
      csrf=data.csrf;$('admin-password').value='';await openDashboard();
    }catch(error){$('login-error').textContent=error.message;}
    finally{button.disabled=false;}
  });
  function invitationUrl(slug){return location.origin+'/'+encodeURIComponent(slug);}
  function setTab(tab){
    if(['content','images'].includes(tab) && !activeInvitation)tab='invitations';
    activeTab=tab;
    document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===tab));
    ['invitations','content','images','answers','security'].forEach(name=>$('tab-'+name).hidden=name!==tab);
    $('save-bar').hidden=!['content','images'].includes(tab)||!activeInvitation;
    $('selected-invite-bar').hidden=!activeInvitation || tab==='invitations'||tab==='security';
    if(tab==='answers')loadResponses();
  }
  async function openDashboard(){
    toggleAuth(true);
    $('dashboard-error').hidden=true;
    $('retry-dashboard').hidden=true;
    try{
      await refreshInvitations();
      setTab('invitations');
    }catch(error){
      console.error('Dashboard initialization:',error);
      $('dashboard-error').hidden=false;
      $('retry-dashboard').hidden=false;
      $('dashboard-error').textContent='بارگذاری پنل کامل نشد: '+error.message+' — روی «تلاش مجدد» بزن.';
    }
  }
  $('retry-dashboard').addEventListener('click',openDashboard);
  async function refreshInvitations(selectId){
    invitations=await api('/api/admin/invitations');
    renderInvitationList();
    renderAnswerFilters();
    if(selectId){
      await selectInvitation(selectId,false);
    }else if(activeInvitation && invitations.some(i=>i.id===activeInvitation.id)){
      await selectInvitation(activeInvitation.id,false);
    }else if(invitations.length){
      await selectInvitation(invitations[0].id,false);
    }else{
      activeInvitation=null;
      $('selected-invite-bar').hidden=true;
      $('content-fields').replaceChildren();
      $('icon-fields').replaceChildren();
      $('save-bar').hidden=true;
    }
  }
  function renderInvitationList(){
    const list=$('invite-list');list.replaceChildren();
    if(!invitations.length){const p=document.createElement('p');p.className='sub';p.textContent='هنوز لینکی نساختی. از فرم بالا اولین دعوت رو بساز 💌';list.append(p);return;}
    for(const invite of invitations){
      const card=document.createElement('div');
      card.className='invite-card-small'+(activeInvitation?.id===invite.id?' selected':'');
      const name=document.createElement('strong');name.textContent=invite.name;
      const link=document.createElement('a');link.className='link-line';link.href=invitationUrl(invite.slug);link.target='_blank';link.rel='noopener noreferrer';link.textContent=invitationUrl(invite.slug);
      const count=document.createElement('small');count.textContent=toFa(invite.responses_count)+' جواب ثبت‌شده';
      const actions=document.createElement('div');actions.className='actions';
      const select=document.createElement('button');select.type='button';select.className='btn primary';select.textContent='انتخاب و ویرایش';
      select.addEventListener('click',async()=>{await selectInvitation(invite.id);setTab('content');});
      const copy=document.createElement('button');copy.type='button';copy.className='btn ghost';copy.textContent='کپی لینک';
      copy.addEventListener('click',()=>copyUrl(invitationUrl(invite.slug)));
      const remove=document.createElement('button');remove.type='button';remove.className='btn outline';remove.textContent='حذف لینک';
      remove.addEventListener('click',async()=>{
        if(!confirm('لینک '+invite.name+' حذف بشه؟ جواب‌های قبلی در بخش همه پاسخ‌ها باقی می‌مونن.'))return;
        try{
          await api('/api/admin/invitations/'+invite.id,{method:'DELETE'});
          if(activeInvitation?.id===invite.id)activeInvitation=null;
          await refreshInvitations();
          setTab('invitations');
        }catch(error){alert(error.message);}
      });
      actions.append(select,copy,remove);card.append(name,link,count,actions);list.append(card);
    }
  }
  async function copyUrl(url){
    try{await navigator.clipboard.writeText(url);status('لینک کپی شد ✅');}
    catch{window.prompt('لینک رو کپی کن:',url);}
  }
  async function selectInvitation(id,rerenderList=true){
    const result=await api('/api/admin/invitations/'+id);
    activeInvitation={id:result.id,name:result.name,slug:result.slug};
    settings={...result.config};
    $('invite-slug').value=result.slug;
    const link=$('selected-invite-url');link.href=invitationUrl(result.slug);link.textContent=invitationUrl(result.slug);
    $('selected-invite-bar').hidden=false;
    renderFields();renderIcons();
    if(rerenderList)renderInvitationList();
    renderAnswerFilters(String(result.id));
    status('در حال ویرایش لینک '+result.name);
  }
  $('create-invite-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const name=$('new-person').value.trim(),slug=$('new-slug').value.trim();
    const button=$('create-invite-form').querySelector('button');
    button.disabled=true;$('create-error').textContent='';
    try{
      const result=await api('/api/admin/invitations',{method:'POST',body:JSON.stringify({name,slug})});
      $('create-invite-form').reset();
      await refreshInvitations(result.id);
      setTab('content');
    }catch(error){$('create-error').textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('copy-current-link').addEventListener('click',()=>{if(activeInvitation)copyUrl(invitationUrl(activeInvitation.slug));});
  function renderAnswerFilters(selectedId){
    const picker=$('answers-filter');
    const chosen=selectedId||(picker.value||'all');
    picker.replaceChildren();
    for(const [value,name] of [['all','همه لینک‌ها'],['legacy','لینک اصلی (بدون اسم)'],...invitations.map(x=>[String(x.id),x.name+' / '+x.slug])]){
      const option=document.createElement('option');option.value=value;option.textContent=name;picker.append(option);
    }
    picker.value=[...picker.options].some(x=>x.value===chosen)?chosen:'all';
    updateDownloadUrl();
  }
  function updateDownloadUrl(){
    $('download-csv').href='/api/admin/responses.csv?invitationId='+encodeURIComponent($('answers-filter').value||'all');
  }
  $('answers-filter').addEventListener('change',()=>{updateDownloadUrl();loadResponses();});

  function renderFields(){
    const root=$('content-fields');root.replaceChildren();
    for(const [name,fields] of groups){
      const section=document.createElement('section');section.className='content-section';
      const heading=document.createElement('h3');heading.textContent=name;section.append(heading);
      const grid=document.createElement('div');grid.className='fields-grid';
      for(const [key,label] of fields){
        const wrap=document.createElement('div');wrap.className='field'+(['questionIntro','dateIntro','foodIntro','doneIntro','doneNote','footer'].includes(key)?' wide':'');
        const caption=document.createElement('label');caption.textContent=label;caption.htmlFor='setting-'+key;
        let input;
        if(['questionIntro','dateIntro','foodIntro','doneIntro','doneNote','footer'].includes(key)){
          input=document.createElement('textarea');input.rows=2;
        }else{input=document.createElement('input');input.type='text';}
        input.id='setting-'+key;input.name=key;input.maxLength=500;input.value=settings[key]||'';
        wrap.append(caption,input);grid.append(wrap);
      }
      section.append(grid);root.append(section);
    }
  }
  const imagePreview={};
  function renderIcons(){
    const root=$('icon-fields');root.replaceChildren();
    for(const [stage,name] of stages){
      const card=document.createElement('div');card.className='icon-card';
      const heading=document.createElement('h3');heading.textContent=name;
      const preview=document.createElement('div');preview.className='icon-preview';
      imagePreview[stage]=preview;
      const emojiLabel=document.createElement('label');emojiLabel.textContent='ایموجی';emojiLabel.htmlFor='icon-emoji-'+stage;
      const emoji=document.createElement('input');emoji.type='text';emoji.id='icon-emoji-'+stage;emoji.maxLength=25;emoji.value=settings[stage+'Emoji']||defaults[stage];
      emoji.addEventListener('input',()=>{if(!settings[stage+'Image'])renderPreview(stage);});
      const imgLabel=document.createElement('label');imgLabel.textContent='یا بارگذاری تصویر';imgLabel.htmlFor='icon-file-'+stage;
      const file=document.createElement('input');file.type='file';file.accept='image/png,image/jpeg,image/webp,image/gif';file.id='icon-file-'+stage;
      const hint=document.createElement('p');hint.className='file-hint';hint.textContent='حداکثر حجم فایل: ۳ مگابایت';
      const reset=document.createElement('button');reset.type='button';reset.className='btn outline';reset.textContent='حذف عکس و استفاده از ایموجی';
      reset.addEventListener('click',()=>{settings[stage+'Image']='';file.value='';renderPreview(stage);status('عکس حذف شد؛ برای اعمال نهایی ذخیره کن.');});
      file.addEventListener('change',async()=>{
        if(!file.files[0])return;
        const body=new FormData();body.append('image',file.files[0]);
        try{
          status('در حال آپلود تصویر...');
          const response=await api('/api/admin/upload/'+stage,{method:'POST',body});
          settings[stage+'Image']=response.url;
          renderPreview(stage);status('تصویر آپلود شد؛ روی «ذخیره تغییرات» بزن.');
        }catch(error){status(error.message,true);}
        finally{file.value='';}
      });
      card.append(heading,preview,emojiLabel,emoji,imgLabel,file,hint,reset);root.append(card);
      renderPreview(stage);
    }
  }
  function renderPreview(stage){
    const preview=imagePreview[stage];preview.replaceChildren();
    const value=settings[stage+'Image'];
    if(value && /^\/uploads\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(value)){
      const image=document.createElement('img');image.src=value;image.alt='تصویر انتخاب‌شده';
      image.onerror=()=>preview.replaceChildren(document.createTextNode(defaults[stage]));
      preview.append(image);
    } else preview.textContent=$('icon-emoji-'+stage).value||defaults[stage];
  }
  $('save-config').addEventListener('click',async()=>{
    if(!activeInvitation){status('اول یک لینک اختصاصی بساز.',true);return;}
    const payload={...settings};
    for(const group of groups)for(const [key] of group[1])payload[key]=$('setting-'+key).value;
    for(const [stage] of stages)payload[stage+'Emoji']=$('icon-emoji-'+stage).value;
    const button=$('save-config');button.disabled=true;status('در حال ذخیره...');
    try{
      const result=await api('/api/admin/invitations/'+activeInvitation.id,{method:'PUT',body:JSON.stringify({
        name:payload.personName,slug:$('invite-slug').value.trim(),config:payload
      })});
      settings=result.config;
      activeInvitation={id:result.id,name:result.name,slug:result.slug};
      await refreshInvitations(result.id);
      setTab(activeTab);
      status('✅ تغییرات این لینک ذخیره شد.');
    }catch(error){status(error.message,true);}finally{button.disabled=false;}
  });
  async function loadResponses(){
    const tbody=$('answers-body');tbody.replaceChildren();
    try{
      const data=await api('/api/admin/responses?limit=200&invitationId='+encodeURIComponent($('answers-filter').value||'all'));
      $('answers-count').textContent=toFa(data.total)+' پاسخ ثبت‌شده (نمایش جدیدترین ۲۰۰ مورد)';
      if(!data.rows.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=6;td.textContent='هنوز پاسخی ثبت نشده 💌';tr.append(td);tbody.append(tr);return;}
      for(const row of data.rows){
        const tr=document.createElement('tr');
        const registered=new Date(row.created_at);
        const values=[row.id,row.person_name||'—',row.date_fa,row.time_text,row.food,isNaN(registered.getTime())?row.created_at:registered.toLocaleString('fa-IR',{timeZone:'Asia/Tehran'})];
        for(const value of values){const td=document.createElement('td');td.textContent=String(value??'');tr.append(td);}
        tbody.append(tr);
      }
    }catch(error){$('answers-count').textContent=error.message;}
  }
  const toFa=n=>String(n).replace(/[0-9]/g,ch=>'۰۱۲۳۴۵۶۷۸۹'[Number(ch)]);
  $('refresh-answers').addEventListener('click',loadResponses);
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  $('password-form').addEventListener('submit',async(event)=>{
    event.preventDefault();
    try{
      await api('/api/admin/change-password',{method:'POST',body:JSON.stringify({oldPassword:$('old-password').value,newPassword:$('new-password').value})});
      $('password-form').reset();status('رمز عبور تغییر کرد ✅');
      alert('رمز عبور با موفقیت تغییر کرد.');
    }catch(error){alert(error.message);}
  });
  $('logout').addEventListener('click',async()=>{
    try{await api('/api/admin/logout',{method:'POST'});}catch{}
    csrf='';toggleAuth(false);$('login-error').textContent='';$('save-bar').hidden=false;
  });
  load();
})();