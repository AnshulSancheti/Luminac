import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { SiteHeader } from "@/components/site-header";
import {
  catalogAssetUrl,
  getCatalogProduct,
  getFamilyVariants,
  uniqueSpecValues,
  type CatalogProduct,
} from "@/lib/catalog";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);

  if (!product) {
    return { title: "Product not found | Luminac" };
  }

  const title = product.seo?.metaTitle ?? `${product.modelNo} | Luminac Lighting`;
  const description =
    product.seo?.metaDescription ??
    product.family.shortDescription ??
    product.family.description ??
    `${product.modelNo}, a ${product.category.name.toLowerCase()} luminaire from Luminac.`;
  const primaryImage = catalogAssetUrl(product.assetGroups.product[0] ?? null);

  return {
    title,
    description,
    alternates: product.seo?.canonicalPath
      ? { canonical: product.seo.canonicalPath }
      : undefined,
    robots: product.seo?.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: product.seo?.ogTitle ?? title,
      description: product.seo?.ogDescription ?? description,
      images: primaryImage ? [{ url: primaryImage }] : undefined,
    },
  };
}

function presentDimension(value: string | null | undefined) {
  return value?.replace(/\s+x\s+/gi, " × ") ?? null;
}

function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function applicationLabels(product: CatalogProduct) {
  const source = `${product.family.description ?? ""} ${product.family.shortDescription ?? ""}`.toLowerCase();
  const labels = new Set<string>();

  if (source.includes("retail") || source.includes("jewell")) labels.add("Luxury retail");
  if (source.includes("hotel") || source.includes("hospitality")) labels.add("Hotel lobbies");
  if (source.includes("living") || source.includes("residential")) labels.add("Residential living");
  if (source.includes("landscape")) labels.add("Landscape");
  if (source.includes("facade")) labels.add("Facades");

  if (!labels.size) {
    labels.add(titleCase(product.environment));
    labels.add(product.category.name);
  }

  return [...labels].slice(0, 3);
}

