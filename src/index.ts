export {
  loadConfig,
  ConfigurationError,
  defaultRequiredSections,
  effectiveAgentPolicy,
} from "./config.js";
export { createDocx, writeDocx } from "./docx.js";
export {
  embedDiagramMetadata,
  exportDiagrams,
  formatDrawioSources,
  inspectDiagrams,
  readDiagramMetadata,
  sourceHash,
  verifyDiagrams,
  canonicalizeDrawioXml,
} from "./diagrams.js";
export { parseArchitecture, inlineText } from "./markdown.js";
export { createArchitectureContext, createArchitectureStatus } from "./context.js";
export { pathIsWithin, resolveConfinedPath, assertConfinedPattern } from "./paths.js";
export { checkAgentChanges } from "./policy.js";
export { initializeProject } from "./project.js";
export { listPrompts, getPrompt } from "./prompts.js";
export type { PromptDefinition, PromptName } from "./prompts.js";
export {
  approvalTransitions,
  architectureRecordList,
  parseArchitectureRecords,
  validateArchitectureRecords,
} from "./records.js";
export { reviewArchitecture } from "./review.js";
export { createMcpServer, startMcpServer } from "./mcp.js";
export { validateDocx, validateProject } from "./validation.js";
export type * from "./types.js";
