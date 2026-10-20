// js/hierarchy.js
// 최대 7단계 헤드 프리셋, 자동 번호 매김(Ⅰ. -> 1. -> 1) -> (1) -> 가. -> 가) -> (가)) 및 빈 문서 초기 데이터

export const ALL_HEAD_PRESETS = [
  {
    level: 1,
    name: '헤드 1',
    shortcut: 'Alt+1',
    format: 'roman', // Ⅰ. Ⅱ. Ⅲ.
    color: '#111111',
    fontSize: 15,
    fontWeight: 700,
    indent: 0,
    marginTop: 14,
    marginBottom: 6
  },
  {
    level: 2,
    name: '헤드 2',
    shortcut: 'Alt+2',
    format: 'number_dot', // 1. 2. 3.
    color: '#111111',
    fontSize: 12,
    fontWeight: 700,
    indent: 2,
    marginTop: 10,
    marginBottom: 4
  },
  {
    level: 3,
    name: '헤드 3',
    shortcut: 'Alt+3',
    format: 'number_paren_right', // 1) 2) 3)
    color: '#7B4B94',
    fontSize: 12,
    fontWeight: 600,
    indent: 14,
    marginTop: 3,
    marginBottom: 3
  },
  {
    level: 4,
    name: '헤드 4',
    shortcut: 'Alt+4',
    format: 'number_paren_both', // (1) (2) (3)
    color: '#2364AA',
    fontSize: 12,
    fontWeight: 600,
    indent: 26,
    marginTop: 2,
    marginBottom: 2
  },
  {
    level: 5,
    name: '헤드 5',
    shortcut: 'Alt+5',
    format: 'hangul_dot', // 가. 나. 다.
    color: '#2B2B2B',
    fontSize: 12,
    fontWeight: 500,
    indent: 38,
    marginTop: 1,
    marginBottom: 1
  },
  {
    level: 6,
    name: '헤드 6',
    shortcut: 'Alt+6',
    format: 'hangul_paren_right', // 가) 나) 다)
    color: '#099268',
    fontSize: 12,
    fontWeight: 500,
    indent: 50,
    marginTop: 1,
    marginBottom: 1
  },
  {
    level: 7,
    name: '헤드 7',
    shortcut: 'Alt+7',
    format: 'hangul_paren_both', // (가) (나) (다)
    color: '#C92A2A',
    fontSize: 12,
    fontWeight: 500,
    indent: 62,
    marginTop: 1,
    marginBottom: 1
  }
];

export const DEFAULT_HEAD_PRESETS = ALL_HEAD_PRESETS;

export const DEFAULT_SETTINGS = {
  maxHeadLevels: 5, // 기본 5단계, 설정을 통해 최대 7단계까지 확장 가능
  columns: 2,
  showColumnRule: true,
  fontFamily: "'Noto Serif KR', 'Batang', '바탕', serif",
  lineHeight: 1.55,
  autoNumbering: true,
  shortcutModifier: 'Alt', // 'Alt' (Alt+1~7)
  enableTabIndent: true
};

const ROMAN_NUMERALS = [
  'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ',
  'Ⅺ', 'Ⅻ', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'
];

const HANGUL_SYLLABLES = [
  '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
  '거', '너', '더', '러', '머', '버', '서', '어', '저', '처', '커', '터', '퍼', '허'
];

const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'
];

/**
 * 숫자와 포맷 유형을 받아 접두사 문자열 반환
 */
export function formatPrefix(count, formatType) {
  const idx = Math.max(1, count);
  switch (formatType) {
    case 'roman': {
      const roman = ROMAN_NUMERALS[idx - 1] || `${idx}`;
      return `${roman}.`;
    }
    case 'number_dot':
      return `${idx}.`;
    case 'number_paren_right':
      return `${idx})`;
    case 'number_paren_both':
      return `(${idx})`;
    case 'hangul_dot': {
      const ch = HANGUL_SYLLABLES[(idx - 1) % HANGUL_SYLLABLES.length];
      return `${ch}.`;
    }
    case 'hangul_paren_right': {
      const ch = HANGUL_SYLLABLES[(idx - 1) % HANGUL_SYLLABLES.length];
      return `${ch})`;
    }
    case 'hangul_paren_both': {
      const ch = HANGUL_SYLLABLES[(idx - 1) % HANGUL_SYLLABLES.length];
      return `(${ch})`;
    }
    case 'circled_number': {
      return CIRCLED_NUMERALS_SAFE(idx);
    }
    case 'bullet':
      return '•';
    case 'dash':
      return '-';
    case 'none':
      return '';
    default:
      return `${idx}.`;
  }
}

