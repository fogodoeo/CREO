'use strict';
function scanOptions(prefix,{after='',limit=250}={}){
 if(typeof prefix!=='string'||!/^[A-Za-z0-9:_-]{1,120}$/.test(prefix))throw new Error('Invalid scan prefix');
 if(typeof after!=='string'||(after&&(!after.startsWith(prefix)||after.length>512)))throw new Error('Invalid scan cursor');
 if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw new Error('Invalid scan limit');
 return {prefix,after,limit,upper:prefix+'\uffff'};
}
function pageRows(rows,limit){return {rows:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1].key:null};}
// The mirror uses its own database collation. A two-phase cursor prevents a
// binary SQLite boundary from skipping or replaying remote keys. No offsets or
// cached inventory snapshots are needed, so it also survives repository restart.
function mirrorCursor(prefix,phase,key=''){
 return 'scan1:'+Buffer.from(JSON.stringify([prefix,phase,key])).toString('base64url');
}
function readMirrorCursor(prefix,after=''){
 if(!after)return {phase:'local',key:''};
 if(typeof after!=='string'||!after.startsWith('scan1:')||after.length>1200)throw new Error('Invalid scan cursor');
 let value;try{value=JSON.parse(Buffer.from(after.slice(6),'base64url').toString('utf8'));}catch{throw new Error('Invalid scan cursor');}
 if(!Array.isArray(value)||value.length!==3||value[0]!==prefix||!['local','remote'].includes(value[1]))throw new Error('Invalid scan cursor');
 scanOptions(prefix,{after:value[2]});
 return {phase:value[1],key:value[2]};
}
module.exports={scanOptions,pageRows,mirrorCursor,readMirrorCursor};
