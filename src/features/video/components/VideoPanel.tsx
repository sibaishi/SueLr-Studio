import { useEffect, useState } from 'react';
import { Clapperboard, Download, MessageSquare, XCircle } from 'lucide-react';
import { useT } from '@/contexts/ThemeContext';
import type { ModelInfo, BridgeRef } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { CHAT_COLOR, VID_RES, VID_DUR, VID_RATIO } from '@/lib/constants';
import { ftime, taskStatusColor } from '@/lib/utils';
import { fileToB64 } from '@/lib/image';
import { useVideoGen } from '../hooks/useVideoGen';
import { IOSSegmentedControl, IOSLabel, IOSSelect, AutoTextarea, IOSButton, FileUploadArea, RefImageList, TaskDetailModal, VideoThumbnail } from '@/shared/ui/ios';
import { MediaWorkbench, WorkbenchEmptyState, WorkbenchInsightCard, WorkbenchSectionCard, chipStyle, eyebrowStyle, mutedPanelStyle, panelStyle } from '@/shared/ui/workbench';

function sectionCard(title: string, description: string, body: React.ReactNode) {
  return (
    <WorkbenchSectionCard title={title} description={description}>
      {body}
    </WorkbenchSectionCard>
  );
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

export function VideoPanel({ base, apiKey, models, addLog, bridgeRef, onAddToChat, providerConfig, videoStreamingMode, onBusyChange }: { base: string; apiKey: string; models: ModelInfo[]; addLog: (l: string, m: string) => void; bridgeRef: React.MutableRefObject<BridgeRef>; onAddToChat: (prompt: string, videoUrl?: string) => void; providerConfig?: ProviderConfig; videoStreamingMode: 'stream' | 'non-stream'; onBusyChange?: (busy: boolean) => void }) {
  const T = useT();
  const vid = useVideoGen(base, apiKey, models, addLog, bridgeRef, providerConfig, videoStreamingMode);
  const [detailTask, setDetailTask] = useState<typeof vid.tasks[0] | null>(null);
  const videoGenerationDisabled = true;

  useEffect(() => {
    onBusyChange?.(vid.activeCount > 0);
    return () => {
      onBusyChange?.(false);
    };
  }, [vid.activeCount, onBusyChange]);

  const controlContent = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)' }}>
        <div style={eyebrowStyle()}>Controls</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>生成设置</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 6 }}>视频能力当前停用，但保留任务、参数与结果查看入口。</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div className="flex-col" style={{ gap: 16 }}>
          {sectionCard('状态', '视频生成功能暂时停用。', <div style={{ padding: '12px 14px', borderRadius: 12, background: `${T.purple}12`, border: `1px solid ${T.purple}22`, color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>当前保留页面与历史任务展示入口，暂不支持参数配置或新任务发起。</div>)}

          {sectionCard('生成模式与模型', '这里保留了视频生成所需的基础配置结构。', (
            <div className="flex-col" style={{ gap: 12, pointerEvents: 'none' }}>
              <IOSSegmentedControl options={[{ l: '文生视频', v: 'text' }, { l: '图生视频', v: 'image' }]} value={vid.mode} onChange={v => vid.setMode(v as 'text' | 'image')} />
              <div><IOSLabel>模型</IOSLabel><IOSSelect value={vid.model} onChange={vid.setModel} disabled={videoGenerationDisabled}><option value="">选择模型</option>{vid.vidModels.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}</IOSSelect></div>
              <div><IOSLabel>提示词</IOSLabel><AutoTextarea value={vid.prompt} onChange={vid.setPrompt} placeholder="描述你想要的视频..." maxH={200} disabled={videoGenerationDisabled} /></div>
            </div>
          ))}

          {sectionCard('参数与素材', '保留时长、分辨率、比例、参考图与配乐配置。', (
            <div className="flex-col" style={{ gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div><IOSLabel>时长</IOSLabel><IOSSelect value={String(vid.duration)} onChange={v => vid.setDuration(Number(v))} disabled={videoGenerationDisabled}>{VID_DUR.map(d => <option key={d.v} value={d.v}>{d.l}</option>)}</IOSSelect></div>
                <div><IOSLabel>分辨率</IOSLabel><IOSSelect value={vid.resolution} onChange={vid.setResolution} disabled={videoGenerationDisabled}>{VID_RES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</IOSSelect></div>
                <div><IOSLabel>比例</IOSLabel><IOSSelect value={vid.vidRatio} onChange={vid.setVidRatio} disabled={videoGenerationDisabled}>{VID_RATIO.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</IOSSelect></div>
              </div>
              {vid.mode === 'image' && (
                <div>
                  <IOSLabel>参考图片</IOSLabel>
                  <FileUploadArea accept="image/*" multiple onUpload={f => vid.handleFileUpload(f as any)} disabled={videoGenerationDisabled} />
                  <RefImageList images={vid.refImages} onRemove={i => vid.setRefImages(p => p.filter((_, j) => j !== i))} />
                </div>
              )}
              <div>
                <IOSLabel>配乐（可选）</IOSLabel>
                <FileUploadArea accept="audio/*" multiple={false} disabled={videoGenerationDisabled} onUpload={files => { const f = files[0]; if (f) fileToB64(f).then(b64 => vid.setAudioFile({ name: f.name, type: f.type, data: b64 })); }} />
                {vid.audioFile && <audio controls src={vid.audioFile.data} style={{ width: '100%', height: 32, marginTop: 8 }} />}
              </div>
            </div>
          ))}

          <IOSButton label="视频生成功能暂时停用" onClick={() => undefined} color={T.purple} disabled />
        </div>
      </div>
    </div>
  );

  const mainContent = (
    <>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={eyebrowStyle()}>Gallery</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 6 }}>视频画廊</div>
        </div>
        {vid.completedVideos.length > 0 && <button onClick={() => vid.clearCompleted()} style={{ border: 'none', background: 'transparent', color: T.red, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>清空</button>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {vid.completedVideos.length === 0 ? (
          <EmptyPanelState
            title="还没有视频结果"
            body="历史视频结果会显示在这里，便于回看、下载和继续发起对话。"
            action="当前视频生成功能处于停用状态，可先保留历史结果入口并查看既有任务记录。"
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {vid.completedVideos.map(v => (
              <div key={v.id} style={{ ...panelStyle(), borderRadius: 18, padding: 12 }}>
                <VideoThumbnail src={v.url} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{v.prompt}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{v.model} · {ftime(v.ts)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => onAddToChat(v.prompt, v.url)} style={{ padding: '6px 12px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CHAT_COLOR}, ${T.blue})`, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageSquare size={12} /> 对话</button>
                    <a href={v.url} download target="_blank" rel="noopener noreferrer" style={{ width: 34, height: 34, borderRadius: 12, background: `linear-gradient(135deg, ${T.purple}, ${T.blue})`, color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Download size={14} /></a>
                  </div>
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
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>视频任务</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {vid.tasks.length === 0 && <EmptyPanelState title="还没有视频任务" body="这里会展示视频任务的提交、轮询、完成和失败状态。" action="当前功能停用时，这里主要用于保留历史任务观察入口。" />}
          {vid.tasks.map(t => (
            <div key={t.id} onClick={() => setDetailTask(t)} style={{ ...mutedPanelStyle(), padding: 14, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={chipStyle(taskStatusColor(t.status, T))}>{t.status}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t.model}</span>
                </div>
                {(t.status === '提交中' || t.status === '处理中') && <button onClick={e => { e.stopPropagation(); vid.cancelTask(t.id); }} style={{ border: 'none', background: 'transparent', color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>终止</button>}
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
          <span style={chipStyle(T.purple)}>功能停用</span>
          <span style={chipStyle(vid.mode === 'image' ? T.green : undefined)}>{vid.mode === 'image' ? '图生视频' : '文生视频'}</span>
          <span style={chipStyle(vid.completedVideos.length > 0 ? T.blue : undefined)}>{vid.completedVideos.length} 个结果</span>
        </div>
      </WorkbenchInsightCard>
    </div>
  );

  return (
    <>
      {detailTask && <TaskDetailModal task={detailTask as any} type="video" onClose={() => setDetailTask(null)} onApply={t => { vid.setPrompt(t.prompt); vid.setModel(t.model); }} />}
      <MediaWorkbench
        eyebrow="Video"
        title="视频工作台"
        description="统一查看视频参数、任务记录与结果画廊。"
        icon={<Clapperboard size={20} />}
        toolbarTitle="当前状态"
        toolbarMeta={videoGenerationDisabled ? '视频生成暂时停用' : (vid.model || '还没有选择模型')}
        toolbarChips={<><span style={chipStyle(T.purple)}>停用中</span><span style={chipStyle(vid.completedVideos.length > 0 ? T.blue : undefined)}>{vid.completedVideos.length} 个结果</span></>}
        sidebar={controlContent}
        main={mainContent}
        insight={insightContent}
      />
    </>
  );
}
