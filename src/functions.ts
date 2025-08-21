import {
    htmlToMarkdown,
    MarkdownView,
    normalizePath,
    Notice,
    TextComponent,
    MarkdownPreviewRenderer,
    moment
} from "obsidian";

import { TextInputPrompt } from "./modals/TextInputPrompt";
import { FILE_NAME_REGEX } from "./consts";
import RssReaderPlugin from "./main";
import t from "./l10n/locale";
import type { Item } from "./providers/Item";
import type { Feed } from "./providers/Feed";
import type { RssFeedContent, RssFeedItem } from "./parser/rssParser";

/**
 * Creates a new note in the Obsidian vault based on the provided RSS item.
 *
 * - Determines the directory to save the note, using either the active file's parent directory
 *   or a custom location specified in plugin settings.
 * - Generates a filename using a template and sanitizes it.
 * - If `askForFilename` is enabled in settings, prompts the user for a filename and validates it.
 * - Ensures the filename does not already exist in the vault and is valid.
 * - Creates the new file with the specified or generated filename and content.
 *
 * @param plugin - The instance of the RssReaderPlugin containing app and settings.
 * @param item - The RSS item to create the note from.
 * @returns A promise that resolves when the note has been created.
 */
export async function createNewNote(plugin: RssReaderPlugin, item: Item): Promise<void> {
    console.log("creating new note");
    const activeFile = plugin.app.workspace.getActiveFile();
    let dir = plugin.app.fileManager.getNewFileParent(activeFile ? activeFile.path : "").path;

    if (plugin.settings.saveLocation === "custom") {
        dir = plugin.settings.saveLocationFolder;
    }

    let filename = applyTemplate(plugin, item, plugin.settings.defaultFilename);
    filename = filename.replace(/[\/\\:]/g, ' ');

    if (plugin.settings.askForFilename) {
        const inputPrompt = new TextInputPrompt(
            plugin.app,
            t("specify_name"),
            t("cannot_contain") + " * \" \\ / < > : | ?",
            filename,
            filename
        );
        await inputPrompt.openAndGetValue(async (text: TextComponent) => {
            const value = text.getValue();
            if (value.match(FILE_NAME_REGEX)) {
                inputPrompt.setValidationError(text, t("invalid_filename"));
                return;
            }
            const filePath = normalizePath([dir, `${value}.md`].join('/'));
            if (isInVault(filePath)) {
                inputPrompt.setValidationError(text, t("note_exists"));
                return;
            }
            inputPrompt.close();
            await createNewFile(plugin, item, filePath, value);
        });
    } else {
        const replacedTitle = filename.replace(FILE_NAME_REGEX, '');
        const filePath = normalizePath([dir, `${replacedTitle}.md`].join('/'));
        await createNewFile(plugin, item, filePath, item.title());
    }
}

/**
 * Creates a new file in the Obsidian vault using the provided RSS item and template.
 * If the file already exists at the specified path, shows a notice and aborts.
 * Otherwise, applies the template to the item, creates the file, opens it in edit mode,
 * marks the item as created, updates the feed content, and shows a success notice.
 *
 * @param plugin - The instance of the RssReaderPlugin.
 * @param item - The RSS item to use for file creation.
 * @param path - The vault path where the new file will be created.
 * @param title - The title to use in the template for the new file.
 * @returns A promise that resolves when the file has been created and opened.
 */
async function createNewFile(
    plugin: RssReaderPlugin,
    item: Item,
    path: string,
    title: string
): Promise<void> {
    // Check if the file already exists in the vault
    if (isInVault(path)) {
        new Notice(t("note_exists"));
        return;
    }

    // Apply the template to generate file content
    const fileContent = applyTemplate(plugin, item, plugin.settings.template, title);

    const createdFile = await plugin.app.vault.create(path, fileContent);
    await plugin.app.workspace.getLeaf('tab').openFile(createdFile, { state: { mode: 'edit' } });

    // Mark the item as created
    item.markCreated(true);
    await plugin.writeFeedContent(() => plugin.settings.items);

    new Notice(t("created_note"));
}

