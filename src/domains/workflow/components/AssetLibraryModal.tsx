import { MediaPlayer } from '@/ui/MediaPlayer';
import { DialogCloseButton, DialogHeader } from '@/ui/DialogPrimitives';
import { Button, Checkbox, Select, TextInput } from '@/ui/FormPrimitives';
import { IconButton } from '@/ui/CanvasPrimitives';
import { Badge, Eyebrow } from '@/ui/PanelPrimitives';
import { StatusNotice } from '@/ui/FeedbackPrimitives';
import { SearchInput } from '@/ui/MenuPrimitives';
import { ModalSurface } from '@/ui/ModalSurface';
import { CheckSquare, FolderOpen, MagnifyingGlass, Square, Star, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AssetBatchChange,
  type AssetMetadata,
  type AssetPage,
  type LibraryAsset,
  fetchAssets,
  mutateAssetBatch,
  removeAsset,
  updateAsset,
} from '../lib/api/assets';
import { uploadFile } from '../lib/api/files';
import { archiveLimit, downloadArchive, readArchiveAsset, safeArchiveName } from '../lib/fileArchive';
import { isNodeLockedWithAncestors } from '../lib/store/editorShared';
import { useWorkflowStore } from '../lib/store';
import { ImagePreviewModal } from './ImagePreviewModal';
import './asset-library.css';

const types = { image: '图片', video: '视频', audio: '音频', text: '文本', data: '数据', file: '文件' };
const maxTextAssetSize = 2 * 1024 * 1024;
const emptyPage: AssetPage = { items: [], total: 0, page: 1, pageSize: 48, categories: [], libraryTotal: 0 };

