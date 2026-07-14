import { initLlama, type LlamaContext } from '@pocketpalai/llama.rn'

export const POCKETPAL_MODEL_FILE = 'voiceshield-pocketpal.gguf'
export const POCKETPAL_MIN_MODEL_BYTES = 100 * 1024 * 1024

const STOP_WORDS = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>']

export async function loadPocketPalModel(modelPath: string): Promise<LlamaContext> {
  return initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_batch: 256,
    n_threads: 4,
    n_gpu_layers: 0,
    use_mmap: true,
    use_mlock: false,
    flash_attn_type: 'off',
  })
}

export async function generatePocketPalResponse(
  context: LlamaContext,
  prompt: string,
  onToken: (token: string) => void,
): Promise<string> {
  const result = await context.completion({
    prompt,
    n_predict: 320,
    temperature: 0.2,
    top_p: 0.9,
    stop: STOP_WORDS,
  }, data => onToken(data.token))
  return result.text
}
