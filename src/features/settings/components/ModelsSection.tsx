import { inferEndpointCategory } from '@/domains/workflow/lib/projectModels';
import type { ModelInfo, ProjectModel } from '@/shared/types';
import { IOSButton, IOSCard, IOSInput, IOSLabel, IOSSelect } from '@/shared/ui/ios';
import { Check, Database, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { SettingsActions, SettingsViewModel } from './shared';
import { EmptyStateCard, SectionCard, chipStyle, mutedPanelStyle } from './styles';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

const CATEGORY_ORDER: Record<string, number> = { chat: 0, image: 1, 'image-edit': 2, video: 3, midjourney: 4 };
const CATEGORY_LABELS: Record<string, string> = { chat: '对话', image: '图像', 'image-edit': '图像编辑', video: '视频', midjourney: 'Midjourney' };


function modelTypeLabel(type?: ModelInfo['cat'] | ProjectModel['type'] | ProjectModel['endpointCategory']) {
  if (!type) return '未分类';
  return CATEGORY_LABELS[type] || type;
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
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModelId, setNewModelId] = useState('');
  const [newModelType, setNewModelType] = useState<ProjectModel['type']>('image');

  const toggleBatch = () => {
    setBatchMode((prev) => !prev);
    setBatchSelected(new Set());
  };

  const toggleBatchSelect = (modelId: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId); else next.add(modelId);
      return next;
    });
  };

  const selectAllBatch = () => {
    setBatchSelected(new Set(view.filteredProjectModels.map((m) => m.modelId)));
  };

  const deselectAllBatch = () => {
    setBatchSelected(new Set());
  };

  const removeSelectedBatch = () => {
    batchSelected.forEach((id) => actions.removeProjectModel(id));
    setBatchSelected(new Set());
    setBatchMode(false);
  };

  const toggleCat = (cat: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const filteredImportableModels = useMemo(() => {
    const query = view.projectModelSearch.trim().toLowerCase();
    if (!query) return view.importableModels;
    return view.importableModels.filter((model) => model.id.toLowerCase().includes(query));
  }, [view.importableModels, view.projectModelSearch]);

  const importableGroups = useMemo(() => {
    const groups = new Map<string, ModelInfo[]>();
    for (const model of filteredImportableModels) {
      const cat = model.cat || 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(model);
    }
    return Array.from(groups.entries()).sort(
      (a, b) => (CATEGORY_ORDER[a[0]] ?? 99) - (CATEGORY_ORDER[b[0]] ?? 99),
    );
  }, [filteredImportableModels]);

  const projectGroups = useMemo(() => {
    const groups = new Map<string, ProjectModel[]>();
    for (const model of view.filteredProjectModels) {
      const type = model.type || 'other';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type)!.push(model);
    }
    return Array.from(groups.entries()).sort(
      (a, b) => (CATEGORY_ORDER[a[0]] ?? 99) - (CATEGORY_ORDER[b[0]] ?? 99),
    );
  }, [view.filteredProjectModels]);

  const allVisibleSelected =
    filteredImportableModels.length > 0 &&
    filteredImportableModels.every((model) => isSelected(model.id, view.selectedImports));
  const selectedVisibleCount = filteredImportableModels.filter((model) =>
    isSelected(model.id, view.selectedImports),
  ).length;

  const toggleImport = (id: string) => {
    actions.setSelectedImports(
      isSelected(id, view.selectedImports)
        ? view.selectedImports.filter((item) => item !== id)
        : [...view.selectedImports, id],
    );
  };

  const toggleVisibleImports = () => {
    if (allVisibleSelected) {
      const visible = new Set(filteredImportableModels.map((model) => model.id));
      actions.setSelectedImports(view.selectedImports.filter((id) => !visible.has(id)));
      return;
    }
    actions.setSelectedImports([
      ...new Set([...view.selectedImports, ...filteredImportableModels.map((model) => model.id)]),
    ]);
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
              onClick={() => { setShowAddForm(!showAddForm); setNewModelId(''); setNewModelType('image'); }}
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
            {view.filteredProjectModels.length > 0 && (
              <button
                type="button"
                onClick={toggleBatch}
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
                {batchMode ? '取消' : '批量管理'}
              </button>
            )}
          </div>
        }
      >
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search
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
              placeholder="搜索模型名称"
              style={{ paddingLeft: 38 }}
            />
          </div>

          {showAddForm && (
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
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>手动添加模型</div>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                    适用于不提供模型列表接口的渠道，直接录入模型标识与类型。
                  </div>
                </div>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <IOSLabel>模型标识</IOSLabel>
                    <IOSInput
                      value={newModelId}
                      onChange={setNewModelId}
                      placeholder="如 midjourney"
                    />
                  </div>
                  <div>
                    <IOSLabel>类型</IOSLabel>
                    <IOSSelect value={newModelType} onChange={(value) => setNewModelType(value as ProjectModel['type'])}>
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
                    <IOSButton
                      small
                      label="取消"
                      onClick={() => setShowAddForm(false)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {view.importableModels.length > 0 && (
            <div
              data-testid="settings-importable-models-panel"
              style={{
                ...mutedPanelStyle(),
                overflow: 'hidden',
                borderColor: `${T.blue}36`,
                background: `linear-gradient(180deg, ${T.blue}12, var(--color-bg-secondary) 42%)`,
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
                        background: `${T.blue}20`,
                        color: T.blue,
                      }}
                    >
                      <Database size={15} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>待导入模型</div>
                    <span style={chipStyle(T.blue)}>{filteredImportableModels.length} 个可见</span>
                    {view.selectedImports.length > 0 && (
                      <span style={chipStyle(T.green)}>已选择 {view.selectedImports.length}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                    从连接测试发现的模型中挑选要纳入当前项目模型库的条目。
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleVisibleImports}
                  disabled={filteredImportableModels.length === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    flexShrink: 0,
                    padding: '8px 11px',
                    borderRadius: 10,
                    border: '1px solid var(--color-border)',
                    background: allVisibleSelected ? `${T.blue}22` : 'var(--color-bg-tertiary)',
                    color: allVisibleSelected ? T.blue : 'var(--color-text-secondary)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: filteredImportableModels.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: filteredImportableModels.length === 0 ? 0.55 : 1,
                  }}
                >
                  {allVisibleSelected ? <X size={14} /> : <Check size={14} />}
                  {allVisibleSelected ? '取消可见' : '全选可见'}
                </button>
              </div>

              <div style={{ maxHeight: 380, overflow: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {importableGroups.map(([cat, models]) => (
                  <CategoryGroup
                    key={cat}
                    cat={cat}
                    count={models.length}
                    collapsed={collapsedCats.has(cat)}
                    onToggle={() => toggleCat(cat)}
                    T={T}
                  >
                    {models.map((model) => {
                      const id = model.id;
                      const selected = isSelected(id, view.selectedImports);
                      const type = model.cat || 'chat';
                      return (
                        <button
                          key={id}
                          type="button"
                          data-testid={`settings-importable-model-${id}`}
                          onClick={() => toggleImport(id)}
                          style={{
                            width: '100%',
                            minHeight: 48,
                            display: 'grid',
                            gridTemplateColumns: '26px minmax(0, 1fr) auto',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 12px',
                            borderRadius: 12,
                            border: `1px solid ${selected ? `${T.blue}66` : 'var(--color-border)'}`,
                            background: selected ? `${T.blue}18` : 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 7,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: `1px solid ${selected ? T.blue : 'var(--color-border)'}`,
                              background: selected ? T.blue : 'transparent',
                              color: '#fff',
                            }}
                          >
                            {selected && <Check size={13} />}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span
                              style={{
                                display: 'block',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 13,
                                lineHeight: 1.35,
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {id}
                            </span>
                          </span>
                          <span style={chipStyle(modelTypeColor(type, T))}>{modelTypeLabel(type)}</span>
                        </button>
                      );
                    })}
                  </CategoryGroup>
                ))}
                {filteredImportableModels.length === 0 && (
                  <EmptyStateCard
                    title="没有匹配的待导入模型"
                    body="当前搜索词没有命中已发现但尚未导入的模型。"
                    action="清空搜索词后可以重新查看完整待导入列表。"
                  />
                )}
              </div>

              <div
                style={{
                  padding: 12,
                  borderTop: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  background: 'var(--color-bg-secondary)',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  当前视图已选择 <strong style={{ color: 'var(--color-text-primary)' }}>{selectedVisibleCount}</strong>{' '}
                  个，全部已选择{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>{view.selectedImports.length}</strong> 个
                </div>
                <button
                  type="button"
                  data-testid="settings-import-selected-models"
                  onClick={actions.importSelectedModels}
                  disabled={view.selectedImports.length === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 13px',
                    borderRadius: 11,
                    border: 'none',
                    background: view.selectedImports.length > 0 ? T.blue : 'var(--color-bg-tertiary)',
                    color: view.selectedImports.length > 0 ? '#fff' : 'var(--color-text-tertiary)',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: view.selectedImports.length > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  <UploadCloud size={15} />
                  导入选中模型
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projectGroups.map(([type, models]) => (
              <CategoryGroup
                key={type}
                cat={type}
                count={models.length}
                collapsed={collapsedCats.has(type)}
                onToggle={() => toggleCat(type)}
                T={T}
              >
                {models.map((model) => {
                  const isBatchSelected = batchMode && batchSelected.has(model.modelId);
                  return (
                  <IOSCard
                    key={model.modelId}
                    data-testid={`settings-project-model-card-${model.modelId}`}
                    style={{
                      borderRadius: 18,
                      boxShadow: 'none',
                      background: isBatchSelected ? `${T.blue}14` : 'var(--color-bg-tertiary)',
                      border: isBatchSelected ? `1px solid ${T.blue}40` : '1px solid var(--color-border)',
                      cursor: batchMode ? 'pointer' : undefined,
                    }}
                    onClick={batchMode ? () => toggleBatchSelect(model.modelId) : undefined}
                  >
                    <div className="flex-col" style={{ gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
                          {batchMode && (
                            <span
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 7,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginTop: 1,
                                border: `1px solid ${isBatchSelected ? T.blue : 'var(--color-border)'}`,
                                background: isBatchSelected ? T.blue : 'transparent',
                                color: '#fff',
                              }}
                            >
                              {isBatchSelected && <Check size={13} />}
                            </span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              color: 'var(--color-text-primary)',
                              fontFamily: 'var(--font-mono)',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {model.modelId}
                          </div>
                          <div style={{ fontSize: 11, color: model.configured ? T.green : T.orange, marginTop: 4 }}>
                            {model.configured ? '已配置，可用' : '配置还不完整'}
                          </div>
                        </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={model.enabled}
                              onChange={(event) =>
                                actions.updateProjectModel(model.modelId, { enabled: event.target.checked })
                              }
                            />
                            启用
                          </label>
                          <IOSButton
                            small
                            label="移除"
                            color={T.red}
                            onClick={() => actions.removeProjectModel(model.modelId)}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                        <div>
                          <IOSLabel>模型类型</IOSLabel>
                          <IOSSelect
                            value={model.type}
                            onChange={(value) => {
                              const type = value as ProjectModel['type'];
                              actions.updateProjectModel(model.modelId, {
                                type,
                                endpointCategory: inferEndpointCategory(type),
                              });
                            }}
                          >
                            <option value="">未设置</option>
                            <option value="chat">对话</option>
                            <option value="image">图像</option>
                            <option value="video">视频</option>
                            <option value="midjourney">Midjourney</option>
                          </IOSSelect>
                        </div>
                        <div>
                          <IOSLabel>接口模式</IOSLabel>
                          <IOSSelect
                            value={model.endpointMode}
                            onChange={(value) =>
                              actions.updateProjectModel(model.modelId, {
                                endpointMode: value as ProjectModel['endpointMode'],
                              })
                            }
                          >
                            <option value="category">按类别接口</option>
                            <option value="custom">自定义接口</option>
                          </IOSSelect>
                        </div>
                        {model.endpointMode === 'category' ? (
                          <div>
                            <IOSLabel>接口类别</IOSLabel>
                            <IOSSelect
                              value={model.endpointCategory}
                              onChange={(value) =>
                                actions.updateProjectModel(model.modelId, {
                                  endpointCategory: value as ProjectModel['endpointCategory'],
                                })
                              }
                            >
                              <option value="">未设置</option>
                              <option value="chat">chat</option>
                              <option value="image">image</option>
                              <option value="image-edit">image-edit</option>
                              <option value="gemini-generate-content">Gemini generateContent</option>
                              <option value="video">video</option>
                            </IOSSelect>
                          </div>
                        ) : (
                          <div>
                            <IOSLabel>自定义接口路径</IOSLabel>
                            <IOSInput
                              value={model.customEndpoint}
                              onChange={(value) => actions.updateProjectModel(model.modelId, { customEndpoint: value })}
                              placeholder="/v1/your/custom/path"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </IOSCard>
                );
                })}
              </CategoryGroup>
            ))}
            {view.filteredProjectModels.length === 0 && (
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
            {batchMode && view.filteredProjectModels.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={batchSelected.size === view.filteredProjectModels.length ? deselectAllBatch : selectAllBatch}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: T.blue,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {batchSelected.size === view.filteredProjectModels.length ? '取消全选' : '全选'}
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    已选 <strong style={{ color: 'var(--color-text-primary)' }}>{batchSelected.size}</strong> 个
                  </span>
                </div>
                <button
                  type="button"
                  onClick={removeSelectedBatch}
                  disabled={batchSelected.size === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    borderRadius: 9,
                    border: 'none',
                    background: batchSelected.size > 0 ? T.red : 'var(--color-bg-tertiary)',
                    color: batchSelected.size > 0 ? '#fff' : 'var(--color-text-tertiary)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: batchSelected.size > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Trash2 size={14} />
                  批量移除
                </button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function CategoryGroup({
  cat,
  count,
  collapsed,
  onToggle,
  T,
  children,
}: {
  cat: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  T: Record<string, string>;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  const label = CATEGORY_LABELS[cat] || '未分类';
  const color = modelTypeColor(cat, T);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: collapsed ? 0 : 8 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderRadius: 10,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-tertiary)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
            background: color || 'var(--color-text-tertiary)',
          }}
        />
        <span>{label}</span>
        <span style={{ opacity: 0.5, fontSize: 11 }}>{count}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10,
            transition: 'transform 0.2s',
            transform: collapsed ? '' : 'rotate(90deg)',
          }}
        >
          ▶
        </span>
      </button>
      {!collapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
    </div>
  );
}
