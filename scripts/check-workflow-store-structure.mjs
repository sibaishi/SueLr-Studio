import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const storePath = resolve('src/features/workflow/lib/store.ts');
const storeSource = readFileSync(storePath, 'utf8');
const editorPath = resolve('src/features/workflow/lib/store/editor.ts');
const editorSource = readFileSync(editorPath, 'utf8');

const maxLineCount = 120;
const lineCount = storeSource.split(/\r?\n/).length;
const maxEditorLineCount = 40;
const editorLineCount = editorSource.split(/\r?\n/).length;

const requiredMarkers = [
  'createWorkflowEditorActions',
  'createWorkflowExecutionActions',
  'createWorkflowDocumentActions',
];

const forbiddenMarkers = [
  'applyNodeChanges',
  'applyEdgeChanges',
  'normalizeMergeNodeSizes',
  'duplicateNodesWithGroups',
  'buildGroupForNodes',
  'getAbsolutePosition',
  'constrainChildNodeToGroupContent',
  'constrainChildNodeSizeToGroupContent',
  'pushRootNodeOutsideGroupAreas',
];

const requiredEditorMarkers = [
  'createWorkflowGraphEditorActions',
  'createWorkflowGroupEditorActions',
  'createWorkflowEditorSessionActions',
];

const forbiddenEditorMarkers = [
  'applyNodeChanges',
  'applyEdgeChanges',
  'normalizeMergeNodeSizes',
  'duplicateNodesWithGroups',
  'buildGroupForNodes',
  'fetchAvailableModels',
  'saveLocalDraft',
];

const failures = [];

if (lineCount > maxLineCount) {
  failures.push(`store.ts should stay within ${maxLineCount} lines, received ${lineCount}.`);
}

for (const marker of requiredMarkers) {
  if (!storeSource.includes(marker)) {
    failures.push(`store.ts is missing required composition marker: ${marker}`);
  }
}

for (const marker of forbiddenMarkers) {
  if (storeSource.includes(marker)) {
    failures.push(`store.ts still contains editor implementation marker: ${marker}`);
  }
}

if (editorLineCount > maxEditorLineCount) {
  failures.push(`editor.ts should stay within ${maxEditorLineCount} lines, received ${editorLineCount}.`);
}

for (const marker of requiredEditorMarkers) {
  if (!editorSource.includes(marker)) {
    failures.push(`editor.ts is missing required composition marker: ${marker}`);
  }
}

for (const marker of forbiddenEditorMarkers) {
  if (editorSource.includes(marker)) {
    failures.push(`editor.ts still contains editor implementation marker: ${marker}`);
  }
}

if (failures.length > 0) {
  console.error('Workflow store structure check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Workflow store structure check passed (store.ts: ${lineCount} lines, editor.ts: ${editorLineCount} lines).`);
