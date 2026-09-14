(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoBroadcastThemes=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // New visual concepts belong here and in broadcast-themes.css, never in auction rules.
 const presets=Object.freeze([
  Object.freeze({id:'base',name:'기본',description:'단정한 기본 박스',frame:''}),
  Object.freeze({id:'pixel',name:'픽셀',description:'레트로 게임기',frame:''})
 ]);
 function resolve(id){return presets.find(p=>p.id===id)||presets[0]}
 function apply(doc,id){const theme=resolve(id);if(doc.body)doc.body.dataset.broadcastTheme=theme.id;return theme.id}
 // Always mounted so changing themes can reveal/hide the frame without remounting media.
 function frame(){return '<div class="broadcast-console" aria-hidden="true"><div class="console-shell"></div><div class="screen-bezel"></div><div class="console-stripes"><i></i><i></i><i></i><i></i></div><i class="console-power"></i><i class="console-dpad"></i><div class="console-buttons"><i></i><i></i></div><div class="console-speaker"><i></i><i></i><i></i><i></i><i></i></div></div>'}
 function bannerFrame(){return '<div class="banner-tv-decor" aria-hidden="true"><div class="banner-tv-controls"><i class="banner-tv-dial"></i><i class="banner-tv-dial small"></i><i class="banner-tv-speaker"></i><i class="banner-tv-led"></i></div><i class="banner-tv-foot left"></i><i class="banner-tv-foot right"></i></div>';}
 return Object.freeze({presets,resolve,apply,frame,bannerFrame});
});
