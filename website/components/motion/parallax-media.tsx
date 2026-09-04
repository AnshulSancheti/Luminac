"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

type ParallaxMediaProps = {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  sizes: string;
  priority?: boolean;
  yRange?: [number, number];
  scaleRange?: [number, number];
};

export function ParallaxMedia({
  src,
  alt,
  className,
  imageClassName,
  sizes,
  priority = false,
  yRange = [-32, 32],
  scaleRange = [1.08, 1],
}: ParallaxMediaProps) {
  const target = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], yRange);
  const scale = useTransform(
    scrollYProgress,
    [0, 0.55, 1],
    [scaleRange[0], scaleRange[1], scaleRange[0]],
  );

  return (
    <div ref={target} className={`parallax-media ${className ?? ""}`.trim()}>
      <motion.div
        className="parallax-media-inner"
        style={reduceMotion ? undefined : { y, scale }}
      >
        <Image
          className={imageClassName}
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
        />
      </motion.div>
    </div>
  );
}
