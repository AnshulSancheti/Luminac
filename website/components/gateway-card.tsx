"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type GatewayCardProps = {
  image: string;
  imageAlt: string;
  label: string;
  title: ReactNode;
  linkLabel: string;
  href: string;
  delay?: number;
};

export function GatewayCard({
  image,
  imageAlt,
  label,
  title,
  linkLabel,
  href,
  delay = 0,
}: GatewayCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      className="gateway-card"
      initial={reduceMotion ? false : { opacity: 0, y: 36 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.85, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Image
        className="gateway-image"
        src={image}
        alt={imageAlt}
        fill
        sizes="(max-width: 900px) 100vw, 50vw"
      />
      <div className="gateway-overlay" />
      <div className="gateway-content">
        <p className="eyebrow">{label}</p>
        <h3>{title}</h3>
        <Link className="text-link text-link-light" href={href}>
          {linkLabel} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </motion.article>
  );
}
