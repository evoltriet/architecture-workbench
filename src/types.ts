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
  recommendation?: string;
};

export type ReviewReport = {
  score: number;
  maxScore: number;
  percentage: number;
  dimensions: ReviewDimension[];
};
