import ErrorView from "../src/components/ErrorView";

// 없는 주소로 들어오면 안내와 함께 메인으로 가는 링크를 보여준다.
export default function NotFound() {
  return (
    <ErrorView
      icon="🧭"
      title="페이지를 찾을 수 없어요"
      message="링크가 잘못됐거나 없어진 페이지예요."
    />
  );
}
