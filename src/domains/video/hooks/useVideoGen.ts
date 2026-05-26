import { useToast } from '@/providers/ToastContext';
import { clearVideos, loadVideos, saveVideo } from '@/shared/api/assistant';
import type { ApiConfigPayload } from '@/shared/api/capabilities';
import { useApiRefs } from '@/shared/hooks/provider';
import type { ProviderConfig } from '@/shared/providers';
import { createProvider } from '@/shared/providers';
import {
  buildApiConfigPayload,
  resolveModelConfig,
  resolveProviderModelId,
  resolveSelectedModel,
} from '@/shared/providers/model-routing';
import { gid } from '@/shared/runtime';
import { compressImage, fileToB64 } from '@/shared/runtime/image';
import { startVideoPoll, waitForVideoCompletion } from '@/shared/runtime/video-poll';
import type { ApiConfig, BridgeRef, GalleryItem, ModelInfo, VTask } from '@/shared/types';
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

function formatVideoGenerationError(error: string) {
  const detail = String(error || '未知错误')
    .trim()
    .slice(0, 160);
  return detail ? `视频生成失败：${detail}` : '视频生成失败，请检查模型配置、网络连接或稍后重试。';
}

function touchTask(task: VTask, patch: Partial<VTask>): VTask {
  return { ...task, ...patch, updatedAt: Date.now() };
}

