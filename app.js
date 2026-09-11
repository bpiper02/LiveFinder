const KEY='nero-router-state-v1';
const state=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}})();
state.songs ||= [];
state.reviewers ||= [];
state.submissions ||= [];

const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID();
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let bridgeReady=false;
let bridgeVersion='';
let staleReloadScheduled=false;
let discoveredPool=[];
let poolScrapedAt=0;
let scanStartedAt=0;
let queueWatches=[];
let queueAlertsEnabled=true;

function normalizeNeroUrl(input){
  let url=String(input||'').trim();
  if(!/^https?:\/\//i.test(url))url='https://'+url;
  const parsed=new URL(url);
  if(!/(^|\.)nero\.fan$/i.test(parsed.hostname))throw new Error('Not a Nero URL');
  parsed.hostname='www.nero.fan';
  parsed.hash='';
  parsed.search='';
  parsed.pathname=parsed.pathname.replace(/\/+$/,'')||'/';
  return parsed.toString();
}

function reviewerKey(url){
  try{return decodeURIComponent(new URL(normalizeNeroUrl(url)).pathname.split('/').filter(Boolean)[0]||'').toLowerCase();}catch{return '';}
}

function reviewerLabel(url){
  try{
    const parsed=new URL(url);
    const parts=parsed.pathname.split('/').filter(Boolean);
    const suffixes=new Set(['live','submit','submission','review']);
    let slug=parts.at(-1)||'nero';
    if(suffixes.has(slug.toLowerCase())&&parts.length>1)slug=parts.at(-2);
    slug=decodeURIComponent(slug);
    return slug.startsWith('@')?slug:`@${slug}`;
  }catch{return 'Nero reviewer';}
}

function canonicalReviewerLabel(url,fallback=''){
  const bad=new Set(['','@live','@submit','@submission','@review','live','submit','submission','review']);
  const saved=state.reviewers.find(r=>{
    try{return normalizeNeroUrl(r.neroUrl)===normalizeNeroUrl(url);}catch{return false;}
  });
  if(saved?.label&&!bad.has(String(saved.label).toLowerCase()))return saved.label;
  if(fallback&&!bad.has(String(fallback).toLowerCase()))return fallback;
  return reviewerLabel(url);
}

function migrateState(){
  const badLegacyLabels=new Set(['@live','@submit','@submission','@review']);
  state.reviewers=state.reviewers.map(r=>({
    id:r.id||uid(),
    neroUrl:r.neroUrl,
    label:(!r.label||badLegacyLabels.has(String(r.label).toLowerCase()))?reviewerLabel(r.neroUrl):(r.label||r.name)
  })).filter(r=>r.neroUrl);

  state.submissions=state.submissions.map(s=>({
    id:s.id||uid(),
    reviewerUrl:s.reviewerUrl||'',
    reviewer:canonicalReviewerLabel(s.reviewerUrl,s.reviewer),
    songId:s.songId||'',
    song:s.song||'',
    status:s.status||'unknown',
    queueAhead:Number.isFinite(s.queueAhead)?s.queueAhead:null,
    createdAt:s.createdAt||new Date().toLocaleString(),
    createdAtMs:s.createdAtMs||Date.now()
  }));
  save();
}

function watchForSubmission(s){
  const key=reviewerKey(s.reviewerUrl);
  return queueWatches.find(w=>w.reviewerKey===key&&(!w.songId||!s.songId||w.songId===s.songId))||null;
}

function statusText(s){
  const watch=watchForSubmission(s);
  const ahead=Number.isFinite(watch?.latestAhead)?watch.latestAhead:s.queueAhead;
  if(s.status==='submitted')return ahead!=null?`submitted · ${ahead} ahead`:'submitted';
  if(s.status==='queued')return ahead!=null?`queued · ${ahead} ahead`:'queued';
  return s.status||'unknown';
}

function renderQueueControls(){
  if(!$('queueAlertStatus'))return;
  const active=queueWatches.filter(w=>w.enabled!==false).length;
  $('queueAlertStatus').textContent=queueAlertsEnabled?`${active} watched queue${active===1?'':'s'} · alerts active`:`${active} watched queue${active===1?'':'s'} · alerts paused`;
  $('toggleQueueAlerts').textContent=queueAlertsEnabled?'Alerts on':'Alerts off';
  $('toggleQueueAlerts').classList.toggle('muted',!queueAlertsEnabled);
}

function poolCard(item){
  const label=item.displayName||`@${item.handle}`;
  const songs=state.songs.length?`<select data-pool-url="${esc(item.neroUrl)}" data-pool-label="${esc(label)}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${s.id}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>';
  return `<div class="card poolCard"><div class="poolTop"><div><strong>${esc(label)}</strong><small>${esc(item.neroUrl)}</small></div><span class="statusChip">${esc(item.status)}</span></div>${songs}</div>`;
}

function renderPool(){
  const live=discoveredPool.filter(x=>x.status==='live');
  const open=discoveredPool.filter(x=>x.status==='open');
  const other=discoveredPool.filter(x=>!['live','open'].includes(x.status));
  $('poolLive').innerHTML=live.length?live.map(poolCard).join(''):'<p class="empty">No live reviewers detected.</p>';
  $('poolOpen').innerHTML=open.length?open.map(poolCard).join(''):'<p class="empty">No open/upcoming reviewers detected.</p>';
  $('poolOther').innerHTML=other.length?other.map(poolCard).join(''):'<p class="empty">Nothing else detected.</p>';
  if(poolScrapedAt){
    const age=Math.max(0,Math.round((Date.now()-poolScrapedAt)/1000));
    $('poolStatus').textContent=`${discoveredPool.length} found · ${age<60?`${age}s ago`:`${Math.round(age/60)}m ago`}`;
  }else $('poolStatus').textContent='No scan yet.';
  document.querySelectorAll('select[data-pool-url]').forEach(el=>el.onchange=()=>submitPoolReviewer(el.dataset.poolUrl,el.dataset.poolLabel,el.value));
}

function render(){
  $('songs').innerHTML=state.songs.length?state.songs.map(s=>`
    <div class="card itemRow"><div class="itemMain"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}</span><small>${esc(s.songUrl)}</small>${s.instagram?`<small>${esc(s.instagram)}</small>`:''}</div><button class="iconButton danger" type="button" data-action="delete-song" data-id="${s.id}">Delete</button></div>`).join(''):'<p class="empty">No songs saved yet.</p>';

  $('reviewers').innerHTML=state.reviewers.length?state.reviewers.map(r=>`
    <div class="card reviewer"><div><strong>${esc(r.label||reviewerLabel(r.neroUrl))}</strong><small>${esc(r.neroUrl)}</small></div><div class="reviewerActions">${state.songs.length?`<select data-reviewer="${r.id}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${s.id}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>'}<button class="iconButton danger" type="button" data-action="delete-reviewer" data-id="${r.id}">Delete</button></div></div>`).join(''):'<p class="empty">Paste a Nero reviewer link to get started.</p>';

  $('submissionRows').innerHTML=state.submissions.length?state.submissions.map(s=>{
    const label=canonicalReviewerLabel(s.reviewerUrl,s.reviewer);
    const href=(()=>{try{return normalizeNeroUrl(s.reviewerUrl);}catch{return ''}})();
    const reviewerCell=href?`<a class="historyReviewer" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><strong>${esc(label)}</strong><small>${esc(href)}</small></a>`:`<span>${esc(label)}</span>`;
    const watch=watchForSubmission(s);
    const watched=watch?`<small class="watchState">${watch.enabled===false?'watch paused':'watching'}${Number.isFinite(watch.latestAhead)?` · ${watch.latestAhead} ahead`:''}</small>`:'';
    return `<div class="tr"><span>${reviewerCell}</span><span>${esc(s.song)}</span><span class="statusCell"><span class="status">${esc(statusText(s))}</span>${watched}</span><span>${esc(s.createdAt)}</span><span><button class="iconButton danger" type="button" data-action="delete-submission" data-id="${s.id}">Delete</button></span></div>`;
  }).join(''):'<p class="empty">Nothing submitted yet.</p>';

  document.querySelectorAll('select[data-reviewer]').forEach(el=>el.onchange=()=>submitToReviewer(el.dataset.reviewer,el.value));
  document.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>handleAction(btn.dataset.action,btn.dataset.id));
  renderPool();
  renderQueueControls();
}

