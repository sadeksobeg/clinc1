"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { BrandMarkFloating } from "@/components/brand/BrandMarkSvg";

export function HeroMockupTilt({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 180, damping: 22 });
  const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 180, damping: 22 });

  if (reduceMotion) {
    return <div className="mockup-ring relative">{children}</div>;
  }

  return (
    <motion.div
      className="mockup-ring relative [perspective:1200px]"
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      animate={{ y: [0, -12, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

export function HeroBackdrop() {
  const floats: Array<{ top: string; left: string; delay: number; scale: number }> = [
    { top: "8%", left: "6%", delay: 0, scale: 0.55 },
    { top: "18%", left: "78%", delay: 1.2, scale: 0.45 },
    { top: "62%", left: "12%", delay: 2.1, scale: 0.4 },
    { top: "72%", left: "68%", delay: 0.8, scale: 0.5 },
    { top: "40%", left: "88%", delay: 1.8, scale: 0.35 },
  ];

  return (
    <>
      <div className="hero-aurora hero-aurora-a pointer-events-none absolute inset-0" aria-hidden />
      <div className="hero-aurora hero-aurora-b pointer-events-none absolute inset-0" aria-hidden />
      <div className="hero-aurora hero-aurora-c pointer-events-none absolute inset-0" aria-hidden />
      <div className="hero-beam pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
      <div className="hero-mesh hero-mesh-animate pointer-events-none absolute inset-0" aria-hidden />
      <div className="hero-grid hero-grid-drift pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="hero-orb hero-orb-a pointer-events-none absolute start-0 top-16 h-64 w-64 rounded-full opacity-55 sm:h-96 sm:w-96" aria-hidden />
      <div className="hero-orb hero-orb-b pointer-events-none absolute end-0 top-24 h-72 w-72 rounded-full opacity-45 sm:h-[28rem] sm:w-[28rem]" aria-hidden />
      <div className="hero-orb hero-orb-c pointer-events-none absolute bottom-0 start-1/3 h-56 w-56 rounded-full opacity-35" aria-hidden />
      <div className="hero-orb hero-orb-d pointer-events-none absolute bottom-1/4 end-1/4 h-48 w-48 rounded-full opacity-30" aria-hidden />

      <div className="hero-particles pointer-events-none absolute inset-0" aria-hidden>
        {[...Array(28)].map((_, i) => (
          <span
            key={i}
            className={`hero-particle ${i % 3 === 0 ? "hero-particle-lg" : i % 5 === 0 ? "hero-particle-sm" : ""}`}
            style={{ "--i": i, "--x": `${(i * 17) % 100}%`, "--y": `${(i * 13) % 100}%` } as CSSProperties}
          />
        ))}
      </div>

      <div className="hero-float-marks pointer-events-none absolute inset-0" aria-hidden>
        {floats.map((f, i) => (
          <BrandMarkFloating
            key={i}
            className="hero-float-mark"
            style={
              {
                top: f.top,
                left: f.left,
                "--delay": `${f.delay}s`,
                "--scale": f.scale,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </>
  );
}
