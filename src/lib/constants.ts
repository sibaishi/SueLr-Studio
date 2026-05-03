import type { Colors, ThemeMode, Tab, ToolDefinition } from './types';

export const VIDEO_GENERATION_ENABLED = false;

export const DARK: Colors = {
  bg: '#000000',
  card: 'rgba(255,255,255,0.06)',
  card2: 'rgba(255,255,255,0.10)',
  menuBg: '#1c1c1e',
  border: 'rgba(255,255,255,0.08)',
  text: 'rgba(255,255,255,0.95)',
  text2: 'rgba(255,255,255,0.50)',
  text3: 'rgba(255,255,255,0.28)',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  purple: '#BF5AF2',
  neutral: '#D1D5DB',
};

export const LIGHT: Colors = {
  bg: '#F5F5F7',
  card: 'rgba(255,255,255,0.65)',
  card2: 'rgba(255,255,255,0.80)',
  menuBg: '#ffffff',
  border: 'rgba(0,0,0,0.06)',
  text: 'rgba(0,0,0,0.88)',
  text2: 'rgba(0,0,0,0.50)',
  text3: 'rgba(0,0,0,0.28)',
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  purple: '#AF52DE',
  neutral: '#5F6368',
};

export const CHAT_COLOR = '#30D158';

export const NAV_ITEMS: { key: Tab; icon: string; label: string; colorKey: 'green' | 'orange' | 'purple' | 'blue' | 'text2' | 'neutral' }[] = [
  { key: 'chat', icon: 'message', label: '对话', colorKey: 'green' },
  { key: 'image', icon: 'palette', label: '图像', colorKey: 'orange' },
  { key: 'video', icon: 'clapperboard', label: '视频', colorKey: 'purple' },
  { key: 'workflow', icon: 'workflow', label: '工作流', colorKey: 'blue' },
  { key: 'settings', icon: 'settings', label: '设置', colorKey: 'neutral' },
];

export const RATIOS = [
  { l: '自动', v: 'auto' },
  { l: '1:1', v: '1:1' },
  { l: '4:3', v: '4:3' },
  { l: '3:4', v: '3:4' },
  { l: '16:9', v: '16:9' },
  { l: '9:16', v: '9:16' },
  { l: '3:2', v: '3:2' },
  { l: '2:3', v: '2:3' },
];

export const VID_RES = [{ l: '480p', v: '480p' }, { l: '720p', v: '720p' }, { l: '1080p', v: '1080p' }];
export const VID_DUR = [{ l: '5秒', v: 5 }, { l: '10秒', v: 10 }];
export const VID_RATIO = [{ l: '16:9', v: '16:9' }, { l: '9:16', v: '9:16' }, { l: '1:1', v: '1:1' }, { l: '4:3', v: '4:3' }, { l: '3:4', v: '3:4' }];

export const THEME_LABELS: Record<ThemeMode, string> = { dark: '深色', light: '浅色', system: '系统' };
export const THEME_ICONS: Record<ThemeMode, string> = { dark: 'moon', light: 'sun', system: 'monitor' };

export const QUICK_PROMPTS = [
  { label: '赛博都市', prompt: '雨夜赛博都市街角，霓虹招牌反射在湿润路面上，远处高楼密集，行人撑透明伞穿过斑马线，蓝紫色调，电影感广角构图，体积光，高细节，写实风格。' },
  { label: '水彩花束', prompt: '一束精致春日花束放在浅色亚麻布上，玫瑰、洋桔梗和小雏菊自然交错，柔和水彩晕染，纸张纹理清晰，留白优雅，淡雅配色，温柔明亮的插画风格。' },
  { label: '星空山脉', prompt: '银河横跨雪山与高山湖泊，湖面倒映星空和山体轮廓，前景有几块湿润岩石，长曝光摄影质感，冷色夜光，宁静、宏伟、空气通透，超清细节。' },
  { label: '蒸汽机械', prompt: '黄铜齿轮、压力表与蒸汽管道组成的精密机械装置特写，微弱暖光从缝隙透出，金属磨损痕迹清晰，浅景深，复古工业美学，细节丰富，电影级质感。' },
  { label: '电影人像', prompt: '一位穿深色风衣的人站在傍晚城市天台边缘，侧脸被远处霓虹与夕阳轮廓光照亮，背景虚化，85mm 镜头质感，浅景深，情绪克制，电影海报级人像摄影。' },
  { label: '产品海报', prompt: '一瓶高端香水置于透明亚克力台面上，周围有水滴、柔和花瓣和细腻反射，背景为低饱和渐变棚拍布景，商业广告构图，干净留白，精致高光，奢华产品摄影。' },
  { label: '室内设计', prompt: '现代侘寂风客厅，米白墙面、原木家具、低矮沙发、陶瓷摆件与自然绿植，阳光从落地窗斜射进来，空间开阔安静，真实室内摄影，材质细腻，柔和阴影。' },
  { label: '国风庭院', prompt: '江南雨后中式庭院，青石板路泛着水光，白墙黛瓦、竹影、红色灯笼和一池睡莲，远处薄雾缭绕，构图雅致，水墨与写实融合，清冷诗意，高级国风场景。' },
  { label: '奇幻角色', prompt: '年轻女法师站在古老森林遗迹中，披着深绿色斗篷，手中漂浮着发光符文，周围有苔藓石柱和微光萤火，半写实幻想插画，动态姿态，角色设计完整，高细节。' },
  { label: '科幻机甲', prompt: '重型探索机甲停在火星基地外，橙红尘土覆盖金属外壳，驾驶舱发出微弱蓝光，背景是巨大的行星地平线，硬表面设计，工业细节丰富，科幻概念设定图。' },
  { label: '美食摄影', prompt: '一碗热气腾腾的日式拉面放在深色木桌上，溏心蛋、叉烧、葱花和海苔摆放精致，汤面油光细腻，侧逆光拍摄，浅景深，真实美食摄影，温暖诱人。' },
  { label: '品牌图标', prompt: '为一个专注 AI 创意工具的品牌设计极简图标，主体为抽象闪光与对话气泡结合，圆角几何造型，蓝橙双色点缀，适合 App 图标，干净、现代、可识别，白色背景。' },
  { label: '儿童绘本', prompt: '温暖的儿童绘本插画，一只小熊坐在窗边读书，窗外是细雨和发光的街灯，室内有柔软毯子、木质书架和热可可，圆润造型，低对比色彩，治愈、安静、适合绘本封面。' },
  { label: '3D 盲盒', prompt: '一个可爱的原创盲盒角色站在小型展示台上，圆润头身比例，半透明材质配件，柔和棚拍灯光，细腻塑胶质感，潮玩产品渲染，干净背景，三维立体感强。' },
  { label: '复古海报', prompt: '复古旅行海报风格的海滨小镇，橙色夕阳、蓝绿色海面、白色灯塔和几艘帆船，平面化几何构图，丝网印刷质感，轻微纸张颗粒，醒目标题留白，怀旧但清爽。' },
  { label: '信息图形', prompt: '一张关于个人时间管理方法的现代信息图形海报，包含时间块、优先级矩阵和进度环元素，布局清晰，蓝绿橙点缀，扁平矢量风格，白底，高可读性，适合社交媒体分享。' },
];

