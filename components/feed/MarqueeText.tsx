// components/feed/MarqueeText.tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface MarqueeTextProps {
  text: string;
  className?: string;
}

export default function MarqueeText({ text, className = "" }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const check = () => {
      setOverflowing(content.scrollWidth > container.clientWidth + 4);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  if (!overflowing) {
    return (
      <div ref={containerRef} className="w-full overflow-hidden">
        <span ref={contentRef} className={`inline-block truncate ${className}`}>
          {text}
        </span>
      </div>
    );
  }

  // .animate-marquee no trae animation-duration en globals.css a propósito
  // (cada uso la define según su propio contenido) — sin esto el texto no se
  // mueve, ya que la duración por defecto del navegador es 0s.
  const durationSeconds = Math.max(text.length * 0.18, 6);

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        className="animate-marquee flex w-max gap-12"
        style={
          {
            "--marquee-shift": "50%",
            animationDuration: `${durationSeconds}s`,
          } as React.CSSProperties
        }
      >
        <span className={`whitespace-nowrap ${className}`}>{text}</span>
        <span className={`whitespace-nowrap ${className}`} aria-hidden>
          {text}
        </span>
      </div>
    </div>
  );
}