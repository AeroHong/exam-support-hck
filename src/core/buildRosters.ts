import type {
  Issue,
  ParsedWorkbook,
  PlanRow,
  RoomKind,
  RoomRules,
  RoomSheet,
  Student,
  SubjectRoster,
  VacancyItem,
} from './types';
import { DEFAULT_RULES, SEAT_ROWS } from './types';
import { parseRoomCell } from './roomCell';
import { findSubjectColumn, gradeNumber, homeRoom, makeHakbeon } from './subject';

export interface BuildOptions {
  rules?: RoomRules;
  vacancies?: VacancyItem[];
}

export interface BuildResult {
  rosters: SubjectRoster[];
  issues: Issue[];
}

interface RoomBucket {
  kind: RoomKind;
  main: Student[];
  doum: Student[];
  separate: Student[];
}

export function subjectKeyOf(p: PlanRow): string {
  return `${p.dateStr}|${p.period}|${p.grade}|${p.subject}`;
}

const byClassNum = (a: Student, b: Student) => a.ban - b.ban || a.num - b.num;

/** "1-2" < "1-10" < "교과3" < 기타 */
function roomSortKey(name: string): [number, number, number, string] {
  const m = name.match(/^(\d+)-(\d+)$/);
  if (m) return [0, Number(m[1]), Number(m[2]), name];
  const s = name.match(/^교과(\d+)$/);
  if (s) return [1, Number(s[1]), 0, name];
  return [2, 0, 0, name];
}

function compareRooms(a: string, b: string): number {
  const ka = roomSortKey(a);
  const kb = roomSortKey(b);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (ka[i] as number) - (kb[i] as number);
  return ka[3].localeCompare(kb[3], 'ko');
}

const KIND_ORDER: Record<RoomKind, number> = { normal: 0, doum: 1, separate: 2, waiting: 3 };

function classesOf(students: Student[]): string[] {
  const set = new Set(students.map((s) => homeRoom(s.grade, s.ban)));
  return [...set].sort(compareRooms);
}

