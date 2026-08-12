export { loadConfig, ConfigurationError, defaultRequiredSections } from "./config.js";
export { createDocx, writeDocx } from "./docx.js";
export {
  embedDiagramMetadata,
  exportDiagrams,
  readDiagramMetadata,
  sourceHash,
  verifyDiagrams,
} from "./diagrams.js";
export { parseArchitecture, inlineText } from "./markdown.js";
export { initializeProject } from "./project.js";
export { reviewArchitecture } from "./review.js";
export { validateDocx, validateProject } from "./validation.js";
export type * from "./types.js";
