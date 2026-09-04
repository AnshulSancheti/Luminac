import {
  EXTRA_FIELD_FIELDS,
  FIELD_LABELS,
  INDOOR_DETAIL_FIELDS,
  OUTDOOR_DETAIL_FIELDS,
  PRODUCT_EDIT_FIELDS,
  REVIEW_STATUS_OPTIONS,
  SPEC_VALUE_FIELDS,
  STATUS_OPTIONS,
  categoryLabel,
  diffEditable,
  displayValue,
  editableFromRecord,
  formatMrp,
  getExtraFieldValue,
  getPrimaryDetail,
  groupBy,
} from "/lib/productQaCore.js";

const REVIEW_STORAGE_KEY = "luminacProductQaReviewState:v1";

const state = {
  config: null,
  products: [],
  facets: { categories: [], statuses: [], environments: [] },
  selectedId: null,
  selectedRecord: null,
  selectedEditable: null,
  loading: false,
  error: null,
  editMode: false,
  draft: null,
  pendingDiff: [],
  reviewState: loadReviewState(),
};

const refs = {
  connectionStatus: document.querySelector("#connectionStatus"),
  actorEmail: document.querySelector("#actorEmail"),
  searchInput: document.querySelector("#searchInput"),
  environmentFilter: document.querySelector("#environmentFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  lightSourceFilter: document.querySelector("#lightSourceFilter"),
  cctFilter: document.querySelector("#cctFilter"),
  finishFilter: document.querySelector("#finishFilter"),
  ipFilter: document.querySelector("#ipFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  productList: document.querySelector("#productList"),
  listMeta: document.querySelector("#listMeta"),
  detailPane: document.querySelector("#detailPane"),
  toast: document.querySelector("#toast"),
  diffModal: document.querySelector("#diffModal"),
  diffContent: document.querySelector("#diffContent"),
  closeDiffButton: document.querySelector("#closeDiffButton"),
  cancelSaveButton: document.querySelector("#cancelSaveButton"),
  confirmSaveCheckbox: document.querySelector("#confirmSaveCheckbox"),
  confirmSaveButton: document.querySelector("#confirmSaveButton"),
};

init();

function init() {
  bindEvents();
  loadStatus();
  loadProducts();
}

function bindEvents() {
  refs.refreshButton.addEventListener("click", () => loadProducts({ keepSelection: true }));
  const debouncedLoad = debounce(() => loadProducts(), 220);
  for (const input of [
    refs.searchInput,
    refs.lightSourceFilter,
    refs.cctFilter,
    refs.finishFilter,
    refs.ipFilter,
  ]) {
    input.addEventListener("input", debouncedLoad);
  }
  for (const select of [refs.environmentFilter, refs.statusFilter, refs.categoryFilter]) {
    select.addEventListener("change", () => loadProducts());
  }

  refs.productList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-product-id]");
    if (!row) return;
    loadProductDetail(row.dataset.productId);
  });

  refs.detailPane.addEventListener("click", handleDetailClick);
  refs.detailPane.addEventListener("input", handleDetailInput);
  refs.detailPane.addEventListener("change", handleDetailInput);
  refs.closeDiffButton.addEventListener("click", closeDiffModal);
  refs.cancelSaveButton.addEventListener("click", closeDiffModal);
  refs.confirmSaveCheckbox.addEventListener("change", () => {
    refs.confirmSaveButton.disabled = !refs.confirmSaveCheckbox.checked;
  });
  refs.confirmSaveButton.addEventListener("click", saveConfirmedChanges);
}

async function loadStatus() {
  try {
    state.config = await api("/api/status");
    renderStatus();
  } catch (error) {
    refs.connectionStatus.innerHTML = `<span class="badge critical">${escapeHtml(error.message)}</span>`;
  }
}

async function loadProducts(options = {}) {
  state.loading = true;
  state.error = null;
  renderProductList();

  try {
    const data = await api(`/api/products?${buildFilterParams()}`);
    state.products = data.products;
    state.facets = data.facets;
    state.loading = false;
    renderFilterOptions();
    renderProductList(data);

    const selectedStillVisible = state.products.some((product) => product.id === state.selectedId);
    if (!options.keepSelection || !selectedStillVisible) {
      if (state.products[0]) {
        await loadProductDetail(state.products[0].id);
      } else {
        state.selectedId = null;
        state.selectedRecord = null;
        state.selectedEditable = null;
        state.editMode = false;
        renderDetail();
      }
    } else {
      renderProductList(data);
    }
  } catch (error) {
    state.loading = false;
    state.error = error;
    renderProductList();
    renderDetailError(error);
  }
}

