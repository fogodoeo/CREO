(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CreoMobilePhone=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Keep this policy in sync with the desktop mobile_phone.py.
const words = Object.freeze({'공':'0','영':'0','일':'1','이':'2','삼':'3','사':'4','오':'5','육':'6','칠':'7','팔':'8','구':'9'});
const clean = value => String(value || '').normalize('NFKC').replace(/[\u200b-\u200f\u2060\ufeff]/g,'').trim();
function normalizeMobilePhone(value) {
    const raw = clean(value);
    if (!/^[+0-9공영일이삼사오육칠팔구\s().-]+$/.test(raw)) return '';
    let digits = raw.replace(/[공영일이삼사오육칠팔구]/g,c=>words[c]).replace(/[\s().-]/g,'');
    if (/^\+?8210\d{8}$/.test(digits)) digits = '0' + digits.replace(/^\+?82/,'');
    if (/^\d{8}$/.test(digits)) {
        if (!/^\d{4}[\s.-]*\d{4}$/.test(raw.replace(/[공영일이삼사오육칠팔구]/g,c=>words[c]))) return '';
        digits = '010' + digits;
    }
    return /^010\d{8}$/.test(digits) ? digits : '';
}
function mobilePhoneCandidates(value) {
    const raw = clean(value);
    const chunks = raw.match(phoneChunks()) || [];
    return [...new Set(chunks.map(chunk=>{
        // A name made of eight Korean number syllables is not a mobile contact.
        if (/[공영일이삼사오육칠팔구]/.test(chunk) && !/^(?:0|공|영)[ .()-]*(?:1|일)[ .()-]*(?:0|공|영)/.test(chunk)) return '';
        return normalizeMobilePhone(chunk);
    }).filter(Boolean))];
}
function extractMobilePhone(value) {
    const phones = mobilePhoneCandidates(value);
    return phones.length === 1 ? phones[0] : '';
}
const phoneChunks = () => /(?<![0-9A-Za-z가-힣])[0-9공영일이삼사오육칠팔구](?:[ \t().-]*[0-9공영일이삼사오육칠팔구]){7,}/g;
function redactPhoneText(value) {
    // Public display must also hide a full mobile number attached to a name or
    // region. Keep contact extraction conservative; this is redaction only.
    return clean(value)
        .replace(/(?<![0-9])(?:0[ \t().-]*1[ \t().-]*0|\+?82[ \t().-]*1[ \t().-]*0)(?:[ \t().-]*[0-9공영일이삼사오육칠팔구]){8}(?![0-9])/g,' ')
        .replace(phoneChunks(),' ').replace(/[\s/|·]+$/g,'').replace(/\s+/g,' ').trim();
}
const regions = new Set('서울 경기 인천 부산 대구 대전 광주 울산 세종 강원 충북 충남 전북 전남 경북 경남 제주 용인 천안 수원 성남 고양 부천 안산 안양 화성 평택 의정부 파주 김포 광명 군포 시흥 오산 이천 양주 구리 남양주 포천 하남 과천 여주 양평 가평 연천 동두천 청주 충주 제천 아산 공주 논산 계룡 당진 서산 전주 익산 군산 정읍 김제 남원 목포 순천 여수 광양 나주 포항 경주 구미 김천 안동 영주 영천 상주 문경 경산 창원 진주 김해 양산 밀양 거제 통영 사천 춘천 원주 강릉 속초 동해 태백 삼척 서귀포'.split(' '));
const isRegion = value => regions.has(value.replace(/(?:특별자치시|특별자치도|특별시|광역시|시)$/,''));
function buyerDisplayName(value) {
    const raw=clean(value), match=phoneChunks().exec(raw);
    // Keep all original identity evidence in storage. This is display-only.
    let name=redactPhoneText(raw);
    if(match){const before=raw.slice(0,match.index).replace(/[\s/|·]+$/g,'').trim();if(before&&!isRegion(before))name=redactPhoneText(before);}
    const parts=name.split(/[\/|·]+/).map(s=>s.trim()).filter(Boolean);
    if(parts.length>1)name=parts.find(s=>!isRegion(s))||parts[0];
    if(match){const words=name.split(/\s+/);if(words.length>1&&isRegion(words.at(-1)))words.pop();if(words.length>1&&isRegion(words[0]))words.shift();name=words.join(' ');}
    return name.slice(0,80);
}
return {normalizeMobilePhone,mobilePhoneCandidates,extractMobilePhone,redactPhoneText,buyerDisplayName};
});
