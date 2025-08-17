declare module '*.svelte' {
  // Use a unique identifier name to avoid clashing with Svelte's official type 'Comp'
  const SvelteComponentDev: any; // fallback any until proper typing added
  export default SvelteComponentDev;
}
