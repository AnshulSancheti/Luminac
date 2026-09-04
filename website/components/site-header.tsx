"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const navigation = [
  { label: "Products", href: "#catalogue" },
  { label: "Projects", href: "#projects" },
  { label: "About", href: "#about" },
  { label: "Resources", href: "#resources" },
];

type SiteHeaderProps = {
  variant?: "overlay" | "solid";
};

export function SiteHeader({ variant = "overlay" }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > 64);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <header
      className={`site-header ${variant === "solid" ? "site-header-solid" : ""} ${
        scrolled || menuOpen ? "is-scrolled" : ""
      }`.trim()}
    >
      <Link className="brand" href="/" aria-label="Luminac home">
        <Image
          src="/images/luminac-logo.png"
          alt="Luminac — Light in its best form"
          width={54}
          height={58}
          priority
        />
      </Link>

      <nav className="desktop-nav" aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link key={item.label} href={`/${item.href}`}>
            {item.label}
          </Link>
        ))}
        <Link className="search-link" href="/#catalogue">
          Search
        </Link>
        <Link className="header-cta" href="/#project-enquiry">
          Start a project
        </Link>
      </nav>

      <details className="mobile-menu" onToggle={(event) => setMenuOpen(event.currentTarget.open)}>
        <summary aria-label="Open navigation menu">
          <span />
          <span />
        </summary>
        <nav aria-label="Mobile navigation">
          {navigation.map((item) => (
            <Link key={item.label} href={`/${item.href}`}>
              {item.label}
            </Link>
          ))}
          <Link href="/#catalogue">Search</Link>
          <Link className="header-cta" href="/#project-enquiry">
            Start a project
          </Link>
        </nav>
      </details>
    </header>
  );
}