async function loadProductDetail(productId) {
  state.selectedId = productId;
  state.editMode = false;
  state.draft = null;
  renderProductList();
  refs.detailPane.innerHTML = `<div class="loading-state">Loading product detail…</div>`;

  try {
    const data = await api(`/api/products/${encodeURIComponent(productId)}`);
    state.selectedRecord = data.product;
    state.selectedEditable = data.editable;
    renderDetail();
    renderProductList();
  } catch (error) {
    renderDetailError(error);
  }
}

function buildFilterParams() {
  const params = new URLSearchParams();
  const pairs = {
    search: refs.searchInput.value.trim(),
    environment: refs.environmentFilter.value,
    status: refs.statusFilter.value,
    category: refs.categoryFilter.value,
    light_source: refs.lightSourceFilter.value.trim(),
    cct: refs.cctFilter.value.trim(),
    finish: refs.finishFilter.value.trim(),
    ip_rating: refs.ipFilter.value.trim(),
  };
  for (const [key, value] of Object.entries(pairs)) {
    if (value && value !== "all") params.set(key, value);
  }
  return params;
}

function renderStatus() {
  if (!state.config) return;
  refs.actorEmail.textContent = state.config.authenticatedAdmin ?? "Access identity unavailable";
  const connectedMode = state.config.mode === "cloudflare-d1" || state.config.mode === "supabase";
  const modeBadge = badge(state.config.mode, connectedMode ? "ok" : "warning");
  const writeBadge = state.config.writesEnabled
    ? badge("writes enabled", "ok")
    : badge("read-only", "muted");
  const typeBadge = state.config.staleGeneratedTypes ? badge("local catalog types", "info") : "";
  refs.connectionStatus.innerHTML = `${modeBadge}${writeBadge}${typeBadge}`;
}

function renderFilterOptions() {
  populateSelect(refs.environmentFilter, state.facets.environments, "All", "all");
  populateSelect(refs.statusFilter, state.facets.statuses, "All", "all");
  populateSelect(refs.categoryFilter, state.facets.categories, "All categories", "all");
}

function populateSelect(select, options, allLabel, allValue) {
  const currentValue = select.value || allValue;
  const html = [
    `<option value="${escapeHtml(allValue)}">${escapeHtml(allLabel)}</option>`,
    ...(options ?? []).map(
      (option) =>
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
    ),
  ].join("");
  select.innerHTML = html;
  select.value = [...select.options].some((option) => option.value === currentValue)
    ? currentValue
    : allValue;
}

function renderProductList(data = null) {
  if (state.loading) {
    refs.productList.className = "product-list loading-state";
    refs.productList.textContent = "Loading products…";
    refs.listMeta.textContent = "Loading products";
    return;
  }

  if (state.error) {
    refs.productList.className = "product-list error-state";
    refs.productList.innerHTML = `<h3>Could not load products</h3><p>${escapeHtml(state.error.message)}</p>`;
    refs.listMeta.textContent = "Connection or permission error";
    return;
  }

  refs.productList.className = "product-list";
  const total = data?.total ?? state.products.length;
  const unfilteredTotal = data?.unfilteredTotal ?? total;
  refs.listMeta.textContent = `${total} shown of ${unfilteredTotal} products`;

  if (!state.products.length) {
    refs.productList.innerHTML = `
      <div class="empty-state">
        <h3>No product rows found</h3>
        <p>No imported product data matched the current filters. The tool has not inserted mock data into Supabase.</p>
      </div>
    `;
    return;
  }

  refs.productList.innerHTML = `
    <table class="result-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Family / category</th>
          <th>Specs</th>
          <th>Status</th>
          <th>Review</th>
        </tr>
      </thead>
      <tbody>
        ${state.products.map(renderProductRow).join("")}
      </tbody>
    </table>
  `;
}

