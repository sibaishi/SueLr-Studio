import { useState, useEffect, useRef, useCallback, useMemo, type MutableRefObject } from 'react';
import type { ModelInfo, GalleryItem, VTask, BridgeRef } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { gid } from '@/lib/utils';
import { fileToB64, compressImage } from '@/lib/image';
import { useProvider } from '.';
import { useToast } from '@/contexts/ToastContext';
import { clearVideos, loadVideos, saveVideo } from '@/domains/assistant';
import { startVideoPoll, waitForVideoCompletion } from '@/lib/videoPoll';

function formatVideoGenerationError(error: string) {
  const detail = String(error || '未知错误').trim().slice(0, 80);
  return detail
    ? `视频生成失败，请检查模型配置、网络连接或稍后重试。${detail}`
    : '视频生成失败，请检查模型配置、网络连接或稍后重试。';
}

export function useVideoGen(
  base: string,
  apiKey: string,
  models: ModelInfo[],
  addLog: (l: string, m: string) => void,
  bridgeRef: MutableRefObject<BridgeRef>,
  providerConfig?: ProviderConfig,
  videoStreamingMode: 'stream' | 'non-stream' = 'stream',
) {
  const toast = useToast();
  const [tasks, setTasks] = useState<VTask[]>([]);
  const [completedVideos, setCompletedVideos] = useState<GalleryItem[]>([]);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState('720p');
  const [vidRatio, setVidRatio] = useState('16:9');
  const [refImages, setRefImages] = useState<string[]>([]);
  const [audioFile, setAudioFile] = useState<{ name: string; type: string; data: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const pollRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const abortMap = useRef<Record<string, AbortController>>({});
  const { baseR, keyR, getProvider } = useProvider(base, apiKey, providerConfig);

  const vidModels = useMemo(() => models.filter(m => m.cat === 'video'), [models]);
  const activeCount = useMemo(() => tasks.filter(t => t.status === '提交中' || t.status === '处理中').length, [tasks]);
  const vlog = useCallback((msg: string) => addLog('info', `[Video] ${msg}`), [addLog]);

  useEffect(() => {
    if (model && !vidModels.some((item) => item.id === model)) {
      setModel('');
    }
  }, [model, vidModels]);

  const addToCompleted = useCallback((item: GalleryItem) => {
    setCompletedVideos(prev => [item, ...prev]);
  }, []);

  useEffect(() => { bridgeRef.current.addToVideoGallery = addToCompleted; }, [addToCompleted, bridgeRef]);

  useEffect(() => {
    loadVideos().then(items => {
      if (items.length > 0) setCompletedVideos(items);
    });
  }, []);

  useEffect(() => {
    return () => {
      Object.values(abortMap.current).forEach(ac => ac.abort());
      Object.values(pollRefs.current).forEach(id => clearInterval(id));
    };
  }, []);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) {
        const b64 = await compressImage(f);
        setRefImages(prev => [...prev, b64]);
      }
      if (f.type.startsWith('audio/')) {
        const b64 = await fileToB64(f);
        setAudioFile({ name: f.name, type: f.type, data: b64 });
      }
    }
  }, []);

  const submit = useCallback(async () => {
    if (!prompt.trim() || !model) return;
    const id = gid();
    const task: VTask = { id, taskId: '', status: '提交中', prompt: prompt.trim(), model, params: `${resolution} ${vidRatio} ${duration}s` };
    setTasks(prev => [task, ...prev]);
    vlog(`提交任务: ${prompt.slice(0, 30)}...`);

    const ac = new AbortController();
    abortMap.current[id] = ac;

    try {
      const { taskId: tid } = await getProvider().submitVideoGeneration({
        model,
        prompt: prompt.trim(),
        duration,
        aspect_ratio: vidRatio,
        resolution,
        signal: ac.signal,
      });

      vlog(`任务已提交，ID: ${tid}`);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, taskId: tid, status: '处理中' } : t));

      const onSuccess = (url: string) => {
        vlog('视频生成完成');
        toast('视频生成完成', 'success');
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: '已完成', videoUrl: url } : t));
        const vidItem = { id, url, prompt: task.prompt, model, ts: Date.now() };
        setCompletedVideos(prev => [vidItem, ...prev]);
        void saveVideo(vidItem);
      };
      const onNoUrl = () => {
        vlog('任务完成但未获取到视频 URL');
        toast('视频任务已结束，但还没有拿到可播放地址，请稍后重试或查看日志。', 'error');
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: '失败', error: '未获取到视频 URL' } : t));
      };
      const onFailure = (err: string) => {
        vlog(`失败: ${err}`);
        toast(formatVideoGenerationError(err), 'error');
        setTasks(prev => prev.map(t => t.id === id ? { ...t, status: '失败', error: err } : t));
      };
      const onPollError = (errMsg: string) => {
        vlog(`轮询错误: ${errMsg}`);
      };

      if (videoStreamingMode === 'stream') {
        startVideoPoll({ taskId: tid, pollKey: id, pollRefs, baseR, keyR, onSuccess, onNoUrl, onFailure, onPollError });
      } else {
        await waitForVideoCompletion({ taskId: tid, baseR, keyR, onSuccess, onNoUrl, onFailure, onPollError });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        vlog(`提交失败: ${err.message}`);
        addLog('error', `[Video] 提交失败: ${err.message}`);
      }
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: '失败', error: err.message } : t));
    } finally {
      delete abortMap.current[id];
    }
  }, [prompt, model, resolution, vidRatio, duration, vlog, toast, addLog, baseR, keyR, getProvider, videoStreamingMode]);

  const cancelTask = useCallback((tid: string) => {
    if (abortMap.current[tid]) { abortMap.current[tid].abort(); delete abortMap.current[tid]; }
    if (pollRefs.current[tid]) { clearInterval(pollRefs.current[tid]); delete pollRefs.current[tid]; }
    setTasks(prev => prev.map(t =>
      t.id === tid && (t.status === '提交中' || t.status === '处理中')
        ? { ...t, status: '已取消' } : t
    ));
  }, []);

  const cancelAll = useCallback(() => {
    Object.values(abortMap.current).forEach(ac => ac.abort());
    Object.values(pollRefs.current).forEach(id => clearInterval(id));
  }, []);

  const clearCompleted = useCallback(() => {
    setCompletedVideos([]);
    void clearVideos();
  }, []);

  return {
    tasks, completedVideos, model, setModel, prompt, setPrompt, mode, setMode,
    duration, setDuration, resolution, setResolution, vidRatio, setVidRatio,
    refImages, setRefImages, audioFile, setAudioFile, previewUrl, setPreviewUrl,
    vidModels, activeCount,
    handleFileUpload, submit, cancelTask, cancelAll, clearCompleted,
  };
}
