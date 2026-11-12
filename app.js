import {
  DOMAIN_STATUS_OPTIONS,
  deriveDomainMatrix,
  deriveEffortBand,
  derivePrerequisiteReadiness
} from "./domains.js";
import {
  STATUS_OPTIONS,
  classifyTechnique,
  deriveScopeLabels,
  filterCandidates
} from "./rules.js";

const SCHEMA_VERSION = 2;
const STORAGE_KEY = "cgi-ai-red-team-scope-builder-v2";
const LEGACY_STORAGE_KEY = "cgi-ai-red-team-scope-builder-v1";
const OFFERING_PROFILE = {
  name: "CGI AI Red Teaming Continuous Assurance Offering",
  version: "Draft v2",
  sourceDocument: "cgi-ai-red-teaming-continuous-assurance-offering-v2.docx",
  rulesetVersion: "cgi-ai-scope-rules-2.0",
  service: "Atomic assessment — Readiness + Campaign (A + B)",
  wizardRole: "Mobilisation decision support and initial ATLAS candidate-set generation",
  deliverableStage: "DECIDE input",
  executionClaim: "No testing performed"
};

const SAFETY_TOPICS = ["Harmful content", "Bias", "Deception", "Groundedness", "Misinformation"];
const ARRAY_FIELDS = ["platforms", "modalities", "sectors", "impacts", "standards", "safetyTopics"];
const BOOLEAN_FIELDS = [
  "usesRag",
  "untrustedContent",
  "sensitiveData",
  "persistentMemory",
  "multiTenant",
  "trainsModels",
  "usesTools",
  "writeActions",
  "multiAgent",
  "rendersActiveContent",
  "publicExposure",
  "thirdPartyArtifacts",
  "codeExecution",
  "physicalEnvironment",
  "humanDecisionSupport",
  "humanApproval",
  "architectureDocsReady",
  "configAccessReady",
  "authorisationReady",
  "testIdentitiesReady",
  "safeTestDataReady",
  "telemetryReady",
  "rollbackReady",
  "costLimitsReady",
  "privacyApprovalReady"
];

const form = document.querySelector("#assessment-form");
const panels = [...document.querySelectorAll("[data-step-panel]")];
const stepButtons = [...document.querySelectorAll("[data-step-target]")];
const progressBar = document.querySelector("#progress-bar");
const progressText = document.querySelector("#progress-text");
const previousButton = document.querySelector("#previous-step");
const nextButton = document.querySelector("#next-step");
const saveButton = document.querySelector("#save-draft");
const toast = document.querySelector("#toast");

let currentStep = 1;
let catalog;
let state = createInitialState();
let toastTimer;

function createInitialState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      assessmentId: globalThis.crypto?.randomUUID?.() || `assessment-${Date.now()}`,
      createdAt: now,
      updatedAt: now
    },
    answers: {
      assessmentDate: localDateValue(),
      criticality: "moderate",
      environmentType: "non-production",
      cloudProvider: "AWS",
      rulesOfEngagementStatus: "not-started",
      platforms: ["Generative AI"],
      modalities: ["Text"],
      sectors: [],
      impacts: [],
      standards: [],
      safetyTopics: [...SAFETY_TOPICS],
      genAiScope: "scope3",
      agentScope: "scope1"
    },
    overrides: {},
    domainOverrides: {},
    review: {
      status: "Draft",
      reviewerName: "",
      reviewerRole: "",
      reviewedAt: null
    }
  };
}

function localDateValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function initialise() {
  try {
    const response = await fetch("./data/atlas-2026.10.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
    catalog = await response.json();
    restoreDraft();
    writeStateToForm();
    bindEvents();
    updatePlatformDependencies();
    renderBaseline();
    goToStep(1);
  } catch (error) {
    document.querySelector("#load-error").hidden = false;
    document.querySelector("#load-error-detail").textContent = error.message;
    form.hidden = true;
  }
}

function bindEvents() {
  previousButton.addEventListener("click", () => goToStep(currentStep - 1));
  nextButton.addEventListener("click", () => {
    readFormIntoState();
    if (!validateStep(currentStep)) return;
    goToStep(currentStep + 1);
  });

  stepButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const requested = Number(button.dataset.stepTarget);
      readFormIntoState();
      if (requested > currentStep && !validateStep(currentStep)) return;
      goToStep(requested);
    });
  });

  form.addEventListener("change", () => {
    const previousAnswers = JSON.stringify(state.answers);
    readFormIntoState();
    updatePlatformDependencies();
    if (JSON.stringify(state.answers) !== previousAnswers) invalidateReview();
    if (currentStep === panels.length) renderResults();
  });

  saveButton.addEventListener("click", () => {
    readFormIntoState();
    persistDraft();
    showToast("Draft saved in this browser.");
  });

  document.querySelector("#reset-assessment").addEventListener("click", resetAssessment);
  document.querySelector("#export-json").addEventListener("click", exportJson);
  document.querySelector("#export-domain-csv").addEventListener("click", exportDomainCsv);
  document.querySelector("#export-csv").addEventListener("click", exportTechniqueCsv);
  document.querySelector("#print-report").addEventListener("click", () => window.print());
  document.querySelector("#mark-ready").addEventListener("click", markReadyForReview);
  document.querySelector("#record-approval").addEventListener("click", recordDraftReview);

  ["technique-search", "status-filter", "platform-filter"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", renderTechniqueList);
  });

  document.querySelector("#technique-results").addEventListener("change", handleTechniqueChange);
  document.querySelector("#domain-results").addEventListener("change", handleDomainChange);
}

function readFormIntoState() {
  const formData = new FormData(form);
  const answers = { ...state.answers };

  [...form.elements].forEach((element) => {
    if (!element.name || element.type === "checkbox" || element.type === "radio") return;
    if (["reviewerName", "reviewerRole"].includes(element.name)) return;
    answers[element.name] = element.value.trim?.() ?? element.value;
  });

  ARRAY_FIELDS.forEach((field) => {
    answers[field] = formData.getAll(field);
  });

  BOOLEAN_FIELDS.forEach((field) => {
    answers[field] = Boolean(form.querySelector(`[name="${field}"]`)?.checked);
  });

  state.answers = answers;
  state.review.reviewerName = formData.get("reviewerName")?.trim() || "";
  state.review.reviewerRole = formData.get("reviewerRole")?.trim() || "";
  state.meta.updatedAt = new Date().toISOString();
}

