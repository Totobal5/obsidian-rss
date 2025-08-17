import {request} from "obsidian";
import type {RssFeed} from "../settings/settings";
import {Md5} from "ts-md5";

/**
 * parser for .rss files, build from scratch
 * because I could not find a parser that
 * - works on mobile
 * - is up-to-date
 * - works for multiple different interpretations of the rss spec
 */

export interface RssFeedContent {
    subtitle: string,
    title: string,
    name: string,
    link: string,
    image: string,
    folder: string,
    description: string,
    language: string,
    hash: string,
    items: RssFeedItem[]
}

export interface RssFeedItem {
    title: string,
    description: string,
    content: string,
    category: string,
    link: string,
    creator: string,
    language: string,
    enclosure: string,
    enclosureType: string,
    image: string,
    pubDate: string,
    folder: string,
    feed: string,
    favorite: boolean,
    read: boolean,
    created: boolean,
    visited: boolean,
    tags: string[],
    hash: string,
    id: string,
    highlights: string[],
}

/**
 * return the node with the specified name
 * : to get namespaced element
 * . to get nested element
 * @param element
 * @param name
 */
function getElementByName(element: Element | Document, name: string): ChildNode {
    let value: ChildNode;
    if (typeof element.getElementsByTagName !== 'function' && typeof element.getElementsByTagNameNS !== 'function') {
        //the required methods do not exist on element, aborting
        return;
    }

    if (name.includes(":")) {
        const [namespace, tag] = name.split(":");
        const namespaceUri = element.lookupNamespaceURI(namespace);
        const byNamespace = element.getElementsByTagNameNS(namespaceUri, tag);
        if (byNamespace.length > 0) {
            value = byNamespace[0].childNodes[0];
        } else {
            //there is no element in that namespace, probably because no namespace has been defined
            const tmp = element.getElementsByTagName(name);
            if (tmp.length > 0) {
                if (tmp[0].childNodes.length === 0) {
                    value = tmp[0];
                } else {
                    const node = tmp[0].childNodes[0];
                    if (node !== undefined) {
                        value = node;
                    }
                }
            }
        }

    } else if (name.includes(".")) {
        const [prefix, tag] = name.split(".");
        if (element.getElementsByTagName(prefix).length > 0) {
            const nodes = Array.from(element.getElementsByTagName(prefix)[0].childNodes);
            nodes.forEach((node) => {
                if (node.nodeName == tag) {
                    value = node;
                }
            });
        }

    } else if (element.getElementsByTagName(name).length > 0) {
        if (element.getElementsByTagName(name)[0].childNodes.length == 0) {
            value = element.getElementsByTagName(name)[0];
        } else {
            const node = element.getElementsByTagName(name)[0].childNodes[0];
            if (node !== undefined)
                value = node;
        }
    }
    //if(name === "content") console.log(value);

    return value;
}

/**
 * # to get attribute
 * Always returns the last found value for names
 * @param element
 * @param names possible names
 */
function getContent(element: Element | Document, names: string[]): string {
    let value: string;
    for (const name of names) {
        if (name.includes("#")) {
            const [elementName, attr] = name.split("#");
            const data = getElementByName(element, elementName);
            if (data) {
                if (data.nodeName === elementName) {
                    const tmp = (data as Element).getAttribute?.(attr);
                    if (tmp && tmp.length > 0) {
                        value = tmp;
                    }
                }
            }
        } else {
            const data = getElementByName(element, name);
            if (data) {
                const textNode = data as any;
                if(textNode.wholeText && textNode.wholeText.length > 0) {
                    value = textNode.wholeText;
                }

                if (!value && textNode.nodeValue && textNode.nodeValue.length > 0) {
                    value = textNode.nodeValue;
                }
                if (!value && textNode.innerHTML && textNode.innerHTML.length > 0) {
                    value = textNode.innerHTML;
                }
            }
        }
    }
    if (value === undefined) {
        return "";
    }
    return value;
}

