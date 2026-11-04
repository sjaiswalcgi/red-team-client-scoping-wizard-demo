export const STATUS_OPTIONS = [
  "Applicable",
  "Needs investigation",
  "Not applicable",
  "Deferred"
];

const GENERATIVE_BASELINE = [
  "AML.T0051",
  "AML.T0054",
  "AML.T0056",
  "AML.T0057",
  "AML.T0065",
  "AML.T0068",
  "AML.T0069",
  "AML.T0077"
];

const AGENTIC_BASELINE = [
  "AML.T0053",
  "AML.T0081",
  "AML.T0083",
  "AML.T0084",
  "AML.T0086",
  "AML.T0098",
  "AML.T0099",
  "AML.T0101",
  "AML.T0110",
  "AML.T0133"
];

function selected(answers, key) {
  return Boolean(answers?.[key]);
}

function includes(answers, key, value) {
  return Array.isArray(answers?.[key]) && answers[key].includes(value);
}

function anySelected(answers, key, values) {
  return values.some((value) => includes(answers, key, value));
}

function matchesRoot(technique, roots = []) {
  return roots.some((root) => technique.id === root || technique.id.startsWith(`${root}.`));
}

function rule({ key, title, rationale, evidence, testPack, applies, roots = [], pattern }) {
  return {
    key,
    title,
    rationale,
    evidence,
    testPack,
    applies,
    matches(technique) {
      return matchesRoot(technique, roots) || Boolean(pattern?.test(`${technique.name} ${technique.summary}`));
    }
  };
}

