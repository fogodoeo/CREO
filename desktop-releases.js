'use strict';
const {validId} = require('./operator-drive');
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const fail = (message, status=400) => Object.assign(Error(message), {status});

function validateRelease(value) {
    if (!value || !VERSION.test(value.version) || value.version.length > 40) throw fail('버전은 1.0.0 형식으로 입력해 주세요.');
    if (value.platform !== 'windows-x64' || value.schema !== 1 || value.dataSchema !== 1) throw fail('지원하는 Windows 배포 파일을 선택해 주세요.');
    if (!validId(value.fileId) || !/^[a-f0-9]{64}$/.test(value.sha256 || '')) throw fail('배포 명세의 파일 ID와 SHA-256을 확인해 주세요.');
    if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > 1024 ** 3) throw fail('설치 파일은 1GB 이하여야 합니다.');
    if (typeof value.notes !== 'string' || !value.notes.trim() || value.notes.length > 4000) throw fail('변경 내용을 4,000자 이내로 입력해 주세요.');
    return {schema:1, version:value.version, platform:value.platform, dataSchema:1, fileId:value.fileId,
        sha256:value.sha256, size:value.size, notes:value.notes.trim()};
}

class DesktopReleases {
    constructor(drive) { this.drive = drive; }
    async latest() {
        this.drive.ready();
        const {state} = await this.drive.read();
        const release = state.desktopReleases?.[state.desktopStable] || null;
        if (release) this.file(state, release);
        return {release};
    }
    file(state, release) {
        const file = this.drive.entry(state, release.fileId);
        if (file.kind !== 'file' || file.state !== 'ready' || file.trashRoot || file.size !== release.size
            || !/\.exe$/i.test(file.name)) throw fail('설치 파일을 찾을 수 없습니다. 파일함의 업로드 상태를 확인해 주세요.', 409);
        return file;
    }
    async publish(body) {
        const release = validateRelease(body);
        return this.drive.change(state => {
            const file = this.file(state, release);
            const releases = state.desktopReleases ||= {};
            const old = releases[release.version];
            if (old && ['sha256','size','fileId','dataSchema','platform'].some(k => old[k] !== release[k])) {
                throw fail('이미 배포한 버전은 교체할 수 없습니다. 새 버전 번호를 사용해 주세요.', 409);
            }
            if (state.desktopStable && compare(release.version, state.desktopStable) < 0) {
                throw fail('이전 버전을 최신판으로 지정할 수 없습니다. 수정된 새 버전을 배포해 주세요.', 409);
            }
            const record = old || {...release, fileName:file.name, publishedAt:this.drive.now()};
            releases[release.version] = record;
            state.desktopStable = release.version;
            return {release:record};
        });
    }
    async download(version) {
        this.drive.ready();
        const {state} = await this.drive.read();
        const release = state.desktopReleases?.[version];
        if (!release) throw fail('배포된 버전을 찾을 수 없습니다.', 404);
        const file = this.file(state, release);
        return {url:await this.drive.storage.url(file, false), expiresIn:300};
    }
}
function compare(a,b) {
    const x=a.split('.').map(Number), y=b.split('.').map(Number);
    for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]<y[i]?-1:1;
    return 0;
}
function createDesktopReleaseApi({drive,isAdmin,origin=process.env.PUBLIC_BASE_URL||'https://creok.onrender.com'}) {
    const releases = new DesktopReleases(drive);
    const reply = (res,status,value) => {
        res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
        res.end(JSON.stringify(value));
    };
    return async(req,res,url) => {
        if(!url.pathname.startsWith('/api/desktop-releases/')) return false;
        try {
            if(!await isAdmin(req)) throw fail('관리자 로그인이 필요합니다.',401);
            const route=url.pathname.slice('/api/desktop-releases/'.length);
            if(req.method==='GET' && route==='stable') reply(res,200,await releases.latest());
            else if(req.method==='GET' && /^\d+\.\d+\.\d+\/download$/.test(route)) reply(res,200,await releases.download(route.split('/')[0]));
            else if(req.method==='POST' && route==='publish') {
                if(req.headers['sec-fetch-site']==='cross-site' || req.headers.origin && req.headers.origin!==origin) throw fail('운영 페이지에서 다시 요청해 주세요.',403);
                if(String(req.headers['content-type']||'').split(';')[0]!=='application/json') throw fail('배포 명세 JSON을 사용해 주세요.',415);
                let bytes=0;const chunks=[];
                for await(const chunk of req) {bytes+=chunk.length;if(bytes>16384)throw fail('배포 명세가 너무 큽니다.',413);chunks.push(chunk);}
                let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('배포 명세를 다시 확인해 주세요.');}
                reply(res,200,await releases.publish(body));
            } else reply(res,404,{error:'배포 경로를 찾을 수 없습니다.'});
        } catch(error) {reply(res,error.status||503,{error:error.status?error.message:'버전을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'});}
        return true;
    };
}
module.exports={DesktopReleases,createDesktopReleaseApi,validateRelease,compare};
