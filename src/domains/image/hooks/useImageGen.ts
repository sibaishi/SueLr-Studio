import { useState, useEffect, useRef, useCallback, useMemo, type MutableRefObject } from 'react';
import type { ApiConfig, ModelInfo, ImgTask, GalleryItem, BridgeRef } from '@/shared/types';
import type { ProviderConfig } from '@/shared/providers';
import { gid } from '@/shared/runtime';
import { compressImage } from '@/shared/runtime/image';
import { createProvider } from '@/shared/providers';
import { buildApiConfigPayload, resolveModelConfig, resolveProviderModelId, resolveSelectedModel } from '@/shared/providers/model-routing';
import { clearGallery as clearStoredGallery, loadGallery, saveImage } from '@/shared/api/assistant';
import { useToast } from '@/providers/ToastContext';

function roundToNearest16(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return String(Math.max(16, Math.round(numeric / 16) * 16));
}

function resolveSizing(ratio: string, width: string, height: string) {
  const normalizedWidth = width.trim() ? roundToNearest16(width) : '';
  const normalizedHeight = height.trim() ? roundToNearest16(height) : '';
  const hasExplicitSize = Boolean(normalizedWidth && normalizedHeight);

  if (hasExplicitSize) {
    return {
      width: Number(normalizedWidth),
      height: Number(normalizedHeight),
      effectiveSize: `${normalizedWidth}x${normalizedHeight}`,
      sizeSource: 'dimensions' as const,
    };
  }

  if (ratio && ratio !== 'auto') {
    return {
      width: undefined,
      height: undefined,
      effectiveSize: ratio,
      sizeSource: 'ratio' as const,
    };
  }

  return {
    width: undefined,
    height: undefined,
    effectiveSize: 'auto',
    sizeSource: 'auto' as const,
  };
}

function formatImageGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const detail = message.trim().slice(0, 80);
  return detail
    ? `图片生成失败，请检查模型配置或稍后重试。${detail}`
    : '图片生成失败，请检查模型配置或稍后重试。';
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

