"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <html lang="ja">
      <body className="bg-gray-100">
        <div className="phone-size-wrapper">
          <div className="header">
            <img src="/logo.png" alt="Logo" className="header-logo" />
          </div>

          {/* タブメニュー */}
          <div className="tab-container">
            <Link
              href="/battle"
              className={`tab-button ${pathname === "/battle" ? "active" : ""}`}
            >
              バトル動画
            </Link>
            <Link
              href="/frame"
              className={`tab-button ${pathname === "/frame" ? "active" : ""}`}
            >
              フレーム
            </Link>
          </div>

          {/* 各ページの中身 */}
          <div className="tab-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
