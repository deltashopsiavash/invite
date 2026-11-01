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