function renderProductRow(product) {
  const review = state.reviewState[product.id];
  const selectedClass = product.id === state.selectedId ? " selected" : "";
  const duplicateBadge = product.duplicateCount > 1 ? badge("duplicate", "critical") : "";
  const warningBadge = product.criticalCount
    ? badge(`${product.criticalCount} critical`, "critical")
    : product.warningCount
      ? badge(`${product.warningCount} warnings`, "warning")
      : badge("clean", "ok");
  const reviewBadge = review?.status ? badge(review.status.replaceAll("_", " "), reviewClass(review.status)) : badge("needs review", "muted");

  return `
    <tr class="product-row${selectedClass}" data-product-id="${escapeHtml(product.id)}">
      <td>
        <div class="model-cell">${escapeHtml(product.model_no)}</div>
        <div class="subtle">${escapeHtml(product.display_name ?? "")}</div>
        ${duplicateBadge}
      </td>
      <td>
        <strong>${escapeHtml(product.family_code || "No family")}</strong>
        <div class="subtle">${escapeHtml(product.category)}</div>
      </td>
      <td>
        <div>${escapeHtml(displayValue(product.power_text))} · ${escapeHtml(displayValue(product.cct_text))}</div>
        <div class="subtle">${escapeHtml(displayValue(product.finish_text))} · ${escapeHtml(displayValue(product.ip_rating))}</div>
      </td>
      <td>
        ${badge(product.status, product.status === "published" ? "ok" : "muted")}
        <div class="subtle">${escapeHtml(formatMrp(product.mrp_inr))}</div>
      </td>
      <td>
        ${reviewBadge}
        <div>${warningBadge}</div>
      </td>
    </tr>
  `;
}

function renderDetail() {
  const record = state.selectedRecord;
  if (!record) {
    refs.detailPane.innerHTML = `
      <div class="empty-state">
        <h2>Select a product</h2>
        <p>Use the search and filters to find an imported product row.</p>
      </div>
    `;
    return;
  }

  refs.detailPane.innerHTML = `
    <div class="detail-toolbar">
      <div>
        <p class="eyebrow">Product detail review</p>
        <h2>${escapeHtml(record.product.model_no)}</h2>
      </div>
      <div class="detail-actions">
        ${
          state.editMode
            ? `
              <button class="button secondary" type="button" data-action="cancel-edit">Cancel</button>
              <button class="button secondary" type="button" data-action="reset-edit">Reset</button>
              <button class="button danger" type="button" data-action="prepare-save" ${state.config?.writesEnabled ? "" : "disabled"}>Save</button>
            `
            : `<button class="button" type="button" data-action="enter-edit" ${state.config?.writesEnabled ? "" : "disabled"}>Edit product</button>`
        }
      </div>
    </div>
    ${state.config?.writesEnabled ? "" : renderReadOnlyNotice()}
    ${state.editMode ? renderEditor(record) : ""}
    ${renderCatalogueSheet(record)}
    <div class="detail-grid">
      ${renderWarnings(record)}
      ${renderReviewPanel(record)}
      ${renderParsedSpecs(record)}
      ${renderExtraFields(record)}
      ${renderImportMetadata(record)}
      ${renderRawValues(record)}
    </div>
  `;
}

function renderReadOnlyNotice() {
  const reason = state.config?.readOnlyReason || "Writes are disabled.";
  return `
    <div class="panel full">
      <span class="badge muted">Read-only mode</span>
      <p class="subtle">Editing is disabled: ${escapeHtml(reason)} Browser code never receives the service role key.</p>
    </div>
  `;
}

