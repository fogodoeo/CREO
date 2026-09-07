(function(root){
    'use strict';
    const players=new WeakMap();
    function attach(frame){
        if(players.has(frame))return;
        let playlist;try{playlist=JSON.parse(frame.dataset.bannerPlaylist)}catch{return}
        if(!Array.isArray(playlist)||!playlist.length)return;
        let active=null,pending=null,index=-1,stopped=false,timer=0,due=true;
        const dispose=media=>{if(!media)return;media.remove();if(media.tagName==='VIDEO'){media.pause();media.removeAttribute('src');media.load()}};
        const prepare=nextIndex=>{
            if(stopped||pending)return;
            const entry=playlist[nextIndex],media=document.createElement(entry.video?'video':'img');
            media.className='banner-media';media.style.opacity='0';media.alt=entry.name||'';
            const job={media,index:nextIndex,ready:false,timeout:0};pending=job;
            const ready=()=>{if(stopped||pending!==job)return;clearTimeout(job.timeout);job.ready=true;if(due)show(job);else if(entry.video)media.pause()};
            const failed=()=>{if(stopped||pending!==job)return;clearTimeout(job.timeout);pending=null;dispose(media);timer=setTimeout(()=>prepare((nextIndex+1)%playlist.length),1500)};
            media.onerror=failed;
            if(entry.video){media.muted=true;media.loop=true;media.autoplay=true;media.playsInline=true;media.preload='auto';media.onloadeddata=()=>{if(media.requestVideoFrameCallback)media.requestVideoFrameCallback(ready);else ready()};}
            else media.onload=()=>{if(media.decode)media.decode().then(ready,failed);else ready()};
            frame.append(media);media.src=entry.url;
            job.timeout=setTimeout(failed,20000);
            if(entry.video)media.play().catch(failed);
        };
        const show=job=>{
            if(stopped||pending!==job||!job.ready)return;
            const commit=()=>{
                if(stopped||pending!==job||!frame.isConnected)return;
                const previous=active;active=job.media;index=job.index;pending=null;due=false;
                active.style.opacity='1';
                requestAnimationFrame(()=>requestAnimationFrame(()=>dispose(previous)));
                if(playlist.length>1){timer=setTimeout(()=>{due=true;if(pending?.ready)show(pending)},6000);prepare((index+1)%playlist.length)}
            };
            if(job.media.tagName==='VIDEO')job.media.play().then(()=>{
                if(job.media.requestVideoFrameCallback)job.media.requestVideoFrameCallback(commit);else requestAnimationFrame(commit);
            }).catch(()=>{});else commit();
        };
        players.set(frame,{stop(){stopped=true;clearTimeout(timer);if(pending)clearTimeout(pending.timeout);dispose(pending?.media);dispose(active);players.delete(frame)}});
        prepare(0);
    }
    root.CreoBannerPlayer={hydrate(stage){stage.querySelectorAll('[data-banner-playlist]').forEach(attach)},release(element){if(element.matches('[data-banner-playlist]'))players.get(element)?.stop();element.querySelectorAll('[data-banner-playlist]').forEach(frame=>players.get(frame)?.stop())}};
})(typeof window==='undefined'?globalThis:window);
