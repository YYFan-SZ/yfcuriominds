export const STORAGE_KEY = "teacher-comment-tool-v3";

export const INITIAL_INVITE_CODES = {
  TEACHER100: { credits: 100, usedBy: null, usedAt: null, status: "active" },
  CLASS300: { credits: 300, usedBy: null, usedAt: null, status: "active" },
  ADMIN999: { credits: 999, usedBy: null, usedAt: null, status: "active", role: "admin" },
};

export const DEFAULT_SETTINGS = {
  stage: "小学低年级",
  scene: "成绩单 / 报告册评语",
  length: "100字",
  customLength: "",
  tone: "温柔",
  template: "",
};

export const TAG_CATEGORIES = [
  {
    name: "性格品质",
    hint: "如认真踏实、责任感有待加强",
    tags: ["认真踏实", "性格开朗", "待人礼貌", "乐于助人", "安静内敛", "做事有耐心", "集体意识较强", "责任感有待加强"],
  },
  {
    name: "学习态度",
    hint: "如态度端正、主动性不足",
    tags: ["课堂参与积极", "学习态度端正", "作业完成认真", "自律性较强", "学习主动性不足", "作业细致度需提升", "课堂专注度需加强", "遇到困难容易退缩"],
  },
  {
    name: "学习表现",
    hint: "如基础较扎实、审题还需细心",
    tags: ["基础较扎实", "基础还需巩固", "思维比较活跃", "表达能力较好", "理解能力不错", "书写较工整", "审题还需细心", "知识运用不够灵活"],
  },
  {
    name: "成长变化",
    hint: "如有进步、潜力仍需激发",
    tags: ["本学期有进步", "比以前更自信", "专注力有所提升", "目标感逐渐增强", "学习习惯有改善", "情绪状态更稳定", "进步还不够稳定", "潜力仍需进一步激发"],
  },
];

export const TAG_OPTIONS = TAG_CATEGORIES.flatMap((category) => category.tags);

export const ROUTES = {
  ENTER: "enter",
  WORKSPACE: "workspace",
  HISTORY: "history",
  TAG_LIBRARY: "tagLibrary",
  ACCOUNT: "account",
  ADMIN: "admin",
};

export const WORKSPACE_STEPS = {
  IMPORT: "import",
  TAGS: "tags",
  SETTINGS: "settings",
  RESULTS: "results",
};
