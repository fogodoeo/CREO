import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = 'https://parge.co.kr';
const DEFAULT_ORIGIN = '크레오 대구본점';
const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'parge_data.json');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

const GROUPS = [
  '서울/경기/인천',
  '충청/대전',
  '전라/광주',
  '대구/경북/부산/경남',
  '강원도',
  '제주도',
];

const BLOCKED_NAMES = new Set([
  '대구곤충마트', '대구 곤충마트', '대구곤충 마트', '대구 곤충 마트',
  '레포리아 (익산)', '레포리아(익산)', '정글숲 (포항)', '정글숲(포항)',
  '크레노바 (창원)', '크레노바(창원)', '크레노바 창원', '크레노바창원',
  '오야지크레 (안양)', '오야지크레(안양)', 'BLACK LABEL EXOTIC (대구)',
  'BLACK LABEL EXOTIC(대구)', 'Black Label Exotic (대구)', '다니엘렙타일 (오창)',
  '다니엘렙타일(오창)', '다니엘렙타일', '트라이디거 하남 본점', '트라이디거 하남',
].map(normalizeName));

function normalizeName(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function compact(value) {
  return normalizeName(value).replace(/\s/g, '').toLowerCase();
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

function extractPriceMatrix(chunk) {
  const anchor = 'sudo:{sudo:';
  const anchorIndex = chunk.indexOf(anchor);
  if (anchorIndex < 0) throw new Error('파르게 가격표 시작점을 찾지 못했습니다.');

  const start = chunk.lastIndexOf('{', anchorIndex);
  let depth = 0;
  let end = -1;
  for (let index = start; index < chunk.length; index += 1) {
    if (chunk[index] === '{') depth += 1;
    if (chunk[index] === '}') depth -= 1;
    if (depth === 0) {
      end = index + 1;
      break;
    }
  }
  if (end < 0) throw new Error('파르게 가격표 끝을 찾지 못했습니다.');

  const literal = chunk.slice(start, end);
  const matrix = {};
  for (const rowMatch of literal.matchAll(/([a-z_]+):\{([^{}]+)\}/g)) {
    const row = {};
    for (const cellMatch of rowMatch[2].matchAll(/([a-z_]+):(\d+(?:e\d+)?)/g)) {
      row[cellMatch[1]] = Number(cellMatch[2]);
    }
    if (Object.keys(row).length) matrix[rowMatch[1]] = row;
  }
  if (!matrix.daegu?.sudo || !matrix.daegu?.jeju) {
    throw new Error('파르게 가격표 파싱 검증에 실패했습니다.');
  }
  return matrix;
}

function regionText(partner) {
  return compact([partner.name, partner.address].filter(Boolean).join(' '));
}

function destinationHub(partner) {
  const text = regionText(partner);
  if (text.includes('제주')) return 'jeju';
  if (text.includes('순천')) return 'suncheon';
  if (text.includes('익산')) return 'iksan';
  if ((text.includes('경기광주') || text.includes('경기도광주'))) return 'sudo';
  if (text.includes('광주')) return 'gwangju';
  if (text.includes('진주')) return 'jinju';
  if (text.includes('창원') || text.includes('마산')) return 'changwon';
  if (text.includes('부산') || text.includes('김해') || text.includes('양산')) return 'busan';
  if (text.includes('대구') && !text.includes('해운대구')) return 'daegu';
  if (text.includes('구미') || text.includes('레포리아')) return 'gumi';
  if (text.includes('울산')) return 'ulsan';
  if (text.includes('경주')) return 'gyeongju';
  if (text.includes('포항')) return 'pohang';
  if (text.includes('고성') || text.includes('강릉') || text.includes('동해')) return 'goseong_gangneung';
  if (text.includes('원주') || text.includes('춘천') || text.includes('강원')) return 'wonchun';
  if (['충청', '대전', '세종', '청주', '천안', '충북', '충남', '아산', '오송', '오창'].some((word) => text.includes(word))) return 'chung';
  if (['서울', '인천', '경기', '수원', '용인', '성남', '고양', '부천', '평택', '파주', '안산', '남양주'].some((word) => text.includes(word))) return 'sudo';

  const rawRegion = compact(partner.region);
  if (rawRegion.includes('제주')) return 'jeju';
  if (rawRegion.includes('강원')) return 'wonchun';
  if (rawRegion.includes('전라')) return 'gwangju';
  if (rawRegion.includes('경상') || rawRegion.includes('경북') || rawRegion.includes('경남')) return 'daegu';
  if (rawRegion.includes('충청')) return 'chung';
  return 'sudo';
}

function groupForHub(hub) {
  if (hub === 'sudo') return GROUPS[0];
  if (hub === 'chung') return GROUPS[1];
  if (['gwangju', 'suncheon', 'iksan'].includes(hub)) return GROUPS[2];
  if (['daegu', 'gumi', 'pohang', 'gyeongju', 'busan', 'ulsan', 'changwon', 'jinju'].includes(hub)) return GROUPS[3];
  if (['wonchun', 'goseong_gangneung'].includes(hub)) return GROUPS[4];
  return GROUPS[5];
}

function runFallback(error) {
  const command = process.env.PARGE_LEGACY_COMMAND?.trim();
  console.warn(`[parge] API 갱신 실패: ${error.message}`);
  if (command) {
    console.warn('[parge] PARGE_LEGACY_COMMAND로 기존 로그인 크롤러를 실행합니다.');
    execSync(command, { cwd: process.cwd(), stdio: 'inherit' });
    return;
  }
  if (fs.existsSync(OUTPUT_PATH)) {
    console.warn('[parge] 기존 parge_data.json을 그대로 유지합니다.');
    return;
  }
  throw error;
}

async function main() {
  try {
    const [partnerPayload, bookingHtml] = await Promise.all([
      getJson(`${BASE_URL}/api/partners`),
      getText(`${BASE_URL}/booking`),
    ]);
    const chunkPaths = [...new Set(
      [...bookingHtml.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((match) => match[0]),
    )];
    if (!chunkPaths.length) throw new Error('예약 페이지 JS 경로를 찾지 못했습니다.');
    const chunks = await Promise.all(chunkPaths.map((chunkPath) => getText(`${BASE_URL}${chunkPath}`)));
    let matrix = null;
    for (const chunk of chunks) {
      try {
        matrix = extractPriceMatrix(chunk);
        break;
      } catch {
        // The pricing matrix exists in only one of the page's chunks.
      }
    }
    if (!matrix) throw new Error('파르게 가격표가 담긴 JS를 찾지 못했습니다.');

    const partners = partnerPayload.partners
      .filter((partner) => partner?.id && partner?.name && partner.isActive !== false)
      .filter((partner) => !BLOCKED_NAMES.has(normalizeName(partner.name)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const origin = partners.find((partner) => normalizeName(partner.name) === DEFAULT_ORIGIN);
    if (!origin) throw new Error(`출발지 '${DEFAULT_ORIGIN}'을 찾지 못했습니다.`);
    const originHub = destinationHub(origin);
    const data = Object.fromEntries(GROUPS.map((group) => [group, []]));

    for (const partner of partners) {
      const hub = destinationHub(partner);
      const cost = matrix[originHub]?.[hub];
      if (!Number.isFinite(cost) || cost <= 0) throw new Error(`${partner.name} 가격을 계산할 수 없습니다.`);
      data[groupForHub(hub)].push({ shop: partner.name, cost });
    }

    const result = {
      updated: new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short', hour12: false,
      }).format(new Date()),
      source: 'parge-public-api',
      origin: DEFAULT_ORIGIN,
      data,
    };
    const counts = Object.fromEntries(Object.entries(data).map(([group, shops]) => [group, shops.length]));
    console.log(JSON.stringify({ origin: DEFAULT_ORIGIN, total: partners.length, counts }, null, 2));
    if (dryRun) return;

    const tempPath = `${OUTPUT_PATH}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, OUTPUT_PATH);
    console.log(`[parge] ${OUTPUT_PATH} 갱신 완료`);
  } catch (error) {
    runFallback(error);
  }
}

await main();
