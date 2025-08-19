import { ItemView, WorkspaceLeaf } from 'obsidian';
import type RssReaderPlugin from '../main';
import { VIEW_ID } from '../consts';
import t from '../l10n/locale';



/**
 * Represents the main view loader for the RSS Reader plugin in Obsidian.
 * 
 * This class extends `ItemView` and is responsible for initializing, mounting,
 * and destroying the Svelte-based UI for displaying RSS feeds. It manages the
 * lifecycle of the view, including handling responsive behavior via a
 * `ResizeObserver`, and provides compatibility methods for legacy calls.
 * 
 * @remarks
 * - The Svelte root component is dynamically imported and mounted to a host element.
 * - Responsive behavior is reserved for future implementation.
 * - Compatibility methods (`updateFavoritesCounter`, `refreshSidebarCounts`) are no-ops.
 * 
 * @example
 * ```typescript
 * const viewLoader = new ViewLoader(leaf, plugin);
 * await viewLoader.onOpen();
 * // ... interact with the view ...
 * await viewLoader.onClose();
 * ```
 */
export default class ViewLoader extends ItemView {
    private readonly plugin: RssReaderPlugin;
    // Obsidian createDiv returns HTMLElement with extended helpers
    private hostEl?: HTMLDivElement;
    private svelteInstance: any;
    private resizeObserver?: ResizeObserver;

    constructor(leaf: WorkspaceLeaf, plugin: RssReaderPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    public getDisplayText(): string { 
        return t('RSS_Feeds'); 
    }

    public getViewType(): string {
        return VIEW_ID; 
    }

    public getIcon(): string {
        return 'rss'; 
    }

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
}
