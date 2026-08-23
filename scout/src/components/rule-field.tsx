import { useEffect, useRef } from "react";

/*
 * The blue field on the landing page.
 *
 * Each vertical rule is one parameter value in a version. The field has a
 * rhythm — an envelope that runs dense at the edges and thins through the
 * middle, drifting slowly — and three rules that refuse to follow it: full
 * tone, full width, standing clear of the pattern around them. Those are the
 * flagged values, and they are the only thing on this page that does not
 * belong to the system it sits in.
 *
 * The lens is a construction circle. Inside it the rules read a stop brighter,
 * which is the only depth cue the composition gets.
 */

const TAU = Math.PI * 2;

const PAPER = "235, 232, 225";
const BLUE = "#2323e6";
/** Flagged rules go to ink: unmistakable, and still only three colours. */
const INK = "22, 24, 28";

/** Rules that are flagged. The caption states this number, so it is shared. */
export const FLAGGED = 3;

/** Target spacing between rules, in CSS pixels. */
const PITCH = 20;
/** A rule never fills its whole column: the blue has to keep showing through. */
const MAX_FILL = 0.92;

/** Flagged rules are narrow on purpose: a mark, not a slab. */
const FLAG_FILL = 0.3;

/** How long a flagged rule holds before it moves to another value. */
const HOLD = 7000;
const FADE_OUT = 320;
const FADE_IN = 480;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

type Flag = { index: number; alpha: number; elapsed: number; leaving: boolean };

export function RuleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let count = 0;

    /** Flagged rules sit in the thin middle, where they read as anomalies. */
    function pick() {
      return Math.round(count * (0.3 + Math.random() * 0.42));
    }

    const flags: Flag[] = Array.from({ length: FLAGGED }, () => ({
      index: 0,
      alpha: 1,
      // Staggered so the three never change together.
      elapsed: -Math.random() * HOLD,
      leaving: false
    }));

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      count = Math.max(18, Math.round(width / PITCH));
      for (const flag of flags) flag.index = pick();
    }

    /** Width of rule `i` at time `t`, before the entrance is applied. */
    function ruleWidth(i: number, t: number, pitch: number) {
      const u = count > 1 ? i / (count - 1) : 0.5;

      // Dense at both edges, thin through the middle. This is the composition,
      // so it dominates; the drift only modulates it.
      const envelope = 0.62 * (0.5 + 0.5 * Math.cos(u * TAU)) + 0.38 * (1 - u);
      const drift = 0.5 + 0.5 * Math.sin(u * TAU * 1.5 - t * 0.32);
      const mix = envelope * (0.74 + 0.26 * drift);

      return pitch * MAX_FILL * (0.03 + 0.97 * mix ** 1.45);
    }

    function drawRules(t: number, reveal: number, alpha: number) {
      const pitch = width / count;
      ctx!.fillStyle = `rgba(${PAPER}, ${alpha})`;
      ctx!.beginPath();

      for (let i = 0; i < count; i++) {
        const u = count > 1 ? i / (count - 1) : 0.5;
        // Rules ignite behind the leading edge of the block, left to right.
        const born = easeOutCubic(clamp01((t - (0.3 + u * 0.55)) / 0.45));
        if (born <= 0) continue;

        const x = (i + 0.5) * pitch;
        if (x > width * reveal) continue;

        const w = ruleWidth(i, t, pitch) * born;
        ctx!.rect(x - w / 2, 0, w, height);
      }

      ctx!.fill();
    }

    function render(t: number, dt: number) {
      const pitch = width / count;
      const reveal = easeOutQuint(clamp01(t / 0.8));

      ctx!.fillStyle = BLUE;
      ctx!.fillRect(0, 0, width, height);

      // Base pass, then a second pass clipped to the lens so its interior sits
      // one stop brighter and the circle's edge reads without a stroke.
      drawRules(t, reveal, 0.32);

      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(width * 0.44, -height * 0.34, height * 0.96, 0, TAU);
      ctx!.clip();
      drawRules(t, reveal, 0.42);
      ctx!.restore();

      // The flagged rules: full tone, full column, ignoring the envelope.
      for (const flag of flags) {
        if (!reduced) {
          flag.elapsed += dt * 1000;

          if (!flag.leaving && flag.elapsed >= HOLD) {
            flag.leaving = true;
            flag.elapsed = 0;
          } else if (flag.leaving && flag.elapsed >= FADE_OUT) {
            flag.leaving = false;
            flag.elapsed = 0;
            flag.index = pick();
          }

          flag.alpha = flag.leaving
            ? 1 - clamp01(flag.elapsed / FADE_OUT)
            : clamp01(flag.elapsed / FADE_IN);
        }

        const x = (flag.index + 0.5) * pitch;
        if (x > width * reveal || flag.alpha <= 0.01) continue;

        const u = count > 1 ? flag.index / (count - 1) : 0.5;
        const born = easeOutCubic(clamp01((t - (0.3 + u * 0.55)) / 0.45));
        const w = pitch * FLAG_FILL;

        ctx!.fillStyle = `rgba(${INK}, ${flag.alpha * born})`;
        ctx!.fillRect(x - w / 2, 0, w, height);
      }

      // A blue wash under the wordmark, so it never sits on a bright rule.
      const wash = ctx!.createLinearGradient(0, 0, width * 0.42, height * 0.34);
      wash.addColorStop(0, "rgba(35, 35, 230, 0.78)");
      wash.addColorStop(1, "rgba(35, 35, 230, 0)");
      ctx!.fillStyle = wash;
      ctx!.fillRect(0, 0, width * 0.42, height * 0.34);
    }

    resize();

    let frame = 0;
    let last = 0;
    let elapsed = 0;

    function tick(now: number) {
      const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      render(elapsed, dt);
      frame = requestAnimationFrame(tick);
    }

    /** Reduced motion gets the composition, held past the entrance. */
    function still() {
      render(3, 0);
    }

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) still();
    });
    observer.observe(canvas);

    if (reduced) {
      still();
    } else {
      frame = requestAnimationFrame(tick);
    }

    function onVisibility() {
      if (reduced) return;
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (frame === 0) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
