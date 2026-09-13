const KEY='nero-router-state-v1';
const PAYMENT_POLICY_KEY='livefinder-payment-policy';
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
const paymentPolicy=()=>localStorage.getItem(PAYMENT_POLICY_KEY)==='show-paid'?'show-paid':'free-only';
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

  state.reviewers=state.reviewers.map(r=>{
    const key=reviewerKey(r.neroUrl||'');
    const appearsInHistory=key&&state.submissions.some(s=>reviewerKey(s.reviewerUrl)===key);
    return {
      ...r,
      id:r.id||uid(),
      neroUrl:r.neroUrl,
      label:bestReviewerLabel({url:r.neroUrl,savedLabel:r.label||r.name||''}),
      explicitSaved:typeof r.explicitSaved==='boolean'?r.explicitSaved:!appearsInHistory
    };
  }).filter(r=>r.neroUrl);
  save();
}

function explicitReviewers(){
  return state.reviewers.filter(r=>r.explicitSaved===true);
}

function pastReviewerRecords(){
  const seen=new Set();
  return [...state.submissions]
    .sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0))
    .filter(s=>{
      const key=reviewerKey(s.reviewerUrl||'');
      if(!key||seen.has(key))return false;
      seen.add(key);
      return true;
    });
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
  if(s.status==='payment required')return s.paymentPolicy==='show-paid'?'payment required · manual':'payment required · skipped';
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

function reviewerLink(url,stored,label){
  const destination=destinationFor(url,stored);
  if(!destination.href)return `<strong>${esc(label)}</strong>`;
  return `<a class="historyReviewer" href="${esc(destination.href)}" target="_blank" rel="noopener noreferrer"><strong>${esc(label)}</strong><small>${esc(destination.label)}</small></a>`;
}

function renderReviewerLibraryStatus(){
  const el=$('reviewerLibraryStatus');
  if(!el)return;
  el.textContent=`${explicitReviewers().length} saved · ${pastReviewerRecords().length} past`;
}

function renderReviewers(){
  const reviewers=explicitReviewers();
  $('reviewers').innerHTML=reviewers.length?reviewers.map(r=>{
    const label=canonicalReviewerLabel(r.neroUrl,r.label);
    return `<div class="card reviewer"><div>${reviewerLink(r.neroUrl,r,label)}</div><div class="reviewerActions">${state.songs.length?`<select data-reviewer="${esc(r.id)}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${esc(s.id)}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>'}<button class="iconButton danger" type="button" data-action="delete-reviewer" data-id="${esc(r.id)}">Remove</button></div></div>`;
  }).join(''):'<p class="empty">No reviewers saved. Saving one is optional.</p>';
  renderReviewerLibraryStatus();
}

