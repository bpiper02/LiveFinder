(() => {
  const liveCards=document.getElementById('poolLive');
  const openCards=document.getElementById('poolOpen');
  const otherCards=document.getElementById('poolOther');
  const viewsRoot=document.getElementById('poolViews');
  const library=document.getElementById('reviewersSetup');
  if(library)library.open=false;
  if(!liveCards||!openCards||!otherCards||!viewsRoot)return;

  const cards={live:liveCards,open:openCards,other:otherCards};
  const views={
    live:document.getElementById('poolViewLive'),
    open:document.getElementById('poolViewOpen'),
    other:document.getElementById('poolViewOther')
  };
  const buttons=[...document.querySelectorAll('[data-pool-filter]')];
  let active='live';

  const countCards=el=>el?el.querySelectorAll('.poolCard').length:0;

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

  function applyFilter(next,c=counts()){
    active=chooseUsableFilter(next,c);
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
      return;
    }
    if(active==='open'){
      views.live.hidden=true;
      views.open.hidden=false;
      views.other.hidden=true;
      return;
    }

    if(c.all===0){
      views.live.hidden=false;
      views.open.hidden=true;
      views.other.hidden=true;
      return;
    }
    views.live.hidden=c.live===0;
    views.open.hidden=c.open===0;
    views.other.hidden=c.other===0;
  }

  function sync(){
    const c=counts();
    for(const [key,value] of Object.entries(c)){
      const output=document.querySelector(`[data-pool-count="${key}"]`);
      if(output)output.textContent=String(value);
    }
    applyFilter(active,c);
  }

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