export const RULES = [
  rule({
    key: "genai-baseline",
    title: "Generative AI baseline",
    rationale: "The solution uses generative AI, so prompt, instruction, disclosure and output-handling attacks require validation.",
    evidence: "Prompt/response transcript, guardrail decision, application policy decision and sanitisation result.",
    testPack: "Generative AI baseline",
    applies: (answers) => includes(answers, "platforms", "Generative AI"),
    roots: GENERATIVE_BASELINE
  }),
  rule({
    key: "agentic-baseline",
    title: "Agentic AI baseline",
    rationale: "The solution uses agentic AI, so authority, configuration, runtime capability and tool-use boundaries require validation.",
    evidence: "Agent identity, configuration digest, selected tool, arguments, policy decision, approval and downstream result.",
    testPack: "Agent authority and tools",
    applies: (answers) => includes(answers, "platforms", "Agentic AI"),
    roots: AGENTIC_BASELINE
  }),
  rule({
    key: "rag",
    title: "Retrieval-augmented generation",
    rationale: "RAG or enterprise search introduces retrieval poisoning, false-entry and credential-harvesting paths.",
    evidence: "Corpus version, source identity, ingestion decision, retrieved chunks, ACL decision, citations and leakage result.",
    testPack: "RAG integrity and privacy",
    applies: (answers) => selected(answers, "usesRag"),
    roots: ["AML.T0064", "AML.T0066", "AML.T0070", "AML.T0071", "AML.T0082", "AML.T0085.000"]
  }),
  rule({
    key: "untrusted-content",
    title: "Untrusted content ingestion",
    rationale: "The system processes external or user-controlled content that may carry indirect or triggered instructions.",
    evidence: "Content provenance, parser output, trust label, instruction-boundary decision and resulting action trace.",
    testPack: "Indirect and triggered injection",
    applies: (answers) => selected(answers, "untrustedContent"),
    roots: ["AML.T0051.001", "AML.T0051.002", "AML.T0061", "AML.T0066", "AML.T0093", "AML.T0094", "AML.T0129"]
  }),
  rule({
    key: "memory",
    title: "Persistent memory and conversation state",
    rationale: "Persistent memory or chat history can retain poisoned instructions, cross-session data or manipulated state.",
    evidence: "Memory provenance, tenant and session identity, read/write trace, retention result and state diff.",
    testPack: "Memory and state integrity",
    applies: (answers) => selected(answers, "persistentMemory"),
    roots: ["AML.T0080", "AML.T0092"]
  }),
  rule({
    key: "tools",
    title: "Tools, APIs and MCP",
    rationale: "The agent can discover or invoke tools, APIs or MCP servers, creating authority, poisoning and exfiltration paths.",
    evidence: "Tool manifest hash, registry source, caller identity, argument schema, policy decision, token scope and action result.",
    testPack: "Agent, tool and MCP security",
    applies: (answers) => selected(answers, "usesTools"),
    roots: [
      "AML.T0010.005", "AML.T0011.002", "AML.T0016.004", "AML.T0017.002", "AML.T0053",
      "AML.T0084.001", "AML.T0085.001", "AML.T0086", "AML.T0098", "AML.T0099", "AML.T0100",
      "AML.T0101", "AML.T0110", "AML.T0115.002", "AML.T0133"
    ]
  }),
  rule({
    key: "consequential-actions",
    title: "Consequential or write actions",
    rationale: "The system can change data or environments, so approval bypass, destructive action and compensation paths are in scope.",
    evidence: "Authorisation context, human approval, before/after business state, idempotency result, rollback and kill-switch trace.",
    testPack: "Consequential action containment",
    applies: (answers) => selected(answers, "writeActions"),
    roots: ["AML.T0053", "AML.T0086", "AML.T0101", "AML.T0112", "AML.T0124", "AML.T0048"]
  }),
  rule({
    key: "multi-agent",
    title: "Multi-agent coordination",
    rationale: "Multiple agents can exchange instructions or shared artefacts and may amplify scope drift or autonomous attack paths.",
    evidence: "Originating identity, hand-off trace, message provenance, delegated authority, shared-artifact hash and stop decision.",
    testPack: "Multi-agent trust and orchestration",
    applies: (answers) => selected(answers, "multiAgent"),
    roots: ["AML.T0116", "AML.T0117", "AML.T0118", "AML.T0124"]
  }),
  rule({
    key: "multimodal",
    title: "Multimodal inputs",
    rationale: "Image, audio or video inputs can contain hidden or triggered instructions outside text-only controls.",
    evidence: "Original media hash, extracted metadata and text, modality-specific safety decision and resulting action trace.",
    testPack: "Multimodal trigger testing",
    applies: (answers) => anySelected(answers, "modalities", ["Image", "Audio", "Video"]),
    roots: ["AML.T0129"]
  }),
  rule({
    key: "active-content",
    title: "Rendered links and active content",
    rationale: "Model output can reach trusted renderers, links or downstream components and must be treated as untrusted input.",
    evidence: "Rendered output, URL and citation validation, sanitiser result, user interaction and downstream security event.",
    testPack: "Output rendering and trusted components",
    applies: (answers) => selected(answers, "rendersActiveContent"),
    roots: ["AML.T0067", "AML.T0077", "AML.T0131"]
  }),
  rule({
    key: "public-exposure",
    title: "Public or partner-facing exposure",
    rationale: "An externally reachable AI service is exposed to discovery, scanning, abuse and prompt infiltration.",
    evidence: "Endpoint inventory, network path, authentication result, rate-limit decision, WAF/API trace and scan evidence.",
    testPack: "External exposure and abuse",
    applies: (answers) => selected(answers, "publicExposure"),
    roots: ["AML.T0006", "AML.T0007", "AML.T0040", "AML.T0047", "AML.T0093", "AML.T0096", "AML.T0132"]
  }),
  rule({
    key: "sensitive-data",
    title: "Sensitive or regulated data",
    rationale: "The system processes sensitive data, making disclosure, inference, credential and cross-boundary attacks material.",
    evidence: "Synthetic canary result, access decision, tenant context, redaction trace, data classification and exfiltration outcome.",
    testPack: "Data protection and exfiltration",
    applies: (answers) => selected(answers, "sensitiveData"),
    roots: ["AML.T0024", "AML.T0035", "AML.T0057", "AML.T0082", "AML.T0083", "AML.T0085", "AML.T0086", "AML.T0098"]
  }),
  rule({
    key: "multi-tenant",
    title: "Multi-tenant boundary",
    rationale: "Multiple tenants or user populations require explicit isolation and confused-deputy testing.",
    evidence: "Tenant identity, session binding, resource policy, retrieval filter, denied cross-tenant attempt and alert.",
    testPack: "Tenant isolation",
    applies: (answers) => selected(answers, "multiTenant"),
    roots: ["AML.T0057", "AML.T0080", "AML.T0085", "AML.T0086"]
  }),
  rule({
    key: "training",
    title: "Training or fine-tuning lifecycle",
    rationale: "Training, fine-tuning or owned datasets introduce model and dataset poisoning, extraction and integrity risks.",
    evidence: "Dataset and model lineage, signatures, training job identity, evaluation results, SBOM/AIBOM and release digest.",
    testPack: "Model and dataset lifecycle",
    applies: (answers) => selected(answers, "trainsModels") || ["scope4", "scope5"].includes(answers?.genAiScope),
    roots: ["AML.T0018", "AML.T0020", "AML.T0024", "AML.T0059", "AML.T0076", "AML.T0115.000", "AML.T0115.001"]
  }),
  rule({
    key: "third-party-supply-chain",
    title: "Third-party AI supply chain",
    rationale: "Third-party models, datasets, packages, containers or tools require provenance and rug-pull testing.",
    evidence: "Supplier identity, licence, provenance, digest, signatures, SBOM/AIBOM, scan result and version-drift record.",
    testPack: "AI supply-chain assurance",
    applies: (answers) => selected(answers, "thirdPartyArtifacts"),
    roots: ["AML.T0002", "AML.T0010", "AML.T0011", "AML.T0109", "AML.T0111", "AML.T0115", "AML.T0120"]
  }),
  rule({
    key: "code-execution",
    title: "Code execution or computer use",
    rationale: "Code execution, browser control or computer-use capability increases the impact of generated instructions and compromised artefacts.",
    evidence: "Sandbox policy, image digest, command trace, filesystem/network decision, secret access and containment result.",
    testPack: "Runtime isolation and code execution",
    applies: (answers) => selected(answers, "codeExecution"),
    roots: ["AML.T0011", "AML.T0018.002", "AML.T0112", "AML.T0117", "AML.T0124", "AML.T0134"]
  }),
  rule({
    key: "availability-and-cost",
    title: "Availability and FinOps exposure",
    rationale: "The service has availability or spend consequences and requires denial-of-service, wallet and recursive-consumption testing.",
    evidence: "Requests, tokens, duration, concurrency, estimated cost, quota decision, anomaly alert and stop action.",
    testPack: "Availability and denial of wallet",
    applies: (answers) => anySelected(answers, "impacts", ["Availability", "Financial"]),
    roots: ["AML.T0029", "AML.T0034", "AML.T0046"]
  }),
  rule({
    key: "external-harms",
    title: "Material external impact",
    rationale: "The use case can create financial, reputational, societal or user harm and requires scenario-based impact testing.",
    evidence: "Scenario, affected cohort, model/application response, human decision, appeal path and business impact assessment.",
    testPack: "Responsible AI and external impact",
    applies: (answers) => anySelected(answers, "impacts", ["Financial", "Safety", "Legal", "Human", "Reputation"]),
    roots: ["AML.T0031", "AML.T0048", "AML.T0060", "AML.T0130", "AML.T0131"]
  }),
  rule({
    key: "physical-environment",
    title: "Physical or edge environment",
    rationale: "The AI system interacts with physical or edge environments where device and environmental access affect test scope.",
    evidence: "Device identity, sensor/source provenance, physical access assumptions, command result and safety interlock evidence.",
    testPack: "Physical and edge-system assurance",
    applies: (answers) => selected(answers, "physicalEnvironment"),
    roots: ["AML.T0041", "AML.T0048.003"]
  })
];

