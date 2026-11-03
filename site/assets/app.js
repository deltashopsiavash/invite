'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const stageNames=['question','date','food','done'];
  const iconDefaults={question:'🥺',date:'📅',food:'🍽️',done:'🎉'};
  const stages=Object.fromEntries(stageNames.map(k=>[k,$('step-'+k)]));
  let active='question',busy=false,noCount=0,selectedFood='',selectedDate='',chosenTime='';
  const requestId=crypto.randomUUID();
  // Each invitation is addressed at /<person-slug>, including Persian Unicode names.
  let inviteSlug='';
  try{
    const parts=location.pathname.split('/').filter(Boolean);
    if(parts.length===1)inviteSlug=decodeURIComponent(parts[0]);
  }catch{}
  function invitationUnavailable(message){
    setText('questionTitle','لینک دعوت پیدا نشد 💌');
    setText('questionIntro',message);
    $('person').hidden=true;
    $('yes-btn').disabled=true;
    $('no-btn').disabled=true;
    $('no-btn').hidden=true;
    setText('no-message','از فرستنده بخواه لینک صحیح رو برات بفرسته.');
  }
  const defaults={
    personName:'',questionEyebrow:'یه دعوت خاص برای یه آدم خاص',questionTitle:'با من میای سر قرار؟',
    questionIntro:'فقط یه سوال ساده‌ست... جواب درست هم فقط یکیشه 😏',yesLabel:'آره 💕',noLabel:'نه',
    dateEyebrow:'مرحله دوم',dateTitle:'کی وقت داری؟',dateIntro:'یه تاریخ و ساعت خوب برام انتخاب کن',nextLabel:'بعدی ✨',
    foodEyebrow:'فقط یه انتخاب دیگه',foodTitle:'چی سفارش میدی؟',foodIntro:'یه چیز خوشمزه انتخاب کن که مهمونت باشی',
    finishLabel:'بریم که بریم 💌',doneEyebrow:'قرارمون شد!',doneTitle:'خوشحالم نگفتی نه!',
    doneIntro:'پس آماده باش، خودم میام دنبالت 🚗💨',doneNote:'برای اینکه ازت درخواست کنم یه وبسایت طراحی کردم، چیز مهمی نبود 🙈',
    footer:'ساخته شده با کلی عشق ♥'
  };
  function setText(id,value){const node=$(id);if(node)node.textContent=value||'';}
  function applyConfig(conf){
    for(const [key,fallback] of Object.entries(defaults)) setText(key,typeof conf[key]==='string'?conf[key]:fallback);
    setText('yes-btn',conf.yesLabel || defaults.yesLabel);
    setText('no-btn',conf.noLabel || defaults.noLabel);
    setText('date-next',conf.nextLabel || defaults.nextLabel);
    setText('finish-btn',conf.finishLabel || defaults.finishLabel);
    const name=(conf.personName||'').trim();
    if(name){setText('person','💌 این دعوت مخصوص '+name+'ـه');$('person').hidden=false;}
    else $('person').hidden=true;
    for(const stage of stageNames){
      const icon=$('icon-'+stage),img=conf[stage+'Image'],emoji=conf[stage+'Emoji']||iconDefaults[stage];
      icon.replaceChildren();
      if(typeof img==='string' && /^\/uploads\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(img)){
        const photo=document.createElement('img');
        photo.src=img;photo.alt='تصویر مرحله';
        photo.onerror=()=>icon.replaceChildren(document.createTextNode(emoji));
        icon.append(photo);
      }else icon.textContent=emoji;
    }
  }
  fetch('/api/public/config'+(inviteSlug?'?slug='+encodeURIComponent(inviteSlug):''),{cache:'no-store'})
    .then(async r=>{if(!r.ok)throw Error(r.status===404?'این لینک معتبر نیست یا حذف شده است.':'ارتباط با سرور برقرار نشد.');return r.json();})
    .then(applyConfig)
    .catch(error=>{invitationUnavailable(error.message);});
  function burst(count=28) {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const layer=$('heart-layer');
    const hearts=['💗','💕','💖','💌','💝'];
    for(let i=0;i<count;i++){
      const item=document.createElement('span');
      item.className='burst-heart';item.textContent=hearts[i%hearts.length];
      const angle=Math.PI*2*i/count+Math.random()*.5;
      const distance=90+Math.random()*Math.min(innerWidth,520)*.6;
      item.style.setProperty('--x',Math.cos(angle)*distance+'px');
      item.style.setProperty('--y',Math.sin(angle)*distance+'px');
      item.style.setProperty('--r',(Math.random()*720-360)+'deg');
      item.style.setProperty('--size',(17+Math.random()*20)+'px');
      item.style.setProperty('--duration',(820+Math.random()*500)+'ms');
      layer.append(item);item.addEventListener('animationend',()=>item.remove(),{once:true});
    }
  }
  function showStage(name) {
    active=name;
    stageNames.forEach((key,index)=>{
      const node=stages[key],visible=key===name;
      node.hidden=!visible;
      node.classList.toggle('active',visible);
      const dot=document.querySelectorAll('.progress-dot')[index];
      dot.classList.toggle('active',visible);
      dot.classList.toggle('past',stageNames.indexOf(name)>index);
    });
    window.scrollTo({top:0,behavior:'instant'});
  }
  function nextStage(name){if(busy)return;busy=true;burst(36);setTimeout(()=>{showStage(name);busy=false;},560);}
  $('yes-btn').addEventListener('click',()=>nextStage('date'));
  const noReplies=['مطمئنی؟ دوباره فکر کن 🥺','یه بار دیگه امتحان کن 😏','آره داره بزرگ‌تر می‌شه 💗','نه دیگه جایی نداره! 😌','خیلی نزدیکیم... 💕','دیگه فقط آره مونده!'];
  $('no-btn').addEventListener('click',()=>{
    noCount=Math.min(6,noCount+1);
    $('yes-btn').style.flexGrow=String(1+noCount*2);
    $('yes-btn').style.minHeight=(56+noCount*4)+'px';
    $('yes-btn').style.fontSize=(16+noCount*2)+'px';
    const mobile=matchMedia('(max-width:480px)').matches;
    $('no-btn').style.flexBasis=Math.max(0,(mobile?67:77)*(1-noCount/6))+'px';
    setText('no-message',noReplies[noCount-1]);burst(7);
    if(noCount===6){$('no-btn').classList.add('gone');$('no-btn').disabled=true;$('yes-btn').focus({preventScroll:true});}
  });
  const today=new Date();
  const currentUtc=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
  const numericPersian=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
  const labelPersian=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',timeZone:'UTC'});
  const fullPersian=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});
  const weekdayFormat=new Intl.DateTimeFormat('fa-IR',{weekday:'long',timeZone:'UTC'});
  const toFa=s=>String(s).replace(/[0-9]/g,ch=>'۰۱۲۳۴۵۶۷۸۹'[Number(ch)]);
  const byMonth=new Map();
  let currentKey='';
  for(let offset=-42;offset<=410;offset++){
    const date=new Date(currentUtc+offset*86400000);
    const pieces=Object.fromEntries(numericPersian.formatToParts(date).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value.replace(/,/g,''))]));
    const key=pieces.year+'-'+String(pieces.month).padStart(2,'0');
    if(offset===0)currentKey=key;
    if(!byMonth.has(key))byMonth.set(key,{label:labelPersian.format(date),days:[]});
    byMonth.get(key).days.push({iso:date.toISOString().slice(0,10),day:pieces.day,weekday:(date.getUTCDay()+1)%7,valid:offset>=0 && offset<=410});
  }
  const monthKeys=[...byMonth.keys()].filter(key=>key>=currentKey);
  let monthIndex=0;
  function renderCalendar(){
    const key=monthKeys[monthIndex],group=byMonth.get(key),grid=$('calendar-days');
    grid.replaceChildren();setText('month-label',group.label);
    $('prev-month').disabled=monthIndex===0;$('next-month').disabled=monthIndex===monthKeys.length-1;
    for(let i=0;i<group.days[0].weekday;i++){const blank=document.createElement('span');grid.append(blank);}
    for(const day of group.days){
      const btn=document.createElement('button');btn.type='button';btn.className='day';
      btn.textContent=toFa(day.day);btn.disabled=!day.valid;
      if(day.iso===selectedDate){btn.classList.add('selected');btn.setAttribute('aria-pressed','true');}
      btn.setAttribute('aria-label',day.iso);
      btn.addEventListener('click',()=>{selectedDate=day.iso;$('date-error').hidden=true;renderCalendar();burst(9);});
      grid.append(btn);
    }
  }
  $('prev-month').addEventListener('click',()=>{if(monthIndex>0){monthIndex--;renderCalendar();}});
  $('next-month').addEventListener('click',()=>{if(monthIndex<monthKeys.length-1){monthIndex++;renderCalendar();}});
  renderCalendar();
  $('date-next').addEventListener('click',()=>{
    chosenTime=$('time-input').value;
    if(!selectedDate || !/^([01]\d|2[0-3]):[0-5]\d$/.test(chosenTime)){$('date-error').hidden=false;return;}
    $('date-error').hidden=true;nextStage('food');
  });
  document.querySelectorAll('[data-food]').forEach(button=>{
    button.addEventListener('click',()=>{
      selectedFood=button.dataset.food;
      document.querySelectorAll('[data-food]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      $('food-error').hidden=true;burst(12);
    });
  });
  $('finish-btn').addEventListener('click',async ()=>{
    if(!selectedFood){$('food-error').hidden=false;return;}
    if(busy)return;
    busy=true;const button=$('finish-btn');button.disabled=true;const oldText=button.textContent;button.textContent='در حال ثبت... 💗';
    try{
      const response=await fetch('/api/public/response',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({requestId,slug:inviteSlug,date:selectedDate,time:chosenTime,food:selectedFood})
      });
      const payload=await response.json();
      if(!response.ok)throw Error(payload.error||'مشکلی در ثبت پیش آمد.');
      const dateObj=new Date(selectedDate+'T12:00:00Z');
      const dateFa=payload.dateFa||fullPersian.format(dateObj);
      setText('final-date',dateFa);
      setText('final-time',toFa(chosenTime));
      setText('final-food',selectedFood);
      setText('final-promise','پس '+weekdayFormat.format(dateObj)+' '+dateFa+' ساعت '+toFa(chosenTime)+' میام دنبالت برای '+selectedFood+' 💞');
      burst(75);
      setTimeout(()=>showStage('done'),650);
    }catch(error){$('food-error').hidden=false;setText('food-error',error.message||'ثبت انجام نشد؛ دوباره امتحان کن.');button.disabled=false;button.textContent=oldText;busy=false;}
  });
})();