function CIRCLED_NUMERALS_SAFE(idx) {
  return CIRCLED_NUMBERS[idx - 1] || `(${idx})`;
}

/**
 * 포맷 유형의 대표 예시 라벨 반환 (하단 독 표시용)
 */
export function getFormatSampleLabel(formatType) {
  switch (formatType) {
    case 'roman':
      return 'Ⅰ.';
    case 'number_dot':
      return '1.';
    case 'number_paren_right':
      return '1)';
    case 'number_paren_both':
      return '(1)';
    case 'hangul_dot':
      return '가.';
    case 'hangul_paren_right':
      return '가)';
    case 'hangul_paren_both':
      return '(가)';
    case 'circled_number':
      return '①';
    case 'bullet':
      return '•';
    case 'dash':
      return '-';
    case 'none':
      return '없음';
    default:
      return '1.';
  }
}

/**
 * 블록 배열을 순회하며 각 항목의 자동 번호(prefix)를 계산합니다.
 * 상위 위계가 등장하면 그보다 낮은(숫자가 큰) 하위 위계 카운터는 0으로 초기화됩니다.
 */
export function computeAutoNumbers(items, presets = ALL_HEAD_PRESETS, autoNumbering = true) {
  const counters = [0, 0, 0, 0, 0, 0, 0, 0]; // index 1~7 사용
  return items.map((item) => {
    const lvl = Math.min(7, Math.max(1, Number(item.level) || 1));
    if (!autoNumbering) {
      return { ...item, level: lvl, prefix: '' };
    }
    counters[lvl] += 1;
    // 현재 레벨보다 하위 레벨 카운터 리셋
    for (let sub = lvl + 1; sub <= 7; sub++) {
      counters[sub] = 0;
    }
    const preset = presets.find((p) => p.level === lvl) || ALL_HEAD_PRESETS[lvl - 1];
    const prefix = formatPrefix(counters[lvl], preset.format);
    return {
      ...item,
      level: lvl,
      prefix
    };
  });
}

/**
 * 사용자가 직접 입력한 앞머리 번호('1. ', '1) ', '(1) ', '가. ', '가) ', '(가) ', 'Ⅰ. ' 등)를 감지해
 * 해당하는 위계 레벨과 본문 텍스트를 분리해주는 유틸리티 (붙여넣기 보조용)
 */
export function detectPrefixAndLevel(rawText) {
  const trimmed = rawText.trimStart();
  const romanMatch = trimmed.match(/^(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]+|[I]{1,3}|IV|VI{0,3}|IX|X)\.\s+(.*)$/i);
  if (romanMatch) return { level: 1, text: romanMatch[1] };

  const bothParenHangulMatch = trimmed.match(/^\([가나다라마바사아자차카타파하]\)\s+(.*)$/);
  if (bothParenHangulMatch) return { level: 7, text: bothParenHangulMatch[1] };

  const rightParenHangulMatch = trimmed.match(/^[가나다라마바사아자차카타파하]\)\s+(.*)$/);
  if (rightParenHangulMatch) return { level: 6, text: rightParenHangulMatch[1] };

  const hangulDotMatch = trimmed.match(/^[가나다라마바사아자차카타파하]\.\s+(.*)$/);
  if (hangulDotMatch) return { level: 5, text: hangulDotMatch[1] };

  const bothParenMatch = trimmed.match(/^\(\d+\)\s+(.*)$/);
  if (bothParenMatch) return { level: 4, text: bothParenMatch[1] };

  const rightParenMatch = trimmed.match(/^\d+\)\s+(.*)$/);
  if (rightParenMatch) return { level: 3, text: rightParenMatch[1] };

  const numDotMatch = trimmed.match(/^\d+\.\s+(.*)$/);
  if (numDotMatch) return { level: 2, text: numDotMatch[1] };

  return null;
}

/**
 * 첫 접속 시 바로 쓸 수 있는 깨끗한 빈 문서 항목 생성
 */
export function createBlankDocumentItems() {
  return [
    {
      id: `item_${Date.now()}_1`,
      level: 1,
      text: '',
      collapsed: false
    }
  ];
}
