import type { LibraryAsset } from './api/assets';
import { uploadFile } from './api/files';
import { resolveWorkflowConnections } from './executionGraph';
import { useWorkflowStore } from './store';
import { isNodeLockedWithAncestors } from './store/editorShared';
import { fileRawStore } from '../components/nodes/io/fileRawStore';

const mediaTypes = ['image', 'video', 'audio'];
const extensions = {
  image: /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic)$/i,
  video: /\.(mp4|webm|mov|m4v)$/i,
  audio: /\.(mp3|wav|ogg|flac|m4a|aac)$/i,
};

export async function readLibraryFile(asset: LibraryAsset) {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error('无法读取资产文件。');
  const blob = await response.blob();
  return new File([blob], asset.name, { type: asset.mimeType || blob.type });
}

export async function addIoFiles(nodeId: string, sources: (File | LibraryAsset)[]) {
  const documentId = useWorkflowStore.getState().activeDocumentId;
  function getTarget() {
    const state = useWorkflowStore.getState();
    const node = state.nodes.find(({ id }) => id === nodeId);
    if (
      state.activeDocumentId !== documentId ||
      node?.type !== 'io' ||
      isNodeLockedWithAncestors(nodeId, state.nodes) ||
      resolveWorkflowConnections(state.nodes, state.edges).some(({ target }) => target === nodeId)
    ) {
      throw new Error('目标 IO 节点已不可添加文件。');
    }
    return { state, node };
  }
  getTarget();

  const text: string[] = [];
  const media: { url: string; kind: string; name: string }[] = [];
  for (const source of sources) {
    if (!(source instanceof File)) {
      if (mediaTypes.includes(source.type)) {
        media.push({ url: source.url, kind: source.type, name: source.name });
        continue;
      }
      if (source.type !== 'text' && source.type !== 'data') throw new Error('IO 支持图片、视频、音频和文本文件。');
      const file = await readLibraryFile(source);
      text.push(`[${file.name}]\n${await file.text()}`);
      continue;
    }
    const kind = (Object.keys(extensions) as (keyof typeof extensions)[]).find(
      (type) => source.type.startsWith(`${type}/`) || extensions[type].test(source.name),
    );
    if (!kind) {
      if (
        !source.type.startsWith('text/') &&
        !/\.(txt|md|json|csv|tsv|xml|html|css|js|tsx?|jsx|py|java|c|cpp|h|hpp|cs|go|rs|php|rb|sh|bat|ps1|ya?ml|log)$/i.test(
          source.name,
        )
      ) {
        throw new Error(`IO 不支持文件「${source.name}」。`);
      }
      text.push(`[${source.name}]\n${await source.text()}`);
      continue;
    }
    const result = await uploadFile(source);
    if (!result.success || !result.url) throw new Error(result.error || '上传文件失败。');
    media.push({ url: result.url, kind, name: source.name });
  }
  const { state, node } = getTarget();
  const patch: Record<string, unknown> = {};
  if (text.length) patch.text = [node.data.text, ...text].filter(Boolean).join('\n');
  if (media.length) {
    const content = Array.isArray(node.data.content) ? node.data.content : [];
    const oldIds = Array.isArray(node.data._fileIds) ? node.data._fileIds : [];
    const oldKinds = Array.isArray(node.data._fileKinds) ? node.data._fileKinds : [];
    const oldNames = Array.isArray(node.data._fileNames) ? node.data._fileNames : [];
    const oldOrder = Array.isArray(node.data._fileOrder) ? node.data._fileOrder : [];
    const count = Math.max(content.length, oldIds.length);
    const ids = Array.from({ length: count }, (_, index) => oldIds[index] ?? fileRawStore.reserveId());
    const newIds = media.map(() => fileRawStore.reserveId());
    patch.content = [
      ...Array.from({ length: count }, (_, index) => content[index] ?? ''),
      ...media.map(({ url }) => url),
    ];
    patch._fileIds = [...ids, ...newIds];
    patch._fileKinds = [
      ...Array.from({ length: count }, (_, index) => oldKinds[index] ?? ''),
      ...media.map(({ kind }) => kind),
    ];
    patch._fileNames = [
      ...Array.from({ length: count }, (_, index) => oldNames[index] ?? ''),
      ...media.map(({ name }) => name),
    ];
    patch._fileOrder = [...new Set([...oldOrder.filter((id) => ids.includes(id)), ...ids]), ...newIds];
  }
  state.updateNodeData(nodeId, patch);
}
