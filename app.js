import {
  AGENT_SCOPE_LABELS,
  GENAI_SCOPE_LABELS,
  STATUS_OPTIONS,
  classifyTechnique,
  deriveScopeLabels,
  filterCandidates
} from "./rules.js";

const STORAGE_KEY = "cgi-ai-red-team-scope-builder-v1";
const ARRAY_FIELDS = ["platforms", "modalities", "sectors", "impacts", "standards"];
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
  "physicalEnvironment"
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
    schemaVersion: 1,
    meta: {
      assessmentId: globalThis.crypto?.randomUUID?.() || `assessment-${Date.now()}`,
      createdAt: now,
      updatedAt: now
    },
    answers: {
      assessmentDate: localDateValue(),
      criticality: "moderate",
      platforms: ["Generative AI"],
      modalities: ["Text"],
      sectors: [],
      impacts: [],
      standards: [],
      genAiScope: "scope3",
      agentScope: "scope1"
    },
    overrides: {},
    review: {
      status: "Draft",
      reviewerName: "",
      reviewerRole: "",
      approvedAt: null
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
    const response = await fetch("./data/atlas-2026.09.json", { cache: "no-store" });
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

  form.addEventListener("change", (event) => {
    const previousAnswers = JSON.stringify(state.answers);
    readFormIntoState();
    updatePlatformDependencies();
    if (JSON.stringify(state.answers) !== previousAnswers) invalidateApproval();
    if (currentStep === panels.length) renderResults();
  });

  saveButton.addEventListener("click", () => {
    readFormIntoState();
    persistDraft();
    showToast("Draft saved in this browser.");
  });

  document.querySelector("#reset-assessment").addEventListener("click", resetAssessment);
  document.querySelector("#export-json").addEventListener("click", exportJson);
  document.querySelector("#export-csv").addEventListener("click", exportCsv);
  document.querySelector("#print-report").addEventListener("click", () => window.print());
  document.querySelector("#mark-ready").addEventListener("click", markReadyForReview);
  document.querySelector("#record-approval").addEventListener("click", recordApproval);

  ["technique-search", "status-filter", "platform-filter"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", renderTechniqueList);
  });

  document.querySelector("#technique-results").addEventListener("change", handleTechniqueChange);
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
    if (!state.answers.useCase) errors.push("Describe the AI use case.");
    if (!state.answers.businessOwner) errors.push("Enter a business or risk owner.");
  }
  if (step === 2) {
    if (!state.answers.platforms?.length) errors.push("Select at least one ATLAS platform filter.");
    if (state.answers.platforms?.includes("Generative AI") && !state.answers.genAiScope) {
      errors.push("Select a Generative AI ownership scope.");
    }
    if (state.answers.platforms?.includes("Agentic AI") && !state.answers.agentScope) {
      errors.push("Select an agentic autonomy scope.");
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

function renderResults() {
  const techniques = evaluateTechniques();
  const scopes = deriveScopeLabels(state.answers);
  const counts = Object.fromEntries(STATUS_OPTIONS.map((status) => [status, techniques.filter((item) => item.status === status).length]));
  const packs = [...new Set(techniques.flatMap((technique) => technique.testPacks))];

  document.querySelector("#summary-assessment-name").textContent = state.answers.assessmentName || "Untitled assessment";
  document.querySelector("#summary-client").textContent = state.answers.clientName || "Client not entered";
  document.querySelector("#summary-genai-scope").textContent = scopes.generative;
  document.querySelector("#summary-agent-scope").textContent = scopes.agentic;
  document.querySelector("#summary-candidate-count").textContent = techniques.length;
  document.querySelector("#summary-applicable-count").textContent = counts.Applicable;
  document.querySelector("#summary-investigate-count").textContent = counts["Needs investigation"];
  document.querySelector("#summary-test-pack-count").textContent = packs.length;
  document.querySelector("#review-status").textContent = state.review.status;
  document.querySelector("#review-status").dataset.status = state.review.status;
  document.querySelector("#approved-detail").textContent = state.review.approvedAt
    ? `Recorded ${formatDateTime(state.review.approvedAt)} by ${state.review.reviewerName}, ${state.review.reviewerRole}.`
    : "Expert approval has not been recorded.";

  renderTechniqueList();
  persistDraft();
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
    const searchable = `${technique.id} ${technique.name} ${technique.summary} ${technique.tactics.map((item) => item.name).join(" ")}`.toLowerCase();
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
  const statusClass = technique.status.toLowerCase().replaceAll(" ", "-");
  const options = STATUS_OPTIONS.map((status) =>
    `<option value="${status}" ${status === technique.status ? "selected" : ""}>${status}</option>`
  ).join("");
  const tactics = technique.tactics.length
    ? technique.tactics.map((item) => `<span class="tag">${escapeHtml(item.name)}</span>`).join("")
    : `<span class="tag muted">No tactic relationship listed</span>`;
  const signals = technique.signals.length
    ? technique.signals.map((item) => `<span class="tag signal">${escapeHtml(item)}</span>`).join("")
    : `<span class="tag muted">Architecture confirmation required</span>`;
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
        <div class="tag-row">${tactics}</div>
        <h4>Why it is in scope</h4>
        <div class="tag-row">${signals}</div>
        <p class="rationale">${escapeHtml(technique.rationale)}</p>
        <div class="technique-grid">
          <div>
            <h4>Evidence expected</h4>
            <ul>${evidence}</ul>
          </div>
          <div>
            <h4>ATLAS mitigations</h4>
            <ul>${mitigations}</ul>
          </div>
        </div>
        <div class="override-panel">
          <label>
            <span>Assessment status</span>
            <select data-technique-status="${technique.id}">${options}</select>
          </label>
          <label class="wide">
            <span>Client-specific rationale ${["Not applicable", "Deferred"].includes(technique.status) ? "(required)" : "(optional)"}</span>
            <textarea rows="2" data-technique-rationale="${technique.id}" placeholder="Record the architecture fact, exclusion, accepted deferral or compensating control.">${escapeHtml(state.overrides[technique.id]?.rationale || "")}</textarea>
          </label>
        </div>
        <a class="source-link" href="${technique.url}" target="_blank" rel="noreferrer">Open official MITRE ATLAS technique ↗</a>
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
  invalidateApproval();
  persistDraft();
  renderResults();
}

function unresolvedAssessment() {
  const techniques = evaluateTechniques();
  const unresolved = techniques.filter((technique) => technique.status === "Needs investigation");
  const missingRationale = techniques.filter((technique) =>
    ["Not applicable", "Deferred"].includes(technique.status) && !state.overrides[technique.id]?.rationale?.trim()
  );
  return { unresolved, missingRationale };
}

function markReadyForReview() {
  readFormIntoState();
  const { unresolved, missingRationale } = unresolvedAssessment();
  if (unresolved.length || missingRationale.length) {
    document.querySelector("#status-filter").value = unresolved.length ? "Needs investigation" : "";
    renderTechniqueList();
    showToast(
      unresolved.length
        ? `Resolve ${unresolved.length} techniques that still need investigation.`
        : `Add rationale for ${missingRationale.length} exclusions or deferrals.`,
      true
    );
    return;
  }
  state.review.status = "Ready for expert review";
  state.review.approvedAt = null;
  persistDraft();
  renderResults();
  showToast("Assessment marked ready for expert review.");
}

function recordApproval() {
  readFormIntoState();
  const attested = document.querySelector("#approval-attestation").checked;
  const { unresolved, missingRationale } = unresolvedAssessment();
  if (state.review.status !== "Ready for expert review") {
    showToast("Mark the assessment ready for expert review first.", true);
    return;
  }
  if (!state.review.reviewerName || !state.review.reviewerRole || !attested) {
    showToast("Enter the reviewer, role and confirmation before recording approval.", true);
    return;
  }
  if (unresolved.length || missingRationale.length) {
    showToast("Resolve outstanding technique decisions before approval.", true);
    return;
  }
  state.review.status = "Approved for test-plan development";
  state.review.approvedAt = new Date().toISOString();
  persistDraft();
  renderResults();
  showToast("Expert approval declaration recorded locally.");
}

function invalidateApproval() {
  if (state.review.status === "Draft") return;
  state.review.status = "Draft";
  state.review.approvedAt = null;
  const attestation = document.querySelector("#approval-attestation");
  if (attestation) attestation.checked = false;
}

function exportJson() {
  readFormIntoState();
  const exportPayload = {
    schemaVersion: state.schemaVersion,
    assessment: {
      ...state.meta,
      baseline: catalog.source,
      answers: state.answers,
      review: state.review
    },
    techniques: evaluateTechniques()
  };
  download(
    `${safeFileName(state.answers.assessmentName || "ai-red-team-scope")}.json`,
    JSON.stringify(exportPayload, null, 2),
    "application/json"
  );
}

function exportCsv() {
  readFormIntoState();
  const headings = [
    "Technique ID", "Technique", "Platforms", "Tactics", "Status", "Derived status", "Manual override",
    "Rationale", "Test packs", "Evidence", "Official source"
  ];
  const rows = evaluateTechniques().map((technique) => [
    technique.id,
    technique.name,
    technique.platforms.join("; "),
    technique.tactics.map((item) => item.name).join("; "),
    technique.status,
    technique.derivedStatus,
    technique.overridden ? "Yes" : "No",
    technique.rationale,
    technique.testPacks.join("; "),
    technique.evidence.join("; "),
    technique.url
  ]);
  const csv = [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  download(`${safeFileName(state.answers.assessmentName || "ai-red-team-scope")}.csv`, csv, "text/csv;charset=utf-8");
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
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.schemaVersion === 1) state = stored;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
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

let printOpenIds = [];
window.addEventListener("beforeprint", () => {
  printOpenIds = [...document.querySelectorAll("#technique-results details[open]")].map((item) => item.dataset.techniqueId);
  document.querySelector("#status-filter").value = "";
  document.querySelector("#platform-filter").value = "";
  document.querySelector("#technique-search").value = "";
  renderTechniqueList();
  document.querySelectorAll("#technique-results details").forEach((item) => { item.open = true; });
});

window.addEventListener("afterprint", () => {
  document.querySelectorAll("#technique-results details").forEach((item) => {
    item.open = printOpenIds.includes(item.dataset.techniqueId);
  });
});

initialise();
