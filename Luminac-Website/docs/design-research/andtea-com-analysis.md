# andtea.com Design Analysis for Luminac

Analysed: 2026-06-02  
Source: https://andtea.com/  
Method: Playwright desktop and mobile inspection, screenshots, DOM snapshots, interaction checks, resource/a11y scan.

## Evidence Captured

Desktop references:

- [Home hero](../../andtea-home-desktop-1440.png)
- [Home product intro](../../andtea-scroll-1000-product-intro.png)
- [Home blank transition state](../../andtea-scroll-3000-category-transition.png)
- [Home brand story](../../andtea-scroll-9800-brand-story.png)
- [Home CTA/image band](../../andtea-scroll-11350-cta-band.png)
- [Home news/footer](../../andtea-scroll-12600-news-footer.png)
- [Menu overlay](../../andtea-menu-overlay.png)
- [Drinks page hero](../../andtea-drinks-top.png)
- [Drinks menu/list](../../andtea-drinks-menu-list.png)
- [About page hero](../../andtea-about-top.png)
- [About core DNA block](../../andtea-about-core-dna.png)

Mobile references:

- [Mobile home hero](../../andtea-mobile-home-top.png)
- [Mobile product intro](../../andtea-mobile-product-intro.png)
- [Mobile menu overlay](../../andtea-mobile-menu-overlay.png)
- [Mobile drinks hero](../../andtea-mobile-drinks-top.png)
- [Mobile drinks list](../../andtea-mobile-drinks-list.png)

## Site Character

And Tea is a boutique editorial product site, not a conventional ecommerce catalogue. It sells atmosphere before utility. The strongest impression comes from restraint: pale background, large whitespace, isolated product photography, serif display type, very light dividers, small line icons, slow scroll reveals, and oversized brand marks.

The experience is cinematic. The homepage is built around a long pinned-scroll product-introduction sequence, then moves into a calmer brand-story layout, a large image band, and a minimal news/footer section. The secondary pages keep the same system: hero-first, image-heavy, brand-word typography, and product lists that feel more like editorial menus than transactional cards.

For Luminac, the useful lesson is not the tea aesthetic. The useful lesson is how a product brand can make technical objects feel premium by using:

- A small number of strong layouts.
- Isolated product renders with generous whitespace.
- Thin guide lines and understated icons.
- Category storytelling before dense lists.
- Calm, editorial typography instead of heavy card grids.

## Visual System

Observed palette:

- Main background: near-white, around `rgb(248, 248, 248)`.
- Main text: charcoal, around `rgb(40, 40, 40)`.
- Accent: warm taupe/gold, around `rgb(221, 187, 153)`.
- Secondary text/dividers: light grey and muted taupe.

Observed typography:

- Body stack: `PingFang TC`, `Helvetica Neue`, Helvetica, Arial, sans-serif.
- Display font loaded from Google Fonts: `Bellefair`.
- Display type is large, elegant, mostly regular weight.
- Body copy is smaller, quiet, and given wide line spacing.

Luminac adaptation:

- Use a similar neutral base, but shift accent away from tea/taupe into a lighting-appropriate material palette: graphite, brushed aluminum, warm white, optic amber, and maybe a small electric/cool accent for technical data.
- Use elegant display type sparingly for section labels and brand moments.
- Use a highly readable sans-serif for specifications, filters, product names, and admin-like data.
- Keep dividers thin and avoid heavy cards unless a product grid truly needs them.

## Homepage Structure

The And Tea homepage has these major modules:

1. Full-viewport hero.
2. Long pinned product-family intro.
3. Alternating brand-story blocks.
4. Centered oval CTA.
5. Full-width photographic band.
6. Minimal news list.
7. Contact/footer with TOP control.

Luminac should not copy the long scroll duration, but the module order is useful:

