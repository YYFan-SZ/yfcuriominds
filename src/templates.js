import { DEFAULT_SETTINGS, ROUTES, WORKSPACE_STEPS } from "./constants.js";
import { getGenerationCost } from "./commentGenerator.js";
import { escapeHtml } from "./utils.js";

export function renderApp(state, user) {
  if (!user || state.route === ROUTES.ENTER) return renderEnterPage();

  return `
    <main class="app-layout">
      ${renderTopNav(state, user)}
      <section class="page-shell">
        ${state.route === ROUTES.WORKSPACE ? renderWorkspace(state) : ""}
        ${state.route === ROUTES.HISTORY ? renderHistory(state) : ""}
        ${state.route === ROUTES.TAG_LIBRARY ? renderTagLibraryPage(state) : ""}
        ${state.route === ROUTES.ACCOUNT ? renderAccount(state, user) : ""}
        ${state.route === ROUTES.ADMIN ? renderAdmin(state) : ""}
      </section>
    </main>
  `;
}

function renderEnterPage() {
  return `
    <main class="entry-page">
      <section class="entry-card">
        <div class="brand-row">
          <div class="brand-mark"><img class="brand-logo" src="./logo.png" alt="期末评语助手" /></div>
          <div>
            <h1>期末评语助手</h1>
            <p>登录后批量生成学生评语</p>
          </div>
        </div>
        <div class="login-switch" role="tablist" aria-label="登录方式">
          <button class="login-switch-btn active" data-login-mode="invite" type="button">邀请码登录</button>
          <button class="login-switch-btn" data-login-mode="password" type="button">账号密码登录</button>
        </div>
        <div class="login-choice active" data-login-panel="invite">
          <form id="inviteLoginForm" class="entry-form">
            <label>
              邀请码
              <input id="inviteCodeInput" type="text" placeholder="请输入邀请码" autocomplete="one-time-code" />
            </label>
            <button class="primary-btn" type="submit">邀请码登录</button>
          </form>
        </div>
        <div class="login-choice" data-login-panel="password">
          <form id="passwordLoginForm" class="entry-form">
            <label>
              昵称
              <input id="loginNicknameInput" type="text" placeholder="请输入昵称" autocomplete="username" />
            </label>
            <label>
              密码
              <input id="loginPasswordInput" type="password" placeholder="请输入密码" autocomplete="current-password" />
            </label>
            <button class="dark-btn" type="submit">账号密码登录</button>
          </form>
        </div>
      </section>
    </main>
  `;
}
function renderTopNav(state, user) {
  const navItems = [
    [ROUTES.WORKSPACE, "工作台"],
    [ROUTES.HISTORY, "历史记录"],
    [ROUTES.ACCOUNT, "账号积分"],
  ];
  if (user.role === "admin") navItems.push([ROUTES.ADMIN, "邀请码后台"]);

  return `
    <header class="app-header">
      <div class="brand-row compact">
        <div class="brand-mark"><img class="brand-logo" src="./logo.png" alt="期末评语助手" /></div>
        <div>
          <h1>期末评语助手</h1>
          <p>${escapeHtml(user.nickname)} · ${user.credits} 积分</p>
        </div>
      </div>
      <nav class="main-nav">
        ${navItems.map(([route, label]) => `<button class="nav-btn ${state.route === route ? "active" : ""}" data-route="${route}" type="button">${label}</button>`).join("")}
        ${state.route === ROUTES.WORKSPACE ? `<div class="nav-stat"><span>学生</span><strong>${state.students.length} 人</strong></div>` : ""}
        <button id="logoutBtn" class="ghost-btn" type="button">退出</button>
      </nav>
    </header>
  `;
}
function renderWorkspace(state) {
  return `
    <section class="workspace-hero">
      <div>
        <p class="eyebrow">Teacher Comment Batch Tool</p>
        <h2>按步骤完成：导入名单、逐个打标签、生成评语、编辑导出</h2>
        <p class="hero-desc">为每位学生保留个性化线索，批量生成自然、稳妥、方便修改的期末评语。</p>
      </div>
    </section>
    ${renderStepNav(state.activeStep)}
    ${state.activeStep === WORKSPACE_STEPS.IMPORT ? renderImportStep(state) : ""}
    ${state.activeStep === WORKSPACE_STEPS.TAGS ? renderTagsStep(state) : ""}
    ${state.activeStep === WORKSPACE_STEPS.SETTINGS ? renderSettingsStep(state) : ""}
    ${state.activeStep === WORKSPACE_STEPS.RESULTS ? renderResultsStep(state) : ""}
  `;
}

