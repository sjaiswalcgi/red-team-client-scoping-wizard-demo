export const DOMAIN_STATUS_OPTIONS = [
  "Applicable",
  "Needs investigation",
  "Not applicable",
  "Deferred"
];

export const CAMPAIGN_STATUS = "Not tested";

export const DOMAIN_DEFINITIONS = [
  {
    id: "A1",
    layer: "Input integrity",
    title: "Prompt injection",
    description: "Direct, indirect, encoded, multilingual and multimodal instruction attacks, including unsafe output handling.",
    sourceFamilies: [2, 3, 13],
    coverage: "Covered",
    roots: ["AML.T0051", "AML.T0054", "AML.T0068", "AML.T0070", "AML.T0071", "AML.T0093", "AML.T0066", "AML.T0129", "AML.T0015", "AML.T0043.003"]
  },
  {
    id: "A2",
    layer: "Input integrity",
    title: "Jailbreak, harmful and misleading output",
    description: "Jailbreaks, harmful content, bias, deception, hallucination and groundedness, misinformation and manipulation of trusted output.",
    sourceFamilies: [],
    coverage: "To build",
    roots: ["AML.T0054", "AML.T0067", "AML.T0062", "AML.T0060", "AML.T0130", "AML.T0131"]
  },
  {
    id: "B1",
    layer: "Data",
    title: "Memory, RAG and context poisoning",
    description: "Poisoned retrieval or memory, provenance loss, cross-user state leakage and training-time poisoning where applicable.",
    sourceFamilies: [4],
    coverage: "Covered",
    roots: ["AML.T0080", "AML.T0070", "AML.T0071", "AML.T0092", "AML.T0085.000", "AML.T0085.002"]
  },
  {
    id: "B2",
    layer: "Data",
    title: "Sensitive data, secrets and system prompt disclosure",
    description: "Disclosure, inference, cross-user leakage, model extraction and exposure of hidden instructions or credentials.",
    sourceFamilies: [8, 10],
    coverage: "Covered",
    roots: ["AML.T0098", "AML.T0083", "AML.T0082", "AML.T0055", "AML.T0086", "AML.T0136", "AML.T0024", "AML.T0137.003", "AML.T0069.002", "AML.T0085.003"]
  },
  {
    id: "C1",
    layer: "Agency",
    title: "Tool and MCP integrity",
    description: "Tool poisoning, schema drift, capability escalation and model, dataset, package or prompt-asset supply-chain compromise.",
    sourceFamilies: [5],
    coverage: "Covered",
    roots: ["AML.T0110", "AML.T0099", "AML.T0109", "AML.T0010.005", "AML.T0011.002", "AML.T0115.002"]
  },
  {
    id: "C2",
    layer: "Agency",
    title: "Unsafe action and code execution",
    description: "Excessive agency, action replay, parameter tampering, approval bypass and unsafe code or command execution.",
    sourceFamilies: [6, 11],
    coverage: "Covered",
    roots: ["AML.T0053", "AML.T0101", "AML.T0050", "AML.T0102", "AML.T0105", "AML.T0048", "AML.T0112", "AML.T0124", "AML.T0134"]
  },
  {
    id: "C3",
    layer: "Agency",
    title: "Identity and authorization",
    description: "Privilege escalation, confused deputy, exposed endpoints, IAM paths and missing identity or workload telemetry.",
    sourceFamilies: [7, 8],
    coverage: "Partially covered",
    roots: ["AML.T0012", "AML.T0053", "AML.T0091", "AML.T0139"]
  },
  {
    id: "C4",
    layer: "Agency",
    title: "Multi-agent and A2A trust",
    description: "False hand-offs, cross-agent trust abuse, rogue agents, shared-artifact compromise and cascading failure.",
    sourceFamilies: [9, 11, 12],
    coverage: "Partially covered",
    roots: ["AML.T0053", "AML.T0081", "AML.T0118", "AML.T0143", "AML.T0061", "AML.T0103", "AML.T0108"]
  },
  {
    id: "C5",
    layer: "Agency",
    title: "Human-agent trust",
    description: "Reviewer deception, unsafe copy and paste, social engineering, alert fatigue, escalation and emergency-control failure.",
    sourceFamilies: [7, 11],
    coverage: "To build",
    roots: ["AML.T0067", "AML.T0130", "AML.T0131"]
  },
  {
    id: "D1",
    layer: "Platform",
    title: "Availability, cost and resource abuse",
    description: "Denial of wallet, retry loops, expensive routing, cache defeat, quota bypass and resource exhaustion.",
    sourceFamilies: [12],
    coverage: "Partially covered",
    roots: ["AML.T0034", "AML.T0029", "AML.T0046"]
  },
  {
    id: "X1",
    layer: "Cross-cutting",
    title: "Phase 0 reconnaissance",
    description: "Bounded capability discovery and autonomous reconnaissance against explicitly approved targets.",
    sourceFamilies: [1],
    coverage: "Partially covered",
    roots: ["AML.T0084", "AML.T0133", "AML.T0006.003", "AML.T0069.002"]
  },
  {
    id: "X2",
    layer: "Cross-cutting",
    title: "Detection, response and regression",
    description: "Detection, alert routing, containment, recovery and future regression requirements applied across every tested domain.",
    sourceFamilies: [14, 15, 16],
    coverage: "Partially covered",
    roots: ["AML.T0138", "AML.T0141", "AML.T0109", "AML.T0018.003", "AML.T0081"]
  }
];

