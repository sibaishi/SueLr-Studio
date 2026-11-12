export const catModel = (id: string): 'chat' | 'image' | 'video' | 'audio' => {
  if (/(?:^|[-_/])tts(?:$|[-_/])/i.test(id)) return 'audio';
  if (id.includes('seedance')) return 'video';
  if (id.includes('seedream') || id.includes('image') || id.includes('banana')) return 'image';
  return 'chat';
};
