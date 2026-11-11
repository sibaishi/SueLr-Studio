import { inferEndpointCategory } from '@/domains/workflow/lib/projectModels';
import type { ModelInfo, ProjectModel } from '@/shared/types';
import { IOSButton, IOSInput, IOSLabel, IOSSelect } from '@/shared/ui/ios';
import {
  CaretRight,
  Check,
  CloudArrowUp,
  Database,
  MagnifyingGlass,
  Plus,
  Square,
  CheckSquare,
} from '@phosphor-icons/react';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { SettingsActions, SettingsViewModel } from './shared';
import { EmptyStateCard, SectionCard, fuzzyMatch, mutedPanelStyle } from './styles';
import './model-library.css';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

const CATEGORY_ORDER: Record<string, number> = { chat: 0, image: 1, 'image-edit': 2, video: 3, midjourney: 4 };
const CATEGORY_LABELS: Record<string, string> = {
  chat: '对话',
  image: '图像',
  'image-edit': '图像编辑',
  video: '视频',
  midjourney: 'Midjourney',
};

const MODEL_TYPES = [
  ['', '未设置'],
  ['chat', '对话'],
  ['image', '图像'],
  ['video', '视频'],
  ['midjourney', 'Midjourney'],
] as const;
const ENDPOINT_MODES = [
  ['category', '按类别接口'],
  ['custom', '自定义接口'],
] as const;
const ENDPOINT_CATEGORIES = [
  ['', '按模型类型推断'],
  ['chat', 'chat'],
  ['image', 'image'],
  ['image-edit', 'image-edit'],
  ['gemini-generate-content', 'Gemini generateContent'],
  ['video', 'video'],
] as const;

