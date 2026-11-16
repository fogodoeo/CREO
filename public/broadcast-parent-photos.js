/* Preload reference photos. A pending/failed image never blanks the visible photo. */
(() => {
 'use strict';
 const players=new Map();
 function hydrate(root){
  for(const box of root.querySelectorAll('[data-parent-photos]')){
   if(players.has(box))continue;
   let rows;try{rows=JSON.parse(box.dataset.parentPhotos)}catch{continue}
   if(!Array.isArray(rows)||!rows.length)continue;
   const player={slides:[],index:-1,next:0,disposed:false};players.set(box,player);
   const show=(index,now)=>{player.index=index;player.next=now+5000;player.slides.forEach((slide,i)=>{slide.element.hidden=i!==index});box.classList.add('has-parent-photo');box.removeAttribute('data-photos-failed');};
   rows.slice(0,3).forEach(row=>{
    const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');
    figure.hidden=true;img.alt=[row.label,row.name].filter(Boolean).join(' ');img.decoding='async';
    const role=document.createElement('span');role.className='parent-role';role.textContent=row.label;caption.append(role);
    if(row.name){const name=document.createElement('span');name.className='parent-name';name.textContent=row.name;caption.append(name)}
    figure.append(img,caption);box.append(figure);
    const slide={element:figure,ready:false,failed:false};player.slides.push(slide);
    img.onload=async()=>{try{await img.decode()}catch{}if(player.disposed||!box.isConnected)return;slide.ready=true;if(player.index<0)show(player.slides.indexOf(slide),Date.now())};
    img.onerror=()=>{slide.failed=true;if(player.slides.every(s=>s.failed))box.dataset.photosFailed='1'};
    img.src=row.url;
   });
   player.tick=now=>{if(now<player.next||player.index<0)return;for(let step=1;step<player.slides.length;step++){const next=(player.index+step)%player.slides.length;if(player.slides[next].ready){show(next,now);break}}};
  }
 }
 function release(root){for(const[box,player]of players){if(box===root||root.contains(box)){player.disposed=true;players.delete(box)}}}
 setInterval(()=>{const now=Date.now();for(const[box,player]of players){if(!box.isConnected){release(box);continue}player.tick?.(now)}},250);
 window.CreoParentPhotos={hydrate,release};
})();
