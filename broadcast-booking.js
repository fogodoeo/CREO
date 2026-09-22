'use strict';

const crypto = require('node:crypto');
const { channelKey } = require('./platform-core');
const CHANNEL_ID = 'national-cre';
const REGIONS = Object.freeze(['서울','인천','경기북부·강원','경기남부','충청','전라·제주','대구·경북','부산·울산·경남']);
const DAY = 86400000, HOUR = 3600000;
const enabled = channel => channel?.id === CHANNEL_ID && channel.dataAdapter === 'platform';
const keyFor = channelId => channelKey(channelId, 'setting', 'broadcast-bookings');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const day = value => new Date(Number(value) + 9 * HOUR).toISOString().slice(0,10);
const start = date => Date.parse(date + 'T20:00:00+09:00');
const addDays = (date, n) => day(Date.parse(date + 'T00:00:00+09:00') + n * DAY);
const scheduled = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(start(date)) && day(start(date)) === date && [1,3].includes(new Date(date + 'T00:00:00Z').getUTCDay());
const countBits = n => { let count=0; for(;n;n&=n-1)count++; return count; };
const activeProposal = (p, now) => p?.status === 'pending' && Date.parse(p.expiresAt) > now;
const empty = () => ({schema:1,version:0,defaults:{maxQuantity:128,closeHours:72,entryHours:24,selfHours:72,responseHours:24},sessions:{},regions:{},reservations:[],proposals:[],requests:[],audit:[]});

