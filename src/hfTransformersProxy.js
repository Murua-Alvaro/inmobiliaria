let modulePromise = null

async function loadTransformers() {
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0')
  }
  return modulePromise
}

export async function pipeline(...args) {
  const mod = await loadTransformers()
  return mod.pipeline(...args)
}
