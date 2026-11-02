'use strict';
const crypto = require('node:crypto');
const STORAGE = 'shared-banners';
const bannerId = url => 'banner_' + crypto.createHash('sha256').update(String(url)).digest('hex').slice(0,24);
function createSharedBannerLibrary(repository) {
    async function list(includeArchived=false) { return (await repository.listRecords(STORAGE,'asset')).filter(row=>row.kind==='banner'&&(includeArchived||!row.archived)).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.name.localeCompare(b.name,'ko')); }
    async function save(input) {
        const imageUrl=String(input.imageUrl||'').trim();
        if(!/^(https?:\/\/|\/[^/]|assets\/)/i.test(imageUrl)||imageUrl.length>600)throw Object.assign(new Error('올바른 이미지·영상 주소가 필요합니다.'),{status:422});
        const id=bannerId(imageUrl),current=await repository.getRecord(STORAGE,'asset',id);
        if(current?.archived)throw Object.assign(new Error('정리된 배너입니다. 복원한 뒤 수정해 주세요.'),{status:409});
        return repository.upsertRecord(STORAGE,'asset',{...current,id,kind:'banner',page:'all',name:String(input.name||'공용 배너').trim().slice(0,80),imageUrl,sortOrder:Math.max(0,Number(input.sortOrder)||0),active:true});
    }
    async function archive(id,archived) {
        const current=await repository.getRecord(STORAGE,'asset',id);
        if(!current||current.kind!=='banner')throw Object.assign(new Error('배너를 찾을 수 없습니다.'),{status:404});
        if(Boolean(current.archived)===archived)return current;
        return repository.upsertRecord(STORAGE,'asset',{...current,archived,archivedAt:archived?new Date().toISOString():null});
    }
    async function importExisting(channels) {
        const existing=new Map((await list(true)).map(row=>[row.id,row])),selections=[];
        for(const channel of channels){
            const assets=await repository.listRecords(channel.id,'asset');
            const state=await repository.getRecord(channel.id,'broadcast','state')||{};
            const config=await repository.getRecord(channel.id,'setting','broadcast-config');
            const candidates=assets.filter(row=>row.kind==='banner');
            for(const key of ['page1BannerUrl','page2BannerUrl'])if(state[key])candidates.push({imageUrl:state[key],name:channel.name+' 배너',active:true});
            for(let i=1;i<=10;i++)if(config?.values?.['banner'+i])candidates.push({imageUrl:config.values['banner'+i],name:channel.name+' 배너 '+i,active:true});
            const selected=new Set();
            for(const row of candidates){
                if(!row.imageUrl)continue;
                const id=bannerId(row.imageUrl);
                if(!existing.has(id)){const saved=await save(row);existing.set(id,saved)}
                if(!existing.get(id).archived&&row.active!==false&&row.page!=='3')selected.add(id);
            }
            selections.push({channelId:channel.id,ids:[...selected]});
        }
        return selections;
    }
    async function selected(state) {
        const ids=new Set(state?.selectedBannerIds||[]);
        if(!ids.size)return [];
        return (await list()).filter(row=>ids.has(row.id)&&row.active!==false);
    }
    return {list,save,archive,importExisting,selected};
}
module.exports={createSharedBannerLibrary,bannerId};
