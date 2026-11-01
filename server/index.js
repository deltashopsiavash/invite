'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const initSqlJs = require('sql.js');

const dataDir = process.env.INVITE_DATA_DIR || '/var/lib/invite';
const uploadDir = path.join(dataDir, 'uploads');
const dbFile = path.join(dataDir, 'invite.sqlite');
const port = Number(process.env.INVITE_PORT || 3477);
const defaults = Object.freeze({
  personName: '',
  questionEyebrow: 'یه دعوت خاص برای یه آدم خاص',
  questionTitle: 'با من میای سر قرار؟',
  questionIntro: 'فقط یه سوال ساده‌ست... جواب درست هم فقط یکیشه 😏',
  yesLabel: 'آره 💕', noLabel: 'نه',
  dateEyebrow: 'مرحله دوم',
  dateTitle: 'کی وقت داری؟',
  dateIntro: 'یه تاریخ و ساعت خوب برام انتخاب کن',
  nextLabel: 'بعدی ✨',
  foodEyebrow: 'فقط یه انتخاب دیگه',
  foodTitle: 'چی سفارش میدی؟',
  foodIntro: 'یه چیز خوشمزه انتخاب کن که مهمونت باشی',
  finishLabel: 'بریم که بریم 💌',
  doneEyebrow: 'قرارمون شد!',
  doneTitle: 'خوشحالم نگفتی نه!',
  doneIntro: 'پس آماده باش، خودم میام دنبالت 🚗💨',
  doneNote: 'برای اینکه ازت درخواست کنم یه وبسایت طراحی کردم، چیز مهمی نبود 🙈',
  footer: 'ساخته شده با کلی عشق ♥',
  questionEmoji: '🥺', dateEmoji: '📅', foodEmoji: '🍽️', doneEmoji: '🎉',
  questionImage: '', dateImage: '', foodImage: '', doneImage: ''
});
const stageNames = ['question', 'date', 'food', 'done'];
const foodNames = ['قهوه', 'پیتزا', 'پاستا', 'کوبیده'];
const now = () => Date.now();
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
function makePassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function checkPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2 || !/^[a-f0-9]{32}$/.test(parts[0]) || !/^[a-f0-9]{128}$/.test(parts[1])) return false;
  const actual = crypto.scryptSync(password, parts[0], 64);
  return crypto.timingSafeEqual(actual, Buffer.from(parts[1], 'hex'));
}
async function start() {
  fs.mkdirSync(uploadDir, {recursive:true, mode:0o700});
  const SQL = await initSqlJs({locateFile: file => path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', file)});
  const db = fs.existsSync(dbFile) ? new SQL.Database(fs.readFileSync(dbFile)) : new SQL.Database();
  db.run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS credentials (id INTEGER PRIMARY KEY CHECK(id=1), password_hash TEXT NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  db.run('CREATE TABLE IF NOT EXISTS responses (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT UNIQUE NOT NULL, person_name TEXT NOT NULL, date_iso TEXT NOT NULL, date_fa TEXT NOT NULL, time_text TEXT NOT NULL, food TEXT NOT NULL, created_at TEXT NOT NULL)');
  function persist() {
    const temp = dbFile + '.tmp';
    fs.writeFileSync(temp, Buffer.from(db.export()), {mode:0o600});
    fs.renameSync(temp, dbFile);
  }
  function first(sql, params=[]) {
    const statement = db.prepare(sql);
    try {statement.bind(params); return statement.step() ? statement.getAsObject() : null;}
    finally {statement.free();}
  }
  function all(sql, params=[]) {
    const statement=db.prepare(sql), rows=[];
    try {statement.bind(params); while(statement.step()) rows.push(statement.getAsObject()); return rows;}
    finally {statement.free();}
  }
  function getConfig() {
    const conf={...defaults};
    for (const row of all('SELECT key,value FROM settings')) {
      if (Object.prototype.hasOwnProperty.call(defaults,row.key)) conf[row.key]=row.value;
    }
    return conf;
  }
  if (!fs.existsSync(dbFile)) persist();
  if (process.argv[2] === 'bootstrap') {
    let password='';
    for await (const chunk of process.stdin) password+=chunk;
    password=password.trim();
    if (!first('SELECT id FROM credentials WHERE id=1')) {
      if (password.length<12 || password.length>256) throw new Error('Admin password must contain between 12 and 256 characters');
      db.run('INSERT INTO credentials(id,password_hash) VALUES(1,?)',[makePassword(password)]);
      persist(); console.log('Admin account created.');
    } else console.log('Admin account already exists. Password unchanged.');
    db.close();
    return;
  }
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Referrer-Policy','same-origin');
    next();
  });
  app.use(express.json({limit:'24kb'}));
  function sameOrigin(req) {
    const origin=req.get('origin');
    if (!origin) return true;
    try {const u=new URL(origin);return u.protocol==='https:' && u.host===req.get('host');}
    catch {return false;}
  }
  app.use('/api',(req,res,next)=>{
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && !sameOrigin(req)) return res.status(403).json({error:'مبدأ درخواست نامعتبر است.'});
    next();
  });
  const failures=new Map();
  function rateLimit(key,max=15,period=600000) {
    const t=now(), old=failures.get(key);
    const entry=old && old.until>t?old:{until:t+period,count:0};
    entry.count++; failures.set(key,entry);
    if(failures.size>3000) for(const [k,v] of failures) if(v.until<=t) failures.delete(k);
    return entry.count<=max;
  }
  const clientIP = req => (req.get('x-forwarded-for') || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const cookies=req=>Object.fromEntries((req.get('cookie')||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
  function currentSession(req) {
    const token=cookies(req).invite_session;
    if(!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const s=first('SELECT csrf,expires_at FROM sessions WHERE token_hash=?',[hash(token)]);
    return s && Number(s.expires_at)>now()?{...s,tokenHash:hash(token)}:null;
  }
  function requireAdmin(req,res,next) {
    const session=currentSession(req);
    if (!session) return res.status(401).json({error:'لطفاً وارد پنل مدیریت شوید.'});
    if(!['GET','HEAD'].includes(req.method) && req.get('x-invite-csrf')!==session.csrf) return res.status(403).json({error:'درخواست نامعتبر است. صفحه را تازه‌سازی کنید.'});
    req.adminSession=session; next();
  }
  const cookieName='invite_session';
  function setCookie(res,value,maxAge) {
    res.append('Set-Cookie',cookieName+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge);
  }
  app.get('/api/health',(req,res)=>res.json({ok:true,version:2}));
  app.get('/api/public/config',(req,res)=>res.json(getConfig()));
  app.post('/api/public/response',(req,res)=>{
    if(!rateLimit('submit:'+clientIP(req),10,3600000)) return res.status(429).json({error:'تعداد درخواست‌ها زیاد است. کمی بعد دوباره امتحان کنید.'});
    const body=req.body||{};
    const {date,time,food,requestId}=body;
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!foodNames.includes(food)||typeof requestId!=='string'|| !/^[a-f0-9-]{36}$/.test(requestId)) return res.status(400).json({error:'اطلاعات قرار درست نیست.'});
    const parsed=new Date(date+'T12:00:00Z');
    if(Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) return res.status(400).json({error:'تاریخ نامعتبر است.'});
    const earliest=new Date();earliest.setUTCHours(0,0,0,0);earliest.setUTCDate(earliest.getUTCDate()-1);
    const latest=new Date();latest.setUTCDate(latest.getUTCDate()+410);
    if(parsed<earliest||parsed>latest) return res.status(400).json({error:'تاریخ انتخاب‌شده خارج از محدوده است.'});
    const format=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});
    const dateFa=format.format(parsed);
    const person=getConfig().personName.slice(0,120);
    try {
      db.run('INSERT OR IGNORE INTO responses(request_id,person_name,date_iso,date_fa,time_text,food,created_at) VALUES(?,?,?,?,?,?,?)',[requestId,person,date,dateFa,time,food,new Date().toISOString()]);
      persist();
      const answer=first('SELECT id FROM responses WHERE request_id=?',[requestId]);
      res.status(201).json({ok:true,id:answer.id,dateFa});
    } catch(err){console.error('response save:',err);res.status(500).json({error:'ثبت نشد. دوباره امتحان کن.'});}
  });
  app.post('/api/admin/login',(req,res)=>{
    if(!rateLimit('login:'+clientIP(req),8,15*60000)) return res.status(429).json({error:'تلاش‌های زیادی انجام شد. ۱۵ دقیقه بعد دوباره امتحان کنید.'});
    const password=req.body && req.body.password;
    if(typeof password!=='string'||password.length>256||!checkPassword(password,first('SELECT password_hash FROM credentials WHERE id=1')?.password_hash)) return res.status(401).json({error:'رمز عبور نادرست است.'});
    const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');
    db.run('DELETE FROM sessions WHERE expires_at<?',[now()]);
    db.run('INSERT INTO sessions(token_hash,csrf,expires_at) VALUES(?,?,?)',[hash(token),csrf,now()+7*86400000]);
    persist();
    setCookie(res,token,7*86400);
    res.json({ok:true,csrf});
  });
  app.get('/api/admin/session',(req,res)=>{
    const session=currentSession(req);
    res.json({authenticated:!!session,csrf:session?session.csrf:null});
  });
  app.post('/api/admin/logout',requireAdmin,(req,res)=>{
    db.run('DELETE FROM sessions WHERE token_hash=?',[req.adminSession.tokenHash]);persist();
    setCookie(res,'',0);res.json({ok:true});
  });
  app.get('/api/admin/config',requireAdmin,(req,res)=>res.json(getConfig()));
  app.put('/api/admin/config',requireAdmin,(req,res)=>{
    const incoming=req.body;
    if(!incoming || typeof incoming!=='object'||Array.isArray(incoming)) return res.status(400).json({error:'تنظیمات نامعتبر است.'});
    for(const [key,value] of Object.entries(incoming)) {
      if(!Object.hasOwn(defaults,key)||typeof value!=='string'||value.length>500) return res.status(400).json({error:'یکی از فیلدها نامعتبر است: '+key});
      if(key.endsWith('Image') && value && !/^\/uploads\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(value)) return res.status(400).json({error:'مسیر عکس معتبر نیست.'});
    }
    try{
      db.run('BEGIN TRANSACTION');
      for(const [key,value] of Object.entries(incoming)) db.run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)',[key,value.trim()]);
      db.run('COMMIT');persist();res.json({ok:true,config:getConfig()});
    } catch(error){try{db.run('ROLLBACK');}catch{} console.error(error);res.status(500).json({error:'ذخیره تنظیمات ناموفق بود.'});}
  });
  app.get('/api/admin/responses',requireAdmin,(req,res)=>{
    const limit=Math.min(200,Math.max(1,Number(req.query.limit)||100));
    res.json({total:first('SELECT COUNT(*) AS count FROM responses').count,rows:all('SELECT id,person_name,date_iso,date_fa,time_text,food,created_at FROM responses ORDER BY id DESC LIMIT ?',[limit])});
  });
  app.get('/api/admin/responses.csv',requireAdmin,(req,res)=>{
    const escapeCell=v=>{
      let value=String(v??'');
      if(/^[=+\-@\t\r]/.test(value)) value="'"+value;
      return '"'+value.replace(/"/g,'""')+'"';
    };
    const csv=[['ردیف','نام شخص','تاریخ شمسی','تاریخ میلادی','ساعت','انتخاب','زمان ثبت'],...all('SELECT id,person_name,date_fa,date_iso,time_text,food,created_at FROM responses ORDER BY id DESC').map(x=>[x.id,x.person_name,x.date_fa,x.date_iso,x.time_text,x.food,x.created_at])].map(row=>row.map(escapeCell).join(',')).join('\r\n');
    res.type('text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="invite-responses.csv"').send('\ufeff'+csv);
  });
  app.post('/api/admin/change-password',requireAdmin,(req,res)=>{
    const {oldPassword,newPassword}=req.body||{};
    if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>256) return res.status(400).json({error:'رمز جدید باید حداقل ۱۲ کاراکتر باشد.'});
    if(typeof oldPassword!=='string'||!checkPassword(oldPassword,first('SELECT password_hash FROM credentials WHERE id=1').password_hash)) return res.status(403).json({error:'رمز فعلی اشتباه است.'});
    db.run('UPDATE credentials SET password_hash=? WHERE id=1',[makePassword(newPassword)]);
    db.run('DELETE FROM sessions WHERE token_hash<>?',[req.adminSession.tokenHash]);
    persist();res.json({ok:true});
  });
  const uploader=multer({storage:multer.memoryStorage(),limits:{fileSize:3*1024*1024,files:1,fields:0}});
  function magicType(buf) {
    if(buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
    if(buf.length>=3&&buf.subarray(0,3).equals(Buffer.from([255,216,255])))return 'jpg';
    if(buf.length>=12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return 'webp';
    if(buf.length>=6&&['GIF87a','GIF89a'].includes(buf.toString('ascii',0,6)))return 'gif';
    return null;
  }
  app.post('/api/admin/upload/:stage',requireAdmin,(req,res,next)=>{
    uploader.single('image')(req,res,error=>error?res.status(400).json({error:'تصویر باید کمتر از ۳ مگابایت باشد.'}):next());
  },(req,res)=>{
    if(!stageNames.includes(req.params.stage)||!req.file) return res.status(400).json({error:'مرحله یا فایل معتبر نیست.'});
    const extension=magicType(req.file.buffer);
    if(!extension) return res.status(400).json({error:'فقط عکس PNG، JPG، WebP یا GIF پذیرفته می‌شود.'});
    const filename=crypto.randomUUID()+'.'+extension;
    fs.writeFileSync(path.join(uploadDir,filename),req.file.buffer,{flag:'wx',mode:0o600});
    res.json({url:'/uploads/'+filename});
  });
  app.get('/uploads/:filename',(req,res)=>{
    const file=req.params.filename;
    if(!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(file)) return res.sendStatus(404);
    res.set('Cache-Control','public, max-age=86400');
    res.set('X-Content-Type-Options','nosniff');
    res.sendFile(path.join(uploadDir,file),error=>{if(error && !res.headersSent)res.sendStatus(404);});
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'مسیر پیدا نشد.'}));
  app.use((error,req,res,next)=>{
    console.error('API error:',error);
    if(res.headersSent)return next(error);
    res.status(500).json({error:'خطای موقت سرور.'});
  });
  app.listen(port,'127.0.0.1',()=>console.log('Invite v2 API running on 127.0.0.1:'+port));
}
start().catch(error=>{console.error(error);process.exitCode=1;});
