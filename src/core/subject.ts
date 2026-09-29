// 과목명 표기 차이(공백·줄바꿈·로마숫자)를 흡수한다. (legacy code.gs normalizeSubject)
export function normalizeSubject(str: string): string {
  return String(str)
    .replace(/\s/g, '')
    .replace(/Ⅰ/g, '1')
    .replace(/Ⅱ/g, '2')
    .replace(/Ⅲ/g, '3')
    .trim();
}

export function findSubjectColumn(headers: string[], subject: string): string | null {
  const target = normalizeSubject(subject);
  return headers.find((h) => normalizeSubject(h) === target) ?? null;
}

/** 5자리 학번: 학년 + 반(2) + 번호(2) */
export function makeHakbeon(grade: string, ban: number, num: number): string {
  const g = String(grade).replace('학년', '');
  return g + String(Math.round(ban)).padStart(2, '0') + String(Math.round(num)).padStart(2, '0');
}

export function gradeNumber(grade: string): string {
  return String(grade).replace('학년', '');
}

export function homeRoom(grade: string, ban: number): string {
  return `${gradeNumber(grade)}-${ban}`;
}
