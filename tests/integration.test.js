'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const base=path.resolve(__dirname,'..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'invite-v2-test-'));
const port=35000+Math.floor(Math.random()*15000);
const env={...process.env,INVITE_DATA_DIR:dir,INVITE_PORT:String(port),NODE_ENV:'test'};
const url='http://127.0.0.1:'+port;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(route,method='GET',body,headers={}){
  return fetch(url+route,{method,headers:{...(body && !(body instanceof FormData)?{'content-type':'application/json'}:{}),...headers},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
}
test('persistent database, admin security and completed invitation flow',async()=>{
  const password='test-password-'+crypto.randomBytes(12).toString('hex');
  const boot=spawnSync(process.execPath,['server/index.js','bootstrap'],{cwd:base,env,input:password,encoding:'utf8'});
  assert.equal(boot.status,0,boot.stderr);
  const child=spawn(process.execPath,['server/index.js'],{cwd:base,env,stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',b=>errors+=b);
  try{
    let ready=false;
    for(let i=0;i<65;i++){
      if(child.exitCode!==null)break;
      try{const response=await request('/api/health');if(response.ok){ready=true;break;}}catch{}
      await delay(100);
    }
    assert.equal(ready,true,'API did not start: '+errors);
    assert.equal((await request('/api/admin/config')).status,401);
    assert.equal((await request('/api/admin/login','POST',{password:'wrong'})).status,401);
    const login=await request('/api/admin/login','POST',{password});
    assert.equal(login.status,200);
    const {csrf}=await login.json();
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const auth={cookie,'x-invite-csrf':csrf};
    assert.equal((await request('/api/admin/config','PUT',{personName:'نگار'}, {cookie})).status,403);
    const setting=await request('/api/admin/config','PUT',{personName:'نگار',questionTitle:'بریم قرار؟'},auth);
    assert.equal(setting.status,200);
    const publicConfig=await (await request('/api/public/config')).json();
    assert.equal(publicConfig.personName,'نگار');
    const date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    const responseId=crypto.randomUUID();
    const answer=await request('/api/public/response','POST',{date,time:'20:30',food:'پیتزا',requestId:responseId});
    assert.equal(answer.status,201,await answer.text());
    const again=await request('/api/public/response','POST',{date,time:'20:30',food:'پیتزا',requestId:responseId});
    assert.equal(again.status,201);
    const responses=await(await request('/api/admin/responses','GET',null,{cookie})).json();
    assert.equal(responses.total,1);
    assert.equal(responses.rows[0].food,'پیتزا');
    assert.equal(responses.rows[0].person_name,'نگار');
    assert.ok(responses.rows[0].date_fa);
    // Each person receives a unique public URL and isolated settings / replies.
    assert.equal((await request('/api/admin/invitations')).status,401);
    const createA=await request('/api/admin/invitations','POST',{name:'ساغر'},auth);
    assert.equal(createA.status,201);
    const a=await createA.json();
    assert.equal(a.slug,'ساغر');
    const createB=await request('/api/admin/invitations','POST',{name:'مریم',slug:'maryam'},auth);
    assert.equal(createB.status,201);
    const b=await createB.json();
    assert.equal(b.slug,'maryam');
    assert.equal((await request('/api/admin/invitations','POST',{name:'تکراری',slug:'maryam'},auth)).status,409);
    assert.equal((await request('/api/public/config?slug=unknown')).status,404);
    const detailA=await (await request('/api/admin/invitations/'+a.id,'GET',null,{cookie})).json();
    const detailB=await (await request('/api/admin/invitations/'+b.id,'GET',null,{cookie})).json();
    const changeA=await request('/api/admin/invitations/'+a.id,'PUT',{
      name:'ساغر',slug:'ساغر',config:{...detailA.config,questionTitle:'ساغر، با من میای قرار؟'}
    },auth);
    assert.equal(changeA.status,200);
    const publicA=await (await request('/api/public/config?slug='+encodeURIComponent('ساغر'))).json();
    const publicB=await (await request('/api/public/config?slug=maryam')).json();
    assert.equal(publicA.questionTitle,'ساغر، با من میای قرار؟');
    assert.equal(publicB.questionTitle,detailB.config.questionTitle);
    assert.equal(publicA.personName,'ساغر');
    assert.equal(publicB.personName,'مریم');
    const submitA=await request('/api/public/response','POST',{
      date,time:'18:15',food:'قهوه',requestId:crypto.randomUUID(),slug:'ساغر'
    });
    assert.equal(submitA.status,201);
    const submitB=await request('/api/public/response','POST',{
      date,time:'19:40',food:'پاستا',requestId:crypto.randomUUID(),slug:'maryam'
    });
    assert.equal(submitB.status,201);
    const onlyA=await (await request('/api/admin/responses?invitationId='+a.id,'GET',null,{cookie})).json();
    const onlyB=await (await request('/api/admin/responses?invitationId='+b.id,'GET',null,{cookie})).json();
    assert.equal(onlyA.total,1);
    assert.equal(onlyB.total,1);
    assert.equal(onlyA.rows[0].person_name,'ساغر');
    assert.equal(onlyB.rows[0].person_name,'مریم');
    const list=await (await request('/api/admin/invitations','GET',null,{cookie})).json();
    assert.equal(list.length,2);
    assert.ok(list.every(x=>x.responses_count===1));
    const csv=await request('/api/admin/responses.csv?invitationId='+a.id,'GET',null,{cookie});
    assert.equal(csv.status,200);
    assert.ok((await csv.text()).includes('ساغر'));
    assert.equal((await request('/api/admin/invitations/'+a.id,'DELETE',{},auth)).status,200);
    assert.equal((await request('/api/public/config?slug='+encodeURIComponent('ساغر'))).status,404);
    const totalRows=await (await request('/api/admin/responses','GET',null,{cookie})).json();
    assert.equal(totalRows.total,3); // historical answer remains after link deletion
    const imageBytes=Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex');
    const form=new FormData();form.append('image',new Blob([imageBytes],{type:'image/png'}),'icon.png');
    const upload=await request('/api/admin/upload/question','POST',form,auth);
    assert.equal(upload.status,200);
    const imageUrl=(await upload.json()).url;
    assert.equal((await request(imageUrl)).status,200);
    assert.equal((await request('/api/admin/config','PUT',{questionImage:imageUrl},auth)).status,200);
    assert.equal((await request('/api/admin/logout','POST',{},auth)).status,200);
    assert.equal((await request('/api/admin/responses','GET',null,{cookie})).status,401);
    assert.ok(fs.existsSync(path.join(dir,'invite.sqlite')));
  }finally{
    child.kill('SIGTERM');
    await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
