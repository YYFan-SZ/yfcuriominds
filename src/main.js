import { DEFAULT_SETTINGS, ROUTES, TAG_CATEGORIES, WORKSPACE_STEPS } from "./constants.js";
import { loadSession, loginWithInvite, logout } from "./auth.js";
import { getGenerationCost } from "./commentGenerator.js";
import { exportCsv, exportWord, getExportRows } from "./exporter.js";
import { apiRequest } from "./api.js";
import { getCurrentUser, getState, persistState, resetState, setState, updateState } from "./store.js";
import { renderApp } from "./templates.js";
import { $, $$, copyText, parseNameColumnFile, parseNames, parseXlsxNameColumn, showToast } from "./utils.js";

const app = $("#app");
let globalNavigationBound = false;

function render() {
  try {
    app.innerHTML = renderApp(getState(), getCurrentUser());
    bindPageEvents();
  } catch (error) {
    showFatalError(error);
  }
}

window.addEventListener("error", (event) => showFatalError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => showFatalError(event.reason));

function showFatalError(error) {
  const message = error?.message || String(error || "未知错误");
  console.error(error);
  app.innerHTML = `
    <main class="entry-page">
      <section class="entry-card">
        <div class="brand-row">
          <div class="brand-mark">评</div>
          <div>
            <h1>页面加载失败</h1>
            <p>请刷新页面；如果仍然出现，请把下面错误发给开发者。</p>
          </div>
        </div>
        <pre class="fatal-error"></pre>
      </section>
    </main>
  `;
  const errorBox = app.querySelector(".fatal-error");
  if (errorBox) errorBox.textContent = message;
}

function bindPageEvents() {
  bindGlobalNavigation();
  bindEnterPage();
  bindImportStep();
  bindTagsStep();
  bindSettingsStep();
  bindResultsStep();
  bindHistoryPage();
  bindAdminPage();
  bindStudentDragSorting();
}

function bindGlobalNavigation() {
  if (!globalNavigationBound) {
    app.addEventListener("click", (event) => {
      const stepButton = event.target.closest("[data-step]");
      if (!stepButton || !app.contains(stepButton)) return;
      event.preventDefault();
      setState({ activeStep: stepButton.dataset.step, route: ROUTES.WORKSPACE });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    globalNavigationBound = true;
  }

  $$(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.route === ROUTES.ADMIN && getCurrentUser()?.role !== "admin") {
        showToast("只有管理员能进入邀请码后台");
        return;
      }
      setState({ route: button.dataset.route });
      render();
      if (button.dataset.route === ROUTES.HISTORY) loadCommentHistory();
    });
  });

  $$("[data-route]:not(.nav-btn)").forEach((button) => {
    button.addEventListener("click", () => {
      setState({ route: button.dataset.route });
      render();
    });
  });

  $("#logoutBtn")?.addEventListener("click", () => {
    logout();
    render();
  });

}

function bindEnterPage() {
  $("#inviteLoginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await loginWithInvite($("#inviteCodeInput").value, $("#nicknameInput").value);
      showToast(result.message);
      render();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function bindImportStep() {
  $$(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".tab-btn").forEach((item) => item.classList.remove("active"));
      $$(".tab-view").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $(`#${button.dataset.tab}Tab`)?.classList.add("active");
    });
  });

  $("#importNamesBtn")?.addEventListener("click", () => {
    const additions = createUniqueStudents(parseNames($("#namesInput").value));
    updateState((state) => {
      state.students.push(...additions);
      if (!state.activeStudentId && additions[0]) state.activeStudentId = additions[0].id;
      return state;
    });
    showToast(additions.length ? `已导入 ${additions.length} 名学生` : "没有新的学生姓名");
    render();
  });

  $("#addStudentBtn")?.addEventListener("click", () => {
    const additions = createUniqueStudents(parseNames($("#singleNameInput").value));
    updateState((state) => {
      state.students.push(...additions);
      if (!state.activeStudentId && additions[0]) state.activeStudentId = additions[0].id;
      return state;
    });
    showToast(additions.length ? "已添加学生" : "请输入学生姓名");
    render();
  });

  $("#fileInput")?.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (/\.(xls)$/i.test(file.name)) {
      event.target.value = "";
      showToast("请上传 .xlsx、CSV 或 TXT 文件，老版 .xls 请先另存为 .xlsx");
      return;
    }

    try {
      const names = /\.(xlsx)$/i.test(file.name)
        ? await parseXlsxNameColumn(await file.arrayBuffer())
        : parseNameColumnFile(await file.text().catch(() => ""));
      const additions = createUniqueStudents(names);
      updateState((state) => {
        state.students.push(...additions);
        if (!state.activeStudentId && additions[0]) state.activeStudentId = additions[0].id;
        return state;
      });
      showToast(additions.length ? `已从文件导入 ${additions.length} 名学生` : "没有识别到姓名，请检查是否有“姓名/学生姓名”列");
      render();
    } catch (error) {
      showToast(error.message || "文件解析失败，请检查格式");
    } finally {
      event.target.value = "";
    }
  });

  $("#importedStudentList")?.addEventListener("input", (event) => {
    if (!event.target.matches("[data-import-name]")) return;
    const row = event.target.closest(".imported-student-row");
    const state = getState();
    const student = state.students.find((item) => item.id === row.dataset.id);
    if (!student) return;
    student.name = event.target.value.trim();
    persistState();
  });

  $("#importedStudentList")?.addEventListener("click", (event) => {
    if (!event.target.matches("[data-import-delete]")) return;
    const row = event.target.closest(".imported-student-row");
    updateState((state) => {
      state.students = state.students.filter((student) => student.id !== row.dataset.id);
      delete state.comments[row.dataset.id];
      if (state.activeStudentId === row.dataset.id) state.activeStudentId = state.students[0]?.id || null;
      return state;
    });
    render();
  });
}

