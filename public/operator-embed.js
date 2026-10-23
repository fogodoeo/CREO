(function(){
 'use strict';
 try{if(window.parent===window||window.frameElement?.id!=='operator-frame'||!['/main','/main/','/index.html'].includes(window.parent.location.pathname))return;}catch{return;}
 if(document.documentElement.classList.contains('operator-embedded'))return;
 const send=(type,extra={})=>window.parent.postMessage({type,...extra},location.origin);
 document.documentElement.classList.add('operator-embedded');document.documentElement.dataset.operatorPage=location.pathname.split('/').pop()||'roulette';
 if(new URLSearchParams(location.search).get('broadcastDate'))document.documentElement.dataset.operatorDated='true';
 const style=document.createElement('link');style.rel='stylesheet';style.href='/operator-embed.css?v=20261023-program-directory';document.head.appendChild(style);
 // Resolve only known admin links. New windows, downloads, hash links and public
 // broadcast/buyer pages retain their existing behavior.
 const paths=new Set(['/main','/main/','/index.html','/channel-workspace.html','/broadcast-studio.html','/shipping.html','/shipping-status.html','/checkout-changes.html','/print.html','/settlement-report.html','/national-rounds.html','/organizer-bookings.html','/vendor-entry-review.html','/national-vendors.html','/operator-vendors.html','/channel-manager.html','/shipping-rates.html','/channel-archives.html','/capture-gallery.html','/parge-dispatch.html','/roulette/']);
 for(const path of ['/promo-center.html','/organizer-shipping.html','/capture-setup.html','/band-monitor.html'])paths.add(path);
 document.addEventListener('click',event=>{const a=event.target.closest?.('a');if(!a||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||a.target==='_blank'||a.hasAttribute('download'))return;const href=a.getAttribute('href');if(!href||href.startsWith('#'))return;const url=new URL(a.href,location.href);if(url.origin!==location.origin)return;if(!paths.has(url.pathname)||url.searchParams.has('broadcast')){a.target='_blank';a.rel='noopener';return;}event.preventDefault();send('creo:operator-link',{href:url.pathname+url.search+url.hash});});
 let editedForm=null;
 document.addEventListener('input',event=>{const form=event.target.closest?.('form');if(!form||form.dataset.managedDraft==='true'||event.target.type==='search'||event.target.type==='password')return;editedForm=form;send('creo:operator-dirty',{dirty:true});});
 const observer=new MutationObserver(()=>{if(editedForm&&(!editedForm.isConnected||editedForm.closest('[hidden]')||editedForm.closest('dialog:not([open])'))){editedForm=null;send('creo:operator-dirty',{dirty:false});}});
 observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open']});
 document.addEventListener('reset',()=>{editedForm=null;send('creo:operator-dirty',{dirty:false});});
})();
