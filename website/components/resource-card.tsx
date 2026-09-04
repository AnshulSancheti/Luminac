"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

type ResourceCardProps = {
  label: string;
  title: string;
  description: string;
  linkLabel: string;
  href: string;
  delay?: number;
};

export function ResourceCard({
  label,
  title,
  description,
  linkLabel,
  href,
  delay = 0,
}: ResourceCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      className="resource-card"
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="eyebrow">{label}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      <Link className="text-link" href={href}>
        {linkLabel} <span aria-hidden="true">→</span>
      </Link>
    </motion.article>
  );
}
