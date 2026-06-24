import "./globals.css";

export const metadata = {
  title: "US 마켓 터미널",
  description: "키 없는 공개 API로 만든 미국 주식 실시간 대시보드",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