function session(state, date) {
    const d = state.defaults, at = start(date);
    return {date,startsAt:new Date(at).toISOString(),maxQuantity:d.maxQuantity,
        closesAt:new Date(at-d.closeHours*HOUR).toISOString(),entriesDueAt:new Date(at-d.entryHours*HOUR).toISOString(),
        selfUntil:new Date(at-d.selfHours*HOUR).toISOString(),responseHours:d.responseHours,paused:false,...state.sessions[date]};
}
function usage(state, date, now) {
    const quantities = Array(8).fill(0), confirmed = Array(8).fill(0);
    for(const r of state.reservations) if(r.status==='confirmed'&&r.date===date) confirmed[r.region]+=r.quantity;
    for(let i=0;i<8;i++)quantities[i]=confirmed[i];
    for(const p of state.proposals) if(activeProposal(p,now)&&p.date===date) {
        const original=state.reservations.find(r=>r.id===p.reservationId&&r.status==='confirmed');
        if(original) quantities[original.region]+=p.date===original.date?Math.max(0,p.quantity-original.quantity):p.quantity;
    }
    return {quantities,confirmed,total:quantities.reduce((a,b)=>a+b,0),confirmedTotal:confirmed.reduce((a,b)=>a+b,0),mask:quantities.reduce((mask,q,i)=>mask|(q?1<<i:0),0)};
}
function timeline(state, now) {
    const today=day(now); let from=addDays(today,-7), to=addDays(today,21);
    const future=state.reservations.filter(r=>r.status==='confirmed').map(r=>r.date)
        .concat(state.proposals.filter(p=>activeProposal(p,now)).map(p=>p.date),Object.keys(state.sessions));
    for(const date of future)if(date>to)to=addDays(date,7);
    const dates=[];
    for(let date=from;date<=to;date=addDays(date,1))if(scheduled(date))dates.push(date);
    // Last actual scheduled broadcast supplies the historical boundary. Pausing
    // intake does not remove a broadcast from the adjacency sequence.
    const previous=dates.filter(date=>start(date)<now).at(-1);
    return dates.filter(date=>date===previous||start(date)>=now);
}
function feasible(state, now) {
    let reachable=[0];
    for(const date of timeline(state,now)) {
        const s=session(state,date), u=usage(state,date,now);
        if(u.quantities.some(q=>q>16)||u.total>s.maxQuantity)return false;
        const masks=[];
        for(let mask=0;mask<256;mask++) {
            if((mask&u.mask)!==u.mask)continue;
            if(start(date)<now) { if(mask===u.mask)masks.push(mask); }
            else if(Math.min(s.maxQuantity,16*countBits(mask))>=32)masks.push(mask);
        }
        reachable=masks.filter(mask=>reachable.some(previous=>(previous&mask)===0));
        if(!reachable.length)return false;
    }
    return true;
}
function availability(state, date, region, now, vendorId) {
    if(!scheduled(date))return {date,maxQuantityAvailable:0,reason:'월·수요일 방송일을 선택해 주세요'};
    const s=session(state,date), u=usage(state,date,now);
    const blocked=reason=>({...s,maxQuantityAvailable:0,reason});
    if(!scheduled(date)||date<day(now)||date>addDays(day(now),14))return blocked('예약 공개 기간이 아닙니다');
    if(s.paused)return blocked('운영자가 예약 접수를 닫았습니다');
    if(now>=Date.parse(s.closesAt))return blocked('예약이 마감되었습니다');
    if(!Number.isInteger(region)||region<0||region>7)return blocked('업체 지역 등록이 필요합니다');
    if(state.reservations.some(r=>r.vendorId===vendorId&&r.date===date&&r.status==='confirmed'))return blocked('이미 예약한 방송입니다');
    const dates=timeline(state,now), index=dates.indexOf(date);
    if([dates[index-1],dates[index+1]].filter(Boolean).some(d=>usage(state,d,now).mask&(1<<region)))return blocked('앞뒤 방송에 같은 지역이 참여합니다');
    const maximum=Math.min(8,16-u.quantities[region],s.maxQuantity-u.total);
    if(maximum<=0)return blocked(u.quantities[region]>=16?'지역별 16마리가 모두 예약되었습니다':'방송 정원이 모두 예약되었습니다');
    const candidate=structuredClone(state);
    candidate.reservations.push({id:'probe',vendorId,date,region,quantity:maximum,status:'confirmed'});
    if(!feasible(candidate,now))return blocked('앞뒤 방송의 모집 여력을 남겨야 합니다');
    return {...s,maxQuantityAvailable:maximum,reason:''};
}
function createBroadcastBooking(repository, {now=Date.now, notificationService=null, entriesFor=async()=>[]}={}) {
    async function read(channel) {
        if(!enabled(channel))throw fail('전국크레자랑에서만 방송을 예약할 수 있습니다.',404);
        const rows=await repository.getRowsByKeys([keyFor(channel.id)]),raw=rows[0]?.value??null;
        if(raw===null&&repository.mirror&&repository.lastMirrorError)throw fail('예약 원본을 확인하지 못했습니다. 연결을 복구한 뒤 다시 시도해 주세요.',503);
        let state;
        try {state=raw===null?empty():JSON.parse(raw);}catch{throw fail('예약 자료를 읽지 못했습니다. 운영자에게 문의해 주세요.',503);}
        if(state.schema!==1||!Array.isArray(state.reservations)||!Array.isArray(state.proposals)||!Array.isArray(state.requests))throw fail('예약 자료를 확인할 수 없습니다. 운영자에게 문의해 주세요.',503);
        return {state,raw};
    }
    function requireLive(channel) {if(!['draft','active'].includes(channel.status))throw fail('현재 예약을 변경할 수 없습니다. 운영자에게 문의해 주세요.');}
    function quantity(value) {if(!Number.isInteger(value)||value<1||value>8)throw fail('출품 수량은 1~8마리로 입력해 주세요.',422);return value;}
    function validDate(date) {if(!scheduled(date)||date<day(now())||date>addDays(day(now()),90))throw fail('앞으로 90일 이내의 월·수요일을 선택해 주세요.',422);}
    function version(record,input) {if(record.version!==input.expectedVersion)throw fail('다른 화면에서 예약이 변경되었습니다. 새로고침 후 다시 확인해 주세요.');}
    function expire(state) {for(const p of state.proposals)if(p.status==='pending'&&!activeProposal(p,now()))p.status='expired';}
    function summaryState(state,vendorId) {return {enabled:true,pendingCount:state.proposals.filter(p=>activeProposal(p,now())&&state.reservations.some(r=>r.id===p.reservationId&&r.vendorId===vendorId&&r.status==='confirmed')).length};}
    async function summary(context) {if(!enabled(context.channel))return {enabled:false,pendingCount:0};return summaryState((await read(context.channel)).state,context.vendor.id);}
    function safeReservation(state,r) {
        const proposal=state.proposals.find(p=>p.reservationId===r.id&&activeProposal(p,now()));
        const history=state.audit.filter(a=>a.reservationId===r.id).concat(state.proposals.filter(p=>p.reservationId===r.id&&((p.status==='pending'&&!activeProposal(p,now()))||p.status==='expired')).map(p=>({action:'응답 기한 만료 · 기존 예약 유지',date:r.date,quantity:r.quantity,at:p.expiresAt}))).sort((a,b)=>a.at.localeCompare(b.at));
        const {linkCode,...safe}=r;
        return {...safe,session:session(state,r.date),proposal:proposal||null,history,
            canCancel:r.status==='confirmed'&&now()<Date.parse(session(state,r.date).selfUntil),
            canChange:r.status==='confirmed'&&!proposal&&now()<Date.parse(session(state,r.date).selfUntil)};
    }
    async function vendorView(context) {
        const {state}=await read(context.channel),region=state.regions[context.vendor.id]??context.vendor.bookingRegion;
        const dates=[];for(let date=day(now());date<=addDays(day(now()),14);date=addDays(date,1))if(scheduled(date))dates.push(availability(state,date,region,now(),context.vendor.id));
        const entries=await entriesFor(context);
        return {version:state.version,now:new Date(now()).toISOString(),channel:{id:context.channel.id,name:context.channel.name},vendor:{id:context.vendor.id,name:context.vendor.name,region:Number.isInteger(region)?REGIONS[region]:''},
            ...summaryState(state,context.vendor.id),dates,reservations:state.reservations.filter(r=>r.vendorId===context.vendor.id).map(r=>{
                const candidate=structuredClone(state);candidate.reservations=candidate.reservations.filter(x=>x.id!==r.id);
                return {...safeReservation(state,r),changeDates:dates.map(d=>availability(candidate,d.date,r.region,now(),r.vendorId))};
            }),
            entries:entries.map(e=>({id:e.id,code:e.code,morph:e.morph,status:e.status})),regions:REGIONS};
    }
    async function operatorView(channel,vendors) {
        const {state}=await read(channel),dates=[...new Set(timeline(state,now()).filter(d=>d>=day(now())).concat(state.reservations.map(r=>r.date)))].sort();
        const notifications=await repository.listRecords(channel.id,'notification');
        return {version:state.version,now:new Date(now()).toISOString(),channel:{id:channel.id,name:channel.name},defaults:state.defaults,regions:REGIONS,
            vendors:vendors.map(v=>({id:v.id,name:v.name,region:state.regions[v.id]??v.bookingRegion??null})),
            sessions:dates.map(date=>{
                const s=session(state,date),u=usage(state,date,now());
                return {...s,confirmedQuantity:u.confirmedTotal,heldQuantity:u.total-u.confirmedTotal,shortfall:Math.max(0,32-u.confirmedTotal),
                    regions:REGIONS.map((name,i)=>({name,confirmed:u.confirmed[i],held:u.quantities[i]-u.confirmed[i],available:availability(state,date,i,now(),'operator-probe').maxQuantityAvailable})),
                    reservations:state.reservations.filter(r=>r.date===date).map(r=>({...safeReservation(state,r),vendorName:vendors.find(v=>v.id===r.vendorId)?.name||r.vendorName,regionName:REGIONS[r.region],notificationStatus:notifications.filter(n=>n.eventKey?.startsWith('booking:'+r.id+':')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]?.status||'none'})),
                    incoming:state.proposals.filter(p=>p.date===date&&activeProposal(p,now())&&state.reservations.some(r=>r.id===p.reservationId&&r.date!==date)).map(p=>({...p,vendorName:state.reservations.find(r=>r.id===p.reservationId)?.vendorName}))};})};
    }
    async function command(context,input,{operator=false}={}) {
        requireLive(context.channel);
        if(!operator&&context.vendor?.active===false)throw fail('참여가 중지된 업체입니다. 운영자에게 문의해 주세요.',403);
        if(!repository.compareAndSwapRows)throw fail('예약 저장소 설정을 확인해 주세요. 현재 예약을 받지 않습니다.',503);
        const {state,raw}=await read(context.channel), time=now();
        const requestId=String(input.requestId||'');if(!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId))throw fail('요청을 다시 열어 주세요.',422);
        const payload={...input};delete payload.requestId;delete payload.code;delete payload.token;
        const signature=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        const requestKey=(operator?'operator':context.vendor.id)+':'+requestId;
        const previous=state.requests.find(r=>r.key===requestKey);
        if(previous){if(previous.signature!==signature)throw fail('같은 요청의 내용이 달라졌습니다. 새로고침 후 다시 시도해 주세요.');return {duplicate:true,result:previous.result};}
        expire(state);
        const type=String(input.type||'');
        const allowed=operator?['session','defaults','region','propose','cancel']:['reserve','change','cancel','respond','entries'];
        if(!allowed.includes(type))throw fail('이 작업을 실행할 권한이 없습니다.',403);
        let r=null, action='',result='',proposal=null;
        if(['session','defaults','region'].includes(type)) {
            if(state.version!==input.expectedVersion)throw fail('설정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.');
            if(type==='region') {
                if(!context.vendors.some(v=>v.id===input.vendorId)||!Number.isInteger(input.region)||input.region<0||input.region>7)throw fail('업체와 지역을 선택해 주세요.',422);
                if(state.reservations.some(r=>r.vendorId===input.vendorId&&r.status==='confirmed'&&start(r.date)>=time&&r.region!==input.region))throw fail('기존 예약의 지역과 다릅니다. 예약을 정리한 뒤 지역을 변경해 주세요.');
                state.regions[input.vendorId]=input.region;
            } else if(type==='defaults') {
                const d=input.defaults||{};
                for(const k of ['maxQuantity','closeHours','entryHours','selfHours','responseHours'])if(!Number.isInteger(d[k])||d[k]<(k==='maxQuantity'?32:k==='responseHours'?1:0)||d[k]>(k==='maxQuantity'?128:336))throw fail('기본 수량은 32~128마리, 기한은 0~336시간으로 입력해 주세요.',422);
                // Freeze existing broadcasts before changing future defaults.
                for(const date of timeline(state,time))state.sessions[date]=session(state,date);
                state.defaults={...d};
            } else {
                validDate(input.date);const s=session(state,input.date),v=input.settings||{};
                if(!Number.isInteger(v.maxQuantity)||v.maxQuantity<32||v.maxQuantity>128)throw fail('방송 최대 수량은 32~128마리로 입력해 주세요.',422);
                for(const k of ['closesAt','entriesDueAt','selfUntil'])if(!Number.isFinite(Date.parse(v[k]))||Date.parse(v[k])>start(input.date))throw fail('마감 일시는 방송 시작 이전으로 입력해 주세요.',422);
                if(!Number.isInteger(v.responseHours)||v.responseHours<1||v.responseHours>336)throw fail('응답 기한은 1~336시간으로 입력해 주세요.',422);
                state.sessions[input.date]={...s,...Object.fromEntries(['maxQuantity','closesAt','entriesDueAt','selfUntil','responseHours'].map(k=>[k,v[k]])),paused:v.paused===true};
                if(!feasible(state,time))throw fail('기존 예약·임시 확보 또는 인접 방송과 충돌합니다. 수량을 다시 확인해 주세요.');
            }
            result=type;
        } else if(type==='reserve') {
            const region=state.regions[context.vendor.id]??context.vendor.bookingRegion, q=quantity(input.quantity);
            const available=availability(state,input.date,region,time,context.vendor.id);
            if(q>available.maxQuantityAvailable)throw fail(available.reason||`현재 최대 ${available.maxQuantityAvailable}마리까지 신청할 수 있습니다. 다시 선택해 주세요.`);
            if(!/^0\d{9,10}$/.test(String(context.vendor.phone||'').replace(/\D/g,'')))throw fail('업체 정보에서 연락처를 먼저 등록해 주세요.',422);
            r={id:crypto.randomUUID(),vendorId:context.vendor.id,vendorName:context.vendor.name,region,date:input.date,quantity:q,status:'confirmed',version:1,entryIds:[],linkCode:crypto.randomBytes(18).toString('base64url'),createdAt:new Date(time).toISOString()};
            state.reservations.push(r);action='예약 확정';
        } else {
            r=state.reservations.find(r=>r.id===input.id&&(operator||r.vendorId===context.vendor.id));
            if(!r)throw fail('예약을 찾을 수 없습니다. 예약 목록을 다시 열어 주세요.',404);
            version(r,input);
            if(r.status!=='confirmed'||start(r.date)<=time)throw fail('종료되거나 취소된 예약은 변경할 수 없습니다.');
            const pending=state.proposals.find(p=>p.reservationId===r.id&&activeProposal(p,time));
            if(type==='cancel') {
                if(!operator&&time>=Date.parse(session(state,r.date).selfUntil))throw fail('직접 취소 기한이 지났습니다. 운영자에게 문의해 주세요.');
                r.status='cancelled';if(pending)pending.status='cancelled';action='예약 취소';
            } else if(type==='propose') {
                if(pending)throw fail('응답을 기다리는 변경 요청이 있습니다. 먼저 기존 요청을 처리해 주세요.');
                validDate(input.date);quantity(input.quantity);
                if(input.quantity<r.entryIds.length)throw fail('선택한 개체보다 적은 수량은 제안할 수 없습니다. 업체가 개체 선택을 조정한 뒤 다시 제안해 주세요.');
                if(r.date===input.date&&r.quantity===input.quantity)throw fail('기존 예약과 다른 내용을 입력해 주세요.',422);
                const expiry=Date.parse(input.expiresAt);
                if(!Number.isFinite(expiry)||expiry<=time||expiry>=Math.min(start(r.date),start(input.date)))throw fail('응답 기한은 현재 이후, 두 방송 시작 이전으로 입력해 주세요.',422);
                if(state.reservations.some(x=>x.id!==r.id&&x.vendorId===r.vendorId&&x.date===input.date&&x.status==='confirmed'))throw fail('이 업체가 이미 예약한 방송입니다.');
                proposal={id:crypto.randomUUID(),reservationId:r.id,date:input.date,quantity:input.quantity,expiresAt:new Date(expiry).toISOString(),status:'pending'};
                state.proposals.push(proposal);
                if(!feasible(state,time))throw fail('변경할 자리를 확보할 수 없습니다. 지역 한도와 앞뒤 방송을 확인해 주세요.');
                action='변경 제안';
            } else if(type==='respond') {
                if(!pending||pending.id!==input.proposalId)throw fail('변경 요청이 만료되었거나 이미 처리되었습니다. 기존 예약을 확인해 주세요.');
                if(!['accept','reject'].includes(input.response))throw fail('수락 또는 거절을 선택해 주세요.',422);
                pending.status=input.response==='accept'?'accepted':'rejected';
                if(input.response==='accept') {
                    if(r.entryIds.length>pending.quantity)throw fail('등록한 개체가 제안 수량보다 많습니다. 개체 선택을 조정한 뒤 수락해 주세요.');
                    r.date=pending.date;r.quantity=pending.quantity;
                    if(!feasible(state,time))throw fail('변경 조건이 달라졌습니다. 기존 예약을 유지합니다. 운영자에게 문의해 주세요.');
                    action='변경 확정';
                } else action='변경 거절';
            } else if(type==='change') {
                if(pending)throw fail('진행 중인 변경 요청에 먼저 응답해 주세요.');
                if(time>=Date.parse(session(state,r.date).selfUntil))throw fail('직접 변경 기한이 지났습니다. 운영자에게 문의해 주세요.');
                quantity(input.quantity);
                const candidate=structuredClone(state);candidate.reservations=candidate.reservations.filter(x=>x.id!==r.id);
                const a=availability(candidate,input.date,r.region,time,r.vendorId);
                if(input.quantity>a.maxQuantityAvailable)throw fail(a.reason||`현재 최대 ${a.maxQuantityAvailable}마리까지 신청할 수 있습니다.`);
                if(input.quantity<r.entryIds.length)throw fail('출품 수량보다 많은 개체가 선택되어 있습니다. 개체 선택을 먼저 조정해 주세요.');
                r.date=input.date;r.quantity=input.quantity;action='변경 확정';
            } else if(type==='entries') {
                if(time>=Date.parse(session(state,r.date).entriesDueAt))throw fail('개체 등록 기한이 지났습니다. 운영자에게 문의해 주세요.');
                const ids=input.entryIds;
                if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.length>r.quantity)throw fail('예약 수량 이내로 개체를 선택해 주세요.',422);
                const own=await entriesFor(context);
                if(ids.some(id=>!own.some(e=>e.id===id&&e.status!=='deleted')))throw fail('출품 개체 목록을 새로고침한 뒤 다시 선택해 주세요.');
                if(state.reservations.some(x=>x.id!==r.id&&x.status==='confirmed'&&start(x.date)>=time&&x.entryIds.some(id=>ids.includes(id))))throw fail('다른 방송에 선택한 개체가 포함되어 있습니다.');
                r.entryIds=ids;action='개체 선택';
            }
            r.version++;
        }
        const rows=[];
        if(r) {
            r.updatedAt=new Date(time).toISOString();result=r.id;
            state.audit.push({reservationId:r.id,action,date:r.date,quantity:r.quantity,at:r.updatedAt,actor:operator?'operator':'vendor',...(proposal?{proposal:{date:proposal.date,quantity:proposal.quantity,expiresAt:proposal.expiresAt}}:{})});
            if(['예약 확정','변경 제안','변경 확정','예약 취소'].includes(action)) {
                r.noticeVersion=r.version;
                const vendor=operator?context.vendors.find(v=>v.id===r.vendorId):context.vendor;
                if(!notificationService?.prepare)throw fail('예약 알림 저장소를 연결한 뒤 다시 시도해 주세요.',503);
                const notice=await notificationService.prepare(context.channel.id,{templateKey:'broadcast_booking_updated',eventKey:`booking:${r.id}:${r.version}`,recipientRole:'vendor',recipientPhone:vendor?.phone,transport:'alimtalk',allowSmsFallback:false,failureSmsFallback:false,
                    variables:{업체명:vendor?.name||r.vendorName,예약상태:action,방송일시:`${r.date} 오후 8시`,수량:String(r.quantity),예약접속코드:r.linkCode}});
                if(proposal)notice.record.expiresAt=proposal.expiresAt;
                rows.push({key:channelKey(context.channel.id,'notification',notice.record.id),value:JSON.stringify(notice.record)});
            }
        }
        state.version++;state.requests.push({key:requestKey,signature,result});
        rows.unshift({key:keyFor(context.channel.id),value:JSON.stringify(state)});
        if(!await repository.compareAndSwapRows(keyFor(context.channel.id),raw,rows))throw fail('다른 예약이 먼저 반영되었습니다. 새로고침 후 다시 신청해 주세요.');
        return {duplicate:false,result};
    }
    async function resolveLink(channel,code) {
        if(!/^[A-Za-z0-9_-]{24}$/.test(code||''))return null;
        const {state}=await read(channel),r=state.reservations.find(r=>r.linkCode===code);
        // Links survive changes/cancellation long enough to explain the outcome.
        if(!r||now()>start(r.date)+30*DAY)return null;
        return {vendorId:r.vendorId,reservationId:r.id};
    }
    async function assertNotification(channel,notice) {
        const {state}=await read(channel),[,id,revision]=String(notice.eventKey).split(':');
        const r=state.reservations.find(r=>r.id===id);
        // Entry selection does not invalidate an otherwise current state notice.
        const latest=state.audit.filter(a=>a.reservationId===id&&['예약 확정','변경 제안','변경 확정','예약 취소','변경 거절'].includes(a.action)).at(-1);
        const action=notice.variables?.['#{예약상태}']||notice.variables?.예약상태;
        if(!r||Number(revision)!==r.noticeVersion||latest?.action!==action||(action==='변경 제안'&&!state.proposals.some(p=>p.reservationId===id&&activeProposal(p,now()))))throw Object.assign(fail('이전 예약 상태 알림을 중지했습니다.'),{code:'BUYER_LINK_INACTIVE'});
    }
    return {read,summary,vendorView,operatorView,command,resolveLink,assertNotification};
}
module.exports={CHANNEL_ID,REGIONS,enabled,createBroadcastBooking,feasible,availability,session,usage,timeline,day,start,addDays};
