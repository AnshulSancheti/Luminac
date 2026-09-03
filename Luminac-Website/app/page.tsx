import Image from "next/image";
import Link from "next/link";

import { GatewayCard } from "@/components/gateway-card";
import { HeroSection } from "@/components/hero-section";
import { ParallaxMedia } from "@/components/motion/parallax-media";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { ResourceCard } from "@/components/resource-card";
import { SiteHeader } from "@/components/site-header";

const credibilitySignals = [
  { value: "800+", label: "Catalogue products", prominent: true },
  { value: "Indoor + Outdoor", label: "Complete project pathways" },
  { value: "Specification ready", label: "Data, drawings & support" },
];

const resources = [
  {
    label: "01 / Catalogues",
    title: "Browse by space and family",
    description: "Indoor, outdoor and application-led product paths.",
    linkLabel: "Open catalogues",
    href: "#catalogue",
  },
  {
    label: "02 / Technical",
    title: "Request what you need",
    description: "IES files, photometric data, drawings and specification support.",
    linkLabel: "Request technical data",
    href: "#project-enquiry",
  },
  {
    label: "03 / Project support",
    title: "Bring us into the brief",
    description: "For architects, designers, dealers and project buying teams.",
    linkLabel: "Start a project",
    href: "#project-enquiry",
  },
];

