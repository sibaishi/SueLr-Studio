import { useEffect, useState } from 'react';
import { Download, Image as ImageIcon, MessageSquare, XCircle } from 'lucide-react';
import { useT } from '@/contexts/ThemeContext';
import type { ApiConfig, ModelInfo, BridgeRef } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { getModelDisplayName, getModelGroupName } from '@/lib/model-routing';
import { CHAT_COLOR, RATIOS, QUICK_PROMPTS } from '@/lib/constants';
import { taskStatusColor, taskStatusLabel } from '@/lib/utils';
import { useImageGen } from '../hooks/useImageGen';
import { FullscreenViewer, IOSSegmentedControl, IOSLabel, IOSSelect, AutoTextarea, IOSButton, FileUploadArea, RefImageList, TaskDetailModal } from '@/shared/ui/ios';
import { MediaWorkbench, WorkbenchEmptyState, WorkbenchInsightCard, WorkbenchSectionCard, chipStyle, eyebrowStyle, mutedPanelStyle, panelStyle } from '@/shared/ui/workbench';

const pairStyle = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 } as const;

function sectionCard(title: string, description: string, body: React.ReactNode) {
  return (
    <WorkbenchSectionCard title={title} description={description}>
      {body}
    </WorkbenchSectionCard>
  );
}

function getSizingHint(width: string, height: string, ratio: string) {
  if (width.trim() && height.trim()) return '已填写宽高，将优先使用宽高，比例仅作展示参考';
  if (ratio !== 'auto') return '未填写宽高，将使用所选比例推导图片尺寸';
  return '未填写宽高且比例为自动，将由上游接口自行决定尺寸';
}

function EmptyPanelState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: string;
}) {
  return (
    <WorkbenchEmptyState title={title} body={body} action={action} />
  );
}