function renderPastReviewers(){
  const past=pastReviewerRecords();
  const explicitKeys=new Set(explicitReviewers().map(r=>reviewerKey(r.neroUrl)));
  $('pastReviewers').innerHTML=past.length?past.map(s=>{
    const label=canonicalReviewerLabel(s.reviewerUrl,s.reviewer);
    const key=reviewerKey(s.reviewerUrl);
    const saveButton=explicitKeys.has(key)?'<span class="savedFlag">SAVED</span>':`<button class="iconButton" type="button" data-save-reviewer-url="${esc(s.reviewerUrl)}" data-save-reviewer-label="${esc(label)}">Save</button>`;
    const songSelect=state.songs.length?`<select data-past-url="${esc(s.reviewerUrl)}" data-past-label="${esc(label)}"><option value="" selected disabled>Submit song…</option>${state.songs.map(song=>`<option value="${esc(song.id)}">${esc(song.artist)} — ${esc(song.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>';
    return `<div class="card reviewer pastReviewer"><div>${reviewerLink(s.reviewerUrl,s,label)}<small class="lastSubmitted">Last submitted ${esc(s.createdAt||'')}</small></div><div class="reviewerActions">${songSelect}${saveButton}</div></div>`;
  }).join(''):'<p class="empty">Past reviewers will appear here after you submit.</p>';
  renderReviewerLibraryStatus();
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
  renderPastReviewers();
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

function saveReviewerExplicit(url,label='',stored={}){
  let normalized;
  try{normalized=normalizeNeroUrl(url);}catch{return false;}
  const key=reviewerKey(normalized);
  let reviewer=state.reviewers.find(r=>reviewerKey(r.neroUrl)===key);
  if(!reviewer){
    reviewer={id:uid(),neroUrl:normalized,label:label||reviewerLabel(normalized),explicitSaved:true,savedAtMs:Date.now()};
    Object.assign(reviewer,stored);
    const item=poolItemForReviewer(normalized);
    if(item)copyPoolMetadata(reviewer,item);
    state.reviewers.push(reviewer);
  }else{
    reviewer.explicitSaved=true;
    reviewer.savedAtMs=Date.now();
    reviewer.label=bestReviewerLabel({url:normalized,poolDisplayName:poolItemForReviewer(normalized)?.displayName,savedLabel:reviewer.label,fallback:label});
    for(const keyName of ['streamUrl','streamPlatform','streamConfidence','streamDerived']){
      if(stored[keyName]!=null&&!reviewer[keyName])reviewer[keyName]=stored[keyName];
    }
  }
  save();renderReviewers();renderPastReviewers();
  return true;
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
  renderSongs();renderReviewers();renderPastReviewers();renderPool(true);
};

$('reviewerForm').onsubmit=e=>{
  e.preventDefault();
  let url;
  try{url=normalizeNeroUrl($('neroUrl').value);}catch{alert('Enter a valid nero.fan reviewer URL.');return;}
  const existing=state.reviewers.find(r=>reviewerKey(r.neroUrl)===reviewerKey(url)&&r.explicitSaved===true);
  if(existing){alert('That reviewer is already saved.');return;}
  saveReviewerExplicit(url,reviewerLabel(url));
  $('reviewerForm').reset();
};

$('clearHistory').onclick=()=>{
  if(!state.submissions.length)return;
  if(!confirm('Clear all submission history?'))return;
  state.submissions=[];save();renderHistory();renderPastReviewers();renderPool(true);
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

const paymentPolicySelect=$('paymentPolicy');
if(paymentPolicySelect){
  paymentPolicySelect.value=paymentPolicy();
  paymentPolicySelect.addEventListener('change',()=>{
    const next=paymentPolicySelect.value==='show-paid'?'show-paid':'free-only';
    localStorage.setItem(PAYMENT_POLICY_KEY,next);
  });
}

function reviewerForUrl(url,label=''){
  let normalized;
  try{normalized=normalizeNeroUrl(url);}catch{return null;}
  const key=reviewerKey(normalized);
  const saved=state.reviewers.find(r=>reviewerKey(r.neroUrl)===key);
  const item=poolItemForReviewer(normalized);
  const reviewer={
    id:saved?.id||uid(),
    neroUrl:normalized,
    label:bestReviewerLabel({url:normalized,poolDisplayName:item?.displayName,savedLabel:saved?.label,fallback:label})
  };
  for(const source of [saved,item]){
    if(!source)continue;
    for(const field of ['streamUrl','streamPlatform','streamConfidence','streamDerived']){
      if(source[field]!=null&&reviewer[field]==null)reviewer[field]=source[field];
    }
  }
  return reviewer;
}

function submitPoolReviewer(url,label,songId){
  const reviewer=reviewerForUrl(url,label);
  if(!reviewer)return;
  startSubmission(reviewer,songId);
}

function submitToReviewer(reviewerId,songId){
  const reviewer=state.reviewers.find(r=>r.id===reviewerId&&r.explicitSaved===true);
  if(!reviewer)return;
  startSubmission(reviewer,songId);
}

function startSubmission(reviewer,songId){
  const song=state.songs.find(s=>s.id===songId);
  if(!reviewer||!song)return;
  if(!bridgeReady){alert('LiveFinder extension is not connected yet. Refresh this page after reloading the extension, then try again.');window.postMessage({source:'livefinder-web',type:'PING_BRIDGE'},'*');return;}

  const runId=uid();
  const currentPaymentPolicy=paymentPolicy();
  const payload={source:'livefinder',type:'PREPARE_NERO_SUBMISSION',runId,song,reviewer,paymentPolicy:currentPaymentPolicy,createdAt:Date.now()};
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
      const submission={id:runId,reviewerUrl:reviewer.neroUrl,reviewer:canonicalReviewerLabel(reviewer.neroUrl,reviewer.label),songId:song.id,song:`${song.artist} — ${song.title}`,createdAt:new Date().toLocaleString(),createdAtMs:Date.now(),status:'automation started',paymentPolicy:currentPaymentPolicy,queueAhead:null};
      if(item)copyPoolMetadata(submission,item);
      state.submissions.unshift(submission);
      save();
      renderHistory();
      renderPastReviewers();
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
  if(queue){
    const row=findMatchingSubmission(queue);
    if(row&&!['submitted','payment required'].includes(row.status)){
      row.status='queued';
      if(Number.isFinite(queue.ahead))row.queueAhead=queue.ahead;
      changed=true;
    }
  }
  if(result){
    const row=findMatchingSubmission(result);
    if(row){
      const nextStatus=String(result.status||'submitted').toLowerCase();
      row.status=nextStatus;
      if(Number.isFinite(result.ahead))row.queueAhead=result.ahead;
      if(result.paymentPolicy)row.paymentPolicy=result.paymentPolicy;
      if(result.reason)row.paymentReason=String(result.reason);
      if(Array.isArray(result.prices))row.paymentPrices=result.prices.map(String);
      changed=true;
    }
  }
  if(changed){save();renderHistory();renderPool(true);}
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
  const pastSelect=event.target instanceof Element?event.target.closest('select[data-past-url]'):null;
  if(pastSelect){
    submitPoolReviewer(pastSelect.dataset.pastUrl,pastSelect.dataset.pastLabel,pastSelect.value);
    return;
  }
  const reviewerSelect=event.target instanceof Element?event.target.closest('select[data-reviewer]'):null;
  if(reviewerSelect)submitToReviewer(reviewerSelect.dataset.reviewer,reviewerSelect.value);
});

document.addEventListener('click',event=>{
  const saveBtn=event.target instanceof Element?event.target.closest('[data-save-reviewer-url]'):null;
  if(saveBtn){
    const history=state.submissions.find(s=>reviewerKey(s.reviewerUrl)===reviewerKey(saveBtn.dataset.saveReviewerUrl));
    saveReviewerExplicit(saveBtn.dataset.saveReviewerUrl,saveBtn.dataset.saveReviewerLabel,history||{});
    return;
  }
  const btn=event.target instanceof Element?event.target.closest('[data-action]'):null;
  if(btn)handleAction(btn.dataset.action,btn.dataset.id);
});

const reviewerNav=document.querySelector('a[href="#reviewersSetup"]');
if(reviewerNav)reviewerNav.addEventListener('click',()=>{const library=$('reviewersSetup');if(library)library.open=true;});

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
    if(metadataChanged){renderReviewers();renderPastReviewers();renderHistory();}
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
    setTimeout(()=>$('scanQueuesNow').textContent='Check queues',1600);
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