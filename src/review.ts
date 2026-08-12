import path from "node:path";

import type { ParsedArchitecture, ReviewDimension, ReviewReport } from "./types.js";

type DimensionDefinition = {
  id: string;
  name: string;
  headingTerms: string[];
  contentTerms: RegExp[];
  diagramTerms?: string[];
  recommendation: string;
};

const DIMENSIONS: DimensionDefinition[] = [
  {
    id: "scope",
    name: "Audience, scope, and drivers",
    headingTerms: ["scope", "audience", "requirements", "assumptions"],
    contentTerms: [/in scope/i, /out of scope/i, /assumption/i],
    recommendation:
      "State the decision audience, boundaries, quality attributes, and key assumptions.",
  },
  {
    id: "context",
    name: "System context and component boundaries",
    headingTerms: ["architecture overview", "context", "components"],
    contentTerms: [/boundary/i, /component/i, /dependency/i],
    diagramTerms: ["context", "architecture"],
    recommendation:
      "Add a context view and explain each component's state and failure responsibility.",
  },
  {
    id: "domain",
    name: "Domain and configuration model",
    headingTerms: ["domain", "configuration", "settings", "state ownership"],
    contentTerms: [/entity/i, /version/i, /configuration/i],
    diagramTerms: ["domain"],
    recommendation:
      "Model domain entities, configuration precedence, runtime state, and versioned artifacts.",
  },
  {
    id: "behavior",
    name: "Sequences, states, and lifecycle hooks",
    headingTerms: ["runtime flows", "sequence", "state", "lifecycle"],
    contentTerms: [/happy path/i, /rejection/i, /state transition/i],
    diagramTerms: ["sequence", "state"],
    recommendation: "Add happy-path and failure sequences plus an end-to-end state model.",
  },
  {
    id: "api",
    name: "API and data contracts",
    headingTerms: ["api", "data contracts", "interfaces"],
    contentTerms: [/\b(GET|POST|PUT|PATCH|DELETE)\b/, /request/i, /response/i, /idempot/i],
    recommendation:
      "Define external and internal operations, stable identifiers, schemas, and idempotency.",
  },
  {
    id: "capacity",
    name: "Capacity and scalability",
    headingTerms: ["scalability", "capacity", "quotas"],
    contentTerms: [/concurren/i, /p9[59]/i, /throughput/i, /queue/i],
    recommendation:
      "Quantify demand, concurrency, runtime percentiles, quota fit, and backpressure thresholds.",
  },
  {
    id: "resilience",
    name: "Resilience and recovery",
    headingTerms: ["resilience", "failure", "disaster recovery"],
    contentTerms: [/retry/i, /timeout/i, /circuit breaker/i, /RTO|RPO/, /quarantine/i],
    diagramTerms: ["retry", "escalation"],
    recommendation:
      "Specify bounded retries, timeout budgets, isolation, recovery objectives, and failure modes.",
  },
  {
    id: "security",
    name: "Security, privacy, and trust boundaries",
    headingTerms: ["security", "privacy", "trust"],
    contentTerms: [
      /encrypt/i,
      /least privilege/i,
      /authentication|authorization/i,
      /data minimization/i,
    ],
    diagramTerms: ["trust", "security"],
    recommendation:
      "Show trust boundaries and define identity, encryption, minimization, retention, and access policy.",
  },
  {
    id: "audit",
    name: "Auditability and evidence",
    headingTerms: ["audit", "evidence", "retention"],
    contentTerms: [/immutable|append-only/i, /actor/i, /timestamp/i, /retention/i],
    recommendation:
      "Define actor-attributed events, timestamps, integrity, evidence handling, and retention.",
  },
  {
    id: "human",
    name: "Human intervention and failure handling",
    headingTerms: ["human", "escalation", "failure handling"],
    contentTerms: [/cancel/i, /resume/i, /override/i, /human review/i],
    diagramTerms: ["escalation"],
    recommendation: "Define pause, cancel, resume, override, ambiguity, and fail-closed behavior.",
  },
  {
    id: "ownership",
    name: "Ownership and operating model",
    headingTerms: ["ownership", "operating model", "responsibilities"],
    contentTerms: [/owned by/i, /responsib/i, /operator/i],
    recommendation:
      "Assign implementation, infrastructure, operational, and shared responsibilities explicitly.",
  },
  {
    id: "deployment",
    name: "Deployment and decisions",
    headingTerms: ["deployment", "architecture decisions", "references"],
    contentTerms: [/decision/i, /trade-?off/i, /reference/i],
    diagramTerms: ["deployment"],
    recommendation:
      "Connect the logical design to a deployment example and record consequential decisions.",
  },
];

function normalizedHeadings(parsed: ParsedArchitecture): string[] {
  return parsed.headings.map((heading) =>
    heading.text.replace(/^\d+(?:\.\d+)*\.?\s+/, "").toLowerCase(),
  );
}

function scoreDimension(
  definition: DimensionDefinition,
  parsed: ParsedArchitecture,
  diagramNames: string[],
): ReviewDimension {
  const headings = normalizedHeadings(parsed);
  const evidence: string[] = [];
  let score = 0;
  const matchingHeadings = definition.headingTerms.filter((term) =>
    headings.some((heading) => heading.includes(term.toLowerCase())),
  );
  if (matchingHeadings.length > 0) {
    score += Math.min(2, matchingHeadings.length);
    evidence.push(`Headings: ${matchingHeadings.join(", ")}`);
  }

  const matchingContent = definition.contentTerms.filter((pattern) => pattern.test(parsed.source));
  score += Math.min(2, matchingContent.length);
  if (matchingContent.length > 0)
    evidence.push(`${matchingContent.length} expected content signals`);

  const diagramTerms = definition.diagramTerms;
  if (diagramTerms) {
    const matchingDiagrams = diagramNames.filter((name) =>
      diagramTerms.some((term) => name.includes(term)),
    );
    if (matchingDiagrams.length > 0) {
      score += 1;
      evidence.push(`Diagrams: ${matchingDiagrams.join(", ")}`);
    }
  } else if (score >= 3) {
    score += 1;
  }

  const result: ReviewDimension = {
    id: definition.id,
    name: definition.name,
    score: Math.min(score, 5),
    maxScore: 5,
    evidence,
  };
  if (result.score < result.maxScore) result.recommendation = definition.recommendation;
  return result;
}

export function reviewArchitecture(
  parsed: ParsedArchitecture,
  diagramFiles: string[],
): ReviewReport {
  const names = diagramFiles.map((file) => path.basename(file, path.extname(file)).toLowerCase());
  const dimensions = DIMENSIONS.map((definition) => scoreDimension(definition, parsed, names));
  const score = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const maxScore = dimensions.reduce((sum, dimension) => sum + dimension.maxScore, 0);
  return {
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 100),
    dimensions,
  };
}