function handleAction(action,id){
  if(action==='delete-song')state.songs=state.songs.filter(x=>x.id!==id);
  if(action==='delete-reviewer')state.reviewers=state.reviewers.filter(x=>x.id!==id);
  if(action==='delete-submission')state.submissions=state.submissions.filter(x=>x.id!==id);
  save();render();
}

$('songForm').onsubmit=e=>{
  e.preventDefault();
  state.songs.push({id:uid(),artist:$('artist').value.trim(),title:$('title').value.trim(),email:$('email').value.trim(),instagram:$('instagram').value.trim(),songUrl:$('songUrl').value.trim(),note:$('note').value.trim()});
  save();
  const keepEmail=$('email').value;
  const keepInstagram=$('instagram').value;
  $('songForm').reset();
  $('email').value=keepEmail;
  $('instagram').value=keepInstagram;
  render();
};

$('reviewerForm').onsubmit=e=>{
  e.preventDefault();
  let url;
  try{url=normalizeNeroUrl($('neroUrl').value);}catch{alert('Enter a valid nero.fan reviewer URL.');return;}
  if(state.reviewers.some(r=>normalizeNeroUrl(r.neroUrl).toLowerCase()===url.toLowerCase())){alert('That Nero reviewer is already in your list.');return;}
  state.reviewers.push({id:uid(),neroUrl:url,label:reviewerLabel(url)});
  save();$('reviewerForm').reset();render();
};

