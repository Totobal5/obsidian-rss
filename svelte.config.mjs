import preprocess from 'svelte-preprocess';

const config = {
  preprocess: preprocess(),
  compilerOptions: {
    dev: true
  }
};

export default config;
