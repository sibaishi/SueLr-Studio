import { getNodeDef } from '@/domains/workflow/lib/constants';
import type { ModelOption } from '@/domains/workflow/lib/projectModels';
import { useWorkflowStore } from '@/domains/workflow/lib/store';
import type { ParamDef } from '@/domains/workflow/lib/types';
import { selectDirectory } from '@/shared/api';
import { getCachedRuntimeCapabilities } from '@/shared/api/serverState';
import { pickBrowserDownloadDirectory } from '@/shared/runtime/browserDownload';
import { type FocusEvent, useEffect, useRef, useState } from 'react';
import { LongTextEditorModal } from './LongTextEditorModal';
import { useBufferedStringField } from './useBufferedStringField';

function roundToNearest16(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(16, Math.round(numeric / 16) * 16);
}

export function NodeParamFields({
  params,
  nodeType,
  nodeId,
  values,
  onChange,
  onPatch,
}: {
  params: ParamDef[];
  nodeType: string;
  nodeId?: string;
  values: Record<string, unknown>;
  onChange: (paramId: string, value: unknown) => void;
  onPatch?: (patch: Record<string, unknown>) => void;
}) {
  if (params.length === 0) return null;

  const resizeMode = String(values.resizeMode || 'percent');
  const visibleParams = params.filter((param) => {
    if (nodeType !== 'imageResize') return true;
    if (param.id === 'scalePercent') return resizeMode === 'percent';
    if (param.id === 'targetWidth' || param.id === 'targetHeight') return resizeMode === 'dimensions';
    return true;
  });

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const imageResizeSourceType =
    nodeId && nodeType === 'imageResize'
      ? (() => {
          const imageEdge = edges.find((edge) => edge.target === nodeId && edge.targetHandle === 'image');
          if (!imageEdge?.sourceHandle) return null;
          const sourceNode = nodes.find((node) => node.id === imageEdge.source);
          const sourceDef = getNodeDef(sourceNode?.type || '');
          return sourceDef?.outputs.find((output) => output.id === imageEdge.sourceHandle)?.type || null;
        })()
      : null;
  const hasImageGroupInput = imageResizeSourceType === 'image[]';

  useEffect(() => {
    if (nodeType !== 'imageResize' || !hasImageGroupInput || values.resizeMode === 'percent' || !onPatch) return;
    onPatch({ resizeMode: 'percent' });
  }, [hasImageGroupInput, nodeType, onPatch, values.resizeMode]);

  const consumed = new Set<string>();
  const rows = visibleParams.flatMap((param) => {
    if (consumed.has(param.id)) return [];
    if (param.group) {
      const groupItems = visibleParams.filter((item) => item.group === param.group);
      groupItems.forEach((item) => consumed.add(item.id));
      return [groupItems];
    }
    consumed.add(param.id);
    return [[param]];
  });

  return (
    <div className="node-param-list nodrag">
      {rows.map((row, index) => {
        const rowClassName = [
          'node-param-row',
          nodeType === 'aiChat' && row.some((item) => item.group === 'aiChatTop') ? 'node-param-row--ai-chat-top' : '',
          row.some((item) => item.type === 'textarea') ? 'node-param-row--textarea' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const gridClassName =
          row.length > 1
            ? [
                'node-param-grid',
                row.length === 3 ? 'node-param-grid--three' : '',
                nodeType === 'aiChat' && row.some((item) => item.group === 'aiChatTop')
                  ? 'node-param-grid--ai-chat-top'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')
            : ['node-param-single', row.some((item) => item.type === 'textarea') ? 'node-param-single--textarea' : '']
                .filter(Boolean)
                .join(' ');
        return (
          <div key={`${row.map((item) => item.id).join('_')}_${index}`} className={rowClassName}>
            <div className={gridClassName}>
              {row.map((param) => (
                <ParamEditor
                  key={param.id}
                  param={param}
                  value={values[param.id]}
                  onChange={(value) => onChange(param.id, value)}
                  onPatch={onPatch}
                  setFieldValue={(paramId, nextValue) => onChange(paramId, nextValue)}
                  nodeType={nodeType}
                  values={values}
                  nodeId={nodeId}
                  hasImageGroupInput={hasImageGroupInput}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ParamEditor({
  param,
  value,
  onChange,
  suppressModelHint,
  nodeType,
  nodeId,
  hasImageGroupInput,
}: {
  param: ParamDef;
  value: unknown;
  onChange: (value: unknown) => void;
  onPatch?: (patch: Record<string, unknown>) => void;
  setFieldValue?: (paramId: string, value: unknown) => void;
  suppressModelHint?: boolean;
  nodeType?: string;
  nodeId?: string;
  values: Record<string, unknown>;
  hasImageGroupInput?: boolean;
}) {
  const availableModels = useWorkflowStore((s) => s.availableModels);
  const addExecutionLog = useWorkflowStore((s) => s.addExecutionLog);
  const runtimeCapabilities = getCachedRuntimeCapabilities();
  const canSelectDirectory = runtimeCapabilities?.canSelectDirectory ?? true;
  const isServerRuntime = false;
  const runtimeSearchEnabled = runtimeCapabilities?.search?.enabled ?? false;
  const runtimeSearchDisabledReason = runtimeCapabilities?.search?.disabledReason || '当前部署未启用联网搜索';
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const connectedApiKeyNode = nodeId
    ? edges
        .filter((edge) => edge.target === nodeId && edge.targetHandle === 'apiKey')
        .map((edge) => nodes.find((node) => node.id === edge.source && node.type === 'apiKeyInput'))
        .find(Boolean)
    : undefined;
  const connectedApiModel = String(connectedApiKeyNode?.data?.selectedModel || '').trim();
  const connectedApiModelGroups = (connectedApiKeyNode?.data?.apiModelGroups || {}) as {
    chat?: ModelOption[];
    image?: ModelOption[];
    video?: ModelOption[];
  };

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    event.currentTarget.classList.add('node-field--focused');
  };

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    event.currentTarget.classList.remove('node-field--focused');
  };
  const textField = useBufferedStringField(
    String((value as string) ?? (param.default as string) ?? ''),
    (nextValue) => {
      onChange(nextValue);
    },
  );
  const [isTextareaEditing, setIsTextareaEditing] = useState(false);
  const [isFullscreenTextEditing, setIsFullscreenTextEditing] = useState(false);
  const previewClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (previewClickTimerRef.current !== null) {
        window.clearTimeout(previewClickTimerRef.current);
      }
    };
  }, []);

  const handleTextareaPreviewClick = () => {
    if (previewClickTimerRef.current !== null) {
      window.clearTimeout(previewClickTimerRef.current);
    }
    previewClickTimerRef.current = window.setTimeout(() => {
      previewClickTimerRef.current = null;
      setIsTextareaEditing(true);
    }, 180);
  };

  const handleTextareaPreviewDoubleClick = () => {
    if (previewClickTimerRef.current !== null) {
      window.clearTimeout(previewClickTimerRef.current);
      previewClickTimerRef.current = null;
    }
    setIsFullscreenTextEditing(true);
  };

  const handlePickDirectory = async () => {
    try {
      if (isServerRuntime) {
        const directory = await pickBrowserDownloadDirectory();
        textField.setValue(directory.label);
        onChange(directory.label);
        addExecutionLog({ level: 'success', message: `已授权浏览器自动下载目录：${directory.label}` });
        return;
      }
      const selectedPath = await selectDirectory();
      if (!selectedPath) return;
      textField.setValue(selectedPath);
      onChange(selectedPath);
      addExecutionLog({ level: 'success', message: '已选择保存目录' });
    } catch (error) {
      addExecutionLog({ level: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  switch (param.type) {
    case 'textarea': {
      const lineCount = textField.value ? textField.value.split(/\r\n|\r|\n/).length : 0;
      const showLongTextHint = textField.value.length > 1000;

      return (
        <div className="node-param node-param--textarea">
          <label className="node-param__label">{param.label}</label>
          {isTextareaEditing ? (
            <textarea
              value={textField.value}
              onChange={(event) => textField.onChange(event.target.value)}
              className="node-text-editor node-param-text-editor nodrag"
              placeholder="粘贴/输入文本..."
              onDoubleClick={() => setIsFullscreenTextEditing(true)}
              onFocus={(event) => {
                textField.onFocus();
                handleFocus(event);
              }}
              onBlur={(event) => {
                textField.onBlur(event.target.value);
                handleBlur(event);
                setIsTextareaEditing(false);
              }}
              onCompositionStart={() => textField.onCompositionStart()}
              onCompositionEnd={(event) => textField.onCompositionEnd(event.currentTarget.value)}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            />
          ) : (
            <div
              onClick={handleTextareaPreviewClick}
              onDoubleClick={handleTextareaPreviewDoubleClick}
              className={`node-text-preview node-param-text-preview${textField.value ? '' : ' node-text-preview--empty'}`}
              title={showLongTextHint ? '单击编辑文本，双击全屏编辑' : '单击编辑文本'}
            >
              {textField.value || '粘贴/输入文本...'}
            </div>
          )}
          <div className="node-text-meta">
            <span>
              {showLongTextHint
                ? `${lineCount} 行 · ${textField.value.length} 字符 · 双击可全屏编辑`
                : `${lineCount} 行 · ${textField.value.length} 字符`}
            </span>
          </div>
          {isFullscreenTextEditing && (
            <LongTextEditorModal
              title={`编辑 ${param.label}`}
              value={textField.value}
              onChange={(nextValue) => textField.onChange(nextValue)}
              onClose={() => setIsFullscreenTextEditing(false)}
              onCompositionStart={() => textField.onCompositionStart()}
              onCompositionEnd={(nextValue) => textField.onCompositionEnd(nextValue)}
            />
          )}
        </div>
      );
    }

    case 'text':
      return (
        <div className="node-param">
          <label className="node-param__label">{param.label}</label>
          {param.picker === 'directory' ? (
            <>
              <div className="node-param__input-row">
                <input
                  type={param.id === 'apiKey' ? 'password' : 'text'}
                  value={textField.value}
                  onChange={(event) => textField.onChange(event.target.value)}
                  className="node-field nodrag"
                  onFocus={(event) => {
                    textField.onFocus();
                    handleFocus(event);
                  }}
                  onBlur={(event) => {
                    textField.onBlur(event.target.value);
                    handleBlur(event);
                  }}
                  onCompositionStart={() => textField.onCompositionStart()}
                  onCompositionEnd={(event) => textField.onCompositionEnd(event.currentTarget.value)}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                />
                <button
                  type="button"
                  className="node-secondary-button node-param__picker-button"
                  onClick={() => {
                    void handlePickDirectory();
                  }}
                  disabled={!canSelectDirectory && !isServerRuntime}
                  title={
                    isServerRuntime
                      ? '授权浏览器自动下载目录'
                      : canSelectDirectory
                        ? '选择文件夹'
                        : '当前运行模式不支持目录选择器'
                  }
                >
                  {isServerRuntime ? '授权下载目录' : '选择文件夹'}
                </button>
              </div>
              {!canSelectDirectory && !isServerRuntime ? (
                <div className="node-param__hint">当前运行模式不支持目录选择器，请直接输入可访问的绝对路径。</div>
              ) : null}
              {isServerRuntime ? (
                <div className="node-param__hint">
                  ?????? 下这里用于授权当前浏览器的自动下载目录，不代表服务器宿主机保存路径。
                </div>
              ) : null}
            </>
          ) : (
            <input
              type={param.id === 'apiKey' ? 'password' : 'text'}
              value={textField.value}
              onChange={(event) => textField.onChange(event.target.value)}
              className="node-field nodrag"
              onFocus={(event) => {
                textField.onFocus();
                handleFocus(event);
              }}
              onBlur={(event) => {
                textField.onBlur(event.target.value);
                handleBlur(event);
              }}
              onCompositionStart={() => textField.onCompositionStart()}
              onCompositionEnd={(event) => textField.onCompositionEnd(event.currentTarget.value)}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            />
          )}
        </div>
      );

    case 'select': {
      const isModelParam = param.id === 'model';
      let selectOptions = param.options || [];
      if (nodeType === 'imageResize' && param.id === 'resizeMode' && hasImageGroupInput) {
        selectOptions = selectOptions.filter((option) => String(option.value) === 'percent');
      }
      const modelLockedByApiKey = isModelParam && Boolean(connectedApiKeyNode);

      if (isModelParam) {
        let modelsForType: ModelOption[] = [];
        if (connectedApiKeyNode) {
          if (nodeType === 'aiChat') modelsForType = connectedApiModelGroups.chat || [];
          else if (nodeType === 'imageGen') modelsForType = connectedApiModelGroups.image || [];
          else if (nodeType === 'videoGen') modelsForType = connectedApiModelGroups.video || [];
          else
            modelsForType = Array.isArray(connectedApiKeyNode.data?.apiModels)
              ? connectedApiKeyNode.data.apiModels.map((id) => ({
                  label: String(id),
                  value: String(id),
                  modelId: String(id),
                }))
              : [];
        } else if (nodeType === 'aiChat') modelsForType = availableModels.chat;
        else if (nodeType === 'imageGen') modelsForType = availableModels.image;
        else if (nodeType === 'videoGen') modelsForType = availableModels.video;
        else modelsForType = availableModels.all;

        if (modelsForType.length > 0) {
          selectOptions = modelsForType;
        }
      }

      const currentValue = String(value ?? param.default ?? '');
      const displayedValue = modelLockedByApiKey && connectedApiModel ? connectedApiModel : currentValue;
      const hasValidOption = displayedValue && selectOptions.some((option) => String(option.value) === displayedValue);
      const showCombinedModelHint = nodeType === 'aiChat' && param.group === 'aiChatTop' && param.id === 'model';
      const wrapperClassName = [
        'node-param',
        nodeType === 'aiChat' && param.group === 'aiChatTop' && param.id === 'model' ? 'node-param--ai-chat-model' : '',
        nodeType === 'aiChat' && param.group === 'aiChatTop' && param.id === 'enableWebSearch'
          ? 'node-param--ai-chat-toggle'
          : '',
      ]
        .filter(Boolean)
        .join(' ');

      return (
        <div className={wrapperClassName}>
          <label className="node-param__label">{param.label}</label>
          <select
            value={displayedValue || ''}
            onChange={(event) => {
              if (event.target.value) {
                onChange(event.target.value);
              }
            }}
            disabled={modelLockedByApiKey}
            className="node-field"
            onFocus={handleFocus}
            onBlur={handleBlur}
          >
            <option value="" disabled>
              {modelLockedByApiKey
                ? connectedApiModel || '由 API Key 节点指定'
                : selectOptions.length === 0
                  ? '还没有可用模型，请先配置或检测'
                  : '请选择...'}
            </option>
            {displayedValue && !hasValidOption && <option value={displayedValue}>{displayedValue}</option>}
            {Object.entries(
              selectOptions.reduce<Record<string, typeof selectOptions>>((groups, option) => {
                const group = String((option as { group?: string }).group || '');
                groups[group] = groups[group] || [];
                groups[group].push(option);
                return groups;
              }, {}),
            ).map(([group, options]) =>
              group ? (
                <optgroup key={group} label={group}>
                  {options.map((option) => (
                    <option key={String(option.value)} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                options.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                ))
              ),
            )}
          </select>
          {isModelParam && !modelLockedByApiKey && !suppressModelHint && !showCombinedModelHint && (
            <div className="node-param__hint">
              配置来源：全局设置。若连接 API Key 节点，这里会切换为上游节点指定的模型。
            </div>
          )}
          {modelLockedByApiKey && !suppressModelHint && !showCombinedModelHint && (
            <div className="node-param__hint">
              配置来源：已连接的 API Key 节点。这个节点只影响当前直接连接的 AI 节点。
            </div>
          )}
          {showCombinedModelHint && !suppressModelHint && (
            <div className="node-param__hint node-param__hint--row-span">
              {modelLockedByApiKey
                ? '配置来源：已连接的 API Key 节点。这个节点只影响当前直接连接的 AI 节点。'
                : '配置来源：全局设置。若连接 API Key 节点，这里会切换为上游节点指定的模型。'}
            </div>
          )}
          {nodeType === 'imageResize' && param.id === 'resizeMode' && hasImageGroupInput && (
            <div className="node-param__hint">检测到上游输入为图像组，当前仅支持按百分比批量缩放。</div>
          )}
        </div>
      );
    }

    case 'number':
      return (
        <div className="node-param">
          <label className="node-param__label">{param.label}</label>
          <input
            type="number"
            value={Number(value ?? param.default ?? 0) || ''}
            onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
            onBlur={(event) => {
              if (nodeType === 'imageGen' && (param.id === 'width' || param.id === 'height')) {
                onChange(roundToNearest16(event.target.value));
              }
              handleBlur(event);
            }}
            min={param.min}
            max={param.max}
            step={param.step ?? 1}
            className="node-field"
            onFocus={handleFocus}
          />
          {nodeType === 'imageResize' && param.id === 'targetHeight' && (
            <div className="node-param__hint">按尺寸缩放会自动锁定宽高比，填写宽或高任意一项即可。</div>
          )}
        </div>
      );

    case 'slider': {
      const sliderValue = Number(value ?? param.default ?? 0);
      const minValue = param.min ?? 0;
      const maxValue = param.max ?? 1;
      const percent = ((sliderValue - minValue) / (maxValue - minValue)) * 100;

      return (
        <div className="node-param">
          <div className="node-param__row">
            <label className="node-param__label">{param.label}</label>
            <span className="node-param__value">{sliderValue.toFixed((param.step ?? 1) < 1 ? 1 : 0)}</span>
          </div>
          <input
            type="range"
            value={sliderValue}
            onChange={(event) => onChange(Number(event.target.value))}
            min={minValue}
            max={maxValue}
            step={param.step ?? 0.1}
            className="node-slider"
            style={{
              background: `linear-gradient(to right, var(--node-color) ${percent}%, var(--node-field-border) ${percent}%)`,
            }}
          />
        </div>
      );
    }

    case 'toggle': {
      const toggled = Boolean(value ?? param.default ?? false);
      const searchToggleDisabled = nodeType === 'aiChat' && param.id === 'enableWebSearch' && !runtimeSearchEnabled;
      const wrapperClassName = [
        'node-param',
        'node-param--toggle',
        nodeType === 'aiChat' && param.group === 'aiChatTop' ? 'node-param--ai-chat-toggle' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return (
        <div className={wrapperClassName}>
          <label className="node-param__label">{param.label}</label>
          <button
            type="button"
            onClick={() => {
              if (searchToggleDisabled) return;
              onChange(!toggled);
            }}
            className={['node-toggle', toggled ? 'node-toggle--on' : ''].filter(Boolean).join(' ')}
            disabled={searchToggleDisabled}
            title={searchToggleDisabled ? runtimeSearchDisabledReason : undefined}
            style={searchToggleDisabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
          >
            <span className="node-toggle__thumb" />
          </button>
          {searchToggleDisabled ? <div className="node-param__hint">{runtimeSearchDisabledReason}</div> : null}
        </div>
      );
    }

    default:
      return null;
  }
}