function createUniqueStudents(names) {
  const state = getState();
  const existing = new Set(state.students.map((student) => student.name));
  const additions = [];
  names.forEach((name) => {
    if (!existing.has(name)) {
      existing.add(name);
      additions.push({ id: createId(), name, tags: [], note: "" });
    }
  });
  return additions;
}

function reorderStudent(draggedId, targetId) {
  updateState((state) => {
    const fromIndex = state.students.findIndex((student) => student.id === draggedId);
    const toIndex = state.students.findIndex((student) => student.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return state;
    const [student] = state.students.splice(fromIndex, 1);
    state.students.splice(toIndex, 0, student);
    return state;
  });
  render();
}

function createId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `student-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bindStudentDragSorting() {
  $$("[data-student-order-list]").forEach((list) => {
    list.addEventListener("dragstart", (event) => {
      const handle = event.target.closest("[data-drag-handle]");
      const item = event.target.closest("[data-id]");
      if (!handle || !item || !list.contains(item)) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.dataset.id);
      item.classList.add("dragging");
    });

    list.addEventListener("dragend", () => {
      $$(".dragging", list).forEach((item) => item.classList.remove("dragging"));
      $$(".drag-over", list).forEach((item) => item.classList.remove("drag-over"));
    });

    list.addEventListener("dragover", (event) => {
      const target = event.target.closest("[data-id]");
      if (!target || !list.contains(target)) return;
      event.preventDefault();
      $$(".drag-over", list).forEach((item) => item.classList.remove("drag-over"));
      target.classList.add("drag-over");
    });

    list.addEventListener("drop", (event) => {
      const target = event.target.closest("[data-id]");
      const draggedId = event.dataTransfer.getData("text/plain");
      if (!target || !draggedId || draggedId === target.dataset.id) return;
      event.preventDefault();
      reorderStudent(draggedId, target.dataset.id);
    });
  });
}

function bindTagsStep() {
  $("#studentList")?.addEventListener("input", (event) => {
    const card = event.target.closest(".student-card");
    if (!card || !event.target.matches("[data-name-input]")) return;
    const state = getState();
    const student = state.students.find((item) => item.id === card.dataset.id);
    if (!student) return;
    student.name = event.target.value.trim();
    persistState();
  });

  $("#studentList")?.addEventListener("click", (event) => {
    const card = event.target.closest(".student-card");
    if (!card) return;
    if (event.target.matches("[data-name-input]")) return;

    if (event.target.matches(".icon-btn")) {
      updateState((state) => {
        state.students = state.students.filter((item) => item.id !== card.dataset.id);
        delete state.comments[card.dataset.id];
        if (state.activeStudentId === card.dataset.id) state.activeStudentId = state.students[0]?.id || null;
        return state;
      });
      render();
      return;
    }

    setState({ activeStudentId: card.dataset.id });
    render();
  });

  $("#tagEditor")?.addEventListener("click", (event) => {
    const button = event.target.closest(".tag");
    const editor = event.target.closest("#tagEditor");
    if (!button || !editor) return;

    const state = getState();
    const student = state.students.find((item) => item.id === editor.dataset.id);
    if (!student) return;

    button.classList.toggle("active");
    student.tags = Array.from(editor.querySelectorAll(".tag.active")).map((tagButton) => tagButton.dataset.tag);
    const card = document.querySelector(`.student-card[data-id="${student.id}"]`);
    updateSelectedTags(card, student.tags);
    persistState();
  });

  $("#tagEditor")?.addEventListener("input", (event) => {
    if (!event.target.matches("[data-student-note]")) return;
    const editor = event.target.closest("#tagEditor");
    const state = getState();
    const student = state.students.find((item) => item.id === editor.dataset.id);
    if (!student) return;
    student.note = event.target.value.trim();
    persistState();
  });

  $("#fillEmptyTagsBtn")?.addEventListener("click", () => {
    updateState((state) => {
      const defaults = state.tagCategories.flatMap((category) => category.tags).slice(0, 2);
      state.students.forEach((student) => {
        if (!student.tags?.length) student.tags = defaults;
      });
      return state;
    });
    showToast("已为未选标签的学生填入默认标签");
    render();
  });

  $("#clearAllTagsBtn")?.addEventListener("click", () => {
    updateState((state) => {
      state.students.forEach((student) => {
        student.tags = [];
        student.note = "";
      });
      return state;
    });
    render();
  });

  $("#tagLibraryEditor")?.addEventListener("input", (event) => {
    if (!event.target.matches("[data-tag-edit]")) return;
    const categoryElement = event.target.closest("[data-category-index]");
    const categoryIndex = Number(categoryElement?.dataset.categoryIndex);
    const tagIndex = Number(event.target.dataset.tagIndex);
    const nextTag = event.target.value.trim();
    const state = getState();
    const previousTag = state.tagCategories?.[categoryIndex]?.tags?.[tagIndex];
    if (!previousTag || !nextTag) return;

    state.tagCategories[categoryIndex].tags[tagIndex] = nextTag;
    state.students.forEach((student) => {
      student.tags = (student.tags || []).map((tag) => (tag === previousTag ? nextTag : tag));
    });
    persistState();
    updateSelectedTags(document.querySelector(`.student-card[data-id="${state.activeStudentId}"]`), state.students.find((student) => student.id === state.activeStudentId)?.tags || []);
  });

  $("#tagLibraryEditor")?.addEventListener("change", (event) => {
    if (!event.target.matches("[data-tag-edit]")) return;
    render();
  });

  $("#tagLibraryEditor")?.addEventListener("click", (event) => {
    if (event.target.matches("#resetTagLibraryBtn")) {
      updateState((state) => {
        const currentTags = new Set(state.tagCategories.flatMap((category) => category.tags));
        state.tagCategories = JSON.parse(JSON.stringify(TAG_CATEGORIES));
        const nextTags = new Set(state.tagCategories.flatMap((category) => category.tags));
        state.students.forEach((student) => {
          student.tags = (student.tags || []).filter((tag) => !currentTags.has(tag) || nextTags.has(tag));
        });
        return state;
      });
      showToast("标签库已恢复默认");
      render();
      return;
    }

    const categoryElement = event.target.closest("[data-category-index]");
    if (!categoryElement) return;
    const categoryIndex = Number(categoryElement.dataset.categoryIndex);

    if (event.target.matches("[data-tag-add]")) {
      const input = categoryElement.querySelector("[data-tag-add-input]");
      const value = input.value.trim();
      if (!value) return showToast("请输入要新增的标签");
      updateState((state) => {
        const category = state.tagCategories[categoryIndex];
        if (!category.tags.includes(value)) category.tags.push(value);
        return state;
      });
      showToast("已新增标签");
      render();
      return;
    }

    if (event.target.matches("[data-tag-remove]")) {
      const tagIndex = Number(event.target.dataset.tagIndex);
      updateState((state) => {
        const category = state.tagCategories[categoryIndex];
        const removed = category.tags[tagIndex];
        category.tags.splice(tagIndex, 1);
        state.students.forEach((student) => {
          student.tags = (student.tags || []).filter((tag) => tag !== removed);
        });
        return state;
      });
      showToast("已删除标签");
      render();
    }
  });
}

function updateSelectedTags(card, tags) {
  const container = card?.querySelector(".selected-tags");
  if (!container) return;
  container.innerHTML = tags.length ? tags.map((tag) => `<span>${tag}</span>`).join("") : "<em>未选择标签</em>";
}

function bindSettingsStep() {
  const settingInputs = [$("#stageSelect"), $("#sceneSelect"), $("#lengthSelect"), $("#customLengthInput"), $("#toneSelect"), $("#templateInput")].filter(Boolean);
  const readSettingsFromForm = () => ({
    stage: $("#stageSelect").value,
    scene: $("#sceneSelect").value,
    length: $("#lengthSelect").value,
    customLength: $("#customLengthInput")?.value.trim() || "",
    tone: $("#toneSelect").value,
    template: $("#templateInput").value,
  });
  settingInputs.forEach((input) => {
    const eventName = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(eventName, () => {
      updateState((state) => {
        state.settings = readSettingsFromForm();
        return state;
      });
      if (input.id === "lengthSelect") render();
    });
  });

  $("#resetSettingsBtn")?.addEventListener("click", () => {
    setState({ settings: { ...DEFAULT_SETTINGS } });
    render();
  });

  $("#selectAllGenerateStudents")?.addEventListener("change", (event) => {
    updateState((state) => {
      state.selectedGenerationStudentIds = event.target.checked ? state.students.map((student) => student.id) : [];
      return state;
    });
    render();
  });

  $$("#settingsStudentOrder [data-generate-student-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateState((state) => {
        state.selectedGenerationStudentIds = $$("#settingsStudentOrder .student-order-row")
          .filter((row) => row.querySelector("[data-generate-student-select]")?.checked)
          .map((row) => row.dataset.id);
        return state;
      });
      render();
    });
  });

  $("#generateBtn")?.addEventListener("click", async () => {
    const state = getState();
    if (!state.students.length) return showToast("请先导入学生名单");
    const selectedStudents = getSelectedGenerationStudents(state);
    if (!selectedStudents.length) return showToast("请至少选择 1 名学生生成评语");
    if (state.settings.length === "自定义") {
      const customLength = Number(state.settings.customLength);
      if (!Number.isFinite(customLength) || customLength < 20 || customLength > 500) {
        return showToast("自定义字数请输入 20-500 之间的数字");
      }
    }
    const cost = getGenerationCost(selectedStudents, state.settings);
    setState({
      generationStatus: {
        type: "loading",
        title: "正在生成",
        message: `正在为 ${selectedStudents.length} 名学生生成评语，预计消耗 ${cost} 积分。生成完成后会自动跳到编辑导出页。`,
      },
    });
    render();

    try {
      const latestState = getState();
      const latestSelectedStudents = getSelectedGenerationStudents(latestState);
      const payload = await apiRequest("/api/generate-comments", {
        method: "POST",
        body: JSON.stringify({ students: latestSelectedStudents, settings: latestState.settings }),
      });
      updateState((draft) => {
        payload.comments.forEach((item) => {
          draft.comments[item.studentId] = item.comment;
        });
        draft.currentUser = payload.user;
        draft.creditLogs = payload.creditLogs || [];
        draft.activeStep = WORKSPACE_STEPS.RESULTS;
        draft.generationStatus = {
          type: "success",
          title: "生成成功",
          message: `已生成 ${payload.comments.length} 条评语，结果在下方列表中，可直接编辑、复制或导出。`,
        };
        return draft;
      });
      showToast("评语已生成");
      render();
    } catch (error) {
      setState({
        generationStatus: {
          type: "error",
          title: "生成失败",
          message: error.message,
        },
      });
      showToast(error.message);
      render();
    }
  });
}

function getSelectedGenerationStudents(state) {
  const validIds = new Set(state.students.map((student) => student.id));
  const activeIds = Array.isArray(state.selectedGenerationStudentIds)
    ? new Set(state.selectedGenerationStudentIds.filter((id) => validIds.has(id)))
    : validIds;
  return state.students.filter((student) => activeIds.has(student.id));
}

function bindResultsStep() {
  $("#resultList")?.addEventListener("input", (event) => {
    const card = event.target.closest(".result-card");
    if (!card || event.target.tagName !== "TEXTAREA") return;
    const state = getState();
    state.comments[card.dataset.id] = event.target.value;
    persistState();
  });

  $("#resultList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest(".result-card");
    if (!button || !card) return;

    const state = getState();
    const student = state.students.find((item) => item.id === card.dataset.id);
    if (!student) return;

    if (button.dataset.action === "copy") {
      await copyText(state.comments[student.id] || "");
      showToast(`已复制 ${student.name} 的评语`);
      return;
    }

    if (button.dataset.action === "rewrite") {
      $$("#resultList .rewrite-box").forEach((box) => {
        if (box !== card.querySelector(".rewrite-box")) box.hidden = true;
      });
      const rewriteBox = card.querySelector(".rewrite-box");
      rewriteBox.hidden = false;
      rewriteBox.querySelector("[data-rewrite-input]")?.focus();
      return;
    }

    try {
      const rewriteInstruction = card.querySelector("[data-rewrite-input]")?.value.trim() || "";
      if (button.dataset.action === "confirm-rewrite" && !rewriteInstruction) {
        showToast("请先在改写要求里输入要怎么改");
        card.querySelector("[data-rewrite-input]")?.focus();
        return;
      }
      const isRewrite = button.dataset.action === "confirm-rewrite";
      setState({
        generationStatus: {
          type: "loading",
          title: "正在更新",
          message: isRewrite ? `正在按你的要求改写 ${student.name} 的评语。` : `正在重新生成 ${student.name} 的评语。`,
        },
      });
      render();
      const nextSettings = {
        ...state.settings,
        rewriteInstruction,
        existingComment: state.comments[student.id] || "",
      };
      const studentForRequest = {
        ...student,
        note: rewriteInstruction ? [student.note, `改写要求：${rewriteInstruction}`].filter(Boolean).join("；") : student.note,
      };
      const payload = await apiRequest("/api/generate-comments", {
        method: "POST",
        body: JSON.stringify({ students: [studentForRequest], settings: nextSettings }),
      });
      updateState((draft) => {
        const result = payload.comments[0];
        if (result) draft.comments[student.id] = result.comment;
        draft.currentUser = payload.user;
        draft.creditLogs = payload.creditLogs || [];
        draft.generationStatus = {
          type: "success",
          title: "更新成功",
          message: isRewrite ? `${student.name} 的评语已按要求改写。` : `${student.name} 的评语已重新生成。`,
        };
        return draft;
      });
      showToast("评语已更新");
      render();
    } catch (error) {
      setState({
        generationStatus: {
          type: "error",
          title: "更新失败",
          message: error.message,
        },
      });
      showToast(error.message);
      render();
    }
  });

  $("#selectAllResults")?.addEventListener("change", (event) => {
    $$("#resultList [data-result-select]").forEach((checkbox) => {
      checkbox.checked = event.target.checked;
    });
    updateSelectedResultCount();
  });

  $("#resultList")?.addEventListener("change", (event) => {
    if (!event.target.matches("[data-result-select]")) return;
    updateSelectedResultCount();
  });

  $("#bulkToneBtn")?.addEventListener("click", async () => {
    const state = getState();
    const entries = state.students.filter((student) => state.comments[student.id]);
    if (!entries.length) return showToast("暂无可改写的评语");

    try {
      setState({
        generationStatus: {
          type: "loading",
          title: "正在批量换风格",
          message: `正在为 ${entries.length} 条评语换成${$("#bulkToneSelect").value}风格。`,
        },
      });
      render();
      const payload = await apiRequest("/api/generate-comments", {
        method: "POST",
        body: JSON.stringify({ students: entries, settings: { ...state.settings, tone: $("#bulkToneSelect").value } }),
      });
      updateState((draft) => {
        payload.comments.forEach((item) => {
          draft.comments[item.studentId] = item.comment;
        });
        draft.currentUser = payload.user;
        draft.creditLogs = payload.creditLogs || [];
        draft.generationStatus = {
          type: "success",
          title: "批量换风格成功",
          message: `已更新 ${payload.comments.length} 条评语。`,
        };
        return draft;
      });
      render();
    } catch (error) {
      setState({
        generationStatus: {
          type: "error",
          title: "批量换风格失败",
          message: error.message,
        },
      });
      showToast(error.message);
      render();
    }
  });

  $("#copyAllBtn")?.addEventListener("click", async () => {
    const rows = getSelectedExportRows();
    if (!rows.length) return showToast("请先选择要复制的评语");
    await copyText(rows.map((row) => `${row.name}\n${row.comment}`).join("\n\n"));
    showToast(`已复制 ${rows.length} 条评语`);
  });

  $("#exportExcelBtn")?.addEventListener("click", () => {
    const rows = getSelectedExportRows();
    if (!rows.length) return showToast("请先选择要导出的评语");
    exportCsv(rows);
  });

  $("#exportWordBtn")?.addEventListener("click", () => {
    const rows = getSelectedExportRows();
    if (!rows.length) return showToast("请先选择要导出的评语");
    exportWord(rows);
  });
}

function getSelectedExportRows() {
  const selectedIds = new Set(
    $$("#resultList .result-card")
      .filter((card) => card.querySelector("[data-result-select]")?.checked)
      .map((card) => card.dataset.id),
  );
  return getExportRows(getState()).filter((row) => row.comment && selectedIds.has(row.id));
}

function updateSelectedResultCount() {
  const checkboxes = $$("#resultList [data-result-select]");
  const selected = checkboxes.filter((checkbox) => checkbox.checked).length;
  const count = $("#selectedCount");
  if (count) count.textContent = `${selected} / ${checkboxes.length} 已选`;
  const selectAll = $("#selectAllResults");
  if (selectAll) {
    selectAll.checked = selected === checkboxes.length && checkboxes.length > 0;
    selectAll.indeterminate = selected > 0 && selected < checkboxes.length;
  }
}

async function loadCommentHistory() {
  setState({
    commentHistoryStatus: {
      type: "loading",
      title: "正在加载历史",
      message: "正在读取最近生成的评语记录。",
    },
  });
  render();
  try {
    const payload = await apiRequest("/api/comment-history");
    setState({
      commentHistory: payload.records || [],
      commentHistoryStatus: null,
      commentHistoryLoaded: true,
    });
    render();
  } catch (error) {
    setState({
      commentHistoryStatus: {
        type: "error",
        title: "历史记录加载失败",
        message: error.message,
      },
    });
    render();
  }
}

function bindHistoryPage() {
  const state = getState();
  if (state.route === ROUTES.HISTORY && !state.commentHistoryLoaded && !state.commentHistoryStatus) {
    window.setTimeout(loadCommentHistory, 0);
  }

  $("#refreshHistoryBtn")?.addEventListener("click", () => {
    loadCommentHistory();
  });

  $("#historyList")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-restore]");
    if (!button) return;
    const card = button.closest(".history-card");
    const record = getState().commentHistory.find((item) => item.id === card?.dataset.historyId);
    if (!record) return;

    updateState((draft) => {
      draft.students = record.items.map((item) => ({
        id: item.studentId,
        name: item.studentName || item.studentId,
        tags: item.tags || [],
        note: item.note || "",
      }));
      draft.comments = Object.fromEntries(record.items.map((item) => [item.studentId, item.comment]));
      draft.settings = { ...DEFAULT_SETTINGS, ...(record.settings || {}) };
      if (!["50字", "100字", "自定义"].includes(draft.settings.length)) {
        draft.settings.length = DEFAULT_SETTINGS.length;
        draft.settings.customLength = "";
      }
      draft.activeStudentId = draft.students[0]?.id || null;
      draft.activeStep = WORKSPACE_STEPS.RESULTS;
      draft.route = ROUTES.WORKSPACE;
      draft.generationStatus = {
        type: "success",
        title: "已恢复历史记录",
        message: `已恢复 ${record.count} 条评语，可继续编辑、复制或导出。`,
      };
      return draft;
    });
    showToast("历史记录已恢复到工作台");
    render();
  });
}

function bindAdminPage() {
  if (getState().route === ROUTES.ADMIN && getCurrentUser()?.role !== "admin") {
    setState({ route: ROUTES.WORKSPACE });
    showToast("只有管理员能进入邀请码后台");
    render();
    return;
  }

  $("#createCodeBtn")?.addEventListener("click", async () => {
    const code = $("#adminCodeInput").value.trim().toUpperCase() || `FINAL${Math.floor(1000 + Math.random() * 9000)}`;
    const credits = Math.max(1, Number($("#adminCreditInput").value) || 100);
    try {
      const payload = await apiRequest("/api/admin/invite-codes", {
        method: "POST",
        body: JSON.stringify({ code, credits }),
      });
      setState({ inviteCodes: payload.inviteCodes || {} });
      showToast(`已生成邀请码 ${code}`);
      render();
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#clearDemoBtn")?.addEventListener("click", () => {
    if (!confirm("确定清空本浏览器中的本地页面状态？服务端用户和积分不会被清空。")) return;
    resetState();
    render();
  });
}

loadSession().catch(() => {}).finally(render);
