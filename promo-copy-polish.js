'use strict';

// Narrow, idempotent edits requested for the existing promotional manuscripts.
// Keep titles, other paragraphs, image URLs, styling and publication history.
const SHIPPING_COPY = '아이들은 생물 전문 배송업체를 통해\n집 근처 제휴 업체로 배송됩니다.\n도착 후 직접 상태를 확인하고 픽업하시면 됩니다.';
const replacements = [
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
module.exports = {polishPromoBlocks};
