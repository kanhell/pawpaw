import { defineConfig } from "vitest/config";

// Windows에서 VS Code 터미널은 작업 폴더를 "c:\..."처럼 소문자 드라이브로 열 때가 있다.
// 그러면 테스트 파일과 vi.mock("./client")이 가리키는 모듈 경로의 대소문자가 달라져서
// mock이 적용되지 않고 진짜 Firebase를 초기화하다가 실패한다. 드라이브 문자를 대문자로 맞춘다.
const root = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());

export default defineConfig({
  test: { root },
});
