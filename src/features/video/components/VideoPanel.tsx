import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Copy, Download, MessageSquare, XCircle } from 'lucide-react';
import { useT } from '@/contexts/ThemeContext';
import type { ApiConfig, ModelInfo, BridgeRef, VTask } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { getModelDisplayName, getModelGroupName } from '@/lib/model-routing';
import { CHAT_COLOR, VID_RES, VID_DUR, VID_RATIO } from '@/lib/constants';
import { ftime, taskStatusColor } from '@/lib/utils';
import { fileToB64 } from '@/lib/image';
import { useVideoGen } from '../hooks/useVideoGen';
import { FullscreenViewer, IOSSegmentedControl, IOSLabel, IOSSelect, AutoTextarea, IOSButton, FileUploadArea, RefImageList, TaskDetailModal, VideoThumbnail } from '@/shared/ui/ios';
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
  return <WorkbenchEmptyState title={title} body={body} action={action} />;
}

function getVideoTaskStatusLabel(status: string) {
  if (status === 'queued' || status === '提交中') return '提交中';
  if (status === 'processing' || status === '处理中') return '处理中';
  if (status === 'done' || status === '已完成') return '已完成';
  if (status === 'failed' || status === '失败') return '失败';
  if (status === 'cancelled' || status === '已取消') return '已取消';
  return status || '未知';
}

function isActiveVideoTask(status: string) {
  return status === 'queued' || status === 'processing' || status === '提交中' || status === '处理中';
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function getTaskElapsedLabel(task: VTask, now: number) {
  const endAt = isActiveVideoTask(task.status) ? now : (task.updatedAt ?? task.ts);
  return formatDuration(endAt - task.ts);
}

function TaskTimer({ task, now }: { task: VTask; now: number }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>
      已耗时：{getTaskElapsedLabel(task, now)}
    </div>
  );
}

