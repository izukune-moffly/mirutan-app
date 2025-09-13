"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import styles from "./page.module.css";

import { db, auth } from "@/libs/firebase/firebase";
import { signInAnonymously } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

type VideoDoc = {
  title: string;
  src: string;
  thumb: string;
  opponent?: string;
  matchDate?: string;
  contributors?: string[];
  createdAt?: unknown; // Firestore Timestamp など
};

type VideoItem = {
  id: string;
  title: string;
  src: string;
  thumb: string;
  opponent?: string;
  matchDate?: string;
  contributors?: string[];
};

const WHEEL_CLOSE_THRESHOLD = 120;
const SWIPE_X_THRESHOLD = 80;
const SWIPE_Y_THRESHOLD = 100;
const SWIPE_X_DISTANCE = 200;
const SWIPE_Y_DISTANCE = 240;

// 日本語も含めた簡易正規化（大文字小文字・全半角・かなカナを統一）
function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60)); // ひら→カナ
}

export default function BattlePage() {
  const [list, setList] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<VideoItem | null>(null);

  // 検索
  const [qstr, setQstr] = useState("");

  // 再生中のみジェスチャー有効
  const [isPlaying, setIsPlaying] = useState(false);

  // アニメーション用
  const [isClosing, setIsClosing] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const wheelAccumRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const closeHard = useCallback(() => {
    setActive(null);
    setIsPlaying(false);
    setIsClosing(false);
    setDragX(0);
    setDragY(0);
    wheelAccumRef.current = 0;
    touchStartRef.current = null;
  }, []);

  const closeSoft = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => closeHard(), 260);
  }, [closeHard]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSoft();
    },
    [closeSoft]
  );

  // 初回ロード
  useEffect(() => {
    (async () => {
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
        const q = query(collection(db, "videos"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setList(
          snap.docs.map((d) => {
            const v = d.data() as VideoDoc; // ★ any を使わない
            return {
              id: d.id,
              title: v.title ?? "",
              src: v.src ?? "",
              thumb: v.thumb ?? "",
              opponent: v.opponent ?? undefined,
              matchDate: v.matchDate ?? undefined,
              contributors: v.contributors ?? [],
            };
          })
        );
      } catch (e) {
        console.error("load videos failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Esc & body scroll lock
  useEffect(() => {
    if (active) {
      document.addEventListener("keydown", onKeyDown);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.body.style.overflow = "";
      };
    }
  }, [active, onKeyDown]);

  // ホイールで閉じる（再生中のみ）
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isPlaying) return;
      if (e.deltaY <= 0) return;
      wheelAccumRef.current += e.deltaY;
      setDragY((y) => Math.min(y + e.deltaY * 0.4, SWIPE_Y_DISTANCE));
      if (wheelAccumRef.current >= WHEEL_CLOSE_THRESHOLD) {
        closeSoft();
      }
    },
    [isPlaying, closeSoft]
  );

  // スワイプで閉じる（右/下）
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isPlaying) return;
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
      setDragX(0);
      setDragY(0);
    },
    [isPlaying]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isPlaying || !touchStartRef.current) return;
      const t = e.touches[0];
      const dx = Math.max(0, t.clientX - touchStartRef.current.x);
      const dy = Math.max(0, t.clientY - touchStartRef.current.y);
      setDragX(dx);
      setDragY(dy);
    },
    [isPlaying]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isPlaying || !touchStartRef.current) return;
    const shouldClose =
      (dragX > SWIPE_X_THRESHOLD && dragX > Math.abs(dragY)) ||
      (dragY > SWIPE_Y_THRESHOLD && dragY >= Math.abs(dragX));
    if (shouldClose) closeSoft();
    else {
      setDragX(0);
      setDragY(0);
    }
    touchStartRef.current = null;
  }, [isPlaying, dragX, dragY, closeSoft]);

  // 背景の暗さ
  const progressX = Math.min(dragX / SWIPE_X_DISTANCE, 1);
  const progressY = Math.min(dragY / SWIPE_Y_DISTANCE, 1);
  const progress = Math.max(progressX, progressY);
  const overlayAlpha = 0.8 * (1 - 0.6 * progress);

  // モーダル本体の見た目
  const translateY = dragY * 0.6;
  const translateX = dragX * 0.5;
  const scale = 1 - 0.05 * progress;
  const modalStyle: React.CSSProperties = {
    transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
    opacity: 1 - 0.4 * progress,
  };

  // 検索（クライアント側フィルタ）
  const filtered = useMemo(() => {
    const qn = norm(qstr);
    return list.filter((v) => {
      if (!qn) return true;
      const fields = [
        v.title,
        v.opponent,
        v.matchDate,
        ...(v.contributors || []),
      ]
        .filter(Boolean)
        .map((s) => norm(String(s)));
      return fields.some((f) => f.includes(qn));
    });
  }, [list, qstr]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {/* 検索バー */}
        <div className={styles.searchBar}>
          <input
            type="search"
            value={qstr}
            onChange={(e) => setQstr(e.target.value)}
            className={styles.searchInput}
            placeholder="タイトル・対戦相手・貢献者・日付 で検索"
            aria-label="動画検索"
          />
          {qstr && (
            <button className={styles.searchClear} onClick={() => setQstr("")}>
              クリア
            </button>
          )}
        </div>

        {loading ? (
          <div className={styles.loadingWrapper}>
            <span className={styles.loadingIcon}>🍨</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            該当する動画がありません。キーワードを変えてみてください。
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((v) => (
              <button
                key={v.id}
                className={styles.card}
                onClick={() => setActive(v)}
                aria-label={`${v.title} を再生`}
              >
                <div className={styles.thumbWrapper}>
                  <Image
                    src={v.thumb || "/placeholder-9x16.jpg"}
                    alt={v.title}
                    fill
                    sizes="(max-width: 720px) 50vw, 360px"
                    className={styles.thumb}
                    priority={false}
                  />
                </div>
                <div className={styles.title}>{v.title}</div>
                {(v.matchDate || (v.contributors?.length ?? 0) > 0) && (
                  <div className={styles.metaLine}>
                    {v.matchDate && <span>{v.matchDate}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* モーダル（動画再生） */}
      {active && (
        <div
          className={`${styles.modalOverlay} ${
            isClosing ? styles.overlayClosing : ""
          }`}
          onClick={closeSoft}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ background: `rgba(0,0,0,${overlayAlpha})` }}
        >
          <div
            className={`${styles.modalFull} ${
              isClosing ? styles.modalClosing : ""
            }`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={!isClosing ? modalStyle : undefined}
            onTransitionEnd={(e) => {
              if (isClosing && e.target === e.currentTarget) closeHard();
            }}
          >
            <video
              key={active.id}
              ref={videoRef}
              className={styles.videoFull}
              src={active.src}
              controls
              autoPlay
              muted
              playsInline
              onPlay={() => {
                setIsPlaying(true);
                wheelAccumRef.current = 0;
              }}
              onPause={() => setIsPlaying(false)}
            />
            <div className={styles.modalControls}>
              <a href={active.src} download className={styles.downloadBtn}>
                ⬇ ダウンロード
              </a>
              <button
                className={styles.closeBtn}
                onClick={closeSoft}
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            {/* メタ情報 */}
            <div className={styles.metaBox}>
              <div className={styles.metaTitle}>{active.title}</div>
              {active.opponent && <div>対戦相手：{active.opponent}</div>}
              {active.matchDate && <div>対戦日：{active.matchDate}</div>}
              {active.contributors?.length ? (
                <div>貢献者：{active.contributors.join(" / ")}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
