/*
 * xyblue135 私人 · 附件镜像
 * 类型：xyblue135 私人插件（非公共发布版）
 * 说明：用户可见文案与维护注释已中文化；内部插件 ID 与 data.json 保持不变，以兼容原有设置和数据。
 */
const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  Modal,
  TFile,
  TFolder,
  normalizePath,
  ButtonComponent
} = require("obsidian");

const DEFAULT_SETTINGS = {
  notesRoot: "Notes",
  attachmentsRoot: "z_attachments",
  structureMode: "note",
  fileNameMode: "smart",
  handlePaste: true,
  handleDrop: true,
  syncOnNoteRename: true,
  deleteAttachmentsWithNote: true,
  // v2.1：删除 Markdown 时弹出“删除附件 / 删除文档”勾选确认对话框（默认全部勾选）。
  deleteDialogEnabled: true,
  recycleHistory: []
};

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"
]);

// Obsidian 中适合直接嵌入正文预览的附件。
// 图片和 PDF 使用 ![]()；压缩包、Office 等普通附件使用 []()。
const EMBED_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, "pdf"]);

// v2.1：删除勾选确认对话框。
// 两个复选框「删除附件」「删除文档」默认全部勾选；点取消则什么都不删除。
class MirrorDeleteDialog extends Modal {
  constructor(app, plugin, file, folderInfo) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.folderInfo = folderInfo;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("mirror-attachments-delete-modal");

    contentEl.createEl("h3", { text: "删除文件" });

    const infoEl = contentEl.createDiv({
      cls: "mirror-attachments-delete-info"
    });
    infoEl.createEl("div", {
      cls: "mirror-attachments-delete-path",
      text: this.file.path
    });

    if (this.folderInfo) {
      const attLine = infoEl.createDiv({
        cls: "mirror-attachments-delete-attachment"
      });
      attLine.createSpan({ text: "附件目录：" });
      attLine.createEl("code", { text: this.folderInfo.path });
      attLine.createSpan({
        text: `（${this.folderInfo.fileCount} 个文件）`
      });
      if (this.folderInfo.sharedNotes > 0) {
        infoEl.createDiv({
          cls: "mirror-attachments-delete-warning",
          text: `⚠ 仍有 ${this.folderInfo.sharedNotes} 篇同名笔记共享此附件目录，勾选“删除附件”会影响它们。`
        });
      }
    } else {
      infoEl.createDiv({
        cls: "mirror-attachments-delete-none",
        text: "未找到对应的附件镜像目录，本次只能删除文档。"
      });
    }

    const optionsEl = contentEl.createDiv({
      cls: "mirror-attachments-delete-options"
    });

    let attachmentCheckbox = null;
    if (this.folderInfo) {
      new Setting(optionsEl)
        .setName("删除附件")
        .setDesc("将该笔记对应的附件镜像目录移入插件垃圾桶（可在设置页恢复）")
        .addCheckbox((checkbox) => {
          attachmentCheckbox = checkbox;
          checkbox.setValue(true);
        });
    }

    let documentCheckbox = null;
    new Setting(optionsEl)
      .setName("删除文档")
      .setDesc("删除这篇 Markdown 笔记本身（移入系统回收站）")
      .addCheckbox((checkbox) => {
        documentCheckbox = checkbox;
        checkbox.setValue(true);
      });

    // v2.1.1：按钮放到 Obsidian 模态框标准底部按钮区，避免被内容区域裁剪/压住。
    this.addButton((btn) =>
      btn.setButtonText("取消").onClick(() => this.close())
    );

    this.addButton((btn) =>
      btn
        .setButtonText("确认删除")
        .setWarning()
        .onClick(async () => {
          const deleteAttachments = attachmentCheckbox
            ? attachmentCheckbox.getValue()
            : false;
          const deleteDocument = documentCheckbox
            ? documentCheckbox.getValue()
            : false;
          this.close();
          await this.plugin.executeManualDelete(this.file, {
            deleteAttachments,
            deleteDocument
          });
        })
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

module.exports = class MirrorAttachmentsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    await this.migrateLegacyFlatAttachmentRootIfNeeded();
    this.addSettingTab(new MirrorAttachmentsSettingTab(this.app, this));

    // v2.1：手动勾选删除流程进行中时，跳过 delete 事件的自动回收。
    // 用 Set 记录“本次手动删除的文档路径”，delete 事件（可能异步触发）
    // 命中后消费一次即跳过，避免“只勾选删除文档”时附件又被自动回收。
    this.manualDeleteGuard = new Set();

    // v2.0：附件改为单层共享结构：z_attachments/<Markdown 文件名>/。
    // 不再镜像 Notes 的父目录；不同目录下的同名 Markdown 明确共享同一个附件目录。
    this.app.workspace.onLayoutReady(() => {
      void this.ensureAllNoteFolders().catch((err) => {
        console.error("[xyblue135 私人·附件镜像] initial folder sync failed:", err);
        new Notice("xyblue135 私人·附件镜像：初始化共享附件目录失败，请查看控制台。");
      });
    });

    // 新建 Markdown 时建立/复用单层附件目录。
    // 如果别的目录已经存在同名 Markdown，则明确提示“共享”，而不是创建第二份附件目录。
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.isManagedNotePath(file.path)) return;