function buildItem(element: Element): RssFeedItem {
    return {
        title: getContent(element, ["title"]),
        description: getContent(element, ["content", "content:encoded", "itunes:summary", "description", "summary", "media:description"]),
        content: getContent(element, ["itunes:summary", "description", "summary", "media:description", "content", "content:encoded", "ns0:encoded"]),
        category: getContent(element, ["category"]),
        link: getContent(element, ["link", "link#href"]),
        creator: getContent(element, ["creator", "dc:creator", "author", "author.name"]),
        pubDate: getContent(element, ["pubDate", "published", "updated", "dc:date"]),
        enclosure: getContent(element, ["enclosure#url", "yt:videoId"]),
        enclosureType: getContent(element, ["enclosure#type"]),
        image: getContent(element, ["enclosure#url", "media:content#url", "itunes:image#href", "media:thumbnail#url"]),
        id: getContent(element, ["id"]),
        language: null,
        folder: null,
        feed: null,
        read: null,
        favorite: null,
        created: null,
    visited: null,
        tags: [],
        hash: null,
        highlights: []
    }
}

function getAllItems(doc: Document): Element[] {
    const items: Element[] = [];

    if (doc.getElementsByTagName("item")) {
        for (const elementsByTagNameKey in doc.getElementsByTagName("item")) {
            const entry = doc.getElementsByTagName("item")[elementsByTagNameKey];
            items.push(entry);

        }
    }
    if (doc.getElementsByTagName("entry")) {
        for (const elementsByTagNameKey in doc.getElementsByTagName("entry")) {
            const entry = doc.getElementsByTagName("entry")[elementsByTagNameKey];
            items.push(entry);
        }
    }
    return items;
}

async function requestFeed(feed: RssFeed, signal?: AbortSignal) : Promise<string> {
    if (signal?.aborted) throw new DOMException('Aborted','AbortError');
    return await request({url: feed.url});
}

// Timeout + abort aware fetch
async function requestFeedWithTimeout(feed: RssFeed, timeoutMs = 10000, signal?: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const to = setTimeout(()=> reject(new Error(`Timeout after ${timeoutMs}ms for feed: ${feed.name}`)), timeoutMs);
        const abortHandler = () => {
            clearTimeout(to);
            reject(new DOMException('Aborted','AbortError'));
        };
        signal?.addEventListener('abort', abortHandler, {once:true});
        requestFeed(feed, signal).then(str=> {clearTimeout(to); resolve(str);}, err=> {clearTimeout(to); reject(err);});
    });
}

export async function getFeedItems(feed: RssFeed, opts?: { signal?: AbortSignal }): Promise<RssFeedContent | undefined> {
    let data;
    try {
        const rawData = await requestFeedWithTimeout(feed, 10000, opts?.signal);
        data = new window.DOMParser().parseFromString(rawData, "text/xml");
    } catch (e) {
        console.error(`❌ Feed "${feed.name}" failed:`, e);
        return Promise.resolve(undefined);
    }


    const items: RssFeedItem[] = [];
    const rawItems = getAllItems(data);

    const language = getContent(data, ["language"]).substr(0, 2);

    rawItems.forEach((rawItem) => {
        const item = buildItem(rawItem);
        if (item.title !== undefined && item.title.length !== 0) {
            item.folder = feed.folder;
            item.feed = feed.name;
            item.read = false;
            item.favorite = false;
            item.created = false;
            item.visited = false;
            item.language = language;
            item.hash = <string>new Md5().appendStr(item.title).appendStr(item.folder).appendStr(item.link).end();

            if (!item.image && feed.url.includes("youtube.com/feeds")) {
                item.image = "https://i3.ytimg.com/vi/" + item.id.split(":")[2] + "/hqdefault.jpg";
            }

            items.push(item);
        }
    })
    const image = getContent(data, ["image", "image.url", "icon"]);

    // If document is not a valid RSS/Atom (no title + no items) treat as invalid
    const titleCandidate = getContent(data, ["title"]);
    if ((!titleCandidate || titleCandidate.length === 0) && rawItems.length === 0) {
        return undefined;
    }

    const content: RssFeedContent = {
        title: getContent(data, ["title"]),
        subtitle: getContent(data, ["subtitle"]),
        link: getContent(data, ["link"]),
        //we don't want any leading or trailing slashes in image urls(i.e. reddit does that)
        image: image ? image.replace(/^\/|\/$/g, '') : null,
        description: getContent(data, ["description"]),
        items: items,
        folder: feed.folder,
        name: feed.name,
        language: language,
        hash: "",
    };

    return Promise.resolve(content);
}
