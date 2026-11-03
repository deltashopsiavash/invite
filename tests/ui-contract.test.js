'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('admin HTML always contains every element the dashboard script needs',()=>{
  const html=read('site/admin/index.html');
  const script=read('site/admin/admin.js');
  const ids=[...new Set([...script.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map(match=>match[1]))];
  assert.ok(ids.length>25,'Expected an exhaustive admin UI ID list');
  for(const id of ids){
    assert.ok(html.includes('id="'+id+'"'),'Missing dashboard element #'+id);
  }
  for(const tab of ['invitations','content','images','answers','security']){
    assert.ok(html.includes('data-tab="'+tab+'"'),'Missing navigation tab '+tab);
    assert.ok(html.includes('id="tab-'+tab+'"'),'Missing content panel '+tab);
  }
  assert.match(html,/\/admin\/admin\.js\?v=4/,'Use current dashboard JavaScript on reload');
  assert.match(html,/\/admin\/admin\.css\?v=4/,'Use current dashboard stylesheet');
  assert.match(script,/if\(data\.authenticated\)\{\s*csrf=data\.csrf;\s*await openDashboard\(\)/);
  assert.match(script,/\$\('dashboard-error'\)\.hidden=false/);
});

test('installation docs and server prompts do not contain personal examples',()=>{
  const paths=['README.md','scripts/install.sh','scripts/deploy.sh','site/admin/index.html'];
  for(const file of paths){
    const content=read(file);
    assert.doesNotMatch(content,/deltamarket5\.ir/i,file+' contains real-domain example');
    assert.doesNotMatch(content,/\bsaghar\b|\bmaryam\b/i,file+' contains a real-name example');
  }
  assert.match(read('README.md'),/domain\.ir\/person/);
});
