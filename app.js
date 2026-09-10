const KEY='nero-router-state-v1';
const state=(()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return{}}})();
state.songs ||= []; state.reviewers ||= []; state.submissions ||= [];
const $=id=>document.getElementById(id);
const uid=()=>crypto.randomUUID();
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

function render(){
  $('songs').innerHTML=state.songs.length?state.songs.map(s=>`<div class="card"><strong>${esc(s.title)}</strong><span>${esc(s.artist)}</span><small>${esc(s.songUrl)}</small></div>`).join(''):'<p class="empty">No songs saved yet.</p>';
  $('reviewers').innerHTML=state.reviewers.length?state.reviewers.map(r=>`<div class="card reviewer"><div><strong>${esc(r.name)}</strong><small>${esc(r.neroUrl)}</small></div>${state.songs.length?`<select data-reviewer="${r.id}"><option value="" selected disabled>Submit song…</option>${state.songs.map(s=>`<option value="${s.id}">${esc(s.artist)} — ${esc(s.title)}</option>`).join('')}</select>`:'<small>Add a song first</small>'}</div>`).join(''):'<p class="empty">Add any Nero creator URL to test the flow.</p>';
  $('submissionRows').innerHTML=state.submissions.length?state.submissions.map(s=>`<div class="tr"><span>${esc(s.reviewer)}</span><span>${esc(s.song)}</span><span class="status">${esc(s.status)}</span><span>${esc(s.createdAt)}</span></div>`).join(''):'<p class="empty">Nothing submitted yet.</p>';
  document.querySelectorAll('select[data-reviewer]').forEach(el=>el.onchange=()=>submitToReviewer(el.dataset.reviewer,el.value));
}

$('songForm').onsubmit=e=>{e.preventDefault();state.songs.push({id:uid(),artist:$('artist').value.trim(),title:$('title').value.trim(),email:$('email').value.trim(),songUrl:$('songUrl').value.trim(),note:$('note').value.trim()});save();const keep=$('email').value;$('songForm').reset();$('email').value=keep;render();};
$('reviewerForm').onsubmit=e=>{e.preventDefault();let url=$('neroUrl').value.trim();if(!/^https?:\/\//i.test(url))url='https://'+url;state.reviewers.push({id:uid(),name:$('reviewerName').value.trim(),neroUrl:url});save();$('reviewerForm').reset();render();};
function submitToReviewer(reviewerId,songId){
  const reviewer=state.reviewers.find(r=>r.id===reviewerId),song=state.songs.find(s=>s.id===songId);if(!reviewer||!song)return;
  const payload={source:'nero-router',type:'PREPARE_NERO_SUBMISSION',song,reviewer,createdAt:Date.now()};
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  state.submissions.unshift({id:uid(),reviewer:reviewer.name,song:`${song.artist} — ${song.title}`,createdAt:new Date().toLocaleString(),status:'opened'});save();render();
  const base=reviewer.neroUrl.split('#')[0]; window.open(`${base}#nr=${encoded}`,'_blank','noopener,noreferrer');
}
render();
