import { eyebrowStyle, mutedPanelStyle } from '@/features/settings/components/styles';
import { ModalSurface } from '@/ui/ModalSurface';
import { CaretDown, FolderOpen, MagnifyingGlass, Star, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { type AssetPage, type LibraryAsset, fetchAssets, updateAsset } from '../lib/api/assets';
import { uploadFile } from '../lib/api/files';
import { useWorkflowStore } from '../lib/store';
import './asset-library.css';

const types = { image: '图片', video: '视频', audio: '音频', text: '文本', data: '数据', file: '文件' };
const emptyPage: AssetPage = { items: [], total: 0, page: 1, pageSize: 48, categories: [], libraryTotal: 0 };

export default function AssetLibraryModal({
  onClose,
  position,
}: { onClose: () => void; position: { x: number; y: number } }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(emptyPage);
  const [selected, setSelected] = useState<LibraryAsset | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const lastExecutionTime = useWorkflowStore((s) => s.lastExecutionTime);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const result = await fetchAssets(
        new URLSearchParams({
          search,
          type,
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
        setData(result.data);
        setLoadError('');
      } else setLoadError(result.error || '读取资产库失败');
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search, type, source, category, favorite, page, revision, lastExecutionTime]);

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setNotice('');
    setError('');
    let imported = 0;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      const result = await uploadFile(file);
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
    const result = await updateAsset(asset.id, { favorite: !asset.favorite });
    setBusy(false);
    if (!result.success) {
      setError(result.error || '收藏失败');
      return;
    }
    if (selected?.id === asset.id && result.data) setSelected(result.data);
    setRevision((v) => v + 1);
  }

  async function backfill(asset: LibraryAsset) {
    setBusy(true);
    setError('');
    try {
      let text = '';
      if (asset.type === 'text' || asset.type === 'data') {
        if (asset.size > 2 * 1024 * 1024) throw new Error('文本超过 2 MB，请下载后选取需要的内容');
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error('资产文件无法读取，请刷新后重试');
        text = await response.text();
      }
      const store = useWorkflowStore.getState();
      const offset = (store.nodes.length % 8) * 30;
      const media = ['image', 'video', 'audio'].includes(asset.type);
      const nodeId = store.addNode(
        'io',
        { x: position.x - 160 + offset, y: position.y - 100 + offset },
        {
          text,
          content: media ? [asset.url] : [],
          _fileIds: [],
          _fileOrder: [],
          _fileKinds: media ? [asset.type] : [],
          _fileNames: media ? [asset.name] : [],
        },
      );
      store.selectNode(nodeId);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '回填失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSurface
      ariaLabel="资产库"
      onClose={onClose}
      rootClassName="settings-modal asset-library-overlay"
      panelClassName="settings-modal__panel asset-library"
      backdropClassName="settings-modal__backdrop"
      backdropLabel="关闭资产库"
      isolateKeyboard
    >
      <header className="asset-library__header glass">
        <div>
          <div className="asset-library__eyebrow">Asset Library</div>
          <h2>
            资产库 <small>{data.libraryTotal} 个资产</small>
          </h2>
          <p>上传素材与生成结果，集中整理、反复复用。</p>
        </div>
        <div className="asset-library__actions">
          <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? '处理中…' : '导入素材'}
          </button>
          <button type="button" disabled={loading} onClick={() => setRevision((v) => v + 1)}>
            刷新
          </button>
          <button type="button" aria-label="关闭资产库" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <input
          ref={inputRef}
          data-testid="asset-import"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime,video/x-m4v,video/ogg,audio/*"
          hidden
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </header>
      <div className="asset-library__filters glass">
        <div className="asset-library__search workflow-library-modal__search">
          <MagnifyingGlass size={14} />
          <input
            aria-label="搜索资产"
            placeholder="搜索名称、分类、标签…"
            value={search}
            maxLength={200}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="asset-library__filter-select">
          <select
            aria-label="资产类型"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">全部类型</option>
            {Object.entries(types).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <CaretDown size={12} aria-hidden="true" />
        </div>
        <div className="asset-library__filter-select">
          <select
            aria-label="资产来源"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">全部来源</option>
            <option value="uploaded">上传素材</option>
            <option value="generated">生成结果</option>
          </select>
          <CaretDown size={12} aria-hidden="true" />
        </div>
        <div className="asset-library__filter-select">
          <select
            aria-label="资产分类"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部分类</option>
            {[...new Set([...data.categories, category].filter(Boolean))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <CaretDown size={12} aria-hidden="true" />
        </div>
        <button
          type="button"
          aria-pressed={favorite}
          onClick={() => {
            setFavorite(!favorite);
            setPage(1);
          }}
        >
          <Star weight={favorite ? 'fill' : 'regular'} />
          仅收藏
        </button>
      </div>
      {(error || loadError) && (
        <p role="alert" className="asset-library__message">
          {error || loadError}
        </p>
      )}
      {notice && (
        <p role="status" className="asset-library__message">
          {notice}
        </p>
      )}
      <div className="asset-library__body">
        <main className="asset-library__results glass" aria-busy={loading}>
          <div className="asset-library__section-heading">
            <div className="asset-library__eyebrow">素材浏览</div>
            <h3>全部资产</h3>
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
                  className={`asset-library__card ${selected?.id === asset.id ? 'is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="asset-library__select"
                    aria-label={`查看 ${asset.name}`}
                    onClick={() => setSelected(asset)}
                  >
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
                  <button
                    type="button"
                    className="asset-library__favorite"
                    disabled={busy}
                    aria-label={`${asset.favorite ? '取消收藏' : '收藏'} ${asset.name}`}
                    aria-pressed={asset.favorite}
                    onClick={() => void toggleFavorite(asset)}
                  >
                    <Star size={18} weight={asset.favorite ? 'fill' : 'regular'} />
                  </button>
                </article>
              ))}
            </div>
          )}
          <footer className="asset-library__pagination">
            <span>共 {data.total} 个匹配资产</span>
            <button type="button" disabled={loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>
              上一页
            </button>
            <span>
              {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <button
              type="button"
              disabled={loading || data.page * data.pageSize >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              下一页
            </button>
          </footer>
        </main>
        <aside className="asset-library__details glass">
          <div className="asset-library__details-heading">
            <div>
              <div className="asset-library__eyebrow">资产详情</div>
              <h3>预览与整理</h3>
            </div>
            {selected && (
              <button type="button" aria-label="清除资产选择" onClick={() => setSelected(null)}>
                <X size={16} />
              </button>
            )}
          </div>
          {selected && (
            <AssetDetails
              key={selected.id}
              asset={selected}
              busy={busy}
              categories={data.categories}
              onBackfill={() => void backfill(selected)}
              onSave={async (name, nextCategory, tags) => {
                if (tags.length > 20 || tags.some((tag) => tag.length > 40)) {
                  setError('标签最多 20 个，每个最多 40 字符');
                  return;
                }
                setError('');
                setBusy(true);
                const result = await updateAsset(selected.id, { name, category: nextCategory, tags });
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
          {!selected && (
            <div className="asset-library__details-empty">
              <FolderOpen size={32} />
              <strong>选择一个资产</strong>
              <p>在左侧选择素材，预览内容、整理分类和标签，或回填画布继续创作。</p>
            </div>
          )}
        </aside>
      </div>
    </ModalSurface>
  );
}

function AssetDetails({
  asset,
  busy,
  categories,
  onSave,
  onBackfill,
}: {
  asset: LibraryAsset;
  busy: boolean;
  categories: string[];
  onSave: (name: string, category: string, tags: string[]) => Promise<void>;
  onBackfill: () => void;
}) {
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category);
  const [tags, setTags] = useState(asset.tags.join('，'));
  return (
    <>
      <div className="asset-library__details-content">
        <div className="asset-library__preview">
          {asset.type === 'image' ? (
            <img src={asset.url} alt={asset.name} />
          ) : asset.type === 'video' ? (
            <video src={asset.url} controls preload="metadata">
              <track kind="captions" />
            </video>
          ) : asset.type === 'audio' ? (
            <audio src={asset.url} controls preload="metadata">
              <track kind="captions" />
            </audio>
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
            void onSave(
              name.trim(),
              category.trim(),
              tags
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
            );
          }}
        >
          <label>
            资产名称
            <input
              required
              aria-label="资产名称"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            分类
            <input
              aria-label="编辑分类"
              list="asset-categories"
              maxLength={60}
              placeholder="例如：参考素材"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <datalist id="asset-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label>
            标签
            <input
              aria-label="资产标签"
              placeholder="用逗号分隔，最多 20 个"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !name.trim()}>
            保存整理信息
          </button>
        </form>
      </div>
      <div className="asset-library__detail-actions" style={{ ...mutedPanelStyle(), padding: 14, flexShrink: 0 }}>
        <div style={eyebrowStyle()}>资产操作</div>
        <button
          type="button"
          className="asset-library__primary"
          disabled={busy || asset.type === 'file'}
          onClick={onBackfill}
        >
          回填画布
        </button>
        <a className="asset-library__download" href={asset.url} download={asset.originalName}>
          下载原文件
        </a>
      </div>
    </>
  );
}