$('clearHistory').onclick=()=>{
  if(!state.submissions.length)return;
  if(!confirm('Clear all submission history?'))return;
  state.submissions=[];save();render();
};

$('refreshPool').onclick=()=>{
  if(!bridgeReady){alert('LiveFinder extension is not connected yet. Reload the extension, refresh this page, and try again.');return;}
  scanStartedAt=Date.now();
  $('poolStatus').textContent='Scanning Nero Discover…';
  const tab=window.open(`https://www.nero.fan/discover?livefinder=scan&t=${scanStartedAt}`,'_blank');
  if(!tab)alert('Chrome blocked the Nero Discover tab. Allow popups for localhost and try again.');
};

$('toggleQueueAlerts').onclick=()=>{
  if(!bridgeReady)return alert('LiveFinder extension is not connected.');
  window.postMessage({source:'livefinder-web',type:'SET_QUEUE_ALERTS',enabled:!queueAlertsEnabled},'*');
};
$('testQueueAlert').onclick=()=>{
  if(!bridgeReady)return alert('LiveFinder extension is not connected.');
  $('testQueueAlert').textContent='Sending…';
  window.postMessage({source:'livefinder-web',type:'TEST_QUEUE_NOTIFICATION'},'*');
};
$('scanQueuesNow').onclick=()=>{
  if(!bridgeReady)return alert('LiveFinder extension is not connected.');
  $('scanQueuesNow').textContent='Checking…';
  window.postMessage({source:'livefinder-web',type:'SCAN_OPEN_NERO_TABS'},'*');
};

function submitPoolReviewer(url,label,songId){
  let normalized;
  try{normalized=normalizeNeroUrl(url);}catch{return;}
  let reviewer=state.reviewers.find(r=>normalizeNeroUrl(r.neroUrl)===normalized);
  if(!reviewer){
    reviewer={id:uid(),neroUrl:normalized,label:label||reviewerLabel(normalized)};
    state.reviewers.push(reviewer);save();render();
  }
  submitToReviewer(reviewer.id,songId);
}

function submitToReviewer(reviewerId,songId){
  const reviewer=state.reviewers.find(r=>r.id===reviewerId);
  const song=state.songs.find(s=>s.id===songId);
  if(!reviewer||!song)return;
  if(!bridgeReady){alert('LiveFinder extension is not connected yet. Refresh this page after reloading the extension, then try again.');window.postMessage({source:'livefinder-web',type:'PING_BRIDGE'},'*');return;}

  const runId=uid();
  const payload={source:'livefinder',type:'PREPARE_NERO_SUBMISSION',runId,song,reviewer,createdAt:Date.now()};
  const base=reviewer.neroUrl.split('#')[0];
  let settled=false;
  const cleanup=()=>window.removeEventListener('message',onAck);
  const onAck=event=>{
    if(event.source!==window)return;
    const msg=event.data;
    if(msg?.source!=='livefinder-extension')return;
    if(msg.type==='NERO_SUBMISSION_STORED'){
      settled=true;cleanup();
      state.submissions.unshift({id:runId,reviewerUrl:reviewer.neroUrl,reviewer:reviewer.label||reviewerLabel(reviewer.neroUrl),songId:song.id,song:`${song.artist} — ${song.title}`,createdAt:new Date().toLocaleString(),createdAtMs:Date.now(),status:'automation started',queueAhead:null});
      save();render();window.open(base,'_blank','noopener,noreferrer');return;
    }
    if(msg.type==='NERO_SUBMISSION_STORE_FAILED'){
      settled=true;cleanup();alert(`LiveFinder extension could not start the submission. ${msg.error||'Reload the extension and refresh this page.'}`);
    }
  };
  window.addEventListener('message',onAck);
  window.postMessage({source:'livefinder-web',type:'STORE_NERO_SUBMISSION',payload},'*');
  setTimeout(()=>{if(settled)return;cleanup();alert('LiveFinder extension did not respond. Reload it at chrome://extensions, refresh this page, and try again.');},4000);
}