function ConfigOptions({ options }: { options: readonly (readonly [string, string])[] }) {
  return options.map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

function modelTypeColor(type: string | undefined, T: Record<string, string>) {
  if (type === 'image' || type === 'image-edit') return T.purple;
  if (type === 'video') return T.orange;
  if (type === 'chat') return T.blue;
  if (type === 'midjourney') return T.purple;
  return undefined;
}

function isSelected(id: string, selected: string[]) {
  return selected.includes(id);
}

export function ModelsSection({ T, actions, view }: Props) {
  const [libraryView, setLibraryView] = useState<'project' | 'import' | null>(null);
  const isImportView =
    (libraryView ?? (view.projectModels.length === 0 && view.importableModels.length > 0 ? 'import' : 'project')) ===
    'import';
  const [activeType, setActiveType] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelType, setNewModelType] = useState<ProjectModel['type']>('image');
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  const toggleBatch = () => {
    setBatchMode((prev) => !prev);
    setShowBatchConfig(false);
    setBatchSelected(new Set());
  };

  const toggleBatchSelect = (modelId: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const localFilteredModels = view.filteredProjectModels;
  const filteredImportableModels = useMemo(
    () => view.importableModels.filter((model) => fuzzyMatch(model.id, view.projectModelSearch)),
    [view.importableModels, view.projectModelSearch],
  );

  const importableGroups = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const model of filteredImportableModels) {
      const cat = model.cat || 'other';
      const group = groups.get(cat) || [];
      group.push(model);
      groups.set(cat, group);
    }
    return Array.from(groups.entries()).sort((a, b) => (CATEGORY_ORDER[a[0]] ?? 99) - (CATEGORY_ORDER[b[0]] ?? 99));
  }, [filteredImportableModels]);

  const projectGroups = useMemo(() => {
    const groups = new Map<string, ProjectModel[]>();
    for (const model of localFilteredModels) {
      const type = model.type || 'other';
      const group = groups.get(type) || [];
      group.push(model);
      groups.set(type, group);
    }
    return Array.from(groups.entries()).sort((a, b) => (CATEGORY_ORDER[a[0]] ?? 99) - (CATEGORY_ORDER[b[0]] ?? 99));
  }, [localFilteredModels]);

  const groups = isImportView ? importableGroups : projectGroups;
  const activeImportGroup = importableGroups.find(([type]) => type === activeType) ?? importableGroups[0];
  const visibleImports = activeImportGroup?.[1] ?? [];
  const activeGroup = projectGroups.find(([type]) => type === activeType) ?? projectGroups[0];
  const visibleModels = activeGroup?.[1] ?? [];
  const editingModel = visibleModels.find((model) => model.modelId === editingModelId);

  const selectedModels = view.projectModels.filter((model) => batchSelected.has(model.modelId));
  const selectedIds = selectedModels.map((model) => model.modelId);
  const allOfTypeSelected =
    visibleModels.length > 0 && visibleModels.every((model) => batchSelected.has(model.modelId));
  const allMatchesSelected =
    localFilteredModels.length > 0 && localFilteredModels.every((model) => batchSelected.has(model.modelId));

  const toggleBatchSelection = (models: ProjectModel[], allSelected: boolean) => {
    setBatchSelected((previous) => {
      const next = new Set(previous);
      for (const { modelId } of models) {
        if (allSelected) next.delete(modelId);
        else next.add(modelId);
      }
      return next;
    });
  };

  const switchChannel = (id: string) => {
    if (id === view.activeConfigId) return;
    actions.applyConfig(id);
    actions.setSelectedImports([]);
    setActiveType(null);
    setBatchMode(false);
    setShowBatchConfig(false);
    setBatchSelected(new Set());
    setEditingModelId(null);
    setShowAddForm(false);
  };

  const allVisibleSelected =
    visibleImports.length > 0 && visibleImports.every((model) => isSelected(model.id, view.selectedImports));
  const toggleImport = (id: string) => {
    actions.setSelectedImports(
      isSelected(id, view.selectedImports)
        ? view.selectedImports.filter((item) => item !== id)
        : [...view.selectedImports, id],
    );
  };

  const toggleVisibleImports = () => {
    if (allVisibleSelected) {
      const visible = new Set(visibleImports.map((model) => model.id));
      actions.setSelectedImports(view.selectedImports.filter((id) => !visible.has(id)));
      return;
    }
    actions.setSelectedImports([...new Set([...view.selectedImports, ...visibleImports.map((model) => model.id)])]);
  };

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard
        title="项目模型库"
        description="管理当前工作室在对话、图像、视频等场景下可用的模型资产。"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                setLibraryView('project');
                setShowAddForm(!showAddForm);
                setNewModelId('');
                setNewModelType('image');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: showAddForm ? `${T.green}18` : 'var(--color-bg-tertiary)',
                color: showAddForm ? T.green : 'var(--color-text-secondary)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              添加模型
            </button>
            {!isImportView && (batchMode || view.projectModels.length > 0) && (
              <button
                type="button"
                onClick={toggleBatch}
                aria-pressed={batchMode}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: batchMode ? `${T.blue}18` : 'var(--color-bg-tertiary)',
                  color: batchMode ? T.blue : 'var(--color-text-secondary)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {batchMode ? '退出批量管理' : '批量管理'}
              </button>
            )}
          </div>
        }
      >
        <div className="flex-col model-library-content" style={{ gap: 12 }}>
          <div className="model-library-views" role="group" aria-label="模型列表">
            <button type="button" aria-pressed={!isImportView} onClick={() => setLibraryView('project')}>
              已入库 <span>{view.projectModels.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={isImportView}
              onClick={() => {
                setLibraryView('import');
                setShowAddForm(false);
                setBatchMode(false);
                setShowBatchConfig(false);
                setBatchSelected(new Set());
              }}
            >
              待导入 <span>{view.importableModels.length}</span>
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <MagnifyingGlass
              size={15}
              style={{
                position: 'absolute',
                left: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-tertiary)',
                pointerEvents: 'none',
              }}
            />
            <IOSInput
              value={view.projectModelSearch}
              onChange={actions.setProjectModelSearch}
              aria-label="搜索当前渠道的模型"
              placeholder="搜索当前渠道的模型"
              style={{ paddingLeft: 38 }}
            />
          </div>

          {!isImportView && showAddForm && (
            <div
              style={{
                ...mutedPanelStyle(),
                overflow: 'hidden',
                borderColor: `${T.green}36`,
                background: `linear-gradient(180deg, ${T.green}12, var(--color-bg-secondary) 42%)`,
              }}
            >
              <div
                style={{
                  padding: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `${T.green}20`,
                        color: T.green,
                      }}
                    >
                      <Plus size={15} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      手动添加模型
                    </div>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                    适用于不提供模型列表接口的渠道，直接录入模型标识与类型。
                  </div>
                </div>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 120px auto',
                    gap: 10,
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <IOSLabel>模型标识</IOSLabel>
                    <IOSInput value={newModelId} onChange={setNewModelId} placeholder="如 midjourney" />
                  </div>
                  <div>
                    <IOSLabel>类型</IOSLabel>
                    <IOSSelect
                      value={newModelType}
                      onChange={(value) => setNewModelType(value as ProjectModel['type'])}
                    >
                      <option value="chat">对话</option>
                      <option value="image">图像</option>
                      <option value="video">视频</option>
                      <option value="midjourney">Midjourney</option>
                    </IOSSelect>
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                    <IOSButton
                      small
                      label="添加"
                      color={T.green}
                      onClick={() => {
                        actions.addManualProjectModel(newModelId, newModelType);
                        setShowAddForm(false);
                      }}
                    />
                    <IOSButton small label="取消" onClick={() => setShowAddForm(false)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!isImportView && batchMode && (
              <div className="model-library-batch" role="group" aria-label="批量操作">
                <div>
                  <strong aria-live="polite">已选 {selectedIds.length} 个</strong>
                  <button
                    type="button"
                    disabled={visibleModels.length === 0}
                    onClick={() => toggleBatchSelection(visibleModels, allOfTypeSelected)}
                  >
                    {allOfTypeSelected ? '取消全选本类型' : '全选本类型'}
                  </button>
                  {projectGroups.length > 1 && (
                    <button type="button" onClick={() => toggleBatchSelection(localFilteredModels, allMatchesSelected)}>
                      {allMatchesSelected ? '取消全选匹配模型' : '全选匹配模型'}
                    </button>
                  )}
                  <button type="button" disabled={selectedIds.length === 0} onClick={() => setBatchSelected(new Set())}>
                    清空选择
                  </button>
                </div>
                <div>
                  <button
                    type="button"
                    aria-expanded={showBatchConfig}
                    disabled={selectedIds.length === 0}
                    onClick={() => setShowBatchConfig((open) => !open)}
                  >
                    批量配置
                  </button>
                  <button
                    type="button"
                    disabled={!selectedModels.some((model) => !model.enabled)}
                    onClick={() => actions.updateProjectModels(selectedIds, { enabled: true })}
                  >
                    批量启用
                  </button>
                  <button
                    type="button"
                    disabled={!selectedModels.some((model) => model.enabled)}
                    onClick={() => actions.updateProjectModels(selectedIds, { enabled: false })}
                  >
                    批量停用
                  </button>
                  <button
                    type="button"
                    className="model-library-batch-remove"
                    disabled={selectedIds.length === 0}
                    onClick={() => {
                      actions.removeProjectModels(selectedIds);
                      setBatchSelected(new Set());
                      setBatchMode(false);
                      setShowBatchConfig(false);
                    }}
                  >
                    批量移除
                  </button>
                </div>
              </div>
            )}
            {!isImportView && batchMode && showBatchConfig && (
              <BatchModelConfig
                models={selectedModels}
                onCancel={() => setShowBatchConfig(false)}
                onApply={(patch) => {
                  actions.updateProjectModels(selectedIds, patch);
                  if (patch.type !== undefined) setActiveType(patch.type || 'other');
                  setShowBatchConfig(false);
                }}
              />
            )}
            <div
              className="model-library-browser"
              data-testid={isImportView ? 'settings-importable-models-panel' : undefined}
            >
              <LibraryColumn label="渠道">
                {view.apiConfigs
                  .filter((config) => config.enabled !== false || config.id === view.activeConfigId)
                  .map((config) => (
                    <button
                      key={config.id}
                      type="button"
                      aria-pressed={config.id === view.activeConfigId}
                      className="model-library-option"
                      onClick={() => switchChannel(config.id)}
                    >
                      <Database size={16} aria-hidden="true" />
                      <span>{config.name || config.base || config.id}</span>
                      <CaretRight size={12} aria-hidden="true" />
                    </button>
                  ))}
              </LibraryColumn>
              <LibraryColumn label="类型">
                {groups.map(([type, models]) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={type === (isImportView ? activeImportGroup : activeGroup)?.[0]}
                    className="model-library-option"
                    onClick={() => setActiveType(type)}
                  >
                    <span className="model-library-dot" style={{ background: modelTypeColor(type, T) }} />
                    <span>{CATEGORY_LABELS[type] || '未分类'}</span>
                    <small>
                      {!isImportView && batchMode
                        ? `${models.filter((model) => 'modelId' in model && typeof model.modelId === 'string' && batchSelected.has(model.modelId)).length} / ${models.length}`
                        : models.length}
                    </small>
                    <CaretRight size={12} aria-hidden="true" />
                  </button>
                ))}
              </LibraryColumn>
              <LibraryColumn label="模型">
                {isImportView
                  ? visibleImports.map(({ id }) => (
                      <button
                        key={id}
                        type="button"
                        data-testid={`settings-importable-model-${id}`}
                        aria-pressed={isSelected(id, view.selectedImports)}
                        className="model-library-option"
                        onClick={() => toggleImport(id)}
                      >
                        <span className="model-library-name">{id}</span>
                        {isSelected(id, view.selectedImports) && <Check size={15} weight="bold" aria-hidden="true" />}
                      </button>
                    ))
                  : visibleModels.map((model) => {
                      const selected = batchMode ? batchSelected.has(model.modelId) : editingModelId === model.modelId;
                      return (
                        <button
                          key={model.modelId}
                          type="button"
                          data-testid={`settings-project-model-card-${model.modelId}`}
                          aria-pressed={selected}
                          className="model-library-option"
                          onClick={() => {
                            if (batchMode) toggleBatchSelect(model.modelId);
                            else setEditingModelId(selected ? null : model.modelId);
                          }}
                        >
                          {batchMode &&
                            (selected ? (
                              <CheckSquare size={17} weight="fill" aria-hidden="true" />
                            ) : (
                              <Square size={17} aria-hidden="true" />
                            ))}
                          <span>
                            <span className="model-library-name">{model.modelId}</span>
                            <small>{!model.enabled ? '已停用' : model.configured ? '可用' : '待完善配置'}</small>
                          </span>
                          {!batchMode && selected && <Check size={15} weight="bold" aria-hidden="true" />}
                        </button>
                      );
                    })}
              </LibraryColumn>
            </div>
            {isImportView && (
              <div className="model-library-import-actions">
                <IOSButton
                  type="button"
                  small
                  label={allVisibleSelected ? '取消选择本类型' : '全选本类型可见模型'}
                  disabled={visibleImports.length === 0}
                  onClick={toggleVisibleImports}
                  style={
                    visibleImports.length > 0
                      ? {
                          background: 'var(--color-bg-secondary)',
                          color: 'var(--color-text-primary)',
                        }
                      : undefined
                  }
                />
                <div>
                  <span aria-live="polite">已选 {view.selectedImports.length} 个</span>
                  <button
                    type="button"
                    className="model-library-primary-button"
                    data-testid="settings-import-selected-models"
                    disabled={view.selectedImports.length === 0}
                    onClick={() => {
                      actions.importSelectedModels();
                      if (view.selectedImports.length === view.importableModels.length) setLibraryView('project');
                    }}
                  >
                    <CloudArrowUp size={15} aria-hidden="true" />
                    导入选中模型
                  </button>
                </div>
              </div>
            )}
            {isImportView && visibleImports.length === 0 && (
              <div className="flex-col" style={{ gap: 8, alignItems: 'flex-start' }}>
                <EmptyStateCard
                  title={view.importableModels.length > 0 ? '没有匹配的待导入模型' : '暂无待导入模型'}
                  body={
                    view.importableModels.length > 0
                      ? '可以调整搜索词或清空搜索。'
                      : '连接测试发现的新模型会显示在这里。'
                  }
                />
                {view.importableModels.length === 0 && (
                  <IOSButton
                    type="button"
                    small
                    label="前往连接设置"
                    onClick={() => actions.setActiveModule('connection')}
                  />
                )}
              </div>
            )}
            {!isImportView && !batchMode && editingModel && (
              <section className="model-library-details" aria-label="模型配置">
                <header>
                  <strong>{editingModel.modelId}</strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={editingModel.enabled}
                      onChange={(event) =>
                        actions.updateProjectModel(editingModel.modelId, { enabled: event.target.checked })
                      }
                    />
                    启用
                  </label>
                </header>
                <div className="model-library-fields">
                  <div>
                    <IOSLabel>模型类型</IOSLabel>
                    <IOSSelect
                      value={editingModel.type}
                      onChange={(value) => {
                        const type = value as ProjectModel['type'];
                        actions.updateProjectModel(editingModel.modelId, {
                          type,
                          endpointCategory: inferEndpointCategory(type),
                        });
                        setActiveType(type || 'other');
                      }}
                    >
                      <ConfigOptions options={MODEL_TYPES} />
                    </IOSSelect>
                  </div>
                  <div>
                    <IOSLabel>接口模式</IOSLabel>
                    <IOSSelect
                      value={editingModel.endpointMode}
                      onChange={(value) =>
                        actions.updateProjectModel(editingModel.modelId, {
                          endpointMode: value as ProjectModel['endpointMode'],
                        })
                      }
                    >
                      <ConfigOptions options={ENDPOINT_MODES} />
                    </IOSSelect>
                  </div>
                  {editingModel.endpointMode === 'category' ? (
                    <div>
                      <IOSLabel>接口类别</IOSLabel>
                      <IOSSelect
                        value={editingModel.endpointCategory}
                        onChange={(value) =>
                          actions.updateProjectModel(editingModel.modelId, {
                            endpointCategory: value as ProjectModel['endpointCategory'],
                          })
                        }
                      >
                        <ConfigOptions options={ENDPOINT_CATEGORIES} />
                      </IOSSelect>
                    </div>
                  ) : (
                    <div>
                      <IOSLabel>自定义接口路径</IOSLabel>
                      <IOSInput
                        value={editingModel.customEndpoint}
                        onChange={(value) =>
                          actions.updateProjectModel(editingModel.modelId, { customEndpoint: value })
                        }
                        placeholder="/v1/your/custom/path"
                      />
                    </div>
                  )}
                </div>
                <IOSButton
                  small
                  type="button"
                  label="移除模型"
                  color={T.red}
                  onClick={() => {
                    actions.removeProjectModels([editingModel.modelId]);
                    setEditingModelId(null);
                  }}
                />
              </section>
            )}
            {!isImportView && localFilteredModels.length === 0 && (
              <EmptyStateCard
                title="当前没有匹配的项目模型"
                body="项目模型库里还没有符合当前筛选条件的模型。"
                action={
                  view.projectModelSearch
                    ? '可以调整搜索词，或先测试连接并导入发现到的模型。'
                    : '先测试连接发现模型，再把需要的模型导入到项目模型库。'
                }
              />
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function LibraryColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="model-library-column" role="group" aria-label={label}>
      <div className="model-library-column-label" aria-hidden="true">
        {label}
      </div>
      <div className="model-library-options">{children}</div>
    </div>
  );
}

const KEEP_CONFIG = 'keep';

function BatchModelConfig({
  models,
  onApply,
  onCancel,
}: {
  models: ProjectModel[];
  onApply: (patch: Partial<ProjectModel>) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ProjectModel['type'] | typeof KEEP_CONFIG>(KEEP_CONFIG);
  const [mode, setMode] = useState<ProjectModel['endpointMode'] | typeof KEEP_CONFIG>(KEEP_CONFIG);
  const [category, setCategory] = useState<ProjectModel['endpointCategory'] | typeof KEEP_CONFIG>(KEEP_CONFIG);
  const [editPath, setEditPath] = useState(false);
  const [path, setPath] = useState('');
  const hasCategory =
    mode === 'category' || (mode === KEEP_CONFIG && models.some((model) => model.endpointMode === 'category'));
  const hasCustom =
    mode === 'custom' || (mode === KEEP_CONFIG && models.some((model) => model.endpointMode === 'custom'));
  const patch: Partial<ProjectModel> = {};
  if (type !== KEEP_CONFIG) patch.type = type;
  if (mode !== KEEP_CONFIG) patch.endpointMode = mode;
  if (hasCategory && category !== KEEP_CONFIG) patch.endpointCategory = category;
  if (hasCustom && editPath) patch.customEndpoint = path.trim();

  return (
    <form
      className="model-library-details"
      aria-label="批量配置"
      onSubmit={(event) => {
        event.preventDefault();
        if (models.length > 0 && Object.keys(patch).length > 0) onApply(patch);
      }}
    >
      <header>
        <strong>配置已选的 {models.length} 个模型</strong>
      </header>
      <div className="model-library-fields">
        <div>
          <IOSLabel>模型类型</IOSLabel>
          <IOSSelect aria-label="批量模型类型" value={type} onChange={(value) => setType(value as typeof type)}>
            <option value={KEEP_CONFIG}>保持原值</option>
            <ConfigOptions options={MODEL_TYPES} />
          </IOSSelect>
        </div>
        <div>
          <IOSLabel>接口模式</IOSLabel>
          <IOSSelect aria-label="批量接口模式" value={mode} onChange={(value) => setMode(value as typeof mode)}>
            <option value={KEEP_CONFIG}>保持原值</option>
            <ConfigOptions options={ENDPOINT_MODES} />
          </IOSSelect>
        </div>
        {hasCategory && (
          <div>
            <IOSLabel>接口类别</IOSLabel>
            <IOSSelect
              aria-label="批量接口类别"
              value={category}
              onChange={(value) => setCategory(value as typeof category)}
            >
              <option value={KEEP_CONFIG}>保持原值</option>
              <ConfigOptions options={ENDPOINT_CATEGORIES} />
            </IOSSelect>
          </div>
        )}
        {hasCustom && (
          <div>
            <label className="model-library-edit-path">
              <input type="checkbox" checked={editPath} onChange={(event) => setEditPath(event.target.checked)} />
              更新自定义接口路径
            </label>
            <IOSInput
              aria-label="批量自定义接口路径"
              value={path}
              onChange={setPath}
              disabled={!editPath}
              placeholder="留空可清除路径"
            />
          </div>
        )}
      </div>
      {mode !== KEEP_CONFIG && models.some((model) => model.endpointMode !== mode) && (
        <small>切换接口模式会清除旧模式对应的接口类别或路径。</small>
      )}
      {hasCategory && hasCustom && <small>接口类别和自定义路径分别应用到对应接口模式的模型。</small>}
      <div className="model-library-config-actions">
        <button
          type="submit"
          className="model-library-primary-button"
          disabled={models.length === 0 || Object.keys(patch).length === 0}
        >
          应用配置
        </button>
        <IOSButton type="button" small label="取消" onClick={onCancel} />
      </div>
    </form>
  );
}
