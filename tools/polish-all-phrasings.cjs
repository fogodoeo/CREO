'use strict';
const fs = require('fs');
const path = require('path');

function updateTemplates(filePath) {
  const templates = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  for (const t of templates) {
    if (t.id === 'launch26-joseon') {
      const b6 = t.blocks.find(b => b.type === 'text' && b.text.includes('과인이 팔도의 장인들을'));
      if (b6) {
        b6.text = '팔도강산 고을마다 지극정성으로 기른 크레 소식이 자자하여,\n과인이 팔도의 장인들을 한자리에 불러 모으라 명하였노라.';
      }
    } else if (t.id === 'ep01-welcome') {
      const b2 = t.blocks.find(b => b.type === 'text' && b.text.includes('라이브 경매를 보는 집사님 입장에서'));
      if (b2) {
        b2.text = '안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n라이브 경매를 보는 집사님 입장에서 생각해 봤습니다.\n예쁜 아이들은 보고 싶은데, 방송 챙기는 과정이 은근히 번거롭지 않으셨나요?';
      }
    } else if (t.id === 'launch26-taste') {
      const b15 = t.blocks.find(b => b.type === 'text' && b.text.includes('대망의 첫 방송에서 만나요'));
      if (b15) {
        b15.text = '10월 14일 수요일 밤 8시, 대망의 첫 방송에서 찾아뵙겠습니다!\n첫 방송 낙찰자분들께는 1인당 배송비 최대 3만 원 지원 혜택도 함께 드립니다.\n\n회원님들은 어떤 스타일의 크레를 가장 좋아하시나요? 댓글로도 편하게 나눠주세요!\n저희도 정말 멋진 아이들로 정성껏 준비해서 기다리겠습니다 ^^';
      }
    } else if (t.id === 'launch26-tour') {
      const b5 = t.blocks.find(b => b.type === 'text' && b.text.includes('전국 업체들이 함께하는 릴레이 라이브 경매'));
      if (b5) {
        b5.text = '그래서 전국의 전문 브리더·업체 30여 곳이 의기투합했습니다.\n서울·인천부터 경기, 대구·경북, 부산·울산·경남, 전라·충청까지!\n\n각 지역을 대표하는 실력파 샵들이 정성껏 키운 아이들을 차례로 선보이는\n전국 연합 릴레이 라이브 경매, ‘전국크레자랑’입니다.\n직접 장거리 운전하며 돌아다니실 필요 없이, 전국의 명품 크레들을 안방 1열에서 차례로 만나보세요.';
      }
    } else if (t.id === 'launch26-series') {
      const b2 = t.blocks.find(b => b.type === 'text' && b.text.includes('새로운 방송을 소개하려니'));
      if (b2) {
        b2.text = '안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n새로운 방송을 소개하려니 저희도 드라마 첫 화를 기다리는 것처럼 설레네요.\n이번엔 전국의 전문 샵들이 한 밴드에 모여,\n회차마다 다른 지역의 멋진 크레들을 차례로 소개합니다.';
      }
      const b5 = t.blocks.find(b => b.type === 'text' && b.text.includes('한 샵에서 끝나는 구경이 아니라'));
      if (b5) {
        b5.text = '서울·인천, 경기, 경북, 경남, 전라·충청.\n30여 곳의 전문 브리더·업체가 돌아가며 참여합니다.\n\n한 샵에서 끝나는 단발성 구경이 아니라,\n“다음엔 어느 지역 아이들이 나올까?” 기다리는 설렘이 있습니다.\n매주 월요일과 수요일 밤 8시에 그 즐거움이 이어집니다.';
      }
      const b11 = t.blocks.find(b => b.type === 'text' && b.text.includes('첫 방송 낙찰자분들께 배송비를'));
      if (b11) {
        b11.text = '첫 방송 기념으로 낙찰자분들께 배송비를 1인당 최대 3만 원 지원해 드립니다.\n\n꼭 입양이 아니어도 괜찮으니,\n첫 화부터 편안한 마음으로 함께 즐겨주세요.\n전국크레자랑 밴드에서 반갑게 인사드리겠습니다 ^^';
      }
    } else if (t.id === 'launch26-questions') {
      const b2 = t.blocks.find(b => b.type === 'text' && b.text.includes('안녕하세요 집사님들'));
      if (b2) {
        b2.text = '안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n크레 사진을 보다 보면 나도 모르게 저장 버튼부터 누르게 되죠 ㅎㅎ\n그런데 막상 더 깊이 알아보고 싶을 땐,\n사진 한 장만으로는 다 풀리지 않는 궁금증들이 생기곤 합니다.';
      }
      const b5 = t.blocks.find(b => b.type === 'text' && b.text.includes('아이의 움직임을 보며'));
      if (b5) {
        b5.text = '아이의 활발한 움직임을 보며 브리더의 생생한 설명도 듣고,\n궁금한 점은 실시간 채팅으로 편하게 물어봐 주세요.\n이제 막 크레를 알아보시는 초보 집사님도,\n오랫동안 키워오신 베테랑 집사님도 누구나 편하게 함께하실 수 있습니다.';
      }
      const b14 = t.blocks.find(b => b.type === 'text' && b.text.includes('첫 방송 낙찰자 1인당 배송비'));
      if (b14) {
        b14.text = '첫 방송 기념으로 낙찰자분들께 1인당 배송비를 최대 3만 원 지원해 드립니다!\n\n당장 입양 계획이 없으셔도 좋으니 편하게 구경하러 놀러 오세요.\n회원님들은 크레를 보실 때 어떤 점이 가장 궁금하신가요?\n라이브 방송에서 반갑게 이야기 나눠요 ^^';
      }
    } else if (t.id === 'launch26-afterwork') {
      const b2 = t.blocks.find(b => b.type === 'text' && b.text.includes('할 일 마치고 잠깐 앉아서'));
      if (b2) {
        b2.text = '안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n하루 일과를 무사히 마치고 잠깐 소파에 기대어 예쁜 아이들을 보는 시간.\n크레를 사랑하는 집사님들께는 이런 소소한 구경도\n지친 하루 끝의 가장 힐링되는 순간이 아닐까 싶습니다.';
      }
      const b5 = t.blocks.find(b => b.type === 'text' && b.text.includes('지역별 샵들이 돌아가며'));
      if (b5) {
        b5.text = '전국의 전문 브리더·업체 30여 곳이 뭉쳤습니다.\n지역별 샵들이 돌아가며 각자의 크레들을 선보이니,\n한 밴드 안에서도 매회 새롭고 다채로운 아이들을 구경하실 수 있습니다.\n\n오늘은 어떤 아이의 무늬가 눈에 쏙 들어올지,\n어떤 샵의 흥미진진한 브리딩 이야기가 펼쳐질지.\n네이버 밴드 라이브 경매 ‘전국크레자랑’에서 함께 즐겨보세요.';
      }
      const b11 = t.blocks.find(b => b.type === 'text' && b.text.includes('첫 방송에는 낙찰자 1인당'));
      if (b11) {
        b11.text = '첫 방송 기념으로 낙찰자분들께 1인당 배송비를 최대 3만 원 지원해 드립니다.\n\n입양 계획이 없으셔도 전혀 부담 없이 들러주세요.\n예쁜 크레들 보시며 하루의 피로를 푸는 편안한 저녁이 되셨으면 좋겠습니다.\n첫 방송에서 반갑게 인사드릴게요 ^^';
      }
    }
  }

  // Ensure bundleVersion increment if needed, and ensure all text blocks have align: 'center'
  for (const t of templates) {
    t.bundleVersion = Math.max(t.bundleVersion || 0, 7);
    for (const b of t.blocks) {
      if (b.type === 'text') {
        b.align = 'center';
      }
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(templates, null, 1) + '\n', 'utf8');
  console.log(`Updated ${filePath}`);
}

const target1 = path.resolve(__dirname, '../promo-templates.json');
const target2 = path.resolve('C:/Users/5600x/CREO/promo-templates.json');

updateTemplates(target1);
if (fs.existsSync(target2)) {
  updateTemplates(target2);
}
