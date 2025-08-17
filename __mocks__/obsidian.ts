import "isomorphic-fetch";
import "fs";
import * as fs from "fs";
import * as path from "path";

export interface RequestParam {
    url: string;
    method?: string;
    contentType?: string;
    body?: string;
    headers?: Record<string, string>;
}

// Basic helpers required by code under test
export class Notice {
    message: string;
    constructor(message: string) { this.message = message; }
}

export function htmlToMarkdown(html: string): string { return html; }

export async function request(request: RequestParam) : Promise<string> {
    if(!request.url.startsWith("http")) {
        const filePath = path.join(__dirname, request.url);
        return fs.readFileSync(filePath, 'utf-8');
    }
    const result = await fetch(request.url,{
        headers: request.headers,
        method: request.method,
        body: request.body
    });
    return result.text();
}

// Minimal stubs so importing 'obsidian' from other modules doesn't explode in tests
export class Plugin {}
export class Modal {}
export class ButtonComponent {}
export class ItemView {}
export class WorkspaceLeaf {}
