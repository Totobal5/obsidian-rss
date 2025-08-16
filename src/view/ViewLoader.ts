import {setIcon, ItemView, WorkspaceLeaf, sanitizeHTMLToDom} from "obsidian";
import RssReaderPlugin from "../main";
import {VIEW_ID} from "../consts";
import t from "../l10n/locale";
import {ItemModal} from "../modals/ItemModal";
import {Feed} from "../providers/Feed";

export default class ViewLoader extends ItemView {
    private readonly plugin: RssReaderPlugin;
    private contentContainer: HTMLDivElement;

    constructor(leaf: WorkspaceLeaf, plugin: RssReaderPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getDisplayText(): string {
        return t("RSS_Feeds");
    }

    getViewType(): string {
        return VIEW_ID;
    }

    getIcon(): string {
        return "rss";
    }

    protected async onOpen(): Promise<void> {
        // Usar el contenedor estándar de Obsidian para asegurar responsividad
        const container = this.containerEl.children[1] as HTMLElement; // .view-content
        container.empty();
        container.addClass('rss-view-container');
        this.contentContainer = container.createDiv({cls: 'rss-scrollable-content'});

        // Acción de refrescar usando la barra de acciones estándar
        this.addAction('refresh-cw', t('refresh_feeds'), async () => {
            await this.displayData();
        });

        await this.displayData();
    }

    private async displayData() {
        const root = this.contentContainer;
        root.empty();
        root.addClass('rss-fr-layout');

        const subsPane = root.createDiv({cls: 'rss-fr-subs'});
        const listPane = root.createDiv({cls: 'rss-fr-list'});
        const detailPane = root.createDiv({cls: 'rss-fr-detail hidden'});

        const provider = this.plugin.providers.getCurrent();
        const folders = await provider.folders();

        for (const folder of folders) {
            const folderHeader = subsPane.createDiv({cls: 'rss-folder-header'});
            const triangle = folderHeader.createSpan();
            setIcon(triangle, 'down-triangle');
            triangle.style.marginRight = '4px';
            folderHeader.createSpan({text: folder.name()});
            const feedsWrap = subsPane.createDiv();
            let collapsed = false;
            folderHeader.onclick = () => {
                collapsed = !collapsed;
                setIcon(triangle, collapsed ? 'right-triangle' : 'down-triangle');
                feedsWrap.style.display = collapsed ? 'none' : 'block';
            };
            for (const feed of folder.feeds()) {
                const feedHeader = feedsWrap.createDiv({cls: 'rss-feed-header'});
                feedHeader.style.display = 'flex';
                feedHeader.style.alignItems = 'center';
                if (feed.favicon()) {
                    const fav = feedHeader.createEl('img', {attr: {src: feed.favicon()}});
                    fav.style.width = '14px';
                    fav.style.height = '14px';
                    fav.style.marginRight = '4px';
                }
                feedHeader.createSpan({text: feed.title()});
                feedHeader.onclick = () => this.renderList(listPane, detailPane, [feed]);
            }
        }

        // All feeds initial
        const allFeeds: any[] = [];
        for (const f of folders) allFeeds.push(...f.feeds());
        this.renderList(listPane, detailPane, allFeeds);
    }

    private renderList(listPane: HTMLElement, detailPane: HTMLElement, feeds: Feed[]) {
        listPane.empty();
        const collected: {feed: Feed, item: any}[] = [];
        for (const feed of feeds) {
            for (const it of feed.items()) collected.push({feed, item: it});
        }
        if (!collected.length) {
            listPane.createDiv({cls: 'rss-fr-empty', text: 'No items'});
            return;
        }
        // Parse date strings -> Date objects (fallback to epoch 0 when invalid to keep stable sort)
        collected.sort((a,b)=> {
            const ad = new Date(a.item.pubDate?.() || a.item.pubDate || 0).getTime();
            const bd = new Date(b.item.pubDate?.() || b.item.pubDate || 0).getTime();
            return bd - ad;
        });
        let currentGroup: string | null = null;
        for (const {feed, item} of collected) {
            const dateStrRaw = (typeof item.pubDate === 'function') ? item.pubDate() : item.pubDate; // Item interface returns string
            const dateObj = dateStrRaw ? new Date(dateStrRaw) : null;
            const groupLabel = dateObj ? this.groupLabel(dateObj) : 'Unknown';
            if (groupLabel !== currentGroup) {
                currentGroup = groupLabel;
                listPane.createDiv({cls: 'rss-fr-group-header', text: groupLabel});
            }
            const row = listPane.createDiv({cls: 'rss-fr-row'});
            if (!item.read || !item.read()) row.addClass('unread'); else row.addClass('read');
            const dot = row.createSpan({cls: 'rss-dot'});
            const starEl = row.createSpan({cls: 'rss-fr-star', text: item.starred && item.starred() ? '★' : '☆'});
            starEl.onclick = (e) => {
                e.stopPropagation();
                if (item.markStarred) item.markStarred(!item.starred());
                starEl.setText(item.starred() ? '★' : '☆');
                starEl.toggleClass('is-starred', item.starred());
            };
            row.createSpan({cls: 'rss-fr-feed', text: feed.title()});
            row.createSpan({cls: 'rss-fr-title', text: item.title()});
            const timeLabel = dateObj ? dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
            row.createSpan({cls: 'rss-fr-date', text: timeLabel});

            row.onclick = () => {
                if (item.markRead && !item.read()) {
                    item.markRead(true);
                    row.removeClass('unread');
                    row.addClass('read');
                    dot.addClass('read');
                }
                this.openDetail(detailPane, feed, item, collected.map(c=>c.item));
            };
        }
    }

    private groupLabel(d: Date): string {
        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffMs = startToday.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const dayDiff = Math.round(diffMs / 86400000);
    if (dayDiff === 0) return 'Today';
    if (dayDiff === 1) return 'Yesterday';
        return d.toLocaleDateString();
    }

    private openDetail(detailPane: HTMLElement, feed: Feed, item: any, items: any[]) {
        detailPane.empty();
        detailPane.removeClass('hidden');
        const toolbar = detailPane.createDiv({cls: 'rss-fr-toolbar'});
    const openBtn = toolbar.createEl('button', {text: t('open')});
        openBtn.onclick = () => new ItemModal(this.plugin, item, items, true).open();
    const unreadBtn = toolbar.createEl('button', {text: item.read && !item.read() ? t('mark_as_read') : t('mark_as_unread')});
        unreadBtn.onclick = () => {
            if (item.markRead) item.markRead(!item.read());
            unreadBtn.setText(item.read() ? t('mark_as_unread') : t('mark_as_read'));
        };
        const starBtn = toolbar.createEl('button', {text: item.starred && item.starred() ? t('remove_from_favorites') : t('mark_as_favorite')});
        starBtn.onclick = () => {
            if (item.markStarred) item.markStarred(!item.starred());
            starBtn.setText(item.starred() ? t('remove_from_favorites') : t('mark_as_favorite'));
        };
        const titleEl = detailPane.createEl('h2');
        titleEl.setText(item.title());
        const meta = detailPane.createDiv({text: `${feed.title()} • ${(typeof item.pubDate === 'function') ? item.pubDate() : item.pubDate || ''}`});
        const body = detailPane.createDiv({cls: 'rss-fr-body'});
        try {
            const raw = (item.body && item.body()) || (item.description && item.description()) || '';
            // sanitized HTML (Obsidian helper)
            const frag = sanitizeHTMLToDom(raw);
            body.appendChild(frag);
        } catch (e) {
            body.setText(item.description?.() || '');
        }
    }
}
