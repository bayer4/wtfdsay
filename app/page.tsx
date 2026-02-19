"use client";

import html2canvas from "html2canvas";
import { CSSProperties, useRef, useState } from "react";

type TranslationAnnotation = {
  original: string;
  translation: string;
};

type TranslateResult = {
  annotations: TranslationAnnotation[];
  full_rewrite: string;
  why_it_sounds_like_that: string;
  buzzword_score: number;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sourceTweet, setSourceTweet] = useState("");
  const [downloadingCard, setDownloadingCard] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  async function handleSubmit() {
    if (!input) return;
    const hasUnsupportedUrl = /(https?:\/\/|x\.com|twitter\.com)/i.test(input);

    if (hasUnsupportedUrl) {
      setResult(null);
      setError(
        "Please paste the contents of the tweet itself for now — URLs aren’t supported yet."
      );
      return;
    }

    setError("");
    setLoading(true);
    setResult(null);
    setSourceTweet(input.trim());

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: input }),
      });

      const data = await res.json();
      setResult(data as TranslateResult);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function getBuzzwordBadgeStyle(score: number): CSSProperties {
    if (score >= 8) {
      return {
        backgroundColor: "#3f1d1d",
        color: "#fecaca",
        border: "1px solid #7f1d1d",
      };
    }
    if (score >= 5) {
      return {
        backgroundColor: "#3f2a1d",
        color: "#fed7aa",
        border: "1px solid #9a3412",
      };
    }
    return {
      backgroundColor: "#0f2f24",
      color: "#a7f3d0",
      border: "1px solid #065f46",
    };
  }

  function getBuzzwordBarColor(score: number) {
    if (score >= 8) return "#ef4444";
    if (score >= 5) return "#f97316";
    return "#10b981";
  }

  async function downloadShareCard() {
    if (!cardRef.current) return;
    try {
      setDownloadingCard(true);
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
      });
      const imageData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imageData;
      link.download = `wtf-translation-${Date.now()}.png`;
      link.click();
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingCard(false);
    }
  }

  const buzzwordScore = result?.buzzword_score ?? 0;
  const isLowBuzzword = buzzwordScore <= 1;
  const isMediumBuzzword = buzzwordScore >= 2 && buzzwordScore <= 4;
  const visibleAnnotations = result
    ? isMediumBuzzword
      ? result.annotations.slice(0, 2)
      : result.annotations
    : [];
  const showTranslation = !isLowBuzzword && visibleAnnotations.length > 0;
  const showWhyItSoundsLikeThat = buzzwordScore >= 5;

  return (
    <main className="min-h-screen p-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">
        wtf did they say?
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Translating AI/tech/crypto Twitter into normal English
      </p>

      <textarea
        className="w-full p-4 border rounded mb-2"
        rows={6}
        placeholder="Paste the tweet here..."
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (error) setError("");
        }}
      />
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <button
        onClick={handleSubmit}
        className="bg-black text-white px-6 py-2 rounded"
      >
        {loading ? "Translating..." : "Translate"}
      </button>

      {result && (
        <div className="mt-8 space-y-6">
          {showTranslation && (
            <div>
              <h2 className="font-bold text-lg">Translation</h2>
              <div className="mt-3 space-y-4">
                {visibleAnnotations.map((annotation, index) => (
                  <div key={`${annotation.original}-${index}`} className="space-y-1">
                    <p className="text-gray-400 dark:text-gray-500">
                      &quot;{annotation.original}&quot;
                    </p>
                    <p>→ {annotation.translation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="font-bold text-lg">Full Rewrite</h2>
            <p>{result.full_rewrite}</p>
          </div>

          {isLowBuzzword && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Already pretty normal ({buzzwordScore}/10).
            </p>
          )}

          {showWhyItSoundsLikeThat && (
            <div>
              <h2 className="font-bold text-lg">Why It Sounds Like That</h2>
              <p>{result.why_it_sounds_like_that}</p>
            </div>
          )}

          <div>
            <h2 className="font-bold text-lg">Buzzword Score</h2>
            <p>{result.buzzword_score}/10</p>
          </div>

          <div className="space-y-3 pt-2">
            <h2 className="font-bold text-lg">Share Card</h2>
            <div
              ref={cardRef}
              className="w-full max-w-[560px] rounded-xl p-5"
              style={{
                backgroundColor: "#0b0b0b",
                color: "#ffffff",
                border: "1px solid #222222",
              }}
            >
              <p
                className="text-sm italic"
                style={{
                  color: "#9ca3af",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                &quot;{sourceTweet}&quot;
              </p>

              <p
                className="mt-4 uppercase"
                style={{
                  color: "#9ca3af",
                  fontSize: "12px",
                  letterSpacing: "0.08em",
                  marginBottom: isLowBuzzword ? "4px" : "10px",
                }}
              >
                {isLowBuzzword ? "Already Normal" : "Plain English"}
              </p>

              {isLowBuzzword && (
                <p
                  style={{
                    color: "#6b7280",
                    fontSize: "12px",
                    marginBottom: "10px",
                  }}
                >
                  Already pretty normal ({buzzwordScore}/10).
                </p>
              )}

              <p className="text-[22px] leading-8">{result.full_rewrite}</p>

              <div className="mt-5 flex items-center justify-between">
                <span
                  className="rounded-full text-sm font-medium"
                  style={{
                    ...getBuzzwordBadgeStyle(result.buzzword_score),
                    padding: "4px 12px",
                  }}
                >
                  Buzzword Score: {result.buzzword_score}/10
                </span>

                <div
                  className="h-2 w-24 overflow-hidden rounded-full"
                  style={{ backgroundColor: "#374151" }}
                >
                  <div
                    className="h-full"
                    style={{
                      backgroundColor: getBuzzwordBarColor(result.buzzword_score),
                      width: `${Math.max(0, Math.min(10, result.buzzword_score)) * 10}%`,
                    }}
                  />
                </div>
              </div>

              <p className="mt-5 text-right" style={{ color: "#a1a1aa", fontSize: "14px" }}>
                wtfdsay.com
              </p>
            </div>

            <div>
              <button
                onClick={downloadShareCard}
                className="bg-black text-white px-6 py-2 rounded"
              >
                {downloadingCard ? "Exporting..." : "Download Share Card"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
