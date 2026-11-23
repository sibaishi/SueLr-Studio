import { ChatCircleText, FilmStrip, FlowArrow, ImageSquare, Waveform } from '@phosphor-icons/react';
import studioIcon from '../../build/icon.svg?inline';

/** Product introduction for onboarding and its component-library preview. */
export function StudioWelcome({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`studio-welcome ${compact ? 'studio-welcome--compact' : ''}`}>
      <div className="studio-welcome__identity">
        <img src={studioIcon} alt="" />
        <div>
          <strong>SueLr Studio</strong>
          <span>多模态创作工作室</span>
        </div>
      </div>
      <h1>让灵感连成作品。</h1>
      <p>
        在自由画布上连接素材、模型与创作步骤，
        <br />
        从一次尝试，到可以反复运行的工作流。
      </p>
      <div className="studio-welcome__flow" aria-label="素材、模型、作品的创作流程">
        <div>
          <ImageSquare size={24} />
          <span>素材</span>
        </div>
        <i />
        <div className="studio-welcome__flow-model">
          <FlowArrow size={28} />
          <span>模型与工作流</span>
        </div>
        <i />
        <div>
          <FilmStrip size={24} />
          <span>作品</span>
        </div>
      </div>
      <div className="studio-welcome__capabilities">
        <span>
          <ChatCircleText size={16} />
          对话
        </span>
        <span>
          <ImageSquare size={16} />
          图像
        </span>
        <span>
          <FilmStrip size={16} />
          视频
        </span>
        <span>
          <Waveform size={16} />
          音频
        </span>
      </div>
    </div>
  );
}
