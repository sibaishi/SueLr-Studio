import { useState } from 'react';
import {
  CaretRight,
  ChatCircle,
  Check,
  Image,
  MagnifyingGlass,
  SpeakerHigh,
  Sparkle,
  Stack,
  VideoCamera,
} from '@phosphor-icons/react';
import { MenuGroup, MenuItem, SearchInput } from '@/ui/MenuPrimitives';

const MODEL_CATEGORY_ICONS = {
  chat: ChatCircle,
  image: Image,
  video: VideoCamera,
  audio: SpeakerHigh,
  midjourney: Sparkle,
};

export default function ModelTreeSelector({
  tree,
  selectedModel,
  onSelect,
}: {
  tree: Array<{
    configName: string;
    configId: string;
    cats: Array<{ cat: string; label: string; models: Array<{ label: string; value: string; modelId: string }> }>;
  }>;
  selectedModel: string;
  onSelect: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [channelId, setChannelId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const search = query.trim().toLowerCase();
  const models = tree.flatMap((channel) => channel.cats.flatMap((category) => category.models));
  const currentModel =
    models.find((model) => model.value === selectedModel) || models.find((model) => model.modelId === selectedModel);
  const matchingChannels = tree.flatMap((channel) => {
    const categories = channel.cats.flatMap((category) => {
      const matchingModels = category.models.filter((model) =>
        `${channel.configName} ${category.label} ${model.label} ${model.modelId}`.toLowerCase().includes(search),
      );
      return matchingModels.length ? [{ ...category, models: matchingModels }] : [];
    });
    return categories.length ? [{ ...channel, cats: categories }] : [];
  });

  const activeChannel =
    matchingChannels.find((channel) => channel.configId === channelId) ?? (search ? matchingChannels[0] : undefined);
  const activeCategory =
    activeChannel?.cats.find((category) => category.cat === categoryId) ??
    (search ? activeChannel?.cats[0] : undefined);

  if (!tree.length) {
    return <p className="ai-model-empty">暂无可用模型。请先在设置中启用模型。</p>;
  }

  return (
    <div className="ai-model-picker">
      <SearchInput
        icon={<MagnifyingGlass size={16} />}
        aria-label="搜索模型"
        placeholder="搜索模型或配置"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matchingChannels.length ? (
        <div className="ai-model-cascade">
          <MenuGroup className="ai-model-column" bodyClassName="ai-model-column-items nowheel" label="渠道">
            {matchingChannels.map((channel) => (
              <MenuItem
                key={channel.configId}
                type="button"
                className="ai-model-branch"
                aria-expanded={channel === activeChannel}
                title={channel.configName}
                onClick={() => {
                  if (channel === activeChannel) return;
                  setChannelId(channel.configId);
                  setCategoryId(null);
                }}
              >
                <span className="ai-model-module-icon">
                  <Stack size={14} aria-hidden="true" />
                </span>
                <span>{channel.configName}</span>
                <CaretRight size={12} aria-hidden="true" />
              </MenuItem>
            ))}
          </MenuGroup>
          {activeChannel && (
            <MenuGroup
              className="ai-model-column"
              bodyClassName="ai-model-column-items nowheel"
              key={activeChannel.configId}
              label="类型"
            >
              {activeChannel.cats.map((category) => {
                const Icon = MODEL_CATEGORY_ICONS[category.cat as keyof typeof MODEL_CATEGORY_ICONS] ?? Sparkle;
                return (
                  <MenuItem
                    key={category.cat}
                    type="button"
                    className="ai-model-branch"
                    aria-expanded={category === activeCategory}
                    onClick={() => setCategoryId(category.cat)}
                  >
                    <span className="ai-model-module-icon">
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span>{category.label}</span>
                    <CaretRight size={12} aria-hidden="true" />
                  </MenuItem>
                );
              })}
            </MenuGroup>
          )}
          {activeCategory && (
            <MenuGroup
              className="ai-model-column"
              bodyClassName="ai-model-column-items nowheel"
              key={`${activeChannel?.configId}:${activeCategory.cat}`}
              label="模型"
            >
              {activeCategory.models.map((model) => (
                <MenuItem
                  key={model.value}
                  type="button"
                  aria-pressed={model === currentModel}
                  onClick={() => onSelect(model.value)}
                  title={model.label}
                >
                  <span>{model.label}</span>
                  {model === currentModel && <Check size={15} weight="bold" aria-hidden="true" />}
                </MenuItem>
              ))}
            </MenuGroup>
          )}
        </div>
      ) : (
        <p className="ai-model-empty" role="status">
          没有匹配的模型
        </p>
      )}
    </div>
  );
}
