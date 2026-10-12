'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Table=require('../public/workspace-vendor-table');
const National=require('../national-broadcast');

test('national directory uses broadcast region before legacy region and never infers it from address',()=>{
    assert.deepEqual(Table.REGIONS,National.REGIONS);
    assert.equal(Table.regionForVendor({broadcastRegion:'전라·충청',bookingRegion:6,address:'서울'}),'전라·충청');
    for(let bookingRegion=0;bookingRegion<8;bookingRegion++)assert.equal(Table.regionForVendor({bookingRegion}),National.REGIONS[National.regionForVendor({bookingRegion})]);
    assert.equal(Table.regionForVendor({broadcastRegion:'인천'}),'서울·인천');
    for(const bookingRegion of [undefined,null,'',-1,8,'abc'])assert.equal(Table.regionForVendor({bookingRegion,address:'서울특별시'}),'');
});

test('directory names distinguish confirmed manager from bank holder without changing records',()=>{
    const vendor={manager:' 김담당 ',bankHolder:'박예금'};
    assert.deepEqual(Table.contactForVendor(vendor),{name:'김담당',source:'manager'});
    assert.equal(vendor.manager,' 김담당 ');
    const fallback={manager:' ',bankHolder:'박예금'};
    assert.deepEqual(Table.contactForVendor(fallback),{name:'박예금',source:'bankHolder'});
    assert.match(Table.render({vendors:[fallback]}),/박예금<\/span><small class="vendor-detail">예금주 기준/);
    assert.doesNotMatch(Table.render({vendors:[vendor]}),/예금주 기준/);
    assert.deepEqual(Table.contactForVendor({}),{name:'',source:''});
});

test('national directory is ordered by region and name, excludes inactive, and preserves other channels',()=>{
    const rows=[{id:'unknown',name:'미지정'},{id:'jeolla',name:'채채파파',broadcastRegion:'전라·충청'},{id:'b',name:'나',broadcastRegion:'서울·인천'},{id:'a',name:'가',broadcastRegion:'인천'},{id:'inactive',name:'숨김',active:false}];
    assert.deepEqual(Table.visibleVendors(rows,true).map(v=>v.id),['a','b','jeolla','unknown']);
    assert.deepEqual(Table.visibleVendors(rows,false),rows);
    assert.equal(rows[0].id,'unknown');
    const markup=Table.render({channelId:'team-channel',vendors:[{name:'업체',groupId:'team-a',broadcastRegion:'전라·충청'}],groupLabel:'팀',groupName:id=>id==='team-a'?'푸른 팀':''});
    assert.match(markup,/>팀<\/th>/);assert.match(markup,/푸른 팀/);assert.doesNotMatch(markup,/전라·충청/);
});

test('all contact and settlement fields render safely, completely, and with missing values identified',()=>{
    const vendor={id:'one',name:'업체 <script>',code:'A01',manager:'김담당',phone:'01012345678',address:'서울특별시 예시로 123 '+ '상세 주소 '.repeat(20),bankName:'예시은행',bankAccount:'000-123456-78900',bankHolder:'박예금'};
    const markup=Table.render({channelId:'national-cre',vendors:[vendor],actions:(_type,id)=>`<button data-edit="vendors:${id}">수정</button>`});
    for(const value of ['지역','담당자','연락처','주소','계좌번호','김담당','010-1234-5678',vendor.address.trim(),'예시은행',vendor.bankAccount,'예금주 박예금','A01','data-edit="vendors:one"'])assert.ok(markup.includes(value),value);
    assert.match(markup,/업체 &lt;script&gt;/);assert.doesNotMatch(markup,/<script>/);
    assert.match(Table.render({vendors:[{name:'이름',manager:'<img onerror="x">',bankAccount:'<script>'}]}),/&lt;img onerror=&quot;x&quot;&gt;/);
    assert.match(Table.render({vendors:[{name:'새 업체'}]}),/미등록/);
    const empty=Table.render({channelId:'national-cre',vendors:[{name:'숨김',active:false}]});
    assert.match(empty,/등록된 업체가 없습니다/);assert.doesNotMatch(empty,/숨김/);assert.match(empty,/<tbody role="rowgroup">/);
});

test('phone formatting keeps nonstandard extensions and overseas numbers intact',()=>{
    for(const [input,expected] of [['02 1234 5678','02-1234-5678'],['0321234567','032-123-4567'],['01012345678','010-1234-5678'],['+82 10 1234 5678','+82 10 1234 5678'],['02-123-4567 내선 8','02-123-4567 내선 8']])assert.equal(Table.formatPhone(input),expected);
});
