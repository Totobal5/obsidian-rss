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
export class Modal {
        app: any = { workspace: { getLeavesOfType: (): any[] => [] } };
    modalEl: any;
    contentEl: any;
    scope: any = { register: ()=>{} };
    constructor(){
        this.modalEl = this._makeDiv();
        this.contentEl = this._makeDiv();
    }
    open(){}
    close(){}
    _makeDiv(){
        const el = document.createElement('div');
        el.addClass = (cls:string)=> { el.classList.add(cls); };
        (el as any).empty = ()=> { while(el.firstChild) el.removeChild(el.firstChild); };
        (el as any).createDiv = (cls?:string)=> {
            const d = document.createElement('div');
        if (cls) d.className = cls;
        (d as any).addClass = (...classes:string[])=> { classes.forEach(c=> d.classList.add(c)); };
        (d as any).toggleClass = (c:string,v?:boolean)=> { if(v===false) d.classList.remove(c); else d.classList.add(c); };
        (d as any).appendText = (text:string)=> d.appendChild(document.createTextNode(text));
        el.appendChild(d); return d;
        };
            (el as any).createEl = (tag: string, opts?: any)=> {
                const node: any = document.createElement(tag);
                // support legacy signature createEl('h3', 'className')
                if (typeof opts === 'string') node.className = opts;
                else if (opts?.cls) {
                    if (Array.isArray(opts.cls)) node.className = opts.cls.join(' '); else node.className = opts.cls;
                }
                if (opts?.text) node.textContent = opts.text;
                node.addClass = (cls:string)=> node.classList.add(cls);
                node.toggleClass = (cls:string, v?:boolean)=> { if (v===false) node.classList.remove(cls); else node.classList.add(cls); };
                node.appendText = (text:string)=> { node.appendChild(document.createTextNode(text)); };
                el.appendChild(node);
                return node;
            };
                (el as any).createSpan = (cls?: string)=> {
                    const span: any = document.createElement('span');
                    if (cls) span.className = cls;
                    span.addClass = (c:string)=> span.classList.add(c);
                    span.toggleClass = (c:string,v?:boolean)=> { if (v===false) span.classList.remove(c); else span.classList.add(c); };
                    span.appendText = (text:string)=> span.appendChild(document.createTextNode(text));
                    el.appendChild(span);
                    return span;
                };
        return el;
    }
}
export class ButtonComponent {
    buttonEl: any;
    constructor(parent?: HTMLElement){
        this.buttonEl = document.createElement('button');
        if (parent) parent.appendChild(this.buttonEl);
        this.buttonEl.toggleClass = (cls:string, v?:boolean)=> {
            if (v===false) this.buttonEl.classList.remove(cls); else this.buttonEl.classList.add(cls);
        };
        this.buttonEl.addClass = (cls:string)=> { this.buttonEl.classList.add(cls); };
    }
    setIcon(_:string){ return this; }
    setTooltip(_:string){ return this; }
    onClick(cb: ()=>void){ this.buttonEl.addEventListener('click', cb); return this; }
}
export class ItemView {}
export class WorkspaceLeaf {}

export const MarkdownRenderer = {
    renderMarkdown: async (markdown: string, el: HTMLElement) => {
        const pre = document.createElement('pre');
        pre.className = 'rendered-markdown';
        pre.textContent = markdown.slice(0, 500);
        el.appendChild(pre);
        return Promise.resolve();
    }
};
