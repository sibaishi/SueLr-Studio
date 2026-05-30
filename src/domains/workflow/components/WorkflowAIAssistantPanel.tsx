import { createWorkflowDraft, type WorkflowDraftResponse } from '@/domains/workflow/lib/api';
import { getNodeDef } from '@/domains/workflow/lib/constants';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';

interface WorkflowAIAssistantPanelProps {
  onClose: () => void;
  onApplyDraft: (draft: WorkflowDraftResponse) => void;
}

const EXAMPLE_PROMPT = '帮我做一个商品图生成工作流，输入产品图和一句卖点，输出 6 张不同风格的电商主图。';

const DOMAIN_LABELS: Record<WorkflowDraftResponse['intent']['domain'], string> = {
  'ecommerce-image': '电商图片',
  'brand-visual': '品牌视觉',
  'social-image': '社媒图片',
  'generic-image': '通用图片',
  'chat-text': '对话文本',
  'video-generation': '视频生成',
};

const APPROVAL_LABELS: Record<string, { title: string; description: string }> = {
  applyDraft: {
    title: '确认新建草案画布',
    description: '草案会打开为新的未保存画布，不会覆盖当前画布，也不会自动保存到工作流库。',
  },
  saveWorkflow: {
    title: '手动保存工作流',
    description: '应用后如需长期保留，需要点击工具栏保存。',
  },
  executeWorkflow: {
    title: '手动执行工作流',
    description: '草案不会自动运行，执行前仍由你确认输入和参数。',
  },
  highCostGeneration: {
    title: '确认生成成本',
    description: '包含图像生成节点，运行前需要确认模型、次数和额度。',
  },
};

const ISSUE_GUIDANCE: Partial<Record<string, string>> = {
  MODEL_MISSING: '应用草案后，打开图像生成节点，在模型字段选择可用模型后再执行。',
};

function formatApproval(approval: string) {
  return (
    APPROVAL_LABELS[approval] || {
      title: approval,
      description: '应用前需要你确认这一项。',
    }
  );
}

export default function WorkflowAIAssistantPanel({ onClose, onApplyDraft }: WorkflowAIAssistantPanelProps) {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT);
  const [draft, setDraft] = useState<WorkflowDraftResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const nodePreview = useMemo(() => {
    if (!draft) return [];
    return draft.workflow.nodes.map((node) => {
      const definition = getNodeDef(node.type);
      return {
        id: node.id,
        label: definition?.label || node.type,
        type: node.type,
      };
    });
  }, [draft]);

  const handleGenerateDraft = () => {
    const input = prompt.trim();
    if (!input || isGenerating) return;

    void (async () => {
      setIsGenerating(true);
      setErrorMessage(null);
      try {
        const result = await createWorkflowDraft({ input });
        if (!result.success || !result.data) {
          setErrorMessage(result.error || '草案生成失败');
          return;
        }
        setDraft(result.data);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '草案生成失败');
      } finally {
        setIsGenerating(false);
      }
    })();
  };

  return (
    <aside className="workflow-ai-assistant" aria-label="AI 工作流助手">
      <div className="workflow-ai-assistant__header">
        <div className="workflow-ai-assistant__title">
          <span>
            <Sparkles size={16} />
          </span>
          AI 工作流助手
        </div>
        <button type="button" className="workflow-ai-assistant__close" onClick={onClose} aria-label="关闭 AI 助手">
          <X size={16} />
        </button>
      </div>

      <div className="workflow-ai-assistant__body">
        <label className="workflow-ai-assistant__field">
          <span>需求</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            maxLength={12000}
            placeholder="描述你想搭建的工作流"
          />
        </label>

        <button
          type="button"
          className="workflow-ai-assistant__generate"
          onClick={handleGenerateDraft}
          disabled={isGenerating || !prompt.trim()}
        >
          {isGenerating ? <Loader2 size={15} className="workflow-ai-assistant__spin" /> : <Sparkles size={15} />}
          {isGenerating ? '生成中' : '生成草案'}
        </button>

        {errorMessage && <div className="workflow-ai-assistant__error">{errorMessage}</div>}

        {draft && (
          <div className="workflow-ai-assistant__preview">
            <section className="workflow-ai-assistant__summary">
              <div>
                <span>草案</span>
                <strong>{draft.workflow.name}</strong>
              </div>
              <div>
                <span>类型</span>
                <strong>{DOMAIN_LABELS[draft.intent.domain]}</strong>
              </div>
              <div>
                <span>输出</span>
                <strong>{draft.intent.outputCount} 张</strong>
              </div>
            </section>

            <section className="workflow-ai-assistant__section">
              <div className="workflow-ai-assistant__section-title">节点预览</div>
              <div className="workflow-ai-assistant__nodes">
                {nodePreview.map((node, index) => (
                  <div key={node.id} className="workflow-ai-assistant__node">
                    <span>{index + 1}</span>
                    <div>
                      <strong>{node.label}</strong>
                      <small>{node.type}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {draft.knowledgeContext && draft.knowledgeContext.items.length > 0 && (
              <div className="workflow-ai-assistant__knowledge-note">
                已根据当前可用节点和本地工作流知识生成草案。
              </div>
            )}

            <section className="workflow-ai-assistant__section">
              <div className="workflow-ai-assistant__section-title">校验</div>
              {draft.validation.issues.length === 0 ? (
                <div className="workflow-ai-assistant__check">
                  <CheckCircle2 size={15} />
                  未发现阻断问题
                </div>
              ) : (
                <div className="workflow-ai-assistant__issues">
                  {draft.validation.issues.map((issue) => (
                    <div
                      key={`${issue.code}-${issue.nodeId || issue.edgeId || issue.message}`}
                      className={`workflow-ai-assistant__issue workflow-ai-assistant__issue--${issue.severity}`}
                    >
                      <AlertTriangle size={14} />
                      <div>
                        <strong>{issue.severity === 'error' ? '错误' : '提醒'}</strong>
                        <span>{issue.message}</span>
                        {ISSUE_GUIDANCE[issue.code] && (
                          <small className="workflow-ai-assistant__issue-guidance">{ISSUE_GUIDANCE[issue.code]}</small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {draft.approvalsRequired.length > 0 && (
              <section className="workflow-ai-assistant__section">
                <div className="workflow-ai-assistant__section-title">应用前确认</div>
                <ul className="workflow-ai-assistant__approvals">
                  {draft.approvalsRequired.map((approval) => {
                    const formatted = formatApproval(approval);
                    return (
                      <li key={approval}>
                        <strong>{formatted.title}</strong>
                        <span>{formatted.description}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <button
              type="button"
              className="workflow-ai-assistant__apply"
              onClick={() => onApplyDraft(draft)}
              disabled={!draft.validation.valid}
            >
              新建画布并应用
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