export function buildRosters(wb: ParsedWorkbook, opts: BuildOptions = {}): BuildResult {
  const rules = opts.rules ?? DEFAULT_RULES;
  const vacancies = opts.vacancies ?? [];
  const issues: Issue[] = [];
  const rosters: SubjectRoster[] = [];
  const seenKeys = new Set<string>();

  for (const plan of wb.plan) {
    const subjectKey = subjectKeyOf(plan);
    const label = `${plan.dateStr} ${plan.period}교시 ${plan.grade} ${plan.subject}`;
    if (seenKeys.has(subjectKey)) {
      issues.push({ level: 'warn', subjectKey, message: `[${label}] 시험 계획에 같은 행이 두 번 있습니다(${plan.row}행). 한 번만 만듭니다.` });
      continue;
    }
    seenKeys.add(subjectKey);

    const sheet = wb.grades.find((g) => g.grade === plan.grade);
    if (!sheet) {
      issues.push({ level: 'error', subjectKey, message: `[${label}] '${plan.grade} 응시현황' 시트가 없습니다.` });
      continue;
    }
    const column = findSubjectColumn(sheet.headers, plan.subject);
    if (!column) {
      issues.push({ level: 'error', subjectKey, message: `[${label}] 응시현황 시트에 '${plan.subject}' 열이 없습니다.` });
      continue;
    }

    const rooms = new Map<string, RoomBucket>();
    const bucket = (name: string, kind: RoomKind) => {
      let b = rooms.get(name);
      if (!b) {
        b = { kind, main: [], doum: [], separate: [] };
        rooms.set(name, b);
      }
      return b;
    };
    const specials: { student: Student; kind: 'doum' | 'separate'; owner: string; explicit: boolean }[] = [];
    const unknowns: string[] = [];
    const unrecognized = new Map<string, number>();
    let fromDate = 0;

    for (const st of sheet.students) {
      const parsed = parseRoomCell(st.cells[column], rules);
      if (!parsed) continue;
      const student: Student = { grade: st.grade, ban: st.ban, num: st.num, name: st.name, gender: st.gender };
      if (parsed.fromDate) fromDate++;

      switch (parsed.kind) {
        case 'normal':
          bucket(parsed.room, 'normal').main.push(student);
          break;
        case 'waiting':
          bucket(parsed.room, 'waiting').main.push(student);
          break;
        case 'doum':
        case 'separate':
          bucket(parsed.room, parsed.kind).main.push(student);
          specials.push({
            student,
            kind: parsed.kind,
            owner: parsed.owner ?? homeRoom(st.grade, st.ban),
            explicit: parsed.owner !== null,
          });
          break;
        case 'unknownOwner':
          unknowns.push(`${makeHakbeon(st.grade, st.ban, st.num)} ${st.name}(${parsed.raw})`);
          break;
        case 'unrecognized':
          unrecognized.set(parsed.raw, (unrecognized.get(parsed.raw) ?? 0) + 1);
          break;
        case 'excluded':
          break;
      }
    }

    // 도움실/별도실 학생을 소속 고사실 요약표에 연결
    for (const sp of specials) {
      const target = rooms.get(sp.owner);
      if (target && target.kind === 'normal') {
        (sp.kind === 'doum' ? target.doum : target.separate).push(sp.student);
      } else if (sp.explicit) {
        const b = bucket(sp.owner, 'normal');
        (sp.kind === 'doum' ? b.doum : b.separate).push(sp.student);
      }
    }

    if (fromDate > 0) {
      issues.push({ level: 'info', subjectKey, message: `[${label}] 날짜로 바뀐 셀 ${fromDate}개를 고사실 번호로 복원했습니다.` });
    }
    for (const [raw, n] of unrecognized) {
      issues.push({ level: 'warn', subjectKey, message: `[${label}] 알 수 없는 값 '${raw}' ${n}건 — 명단에서 빠졌습니다.` });
    }

    const skipped = unknowns.length > 0;
    if (skipped) {
      issues.push({ level: 'error', subjectKey, message: `[${label}] 소속 미확인(?) 학생이 있어 건너뜁니다: ${unknowns.join(', ')}` });
    }

    const gNum = gradeNumber(plan.grade);
    const sheets: RoomSheet[] = [...rooms.entries()]
      .sort(([na, a], [nb, b]) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || compareRooms(na, nb))
      .map(([roomName, b]) => {
        b.main.sort(byClassNum);
        b.doum.sort(byClassNum);
        b.separate.sort(byClassNum);
        const everyone = [...b.main, ...b.doum, ...b.separate];
        const classes = classesOf(everyone);

        // 결번은 '학급 = 고사실'인 경우에만 표시 (선택과목 혼합반에는 의미 없음)
        let vac: string[] = [];
        let voc: string[] = [];
        const home = roomName.match(/^(\d+)-(\d+)$/);
        if (b.kind === 'normal' && home && home[1] === gNum && classes.length === 1 && classes[0] === roomName) {
          const prefix = gNum + home[2].padStart(2, '0');
          const mine = vacancies.filter((v) => v.hakbeon.startsWith(prefix));
          vac = mine.filter((v) => v.type === '결번').map((v) => v.hakbeon).sort();
          voc = mine.filter((v) => v.type === '직업반').map((v) => v.hakbeon).sort();
        }

        if (b.kind !== 'waiting' && b.main.length > SEAT_ROWS) {
          issues.push({ level: 'warn', subjectKey, message: `[${label}] ${roomName} 응시자가 ${b.main.length}명으로 한 장(${SEAT_ROWS}석)을 넘습니다.` });
        }

        return {
          key: `${subjectKey}|${roomName}`,
          subjectKey,
          dateStr: plan.dateStr,
          period: plan.period,
          grade: plan.grade,
          subject: plan.subject,
          code: plan.code,
          timeRange: plan.timeRange,
          roomName,
          kind: b.kind,
          classes,
          main: b.main,
          doum: b.doum,
          separate: b.separate,
          vacancies: vac,
          vocational: voc,
        };
      });

    if (sheets.length === 0) {
      issues.push({ level: 'warn', subjectKey, message: `[${label}] 배정된 학생이 없습니다.` });
    }

    rosters.push({
      subjectKey,
      dateStr: plan.dateStr,
      period: plan.period,
      grade: plan.grade,
      subject: plan.subject,
      code: plan.code,
      timeRange: plan.timeRange,
      sheets,
      skipped,
    });
  }

  rosters.sort(
    (a, b) =>
      a.dateStr.localeCompare(b.dateStr) || a.grade.localeCompare(b.grade) || a.period - b.period,
  );
  return { rosters, issues };
}
