import {
  type AgentPendingApproval,
  type AgentPlan,
  type AgentRunResponse,
  type WorkflowApplyDraftResult,
  type WorkflowCanvasSummary,
  type WorkflowDraftResponse,
  type WorkflowEditPatch,
  type WorkflowEditResult,
  type WorkflowExecuteResult,
  type WorkflowInspectResult,
  type WorkflowSuggestedInput,
  createAgentRun,
  uploadFile,
} from '@/domains/workflow/lib/api';
import { waitForUploadedImageMetadata } from '@/domains/workflow/lib/uploadProcessing';
import { ImagePreviewModal, type PreviewImageItem } from '@/domains/workflow/components/ImagePreviewModal';
import { ImageSizeLabel } from '@/domains/workflow/components/ImageSizeLabel';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import type { ModelInfo } from '@/shared/types';
import type { Edge, Node } from '@xyflow/react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  ImagePlus,
  Loader2,
  Maximize2,
  Paperclip,
  Play,
  Send,
  Settings2,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useShallow } from 'zustand/react/shallow';

type AgentToolName =
  | 'agent.plan'
  | 'chat.respond'
  | 'workflow.inspect'
  | 'workflow.edit'
  | 'workflow.applyDraft'
  | 'workflow.createDraft'
  | 'workflow.execute'
  | 'workflow.diagnose'
  | 'workflow.summarizeRun'
  | 'image.generate'
  | 'image.edit'
  | 'image.compare'
  | 'video.generate'
  | 'copy.write'
  | 'prompt.optimize'
  | 'result.inspect'
  | 'asset.package';

type AgentToolRecord = {
  id: string;
  name: AgentToolName;
  label: string;
  status: 'running' | 'success' | 'error';
  summary: string;
  detail?: string;
};

type AgentMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachedImages?: AgentPendingImage[];
  plan?: AgentPlan;
  draft?: WorkflowDraftResponse;
  inspectResult?: WorkflowCanvasSummary | null;
  workflowEditPatch?: WorkflowEditPatch | null;
  workflowSuggestedInputs?: WorkflowSuggestedInput[];
  toolRecords?: AgentToolRecord[];
  pendingApproval?: AgentPendingApproval;
  approvalInput?: string;
  approvalValues?: Record<string, string>;
  productionOutput?: {
    images?: string[];
    rawImages?: string[];
    video?: unknown;
    videoUrl?: string;
    model?: string;
    text?: string;
    optimizedPrompt?: string;
    changes?: string[];
    persistedFiles?: Array<{ fileName: string; url: string; absolutePath: string }>;
    debug?: {
      persistGeneratedOutputs?: boolean;
      storage?: {
        root?: string;
        generatedDir?: string;
        scopeNamespace?: unknown;
      };
    };
  } | null;
};

type AgentPendingImage = {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  processing?: boolean;
  processingStatus?: 'processing' | 'completed' | 'failed';
  processingError?: string;
  role: 'reference' | 'mask';
};

type PendingImagePreviewState = {
  imageId: string;
  scope: 'composer' | string;
};

interface AgentWorkspaceProps {
  open: boolean;
  onClose: () => void;
  onOpenWorkflow: () => void;
  onBackfillImageToCanvas?: (image: PreviewImageItem) => void;
  onBackfillVideoToCanvas?: (video: { src: string; name?: string }) => void;
  plannerModels: ModelInfo[];
  imageModels: ModelInfo[];
  videoModels: ModelInfo[];
}

const STARTER_PROMPT = '例如：帮我为一个新上市的保温杯设计一套电商主图工作流，并生成可编辑画布';
const PLANNER_MODEL_STORAGE_KEY = 'suelr_agent_planner_model';
const IMAGE_MODEL_STORAGE_KEY = 'suelr_agent_image_model';
const VIDEO_MODEL_STORAGE_KEY = 'suelr_agent_video_model';
const ESC_STOP_ARM_WINDOW_MS = 1200;

function gid(prefix = 'agent') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function getDraftSummary(draft: WorkflowDraftResponse) {
  const nodeCount = draft.workflow.nodes.length;
  const edgeCount = draft.workflow.edges.length;
  return `已完成一个可编辑的工作流草案：${draft.workflow.name}。它包含 ${nodeCount} 个节点、${edgeCount} 条连线。`;
}

function getAgentResultSummary(plan: AgentPlan, draft: WorkflowDraftResponse) {
  const prefix =
    plan.source === 'llm' || draft.architect?.used ? '已根据当前需求生成工作流草案' : '已生成基础工作流草案';
  const suffix = draft.validation.valid ? '你可以打开画布检查并继续编辑。' : '草案还需要进一步调整后再使用。';
  return `${prefix}。${getDraftSummary(draft)}${suffix}`;
}

function getWorkflowToolRecord(draft: WorkflowDraftResponse): AgentToolRecord {
  const plannerLabel = draft.agentContext?.plannerModel?.label;
  return {
    id: gid('tool'),
    name: 'workflow.createDraft',
    label: '工作流工具',
    status: draft.validation.valid ? 'success' : 'error',
    summary: draft.validation.valid ? '已生成可编辑工作流草案' : '草案生成完成，但校验未通过',
    detail: [
      plannerLabel ? `Planner：${plannerLabel}` : '',
      `${draft.workflow.nodes.length} 个节点，${draft.workflow.edges.length} 条连线`,
    ]
      .filter(Boolean)
      .join('；'),
  };
}

function getPlannerToolRecord(plan: AgentPlan): AgentToolRecord {
  return {
    id: gid('tool'),
    name: 'agent.plan',
    label: 'Planner',
    status: 'success',
    summary: plan.summary,
    detail: [`模型：${plan.plannerModel.label || plan.plannerModel.modelId}`].filter(Boolean).join('；'),
  };
}

const PRODUCTION_TOOL_LABELS: Record<string, string> = {
  'image.generate': '生成图片',
  'image.edit': '编辑图片',
  'image.compare': '图片对比',
  'video.generate': '生成视频',
  'copy.write': '生成文案',
  'prompt.optimize': '优化提示词',
  'result.inspect': '检查结果',
  'asset.package': '打包资源',
};

const WORKFLOW_TOOL_LABELS: Record<string, string> = {
  'workflow.inspect': '检查工作流',
  'workflow.edit': '修改草案',
  'workflow.applyDraft': '应用修改',
  'workflow.execute': '运行工作流',
  'workflow.diagnose': '诊断运行',
};

function getToolLabel(toolName: string): string {
  if (PRODUCTION_TOOL_LABELS[toolName]) return PRODUCTION_TOOL_LABELS[toolName];
  if (toolName.startsWith('workflow.')) return WORKFLOW_TOOL_LABELS[toolName] || '工作流工具';
  return '运行工具';
}

function getChatToolRecord(plan: AgentPlan): AgentToolRecord {
  return {
    id: gid('tool'),
    name: 'chat.respond',
    label: '对话',
    status: 'success',
    summary: plan.summary || '已按普通对话回复',
  };
}