export default function Home() {
  return (
    <main id="top">
      <SiteHeader />
      <HeroSection />

      <section className="brand-story" id="about" aria-labelledby="brand-title">
        <div className="page-shell">
          <div className="brand-editorial">
            <ScrollReveal className="brand-heading-block">
              <div className="section-marker">
                <span className="section-index">01</span>
                <p className="eyebrow">Light in its best form</p>
              </div>
              <h2 id="brand-title">
                Precision in every beam.
                <br />Warmth in every space.
              </h2>
            </ScrollReveal>

            <ScrollReveal className="brand-visual" delay={0.1} direction="right">
              <ParallaxMedia
                src="/images/brand-light-texture.webp"
                alt=""
                sizes="(max-width: 900px) 100vw, 48vw"
                yRange={[-18, 18]}
                scaleRange={[1.06, 1]}
              />
              <div className="brand-narrative">
                <p>
                  Luminac brings architectural sensitivity and technical clarity
                  together—helping architects, designers and project teams shape considered
                  interiors, landscapes and facades.
                </p>
              </div>
            </ScrollReveal>
          </div>

          <dl className="credibility-signals" aria-label="Luminac catalogue strengths">
            {credibilitySignals.map((signal, index) => (
              <ScrollReveal
                key={signal.value}
                className={signal.prominent ? "signal signal-prominent" : "signal"}
                delay={index * 0.08}
              >
                <dt>{signal.value}</dt>
                <dd>{signal.label}</dd>
              </ScrollReveal>
            ))}
          </dl>
        </div>
      </section>

      <section className="gateway-section" id="catalogue" aria-labelledby="gateway-title">
        <div className="page-shell">
          <ScrollReveal className="section-introduction">
            <div className="section-heading-lockup">
              <div className="section-marker">
                <span className="section-index">02</span>
                <p className="eyebrow">Explore by environment</p>
              </div>
              <h2 id="gateway-title">
                Two environments.
                <br />One standard of light.
              </h2>
            </div>
            <p>
              Begin with the space, then move quickly into the product families,
              performance and finishes that fit it.
            </p>
          </ScrollReveal>

          <div className="gateway-grid">
            <GatewayCard
              image="/images/indoor-hospitality.png"
              imageAlt="Warm architectural lighting in a refined hospitality interior"
              label="01 / Indoor lighting"
              title={
                <>
                  Shape atmosphere
                  <br />from within.
                </>
              }
              linkLabel="Explore indoor"
              href="#featured-products"
            />
            <GatewayCard
              image="/images/outdoor-courtyard.png"
              imageAlt="Architectural lighting defining an outdoor courtyard and landscape"
              label="02 / Outdoor lighting"
              title={
                <>
                  Define approach,
                  <br />landscape and arrival.
                </>
              }
              linkLabel="Explore outdoor"
              href="#featured-products"
              delay={0.12}
            />
          </div>
        </div>
      </section>

      <section className="featured-product" id="featured-products" aria-labelledby="featured-title">
        <ParallaxMedia
          className="featured-visual"
          imageClassName="featured-image"
          src="/images/featured-spotlight.png"
          alt="Compact black architectural spotlight illuminating a textured wall"
          sizes="(max-width: 900px) 100vw, 58vw"
          yRange={[-24, 24]}
          scaleRange={[1.1, 1]}
        />
        <ScrollReveal className="featured-content" direction="right">
          <div className="section-marker section-marker-dark">
            <span className="section-index">03</span>
            <p className="eyebrow">Featured / Architectural surface</p>
          </div>
          <h2 id="featured-title">
            A precise beam.
            <br />A quieter ceiling.
          </h2>
          <p className="featured-copy">
            Compact architectural spotlights that bring attention to material, artwork and
            form—without calling attention to themselves.
          </p>
          <p className="featured-specs">6W · 3000K · 24° beam · CRI &gt;90 · Black / White</p>
          <div className="featured-divider" aria-hidden="true" />
          <Link className="text-link text-link-accent" href="/products/lf-ll-5620a">
            View LF-LL-5620A <span aria-hidden="true">→</span>
          </Link>
        </ScrollReveal>
      </section>

      <section className="project-proof" id="projects" aria-labelledby="project-title">
        <ParallaxMedia
          className="project-media"
          imageClassName="project-image"
          src="/images/hero-architectural.png"
          alt="Residential interior and courtyard shaped by warm architectural light"
          sizes="100vw"
          yRange={[-36, 36]}
          scaleRange={[1.06, 1]}
        />
        <div className="project-shade" />
        <ScrollReveal className="project-caption" direction="left">
          <div className="section-marker section-marker-dark">
            <span className="section-index">04</span>
            <p className="eyebrow">Project proof / Residential</p>
          </div>
          <h2 id="project-title">
            A home guided by light,
            <br />not decorated with it.
          </h2>
          <p className="project-meta">Mumbai · Residential · Interior + Landscape</p>
          <Link className="text-link text-link-light" href="#projects">
            View project stories <span aria-hidden="true">→</span>
          </Link>
        </ScrollReveal>
      </section>

      <section className="resources-section" id="resources" aria-labelledby="resources-title">
        <div className="page-shell">
          <ScrollReveal className="section-introduction">
            <div className="section-heading-lockup">
              <div className="section-marker">
                <span className="section-index">05</span>
                <p className="eyebrow">Specification resources</p>
              </div>
              <h2 id="resources-title">
                Tools for specifying
                <br />with confidence.
              </h2>
            </div>
            <p>
              Professional support is part of the product: clear catalogues, reliable
              technical information and a direct project path.
            </p>
          </ScrollReveal>

          <div className="resource-grid">
            {resources.map((resource, index) => (
              <ResourceCard key={resource.label} {...resource} delay={index * 0.08} />
            ))}
          </div>
        </div>
      </section>

      <section className="enquiry-section" id="project-enquiry" aria-labelledby="enquiry-title">
        <ParallaxMedia
          className="enquiry-media"
          src="/images/enquiry-light-study.webp"
          alt=""
          sizes="100vw"
          yRange={[-18, 18]}
          scaleRange={[1.06, 1]}
        />
        <div className="enquiry-shade" />
        <ScrollReveal className="enquiry-inner page-shell">
          <div className="enquiry-heading">
            <div className="section-marker section-marker-dark">
              <span className="section-index">06</span>
              <p className="eyebrow">Start a conversation</p>
            </div>
            <h2 id="enquiry-title">
              Bring us the space.
              <br />We’ll help shape
              <br />the light.
            </h2>
          </div>
          <div className="enquiry-action">
            <p className="eyebrow">Project enquiry</p>
            <p>
              Share the application, project stage and what you need—from product selection
              to technical files.
            </p>
            <Link className="text-link text-link-accent" href="#project-enquiry">
              Discuss your project <span aria-hidden="true">→</span>
            </Link>
          </div>
        </ScrollReveal>
      </section>

      <footer className="site-footer">
        <div className="footer-inner page-shell">
          <Link className="footer-brand" href="#top" aria-label="Luminac home">
            <Image
              src="/images/luminac-logo.png"
              alt="Luminac — Light in its best form"
              width={101}
              height={110}
            />
          </Link>
          <div className="footer-information">
            <nav className="footer-navigation" aria-label="Footer navigation">
              <Link href="#catalogue">Products</Link>
              <Link href="#projects">Projects</Link>
              <Link href="#about">About</Link>
              <Link href="#resources">Resources</Link>
              <Link href="#project-enquiry">Contact</Link>
            </nav>
            <p>© 2026 Luminac · Privacy · Terms · Accessibility</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