/**
 * Pastes the content of an RSS item into the currently active note in Obsidian.
 * Applies a template to the item, inserts it at the current cursor position,
 * marks the item as created, writes the updated feed content, and shows a notification.
 *
 * @param plugin - The instance of the RssReaderPlugin.
 * @param item - The RSS item to paste into the note.
 * @returns A promise that resolves when the operation is complete.
 */
export async function pasteToNote(plugin: RssReaderPlugin, item: Item): Promise<void> {
    const file = plugin.app.workspace.getActiveFile();
    if (!file) {
        new Notice(t("no_file_active"));
        return;
    }

    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
        new Notice("No view available");
        return;
    }

    const appliedTemplate = applyTemplate(plugin, item, plugin.settings.pasteTemplate);
    view.editor.replaceRange(appliedTemplate, view.editor.getCursor());
    item.markCreated(true);
    await plugin.writeFeedContent(() => plugin.settings.items);
    new Notice(t("RSS_Reader") + t("inserted_article"));
}

/**
 * Applies a template to an RSS item, replacing placeholders with item data and formatting as specified.
 *
 * Supported placeholders in the template:
 * - `{{title}}`: Item title
 * - `{{link}}`: Item URL
 * - `{{author}}`: Item author
 * - `{{published}}`: Item published date (formatted)
 * - `{{created}}`, `{{date}}`: Current date (formatted)
 * - `{{feed}}`: Feed name
 * - `{{folder}}`: Folder name
 * - `{{description}}`: Item description
 * - `{{media}}`: Media enclosure link
 * - `{{tags}}`: Comma-separated tags
 * - `{{#tags}}`: Comma-separated tags prefixed with `#`
 * - `{{highlights}}`: Markdown list of highlights
 * - `{{content}}`: Item body content, with highlights marked
 * - `{{filename}}`: Provided filename (if any)
 *
 * Custom formatting:
 * - `{{published:FORMAT}}`, `{{created:FORMAT}}`: Date formatted using `FORMAT` (e.g., `YYYY-MM-DD`)
 * - `{{tags:SEPARATOR}}`, `{{#tags:SEPARATOR}}`: Tags joined by `SEPARATOR`
 * - `{{highlights:TEMPLATE}}`: Highlights rendered using `TEMPLATE`, with `%%highlight%%` replaced by each highlight
 *
 * @param plugin - The RssReaderPlugin instance containing settings and utilities.
 * @param item - The RSS item to apply the template to.
 * @param template - The template string containing placeholders.
 * @param filename - Optional filename to inject into the template.
 * @returns The template string with all placeholders replaced by item data.
 */