function writeStateToForm() {
  Object.entries(state.answers).forEach(([name, value]) => {
    const controls = [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
    controls.forEach((control) => {
      if (control.type === "checkbox" || control.type === "radio") {
        control.checked = Array.isArray(value) ? value.includes(control.value) : Boolean(value === control.value || value === true);
      } else if (!Array.isArray(value) && value != null) {
        control.value = value;
      }
    });
  });
  form.elements.reviewerName.value = state.review.reviewerName || "";
  form.elements.reviewerRole.value = state.review.reviewerRole || "";
}

function updatePlatformDependencies() {
  const platforms = state.answers.platforms || [];
  const genAiEnabled = platforms.includes("Generative AI");
  const agentEnabled = platforms.includes("Agentic AI");
  const genAiControl = form.elements.genAiScope;
  const agentControl = form.elements.agentScope;
  genAiControl.disabled = !genAiEnabled;
  agentControl.disabled = !agentEnabled;
  document.querySelector("#genai-scope-field").classList.toggle("field-disabled", !genAiEnabled);
  document.querySelector("#agent-scope-field").classList.toggle("field-disabled", !agentEnabled);
}

function validateStep(step) {
  const errors = [];
  if (step === 1) {
    if (!state.answers.assessmentName) errors.push("Enter an assessment name.");
    if (!state.answers.clientName) errors.push("Enter the client or organisation name.");
    if (!state.answers.businessOwner) errors.push("Enter a business or risk owner.");
    if (!state.answers.targetName) errors.push("Enter the single application or workflow in scope.");
    if (!state.answers.useCase) errors.push("Describe the AI use case.");
  }
  if (step === 2) {
    if (!state.answers.environmentName) errors.push("Enter the primary environment name.");
    if (!state.answers.environmentType) errors.push("Select the environment type.");
  }
  if (step === 3) {
    if (!state.answers.platforms?.length) errors.push("Select at least one ATLAS platform filter.");
    if (state.answers.platforms?.includes("Generative AI") && !state.answers.genAiScope) {
      errors.push("Select a Generative AI ownership scope.");
    }
    if (state.answers.platforms?.includes("Agentic AI") && !state.answers.agentScope) {
      errors.push("Select an agentic autonomy scope.");
    }
  }
  if (step === 5 && SAFETY_TOPICS.some((topic) => !state.answers.safetyTopics?.includes(topic))) {
    errors.push("Keep all five A2 safety topic groups in the atomic assessment scope.");
  }
  if (step === 6) {
    if (!state.answers.authorisedTargets) errors.push("Describe the authorised target boundary.");
    if (!state.answers.stopConditions) errors.push("Define campaign stop conditions.");
    if (![state.answers.requestLimit, state.answers.tokenLimit, state.answers.spendLimit].some((value) => value?.trim())) {
      errors.push("Set at least one request, token or spend limit for the fixed test budget.");
    }
    if (!state.answers.retestWindow) errors.push("Define the targeted retest window.");
    if (state.answers.environmentType === "production" && state.answers.rulesOfEngagementStatus !== "approved") {
      errors.push("Production testing requires rules of engagement approved outside this wizard.");
    }
  }

  const errorBox = document.querySelector(`#step-${step}-errors`);
  if (errorBox) {
    errorBox.hidden = errors.length === 0;
    errorBox.innerHTML = errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
  }
  if (errors.length) {
    showToast(errors[0], true);
    errorBox?.focus();
    return false;
  }
  return true;
}

function goToStep(step) {
  currentStep = Math.min(Math.max(step, 1), panels.length);
  panels.forEach((panel) => {
    panel.hidden = Number(panel.dataset.stepPanel) !== currentStep;
  });
  stepButtons.forEach((button) => {
    const number = Number(button.dataset.stepTarget);
    button.classList.toggle("active", number === currentStep);
    button.classList.toggle("complete", number < currentStep);
    button.setAttribute("aria-current", number === currentStep ? "step" : "false");
  });
  progressBar.style.width = `${(currentStep / panels.length) * 100}%`;
  progressText.textContent = `Step ${currentStep} of ${panels.length}`;
  previousButton.hidden = currentStep === 1;
  nextButton.hidden = currentStep === panels.length;
  if (currentStep === panels.length) renderResults();
  document.querySelector("#wizard-heading").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function evaluateTechniques() {
  return filterCandidates(catalog.techniques, state.answers).map((technique) =>
    classifyTechnique(technique, state.answers, state.overrides[technique.id])
  );
}

function evaluateDomains() {
  return deriveDomainMatrix(state.answers, state.domainOverrides);
}

function evaluatePrerequisites() {
  return derivePrerequisiteReadiness(state.answers);
}

function renderResults() {
  const techniques = evaluateTechniques();
  const domains = evaluateDomains();
  const prerequisites = evaluatePrerequisites();
  const effort = deriveEffortBand(state.answers);
  const packs = [...new Set(techniques.flatMap((technique) => technique.testPacks))];
  const domainCounts = Object.fromEntries(
    DOMAIN_STATUS_OPTIONS.map((status) => [status, domains.filter((item) => item.status === status).length])
  );
  const prerequisitesOpen = prerequisites.filter((item) => item.status !== "Confirmed").length;

  document.querySelector("#summary-assessment-name").textContent = state.answers.assessmentName || "Untitled assessment";
  document.querySelector("#summary-client").textContent = state.answers.clientName || "Client not entered";
  document.querySelector("#summary-system-type").textContent = effort.systemType;
  document.querySelector("#summary-environment").textContent = [state.answers.environmentName, environmentTypeLabel(state.answers.environmentType)].filter(Boolean).join(" · ") || "Not entered";
  document.querySelector("#summary-effort").textContent = `${effort.elapsed} · ${effort.effort}`;
  document.querySelector("#summary-candidate-count").textContent = techniques.length;
  document.querySelector("#summary-domain-applicable").textContent = domainCounts.Applicable;
  document.querySelector("#summary-domain-investigate").textContent = domainCounts["Needs investigation"];
  document.querySelector("#summary-prereq-gaps").textContent = prerequisitesOpen;
  document.querySelector("#summary-test-pack-count").textContent = packs.length;
  document.querySelector("#review-status").textContent = state.review.status;
  document.querySelector("#review-status").dataset.status = state.review.status;
  document.querySelector("#approved-detail").textContent = state.review.reviewedAt
    ? `Draft review recorded ${formatDateTime(state.review.reviewedAt)} by ${state.review.reviewerName}, ${state.review.reviewerRole}.`
    : "Draft review has not been recorded.";

  renderBoundarySummary(effort);
  renderPrerequisites(prerequisites);
  renderDomains(domains);
  renderTechniqueList();
  persistDraft();
}

function renderBoundarySummary(effort) {
  const scopes = deriveScopeLabels(state.answers);
  const budget = [
    state.answers.requestLimit && `${state.answers.requestLimit} requests`,
    state.answers.tokenLimit && `${state.answers.tokenLimit} tokens`,
    state.answers.spendLimit && `${state.answers.spendLimit} maximum spend`
  ].filter(Boolean).join(" · ") || "Not defined";
  const items = [
    ["Target", state.answers.targetName || "Not entered"],
    ["Environment", `${state.answers.cloudProvider || "Provider not entered"} · ${state.answers.cloudRegion || "Region not entered"} · ${environmentTypeLabel(state.answers.environmentType)}`],
    ["AI profile", `${scopes.generative}; ${scopes.agentic}`],
    ["Rules of engagement", rulesStatusLabel(state.answers.rulesOfEngagementStatus)],
    ["Fixed test budget", budget],
    ["Stop authority", `${state.answers.killSwitchOwner || "Owner not entered"}; ${state.answers.stopConditions || "conditions not entered"}`],
    ["Retest", state.answers.retestWindow || "Not entered"],
    ["Planning band", `${effort.elapsed} · ${effort.effort} (proposal, not a benchmark)`]
  ];
  document.querySelector("#scope-boundary-results").innerHTML = items.map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join("");
}

function renderPrerequisites(prerequisites) {
  const confirmed = prerequisites.filter((item) => item.status === "Confirmed").length;
  document.querySelector("#readiness-result-count").textContent = `${confirmed} of ${prerequisites.length} confirmed`;
  document.querySelector("#prerequisite-results").innerHTML = prerequisites.map((item) => `
    <div class="prerequisite-item ${item.status === "Confirmed" ? "confirmed" : "open"}">
      <span aria-hidden="true">${item.status === "Confirmed" ? "✓" : "!"}</span>
      <strong>${escapeHtml(item.label)}</strong>
      <small>${escapeHtml(item.status)}</small>
    </div>
  `).join("");
}

function renderDomains(domains) {
  const container = document.querySelector("#domain-results");
  container.innerHTML = domains.map((domain) => {
    const statusClass = statusClassName(domain.status);
    const options = DOMAIN_STATUS_OPTIONS.map((status) =>
      `<option value="${status}" ${status === domain.status ? "selected" : ""}>${status}</option>`
    ).join("");
    const families = domain.sourceFamilies.length
      ? domain.sourceFamilies.map((family) => `<span class="tag">${family}</span>`).join("")
      : `<span class="tag muted">CGI addition · no v1 source family</span>`;
    const manualRationale = state.domainOverrides[domain.id]?.rationale || "";
    return `
      <article class="domain-card" data-domain-id="${domain.id}">
        <header>
          <span class="domain-id">${domain.id}</span>
          <div><small>${escapeHtml(domain.layer)}</small><h4>${escapeHtml(domain.title)}</h4></div>
          <span class="status-badge ${statusClass}">${escapeHtml(domain.status)}</span>
        </header>
        <p>${escapeHtml(domain.description)}</p>
        <div class="domain-meta">
          <div><span>CGI v1 source families</span><div class="tag-row">${families}</div></div>
          <div><span>Profile coverage</span><strong>${escapeHtml(domain.coverage)}</strong></div>
          <div><span>Campaign execution</span><strong>${escapeHtml(domain.campaignStatus)}</strong></div>
        </div>
        <p class="rationale">${escapeHtml(domain.rationale)}</p>
        <div class="domain-decision">
          <label><span>Planning disposition</span><select data-domain-status="${domain.id}">${options}</select></label>
          <label><span>Expert rationale ${["Not applicable", "Deferred"].includes(domain.status) ? "(required when overridden)" : "(optional)"}</span><textarea rows="2" data-domain-rationale="${domain.id}" placeholder="Record the architecture fact, exclusion, accepted deferral or condition for resolution.">${escapeHtml(manualRationale)}</textarea></label>
        </div>
      </article>`;
  }).join("");
}

function renderTechniqueList() {
  if (!catalog) return;
  const openIds = new Set(
    [...document.querySelectorAll("#technique-results details[open]")].map((item) => item.dataset.techniqueId)
  );
  const all = evaluateTechniques();
  const query = document.querySelector("#technique-search").value.trim().toLowerCase();
  const status = document.querySelector("#status-filter").value;
  const platform = document.querySelector("#platform-filter").value;
  const filtered = all.filter((technique) => {
    const searchable = `${technique.id} ${technique.name} ${technique.summary} ${technique.cgiDomains.join(" ")} ${technique.tactics.map((item) => item.name).join(" ")}`.toLowerCase();
    return (!query || searchable.includes(query)) &&
      (!status || technique.status === status) &&
      (!platform || technique.platforms.includes(platform));
  });

  document.querySelector("#result-count").textContent = `${filtered.length} of ${all.length} techniques shown`;
  const container = document.querySelector("#technique-results");
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><strong>No techniques match these filters.</strong><span>Change the status, platform or search text.</span></div>`;
    return;
  }

  container.innerHTML = filtered.map((technique) => techniqueCard(technique)).join("");
  openIds.forEach((id) => {
    const details = container.querySelector(`[data-technique-id="${CSS.escape(id)}"]`);
    if (details) details.open = true;
  });
}

function techniqueCard(technique) {
  const statusClass = statusClassName(technique.status);
  const options = STATUS_OPTIONS.map((status) =>
    `<option value="${status}" ${status === technique.status ? "selected" : ""}>${status}</option>`
  ).join("");
  const tactics = technique.tactics.length
    ? technique.tactics.map((item) => `<span class="tag">${escapeHtml(item.name)}</span>`).join("")
    : `<span class="tag muted">No tactic relationship listed</span>`;
  const signals = technique.signals.length
    ? technique.signals.map((item) => `<span class="tag signal">${escapeHtml(item)}</span>`).join("")
    : `<span class="tag muted">Architecture confirmation required</span>`;
  const domains = technique.cgiDomains.length
    ? technique.cgiDomains.map((item) => `<span class="tag domain-tag">${escapeHtml(item)}</span>`).join("")
    : `<span class="tag muted">Crosswalk review required</span>`;
  const families = technique.sourceFamilies.length
    ? technique.sourceFamilies.map((item) => `<span class="tag">${item}</span>`).join("")
    : `<span class="tag muted">No v1 source family mapped</span>`;
  const mitigations = technique.mitigations.length
    ? technique.mitigations.slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.id)}</strong> · ${escapeHtml(item.name)}</li>`).join("")
    : `<li>Confirm controls during threat modelling.</li>`;
  const evidence = technique.evidence.length
    ? technique.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>Architecture, control decision, attack transcript, outcome and retained evidence.</li>`;

  return `
    <details class="technique-card" data-technique-id="${technique.id}">
      <summary>
        <span class="technique-id">${technique.id}</span>
        <span class="technique-title">${escapeHtml(technique.name)}</span>
        <span class="status-badge ${statusClass}">${escapeHtml(technique.status)}</span>
        <span class="platform-badges">${technique.platforms.map((item) => `<span>${item === "Generative AI" ? "GenAI" : "Agentic"}</span>`).join("")}</span>
      </summary>
      <div class="technique-body">
        <p>${escapeHtml(technique.summary)}</p>
        <div class="crosswalk-strip">
          <div><h4>CGI domains</h4><div class="tag-row">${domains}</div></div>
          <div><h4>CGI v1 source families</h4><div class="tag-row">${families}</div></div>
          <div><h4>Campaign execution</h4><strong>${escapeHtml(technique.campaignStatus)}</strong></div>
        </div>
        <div class="tag-row">${tactics}</div>
        <h4>Why it is in scope</h4>
        <div class="tag-row">${signals}</div>
        <p class="rationale">${escapeHtml(technique.rationale)}</p>
        <div class="technique-grid">
          <div><h4>Evidence expected</h4><ul>${evidence}</ul></div>
          <div><h4>ATLAS mitigations</h4><ul>${mitigations}</ul></div>
        </div>
        <div class="override-panel">
          <label><span>Planning disposition</span><select data-technique-status="${technique.id}">${options}</select></label>
          <label class="wide"><span>Client-specific rationale ${["Not applicable", "Deferred"].includes(technique.status) ? "(required)" : "(optional)"}</span><textarea rows="2" data-technique-rationale="${technique.id}" placeholder="Record the architecture fact, exclusion, accepted deferral or compensating control.">${escapeHtml(state.overrides[technique.id]?.rationale || "")}</textarea></label>
        </div>
        <a class="source-link" href="${escapeHtml(technique.url)}" target="_blank" rel="noreferrer">Open official MITRE ATLAS technique ↗</a>
      </div>
    </details>`;
}

function handleTechniqueChange(event) {
  const statusId = event.target.dataset.techniqueStatus;
  const rationaleId = event.target.dataset.techniqueRationale;
  const techniqueId = statusId || rationaleId;
  if (!techniqueId) return;

  const existing = state.overrides[techniqueId] || {};
  if (statusId) existing.status = event.target.value;
  if (rationaleId) existing.rationale = event.target.value;
  state.overrides[techniqueId] = existing;
  state.meta.updatedAt = new Date().toISOString();
  invalidateReview();
  persistDraft();
  renderResults();
}

function handleDomainChange(event) {
  const statusId = event.target.dataset.domainStatus;
  const rationaleId = event.target.dataset.domainRationale;
  const domainId = statusId || rationaleId;
  if (!domainId) return;

  const existing = state.domainOverrides[domainId] || {};
  if (statusId) existing.status = event.target.value;
  if (rationaleId) existing.rationale = event.target.value;
  state.domainOverrides[domainId] = existing;
  state.meta.updatedAt = new Date().toISOString();
  invalidateReview();
  persistDraft();
  renderResults();
}

function unresolvedAssessment() {
  const techniques = evaluateTechniques();
  const domains = evaluateDomains();
  const unresolvedTechniques = techniques.filter((technique) => technique.status === "Needs investigation");
  const missingTechniqueRationale = techniques.filter((technique) =>
    ["Not applicable", "Deferred"].includes(technique.status) && !state.overrides[technique.id]?.rationale?.trim()
  );
  const unresolvedDomains = domains.filter((domain) => domain.status === "Needs investigation");
  const missingDomainRationale = domains.filter((domain) => {
    const override = state.domainOverrides[domain.id];
    return override?.status && ["Not applicable", "Deferred"].includes(override.status) && !override.rationale?.trim();
  });
  return { unresolvedTechniques, missingTechniqueRationale, unresolvedDomains, missingDomainRationale };
}

function markReadyForReview() {
  readFormIntoState();
  const outstanding = unresolvedAssessment();
  if (outstanding.unresolvedDomains.length || outstanding.missingDomainRationale.length) {
    document.querySelector("#domain-scope-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(
      outstanding.unresolvedDomains.length
        ? `Resolve ${outstanding.unresolvedDomains.length} domain decisions.`
        : `Add rationale for ${outstanding.missingDomainRationale.length} domain exclusions or deferrals.`,
      true
    );
    return;
  }
  if (outstanding.unresolvedTechniques.length || outstanding.missingTechniqueRationale.length) {
    document.querySelector("#status-filter").value = outstanding.unresolvedTechniques.length ? "Needs investigation" : "";
    renderTechniqueList();
    document.querySelector("#technique-scope-heading").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(
      outstanding.unresolvedTechniques.length
        ? `Resolve ${outstanding.unresolvedTechniques.length} techniques that still need investigation.`
        : `Add rationale for ${outstanding.missingTechniqueRationale.length} technique exclusions or deferrals.`,
      true
    );
    return;
  }
  state.review.status = "Ready for expert review";
  state.review.reviewedAt = null;
  persistDraft();
  renderResults();
  showToast("Draft scope marked ready for expert review.");
}

function recordDraftReview() {
  readFormIntoState();
  const attested = document.querySelector("#approval-attestation").checked;
  const outstanding = unresolvedAssessment();
  if (state.review.status !== "Ready for expert review") {
    showToast("Mark the draft scope ready for expert review first.", true);
    return;
  }
  if (!state.review.reviewerName || !state.review.reviewerRole || !attested) {
    showToast("Enter the reviewer, role and confirmation before recording the draft review.", true);
    return;
  }
  if (Object.values(outstanding).some((items) => items.length)) {
    showToast("Resolve outstanding planning decisions before recording the review.", true);
    return;
  }
  state.review.status = "Expert-reviewed draft";
  state.review.reviewedAt = new Date().toISOString();
  persistDraft();
  renderResults();
  showToast("Expert review declaration recorded locally; testing is not authorised.");
}

function invalidateReview() {
  if (state.review.status === "Draft") return;
  state.review.status = "Draft";
  state.review.reviewedAt = null;
  const attestation = document.querySelector("#approval-attestation");
  if (attestation) attestation.checked = false;
}

function buildExportPayload() {
  const effort = deriveEffortBand(state.answers);
  const domains = evaluateDomains().map(({ roots, ...domain }) => domain);
  return {
    schemaVersion: state.schemaVersion,
    offeringProfile: OFFERING_PROFILE,
    generatedAt: new Date().toISOString(),
    limitations: [
      "Draft mobilisation output only; it does not authorise testing.",
      "Planning disposition is not campaign execution status.",
      "No control effectiveness, compliance or production readiness claim is made.",
      "The ATLAS candidate set and CGI crosswalk require expert validation in the client threat-model workshop."
    ],
    assessment: {
      ...state.meta,
      baseline: catalog.source,
      answers: state.answers,
      derived: {
        scopes: deriveScopeLabels(state.answers),
        effort,
        prerequisites: evaluatePrerequisites()
      },
      review: state.review
    },
    domainMatrix: domains,
    techniques: evaluateTechniques()
  };
}

function exportJson() {
  readFormIntoState();
  download(
    `${safeFileName(state.answers.assessmentName || "ai-red-team-scope")}-draft-scope.json`,
    JSON.stringify(buildExportPayload(), null, 2),
    "application/json"
  );
}

function exportDomainCsv() {
  readFormIntoState();
  const headings = [
    "Domain ID", "Layer", "Domain", "Planning disposition", "Derived disposition", "Campaign execution",
    "CGI v1 source families", "Profile coverage", "Rationale"
  ];
  const rows = evaluateDomains().map((domain) => [
    domain.id,
    domain.layer,
    domain.title,
    domain.status,
    domain.derivedStatus,
    domain.campaignStatus,
    domain.sourceFamilies.join("; ") || "CGI addition — no v1 source family",
    domain.coverage,
    domain.rationale
  ]);
  downloadCsv(`${safeFileName(state.answers.assessmentName || "ai-red-team-scope")}-domains.csv`, headings, rows);
}

function exportTechniqueCsv() {
  readFormIntoState();
  const headings = [
    "Technique ID", "Technique", "Platforms", "Tactics", "Planning disposition", "Derived disposition",
    "Campaign execution", "CGI domains", "CGI v1 source families", "Manual override", "Rationale",
    "Test packs", "Evidence", "Official source"
  ];
  const rows = evaluateTechniques().map((technique) => [
    technique.id,
    technique.name,
    technique.platforms.join("; "),
    technique.tactics.map((item) => item.name).join("; "),
    technique.status,
    technique.derivedStatus,
    technique.campaignStatus,
    technique.cgiDomains.join("; "),
    technique.sourceFamilies.join("; "),
    technique.overridden ? "Yes" : "No",
    technique.rationale,
    technique.testPacks.join("; "),
    technique.evidence.join("; "),
    technique.url
  ]);
  downloadCsv(`${safeFileName(state.answers.assessmentName || "ai-red-team-scope")}-techniques.csv`, headings, rows);
}

function downloadCsv(filename, headings, rows) {
  const csv = [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  download(filename, csv, "text/csv;charset=utf-8");
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function download(filename, content, type) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetAssessment() {
  if (!window.confirm("Reset this assessment and remove its locally saved answers?")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  state = createInitialState();
  form.reset();
  writeStateToForm();
  updatePlatformDependencies();
  goToStep(1);
  showToast("Assessment reset.");
}

function persistDraft() {
  state.meta.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreDraft() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (current?.schemaVersion === SCHEMA_VERSION) {
      state = normaliseState(current);
      return;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy?.schemaVersion === 1) {
      state = normaliseState({
        ...legacy,
        schemaVersion: SCHEMA_VERSION,
        domainOverrides: {},
        review: {
          status: "Draft",
          reviewerName: legacy.review?.reviewerName || "",
          reviewerRole: legacy.review?.reviewerRole || "",
          reviewedAt: null
        }
      });
      persistDraft();
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function normaliseState(candidate) {
  const defaults = createInitialState();
  return {
    ...defaults,
    ...candidate,
    schemaVersion: SCHEMA_VERSION,
    meta: { ...defaults.meta, ...(candidate.meta || {}) },
    answers: { ...defaults.answers, ...(candidate.answers || {}) },
    overrides: candidate.overrides || {},
    domainOverrides: candidate.domainOverrides || {},
    review: { ...defaults.review, ...(candidate.review || {}) }
  };
}

function renderBaseline() {
  document.querySelectorAll("[data-atlas-version]").forEach((element) => {
    element.textContent = `ATLAS v${catalog.source.version}`;
  });
  document.querySelector("#catalogue-count").textContent = catalog.counts.selectedTechniques;
  document.querySelector("#catalogue-source").href = catalog.source.releaseUrl;
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function environmentTypeLabel(value) {
  return {
    "non-production": "Non-production",
    "production": "Production",
    "isolated-test": "Dedicated isolated test"
  }[value] || "Environment not classified";
}

function rulesStatusLabel(value) {
  return {
    "not-started": "Not started",
    "draft": "Draft",
    "approved": "Approved outside this wizard"
  }[value] || "Not recorded";
}

function statusClassName(value) {
  return String(value).toLowerCase().replaceAll(" ", "-");
}

function safeFileName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "assessment";
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let printState = null;
window.addEventListener("beforeprint", () => {
  printState = {
    openIds: [...document.querySelectorAll("#technique-results details[open]")].map((item) => item.dataset.techniqueId),
    status: document.querySelector("#status-filter").value,
    platform: document.querySelector("#platform-filter").value,
    search: document.querySelector("#technique-search").value
  };
  document.querySelector("#status-filter").value = "";
  document.querySelector("#platform-filter").value = "";
  document.querySelector("#technique-search").value = "";
  renderTechniqueList();
  document.querySelectorAll("#technique-results details").forEach((item) => { item.open = true; });
});

window.addEventListener("afterprint", () => {
  if (!printState) return;
  document.querySelector("#status-filter").value = printState.status;
  document.querySelector("#platform-filter").value = printState.platform;
  document.querySelector("#technique-search").value = printState.search;
  renderTechniqueList();
  document.querySelectorAll("#technique-results details").forEach((item) => {
    item.open = printState.openIds.includes(item.dataset.techniqueId);
  });
  printState = null;
});

initialise();
