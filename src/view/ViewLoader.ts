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
        const contentEl = this.contentContainer;
        contentEl.empty();
        
        // Configurar el contenedor principal para ser completamente responsivo
        contentEl.style.cssText = `
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
            box-sizing: border-box !important;
        `;

        const folders = await this.plugin.providers.getCurrent().folders();

        for (const folder of folders) {
            const folderDiv = this.contentContainer.createDiv('rss-folder');
            
            // Header del folder con collapse
            const folderHeader = folderDiv.createDiv('rss-folder-header');
            folderHeader.style.display = 'flex';
            folderHeader.style.alignItems = 'center';
            folderHeader.style.cursor = 'pointer';
            folderHeader.style.padding = '4px 0';

            const folderCollapseIcon = folderHeader.createSpan();
            setIcon(folderCollapseIcon, 'down-triangle');
            folderCollapseIcon.style.marginRight = '4px';
            
            folderHeader.createSpan({text: folder.name()});

            const folderContent = folderDiv.createDiv('rss-folder-content');
            folderContent.style.display = 'block';
            let folderCollapsed = false;

            // Click handler para el folder
            folderHeader.addEventListener('click', (e) => {
                e.stopPropagation();
                folderCollapsed = !folderCollapsed;
                if (folderCollapsed) {
                    setIcon(folderCollapseIcon, 'right-triangle');
                    folderContent.style.display = 'none';
                } else {
                    setIcon(folderCollapseIcon, 'down-triangle');
                    folderContent.style.display = 'block';
                }
            });

            for (const feed of folder.feeds()) {
                const feedDiv = folderContent.createDiv('feed');
                
                // Header del feed con collapse
                const feedHeader = feedDiv.createDiv('rss-feed-header');
                feedHeader.style.display = 'flex';
                feedHeader.style.alignItems = 'center';
                feedHeader.style.cursor = 'pointer';
                feedHeader.style.padding = '4px 0';
                feedHeader.style.marginLeft = '16px';

                const feedCollapse = feedHeader.createSpan();
                setIcon(feedCollapse, 'right-triangle');
                feedCollapse.style.marginRight = '4px';

                if(feed.favicon()) {
                    const favicon = feedHeader.createEl('img', {cls: 'feed-favicon', attr: {src: feed.favicon()}});
                    favicon.style.width = '16px';
                    favicon.style.height = '16px';
                    favicon.style.marginRight = '4px';
                }
                feedHeader.createSpan({text: feed.title()});

                // Contenedor de items
                const feedList = feedDiv.createEl('ul');
                feedList.style.cssText = `
                    margin-left: 32px !important;
                    padding: 0 !important;
                    padding-right: 32px !important;
                    list-style: none !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                    overflow: hidden !important;
                `;
                let feedCollapsedState = false;

                // Click handler para el feed
                feedHeader.addEventListener('click', (e) => {
                    e.stopPropagation();
                    feedCollapsedState = !feedCollapsedState;
                    if (feedCollapsedState) {
                        setIcon(feedCollapse, 'right-triangle');
                        feedList.style.display = 'none';
                    } else {
                        setIcon(feedCollapse, 'down-triangle');
                        feedList.style.display = 'block';
                    }
                });

                // Inicializar como expandido
                setIcon(feedCollapse, 'down-triangle');

                for (const item of feed.items()) {
                    const itemDiv = feedList.createEl('li');
                    itemDiv.addClass('rss-item-container');
                    
                    // USAR CSS GRID - más robusto que flexbox para este caso
                    const hasImage = item.mediaThumbnail() && item.mediaThumbnail().length > 0 && !item.mediaThumbnail().includes('.mp3');
                    itemDiv.style.cssText = `
                        padding: 8px !important;
                        margin-bottom: 8px !important;
                        border: 1px solid var(--background-modifier-border) !important;
                        border-radius: 6px !important;
                        cursor: pointer !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                        display: grid !important;
                        grid-template-columns: ${hasImage ? '60px 1fr' : '1fr'} !important;
                        gap: 12px !important;
                        align-items: start !important;
                    `;

                    // Imagen (si existe)
                    if (hasImage) {
                        const img = itemDiv.createEl('img', {
                            attr: {src: item.mediaThumbnail(), alt: 'Article'},
                            cls: 'rss-thumbnail'
                        });
                        img.style.cssText = `
                            width: 60px !important;
                            height: 60px !important;
                            object-fit: cover !important;
                            border-radius: 4px !important;
                        `;
                    }

                    // Contenido de texto
                    const textContent = itemDiv.createDiv({cls: 'rss-item-text'});
                    textContent.style.cssText = `
                        overflow: hidden !important;
                        word-wrap: break-word !important;
                        min-width: 0 !important;
                    `;

                    // Título
                    const titleDiv = textContent.createDiv({
                        text: item.title(),
                        cls: 'rss-item-title'
                    });
                    titleDiv.style.cssText = `
                        font-weight: bold !important;
                        margin-bottom: 4px !important;
                        line-height: 1.3 !important;
                        font-size: 14px !important;
                        word-break: break-word !important;
                        hyphens: auto !important;
                    `;

                    // Descripción
                    if (item.description() && item.description().length > 0) {
                        const descDiv = textContent.createDiv({cls: 'rss-item-description'});
                        const cleanDesc = item.description().replace(/<[^>]*>/g, '').trim();
                        const truncatedDesc = cleanDesc.length > 120 ? cleanDesc.substring(0, 120) + '...' : cleanDesc;
                        descDiv.textContent = truncatedDesc;
                        descDiv.style.cssText = `
                            font-size: 12px !important;
                            color: var(--text-muted) !important;
                            line-height: 1.4 !important;
                            margin-top: 4px !important;
                            word-break: break-word !important;
                            hyphens: auto !important;
                        `;
                    }

                    // Iconos de estado
                    if(item.starred() || item.created()) {
                        const statusIcons = textContent.createDiv({cls: 'rss-status-icons'});
                        statusIcons.style.cssText = `
                            display: flex !important;
                            gap: 4px !important;
                            margin-top: 8px !important;
                        `;
                        
                        if(item.starred())
                            setIcon(statusIcons.createSpan(), 'star');
                        if(item.created())
                            setIcon(statusIcons.createSpan(), 'document');
                    }

                    if(item.read())
                        itemDiv.addClass('rss-read');

                    // Click para abrir modal
                    itemDiv.onClickEvent((e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        new ItemModal(this.plugin, item, feed.items(), true).open();
                    });

                    // Hover effect
                    itemDiv.addEventListener('mouseenter', () => {
                        itemDiv.style.backgroundColor = 'var(--background-modifier-hover)';
                    });
                    itemDiv.addEventListener('mouseleave', () => {
                        itemDiv.style.backgroundColor = '';
                    });
                }
            }
        }
    }
}