export const DOMAIN_BY_ID = new Map(DOMAIN_DEFINITIONS.map((domain) => [domain.id, domain]));

const ALWAYS_APPLICABLE = new Set(["A1", "A2", "B2", "C3", "D1", "X1", "X2"]);

function selected(answers, key) {
  return Boolean(answers?.[key]);
}

function includes(answers, key, value) {
  return Array.isArray(answers?.[key]) && answers[key].includes(value);
}

function matchesRoot(techniqueId, root) {
  return techniqueId === root || techniqueId.startsWith(`${root}.`);
}

export function deriveSystemType(answers = {}) {
  if (selected(answers, "multiAgent")) return "Multi-agent system";
  if (includes(answers, "platforms", "Agentic AI") || selected(answers, "usesTools") || selected(answers, "writeActions")) {
    return "Agentic or tool-enabled workflow";
  }
  if (selected(answers, "usesRag")) return "RAG application";
  return "Basic chatbot";
}

export function deriveEffortBand(answers = {}) {
  const systemType = deriveSystemType(answers);
  if (systemType === "Basic chatbot") {
    return { systemType, elapsed: "2–3 weeks", effort: "10–15 person-days" };
  }
  if (systemType === "RAG application") {
    return { systemType, elapsed: "3–4 weeks", effort: "15–25 person-days" };
  }
  return { systemType, elapsed: "4–6 weeks", effort: "25–40 person-days" };
}

function derivedDisposition(domainId, answers) {
  if (ALWAYS_APPLICABLE.has(domainId)) return "Applicable";

  const agentic = includes(answers, "platforms", "Agentic AI") || selected(answers, "usesTools") || selected(answers, "writeActions");
  const ragOrMemory = selected(answers, "usesRag") || selected(answers, "persistentMemory") || selected(answers, "trainsModels");

  if (domainId === "B1") return ragOrMemory ? "Applicable" : "Needs investigation";
  if (domainId === "C1") {
    if (selected(answers, "usesTools") || selected(answers, "thirdPartyArtifacts") || agentic) return "Applicable";
    return selected(answers, "usesRag") ? "Needs investigation" : "Not applicable";
  }
  if (domainId === "C2") {
    return agentic || selected(answers, "codeExecution") || selected(answers, "physicalEnvironment")
      ? "Applicable"
      : "Not applicable";
  }
  if (domainId === "C4") {
    if (selected(answers, "multiAgent")) return "Applicable";
    return agentic ? "Needs investigation" : "Not applicable";
  }
  if (domainId === "C5") {
    if (agentic || selected(answers, "humanDecisionSupport") || selected(answers, "humanApproval")) return "Applicable";
    return "Needs investigation";
  }
  return "Needs investigation";
}