function renderStepNav(activeStep) {
  const steps = [
    [WORKSPACE_STEPS.IMPORT, "1", "导入学生", "粘贴、手动或上传名单"],
    [WORKSPACE_STEPS.TAGS, "2", "逐个标签", "为学生添加个性线索"],
    [WORKSPACE_STEPS.SETTINGS, "3", "生成设置", "设置评语风格与场景"],
    [WORKSPACE_STEPS.RESULTS, "4", "编辑导出", "生成并导出评语"],
  ];
  return `<nav class="step-nav">${steps.map(([step, index, label, desc]) => `<button class="step-btn ${activeStep === step ? "active" : ""}" data-step="${step}" type="button"><span>${index}</span><strong>${label}</strong><small>${desc}</small></button>`).join("")}</nav>`;
}

function renderImportStep(state) {
  return `
    <section class="work-step">
      <div class="layout-grid">
        <section class="panel">
          <div class="section-title"><h3>导入学生</h3><span>粘贴、手动添加、CSV/TXT</span></div>
          <div class="import-tabs">
            <button class="tab-btn active" data-tab="paste" type="button">粘贴名单</button>
            <button class="tab-btn" data-tab="manual" type="button">手动添加</button>
            <button class="tab-btn" data-tab="upload" type="button">上传文件</button>
          </div>
          <div class="tab-view active" id="pasteTab">
            <textarea id="namesInput" placeholder="每行一个学生姓名，也可以粘贴 Excel 的姓名列"></textarea>
            <button id="importNamesBtn" class="primary-btn full-btn" type="button">导入名单</button>
          </div>
          <div class="tab-view" id="manualTab">
            <div class="inline-form">
              <input id="singleNameInput" type="text" placeholder="学生姓名" />
              <button id="addStudentBtn" class="primary-btn" type="button">添加</button>
            </div>
          </div>
          <div class="tab-view" id="uploadTab">
            <label class="file-box" for="fileInput">
              <input id="fileInput" type="file" accept=".xlsx,.csv,.txt" />
              <span>上传 Excel / CSV / TXT 名单</span>
              <small>Excel 可以是整张表，但请保留“姓名”或“学生姓名”这一列表头；系统只读取姓名列。</small>
            </label>
            <div class="format-guide">
              <strong>文件格式要求</strong>
              <p>推荐上传 .xlsx 文件。表格里可以有成绩、班级、备注等其它列，但必须有一列叫“姓名”或“学生姓名”。</p>
              <img class="format-image" src="./assets/import-format.svg" alt="Excel 名单上传格式示意图" />
              <p>如果没有表头，系统会默认读取第一列。老版 .xls 请先另存为 .xlsx 再上传。</p>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="section-title"><h3>已导入名单</h3><span>${state.students.length} 人</span></div>
          ${state.students.length ? renderNamePreview(state) : renderEmpty("还没有学生", "导入名单后，可以进入下一步逐个选择标签。")}
          <div class="footer-actions"><button class="dark-btn" data-step="${WORKSPACE_STEPS.TAGS}" type="button">下一步：逐个标签</button></div>
        </section>
      </div>
    </section>
  `;
}
function renderNamePreview(state) {
  return `
    <div id="importedStudentList" class="name-preview editable" data-student-order-list>
      ${state.students
        .map(
          (student, index) => `
            <div class="imported-student-row" data-id="${student.id}">
              <strong draggable="true" data-drag-handle title="拖动调整顺序">${index + 1}</strong>
              <input data-import-name value="${escapeHtml(student.name)}" aria-label="学生姓名" />
              <button class="icon-btn" data-import-delete type="button" title="删除学生" aria-label="删除学生">×</button>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTagsStep(state) {
  const activeStudent = state.students.find((student) => student.id === state.activeStudentId) || state.students[0];
  return `
    <section class="work-step">
      <section class="panel">
        <div class="section-title">
          <div><h3>为每个学生选择标签</h3><p class="subtle">左侧一行多个学生，点中学生后在右侧选择标签；标签可选可不选。</p></div>
          <div class="button-row">
            <button class="ghost-btn" data-route="${ROUTES.TAG_LIBRARY}" type="button">编辑标签库</button>
            <button id="fillEmptyTagsBtn" class="ghost-btn" type="button">空标签填默认</button>
            <button id="clearAllTagsBtn" class="ghost-btn" type="button">清空全部标签</button>
          </div>
        </div>
        ${
          state.students.length
            ? `
              <div class="tag-workspace">
                <div>
                  <div class="mini-section-title">学生列表</div>
                  <div id="studentList" class="student-list" data-student-order-list>${state.students.map((student, index) => renderStudentCard(student, index, activeStudent?.id)).join("")}</div>
                </div>
                ${renderActiveTagEditor(activeStudent, state.tagCategories || [])}
              </div>
            `
            : renderEmpty("还没有学生", "请先导入学生名单。")
        }
        <div class="footer-actions">
          <button class="ghost-btn" data-step="${WORKSPACE_STEPS.IMPORT}" type="button">返回导入</button>
          <button class="dark-btn" data-step="${WORKSPACE_STEPS.SETTINGS}" type="button">下一步：生成设置</button>
        </div>
      </section>
    </section>
  `;
}
function renderStudentCard(student, index, activeStudentId) {
  const tags = student.tags || [];
  return `
    <article class="student-card compact ${student.id === activeStudentId ? "active" : ""}" data-id="${student.id}">
      <div class="student-main">
        <span class="student-index" draggable="true" data-drag-handle title="拖动调整顺序">${index + 1}</span>
        <input data-name-input value="${escapeHtml(student.name)}" aria-label="学生姓名" />
        <button class="icon-btn" type="button" title="删除学生" aria-label="删除学生">×</button>
      </div>
      <div class="selected-tags">${tags.length ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") : "<em>未选择标签</em>"}</div>
    </article>
  `;
}

function renderActiveTagEditor(student, tagCategories) {
  if (!student) return "";
  const tags = student.tags || [];
  return `
    <aside id="tagEditor" class="tag-editor" data-id="${student.id}">
      <div class="mini-section-title">当前编辑：${escapeHtml(student.name)}</div>
      <div class="quick-tag-grid">
        ${tagCategories.map((category) => renderTagCategory(category, tags)).join("")}
        <label class="quick-tag-input custom-note">
          补充描述
          <input data-student-note value="${escapeHtml(student.note || "")}" placeholder="如：最近更愿意举手、作业稳定很多" />
        </label>
      </div>
    </aside>
  `;
}

function renderTagCategory(category, selectedTags) {
  return `
    <div class="tag-category">
      <div class="tag-category-title">
        <h4>${category.name}</h4>
        <span>${category.hint}</span>
      </div>
      <div class="student-tag-cloud">
        ${category.tags.map((tag) => `<button class="tag ${selectedTags.includes(tag) ? "active" : ""}" data-tag="${tag}" type="button">${tag}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderTagLibraryEditor(tagCategories) {
  return `
    <section id="tagLibraryEditor" class="tag-library-editor">
      <div class="tag-library-heading">
        <div class="mini-section-title">标签库编辑</div>
        <button id="resetTagLibraryBtn" class="text-btn" type="button">恢复默认</button>
      </div>
      <div class="tag-library-list">
        ${tagCategories
          .map(
            (category, categoryIndex) => `
              <div class="tag-library-category" data-category-index="${categoryIndex}">
                <div class="tag-library-title">
                  <strong>${escapeHtml(category.name)}</strong>
                  <span>可修改、删除、新增</span>
                </div>
                <div class="tag-library-tags">
                  ${category.tags
                    .map(
                      (tag, tagIndex) => `
                        <label class="tag-edit-chip">
                          <input data-tag-edit value="${escapeHtml(tag)}" data-tag-index="${tagIndex}" aria-label="${escapeHtml(category.name)}标签" />
                          <button class="tag-remove-btn" data-tag-remove data-tag-index="${tagIndex}" type="button" title="删除标签" aria-label="删除标签">×</button>
                        </label>
                      `,
                    )
                    .join("")}
                </div>
                <div class="tag-add-row">
                  <input data-tag-add-input placeholder="新增${escapeHtml(category.name)}标签" />
                  <button class="ghost-btn" data-tag-add type="button">添加</button>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTagLibraryPage(state) {
  return `
    <header class="page-title">
      <div>
        <p class="eyebrow">Tag Library</p>
        <h2>标签库编辑</h2>
      </div>
      <button class="ghost-btn" data-step="${WORKSPACE_STEPS.TAGS}" type="button">返回逐个标签</button>
    </header>
    <section class="panel">
      <div class="section-title">
        <div>
          <h3>自定义标签</h3>
          <p class="subtle">这里修改的是老师自己的标签库，会同步到“逐个标签”页面；已选中的同名标签也会跟着更新。</p>
        </div>
      </div>
      ${renderTagLibraryEditor(state.tagCategories || [])}
    </section>
  `;
}

function renderSettingsStep(state) {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const customLengthValue = settings.length === "自定义" ? settings.customLength || "" : "";
  const selectedStudentIds = getSelectedGenerationIds(state);
  const selectedStudents = state.students.filter((student) => selectedStudentIds.has(student.id));
  const isGenerating = state.generationStatus?.type === "loading";
  return `
    <section class="work-step">
      <section class="panel settings-panel">
        <div class="section-title"><h3>生成设置</h3><button id="resetSettingsBtn" class="text-btn" type="button">恢复默认</button></div>
        <div class="form-grid">
          ${renderSelect("stageSelect", "学段", ["小学低年级", "小学高年级", "初中", "高中"], settings.stage)}
          ${renderSelect("sceneSelect", "使用场景", ["成绩单 / 报告册评语", "家长版", "简短版", "鼓励版", "正式版"], settings.scene)}
          ${renderSelect("lengthSelect", "评语字数", ["50字", "100字", "自定义"], settings.length)}
          ${
            settings.length === "自定义"
              ? `<label>
                  自定义字数
                  <input id="customLengthInput" type="number" min="20" max="500" step="10" placeholder="例如 80" value="${escapeHtml(customLengthValue)}" />
                </label>`
              : ""
          }
          ${renderSelect("toneSelect", "语气风格", ["温柔", "正式", "鼓励", "亲切", "简短"], settings.tone)}
        </div>
        <label class="wide-label">
          学校常用模板
          <textarea id="templateInput" placeholder="可粘贴 1-3 条学校常用评语。系统会参考格式、语气和长度，不会照搬。">${escapeHtml(settings.template)}</textarea>
        </label>
        ${state.students.length ? renderGenerationStudentPanel(state.students, selectedStudentIds) : ""}
        ${renderGenerationStatus(state.generationStatus)}
        <div class="cost-bar">
          <span>预计消耗：<strong>${getGenerationCost(selectedStudents, settings)}</strong> 积分（已选 ${selectedStudents.length} 人，每条 1 积分）</span>
          <div class="button-row">
            <button class="ghost-btn" data-step="${WORKSPACE_STEPS.TAGS}" type="button">返回标签</button>
            <button id="generateBtn" class="dark-btn" type="button" ${isGenerating ? "disabled" : ""}>${isGenerating ? "生成中..." : "批量生成初稿"}</button>
          </div>
        </div>
      </section>
    </section>
  `;
}
function getSelectedGenerationIds(state) {
  const validIds = new Set(state.students.map((student) => student.id));
  if (!Array.isArray(state.selectedGenerationStudentIds)) return validIds;
  return new Set(state.selectedGenerationStudentIds.filter((id) => validIds.has(id)));
}

function renderGenerationStatus(status) {
  if (!status) return "";
  return `
    <div class="generation-status ${status.type}">
      <strong>${escapeHtml(status.title || "生成状态")}</strong>
      <span>${escapeHtml(status.message || "")}</span>
    </div>
  `;
}
function renderSelect(id, label, options, value) {
  return `
    <label>
      ${label}
      <select id="${id}">
        ${options.map((option) => `<option ${option === value ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderResultsStep(state) {
  const entries = state.students.filter((student) => state.comments[student.id]);
  return `
    <section class="work-step">
      <section class="results-section">
        ${renderGenerationStatus(state.generationStatus)}
        <div class="section-title">
          <h3>编辑与导出</h3>
          <div class="result-tools">
            <select id="bulkToneSelect" aria-label="批量换风格">
              ${["正式", "温柔", "鼓励", "亲切", "简短"].map((tone) => `<option ${tone === "温柔" ? "selected" : ""}>${tone}</option>`).join("")}
            </select>
            <button id="bulkToneBtn" class="ghost-btn" type="button">一键换风格</button>
            <button id="copyAllBtn" class="ghost-btn" type="button">复制所选</button>
            <button id="exportExcelBtn" class="ghost-btn" type="button">导出 Excel</button>
            <button id="exportWordBtn" class="primary-btn" type="button">导出 Word</button>
          </div>
        </div>
        ${
          entries.length
            ? `
              <div class="selection-toolbar">
                <label><input id="selectAllResults" type="checkbox" checked /> 全选</label>
                <span id="selectedCount">${entries.length} / ${entries.length} 已选</span>
              </div>
              <div id="resultList" class="result-list" data-student-order-list>${entries.map((student) => renderResultCard(student, state.comments[student.id])).join("")}</div>
            `
            : renderEmpty("还没有评语", "完成学生标签和生成设置后，点击“批量生成初稿”。")
        }
      </section>
    </section>
  `;
}
function renderHistory(state) {
  const records = state.commentHistory || [];
  const status = state.commentHistoryStatus;
  return `
    <header class="page-title">
      <div>
        <p class="eyebrow">History</p>
        <h2>历史记录</h2>
      </div>
      <button id="refreshHistoryBtn" class="ghost-btn" type="button">刷新历史</button>
    </header>
    <section class="panel">
      <div class="section-title">
        <div>
          <h3>最近生成记录</h3>
          <p class="subtle">按每次生成聚合，可恢复到工作台继续编辑、复制或导出。</p>
        </div>
      </div>
      ${status ? renderGenerationStatus(status) : ""}
      ${
        records.length
          ? `<div id="historyList" class="history-list">${records.map((record) => renderHistoryCard(record)).join("")}</div>`
          : renderEmpty("暂无历史记录", "生成评语后，这里会自动显示最近的批次。")
      }
    </section>
  `;
}

function renderHistoryCard(record) {
  const settings = record.settings || {};
  const lengthText = settings.length === "自定义" ? `自定义${settings.customLength || ""}字` : settings.length;
  const summary = [settings.stage, settings.scene, lengthText, settings.tone].filter(Boolean).join(" / ");
  return `
    <article class="history-card" data-history-id="${escapeHtml(record.id)}">
      <div class="history-card-main">
        <div>
          <strong>${escapeHtml(record.createdAtText || record.createdAt || "历史记录")}</strong>
          <p>${escapeHtml(summary || "未记录生成设置")}</p>
        </div>
        <span>${record.count} 条评语</span>
      </div>
      <div class="history-preview">
        ${record.items
          .slice(0, 3)
          .map((item) => `<span>${escapeHtml(item.studentName || item.studentId)}</span>`)
          .join("")}
        ${record.items.length > 3 ? `<em>等 ${record.items.length} 人</em>` : ""}
      </div>
      <button class="dark-btn" data-history-restore type="button">恢复到工作台</button>
    </article>
  `;
}
function renderResultCard(student, comment) {
  const tags = (student.tags || []).join("、") || "未选标签";
  return `
    <article class="result-card" data-id="${student.id}">
      <div class="result-card-header">
        <label class="result-select">
          <input data-result-select type="checkbox" checked />
          <span><strong draggable="true" data-drag-handle title="拖动调整顺序">${escapeHtml(student.name)}</strong><p>${escapeHtml(tags)}</p></span>
        </label>
        <div class="card-actions">
          <button class="small-btn" data-action="copy" type="button">复制</button>
          <button class="small-btn" data-action="rewrite" type="button">局部改写</button>
          <button class="small-btn" data-action="regenerate" type="button">重新生成</button>
        </div>
      </div>
      <textarea data-comment>${escapeHtml(comment)}</textarea>
      <div class="rewrite-box" hidden>
        <input data-rewrite-input placeholder="局部改写要求，如：更温柔一点、加入课堂积极、删掉提醒语气" />
        <button class="primary-btn" data-action="submit-rewrite" type="button">提交改写</button>
      </div>
    </article>
  `;
}
function renderGenerationStudentPanel(students, selectedIds) {
  const selectedCount = students.filter((student) => selectedIds.has(student.id)).length;
  const isAllSelected = selectedCount === students.length && students.length > 0;
  return `
    <section id="settingsStudentOrder" class="student-order-panel generation-student-panel">
      <div class="selection-toolbar generation-select-toolbar">
        <label><input id="selectAllGenerateStudents" type="checkbox" ${isAllSelected ? "checked" : ""} /> 全选生成对象</label>
        <span id="selectedGenerateCount">${selectedCount} / ${students.length} 已选</span>
      </div>
      <div class="mini-section-title">生成对象与顺序</div>
      <div class="student-order-list" data-student-order-list>
        ${students
          .map(
            (student, index) => `
              <div class="student-order-row generation-student-row" data-id="${student.id}">
                <label>
                  <input data-generate-student-select type="checkbox" ${selectedIds.has(student.id) ? "checked" : ""} />
                  <strong draggable="true" data-drag-handle title="拖动调整顺序">${index + 1}</strong>
                  <span>${escapeHtml(student.name)}</span>
                </label>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderAccount(state, user) {
  const logs = state.creditLogs.filter((log) => log.userId === user.id).slice(0, 20);
  return `
    <header class="page-title"><div><p class="eyebrow">Account</p><h2>账号积分</h2></div></header>
    <section class="layout-grid">
      <div class="panel">
        <div class="credit-card large"><span>当前积分</span><strong>${user.credits}</strong></div>
        <div class="account-meta">
          <p><strong>昵称</strong>${escapeHtml(user.nickname)}</p>
          <p><strong>邀请码</strong>${escapeHtml(user.inviteCode)}</p>
          <p><strong>账号密码</strong>${user.hasPassword ? "已设置" : "未设置"}</p>
        </div>
        <details class="account-security">
          <summary>${user.hasPassword ? "修改账号密码" : "设置账号密码"}</summary>
          <form id="accountCredentialsForm" class="account-credentials-form">
            <label>
              昵称
              <input id="accountNicknameInput" type="text" value="${escapeHtml(user.nickname)}" autocomplete="username" />
            </label>
            <label>
              新密码
              <input id="accountPasswordInput" type="password" placeholder="${user.hasPassword ? "留空则只修改昵称" : "至少 6 位"}" autocomplete="new-password" />
            </label>
            <label>
              确认新密码
              <input id="accountPasswordConfirmInput" type="password" placeholder="再次输入新密码" autocomplete="new-password" />
            </label>
            <div class="account-security-actions">
              <span>保存后即可使用账号密码登录。</span>
              <button class="primary-btn" type="submit">确认保存</button>
            </div>
          </form>
        </details>
      </div>
      <div class="panel">
        <div class="section-title"><h3>积分记录</h3></div>
        <div class="ledger-list">${logs.length ? logs.map((log) => `<div class="ledger-item"><strong>${log.amount > 0 ? "+" : ""}${log.amount} 积分</strong><span>${escapeHtml(log.description)}</span><small>${log.time}</small></div>`).join("") : "<div class='ledger-item'><span>暂无记录</span></div>"}</div>
      </div>
    </section>
  `;
}
function renderAdmin(state) {
  const entries = Object.entries(state.inviteCodes);
  return `
    <header class="page-title"><div><p class="eyebrow">Codes</p><h2>邀请码后台</h2></div></header>
    <section class="panel">
      <div class="section-title"><h3>生成邀请码</h3><span>系统会随机生成唯一邀请码</span></div>
      <div class="admin-grid">
        <input id="adminCreditInput" type="number" min="1" value="100" />
        <button id="createCodeBtn" class="dark-btn" type="button">生成邀请码</button>
      </div>
      <div class="code-list">
        ${entries
          .map(([code, info]) => {
            const status = info.usedBy ? "已使用" : "未使用";
            return `<div class="code-item"><strong>${escapeHtml(code)}</strong><span>${info.credits} 积分</span><small>${status}</small></div>`;
          })
          .join("")}
      </div>
    </section>
  `;
}
function renderEmpty(title, text) {
  return `<div class="empty-state"><strong>${title}</strong><span>${text}</span></div>`;
}
