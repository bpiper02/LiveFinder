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

function normalizeNeroUrl(input){
  let url=String(input||'').trim();
  if(!/^https?:\/\//i.test(url))url='https://'+url;
  const parsed=new URL(url);
  if(!/(^|\.)nero\.fan$/i.test(parsed.hostname))throw new Error('Not a Nero URL');
  parsed.hash='';
  parsed.search='';
  parsed.pathname=parsed.pathname.replace(/\/+$/,'')||'/';
  return parsed.toString();
}

function reviewerLabel(url){
  try{
    const parsed=new URL(url);
    const parts=parsed.pathname.split('/').filter(Boolean);
    const slug=decodeURIComponent(parts.at(-1)||'nero');
    return slug.startsWith('@')?slug:`@${slug}`;
  }catch{return 'Nero reviewer';}
}

function migrateState(){
  state.reviewers=state.reviewers.map(r=>({
    id:r.id||uid(),
    neroUrl:r.neroUrl,
    label:r.label||r.name||reviewerLabel(r.neroUrl)
  })).filter(r=>r.neroUrl);

  state.submissions=state.submissions.map(s=>({
    id:s.id||uid(),
    reviewerUrl:s.reviewerUrl||'',
    reviewer:s.reviewer||reviewerLabel(s.reviewerUrl),
    songId:s.songId||'',
    song:s.song||'',
    status:s.status||'unknown',
    queueAhead:Number.isFinite(s.queueAhead)?s.queueAhead:null,
    createdAt:s.createdAt||new Date().toLocaleString(),
    createdAtMs:s.createdAtMs||Date.now()
  }));
  save();
}

function statusText(s){
  if(s.status==='submitted')return s.queueAhead!=null?`submitted · ${s.queueAhead} ahead`:'submitted';
  if(s.status==='queued')return s.queueAhead!=null?`queued · ${s.queueAhead} ahead`:'queued';
  return s.status||'unknown';
}

function render(){
  $('songs').innerHTML=state.songs.length?state.songs.map(s=>`
    <div class="card itemRow">
      <div class="itemMain"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}</span><small>${esc(s.songUrl)}</small>${s.instagram?`<small>${esc(s.instagram)}</small>`:''}</div>
      <button class="iconButton danger" type="button" data-action="delete-song" data-id="${s.id}">Delete</button>
    </div>`).join(''):'<p class="empty">No songs saved yet.</p>';

  $('reviewers').innerHTML=state.reviewers.length?state.reviewers.map(r=>`
    <div class="card reviewer">
      <div><strong>${esc(r.label||reviewerLabel(r.neroUrl))}</strong><small>${esc(r.neroUrl)}</small></div>
      <div class="reviewerActions">
        ${state.songs.length?`<select data-reviewer="${r.id}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${s.id}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>'}
        <button class="iconButton danger" type="button" data-action="delete-reviewer" data-id="${r.id}">Delete</button>
      </div>
    </div>`).join(''):'<p class="empty">Paste a Nero reviewer link to get started.</p>';

  $('submissionRows').innerHTML=state.submissions.length?state.submissions.map(s=>`
    <div class="tr">
      <span title="${esc(s.reviewerUrl)}">${esc(s.reviewer||reviewerLabel(s.reviewerUrl))}</span>
      <span>${esc(s.song)}</span>
      <span class="status">${esc(statusText(s))}</span>
      <span>${esc(s.createdAt)}</span>
      <span><button class="iconButton danger" type="button" data-action="delete-submission" data-id="${s.id}">Delete</button></span>
    </div>`).join(''):'<p class="empty">Nothing submitted yet.</p>';

  document.querySelectorAll('select[data-reviewer]').forEach(el=>el.onchange=()=>submitToReviewer(el.dataset.reviewer,el.value));
  document.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>handleAction(btn.dataset.action,btn.dataset.id));
}

function handleAction(action,id){
  if(action==='delete-song')state.songs=state.songs.filter(x=>x.id!==id);
  if(action==='delete-reviewer')state.reviewers=state.reviewers.filter(x=>x.id!==id);
  if(action==='delete-submission')state.submissions=state.submissions.filter(x=>x.id!==id);
  save();render();
}

$('songForm').onsubmit=e=>{
  e.preventDefault();
  state.songs.push({
    id:uid(),
    artist:$('artist').value.trim(),
    title:$('title').value.trim(),
    email:$('email').value.trim(),
    instagram:$('instagram').value.trim(),
    songUrl:$('songUrl').value.trim(),
    note:$('note').value.trim()
  });
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
  try{url=normalizeNeroUrl($('neroUrl').value);}catch{
    alert('Enter a valid nero.fan reviewer URL.');
    return;
  }

  if(state.reviewers.some(r=>r.neroUrl.toLowerCase()===url.toLowerCase())){
    alert('That Nero reviewer is already in your list.');
    return;
  }

  state.reviewers.push({id:uid(),neroUrl:url,label:reviewerLabel(url)});
  save();
  $('reviewerForm').reset();
  render();
};

$('clearHistory').onclick=()=>{
  if(!state.submissions.length)return;
  if(!confirm('Clear all submission history?'))return;
  state.submissions=[];
  save();render();
};

function submitToReviewer(reviewerId,songId){
  const reviewer=state.reviewers.find(r=>r.id===reviewerId);
  const song=state.songs.find(s=>s.id===songId);
  if(!reviewer||!song)return;

  if(!bridgeReady){
    alert('LiveFinder extension is not connected yet. Refresh this page after reloading the extension, then try again.');
    window.postMessage({source:'livefinder-web',type:'PING_BRIDGE'},'*');
    return;
  }

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
      state.submissions.unshift({
        id:runId,
        reviewerUrl:reviewer.neroUrl,
        reviewer:reviewer.label||reviewerLabel(reviewer.neroUrl),
        songId:song.id,
        song:`${song.artist} — ${song.title}`,
        createdAt:new Date().toLocaleString(),
        createdAtMs:Date.now(),
        status:'automation started',
        queueAhead:null
      });
      save();render();
      window.open(base,'_blank','noopener,noreferrer');
      return;
    }

    if(msg.type==='NERO_SUBMISSION_STORE_FAILED'){
      settled=true;cleanup();
      alert(`LiveFinder extension could not start the submission. ${msg.error||'Reload the extension and refresh this page.'}`);
    }
  };

  window.addEventListener('message',onAck);
  window.postMessage({source:'livefinder-web',type:'STORE_NERO_SUBMISSION',payload},'*');

  setTimeout(()=>{
    if(settled)return;
    cleanup();
    alert('LiveFinder extension did not respond. Reload it at chrome://extensions, refresh this page, and try again.');
  },4000);
}

function findMatchingSubmission(data){
  if(!data)return null;
  const reviewerUrl=data.reviewer?.neroUrl||'';
  const songId=data.song?.id||'';
  const eventAt=data.completedAt||data.capturedAt||0;
  return state.submissions.find(s=>
    (!reviewerUrl||s.reviewerUrl===reviewerUrl) &&
    (!songId||s.songId===songId) &&
    (!eventAt||s.createdAtMs<=eventAt)
  )||null;
}

function reconcileStatus(queue,result){
  let changed=false;
  if(queue){
    const row=findMatchingSubmission(queue);
    if(row&&row.status!=='submitted'){
      row.status='queued';
      if(Number.isFinite(queue.ahead))row.queueAhead=queue.ahead;
      changed=true;
    }
  }
  if(result){
    const row=findMatchingSubmission(result);
    if(row){
      row.status='submitted';
      if(Number.isFinite(result.ahead))row.queueAhead=result.ahead;
      changed=true;
    }
  }
  if(changed){save();render();}
}

window.addEventListener('message',event=>{
  if(event.source!==window)return;
  const msg=event.data;
  if(msg?.source!=='livefinder-extension')return;

  if(msg.type==='BRIDGE_READY'){
    bridgeReady=true;
    bridgeVersion=msg.version||'';
    sessionStorage.removeItem('livefinder-stale-reload');
    console.log(`[LiveFinder] extension connected${bridgeVersion?` v${bridgeVersion}`:''}`);
    return;
  }

  if(msg.type==='EXTENSION_CONTEXT_STALE'){
    bridgeReady=false;
    if(staleReloadScheduled)return;
    staleReloadScheduled=true;
    const alreadyRetried=sessionStorage.getItem('livefinder-stale-reload')==='1';
    if(alreadyRetried){
      alert('The LiveFinder extension was updated, but this tab still has a stale extension context. Refresh this page once.');
      return;
    }
    sessionStorage.setItem('livefinder-stale-reload','1');
    console.info('[LiveFinder] extension updated; refreshing dashboard to reconnect…');
    setTimeout(()=>location.reload(),150);
    return;
  }

  if(msg.type==='NERO_STATUS')reconcileStatus(msg.queue,msg.result);
});

setInterval(()=>{
  if(bridgeReady)window.postMessage({source:'livefinder-web',type:'REQUEST_NERO_STATUS'},'*');
},1500);
window.postMessage({source:'livefinder-web',type:'PING_BRIDGE'},'*');

migrateState();
render();
