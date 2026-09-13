(() => {
  const liveCards=document.getElementById('poolLive');
  const openCards=document.getElementById('poolOpen');
  const otherCards=document.getElementById('poolOther');
  const viewsRoot=document.getElementById('poolViews');
  const tablist=document.getElementById('poolTabs');
  const library=document.getElementById('reviewersSetup');
  if(library)library.open=false;
  if(!liveCards||!openCards||!otherCards||!viewsRoot||!tablist)return;

  const PREVIEW_COUNT=8;
  const SONG_KEY='livefinder-pool-song-id';
  const cards={live:liveCards,open:openCards,other:otherCards};
  const views={
    live:document.getElementById('poolViewLive'),
    open:document.getElementById('poolViewOpen'),
    other:document.getElementById('poolViewOther')
  };
  const buttons=[...document.querySelectorAll('[data-pool-filter]')];
  let active='live';
  let expanded=false;

  const formatCount=value=>{
    const number=Math.max(0,Math.floor(Number(value)||0));
    return number<100?String(number).padStart(2,'0'):String(number);
  };

  const actionBar=document.createElement('div');
  actionBar.className='poolActionBar';
  actionBar.innerHTML='<label for="poolSongChoice"><span>Song to submit</span><select id="poolSongChoice" aria-label="Song to submit"><option value="">Add a song first</option></select></label><small>Pick once, then choose reviewers below.</small>';
  tablist.insertAdjacentElement('beforebegin',actionBar);
  const songChoice=actionBar.querySelector('#poolSongChoice');

  const disclosure=document.createElement('div');
  disclosure.className='poolDisclosure';
  disclosure.hidden=true;
  disclosure.innerHTML='<span id="poolDisclosureCopy"></span><button id="poolDisclosureToggle" type="button"></button>';
  viewsRoot.insertAdjacentElement('afterend',disclosure);
  const disclosureCopy=disclosure.querySelector('#poolDisclosureCopy');
  const disclosureToggle=disclosure.querySelector('#poolDisclosureToggle');

  const cardNodes=el=>el?[...el.querySelectorAll('.poolCard')]:[];
  const countCards=el=>cardNodes(el).length;
  const poolSelects=()=>[...viewsRoot.querySelectorAll('select[data-pool-url]')];

  function counts(){
    const live=countCards(cards.live);
    const open=countCards(cards.open);
    const other=countCards(cards.other);
    return {live,open,other,all:live+open+other};
  }

  function chooseUsableFilter(next,c){
    if(next==='live'&&c.live>0)return 'live';
    if(next==='open'&&c.open>0)return 'open';
    if(next==='all')return 'all';
    if(c.live>0)return 'live';
    if(c.open>0)return 'open';
    return 'all';
  }

  function clearPreviewHiding(){
    for(const el of Object.values(cards)){
      for(const card of cardNodes(el))card.classList.remove('poolPreviewHidden');
    }
  }

  function applyDisclosure(c=counts()){
    clearPreviewHiding();
    const shouldOffer=active==='live'&&c.live>PREVIEW_COUNT;
    disclosure.hidden=!shouldOffer;
    if(!shouldOffer)return;

    const live=cardNodes(cards.live);
    if(!expanded)live.slice(PREVIEW_COUNT).forEach(card=>card.classList.add('poolPreviewHidden'));
    disclosureCopy.textContent=expanded
      ? `Showing all ${c.live} live reviewers.`
      : `Showing ${PREVIEW_COUNT} of ${c.live} live reviewers.`;
    disclosureToggle.textContent=expanded?'Show fewer':`Show all ${c.live}`;
    disclosureToggle.setAttribute('aria-expanded',String(expanded));
  }

  function applyFilter(next,c=counts()){
    const previous=active;
    active=chooseUsableFilter(next,c);
    if(active!==previous)expanded=false;
    viewsRoot.dataset.activeFilter=active;

    for(const button of buttons){
      const filter=button.dataset.poolFilter;
      const selected=filter===active;
      button.classList.toggle('isActive',selected);
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      if(filter==='live')button.disabled=c.live===0;
      if(filter==='open')button.disabled=c.open===0;
    }

    if(active==='live'){
      views.live.hidden=false;
      views.open.hidden=true;
      views.other.hidden=true;
      applyDisclosure(c);
      return;
    }
    if(active==='open'){
      views.live.hidden=true;
      views.open.hidden=false;
      views.other.hidden=true;
      applyDisclosure(c);
      return;
    }

    if(c.all===0){
      views.live.hidden=false;
      views.open.hidden=true;
      views.other.hidden=true;
      applyDisclosure(c);
      return;
    }
    views.live.hidden=c.live===0;
    views.open.hidden=c.open===0;
    views.other.hidden=c.other===0;
    applyDisclosure(c);
  }

  function songOptions(){
    const source=poolSelects()[0];
    if(!source)return [];
    return [...source.options]
      .filter(option=>option.value)
      .map(option=>({value:option.value,label:option.textContent||option.value}));
  }

  function syncSongPicker(){
    const options=songOptions();
    const previous=songChoice.value||localStorage.getItem(SONG_KEY)||'';
    songChoice.innerHTML=options.length
      ? '<option value="">Choose a song…</option>'+options.map(option=>`<option value="${option.value.replace(/"/g,'&quot;')}">${option.label.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`).join('')
      : '<option value="">Add a song first</option>';
    const usable=options.some(option=>option.value===previous)?previous:(options[0]?.value||'');
    songChoice.value=usable;
    songChoice.disabled=!options.length;
    if(usable)localStorage.setItem(SONG_KEY,usable);
    else localStorage.removeItem(SONG_KEY);
  }

  function decoratePoolCards(){
    const selectedSong=songChoice.value;
    for(const select of poolSelects()){
      select.classList.add('poolInlineSongSelect');
      select.tabIndex=-1;
      select.setAttribute('aria-hidden','true');
      const card=select.closest('.poolCard');
      if(!card)continue;
      let button=card.querySelector('[data-pool-submit-button]');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='poolSubmitButton';
        button.dataset.poolSubmitButton='1';
        button.textContent='Submit';
        select.insertAdjacentElement('afterend',button);
      }
      button.disabled=!selectedSong;
      button.title=selectedSong?'Submit selected song to this reviewer':'Choose a song above first';
    }
  }

  function sync(){
    const c=counts();
    for(const [key,value] of Object.entries(c)){
      const output=document.querySelector(`[data-pool-count="${key}"]`);
      if(output)output.textContent=formatCount(value);
    }
    syncSongPicker();
    decoratePoolCards();
    applyFilter(active,c);
  }

  songChoice.addEventListener('change',()=>{
    if(songChoice.value)localStorage.setItem(SONG_KEY,songChoice.value);
    else localStorage.removeItem(SONG_KEY);
    decoratePoolCards();
  });

  viewsRoot.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('[data-pool-submit-button]'):null;
    if(!button)return;
    const card=button.closest('.poolCard');
    const select=card?.querySelector('select[data-pool-url]');
    if(!select||!songChoice.value)return;
    select.value=songChoice.value;
    select.dispatchEvent(new Event('change',{bubbles:true}));
  });

  disclosureToggle.addEventListener('click',()=>{
    expanded=!expanded;
    applyDisclosure(counts());
  });

  for(const button of buttons){
    button.addEventListener('click',()=>applyFilter(button.dataset.poolFilter));
    button.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const enabled=buttons.filter(item=>!item.disabled);
      const index=enabled.indexOf(button);
      if(index<0)return;
      const delta=event.key==='ArrowRight'?1:-1;
      const target=enabled[(index+delta+enabled.length)%enabled.length];
      target.focus();
      applyFilter(target.dataset.poolFilter);
    });
  }

  const observer=new MutationObserver(sync);
  for(const el of Object.values(cards))observer.observe(el,{childList:true,subtree:true});
  sync();
})();