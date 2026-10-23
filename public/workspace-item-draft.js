(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CreoWorkspaceItemDraft=api;})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    const numeric=['lotNumber','startPrice','soldPrice','points'];
    const keys=['lotNumber','name','vendorId','groupId','category','startPrice','soldPrice','points','winnerName','winnerAlias','status','photoUrl','note'];
    const text=value=>String(value??'');
    function initial(record,context){
        const row=record||{},values=Object.fromEntries(keys.map(key=>[key,text(row[key])]));
        values.status=row.status||'waiting';
        if(!record)values.lotNumber=text(Math.max(0,...context.items.map(i=>Number(i.lotNumber)||0))+1);
        values.auctionKind=row.attributes?.auctionKind==='event'?'event':'normal';
        values.broadcastDate=row.attributes?.broadcastDate||context.round?.date||context.channel?.nationalRound?.date||context.channel?.shippingDefaults?.deliverySchedule?.auctionDate||context.channel?.shippingSupport?.broadcastDate||new Date(Date.now()+9*3600000).toISOString().slice(0,10);
        return values;
    }
    function validate(values,context){
        if(!text(values.name).trim())return {field:'name',message:'개체 번호나 이름을 입력해 주세요.'};
        if(!Number.isSafeInteger(Number(values.lotNumber))||Number(values.lotNumber)<1)return {field:'lotNumber',message:'진행 순서는 1 이상의 정수로 입력해 주세요.'};
        for(const key of ['startPrice','soldPrice'])if(!Number.isSafeInteger(Number(values[key]||0))||Number(values[key]||0)<0)return {field:key,message:'금액은 0 이상의 원 단위 숫자로 입력해 주세요.'};
        if(!Number.isFinite(Number(values.points||0)))return {field:'points',message:'포인트를 숫자로 입력해 주세요.'};
        if(context.channel?.vendorSettlement?.enabled&&values.auctionKind==='event'&&!/^E\d{2,}$/.test(text(values.name).trim()))return {field:'name',message:'이벤트 개체 번호는 E01처럼 입력해 주세요.'};
        return null;
    }
    function payload(record,values,context){
        const result={...(record||{})};
        for(const key of keys){
            if(key==='vendorId'&&!context.channel?.features?.vendors)continue;
            if(key==='groupId'&&!context.channel?.features?.groups)continue;
            result[key]=numeric.includes(key)?Number(values[key]||0):text(values[key]);
        }
        if(context.channel?.vendorSettlement?.enabled)result.attributes={...record?.attributes,auctionKind:values.auctionKind==='event'?'event':'normal',broadcastDate:values.broadcastDate,displayNumber:values.name};
        return result;
    }
    function create({write,scope,onChange=()=>{},onSaved=()=>{},onError=()=>{},makeId=()=>crypto.randomUUID().replace(/-/g,'')}){
        let context=null,record=null,baseline='',pending=null,unresolved=null,createId='';
        const busy=()=>Boolean(pending);
        const dirty=values=>Boolean(context)&&JSON.stringify(values)!==baseline;
        function open(row,next){if(pending)return null;context=structuredClone(next);record=row?structuredClone(row):null;unresolved=null;createId='item_'+makeId();const values=initial(record,context);baseline=JSON.stringify(values);return values;}
        function save(input){
            if(pending)return pending;
            if(!context||scope()!==context.channelId){onError(new Error('방송일이 바뀌었습니다. 원래 방송일에서 다시 열어 주세요.'));return Promise.resolve(false);}
            const values=structuredClone(input),invalid=validate(values,context);if(invalid){onError(Object.assign(new Error(invalid.message),invalid));return Promise.resolve(false);}
            pending=Promise.resolve().then(async()=>{
                try{
                    // Resolve an uncertain previous response before applying any newly edited input.
                    if(unresolved){const previous=unresolved;const result=await write(context.channelId,previous.method,previous.body);if(!result?.record?.id)throw Error('저장 결과를 확인하지 못했어요. 다시 저장해 주세요.');record=result.record;unresolved=null;if(JSON.stringify(values)===previous.signature){baseline=JSON.stringify(values);await onSaved(record);return true;}}
                    if(scope()!==context.channelId)throw Error('방송일이 바뀌었습니다. 원래 방송일에서 다시 열어 주세요.');
                    const next=payload(record,values,context);next.id=record?.id||createId;
                    unresolved={signature:JSON.stringify(values),method:record?'PUT':'POST',body:{record:next,expectedUpdatedAt:record?.updatedAt,expectedRoundDate:context.round?.date||context.channel?.nationalRound?.date||context.channel?.shippingDefaults?.deliverySchedule?.auctionDate||'',editorRequestId:'editor_'+makeId()}};
                    const result=await write(context.channelId,unresolved.method,unresolved.body);
                    if(!result?.record?.id)throw Error('저장 결과를 확인하지 못했어요. 다시 저장해 주세요.');
                    record=result.record;unresolved=null;baseline=JSON.stringify(values);await onSaved(record);return true;
                }catch(error){if(error.status>=400&&error.status<500)unresolved=null;onError(error);return false;}
                finally{pending=null;onChange(false);}
            });
            onChange(true);return pending;
        }
        return {open,save,busy,dirty,uncertain:()=>Boolean(unresolved)};
    }
    return {initial,validate,payload,create};
});