function specificationRows(product: CatalogProduct) {
  const details = product.details ?? {};
  return [
    ["Model", product.modelNo],
    ["Power", product.powerText],
    ["Size", presentDimension(details.size_text)],
    ["Cutout", details.cutout_text],
    ["Finish", details.finish_text],
    ["CCT", details.cct_text],
    ["Beam angle", details.beam_angle_text],
    ["Light source", details.light_source],
    ["CRI", details.cri == null ? null : String(details.cri)],
    ["Ingress protection", details.ip_rating],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

function ProductMedia({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string | null;
  alt: string;
  className: string;
  priority?: boolean;
}) {
  return (
    <div className={className}>
      {src ? (
        <Image src={src} alt={alt} fill priority={priority} sizes="(max-width: 900px) 100vw, 56vw" />
      ) : (
        <div className="product-media-unavailable">
          <span>Image unavailable</span>
          <p>Contact Luminac for the latest product visual.</p>
        </div>
      )}
    </div>
  );
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) notFound();

  const variants = await getFamilyVariants(product.family.slug, product.family.name);
  const productImage = catalogAssetUrl(product.assetGroups.product[0] ?? null);
  const applicationImage = catalogAssetUrl(product.assetGroups.application[0] ?? null);
  const lineDrawing = catalogAssetUrl(product.assetGroups.lineDrawing[0] ?? null);
  const finishes = uniqueSpecValues(product, "finish");
  const cctValues = uniqueSpecValues(product, "cct");
  const details = product.details ?? {};
  const breadcrumb = product.category.fullSlug.split("/").map(titleCase);
  const applications = applicationLabels(product);
  const narrative =
    product.family.shortDescription ??
    product.family.description ??
    `A considered ${product.category.name.toLowerCase()} luminaire for architectural applications.`;

  const highlights = [
    {
      title: details.beam_angle_text ? `${details.beam_angle_text} beam control` : "Controlled distribution",
      description: details.beam_angle_text
        ? `A ${details.beam_angle_text} distribution helps place emphasis with specification-level clarity.`
        : "The optical configuration supports purposeful, application-led illumination.",
    },
    {
      title: details.light_source ? `${details.light_source} light source` : "Lighting performance",
      description: details.light_source
        ? `${details.light_source} is the verified light-source entry for this catalogue model.`
        : "Performance details remain visible and traceable to the verified catalogue record.",
    },
    {
      title: details.ip_rating ? `${details.ip_rating} rated` : `${titleCase(product.environment)} application`,
      description: details.ip_rating
        ? `${details.ip_rating} is the published ingress-protection rating for this product.`
        : `Designed for considered ${product.environment} lighting applications.`,
    },
  ];

  return (
    <main className="product-detail-page" id="top">
      <SiteHeader variant="solid" />

      <div className="product-model-band">
        <p>{breadcrumb.join(" / ")}</p>
        <p>Model&nbsp; {product.modelNo}</p>
      </div>

      <section className="product-object-section" aria-labelledby="product-title">
        <ScrollReveal className="product-object-visual">
          <ProductMedia
            className="product-object-image"
            src={productImage}
            alt={product.assetGroups.product[0]?.alt_text ?? `${product.modelNo} product`}
            priority
          />
          <p className="product-image-index">01 / Object</p>
          <div className="product-image-caption">
            <span>{finishes.length ? `${finishes.join(" / ")} finish` : "Product object"}</span>
            <span>{product.modelNo}</span>
          </div>
        </ScrollReveal>

        <ScrollReveal className="product-object-copy" direction="right" delay={0.08}>
          <p className="product-kicker">{product.category.name}</p>
          <h1 id="product-title">{product.modelNo}</h1>
          <p className="product-narrative">{narrative}</p>

          <dl className="product-key-specs">
            <div>
              <dt>Power</dt>
              <dd>{product.powerText ?? "On request"}</dd>
            </div>
            <div>
              <dt>Beam</dt>
              <dd>{details.beam_angle_text ?? "On request"}</dd>
            </div>
            <div>
              <dt>CRI</dt>
              <dd>{details.cri ?? "On request"}</dd>
            </div>
            <div>
              <dt>Ingress</dt>
              <dd>{details.ip_rating ?? "On request"}</dd>
            </div>
          </dl>

          <div className="product-options">
            <p>Available finishes</p>
            <div className="finish-list">
              {(finishes.length ? finishes : ["On request"]).map((finish) => (
                <span key={finish}>
                  <i className={`finish-swatch finish-${finish.toLowerCase()}`} aria-hidden="true" />
                  {finish}
                </span>
              ))}
            </div>
            <p className="product-cct-line">
              {cctValues.length ? cctValues.join(" · ") : details.cct_text ?? "CCT on request"}
            </p>
          </div>

          <div className="product-actions">
            <Link className="product-button product-button-primary" href="#product-support">
              Request specification <span aria-hidden="true">→</span>
            </Link>
            <Link className="product-button product-button-secondary" href="/#resources">
              Request catalogue
            </Link>
          </div>

          <p className="product-availability-note">
            {[details.light_source && `${details.light_source} light source`, product.environment]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </ScrollReveal>
      </section>

      <section className="product-atmosphere" aria-labelledby="atmosphere-title">
        <ProductMedia
          className="product-atmosphere-media"
          src={applicationImage}
          alt={
            product.assetGroups.application[0]?.alt_text ??
            `${product.modelNo} installed application`
          }
        />
        <div className="product-atmosphere-shade" />
        <ScrollReveal className="product-atmosphere-copy" direction="left">
          <p className="product-section-index">02 / Atmosphere</p>
          <h2 id="atmosphere-title">Direct light where architecture needs emphasis.</h2>
          <p>{narrative}</p>
          <div className="application-labels">
            {applications.map((application) => (
              <span key={application}>{application}</span>
            ))}
          </div>
        </ScrollReveal>
        <p className="product-atmosphere-note">
          {applicationImage ? `Application image / ${product.modelNo}` : "Application image unavailable"}
        </p>
      </section>

      <section className="product-specification" aria-labelledby="specification-title">
        <ScrollReveal className="product-specification-copy">
          <p className="product-section-index">03 / Specification</p>
          <h2 id="specification-title">Specify with confidence.</h2>
          <p>Dimensions and performance data stay visible, with planning resources close at hand.</p>
          <dl className="product-specification-table">
            {specificationRows(product).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </ScrollReveal>

        <ScrollReveal className="product-drawing" direction="right" delay={0.08}>
          <p className="product-resource-eyebrow">Planning / Drawing</p>
          <h3>Dimension-ready resources</h3>
          <ProductMedia
            className="product-drawing-image"
            src={lineDrawing}
            alt={
              product.assetGroups.lineDrawing[0]?.alt_text ?? `${product.modelNo} line drawing`
            }
          />
          <div className="product-resource-actions">
            {lineDrawing ? (
              <a className="product-button product-button-primary" href={lineDrawing} target="_blank" rel="noreferrer">
                View drawing
              </a>
            ) : (
              <span className="product-button product-button-disabled">Drawing unavailable</span>
            )}
            <Link className="product-button product-button-secondary" href="#product-support">
              Request IES / photometry
            </Link>
          </div>
          <p className="product-resource-note">
            Need a complete specification pack? Our team can provide planning files and project support.
          </p>
        </ScrollReveal>
      </section>

      <section className="product-engineering" aria-labelledby="engineering-title">
        <div className="product-section-shell">
          <ScrollReveal>
            <p className="product-section-index">Verified catalogue highlights</p>
            <h2 id="engineering-title">Light that supports the space.</h2>
          </ScrollReveal>
          <div className="product-feature-grid">
            {highlights.map((highlight, index) => (
              <ScrollReveal key={highlight.title} className="product-feature" delay={index * 0.08}>
                <span>0{index + 1}</span>
                <h3>{highlight.title}</h3>
                <p>{highlight.description}</p>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="product-family" aria-labelledby="family-title">
        <div className="product-section-shell">
          <ScrollReveal>
            <p className="product-section-index">Product family / {product.family.name}</p>
            <h2 id="family-title">Choose the scale for the architecture.</h2>
            <p className="product-family-intro">
              Compare the verified catalogue dimensions and power before specifying.
            </p>
          </ScrollReveal>
          <div className="product-variant-grid">
            {variants.map((variant) => {
              const current = variant.slug === product.slug;
              return (
                <ScrollReveal
                  key={variant.id}
                  className={`product-variant ${current ? "is-current" : ""}`}
                >
                  <p>{current ? "Current model" : variant.variantLabel ? `${variant.variantLabel} format` : "Family variant"}</p>
                  <h3>{variant.modelNo}</h3>
                  <dl>
                    <div>
                      <dt>Power</dt>
                      <dd>{variant.powerText ?? "On request"}</dd>
                    </div>
                  </dl>
                  {current ? (
                    <span>Viewing {variant.modelNo}</span>
                  ) : (
                    <Link href={`/products/${variant.slug}`}>View {variant.modelNo} →</Link>
                  )}
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="product-support" id="product-support" aria-labelledby="support-title">
        <ScrollReveal className="product-support-copy" direction="left">
          <i aria-hidden="true" />
          <p className="product-section-index">Project support</p>
          <h2 id="support-title">Bring the lighting intent into the project.</h2>
          <p>
            Share the application, installation constraints and project stage. We will help with model selection, technical files and specification support.
          </p>
        </ScrollReveal>
        <ScrollReveal className="product-support-action" direction="right" delay={0.08}>
          <Link className="product-button product-button-accent" href="/#project-enquiry">
            Start a project enquiry <span aria-hidden="true">→</span>
          </Link>
          <p>Specifications · Drawings · Photometry · Application support</p>
        </ScrollReveal>
      </section>

      <footer className="product-footer">
        <Link href="/" aria-label="Luminac home">
          <Image src="/images/luminac-logo.png" alt="Luminac — Light in its best form" width={56} height={60} />
        </Link>
        <p className="product-footer-line">Architectural lighting for considered spaces.</p>
        <nav aria-label="Footer navigation">
          <Link href="/#catalogue">Products</Link>
          <Link href="/#projects">Projects</Link>
          <Link href="/#resources">Resources</Link>
          <Link href="/#about">About</Link>
          <Link href="#product-support">Contact</Link>
        </nav>
        <div className="product-footer-meta">
          <span>© 2026 Luminac Lighting</span>
          <span>India / Project enquiries</span>
        </div>
      </footer>
    </main>
  );
}
