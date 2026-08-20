export type Severity = "error" | "warning" | "info";

export type Diagnostic = {
  code: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  remediation?: string;
};

export type TocMode = "static" | "field";

export type AgentApprovalGate =
  "decision-acceptance" | "risk-acceptance" | "security-exception" | "external-publication";

export type AgentPolicy = {
  instructions: string;
  editablePaths: string[];
  generatedPaths: string[];
  approvalGates: AgentApprovalGate[];
};

export type ArchitectureConfig = {
  schemaVersion: 1;
  document: {
    title: string;
    author: string;
    subject?: string | undefined;
    keywords: string[];
    source: string;
    output: string;
    page: {
      size: "letter" | "a4";
      orientation: "portrait" | "landscape";
      marginInches: number;
    };
    toc: {
      mode: TocMode;
      depth: 2 | 3 | 4;
    };
    requireExplicitNumbering: boolean;
  };
  diagrams: {
    sourceDir: string;
    renderedDir: string;
    embedSource: boolean;
  };
  quality: {
    profile: "service";
    requiredSections: string[];
    forbiddenPatterns: string[];
  };
  agent?: AgentPolicy | undefined;
};

export type ResolvedArchitectureConfig = ArchitectureConfig & {
  configPath: string;
  projectDir: string;
  sourcePath: string;
  outputPath: string;
  diagramSourcePath: string;
  diagramRenderedPath: string;
};

export type InlineContent = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
};

export type HeadingBlock = {
  kind: "heading";
  level: number;
  text: string;
  content: InlineContent[];
  line: number;
  bookmark: string;
};

export type DocumentBlock =
  | HeadingBlock
  | { kind: "paragraph"; content: InlineContent[]; line: number }
  | { kind: "image"; alt: string; path: string; title?: string; line: number }
  | { kind: "bullet-list"; items: InlineContent[][]; line: number }
  | { kind: "ordered-list"; items: InlineContent[][]; start: number; line: number }
  | { kind: "table"; rows: InlineContent[][][]; line: number }
  | { kind: "code"; text: string; language?: string; line: number }
  | { kind: "quote"; content: InlineContent[]; line: number }
  | { kind: "rule"; line: number };

export type ParsedArchitecture = {
  source: string;
  blocks: DocumentBlock[];
  headings: HeadingBlock[];
};

export type DiagramMetadata = {
  sourceHash?: string;
  mxfile?: string;
};

export type ReviewDimension = {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  evidence: string[];
  affectedRecordIds: string[];
  recommendation?: string;
  gapCode?: string;
  suggestedAction?: string;
};

export type ReviewReport = {
  score: number;
  maxScore: number;
  percentage: number;
  dimensions: ReviewDimension[];
};

export type RequirementStatus = "proposed" | "accepted" | "verified" | "retired";
export type AssumptionStatus = "open" | "validated" | "invalidated" | "retired";
export type DecisionStatus = "proposed" | "accepted" | "rejected" | "superseded";
export type RiskStatus = "open" | "mitigated" | "accepted" | "closed";

type ArchitectureRecordBase = {
  id: string;
  line: number;
};

export type RequirementRecord = ArchitectureRecordBase & {
  kind: "requirement";
  statement: string;
  source: string;
  owner: string;
  verification: string;
  status: RequirementStatus;
};

export type AssumptionRecord = ArchitectureRecordBase & {
  kind: "assumption";
  statement: string;
  evidenceNeeded: string;
  owner: string;
  reviewTrigger: string;
  status: AssumptionStatus;
};

export type DecisionRecord = ArchitectureRecordBase & {
  kind: "decision";
  decision: string;
  rationale: string;
  consequences: string;
  status: DecisionStatus;
  owner: string;
  approvedBy: string;
};

export type RiskRecord = ArchitectureRecordBase & {
  kind: "risk";
  risk: string;
  likelihood: string;
  impact: string;
  mitigation: string;
  owner: string;
  status: RiskStatus;
  approvedBy: string;
};

export type EvidenceRecord = ArchitectureRecordBase & {
  kind: "evidence";
  supports: string[];
  source: string;
  retrievedOn: string;
  notes: string;
};

export type ArchitectureRecord =
  RequirementRecord | AssumptionRecord | DecisionRecord | RiskRecord | EvidenceRecord;

export type ArchitectureRecords = {
  requirements: RequirementRecord[];
  assumptions: AssumptionRecord[];
  decisions: DecisionRecord[];
  risks: RiskRecord[];
  evidence: EvidenceRecord[];
};

export type LifecyclePhaseName =
  "discover" | "design" | "specify" | "critique" | "revise" | "approve" | "publish";

export type LifecyclePhase = {
  name: LifecyclePhaseName;
  ready: boolean;
  blockers: string[];
};

export type CommandEnvelope<T> = {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  project: {
    root: ".";
    config: string;
  };
  data: T;
  diagnostics: Diagnostic[];
};

export type DiagramCatalogEntry = {
  name: string;
  source: string;
  preview: string;
  sourceHash?: string;
  valid: boolean;
};

export type DiagramNode = {
  pageId: string;
  id: string;
  label: string;
  parent?: string;
  bounds?: { x?: number; y?: number; width?: number; height?: number };
};

export type DiagramEdge = {
  pageId: string;
  id: string;
  label: string;
  source?: string;
  target?: string;
};

export type DiagramInspection = {
  name: string;
  source: string;
  pages: { id: string; name: string }[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type ArchitectureContext = {
  metadata: {
    title: string;
    author: string;
    subject?: string;
    keywords: string[];
  };
  paths: {
    config: string;
    source: string;
    output: string;
    diagramSource: string;
    diagramRendered: string;
  };
  outline: { level: number; text: string; bookmark: string; line: number }[];
  records: ArchitectureRecords;
  diagrams: DiagramCatalogEntry[];
  policy: AgentPolicy;
  review: ReviewReport;
  source?: string;
};

export type ArchitectureStatus = {
  phases: LifecyclePhase[];
  readyToPublish: boolean;
  pendingApprovals: { id: string; kind: "decision" | "risk"; status: string }[];
  nextActions: string[];
};

export type ChangePolicyEntry = {
  path: string;
  classification: "editable" | "generated" | "outside-policy";
};

export type ApprovalTransition = {
  id: string;
  kind: "decision" | "risk";
  previousStatus?: string;
  currentStatus: "accepted";
  approvedBy: string;
};

export type ChangePolicyReport = {
  base: string;
  files: ChangePolicyEntry[];
  approvalTransitions: ApprovalTransition[];
};
