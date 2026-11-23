import { MenuItem, SearchInput } from '@/ui/MenuPrimitives';
import { themeTint } from '@/ui/theme';
import { inferEndpointCategory } from '@/domains/workflow/lib/projectModels';
import type { ModelInfo, ProjectModel } from '@/shared/types';
import { Button, Checkbox, TextInput, FieldLabel, SegmentedControl, Select } from '@/ui/FormPrimitives';
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
import { Badge, EmptyStateCard, SectionCard } from '@/ui/PanelPrimitives';
import { fuzzyMatch, mutedPanelStyle } from './styles';
import './model-library.css';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

const CATEGORY_ORDER: Record<string, number> = {
  chat: 0,
  image: 1,
  'image-edit': 2,
  video: 3,
  audio: 4,
  midjourney: 5,
};
const CATEGORY_LABELS: Record<string, string> = {
  chat: '对话',
  image: '图像',
  'image-edit': '图像编辑',
  video: '视频',
  audio: '音频',
  midjourney: 'Midjourney',
};

const MODEL_TYPES = [
  ['', '未设置'],
  ['chat', '对话'],
  ['image', '图像'],
  ['video', '视频'],
  ['audio', '音频'],
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
  ['audio', '语音合成'],
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
  if (type === 'audio') return T.purple;
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
            <Button
              small
              variant="secondary"
              aria-expanded={showAddForm}
              onClick={() => {
                setLibraryView('project');
                setShowAddForm(!showAddForm);
                setNewModelId('');
                setNewModelType('image');
              }}
            >
              <Plus size={13} />
              添加模型
            </Button>
            {!isImportView && (batchMode || view.projectModels.length > 0) && (
              <Button small variant="secondary" onClick={toggleBatch} aria-pressed={batchMode}>
                {batchMode ? '退出批量管理' : '批量管理'}
              </Button>
            )}
          </div>
        }
      >
        <div className="flex-col model-library-content" style={{ gap: 12 }}>
          <SegmentedControl
            label="模型列表"
            value={isImportView ? 'import' : 'project'}
            options={[
              {
                value: 'project',
                label: (
                  <>
                    已入库 <Badge compact>{view.projectModels.length}</Badge>
                  </>
                ),
              },
              {
                value: 'import',
                label: (
                  <>
                    待导入 <Badge compact>{view.importableModels.length}</Badge>
                  </>
                ),
              },
            ]}
            onChange={(value) => {
              setLibraryView(value);
              if (value === 'import') {
                setShowAddForm(false);
                setBatchMode(false);
                setShowBatchConfig(false);
                setBatchSelected(new Set());
              }
            }}
          />
          <SearchInput
            icon={<MagnifyingGlass size={15} />}
            value={view.projectModelSearch}
            onChange={(event) => actions.setProjectModelSearch(event.target.value)}
            aria-label="搜索当前渠道的模型"
            placeholder="搜索当前渠道的模型"
          />

          {!isImportView && showAddForm && (
            <div
              style={{
                ...mutedPanelStyle(),
                overflow: 'hidden',
                borderColor: themeTint(T.green, 21),
                background: `linear-gradient(180deg, ${themeTint(T.green, 7)}, var(--color-bg-secondary) 42%)`,
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: themeTint(T.green, 13),
                        color: T.green,
                      }}
                    >
                      <Plus size={15} />
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      手动添加模型
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: 'var(--color-text-secondary)',
                      marginTop: 8,
                    }}
                  >
                    适用于不提供模型列表接口的渠道，直接录入模型标识与类型。
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 120px auto',
                    gap: 10,
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <FieldLabel>模型标识</FieldLabel>
                    <TextInput value={newModelId} onChange={setNewModelId} placeholder="如 midjourney" />
                  </div>
                  <div>
                    <FieldLabel>类型</FieldLabel>
                    <Select value={newModelType} onChange={(value) => setNewModelType(value as ProjectModel['type'])}>
                      <option value="chat">对话</option>
                      <option value="image">图像</option>
                      <option value="video">视频</option>
                      <option value="audio">音频</option>
                      <option value="midjourney">Midjourney</option>
                    </Select>
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                    <Button
                      small
                      label="添加"
                      accent={T.green}
                      onClick={() => {
                        actions.addManualProjectModel(newModelId, newModelType);
                        setShowAddForm(false);
                      }}
                    />
                    <Button small label="取消" onClick={() => setShowAddForm(false)} />
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
                  <Button
                    small
                    variant="secondary"
                    disabled={visibleModels.length === 0}
                    onClick={() => toggleBatchSelection(visibleModels, allOfTypeSelected)}
                  >
                    {allOfTypeSelected ? '取消全选本类型' : '全选本类型'}
                  </Button>
                  {projectGroups.length > 1 && (
                    <Button
                      small
                      variant="secondary"
                      onClick={() => toggleBatchSelection(localFilteredModels, allMatchesSelected)}
                    >
                      {allMatchesSelected ? '取消全选匹配模型' : '全选匹配模型'}
                    </Button>
                  )}
                  <Button
                    small
                    variant="secondary"
                    disabled={selectedIds.length === 0}
                    onClick={() => setBatchSelected(new Set())}
                  >
                    清空选择
                  </Button>
                </div>
                <div>
                  <Button
                    small
                    variant="secondary"
                    aria-expanded={showBatchConfig}
                    disabled={selectedIds.length === 0}
                    onClick={() => setShowBatchConfig((open) => !open)}
                  >
                    批量配置
                  </Button>
                  <Button
                    small
                    variant="secondary"
                    disabled={!selectedModels.some((model) => !model.enabled)}
                    onClick={() =>
                      actions.updateProjectModels(selectedIds, {
                        enabled: true,
                      })
                    }
                  >
                    批量启用
                  </Button>
                  <Button
                    small
                    variant="secondary"
                    disabled={!selectedModels.some((model) => model.enabled)}
                    onClick={() =>
                      actions.updateProjectModels(selectedIds, {
                        enabled: false,
                      })
                    }
                  >
                    批量停用
                  </Button>
                  <Button
                    small
                    variant="danger"
                    disabled={selectedIds.length === 0}
                    onClick={() => {
                      actions.removeProjectModels(selectedIds);
                      setBatchSelected(new Set());
                      setBatchMode(false);
                      setShowBatchConfig(false);
                    }}
                  >
                    批量移除
                  </Button>
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
                    <MenuItem
                      key={config.id}
                      aria-pressed={config.id === view.activeConfigId}
                      className="model-library-option"
                      onClick={() => switchChannel(config.id)}
                    >
                      <Database size={16} aria-hidden="true" />
                      <span>{config.name || config.base || config.id}</span>
                      <CaretRight size={12} aria-hidden="true" />
                    </MenuItem>
                  ))}
              </LibraryColumn>
              <LibraryColumn label="类型">
                {groups.map(([type, models]) => (
                  <MenuItem
                    key={type}
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
                  </MenuItem>
                ))}
              </LibraryColumn>
              <LibraryColumn label="模型">
                {isImportView
                  ? visibleImports.map(({ id }) => (
                      <MenuItem
                        key={id}
                        data-testid={`settings-importable-model-${id}`}
                        aria-pressed={isSelected(id, view.selectedImports)}
                        className="model-library-option"
                        onClick={() => toggleImport(id)}
                      >
                        <span className="model-library-name">{id}</span>
                        {isSelected(id, view.selectedImports) && <Check size={15} weight="bold" aria-hidden="true" />}
                      </MenuItem>
                    ))
                  : visibleModels.map((model) => {
                      const selected = batchMode ? batchSelected.has(model.modelId) : editingModelId === model.modelId;
                      return (
                        <MenuItem
                          key={model.modelId}
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
                        </MenuItem>
                      );
                    })}
              </LibraryColumn>
            </div>
            {isImportView && (
              <div className="model-library-import-actions">
                <Button
                  small
                  variant="secondary"
                  label={allVisibleSelected ? '取消选择本类型' : '全选本类型可见模型'}
                  disabled={visibleImports.length === 0}
                  onClick={toggleVisibleImports}
                />
                <div>
                  <span aria-live="polite">已选 {view.selectedImports.length} 个</span>
                  <Button
                    small
                    data-testid="settings-import-selected-models"
                    disabled={view.selectedImports.length === 0}
                    onClick={() => {
                      actions.importSelectedModels();
                      if (view.selectedImports.length === view.importableModels.length) setLibraryView('project');
                    }}
                  >
                    <CloudArrowUp size={15} aria-hidden="true" />
                    导入选中模型
                  </Button>
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
                  <Button
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
                    <Checkbox
                      checked={editingModel.enabled}
                      onChange={(enabled) =>
                        actions.updateProjectModel(editingModel.modelId, {
                          enabled,
                        })
                      }
                    />
                    启用
                  </label>
                </header>
                <div className="model-library-fields">
                  <div>
                    <FieldLabel>模型类型</FieldLabel>
                    <Select
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
                    </Select>
                  </div>
                  {editingModel.type === 'chat' && (
                    <div>
                      <FieldLabel>原生联网</FieldLabel>
                      <Select
                        aria-label="原生联网"
                        value={editingModel.nativeWebSearch ? 'on' : 'off'}
                        onChange={(value) =>
                          actions.updateProjectModel(editingModel.modelId, {
                            nativeWebSearch: value === 'on',
                          })
                        }
                      >
                        <option value="off">关闭</option>
                        <option value="on">开启（Responses API）</option>
                      </Select>
                    </div>
                  )}
                  <div>
                    <FieldLabel>接口模式</FieldLabel>
                    <Select
                      value={editingModel.endpointMode}
                      onChange={(value) =>
                        actions.updateProjectModel(editingModel.modelId, {
                          endpointMode: value as ProjectModel['endpointMode'],
                        })
                      }
                    >
                      <ConfigOptions options={ENDPOINT_MODES} />
                    </Select>
                  </div>
                  {editingModel.endpointMode === 'category' ? (
                    <div>
                      <FieldLabel>接口类别</FieldLabel>
                      <Select
                        value={editingModel.endpointCategory}
                        onChange={(value) =>
                          actions.updateProjectModel(editingModel.modelId, {
                            endpointCategory: value as ProjectModel['endpointCategory'],
                          })
                        }
                      >
                        <ConfigOptions options={ENDPOINT_CATEGORIES} />
                      </Select>
                    </div>
                  ) : (
                    <div>
                      <FieldLabel>自定义接口路径</FieldLabel>
                      <TextInput
                        value={editingModel.customEndpoint}
                        onChange={(value) =>
                          actions.updateProjectModel(editingModel.modelId, {
                            customEndpoint: value,
                          })
                        }
                        placeholder="/v1/your/custom/path"
                      />
                    </div>
                  )}
                </div>
                <Button
                  small
                  type="button"
                  label="移除模型"
                  accent={T.red}
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
          <FieldLabel>模型类型</FieldLabel>
          <Select aria-label="批量模型类型" value={type} onChange={(value) => setType(value as typeof type)}>
            <option value={KEEP_CONFIG}>保持原值</option>
            <ConfigOptions options={MODEL_TYPES} />
          </Select>
        </div>
        <div>
          <FieldLabel>接口模式</FieldLabel>
          <Select aria-label="批量接口模式" value={mode} onChange={(value) => setMode(value as typeof mode)}>
            <option value={KEEP_CONFIG}>保持原值</option>
            <ConfigOptions options={ENDPOINT_MODES} />
          </Select>
        </div>
        {hasCategory && (
          <div>
            <FieldLabel>接口类别</FieldLabel>
            <Select
              aria-label="批量接口类别"
              value={category}
              onChange={(value) => setCategory(value as typeof category)}
            >
              <option value={KEEP_CONFIG}>保持原值</option>
              <ConfigOptions options={ENDPOINT_CATEGORIES} />
            </Select>
          </div>
        )}
        {hasCustom && (
          <div>
            <label className="model-library-edit-path">
              <Checkbox checked={editPath} onChange={setEditPath} />
              更新自定义接口路径
            </label>
            <TextInput
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
        <Button small type="submit" disabled={models.length === 0 || Object.keys(patch).length === 0}>
          应用配置
        </Button>
        <Button small variant="secondary" label="取消" onClick={onCancel} />
      </div>
    </form>
  );
}
