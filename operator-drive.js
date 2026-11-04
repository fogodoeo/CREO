'use strict';
const {randomUUID} = require('node:crypto');
const KEY='creo_v2::operator_drive::index';
const CHUNK=8*1024*1024, MAX_FILE=20*1024*1024*1024, MAX_ENTRIES=20000;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const validId=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
function cleanName(value) {
    if(typeof value!=='string')throw fail('이름을 입력해 주세요.');
    const name=value.trim().normalize('NFC');
    if(!name||name.length>180||/[\\/\u0000-\u001f\u007f]/.test(name)||name==='.'||name==='..')throw fail('이름은 180자 이내이며 /, \\ 문자를 사용할 수 없습니다.');
    return name;
}
class OperatorDrive {
    constructor({repository,storage,now=()=>new Date().toISOString()}) {this.repo=repository;this.storage=storage;this.now=now;this.locks=new Map();this.activeParts=0;}
    ready() {if(!this.storage||!this.repo.compareAndSwapRows)throw fail('파일함 저장소가 연결되지 않았습니다. 관리자에게 확인해 주세요.',503);}
    async read() {
        const raw=(await this.repo.getRow(KEY))?.value??null;
        const state=raw===null?{version:1,entries:[],revision:0}:JSON.parse(raw);
        if(state.version!==1||!Array.isArray(state.entries))throw Error('Invalid drive index');
        return {raw,state};
    }
    async change(fn) {
        this.ready();
        for(let attempt=0;attempt<12;attempt++) {
            const {raw,state}=await this.read();const result=fn(state);
            state.revision++;const value=JSON.stringify(state);
            if(await this.repo.compareAndSwapRows(KEY,raw,[{key:KEY,value}]))return result;
        }
        throw fail('다른 작업이 저장 중입니다. 잠시 후 다시 시도해 주세요.',409);
    }
    async lock(id,fn) {
        const previous=this.locks.get(id)||Promise.resolve();
        const task=previous.catch(()=>{}).then(fn);this.locks.set(id,task);
        try{return await task;}finally{if(this.locks.get(id)===task)this.locks.delete(id);}
    }
    entry(state,id) {const e=state.entries.find(e=>e.id===id);if(!e)throw fail('파일 또는 폴더를 찾을 수 없습니다.',404);return e;}
    folder(state,id) {if(id===null)return;const e=this.entry(state,id);if(e.kind!=='folder'||e.trashRoot||e.state!=='ready')throw fail('이동할 폴더를 다시 선택해 주세요.',409);}
    unique(state,name,parent,except) {if(state.entries.some(e=>e.id!==except&&!e.trashRoot&&e.parent===parent&&e.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw fail('같은 이름이 있습니다. 이름을 바꿔 주세요.',409);}
    descendants(state,id) {
        const ids=new Set([id]);let added=true;
        while(added){added=false;for(const e of state.entries)if(ids.has(e.parent)&&!ids.has(e.id)){ids.add(e.id);added=true;}}
        return ids;
    }
    async list() {
        this.ready();const {state}=await this.read();
        return {entries:state.entries.map(({uploadId,...e})=>e),revision:state.revision,chunkSize:CHUNK,maxFileBytes:MAX_FILE,
            usedBytes:state.entries.filter(e=>e.kind==='file'&&e.state==='ready').reduce((n,e)=>n+e.size,0)};
    }
    async create(body,kind) {
        const id=body.id||randomUUID();if(!validId(id))throw fail('파일 식별자가 올바르지 않습니다.');
        const name=cleanName(body.name),parent=body.parent??null;
        const size=kind==='file'?body.size:0;
        if(kind==='file'&&(!Number.isSafeInteger(size)||size<1||size>MAX_FILE))throw fail('파일은 0바이트보다 크고 20GB 이하여야 합니다.',413);
        return this.lock(id,async()=>{
            await this.change(s=>{
                const old=s.entries.find(e=>e.id===id);
                if(old){if(old.name!==name||old.parent!==parent||old.size!==size||old.kind!==kind)throw fail('이미 사용한 파일 식별자입니다.',409);return;}
                if(s.entries.length>=MAX_ENTRIES)throw fail('파일함 항목 한도에 도달했습니다. 불필요한 항목을 정리해 주세요.',409);
                this.folder(s,parent);this.unique(s,name,parent);
                s.entries.push({id,name,parent,kind,size,mime:String(body.mime||'application/octet-stream').slice(0,100),state:kind==='file'?'uploading':'ready',revision:1,createdAt:this.now(),updatedAt:this.now()});
            });
            let entry=this.entry((await this.read()).state,id);
            if(kind==='file'&&entry.state==='uploading'&&!entry.uploadId) {
                const uploadId=await this.storage.begin(id);
                try{await this.change(s=>{const e=this.entry(s,id);e.uploadId=uploadId;});}
                catch(err){await this.storage.abort(id,uploadId).catch(()=>{});throw err;}
                entry=this.entry((await this.read()).state,id);
            }
            return {id,state:entry.state,chunkSize:CHUNK};
        });
    }
    async part(id,number,readBytes) {
        this.ready();
        if(this.activeParts>=2)throw fail('다른 파일이 전송 중입니다. 잠시 후 다시 시도해 주세요.',429);
        this.activeParts++;
        try{return await this.lock(id,async()=>{
            const e=this.entry((await this.read()).state,id);
            if(e.state!=='uploading'||!e.uploadId)throw fail('업로드 상태를 다시 확인해 주세요.',409);
            if(!Number.isSafeInteger(number)||number<1||number>Math.ceil(e.size/CHUNK))throw fail('잘못된 전송 순서입니다.');
            const bytes=await readBytes();if(bytes.length!==Math.min(CHUNK,e.size-(number-1)*CHUNK))throw fail('전송 크기가 다릅니다. 다시 시도해 주세요.');
            await this.storage.part(id,e.uploadId,number,bytes);return {ok:true};
        });}finally{this.activeParts--;}
    }
    async complete(id) {
        this.ready();return this.lock(id,async()=>{
            const e=this.entry((await this.read()).state,id);if(e.state==='ready')return {id};
            if(e.state!=='uploading'||!e.uploadId)throw fail('완료할 업로드가 없습니다.',409);
            if(await this.storage.head(id)!==e.size)await this.storage.complete(id,e.uploadId,e.size,CHUNK);
            if(await this.storage.head(id)!==e.size)throw fail('저장된 파일 크기를 확인할 수 없습니다. 다시 시도해 주세요.',502);
            await this.change(s=>{const row=this.entry(s,id);row.state='ready';delete row.uploadId;row.updatedAt=this.now();});return {id};
        });
    }
    async edit(id,body) {
        return this.change(s=>{
            const e=this.entry(s,id);if(e.trashRoot||e.state!=='ready')throw fail('정리할 수 있는 파일이 아닙니다.',409);
            if(body.revision!==e.revision)throw fail('다른 창에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.',409);
            const name=body.name===undefined?e.name:cleanName(body.name),parent=body.parent===undefined?e.parent:body.parent;
            this.folder(s,parent);if(this.descendants(s,id).has(parent))throw fail('자기 자신이나 하위 폴더로 이동할 수 없습니다.');
            this.unique(s,name,parent,id);e.name=name;e.parent=parent;e.revision++;e.updatedAt=this.now();return {id};
        });
    }
    async trash(id) {
        return this.change(s=>{
            const e=this.entry(s,id);if(e.trashRoot)return {id};
            const ids=this.descendants(s,id),rows=s.entries.filter(e=>ids.has(e.id)&&!e.trashRoot);
            if(rows.some(e=>e.state!=='ready'))throw fail('폴더 안에 미완료 업로드가 있습니다. 먼저 업로드를 완료하거나 취소해 주세요.',409);
            for(const row of rows){row.trashRoot=id;row.deletedAt=this.now();row.revision++;row.updatedAt=this.now();}return {id};
        });
    }
    async restore(id) {
        return this.change(s=>{
            const e=this.entry(s,id);if(!e.trashRoot)return {id};
            if(e.trashRoot!==id)throw fail('상위 폴더를 복원해 주세요.',409);
            const rows=s.entries.filter(r=>r.trashRoot===id);if(rows.some(r=>r.state!=='ready'))throw fail('영구 삭제 중인 파일은 복원할 수 없습니다.',409);
            if(e.parent&&!s.entries.some(r=>r.id===e.parent&&!r.trashRoot&&r.state==='ready'))e.parent=null;
            this.folder(s,e.parent);this.unique(s,e.name,e.parent,id);
            for(const row of rows){delete row.trashRoot;delete row.deletedAt;row.revision++;row.updatedAt=this.now();}return {id};
        });
    }
    async purge(id,cancel=false) {
        this.ready();return this.lock(id,async()=>{
            let rows;
            await this.change(s=>{
                const e=s.entries.find(e=>e.id===id);if(!e){rows=[];return;}
                if(cancel){if(!['uploading','canceling'].includes(e.state))throw fail('업로드가 이미 완료되었습니다. 목록을 새로고침해 주세요.',409);rows=[e];}
                else {if(e.trashRoot!==id)throw fail('휴지통 항목만 영구 삭제할 수 있습니다.',409);rows=s.entries.filter(r=>r.trashRoot===id);}
                rows.forEach(r=>{r.state=cancel?'canceling':'deleting';});rows=structuredClone(rows);
            });
            for(const row of rows)if(row.kind==='file') {
                if(row.uploadId)await this.storage.abort(row.id,row.uploadId);
                await this.storage.remove(row.id);
            }
            await this.change(s=>{const ids=new Set(rows.map(e=>e.id));s.entries=s.entries.filter(e=>!ids.has(e.id));});return {ok:true};
        });
    }
    async content(id,preview) {
        this.ready();const e=this.entry((await this.read()).state,id);
        if(e.kind!=='file'||e.state!=='ready'||e.trashRoot)throw fail('다운로드할 파일이 없습니다.',404);
        return this.storage.url(e,preview);
    }
}
module.exports={OperatorDrive,KEY,CHUNK,MAX_FILE,validId};
