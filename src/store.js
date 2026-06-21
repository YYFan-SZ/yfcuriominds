import { DEFAULT_SETTINGS, ROUTES, TAG_CATEGORIES, WORKSPACE_STEPS } from "./constants.js";

const STORAGE_KEY = "teacher-comment-ui-state-v1";
const LENGTH_OPTIONS = ["50字", "100字", "自定义"];
const OLD_DEFAULT_TAG_CATEGORIES = [
  { name: "性格品质", tags: ["认真踏实", "性格开朗", "待人礼貌", "乐于助人", "集体意识强", "有责任心"] },
  { name: "学习态度", tags: ["课堂积极", "自律性强", "作业更细致", "需要更主动", "习惯有改善", "敢于尝试"] },
  { name: "学习表现", tags: ["基础扎实", "基础需巩固", "思维活跃", "表达能力好", "书写工整", "审题需细心"] },
  { name: "成长变化", tags: ["有进步", "更有自信", "专注力提升", "目标感增强", "合作更主动", "情绪更稳定"] },
];

const createInitialState = () => ({
  route: ROUTES.ENTER,
  activeStep: WORKSPACE_STEPS.IMPORT,
  activeStudentId: null,
  currentUser: null,
  inviteCodes: {},
  students: [],
  comments: {},
  commentHistory: [],
  commentHistoryStatus: null,
  commentHistoryLoaded: false,
  creditLogs: [],
  settings: { ...DEFAULT_SETTINGS },
  tagCategories: cloneData(TAG_CATEGORIES),
  selectedGenerationStudentIds: null,
  generationStatus: null,
});

let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return createInitialState();
    return {
      ...createInitialState(),
      ...saved,
      settings: normalizeSettings(saved.settings),
      tagCategories: normalizeTagCategories(saved.tagCategories),
      selectedGenerationStudentIds: Array.isArray(saved.selectedGenerationStudentIds) ? saved.selectedGenerationStudentIds : null,
      currentUser: null,
      inviteCodes: {},
      creditLogs: [],
      commentHistory: [],
      commentHistoryStatus: null,
      commentHistoryLoaded: false,
    };
  } catch {
    return createInitialState();
  }
}

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  persistState();
}

export function updateState(updater) {
  state = updater(cloneData(state));
  persistState();
}

export function resetState() {
  state = createInitialState();
  persistState();
}

export function persistState() {
  const { currentUser, inviteCodes, creditLogs, commentHistory, commentHistoryStatus, commentHistoryLoaded, ...uiState } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(uiState));
}

export function getCurrentUser() {
  return state.currentUser;
}

function normalizeTagCategories(categories) {
  if (!Array.isArray(categories) || !categories.length) return cloneData(TAG_CATEGORIES);
  if (isOldDefaultTagCategories(categories)) return cloneData(TAG_CATEGORIES);
  return categories.map((category, index) => ({
    id: category.id || `category-${index}`,
    name: category.name || TAG_CATEGORIES[index]?.name || "自定义分类",
    hint: category.hint || TAG_CATEGORIES[index]?.hint || "",
    tags: Array.isArray(category.tags) ? category.tags.filter(Boolean) : [],
  }));
}

function isOldDefaultTagCategories(categories) {
  const simplified = categories.map((category) => ({
    name: category.name,
    tags: Array.isArray(category.tags) ? category.tags : [],
  }));
  return JSON.stringify(simplified) === JSON.stringify(OLD_DEFAULT_TAG_CATEGORIES);
}

function normalizeSettings(settings) {
  const nextSettings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  if (!LENGTH_OPTIONS.includes(nextSettings.length)) {
    nextSettings.length = DEFAULT_SETTINGS.length;
    nextSettings.customLength = "";
  }
  return nextSettings;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}
