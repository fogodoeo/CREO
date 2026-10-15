(function(root){
    'use strict';
    function mount({getChannelId,getTab,refresh,isEditing}){
        const bar=document.getElementById('item-sheet-bar'),link=document.getElementById('item-sheet-open'),label=document.getElementById('item-sheet-status');
        let current='',lastPoll=0,pending=false,state=null,lastRefresh='';
        function render(){
            bar.hidden=getTab()!=='items'||!state?.configured;
            if(bar.hidden)return;
            link.href=state.spreadsheetUrl;
            label.textContent=state.lastError||(!state.enabled?'자동 연결 일시 중지':state.errorCount?`${state.errorCount}개 행 확인 필요`:state.lastSuccessAt?'자동 연결 중 · 약 10초마다 반영':'첫 연결 확인 중');
            label.style.color=state.lastError||state.errorCount?'var(--danger)':'#59616d';
        }
        async function poll(){
            const id=getChannelId();if(!id||document.hidden)return;
            if(current!==id){current=id;state=null;lastPoll=0;lastRefresh='';render();}
            render();if(pending||Date.now()-lastPoll<10000)return;
            pending=true;lastPoll=Date.now();
            try{
                const next=await root.CreoPlatform.api('channels/'+encodeURIComponent(id)+'/item-sheet');
                if(id!==getChannelId())return;
                state=next;render();
                if(next.lastSuccessAt&&next.lastSuccessAt!==lastRefresh&&!isEditing()&&getTab()==='items'){
                    await refresh();if(id===getChannelId())lastRefresh=next.lastSuccessAt;
                }
            }catch{if(current===id&&state?.configured){label.textContent='연결 상태를 확인하고 있어요.';}}
            finally{pending=false;}
        }
        document.addEventListener('creo:workspace-render',()=>{render();void poll();});
        const timer=setInterval(poll,1000);root.addEventListener('pagehide',()=>clearInterval(timer),{once:true});void poll();
    }
    root.CreoItemSheetLink={mount};
})(window);
