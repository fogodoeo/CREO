'use strict';
const {CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand,
    CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand,
    GetObjectCommand, DeleteObjectCommand} = require('@aws-sdk/client-s3');
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');

// This adapter never accepts a caller-supplied object path or touches auction media.
function createDriveStorage(r2) {
    if (!r2) return null;
    const input = id => ({Bucket:r2.bucket, Key:`operator-drive/objects/${id}`});
    const send = command => r2.client.send(command, {abortSignal:AbortSignal.timeout(60000)});
    return {
        async begin(id) { return (await send(new CreateMultipartUploadCommand({...input(id), ContentType:'application/octet-stream', CacheControl:'private, no-store'}))).UploadId; },
        async part(id, uploadId, number, bytes) { await send(new UploadPartCommand({...input(id), UploadId:uploadId, PartNumber:number, Body:bytes})); },
        async head(id) {
            try { return Number((await send(new HeadObjectCommand(input(id)))).ContentLength); }
            catch(e) { if(e.$metadata?.httpStatusCode===404) return null; throw e; }
        },
        async complete(id, uploadId, size, chunkSize) {
            const parts=[];let marker;
            do {
                const page=await send(new ListPartsCommand({...input(id), UploadId:uploadId, PartNumberMarker:marker}));
                parts.push(...(page.Parts||[]));marker=page.IsTruncated?page.NextPartNumberMarker:undefined;
            } while(marker);
            if(parts.length!==Math.ceil(size/chunkSize)||parts.some((p,i)=>p.PartNumber!==i+1||p.Size!==Math.min(chunkSize,size-i*chunkSize))) {
                throw Object.assign(Error('파일 전송이 끝나지 않았습니다. 다시 업로드해 주세요.'),{status:409});
            }
            await send(new CompleteMultipartUploadCommand({...input(id), UploadId:uploadId, MultipartUpload:{Parts:parts.map(({ETag,PartNumber})=>({ETag,PartNumber}))}}));
        },
        async abort(id, uploadId) {
            try { await send(new AbortMultipartUploadCommand({...input(id),UploadId:uploadId})); }
            catch(e) { if(e.name!=='NoSuchUpload'&&e.$metadata?.httpStatusCode!==404)throw e; }
        },
        async remove(id) { await send(new DeleteObjectCommand(input(id))); },
        async url(file, preview=false) {
            const safe = /^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg))$/.test(file.mime);
            const encoded=encodeURIComponent(file.name).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
            return getSignedUrl(r2.client,new GetObjectCommand({...input(file.id),
                ResponseContentType:preview&&safe?file.mime:'application/octet-stream',
                ResponseContentDisposition:`${preview&&safe?'inline':'attachment'}; filename="download"; filename*=UTF-8''${encoded}`,
                ResponseCacheControl:'private, no-store'}),{expiresIn:300});
        }
    };
}
module.exports={createDriveStorage};
