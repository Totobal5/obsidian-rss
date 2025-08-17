// Minimal mock for svelte/store get function used in TagModal during tests
export function get(store: any): any { return store && store.__value !== undefined ? store.__value : store; }
export function writable(init:any){ let v=init; return { set(val:any){v=val;}, update(fn:(x:any)=>any){v=fn(v);}, subscribe(cb:(x:any)=>void){cb(v); return ()=>{}; }, __value:v}; }
