import "isomorphic-fetch";
import "fs";
import * as fs from "fs";
import * as path from "path";

// Augment HTMLElement minimally for test chain methods used in plugin
// Use module augmentation but keep methods optional; avoid re-exporting Node shape differences
declare global {
    interface HTMLElement {
        addClass?(cls: string): void;
        removeClass?(cls: string): void;
        toggleClass?(cls: string, v?: boolean): void;
        appendText?(text: string): void;
        createDiv?(opts?: any): any;
        createEl?(tag: string, opts?: any): any;
        createSpan?(cls?: string): any;
        empty?(): void;
        setText?(t: string): void;
    }
}

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
    (el as any).addClass = (cls:string)=> { el.classList.add(cls); };
    (el as any).removeClass = (cls:string)=> { el.classList.remove(cls); };
    (el as any).toggleClass = (c:string,v?:boolean)=> { if(v===false) el.classList.remove(c); else el.classList.add(c); };
    (el as any).appendText = (text:string)=> el.appendChild(document.createTextNode(text));
    (el as any).empty = ()=> { while(el.firstChild) el.removeChild(el.firstChild); };
    (el as any).setText = (t:string)=> { el.textContent = t; };
    (el as any).createDiv = (cls?:string)=> {
            const d = document.createElement('div');
        if (cls) d.className = cls;
        (d as any).addClass = (...classes:string[])=> { classes.forEach(c=> d.classList.add(c)); };
        (d as any).toggleClass = (c:string,v?:boolean)=> { if(v===false) d.classList.remove(c); else d.classList.add(c); };
        (d as any).appendText = (text:string)=> d.appendChild(document.createTextNode(text));
    el.appendChild(d as unknown as Node); return d;
        };
            (el as any).createEl = (tag: string, opts?: any)=> {
                const node: any = document.createElement(tag);
                // support legacy signature createEl('h3', 'className')
                if (typeof opts === 'string') node.className = opts;
                else if (opts?.cls) {
                    if (Array.isArray(opts.cls)) node.className = opts.cls.join(' '); else node.className = opts.cls;
                }
                if (opts?.text) node.textContent = opts.text;
                (node as any).addClass = (cls:string)=> node.classList.add(cls);
                (node as any).removeClass = (cls:string)=> node.classList.remove(cls);
                (node as any).toggleClass = (cls:string, v?:boolean)=> { if (v===false) node.classList.remove(cls); else node.classList.add(cls); };
                (node as any).appendText = (text:string)=> { node.appendChild(document.createTextNode(text)); };
            el.appendChild(node as unknown as Node);
                return node;
            };
                (el as any).createSpan = (cls?: string)=> {
                    const span: any = document.createElement('span');
                    if (cls) span.className = cls;
                    (span as any).addClass = (c:string)=> span.classList.add(c);
                    (span as any).removeClass = (c:string)=> span.classList.remove(c);
                    (span as any).toggleClass = (c:string,v?:boolean)=> { if (v===false) span.classList.remove(c); else span.classList.add(c); };
                    (span as any).appendText = (text:string)=> span.appendChild(document.createTextNode(text));
                    el.appendChild(span as unknown as Node);
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
export class Scope {
    register(_mods:any[] = [], _key?:string, _cb?:any){ /* noop */ }
}
export class App {
    vault:any; workspace:any; keymap:any; dom:any;
    constructor(){
        this.vault = { adapter: { exists:()=>false, remove:()=>{}, create:()=>{}, write:()=>{}, read:()=>'' } };
    this.workspace = { getLeavesOfType: (): any[] => [], trigger: (): void => {} };
        this.keymap = { pushScope: ()=>{}, popScope: ()=>{} };
        this.dom = { appContainerEl: document.body };
    }
}
export class Setting {
    controlEl: HTMLElement;
    constructor(public containerEl: HTMLElement){
        this.controlEl = document.createElement('div');
    containerEl.appendChild(this.controlEl as unknown as Node);
    }
    setName(_t:string){ return this; }
    setDesc(_t:string){ return this; }
    addButton(cb:(b: ButtonComponent)=>void){ const b=new ButtonComponent(this.controlEl); cb(b); return this; }
    addExtraButton(cb:(b: ButtonComponent)=>void){ const b=new ButtonComponent(this.controlEl); cb(b); return this; }
    addToggle(cb:(t:any)=>void){ const toggle={ onChange:(fn:(v:boolean)=>void)=>{ /* store if needed */ return toggle; } }; cb(toggle); return this; }
    addText(cb:(t:any)=>void){ const input=document.createElement('input'); const api={ inputEl: input, setValue:(v:string)=>api, onChange:(fn:(v:string)=>void)=>api }; cb(api); this.controlEl.appendChild(input as unknown as Node); return this; }
    addSearch(cb:(s:any)=>void){ const input=document.createElement('input'); const api={ inputEl: input, setValue:(v:string)=>api, setPlaceholder:(v:string)=>api, onChange:(fn:(v:string)=>void)=>api }; cb(api); this.controlEl.appendChild(input as unknown as Node); return this; }
}
// Additional UI component stubs
export class SearchComponent { inputEl: HTMLInputElement; constructor(container?: HTMLElement){ this.inputEl=document.createElement('input'); container?.appendChild(this.inputEl as unknown as Node);} setValue(_v:string){ return this; } setPlaceholder(_v:string){ return this; } onChange(_cb:(v:string)=>void){ return this; } }
export class DropdownComponent { selectEl: HTMLSelectElement; constructor(container?: HTMLElement){ this.selectEl=document.createElement('select'); container?.appendChild(this.selectEl as unknown as Node);} addOption(value:string, label:string){ const o=document.createElement('option'); o.value=value; o.textContent=label; this.selectEl.appendChild(o as unknown as Node); return this;} onChange(_cb:(v:string)=>void){ return this; } getValue(){ return this.selectEl.value; } setValue(v:string){ this.selectEl.value=v; return this; } }
export class ToggleComponent { toggleEl: HTMLInputElement; constructor(container?: HTMLElement){ this.toggleEl=document.createElement('input'); this.toggleEl.type='checkbox'; container?.appendChild(this.toggleEl as unknown as Node);} setValue(v:boolean){ this.toggleEl.checked=v; return this;} onChange(_cb:(v:boolean)=>void){ return this; } }

export class Menu {
    items: any[] = [];
    constructor(private _app?: any){}
    addItem(cb:(i:{ setTitle:(t:string)=>any; setIcon:(ic:string)=>any; onClick:(fn:()=>void)=>any })=>void){
        const item:any = { setTitle:()=>item, setIcon:()=>item, onClick:()=>item };
        cb(item); this.items.push(item); return this;
    }
    showAtMouseEvent(_evt?: any){ /* noop */ }
}

// sanitize HTML (very naive) used in HtmlTooltip
export function sanitizeHTMLToDom(html: string){ const div=document.createElement('div'); div.innerHTML = html; return div; }

// Suggest owner marker interface
export interface ISuggestOwner {}

// File system entity stubs
export class TAbstractFile { path: string=''; name: string=''; }
export class TFolder extends TAbstractFile { children: TAbstractFile[] = []; }

// Moment format & text area components for settings
export class MomentFormatComponent {
    inputEl: HTMLInputElement; sampleEl?: HTMLElement; defaultFormat: string='';
    constructor(){ this.inputEl=document.createElement('input'); }
    setDefaultFormat(f:string){ this.defaultFormat=f; return this; }
    setPlaceholder(_v:string){ return this; }
    setValue(_v:string){ return this; }
    onChange(_cb:(v:string)=>void){ return this; }
    setSampleEl(el: HTMLElement){ this.sampleEl = el; }
}
export class TextAreaComponent {
    inputEl: HTMLTextAreaElement;
    constructor(){ this.inputEl=document.createElement('textarea'); }
    setValue(_v:string){ return this; }
    setPlaceholder(_v:string){ return this; }
    onChange(_cb:(v:string)=>void){ return this; }
}

// Extend Setting with the specific adders used
(Setting.prototype as any).addMomentFormat = function(cb:(c:MomentFormatComponent)=>void){ const c=new MomentFormatComponent(); cb(c); return this; };
(Setting.prototype as any).addDropdown = function(cb:(c:DropdownComponent)=>void){ const d=new DropdownComponent(this.controlEl); cb(d); return this; };
(Setting.prototype as any).addTextArea = function(cb:(c:TextAreaComponent)=>void){ const t=new TextAreaComponent(); this.controlEl.appendChild(t.inputEl as unknown as Node); cb(t); return this; };
// Minimal AbstractTextComponent + TextComponent hierarchy for validation helpers
export class AbstractTextComponent<T=any> {
    inputEl: HTMLInputElement;
    constructor(){
        this.inputEl = document.createElement('input');
        (this.inputEl as any).addClass = (c:string)=> this.inputEl.classList.add(c);
        (this.inputEl as any).removeClass = (c:string)=> this.inputEl.classList.remove(c);
        (this.inputEl.parentElement as any)?.addClasses?.(()=>{});
    }
    setValue(_v:string){ return this; }
    onChange(_cb:(v:string)=>void){ return this; }
}
export class TextComponent extends AbstractTextComponent<string> {}
export class ItemView {}
export class WorkspaceLeaf {}

// Settings tab base class
export class PluginSettingTab {
    app: any; plugin: any; containerEl: HTMLElement;
    constructor(app:any, plugin:any){ this.app=app; this.plugin=plugin; this.containerEl=document.createElement('div'); }
    display(): void {}
    hide(): void {}
}

// Generic suggestion modal stub
export class SuggestModal<T> extends Modal {
    items: T[] = [];
    constructor(app:any){ super(); this.app = app; }
    getItems(): T[] { return this.items; }
    getSuggestions(query: string): T[] { return this.items; }
    renderSuggestion(_item: T, _el: HTMLElement) { }
    onChooseSuggestion(_item: T, _evt: any) { }
}

export const MarkdownRenderer = {
    renderMarkdown: async (markdown: string, el: HTMLElement) => {
        const pre = document.createElement('pre');
        pre.className = 'rendered-markdown';
        pre.textContent = markdown.slice(0, 500);
    el.appendChild(pre as unknown as Node);
        return Promise.resolve();
    }
};

// Minimal MarkdownView used in pasteToNote (editor API subset)
export class MarkdownView {
    editor: any;
    constructor(){
        this.editor = {
            replaceRange: (_text: string, _pos: any)=>{},
            getCursor: ()=>({ line: 0, ch: 0 })
        };
    }
}

// Simple path normalizer mirroring Obsidian's behavior on Windows paths
export function normalizePath(p: string): string {
    return p.replace(/\\+/g, '/');
}

// Extremely small moment-like helper supporting .format(pattern)
export const moment = (input?: any) => {
    const d = input ? new Date(input) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const api: any = {
        format: (fmt: string) => {
            if (!fmt) return d.toISOString();
            return fmt
                .replace(/YYYY/g, String(d.getFullYear()))
                .replace(/MM/g, pad(d.getMonth() + 1))
                .replace(/DD/g, pad(d.getDate()))
                .replace(/HH/g, pad(d.getHours()))
                .replace(/mm/g, pad(d.getMinutes()))
                .replace(/ss/g, pad(d.getSeconds()));
        }
    };
    return api;
};

// Code block post processor registry stub
export const MarkdownPreviewRenderer = {
    codeBlockPostProcessors: {} as Record<string, any>
};

// Icon helper stub
export function setIcon(el: HTMLElement, icon: string){
    if (el) el.setAttribute('data-icon', icon);
}
