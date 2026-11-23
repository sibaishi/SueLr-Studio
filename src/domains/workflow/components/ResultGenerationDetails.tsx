import { PanelButton } from '@/ui/PanelPrimitives';
import { MediaPlayer } from '@/ui/MediaPlayer';
import type { GenerationRecord } from '@/shared/types/generation';
import { ArrowCounterClockwise, ArrowSquareOut, Clipboard } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { GENERATION_PARAMETER_LABELS, generationParameterText } from '../lib/generationReuse';

export type GenerationAction = (record: GenerationRecord) => string | Promise<string>;
export type GenerationActions = { onReuseParameters?: GenerationAction; onBackfillReferences?: GenerationAction };

/** 真实结果和组件画布共用；只有调用方提供业务回调时才允许复用或回填。 */
export function ResultGenerationDetails({
  record,
  onReuseParameters,
  onBackfillReferences,
  onPreviewImage,
}: GenerationActions & {
  record?: GenerationRecord | null;
  onPreviewImage: (src: string) => void;
}) {
  const [feedback, setFeedback] = useState<{ text: string; error: boolean }>();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  async function act(action: () => string | Promise<string>) {
    setBusy(true);
    try {
      setFeedback({ text: await action(), error: false });
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : '操作失败，请重试。', error: true });
    } finally {
      setBusy(false);
    }
  }
  if (!record) return <p className="workflow-result-recipe__missing">此结果未记录生成信息。</p>;
  return (
    <div className="workflow-result-recipe" aria-label="当次生成信息">
      <RecipeSection
        title="使用提示词"
        action={
          record.prompt && (
            <PanelButton
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await navigator.clipboard.writeText(record.prompt);
                  return '提示词已复制';
                })
              }
            >
              <Clipboard size={12} />
              复制提示词
            </PanelButton>
          )
        }
      >
        {record.prompt ? (
          <>
            <p
              className={`workflow-result-recipe__prompt ${expanded ? '' : 'workflow-result-recipe__prompt--compact'}`}
            >
              {record.prompt}
            </p>
            {(record.prompt.length > 120 || record.prompt.split('\n').length > 3) && (
              <button
                type="button"
                className="workflow-result-recipe__expand"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? '收起提示词' : '展开完整提示词'}
              </button>
            )}
          </>
        ) : (
          <p className="workflow-result-recipe__muted">未使用文字提示词</p>
        )}
      </RecipeSection>
      <RecipeSection
        title="使用参考"
        action={
          record.references.length > 0 && (
            <PanelButton
              disabled={busy || !onBackfillReferences}
              title="将当次参考素材添加为新的 IO 节点"
              onClick={() => onBackfillReferences && void act(() => onBackfillReferences(record))}
            >
              <ArrowSquareOut size={12} />
              回填到画布
            </PanelButton>
          )
        }
      >
        {record.references.length ? (
          <div className="workflow-result-recipe__references">
            {record.references.map((reference, index) => (
              <div key={`${index}-${reference.kind}`} className="workflow-result-recipe__reference">
                {reference.kind === 'image' ? (
                  <button
                    type="button"
                    aria-label={`预览参考 ${index + 1}`}
                    onClick={() => onPreviewImage(reference.url)}
                  >
                    <img src={reference.url} alt={`参考 ${index + 1}`} loading="lazy" />
                  </button>
                ) : reference.kind === 'video' ? (
                  <MediaPlayer kind="video" src={reference.url} />
                ) : (
                  <MediaPlayer kind="audio" src={reference.url} />
                )}
                <span>
                  {reference.role === 'mask'
                    ? '蒙版'
                    : reference.kind === 'image'
                      ? '图片'
                      : reference.kind === 'video'
                        ? '视频'
                        : '音频'}{' '}
                  {index + 1}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="workflow-result-recipe__muted">未使用参考素材</p>
        )}
      </RecipeSection>
      <RecipeSection
        title="使用参数"
        action={
          <PanelButton
            disabled={busy || !onReuseParameters}
            title="复用到选中的 AI 节点；未选中时新建 AI 节点"
            onClick={() => onReuseParameters && void act(() => onReuseParameters(record))}
          >
            <ArrowCounterClockwise size={12} />
            复用参数
          </PanelButton>
        }
      >
        <dl className="workflow-result-recipe__parameters">
          {Object.entries(record.parameters)
            .filter(([key]) => GENERATION_PARAMETER_LABELS[key])
            .map(([key, value]) => (
              <div key={key} data-wide={key === 'model' || key === 'systemPrompt' || undefined}>
                <dt>{GENERATION_PARAMETER_LABELS[key]}</dt>
                <dd>{generationParameterText(key, value)}</dd>
              </div>
            ))}
        </dl>
      </RecipeSection>
      {feedback && (
        <p className="workflow-result-recipe__feedback" role={feedback.error ? 'alert' : 'status'}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
function RecipeSection({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) {
  return (
    <section className="workflow-result-recipe__section">
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}
