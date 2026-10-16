(function(root){
    'use strict';
    function mount({getChannelId,getTab,refresh,isEditing}){
        const bar=document.getElementById('item-sheet-bar'),link=document.getElementById('item-sheet-open'),label=document.getElementById('item-sheet-status');
        let current='',lastPoll=0,pending=false,state=null,lastRefresh='';
        let timer=null,suspended=false,disposed=false,generation=0;
        const canPoll=()=>!disposed&&!suspended&&!document.hidden&&getTab()==='items'&&getChannelId();
        function clearTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
        function schedule(){
            clearTimer();
            if(canPoll()&&!pending)timer=setTimeout(poll,Math.max(0,10000-(Date.now()-lastPoll)));
        }
        function render(){
            bar.hidden=getTab()!=='items'||!state?.configured;
            if(bar.hidden)return;
            link.href=state.spreadsheetUrl;
            label.textContent=state.lastError||(!state.enabled?'자동 연결 일시 중지':state.errorCount?`${state.errorCount}개 행 확인 필요`:state.lastSuccessAt?'자동 연결 중 · 약 10초마다 반영':'첫 연결 확인 중');
            label.style.color=state.lastError||state.errorCount?'var(--danger)':'#59616d';
        }
        async function poll(){
            clearTimer();
            const id=getChannelId();
            if(current!==id){current=id;state=null;lastPoll=0;lastRefresh='';generation++;}
            render();
            if(!canPoll()||pending)return;
            if(Date.now()-lastPoll<10000){schedule();return;}
            const requestGeneration=generation;
            pending=true;lastPoll=Date.now();
            try{
                const next=await root.CreoPlatform.api('channels/'+encodeURIComponent(id)+'/item-sheet');
                if(disposed||requestGeneration!==generation||id!==getChannelId())return;
                state=next;render();
                if(canPoll()&&next.lastSuccessAt&&next.lastSuccessAt!==lastRefresh&&!isEditing()){
                    await refresh();
                    if(requestGeneration===generation&&id===getChannelId())lastRefresh=next.lastSuccessAt;
                }
            }catch{if(!disposed&&requestGeneration===generation&&current===id&&state?.configured){label.textContent='연결 상태를 확인하고 있어요.';}}
            finally{pending=false;schedule();}
        }
        function onRender(){void poll();}
        function onHide(){suspended=true;generation++;clearTimer();}
        function onShow(){if(suspended){suspended=false;lastPoll=0;void poll();}}
        document.addEventListener('creo:workspace-render',onRender);
        document.addEventListener('visibilitychange',onRender);
        root.addEventListener('pagehide',onHide);
        root.addEventListener('pageshow',onShow);
        void poll();
        return ()=>{
            disposed=true;generation++;clearTimer();
            document.removeEventListener('creo:workspace-render',onRender);
            document.removeEventListener('visibilitychange',onRender);
            root.removeEventListener('pagehide',onHide);
            root.removeEventListener('pageshow',onShow);
        };
    }
    root.CreoItemSheetLink={mount};
})(window);
