import {setIcon, ItemView, WorkspaceLeaf} from "obsidian";
import RssReaderPlugin from "../main";
import {VIEW_ID} from "../consts";
import t from "../l10n/locale";
import {ItemModal} from "../modals/ItemModal";

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

    private renderList(listPane: HTMLElement, detailPane: HTMLElement, feeds: any[]) {
        listPane.empty();
        const items: any[] = [];
        for (const feed of feeds) items.push(...feed.items());
        if (!items.length) {
            listPane.createDiv({cls: 'rss-fr-empty', text: t('all')}); // reuse translation
            return;
        }
        items.sort((a,b)=> (b.pubDate()?.getTime?.()||0) - (a.pubDate()?.getTime?.()||0));
        let group: string | null = null;
        for (const item of items) {
            const d = item.pubDate ? item.pubDate() : null;
            const g = d ? d.toDateString() : 'Unknown';
            if (g !== group) {
                group = g;
                listPane.createDiv({cls: 'rss-fr-group-header', text: g});
            }
            const row = listPane.createDiv({cls: 'rss-fr-row unread'});
            row.createSpan({cls: 'rss-dot'});
            row.createSpan({text: ''}); // star placeholder
            row.createSpan({cls: 'rss-fr-feed', text: item.feed?.title?.() || item.feedTitle?.() || ''});
            row.createSpan({cls: 'rss-fr-title', text: item.title()});
            row.createSpan({cls: 'rss-fr-date', text: d ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''});
            row.onclick = () => {
                row.removeClass('unread');
                row.addClass('read');
                this.openDetail(detailPane, item, items);
            };
        }
    }

    private openDetail(detailPane: HTMLElement, item: any, items: any[]) {
        detailPane.empty();
        detailPane.removeClass('hidden');
        const toolbar = detailPane.createDiv({cls: 'rss-fr-toolbar'});
        const openBtn = toolbar.createEl('button', {text: t('open')});
        openBtn.onclick = () => new ItemModal(this.plugin, item, items, true).open();
        const titleEl = detailPane.createEl('h2');
        titleEl.setText(item.title());
        const meta = detailPane.createDiv({text: item.pubDate ? item.pubDate().toString() : ''});
        const body = detailPane.createDiv();
        body.setText(item.description()?.replace(/\n+/g,' ').substring(0,1000) || '');
    }
}
