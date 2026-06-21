import { DEFAULT_SETTINGS, ROUTES, TAG_CATEGORIES, WORKSPACE_STEPS } from "./constants.js";

const STORAGE_KEY = "teacher-comment-ui-state-v2";
const LEGACY_STORAGE_KEY = "teacher-comment-ui-state-v1";
const LENGTH_OPTIONS = ["50字", "100字", "自定义"];

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

let state = createInitialState();

export function getState() {
  return state;
}

export function setState(patch) {
  const hasCurrentUserPatch = Object.prototype.hasOwnProperty.call(patch, "currentUser");
  const nextUser = hasCurrentUserPatch ? patch.currentUser : state.currentUser;
  const isSwitchingUser = nextUser?.id && nextUser.id !== state.currentUser?.id;

  if (isSwitchingUser) {
    state = { ...loadUserState(nextUser.id), ...patch };
  } else if (hasCurrentUserPatch && !nextUser) {
    state = { ...createInitialState(), ...patch };
  } else {
    state = { ...state, ...patch };
  }

  persistState();
}

export function updateState(updater) {
  state = updater(cloneData(state));
  persistState();
}

export function resetState() {
  const currentUser = state.currentUser;
  state = { ...createInitialState(), currentUser };
  persistState();
}

export function persistState() {
  const { currentUser, inviteCodes, creditLogs, commentHistory, commentHistoryStatus, commentHistoryLoaded, ...uiState } = state;
  if (!currentUser?.id) {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }
  localStorage.setItem(getUserStorageKey(currentUser.id), JSON.stringify({ ...uiState, ownerUserId: currentUser.id }));
}

export function getCurrentUser() {
  return state.currentUser;
}

function loadUserState(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(getUserStorageKey(userId)));
    if (!saved || saved.ownerUserId !== userId) return createInitialState();
    return normalizeLoadedState(saved);
  } catch {
    return createInitialState();
  }
}

function normalizeLoadedState(saved) {
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
}

function getUserStorageKey(userId) {
  return `${STORAGE_KEY}:user:${userId}`;
}

function normalizeTagCategories(categories) {
  if (!Array.isArray(categories) || !categories.length) return cloneData(TAG_CATEGORIES);
  return categories.map((category, index) => ({
    id: category.id || `category-${index}`,
    name: category.name || TAG_CATEGORIES[index]?.name || "自定义分类",
    hint: category.hint || TAG_CATEGORIES[index]?.hint || "",
    tags: Array.isArray(category.tags) ? category.tags.filter(Boolean) : [],
  }));
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