1. Hero: Luminac brand, one strong lighting/product image, immediate catalogue/search CTA.
2. Product families: Indoor, Outdoor, Profiles, Downlights, Spotlights, Track, Facade, Landscape.
3. Featured product-family module: isolated product visual, 3-5 key specs, use-case copy, CTA to category.
4. Brand/quality story: optics, materials, IP rating, thermal design, CAD/spec support.
5. Resource strip: catalogue download, CAD files, datasheets, project inquiry.
6. Updates/projects: only if we have real content; otherwise skip.

## Hero

And Tea uses a split hero: lifestyle image on one side, isolated product on the other, logo centered above, and circular/rotated display text as visual texture. On mobile, this remains visually strong because the image split compresses into a vertical product-led composition.

What to reuse for Luminac:

- Split application/product hero: installed lighting scene on one side, isolated luminaire render/photo on the other.
- Centered logo lockup or compact header mark.
- Subtle oversized type as background texture, but not enough to interfere with product inspection.
- A clear scroll cue or first-action CTA.

What to avoid:

- Do not let decorative typography cover important product detail.
- Do not hide the main catalogue entry behind a cinematic scroll.
- Do not make the hero only lifestyle mood; Luminac users need to inspect real products.

## Navigation Overlay

The menu overlay is one of the strongest reusable elements. Desktop and mobile both use a full-screen white overlay, very large serif nav labels, small animated icon marks, contact information, and social links at the bottom.

For Luminac, adapt this as:

- Primary links: Products, Indoor, Outdoor, Projects, Resources, About, Contact.
- Secondary links: Catalogue PDF, CAD/IES Downloads, Dealer Inquiry.
- Mobile: keep the large premium labels, but add a compact category column or quick links so users do not need to drill through one generic Products entry.

Implementation caution:

- And Tea's menu trigger is a `div` with no aria label. Luminac should use a real button with `aria-expanded`, `aria-controls`, keyboard support, visible focus, and an accessible label.

## Product/Category Intro

The homepage product intro is a three-zone layout:

- Left: category rail.
- Middle: short explanatory traits.
- Right: oversized isolated product image.
- CTA: small arrow-led link.

This is directly useful for Luminac category storytelling. A Luminac version could show:

- Left rail: Downlights, Profiles, Track, Wall Washers, Outdoor, Landscape.
- Middle: 3 technical/value traits like Beam Control, Finish Options, CAD Ready.
- Right: one clean product render or photo.
- CTA: View range.

For product-heavy pages, make this a normal section or a short controlled carousel, not a 9,000px pinned scroll. And Tea's blank transition states are too slow for catalogue buyers.

## Drinks/Product Listing Page

The Drinks page is the closest analogue to Luminac's future catalogue. It has:

- Editorial hero with product-family image and horizontal thumbnails.
- Product-family story section.
- Product menu/list grouped by category.
- Image-left/list-right layout on desktop.
- Vertical grouped list on mobile.
- Subtle hover color shift rather than heavy cards.

Useful Luminac adaptation:

- Category page hero with family image and horizontal product thumbnails.
- Desktop: image or selected product preview left; product rows/spec rows right.
- Mobile: stacked product list with a small selected product image near the section heading.
- Row structure: product name, model code, wattage, CCT, beam angle, IP rating, finish, primary CTA.

Do not copy the hidden-description behavior as-is. For Luminac, important specs must be visible immediately. Expand/collapse can reveal description, downloads, or application notes, but key specs should stay exposed.

## About Page

The About page has three strong ideas:

- Large editorial headline with asymmetric images.
- Store concept section with photos and operational details.
- "Core DNA" word map with oversized words, small images, and oval tags.

Luminac adaptation:

- Use an About/Quality page around "Light, engineered for spaces" rather than generic company history.
- Replace store concept with showroom/manufacturing/project support if relevant.
- Convert "Core DNA" into Luminac capability words:
  - Optics
  - Thermal
  - Finish
  - Indoor
  - Outdoor IP
  - CAD Ready
  - Project Support
  - Warranty/Service

This could become a memorable mid-homepage module if kept short.

## News/Footer

And Tea's news module is a narrow list: date, title, arrow, thin dividers. It is visually clean and avoids heavy blog-card styling.

