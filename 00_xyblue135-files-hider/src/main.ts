import { Menu, Plugin, TAbstractFile, TFolder } from "obsidian";

interface FolderHiderData {
  hiddenFolders: string[];
}

type RevealTarget = {
  revealInFolder?: (item: TAbstractFile, ...args: unknown[]) => unknown;
};

type PatchedReveal = ((item: TAbstractFile, ...args: unknown[]) => unknown) & {
  __xyblue135FolderHiderPatched?: boolean;
};

export default class FolderHiderPlugin extends Plugin {
  private hiddenFolders = new Set<string>();
  private observer: MutationObserver | null = null;
  private refreshQueued = false;
  private unpatchers: Array<() => void> = [];

  async onload(): Promise<void> {
    const data = (await this.loadData()) as FolderHiderData | null;
    for (const path of data?.hiddenFolders ?? []) this.hiddenFolders.add(path);

    this.registerEvent(this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
      if (!(file instanceof TFolder) || !file.path) return;
      menu.addItem((item) => item.setTitle("隐藏此文件夹").setIcon("eye-off").onClick(async () => {
        this.hiddenFolders.add(file.path);
        await this.saveHiddenFolders();
        this.applyHiddenFolders();
      }));
    }));

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => this.handleRename(file, oldPath)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.handleDelete(file.path)));

    this.app.workspace.onLayoutReady(() => {
      this.patchRevealInFolder();
      this.startObserver();
      this.applyHiddenFolders();
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.patchRevealInFolder();
      this.queueRefresh();
    }));
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = null;
    for (const unpatch of this.unpatchers.splice(0)) unpatch();
    document.querySelectorAll(".xyblue135-folder-hider-hidden").forEach((el) => el.classList.remove("xyblue135-folder-hider-hidden"));
  }

  private async saveHiddenFolders(): Promise<void> {
    await this.saveData({ hiddenFolders: [...this.hiddenFolders].sort() } satisfies FolderHiderData);
  }

  private applyHiddenFolders(): void {
    document.querySelectorAll(".nav-folder.xyblue135-folder-hider-hidden").forEach((el) => el.classList.remove("xyblue135-folder-hider-hidden"));
    if (this.hiddenFolders.size === 0) return;

    document.querySelectorAll<HTMLElement>(".nav-folder-title[data-path]").forEach((title) => {
      const path = title.dataset.path;
      if (!path || !this.hiddenFolders.has(path)) return;
      title.closest(".nav-folder")?.classList.add("xyblue135-folder-hider-hidden");
    });
  }

  private startObserver(): void {
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.queueRefresh());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.register(() => this.observer?.disconnect());
  }

  private queueRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.applyHiddenFolders();
    });
  }

  private revealPath(path: string | undefined): void {
    if (!path) return;
    const matched = [...this.hiddenFolders].filter((hidden) => path === hidden || path.startsWith(hidden + "/"));
    if (matched.length === 0) return;

    for (const hidden of matched) this.hiddenFolders.delete(hidden);
    this.applyHiddenFolders();
    void this.saveHiddenFolders();
  }

  private patchRevealTarget(target: RevealTarget | null | undefined): void {
    if (!target || typeof target.revealInFolder !== "function") return;
    const current = target.revealInFolder as PatchedReveal;
    if (current.__xyblue135FolderHiderPatched) return;

    const original = current;
    const plugin = this;
    const patched: PatchedReveal = function (this: RevealTarget, item: TAbstractFile, ...args: unknown[]) {
      plugin.revealPath(item?.path);
      return original.call(this, item, ...args);
    };
    patched.__xyblue135FolderHiderPatched = true;
    target.revealInFolder = patched;

    this.unpatchers.push(() => {
      if (target.revealInFolder === patched) target.revealInFolder = original;
    });
  }

  private patchRevealInFolder(): void {
    const appAny = this.app as unknown as {
      internalPlugins?: {
        getEnabledPluginById?: (id: string) => RevealTarget | undefined;
        getPluginById?: (id: string) => { instance?: RevealTarget; plugin?: RevealTarget } | undefined;
      };
    };

    const internal = appAny.internalPlugins;
    this.patchRevealTarget(internal?.getEnabledPluginById?.("file-explorer"));
    const wrapper = internal?.getPluginById?.("file-explorer");
    this.patchRevealTarget(wrapper?.instance);
    this.patchRevealTarget(wrapper?.plugin);

    for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
      this.patchRevealTarget(leaf.view as unknown as RevealTarget);
    }
  }

  private handleRename(file: TAbstractFile, oldPath: string): void {
    const replacements: Array<[string, string]> = [];
    for (const hidden of this.hiddenFolders) {
      if (hidden === oldPath) replacements.push([hidden, file.path]);
      else if (hidden.startsWith(oldPath + "/")) replacements.push([hidden, file.path + hidden.slice(oldPath.length)]);
    }
    if (replacements.length === 0) return;

    for (const [oldHidden, newHidden] of replacements) {
      this.hiddenFolders.delete(oldHidden);
      this.hiddenFolders.add(newHidden);
    }
    void this.saveHiddenFolders();
    this.queueRefresh();
  }

  private handleDelete(path: string): void {
    let changed = false;
    for (const hidden of [...this.hiddenFolders]) {
      if (hidden === path || hidden.startsWith(path + "/")) {
        this.hiddenFolders.delete(hidden);
        changed = true;
      }
    }
    if (changed) void this.saveHiddenFolders();
  }
}