function applyTemplate(plugin: RssReaderPlugin, item: Item, template: string, filename?: string): string {
    let result = template
        .replace(/{{title}}/g, item.title())
        .replace(/{{link}}/g, item.url())
        .replace(/{{author}}/g, item.author())
        .replace(/{{published}}/g, moment(item.pubDate()).format(plugin.settings.dateFormat))
        .replace(/{{created}}/g, moment().format(plugin.settings.dateFormat))
        .replace(/{{date}}/g, moment().format(plugin.settings.dateFormat))
        .replace(/{{feed}}/g, item.feed())
        .replace(/{{folder}}/g, item.folder())
        .replace(/{{description}}/g, item.description())
        .replace(/{{media}}/g, item.enclosureLink);

    // Custom date formatting
    result = result.replace(/{{published:([^}]+)}}/g, (_, format) =>
        moment(item.pubDate()).format(format)
    );
    result = result.replace(/{{created:([^}]+)}}/g, (_, format) =>
        moment().format(format)
    );

    // Custom tag formatting
    result = result.replace(/{{tags:([^}]+)}}/g, (_, sep) =>
        item.tags().join(sep)
    );
    result = result.replace(/{{#tags:([^}]+)}}/g, (_, sep) =>
        item.tags().map(tag => `#${tag}`).join(sep)
    );

    result = result
        .replace(/{{tags}}/g, item.tags().join(", "))
        .replace(/{{#tags}}/g, item.tags().map(tag => `#${tag}`).join(", "));

    // Highlights
    result = result.replace(/{{highlights}}/g,
        item.highlights().map(value =>
            `- ${rssToMd(plugin, removeFormatting(value).replace(/^(-+)/, ""))}`
        ).join("\n")
    );

    result = result.replace(/{{highlights:([^}]+)}}/g, (_, highlightTemplate) =>
        item.highlights().map(highlight =>
            highlightTemplate.replace(/%%highlight%%/g, rssToMd(plugin, removeFormatting(highlight)).replace(/^(-+)/, ""))
        ).join("")
    );

    if (filename) {
        result = result.replace(/{{filename}}/g, filename);
    }

    // Content
    let content = rssToMd(plugin, item.body());
    item.highlights().forEach(highlight => {
        const mdHighlight = htmlToMarkdown(highlight);
        content = content.replace(mdHighlight, `==${mdHighlight}==`);
    });
    content = content.replace(/\$/g, "$$$");
    result = result.replace(/{{content}}/g, content);

    return result;
}

/**
 * Removes specific formatting from an HTML string.
 *
 * This function parses the input HTML and performs the following operations:
 * - Removes all custom data attributes from anchor (`<a>`) elements within the `<body>`.
 * - Removes all `<object>` elements from the document.
 * - Returns the resulting HTML as a string.
 *
 * @param html - The HTML string to process.
 * @returns The cleaned HTML string with formatting removed.
 */
function removeFormatting(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll("html body a").forEach(el => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.dataset) Object.keys(htmlEl.dataset).forEach(key => delete htmlEl.dataset[key]);
    });
    doc.querySelectorAll("object").forEach(object => object.remove());
    return doc.documentElement.innerHTML;
}

/**
 * Opens a given item's URL in a new browser tab.
 *
 * The function attempts to extract a valid URL from the provided `item` object.
 * It checks for the following properties in order:
 * - `url`: If it's a function, calls it and uses its return value if it's a non-empty string.
 * - `link`: Uses its value if it's a string.
 * - `href`: Uses its value if it's a string.
 *
 * Only URLs starting with `http://` or `https://` are considered valid.
 * If a valid URL is found, it opens the link in a new tab with `noopener` and `noreferrer` for security.
 * Any errors encountered during the process are logged to the console.
 *
 * @param item - The object containing the URL information. Can be of type `Item` or any other type.
 */
export function openInBrowser(item: Item | any): void {
    try {
        let link: string | undefined;
        if (item && typeof item.url === 'function') {
            const v = item.url();
            if (typeof v === 'string' && v.length) link = v;
        }
        if (!link && item && typeof item.link === 'string') link = item.link;
        if (!link && item && typeof item.href === 'string') link = item.href;
        if (!link || !/^https?:\/\//i.test(link)) return;
        window.open(link, '_blank', 'noopener,noreferrer');
    } catch (e) {
        console.warn('[rss] openInBrowser failed', e);
    }
}

// Pre-compiled regexes for rssToMd
const TEMPLATER_REGEX = /<%([\s\S]*?)%>/g;
const WALLABAG_CODEBLOCK_REGEX = /^```[\w-]*\n([\s\S]*?)```$/gm;
const SCRIPT_TAG_REGEX = /<script[\s\S]*?<\/script>/gi;
const EMBED_REGEX = /!?\[(.*)\]\(.+\)/gm;

/**
 * Converts RSS feed HTML content to Markdown, applying various transformations and plugin-specific formatting.
 *
 * - Converts HTML to Markdown.
 * - Improves blockquote parsing and centers standalone images.
 * - Adds compatibility for Dataview and Templater plugins by wrapping queries and templates in appropriate code blocks.
 * - Handles Wallabag codeblocks and removes script tags if necessary.
 * - Optionally removes media embeds based on plugin settings.
 *
 * @param plugin - The RssReaderPlugin instance containing app and settings.
 * @param content - The HTML content from the RSS feed to be converted.
 * @returns The transformed Markdown string.
 */
export function rssToMd(plugin: RssReaderPlugin, content: string): string {
    let markdown = htmlToMarkdown(content);
    markdown = improveBlockquoteParsing(markdown, content);
    markdown = centerStandaloneImages(markdown);

    // Dataview plugin support
    if ((plugin.app as any).plugins.plugins["dataview"]) {
        const { inlineQueryPrefix, inlineJsQueryPrefix } = (plugin.app as any).plugins.plugins.dataview.api.settings as { [key: string]: string };
        const inlineQueryRegex = new RegExp(`\`${escapeRegExp(inlineQueryPrefix)}.*\``, 'g');
        const inlineJsQueryRegex = new RegExp(`\`${escapeRegExp(inlineJsQueryPrefix)}.*\``, 'g');
        markdown = markdown.replace(inlineQueryRegex, "<pre>$&</pre>");
        markdown = markdown.replace(inlineJsQueryRegex, "<pre>$&</pre>");
    }

    // Templater plugin support
    if ((plugin.app as any).plugins.plugins["templater-obsidian"]) {
        markdown = markdown.replace(TEMPLATER_REGEX, "```javascript\n$&\n```");
    }

    // Wallabag codeblock handling
    if (typeof MarkdownPreviewRenderer !== 'undefined') {
        // Generic code block handling: wrap all code blocks in <pre> tags
        markdown = markdown.replace(WALLABAG_CODEBLOCK_REGEX, "<pre>$&</pre>");
    } else {
        markdown = markdown.replace(SCRIPT_TAG_REGEX, '');
    }

    // Remove embeds if media display is disabled
    if (!plugin.settings.displayMedia) {
        markdown = markdown.replace(EMBED_REGEX, "$1");
    }

    return markdown;
}

// Pre-compiled regex for blockquote parsing
const BLOCKQUOTE_REGEX = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;

/**
 * Enhances the given Markdown string by parsing blockquotes from the provided HTML string
 * and appending them in Markdown blockquote format if they are not already present.
 *
 * This function searches for `<blockquote>` elements in the original HTML, extracts their content,
 * removes any HTML tags, and converts each line into Markdown blockquote syntax (`> ...`).
 * If the generated blockquote is not already present in the Markdown (checked by substring match),
 * it appends the blockquote to the Markdown string.
 *
 * @param markdown - The original Markdown string to be improved.
 * @param originalHtml - The HTML string containing potential blockquotes to parse.
 * @returns The improved Markdown string with additional blockquotes appended if found in the HTML.
 */
function improveBlockquoteParsing(markdown: string, originalHtml: string): string {
    const blockquoteMatches = originalHtml.match(BLOCKQUOTE_REGEX);

    if (!blockquoteMatches) {
        return markdown;
    }

    for (const blockquoteHtml of blockquoteMatches) {
        // Extract inner content of blockquote
        const innerContent = blockquoteHtml
            .replace(/<blockquote[^>]*>/, '')
            .replace(/<\/blockquote>/, '');

        // Remove all HTML tags and trim whitespace
        const plainText = innerContent.replace(/<[^>]+>/g, '').trim();

        if (!plainText) {
            continue;
        }

        // Convert each line to Markdown blockquote format
        const blockquoteMd = plainText
            .split('\n')
            .map(line => line.trim() ? `> ${line.trim()}` : '>')
            .join('\n');

        // Only append if not already present in markdown
        if (!markdown.includes(blockquoteMd.substring(0, 50))) {
            markdown += `\n\n${blockquoteMd}\n`;
        }
    }

    return markdown;
}

// Pre-compiled regex for standalone images between blank lines
const STANDALONE_IMAGE_PATTERN = /(\n\s*\n)\s*(!?\[[^\]]*\]\([^)]+\))\s*(\n\s*\n)/g;