function findMatchingSubmission(data){
  if(!data)return null;
  const reviewerUrl=data.reviewer?.neroUrl||'';
  const songId=data.song?.id||'';
  const eventAt=data.completedAt||data.capturedAt||0;
  return state.submissions.find(s=>(!reviewerUrl||s.reviewerUrl===reviewerUrl)&&(!songId||s.songId===songId)&&(!eventAt||s.createdAtMs<=eventAt))||null;
}

function reconcileStatus(queue,result){
  let changed=false;
  if(queue){const row=findMatchingSubmission(queue);if(row&&row.status!=='submitted'){row.status='queued';if(Number.isFinite(queue.ahead))row.queueAhead=queue.ahead;changed=true;}}
  if(result){const row=findMatchingSubmission(result);if(row){row.status='submitted';if(Number.isFinite(result.ahead))row.queueAhead=result.ahead;changed=true;}}
  if(changed){save();render();}
}

function applyWatchState(response){
  if(!response?.ok)return;
  queueAlertsEnabled=response.alertsEnabled!==false;
  queueWatches=Array.isArray(response.watches)?response.watches:[];
  let changed=false;
  for(const s of state.submissions){
    const watch=watchForSubmission(s);
    if(watch&&Number.isFinite(watch.latestAhead)&&s.queueAhead!==watch.latestAhead){s.queueAhead=watch.latestAhead;changed=true;}
  }
  if(changed)save();
  render();
}

window.addEventListener('message',event=>{
  if(event.source!==window)return;
  const msg=event.data;
  if(msg?.source!=='livefinder-extension')return;

  if(msg.type==='BRIDGE_READY'){
    bridgeReady=true;bridgeVersion=msg.version||'';sessionStorage.removeItem('livefinder-stale-reload');console.log(`[LiveFinder] extension connected${bridgeVersion?` v${bridgeVersion}`:''}`);
    window.postMessage({source:'livefinder-web',type:'REQUEST_QUEUE_WATCH_STATE'},'*');
    return;
  }

  if(msg.type==='EXTENSION_CONTEXT_STALE'){
    bridgeReady=false;
    if(staleReloadScheduled)return;
    staleReloadScheduled=true;
    const alreadyRetried=sessionStorage.getItem('livefinder-stale-reload')==='1';
    if(alreadyRetried){alert('The LiveFinder extension was updated, but this tab still has a stale extension context. Refresh this page once.');return;}
    sessionStorage.setItem('livefinder-stale-reload','1');
    console.info('[LiveFinder] extension updated; refreshing dashboard to reconnect…');
    setTimeout(()=>location.reload(),150);return;
  }

  if(msg.type==='NERO_STATUS')reconcileStatus(msg.queue,msg.result);
  if(msg.type==='NERO_POOL'){
    const pool=msg.pool||{};
    discoveredPool=Array.isArray(pool.items)?pool.items:[];
    poolScrapedAt=Number(pool.scrapedAt||0);
    renderPool();
    if(scanStartedAt&&poolScrapedAt>=scanStartedAt)$('poolStatus').textContent=`Scan complete · ${discoveredPool.length} found`;
  }
  if(msg.type==='QUEUE_WATCH_STATE')applyWatchState(msg.response);
  if(msg.type==='QUEUE_ALERTS_UPDATED'){
    if(msg.response?.ok){queueAlertsEnabled=msg.response.alertsEnabled!==false;renderQueueControls();}
  }
  if(msg.type==='QUEUE_ALERT_TESTED'){
    $('testQueueAlert').textContent=msg.response?.ok?'Sent ✓':'Test alert';
    setTimeout(()=>$('testQueueAlert').textContent='Test alert',1600);
  }
  if(msg.type==='QUEUE_SCAN_COMPLETE'){
    $('scanQueuesNow').textContent='Checked ✓';
    window.postMessage({source:'livefinder-web',type:'REQUEST_QUEUE_WATCH_STATE'},'*');
    setTimeout(()=>$('scanQueuesNow').textContent='Check open Nero tabs',1600);
  }
});

let pollTick=0;
setInterval(()=>{
  if(!bridgeReady)return;
  window.postMessage({source:'livefinder-web',type:'REQUEST_NERO_STATUS'},'*');
  window.postMessage({source:'livefinder-web',type:'REQUEST_NERO_POOL'},'*');
  pollTick+=1;
  if(pollTick%3===0)window.postMessage({source:'livefinder-web',type:'REQUEST_QUEUE_WATCH_STATE'},'*');
},1500);
window.postMessage({source:'livefinder-web',type:'PING_BRIDGE'},'*');

migrateState();
render();
