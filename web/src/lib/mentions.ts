// 0012 C-2 @멘션 인코딩/파싱 — 한 곳에만 존재(하드코딩 산발 금지).
//  - 저장/전송 형태: body 안에 `@[이름](uuid)` 리터럴. mentions 배열은 uuid만.
//  - 렌더: 세그먼트로 쪼개 칩 하이라이트(이름) + 나머지 텍스트.

export interface MentionToken {
  kind: 'text' | 'mention';
  text: string;          // text: 원문 조각 / mention: 표시 이름
  uuid?: string;         // mention일 때 대상 uuid
}

// `@[이름](uuid)` — 이름은 대괄호 밖 `]`·`)` 미포함, uuid는 소괄호 밖 `)` 미포함.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** body를 텍스트/멘션 세그먼트로 분해(렌더용). */
export function parseMentions(body: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ kind: 'text', text: body.slice(last, idx) });
    tokens.push({ kind: 'mention', text: m[1], uuid: m[2] });
    last = idx + m[0].length;
  }
  if (last < body.length) tokens.push({ kind: 'text', text: body.slice(last) });
  return tokens;
}

/** body에서 실제 등장한 멘션 uuid 배열(중복 제거) — 전송 시 mentions 필드. */
export function extractMentionUuids(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) out.add(m[2]);
  return [...out];
}

/** 멘션 리터럴 1개 조립. */
export function encodeMention(name: string, uuid: string): string {
  return `@[${name}](${uuid})`;
}
