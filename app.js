const KEY='nero-router-state-v1';
const state=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}})();
state.songs ||= [];
state.reviewers ||= [];
state.submissions ||= [];

const {
  normalizeNeroUrl,
  reviewerKey,
  reviewerLabel,
  bestReviewerLabel,
  filterAvailablePool,
  poolSignature
}=globalThis.LiveFinderDashboard||{};
if(!normalizeNeroUrl||!reviewerKey||!filterAvailablePool)throw new Error('LiveFinder dashboard helpers failed to load.');

const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID();
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
let bridgeReady=false;
let bridgeVersion='';
let staleReloadScheduled=false;
let discoveredPool=[];
let discoveredPoolSignature='';
let poolScrapedAt=0;
let scanStartedAt=0;
let queueWatches=[];
let queueAlertsEnabled=true;
let poolInteractionLocked=false;
let pendingPoolRender=false;

function poolItemForReviewer(url){
  const key=reviewerKey(url);
  if(!key)return null;
  return discoveredPool.find(item=>reviewerKey(item?.neroUrl||item?.profileUrl||'')===key)||null;
}

function canonicalReviewerLabel(url,fallback=''){
  const saved=state.reviewers.find(r=>reviewerKey(r.neroUrl)===reviewerKey(url));
  const poolItem=poolItemForReviewer(url);
  return bestReviewerLabel({
    url,
    poolDisplayName:poolItem?.displayName||'',
    savedLabel:saved?.label||'',
    fallback
  });
}

function destinationFor(url,stored={}){
  const item=poolItemForReviewer(url)||{};
  const streamUrl=String(stored.streamUrl||item.streamUrl||'');
  const streamPlatform=String(stored.streamPlatform||item.streamPlatform||'');
  const streamConfidence=String(stored.streamConfidence||item.streamConfidence||'');
  if(streamUrl){
    return {
      href:streamUrl,
      label:streamConfidence==='social'?`${streamPlatform||'Stream'} ↗`:`${streamPlatform||'Stream'} live ↗`,
      stream:true
    };
  }
  try{return{href:normalizeNeroUrl(url),label:'Nero ↗',stream:false};}catch{return{href:'',label:'',stream:false};}
}

function copyPoolMetadata(target,item){
  if(!target||!item)return false;
  let changed=false;
  const nextLabel=bestReviewerLabel({url:target.reviewerUrl||target.neroUrl,poolDisplayName:item.displayName,savedLabel:target.reviewer||target.label});
  if('reviewer' in target&&nextLabel&&target.reviewer!==nextLabel){target.reviewer=nextLabel;changed=true;}
  if('label' in target&&nextLabel&&target.label!==nextLabel){target.label=nextLabel;changed=true;}
  for(const key of ['streamUrl','streamPlatform','streamConfidence']){
    if(item[key]&&target[key]!==item[key]){target[key]=item[key];changed=true;}
  }
  if(typeof item.streamDerived==='boolean'&&target.streamDerived!==item.streamDerived){target.streamDerived=item.streamDerived;changed=true;}
  return changed;
}

function syncPoolMetadataToState(){
  let changed=false;
  for(const reviewer of state.reviewers){
    const item=poolItemForReviewer(reviewer.neroUrl);
    if(item&&copyPoolMetadata(reviewer,item))changed=true;
  }
  for(const submission of state.submissions){
    const item=poolItemForReviewer(submission.reviewerUrl);
    if(item&&copyPoolMetadata(submission,item))changed=true;
  }
  if(changed)save();
  return changed;
}

