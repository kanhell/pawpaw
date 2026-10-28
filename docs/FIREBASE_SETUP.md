# Firebase 설정 (FIREBASE_SETUP)

보안 설계는 `SECURITY.md`, 데이터 구조는 `DATA_MODEL.md` 참고.

## 1. 프로젝트와 요금제

1. Firebase 콘솔에서 프로젝트를 만든다. **개발 전용 프로젝트**를 따로 만들고, 운영용은 규칙 확인을 마친 뒤에 만드는 것을 권장한다. (규칙이 아직 테스트되지 않았기 때문이다. `SECURITY.md` 참고)
2. **Blaze(종량제) 요금제로 업그레이드한다.** Cloud Storage는 Blaze 요금제 프로젝트에서만 쓸 수 있다. 무료 사용량은 Blaze에서도 유지된다. 예상치 못한 요금을 막기 위해 결제 예산 알림을 설정해 둔다.

## 2. 웹 앱 등록

1. 프로젝트 설정 → 내 앱 → 웹(`</>`) 앱을 추가한다.
2. 표시되는 설정값을 `apps/web/.env.local`에 넣는다. (`apps/web/.env.example` 참고)
3. `.env.local`은 Git에 올라가지 않는다. (Next.js 기본 `.gitignore`가 `.env*`를 제외한다)

## 3. 서비스 켜기

1. **Authentication** → 로그인 방법 → **익명**을 사용 설정한다.
2. **Firestore Database** → 데이터베이스 만들기 → 프로덕션 모드, 가까운 리전을 선택한다.
3. **Storage** → 시작하기 → 기본 버킷을 만든다.

## 4. 규칙 배포

### 방법 A: 콘솔에 붙여넣기 (간단)
1. Firestore Database → **규칙** 탭에 `firestore.rules` 내용을 붙여넣고 게시한다.
2. Storage → **규칙** 탭에 `storage.rules` 내용을 붙여넣고 게시한다.

### 방법 B: Firebase CLI
```bash
pnpm add -D -w firebase-tools
pnpm exec firebase login
pnpm exec firebase use --add          # 프로젝트 선택
pnpm exec firebase deploy --only firestore:rules,storage
```

Storage 규칙이 Firestore를 조회하므로 처음 배포할 때 서비스 간 권한 허용 안내가 뜰 수 있다.

## 5. 사진 보기를 위한 CORS 설정

앱은 다운로드 URL 대신 `getBlob()`으로 사진을 받으므로 버킷에 CORS 설정이 필요하다.

1. Google Cloud 콘솔(같은 프로젝트)에서 **Cloud Shell**을 연다.
2. `cors.json`을 만들고 버킷에 적용한다. 버킷 이름은 `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` 값이다.
   ```bash
   cat > cors.json << 'EOF'
   [
     {
       "origin": ["http://localhost:3000"],
       "method": ["GET"],
       "maxAgeSeconds": 3600,
       "responseHeader": ["Authorization", "Content-Type"]
     }
   ]
   EOF
   gcloud storage buckets update gs://<버킷이름> --cors-file=cors.json
   ```
3. 배포 주소가 생기면 `origin`에 추가한다.
4. 정확한 설정은 Firebase 문서의 "웹에서 파일 다운로드" 항목에서 확인한다.

## 6. 규칙 확인

규칙은 아직 테스트되지 않았다. 개발용 프로젝트에서 `SECURITY.md`의 "배포 전 확인" 표를 따라 확인한다. 콘솔의 규칙 플레이그라운드와, 일반 창·시크릿 창을 함께 쓴다.

## 7. 동작 확인

```bash
pnpm dev
```

1. `http://localhost:3000/room/new`에서 닉네임과 동물을 고르고 방을 만든다.
2. 자동으로 `/room/{방ID}/assign`으로 이동한다. **미션 뽑기**를 누른다.
3. **미션 하러 가기** → 사진을 올리고 제출한다.
4. 새로고침해도 미션과 사진이 유지되는지 확인한다.

현재는 방장 한 명만 방에 들어갈 수 있다. 다른 사람이 초대 코드로 참가하는 기능은 Cloud Function이 필요해서 아직 없다. (`SECURITY.md` 참고)

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| "Firebase 설정이 없어요" | `apps/web/.env.local`이 없거나 값이 비어 있다. 수정 후 `pnpm dev`를 다시 시작한다. |
| 로그인 실패 (`operation-not-allowed` 등) | Authentication에서 익명 로그인을 켜지 않았다. |
| "권한이 없어요" / `permission-denied` | 규칙을 배포하지 않았거나, 방 멤버가 아니거나, 마감이 지났다. 콘솔 Firestore 데이터에서 `rooms/{방ID}/members/{내 uid}` 문서가 있는지 확인한다. |
| 사진 업로드 시 402/403 | Storage를 쓰려면 Blaze 요금제여야 한다. |
| 사진이 올라갔는데 화면에 안 보임 | 버킷 CORS 설정(5번)이 필요하다. 브라우저 개발자 도구의 콘솔에서 CORS 오류를 확인한다. |
