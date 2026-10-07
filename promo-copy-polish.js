'use strict';

// Narrow, idempotent edits requested for the existing promotional manuscripts.
// Only known stock titles/copy are revised; keep operator edits and history.
const hooks = require('./promo-copy-hooks.json');
const SHIPPING_COPY = '아이들은 생물 전문 배송업체를 통해\n집 근처 제휴 업체로 배송됩니다.\n도착 후 직접 상태를 확인하고 픽업하시면 됩니다.';
const replacements = [
 ['같은 크레를 봐도\n눈이 가는 포인트는 제각각이죠!', '당신은 어떤 취향을\n갖고 있나요'],
 ['눈여겨본 샵은 전국 각지에,\n나는 오늘도 우리 동네에…', '보고 싶은 샵은 전국에\n나는 오늘도 우리 동네에'],
 ['라이브 방송을 기다리는 건\n집사님들만이 아닙니다', '방송 전, 사장님들은\n어떤 아이를 고를까요'],
 ['사진 보정이나 조명 왜곡 없이,\n실시간 라이브 영상으로 아이들의 실제 피지컬과 움직임, 발색을 눈으로 직접 확인하실 수 있습니다.', '사진만으로 다 보기 어려웠던 아이들의 매력,\n라이브에서 움직임과 무늬를 보며 브리더의 설명도 함께 들어보세요.'],
 ['안녕하세요 파사모 회원님들! 크레 키우고 분양하는 [업체명]입니다 ^^\n매장에서 손님들이랑 이야기 나누다 보면,\n온라인 경매 자주 보시는 집사님들께서 다들 입을 모아 공감하시는 부분이 있더라고요.', '안녕하세요 파사모 회원님들, [업체명]입니다 ^^\n라이브 경매를 보는 집사님 입장에서 생각해 봤습니다.\n예쁜 아이들은 보고 싶은데, 방송을 챙기는 과정은 어떠셨나요.'],
 ['매주 월·수 밤 8시 정기 방송 & 카톡 원클릭 정산', '방송 시간은 고정, 낙찰 안내는 자동으로'],
 ['대한민국 최초의 릴레이 라이브 경매', '전국 업체들이 함께하는 릴레이 라이브 경매'],
 ['경매 낙찰 뒤의 절차도 가장 편리하게 갖췄습니다', '낙찰 뒤 안내도 한곳에서'],
 ['전국의 검증된 전문 브리더와 매장', '전국의 전문 브리더와 매장'],
 ['내역 확인과 간편 결제를 한 번에 진행하실 수 있고', '낙찰 내역과 결제 안내를 한 번에 확인하실 수 있고'],
 ['내역 확인과 단번에 셈(결제)을 치를 수 있사옵니다.', '낙찰 내역과 셈법(결제 안내)을 한눈에 살피실 수 있사옵니다.'],
 ['낙찰받으시면 카카오톡 알림톡으로 전용 결제 페이지가 자동으로 도착합니다.\n사장들한테 일일이 계좌 물어보실 필요 없이 결제도 간편하고,', '낙찰받으시면 카카오톡 채널 알림톡이 자동으로 발송됩니다.\n톡 안의 링크에서 낙찰 내역과 결제 안내를 한눈에 확인하시고,'],
 ['실시간 움직임과 먹이 반응, 발색을 확인하며', '실시간 움직임과 무늬를 보며'],
 ['배송비 최대 3만 원 전액 지원', '배송비 최대 3만 원 지원'],
 ['배송비 최대 3만 원을 전액 지원', '배송비 최대 3만 원을 지원'],
 ['날씨가 쌀쌀해진 환절기인 만큼, 택배 폐사 걱정 없도록\n집 근처 제휴 전문 샵에서 아이 컨디션 직접 눈으로 확인하시고 픽업하시는 방식입니다.', SHIPPING_COPY],
 ['요즘 아침저녁으로 날씨가 쌀쌀해져서 일반 택배 배송 많이 걱정되시죠?\n아이가 다치지 않도록 거주지 근처 제휴 전문 샵으로 안전하게 이동되어,\n직접 두 눈으로 건강 상태를 확인하고 데려오실 수 있습니다.', SHIPPING_COPY],
 ['쌀쌀해진 환절기에 고속버스 택배 걱정 없이,\n집 근처 제휴 전문 매장에서 안전하게 아이를 인계받으실 수 있습니다.', SHIPPING_COPY],
 ['아이들은 집 근처 제휴 전문 샵에서 건강 상태를 직접 확인하고 픽업하시는 안전한 방식입니다.', SHIPPING_COPY],
 ['아이들은 찬바람 부는 날씨에도 안전하도록\n집 근처 협력 매장에서 실물 컨디션을 직접 확인하시고 픽업하시는 방식입니다.', SHIPPING_COPY],
 ['아이들은 집 근처 업체에서 픽업하는 방식으로 만나게 됩니다.', SHIPPING_COPY],
 ['수령은 집 근처 업체에서 픽업하는 방식입니다.', SHIPPING_COPY],
 ['아이들은 집 근처 업체에서 픽업하는 방식으로 만나실 수 있습니다.', SHIPPING_COPY],
 ['환절기에도 안심하는 집 근처 매장 픽업', '생물 전문 배송으로 집 근처에서 픽업'],
 ['무탈한 픽업 : 험한 길에 귀한 용이 다칠세라, 집 근처 객주(협력 매장)에서 안전하게 친견(수령)하시도록 방도를 마련하였사옵니다.', '생물 전문 배송 : 전문 배송업체가 집 근처 객주(협력 매장)까지 귀한 용을 모셔 오옵니다.\n편안한 픽업 : 도착한 아이의 상태를 직접 살피고 데려가시면 되옵니다.']
];
const imageNote = /^\s*※.*(?:사진|이미지).*(?:연출|분위기|AI)/i;
function polishPromoBlocks(blocks) {
 return blocks.flatMap(block => {
  if (block.type === 'image') return [{...block, alt:(block.alt || '').replace(/\s*·\s*(?:얼굴이 보이지 않는 |얼굴 없는 )?AI 연출(?: 이미지| 사진)?$/, '')}];
  if (block.type !== 'text') return [block];
  let copy = block.text;
  for (const [before, after] of replacements) copy = copy.split(before).join(after);
  // Also covers older operator copies with small changes to these sentences.
  copy = copy.split('\n').filter(line => !imageNote.test(line)).map(line =>
   line.includes('택배') ? '아이들은 생물 전문 배송업체를 통해 배송됩니다.' : line
  ).join('\n');
  if (block.text.trim() && !copy.trim()) return [];
  return [{...block, text:copy, align:'center'}];
 });
}
function polishPromoTitle(id,title) {
 const hook=hooks[id];return hook?.previous.includes(title)?hook.title:title;
}
module.exports = {polishPromoBlocks,polishPromoTitle};