/**
 * Centers standalone images in the provided Markdown string by wrapping them in a <div align="center">.
 * Images with alt text longer than 50 characters are not centered.
 *
 * @param markdown - The Markdown string to process.
 * @returns The Markdown string with standalone images centered, except those with detailed alt text.
 */
function centerStandaloneImages(markdown: string): string {
    return markdown.replace(STANDALONE_IMAGE_PATTERN, (fullMatch, before, imageMarkdown, after) => {
        return `${before}<div align="center">\n\n${imageMarkdown}\n\n</div>${after}`;
    });
}

const ESCAPE_REGEXP_REGEX = /[.*+?^${}()|[\]\\]/g;

/**
 * Escapes special characters in a string to be used safely within a regular expression.
 *
 * This function replaces characters that have special meaning in regular expressions
 * (such as `.`, `*`, `+`, `?`, `^`, `$`, `{`, `}`, `(`, `)`, `|`, `[`, `]`, `\`)
 * with their escaped counterparts.
 *
 * @param string - The input string to escape.
 * @returns The escaped string, safe for use in regular expressions.
 */
function escapeRegExp(string: string): string {
    return string.replace(ESCAPE_REGEXP_REGEX, '\\$&');
}

/**
 * Checks if a note exists in the Obsidian vault by verifying if a link path destination can be resolved.
 *
 * @param noteName - The name of the note to check for existence in the vault.
 * @param sourcePath - (Optional) The source path from which to resolve the link. Defaults to an empty string.
 * @returns `true` if the note exists in the vault, otherwise `false`.
 */