For Luminac:

- Use this pattern for Projects, Resources, Catalogue Updates, or New Arrivals.
- If we do not have real updates, use it as a "Resources" list:
  - Latest Catalogue
  - Indoor Product Guide
  - Outdoor Product Guide
  - CAD/IES Downloads
  - Project Inquiry

The footer pattern is also reusable: brand mark, social/contact links, address, and top control. Luminac should add business-relevant contact details and possibly WhatsApp/email CTAs.

## Interaction/Animation

Strong interactions:

- Subtle hover color transitions.
- Full-screen nav overlay.
- Product/category changes tied to scroll.
- Thin animated arrows and line markers.
- Persistent top/menu controls.

Risks:

- The homepage has very long scroll height: about 13,743px at 1440x900 and similar on mobile.
- There are large blank transition states in the pinned intro.
- Product discovery is slower than a catalogue buyer expects.
- Some scroll-triggered compositions can look clipped depending on viewport and scroll timing.

Luminac recommendation:

- Use restrained motion for polish.
- Avoid long forced scroll narratives before product access.
- Respect reduced-motion preferences.
- Keep catalogue/search/filter actions immediately available.

## Accessibility and Technical Notes

Observed issues from the Playwright pass:

- Many images have empty alt text. On the mobile Drinks page, 28 of 28 images inspected had no alt text.
- Menu trigger is not a semantic button and has no aria label.
- Heavy visual text and icon-font glyphs appear in accessible snapshots.
- WordPress/cached assets are used, with imagesloaded and custom minified scripts.
- Console had no runtime errors during the inspected pages.

For Luminac:

- Use semantic buttons and links.
- Add useful alt text for product/application images.
- Keep decorative images marked decorative only when they are truly decorative.
- Use real text labels for specs and CTAs, not icon-font glyphs alone.
- Optimize product images as WebP/AVIF with explicit dimensions.
- Do not build the catalogue as a slow animation-first experience.

## Best Patterns to Reuse

High priority:

- Full-screen premium mobile/desktop menu overlay, adapted with Luminac category hierarchy.
- Category hero with isolated product image and real product-family CTA.
- Product-family intro with category rail, 3 value/spec traits, and selected product visual.
- Minimal row-based list for resources/news/projects.
- Alternating story blocks with real application/product/process imagery.
- Thin divider lines, oval CTAs, arrow affordances, restrained hover color.

Medium priority:

- Core DNA word map, if we have strong brand/technical keywords.
- Center vertical guide line for story sections.
- Bilingual-style heading hierarchy, but for Luminac this could be brand term + practical descriptor, not forced language pairing.

Low priority / avoid:

- Long pinned-scroll sequence.
- Large blank animation transitions.
- Product detail hidden behind visual drama.
- Decorative text that reduces product inspectability.
- WordPress-style implementation choices.

## Suggested Luminac First Pass

Recommended homepage pattern:

1. Header/menu: small logo, catalogue/search CTA, full-screen premium menu.
2. Hero: real product/application split, clear line like "Architectural lighting for indoor and outdoor spaces", CTAs for View Catalogue and Contact.
3. Product families: calm category rail or grid with image thumbnails.
4. Featured family: selected category with isolated product render and 3-5 specs.
5. Quality/story: optics, finishes, IP/weather, CAD/spec support.
6. Resources: catalogue PDF, datasheets, CAD/IES, product inquiry.
7. Footer: contact, address, WhatsApp/email, socials, top control.

Recommended catalogue/category pattern:

1. Category hero with image and short use-case summary.
2. Sticky filters/search for category, wattage, CCT, beam, finish, IP rating.
3. Product rows/cards that show model, image, specs, and asset links.
4. Product detail page with gallery, specs table, downloads, related products, inquiry CTA.

Bottom line: borrow And Tea's premium restraint, whitespace, image discipline, menu overlay, and editorial section rhythm. Do not borrow the slow scroll length or hidden catalogue behavior. Luminac needs a premium experience that still behaves like a practical product database.
