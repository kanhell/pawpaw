import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// NEXT_PUBLIC_ 변수는 빌드할 때 코드에 치환되므로 process.env.XXX 형태 그대로 써야 한다.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
}

let services: FirebaseServices | null = null;

/**
 * Firebase를 처음 쓰는 시점에 초기화한다. (브라우저에서만 호출할 것)
 * 서버 렌더링 중에 환경변수가 없어도 빌드가 깨지지 않도록 모듈 로드 시점에는 초기화하지 않는다.
 */
export function getFirebase(): FirebaseServices {
  if (services) return services;

  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error(
      "Firebase 설정이 없어요. apps/web/.env.local을 확인해 주세요. (docs/FIREBASE_SETUP.md)",
    );
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  services = { app, auth, db, storage };
  return services;
}