export function useImageGen(
  base: string,
  apiKey: string,
  apiConfigs: ApiConfig[],
  models: ModelInfo[],
  addLog: (level: string, message: string) => void,
  bridgeRef: MutableRefObject<BridgeRef>,
  providerConfig?: ProviderConfig,
) {
  const toast = useToast();
  const [tasks, setTasks] = useState<ImgTask[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState('auto');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'auto'>('auto');
  const [resolution, setResolution] = useState<'auto' | '512px' | '1k' | '2k' | '4k'>('auto');
  const [count, setCount] = useState(1);
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [refImages, setRefImages] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const processingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const tasksRef = useRef(tasks);
  const addLogRef = useRef(addLog);
  const abortMap = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  const imgModels = useMemo(() => models.filter((item) => item.cat === 'image'), [models]);
  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === 'queued' || task.status === 'processing').length,
    [tasks],
  );

  const selectModel = useCallback((nextModel: string) => {
    setModel(nextModel);
  }, []);

  const addToGallery = useCallback((items: GalleryItem[]) => {
    setGallery((prev) => [...items, ...prev]);
  }, []);

  useEffect(() => {
    bridgeRef.current.addToImageGallery = addToGallery;
  }, [addToGallery, bridgeRef]);

  useEffect(() => {
    void loadGallery().then((items) => {
      setGallery(Array.isArray(items) ? items : []);
    });
  }, []);

  useEffect(() => {
    return () => {
      Object.values(abortMap.current).forEach((controller) => controller.abort());
    };
  }, []);

  const processNext = useCallback(() => {
    if (processingRef.current || queueRef.current.length === 0) return;

    const nextTaskId = queueRef.current.shift();
    if (!nextTaskId) return;

    const task = tasksRef.current.find((item) => item.id === nextTaskId);
    if (!task || task.status === 'cancelled') {
      setTimeout(() => processNext(), 10);
      return;
    }

    processingRef.current = true;
    setTasks((prev) =>
      prev.map((item) => (
        item.id === nextTaskId ? { ...item, status: 'processing' as const } : item
      )),
    );

    const controller = new AbortController();
    abortMap.current[nextTaskId] = controller;
    addLogRef.current('info', `[Image] 开始生成 ${task.prompt.slice(0, 30)}... (${task.model})`);

    const taskModelInfo = resolveSelectedModel(imgModels, task.model);
    const taskConfig = resolveModelConfig(apiConfigs, taskModelInfo);
    const provider = createProvider(
      taskConfig?.base || base,
      taskConfig?.apiKey || apiKey,
      taskConfig?.providerConfig || providerConfig,
    );

    provider
      .generateImage({
        model: resolveProviderModelId(imgModels, task.model),
        prompt: task.prompt,
        ratio: task.ratio,
        width: task.width,
        height: task.height,
        quality: task.quality && task.quality !== 'auto' ? task.quality : undefined,
        resolution: task.resolution,
        n: task.n,
        output_format: task.output_format,
        image: task.refImages,
        apiConfig: buildApiConfigPayload(taskConfig, {
          apiKey,
          baseUrl: base,
          providerConfig,
        }),
        signal: controller.signal,
      })
      .then(async (result) => {
        const images = result.images || [];
        addLogRef.current('success', `[Image] 生成完成，获得 ${images.length} 张图片`);
        toast(`图片生成完成，获得 ${images.length} 张图片`, 'success');

        const newItems: GalleryItem[] = await Promise.all(
          images.map(async (url, index) => {
            const ts = Date.now();
            const id = `${nextTaskId}_${index}`;
            const persisted = await saveImage(
              url.startsWith('data:image/')
                ? { id, data: url, prompt: task.prompt, model: task.model, ts }
                : { id, url, prompt: task.prompt, model: task.model, ts },
            );

            return {
              id,
              url: persisted?.localUrl || url,
              thumbnailUrl: persisted?.thumbnailUrl || '',
              prompt: task.prompt,
              model: task.model,
              ts,
            };
          }),
        );

        setTasks((prev) =>
          prev.map((item) => (
            item.id === nextTaskId ? { ...item, status: 'done' as const, images } : item
          )),
        );
        setGallery((prev) => [...newItems, ...prev]);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          addLogRef.current('warn', '[Image] 任务已取消');
          setTasks((prev) =>
            prev.map((item) => (
              item.id === nextTaskId ? { ...item, status: 'cancelled' as const } : item
            )),
          );
          return;
        }

        const message = toErrorMessage(error);
        addLogRef.current('error', `[Image] 生成失败: ${message}`);
        toast(formatImageGenerationError(error), 'error');
        setTasks((prev) =>
          prev.map((item) => (
            item.id === nextTaskId ? { ...item, status: 'failed' as const, error: message } : item
          )),
        );
      })
      .finally(() => {
        processingRef.current = false;
        delete abortMap.current[nextTaskId];
        setTimeout(() => processNext(), 100);
      });
  }, [apiConfigs, apiKey, base, imgModels, providerConfig, toast]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !model) return;

    const sizing = resolveSizing(ratio, width, height);
    const selectedModel = resolveSelectedModel(imgModels, model);
    const task: ImgTask = {
      id: gid(),
      prompt: prompt.trim(),
      model,
      configId: selectedModel?.configId,
      ratio,
      width: sizing.width,
      height: sizing.height,
      quality,
      resolution,
      n: count,
      output_format: outputFormat,
      refImages: mode === 'image' ? refImages : [],
      effectiveSize: sizing.effectiveSize,
      sizeSource: sizing.sizeSource,
      status: 'queued',
      images: [],
      ts: Date.now(),
    };

    setTasks((prev) => [task, ...prev]);
    queueRef.current.push(task.id);
    addLog('info', `[Image] 任务已提交 ${task.prompt.slice(0, 30)}...`);
    setTimeout(() => processNext(), 0);
  }, [prompt, model, ratio, width, height, quality, resolution, count, outputFormat, mode, refImages, addLog, processNext, imgModels]);

  const cancelTask = useCallback((id: string) => {
    queueRef.current = queueRef.current.filter((queuedId) => queuedId !== id);
    if (abortMap.current[id]) {
      abortMap.current[id].abort();
      delete abortMap.current[id];
    }

    setTasks((prev) =>
      prev.map((item) => (
        item.id === id && (item.status === 'queued' || item.status === 'processing')
          ? { ...item, status: 'cancelled' as const }
          : item
      )),
    );
  }, []);

  const cancelAll = useCallback(() => {
    queueRef.current = [];
    Object.values(abortMap.current).forEach((controller) => controller.abort());
  }, []);

  const downloadImg = useCallback((url: string, name: string) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    if (!url.startsWith('data:')) {
      anchor.target = '_blank';
    }
    anchor.click();
  }, []);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const base64 = await compressImage(file);
      setRefImages((prev) => [...prev, base64]);
    }
  }, []);

  const clearGallery = useCallback(() => {
    setGallery([]);
    void clearStoredGallery();
  }, []);

  return {
    tasks,
    gallery,
    model,
    prompt,
    ratio,
    width,
    height,
    quality,
    resolution,
    count,
    outputFormat,
    mode,
    refImages,
    previewUrl,
    imgModels,
    activeCount,
    setModel: selectModel,
    setPrompt,
    setRatio,
    setWidth,
    setHeight,
    setQuality,
    setResolution,
    setCount,
    setOutputFormat,
    setMode,
    setRefImages,
    setPreviewUrl,
    normalizeWidth: () => setWidth((value) => roundToNearest16(value)),
    normalizeHeight: () => setHeight((value) => roundToNearest16(value)),
    handleGenerate,
    cancelTask,
    cancelAll,
    downloadImg,
    handleFileUpload,
    clearGallery,
  };
}
