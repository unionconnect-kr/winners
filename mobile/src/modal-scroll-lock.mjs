// iOS dialogs still allow root scrolling, especially when their content is short.
// Keep the page at its current offset and contain single-finger boundary swipes.
export function createModalScrollLock(window){
 const document=window.document,active=new Map();let page=null,observer=null,lastTouch=null;
 const save=(node,properties)=>properties.map(property=>[property,node.style.getPropertyValue(property),node.style.getPropertyPriority(property)]);
 const restore=(node,styles)=>styles.forEach(([property,value,priority])=>value?node.style.setProperty(property,value,priority):node.style.removeProperty(property));
 const topSheet=()=>[...active.keys()].at(-1);
 const touchStart=event=>{
  lastTouch=event.touches?.length===1?{x:event.touches[0].clientX,y:event.touches[0].clientY}:null;
 };
 const touchMove=event=>{
  if(event.touches?.length!==1||!lastTouch)return;
  const next={x:event.touches[0].clientX,y:event.touches[0].clientY};
  const dx=next.x-lastTouch.x,dy=next.y-lastTouch.y;lastTouch=next;
  const sheet=topSheet(),target=event.target;
  if(!sheet)return;
  // Backdrop touches may target the dialog itself; its own scroll can only move
  // the sheet, never the fixed page. Preserve pinch zoom and ordinary taps.
  if(sheet.contains(target)){
   const vertical=Math.abs(dy)>=Math.abs(dx),delta=vertical?dy:dx;
   if(!delta)return;
   for(let node=target?.nodeType===1?target:target?.parentElement;node&&sheet.contains(node);node=node.parentElement){
    const css=window.getComputedStyle(node),overflow=vertical?css.overflowY:css.overflowX;
    const position=vertical?node.scrollTop:node.scrollLeft;
    const maximum=vertical?node.scrollHeight-node.clientHeight:node.scrollWidth-node.clientWidth;
    if(/^(auto|scroll)$/.test(overflow)&&maximum>1&&
      ((delta>0&&position>0)||(delta<0&&position<maximum-1)))return;
    if(node===sheet)break;
   }
  }
  if(event.cancelable)event.preventDefault();
 };
 function unlock(sheet){
  const release=active.get(sheet);if(!release)return;
  sheet.removeEventListener('close',release);active.delete(sheet);
  if(active.size)return;
  observer?.disconnect();observer=null;lastTouch=null;
  document.removeEventListener('touchstart',touchStart,true);
  document.removeEventListener('touchmove',touchMove,true);
  const saved=page;page=null;
  // Restore only properties owned by this lock; don't erase unrelated changes.
  restore(document.body,saved.body);restore(document.documentElement,saved.root);
  const root=document.documentElement;
  const behavior=save(root,['scroll-behavior']);root.style.setProperty('scroll-behavior','auto','important');
  window.scrollTo(saved.x,saved.y);restore(root,behavior);
 }
 return function lock(sheet){
  if(active.has(sheet))return active.get(sheet);
  if(!page){
   const root=document.documentElement,body=document.body;
   page={x:window.scrollX,y:window.scrollY,
    body:save(body,['position','top','left','width','overflow']),root:save(root,['overflow','overscroll-behavior'])};
   body.style.setProperty('position','fixed','important');
   body.style.setProperty('top',-page.y+'px','important');body.style.setProperty('left',-page.x+'px','important');
   body.style.setProperty('width','100%','important');body.style.setProperty('overflow','hidden','important');
   root.style.setProperty('overflow','hidden','important');root.style.setProperty('overscroll-behavior','none','important');
   document.addEventListener('touchstart',touchStart,{capture:true,passive:true});
   document.addEventListener('touchmove',touchMove,{capture:true,passive:false});
   // Removing a sheet during navigation must not leave the next page frozen.
   observer=new window.MutationObserver(()=>{
    for(const sheet of active.keys())if(!sheet.isConnected)unlock(sheet);
   });
   observer.observe(body,{childList:true,subtree:true});
  }
  sheet.style.overscrollBehavior='contain';
  const release=()=>{if(!sheet.open)unlock(sheet);};
  active.set(sheet,release);sheet.addEventListener('close',release);
  return ()=>unlock(sheet);
 };
}
