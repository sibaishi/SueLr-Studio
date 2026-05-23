export const catModel = (id: string): 'chat' | 'image' | 'video' => {
  if (id.includes('seedance')) return 'video';
  if (id.includes('seedream') || id.includes('image') || id.includes('banana')) return 'image';
  return 'chat';
};