export function filterCandidates(techniques, answers) {
  const platforms = answers?.platforms || [];
  return techniques.filter((technique) => technique.platforms.some((platform) => platforms.includes(platform)));
}

export function classifyTechnique(technique, answers, override) {
  const matches = RULES.filter((candidate) => candidate.applies(answers) && candidate.matches(technique));
  const derivedStatus = matches.length ? "Applicable" : "Needs investigation";
  const derivedRationale = matches.length
    ? matches.map((match) => match.rationale).join(" ")
    : "The ATLAS platform filter identifies this as a candidate. Confirm applicability against the system data flow, trust boundaries and credible threat actors.";

  return {
    ...technique,
    status: override?.status || derivedStatus,
    rationale: override?.rationale?.trim() || derivedRationale,
    derivedStatus,
    overridden: Boolean(override?.status || override?.rationale?.trim()),
    signals: matches.map((match) => match.title),
    testPacks: [...new Set(matches.map((match) => match.testPack))],
    evidence: [...new Set(matches.map((match) => match.evidence))]
  };
}

export const GENAI_SCOPE_LABELS = {
  scope1: "Scope 1 · Consumer application",
  scope2: "Scope 2 · Enterprise application",
  scope3: "Scope 3 · Pre-trained model integration",
  scope4: "Scope 4 · Fine-tuned model",
  scope5: "Scope 5 · Self-trained model"
};

export const AGENT_SCOPE_LABELS = {
  scope1: "Scope 1 · No agency / read-only",
  scope2: "Scope 2 · Prescribed agency / approval required",
  scope3: "Scope 3 · Supervised agency",
  scope4: "Scope 4 · Full agency / self-initiating"
};

export function deriveScopeLabels(answers) {
  return {
    generative: includes(answers, "platforms", "Generative AI")
      ? GENAI_SCOPE_LABELS[answers.genAiScope] || "Not classified"
      : "Not selected",
    agentic: includes(answers, "platforms", "Agentic AI")
      ? AGENT_SCOPE_LABELS[answers.agentScope] || "Not classified"
      : "Not selected"
  };
}
