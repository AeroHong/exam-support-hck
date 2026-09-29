# 응시현황표 제작 도구

응시현황 엑셀(`N학년 응시현황` + `과목별 시험 계획` 시트)을 올리면 **과목별·고사실별 A4 한 장짜리 응시현황표**를 만듭니다.
결과물은 브라우저 인쇄/PDF, XLSX(과목별 파일, ZIP으로 묶음), Google 스프레드시트(Drive) 중에서 골라 받을 수 있습니다.
기존 Apps Script(`legacy/apps-script/`)를 웹으로 옮긴 것입니다.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # fixtures/2026-2-mid.xlsx 가 있으면 실제 데이터로도 검증
npm run build
```

`.env`가 없으면 **로컬 모드**로 동작합니다. 로그인과 저장 없이 업로드 → 검증 → 인쇄/XLSX까지 쓸 수 있습니다.

## 구조

| 경로 | 역할 |
|---|---|
| `src/core/` | 순수 TS 도메인 로직(React·Firebase 의존 없음). 다른 앱에 통합할 때 이 폴더를 그대로 옮기면 됩니다 |
| `src/export/` | 인쇄(A4 HTML), XLSX(ExcelJS), Google Sheets(REST) |
| `src/firebase/` | Google 로그인(도메인 제한), Firestore 저장소 |
| `src/pages/`, `src/components/` | MUI 화면 |

### 셀 값 처리 규칙 (`src/core/roomCell.ts`)

| 셀 값 | 처리 |
|---|---|
| `2-1`, 날짜로 바뀐 값(2월 7일 → `2-7`), `교과3` | 일반 고사실 |
| `도움실/1-1` | 1-1 현황표 요약표(응시2도움실)에 넣고, 도움실 현황표에도 넣음 |
| `도움실`(소속 없음) | 소속을 본인 학급으로 추정 |
| `★교과2★`, `★교과2★/1-6` | 별도 고사실 `교과2` (응시3별도실) |
| `(대기실)`, `멀티실`, `영어교과실`, `토의토론실` | 대기실 현황표(50명이 넘으면 여러 장) |
| `★하교`, `(미등교)`, 빈칸 | 제외 |
| `도움실/?` | 그 과목은 건너뛰고 오류로 표시 |

## Firebase 설정 (새 프로젝트)

1. Firebase 콘솔에서 프로젝트를 만들고 **Authentication → Google** 로그인을 켭니다.
2. **Firestore**를 만들고, `firestore.rules`의 `SCHOOL_DOMAIN`을 학교 도메인으로 바꾼 뒤 `firebase deploy --only firestore:rules`로 배포합니다.
3. 웹 앱을 등록하고 설정값을 `.env`에 넣습니다(`.env.example` 참고).
4. 권한은 smart-teachers-office와 같은 구조입니다.
   - **관리자**: `users/{uid}.role`이 `admin`(또는 `school_admin`)이고 `schoolId`가 같은 계정. 처음 한 명은 콘솔에서 `role`을 바꿉니다.
   - **담당교사**: 관리자가 앱의 '사용자 관리'에서 이메일로 지정합니다(`schools/{schoolId}/examRosterManagers/{emailToDocId}`).
     아직 로그인한 적 없는 교사도 미리 지정할 수 있고, 처음 로그인하면 바로 사용합니다. 자료 삭제·사용자 관리만 못 합니다.
   - 지정되지 않은 계정은 로그인해도 '사용 권한이 없습니다' 화면만 보이고, 보안 규칙에서 데이터가 차단됩니다.
   - 관리자는 '사용자 관리'에서 다른 사람에게 관리자 권한을 줄 수 있습니다(`examRosterManagers.role: 'admin'`).
   - 규칙 테스트: `npm run test:rules` (Firestore 에뮬레이터, Java 필요)

### 화면 구조
- **시험 자료**(첫 화면): 저장된 시험 자료 목록 + 새 엑셀 올리기. 올리면 바로 시험 자료 문서가 만들어집니다.
- 시험 자료를 열면 `/exams/{id}/` 아래 **데이터 수정 · 응시현황표 · 결번 관리** 탭. 결번 목록도 시험 자료 문서에 저장됩니다.
- **활동 기록**: 로그인·접근 거부·업로드·교체·열기·저장(바뀐 내용)·인쇄·XLSX/Google 시트 내보내기·수정본 내려받기·사용자/권한 변경·삭제.
  `schools/{schoolId}/activityLogs` — 본인 이름·서버 시각으로만 추가, 누구도 수정·삭제 불가(규칙으로 강제).
  데이터 저장·삭제·사용자 변경은 기록과 같은 batch로 써서 함께 성공하거나 함께 실패합니다.
5. Google 시트로 내보내려면 Google Cloud 콘솔(같은 프로젝트)에서 **Google Sheets API**와 **Google Drive API**를 켜고,
   OAuth 동의 화면을 **내부**로 설정한 다음 `drive.file`, `spreadsheets` 스코프를 추가합니다.

Firestore 구조는 smart-teachers-office와 맞춰 두었습니다.

```
/users/{uid}                                  { email, name, role, schoolId }
/schools/{schoolId}/exams/{examId}            { title, sourceFileName, plan[], createdBy, updatedAt }
/schools/{schoolId}/exams/{examId}/grades/{g} { grade, headers[], students[] }
/schools/{schoolId}/vacancies/{year}          { items: [{ hakbeon, type: '결번'|'직업반', note }] }
```

## Vercel 배포

1. GitHub 저장소에 push합니다. 원본 엑셀과 `fixtures/`는 개인정보가 들어 있어 `.gitignore`로 제외돼 있습니다.
2. Vercel에서 저장소를 가져옵니다(Framework: Vite, Build: `npm run build`, Output: `dist`).
3. Vercel 환경변수에 `.env`와 같은 값을 넣습니다.
4. Firebase Authentication → 설정 → **승인된 도메인**에 Vercel 도메인(`*.vercel.app` 또는 연결한 도메인)을 추가합니다.
