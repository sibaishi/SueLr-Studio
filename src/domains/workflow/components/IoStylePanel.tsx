import { WorkflowStylePanelShell } from '@/domains/workflow/components/WorkflowStylePanelShell';
import { createThumbnailFromBlob } from '@/domains/workflow/components/flowCanvasHelpers';
import { inferImageThumbnailUrl } from '@/domains/workflow/components/nodes/NodeMedia';
import { resolveStylePanelInput } from '@/domains/workflow/components/stylePanelInputResolver';
import { uploadFile } from '@/domains/workflow/lib/api/files';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import { type InputOrderMap, expandAiV3InputSlots, readInputOrder } from '@/domains/workflow/lib/store/helpers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileRawStore, uploadUrlStore } from './nodes/io/fileRawStore';

const ALLOWED_EXTENSIONS =
  /\.(png|jpg|jpeg|gif|webp|avif|bmp|svg|mp4|webm|mov|mkv|mp3|wav|ogg|aac|flac|txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i;
const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|json|csv|tsv|log|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|yaml|yml)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|avif|bmp|svg)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|mkv)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|aac|flac)$/i;

type FileKind = 'image' | 'video' | 'audio' | 'other';
const KIND_ORDER: Record<FileKind, number> = { image: 0, video: 1, audio: 2, other: 3 };

interface FileThumb {
  _id: number;
  name: string;
  kind: FileKind;
  thumbnail: string;
  objectUrl: string;
  uploadedUrl?: string;
}
type InputThumb = {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio';
  label: string;
  value: string;
  sourceNodeId: string;
  edgeId: string;
};

function isPersistentFileUrl(value: unknown) {
  const str = String(value || '');
  return str.startsWith('/api/files/') || (str.startsWith('http') && !str.startsWith('blob:'));
}

function buildPersistentContentSignature(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value.map((item) => (isPersistentFileUrl(item) ? String(item) : '')).join('\u0001');
}

function buildStringArraySignature(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value.map((item) => String(item || '')).join('\u0001');
}

function classifyFile(file: File): FileKind {
  if (IMAGE_EXTENSIONS.test(file.name) || file.type.startsWith('image/')) return 'image';
  if (VIDEO_EXTENSIONS.test(file.name) || file.type.startsWith('video/')) return 'video';
  if (AUDIO_EXTENSIONS.test(file.name) || file.type.startsWith('audio/')) return 'audio';
  return 'other';
}

