'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let csrf='',settings={},activeTab='content';
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
    try{
      const data=await api('/api/admin/session');
      if(data.authenticated){csrf=data.csrf;await openDashboard();}
      else toggleAuth(false);
    }catch(error){toggleAuth(false);$('login-error').textContent=error.message;}
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
  async function openDashboard(){
    const config=await api('/api/admin/config');
    settings={...config};renderFields();renderIcons();toggleAuth(true);
    await loadResponses();
  }
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
    const payload={...settings};
    for(const group of groups)for(const [key] of group[1])payload[key]=$('setting-'+key).value;
    for(const [stage] of stages)payload[stage+'Emoji']=$('icon-emoji-'+stage).value;
    const button=$('save-config');button.disabled=true;status('در حال ذخیره...');
    try{
      const result=await api('/api/admin/config',{method:'PUT',body:JSON.stringify(payload)});
      settings=result.config;status('✅ همه تغییرات ذخیره شدند و در سایت نمایش داده می‌شن.');
    }catch(error){status(error.message,true);}finally{button.disabled=false;}
  });
  async function loadResponses(){
    const tbody=$('answers-body');tbody.replaceChildren();
    try{
      const data=await api('/api/admin/responses?limit=200');
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
  document.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>{
      activeTab=button.dataset.tab;
      document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));
      ['content','images','answers','security'].forEach(tab=>$('tab-'+tab).hidden=tab!==activeTab);
      $('save-bar').hidden=!['content','images'].includes(activeTab);
      if(activeTab==='answers')loadResponses();
    });
  });
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