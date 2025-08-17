import { ItemView, WorkspaceLeaf } from 'obsidian';
import type RssReaderPlugin from '../main';
import { VIEW_ID } from '../consts';
import t from '../l10n/locale';

// New simplified Svelte-only view loader.
export default class ViewLoader extends ItemView {
    private readonly plugin: RssReaderPlugin;
        private hostEl?: HTMLDivElement; // Obsidian createDiv returns HTMLElement with extended helpers
    private svelteInstance: any;
    private resizeObserver?: ResizeObserver;

    constructor(leaf: WorkspaceLeaf, plugin: RssReaderPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getDisplayText(): string { return t('RSS_Feeds'); }
    getViewType(): string { return VIEW_ID; }
    getIcon(): string { return 'rss'; }

    protected async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement; // .view-content
        container.empty();
        container.addClass('rss-view-container');
        this.hostEl = container.createDiv({ cls: 'rss-svelte-host' }) as HTMLDivElement;
        this.resizeObserver = new ResizeObserver(() => {/* reserved for future responsive behavior */});
        this.resizeObserver.observe(this.hostEl as unknown as Element);
        await this.mountSvelte();
    }

    protected async onClose(): Promise<void> {
        try { this.svelteInstance?.$destroy?.(); } catch {}
            if (this.resizeObserver && this.hostEl) {
                try { this.resizeObserver.unobserve(this.hostEl as unknown as Element); } catch {}
        }
        this.resizeObserver = undefined;
        this.hostEl = undefined;
    }

    private async mountSvelte() {
        if (!this.hostEl) return;
        this.hostEl.empty();
        try {
            const { default: RssRoot } = await import('./RssRoot.svelte');
            this.svelteInstance = new (RssRoot as any)({ target: this.hostEl, props: { plugin: this.plugin } });
        } catch (e) {
            console.error('Failed to mount RssRoot.svelte', e);
            // Fallback plain text
            this.hostEl.createEl('div', { text: 'Failed to load UI' });
        }
    }

    // Compatibility no-ops kept for legacy calls until fully removed.
    async updateFavoritesCounter(): Promise<void> { /* handled within Svelte */ }
    refreshSidebarCounts(): void { /* handled within Svelte */ }
}