function renderCatalogueSheet(record) {
  const product = record.product;
  const family = record.family ?? {};
  const detail = getPrimaryDetail(record) ?? {};
  const environmentLabel = family.environment ? `${family.environment} lighting` : "Product catalogue";
  const description =
    family.description ||
    family.short_description ||
    "No catalogue description is stored yet. Use the review notes to flag copy that needs to be added after the import.";
  const statusBadge = badge(product.status, product.status === "published" ? "ok" : "muted");
  const environment = family.environment ?? record.category?.environment ?? "";
  const isOutdoor = environment === "outdoor";
  const cutout = detail.cutout_text ?? getExtraFieldValue(record, "cutout");
  const reflector = getExtraFieldValue(record, "reflector");
  const beamAngle = detail.beam_angle_text ?? getExtraFieldValue(record, "beam_angle");
  const cri = detail.cri ?? getExtraFieldValue(record, "cri");
  const promotedExtraKeys = new Set(["cutout", "reflector", "beam_angle", "cri"]);
  const extraRows = (record.extras ?? [])
    .filter((field) => field.is_public !== false && !promotedExtraKeys.has(field.field_key))
    .map((field) => [field.field_label || field.field_key, field.value_text]);
  const assets = record.assets ?? [];
  const productAssets = assets.filter((asset) => asset.asset_role === "product");
  const applicationAssets = assets.filter((asset) => asset.asset_role === "application");
  const lineDrawingAssets = assets.filter((asset) => asset.asset_role === "line_drawing");
  const primaryAsset = productAssets.find((asset) => asset.is_primary) ?? productAssets[0] ?? null;
  const additionalProductAssets = productAssets.filter((asset) => asset !== primaryAsset);

  const rows = compactSpecRows([
    ["Power", product.power_text ?? product.power_watts],
    ["Size", detail.size_text],
    !isOutdoor ? ["Cutout", cutout] : null,
    ["Finish", detail.finish_text],
    reflector ? ["Reflector", reflector] : null,
    ["CCT", detail.cct_text],
    beamAngle ? ["Beam angle", beamAngle] : null,
    ["Light source", detail.light_source],
    ...extraRows,
    ["MRP", formatMrp(product.mrp_inr)],
  ]);

  const badges = [
    detail.ip_rating ? badge(detail.ip_rating) : badge("IP missing", "warning"),
    isOutdoor ? (cri ? badge(`CRI ${cri}`) : null) : (cri ? badge(`CRI ${cri}`) : badge("CRI missing", "muted")),
    statusBadge,
  ].filter(Boolean).join("");

  return `
    <article class="catalogue-sheet">
      <div class="sheet-header">
        <span>${escapeHtml(environmentLabel)}</span>
        <span>${escapeHtml(product.model_no)}</span>
        <span>Luminac Meridian 2026 - 27</span>
      </div>
      <div class="sheet-grid">
        <section>
          <p class="category-line">${escapeHtml(categoryLabel(record))}</p>
          <h2 class="catalogue-model">${escapeHtml(product.model_no)}</h2>
          <div class="catalogue-badges">
            ${badges}
          </div>
          <table class="spec-table">
            <tbody>
              ${rows
                .map(
                  ([label, value]) => `
                    <tr>
                      <th>${escapeHtml(label)}</th>
                      <td>${escapeHtml(displayValue(value))}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </section>
        <section class="media-stack">
          ${
            primaryAsset
              ? `<div class="product-image-frame"><img src="${escapeHtml(primaryAsset.url)}" alt="${escapeHtml(primaryAsset.alt_text || product.display_name || product.model_no)}" width="${escapeHtml(primaryAsset.width || 1200)}" height="${escapeHtml(primaryAsset.height || 1200)}" decoding="async" /></div>`
              : `<div class="asset-placeholder large"><div><strong>Product image unavailable</strong><span>No reviewed product asset is linked.</span></div></div>`
          }
        </section>
      </div>
      <div class="sheet-lower-grid">
        ${renderAssetGallery(lineDrawingAssets, {
          label: "CAD / line drawings",
          emptyTitle: "Line drawing unavailable",
          emptyText: "No reviewed line-drawing asset is linked to this product.",
        })}
        <div class="description-box">${escapeHtml(description)}</div>
      </div>
      <div class="asset-sections">
        ${renderAssetGallery(additionalProductAssets, {
          label: "Additional product images",
          emptyTitle: "No additional product variants",
          emptyText: "The primary product image above is the only reviewed product asset.",
          optional: true,
        })}
        ${renderAssetGallery(applicationAssets, {
          label: "Application images",
          emptyTitle: "Application imagery unavailable",
          emptyText: "No reviewed application asset is linked to this product.",
        })}
      </div>
      <div class="sheet-footer">
        <span>${escapeHtml(product.model_no)}</span>
        <span>Light in its best form</span>
        <span>luminac.net</span>
      </div>
    </article>
  `;
}

function renderAssetGallery(assets, options) {
  if (options.optional && assets.length === 0) return "";
  const content = assets.length
    ? `<div class="asset-gallery">${assets.map((asset) => renderAssetCard(asset)).join("")}</div>`
    : `
        <div class="asset-placeholder">
          <div>
            <strong>${escapeHtml(options.emptyTitle)}</strong>
            <span>${escapeHtml(options.emptyText)}</span>
          </div>
        </div>
      `;
  return `
    <section class="asset-section">
      <div class="asset-section-header">
        <h3>${escapeHtml(options.label)}</h3>
        ${assets.length ? `<span>${assets.length} ${assets.length === 1 ? "asset" : "assets"}</span>` : ""}
      </div>
      ${content}
    </section>
  `;
}

function renderAssetCard(asset) {
  const variant = String(asset.variant || "main").replaceAll("-", " ");
  const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : "Dimensions unavailable";
  return `
    <figure class="asset-card">
      <div class="asset-image-frame">
        <img
          src="${escapeHtml(asset.url)}"
          alt="${escapeHtml(asset.alt_text || `${asset.asset_role || "Product"} ${variant}`)}"
          width="${escapeHtml(asset.width || 1200)}"
          height="${escapeHtml(asset.height || 1200)}"
          loading="lazy"
          decoding="async"
        />
      </div>
      <figcaption>
        <strong>${escapeHtml(variant)}</strong>
        <span>${escapeHtml(dimensions)}</span>
      </figcaption>
    </figure>
  `;
}

function compactSpecRows(rows) {
  return rows.filter((row) => Array.isArray(row) && row.length === 2);
}

function renderWarnings(record) {
  const items = record.warnings.length
    ? record.warnings
        .map(
          (warning) => `
            <li>
              ${badge(warning.severity, warning.severity)}
              <span>${escapeHtml(warning.label)}</span>
            </li>
          `,
        )
        .join("")
    : `<li>${badge("clean", "ok")} <span>No automated warnings for this row.</span></li>`;
  return `
    <section class="panel">
      <h3>Data quality warnings</h3>
      <ul class="warning-list">${items}</ul>
    </section>
  `;
}

function renderReviewPanel(record) {
  const review = state.reviewState[record.product.id] ?? {
    status: "needs_review",
    notes: "",
    updatedAt: null,
  };
  return `
    <section class="panel">
      <h3>Review notes</h3>
      <div class="review-panel">
        <label>
          <span>Review status</span>
          <select data-review-field="status">
            ${REVIEW_STATUS_OPTIONS.map(
              (status) =>
                `<option value="${status}" ${status === review.status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`,
            ).join("")}
          </select>
        </label>
        <label>
          <span>Notes</span>
          <textarea data-review-field="notes" placeholder="Flag source conflicts, catalogue copy gaps, or manual follow-up.">${escapeHtml(review.notes ?? "")}</textarea>
        </label>
        <div class="review-actions">
          <button class="button secondary" type="button" data-action="save-review-local">Save review locally</button>
          <button class="button" type="button" data-action="review-complete">Review complete</button>
        </div>
        <p class="subtle">
          Shared review state needs a small schema addition. Current notes persist in this browser only.
          ${review.updatedAt ? `Last local update: ${escapeHtml(new Date(review.updatedAt).toLocaleString())}` : ""}
        </p>
      </div>
    </section>
  `;
}

function renderParsedSpecs(record) {
  const grouped = groupBy(record.specs ?? [], (spec) => spec.spec_key || "unknown");
  if (!record.specs?.length) {
    return `
      <section class="panel">
        <h3>Parsed specs</h3>
        <p class="subtle">No product_spec_values rows found for this product.</p>
      </section>
    `;
  }
  const html = [...grouped.entries()]
    .map(([key, specs]) => {
      const values = specs.map((spec) => displayValue(spec.value_text)).join(", ");
      return `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(values)}</dd>`;
    })
    .join("");
  return `
    <section class="panel">
      <h3>Parsed specs</h3>
      <dl class="key-value-grid">${html}</dl>
    </section>
  `;
}

function renderExtraFields(record) {
  if (!record.extras?.length) {
    return `
      <section class="panel">
        <h3>Extra fields</h3>
        <p class="subtle">No product_extra_fields rows found.</p>
      </section>
    `;
  }
  const html = record.extras
    .map((field) => `<dt>${escapeHtml(field.field_label || field.field_key)}</dt><dd>${escapeHtml(displayValue(field.value_text))}</dd>`)
    .join("");
  return `
    <section class="panel">
      <h3>Extra fields</h3>
      <dl class="key-value-grid">${html}</dl>
    </section>
  `;
}

function renderImportMetadata(record) {
  const rows = record.importRows ?? [];
  if (!rows.length) {
    return `
      <section class="panel full">
        <h3>Source metadata</h3>
        <p class="subtle">No import_source_rows record is linked to this product.</p>
      </section>
    `;
  }
  const html = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.source_file ?? "—")}</td>
          <td>${escapeHtml(row.source_sheet ?? "—")}</td>
          <td>${escapeHtml(displayValue(row.source_row_number))}</td>
          <td>${escapeHtml(displayValue(row.pdf_page))}</td>
          <td>${escapeHtml(row.source_reference ?? "—")}</td>
          <td>${escapeHtml(row.status ?? "—")}</td>
          <td>${escapeHtml([...(row.warnings ?? []), ...(row.errors ?? [])].join("; ") || "—")}</td>
        </tr>
      `,
    )
    .join("");
  return `
    <section class="panel full">
      <h3>Source metadata</h3>
      <div class="edit-table-wrap">
        <table class="edit-table">
          <thead><tr><th>File</th><th>Sheet</th><th>Row</th><th>PDF page</th><th>Source reference</th><th>Status</th><th>Warnings / errors</th></tr></thead>
          <tbody>${html}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderRawValues(record) {
  const rawValues = record.product?.raw_excel_values;
  if (!rawValues || !Object.keys(rawValues).length) return "";
  return `
    <section class="panel full">
      <h3>Raw import values</h3>
      <pre class="json-block">${escapeHtml(JSON.stringify(rawValues, null, 2))}</pre>
    </section>
  `;
}

function renderEditor(record) {
  const draft = state.draft ?? editableFromRecord(record);
  state.draft = draft;
  return `
    <section class="editor">
      <div>
        <h3>Edit mode</h3>
        <p class="subtle">Asset tables and raw import rows are not editable here. Row removal is intentionally disabled; add or update parsed rows only.</p>
      </div>
      ${renderFieldGrid("Product", "product", PRODUCT_EDIT_FIELDS, draft.product)}
      ${renderFieldGrid("Indoor details", "indoorDetail", INDOOR_DETAIL_FIELDS, draft.indoorDetail)}
      ${renderFieldGrid("Outdoor details", "outdoorDetail", OUTDOOR_DETAIL_FIELDS, draft.outdoorDetail)}
      ${renderEditableRows("Parsed spec values", "specValues", SPEC_VALUE_FIELDS, draft.specValues)}
      ${renderEditableRows("Extra fields", "extraFields", EXTRA_FIELD_FIELDS, draft.extraFields)}
    </section>
  `;
}

function renderFieldGrid(title, section, fields, values) {
  return `
    <div class="editor-section">
      <h3>${escapeHtml(title)}</h3>
      <div class="editor-grid">
        ${fields.map((field) => renderEditInput(section, field, values?.[field])).join("")}
      </div>
    </div>
  `;
}

function renderEditInput(section, field, value, index = null) {
  const label = FIELD_LABELS[field] ?? field;
  const dataset = `data-edit-section="${section}" data-edit-field="${field}" ${index === null ? "" : `data-index="${index}"`}`;
  if (field === "status") {
    return `
      <label>
        <span>${escapeHtml(label)}</span>
        <select ${dataset}>
          ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${status === value ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </label>
    `;
  }
  if (["is_primary_variant", "is_public"].includes(field)) {
    return `
      <label>
        <span>${escapeHtml(label)}</span>
        <input ${dataset} type="checkbox" ${value ? "checked" : ""} />
      </label>
    `;
  }
  const type = ["power_watts", "sort_order", "mrp_inr", "cri", "value_number"].includes(field)
    ? "number"
    : "text";
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input ${dataset} type="${type}" value="${escapeHtml(value ?? "")}" />
    </label>
  `;
}

