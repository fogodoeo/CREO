(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoContributionResult=api})(typeof window!=='undefined'?window:globalThis,function(){
    'use strict';
    const duration=5000;
    function visible(item,mode,now=Date.now(),editor=false){
        if(mode!=='sold'||!item||!['sold','complete','completed'].includes(item.status))return false;
        if(editor)return true;
        const started=Date.parse(item.updatedAt||'');
        return Number.isFinite(started)&&now>=started&&now<started+duration;
    }
    return {visible,duration};
});
