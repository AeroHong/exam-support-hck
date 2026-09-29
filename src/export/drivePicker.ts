// Google Picker로 저장할 Drive 폴더(공유 드라이브 포함)를 고른다.
// drive.file 권한에서는 Picker로 사용자가 고른 폴더에만 파일을 만들 수 있다.

export interface DriveFolder {
  id: string;
  name: string;
}

const PICKER_KEY: string = import.meta.env.VITE_GOOGLE_PICKER_API_KEY ?? '';
const APP_ID: string = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? ''; // = 프로젝트 번호

export const pickerAvailable = Boolean(PICKER_KEY && APP_ID);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Gapi = any;
declare global {
  interface Window {
    gapi?: Gapi;
    google?: Gapi;
  }
}

let loading: Promise<void> | null = null;

function loadPicker(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Picker를 불러오지 못했습니다.')) });
    script.onerror = () => {
      loading = null;
      reject(new Error('Google API 스크립트를 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** 폴더를 고르면 {id, name}, 취소하면 null */
export async function pickDriveFolder(token: string): Promise<DriveFolder | null> {
  if (!pickerAvailable) throw new Error('VITE_GOOGLE_PICKER_API_KEY가 설정되지 않았습니다.');
  await loadPicker();
  const gp = window.google.picker;

  const myDrive = new gp.DocsView(gp.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder')
    .setParent('root');
  const sharedDrives = new gp.DocsView(gp.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder')
    .setEnableDrives(true);

  return new Promise((resolve) => {
    const picker = new gp.PickerBuilder()
      .setTitle('응시현황표를 저장할 폴더 선택')
      .setLocale('ko')
      .setOAuthToken(token)
      .setDeveloperKey(PICKER_KEY)
      .setAppId(APP_ID)
      .enableFeature(gp.Feature.SUPPORT_DRIVES)
      .addView(myDrive)
      .addView(sharedDrives)
      .setCallback((data: Gapi) => {
        const action = data[gp.Response.ACTION];
        if (action === gp.Action.PICKED) {
          const doc = data[gp.Response.DOCUMENTS][0];
          resolve({ id: doc[gp.Document.ID], name: doc[gp.Document.NAME] });
        } else if (action === gp.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