function migrateState(){
  state.reviewers=state.reviewers.map(r=>({
    ...r,
    id:r.id||uid(),
    neroUrl:r.neroUrl,
    label:bestReviewerLabel({url:r.neroUrl,savedLabel:r.label||r.name||''})
  })).filter(r=>r.neroUrl);

  state.submissions=state.submissions.map(s=>({
    ...s,
    id:s.id||uid(),
    reviewerUrl:s.reviewerUrl||'',
    reviewer:bestReviewerLabel({url:s.reviewerUrl,fallback:s.reviewer||''}),
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
  const label=bestReviewerLabel({url:item.neroUrl,poolDisplayName:item.displayName});
  const destination=destinationFor(item.neroUrl,item);
  const name=destination.href?`<a class="poolReviewerLink" href="${esc(destination.href)}" target="_blank" rel="noopener noreferrer"><strong>${esc(label)}</strong><small>${esc(destination.label)}</small></a>`:`<strong>${esc(label)}</strong>`;
  const songs=state.songs.length?`<select data-pool-url="${esc(item.neroUrl)}" data-pool-label="${esc(label)}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${esc(s.id)}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>';
  return `<div class="card poolCard"><div class="poolTop"><div>${name}</div><span class="statusChip">${esc(item.status)}</span></div>${songs}</div>`;
}

function columnHtml(items,emptyCopy){
  return items.length?items.map(poolCard).join(''):`<p class="empty">${emptyCopy}</p>`;
}

function setColumnHtml(id,items,emptyCopy){
  const el=$(id);
  if(!el)return;
  const songsSig=state.songs.map(s=>`${s.id}:${s.artist}:${s.title}`).join('|');
  const signature=`${poolSignature(items)}::${songsSig}`;
  if(el.dataset.livefinderSignature===signature)return;
  el.innerHTML=columnHtml(items,emptyCopy);
  el.dataset.livefinderSignature=signature;
}

function updatePoolStatus(availableCount){
  if(!poolScrapedAt){$('poolStatus').textContent='No scan yet.';return;}
  const hidden=Math.max(0,discoveredPool.length-availableCount);
  const age=Math.max(0,Math.round((Date.now()-poolScrapedAt)/1000));
  const ageText=age<60?`${age}s ago`:`${Math.round(age/60)}m ago`;
  $('poolStatus').textContent=`${availableCount} available${hidden?` · ${hidden} submitted`:''} · ${ageText}`;
}

function renderPool(force=false){
  if(poolInteractionLocked&&!force){
    pendingPoolRender=true;
    return;
  }
  pendingPoolRender=false;
  const available=filterAvailablePool(discoveredPool,state.submissions);
  const live=available.filter(x=>x.status==='live');
  const open=available.filter(x=>x.status==='open');
  const other=available.filter(x=>!['live','open'].includes(x.status));
  setColumnHtml('poolLive',live,'No live reviewers detected.');
  setColumnHtml('poolOpen',open,'No open/upcoming reviewers detected.');
  setColumnHtml('poolOther',other,'Nothing else detected.');
  updatePoolStatus(available.length);
}

function flushPendingPoolRender(){
  if(poolInteractionLocked||!pendingPoolRender)return;
  renderPool();
}

function renderSongs(){
  $('songs').innerHTML=state.songs.length?state.songs.map(s=>`
    <div class="card itemRow"><div class="itemMain"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}</span><small>${esc(s.songUrl)}</small>${s.instagram?`<small>${esc(s.instagram)}</small>`:''}</div><button class="iconButton danger" type="button" data-action="delete-song" data-id="${esc(s.id)}">Delete</button></div>`).join(''):'<p class="empty">No songs saved yet.</p>';
}

function renderReviewers(){
  $('reviewers').innerHTML=state.reviewers.length?state.reviewers.map(r=>{
    const destination=destinationFor(r.neroUrl,r);
    const label=canonicalReviewerLabel(r.neroUrl,r.label);
    const reviewerLink=destination.href?`<a class="historyReviewer" href="${esc(destination.href)}" target="_blank" rel="noopener noreferrer"><strong>${esc(label)}</strong><small>${esc(destination.label)}</small></a>`:`<strong>${esc(label)}</strong>`;
    return `<div class="card reviewer"><div>${reviewerLink}</div><div class="reviewerActions">${state.songs.length?`<select data-reviewer="${esc(r.id)}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${esc(s.id)}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>'}<button class="iconButton danger" type="button" data-action="delete-reviewer" data-id="${esc(r.id)}">Delete</button></div></div>`;
  }).join(''):'<p class="empty">Paste a Nero reviewer link to get started.</p>';
}

function renderHistory(){
  $('submissionRows').innerHTML=state.submissions.length?state.submissions.map(s=>{
    const label=canonicalReviewerLabel(s.reviewerUrl,s.reviewer);
    const destination=destinationFor(s.reviewerUrl,s);
    const reviewerCell=destination.href?`<a class="historyReviewer" href="${esc(destination.href)}" target="_blank" rel="noopener noreferrer" title="${destination.stream?'Open reviewer live stream':'Open reviewer on Nero'}"><strong>${esc(label)}</strong><small>${esc(destination.label)}</small></a>`:`<span>${esc(label)}</span>`;
    const watch=watchForSubmission(s);
    const watched=watch?`<small class="watchState">${watch.enabled===false?'queue alert paused':'queue alert active'}</small>`:'';
    return `<div class="tr"><span>${reviewerCell}</span><span>${esc(s.song)}</span><span class="statusCell"><span class="status">${esc(statusText(s))}</span>${watched}</span><span>${esc(s.createdAt)}</span><span><button class="iconButton danger" type="button" data-action="delete-submission" data-id="${esc(s.id)}">Delete</button></span></div>`;
  }).join(''):'<p class="empty">Nothing submitted yet.</p>';
}

function render(){
  renderSongs();
  renderReviewers();
  renderHistory();
  renderPool(true);
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
  renderSongs();renderReviewers();renderPool(true);
};

$('reviewerForm').onsubmit=e=>{
  e.preventDefault();
  let url;
  try{url=normalizeNeroUrl($('neroUrl').value);}catch{alert('Enter a valid nero.fan reviewer URL.');return;}
  if(state.reviewers.some(r=>reviewerKey(r.neroUrl)===reviewerKey(url))){alert('That Nero reviewer is already in your list.');return;}
  state.reviewers.push({id:uid(),neroUrl:url,label:reviewerLabel(url)});
  save();$('reviewerForm').reset();renderReviewers();
};

$('clearHistory').onclick=()=>{
  if(!state.submissions.length)return;
  if(!confirm('Clear all submission history?'))return;
  state.submissions=[];save();renderHistory();renderPool(true);
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
  const item=poolItemForReviewer(normalized);
  let reviewer=state.reviewers.find(r=>reviewerKey(r.neroUrl)===reviewerKey(normalized));
  if(!reviewer){
    reviewer={id:uid(),neroUrl:normalized,label:label||reviewerLabel(normalized)};
    if(item)copyPoolMetadata(reviewer,item);
    state.reviewers.push(reviewer);
    save();
    renderReviewers();
  }else{
    let changed=false;
    const nextLabel=bestReviewerLabel({url:normalized,poolDisplayName:item?.displayName,savedLabel:reviewer.label,fallback:label});
    if(nextLabel&&reviewer.label!==nextLabel){reviewer.label=nextLabel;changed=true;}
    if(item&&copyPoolMetadata(reviewer,item))changed=true;
    if(changed){save();renderReviewers();}
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
      const item=poolItemForReviewer(reviewer.neroUrl);
      const submission={id:runId,reviewerUrl:reviewer.neroUrl,reviewer:canonicalReviewerLabel(reviewer.neroUrl,reviewer.label),songId:song.id,song:`${song.artist} — ${song.title}`,createdAt:new Date().toLocaleString(),createdAtMs:Date.now(),status:'automation started',queueAhead:null};
      if(item)copyPoolMetadata(submission,item);
      state.submissions.unshift(submission);
      save();
      renderHistory();
      renderPool(true);
      window.open(base,'_blank','noopener,noreferrer');
      return;
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
  if(data.runId){const byRun=state.submissions.find(s=>s.id===data.runId);if(byRun)return byRun;}
  const reviewerUrl=data.reviewer?.neroUrl||'';
  const key=reviewerKey(reviewerUrl);
  const songId=data.song?.id||'';
  const eventAt=data.completedAt||data.capturedAt||0;
  return state.submissions.find(s=>(!key||reviewerKey(s.reviewerUrl)===key)&&(!songId||s.songId===songId)&&(!eventAt||s.createdAtMs<=eventAt))||null;
}

function reconcileStatus(queue,result){
  let changed=false;
  if(queue){const row=findMatchingSubmission(queue);if(row&&row.status!=='submitted'){row.status='queued';if(Number.isFinite(queue.ahead))row.queueAhead=queue.ahead;changed=true;}}
  if(result){const row=findMatchingSubmission(result);if(row){row.status='submitted';if(Number.isFinite(result.ahead))row.queueAhead=result.ahead;changed=true;}}
  if(changed){save();renderHistory();}
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
  renderHistory();
  renderQueueControls();
}

function poolSelectFromEvent(event){
  const target=event.target;
  return target instanceof Element?target.closest('select[data-pool-url]'):null;
}

document.addEventListener('pointerdown',event=>{
  if(poolSelectFromEvent(event))poolInteractionLocked=true;
},true);
document.addEventListener('focusin',event=>{
  if(poolSelectFromEvent(event))poolInteractionLocked=true;
},true);
document.addEventListener('focusout',event=>{
  if(!poolSelectFromEvent(event))return;
  setTimeout(()=>{poolInteractionLocked=false;flushPendingPoolRender();},120);
},true);

document.addEventListener('change',event=>{
  const poolSelect=poolSelectFromEvent(event);
  if(poolSelect){
    const {poolUrl,poolLabel}=poolSelect.dataset;
    const songId=poolSelect.value;
    poolInteractionLocked=false;
    submitPoolReviewer(poolUrl,poolLabel,songId);
    setTimeout(flushPendingPoolRender,0);
    return;
  }
  const reviewerSelect=event.target instanceof Element?event.target.closest('select[data-reviewer]'):null;
  if(reviewerSelect)submitToReviewer(reviewerSelect.dataset.reviewer,reviewerSelect.value);
});

document.addEventListener('click',event=>{
  const btn=event.target instanceof Element?event.target.closest('[data-action]'):null;
  if(btn)handleAction(btn.dataset.action,btn.dataset.id);
});

window.addEventListener('message',event=>{
  if(event.source!==window)return;
  const msg=event.data;
  if(msg?.source!=='livefinder-extension')return;

  if(msg.type==='BRIDGE_READY'){
    bridgeReady=true;bridgeVersion=msg.version||'';sessionStorage.removeItem('livefinder-stale-reload');console.log(`[LiveFinder] extension connected${bridgeVersion?` v${bridgeVersion}`:''}`);
    window.postMessage({source:'livefinder-web',type:'REQUEST_QUEUE_WATCH_STATE'},'*');
    window.postMessage({source:'livefinder-web',type:'REQUEST_NERO_POOL'},'*');
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
    const nextPool=Array.isArray(pool.items)?pool.items:[];
    const nextSignature=poolSignature(nextPool);
    discoveredPool=nextPool;
    poolScrapedAt=Number(pool.scrapedAt||0);
    const metadataChanged=syncPoolMetadataToState();
    if(metadataChanged){renderReviewers();renderHistory();}
    if(nextSignature!==discoveredPoolSignature){
      discoveredPoolSignature=nextSignature;
      renderPool();
    }else{
      const available=filterAvailablePool(discoveredPool,state.submissions);
      updatePoolStatus(available.length);
    }
    if(scanStartedAt&&poolScrapedAt>=scanStartedAt)$('poolStatus').textContent=`Scan complete · ${filterAvailablePool(discoveredPool,state.submissions).length} available`;
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
  pollTick+=1;
  if(pollTick%2===0)window.postMessage({source:'livefinder-web',type:'REQUEST_NERO_POOL'},'*');
  if(pollTick%3===0)window.postMessage({source:'livefinder-web',type:'REQUEST_QUEUE_WATCH_STATE'},'*');
},1500);
window.postMessage({source:'livefinder-web',type:'PING_BRIDGE'},'*');

migrateState();
render();