function buildVideoPollApiConfigCandidates(
  apiConfigs: ApiConfig[],
  preferredConfigId: string | undefined,
  fallback: { apiKey: string; baseUrl: string; providerConfig?: ProviderConfig },
): ApiConfigPayload[] {
  const preferred = preferredConfigId ? apiConfigs.find((config) => config.id === preferredConfigId) || null : null;
  const orderedConfigs = [
    ...(preferred ? [preferred] : []),
    ...apiConfigs.filter((config) => config.id !== preferred?.id),
  ];
  const candidates = orderedConfigs.map((config) => buildApiConfigPayload(config, fallback));
  candidates.push(buildApiConfigPayload(null, fallback));

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = JSON.stringify({
      baseUrl: candidate.baseUrl || '',
      apiKey: candidate.apiKey || '',
      videoEndpoint: candidate.providerConfig?.videoEndpoint || '',
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function useVideoGen(
  base: string,
  apiKey: string,
  apiConfigs: ApiConfig[],
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
  const { baseR, keyR } = useApiRefs(base, apiKey);

  const vidModels = useMemo(() => models.filter((m) => m.cat === 'video'), [models]);
  const activeCount = useMemo(
    () => tasks.filter((t) => t.status === '提交中' || t.status === '处理中').length,
    [tasks],
  );
  const vlog = useCallback((msg: string) => addLog('info', `[Video] ${msg}`), [addLog]);

  useEffect(() => {
    if (model && !vidModels.some((item) => item.id === model || item.modelId === model)) {
      setModel('');
    }
  }, [model, vidModels]);

  const addToCompleted = useCallback((item: GalleryItem) => {
    setCompletedVideos((prev) => [item, ...prev]);
  }, []);

  useEffect(() => {
    bridgeRef.current.addToVideoGallery = addToCompleted;
  }, [addToCompleted, bridgeRef]);

  useEffect(() => {
    loadVideos().then((items) => {
      if (items.length > 0) setCompletedVideos(items);
    });
  }, []);

  useEffect(() => {
    return () => {
      Object.values(abortMap.current).forEach((ac) => ac.abort());
      Object.values(pollRefs.current).forEach((id) => clearInterval(id));
    };
  }, []);

  const handleFileUpload = useCallback(async (files: File[] | FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.type.startsWith('image/')) {
        const b64 = await compressImage(f);
        setRefImages((prev) => [...prev, b64]);
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
    const now = Date.now();
    const selectedModel = resolveSelectedModel(vidModels, model);
    const modelConfig = resolveModelConfig(apiConfigs, selectedModel);
    const providerModel = resolveProviderModelId(vidModels, model);
    const task: VTask = {
      id,
      taskId: '',
      status: '提交中',
      prompt: prompt.trim(),
      model: providerModel,
      configId: selectedModel?.configId,
      params: `${resolution} ${vidRatio} ${duration}s`,
      ts: now,
      updatedAt: now,
    };
    setTasks((prev) => [task, ...prev]);
    vlog(`提交任务: ${prompt.slice(0, 30)}...`);

    const ac = new AbortController();
    abortMap.current[id] = ac;

    try {
      const provider = createProvider(
        modelConfig?.base || base,
        modelConfig?.apiKey || apiKey,
        modelConfig?.providerConfig || providerConfig,
      );
      const { taskId: tid } = await provider.submitVideoGeneration({
        model: providerModel,
        prompt: prompt.trim(),
        duration,
        aspect_ratio: vidRatio,
        resolution,
        image_url: mode === 'image' ? refImages[0] : undefined,
        input_audio: audioFile?.data,
        apiConfig: buildApiConfigPayload(modelConfig, { apiKey, baseUrl: base, providerConfig }),
        signal: ac.signal,
      });

      vlog(`任务已提交，ID: ${tid}`);
      setTasks((prev) => prev.map((t) => (t.id === id ? touchTask(t, { taskId: tid || '', status: '处理中' }) : t)));

      const onSuccess = (url: string, candidateUrls?: string[]) => {
        vlog('视频生成完成');
        toast('视频生成完成', 'success');
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? touchTask(t, { status: '已完成', videoUrl: url, error: undefined }) : t)),
        );
        const vidItem = { id, url, candidateUrls, prompt: task.prompt, model: providerModel, ts: Date.now() };
        void saveVideo(vidItem)
          .then((persistedUrl) => {
            const finalUrl = persistedUrl || url;
            setCompletedVideos((prev) => [
              { id, url: finalUrl, prompt: task.prompt, model: providerModel, ts: vidItem.ts },
              ...prev,
            ]);
            if (!persistedUrl) return;
            setTasks((prev) =>
              prev.map((item) => (item.id === id ? touchTask(item, { videoUrl: persistedUrl }) : item)),
            );
          })
          .catch(() => {
            setCompletedVideos((prev) => [
              { id, url, prompt: task.prompt, model: providerModel, ts: vidItem.ts },
              ...prev,
            ]);
          });
      };

      const onNoUrl = () => {
        const error = '任务已完成，但没有返回可播放的视频地址';
        vlog(error);
        toast(error, 'error');
        setTasks((prev) => prev.map((t) => (t.id === id ? touchTask(t, { status: '失败', error }) : t)));
      };

      const onFailure = (err: string) => {
        vlog(`失败: ${err}`);
        toast(formatVideoGenerationError(err), 'error');
        setTasks((prev) => prev.map((t) => (t.id === id ? touchTask(t, { status: '失败', error: err }) : t)));
      };

      const onPollError = (errMsg: string) => {
        vlog(`轮询错误: ${errMsg}`);
      };

      const onStatusUpdate = (status: string) => {
        setTasks((prev) =>
          prev.map((task) => (task.id === id ? touchTask(task, { status: status as VTask['status'] }) : task)),
        );
      };

      const pollBaseR = { current: modelConfig?.base || baseR.current };
      const pollKeyR = { current: modelConfig?.apiKey || keyR.current };
      const pollApiConfig = buildApiConfigPayload(modelConfig, { apiKey, baseUrl: base, providerConfig });
      if (videoStreamingMode === 'stream') {
        startVideoPoll({
          taskId: tid || '',
          pollKey: id,
          pollRefs,
          baseR: pollBaseR,
          keyR: pollKeyR,
          apiConfig: pollApiConfig,
          onSuccess,
          onNoUrl,
          onFailure,
          onPollError,
          onStatusUpdate,
        });
      } else {
        await waitForVideoCompletion({
          taskId: tid || '',
          baseR: pollBaseR,
          keyR: pollKeyR,
          apiConfig: pollApiConfig,
          onSuccess,
          onNoUrl,
          onFailure,
          onPollError,
          onStatusUpdate,
        });
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : String(err);
        vlog(`提交失败: ${message}`);
        addLog('error', `[Video] 提交失败: ${message}`);
        toast(formatVideoGenerationError(message), 'error');
        setTasks((prev) => prev.map((t) => (t.id === id ? touchTask(t, { status: '失败', error: message }) : t)));
      }
    } finally {
      delete abortMap.current[id];
    }
  }, [
    prompt,
    model,
    resolution,
    vidRatio,
    duration,
    mode,
    refImages,
    audioFile,
    vlog,
    toast,
    addLog,
    baseR,
    keyR,
    videoStreamingMode,
    vidModels,
    apiConfigs,
    base,
    apiKey,
    providerConfig,
  ]);

  const resumeTaskPolling = useCallback(
    async (taskId: string) => {
      const normalizedTaskId = String(taskId || '').trim();
      if (!normalizedTaskId) {
        throw new Error('taskId 不能为空');
      }

      const existingTask = tasks.find((task) => task.taskId === normalizedTaskId);
      const pollKey = existingTask?.id || gid();
      const now = Date.now();
      const taskRecord: VTask = existingTask || {
        id: pollKey,
        taskId: normalizedTaskId,
        status: '处理中',
        prompt: `手动继续轮询: ${normalizedTaskId}`,
        model: 'manual',
        params: 'resume by taskId',
        ts: now,
        updatedAt: now,
      };

      if (!existingTask) {
        setTasks((prev) => [taskRecord, ...prev]);
      } else {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === existingTask.id ? touchTask(task, { status: '处理中', error: undefined }) : task,
          ),
        );
      }

      vlog(`继续轮询视频任务: ${normalizedTaskId}`);

      const onSuccess = (url: string, candidateUrls?: string[]) => {
        vlog(`手动轮询完成: ${normalizedTaskId}`);
        toast('视频生成完成', 'success');
        setTasks((prev) =>
          prev.map((task) =>
            task.id === pollKey ? touchTask(task, { status: '已完成', videoUrl: url, error: undefined }) : task,
          ),
        );
        const vidItemId = gid();
        const vidTs = Date.now();
        void saveVideo({
          id: vidItemId,
          url,
          candidateUrls,
          prompt: taskRecord.prompt,
          model: taskRecord.model,
          ts: vidTs,
        })
          .then((persistedUrl) => {
            const finalUrl = persistedUrl || url;
            setCompletedVideos((prev) => [
              { id: vidItemId, url: finalUrl, prompt: taskRecord.prompt, model: taskRecord.model, ts: vidTs },
              ...prev,
            ]);
            if (!persistedUrl) return;
            setTasks((prev) =>
              prev.map((item) => (item.id === pollKey ? touchTask(item, { videoUrl: persistedUrl }) : item)),
            );
          })
          .catch(() => {
            setCompletedVideos((prev) => [
              { id: vidItemId, url, prompt: taskRecord.prompt, model: taskRecord.model, ts: vidTs },
              ...prev,
            ]);
          });
      };

      const onNoUrl = () => {
        const error = '任务已完成，但没有返回可播放的视频地址';
        vlog(`手动轮询完成但无 URL: ${normalizedTaskId}`);
        toast(error, 'error');
        setTasks((prev) =>
          prev.map((task) => (task.id === pollKey ? touchTask(task, { status: '失败', error }) : task)),
        );
      };

      const onFailure = (error: string) => {
        vlog(`手动轮询失败: ${normalizedTaskId}; ${error}`);
        toast(formatVideoGenerationError(error), 'error');
        setTasks((prev) =>
          prev.map((task) => (task.id === pollKey ? touchTask(task, { status: '失败', error }) : task)),
        );
      };

      const onPollError = (error: string) => {
        vlog(`手动轮询请求异常: ${normalizedTaskId}; ${error}`);
      };

      const onStatusUpdate = (status: string) => {
        setTasks((prev) =>
          prev.map((task) =>
            task.id === pollKey ? touchTask(task, { status: status as VTask['status'], error: undefined }) : task,
          ),
        );
      };

      const apiConfigCandidates = buildVideoPollApiConfigCandidates(apiConfigs, existingTask?.configId, {
        apiKey,
        baseUrl: base,
        providerConfig,
      });
      vlog(`Manual polling will try ${apiConfigCandidates.length} API config(s).`);

      if (videoStreamingMode === 'stream') {
        startVideoPoll({
          taskId: normalizedTaskId,
          pollKey,
          pollRefs,
          baseR,
          keyR,
          apiConfigCandidates,
          onSuccess,
          onNoUrl,
          onFailure,
          onPollError,
          onStatusUpdate,
        });
        return;
      }

      await waitForVideoCompletion({
        taskId: normalizedTaskId,
        baseR,
        keyR,
        apiConfigCandidates,
        onSuccess,
        onNoUrl,
        onFailure,
        onPollError,
        onStatusUpdate,
      });
    },
    [tasks, vlog, toast, videoStreamingMode, baseR, keyR, apiConfigs, apiKey, base, providerConfig],
  );

  const cancelTask = useCallback((tid: string) => {
    if (abortMap.current[tid]) {
      abortMap.current[tid].abort();
      delete abortMap.current[tid];
    }
    if (pollRefs.current[tid]) {
      clearInterval(pollRefs.current[tid]);
      delete pollRefs.current[tid];
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === tid && (t.status === '提交中' || t.status === '处理中') ? touchTask(t, { status: '已取消' }) : t,
      ),
    );
  }, []);

  const cancelAll = useCallback(() => {
    Object.values(abortMap.current).forEach((ac) => ac.abort());
    Object.values(pollRefs.current).forEach((id) => clearInterval(id));
  }, []);

  const clearCompleted = useCallback(() => {
    setCompletedVideos([]);
    void clearVideos();
  }, []);

  return {
    tasks,
    completedVideos,
    model,
    setModel,
    prompt,
    setPrompt,
    mode,
    setMode,
    duration,
    setDuration,
    resolution,
    setResolution,
    vidRatio,
    setVidRatio,
    refImages,
    setRefImages,
    audioFile,
    setAudioFile,
    previewUrl,
    setPreviewUrl,
    vidModels,
    activeCount,
    handleFileUpload,
    submit,
    resumeTaskPolling,
    cancelTask,
    cancelAll,
    clearCompleted,
  };
}