function looksLikeJsonText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function readEmbeddedJsonObject(value: string): Record<string, unknown> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeEscapedText(value: string) {
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

function splitLines(value: string) {
  return normalizeEscapedText(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isChangesHeading(line: string) {
  const normalized = line.trim().replace(/^[-*+>\s]+/, '').replace(/^\*\*|\*\*$|^__|__$/g, '').trim();
  return /^(#{1,6}\s*)?(changes?|优化项|优化说明|修改说明|调整说明)[:：]?$/i.test(normalized);
}

function isOptimizedHeading(line: string) {
  const normalized = line.trim().replace(/^[-*+>\s]+/, '').replace(/^\*\*|\*\*$|^__|__$/g, '').trim();
  return /^(#{1,6}\s*)?(optimized|优化后(?:的)?提示词|优化结果|最终提示词)[:：]?$/i.test(normalized);
}

function stripListMarker(line: string) {
  return line
    .replace(/^[-*+>]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^\*\*|\*\*$|^__|__$/g, '')
    .trim();
}

function readLooseObjectSections(value: string) {
  const normalized = normalizeEscapedText(value).trim();
  if (!normalized) return null;

  const optimizedMatch = normalized.match(/(?:^|[\n\r\s{,])(?:\*\*|__)?(?:"?optimized"?|"?优化后(?:的)?提示词"?|"?优化结果"?)(?:\*\*|__)?\s*[:：]\s*([\s\S]*?)(?=(?:[\n\r\s,}]+(?:\*\*|__)?(?:"?changes?"?|"?优化项"?|"?优化说明"?|"?修改说明"?)(?:\*\*|__)?\s*[:：])|$)/i);
  const changesBlockMatch = normalized.match(/(?:^|[\n\r\s{,])(?:\*\*|__)?(?:"?changes?"?|"?优化项"?|"?优化说明"?|"?修改说明"?)(?:\*\*|__)?\s*[:：]\s*([\s\S]*)$/i);

  const optimizedPrompt = optimizedMatch?.[1]
    ? optimizedMatch[1].trim().replace(/^['"`]|['"`,]$/g, '').trim()
    : undefined;

  const changesBlock = changesBlockMatch?.[1]?.trim();
  const changes = changesBlock
    ? changesBlock
        .split(/\n|(?:^|\s)[-*+>]\s+|(?:^|\s)\d+[.)]\s+/)
        .map((item) => item.trim().replace(/^['"`]|['"`,]$/g, '').replace(/^\*\*|\*\*$|^__|__$/g, '').trim())
        .filter(Boolean)
    : undefined;

  if (!optimizedPrompt && !changes?.length) return null;
  return {
    optimizedPrompt,
    changes: changes?.length ? changes : undefined,
  };
}

function extractPromptOptimizeSections(value: string) {
  const normalized = normalizeEscapedText(value).trim();
  if (!normalized) return { optimizedPrompt: undefined, changes: undefined };

  const embedded = readEmbeddedJsonObject(normalized);
  if (embedded) {
    return {
      optimizedPrompt: typeof embedded.optimized === 'string' ? normalizeEscapedText(String(embedded.optimized)).trim() : undefined,
      changes: Array.isArray(embedded.changes)
        ? embedded.changes.map((item) => normalizeEscapedText(String(item)).trim()).filter(Boolean)
        : undefined,
    };
  }

  const looseObjectSections = readLooseObjectSections(normalized);
  if (looseObjectSections) return looseObjectSections;

  const lines = splitLines(normalized);
  if (!lines.length) return { optimizedPrompt: undefined, changes: undefined };

  let mode: 'optimized' | 'changes' = 'optimized';
  const optimizedLines: string[] = [];
  const changes: string[] = [];

  for (const line of lines) {
    if (isOptimizedHeading(line)) {
      mode = 'optimized';
      continue;
    }
    if (isChangesHeading(line)) {
      mode = 'changes';
      continue;
    }

    if (mode === 'changes') {
      const item = stripListMarker(line);
      if (item) changes.push(item);
      continue;
    }

    optimizedLines.push(line);
  }

  const optimizedPrompt = optimizedLines.join('\n').trim() || normalized;
  return {
    optimizedPrompt,
    changes: changes.length ? changes : undefined,
  };
}

function looksLikeMarkdown(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /(^#{1,6}\s)|(^\s*[-*+]\s)|(^\s*\d+\.\s)|```|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`/m.test(trimmed);
}

function formatJsonText(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function renderStructuredTextBlock(value: string, label?: string) {
  const trimmed = normalizeEscapedText(value).trim();
  if (!trimmed) return null;

  const markdownContent = looksLikeMarkdown(trimmed) ? <ReactMarkdown>{trimmed}</ReactMarkdown> : null;
  const content = looksLikeJsonText(trimmed) ? (
    <pre
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        maxWidth: '100%',
        minWidth: 0,
        overflowX: 'auto',
        fontSize: 12,
        lineHeight: 1.6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      <code>{formatJsonText(trimmed)}</code>
    </pre>
  ) : markdownContent ? (
    <div
      className="agent-workspace__message-text agent-workspace__message-text--structured"
      style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', maxWidth: '100%', minWidth: 0 }}
    >
      {markdownContent}
    </div>
  ) : (
    <div
      className="agent-workspace__message-text"
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere', maxWidth: '100%', minWidth: 0 }}
    >
      {trimmed}
    </div>
  );

  return renderResultSection(content, label);
}

function renderMissingDetailsNote() {
  return renderResultSection(
    <div className="agent-workspace__message-text" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
      当前返回里出现了需要补充信息的占位内容。这类内容不应该直接作为最终结果展示，后面我会继续把它拦截成“需要补充信息”的交互，而不是落到结果卡片里。
    </div>,
    '结果异常提示',
    'muted',
  );
}

function renderResultSection(content: React.ReactNode, label?: string, tone: 'default' | 'muted' = 'default') {
  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        background: tone === 'muted' ? 'color-mix(in srgb, var(--color-bg-secondary) 92%, black 8%)' : 'var(--color-bg-secondary)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      {label ? <strong style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{label}</strong> : null}
      {content}
    </div>
  );
}

function getProductionOutputSummary(output: NonNullable<AgentMessage['productionOutput']>) {
  const summaryParts: string[] = [];
  if (output.images?.length) summaryParts.push(`图片 ${output.images.length} 张`);
  if (output.videoUrl) summaryParts.push('包含视频结果');
  if (output.text) summaryParts.push('包含文本结果');
  if (output.optimizedPrompt) summaryParts.push('包含优化后的提示词');
  if (output.changes?.length) summaryParts.push(`优化说明 ${output.changes.length} 条`);
  return summaryParts.length > 0 ? summaryParts.join(' · ') : '未识别到可展示产物';
}

function hasPromptOptimizePlaceholder(output: NonNullable<AgentMessage['productionOutput']>) {
  const sources = [output.optimizedPrompt, output.text, ...(output.changes || [])].filter((item) => typeof item === 'string');
  return sources.some((item) => /需要(你|用户)?补充|请补充|待补充|缺少.+信息|请提供.+信息/i.test(String(item)));
}

function renderProductionDebugSection(output: NonNullable<AgentMessage['productionOutput']>) {
  if (!output.persistedFiles?.length && !output.debug?.storage) return null;

  return renderResultSection(
    <details>
      <summary style={{ cursor: 'pointer', color: 'var(--color-text-secondary)' }}>调试与落盘信息</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {output.persistedFiles?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {output.persistedFiles.map((file, index) => (
              <div
                key={`debug_file_${index}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: 10,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  minWidth: 0,
                }}
              >
                <strong style={{ fontSize: 12 }}>{file.fileName || `文件 ${index + 1}`}</strong>
                <small style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>URL：{file.url || '无'}</small>
                <small style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>绝对路径：{file.absolutePath || '无'}</small>
              </div>
            ))}
          </div>
        ) : null}
        {output.debug?.storage ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <small>persistGeneratedOutputs：{String(output.debug.persistGeneratedOutputs)}</small>
            <small style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              storage root：{output.debug.storage.root || '无'}
            </small>
            <small style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              generated dir：{output.debug.storage.generatedDir || '无'}
            </small>
            <small style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              scope namespace：{stringifyApprovalValue(output.debug.storage.scopeNamespace) || '无'}
            </small>
          </div>
        ) : null}
      </div>
    </details>,
    '调试信息',
    'muted',
  );
}

function getAgentToolRecord(plan: AgentPlan, response?: string): AgentToolRecord {
  const detailParts = [plan.reasoningSummary];
  if (plan.toolName === 'image.generate' || plan.toolName === 'image.edit' || plan.toolName === 'image.compare') {
    const imageModelLabel = plan.imageModel?.label || plan.imageModel?.modelId;
    if (imageModelLabel) detailParts.push(`图像模型：${imageModelLabel}`);
  }
  if (plan.toolName === 'video.generate') {
    const videoModelLabel = plan.videoModel?.label || plan.videoModel?.modelId;
    if (videoModelLabel) detailParts.push(`视频模型：${videoModelLabel}`);
  }
  return {
    id: gid('tool'),
    name: plan.toolName,
    label: getToolLabel(plan.toolName),
    status: 'success',
    summary: response || plan.summary,
    detail: detailParts.filter(Boolean).join('；'),
  };
}

function getPlannerModelLabel(model: ModelInfo) {
  return `${model.modelId || model.id}${model.configName ? ` · ${model.configName}` : ''}`;
}

function buildPlannerModelPayload(model: ModelInfo | null) {
  if (!model) return undefined;
  return {
    id: model.id,
    modelId: model.modelId || model.id,
    configId: model.configId,
    configName: model.configName,
    label: getPlannerModelLabel(model),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isWorkflowCanvasSummary(value: unknown): value is WorkflowCanvasSummary {
  const record = asRecord(value);
  return Boolean(
    record && typeof record.id === 'string' && typeof record.name === 'string' && typeof record.signature === 'string',
  );
}

function isWorkflowEditPatch(value: unknown): value is WorkflowEditPatch {
  const record = asRecord(value);
  return Boolean(
    record && typeof record.id === 'string' && typeof record.workflowId === 'string' && asRecord(record.workflow),
  );
}

function isWorkflowSuggestedInput(value: unknown): value is WorkflowSuggestedInput {
  const record = asRecord(value);
  return Boolean(
    record &&
      typeof record.nodeId === 'string' &&
      typeof record.nodeType === 'string' &&
      typeof record.label === 'string' &&
      Array.isArray(record.aliases),
  );
}

function getPrimaryToolOutput(runResult: AgentRunResponse) {
  return asRecord(runResult.toolResults[0]?.output);
}

function getToolOutput(runResult: AgentRunResponse, skillId: string) {
  return asRecord(runResult.toolResults.find((result) => result.skillId === skillId)?.output);
}

function stringifyApprovalValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getProductionOutput(runResult: AgentRunResponse) {
  const output = getPrimaryToolOutput(runResult);
  if (!output) return null;

  const promptOptimizeSource = [output.optimizedPrompt, output.optimized, output.text, output.prompt]
    .filter((item) => typeof item === 'string')
    .map((item) => String(item))
    .find((item) => item.trim().length > 0);
  const promptOptimizeSections = promptOptimizeSource ? extractPromptOptimizeSections(promptOptimizeSource) : null;

  return {
    images: Array.isArray(output.images) ? output.images.filter((item) => typeof item === 'string') : undefined,
    rawImages: Array.isArray(output.rawImages) ? output.rawImages.filter((item) => typeof item === 'string') : undefined,
    video: output.video,
    videoUrl: getVideoOutputUrl(output.video),
    model: typeof output.model === 'string' ? output.model : undefined,
    text:
      typeof output.text === 'string' && !promptOptimizeSections?.optimizedPrompt
        ? output.text
        : undefined,
    optimizedPrompt: promptOptimizeSections?.optimizedPrompt,
    changes:
      Array.isArray(output.changes) && output.changes.length > 0
        ? output.changes.map((item) => normalizeEscapedText(String(item)).trim()).filter(Boolean)
        : promptOptimizeSections?.changes,
    persistedFiles: Array.isArray(output.persistedFiles)
      ? output.persistedFiles
          .map((item) => asRecord(item))
          .filter(Boolean)
          .map((item) => ({
            fileName: String(item?.fileName || ''),
            url: String(item?.url || ''),
            absolutePath: String(item?.absolutePath || ''),
          }))
      : undefined,
    debug: asRecord(output.debug)
      ? {
          persistGeneratedOutputs: Boolean(asRecord(output.debug)?.persistGeneratedOutputs),
          storage: asRecord(asRecord(output.debug)?.storage)
            ? {
                root: String(asRecord(asRecord(output.debug)?.storage)?.root || ''),
                generatedDir: String(asRecord(asRecord(output.debug)?.storage)?.generatedDir || ''),
                scopeNamespace: asRecord(asRecord(output.debug)?.storage)?.scopeNamespace,
              }
            : undefined,
        }
      : undefined,
  };
}

function getWorkflowSuggestedInputs(value: unknown): WorkflowSuggestedInput[] {
  return Array.isArray(value) ? value.filter(isWorkflowSuggestedInput) : [];
}

function getInitialApprovalValues(inputs: unknown, suggestedInputs: WorkflowSuggestedInput[]) {
  const values = asRecord(inputs) || {};
  return suggestedInputs.reduce<Record<string, string>>((acc, item) => {
    const matchedValue = [item.nodeId, ...item.aliases]
      .map((key) => values[key])
      .find(
        (candidate) =>
          candidate !== undefined && candidate !== null && stringifyApprovalValue(candidate).trim().length > 0,
      );
    acc[item.nodeId] = matchedValue === undefined ? '' : stringifyApprovalValue(matchedValue);
    return acc;
  }, {});
}

function buildApprovalInputPayload(values?: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(values || {})) {
    const trimmed = value.trim();
    if (trimmed) next[key] = trimmed;
  }
  return next;
}

function getApprovalInputPlaceholder(input: WorkflowSuggestedInput) {
  if (input.kind === 'text') return '填写本次运行的文本输入，留空则继续使用已保存默认值';
  if (input.kind === 'image') return '填写图片 URL 或本地路径，留空则继续使用当前素材';
  if (input.kind === 'video') return '填写视频 URL 或本地路径，留空则继续使用当前素材';
  if (input.kind === 'audio') return '填写音频 URL 或本地路径，留空则继续使用当前素材';
  return '填写蒙版 URL 或本地路径，留空则继续使用当前素材';
}

function shouldUsePendingImageForEdit(input: string) {
  const normalized = input.toLowerCase();
  return (
    normalized.includes('编辑') ||
    normalized.includes('改图') ||
    normalized.includes('局部') ||
    normalized.includes('修图') ||
    normalized.includes('抠') ||
    normalized.includes('换背景') ||
    normalized.includes('mask') ||
    normalized.includes('蒙版') ||
    normalized.includes('reference')
  );
}

function getPendingImageStatusLabel(image: AgentPendingImage) {
  if (image.processingStatus === 'failed') {
    return image.processingError?.trim() ? `处理失败：${image.processingError}` : '处理失败，请重新上传';
  }
  if (image.processing || image.processingStatus === 'processing') {
    return '处理中，正在同步素材元数据';
  }
  const size = image.width && image.height ? `${image.width} × ${image.height}` : '尺寸待同步';
  return `${image.role === 'mask' ? '蒙版素材' : '参考素材'} · ${size}`;
}

function getPendingImageTone(image: AgentPendingImage) {
  if (image.processingStatus === 'failed') return 'danger';
  if (image.processing || image.processingStatus === 'processing') return 'warning';
  return 'neutral';
}

function getVideoOutputUrl(video: unknown) {
  if (typeof video === 'string') return video;
  const record = asRecord(video);
  const direct = typeof record?.url === 'string' ? record.url : '';
  if (direct) return direct;
  return typeof record?.video === 'string' ? record.video : '';
}

function updatePendingImageById(
  items: AgentPendingImage[],
  id: string,
  patch: Partial<AgentPendingImage>,
): AgentPendingImage[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function downloadByUrl(url: string, filename?: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'image';
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function AgentWorkspace({
  open,
  onClose,
  onOpenWorkflow,
  onBackfillImageToCanvas,
  onBackfillVideoToCanvas,
  plannerModels,
  imageModels,
  videoModels,
}: AgentWorkspaceProps) {
  const [input, setInput] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [expandedTools, setExpandedTools] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedPlannerModelId, setSelectedPlannerModelId] = useState(
    () => localStorage.getItem(PLANNER_MODEL_STORAGE_KEY) || '',
  );
  const [selectedImageModelId, setSelectedImageModelId] = useState(
    () => localStorage.getItem(IMAGE_MODEL_STORAGE_KEY) || '',
  );
  const [selectedVideoModelId, setSelectedVideoModelId] = useState(
    () => localStorage.getItem(VIDEO_MODEL_STORAGE_KEY) || '',
  );
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<PendingImagePreviewState | null>(null);
  const [pendingImages, setPendingImages] = useState<AgentPendingImage[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const runSessionRef = useRef(0);
  const escStopArmedUntilRef = useRef(0);
  const [messages, setMessages] = useState<AgentMessage[]>(() => [
    {
      id: gid(),
      role: 'assistant',
      content:
        '我是项目 Agent。你可以直接描述想完成的事，我会根据需求生成可编辑的工作流草案，并把结果交给你继续检查和调整。',
    },
  ]);
  const workflowContext = useWorkflowStore(
    useShallow((state) => ({
      workflowId:
        state.documents.find((document) => document.documentId === state.activeDocumentId)?.sourceWorkflowId || '',
      workflowName: state.workflowName,
      runId: state.lastExecutionRunId || '',
    })),
  );

  const selectedPlannerModel = useMemo(
    () => plannerModels.find((model) => model.id === selectedPlannerModelId) || plannerModels[0] || null,
    [plannerModels, selectedPlannerModelId],
  );
  const selectedImageModel = useMemo(
    () => imageModels.find((model) => model.id === selectedImageModelId) || imageModels[0] || null,
    [imageModels, selectedImageModelId],
  );
  const selectedVideoModel = useMemo(
    () => videoModels.find((model) => model.id === selectedVideoModelId) || videoModels[0] || null,
    [videoModels, selectedVideoModelId],
  );
  const hasPlannerModel = Boolean(selectedPlannerModel);
  const primaryReferenceImage = useMemo(
    () => pendingImages.find((image) => image.role === 'reference') || pendingImages[0] || null,
    [pendingImages],
  );
  const maskReferenceImage = useMemo(() => pendingImages.find((image) => image.role === 'mask') || null, [pendingImages]);
  const canSubmit = (input.trim().length > 0 || pendingImages.length > 0) && !isWorking && hasPlannerModel;
  const latestUploadedImage = primaryReferenceImage;
  const latestDraft = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].draft) return messages[index].draft;
    }
    return null;
  }, [messages]);
  const latestWorkflowEditPatch = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].workflowEditPatch) return messages[index].workflowEditPatch;
    }
    return null;
  }, [messages]);
  const hasUserStartedConversation = useMemo(() => messages.some((message) => message.role === 'user'), [messages]);
  const latestPendingApproval = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].pendingApproval) return messages[index].pendingApproval;
    }
    return null;
  }, [messages]);
  const activeCanvasLabel = workflowContext.workflowName.trim() || '当前未关联画布';
  const latestDeliverableLabel = latestWorkflowEditPatch ? '修改草案' : latestDraft ? '工作流草案' : '暂无';
  const previewImageGallery = useMemo<PreviewImageItem[]>(() => {
    const images = messages.flatMap((message) => message.productionOutput?.images || []);
    return images.map((src, index) => ({ src, name: `agent-image-${index + 1}` }));
  }, [messages]);
  const previewImageIndex = previewImage ? previewImageGallery.findIndex((item) => item.src === previewImage) : -1;
  const pendingImagePreviewItems = useMemo<AgentPendingImage[]>(() => {
    if (!pendingImagePreview) return [];
    if (pendingImagePreview.scope === 'composer') return pendingImages;
    const targetMessage = messages.find((message) => message.id === pendingImagePreview.scope);
    return targetMessage?.attachedImages || [];
  }, [messages, pendingImagePreview, pendingImages]);
  const activePendingImage = useMemo(
    () => pendingImagePreviewItems.find((item) => item.id === pendingImagePreview?.imageId) || pendingImagePreviewItems[0] || null,
    [pendingImagePreview?.imageId, pendingImagePreviewItems],
  );
  const pendingImagePreviewGallery = useMemo<PreviewImageItem[]>(() => {
    return pendingImagePreviewItems.map((item) => ({
      src: item.url,
      thumbnailSrc: item.thumbnailUrl,
      name: item.name,
    }));
  }, [pendingImagePreviewItems]);
  const pendingImagePreviewIndex = activePendingImage
    ? pendingImagePreviewGallery.findIndex((item) => item.src === activePendingImage.url)
    : -1;
  const workspaceStatus = !hasPlannerModel
    ? '等待可用模型'
    : isWorking
      ? '正在处理新任务'
      : latestPendingApproval
        ? latestPendingApproval.toolName === 'workflow.applyDraft'
          ? '等待确认应用修改'
          : '等待确认运行工作流'
        : latestWorkflowEditPatch
          ? '已生成修改草案'
          : latestDraft
            ? '已生成工作流草案'
            : '可以开始协作';
  const workspaceStatusTone = !hasPlannerModel
    ? 'muted'
    : isWorking
      ? 'accent'
      : latestPendingApproval
        ? 'warning'
        : latestWorkflowEditPatch || latestDraft
          ? 'success'
          : 'muted';
  const conversationCount = Math.max(messages.length - 1, 0);

  useEffect(() => {
    if (plannerModels.length === 0) {
      if (selectedPlannerModelId) setSelectedPlannerModelId('');
      localStorage.removeItem(PLANNER_MODEL_STORAGE_KEY);
      return;
    }

    const hasSelected = plannerModels.some((model) => model.id === selectedPlannerModelId);
    if (hasSelected) return;

    const nextId = plannerModels[0].id;
    setSelectedPlannerModelId(nextId);
    localStorage.setItem(PLANNER_MODEL_STORAGE_KEY, nextId);
  }, [plannerModels, selectedPlannerModelId]);

  useEffect(() => {
    if (imageModels.length === 0) {
      if (selectedImageModelId) setSelectedImageModelId('');
      localStorage.removeItem(IMAGE_MODEL_STORAGE_KEY);
      return;
    }
    const hasSelected = imageModels.some((model) => model.id === selectedImageModelId);
    if (hasSelected) return;
    const nextId = imageModels[0].id;
    setSelectedImageModelId(nextId);
    localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, nextId);
  }, [imageModels, selectedImageModelId]);

  useEffect(() => {
    if (videoModels.length === 0) {
      if (selectedVideoModelId) setSelectedVideoModelId('');
      localStorage.removeItem(VIDEO_MODEL_STORAGE_KEY);
      return;
    }
    const hasSelected = videoModels.some((model) => model.id === selectedVideoModelId);
    if (hasSelected) return;
    const nextId = videoModels[0].id;
    setSelectedVideoModelId(nextId);
    localStorage.setItem(VIDEO_MODEL_STORAGE_KEY, nextId);
  }, [videoModels, selectedVideoModelId]);

  const toggleToolRecord = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const applyWorkflowDraft = (draft: WorkflowDraftResponse) => {
    const workflowStore = useWorkflowStore.getState();
    workflowStore.createWorkflowDocument({ origin: 'new', name: draft.workflow.name });
    workflowStore.applyEditorSnapshot(
      {
        workflowId: draft.workflow.id,
        workflowName: draft.workflow.name,
        nodes: draft.workflow.nodes as Node[],
        edges: draft.workflow.edges as Edge[],
        selectedNodeId: null,
      },
      true,
    );
    workflowStore.persistLocalDraft();
    onOpenWorkflow();
    onClose();
  };

  const applyWorkflowSnapshot = (workflow: { id: string; name: string; nodes: unknown[]; edges: unknown[] }) => {
    const workflowStore = useWorkflowStore.getState();
    workflowStore.applyEditorSnapshot(
      {
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodes: workflow.nodes as Node[],
        edges: workflow.edges as Edge[],
        selectedNodeId: null,
      },
      true,
    );
    workflowStore.persistLocalDraft();
    onOpenWorkflow();
  };

  const getWorkflowSnapshot = () => {
    const workflowStore = useWorkflowStore.getState();
    return workflowStore.exportCurrentWorkflow();
  };

  const buildAgentContext = (workflowEditPatch?: WorkflowEditPatch | null) => {
    const workflowSnapshot = getWorkflowSnapshot();
    const referenceImages = pendingImages
      .filter((item) => item.role === 'reference')
      .map((item, index) => ({
        id: item.id,
        name: item.name,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        width: item.width,
        height: item.height,
        processing: item.processing,
        processingStatus: item.processingStatus,
        order: index,
      }));
    return {
      ...(workflowContext.workflowId ? { workflowId: workflowContext.workflowId } : {}),
      ...(workflowContext.workflowName ? { workflowName: workflowContext.workflowName } : {}),
      ...(workflowContext.runId ? { runId: workflowContext.runId } : {}),
      ...(workflowSnapshot ? { workflowSnapshot } : {}),
      ...(workflowEditPatch || latestWorkflowEditPatch
        ? { workflowEditPatch: workflowEditPatch || latestWorkflowEditPatch }
        : {}),
      ...(latestUploadedImage ? { latestUploadedImage } : {}),
      ...(referenceImages.length > 0 ? { referenceImages } : {}),
      ...(maskReferenceImage ? { latestUploadedMask: maskReferenceImage } : {}),
    };
  };

  const handleAgentImageUpload = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    setIsUploadingImage(true);
    try {
      const uploadedItems = await Promise.all(
        imageFiles.map(async (file) => {
          const uploaded = await uploadFile(file);
          if (!uploaded.success || !uploaded.url) {
            throw new Error(uploaded.error || `${file.name} 上传失败`);
          }
          const role: 'reference' | 'mask' = /mask|蒙版/i.test(file.name) ? 'mask' : 'reference';
          const pendingItem: AgentPendingImage = {
            id: gid('pending_image'),
            name: uploaded.fileName || file.name,
            url: uploaded.url,
            thumbnailUrl: uploaded.thumbnailUrl,
            width: uploaded.width,
            height: uploaded.height,
            processing: uploaded.processing,
            processingStatus: uploaded.processingStatus,
            processingError: uploaded.processingError,
            role,
          };

          if (uploaded.processing || uploaded.processingStatus === 'processing') {
            void waitForUploadedImageMetadata(uploaded.url, (result) => {
              setPendingImages((prev) =>
                updatePendingImageById(prev, pendingItem.id, {
                  thumbnailUrl: result.thumbnailUrl || pendingItem.thumbnailUrl,
                  width: result.width,
                  height: result.height,
                  processing: result.processing,
                  processingStatus: result.processingStatus,
                  processingError: result.processingError,
                }),
              );
            })
              .then((result) => {
                if (!result) {
                  setPendingImages((prev) =>
                    updatePendingImageById(prev, pendingItem.id, {
                      processing: false,
                      processingStatus: 'failed',
                      processingError: '等待元数据超时，请稍后重试',
                    }),
                  );
                  return;
                }
                setPendingImages((prev) =>
                  updatePendingImageById(prev, pendingItem.id, {
                    thumbnailUrl: result.thumbnailUrl || pendingItem.thumbnailUrl,
                    width: result.width,
                    height: result.height,
                    processing: result.processing,
                    processingStatus: result.processingStatus,
                    processingError: result.processingError,
                  }),
                );
              })
              .catch((error) => {
                setPendingImages((prev) =>
                  updatePendingImageById(prev, pendingItem.id, {
                    processing: false,
                    processingStatus: 'failed',
                    processingError: error instanceof Error ? error.message : '素材处理失败',
                  }),
                );
              });
          }

          return pendingItem;
        }),
      );
      setPendingImages((prev) => [...uploadedItems.reverse(), ...prev].slice(0, 8));
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: error instanceof Error ? error.message : '素材上传失败，请稍后重试。',
        },
      ]);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const removePendingImage = (id: string) => {
    setPendingImages((prev) => prev.filter((item) => item.id !== id));
  };

  const markPendingImageAsPrimary = (id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (!target) return prev;
      return [target, ...prev.filter((item) => item.id !== id)];
    });
  };

  const togglePendingImageRole = (id: string) => {
    setPendingImages((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, role: item.role === 'mask' ? 'reference' : 'mask' }
          : item.role === 'mask' && item.id !== id
            ? { ...item, role: 'reference' }
            : item,
      ),
    );
  };

  const appendAgentResult = (runResult: AgentRunResponse, task: string) => {
    const { plan, response, workflowDraft: draft, pendingApproval } = runResult;
    const output = getPrimaryToolOutput(runResult);
    const productionOutput = getProductionOutput(runResult);
    const inspectResult = asRecord(output) as WorkflowInspectResult | null;
    const editResult = asRecord(output) as WorkflowEditResult | null;
    const applyResult = asRecord(output) as WorkflowApplyDraftResult | null;
    const executeResult = getToolOutput(runResult, 'workflow.execute') as WorkflowExecuteResult | null;
    if (executeResult?.run?.runId) {
      useWorkflowStore.setState((state) => ({
        currentRunId: null,
        lastExecutionRunId: executeResult.run?.runId || state.lastExecutionRunId,
        lastExecutionStatus: executeResult.run?.status === 'completed' ? 'success' : 'error',
        lastExecutionError: executeResult.run?.status === 'completed' ? null : executeResult.run?.summary || null,
      }));
    }
    if (pendingApproval) {
      const workflowSuggestedInputs =
        pendingApproval.toolName === 'workflow.execute'
          ? getWorkflowSuggestedInputs(
              asRecord(pendingApproval.toolInput)?.requiredInputs || executeResult?.requiredInputs,
            )
          : [];
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.summary || '这个动作需要你确认后才会执行。',
          plan,
          inspectResult: isWorkflowCanvasSummary(inspectResult?.workflow) ? inspectResult.workflow : null,
          workflowEditPatch: isWorkflowEditPatch(editResult?.patch)
            ? editResult.patch
            : isWorkflowEditPatch(applyResult?.patch)
              ? applyResult.patch
              : null,
          workflowSuggestedInputs,
          pendingApproval,
          approvalInput: task,
          approvalValues:
            pendingApproval.toolName === 'workflow.execute'
              ? getInitialApprovalValues(asRecord(pendingApproval.toolInput)?.inputs, workflowSuggestedInputs)
              : undefined,
          toolRecords: [
            {
              id: gid('tool'),
              name: pendingApproval.toolName as AgentToolName,
              label: getToolLabel(pendingApproval.toolName),
              status: 'running',
              summary: '等待用户确认',
              detail: plan.reasoningSummary,
            },
          ],
        },
      ]);
      return;
    }
    if (plan.toolName === 'chat.respond') {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.toolInput.response || plan.summary || '我理解了，你可以继续补充。',
          plan,
          toolRecords: [getChatToolRecord(plan)],
        },
      ]);
      return;
    }
    if (plan.toolName !== 'workflow.createDraft') {
      if (plan.toolName === 'workflow.applyDraft' && applyResult?.applied && asRecord(applyResult.workflow)) {
        const workflow = applyResult.workflow as unknown as {
          id: string;
          name: string;
          nodes: unknown[];
          edges: unknown[];
        };
        applyWorkflowSnapshot(workflow);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: response || plan.summary,
          plan,
          inspectResult: isWorkflowCanvasSummary(inspectResult?.workflow) ? inspectResult.workflow : null,
          workflowEditPatch: isWorkflowEditPatch(editResult?.patch) ? editResult.patch : null,
          toolRecords: [getAgentToolRecord(plan, response)],
          productionOutput,
        },
      ]);
      return;
    }
    if (!draft) {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: 'Agent 已完成规划，但当前工具没有返回可展示的工作流草案。',
          toolRecords: [
            {
              id: gid('tool'),
              name: 'workflow.createDraft',
              label: '工作流工具',
              status: 'error',
              summary: '工具调用失败',
            },
          ],
        },
      ]);
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id: gid(),
        role: 'assistant',
        content: getAgentResultSummary(plan, draft),
        plan,
        draft,
        toolRecords: [getPlannerToolRecord(plan), getWorkflowToolRecord(draft)],
      },
    ]);
  };

  const updateApprovalValue = (messageId: string, nodeId: string, value: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              approvalValues: {
                ...(message.approvalValues || {}),
                [nodeId]: value,
              },
            }
          : message,
      ),
    );
  };

  const handleApprove = (message: AgentMessage) => {
    if (!message.pendingApproval || !selectedPlannerModel || isWorking) return;
    const pendingApproval = message.pendingApproval;
    void (async () => {
      setIsWorking(true);
      const sessionId = ++runSessionRef.current;
      try {
        const runResult = await createAgentRun({
          input: message.approvalInput || message.content,
          plannerModel: buildPlannerModelPayload(selectedPlannerModel)!,
          imageModel: buildPlannerModelPayload(selectedImageModel),
          videoModel: buildPlannerModelPayload(selectedVideoModel),
          context: buildAgentContext(message.workflowEditPatch),
          approval: {
            ...pendingApproval,
            toolInput:
              pendingApproval.toolName === 'workflow.applyDraft'
                ? {
                    ...pendingApproval.toolInput,
                    workflowSnapshot: getWorkflowSnapshot(),
                  }
                : pendingApproval.toolName === 'workflow.execute'
                  ? {
                      ...pendingApproval.toolInput,
                      workflowSnapshot: getWorkflowSnapshot(),
                      inputs: buildApprovalInputPayload(message.approvalValues),
                    }
                  : pendingApproval.toolInput,
          },
        });
        if (sessionId !== runSessionRef.current) return;
        if (!runResult.success || !runResult.data) {
          throw new Error(runResult.error || '确认后的工具调用失败。');
        }
        setMessages((prev) => prev.filter((item) => item.id !== message.id));
        appendAgentResult(runResult.data, message.approvalInput || message.content);
      } catch (error) {
        if (sessionId !== runSessionRef.current) return;
        setMessages((prev) => [
          ...prev,
          {
            id: gid(),
            role: 'assistant',
            content: error instanceof Error ? error.message : '确认后的工具调用失败。',
          },
        ]);
      } finally {
        if (sessionId === runSessionRef.current) {
          setIsWorking(false);
          escStopArmedUntilRef.current = 0;
        }
      }
    })();
  };

  const handleRequestApplyPatch = (message: AgentMessage) => {
    if (!message.workflowEditPatch || !selectedPlannerModel || isWorking) return;
    void (async () => {
      setIsWorking(true);
      const sessionId = ++runSessionRef.current;
      try {
        const runResult = await createAgentRun({
          input: '请应用当前工作流修改草案',
          plannerModel: buildPlannerModelPayload(selectedPlannerModel)!,
          imageModel: buildPlannerModelPayload(selectedImageModel),
          videoModel: buildPlannerModelPayload(selectedVideoModel),
          context: buildAgentContext(message.workflowEditPatch),
        });
        if (sessionId !== runSessionRef.current) return;
        if (!runResult.success || !runResult.data) {
          throw new Error(runResult.error || '无法进入修改应用确认流程。');
        }
        appendAgentResult(runResult.data, '请应用当前工作流修改草案');
      } catch (error) {
        if (sessionId !== runSessionRef.current) return;
        setMessages((prev) => [
          ...prev,
          {
            id: gid(),
            role: 'assistant',
            content: error instanceof Error ? error.message : '无法进入修改应用确认流程。',
          },
        ]);
      } finally {
        if (sessionId === runSessionRef.current) {
          setIsWorking(false);
          escStopArmedUntilRef.current = 0;
        }
      }
    })();
  };

  const stopCurrentRun = () => {
    if (!isWorking) return;
    runSessionRef.current += 1;
    escStopArmedUntilRef.current = 0;
    setIsWorking(false);
    setMessages((prev) => [
      ...prev,
      {
        id: gid(),
        role: 'assistant',
        content: '已停止当前运行。你可以继续补充要求，或重新发起一次新任务。',
      },
    ]);
  };

  useEffect(() => {
    if (!open) return undefined;
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (previewImage || pendingImagePreview) return;
      if (!isWorking) {
        escStopArmedUntilRef.current = 0;
        return;
      }
      const now = Date.now();
      if (escStopArmedUntilRef.current > now) {
        event.preventDefault();
        runSessionRef.current += 1;
        escStopArmedUntilRef.current = 0;
        setIsWorking(false);
        setMessages((prev) => [
          ...prev,
          {
            id: gid(),
            role: 'assistant',
            content: '已停止当前运行。你可以继续补充要求，或重新发起一次新任务。',
          },
        ]);
        return;
      }
      escStopArmedUntilRef.current = now + ESC_STOP_ARM_WINDOW_MS;
      event.preventDefault();
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: '再次按下 Esc 将停止当前运行。',
        },
      ]);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isWorking, open, pendingImagePreview, previewImage]);

  const handleSubmit = () => {
    const task = input.trim();
    if ((!task && pendingImages.length === 0) || isWorking) return;
    if (!selectedPlannerModel) {
      setMessages((prev) => [
        ...prev,
        {
          id: gid(),
          role: 'assistant',
          content: '当前没有可用的 Planner 模型。请先在设置中启用至少一个对话模型，然后回到 Agent 窗口继续。',
        },
      ]);
      return;
    }

    const attachedImages = pendingImages.map((image) => ({ ...image }));
    const composedTask = task || '请基于我刚上传的素材继续处理';
    setMessages((prev) => [...prev, { id: gid(), role: 'user', content: composedTask, attachedImages }]);
    setInput('');
    setPendingImagePreview(null);

    void (async () => {
      setIsWorking(true);
      const sessionId = ++runSessionRef.current;
      const runningTool: AgentToolRecord = {
        id: gid('tool'),
        name: shouldUsePendingImageForEdit(composedTask) && latestUploadedImage ? 'image.edit' : 'workflow.createDraft',
        label: shouldUsePendingImageForEdit(composedTask) && latestUploadedImage ? '编辑图片' : '工作流工具',
        status: 'running',
        summary:
          shouldUsePendingImageForEdit(composedTask) && latestUploadedImage
            ? `Planner：${getPlannerModelLabel(selectedPlannerModel)}，正在结合已上传图片准备编辑任务`
            : `Planner：${getPlannerModelLabel(selectedPlannerModel)}，正在根据你的需求生成可编辑草案`,
      };
      try {
        const runResult = await createAgentRun({
          input: composedTask,
          plannerModel: buildPlannerModelPayload(selectedPlannerModel)!,
          imageModel: buildPlannerModelPayload(selectedImageModel),
          videoModel: buildPlannerModelPayload(selectedVideoModel),
          context: buildAgentContext(),
        });
        if (sessionId !== runSessionRef.current) return;
        if (!runResult.success || !runResult.data) {
          setMessages((prev) => [
            ...prev,
            {
              id: gid(),
              role: 'assistant',
              content: runResult.error || 'Agent 没有生成可执行计划。请把目标、输入素材和期望产物再描述得更具体一些。',
              toolRecords: [
                {
                  id: gid('tool'),
                  name: 'agent.plan',
                  label: 'Planner',
                  status: 'error',
                  summary: 'Planner 调用失败',
                },
              ],
            },
          ]);
          return;
        }

        appendAgentResult(runResult.data, composedTask);
        setPendingImages([]);
      } catch (error) {
        if (sessionId !== runSessionRef.current) return;
        setMessages((prev) => [
          ...prev,
          {
            id: gid(),
            role: 'assistant',
            content: error instanceof Error ? error.message : 'Agent 执行失败。',
            toolRecords: [{ ...runningTool, status: 'error', summary: '工具调用异常' }],
          },
        ]);
      } finally {
        if (sessionId === runSessionRef.current) {
          setIsWorking(false);
          escStopArmedUntilRef.current = 0;
        }
      }
    })();
  };

  if (!open) return null;

  return (
    <div className="agent-workspace" role="dialog" aria-label="项目 Agent" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className={`agent-workspace__panel ${hasUserStartedConversation ? 'agent-workspace__panel--engaged' : ''}`}>
        <div className="agent-workspace__panel-glow" aria-hidden="true" />
        <header className="agent-workspace__header">
          <div className="agent-workspace__header-main">
            <div className="agent-workspace__identity">
              <span className="agent-workspace__mark">
                <Bot size={18} />
              </span>
              <div>
                <div className="agent-workspace__eyebrow">Project Agent</div>
                <div className="agent-workspace__title">工作流协作台</div>
              </div>
            </div>
            <div className={`agent-workspace__status-pill agent-workspace__status-pill--${workspaceStatusTone}`}>
              <Sparkles size={13} />
              <span>{workspaceStatus}</span>
            </div>
            <button type="button" className="agent-workspace__icon-button" onClick={onClose} aria-label="关闭 Agent">
              <X size={17} />
            </button>
          </div>
          <section className="agent-workspace__model-tabs" aria-label="模型选择">
            <article
              className={`agent-workspace__model-tab ${hasPlannerModel ? '' : 'agent-workspace__model-tab--empty'}`}
            >
              <div className="agent-workspace__model-tab-head">
                <div className="agent-workspace__model-tab-copy">
                  <Settings2 size={15} />
                  <div>
                    <strong>对话</strong>
                    <span>{hasPlannerModel ? '负责理解需求与调度工具' : '需要先启用对话模型'}</span>
                  </div>
                </div>
              </div>
              {hasPlannerModel ? (
                <label className="agent-workspace__model-tab-field">
                  <span>当前模型</span>
                  <select
                    value={selectedPlannerModel?.id || ''}
                    onChange={(event) => {
                      setSelectedPlannerModelId(event.target.value);
                      localStorage.setItem(PLANNER_MODEL_STORAGE_KEY, event.target.value);
                    }}
                    aria-label="选择对话模型"
                  >
                    {plannerModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {getPlannerModelLabel(model)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="agent-workspace__model-tab-empty">未找到可用对话模型</span>
              )}
            </article>

            <article
              className={`agent-workspace__model-tab ${imageModels.length > 0 ? '' : 'agent-workspace__model-tab--muted'}`}
            >
              <div className="agent-workspace__model-tab-head">
                <div className="agent-workspace__model-tab-copy">
                  <Settings2 size={15} />
                  <div>
                    <strong>图像</strong>
                    <span>用于图片生成和编辑</span>
                  </div>
                </div>
              </div>
              {imageModels.length > 0 ? (
                <label className="agent-workspace__model-tab-field">
                  <span>当前模型</span>
                  <select
                    value={selectedImageModel?.id || ''}
                    onChange={(event) => {
                      setSelectedImageModelId(event.target.value);
                      localStorage.setItem(IMAGE_MODEL_STORAGE_KEY, event.target.value);
                    }}
                    aria-label="选择图像模型"
                  >
                    {imageModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {getPlannerModelLabel(model)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="agent-workspace__model-tab-empty">暂未配置图像模型</span>
              )}
            </article>

            <article
              className={`agent-workspace__model-tab ${videoModels.length > 0 ? '' : 'agent-workspace__model-tab--muted'}`}
            >
              <div className="agent-workspace__model-tab-head">
                <div className="agent-workspace__model-tab-copy">
                  <Settings2 size={15} />
                  <div>
                    <strong>视频</strong>
                    <span>用于视频生成</span>
                  </div>
                </div>
              </div>
              {videoModels.length > 0 ? (
                <label className="agent-workspace__model-tab-field">
                  <span>当前模型</span>
                  <select
                    value={selectedVideoModel?.id || ''}
                    onChange={(event) => {
                      setSelectedVideoModelId(event.target.value);
                      localStorage.setItem(VIDEO_MODEL_STORAGE_KEY, event.target.value);
                    }}
                    aria-label="选择视频模型"
                  >
                    {videoModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {getPlannerModelLabel(model)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="agent-workspace__model-tab-empty">暂未配置视频模型</span>
              )}
            </article>
          </section>
        </header>

        <div className={`agent-workspace__body ${hasUserStartedConversation ? 'agent-workspace__body--engaged' : ''}`}>
          <section
            className={`agent-workspace__hero ${hasUserStartedConversation ? 'agent-workspace__hero--engaged' : ''}`}
          >
            <div className="agent-workspace__hero-copy">
              <div className="agent-workspace__hero-badge">
                <Sparkles size={14} />
                <span>需求理解 · 草案生成 · 应用确认</span>
              </div>
              <h2 className="agent-workspace__hero-title">把一句需求，整理成可编辑工作流</h2>
              <p className="agent-workspace__hero-text">
                你只需要说明目标、素材和期望产物，Agent 会先规划，再生成草案，并在关键动作前向你确认。
              </p>
              <div className="agent-workspace__hero-metrics">
                <div className="agent-workspace__metric">
                  <span>当前状态</span>
                  <strong>{workspaceStatus}</strong>
                </div>
                <div className="agent-workspace__metric">
                  <span>当前画布</span>
                  <strong>{activeCanvasLabel}</strong>
                </div>
                <div className="agent-workspace__metric">
                  <span>最近产物</span>
                  <strong>{latestDeliverableLabel}</strong>
                </div>
              </div>
            </div>
          </section>

          <section
            className={`agent-workspace__scope ${hasUserStartedConversation ? 'agent-workspace__scope--engaged' : ''}`}
          >
            <div>
              <Sparkles size={16} />
              <strong>需求梳理</strong>
              <span>先理解你的目标、限制和交付格式</span>
            </div>
            <div>
              <Wrench size={16} />
              <strong>工具规划</strong>
              <span>根据上下文挑选检查、生成或应用动作</span>
            </div>
            <div>
              <Bot size={16} />
              <strong>结果交付</strong>
              <span>保留草案、审批和后续迭代入口</span>
            </div>
          </section>

          <section
            className={`agent-workspace__conversation ${hasUserStartedConversation ? 'agent-workspace__conversation--engaged' : ''}`}
          >
            <div className="agent-workspace__section-heading">
              <div>
                <strong>协作记录</strong>
                <span>按顺序保留需求、工具执行和交付结果，方便继续追改。</span>
              </div>
              <small>{conversationCount} 条消息</small>
            </div>

            <div className="agent-workspace__messages">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`agent-workspace__message agent-workspace__message--${message.role}`}
                >
                  <div className="agent-workspace__message-meta">
                    <span className="agent-workspace__message-avatar">
                      {message.role === 'assistant' ? <Bot size={14} /> : '你'}
                    </span>
                    <div className="agent-workspace__message-meta-copy">
                      <strong>{message.role === 'assistant' ? '项目 Agent' : '你'}</strong>
                      <span>{message.role === 'assistant' ? '需求理解、工具规划与交付' : '本轮目标与补充要求'}</span>
                    </div>
                  </div>

                  <div className="agent-workspace__message-body">
                    <div className="agent-workspace__message-text">{message.content}</div>
                    {message.role === 'user' && message.attachedImages && message.attachedImages.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                        {message.attachedImages.map((image) => {
                          const tone = getPendingImageTone(image);
                          return (
                            <button
                              key={image.id}
                              type="button"
                              onClick={() => setPendingImagePreview({ imageId: image.id, scope: message.id })}
                              style={{
                                position: 'relative',
                                width: 44,
                                height: 44,
                                borderRadius: 12,
                                overflow: 'hidden',
                                padding: 0,
                                cursor: 'pointer',
                                border:
                                  tone === 'danger'
                                    ? '1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border))'
                                    : tone === 'warning'
                                      ? '1px solid color-mix(in srgb, var(--color-warning) 30%, var(--color-border))'
                                      : '1px solid var(--color-border)',
                                background: 'var(--color-bg-secondary)',
                              }}
                              title={`${image.name}\n${getPendingImageStatusLabel(image)}`}
                            >
                              <img
                                src={image.thumbnailUrl || image.url}
                                alt={image.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {message.toolRecords && message.toolRecords.length > 0 && (
                      <div className="agent-workspace__tools">
                        {message.toolRecords.map((record) => {
                          const expanded = expandedTools.has(record.id);
                          return (
                            <div
                              key={record.id}
                              className={`agent-workspace__tool agent-workspace__tool--${record.status}`}
                            >
                              <button type="button" onClick={() => toggleToolRecord(record.id)}>
                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span>{record.label}</span>
                                <small>
                                  {record.status === 'running'
                                    ? '执行中'
                                    : record.status === 'success'
                                      ? '已完成'
                                      : '失败'}
                                </small>
                              </button>
                              {expanded && (
                                <div className="agent-workspace__tool-detail">
                                  <strong>{record.summary}</strong>
                                  {record.detail && <span>{record.detail}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {message.draft && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>工作流草案</strong>
                          <span>
                            {message.draft.workflow.nodes.length} 节点 · {message.draft.workflow.edges.length} 连线
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyWorkflowDraft(message.draft as WorkflowDraftResponse)}
                          disabled={!message.draft.validation.valid}
                        >
                          <Maximize2 size={14} />
                          新建画布
                        </button>
                      </div>
                    )}
                    {message.inspectResult && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>当前画布摘要</strong>
                          <span>
                            {message.inspectResult.nodeCount} 节点 · {message.inspectResult.edgeCount} 连线 · 签名{' '}
                            {message.inspectResult.signature}
                          </span>
                        </div>
                      </div>
                    )}
                    {message.workflowEditPatch && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>修改草案</strong>
                          <span>{message.workflowEditPatch.summary}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRequestApplyPatch(message)}
                          disabled={
                            !message.workflowEditPatch.validation.valid ||
                            message.workflowEditPatch.operations.length === 0 ||
                            isWorking
                          }
                        >
                          <Play size={14} />
                          申请应用
                        </button>
                      </div>
                    )}
                    {message.productionOutput && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>生产工具返回</strong>
                          <span>{getProductionOutputSummary(message.productionOutput)}</span>
                        </div>
                        {message.productionOutput.images && message.productionOutput.images.length > 0 && (
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                              gap: 12,
                              marginTop: 12,
                            }}
                          >
                            {message.productionOutput.images.map((image, index) => {
                              const persisted = message.productionOutput?.persistedFiles?.find((file) => file.url === image);
                              return (
                                <div
                                  key={`${message.id}_image_${index}`}
                                  style={{
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 16,
                                    overflow: 'hidden',
                                    background: 'var(--color-bg-secondary)',
                                    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.06)',
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage(image)}
                                    style={{
                                      width: '100%',
                                      border: 'none',
                                      background: 'transparent',
                                      padding: 0,
                                      cursor: 'zoom-in',
                                      position: 'relative',
                                    }}
                                  >
                                    <img
                                      src={image}
                                      alt={`Agent 生成结果 ${index + 1}`}
                                      style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }}
                                    />
                                    <ImageSizeLabel
                                      src={image}
                                      className="absolute left-3 top-3 z-10 rounded-full px-3 py-1 text-xs text-white"
                                    />
                                  </button>
                                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                                        {persisted?.fileName || `图片 ${index + 1}`}
                                      </strong>
                                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                                        {message.plan?.imageModel?.label || message.plan?.imageModel?.modelId || '图像模型未记录'}
                                      </span>
                                      <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', wordBreak: 'break-all' }}>
                                        {persisted?.absolutePath || image}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                      <button
                                        type="button"
                                        onClick={() => setPreviewImage(image)}
                                        className="workflow-results__mini-action"
                                      >
                                        <Maximize2 size={12} />
                                        查看大图
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => downloadByUrl(image, persisted?.fileName)}
                                        className="workflow-results__mini-action"
                                      >
                                        <Download size={12} />
                                        下载
                                      </button>
                                      {onBackfillImageToCanvas && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            onBackfillImageToCanvas({
                                              src: image,
                                              thumbnailSrc: image,
                                              name: persisted?.fileName || `agent-image-${index + 1}`,
                                            })
                                          }
                                          className="workflow-results__mini-action"
                                        >
                                          <ImagePlus size={12} />
                                          回填到画布
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {message.productionOutput.videoUrl && (
                          <div
                            style={{
                              marginTop: 12,
                              border: '1px solid var(--color-border)',
                              borderRadius: 16,
                              background: 'var(--color-bg-secondary)',
                              overflow: 'hidden',
                              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.06)',
                            }}
                          >
                            <video
                              src={message.productionOutput.videoUrl}
                              controls
                              playsInline
                              preload="metadata"
                              style={{ width: '100%', aspectRatio: '16 / 9', display: 'block', background: '#000' }}
                            />
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                                  {message.productionOutput.persistedFiles?.find((file) => file.url === message.productionOutput?.videoUrl)?.fileName ||
                                    '生成视频'}
                                </strong>
                                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                                  {message.plan?.videoModel?.label ||
                                    message.plan?.videoModel?.modelId ||
                                    message.productionOutput.model ||
                                    '视频模型未记录'}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', wordBreak: 'break-all' }}>
                                  {message.productionOutput.persistedFiles?.find((file) => file.url === message.productionOutput?.videoUrl)
                                    ?.absolutePath || message.productionOutput.videoUrl}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadByUrl(
                                      message.productionOutput?.videoUrl || '',
                                      message.productionOutput?.persistedFiles?.find(
                                        (file) => file.url === message.productionOutput?.videoUrl,
                                      )?.fileName || 'video',
                                    )
                                  }
                                  className="workflow-results__mini-action"
                                >
                                  <Download size={12} />
                                  下载
                                </button>
                                {onBackfillVideoToCanvas && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onBackfillVideoToCanvas({
                                        src: message.productionOutput?.videoUrl || '',
                                        name:
                                          message.productionOutput?.persistedFiles?.find(
                                            (file) => file.url === message.productionOutput?.videoUrl,
                                          )?.fileName || 'agent-video',
                                      })
                                    }
                                    className="workflow-results__mini-action"
                                  >
                                    <ImagePlus size={12} />
                                    回填到画布
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                        {message.productionOutput.text && renderStructuredTextBlock(message.productionOutput.text, '文本结果')}
                        {message.productionOutput.optimizedPrompt &&
                          renderStructuredTextBlock(message.productionOutput.optimizedPrompt, '优化后的提示词')}
                        {message.productionOutput.changes && message.productionOutput.changes.length > 0 &&
                          renderResultSection(
                            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-text-primary)' }}>
                              {message.productionOutput.changes.map((item, index) => (
                                <li key={`${message.id}_change_${index}`} style={{ lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                  {item}
                                </li>
                              ))}
                            </ul>,
                            '优化说明',
                          )}
                        {hasPromptOptimizePlaceholder(message.productionOutput) && renderMissingDetailsNote()}
                        {renderProductionDebugSection(message.productionOutput)}
                      </div>
                    )}
                    {message.pendingApproval && (
                      <div className="agent-workspace__result">
                        <div>
                          <strong>需要确认</strong>
                          <span>
                            {message.pendingApproval.toolName === 'workflow.applyDraft'
                              ? '确认后才会把修改草案应用到当前画布'
                              : '确认输入项和本次覆盖值后，才会开始运行当前已保存工作流'}
                          </span>
                        </div>
                        {message.pendingApproval.toolName === 'workflow.execute' && (
                          <div className="agent-workspace__approval-inputs">
                            {message.workflowSuggestedInputs && message.workflowSuggestedInputs.length > 0 ? (
                              message.workflowSuggestedInputs.map((item) => (
                                <label key={item.nodeId} className="agent-workspace__approval-input">
                                  <div className="agent-workspace__approval-input-copy">
                                    <strong>{item.label}</strong>
                                    <span>
                                      {item.kind === 'text'
                                        ? '文本输入'
                                        : item.kind === 'image'
                                          ? '图片输入'
                                          : item.kind === 'video'
                                            ? '视频输入'
                                            : item.kind === 'audio'
                                              ? '音频输入'
                                              : '蒙版输入'}
                                      {` · 节点 ${item.nodeId}`}
                                    </span>
                                    <small>当前值：{item.currentValue?.trim() ? item.currentValue : '未设置'}</small>
                                    {item.aliases.length > 0 && (
                                      <small>可匹配别名：{item.aliases.slice(0, 4).join('、')}</small>
                                    )}
                                  </div>
                                  {item.kind === 'text' ? (
                                    <textarea
                                      rows={3}
                                      value={message.approvalValues?.[item.nodeId] || ''}
                                      onChange={(event) =>
                                        updateApprovalValue(message.id, item.nodeId, event.target.value)
                                      }
                                      placeholder={getApprovalInputPlaceholder(item)}
                                      disabled={isWorking}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={message.approvalValues?.[item.nodeId] || ''}
                                      onChange={(event) =>
                                        updateApprovalValue(message.id, item.nodeId, event.target.value)
                                      }
                                      placeholder={getApprovalInputPlaceholder(item)}
                                      disabled={isWorking}
                                    />
                                  )}
                                </label>
                              ))
                            ) : (
                              <div className="agent-workspace__approval-empty">
                                当前工作流没有显式输入节点，本次会按已保存默认值直接运行。
                              </div>
                            )}
                          </div>
                        )}
                        <button type="button" onClick={() => handleApprove(message)} disabled={isWorking}>
                          <Play size={14} />
                          {message.pendingApproval.toolName === 'workflow.applyDraft' ? '确认应用' : '确认运行'}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {isWorking && (
                <article className="agent-workspace__message agent-workspace__message--assistant">
                  <div className="agent-workspace__message-meta">
                    <span className="agent-workspace__message-avatar">
                      <Bot size={14} />
                    </span>
                    <div className="agent-workspace__message-meta-copy">
                      <strong>项目 Agent</strong>
                      <span>正在分析你的需求和当前上下文</span>
                    </div>
                  </div>
                  <div className="agent-workspace__message-body">
                    <div className="agent-workspace__working">
                      <Loader2 size={15} className="agent-workspace__spin" />
                      正在判断任务并调用可用工具...
                    </div>
                  </div>
                </article>
              )}
            </div>
          </section>
        </div>

        <footer className="agent-workspace__composer">
          <div className="agent-workspace__composer-main">
            <div className="agent-workspace__composer-topline">
              <span>继续描述你的目标</span>
              <small>{hasPlannerModel ? 'Enter 发送 · Ctrl / Cmd + Enter 换行' : '启用模型后可开始协作'}</small>
            </div>
            {pendingImages.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {pendingImages.map((image) => {
                  const tone = getPendingImageTone(image);
                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setPendingImagePreview({ imageId: image.id, scope: 'composer' })}
                      style={{
                        position: 'relative',
                        width: 52,
                        height: 52,
                        borderRadius: 14,
                        overflow: 'hidden',
                        border:
                          tone === 'danger'
                            ? '1px solid color-mix(in srgb, var(--color-danger) 35%, var(--color-border))'
                            : tone === 'warning'
                              ? '1px solid color-mix(in srgb, var(--color-warning) 30%, var(--color-border))'
                              : image.role === 'mask'
                                ? '1px solid rgba(255, 255, 255, 0.16)'
                                : primaryReferenceImage?.id === image.id
                                  ? '1px solid rgba(255, 255, 255, 0.22)'
                                  : '1px solid var(--color-border)',
                        background: 'var(--color-bg-secondary)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                      title={`${image.name}\n${getPendingImageStatusLabel(image)}`}
                    >
                      <img
                        src={image.thumbnailUrl || image.url}
                        alt={image.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          left: 6,
                          bottom: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(0, 0, 0, 0.52)',
                          color: '#fff',
                          fontSize: 10,
                          lineHeight: 1,
                        }}
                      >
                        {image.role === 'mask' ? '蒙版' : primaryReferenceImage?.id === image.id ? '主参考' : '参考'}
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          removePendingImage(image.id);
                        }}
                        aria-label={`移除 ${image.name}`}
                        title="移除"
                        style={{
                          position: 'absolute',
                          top: 5,
                          right: 5,
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,0.16)',
                          background: 'rgba(0,0,0,0.58)',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        <X size={10} />
                      </button>
                    </button>
                  );
                })}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                if (event.target.files) void handleAgentImageUpload(Array.from(event.target.files));
                event.target.value = '';
              }}
              style={{ display: 'none' }}
            />
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                  event.preventDefault();
                  handleSubmit();
                  return;
                }
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  const textarea = event.currentTarget;
                  const selectionStart = textarea.selectionStart ?? textarea.value.length;
                  const selectionEnd = textarea.selectionEnd ?? textarea.value.length;
                  const nextValue = `${textarea.value.slice(0, selectionStart)}\n${textarea.value.slice(selectionEnd)}`;
                  setInput(nextValue);
                  requestAnimationFrame(() => {
                    textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
                  });
                }
              }}
              rows={3}
              maxLength={12000}
              placeholder={hasPlannerModel ? STARTER_PROMPT : '请先启用对话模型，Agent 才能开始规划任务'}
            />
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'stretch',
              justifyContent: 'center',
              paddingBottom: 2,
            }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage || isWorking}
              aria-label="上传图片给 Agent"
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                cursor: isUploadingImage || isWorking ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: isUploadingImage || isWorking ? 'none' : '0 5px 14px rgba(0, 0, 0, 0.08)',
                transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
              }}
              onMouseEnter={(event) => {
                if (isUploadingImage || isWorking) return;
                event.currentTarget.style.background = 'var(--color-bg-tertiary)';
                event.currentTarget.style.transform = 'translateY(-1px)';
                event.currentTarget.style.boxShadow = '0 8px 18px rgba(0, 0, 0, 0.10)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'var(--color-bg-secondary)';
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = isUploadingImage || isWorking ? 'none' : '0 5px 14px rgba(0, 0, 0, 0.08)';
              }}
              title={isUploadingImage ? '图片上传中' : '上传图片'}
            >
              {isUploadingImage ? <Loader2 size={16} className="agent-workspace__spin" /> : <Paperclip size={16} />}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              aria-label="发送给 Agent"
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: canSubmit ? 'rgba(255, 255, 255, 0.06)' : 'var(--color-bg-secondary)',
                color: canSubmit ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: canSubmit ? '0 5px 14px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
              }}
              onMouseEnter={(event) => {
                if (!canSubmit) return;
                event.currentTarget.style.background = 'var(--color-bg-tertiary)';
                event.currentTarget.style.transform = 'translateY(-1px)';
                event.currentTarget.style.boxShadow = '0 8px 18px rgba(0, 0, 0, 0.10)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = canSubmit ? 'rgba(255, 255, 255, 0.06)' : 'var(--color-bg-secondary)';
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = canSubmit ? '0 5px 14px rgba(0, 0, 0, 0.08)' : 'none';
              }}
            >
              {isWorking ? <Loader2 size={17} className="agent-workspace__spin" /> : <Send size={17} />}
            </button>
          </div>
        </footer>

        {(latestDraft || latestWorkflowEditPatch) && (
          <div className="agent-workspace__hint">
            {latestWorkflowEditPatch
              ? '最近一次修改草案已生成。你可以继续描述调整要求，或申请把它应用到当前画布。'
              : '最近一次结果已生成。你可以打开画布检查，也可以继续描述修改要求。'}
          </div>
        )}
        {previewImage && (
          <ImagePreviewModal
            src={previewImage}
            images={previewImageIndex >= 0 ? previewImageGallery : [{ src: previewImage }]}
            initialIndex={previewImageIndex >= 0 ? previewImageIndex : 0}
            onClose={() => setPreviewImage(null)}
            onBackfillImage={
              onBackfillImageToCanvas
                ? (image) => {
                    onBackfillImageToCanvas(image);
                    onOpenWorkflow();
                    setPreviewImage(null);
                  }
                : undefined
            }
          />
        )}
        {pendingImagePreview && activePendingImage && (
          <ImagePreviewModal
            src={activePendingImage.url}
            images={pendingImagePreviewGallery}
            initialIndex={pendingImagePreviewIndex >= 0 ? pendingImagePreviewIndex : 0}
            onClose={() => setPendingImagePreview(null)}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  markPendingImageAsPrimary(activePendingImage.id);
                  setPendingImagePreview((prev) => (prev ? { ...prev, imageId: activePendingImage.id } : prev));
                }}
                disabled={activePendingImage.role === 'mask'}
                className="workflow-results__mini-action"
                style={{ opacity: activePendingImage.role === 'mask' ? 0.45 : 1 }}
              >
                {primaryReferenceImage?.id === activePendingImage.id && activePendingImage.role === 'reference'
                  ? '当前主参考图'
                  : '设为主参考图'}
              </button>
              <button
                type="button"
                onClick={() => {
                  togglePendingImageRole(activePendingImage.id);
                  setPendingImagePreview((prev) => (prev ? { ...prev, imageId: activePendingImage.id } : prev));
                }}
                className="workflow-results__mini-action"
              >
                {activePendingImage.role === 'mask' ? '改为参考图' : '设为蒙版'}
              </button>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 12,
                  minHeight: 30,
                }}
              >
                <Circle size={8} fill="currentColor" />
                {getPendingImageStatusLabel(activePendingImage)}
              </span>
            </div>
          </ImagePreviewModal>
        )}
      </div>
    </div>
  );
}