function renderEditableRows(title, section, fields, rows) {
  const addAction = section === "specValues" ? "add-spec-row" : "add-extra-row";
  return `
    <div class="editor-section">
      <div class="pane-header" style="padding:0;border:0">
        <h3>${escapeHtml(title)}</h3>
        <button class="button secondary" type="button" data-action="${addAction}">Add row</button>
      </div>
      <div class="edit-table-wrap">
        <table class="edit-table">
          <thead>
            <tr>${fields.map((field) => `<th>${escapeHtml(FIELD_LABELS[field] ?? field)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${(rows ?? [])
              .map(
                (row, index) => `
                  <tr>
                    ${fields
                      .map((field) => `<td>${renderTableInput(section, field, row[field], index)}</td>`)
                      .join("")}
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderTableInput(section, field, value, index) {
  const dataset = `data-edit-section="${section}" data-edit-field="${field}" data-index="${index}"`;
  if (field === "is_public") {
    return `<input ${dataset} type="checkbox" ${value ? "checked" : ""} />`;
  }
  const type = ["value_number", "sort_order"].includes(field) ? "number" : "text";
  return `<input ${dataset} type="${type}" value="${escapeHtml(value ?? "")}" />`;
}

function handleDetailClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;

  if (action === "enter-edit") {
    state.editMode = true;
    state.draft = structuredClone(state.selectedEditable ?? editableFromRecord(state.selectedRecord));
    renderDetail();
  }
  if (action === "cancel-edit") {
    state.editMode = false;
    state.draft = null;
    renderDetail();
  }
  if (action === "reset-edit") {
    state.draft = structuredClone(state.selectedEditable ?? editableFromRecord(state.selectedRecord));
    renderDetail();
  }
  if (action === "prepare-save") prepareSave();
  if (action === "add-spec-row") {
    state.draft.specValues.push(blankSpecRow());
    renderDetail();
  }
  if (action === "add-extra-row") {
    state.draft.extraFields.push(blankExtraRow());
    renderDetail();
  }
  if (action === "save-review-local") {
    saveCurrentReview();
    showToast("Review state saved locally.");
  }
  if (action === "review-complete") {
    markReviewComplete();
  }
}

function handleDetailInput(event) {
  const target = event.target;
  if (target.dataset.editSection && state.draft) {
    const section = target.dataset.editSection;
    const field = target.dataset.editField;
    const value = readInputValue(target, field);
    if (target.dataset.index !== undefined) {
      state.draft[section][Number(target.dataset.index)][field] = value;
    } else {
      state.draft[section][field] = value;
    }
  }

  if (target.dataset.reviewField && state.selectedRecord) {
    const productId = state.selectedRecord.product.id;
    const current = state.reviewState[productId] ?? { status: "needs_review", notes: "" };
    current[target.dataset.reviewField] = target.value;
    current.updatedAt = new Date().toISOString();
    state.reviewState[productId] = current;
    persistReviewState();
    renderProductList();
  }
}

function readInputValue(input, field) {
  if (input.type === "checkbox") return input.checked;
  if (input.type === "number") return input.value === "" ? null : Number(input.value);
  if (field === "status") return input.value || "draft";
  return input.value === "" ? null : input.value;
}

function prepareSave() {
  const before = state.selectedEditable ?? editableFromRecord(state.selectedRecord);
  const diff = diffEditable(before, state.draft);
  if (!diff.length) {
    showToast("No changes to save.");
    return;
  }
  state.pendingDiff = diff;
  refs.diffContent.innerHTML = diff.map(renderDiffRow).join("");
  refs.confirmSaveCheckbox.checked = false;
  refs.confirmSaveButton.disabled = true;
  refs.diffModal.classList.remove("hidden");
}

function renderDiffRow(change) {
  return `
    <div class="diff-row">
      <div>
        <strong>${escapeHtml(change.label)}</strong>
        <div class="subtle">${escapeHtml(change.section)}</div>
      </div>
      <div>
        <span class="subtle">Before</span>
        <div>${escapeHtml(displayValue(change.before))}</div>
      </div>
      <div>
        <span class="subtle">After</span>
        <div>${escapeHtml(displayValue(change.after))}</div>
      </div>
    </div>
  `;
}

async function saveConfirmedChanges() {
  if (!state.selectedRecord || !state.draft || !refs.confirmSaveCheckbox.checked) return;
  refs.confirmSaveButton.disabled = true;
  refs.confirmSaveButton.textContent = "Saving…";

  try {
    const data = await api(`/api/products/${encodeURIComponent(state.selectedRecord.product.id)}`, {
      method: "PATCH",
      ifMatch: quoteVersion(state.selectedRecord.product.version),
      body: {
        confirm: true,
        draft: state.draft,
      },
    });
    state.selectedRecord = data.product;
    state.selectedEditable = editableFromRecord(data.product);
    state.editMode = false;
    state.draft = null;
    closeDiffModal();
    await loadProducts({ keepSelection: true });
    renderDetail();
    const auditText = data.auditLog?.written ? " Audit log written." : " Audit log was not written.";
    showToast(`Saved ${data.changedFields.length} changed fields.${auditText}`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    refs.confirmSaveButton.textContent = "Save confirmed changes";
    refs.confirmSaveButton.disabled = !refs.confirmSaveCheckbox.checked;
  }
}

function closeDiffModal() {
  refs.diffModal.classList.add("hidden");
  refs.pendingDiff = [];
}

function saveCurrentReview() {
  if (!state.selectedRecord) return null;
  const productId = state.selectedRecord.product.id;
  const status = refs.detailPane.querySelector("[data-review-field='status']")?.value ?? "needs_review";
  const notes = refs.detailPane.querySelector("[data-review-field='notes']")?.value ?? "";
  state.reviewState[productId] = { status, notes, updatedAt: new Date().toISOString() };
  persistReviewState();
  renderProductList();
  return state.reviewState[productId];
}

async function markReviewComplete() {
  if (!state.selectedRecord) return;
  const review = saveCurrentReview();
  review.status = review.status === "needs_review" ? "reviewed_ok" : review.status;
  review.updatedAt = new Date().toISOString();
  state.reviewState[state.selectedRecord.product.id] = review;
  persistReviewState();
  renderDetail();
  renderProductList();

  if (!state.config?.writesEnabled) {
    showToast("Review marked locally. Shared review persistence is not configured.");
    return;
  }

  try {
    const result = await api(`/api/products/${encodeURIComponent(state.selectedRecord.product.id)}/review`, {
      method: "POST",
      ifMatch: quoteVersion(state.selectedRecord.product.version),
      body: {
        confirm: true,
        status: review.status,
        notes: review.notes,
      },
    });
    showToast(result.auditLog?.written ? "Review audit log written." : "Review saved locally; audit log failed.");
  } catch (error) {
    showToast(`Review saved locally; audit failed: ${error.message}`, "error");
  }
}

function blankSpecRow() {
  return {
    id: null,
    spec_key: "",
    spec_label: "",
    value_text: "",
    value_normalized: "",
    value_number: null,
    unit: "",
    source_text: "",
    sort_order: state.draft.specValues.length,
  };
}

function blankExtraRow() {
  return {
    id: null,
    field_group: "general",
    field_key: "",
    field_label: "",
    value_text: "",
    value_number: null,
    unit: "",
    is_public: true,
    sort_order: state.draft.extraFields.length,
  };
}

function renderDetailError(error) {
  refs.detailPane.innerHTML = `
    <div class="error-state">
      <h2>Could not load product detail</h2>
      <p>${escapeHtml(error.message)}</p>
      <p class="subtle">If this is a permission error, use server-side reads with a service role key locally or add Data API grants and RLS policies for safe reads.</p>
    </div>
  `;
}

async function api(path, options = {}) {
  const method = options.method ?? "GET";
  const headers = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") {
    if (!state.config?.csrfToken) throw new Error("Secure write session is not ready. Refresh the page.");
    headers["X-Luminac-CSRF"] = state.config.csrfToken;
  }
  if (options.ifMatch) headers["If-Match"] = options.ifMatch;
  const response = await fetch(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message ?? data.error?.message ?? `Request failed with ${response.status}`);
    error.code = typeof data.error === "string" ? data.error : data.error?.code;
    error.details = data.details ?? data.error?.details;
    throw error;
  }
  return data;
}

function quoteVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Product version is unavailable. Refresh the page.");
  return `"${version}"`;
}

function loadReviewState() {
  try {
    return JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistReviewState() {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state.reviewState));
}

function badge(text, variant = "") {
  return `<span class="badge ${escapeHtml(variant)}">${escapeHtml(text)}</span>`;
}

function reviewClass(status) {
  if (status === "reviewed_ok") return "ok";
  if (status === "corrected") return "warning";
  if (status === "blocked") return "critical";
  return "muted";
}

function debounce(fn, wait) {
  let timeout = null;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), wait);
  };
}

function showToast(message, type = "") {
  refs.toast.textContent = message;
  refs.toast.className = `toast ${type}`;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => refs.toast.classList.add("hidden"), 4200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