const CAPABILITY_SUFFIX = `

你具备以下能力：
- 可以生成全新的图片。
- 可以基于已有图片进行修改，调用 generate_image 时传入 reference_image_url。
- 可以将图片生成视频，调用 generate_video 时传入 image_url。
- 可以搜索互联网获取实时信息，调用 web_search。
当用户要求修改已有图片时，不要说无法编辑，而是用参考图重新生成。`;

export const PRESET_ROLES: import('./types').AgentRole[] = [
  {
    id: 'default',
    name: '通用助手',
    icon: 'bot',
    systemPrompt: '你是一位智能、友好、高效的 AI 助手。回答自然、清晰、可靠。' + CAPABILITY_SUFFIX,
    tools: ['generate_image', 'generate_video'],
  },
  {
    id: 'image',
    name: '图像创作',
    icon: 'palette',
    systemPrompt: '你擅长视觉创意、提示词优化、图像生成和图像改写。' + CAPABILITY_SUFFIX,
    tools: ['generate_image'],
  },
  {
    id: 'video',
    name: '视频导演',
    icon: 'clapperboard',
    systemPrompt: '你擅长把想法转化为视频镜头、运动、节奏和画面说明。' + CAPABILITY_SUFFIX,
    tools: ['generate_image', 'generate_video'],
  },
  {
    id: 'research',
    name: '研究助手',
    icon: 'search',
    systemPrompt: '你擅长信息检索、归纳、比较和引用来源。需要实时信息时主动搜索。',
    tools: ['web_search'],
  },
];

export const MEMORY_PROMPT = '分析以下对话内容，提取关于用户的关键信息和偏好。返回 JSON 字符串数组；没有值得记住的信息时返回 []。\n\n对话内容：\n';

export function buildTools(hasImage: boolean, hasVideo: boolean, hasSearch: boolean = false) {
  const tools: ToolDefinition[] = [];

  if (hasImage) {
    tools.push({
      type: 'function',
      function: {
        name: 'generate_image',
        description: 'Generate or edit an image. Use reference_image_url when editing an existing image.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Image generation or edit prompt.' },
            reference_image_url: { type: 'string', description: 'Optional reference image URL.' },
            width: { type: 'number', description: 'Optional output width in pixels. Will be rounded to the nearest multiple of 16.' },
            height: { type: 'number', description: 'Optional output height in pixels. Will be rounded to the nearest multiple of 16.' },
            quality: { type: 'string', description: 'Optional quality: low, medium, high, auto.' },
          },
          required: ['prompt'],
        },
      },
    });
  }

  if (hasVideo && VIDEO_GENERATION_ENABLED) {
    tools.push({
      type: 'function',
      function: {
        name: 'generate_video',
        description: 'Submit a video generation task.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            image_url: { type: 'string' },
            duration: { type: 'number' },
            aspect_ratio: { type: 'string' },
          },
          required: ['prompt'],
        },
      },
    });
  }

  if (hasSearch) {
    tools.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    });
  }

  tools.push({
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date and time.',
      parameters: {
        type: 'object',
        properties: { timezone: { type: 'string' } },
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Search remembered user preferences and facts.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'analyze_image',
      description: 'Analyze an image in the current conversation.',
      parameters: {
        type: 'object',
        properties: {
          image_url: { type: 'string' },
          prompt: { type: 'string' },
        },
      },
    },
  });

  tools.push({
    type: 'function',
    function: {
      name: 'summarize_conversation',
      description: 'Summarize the current conversation.',
      parameters: {
        type: 'object',
        properties: { focus: { type: 'string' } },
      },
    },
  });

  return tools;
}
