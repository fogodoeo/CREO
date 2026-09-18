'use strict';

// Operator-only preparation. Copies presentation values, never transaction rows.
const {normalizeChannel} = require('../platform-core');
const SAFE_CONFIG = /^(?:(?:p[123]_)?(?:banner|ticker|info|live_bidders|nametag[123]?|page2_photo|scoreboard)(?:_(?:top|left|right|bottom|width|height|maxwidth|maxheight|opacity|fontsize|font_size|interval|show|mode))|auction_animation_enabled|p2_item_font_size)$/;
const SAFE_STATE = /^page[123](?:.*(?:On|Position|FontSize|Opacity|Interval))$/;

function buildNextAuction(source, config, {id, name}) {
    if (!id || !name || id === source.channel.id) throw Error('A distinct target id and name are required');
    const ticker = '입찰은 숫자만 입력해 주세요.\n낙찰 내역은 옹동2 알림톡에서 확인해 주세요.';
    const broadcastDefaults = {layoutPreset:'standard-v1',notice:name,noticeDetail:'',page1Ticker:ticker,page2Ticker:ticker,page3Title:''};
    for (let n=1;n<=3;n++) Object.assign(broadcastDefaults,{['hostName'+n]:'',['hostRole'+n]:''});
    const channel = normalizeChannel({
        id,name,shortName:name,description:'',status:'draft',dataAdapter:'platform',broadcastProfile:'standard',
        broadcastTemplate:source.channel.broadcastTemplate,broadcastTheme:source.channel.broadcastTheme,
        theme:structuredClone(source.channel.theme),overlay:structuredClone(source.channel.overlay),
        templateId:'standard',pages:{},legacy:{items:false,managementUrl:'',controlUrl:''},
        features:{catalog:true,vendors:true,auction:true,shipping:true,broadcast:true,scoreboards:true,ranking:true,sponsors:true,groups:false,quiz:false,tournament:false,survey:false},
        groups:[],audienceCompetition:{enabled:false,assignment:'none',metric:'soldPrice'},
        settlementDiscount:{enabled:false,rule:'none',ratePercent:0,excludeShipping:true},
        scoreboards:[{id:'vendors',name:'업체별 낙찰금액',dimension:'vendor',metric:'soldAmount',unit:'원',topN:8}],
        terminology:{item:'개체',vendor:'업체',group:'그룹',round:'회차',scoreboard:'집계판'},
        broadcastDefaults,
        shippingDefaults:{...source.channel.shippingDefaults,pickupLocations:[],disabledPickupLocations:[],
            deliverySchedule:{enabled:false,auctionDate:'',pargeOrigin:'',dodosiOrigin:'',pargeDispatchDate:'',dodosiDispatchDate:''}}
    });
    const placements=structuredClone(source.broadcast?.layoutPlacements||{});
    // A resizable box must stay inside the canvas; source parent frame extended below it.
    for(const box of Object.values(placements)) {
        box.x=Math.max(0,Math.min(Number(box.x)||0,100-(Number(box.width)||4)));
        box.y=Math.max(0,Math.min(Number(box.y)||0,100-(Number(box.height)||4)));
    }
    for(const slot of ['p1-brand','p2-brand']) if(placements[slot]) placements[slot].visible=false;
    const broadcast={...Object.fromEntries(Object.entries(source.broadcast||{}).filter(([key])=>SAFE_STATE.test(key))),
        ...broadcastDefaults,mode:'standby',activeItemId:'',page:1,layoutPlacements:placements,
        page1HostsOn:false,page1BannerOn:false,page2BannerOn:false,page3BannerOn:false,
        page1BannerUrl:'',page2BannerUrl:'',page3BannerUrl:'',bannerSelectionConfigured:true,selectedBannerIds:[],
        page3On:true,page3VendorRankingOn:true,page3BuyerRankingOn:true,page3RankingInterval:10,
        scoreboardId:'',extraMode:'vendor',quizOn:false,quizStatus:'ready',quizQuestion:'',quizAnswer:'',quizWinner:'',
        audienceSessionId:'',audienceSessionStatus:'',audienceSessionLockedAt:'',audienceSessionEndedAt:''};
    const patch=Object.fromEntries(Object.entries(config||{}).filter(([key])=>SAFE_CONFIG.test(key)));
    Object.assign(patch,{ticker,badge_text:name,banner_show:'0',p2_banner_show:'0',nametag1_show:'0',nametag2_show:'0',nametag3_show:'0'});
    for(let n=1;n<=3;n++)Object.assign(patch,{['host_name'+n]:'',['host_role'+n]:''});
    return {channel,broadcast,config:patch};
}

