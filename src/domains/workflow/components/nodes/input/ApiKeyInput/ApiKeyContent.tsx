import { testApiConnection } from '@/domains/workflow/lib/api';
import { useCallback } from 'react';
import type { CSSProperties } from 'react';
import { NODE_API_PROVIDER_CONFIG } from '../../nodeConstants';
import { useBufferedStringField } from '../../useBufferedStringField';

function formatModelDetectError(message?: string | null) {
  const detail = String(message || '').trim();
  return detail
    ? `模型检测没有完成，请检查 API Key、Base URL 或稍后重试。${detail}`
    : '模型检测没有完成，请检查 API Key、Base URL 或稍后重试。';
}

export function ApiKeyContent({
  data,
  nodeId,
  updateNodeData,
  outerStyle,
}: {
  data: Record<string, unknown>;
  nodeId: string;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  outerStyle: CSSProperties;
}) {
  const apiKey = String(data.apiKey || '');
  const baseUrl = String(data.baseUrl || '');
  const selectedModel = String(data.selectedModel || '');
  const legacyEndpoint = String(data.endpoint || '');
  const endpointMode = data.endpointMode === 'custom' || (!data.endpointMode && legacyEndpoint) ? 'custom' : 'category';
  const endpointCategory = String(data.endpointCategory || 'chat');
  const customEndpoint = String(data.customEndpoint || legacyEndpoint);
  const modelOptions = Array.isArray(data.apiModels) ? data.apiModels.map(String) : [];
  const modelsLoading = Boolean(data._modelsLoading);
  const modelsError = String(data._modelsError || '');
  const modelsUpdatedAt = Number(data._modelsUpdatedAt || 0);

  const update = useCallback(
    (patch: Record<string, unknown>) => {
      updateNodeData(nodeId, patch);
    },
    [nodeId, updateNodeData],
  );

  const clearDetectedModels = useCallback(
    (patch: Record<string, unknown>) => {
      update({
        ...patch,
        apiModels: [],
        apiModelGroups: undefined,
        _modelsError: '',
        _modelsUpdatedAt: 0,
      });
    },
    [update],
  );

  const detectModels = useCallback(async () => {
    if (!apiKey.trim()) {
      update({ _modelsLoading: false, _modelsError: '请先填写当前节点的 API Key，再检测可用模型。' });
      return;
    }

    update({ _modelsLoading: true, _modelsError: '' });
    const result = await testApiConnection(apiKey.trim(), baseUrl, NODE_API_PROVIDER_CONFIG);
    if (!result.success || !result.data) {
      update({ _modelsLoading: false, _modelsError: formatModelDetectError(result.error) });
      return;
    }

    const models = result.data.models || [];
    update({
      apiModels: models,
      apiModelGroups: result.data.categorized || { chat: [], image: [], video: [] },
      selectedModel: models.includes(selectedModel) ? selectedModel : models[0] || selectedModel,
      _modelsLoading: false,
      _modelsError: '',
      _modelsUpdatedAt: Date.now(),
    });
  }, [apiKey, baseUrl, selectedModel, update]);

  return (
    <div
      className="nodrag node-content-shell node-api-content"
      style={{ ...outerStyle, overflow: 'auto' }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <ApiKeyField
        label="API Key"
        value={apiKey}
        type="password"
        placeholder="sk-..."
        onChange={(value) => clearDetectedModels({ apiKey: value })}
      />
      <ApiKeyField
        label="Base URL"
        value={baseUrl}
        placeholder="https://api.example.com/v1"
        onChange={(value) => clearDetectedModels({ baseUrl: value })}
      />
      <div className="node-api-section">
        <div className="node-api-section__header">
          <label className="node-api-label">模型列表</label>
          <button
            type="button"
            onClick={detectModels}
            disabled={modelsLoading}
            className={`node-detect-button${modelsLoading ? ' node-detect-button--loading' : ''}`}
          >
            {modelsLoading ? '检测中...' : '检测模型'}
          </button>
        </div>
        <select
          value={modelOptions.includes(selectedModel) ? selectedModel : ''}
          onChange={(event) => update({ selectedModel: event.target.value })}
          className="node-api-input node-api-input--spaced"
        >
          <option value="">{modelOptions.length ? '从本节点检测结果中选择...' : '请先检测模型，或手动输入'}</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={selectedModel}
          onChange={(event) => update({ selectedModel: event.target.value })}
          placeholder="或手动输入模型 ID"
          className="node-api-input"
        />
        <div className={modelsError ? 'node-api-hint node-api-hint--error' : 'node-api-hint'}>
          {modelsError ||
            (modelsUpdatedAt
              ? `已检测 ${String(modelOptions.length)} 个模型`
              : '模型列表只来自当前 API Key 节点的检测结果，不依赖项目模型库')}
        </div>
      </div>
      <ApiKeyField
        label="接口模式"
        value={endpointMode}
        kind="select"
        options={[
          { label: '内置接口类型', value: 'category' },
          { label: '自定义路径', value: 'custom' },
        ]}
        onChange={(value) => update({ endpointMode: value })}
      />
      {endpointMode === 'category' ? (
        <ApiKeyField
          label="接口类型"
          value={endpointCategory}
          kind="select"
          options={[
            { label: '对话接口 /v1/chat/completions', value: 'chat' },
            { label: '图像生成 /v1/images/generations', value: 'image' },
            { label: '图像编辑 /v1/images/edits', value: 'image-edit' },
            { label: 'Gemini generateContent', value: 'gemini-generate-content' },
            { label: '视频生成 /v1/video/generations', value: 'video' },
          ]}
          onChange={(value) => update({ endpointCategory: value })}
        />
      ) : (
        <ApiKeyField
          label="自定义路径"
          value={customEndpoint}
          placeholder="/v1/chat/completions"
          onChange={(value) => update({ customEndpoint: value, endpoint: value })}
        />
      )}
      <div className="node-api-note">
        只会影响与这个 API Key 节点直接相连的 AI
        节点。接口模式可选择内置类型或自定义路径；缺少任意必填项都会直接中断执行。
      </div>
    </div>
  );
}

function ApiKeyField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  kind = 'input',
  options = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  kind?: 'input' | 'select';
  options?: { label: string; value: string }[];
}) {
  const field = useBufferedStringField(value, onChange);

  return (
    <div className="node-api-section">
      <label className="node-api-label">{label}</label>
      {kind === 'select' ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className="node-api-input">
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={field.value}
          placeholder={placeholder}
          onChange={(event) => field.onChange(event.target.value)}
          onFocus={() => field.onFocus()}
          onBlur={(event) => field.onBlur(event.target.value)}
          onCompositionStart={() => field.onCompositionStart()}
          onCompositionEnd={(event) => field.onCompositionEnd(event.currentTarget.value)}
          className="node-api-input"
          onKeyDown={(event) => event.stopPropagation()}
        />
      )}
    </div>
  );
}
