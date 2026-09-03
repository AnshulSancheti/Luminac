"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

export function HeroSection() {
  const section = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end start"],
  });
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -48]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.68]);
  const shadeOpacity = useTransform(scrollYProgress, [0, 1], [0.9, 1]);

  return (
    <section ref={section} className="hero" aria-labelledby="hero-title">
      <motion.div
        className="hero-media"
        style={reduceMotion ? undefined : { scale: imageScale }}
      >
        <Image
          className="hero-image"
          src="/images/hero-architectural.png"
          alt="Warm architectural lighting across a contemporary interior and courtyard"
          fill
          priority
          loading="eager"
          sizes="100vw"
        />
      </motion.div>
      <motion.div
        className="hero-overlay"
        style={reduceMotion ? undefined : { opacity: shadeOpacity }}
      />

      <motion.div
        className="hero-content page-shell"
        style={reduceMotion ? undefined : { y: copyY, opacity: copyOpacity }}
      >
        <motion.div
          className="hero-kicker"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.16 }}
        >
          <span className="section-index">00</span>
          <p className="eyebrow">Architectural lighting / India</p>
        </motion.div>
        <motion.h1
          id="hero-title"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.26 }}
        >
          Light shapes how
          <br />a space is felt.
        </motion.h1>
        <motion.p
          className="hero-copy"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.36 }}
        >
          Premium indoor and outdoor luminaires for spaces that demand atmosphere,
          precision and lasting performance.
        </motion.p>
        <motion.div
          className="hero-actions"
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.46 }}
        >
          <Link className="text-link text-link-light" href="#catalogue">
            Explore the catalogue <span aria-hidden="true">→</span>
          </Link>
          <Link className="text-link text-link-accent" href="#project-enquiry">
            Discuss a project <span aria-hidden="true">→</span>
          </Link>
        </motion.div>
      </motion.div>

      <motion.a
        className="scroll-cue"
        href="#about"
        aria-label="Scroll to discover Luminac"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.05, duration: 0.7 }}
      >
        <span>Scroll to discover</span>
        <i aria-hidden="true" />
      </motion.a>
    </section>
  );
}
