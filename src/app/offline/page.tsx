import type { CSSProperties } from "react";
import Link from "next/link";

const pageStyle: CSSProperties = {
  display: "grid",
  minHeight: "100svh",
  alignContent: "center",
  justifyItems: "center",
  boxSizing: "border-box",
  padding: "max(32px, env(safe-area-inset-top, 0px)) 28px max(32px, env(safe-area-inset-bottom, 0px))",
  backgroundColor: "#F2EEE8",
  color: "#3E3A36",
  textAlign: "center",
  fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
};

const markStyle: CSSProperties = {
  display: "grid",
  width: 64,
  height: 76,
  boxSizing: "border-box",
  placeItems: "center",
  border: "2px solid #6E7B6A",
  borderRadius: "22px 22px 16px 16px",
  backgroundColor: "#FBF9F6",
  boxShadow: "0 8px 22px rgb(62 58 54 / 8%)",
};

const doorStyle: CSSProperties = {
  position: "relative",
  width: 29,
  height: 49,
  boxSizing: "border-box",
  border: "1.5px solid #6E7B6A",
  borderRadius: "12px 12px 3px 3px",
};

const knobStyle: CSSProperties = {
  position: "absolute",
  top: "calc(50% - 1.5px)",
  right: 4,
  width: 3,
  height: 3,
  borderRadius: "50%",
  backgroundColor: "#6E7B6A",
};

const eyebrowStyle: CSSProperties = {
  margin: "24px 0 2px",
  color: "#6E7B6A",
  fontFamily: '"Cormorant Garamond", "Times New Roman", serif',
  fontSize: 18,
  fontStyle: "italic",
  fontWeight: 600,
  letterSpacing: "0.04em",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: '"Noto Serif SC", "Songti SC", "STSong", serif',
  fontSize: "clamp(24px, 6vw, 30px)",
  fontWeight: 600,
};

const messageStyle: CSSProperties = {
  maxWidth: 320,
  margin: "10px 0 22px",
  color: "#857D75",
};

const retryStyle: CSSProperties = {
  display: "inline-flex",
  minWidth: 112,
  minHeight: 48,
  boxSizing: "border-box",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 20px",
  borderRadius: 999,
  backgroundColor: "#6E7B6A",
  color: "#FFFFFF",
  textDecoration: "none",
};

export default function OfflinePage() {
  return (
    <main style={pageStyle} aria-labelledby="offline-title">
      <div style={markStyle} aria-hidden="true">
        <span style={doorStyle}>
          <span style={knobStyle} />
        </span>
      </div>
      <p style={eyebrowStyle}>AI Wardrobe</p>
      <h1 id="offline-title" style={titleStyle}>现在无法连接网络</h1>
      <p style={messageStyle}>请检查网络连接后重试。你的衣橱内容需要联网才能安全加载。</p>
      <Link style={retryStyle} href="/">重新连接</Link>
    </main>
  );
}
