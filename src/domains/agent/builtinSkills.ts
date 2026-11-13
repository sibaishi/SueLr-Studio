import type { PreviewSkill } from './skillPreview';

export const builtinSkills: PreviewSkill[] = [
  {
    id: 'ideation',
    slug: 'creative-ideation',
    name: '创意发散',
    description: '从创意简报、参考素材或模糊想法出发，提出可比较的视觉、叙事或传播方向。',
    instructions: `## 工作步骤
1. 从对话提取受众、目标、媒介、素材与不可改变的约束。只有缺失信息会改变方向时才追问，否则写明假设。
2. 读取 references/direction-review.md，提出 3 个机制不同的方向。每个方向写一句核心概念、受众感受、视觉或叙事手法、制作成本与风险。
3. 给出推荐及依据，并提供一项当天可做的小样验证。用户选定后记录保留项与待验证项。
4. 用户要求落地时，按请求使用画布方案或渠道生成工具，沿用已选方向。
## 验收
方向之间有实质差异，每个方向都有可执行样例和可验证的判断标准。`,
    files: [
      {
        path: 'references/direction-review.md',
        text: '检查目标匹配、辨识度、素材可用性和制作成本。明确每个方向最可能失败在哪里，以及如何用最小样稿判断。',
      },
    ],
  },
  {
    id: 'copywriting',
    slug: 'copy-editing',
    name: '文案打磨',
    description: '改写标题、卖点、口播、产品介绍和广告文案，保留事实与品牌语气。',
    instructions: `## 工作步骤
1. 明确发布场景、受众、语气、字数和行动目标。提取必须保留的事实。
2. 读取 references/copy-checklist.md。先给一版可直接发布的正文，再给两版有明确取舍的候选。
3. 涉及未证实卖点时标注待核实。用户要求局部修改时保留其余内容。
## 验收
首句能传达重点，卖点具体，承诺有来源，语气和长度适合渠道。输出标明可直接使用的版本。`,
    files: [
      {
        path: 'references/copy-checklist.md',
        text: '逐项核对：受众是否一眼看懂？是否有未经证实的数字、最高级或承诺？行动指令是否明确？标题与正文是否重复？',
      },
    ],
  },
  {
    id: 'storyboard',
    slug: 'storyboard-planning',
    name: '分镜规划',
    description: '把脚本、产品短片或视觉创意拆为镜头、时长、动作、运镜和生成提示词。',
    instructions: `## 工作步骤
1. 明确总时长、画幅、核心动作和必须保留的角色或产品特征。
2. 读取 assets/shot-list.md，按开场、展开、落点安排节奏。为每镜写景别、主体动作、相机运动、光线、声音和转场。
3. 提取跨镜头一致性约束，再给各镜头可独立使用的提示词。注明依赖的参考素材。
4. 用户明确要求搭建或生成时，调用对应的画布方案或生成工具。
## 验收
镜头时长合计符合目标，前后动作能衔接，角色与产品特征贯穿，各镜头能单独制作。`,
    files: [
      {
        path: 'assets/shot-list.md',
        text: '| 镜头 | 起止时间 | 景别与运镜 | 主体动作 | 光线与声音 | 连续性约束 | 提示词 |\n| --- | --- | --- | --- | --- | --- | --- |',
      },
    ],
  },
];