        void this.ensureSharedAttachmentFolderForNote(file, { notifyDuplicate: true }).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] create shared folder failed:", err);
          new Notice(`xyblue135 私人·附件镜像：无法建立/复用附件目录：${this.getAttachmentFolderForNotePath(file.path)}`);
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor, info) => {
        if (!this.settings.handlePaste || evt.defaultPrevented) return;

        // Windows / Electron 在“资源管理器复制文件 → Obsidian 粘贴”时，
        // 某些文件类型（例如 ZIP）不一定稳定出现在 DataTransfer.files 中，
        // 但通常仍可从 DataTransfer.items 的 file item 取到。
        // 因此统一从 files + items 两个入口收集，并做去重。
        const files = this.getFilesFromDataTransfer(evt.clipboardData);

        if (!files.length) return;

        const note = info && info.file;
        if (!(note instanceof TFile) || note.extension !== "md") return;

        // 接管文件/图片粘贴，阻止 Obsidian 默认附件逻辑。
        evt.preventDefault();
        evt.stopPropagation();

        void this.importFiles(files, note, editor).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] paste failed:", err);
          new Notice("xyblue135 私人·附件镜像：粘贴附件失败，请查看控制台。");
        });
      })
    );

    this.registerEvent(
      this.app.workspace.on("editor-drop", (evt, editor, info) => {
        if (!this.settings.handleDrop || evt.defaultPrevented) return;

        const files = this.getFilesFromDataTransfer(evt.dataTransfer);

        // Obsidian 内部拖动通常没有系统 FileList / file item，因此不会误拦截。
        if (!files.length) return;

        const note = info && info.file;
        if (!(note instanceof TFile) || note.extension !== "md") return;

        evt.preventDefault();
        evt.stopPropagation();

        void this.importFiles(files, note, editor).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] drop failed:", err);
          new Notice("xyblue135 私人·附件镜像：拖入附件失败，请查看控制台。");
        });
      })
    );

    // Markdown 仅在“文件名本身发生变化”时处理附件目录。
    // 单纯移动父目录、重命名 Notes 根目录不会改变 z_attachments/<文件名>/，因此不搬附件。
    // 仍使用串行队列，避免批量重命名时发生并发冲突。
    this.renameSyncQueue = Promise.resolve();
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!this.settings.syncOnNoteRename) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;

        // 立即保存事件发生时的新路径，避免排队期间 file.path 又发生变化。
        const newPath = file.path;
        this.renameSyncQueue = this.renameSyncQueue
          .then(() => this.syncAttachmentFolderAfterRename(newPath, oldPath))
          .catch((err) => {
            console.error("[xyblue135 私人·附件镜像] rename sync failed:", err);
            new Notice("xyblue135 私人·附件镜像：同步附件目录失败，请查看控制台。");
          });
      })
    );

    // Markdown 真正删除时按“同名引用计数”决定是否回收附件。
    // 只要 Vault 中仍有另一篇同名 Markdown，z_attachments/<文件名>/ 就继续保留。
    // 只有最后一个同名 Markdown 被删除时，才进入插件自己的可恢复垃圾桶。
    // 注意：手动勾选删除流程（executeManualDelete）会先自行处理附件并置位
    // skipAutoTrash，因此这里必须跳过，避免重复回收。
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        // 手动勾选删除流程已自行处理附件：命中守卫则消费并跳过自动回收。
        if (file && this.manualDeleteGuard.has(file.path)) {
          this.manualDeleteGuard.delete(file.path);
          return;
        }
        if (!this.settings.deleteAttachmentsWithNote) return;
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.isManagedNotePath(file.path)) return;

        void this.trashAttachmentFolderAfterNoteDelete(file.path).catch((err) => {
          console.error("[xyblue135 私人·附件镜像] delete sync failed:", err);
          new Notice("xyblue135 私人·附件镜像：关联删除附件目录失败，请查看控制台。");
        });
      })
    );

    // 左侧文件树右键 Markdown -> 打开对应附件目录。
    // v2.1：开启删除确认后，同时把 Obsidian 默认的“删除”项替换为
    // “删除…（可勾选附件）”，确保取消 = 什么都不删除。
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;

        if (
          this.settings.deleteDialogEnabled &&
          this.isManagedNotePath(file.path)
        ) {
          this.replaceDeleteMenuItems(menu, file);
        }

        menu.addItem((item) => {
          item
            .setTitle("📂 打开对应附件目录")
            .onClick(() => {
              void this.revealAttachmentFolder(file);
            });
        });
      })
    );

    // v2.1：文件树中按 Delete 键删除 Markdown 时，先弹出勾选确认。
    // 使用 capture 阶段监听并阻止 Obsidian 默认删除动作。
    const deleteKeyHandler = (event) => {
      if (!this.settings.deleteDialogEnabled) return;
      if (event.key !== "Delete") return;

      // 只在文件树容器内生效；编辑器中的 Delete 是删除字符，绝不能拦。
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const inExplorer =
        target.closest(".nav-files-container") ||
        target.closest(".workspace-leaf-content[data-type='file-explorer']") ||
        target.closest(".tree-item[data-path]");
      if (!inExplorer) return;

      const files = this.getSelectedExplorerFiles();
      const mdFiles = files.filter(
        (f) =>
          f instanceof TFile &&
          f.extension === "md" &&
          this.isManagedNotePath(f.path)
      );
      if (!mdFiles.length) return;

      if (mdFiles.length > 1) {
        new Notice(
          "xyblue135 私人·附件镜像：暂不支持多选批量删除，请逐个删除。",
          5000
        );
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void this.openDeleteDialog(mdFiles[0]);
    };
    document.addEventListener("keydown", deleteKeyHandler, true);
    this.register(() => {
      document.removeEventListener("keydown", deleteKeyHandler, true);
    });

    // v2.1：命令面板 / 快捷键 / 文件树“删除按钮”触发的删除命令统一走勾选确认。
    // 关键修复：删除命令的目标文件是“文件树中选中的文件”，不是当前打开的笔记。
    // 之前写死 getActiveFile() 会导致：在文件树点 B 的删除、却用编辑器里打开的
    // A 当目标，从而弹错文件、甚至吞掉 B 的删除（表现为“删不掉 / 没确认”）。
    // 这里优先取选中的 Markdown 文件，取不到才回退到活动文件，与 Delete 键逻辑一致。
    const originalExecuteCommand = this.app.commands.executeCommandById.bind(
      this.app.commands
    );
    this.app.commands.executeCommandById = async (commandId, ...args) => {
      if (
        this.settings.deleteDialogEnabled &&
        typeof commandId === "string" &&
        /delete-file/.test(commandId)
      ) {
        let target = null;
        const selected = this.getSelectedExplorerFiles();
        const mdFiles = selected.filter(
          (f) =>
            f instanceof TFile &&
            f.extension === "md" &&
            this.isManagedNotePath(f.path)
        );
        if (mdFiles.length) {
          target = mdFiles[0];
        } else {
          const activeFile = this.app.workspace.getActiveFile();
          if (
            activeFile instanceof TFile &&
            activeFile.extension === "md" &&
            this.isManagedNotePath(activeFile.path)
          ) {
            target = activeFile;
          }
        }
        if (target) {
          await this.openDeleteDialog(target);
          return;
        }
      }
      return originalExecuteCommand(commandId, ...args);
    };
    this.register(() => {
      this.app.commands.executeCommandById = originalExecuteCommand;
    });
  }

  async loadSettings() {
    const loaded = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

    // v2.0.1：新安装统一使用 z_attachments。
    // 若 data.json 来自 v2.0.0 且仍是 attachment，则交给安全迁移函数处理；
    // 不直接改路径，避免旧目录尚未搬迁时先创建一套新的空目录。
    this.legacyFlatRootMigrationNeeded = this.cleanRoot(loaded.attachmentsRoot || "") === "attachment";

    // v2.0：固定使用“单层文件名共享附件目录”：z_attachments/<basename>/。
    // 同名 Markdown 共享目录；附件命名继续沿用智能规则。
    let migrated = false;
    if (this.settings.structureMode !== "note") {
      this.settings.structureMode = "note";
      migrated = true;
    }
    if (this.settings.syncOnNoteRename !== true) {
      this.settings.syncOnNoteRename = true;
      migrated = true;
    }
    if (!Array.isArray(this.settings.recycleHistory)) {
      this.settings.recycleHistory = [];
      migrated = true;
    }
    if (this.settings.fileNameMode !== "smart") {
      this.settings.fileNameMode = "smart";
      migrated = true;
    }

    if (migrated) await this.saveData(this.settings);
  }

  async migrateLegacyFlatAttachmentRootIfNeeded() {
    if (!this.legacyFlatRootMigrationNeeded) return;

    const oldRoot = normalizePath("attachment");
    const newRoot = normalizePath("z_attachments");
    const oldNode = this.app.vault.getAbstractFileByPath(oldRoot);
    const newNode = this.app.vault.getAbstractFileByPath(newRoot);

    // 两个目录同时存在时绝不自动合并，也不自动删除任何一边。
    // 继续保留旧配置，并提示用户手动确认，避免覆盖或误归并附件。
    if (oldNode && newNode) {
      new Notice(
        "xyblue135 私人·附件镜像：同时检测到 attachment 与 z_attachments，已停止自动迁移。请先手动确认数据，再把附件根目录改为 z_attachments。",
        10000
      );
      return;
    }

    // 旧 v2.0.0 单层目录存在、新目录不存在：整体安全改名。
    // 使用 FileManager，让 Obsidian 有机会同步 Vault 内相关链接。
    if (oldNode && !newNode) {
      if (!(oldNode instanceof TFolder)) {
        new Notice("xyblue135 私人·附件镜像：Vault 根目录存在名为 attachment 的非文件夹对象，无法自动迁移。", 10000);
        return;
      }

      try {
        await this.app.fileManager.renameFile(oldNode, newRoot);
        this.settings.attachmentsRoot = newRoot;
        this.legacyFlatRootMigrationNeeded = false;
        await this.saveSettings();
        new Notice("xyblue135 私人·附件镜像：已将旧 attachment 安全迁移为 z_attachments。", 7000);
      } catch (err) {
        console.error("[xyblue135 私人·附件镜像] migrate attachment -> z_attachments failed:", err);
        new Notice("xyblue135 私人·附件镜像：attachment → z_attachments 自动迁移失败，已保留旧配置和数据。", 10000);
      }
      return;
    }

    // 旧目录不存在（或新目录已经存在而旧目录不存在），只更新配置即可。
    this.settings.attachmentsRoot = newRoot;
    this.legacyFlatRootMigrationNeeded = false;
    await this.saveSettings();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getManagedMarkdownFiles() {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => this.isManagedNotePath(file.path));
  }

  getNoteBasenameFromPath(notePath) {
    const normalized = normalizePath(notePath || "");
    const fileName = normalized.split("/").pop() || "";
    return this.stripExtension(fileName);
  }

  getNotesByBasename(basename, excludePath = "") {
    const excluded = excludePath ? normalizePath(excludePath) : "";
    return this.getManagedMarkdownFiles().filter((file) =>
      file.basename === basename && (!excluded || normalizePath(file.path) !== excluded)
    );
  }

  getDuplicateNoteGroups() {
    const groups = new Map();
    for (const note of this.getManagedMarkdownFiles()) {
      if (!groups.has(note.basename)) groups.set(note.basename, []);
      groups.get(note.basename).push(note.path);
    }

    return Array.from(groups.entries())
      .filter(([, paths]) => paths.length > 1)
      .map(([basename, paths]) => ({
        basename,
        count: paths.length,
        notePaths: paths.sort((a, b) => a.localeCompare(b, "zh-CN")),
        folderPath: this.getAttachmentFolderForBasename(basename)
      }))
      .sort((a, b) => b.count - a.count || a.basename.localeCompare(b.basename, "zh-CN"));
  }

  getAttachmentFolderForBasename(basename) {
    const attachmentRoot = this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments";
    return normalizePath(`${attachmentRoot}/${basename}`);
  }

  async ensureSharedAttachmentFolderForNote(note, options = {}) {
    const folderPath = this.getAttachmentFolderForNotePath(note.path);
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    const peers = this.getNotesByBasename(note.basename, note.path);

    if (existing && !(existing instanceof TFolder)) {
      throw new Error(`无法创建目录：${folderPath} 已存在同名文件`);
    }

    if (!(existing instanceof TFolder)) await this.ensureFolder(folderPath);

    if (options.notifyDuplicate && peers.length) {
      const preview = peers.slice(0, 3).map((file) => file.path).join("\n");
      const more = peers.length > 3 ? `\n另有 ${peers.length - 3} 篇同名笔记` : "";
      new Notice(
        `xyblue135 私人·附件镜像：检测到同名笔记「${note.basename}」\n不会重复创建附件目录，将共享：${folderPath}\n${preview}${more}`,
        8000
      );
    }

    return { folderPath, sharedWith: peers.length };
  }

  async ensureAllNoteFolders() {
    if (this.settings.structureMode !== "note") {
      return { created: 0, conflicts: [] };
    }

    let created = 0;
    const conflicts = [];

    for (const note of this.getManagedMarkdownFiles()) {
      const folderPath = this.getAttachmentFolderForNotePath(note.path);
      const existing = this.app.vault.getAbstractFileByPath(folderPath);

      if (existing instanceof TFolder) continue;

      if (existing) {
        conflicts.push({
          notePath: note.path,
          folderPath,
          reason: "目标位置存在同名文件，无法建立目录"
        });
        continue;
      }

      try {
        await this.ensureFolder(folderPath);
        created += 1;
      } catch (err) {
        conflicts.push({
          notePath: note.path,
          folderPath,
          reason: err && err.message ? err.message : String(err)
        });
      }
    }

    return { created, conflicts };
  }

  getRequiredAttachmentPaths(expectedFolders, attachmentRoot) {
    const required = new Set([normalizePath(attachmentRoot)]);
    const root = normalizePath(attachmentRoot);

    for (const folderPath of expectedFolders) {
      let current = normalizePath(folderPath);
      required.add(current);

      while (current && current !== root) {
        current = this.parentPath(current);
        if (!current) break;
        required.add(current);
        if (current === root) break;
      }
    }

    return required;
  }

  getFoldersUnderRoot(rootPath) {
    const root = normalizePath(rootPath);
    const rootFolder = this.app.vault.getAbstractFileByPath(root);
    if (!(rootFolder instanceof TFolder)) return [];

    const result = [];
    const walk = (folder) => {
      for (const child of folder.children || []) {
        if (child instanceof TFolder) {
          result.push(child);
          walk(child);
        }
      }
    };

    walk(rootFolder);
    return result;
  }

  async auditFolderConsistency() {
    const attachmentRoot = this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments";
    const notes = this.getManagedMarkdownFiles();
    const groups = new Map();

    for (const note of notes) {
      if (!groups.has(note.basename)) groups.set(note.basename, []);
      groups.get(note.basename).push(note.path);
    }

    const expected = new Map();
    for (const [basename, notePaths] of groups.entries()) {
      expected.set(this.getAttachmentFolderForBasename(basename), { basename, notePaths });
    }

    const missing = [];
    const conflicts = [];
    for (const [folderPath, group] of expected.entries()) {
      const existing = this.app.vault.getAbstractFileByPath(folderPath);
      if (existing instanceof TFolder) continue;
      if (existing) {
        conflicts.push({
          notePath: group.notePaths.join(" | "),
          folderPath,
          reason: "应为共享附件文件夹，但当前位置存在同名文件"
        });
      } else {
        missing.push({
          basename: group.basename,
          notePaths: group.notePaths,
          folderPath
        });
      }
    }

    // 单层模式只把 z_attachments 根目录的直接子目录当作“文章附件目录”。
    // 文章附件目录内部的子文件夹属于附件内容，不参与结构校验。
    const expectedPaths = new Set(expected.keys());
    const rootFolder = this.app.vault.getAbstractFileByPath(normalizePath(attachmentRoot));
    const extra = [];
    if (rootFolder instanceof TFolder) {
      for (const child of rootFolder.children || []) {
        if (!(child instanceof TFolder)) continue;
        const path = normalizePath(child.path);
        if (this.isRecyclePath(path)) continue;
        if (!expectedPaths.has(path)) extra.push({ folderPath: path });
      }
    }

    const duplicates = this.getDuplicateNoteGroups();
    return {
      supported: true,
      notesCount: notes.length,
      expectedCount: expected.size,
      duplicateGroups: duplicates,
      missing,
      extra,
      conflicts,
      attachmentRoot
    };
  }

  async repairFolderConsistency(auditResult = null) {
    const audit = auditResult || await this.auditFolderConsistency();
    let created = 0;
    const conflicts = [...(audit.conflicts || [])];

    for (const item of audit.missing || []) {
      try {
        await this.ensureFolder(item.folderPath);
        created += 1;
      } catch (err) {
        conflicts.push({
          notePath: (item.notePaths || []).join(" | "),
          folderPath: item.folderPath,
          reason: err && err.message ? err.message : String(err)
        });
      }
    }

    // v2.0 安全原则：不自动回收“多余”目录。
    // 它们可能是旧镜像结构、历史绝对链接仍在引用的目录，或用户手工保存的数据。
    return { created, preservedExtra: (audit.extra || []).length, conflicts };
  }

  cleanRoot(path) {
    path = (path || "").trim().replace(/^\/+|\/+$/g, "");
    return path ? normalizePath(path) : "";
  }

  isManagedNotePath(notePath) {
    const normalized = normalizePath(notePath);
    const notesRoot = this.cleanRoot(this.settings.notesRoot);
    const attachmentRoot =
      this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments";

    // 配置了 Notes 根目录时，只管理该目录下的 Markdown，
    // 防止删除附件根目录中的 .md 附件时发生误关联。
    if (notesRoot) {
      return normalized.startsWith(notesRoot + "/");
    }

    // notesRoot 为空代表允许管理整个库，但仍排除附件根目录自身。
    return !(
      normalized === attachmentRoot ||
      normalized.startsWith(attachmentRoot + "/")
    );
  }

  getRelativeNotePath(notePath) {
    const notesRoot = this.cleanRoot(this.settings.notesRoot);
    const normalized = normalizePath(notePath);

    if (!notesRoot) return normalized;

    if (normalized.startsWith(notesRoot + "/")) {
      return normalized.slice(notesRoot.length + 1);
    }

    // 当前版本按原路径兜底；不添加额外的 Notes 外规则。
    return normalized;
  }

  stripExtension(path) {
    return path.replace(/\.md$/i, "");
  }

  parentPath(path) {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(0, i) : "";
  }

  getAttachmentFolderForNotePath(notePath) {
    const basename = this.getNoteBasenameFromPath(notePath);
    return this.getAttachmentFolderForBasename(basename);
  }

  async ensureFolder(path) {
    const normalized = normalizePath(path);
    if (!normalized) return;

    const parts = normalized.split("/").filter(Boolean);
    let current = "";

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);

      if (!existing) {
        try {
          await this.app.vault.createFolder(current);
        } catch (err) {
          // 文件夹批量改名时可能有多个事件同时尝试建立同一父目录。
          // 如果失败后发现目录已经由另一任务创建，则视为成功。
          const afterCreate = this.app.vault.getAbstractFileByPath(current);
          if (!(afterCreate instanceof TFolder)) throw err;
        }
      } else if (!(existing instanceof TFolder)) {
        throw new Error(`无法创建目录：${current} 已存在同名文件`);
      }
    }
  }

  getRecycleRoot() {
    const attachmentRoot =
      this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments";
    return normalizePath(`${attachmentRoot}/_MirrorAttachmentsTrash`);
  }

  isRecyclePath(path) {
    const normalized = normalizePath(path || "");
    const recycleRoot = this.getRecycleRoot();
    return normalized === recycleRoot || normalized.startsWith(recycleRoot + "/");
  }

  getRecycleRelativePath(originalPath) {
    const attachmentRoot = normalizePath(
      this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments"
    );
    const normalized = normalizePath(originalPath || "");
    if (normalized.startsWith(attachmentRoot + "/")) {
      return normalized.slice(attachmentRoot.length + 1);
    }
    return normalized.replace(/^\/+/, "");
  }

  makeRecycleRecordId() {
    return `${this.formatTimestamp(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async moveFolderToPluginRecycle(folder, meta = {}) {
    if (!(folder instanceof TFolder)) return null;

    const originalPath = normalizePath(folder.path);
    const attachmentRoot = normalizePath(
      this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments"
    );

    if (originalPath === attachmentRoot || this.isRecyclePath(originalPath)) {
      throw new Error(`拒绝回收受保护目录：${originalPath}`);
    }

    const id = this.makeRecycleRecordId();
    const relativePath = this.getRecycleRelativePath(originalPath);
    const recyclePath = normalizePath(`${this.getRecycleRoot()}/${id}/${relativePath}`);

    await this.ensureFolder(this.parentPath(recyclePath));

    // 使用 Vault.rename 而不是 FileManager.renameFile：
    // 回收期间不要把仍存在的 Markdown 链接自动改写成垃圾桶路径。
    await this.app.vault.rename(folder, recyclePath);

    const record = {
      id,
      deletedAt: new Date().toISOString(),
      originalPath,
      recyclePath,
      reason: meta.reason || "unknown",
      notePath: meta.notePath || ""
    };

    this.settings.recycleHistory = [
      record,
      ...(Array.isArray(this.settings.recycleHistory) ? this.settings.recycleHistory : [])
        .filter((item) => item && item.id !== id)
    ].slice(0, 1000);
    await this.saveSettings();
    return record;
  }

  getRecycleRecords() {
    return (Array.isArray(this.settings.recycleHistory) ? this.settings.recycleHistory : [])
      .filter((item) => item && item.id && item.originalPath && item.recyclePath);
  }

  async restoreRecycleRecord(id) {
    const record = this.getRecycleRecords().find((item) => item.id === id);
    if (!record) return { restored: false, reason: "恢复记录不存在" };

    const source = this.app.vault.getAbstractFileByPath(record.recyclePath);
    if (!(source instanceof TFolder)) {
      return { restored: false, reason: "垃圾桶中的源目录已经不存在" };
    }

    const target = this.app.vault.getAbstractFileByPath(record.originalPath);
    if (target) {
      return { restored: false, reason: "原路径已有文件或目录，拒绝覆盖" };
    }

    await this.ensureFolder(this.parentPath(record.originalPath));
    await this.app.vault.rename(source, record.originalPath);

    this.settings.recycleHistory = this.getRecycleRecords()
      .filter((item) => item.id !== id);
    await this.saveSettings();
    await this.cleanupEmptyRecycleParents(this.parentPath(record.recyclePath));
    return { restored: true, record };
  }

  async restoreAllRecycleRecords() {
    let restored = 0;
    const conflicts = [];
    for (const record of [...this.getRecycleRecords()].reverse()) {
      try {
        const result = await this.restoreRecycleRecord(record.id);
        if (result.restored) restored += 1;
        else conflicts.push({ record, reason: result.reason });
      } catch (err) {
        conflicts.push({
          record,
          reason: err && err.message ? err.message : String(err)
        });
      }
    }
    return { restored, conflicts };
  }

  async cleanupEmptyRecycleParents(startPath) {
    const recycleRoot = this.getRecycleRoot();
    let current = normalizePath(startPath || "");
    while (current && current !== recycleRoot && current.startsWith(recycleRoot + "/")) {
      const folder = this.app.vault.getAbstractFileByPath(current);
      if (!(folder instanceof TFolder) || (folder.children || []).length !== 0) break;
      const parent = this.parentPath(current);
      await this.app.vault.delete(folder, true);
      current = parent;
    }
  }


  async trashFolderSafely(folder) {
    if (!(folder instanceof TFolder)) return false;

    if (
      this.app.fileManager &&
      typeof this.app.fileManager.trashFile === "function"
    ) {
      await this.app.fileManager.trashFile(folder);
    } else {
      await this.app.vault.trash(folder, false);
    }

    return true;
  }

  async cleanupEmptyAttachmentParents(startPath) {
    const attachmentRoot = normalizePath(
      this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments"
    );

    let current = normalizePath(startPath || "");
    let cleaned = 0;

    // 只允许清理附件根目录之下，根目录自身永远保留。
    while (
      current &&
      current !== attachmentRoot &&
      current.startsWith(attachmentRoot + "/")
    ) {
      const folder = this.app.vault.getAbstractFileByPath(current);

      // 已不存在时继续检查更上一级；非文件夹对象则停止，避免误操作。
      if (!folder) {
        current = this.parentPath(current);
        continue;
      }
      if (!(folder instanceof TFolder)) break;

      // 只回收真正的空目录。一旦遇到仍有内容的父目录立即停止。
      if ((folder.children || []).length !== 0) break;

      const parent = this.parentPath(current);
      await this.trashFolderSafely(folder);
      cleaned += 1;
      current = parent;
    }

    return cleaned;
  }

  getFilesFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return [];

    const result = [];
    const seen = new Set();

    const addFile = (file) => {
      if (!file || typeof file.arrayBuffer !== "function") return;

      // 同一个系统文件可能同时出现在 files 和 items 中。
      // 用稳定的 File 元数据去重，避免一次粘贴生成两个副本。
      const key = [
        file.name || "",
        Number.isFinite(file.size) ? file.size : "",
        Number.isFinite(file.lastModified) ? file.lastModified : "",
        file.type || ""
      ].join("\u0000");

      if (seen.has(key)) return;
      seen.add(key);
      result.push(file);
    };

    for (const file of Array.from(dataTransfer.files || [])) {
      addFile(file);
    }

    for (const item of Array.from(dataTransfer.items || [])) {
      if (!item || item.kind !== "file" || typeof item.getAsFile !== "function") {
        continue;
      }

      try {
        addFile(item.getAsFile());
      } catch (err) {
        console.warn("[xyblue135 私人·附件镜像] cannot read DataTransferItem:", err);
      }
    }

    return result;
  }

  sanitizeFileName(name) {
    let safe = String(name || "")
      // Windows 非法字符 + ASCII 控制字符统一替换成短横线。
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .trim();

    if (!safe || safe === "." || safe === "..") {
      safe = "附件";
    }

    // Windows 保留设备名在跨平台 Vault 中也容易产生同步问题。
    const stem = safe.split(".")[0].toUpperCase();
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
      safe = `_${safe}`;
    }

    return safe;
  }

  makeOriginalFileName(file) {
    const rawName = file && file.name ? file.name : "";
    let safeName = this.sanitizeFileName(rawName);
    const ext = this.getExt(rawName, file && file.type);

    // 某些剪贴板 File 没有可靠的 name，只能从 MIME 推断扩展名。
    if (!safeName.includes(".") && ext && ext !== "bin") {
      safeName = `${safeName}.${ext}`;
    }

    return safeName;
  }

  makeUniqueOriginalFileName(file, targetFolder) {
    const desiredName = this.makeOriginalFileName(file);
    const dot = desiredName.lastIndexOf(".");
    const hasExt = dot > 0 && dot < desiredName.length - 1;
    const baseName = hasExt ? desiredName.slice(0, dot) : desiredName;
    const extension = hasExt ? desiredName.slice(dot) : "";

    let candidate = desiredName;
    let index = 1;

    while (
      this.app.vault.getAbstractFileByPath(
        normalizePath(`${targetFolder}/${candidate}`)
      )
    ) {
      candidate = `${baseName} (${index})${extension}`;
      index += 1;
    }

    return {
      name: candidate,
      renamed: candidate !== desiredName,
      desiredName
    };
  }

  getImportFileName(file, targetFolder) {
    const ext = this.getExt(file && file.name, file && file.type);
    if (EMBED_EXTENSIONS.has(ext)) {
      return {
        name: this.makeTimestampFileName(file, targetFolder),
        renamed: false,
        desiredName: null,
        embedded: true
      };
    }

    return {
      ...this.makeUniqueOriginalFileName(file, targetFolder),
      embedded: false
    };
  }

  getExt(fileName, mimeType) {
    const safe = fileName || "";
    const dot = safe.lastIndexOf(".");

    if (dot > 0 && dot < safe.length - 1) {
      return safe.slice(dot + 1).toLowerCase();
    }

    const mimeMap = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
      "application/pdf": "pdf"
    };

    return mimeMap[mimeType] || "bin";
  }

  formatTimestamp(ms) {
    const d = new Date(ms);
    const p2 = (n) => String(n).padStart(2, "0");
    const p3 = (n) => String(n).padStart(3, "0");

    // 纯数字毫秒级时间戳：YYYYMMDDHHmmssSSS
    // 例如：20260809021530123.png
    return (
      d.getFullYear() +
      p2(d.getMonth() + 1) +
      p2(d.getDate()) +
      p2(d.getHours()) +
      p2(d.getMinutes()) +
      p2(d.getSeconds()) +
      p3(d.getMilliseconds())
    );
  }

  makeTimestampFileName(file, targetFolder) {
    const ext = this.getExt(file.name, file.type);

    // 一次粘贴多个附件时，循环可能快于 1ms。
    // 使用“单调递增”的毫秒时间：如果当前时间没有前一个名字新，
    // 就在前一个时间基础上 +1ms。这样仍然是纯时间戳，不需要 -1/-2。
    let ms = Math.max(Date.now(), (this.lastAttachmentTimestampMs || 0) + 1);

    while (true) {
      const name = `${this.formatTimestamp(ms)}.${ext}`;
      const path = normalizePath(`${targetFolder}/${name}`);

      if (!this.app.vault.getAbstractFileByPath(path)) {
        this.lastAttachmentTimestampMs = ms;
        return name;
      }

      // 极小概率目录中已有相同时间戳，则继续顺延 1ms。
      ms += 1;
    }
  }

  escapeAltText(text) {
    return (text || "")
      .replace(/\\/g, "\\\\")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  markdownSafePath(path) {
    // 保留中文和目录结构，只转义 Markdown 链接里常见的问题字符。
    return path
      .replace(/%/g, "%25")
      .replace(/ /g, "%20")
      .replace(/#/g, "%23")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
  }

  getRelativePath(fromNotePath, targetPath) {
    const fromDir = this.parentPath(normalizePath(fromNotePath));
    const fromParts = fromDir ? fromDir.split("/").filter(Boolean) : [];
    const toParts = normalizePath(targetPath).split("/").filter(Boolean);

    let common = 0;
    while (
      common < fromParts.length &&
      common < toParts.length &&
      fromParts[common] === toParts[common]
    ) {
      common += 1;
    }

    const up = Array(fromParts.length - common).fill("..");
    const down = toParts.slice(common);
    return [...up, ...down].join("/") || "./";
  }

  makeMarkdownLink(createdFile, sourceNote) {
    // 使用以 Obsidian 仓库根目录为基准的绝对路径。
    // 例如：z_attachments/test/image.png -> /z_attachments/test/image.png
    const vaultAbsolutePath = `/${normalizePath(createdFile.path).replace(/^\/+/, "")}`;
    const safePath = this.markdownSafePath(vaultAbsolutePath);
    const description = this.escapeAltText(
      createdFile.name || createdFile.basename || "附件"
    );

    const ext = (createdFile.extension || "").toLowerCase();
    const shouldEmbed = EMBED_EXTENSIONS.has(ext);

    if (shouldEmbed) {
      // 可直接预览的附件（图片 / PDF）使用嵌入语法。
      // alt 固定为空，保持笔记正文简洁：![](/z_attachments/test/file.ext)
      return `![](${safePath})`;
    }

    // ZIP / RAR / 7Z / Office 等不可直接预览的普通附件只插入链接，
    // 不加感叹号，避免让 Obsidian 尝试把压缩包等内容嵌入正文。
    return `[${description}](${safePath})`;
  }

  async importFiles(files, note, editor) {
    const targetFolder = this.getAttachmentFolderForNotePath(note.path);

    try {
      await this.ensureFolder(targetFolder);
    } catch (err) {
      console.error("[xyblue135 私人·附件镜像] cannot create target folder:", err);
      new Notice(`xyblue135 私人·附件镜像：目标目录无法创建\n${targetFolder}`, 7000);
      throw err;
    }

    const links = [];
    const renamed = [];
    const failed = [];

    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== "function") {
        failed.push(file && file.name ? file.name : "未知附件");
        continue;
      }

      try {
        const naming = this.getImportFileName(file, targetFolder);
        const targetPath = normalizePath(`${targetFolder}/${naming.name}`);
        const buffer = await file.arrayBuffer();
        const created = await this.app.vault.createBinary(targetPath, buffer);

        links.push(this.makeMarkdownLink(created, note));

        if (naming.renamed) {
          renamed.push({
            from: naming.desiredName,
            to: naming.name
          });
        }
      } catch (err) {
        console.error(`[xyblue135 私人·附件镜像] failed to import ${file.name || "file"}:`, err);
        failed.push(file.name || "未知附件");
      }
    }

    if (links.length) {
      // 多附件之间留一个空行，图片、PDF 和普通附件混排时更清楚。
      editor.replaceSelection(links.join("\n\n"));
    }

    if (renamed.length === 1) {
      new Notice(
        `xyblue135 私人·附件镜像：文件已存在，保存为 ${renamed[0].to}`,
        5000
      );
    } else if (renamed.length > 1) {
      const preview = renamed
        .slice(0, 3)
        .map((item) => `${item.from} → ${item.to}`)
        .join("\n");
      const more = renamed.length > 3 ? `\n另有 ${renamed.length - 3} 个重名附件` : "";
      new Notice(`xyblue135 私人·附件镜像：${renamed.length} 个重名附件已自动改名\n${preview}${more}`, 7000);
    }

    if (failed.length) {
      const preview = failed.slice(0, 3).join("、");
      const more = failed.length > 3 ? ` 等 ${failed.length} 个文件` : "";
      new Notice(
        `xyblue135 私人·附件镜像：${failed.length} 个附件保存失败：${preview}${more}`,
        7000
      );
    }

    if (links.length) {
      new Notice(
        `xyblue135 私人·附件镜像：已保存 ${links.length} 个附件到 ${targetFolder}`,
        4500
      );
    } else if (failed.length) {
      new Notice("xyblue135 私人·附件镜像：没有附件成功保存，请查看控制台。", 6000);
    }
  }

  async revealAttachmentFolder(note) {
    const folderPath =
      this.getAttachmentFolderForNotePath(note.path);

    const folder =
      this.app.vault.getAbstractFileByPath(folderPath);

    if (!(folder instanceof TFolder)) {
      new Notice(
        `xyblue135 私人·附件镜像：对应附件目录尚不存在：${folderPath}`,
        5000
      );
      return;
    }

    const leaves =
      this.app.workspace.getLeavesOfType("file-explorer");

    const leaf =
      leaves && leaves.length ? leaves[0] : null;

    const view = leaf && leaf.view;

    if (view && typeof view.revealInFolder === "function") {
      await view.revealInFolder(folder);

      if (
        typeof this.app.workspace.revealLeaf === "function"
      ) {
        await this.app.workspace.revealLeaf(leaf);
      }
      return;
    }

    // 某些 Obsidian 版本没有公开 revealInFolder，至少给出准确目录。
    new Notice(
      `xyblue135 私人·附件镜像：附件目录：${folderPath}`,
      7000
    );
  }

  async trashAttachmentFolderAfterNoteDelete(notePath) {
    const basename = this.getNoteBasenameFromPath(notePath);
    const remainingNotes = this.getNotesByBasename(basename, notePath);
    const folderPath = this.getAttachmentFolderForBasename(basename);
    const attachmentRoot = this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments";

    // 共享引用仍存在：只更新“引用关系”，绝不碰附件目录。
    if (remainingNotes.length > 0) {
      const preview = remainingNotes.slice(0, 3).map((file) => file.path).join("\n");
      const more = remainingNotes.length > 3 ? `\n另有 ${remainingNotes.length - 3} 篇` : "";
      new Notice(
        `xyblue135 私人·附件镜像：已删除一篇「${basename}」，但仍有 ${remainingNotes.length} 篇同名笔记共享附件。\n附件保持不动：${folderPath}\n${preview}${more}`,
        8000
      );
      return;
    }

    if (normalizePath(folderPath) === normalizePath(attachmentRoot)) return;

    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return;

    await this.moveFolderToPluginRecycle(folder, {
      reason: "last-shared-note-delete",
      notePath
    });

    new Notice(
      `xyblue135 私人·附件镜像：这是最后一篇「${basename}」，共享附件已移入插件垃圾桶\n${folderPath}`,
      6000
    );
  }

  // ---- v2.1：删除勾选确认流程 ----

  getSelectedExplorerFiles() {
    try {
      const leaves = this.app.workspace.getLeavesOfType("file-explorer");
      for (const leaf of leaves) {
        const view = leaf && leaf.view;
        if (view && typeof view.getSelectedFiles === "function") {
          const files = view.getSelectedFiles();
          if (Array.isArray(files) && files.length) return files;
        }
      }
    } catch (err) {
      console.warn("[xyblue135 私人·附件镜像] getSelectedFiles failed:", err);
    }

    // 兜底：直接从文件树 DOM 读取选中的行。
    const result = [];
    document.querySelectorAll(".nav-file-title.is-selected").forEach((el) => {
      const path = el.getAttribute("data-path");
      if (!path) return;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) result.push(file);
    });
    return result;
  }

  replaceDeleteMenuItems(menu, file) {
    // Obsidian 不同语言/版本下删除项标题不一致，多关键词匹配。
    const deleteKeywords = [
      "删除",
      "回收站",
      "永久删除",
      "Move to trash",
      "Move to system trash",
      "Delete permanently",
      "Delete"
    ];
    try {
      const items = menu["items"];
      if (Array.isArray(items)) {
        for (let i = items.length - 1; i >= 0; i--) {
          const item = items[i];
          if (!item) continue;
          const title = (
            (item.titleEl && item.titleEl.textContent) ||
            item.title ||
            ""
          ).trim();
          if (deleteKeywords.some((keyword) => title.includes(keyword))) {
            items.splice(i, 1);
          }
        }
      }
    } catch (err) {
      console.warn(
        "[xyblue135 私人·附件镜像] replace delete menu item failed:",
        err
      );
    }

    menu.addItem((item) => {
      item
        .setTitle("删除…（可勾选附件）")
        .setIcon("trash")
        .onClick(() => {
          void this.openDeleteDialog(file);
        });
    });
  }

  async openDeleteDialog(file) {
    if (!(file instanceof TFile) || file.extension !== "md") return;

    const basename = this.getNoteBasenameFromPath(file.path);
    const folderPath = this.getAttachmentFolderForBasename(basename);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    const sharedNotes = this.getNotesByBasename(basename, file.path);

    const folderInfo =
      folder instanceof TFolder
        ? {
            path: folderPath,
            fileCount: (folder.children || []).filter(
              (child) => child instanceof TFile
            ).length,
            sharedNotes: sharedNotes.length
          }
        : null;

    new MirrorDeleteDialog(this.app, this, file, folderInfo).open();
  }

  async executeManualDelete(file, options) {
    const { deleteAttachments, deleteDocument } = options || {};
    const basename = this.getNoteBasenameFromPath(file.path);
    const folderPath = this.getAttachmentFolderForBasename(basename);
    const attachmentRoot =
      this.cleanRoot(this.settings.attachmentsRoot) || "z_attachments";
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    const isProtectedFolder =
      !(folder instanceof TFolder) ||
      normalizePath(folderPath) === normalizePath(attachmentRoot) ||
      this.isRecyclePath(folderPath);

    // 1) 附件：移入插件垃圾桶（可恢复），尊重“同名共享”原则不做强制覆盖。
    if (deleteAttachments && !isProtectedFolder) {
      try {
        const remainingNotes = this.getNotesByBasename(basename, file.path);
        await this.moveFolderToPluginRecycle(folder, {
          reason: remainingNotes.length
            ? "user-choose-delete-attachments"
            : "user-choose-delete-attachments-last",
          notePath: file.path
        });
        new Notice(
          `xyblue135 私人·附件镜像：附件目录已移入插件垃圾桶\n${folderPath}`,
          6000
        );
      } catch (err) {
        console.error(
          "[xyblue135 私人·附件镜像] manual delete attachments failed:",
          err
        );
        new Notice(
          "xyblue135 私人·附件镜像：删除附件失败，请查看控制台。",
          7000
        );
      }
    }

    // 2) 文档：移入系统回收站。把路径加入守卫集合，delete 事件（可能异步
    //    触发）命中后跳过自动回收，保证“只勾选删除文档”时附件不被回收。
    if (deleteDocument) {
      this.manualDeleteGuard.add(file.path);
      try {
        if (
          this.app.fileManager &&
          typeof this.app.fileManager.trashFile === "function"
        ) {
          await this.app.fileManager.trashFile(file);
        } else {
          await this.app.vault.trash(file, false);
        }
        new Notice(
          `xyblue135 私人·附件镜像：已删除文档\n${file.path}`,
          5000
        );
      } catch (err) {
        this.manualDeleteGuard.delete(file.path);
        console.error(
          "[xyblue135 私人·附件镜像] manual delete document failed:",
          err
        );
        new Notice(
          "xyblue135 私人·附件镜像：删除文档失败，请查看控制台。",
          7000
        );
      }
    }
  }

  async syncAttachmentFolderAfterRename(newNotePath, oldPath) {
    const oldManaged = this.isManagedNotePath(oldPath);
    const newManaged = this.isManagedNotePath(newNotePath);
    if (!oldManaged && !newManaged) return;

    const oldBasename = this.getNoteBasenameFromPath(oldPath);
    const newBasename = this.getNoteBasenameFromPath(newNotePath);
    const oldFolder = this.getAttachmentFolderForBasename(oldBasename);
    const newFolder = this.getAttachmentFolderForBasename(newBasename);

    // 从管理范围外移入：加入当前文件名对应的共享附件组。
    if (!oldManaged && newManaged) {
      const note = this.app.vault.getAbstractFileByPath(newNotePath);
      if (note instanceof TFile) await this.ensureSharedAttachmentFolderForNote(note, { notifyDuplicate: true });
      return;
    }

    // 从管理范围移出：附件绝不删除。根目录误改名也只会走到这里。
    if (oldManaged && !newManaged) {
      new Notice(
        `xyblue135 私人·附件镜像：文章移出管理根目录，附件保持不动\n${oldPath}\n→ ${newNotePath}\n${oldFolder}`,
        7000
      );
      return;
    }

    // 仅移动父目录时 basename 不变，所以单层附件结构完全无需处理。
    if (oldBasename === newBasename) return;

    const oldRemaining = this.getNotesByBasename(oldBasename, oldPath);
    const newPeers = this.getNotesByBasename(newBasename, newNotePath);
    const oldAbstract = this.app.vault.getAbstractFileByPath(oldFolder);
    const newAbstract = this.app.vault.getAbstractFileByPath(newFolder);

    // 旧名字仍被其他笔记引用：旧共享目录必须留下。新名字建立/加入另一共享目录。
    if (oldRemaining.length > 0) {
      if (newAbstract && !(newAbstract instanceof TFolder)) {
        new Notice(`xyblue135 私人·附件镜像：新附件路径存在同名文件，无法建立目录：${newFolder}`, 7000);
        return;
      }
      if (!(newAbstract instanceof TFolder)) await this.ensureFolder(newFolder);

      new Notice(
        `xyblue135 私人·附件镜像：笔记已改名，但「${oldBasename}」仍有 ${oldRemaining.length} 篇笔记共享旧附件，因此不搬动旧目录。\n新笔记今后使用：${newFolder}` +
          (newPeers.length ? `\n「${newBasename}」已有 ${newPeers.length} 篇同名笔记，将共享新目录。` : "") +
          `\n原正文中的旧附件链接保持有效。`,
        9000
      );
      return;
    }

    // 旧名字已经没有其他引用。如果新目录不存在，可以安全把整目录随“文件名”迁移。
    if (oldAbstract instanceof TFolder && !newAbstract) {
      await this.ensureFolder(this.parentPath(newFolder));
      if (this.app.fileManager && typeof this.app.fileManager.renameFile === "function") {
        await this.app.fileManager.renameFile(oldAbstract, newFolder);
      } else {
        await this.app.vault.rename(oldAbstract, newFolder);
      }
      new Notice(`xyblue135 私人·附件镜像：附件目录已随笔记文件名更新\n${oldFolder}\n→ ${newFolder}`, 6000);
      return;
    }

    // 新名字已经有共享目录时不做自动合并。保留旧目录，避免误覆盖或打乱旧链接。
    if (newAbstract instanceof TFolder) {
      new Notice(
        `xyblue135 私人·附件镜像：新文件名「${newBasename}」已有附件目录，将加入共享。\n为避免自动合并造成数据损失，旧目录保留：${oldFolder}\n今后新附件保存到：${newFolder}`,
        9000
      );
      return;
    }

    // 原来没有附件目录时，只需为新名字补建。
    if (!(oldAbstract instanceof TFolder)) {
      await this.ensureFolder(newFolder);
    }
  }

};

class MirrorAttachmentsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("mirror-attachments-settings");

    const hero = containerEl.createDiv({
      cls: "mirror-attachments-hero"
    });
    const heroTop = hero.createDiv({
      cls: "mirror-attachments-hero-top"
    });
    const heroText = heroTop.createDiv({
      cls: "mirror-attachments-hero-text"
    });
    heroText.createEl("h2", {
      text: "xyblue135 私人 · 附件镜像"
    });
    heroText.createEl("p", {
      text:
        "使用单层附件结构：不同目录下的同名 Markdown 共享同一个附件文件夹，并通过实时引用计数保护共享附件。"
    });
    heroTop.createEl("span", {
      cls: "mirror-attachments-version-badge",
      text: "v2.0.1"
    });

    const badges = hero.createDiv({
      cls: "mirror-attachments-badges"
    });
    ["单层结构", "同名共享", "引用计数"].forEach((label) => {
      badges.createEl("span", {
        cls: "mirror-attachments-badge",
        text: label
      });
    });

    this.createSectionTitle(
      containerEl,
      "1. 存储结构",
      "附件不再镜像 Notes 父目录，只按 Markdown 文件名建立一层文件夹；同名笔记主动共享。"
    );

    new Setting(containerEl)
      .setName("笔记根目录")
      .setDesc("被插件管理的 Markdown 根目录，例如 Notes。")
      .addText((text) =>
        text
          .setPlaceholder("Notes")
          .setValue(this.plugin.settings.notesRoot)
          .onChange(async (value) => {
            this.plugin.settings.notesRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("附件根目录")
      .setDesc("单层共享附件根目录，建议使用 z_attachments。")
      .addText((text) =>
        text
          .setPlaceholder("z_attachments")
          .setValue(this.plugin.settings.attachmentsRoot)
          .onChange(async (value) => {
            this.plugin.settings.attachmentsRoot = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const structureCard = containerEl.createDiv({
      cls: "mirror-attachments-info-card"
    });
    structureCard.createEl("div", {
      cls: "mirror-attachments-info-title",
      text: "单层共享映射规则"
    });
    structureCard.createEl("code", {
      text: "Notes/A/test.md + Notes/B/test.md  ↔  z_attachments/test/"
    });
    structureCard.createEl("p", {
      text:
        "父目录完全解耦；移动 Notes 子目录不会搬附件。同名文件名视为同一个共享附件组。"
    });

    this.createSectionTitle(
      containerEl,
      "2. 导入行为",
      "控制系统文件复制粘贴与拖入。附件统一保存到当前 Markdown 文件名对应的共享目录。"
    );

    new Setting(containerEl)
      .setName("接管 Ctrl+V 附件")
      .setDesc(
        "检测到剪贴板中的系统文件时，阻止 Obsidian 默认处理并保存到当前文件名对应的共享附件目录。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.handlePaste)
          .onChange(async (value) => {
            this.plugin.settings.handlePaste = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("接管拖入附件")
      .setDesc(
        "接管从系统文件管理器拖入的图片、PDF、Office、ZIP、RAR、7Z 等文件。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.handleDrop)
          .onChange(async (value) => {
            this.plugin.settings.handleDrop = value;
            await this.plugin.saveSettings();
          })
      );

    const clipboardHint = containerEl.createDiv({
      cls: "mirror-attachments-tip"
    });
    clipboardHint.createEl("strong", { text: "Windows 文件粘贴兼容：" });
    clipboardHint.appendText(
      "同时读取 clipboardData.files 与 clipboardData.items，并自动去重，避免 ZIP 等文件复制后无法生成链接。"
    );

    this.createSectionTitle(
      containerEl,
      "3. 命名与 Markdown 规则",
      "先判断附件是否适合直接预览，再自动决定文件名和 Markdown 形式；无需手工选择。"
    );

    const ruleGrid = containerEl.createDiv({
      cls: "mirror-attachments-rule-grid"
    });

    this.createRuleCard(ruleGrid, {
      title: "嵌入式资源",
      tag: "时间戳 + ![]()",
      extensions: "PNG / JPG / JPEG / GIF / WebP / BMP / SVG / AVIF / PDF",
      example: "![](/z_attachments/test/20260812151230001.png)",
      description: "图片和 PDF 使用毫秒级时间戳保存并直接嵌入正文，避免截图类文件名大量重复。",
      className: "is-embed"
    });

    this.createRuleCard(ruleGrid, {
      title: "非嵌入式附件",
      tag: "原文件名 + []()",
      extensions: "ZIP / RAR / 7Z / DOC / DOCX / XLS / XLSX / PPT / PPTX / 其他文件",
      example: "[项目源码.zip](/z_attachments/test/项目源码.zip)",
      description: "压缩包、Office 等保留可读原名；重名自动变为 (1)、(2)…，正文显示完整文件名和扩展名。",
      className: "is-link"
    });

    const namingNote = containerEl.createDiv({
      cls: "mirror-attachments-tip mirror-attachments-tip-accent"
    });
    namingNote.createEl("strong", { text: "文件名安全处理：" });
    namingNote.appendText(
      "普通附件仅替换 Windows 非法字符（\\ / : * ? \" < > |）并处理保留设备名；中文、空格和括号会尽量原样保留。"
    );

    const multiPasteNote = containerEl.createDiv({
      cls: "mirror-attachments-tip"
    });
    multiPasteNote.createEl("strong", { text: "批量粘贴：" });
    multiPasteNote.appendText(
      "多个附件之间自动留一个空行；单个文件失败不会中断整批导入，并会给出单独提示。"
    );

    const linkNote = containerEl.createDiv({
      cls: "mirror-attachments-tip"
    });
    linkNote.createEl("strong", { text: "路径规则：" });
    linkNote.appendText(
      "所有链接均从 Vault 根目录开始，例如 /z_attachments/test/...；移动 Markdown 父目录不会改变附件路径。"
    );

    this.createSectionTitle(
      containerEl,
      "4. 共享关系与重名检查",
      "检查每个文件名对应的共享附件目录，并列出所有同名 Markdown。孤立目录只报告，不自动删除。"
    );

    const auditActions = new Setting(containerEl)
      .setName("共享附件结构校验")
      .setDesc("重新扫描共享关系；自动操作只补建缺失目录，不会删除任何孤立目录。");

    const auditPanel = containerEl.createDiv({
      cls: "mirror-attachments-audit-panel"
    });

    auditActions.addButton((button) =>
      button
        .setButtonText("重新校验")
        .onClick(async () => {
          button.setDisabled(true);
          try {
            await this.refreshAuditPanel(auditPanel);
          } finally {
            button.setDisabled(false);
          }
        })
    );

    auditActions.addButton((button) =>
      button
        .setButtonText("补建缺失目录")
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const audit = await this.plugin.auditFolderConsistency();
            const result = await this.plugin.repairFolderConsistency(audit);
            const conflictText = result.conflicts.length
              ? `，仍有 ${result.conflicts.length} 个冲突需手动处理`
              : "";

            new Notice(
              `xyblue135 私人·附件镜像：已补建 ${result.created} 个缺失目录；${result.preservedExtra} 个孤立目录仅报告、未删除${conflictText}`,
              7000
            );
            await this.refreshAuditPanel(auditPanel);
          } catch (err) {
            console.error("[xyblue135 私人·附件镜像] repair failed:", err);
            new Notice("xyblue135 私人·附件镜像：自动纠错失败，请查看控制台。");
          } finally {
            button.setDisabled(false);
          }
        })
    );

    void this.refreshAuditPanel(auditPanel);

    const duplicateActions = new Setting(containerEl)
      .setName("同名 Markdown 检查")
      .setDesc("列出不同目录下文件名完全相同的 Markdown；这些笔记会共享同一个附件目录。");

    const duplicatePanel = containerEl.createDiv({
      cls: "mirror-attachments-audit-panel"
    });

    duplicateActions.addButton((button) =>
      button
        .setButtonText("检查重名")
        .onClick(async () => {
          button.setDisabled(true);
          try {
            this.refreshDuplicatePanel(duplicatePanel);
          } finally {
            button.setDisabled(false);
          }
        })
    );

    this.refreshDuplicatePanel(duplicatePanel);

    this.createSectionTitle(
      containerEl,
      "5. 删除保护与垃圾桶恢复",
      "删除时先检查同名 Markdown 引用数；只有最后一个引用消失时，才把共享附件目录放入插件垃圾桶。"
    );

    new Setting(containerEl)
      .setName("删除文章时弹出勾选确认")
      .setDesc("开启后，在文件树右键删除或按 Delete 键删除 Markdown 时，会先弹出对话框，可分别勾选“删除附件”“删除文档”（默认全部勾选）；点取消则什么都不删除。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteDialogEnabled)
          .onChange(async (value) => {
            this.plugin.settings.deleteDialogEnabled = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("删除文章时同步回收附件")
      .setDesc("开启后，删除 Markdown 会实时统计同名笔记；仍有同名笔记时附件不动，最后一篇删除时才回收。")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteAttachmentsWithNote)
          .onChange(async (value) => {
            this.plugin.settings.deleteAttachmentsWithNote = value;
            await this.plugin.saveSettings();
          })
      );

    const recycleActions = new Setting(containerEl)
      .setName("插件垃圾桶")
      .setDesc("恢复插件新版本回收的附件目录。恢复时绝不覆盖已有文件或目录。");

    const recyclePanel = containerEl.createDiv({
      cls: "mirror-attachments-audit-panel"
    });

    recycleActions.addButton((button) =>
      button
        .setButtonText("刷新列表")
        .onClick(async () => {
          await this.refreshRecyclePanel(recyclePanel);
        })
    );

    recycleActions.addButton((button) =>
      button
        .setButtonText("恢复全部")
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const result = await this.plugin.restoreAllRecycleRecords();
            new Notice(
              `xyblue135 私人·附件镜像：恢复 ${result.restored} 个目录` +
                (result.conflicts.length ? `，${result.conflicts.length} 个冲突未覆盖` : ""),
              7000
            );
            await this.refreshRecyclePanel(recyclePanel);
            await this.refreshAuditPanel(auditPanel);
          } finally {
            button.setDisabled(false);
          }
        })
    );

    void this.refreshRecyclePanel(recyclePanel);

    this.createSectionTitle(
      containerEl,
      "6. 快捷操作",
      "减少手动查找附件目录的步骤。"
    );

    const shortcutCard = containerEl.createDiv({
      cls: "mirror-attachments-info-card mirror-attachments-shortcut-card"
    });
    shortcutCard.createEl("div", {
      cls: "mirror-attachments-info-title",
      text: "文件树右键"
    });
    shortcutCard.createEl("p", {
      text:
        "在左侧文件树右键任意受管理的 Markdown，选择“📂 打开对应附件目录”，即可定位到它按文件名共享的附件文件夹。"
    });
  }

  createSectionTitle(containerEl, title, description) {
    const section = containerEl.createDiv({
      cls: "mirror-attachments-section-heading"
    });
    section.createEl("h3", { text: title });
    if (description) {
      section.createEl("p", { text: description });
    }
  }

  createRuleCard(containerEl, options) {
    const card = containerEl.createDiv({
      cls: `mirror-attachments-rule-card ${options.className || ""}`.trim()
    });
    const top = card.createDiv({
      cls: "mirror-attachments-rule-card-top"
    });
    top.createEl("strong", { text: options.title });
    top.createEl("span", {
      cls: "mirror-attachments-rule-tag",
      text: options.tag
    });
    card.createEl("div", {
      cls: "mirror-attachments-rule-exts",
      text: options.extensions
    });
    card.createEl("p", {
      text: options.description
    });
    card.createEl("code", {
      text: options.example
    });
  }

  async refreshRecyclePanel(panelEl) {
    panelEl.empty();
    const records = this.plugin.getRecycleRecords();

    if (!records.length) {
      panelEl.createEl("div", {
        cls: "mirror-attachments-audit-summary is-ok",
        text: "插件垃圾桶为空。"
      });
      return;
    }

    panelEl.createEl("div", {
      cls: "mirror-attachments-audit-summary is-warning",
      text: `当前有 ${records.length} 个可恢复目录。`
    });

    const list = panelEl.createDiv({ cls: "mirror-attachments-recycle-list" });
    for (const record of records.slice(0, 100)) {
      const row = list.createDiv({ cls: "mirror-attachments-recycle-row" });
      const text = row.createDiv({ cls: "mirror-attachments-recycle-text" });
      text.createEl("strong", { text: record.originalPath });
      text.createEl("div", {
        text: `${record.deletedAt || "未知时间"} · ${record.reason || "unknown"}`
      });
      const button = row.createEl("button", { text: "恢复" });
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const result = await this.plugin.restoreRecycleRecord(record.id);
          if (result.restored) {
            new Notice(`xyblue135 私人·附件镜像：已恢复\n${record.originalPath}`, 5000);
          } else {
            new Notice(`xyblue135 私人·附件镜像：未恢复：${result.reason}`, 7000);
          }
          await this.refreshRecyclePanel(panelEl);
        } catch (err) {
          console.error("[xyblue135 私人·附件镜像] restore failed:", err);
          new Notice("xyblue135 私人·附件镜像：恢复失败，请查看控制台。", 7000);
        } finally {
          button.disabled = false;
        }
      });
    }
  }

  refreshDuplicatePanel(panelEl) {
    panelEl.empty();
    const groups = this.plugin.getDuplicateNoteGroups();

    if (!groups.length) {
      panelEl.createEl("div", {
        cls: "mirror-attachments-audit-summary is-ok",
        text: "没有发现同名 Markdown。"
      });
      return;
    }

    panelEl.createEl("div", {
      cls: "mirror-attachments-audit-summary is-warning",
      text: `发现 ${groups.length} 组同名 Markdown。它们会按文件名共享附件目录。`
    });

    for (const group of groups) {
      const box = panelEl.createDiv({ cls: "mirror-attachments-audit-group is-conflict" });
      box.createEl("div", {
        cls: "mirror-attachments-audit-group-title",
        text: `${group.basename} · ${group.count} 篇 · 共享 ${group.folderPath}`
      });
      const list = box.createEl("ul");
      for (const path of group.notePaths) list.createEl("li", { text: path });
    }
  }

  async refreshAuditPanel(panelEl) {
    panelEl.empty();
    panelEl.createEl("div", {
      cls: "mirror-attachments-audit-loading",
      text: "正在校验……"
    });

    let audit;
    try {
      audit = await this.plugin.auditFolderConsistency();
    } catch (err) {
      console.error("[xyblue135 私人·附件镜像] audit failed:", err);
      panelEl.empty();
      panelEl.createEl("div", {
        cls: "mirror-attachments-audit-summary is-error",
        text: "校验失败，请查看开发者控制台。"
      });
      return;
    }

    panelEl.empty();

    if (!audit.supported) {
      panelEl.createEl("div", {
        cls: "mirror-attachments-audit-summary is-warning",
        text: "当前目录模式不支持一对一校验。"
      });
      return;
    }

    const issueCount = audit.missing.length + audit.extra.length + audit.conflicts.length;

    panelEl.createEl("div", {
      cls: "mirror-attachments-audit-summary " + (issueCount ? "is-warning" : "is-ok"),
      text: issueCount
        ? `发现 ${issueCount} 项需关注：缺失 ${audit.missing.length}，孤立 ${audit.extra.length}，冲突 ${audit.conflicts.length}。当前 ${audit.notesCount} 篇 Markdown 对应 ${audit.expectedCount} 个共享附件目录。`
        : `校验正常：${audit.notesCount} 篇 Markdown 对应 ${audit.expectedCount} 个共享附件目录；其中 ${audit.duplicateGroups.length} 组为同名共享。`
    });

    if (audit.missing.length) {
      this.renderAuditGroup(
        panelEl,
        "缺失目录",
        audit.missing.map(
          (item) => `${item.notePaths.join(" | ")}  →  ${item.folderPath}`
        ),
        "is-missing"
      );
    }

    if (audit.extra.length) {
      this.renderAuditGroup(
        panelEl,
        "孤立目录（仅报告，不自动删除）",
        audit.extra.map((item) => item.folderPath),
        "is-extra"
      );
    }

    if (audit.conflicts.length) {
      this.renderAuditGroup(
        panelEl,
        "路径冲突（需手动处理）",
        audit.conflicts.map(
          (item) => `${item.folderPath} — ${item.reason}`
        ),
        "is-conflict"
      );
    }
  }

  renderAuditGroup(panelEl, title, items, className) {
    const group = panelEl.createDiv({
      cls: `mirror-attachments-audit-group ${className}`
    });
    group.createEl("div", {
      cls: "mirror-attachments-audit-group-title",
      text: `${title}（${items.length}）`
    });

    const list = group.createEl("ul");
    for (const item of items) {
      list.createEl("li", { text: item });
    }
  }
}