function isInVault(noteName: string, sourcePath: string = ""): boolean {
    return !!app.metadataCache.getFirstLinkpathDest(noteName, sourcePath);
}

/**
 * Copies the provided content string to the clipboard.
 *
 * @param content - The string content to copy to the clipboard.
 * @param success - Optional callback invoked on successful copy. Defaults to showing a "Copied to clipboard" notice.
 * @param failure - Optional callback invoked if the copy fails. Defaults to showing a failure notice and logging the reason.
 * @returns A Promise that resolves when the copy operation completes.
 */
export async function copy(
    content: string,
    success: () => any = () => new Notice("Copied to clipboard"),
    failure: (reason?: any) => any = (reason) => {
        new Notice("Could not copy to clipboard");
        console.log({ reason });
    }
) {
    await navigator.clipboard.writeText(content).then(success, failure);
}

/**
 * Converts a raw `RssFeedItem` object into an `Item` object with getter and setter methods.
 *
 * Each property of the returned `Item` is accessed via a function, allowing for dynamic retrieval and mutation of values.
 * Setter methods are provided for properties that can be updated, such as `markStarred`, `markRead`, `setTags`, and `markCreated`.
 *
 * @param raw - The raw RSS feed item to convert.
 * @returns An `Item` object with methods to access and modify its properties.
 */
export function toItem(raw: RssFeedItem): Item {
    return {
        id: () => raw.id,
        guid: () => raw.id,
        guidHash: () => raw.hash,
        url: () => raw.link,
        title: () => raw.title,
        author: () => raw.creator,
        pubDate: () => raw.pubDate,
        body: () => raw.content,
        description: () => raw.description,
        feedId: () => 0,
        read: () => !!raw.read,
        starred: () => !!raw.favorite,
        rtl: () => false,
        mediaThumbnail: () => raw.image,
        mediaDescription: () => raw.description,
        enclosureMime: () => raw.enclosureType,
        enclosureLink: () => raw.enclosure,
        markStarred: (starred: boolean) => { raw.favorite = starred; },
        markRead: (read: boolean) => { raw.read = read; },
        tags: () => raw.tags || [],
        setTags: (tags: string[]) => { raw.tags = tags; },
        created: () => !!raw.created,
        markCreated: (created: boolean) => { raw.created = created; },
        language: () => raw.language,
        highlights: () => raw.highlights || [],
        folder: () => raw.folder,
        feed: () => raw.feed,
    };
}

/**
 * Converts a raw `RssFeedContent` object into a `Feed` object with computed properties.
 *
 * @param raw - The raw RSS feed content to transform.
 * @returns A `Feed` object with properties derived from the raw feed content.
 */
export function toFeed(raw: RssFeedContent): Feed {
    return {
        id: () => 0,
        url: () => raw.link,
        title: () => raw.title,
        name: () => raw.name,
        favicon: () => raw.image,
        unreadCount: () => raw.items.filter(i => !i.read).length,
        ordering: () => 0,
        link: () => raw.link,
        folderId: () => 0,
        folderName: () => raw.folder,
        items: () => raw.items.map(toItem),
    };
}