function parseTags(value: string) {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function validTags(tags: string[]) {
  return tags.length <= 20 && tags.every((tag) => tag.length <= 40);
}

type AssetLibraryProps = {
  onClose: () => void;
  position: { x: number; y: number };
  onPick?: (asset: LibraryAsset) => Promise<void>;
  pickType?: LibraryAsset['type'];
};

type AssetResult<T = unknown> = { success: boolean; data?: T; error?: string };
export type AssetLibrarySource = {
  list: (query: URLSearchParams, signal: AbortSignal) => Promise<AssetResult<AssetPage>>;
  upload: (file: File) => Promise<AssetResult>;
  update: (id: string, patch: Partial<AssetMetadata>) => Promise<AssetResult<LibraryAsset>>;
  remove: (id: string) => Promise<AssetResult>;
  batch: (ids: string[], change: AssetBatchChange) => Promise<AssetResult<{ count: number }>>;
};

const projectSource: AssetLibrarySource = {
  list: fetchAssets,
  upload: uploadFile,
  update: updateAsset,
  remove: removeAsset,
  batch: mutateAssetBatch,
};

async function backfillProjectAsset(asset: LibraryAsset, position: AssetLibraryProps['position'], targetId?: string) {
  const documentId = useWorkflowStore.getState().activeDocumentId;
  let text = '';
  if (asset.type === 'text' || asset.type === 'data') {
    if (asset.size > maxTextAssetSize) throw new Error('文本超过 2 MB，请下载后选取需要的内容');
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error('资产文件无法读取，请刷新后重试');
    text = await response.text();
  }
  const store = useWorkflowStore.getState();
  const offset = (store.nodes.length % 8) * 30;
  const media = ['image', 'video', 'audio'].includes(asset.type);
  if (store.activeDocumentId !== documentId) throw new Error('工作流已切换，请重新回填。');
  const patch = {
    text,
    fileUrl: '',
    content: media ? [asset.url] : [],
    _fileIds: [],
    _fileOrder: [],
    _fileKinds: media ? [asset.type] : [],
    _fileNames: media ? [asset.name] : [],
  };
  if (targetId) {
    const target = store.nodes.find((node) => node.id === targetId);
    if (
      target?.type !== 'io' ||
      isNodeLockedWithAncestors(targetId, store.nodes) ||
      store.edges.some((edge) => edge.target === targetId)
    ) {
      throw new Error('选中的 IO 已不可回填。');
    }
    store.updateNodeData(targetId, patch);
  }
  const nodeId = targetId ?? store.addNode('io', { x: position.x - 160 + offset, y: position.y - 100 + offset }, patch);
  store.selectNode(nodeId);
}

export default function AssetLibraryModal({ position, ...props }: AssetLibraryProps) {
  const lastExecutionTime = useWorkflowStore((state) => state.lastExecutionTime);
  const selectedIoId = useWorkflowStore((state) => {
    const selectedNodes = state.nodes.filter((node) => node.selected);
    const target = selectedNodes[0];
    return selectedNodes.length === 1 &&
      target.type === 'io' &&
      !isNodeLockedWithAncestors(target.id, state.nodes) &&
      !state.edges.some((edge) => edge.target === target.id)
      ? target.id
      : undefined;
  });
  return (
    <AssetLibraryView
      {...props}
      sourceApi={projectSource}
      lastExecutionTime={lastExecutionTime}
      selectedIoId={selectedIoId}
      onBackfill={(asset, id) => backfillProjectAsset(asset, position, id)}
    />
  );
}

export function AssetLibraryView({
  onClose,
  onPick,
  pickType,
  sourceApi,
  lastExecutionTime,
  selectedIoId,
  onBackfill,
  theme,
}: Omit<AssetLibraryProps, 'position'> & {
  sourceApi: AssetLibrarySource;
  lastExecutionTime?: number | null;
  selectedIoId?: string;
  onBackfill: (asset: LibraryAsset, targetId?: string) => Promise<void>;
  theme?: 'dark' | 'light';
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(emptyPage);
  const [selected, setSelected] = useState<LibraryAsset | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const restorePreviewFocus = useRef(false);
  const closePreview = useCallback(() => {
    restorePreviewFocus.current = true;
    setPreviewOpen(false);
  }, []);

  useEffect(() => {
    if (!previewOpen && restorePreviewFocus.current) {
      restorePreviewFocus.current = false;
      previewTrigger.current?.focus();
    }
  }, [previewOpen]);

  const [batchMode, setBatchMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const batchAssets = data.items.filter((asset) => checkedIds.has(asset.id));
  const batchIds = batchAssets.map((asset) => asset.id);
  const allChecked = batchIds.length > 0 && batchIds.length === data.items.length;
  const previewAsset = previewOpen ? selected : null;

  useEffect(() => {
    setCheckedIds(new Set());
  }, [search, type, source, category, favorite, page]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const result = await sourceApi.list(
        new URLSearchParams({
          search,
          type: pickType ?? type,
          source,
          category,
          favorite: favorite ? 'true' : 'all',
          page: String(page),
        }),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setLoading(false);
      if (result.success && result.data) {
        const nextPage = result.data;
        setData(nextPage);
        setCheckedIds(
          (current) => new Set(nextPage.items.filter((asset) => current.has(asset.id)).map((asset) => asset.id)),
        );
        setLoadError('');
      } else setLoadError(result.error || '读取资产库失败');
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search, type, source, category, favorite, page, pickType, revision, lastExecutionTime, sourceApi]);

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setNotice('');
    setError('');
    let imported = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      const result = await sourceApi.upload(file);
      if (result.success) imported++;
      else failures.push(`${file.name}：${result.error || '导入失败'}`);
    }
    setBusy(false);
    setNotice(`已导入 ${imported} 个素材`);
    setError(failures.join('；'));
    setRevision((v) => v + 1);
  }

  async function toggleFavorite(asset: LibraryAsset) {
    setBusy(true);
    const result = await sourceApi.update(asset.id, { favorite: !asset.favorite });
    setBusy(false);
    if (!result.success) {
      setError(result.error || '收藏失败');
      return;
    }
    if (selected?.id === asset.id && result.data) setSelected(result.data);
    setRevision((v) => v + 1);
  }

  async function deleteAsset(asset: LibraryAsset) {
    setBusy(true);
    setError('');
    setNotice('');
    const result = await sourceApi.remove(asset.id);
    setBusy(false);
    if (!result.success) {
      setError(result.error || '删除资产失败');
      return;
    }
    setSelected((current) => (current?.id === asset.id ? null : current));
    setNotice('已从资产库删除');
    setRevision((v) => v + 1);
  }

  function toggleBatchSelection(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBatch(change: AssetBatchChange) {
    if (!batchIds.length || busy || loading) return;
    setBusy(true);
    setNotice('');
    setError('');
    const result = await sourceApi.batch(batchIds, change);
    setBusy(false);
    setRevision((value) => value + 1);
    if (!result.success || !result.data) {
      setError(result.error || '批量操作失败');
      return;
    }
    setCheckedIds(new Set());
    setNotice(
      change.action === 'remove' ? `已从资产库删除 ${result.data.count} 个资产` : `已更新 ${result.data.count} 个资产`,
    );
  }

  async function downloadSelection() {
    setBusy(true);
    setError('');
    try {
      let remaining = archiveLimit;
      const entries: Record<string, Uint8Array> = Object.create(null);
      for (const [index, asset] of batchAssets.entries()) {
        const blob = await readArchiveAsset(asset.url, remaining);
        remaining -= blob.size;
        entries[`${index + 1}-${safeArchiveName(asset.originalName)}`] = new Uint8Array(await blob.arrayBuffer());
      }
      downloadArchive(entries, 'SueLr-资产.zip');
    } catch (error) {
      setError(error instanceof Error ? error.message : '批量下载失败');
    } finally {
      setBusy(false);
    }
  }

  async function backfill(asset: LibraryAsset, targetId?: string) {
    setBusy(true);
    setError('');
    try {
      await onBackfill(asset, targetId);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '回填失败');
    } finally {
      setBusy(false);
    }
  }

  const library = (
    <ModalSurface
      ariaLabel={onPick ? '从资产库添加文件' : '资产库'}
      inactive={Boolean(previewAsset)}
      onClose={onClose}
      size="workspace"
      rootClassName="asset-library-overlay"
      panelClassName="asset-library"
      backdropLabel="关闭资产库"
      rootProps={{
        ...(onPick ? { 'data-workflow-modal-overlay': '' } : {}),
        ...(theme ? { 'data-theme': theme } : {}),
      }}
      isolateKeyboard
    >
      <DialogHeader
        className="asset-library__header modal-inset-panel"
        eyebrow="Asset Library"
        title="资产库"
        badge={<Badge>{data.libraryTotal} 个资产</Badge>}
        description="上传素材与生成结果，集中整理、反复复用。"
        actions={
          <>
            <Button small variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? '处理中…' : '导入素材'}
            </Button>
            <Button small variant="secondary" disabled={loading} onClick={() => setRevision((v) => v + 1)}>
              刷新
            </Button>
            <DialogCloseButton label="关闭资产库" onClick={onClose} />
          </>
        }
      />
      <input
        ref={inputRef}
        data-testid="asset-import"
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg,audio/*"
        hidden
        onChange={(event) => {
          void importFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="asset-library__filters modal-inset-panel">
        <SearchInput
          className="asset-library__search"
          icon={<MagnifyingGlass size={14} />}
          aria-label="搜索资产"
          placeholder="搜索名称、分类、标签…"
          value={search}
          maxLength={200}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="资产类型"
          value={pickType ?? type}
          disabled={Boolean(pickType)}
          onChange={(value) => {
            setType(value);
            setPage(1);
          }}
        >
          <option value="all">全部类型</option>
          {Object.entries(types).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="资产来源"
          value={source}
          onChange={(value) => {
            setSource(value);
            setPage(1);
          }}
        >
          <option value="all">全部来源</option>
          <option value="uploaded">上传素材</option>
          <option value="generated">生成结果</option>
        </Select>
        <Select
          aria-label="资产分类"
          value={category}
          onChange={(value) => {
            setCategory(value);
            setPage(1);
          }}
        >
          <option value="">全部分类</option>
          {[...new Set([...data.categories, category].filter(Boolean))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Button
          variant="secondary"
          small
          aria-pressed={favorite}
          onClick={() => {
            setFavorite(!favorite);
            setPage(1);
          }}
        >
          <Star weight={favorite ? 'fill' : 'regular'} />
          仅收藏
        </Button>
      </div>
      {(error || loadError) && (
        <StatusNotice tone="error" role="alert">
          {error || loadError}
        </StatusNotice>
      )}
      {notice && <StatusNotice role="status">{notice}</StatusNotice>}
      <div className="asset-library__body">
        <main className="asset-library__results modal-inset-panel" aria-busy={loading}>
          <div className="asset-library__section-heading">
            <div>
              <div className="asset-library__eyebrow">素材浏览</div>
              <h3>全部资产</h3>
            </div>
            {!onPick && (
              <div className="asset-library__batch-controls">
                {batchMode && (
                  <Button
                    variant="secondary"
                    small
                    disabled={loading || busy || !data.items.length}
                    onClick={() => setCheckedIds(allChecked ? new Set() : new Set(data.items.map((asset) => asset.id)))}
                  >
                    {allChecked ? '取消全选' : '全选本页'}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  small
                  disabled={busy}
                  onClick={() => {
                    setBatchMode(!batchMode);
                    setCheckedIds(new Set());
                    setSelected(null);
                  }}
                >
                  {batchMode ? '退出多选' : '多选'}
                </Button>
              </div>
            )}
          </div>
          {loading ? (
            <p className="asset-library__empty">正在读取资产…</p>
          ) : data.items.length === 0 ? (
            <p className="asset-library__empty">
              {data.libraryTotal
                ? '没有符合条件的资产，试试调整筛选。'
                : '还没有资产。导入素材或运行工作流后，它们会出现在这里。'}
            </p>
          ) : (
            <div className="asset-library__grid">
              {data.items.map((asset) => (
                <article
                  key={asset.id}
                  className={`asset-library__card ${(batchMode ? checkedIds.has(asset.id) : selected?.id === asset.id) ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="asset-library__select"
                    aria-label={batchMode ? `选择 ${asset.name}` : `查看 ${asset.name}`}
                    aria-pressed={batchMode ? checkedIds.has(asset.id) : undefined}
                    disabled={batchMode && busy}
                    onClick={() => (batchMode ? toggleBatchSelection(asset.id) : setSelected(asset))}
                  >
                    {batchMode && (
                      <span className="asset-library__batch-check" aria-hidden="true">
                        {checkedIds.has(asset.id) ? <CheckSquare size={18} weight="fill" /> : <Square size={18} />}
                      </span>
                    )}
                    <div className="asset-library__thumbnail">
                      {asset.type === 'image' ? (
                        <img
                          src={asset.thumbnailUrl || asset.url}
                          alt={asset.name}
                          loading="lazy"
                          onError={(e) => {
                            if (e.currentTarget.getAttribute('src') !== asset.url) e.currentTarget.src = asset.url;
                          }}
                        />
                      ) : (
                        <span>{types[asset.type]}</span>
                      )}
                    </div>
                    <strong title={asset.name}>{asset.name}</strong>
                    <small>
                      {asset.source === 'uploaded' ? '上传素材' : '生成结果'} · {asset.category || '未分类'}
                    </small>
                  </button>
                  {!batchMode && (
                    <IconButton
                      compact
                      className="asset-library__favorite"
                      disabled={busy}
                      label={`${asset.favorite ? '取消收藏' : '收藏'} ${asset.name}`}
                      pressed={asset.favorite}
                      onClick={() => void toggleFavorite(asset)}
                      icon={<Star size={18} weight={asset.favorite ? 'fill' : 'regular'} />}
                    />
                  )}
                </article>
              ))}
            </div>
          )}
          <footer className="asset-library__pagination">
            <span>共 {data.total} 个匹配资产</span>
            <Button
              small
              variant="secondary"
              disabled={loading || data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              上一页
            </Button>
            <span>
              {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <Button
              small
              variant="secondary"
              disabled={loading || data.page * data.pageSize >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              下一页
            </Button>
          </footer>
        </main>
        <aside className="asset-library__details modal-inset-panel">
          <div className="asset-library__details-heading">
            <div>
              <div className="asset-library__eyebrow">资产详情</div>
              <h3>{batchMode ? '批量操作' : '预览与整理'}</h3>
            </div>
            {selected && (
              <IconButton compact label="清除资产选择" icon={<X size={16} />} onClick={() => setSelected(null)} />
            )}
          </div>
          {batchMode && (
            <AssetBatchDetails
              key={batchIds.join(',')}
              count={batchIds.length}
              disabled={busy || loading}
              onApply={(change) => void applyBatch(change)}
              onDownload={() => void downloadSelection()}
            />
          )}
          {selected && onPick && (
            <div className="asset-library__details-empty">
              <strong>{selected.name}</strong>
              <Button
                small
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await onPick(selected);
                    onClose();
                  } catch (failure) {
                    setError(failure instanceof Error ? failure.message : '无法添加文件');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                添加所选文件
              </Button>
            </div>
          )}
          {selected && !onPick && (
            <AssetDetails
              key={selected.id}
              asset={selected}
              previewTrigger={previewTrigger}
              onOpenPreview={() => setPreviewOpen(true)}
              busy={busy}
              categories={data.categories}
              onBackfill={() => void backfill(selected)}
              onBackfillSelected={selectedIoId ? () => void backfill(selected, selectedIoId) : undefined}
              onDelete={() => void deleteAsset(selected)}
              onSave={async (name, nextCategory, tags) => {
                if (!validTags(tags)) {
                  setError('标签最多 20 个，每个最多 40 字符');
                  return;
                }
                setError('');
                setBusy(true);
                const result = await sourceApi.update(selected.id, { name, category: nextCategory, tags });
                setBusy(false);
                if (!result.success || !result.data) {
                  setError(result.error || '保存失败');
                  return;
                }
                setSelected(result.data);
                setNotice('整理信息已保存');
                setRevision((v) => v + 1);
              }}
            />
          )}
          {!selected && !batchMode && (
            <div className="asset-library__details-empty">
              <FolderOpen size={32} />
              <strong>选择一个资产</strong>
              <p>
                {onPick ? '在左侧选择要添加的文件。' : '在左侧选择素材，预览内容、整理分类和标签，或回填画布继续创作。'}
              </p>
            </div>
          )}
        </aside>
      </div>
    </ModalSurface>
  );

  return (
    <>
      {library}
      {previewAsset && (
        <ImagePreviewModal
          theme={theme}
          src={previewAsset.url}
          alt={previewAsset.name}
          closeLabel="关闭大图"
          overlayClassName="asset-library-image-preview"
          onClose={closePreview}
        />
      )}
    </>
  );
}

function AssetBatchDetails({
  count,
  disabled,
  onApply,
  onDownload,
}: {
  count: number;
  disabled: boolean;
  onApply: (change: AssetBatchChange) => void;
  onDownload: () => void;
}) {
  const [editCategory, setEditCategory] = useState(false);
  const [editTags, setEditTags] = useState(false);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nextTags = parseTags(tags);
  const tagsInvalid = editTags && !validTags(nextTags);

  return (
    <div className="asset-library__details-content asset-library__batch-details">
      <p>本页已选 {count} 项</p>
      {count > 0 && (
        <Button small variant="secondary" disabled={disabled} onClick={onDownload}>
          下载所选资产
        </Button>
      )}
      {count > 0 &&
        (confirmDelete ? (
          <div className="asset-library__delete-confirm" role="group" aria-label="确认批量删除">
            <p>从资产库删除这 {count} 项？原文件和画布引用会保留。</p>
            <div>
              <Button small variant="secondary" disabled={disabled} onClick={() => setConfirmDelete(false)}>
                取消
              </Button>
              <Button small variant="danger" disabled={disabled} onClick={() => onApply({ action: 'remove' })}>
                确认批量删除
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onApply({
                action: 'edit',
                patch: { ...(editCategory && { category: category.trim() }), ...(editTags && { tags: nextTags }) },
              });
            }}
          >
            <label className="asset-library__batch-option">
              <Checkbox checked={editCategory} disabled={disabled} onChange={setEditCategory} />
              修改分类
            </label>
            {editCategory && (
              <TextInput
                aria-label="批量分类"
                placeholder="新分类，留空清除"
                maxLength={60}
                value={category}
                disabled={disabled}
                onChange={setCategory}
              />
            )}
            <label className="asset-library__batch-option">
              <Checkbox checked={editTags} disabled={disabled} onChange={setEditTags} />
              替换标签
            </label>
            {editTags && (
              <TextInput
                aria-label="批量标签"
                placeholder="逗号分隔，留空清除"
                value={tags}
                disabled={disabled}
                onChange={setTags}
              />
            )}
            {tagsInvalid && (
              <StatusNotice tone="error" role="alert">
                标签最多 20 个，每个最多 40 字符
              </StatusNotice>
            )}
            <Button small type="submit" disabled={disabled || tagsInvalid || (!editCategory && !editTags)}>
              保存批量编辑
            </Button>
            <Button small variant="danger" disabled={disabled} onClick={() => setConfirmDelete(true)}>
              批量删除
            </Button>
          </form>
        ))}
    </div>
  );
}

function TextAssetPreview({ url, size }: { url: string; size: number }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const tooLarge = size > maxTextAssetSize;

  useEffect(() => {
    if (tooLarge) return;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('资产文件无法读取');
        const text = await response.text();
        if (!controller.signal.aborted) setContent(text);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }

    void load();
    return () => controller.abort();
  }, [url, tooLarge]);

  if (tooLarge) return <span>文件超过 2 MB，请下载查看</span>;
  if (error) return <span role="alert">无法读取文件，请重新选择资产后重试</span>;
  if (content === null) return <span role="status">正在读取文本…</span>;
  if (content === '') return <span>文件为空</span>;

  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable preview needs keyboard focus.
    <pre className="asset-library__preview-text" aria-label="文本预览" role="region" tabIndex={0}>
      {content}
    </pre>
  );
}

function AssetDetails({
  asset,
  previewTrigger,
  onOpenPreview,
  busy,
  categories,
  onSave,
  onBackfill,
  onBackfillSelected,
  onDelete,
}: {
  asset: LibraryAsset;
  previewTrigger: React.Ref<HTMLButtonElement>;
  onOpenPreview: () => void;
  busy: boolean;
  categories: string[];
  onSave: (name: string, category: string, tags: string[]) => Promise<void>;
  onBackfill: () => void;
  onBackfillSelected?: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category);
  const [tags, setTags] = useState(asset.tags.join('，'));
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <div className="asset-library__details-content">
        <div className="asset-library__preview">
          {asset.type === 'image' ? (
            <button
              ref={previewTrigger}
              type="button"
              className="asset-library__preview-image"
              aria-label="查看大图"
              title="查看大图"
              disabled={busy}
              onClick={onOpenPreview}
            >
              <img src={asset.url} alt={asset.name} />
            </button>
          ) : asset.type === 'video' ? (
            <MediaPlayer kind="video" src={asset.url} />
          ) : asset.type === 'audio' ? (
            <MediaPlayer kind="audio" src={asset.url} />
          ) : asset.type === 'text' || asset.type === 'data' ? (
            <TextAssetPreview key={asset.url} url={asset.url} size={asset.size} />
          ) : (
            <span>{types[asset.type]}</span>
          )}
        </div>
        <p className="asset-library__meta">
          {types[asset.type]} · {(asset.size / 1024).toFixed(1)} KB
          <br />
          {new Date(asset.modifiedAt).toLocaleString()}
          <br />
          <span title={asset.originalName}>原始名称：{asset.originalName}</span>
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSave(name.trim(), category.trim(), parseTags(tags));
          }}
        >
          <label>
            资产名称
            <TextInput required aria-label="资产名称" maxLength={200} value={name} onChange={setName} />
          </label>
          <label>
            分类
            <TextInput
              aria-label="编辑分类"
              list="asset-categories"
              maxLength={60}
              placeholder="例如：参考素材"
              value={category}
              onChange={setCategory}
            />
          </label>
          <datalist id="asset-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label>
            标签
            <TextInput aria-label="资产标签" placeholder="用逗号分隔，最多 20 个" value={tags} onChange={setTags} />
          </label>
          <Button small variant="secondary" type="submit" disabled={busy || !name.trim()}>
            保存整理信息
          </Button>
        </form>
      </div>
      <div className="asset-library__detail-actions">
        <Eyebrow>资产操作</Eyebrow>
        <Button small disabled={busy || asset.type === 'file'} onClick={onBackfill}>
          回填画布
        </Button>
        {onBackfillSelected && (
          <Button small variant="secondary" disabled={busy || asset.type === 'file'} onClick={onBackfillSelected}>
            替换选中 IO 的内容
          </Button>
        )}
        <a className="asset-library__download" href={asset.url} download={asset.originalName}>
          下载原文件
        </a>
        {confirmDelete ? (
          <div className="asset-library__delete-confirm" role="group" aria-label="确认删除资产">
            <p>从资产库删除「{asset.name}」？原文件和画布引用会保留。</p>
            <div>
              <Button small variant="secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>
                取消
              </Button>
              <Button small variant="danger" disabled={busy} onClick={onDelete}>
                确认删除
              </Button>
            </div>
          </div>
        ) : (
          <Button small variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            删除资产
          </Button>
        )}
      </div>
    </>
  );
}
