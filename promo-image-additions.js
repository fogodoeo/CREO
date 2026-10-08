'use strict';
const additions=require('./promo-image-additions.json');
function addPromoImages(id,blocks){
 const result=blocks.slice();
 for(const image of additions.filter(a=>a.templateId===id)){
  if(result.some(b=>b.type==='image'&&b.src===image.src))continue;
  const anchor=result.findIndex(b=>b.type==='text'&&b.text.includes(image.after));
  let at=anchor;
  // Place the photo after the paragraph explaining its subject, keeping headings with copy.
  if(at>=0&&result[at].bold){const next=result[at+1];if(next?.type==='text'&&next.text.trim()&&!next.bold&&!next.href)at++;}
  if(at<0){const footer=result.findIndex(b=>b.href);at=footer<0?result.length-1:footer-1;}
  result.splice(at+1,0,{type:'image',src:image.src,copySrc:'https://creok.onrender.com'+image.src,alt:image.alt,width:500});
 }
 return result;
}
module.exports={addPromoImages};