export function ImagePanel({ base, apiKey, apiConfigs, models, addLog, bridgeRef, onAddToChat, providerConfig, imageStreamingMode: _imageStreamingMode, onBusyChange }: { base: string; apiKey: string; apiConfigs: ApiConfig[]; models: ModelInfo[]; addLog: (l: string, m: string) => void; bridgeRef: React.MutableRefObject<BridgeRef>; onAddToChat: (urls: string[]) => void; providerConfig?: ProviderConfig; imageStreamingMode: 'stream' | 'non-stream'; onBusyChange?: (busy: boolean) => void }) {
  const T = useT();
  const img = useImageGen(base, apiKey, apiConfigs, models, addLog, bridgeRef, providerConfig);
  const [detailTask, setDetailTask] = useState<typeof img.tasks[0] | null>(null);

  useEffect(() => {
    onBusyChange?.(img.activeCount > 0);
    return () => {
      onBusyChange?.(false);
    };
  }, [img.activeCount, onBusyChange]);

  const controlContent = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)' }}>
        <div style={eyebrowStyle()}>Controls</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>生成设置</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 6 }}>调整模型、尺寸、质量与参考图，组织当前图像任务。</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div className="flex-col" style={{ gap: 16 }}>
          {sectionCard('生成模式', '选择文生图或图生图工作流。', <IOSSegmentedControl options={[{ l: '文生图', v: 'text' }, { l: '图生图', v: 'image' }]} value={img.mode} onChange={v => img.setMode(v as 'text' | 'image')} />)}

          {sectionCard('模型与提示词', '决定本轮生成所用模型和主要描述。', (
            <div className="flex-col" style={{ gap: 12 }}>
              <div><IOSLabel>模型</IOSLabel><IOSSelect value={img.model} onChange={img.setModel}><option value="">选择模型</option>{Object.entries(img.imgModels.reduce<Record<string, ModelInfo[]>>((groups, model) => { const group = getModelGroupName(model); groups[group] = groups[group] || []; groups[group].push(model); return groups; }, {})).map(([group, groupModels]) => <optgroup key={group} label={group}>{groupModels.map(m => <option key={m.id} value={m.id}>{getModelDisplayName(m)}</option>)}</optgroup>)}</IOSSelect></div>
              <div><IOSLabel>提示词</IOSLabel><AutoTextarea value={img.prompt} onChange={img.setPrompt} placeholder="描述你想要的图片..." maxH={200} /></div>
            </div>
          ))}

          {sectionCard('尺寸与输出', '控制比例、尺寸、质量、数量和导出格式。', (
            <div className="flex-col" style={{ gap: 12 }}>
              <div style={pairStyle}>
                <div><IOSLabel>图片比例</IOSLabel><IOSSelect value={img.ratio} onChange={img.setRatio}>{RATIOS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</IOSSelect></div>
                <div><IOSLabel>张数</IOSLabel><IOSSelect value={String(img.count)} onChange={v => img.setCount(Number(v) || 1)}><option value="1">1</option><option value="2">2</option><option value="4">4</option></IOSSelect></div>
              </div>
              <div style={pairStyle}>
                <div><IOSLabel>宽</IOSLabel><AutoTextarea value={img.width} onChange={img.setWidth} placeholder="如 1152" maxH={80} onBlur={() => img.normalizeWidth()} /></div>
                <div><IOSLabel>高</IOSLabel><AutoTextarea value={img.height} onChange={img.setHeight} placeholder="如 2048" maxH={80} onBlur={() => img.normalizeHeight()} /></div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>{getSizingHint(img.width, img.height, img.ratio)}</div>
              <div style={pairStyle}>
                <div><IOSLabel>质量</IOSLabel><IOSSelect value={img.quality} onChange={v => img.setQuality(v as typeof img.quality)}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="auto">auto</option></IOSSelect></div>
                <div><IOSLabel>输出格式</IOSLabel><IOSSelect value={img.outputFormat} onChange={v => img.setOutputFormat(v as typeof img.outputFormat)}><option value="png">png</option><option value="jpeg">jpeg</option><option value="webp">webp</option></IOSSelect></div>
              </div>
            </div>
          ))}

          {img.mode === 'image' && sectionCard('参考图片', '上传参考图来约束生成方向，最多 5 张。', (
            <div>
              <FileUploadArea accept="image/*" multiple onUpload={f => img.handleFileUpload(f as any)} />
              <RefImageList images={img.refImages} onRemove={i => img.setRefImages(p => p.filter((_, j) => j !== i))} />
            </div>
          ))}

          {sectionCard('快速提示词', '用预设提示词快速开始一轮图像探索。', (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_PROMPTS.map(q => (
                <button key={q.label} onClick={() => img.setPrompt(q.prompt)} title={q.prompt} style={{ padding: '6px 12px', borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>{q.label}</button>
              ))}
            </div>
          ))}

          <IOSButton label={`生成图片${img.activeCount > 0 ? ` (${img.activeCount}个任务)` : ''}`} onClick={() => { img.handleGenerate(); }} color={T.orange} disabled={!img.prompt.trim() || !img.model} />
        </div>
      </div>
    </div>
  );

  const mainContent = (
    <>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrowStyle()}>Gallery</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 6 }}>图片画廊</div>
        </div>
        {img.gallery.length > 0 && <button onClick={() => img.clearGallery()} style={{ border: 'none', background: 'transparent', color: T.red, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>清空</button>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {img.gallery.length === 0 ? (
          <EmptyPanelState
            title="画廊还是空的"
            body="生成完成后的图片会集中显示在这里，方便预览、下载和继续加入对话。"
            action="先选择模型并输入提示词，再发起一次图片生成。"
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {img.gallery.map(item => (
              <div key={item.id} style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', aspectRatio: '1', cursor: 'pointer', ...panelStyle() }} onClick={() => img.setPreviewUrl(item.url)}>
                <img src={item.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,0.56) 100%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, padding: 10 }}>
                  <button onClick={e => { e.stopPropagation(); onAddToChat([item.url]); }} style={{ padding: '7px 12px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CHAT_COLOR}, ${T.blue})`, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}><MessageSquare size={12} /> 对话</button>
                  <button onClick={e => { e.stopPropagation(); const a = document.createElement('a'); a.href = item.url; a.download = `${item.id}.png`; if (item.url.startsWith('data:')) a.click(); else { a.target = '_blank'; a.click(); } }} style={{ width: 34, height: 34, borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Download size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const insightContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <WorkbenchInsightCard eyebrow="Run State">
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>任务队列</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {img.tasks.length === 0 && <EmptyPanelState title="还没有任务" body="这里会记录每一次图片生成的排队、运行和失败状态。" action="提交一条图片任务后，可以回到这里查看进度和错误信息。" />}
          {img.tasks.map(t => (
            <div key={t.id} onClick={() => setDetailTask(t)} style={{ ...mutedPanelStyle(), padding: 14, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={chipStyle(taskStatusColor(t.status, T))}>{taskStatusLabel(t.status)}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t.model}</span>
                </div>
                {(t.status === 'queued' || t.status === 'processing') && <button onClick={e => { e.stopPropagation(); img.cancelTask(t.id); }} style={{ border: 'none', background: 'transparent', color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>终止</button>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{t.prompt}</div>
              {t.error && <div style={{ fontSize: 11, color: T.red, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={10} /> {t.error.slice(0, 80)}</div>}
            </div>
          ))}
        </div>
      </WorkbenchInsightCard>

      <WorkbenchInsightCard eyebrow="Snapshot">
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>当前状态</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <span style={chipStyle(img.model ? T.orange : undefined)}>{img.model || '还没有选择模型'}</span>
          <span style={chipStyle(img.mode === 'image' ? T.green : undefined)}>{img.mode === 'image' ? '图生图' : '文生图'}</span>
          <span style={chipStyle(img.gallery.length > 0 ? T.blue : undefined)}>{img.gallery.length} 张图片</span>
        </div>
      </WorkbenchInsightCard>
    </div>
  );

  return (
    <>
      <FullscreenViewer url={img.previewUrl} onClose={() => img.setPreviewUrl(null)} />
      {detailTask && <TaskDetailModal task={detailTask} type="image" onClose={() => setDetailTask(null)} onApply={t => { img.setPrompt(t.prompt); img.setModel(t.model); img.setRatio(t.ratio); img.setWidth(t.width ? String(t.width) : ''); img.setHeight(t.height ? String(t.height) : ''); img.setQuality(t.quality || 'high'); img.setCount(t.n || 1); img.setOutputFormat(t.output_format || 'png'); if (t.refImages.length > 0) { img.setRefImages(t.refImages); img.setMode('image'); } }} />}
      <MediaWorkbench
        eyebrow="Image"
        title="图像工作台"
        description="组织图像生成参数、任务队列与结果画廊。"
        icon={<ImageIcon size={20} />}
        toolbarTitle="当前模型"
        toolbarMeta={img.model || '还没有选择模型'}
        toolbarChips={<><span style={chipStyle(img.activeCount > 0 ? T.orange : undefined)}>{img.activeCount} 个运行中</span><span style={chipStyle(img.gallery.length > 0 ? T.blue : undefined)}>{img.gallery.length} 张结果</span></>}
        sidebar={controlContent}
        main={mainContent}
        insight={insightContent}
      />
    </>
  );
}