function dispositionRationale(domainId, status, answers) {
  if (domainId === "A1") return "Prompt and instruction attacks apply to every generative or agentic AI application.";
  if (domainId === "A2") return "The atomic assessment includes risk-prioritised harmful, biased, deceptive, ungrounded and misleading-output testing.";
  if (domainId === "B1") return status === "Applicable"
    ? "RAG, persistent memory or a training lifecycle introduces poisoning and state-integrity paths."
    : "Confirm whether retrieval, retained context or training data can influence the assessed release.";
  if (domainId === "B2") return "Hidden instructions, credentials and sensitive information require disclosure and inference testing.";
  if (domainId === "C1") return status === "Applicable"
    ? "Tools or third-party AI artefacts create integrity and supply-chain trust boundaries."
    : "No tool, MCP or AI supply-chain interface was declared for this release.";
  if (domainId === "C2") return status === "Applicable"
    ? "Agency, write actions, code execution or physical interaction can produce consequential downstream effects."
    : "No autonomous, write, code-execution or physical action capability was declared.";
  if (domainId === "C3") return "Identity, authorisation and endpoint boundaries apply to every assessed AI application.";
  if (domainId === "C4") return status === "Applicable"
    ? "Multiple agents or agentic delegation introduces hand-off and trust-propagation paths."
    : status === "Needs investigation"
      ? "Confirm whether the agent delegates to other agents or trusts shared artefacts."
      : "No multi-agent or A2A interaction was declared.";
  if (domainId === "C5") return status === "Applicable"
    ? "Human review, approval or reliance on agent output creates human-agent trust paths."
    : "Confirm whether people review, copy, approve or act on model output.";
  if (domainId === "D1") return "Availability, quota, recursive-consumption and cost controls apply to every AI workload.";
  if (domainId === "X1") return "Bounded reconnaissance is Phase 0 of every campaign and remains subject to the rules of engagement.";
  if (domainId === "X2") return "Detection and response evidence is planned across every domain; regression automation is outside the atomic service.";
  return "Confirm applicability during the client threat-model workshop.";
}

export function deriveDomainMatrix(answers = {}, overrides = {}) {
  return DOMAIN_DEFINITIONS.map((domain) => {
    const derivedStatus = derivedDisposition(domain.id, answers);
    const override = overrides[domain.id] || {};
    const status = DOMAIN_STATUS_OPTIONS.includes(override.status) ? override.status : derivedStatus;
    return {
      ...domain,
      status,
      derivedStatus,
      overridden: status !== derivedStatus || Boolean(override.rationale?.trim()),
      rationale: override.rationale?.trim() || dispositionRationale(domain.id, status, answers),
      campaignStatus: CAMPAIGN_STATUS
    };
  });
}

export function mapTechniqueToDomains(technique) {
  return DOMAIN_DEFINITIONS
    .filter((domain) => domain.roots.some((root) => matchesRoot(technique.id, root)))
    .map((domain) => domain.id);
}

export function sourceFamiliesForDomains(domainIds = []) {
  return [...new Set(domainIds.flatMap((domainId) => DOMAIN_BY_ID.get(domainId)?.sourceFamilies || []))].sort((a, b) => a - b);
}

export const PREREQUISITES = [
  { key: "architectureDocsReady", label: "Architecture and data-flow documentation" },
  { key: "configAccessReady", label: "Model, prompt, RAG, memory and tool configuration access" },
  { key: "authorisationReady", label: "Written authorisation, boundaries and stop conditions" },
  { key: "testIdentitiesReady", label: "Least-privilege test identities" },
  { key: "safeTestDataReady", label: "Synthetic or masked test data" },
  { key: "telemetryReady", label: "Relevant logs, traces and security telemetry" },
  { key: "rollbackReady", label: "Reset, rollback and kill-switch procedures" },
  { key: "costLimitsReady", label: "Quotas and campaign cost limits" },
  { key: "privacyApprovalReady", label: "Data-residency, privacy and legal approvals" }
];

export function derivePrerequisiteReadiness(answers = {}) {
  return PREREQUISITES.map((item) => ({
    ...item,
    status: selected(answers, item.key) ? "Confirmed" : "Not confirmed"
  }));
}
