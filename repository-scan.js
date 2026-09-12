'use strict';
function scanOptions(prefix,{after='',limit=250}={}){
 if(typeof prefix!=='string'||!/^[A-Za-z0-9:_-]{1,120}$/.test(prefix))throw new Error('Invalid scan prefix');
 if(typeof after!=='string'||(after&&(!after.startsWith(prefix)||after.length>512)))throw new Error('Invalid scan cursor');
 if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw new Error('Invalid scan limit');
 return {prefix,after,limit,upper:prefix+'\uffff'};
}
function pageRows(rows,limit){return {rows:rows.slice(0,limit),nextCursor:rows.length>limit?rows[limit-1].key:null};}
module.exports={scanOptions,pageRows};
