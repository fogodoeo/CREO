(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CreoSettlementWorkbook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    const statuses = {waiting:'대기', live:'진행 중', sold:'낙찰', passed:'유찰', cancelled:'취소', refunded:'환불', confirmed:'입금 확인', rejected:'미입금 처리', pending:'확인 대기', phone_required:'전화번호 확인 필요', awaiting_information:'배송 입력 대기', bank_transfer_pending:'입금 대기', bank_transfer_reported:'입금 확인 필요', card_link_pending:'카드 안내 대기', card_payment_pending:'카드결제 대기', card_payment_reported:'카드결제 확인 필요', additional_payment:'추가 결제', paid:'결제 완료', on_site:'현장 결제'};
    const col = (key, label, type='text', width=18) => ({key,label,type,width});
    const money = (key,label) => col(key,label,'money',20);
    const count = (key,label) => col(key,label,'number',12);
    function scopeLabel(report) {
        const name=String(report.round?.name||'선택한 회차'), date=String(report.round?.date||'');
        return date&&!name.includes(date)?name+' · '+date:name;
    }
    function sheets(report) {
        return [
            {name:'업체 총정산', rows:report.vendors, columns:[col('vendorName','업체', 'text',24),money('totalAmount','주관사에 보낼 금액'),money('receivedAmount','주관사 입금 확인'),money('remainingAmount','미입금'),money('overpaidAmount','초과 입금'),money('feeAmount','수수료 합계'),money('entryFeeAmount','출품 수수료'),money('commissionAmount','낙찰 수수료'),money('shippingAmount','업체 수금 배송비'),money('shippingSupportAmount','주관사 배송지원'),money('soldAmount','낙찰금 (취소 제외)'),count('regularCount','일반 출품'),count('eventCount','이벤트'),count('soldCount','낙찰'),count('waitingCount','진행 전'),count('missingShippingCount','배송 미입력'),count('missingPhoneCount','연락처 미확인')]},
            {name:'개체 내역', rows:report.items.map(row => ({...row, kind:row.event?'이벤트':'일반',status:statuses[row.status]||row.status,paymentStatus:statuses[row.paymentStatus]||row.paymentStatus,phoneSource:({stored:'등록 번호',member:'회원 정보',missing:'확인 필요'})[row.phoneSource]||'',method:({pickup:'직접수령',delivery:'배송'})[row.method]||''})), columns:[col('broadcastDate','방송일','date',14),col('code','개체 번호'),col('vendorName','업체','text',24),col('kind','구분','text',10),col('status','경매 상태'),money('soldAmount','원 낙찰금'),money('netSoldAmount','낙찰금 (취소 제외)'),money('entryFee','출품 수수료'),money('commission','낙찰 수수료'),money('feeAmount','수수료 합계'),col('buyerName','낙찰자'),col('phone','낙찰자 전화번호','text',20),col('phoneSource','번호 출처'),col('paymentStatus','결제 상태'),col('method','수령 방식'),col('carrier','배송업체'),col('destination','수령지','text',38),money('shippingAmount','낙찰자 배송비'),money('shippingSupportAmount','배송지원'),money('grossShippingAmount','배송비 원액')]},
            {name:'낙찰자 결제', rows:report.buyers.map(row=>({...row,status:statuses[row.status]||row.status,paymentMethod:({bank_transfer:'계좌이체',card:'카드'})[row.paymentMethod]||''})), columns:[col('vendorName','결제받는 업체','text',24),col('buyerName','낙찰자'),col('phone','낙찰자 전화번호','text',20),col('broadcastDates','방송일','text',26),col('codes','낙찰 개체','text',32),count('itemCount','마릿수'),money('soldAmount','낙찰금'),money('discountAmount','할인'),money('shippingAmount','낙찰자 배송비'),money('shippingSupportAmount','배송지원'),money('totalAmount','결제 총액'),money('confirmedAmount','누적 결제 확인'),money('remainingAmount','추가 결제액'),col('status','결제 상태','text',24),col('paymentMethod','결제 방식'),col('carrier','배송업체'),col('destination','수령지','text',38)]},
            {name:'주관사 입금 내역', rows:report.receipts.map(row=>({...row,status:statuses[row.status]||row.status})),columns:[col('vendorName','업체','text',24),col('paidOn','입금일','date',14),money('amount','입금액'),col('status','처리 상태'),col('reportedAt','입금 요청 시각','datetime',24),col('reviewedAt','처리 시각','datetime',24),col('memo','메모','text',38)]}
        ];
    }
    const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');
    function tsv(sheet) {
        // Preserve identifiers/leading zeroes and prevent pasted user text from
        // becoming a spreadsheet formula. Numeric money stays numeric.
        return [sheet.columns.map(c=>c.label), ...sheet.rows.map(row=>sheet.columns.map(c=>row[c.key] ?? ''))].map((row,index)=>row.map(value=>{
            const v=clean(value);
            return index && typeof value !== 'number' && ( /^\s*[=+\-@]/.test(v) || /^0\d/.test(v)) ? "'"+v : v;
        }).join('\t')).join('\n');
    }
    function buildWorkbook(report, XLSX) {
        const workbook = XLSX.utils.book_new();
        workbook.Props = {Title:scopeLabel(report)+' 총정산', Subject:'선택 회차 정산', Author:'CREO', CreatedDate:new Date(report.generatedAt)};
        workbook.Workbook = {CalcPr:{fullCalcOnLoad:true}};
        for (const spec of sheets(report)) {
            const values = [[], [scopeLabel(report)+' '+spec.name], ['단위: 원 · '+new Date(report.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})], [], spec.columns.map(c=>c.label)];
            for (const row of spec.rows) values.push(spec.columns.map(c=> {
                const value=row[c.key];
                if (value == null || value === '') return '';
                if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return {t:'n',v:Math.round((Date.parse(value)-Date.UTC(1899,11,30))/86400000),z:'yyyy-mm-dd'};
                if (c.type === 'datetime' && Number.isFinite(Date.parse(value))) return {t:'n',v:(Date.parse(value)+9*3600000-Date.UTC(1899,11,30))/86400000,z:'yyyy-mm-dd hh:mm'};
                if (c.type === 'money' || c.type === 'number') return {t:'n',v:value,z:'#,##0'};
                return {t:'s',v:String(value)};
            }));
            const ws = XLSX.utils.aoa_to_sheet(values);
            ws['!cols'] = spec.columns.map(c=>({wch:c.width}));
            ws['!rows'] = values.map((_,i)=>({hpt:i===4?30:22}));
            ws['!autofilter'] = {ref:XLSX.utils.encode_range({r:4,c:0},{r:Math.max(4,values.length-1),c:spec.columns.length-1})};
            // Summary totals intentionally exclude source receipts with cancelled
            // or pending status. The receipt sheet is an audit trail, not a sum.
            if (spec.name === '업체 총정산' && spec.rows.length) {
                const r=values.length;
                XLSX.utils.sheet_add_aoa(ws,[['합계']],{origin:{r,c:0}});
                spec.columns.forEach((c,i)=>{
                    if(!['money','number'].includes(c.type))return;
                    const column=XLSX.utils.encode_col(i);
                    ws[column+(r+1)]={t:'n',v:spec.rows.reduce((n,row)=>n+(Number(row[c.key])||0),0),f:'SUBTOTAL(109,'+column+'6:'+column+r+')',z:'#,##0'};
                });
                ws['!ref']=XLSX.utils.encode_range({r:0,c:0},{r,c:spec.columns.length-1});
            }
            XLSX.utils.book_append_sheet(workbook, ws, spec.name);
        }
        return workbook;
    }
    function xlsxBytes(report, XLSX) {
        const workbook=buildWorkbook(report,XLSX);
        const zip=XLSX.CFB.read(new Uint8Array(XLSX.write(workbook,{bookType:'xlsx',type:'array'})),{type:'buffer'});
        const decode=new TextDecoder(),encode=new TextEncoder();
        const read=path=>decode.decode(new Uint8Array(XLSX.CFB.find(zip,'/'+path).content));
        const write=(path,xml)=>XLSX.CFB.utils.cfb_add(zip,'/'+path,encode.encode(xml));
        // SheetJS CE preserves values/number formats. Add a small, fixed set of
        // OpenXML styles and panes only to workbooks created by this exporter.
        let styles=read('xl/styles.xml');
        styles=styles.replace(/<fonts\b[^>]*>[\s\S]*?<\/fonts>/,'<fonts count="4"><font><sz val="11"/><name val="Arial"/><color rgb="FF17202E"/></font><font><b/><sz val="11"/><name val="Arial"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="15"/><name val="Arial"/><color rgb="FF17202E"/></font><font><b/><sz val="11"/><name val="Arial"/><color rgb="FF17202E"/></font></fonts>');
        let fillCount=0;
        styles=styles.replace(/<fills count="(\d+)">([\s\S]*?)<\/fills>/,(_,count,body)=>{fillCount=Number(count);return '<fills count="'+(fillCount+2)+'">'+body+'<fill><patternFill patternType="solid"><fgColor rgb="FF243B61"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEBF0F7"/><bgColor indexed="64"/></patternFill></fill></fills>';});
        let titleStyle,headerStyle,totalStyles={};
        styles=styles.replace(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/,(_,count,body)=>{
            let index=Number(count);titleStyle=index++;headerStyle=index++;
            let extra='<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+'<xf numFmtId="0" fontId="1" fillId="'+fillCount+'" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>';
            const bases=body.match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)||[];
            bases.forEach((base,i)=>{totalStyles[i]=index++;const format=/numFmtId="(\d+)"/.exec(base)?.[1]||'0';extra+='<xf numFmtId="'+format+'" fontId="3" fillId="'+(fillCount+1)+'" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>';});
            body=bases.map(base=>{const format=/numFmtId="(\d+)"/.exec(base)?.[1]||'0';return base.replace(/\/>$/,' applyAlignment="1"><alignment horizontal="'+(format==='0'?'left':'right')+'" vertical="center" indent="1"/></xf>');}).join('');
            return '<cellXfs count="'+index+'">'+body+extra+'</cellXfs>';
        });
        write('xl/styles.xml',styles);
        workbook.SheetNames.forEach((name,i)=>{
            const path='xl/worksheets/sheet'+(i+1)+'.xml';let xml=read(path);
            const pane='<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="5" topLeftCell="B6" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B6" sqref="B6"/></sheetView></sheetViews>';
            xml=xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,pane);
            const totalRow=i===0&&report.vendors.length?6+report.vendors.length:0;
            xml=xml.replace(/<c\b([^>]*\br="[A-Z]+(\d+)"[^>]*)>/g,(tag,attrs,row)=>{
                const number=Number(row),previous=Number(/\bs="(\d+)"/.exec(attrs)?.[1]||0);
                const style=number===2?titleStyle:number===5?headerStyle:number===totalRow?totalStyles[previous]:null;
                return style==null?tag:'<c'+attrs.replace(/\s+s="\d+"/,'')+' s="'+style+'">';
            });
            write(path,xml);
        });
        let book=read('xl/workbook.xml');
        book=book.replace(/<calcPr\b[^>]*\/>/,'').replace('</workbook>','<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>');
        write('xl/workbook.xml',book);
        return new Uint8Array(XLSX.CFB.write(zip,{fileType:'zip',compression:true}));
    }
    return {sheets,tsv,buildWorkbook,xlsxBytes,statuses,scopeLabel};
});