function assertClosedLiveState(workspace) {
    if(workspace.broadcast?.mode==='live'||workspace.items.some(i=>i.status==='live')) throw Error('Source auction is live; finish it before preparing the next auction');
}
function assertEmptyTarget(workspace) {
    for(const key of ['vendors','items','shipments','assets']) if(workspace[key]?.length) throw Error('Target already contains '+key+'; refuse to overwrite');
    if(workspace.broadcast?.mode==='live'||workspace.broadcast?.activeItemId) throw Error('Target lifecycle is no longer empty');
}

async function prepareNextAuction(api,{sourceId,targetId,name,apply=false,beforeWrite=async()=>{}}) {
    const get=p=>api('GET',p),put=(p,b)=>api('PUT',p,b),post=(p,b)=>api('POST',p,b);
    const source=await get('channels/'+sourceId+'/workspace');
    assertClosedLiveState(source);
    const config=await get('channels/'+sourceId+'/broadcast-config');
    const catalog=await get('channels?includeArchived=1');
    const active=await get('active-channel');
    if(![sourceId,targetId].includes(active.channelId)) throw Error('Another channel is selected; refusing to interrupt it');
    const existing=catalog.channels.find(c=>c.id===targetId);
    if(existing&&existing.name!==name) throw Error('Target id belongs to another channel');
    if(existing)assertEmptyTarget(await get('channels/'+targetId+'/workspace'));
    const plan=buildNextAuction(source,config.config,{id:targetId,name});
    if(!apply)return {plan,source:{items:source.items.length,shipments:source.shipments.length,vendors:source.vendors.length},active,existing:!!existing};
    await beforeWrite({source,config,catalog,active,plan});
    if(!existing) await post('channels',{channel:plan.channel,expectedVersion:catalog.version});
    // Never blindly overwrite a concurrently changed catalog.
    const updateChannel=async(id,patch)=>{const latest=await get('channels?includeArchived=1');return put('channels/'+id,{channel:patch,expectedVersion:latest.version})};
    if(existing)await updateChannel(targetId,{...plan.channel,status:existing.status});
    await put('channels/'+targetId+'/broadcast-state',plan.broadcast);
    const prior=await get('channels/'+targetId+'/broadcast-config');
    await put('channels/'+targetId+'/broadcast-config',{patch:{...Object.fromEntries(Object.keys(prior.config||{}).map(k=>[k,null])),...plan.config}});
    const setIntake=async(id,open)=>{const p=await get('channels/'+id+'/entry-policy');if(p.open!==open)await put('channels/'+id+'/entry-policy',{open,expectedRevision:p.revision})};
    await setIntake(targetId,true);
    // All source records stay live for checkout. Archive is an additional snapshot only.
    const title=source.channel.name+' · 경매 종료 기록';
    const archives=await get('channels/'+sourceId+'/archives');
    if(!archives.archives.some(a=>a.title===title))await post('channels/'+sourceId+'/archives',{title});
    await setIntake(sourceId,false);
    await updateChannel(targetId,{status:'active'});
    const freshSource=await get('channels/'+sourceId+'/workspace');
    assertClosedLiveState(freshSource);
    const current=await get('active-channel');
    if(![sourceId,targetId].includes(current.channelId))throw Error('Active channel changed while preparing');
    await put('active-channel',{channelId:targetId,expectedCurrentChannelId:current.channelId,confirmChannelId:targetId});
    await put('channels/'+sourceId+'/broadcast-state',{mode:'standby',activeItemId:''});
    await updateChannel(sourceId,{status:'active',description:'경매 종료 · 결제·배송 진행',features:{...freshSource.channel.features,auction:false,broadcast:false,quiz:false,sponsors:false,scoreboards:false,ranking:false,tournament:false}});
    const result=await get('channels/'+targetId+'/workspace');
    assertEmptyTarget(result);
    if((await get('active-channel')).channelId!==targetId)throw Error('Active channel verification failed');
    return {prepared:true,targetId,channel:result.channel,sourceId,items:result.items.length,vendors:result.vendors.length,mode:result.broadcast.mode};
}
module.exports={buildNextAuction,prepareNextAuction,assertClosedLiveState,assertEmptyTarget};
