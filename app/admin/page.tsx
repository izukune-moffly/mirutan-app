"use client";

import { useState, useEffect } from "react"; // ← useEffect を追加
import { db, storage, auth } from "@/libs/firebase/firebase"; // ← auth も export しておく
import { collection, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { v4 as uuid } from "uuid";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import styles from "./page.module.css";

type FormState = "idle" | "uploading" | "done" | "error";

export default function AdminPage() {
  // ← Hooks はコンポーネント本体の“最上位”で呼ぶ
  useEffect(() => {
    // 未ログインなら匿名ログイン（開発用）
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) signInAnonymously(auth).catch(console.error);
    });
    return () => unsub();
  }, []);

  const [title, setTitle] = useState("");
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState<string>(""); // yyyy-mm-dd
  const [contrib1, setContrib1] = useState("");
  const [contrib2, setContrib2] = useState("");
  const [contrib3, setContrib3] = useState("");

  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);

  const [state, setState] = useState<FormState>("idle");
  const [progress, setProgress] = useState<number>(0);

  const handleThumbSelect = (f: File | undefined) => {
    if (!f) return;
    setThumbFile(f);
    const url = URL.createObjectURL(f);
    setThumbPreview(url);
  };

  const handleSubmit = async () => {
    if (!videoFile) {
      alert("動画ファイルを選択してください");
      return;
    }
    if (!thumbFile) {
      alert("サムネイル画像を選択してください");
      return;
    }
    if (!title.trim()) {
      alert("タイトルを入力してください");
      return;
    }
    setState("uploading");
    setProgress(0);

    try {
      const id = uuid();

      // 1) サムネをStorageへ
      const thumbPath = `thumbs/${id}-${thumbFile.name}`;
      const thumbRef = ref(storage, thumbPath);
      await uploadBytesResumable(thumbRef, thumbFile, {
        contentType: thumbFile.type,
      });
      const thumbURL = await getDownloadURL(thumbRef);

      // 2) 動画をStorageへ（進捗バー）
      const videoPath = `videos/${id}-${videoFile.name}`;
      const videoRef = ref(storage, videoPath);
      const task = uploadBytesResumable(videoRef, videoFile, {
        contentType: videoFile.type,
      });

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const pct = Math.round(
              (snap.bytesTransferred / snap.totalBytes) * 100
            );
            setProgress(pct);
          },
          (err) => reject(err),
          () => resolve()
        );
      });
      const videoURL = await getDownloadURL(videoRef);

      // 3) Firestoreへ書き込み
      const data = {
        title,
        src: videoURL, // 再生URL
        thumb: thumbURL, // サムネURL
        storage: { videoPath, thumbPath },
        opponent,
        matchDate: matchDate || null,
        contributors: [contrib1, contrib2, contrib3].filter(Boolean),
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(collection(db, "videos"), id), data);
      setState("done");
      setProgress(100);

      // 初期化
      setTitle("");
      setOpponent("");
      setMatchDate("");
      setContrib1("");
      setContrib2("");
      setContrib3("");
      setThumbFile(null);
      setVideoFile(null);
      setThumbPreview(null);
    } catch (e) {
      console.error(e);
      setState("error");
    }
  };

  return (
    <div className={styles.container}>
      <h1>動画登録（管理）</h1>

      <label className="block">タイトル</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="例）サンプル動画 5"
        className={styles.input}
      />

      <div className={`${styles.grid} ${styles["cols-2"]} ${styles.section}`}>
        <div>
          <label className="block">対戦相手</label>
          <input
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="例）みるたん"
            className={styles.input}
          />
        </div>
        <div>
          <label className="block">対戦日</label>
          <input
            type="date"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>

      <div className={`${styles.grid} ${styles["cols-3"]} ${styles.section}`}>
        <div>
          <label className="block">貢献者１</label>
          <input
            value={contrib1}
            onChange={(e) => setContrib1(e.target.value)}
            placeholder="A"
            className={styles.input}
          />
        </div>
        <div>
          <label className="block">貢献者２</label>
          <input
            value={contrib2}
            onChange={(e) => setContrib2(e.target.value)}
            placeholder="B"
            className={styles.input}
          />
        </div>
        <div>
          <label className="block">貢献者３</label>
          <input
            value={contrib3}
            onChange={(e) => setContrib3(e.target.value)}
            placeholder="C"
            className={styles.input}
          />
        </div>
      </div>

      <div className={`${styles.grid} ${styles["cols-2"]} ${styles.section}`}>
        <div className={styles.fileBlock}>
          <label className="block">サムネイル画像</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleThumbSelect(e.target.files?.[0])}
          />
          {thumbPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbPreview}
              alt="thumb preview"
              className={styles.thumbPreview}
            />
          )}
        </div>

        <div className={styles.fileBlock}>
          <label className="block">動画ファイル</label>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/*"
            onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
          />
          <p className={styles.help}>※ MP4(H.264/AAC)推奨</p>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleSubmit}
          className={styles.button}
          disabled={state === "uploading"}
        >
          {state === "uploading" ? `アップロード中… ${progress}%` : "登録する"}
        </button>

        <div
          className={styles.progressWrap}
          aria-hidden={state !== "uploading"}
        >
          <div
            className={styles.progressBar}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {state === "done" && (
        <p className={`${styles.msg} ${styles.success}`}>登録しました！</p>
      )}
      {state === "error" && (
        <p className={`${styles.msg} ${styles.error}`}>
          エラーが発生しました。
        </p>
      )}
    </div>
  );
}
