'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('public schedule rendering is concise and cannot interpolate invalid dates or provider content',()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../public/delivery-schedule-view.js'),'utf8'),context);
 const {html,format}=context.window.CreoDeliverySchedule;
 assert.equal(format('2026-09-22'),'9.22(화)');assert.equal(html(null),'');
 assert.match(html({status:'estimated',dispatchDate:'2026-09-20',arrivalDate:'2026-09-22'}),/발송 예정/);
 for(const s of [{status:'review',reason:'<script>bad</script>'},{status:'estimated',dispatchDate:'2026-02-30',arrivalDate:'2026-09-22'},{status:'estimated',dispatchDate:'"><script>bad</script>',arrivalDate:'2026-09-22'}])assert.equal(html(s),'<p class="delivery-schedule-pending">배송 일정 확인 중</p>');
});
