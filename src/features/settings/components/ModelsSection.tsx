import { useMemo } from 'react';
import { Check, Database, Search, UploadCloud, X } from 'lucide-react';
import type { ModelInfo, ProjectModel } from '@/lib/types';
import { inferEndpointCategory } from '@/features/workflow/lib/projectModels';
import { IOSButton, IOSCard, IOSInput, IOSLabel, IOSSelect } from '@/shared/ui/ios';
import { EmptyStateCard, SectionCard, chipStyle, mutedPanelStyle } from './styles';
import type { SettingsActions, SettingsViewModel } from './shared';

type Props = {
  T: Record<string, string>;
  actions: SettingsActions;
  view: SettingsViewModel;
};

function modelTypeLabel(type?: ModelInfo['cat'] | ProjectModel['type'] | ProjectModel['endpointCategory']) {
  if (type === 'image' || type === 'image-edit') return '图像';
  if (type === 'video') return '视频';
  if (type === 'chat') return '对话';
  return '未分类';
}

function modelTypeColor(type: string | undefined, T: Record<string, string>) {
  if (type === 'image' || type === 'image-edit') return T.purple;
  if (type === 'video') return T.orange;
  if (type === 'chat') return T.blue;
  return undefined;
}

function isSelected(id: string, selected: string[]) {
  return selected.includes(id);
}

export function ModelsSection({ T, actions, view }: Props) {
  const discoveredById = useMemo(() => new Map(view.models.map((model) => [model.id, model])), [view.models]);
  const filteredImportableModels = useMemo(() => {
    const query = view.projectModelSearch.trim().toLowerCase();
    if (!query) return view.importableModels;
    return view.importableModels.filter((id) => id.toLowerCase().includes(query));
  }, [view.importableModels, view.projectModelSearch]);
  const allVisibleSelected = filteredImportableModels.length > 0 && filteredImportableModels.every((id) => isSelected(id, view.selectedImports));
  const selectedVisibleCount = filteredImportableModels.filter((id) => isSelected(id, view.selectedImports)).length;

  const toggleImport = (id: string) => {
    actions.setSelectedImports(
      isSelected(id, view.selectedImports)
        ? view.selectedImports.filter((item) => item !== id)
        : [...view.selectedImports, id],
    );
  };

  const toggleVisibleImports = () => {
    if (allVisibleSelected) {
      const visible = new Set(filteredImportableModels);
      actions.setSelectedImports(view.selectedImports.filter((id) => !visible.has(id)));
      return;
    }
    actions.setSelectedImports([...new Set([...view.selectedImports, ...filteredImportableModels])]);
  };

  return (
    <div className="flex-col" style={{ gap: 16 }}>
      <SectionCard title="项目模型库" description="管理当前工作室在对话、图像、视频等场景下可用的模型资产。">
        <div className="flex-col" style={{ gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
            <IOSInput value={view.projectModelSearch} onChange={actions.setProjectModelSearch} placeholder="搜索模型名称" style={{ paddingLeft: 38 }} />
          </div>

          {view.importableModels.length > 0 && (
            <div data-testid="settings-importable-models-panel" style={{ ...mutedPanelStyle(), overflow: 'hidden', borderColor: `${T.blue}36`, background: `linear-gradient(180deg, ${T.blue}12, var(--color-bg-secondary) 42%)` }}>
              <div style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${T.blue}20`, color: T.blue }}>
                      <Database size={15} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>待导入模型</div>
                    <span style={chipStyle(T.blue)}>{filteredImportableModels.length} 个可见</span>
                    {view.selectedImports.length > 0 && <span style={chipStyle(T.green)}>已选择 {view.selectedImports.length}</span>}
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

              <div style={{ maxHeight: 260, overflow: 'auto', padding: 10, display: 'grid', gap: 8 }}>
                {filteredImportableModels.map((id) => {
                  const selected = isSelected(id, view.selectedImports);
                  const discovered = discoveredById.get(id);
                  const type = discovered?.cat || 'chat';
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
                      <span style={{ width: 20, height: 20, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${selected ? T.blue : 'var(--color-border)'}`, background: selected ? T.blue : 'transparent', color: '#fff' }}>
                        {selected && <Check size={13} />}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{id}</span>
                      </span>
                      <span style={chipStyle(modelTypeColor(type, T))}>{modelTypeLabel(type)}</span>
                    </button>
                  );
                })}
                {filteredImportableModels.length === 0 && (
                  <EmptyStateCard
                    title="没有匹配的待导入模型"
                    body="当前搜索词没有命中已发现但尚未导入的模型。"
                    action="清空搜索词后可以重新查看完整待导入列表。"
                  />
                )}
              </div>

              <div style={{ padding: 12, borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: 'var(--color-bg-secondary)' }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  当前视图已选择 <strong style={{ color: 'var(--color-text-primary)' }}>{selectedVisibleCount}</strong> 个，全部已选择 <strong style={{ color: 'var(--color-text-primary)' }}>{view.selectedImports.length}</strong> 个
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

          <div className="flex-col" style={{ gap: 10 }}>
            {view.filteredProjectModels.map((model) => (
              <IOSCard key={model.modelId} data-testid={`settings-project-model-card-${model.modelId}`} style={{ borderRadius: 18, boxShadow: 'none', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                <div className="flex-col" style={{ gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{model.modelId}</div>
                      <div style={{ fontSize: 11, color: model.configured ? T.green : T.orange, marginTop: 4 }}>{model.configured ? '已配置，可用' : '配置还不完整'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        <input type="checkbox" checked={model.enabled} onChange={(event) => actions.updateProjectModel(model.modelId, { enabled: event.target.checked })} />
                        启用
                      </label>
                      <IOSButton small label="移除" color={T.red} onClick={() => actions.removeProjectModel(model.modelId)} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                    <div>
                      <IOSLabel>模型类型</IOSLabel>
                      <IOSSelect value={model.type} onChange={(value) => {
                        const type = value as ProjectModel['type'];
                        actions.updateProjectModel(model.modelId, {
                          type,
                          endpointCategory: inferEndpointCategory(type),
                        });
                      }}>
                        <option value="">未设置</option>
                        <option value="chat">对话</option>
                        <option value="image">图像</option>
                        <option value="video">视频</option>
                      </IOSSelect>
                    </div>
                    <div>
                      <IOSLabel>接口模式</IOSLabel>
                      <IOSSelect value={model.endpointMode} onChange={(value) => actions.updateProjectModel(model.modelId, { endpointMode: value as ProjectModel['endpointMode'] })}>
                        <option value="category">按类别接口</option>
                        <option value="custom">自定义接口</option>
                      </IOSSelect>
                    </div>
                    {model.endpointMode === 'category' ? (
                      <div>
                        <IOSLabel>接口类别</IOSLabel>
                        <IOSSelect value={model.endpointCategory} onChange={(value) => actions.updateProjectModel(model.modelId, { endpointCategory: value as ProjectModel['endpointCategory'] })}>
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
                        <IOSInput value={model.customEndpoint} onChange={(value) => actions.updateProjectModel(model.modelId, { customEndpoint: value })} placeholder="/v1/your/custom/path" />
                      </div>
                    )}
                  </div>
                </div>
              </IOSCard>
            ))}
            {view.filteredProjectModels.length === 0 && (
              <EmptyStateCard
                title="当前没有匹配的项目模型"
                body="项目模型库里还没有符合当前筛选条件的模型。"
                action={view.projectModelSearch ? '可以调整搜索词，或先测试连接并导入发现到的模型。' : '先测试连接发现模型，再把需要的模型导入到项目模型库。'}
              />
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
