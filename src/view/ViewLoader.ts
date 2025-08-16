import {setIcon, ItemView, WorkspaceLeaf, sanitizeHTMLToDom} from "obsidian";
import RssReaderPlugin from "../main";
import {VIEW_ID} from "../consts";
import t from "../l10n/locale";
import {ItemModal} from "../modals/ItemModal";
import {Feed} from "../providers/Feed";
import Action from "../actions/Action";

export default class ViewLoader extends ItemView {
    private readonly plugin: RssReaderPlugin;
    private contentContainer: HTMLDivElement;
    private resizeObserver?: ResizeObserver;
    private layoutRoot?: HTMLDivElement;

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

        // Resize observer para adaptar layout al ancho del panel (no solo viewport)
        this.resizeObserver = new ResizeObserver(() => this.applyResponsiveClass());
        this.resizeObserver.observe(this.contentContainer);

        // Acción de refrescar usando la barra de acciones estándar
        this.addAction('refresh-cw', t('refresh_feeds'), async () => {
            await this.displayData();
        });

        await this.displayData();
    }

    protected async onClose(): Promise<void> {
        if (this.resizeObserver) {
            try { this.resizeObserver.disconnect(); } catch(_) {}
            this.resizeObserver = undefined;
        }
    }

    private async displayData() {
        const displayStart = performance.now();
        console.log("📊 RSS View: Starting display data...");
        
        this.contentContainer.empty();
        // crear layout root separado para que querySelector funcione y evitar mezclar clases
        this.layoutRoot = this.contentContainer.createDiv({cls: 'rss-fr-layout'});
        const root = this.layoutRoot;

        const subsPane = root.createDiv({cls: 'rss-fr-subs'});
        const listPane = root.createDiv({cls: 'rss-fr-list'});
        // Detail pane not used for now, kept for future optional preview
        const detailPane = root.createDiv({cls: 'rss-fr-detail hidden'});

        const providerStart = performance.now();
        const provider = this.plugin.providers.getCurrent();
        
        // Si ya tenemos feeds cacheados, usarlos directamente para las carpetas
        let folders: any[] = [];
        try {
            folders = await provider.folders();
        } catch (error) {
            console.error("❌ Error loading folders:", error);
            folders = [];
        }
        console.log(`🗂️  Folders loaded in ${(performance.now() - providerStart).toFixed(2)}ms`);

        // Agregar botón "All Feeds" al principio
        const allFeedsButton = subsPane.createDiv({cls: 'rss-all-feeds-button'});
        const globeIcon = allFeedsButton.createSpan();
        setIcon(globeIcon, 'globe');
        globeIcon.style.marginRight = '8px';
        
        // All feeds inicial - obtener todos los feeds para el botón global
        const globalFeedsList: any[] = [];
        for (const f of folders) globalFeedsList.push(...f.feeds());
        
        // Contar total de entradas en todos los feeds
        const totalAllItems = globalFeedsList.reduce((total, feed) => total + (feed.items()?.length || 0), 0);
        
        allFeedsButton.createSpan({text: `All Feeds (${totalAllItems})`});
        
        allFeedsButton.onclick = () => {
            // Remover clase active de otros elementos
            subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
            allFeedsButton.addClass('active');
            this.renderList(listPane, detailPane, globalFeedsList);
        };

        // Agregar categoría de Favoritos
        const favoritesButton = subsPane.createDiv({cls: 'rss-favorites-button'});
        const starIcon = favoritesButton.createSpan();
        setIcon(starIcon, 'star');
        starIcon.style.marginRight = '8px';
        
        // Obtener todos los items favoritos
        const favoriteItems = globalFeedsList.reduce((favorites: any[], feed) => {
            const feedFavorites = feed.items().filter((item: any) => item.starred && item.starred());
            return favorites.concat(feedFavorites);
        }, []);
        
        favoritesButton.createSpan({text: `Favorites (${favoriteItems.length})`});
        
        favoritesButton.onclick = () => {
            // Remover clase active de otros elementos
            subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
            favoritesButton.addClass('active');
            
            // Crear feed temporal para favoritos
            const favoritesFeed = {
                id: () => -1,
                url: () => '#favorites',
                title: () => 'Favorites',
                name: () => 'Favorites',
                favicon: () => null as string | null,
                unreadCount: () => favoriteItems.length,
                ordering: () => 0,
                link: () => '#favorites',
                folderId: () => -1,
                folderName: () => 'Special',
                items: () => favoriteItems
            };
            
            this.renderList(listPane, detailPane, [favoritesFeed]);
        };

        for (const folder of folders) {
            const folderHeader = subsPane.createDiv({cls: 'rss-folder-header'});
            const triangle = folderHeader.createSpan();
            setIcon(triangle, 'down-triangle');
            triangle.style.marginRight = '4px';
            
            // Contar entradas totales en esta carpeta
            const folderItemCount = folder.feeds().reduce((total: number, feed: any) => total + (feed.items()?.length || 0), 0);
            
            const folderName = folderHeader.createSpan({text: `${folder.name()} (${folderItemCount})`});
            folderName.style.flex = '1';
            
            const feedsWrap = subsPane.createDiv();
            let collapsed = false;
            folderHeader.onclick = () => {
                collapsed = !collapsed;
                setIcon(triangle, collapsed ? 'right-triangle' : 'down-triangle');
                feedsWrap.style.display = collapsed ? 'none' : 'block';
                
                // Si no está colapsado, mostrar todos los feeds de esta carpeta
                if (!collapsed) {
                    // Remover clase active de otros elementos
                    subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
                    folderHeader.addClass('active');
                    this.renderList(listPane, detailPane, folder.feeds());
                }
            };
            for (const feed of folder.feeds()) {
                const feedHeader = feedsWrap.createDiv({cls: 'rss-feed-header'});
                feedHeader.style.display = 'flex';
                feedHeader.style.alignItems = 'center';
                feedHeader.style.justifyContent = 'space-between';
                
                const feedInfo = feedHeader.createDiv();
                feedInfo.style.display = 'flex';
                feedInfo.style.alignItems = 'center';
                feedInfo.style.flex = '1';
                
                if (feed.favicon()) {
                    const fav = feedInfo.createEl('img', {attr: {src: feed.favicon()}});
                    fav.style.width = '14px';
                    fav.style.height = '14px';
                    fav.style.marginRight = '6px';
                }
                
                const feedName = feedInfo.createSpan({text: feed.name()});
                feedName.style.flex = '1';
                
                // Contador de entradas para este feed
                const feedItemCount = feed.items()?.length || 0;
                const countBadge = feedHeader.createSpan({
                    text: feedItemCount.toString(),
                    cls: 'rss-item-count-badge'
                });
                
                feedHeader.onclick = () => {
                    // Remover clase active de otros elementos
                    subsPane.querySelectorAll('.active').forEach(el => el.removeClass('active'));
                    feedHeader.addClass('active');
                    this.renderList(listPane, detailPane, [feed]);
                };
            }
        }

        // Renderizar inicialmente todas las entradas y marcar el botón "All Feeds" como activo
        allFeedsButton.addClass('active');
        this.renderList(listPane, detailPane, globalFeedsList);
        // aplicar clase responsive inmediatamente
        this.applyResponsiveClass();
        
        console.log(`📊 RSS View: Display completed in ${(performance.now() - displayStart).toFixed(2)}ms`);
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
            const row = listPane.createDiv({cls: 'rss-fr-row rss-fr-row-article'});
            if (!item.read || !item.read()) row.addClass('unread'); else row.addClass('read');
            const dot = row.createSpan({cls: 'rss-dot'});
            const starEl = row.createSpan({cls: 'rss-fr-star', text: item.starred && item.starred() ? '★' : '☆'});
            starEl.onclick = async (e) => {
                e.stopPropagation();
                
                // Usar la acción FAVORITE para persistir correctamente
                await Action.FAVORITE.processor(this.plugin, item);
                
                // Actualizar la UI inmediatamente
                const isStarred = item.starred();
                starEl.setText(isStarred ? '★' : '☆');
                starEl.toggleClass('is-starred', isStarred);
                
                // Invalidar caché para refrescar contadores
                const provider = await this.plugin.providers.getById('local');
                if (provider && 'invalidateCache' in provider) {
                    (provider as any).invalidateCache();
                }
                
                // Refrescar la vista si estamos en Favorites
                const activeButton = this.contentContainer.querySelector('.active');
                if (activeButton && activeButton.textContent?.includes('Favorites')) {
                    await this.displayData();
                }
            };
            // Thumbnail
            let thumbUrl = '';
            try { thumbUrl = (item.mediaThumbnail && item.mediaThumbnail()) || ''; } catch(_) {}
            if (!thumbUrl) {
                // fallback: search <img src> in description/body
                try {
                    const raw = (item.description && item.description()) || (item.body && item.body()) || '';
                    const m = raw.match(/<img[^>]+src="([^"]+)"/i);
                    if (m) thumbUrl = m[1];
                } catch(_) {}
            }
            let hasThumb = false;
            if (thumbUrl) {
                const img = row.createEl('img', {cls: 'rss-fr-thumb', attr: {src: thumbUrl}});
                img.loading = 'lazy';
                hasThumb = true;
                row.addClass('has-thumbnail');
            } else {
                // Añadir clase específica cuando no hay imagen
                row.addClass('no-thumbnail');
            }
            const main = row.createDiv({cls: 'rss-fr-main' + (hasThumb ? '' : ' no-thumb')});
            const topLine = main.createDiv({cls: 'rss-fr-top'});
            topLine.createSpan({cls: 'rss-fr-feed', text: feed.name()});
            topLine.createSpan({cls: 'rss-fr-title', text: item.title()});
            const timeLabel = dateObj ? dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
            topLine.createSpan({cls: 'rss-fr-date', text: timeLabel});
            const descLine = main.createDiv({cls: 'rss-fr-desc'});
            // strip HTML tags
            let descRaw = '';
            try { descRaw = (item.description && item.description()) || (item.body && item.body()) || ''; } catch(_) {}
            const text = descRaw.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
            descLine.setText(this.truncateWords(text, 220));

            row.onclick = () => {
                if (item.markRead && !item.read()) {
                    item.markRead(true);
                    row.removeClass('unread');
                    row.addClass('read');
                    dot.addClass('read');
                }
                new ItemModal(this.plugin, item, collected.map(c=>c.item), true).open();
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

    // openDetail no longer used (modal preferred)

    private applyResponsiveClass() {
        const root = this.layoutRoot;
        if (!root) return;
        const width = this.contentContainer.getBoundingClientRect().width;
        if (width < 720) root.addClass('rss-narrow'); else root.removeClass('rss-narrow');
    }

    private truncateWords(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text;
        // Cut slightly over then roll back to nearest space
        let slice = text.slice(0, maxChars + 8);
        const space = slice.lastIndexOf(' ');
        if (space > 0) slice = slice.slice(0, space);
        return slice.replace(/[\s\.,;:!-]*$/,'') + '…';
    }
}