export function VideoPanel({ base, apiKey, apiConfigs, models, addLog, bridgeRef, onAddToChat, providerConfig, videoStreamingMode, onBusyChange }: { base: string; apiKey: string; apiConfigs: ApiConfig[]; models: ModelInfo[]; addLog: (l: string, m: string) => void; bridgeRef: React.MutableRefObject<BridgeRef>; onAddToChat: (prompt: string, videoUrl?: string) => void; providerConfig?: ProviderConfig; videoStreamingMode: 'stream' | 'non-stream'; onBusyChange?: (busy: boolean) => void }) {
  const T = useT();
  const vid = useVideoGen(base, apiKey, apiConfigs, models, addLog, bridgeRef, providerConfig, videoStreamingMode);
  const [detailTask, setDetailTask] = useState<typeof vid.tasks[0] | null>(null);
  const [resumeTaskId, setResumeTaskId] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const videoGenerationDisabled = false;
  const latestTask = useMemo(() => vid.tasks[0] ?? null, [vid.tasks]);

  useEffect(() => {
    onBusyChange?.(vid.activeCount > 0);
    return () => {
      onBusyChange?.(false);
    };
  }, [vid.activeCount, onBusyChange]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const resumePollingCard = sectionCard('继续轮询', '如果你已经有 taskId，可以手动继续查询这个视频任务。', (
    <div className="flex-col" style={{ gap: 12 }}>
      {latestTask && (
        <div style={{ padding: 12, borderRadius: 12, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>最近任务</div>
            <span style={chipStyle(taskStatusColor(latestTask.status, T))}>{getVideoTaskStatusLabel(latestTask.status)}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 8 }}>taskId</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, wordBreak: 'break-all' }}>
            {latestTask.taskId || '任务已提交，等待返回 taskId...'}
          </div>
          <TaskTimer task={latestTask} now={now} />
        </div>
      )}
      <div>
        <IOSLabel>taskId</IOSLabel>
        <AutoTextarea
          value={resumeTaskId}
          onChange={setResumeTaskId}
          placeholder="例如：cgt-20260515211726-m2qg5"
          maxH={88}
        />
      </div>
      <IOSButton
        label="按 taskId 继续轮询"
        onClick={() => {
          void vid.resumeTaskPolling(resumeTaskId)
            .then(() => setResumeTaskId(''))
            .catch((error) => addLog('error', `[Video] 手动继续轮询失败: ${error instanceof Error ? error.message : String(error)}`));
        }}
        color={T.blue}
        disabled={!resumeTaskId.trim()}
      />
    </div>
  ));

  const controlContent = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border)' }}>
        <div style={eyebrowStyle()}>Controls</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>生成设置</div>
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-secondary)', marginTop: 6 }}>设置模型、提示词和素材后提交视频生成任务，最近任务状态和 taskId 也会同步显示在这里。</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div className="flex-col" style={{ gap: 16 }}>
          {sectionCard('状态', '视频能力已启用，提交后会显示当前任务状态、taskId 和耗时。', (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: `${T.purple}12`, border: `1px solid ${T.purple}22`, color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
              {latestTask
                ? `最近任务状态：${getVideoTaskStatusLabel(latestTask.status)}`
                : '当前还没有视频任务，提交后会在这里显示任务状态。'}
            </div>
          ))}

          {sectionCard('生成模式与模型', '支持文生视频与图生视频两种模式。', (
            <div className="flex-col" style={{ gap: 12 }}>
              <IOSSegmentedControl options={[{ l: '文生视频', v: 'text' }, { l: '图生视频', v: 'image' }]} value={vid.mode} onChange={v => vid.setMode(v as 'text' | 'image')} />
              <div><IOSLabel>模型</IOSLabel><IOSSelect value={vid.model} onChange={vid.setModel} disabled={videoGenerationDisabled}><option value="">选择模型</option>{Object.entries(vid.vidModels.reduce<Record<string, ModelInfo[]>>((groups, model) => { const group = getModelGroupName(model); groups[group] = groups[group] || []; groups[group].push(model); return groups; }, {})).map(([group, groupModels]) => <optgroup key={group} label={group}>{groupModels.map(m => <option key={m.id} value={m.id}>{getModelDisplayName(m)}</option>)}</optgroup>)}</IOSSelect></div>
              <div><IOSLabel>提示词</IOSLabel><AutoTextarea value={vid.prompt} onChange={vid.setPrompt} placeholder="描述你想要的视频..." maxH={200} disabled={videoGenerationDisabled} /></div>
            </div>
          ))}

          {sectionCard('参数与素材', '调整时长、分辨率、比例、参考图和配乐。', (
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


          <IOSButton label="生成视频" onClick={vid.submit} color={T.purple} disabled={!vid.model || !vid.prompt.trim()} />
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
        {latestTask && (
          <div style={{ ...panelStyle(), borderRadius: 18, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={eyebrowStyle()}>Latest Task</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 6 }}>
                  {getVideoTaskStatusLabel(latestTask.status)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 8 }}>
                  {latestTask.prompt}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>taskId</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-primary)', marginTop: 4, wordBreak: 'break-all' }}>
                      {latestTask.taskId || '任务已提交，等待服务端返回 taskId...'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>模型 / 参数</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-primary)', marginTop: 4 }}>
                      {latestTask.model} / {latestTask.params}
                    </div>
                  </div>
                </div>
                <TaskTimer task={latestTask} now={now} />
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                  创建于：{ftime(latestTask.ts)}{latestTask.updatedAt ? ` · 最近更新：${ftime(latestTask.updatedAt)}` : ''}
                </div>
                {latestTask.error && (
                  <div style={{ fontSize: 12, color: T.red, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <XCircle size={12} /> {latestTask.error}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {latestTask.taskId && (
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(latestTask.taskId);
                    }}
                    style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <Copy size={12} /> 复制 taskId
                  </button>
                )}
                {isActiveVideoTask(latestTask.status) && (
                  <button
                    onClick={() => vid.cancelTask(latestTask.id)}
                    style={{ padding: '7px 12px', borderRadius: 10, border: 'none', background: `${T.red}18`, color: T.red, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                  >
                    取消任务
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {vid.completedVideos.length === 0 ? (
          <EmptyPanelState
            title="还没有视频结果"
            body="历史视频结果会显示在这里，方便回看、下载和继续发起对话。"
            action="提交视频任务后，结果会出现在这里。"
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {vid.completedVideos.map(v => (
              <div key={v.id} style={{ ...panelStyle(), borderRadius: 18, padding: 12 }}>
                <VideoThumbnail src={v.url} onClick={() => vid.setPreviewUrl(v.url)} />
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
          {vid.tasks.length === 0 && <EmptyPanelState title="还没有视频任务" body="这里会展示视频任务的提交、轮询、完成和失败状态。" action="提交任务后，可以回到这里查看进度和 taskId。" />}
          {vid.tasks.map(t => (
            <div key={t.id} onClick={() => setDetailTask(t)} style={{ ...mutedPanelStyle(), padding: 14, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={chipStyle(taskStatusColor(t.status, T))}>{getVideoTaskStatusLabel(t.status)}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{t.model}</span>
                </div>
                {isActiveVideoTask(t.status) && <button onClick={e => { e.stopPropagation(); vid.cancelTask(t.id); }} style={{ border: 'none', background: 'transparent', color: T.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>终止</button>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{t.prompt}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6, wordBreak: 'break-all' }}>
                taskId: {t.taskId || '等待返回'}
              </div>
              <TaskTimer task={t} now={now} />
              {t.error && <div style={{ fontSize: 11, color: T.red, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={10} /> {t.error.slice(0, 120)}</div>}
            </div>
          ))}
        </div>
      </WorkbenchInsightCard>

      {resumePollingCard}

      <WorkbenchInsightCard eyebrow="Snapshot">
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 8 }}>当前状态</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          <span style={chipStyle(T.purple)}>功能启用</span>
          <span style={chipStyle(vid.mode === 'image' ? T.green : undefined)}>{vid.mode === 'image' ? '图生视频' : '文生视频'}</span>
          <span style={chipStyle(vid.activeCount > 0 ? T.orange : undefined)}>{vid.activeCount} 个运行中</span>
          <span style={chipStyle(vid.completedVideos.length > 0 ? T.blue : undefined)}>{vid.completedVideos.length} 个结果</span>
        </div>
      </WorkbenchInsightCard>
    </div>
  );

  return (
    <>
      <FullscreenViewer url={vid.previewUrl} mediaType="video" onClose={() => vid.setPreviewUrl(null)} />
      {detailTask && <TaskDetailModal task={detailTask as any} type="video" onClose={() => setDetailTask(null)} onApply={t => { vid.setPrompt(t.prompt); vid.setModel(t.model); }} />}
      <MediaWorkbench
        eyebrow="Video"
        title="视频工作台"
        description="统一查看视频参数、任务记录与结果画廊。"
        icon={<Clapperboard size={20} />}
        toolbarTitle="当前状态"
        toolbarMeta={videoGenerationDisabled ? '视频生成暂时停用' : (latestTask ? `${getVideoTaskStatusLabel(latestTask.status)}${latestTask.taskId ? ` · ${latestTask.taskId}` : ''}` : (vid.model || '还没有选择模型'))}
        toolbarChips={<><span style={chipStyle(T.purple)}>已启用</span><span style={chipStyle(vid.activeCount > 0 ? T.orange : undefined)}>{vid.activeCount} 个运行中</span><span style={chipStyle(vid.completedVideos.length > 0 ? T.blue : undefined)}>{vid.completedVideos.length} 个结果</span></>}
        sidebar={controlContent}
        main={mainContent}
        insight={insightContent}
      />
    </>
  );
}
