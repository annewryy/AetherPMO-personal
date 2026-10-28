// NIRS 115종 카탈로그 정합성 및 AI-02 실함수 모의 PostgREST 검증 (DB 쓰기 없음)
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const catalog = require('../data/nirs_pmo_standard_115.json');
const { getDeliverablesComparison, isNirsProject } = require('../api/ai/chat.js');
async function run() {
  assert.equal(catalog.items.length, 115);
  assert.deepEqual(catalog.items.map(x => x.source_no), Array.from({length:115},(_,i)=>i+1));
  const counts = catalog.items.reduce((a,x)=>(a[x.division]=(a[x.division]||0)+1,a),{});
  assert.deepEqual(counts, { '사업준비':4,'입찰':5,'착수':53,'실행':29,'종료':24 });
  const dupes = catalog.items.reduce((a,x)=>(a[x.display_name]=(a[x.display_name]||0)+1,a),{});
  assert.equal(Object.values(dupes).filter(n=>n>1).length,4);
  assert(isNirsProject({ customer:'국가정보자원관리원 대구센터' }));
  assert(!isNirsProject({ customer:'국세청',name:'국세청 ISP' }));

  const calls=[];
  const server=http.createServer((req,res)=>{
    calls.push(req.url);
    const u=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Content-Type','application/json');
    if(u.pathname==='/rest/v1/nirs_standard_catalog') {
      res.writeHead(200);
      return res.end(JSON.stringify(catalog.items.map(x=>({...x,is_required:null}))));
    }
    if(u.pathname==='/rest/v1/artifacts') {
      res.writeHead(200);
      if(u.searchParams.get('is_template')==='eq.true') return res.end(JSON.stringify([{id:'LEGACY1',name:'사업계획서',stage:'execution'}]));
      return res.end('[]');
    }
    res.writeHead(404);res.end(JSON.stringify({error:'not found'}));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try {
    const url='http://127.0.0.1:'+server.address().port;
    const a=await getDeliverablesComparison(
      {id:'NIRS-TEST',customer:'국가정보자원관리원',name:'대구센터',project_stage_filter:'Active'},
      url,'test-anon-key','test-user-token'
    );
    assert.equal(a.isNirsCatalog,true);
    assert.equal(a.catalogCount,115);
    assert.equal(a.statusSummary.catalogCount,115);
    assert.equal(a.statusSummary.totalRequired,0);
    assert.equal(a.statusSummary.requirementUnknownCount,115);
    assert.equal(a.statusSummary.tailoringPending,true);
    assert.equal(a.statusSummary.isIndeterminate,true);
    assert.equal(a.statusSummary.submissionRate,null);
    assert.equal(a.statusSummary.unregisteredCount,0);
    assert.equal(a.catalogItems[114].source_no,115);
    assert(calls.some(p=>p.startsWith('/rest/v1/nirs_standard_catalog?')));
    assert(!calls.some(p=>p.includes('is_template=eq.true')));
    calls.length=0;
    const b=await getDeliverablesComparison({id:'OTHER',customer:'국세청',project_stage_filter:'execution'},url,'test-anon-key','test-user-token');
    assert.equal(b.isNirsCatalog,false);
    assert.equal(b.statusSummary.totalRequired,1);
    assert(calls.some(p=>p.includes('is_template=eq.true')));
    console.log('PASS: 115 rows / phase counts / 4 phase-specific duplicates / NIRS isolation / AI-02 deferred gap / legacy unaffected');
  } finally { await new Promise(resolve=>server.close(resolve)); }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
