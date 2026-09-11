const KEY='nero-router-state-v1';
const state=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}})();
state.songs ||= []; state.reviewers ||= []; state.submissions ||= [];
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID();
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));

function render(){
  $('songs').innerHTML=state.songs.length?state.songs.map(s=>`<div class="card"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}</span><small>${esc(s.songUrl)}</small>${s.instagram?`<small>${esc(s.instagram)}</small>`:''}</div>`).join(''):'<p class="empty">No songs saved yet.</p>';
  $('reviewers').innerHTML=state.reviewers.length?state.reviewers.map(r=>`<div class="card reviewer"><div><strong>${esc(r.name)}</strong><small>${esc(r.neroUrl)}</small></div>${state.songs.length?`<select data-reviewer="${r.id}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${s.id}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>'}</div>`).join(''):'<p class="empty">Add any Nero creator URL to test the flow.</p>';
  $('submissionRows').innerHTML=state.submissions.length?state.submissions.map(s=>`<div class="tr"><span>${esc(s.reviewer)}</span><span>${esc(s.song)}</span><span class="status">${esc(s.status)}</span><span>${esc(s.createdAt)}</span></div>`).join(''):'<p class="empty">Nothing submitted yet.</p>';
  document.querySelectorAll('select[data-reviewer]').forEach(el=>el.onchange=()=>submitToReviewer(el.dataset.reviewer,el.value));
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
  let url=$('neroUrl').value.trim();
  if(!/^https?:\/\//i.test(url))url='https://'+url;
  try{
    const parsed=new URL(url);
    if(!/(^|\.)nero\.fan$/i.test(parsed.hostname)) throw new Error('Not a Nero URL');
  }catch{
    alert('Enter a valid nero.fan reviewer URL.');
    return;
  }
  state.reviewers.push({id:uid(),name:$('reviewerName').value.trim(),neroUrl:url});
  save();$('reviewerForm').reset();render();
};

function submitToReviewer(reviewerId,songId){
  const reviewer=state.reviewers.find(r=>r.id===reviewerId);
  const song=state.songs.find(s=>s.id===songId);
  if(!reviewer||!song)return;

  const payload={source:'livefinder',type:'PREPARE_NERO_SUBMISSION',runId:uid(),song,reviewer,createdAt:Date.now()};
  const base=reviewer.neroUrl.split('#')[0];
  let settled=false;

  const cleanup=()=>window.removeEventListener('message',onAck);
  const onAck=event=>{
    if(event.source!==window)return;
    const msg=event.data;
    if(msg?.source!=='livefinder-extension')return;

    if(msg.type==='NERO_SUBMISSION_STORED'){
      settled=true;cleanup();
      state.submissions.unshift({id:payload.runId,reviewer:reviewer.name,song:`${song.artist} — ${song.title}`,createdAt:new Date().toLocaleString(),status:'automation started'});
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

render();