function sortFilesByOrder(files: FileThumb[], fileOrder: number[]) {
  const orderMap = new Map(fileOrder.map((id, i) => [id, i]));
  return [...files].sort((a, b) => {
    const kd = (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99);
    if (kd !== 0) return kd;
    const ai = orderMap.get(a._id);
    const bi = orderMap.get(b._id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
}

export default function IoStylePanel() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const nodeOutputs = useWorkflowStore((s) => s.nodeOutputs);

  // Only show panel when exactly one panel-capable node is selected across all types
  const ioNode = (() => {
    const selectedPanelNodes = nodes.filter(
      (n) => n.selected && (n.type === 'io' || n.type === 'aiV3' || n.type === 'materialProcess'),
    );
    if (selectedPanelNodes.length !== 1) return null;
    return selectedPanelNodes[0].type === 'io' ? selectedPanelNodes[0] : null;
  })();
  const selectedNodeId = ioNode?.id;
  const nodeData = (ioNode?.data || {}) as Record<string, unknown>;
  const hasUpstream = !!selectedNodeId && edges.some((e) => e.target === selectedNodeId);

  const [draggedGroupIdx, setDraggedGroupIdx] = useState<number | null>(null);
  const [dragOverGroupIdx, setDragOverGroupIdx] = useState<number | null>(null);
  const [draggedGroupType, setDraggedGroupType] = useState<string | null>(null);
  const [srcDraggedIdx, setSrcDraggedIdx] = useState<number | null>(null);
  const [srcDragOverIdx, setSrcDragOverIdx] = useState<number | null>(null);
  const typeGroupsRef = useRef<typeof inputGroups>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [textValue, setTextValue] = useState('');
  const [files, setFiles] = useState<FileThumb[]>([]);
  // Refs to avoid stale closures in syncTimer (external changes via drop/paste
  // can arrive between effect creation and timer fire)
  const filesRef = useRef(files);
  filesRef.current = files;
  const textValueRef = useRef(textValue);
  textValueRef.current = textValue;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  const setData = useCallback(
    (patch: Record<string, unknown>) => {
      if (selectedNodeId) updateNodeData(selectedNodeId, patch);
    },
    [selectedNodeId, updateNodeData],
  );

  // Detect when data.content is in execution-origin format (text + URLs mixed,
  // no _fileKinds metadata) and needs migration to upstream IO format.
  const needsMigration = useMemo(() => {
    if (hasUpstream) return false;
    const content = nodeData.content;
    if (!Array.isArray(content) || content.length === 0) return false;
    const fileKinds = (nodeData._fileKinds as string[]) || [];
    // Execution-origin data: _fileKinds is empty or shorter than content
    if (fileKinds.length === 0 || fileKinds.length < content.length) return true;
    // Content contains plain-text items mixed with file URLs
    return content.some((item) => {
      const s = String(item);
      return s.trim() && !/^(https?:\/\/|\/api\/|data:|blob:)/.test(s);
    });
  }, [hasUpstream, nodeData.content, nodeData._fileKinds]);

  // Migrate execution-format data.content to upstream IO format:
  // extract text → data.text, split file URLs → data.content with proper _fileKinds.
  const migrateContent = useCallback(() => {
    const content = Array.isArray(nodeData.content) ? (nodeData.content as string[]) : [];
    const files: string[] = [];
    const fileKinds: string[] = [];
    const existingText = String(nodeData.text || '');
    // Discard existing text if it looks like a media URL (leaked from execution)
    const preservedText = /^(https?:\/\/|\/api\/|data:|blob:)/.test(existingText) ? '' : existingText;
    const textParts: string[] = [];

    for (const item of content) {
      const s = String(item);
      if (!s || !s.trim()) continue;
      if (/^(https?:\/\/|\/api\/|data:|blob:)/.test(s)) {
        files.push(s);
        let kind: FileKind = 'image';
        if (s.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(s)) kind = 'video';
        else if (s.startsWith('data:audio/') || /\.(mp3|wav|ogg)(\?|$)/i.test(s)) kind = 'audio';
        fileKinds.push(kind);
      } else {
        textParts.push(s);
      }
    }

    // Prefer text extracted from content; fall back to preserved existing text
    const text = textParts.length > 0 ? textParts.join('\n') : preservedText;

    setData({
      text: text || '',
      content: files,
      _fileIds: [],
      _fileKinds: fileKinds,
      _fileNames: files.map(() => ''),
    });
  }, [nodeData.content, nodeData.text, nodeData._fileKinds, setData]);

  // Run migration when transitioning from midstream to upstream
  useEffect(() => {
    if (needsMigration) migrateContent();
  }, [needsMigration, migrateContent]);

  const buildFilesFromData = useCallback(() => {
    const fileIds: number[] = (nodeData._fileIds as number[]) || [];
    const fileKinds: string[] = (nodeData._fileKinds as string[]) || [];
    const fileNames: string[] = (nodeData._fileNames as string[]) || [];
    const contentArr = Array.isArray(nodeData.content) ? (nodeData.content as string[]) : [];

    // Iterate by _fileIds when available (normal path); fall back to content
    // length for migration path where _fileIds is intentionally empty.
    const count = fileIds.length > 0 ? fileIds.length : contentArr.length;

    return Array.from({ length: count }, (_, idx) => {
      const fid = fileIds[idx] ?? -1;
      const rec = fid >= 0 ? fileRawStore.get(fid) : undefined;
      const entry = contentArr[idx] || '';

      // When content is an empty placeholder (drop/paste before upload completes),
      // we still produce the entry — rendering falls back to objectUrl for thumbnails.
      let kind: FileKind = (fileKinds[idx] as FileKind) || 'other';
      if (kind === 'other') {
        if (entry.startsWith('data:video/') || /\.(mp4|webm|mov)(\?|$)/i.test(entry)) kind = 'video';
        else if (entry.startsWith('data:audio/') || /\.(mp3|wav|ogg)(\?|$)/i.test(entry)) kind = 'audio';
        else kind = 'image';
      }
      return {
        _id: fid,
        name: rec?.name || fileNames[idx] || '',
        kind,
        thumbnail: entry,
        objectUrl: rec?.objectUrl || '',
      };
    }).filter((f) => f._id >= 0 || f.thumbnail) as FileThumb[];
  }, [nodeData._fileIds, nodeData._fileKinds, nodeData._fileNames, nodeData.content]);

  // Initialize local state when the selected node or upstream status changes
  useEffect(() => {
    if (hasUpstream) return;
    setTextValue(String(nodeData.text || ''));
    setFiles(buildFilesFromData());
  }, [selectedNodeId, hasUpstream, nodeData.text, buildFilesFromData]);

  const persistentContentSignature = buildPersistentContentSignature(nodeData.content);
  const fileNamesSignature = buildStringArraySignature(nodeData._fileNames);
  // Include _fileIds length so external additions (e.g. drop/paste on same node) trigger re-sync
  const fileIdsLen = Array.isArray(nodeData._fileIds) ? (nodeData._fileIds as number[]).length : 0;

  useEffect(() => {
    if (hasUpstream) return;
    if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const currentFiles = filesRef.current;
      const currentTextValue = textValueRef.current;
      const currentSelectedNodeId = selectedNodeIdRef.current;
      if (!currentSelectedNodeId) return;

      // Read latest node data from store (not closure) to avoid overwriting
      // content written by addFilesToCanvas or scheduleContentFlush.
      const storeState = useWorkflowStore.getState();
      const latestNode = storeState.nodes.find((n) => n.id === currentSelectedNodeId);
      const latestData = (latestNode?.data || {}) as Record<string, unknown>;
      const existingContent: string[] = Array.isArray(latestData.content) ? (latestData.content as string[]) : [];
      const existingNames: string[] = Array.isArray(latestData._fileNames) ? (latestData._fileNames as string[]) : [];

      const sorted = sortFilesByOrder(currentFiles, (latestData._fileOrder as number[]) || []);
      const fileUrls: string[] = sorted.map((f, i) => {
        const serverUrl = uploadUrlStore.get(f._id);
        if (serverUrl) return serverUrl;
        // Keep existing /api/files/ or http URL if present (survives refresh)
        const prev = existingContent[i];
        if (isPersistentFileUrl(prev)) return prev;
        // Don't persist blob URLs — they break after refresh
        if (f.objectUrl && !f.objectUrl.startsWith('blob:')) return f.objectUrl;
        // Wait for upload to complete; keep previous value or leave empty
        return prev || '';
      });
      const fileNames: string[] = sorted.map((f, i) => {
        if (f.name) return f.name;
        // Preserve existing name from prior save
        const prev = existingNames[i];
        if (prev) return prev;
        return '';
      });
      setData({
        text: currentTextValue || '',
        content: fileUrls,
        _fileIds: sorted.filter((f) => f._id >= 0).map((f) => f._id),
        _fileKinds: sorted.map((f) => f.kind),
        _fileNames: fileNames,
      });
    }, 300);
    return () => {
      if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
    };
  }, [textValue, files, persistentContentSignature, fileNamesSignature, fileIdsLen]);

  // ── file ops ──
  const isTextFile = (file: File) =>
    TEXT_EXTENSIONS.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json';
  const handleFileUpload = async (fileList: FileList) => {
    const newFiles: FileThumb[] = [];
    for (const file of Array.from(fileList)) {
      if (
        !ALLOWED_EXTENSIONS.test(file.name) &&
        !file.type.startsWith('image/') &&
        !file.type.startsWith('video/') &&
        !file.type.startsWith('audio/') &&
        !file.type.startsWith('text/')
      )
        continue;
      if (isTextFile(file)) {
        const text = await file.text();
        setTextValue((prev) => `${prev}${prev ? '\n' : ''}[${file.name}]\n${text}\n`);
        continue;
      }
      const kind = classifyFile(file);
      const thumbnail = kind === 'image' ? await createThumbnailFromBlob(file).catch(() => '') : '';
      const base64 = await new Promise<string>((r) => {
        const reader = new FileReader();
        reader.onload = () => r(String(reader.result));
        reader.readAsDataURL(file);
      });
      const id = fileRawStore.add(file, file.name, base64);
      const entry: FileThumb = {
        _id: id,
        name: file.name,
        kind,
        thumbnail,
        objectUrl: fileRawStore.getObjectUrl(id) || '',
      };
      newFiles.push(entry);
      // Upload to backend for persistence across page refreshes
      uploadFile(file)
        .then((result) => {
          if (result.success && result.url) {
            uploadUrlStore.set(id, result.url);
            // trigger sync timer via files reference change so it picks up the URL
            setFiles((prev) => [...prev]);
          }
        })
        .catch(() => {
          /* upload failed, blob URL fallback is fine */
        });
    }
    if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles]);
  };
  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => {
      const entry = prev[idx];
      if (entry && entry._id >= 0) fileRawStore.remove(entry._id);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  // ═══ V3-STYLE UPSTREAM INPUTS (slot expansion, same as AiV3StylePanel) ═══
  const rawInputs: InputThumb[] = selectedNodeId
    ? expandAiV3InputSlots(selectedNodeId, edges, nodes).map((slot) => {
        const { sourceNode, type: finalType, value } = resolveStylePanelInput(slot, nodes, edges, nodeOutputs);

        const label =
          slot.sourceNodeType === 'io' && slot.type === 'text'
            ? '文本'
            : slot.sourceNodeType === 'io'
              ? `文件${(slot.fileIdx ?? 0) + 1}`
              : sourceNode?.type || '?';

        return {
          id: slot.id,
          type: finalType as InputThumb['type'],
          label,
          value,
          sourceNodeId: slot.sourceNodeId,
          edgeId: slot.edgeId,
        };
      })
    : [];

  const TYPE_ORDER_KEYS = ['text', 'image', 'video', 'audio'] as const;

  // ── type-grouped per-file items (upstream mode) ──
  const inputGroups = useMemo(() => {
    const groups: Record<
      string,
      {
        sourceNodeId: string;
        sourceNodeLabel: string;
        items: { id: string; edgeId: string; value: string; label: string; type: string }[];
      }[]
    > = {};
    const inputOrder = readInputOrder(ioNode);

    // Sort rawInputs: type group order → within type, order by inputOrder[type]
    const edgeOrderMap = new Map<string, number>();
    for (const type of TYPE_ORDER_KEYS) {
      const order = inputOrder[type];
      if (order) order.forEach((eid, i) => edgeOrderMap.set(eid, i));
    }

    for (const type of TYPE_ORDER_KEYS) {
      const typeInputs = rawInputs
        .filter((x) => x.type === type)
        .sort(
          (a, b) =>
            (edgeOrderMap.get(a.edgeId) ?? Number.POSITIVE_INFINITY) -
            (edgeOrderMap.get(b.edgeId) ?? Number.POSITIVE_INFINITY),
        );
      if (typeInputs.length === 0) continue;

      const nodeGroups: (typeof groups)[string] = [];
      let currentGroup: (typeof nodeGroups)[number] | null = null;

      for (const input of typeInputs) {
        if (!currentGroup || currentGroup.sourceNodeId !== input.sourceNodeId) {
          const src = nodes.find((n) => n.id === input.sourceNodeId);
          const srcDef = getNodeDef(src?.type || '');
          const nodeLabel =
            (typeof (src?.data as Record<string, unknown> | undefined)?.label === 'string'
              ? ((src?.data as Record<string, unknown>).label as string)
              : '') ||
            srcDef?.label ||
            input.sourceNodeId;
          currentGroup = { sourceNodeId: input.sourceNodeId, sourceNodeLabel: nodeLabel, items: [] };
          nodeGroups.push(currentGroup);
        }
        currentGroup.items.push({
          id: input.id,
          edgeId: input.edgeId,
          value: input.value,
          label: input.label,
          type: input.type,
        });
      }

      groups[type] = nodeGroups;
    }

    return groups;
  }, [rawInputs, nodes, ioNode]);

  typeGroupsRef.current = inputGroups;

  const handleGroupReorder = useCallback(
    (type: string, fromIdx: number, toIdx: number) => {
      const group = typeGroupsRef.current[type];
      if (!group || group.length === 0 || fromIdx === toIdx) return;
      const reordered = [...group.map((e) => e.items[0]?.edgeId || '')];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      const currentOrder = readInputOrder(ioNode);
      const newOrder: InputOrderMap = {};
      for (const t of TYPE_ORDER_KEYS) {
        if (t === type) newOrder[t] = reordered;
        else if (typeGroupsRef.current[t]) newOrder[t] = typeGroupsRef.current[t].map((e) => e.items[0]?.edgeId || '');
      }
      if (currentOrder._legacy) newOrder._legacy = currentOrder._legacy;

      setData({ inputOrder: newOrder });
    },
    [ioNode, setData],
  );

  // source mode: sort user files (V3-style)
  const fileOrder: number[] = (nodeData._fileOrder as number[]) || [];
  const sortedFiles = useMemo(() => sortFilesByOrder(files, fileOrder), [files, fileOrder]);

  const srcThumbLetter = (f: FileThumb) => {
    const map: Record<string, string> = { image: '图', video: '视', audio: '音', other: '?' };
    return map[f.kind] || '?';
  };

  if (!ioNode) return null;

  // ═══ PANEL ═══
  return (
    <WorkflowStylePanelShell>
      {/* ── 迭代汇总 ── */}
      {hasUpstream && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 1,
          }}
        >
          <button
            type="button"
            className="nodrag"
            onClick={() => setData({ iterationAggregate: !(nodeData.iterationAggregate === true) })}
            title={nodeData.iterationAggregate === true ? '迭代汇总：已开启' : '迭代汇总：已关闭'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: 6,
              border: 'none',
              background: nodeData.iterationAggregate === true
                ? 'color-mix(in srgb, #5E5CE6 18%, transparent)'
                : 'color-mix(in srgb, var(--t-text3) 8%, transparent)',
              color: nodeData.iterationAggregate === true ? '#5E5CE6' : 'var(--t-text3)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            Σ
          </button>
        </div>
      )}
      {/* ── UPSTREAM FILE ITEMS (compact horizontal, all types one line) ── */}
      {hasUpstream &&
        rawInputs.length > 0 &&
        (() => {
          // Flatten all type groups into one array for mixed rendering
          const flatGroups: { type: string; nodeGroup: (typeof inputGroups)[string][number]; gIdx: number }[] = [];
          for (const type of TYPE_ORDER_KEYS) {
            const groups = inputGroups[type];
            if (!groups) continue;
            for (let i = 0; i < groups.length; i++) {
              flatGroups.push({ type, nodeGroup: groups[i], gIdx: i });
            }
          }
          return (
            <div
              className="nodrag"
              style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0 4px', flexWrap: 'wrap', cursor: 'default' }}
            >
              {flatGroups.map(({ type, nodeGroup, gIdx }) => (
                <div
                  key={`${type}-${nodeGroup.sourceNodeId}`}
                  draggable
                  onDragStart={(e) => {
                    setDraggedGroupIdx(gIdx);
                    setDraggedGroupType(type);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (draggedGroupType === type) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverGroupIdx(gIdx);
                    }
                  }}
                  onDragLeave={() => setDragOverGroupIdx(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedGroupIdx !== null && draggedGroupType === type && draggedGroupIdx !== gIdx)
                      handleGroupReorder(type, draggedGroupIdx, gIdx);
                    setDraggedGroupIdx(null);
                    setDragOverGroupIdx(null);
                    setDraggedGroupType(null);
                  }}
                  onDragEnd={() => {
                    setDraggedGroupIdx(null);
                    setDragOverGroupIdx(null);
                    setDraggedGroupType(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px 3px 4px',
                    borderRadius: 10,
                    background:
                      dragOverGroupIdx === gIdx && draggedGroupType === type ? 'var(--t-border)' : 'var(--t-bg2)',
                    border: '1px solid var(--t-border)',
                    cursor: 'grab',
                    opacity: draggedGroupIdx === gIdx && draggedGroupType === type ? 0.4 : 1,
                    transition: 'background 120ms ease, opacity 120ms ease',
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-text3)', flexShrink: 0 }}>
                    {type === 'image'
                      ? '图'
                      : type === 'video'
                        ? '视'
                        : type === 'audio'
                          ? '音'
                          : type === 'text'
                            ? '文'
                            : type}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      color: 'var(--t-text3)',
                      whiteSpace: 'nowrap',
                      maxWidth: 56,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      flexShrink: 0,
                    }}
                  >
                    {nodeGroup.sourceNodeLabel}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {nodeGroup.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          background: 'var(--t-bg)',
                          overflow: 'hidden',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--t-border)',
                        }}
                        title={item.type === 'text' ? item.value : item.label}
                      >
                        {(item.type === 'image' || item.type === 'video') && item.value ? (
                          <img
                            src={inferImageThumbnailUrl(item.value) || item.value}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : item.type === 'text' ? (
                          <span
                            style={{
                              fontSize: 8,
                              lineHeight: 1.2,
                              color: 'var(--t-text2)',
                              padding: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {String(item.value || '').slice(0, 30)}
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--t-text3)' }}>
                            {item.type === 'video' ? '🎬' : item.type === 'audio' ? '🎵' : '?'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

      {/* ── SOURCE MODE: user-uploaded file chips ── */}
      {!hasUpstream && (
        <div
          className="nodrag"
          style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '0 4px', flexWrap: 'wrap' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileUpload(e.dataTransfer.files);
          }}
        >
          {sortedFiles.map((f, idx) => (
            <div
              key={f._id >= 0 ? f._id : `p${idx}`}
              draggable
              onDragStart={(e) => {
                setSrcDraggedIdx(idx);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(f._id));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setSrcDragOverIdx(idx);
              }}
              onDragLeave={() => setSrcDragOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (srcDraggedIdx !== null && srcDraggedIdx !== idx) {
                  const current = sortedFiles;
                  if (current.length > 0) {
                    const reordered = current.map((x) => x._id);
                    const [moved] = reordered.splice(srcDraggedIdx, 1);
                    reordered.splice(idx, 0, moved);
                    setData({ _fileOrder: reordered });
                  }
                  setSrcDraggedIdx(null);
                  setSrcDragOverIdx(null);
                } else {
                  setSrcDraggedIdx(null);
                  setSrcDragOverIdx(null);
                }
              }}
              onDragEnd={() => {
                setSrcDraggedIdx(null);
                setSrcDragOverIdx(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 4px',
                borderRadius: 10,
                background: srcDragOverIdx === idx ? 'var(--t-border)' : 'var(--t-bg2)',
                border: '1px solid var(--t-border)',
                cursor: 'grab',
                fontSize: 11,
                color: 'var(--t-text2)',
                opacity: srcDraggedIdx === idx ? 0.4 : 1,
                transition: 'background 120ms ease, opacity 120ms ease',
              }}
              title={f.name || '暂无内容（拖动可调整顺序）'}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: 'var(--t-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {(f.kind === 'image' || f.kind === 'video') && (f.objectUrl || f.thumbnail) ? (
                  <img
                    src={f.objectUrl || f.thumbnail}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 700 }}>{srcThumbLetter(f)}</span>
                )}
              </div>
              <span style={{ maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.name ? `${f.name.slice(0, 1)}…` : '?'}
              </span>
              <button
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const realIdx = files.findIndex((x) => x._id === f._id);
                  if (realIdx >= 0) removeFile(realIdx);
                }}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--t-text3)',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 2,
                }}
                title="移除"
              >
                ×
              </button>
            </div>
          ))}
          {/* + add files chip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px 3px 4px',
              borderRadius: 10,
              background: 'transparent',
              border: '1px dashed var(--t-border)',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--t-text3)',
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed var(--t-border)',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, color: 'var(--t-text3)' }}>+</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--t-text3)' }}>添加文件</span>
          </div>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,text/*,.json,.csv,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.php,.rb,.sh,.bat,.ps1,.yaml,.yml,.md,.log"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) handleFileUpload(e.target.files);
        }}
      />

      {/* ── Text area ── */}
      {!hasUpstream && (
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
          <textarea
            className="nodrag nowheel"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder="输入文本内容..."
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              height: '100%',
              resize: 'none',
              border: '1px solid var(--t-border)',
              borderRadius: 15,
              outline: 'none',
              background: 'var(--t-bg2)',
              color: 'var(--t-text)',
              fontSize: 13,
              lineHeight: 1.6,
              padding: '10px 14px',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      {/* ── Upstream locked indicator ── */}
      {hasUpstream && (
        <div style={{ padding: '4px 10px', fontSize: 11, color: 'var(--t-text3)' }}>
          上游 {rawInputs.length} 项数据，锁定中
        </div>
      )}
    </WorkflowStylePanelShell>
  );
}
