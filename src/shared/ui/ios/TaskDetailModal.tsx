import { X } from 'lucide-react';
import { useT } from '@/providers/ThemeContext';
import type { ImgTask } from '@/shared/types';
import { ftime } from '@/shared/runtime';
import { taskStatusColor, taskStatusLabel } from '@/shared/ui/status';
import { glass, lightOverlay } from './glass';
import { IOSButton } from './IOSButton';

export function TaskDetailModal({
  task,
  type,
  onClose,
  onApply,
}: {
  task: ImgTask | null;
  type: 'image' | 'video';
  onClose: () => void;
  onApply: (task: ImgTask) => void;
}) {
  const T = useT();

  if (!task) return null;

  const isImage = type === 'image';
  const sizeLabel =
    task.width && task.height
      ? `${task.width} x ${task.height}${task.sizeSource === 'dimensions' ? '（已优先使用）' : ''}`
      : task.ratio !== 'auto'
        ? `${task.ratio}（按比例）`
        : '自动';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99990,
        background: lightOverlay(T),
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          ...glass(0.1),
          borderRadius: 20,
          padding: 24,
          maxWidth: 520,
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          border: `1px solid ${T.border}`,
          boxShadow: '0 20px 48px rgba(15,23,42,0.18), 0 4px 12px rgba(15,23,42,0.10)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>任务详情</span>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              ...glass(0.1),
              border: `1px solid ${T.border}`,
              color: T.text2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>提示词</div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{task.prompt}</div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>模型</div>
              <div style={{ fontSize: 13, color: T.text }}>{task.model}</div>
            </div>
            {isImage && (
              <div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>比例</div>
                <div style={{ fontSize: 13, color: T.text }}>{task.ratio}</div>
              </div>
            )}
          </div>

          {isImage && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>宽高</div>
                <div style={{ fontSize: 13, color: T.text }}>{sizeLabel}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>质量</div>
                <div style={{ fontSize: 13, color: T.text }}>{task.quality || '默认'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>张数</div>
                <div style={{ fontSize: 13, color: T.text }}>{task.n || 1}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>格式</div>
                <div style={{ fontSize: 13, color: T.text }}>{task.output_format || 'png'}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>状态</div>
              <div style={{ fontSize: 13, color: taskStatusColor(task.status, T), fontWeight: 600 }}>
                {taskStatusLabel(task.status)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>时间</div>
              <div style={{ fontSize: 13, color: T.text }}>{ftime(task.ts)}</div>
            </div>
          </div>

          {task.refImages && task.refImages.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>参考图片</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {task.refImages.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt=""
                    style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${T.border}` }}
                  />
                ))}
              </div>
            </div>
          )}

          {task.images && task.images.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>生成结果</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {task.images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt=""
                    style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 10, border: `1px solid ${T.border}` }}
                  />
                ))}
              </div>
            </div>
          )}

          {task.error && (
            <div style={{ ...glass(0.06), borderRadius: 12, padding: 12, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 11, color: T.red, marginBottom: 4, fontWeight: 600 }}>错误信息</div>
              <div style={{ fontSize: 12, color: T.red, opacity: 0.8, wordBreak: 'break-all' }}>{task.error}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <IOSButton label="一键套用" onClick={() => onApply(task)} color={T.blue} small />
            <IOSButton label="关闭" onClick={onClose} color={T.text2} small />
          </div>
        </div>
      </div>
    </div>
  );
}
