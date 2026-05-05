import { useState, useEffect, useRef, useCallback, useMemo, type MutableRefObject } from 'react';
import type { ModelInfo, ImgTask, GalleryItem, BridgeRef } from '@/lib/types';
import type { ProviderConfig } from '@/lib/providers';
import { gid } from '@/lib/utils';
import { compressImage } from '@/lib/image';
import { useProvider } from '@/shared/hooks/provider';
import { clearGallery as clearStoredGallery, loadGallery, saveImage } from '@/shared/api/assistant';
import { useToast } from '@/contexts/ToastContext';

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
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'auto'>('high');
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
  const { getProvider } = useProvider(base, apiKey, providerConfig);

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
    addLogRef.current('info', `[Image] 开始生成: ${task.prompt.slice(0, 30)}... (${task.model})`);

    getProvider()
      .generateImage({
        model: task.model,
        prompt: task.prompt,
        ratio: task.ratio,
        width: task.width,
        height: task.height,
        quality: task.quality,
        n: task.n,
        output_format: task.output_format,
        image: task.refImages,
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
            const persistedUrl = await saveImage(
              url.startsWith('data:image/')
                ? { id, data: url, prompt: task.prompt, model: task.model, ts }
                : { id, url, prompt: task.prompt, model: task.model, ts },
            );

            return {
              id,
              url: persistedUrl || url,
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
  }, [getProvider, toast]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !model) return;

    const sizing = resolveSizing(ratio, width, height);
    const task: ImgTask = {
      id: gid(),
      prompt: prompt.trim(),
      model,
      ratio,
      width: sizing.width,
      height: sizing.height,
      quality,
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
    addLog('info', `[Image] 任务已提交: ${task.prompt.slice(0, 30)}...`);
    setTimeout(() => processNext(), 0);
  }, [prompt, model, ratio, width, height, quality, count, outputFormat, mode, refImages, addLog, processNext]);

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
