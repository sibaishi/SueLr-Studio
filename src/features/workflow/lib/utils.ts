// ============================================================
// Flow Studio - 工具函数（从 ai-assistant 复用）
// ============================================================

/** 生成唯一 ID */
export const gid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

/** 清理 API Key 中的非 ASCII 字符 */
export const cleanKey = (s: string) => s.replace(/[^\x20-\x7E]/g, '').trim();

/**
 * 模型分类逻辑（按模型名关键词判断）
 * 优先匹配视频 → 图像 → 默认对话
 */
export const catModel = (id: string): 'chat' | 'image' | 'video' => {
  const lower = id.toLowerCase();
  // 视频
  if (/seedance|cogvideo|runway|sora|video|animate|kling/i.test(lower)) return 'video';
  // 图像
  if (/seedream|dall|stable.?diffusion|midjourney|sdxl|flux|cogview|image|banana|wanx/i.test(lower)) return 'image';
  // 默认为对话
  return 'chat';
};

/** 格式化时间 */
export const ftime = (t: number) => new Date(t).toLocaleTimeString('zh-CN');
