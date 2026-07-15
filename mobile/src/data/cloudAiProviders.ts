export type CloudProviderId =
  | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'cerebras' | 'openrouter'
  | 'xai' | 'deepseek' | 'mistral'

export type CapabilityState = 'available' | 'model_dependent' | 'proxy_required' | 'unsupported'

export type CloudCapabilities = {
  chat: CapabilityState
  liveAnalysis: CapabilityState
  tools: CapabilityState
  vision: CapabilityState
  image: CapabilityState
  voice: CapabilityState
}

export type CloudProvider = {
  id: CloudProviderId
  title: string
  company: string
  apiStyle: 'openai' | 'anthropic' | 'gemini'
  baseUrl: string
  modelsUrl: string
  keyUrl: string
  docsUrl: string
  capabilities: CloudCapabilities
}

export type CloudModel = {
  id: string
  name: string
  contextLength: number | null
  free: boolean
  priceLabel: string
  capabilities: string[]
}

export type CloudModelConfig = {
  providerId: CloudProviderId
  modelId: string
  modelName: string
}

export const cloudProviders: CloudProvider[] = [
  {
    id: 'openai',
    title: 'OpenAI',
    company: 'ChatGPT API',
    apiStyle: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'model_dependent', voice: 'proxy_required' },
  },
  {
    id: 'anthropic',
    title: 'Anthropic',
    company: 'Claude API',
    apiStyle: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://platform.claude.com/docs/en/api/overview',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'unsupported', voice: 'unsupported' },
  },
  {
    id: 'gemini',
    title: 'Google Gemini',
    company: 'Gemini API',
    apiStyle: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyUrl: 'https://aistudio.google.com/api-keys',
    docsUrl: 'https://ai.google.dev/api',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'model_dependent', voice: 'proxy_required' },
  },
  {
    id: 'groq',
    title: 'Groq',
    company: 'GroqCloud',
    apiStyle: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    keyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/api-reference',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'unsupported', voice: 'model_dependent' },
  },
  {
    id: 'cerebras',
    title: 'Cerebras',
    company: 'Cerebras Inference',
    apiStyle: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    modelsUrl: 'https://api.cerebras.ai/v1/models',
    keyUrl: 'https://cloud.cerebras.ai/',
    docsUrl: 'https://inference-docs.cerebras.ai/',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'unsupported', voice: 'unsupported' },
  },
  {
    id: 'openrouter',
    title: 'OpenRouter',
    company: 'Multi-provider API',
    apiStyle: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models?output_modalities=text',
    keyUrl: 'https://openrouter.ai/settings/keys',
    docsUrl: 'https://openrouter.ai/docs/api/reference/overview',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'model_dependent', voice: 'model_dependent' },
  },
  {
    id: 'xai',
    title: 'xAI',
    company: 'Grok API',
    apiStyle: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    modelsUrl: 'https://api.x.ai/v1/models',
    keyUrl: 'https://console.x.ai/',
    docsUrl: 'https://docs.x.ai/developers/rest-api-reference/inference/chat',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'model_dependent', voice: 'model_dependent' },
  },
  {
    id: 'deepseek',
    title: 'DeepSeek',
    company: 'DeepSeek API',
    apiStyle: 'openai',
    baseUrl: 'https://api.deepseek.com',
    modelsUrl: 'https://api.deepseek.com/models',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'unsupported', image: 'unsupported', voice: 'unsupported' },
  },
  {
    id: 'mistral',
    title: 'Mistral',
    company: 'Mistral AI API',
    apiStyle: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    modelsUrl: 'https://api.mistral.ai/v1/models',
    keyUrl: 'https://console.mistral.ai/api-keys',
    docsUrl: 'https://docs.mistral.ai/api/endpoint/models',
    capabilities: { chat: 'available', liveAnalysis: 'available', tools: 'model_dependent', vision: 'model_dependent', image: 'unsupported', voice: 'unsupported' },
  },
]

export const cloudProviderById = Object.fromEntries(
  cloudProviders.map((provider) => [provider.id, provider]),
) as Record<CloudProviderId, CloudProvider>

export function isCloudModelConfig(value: unknown): value is CloudModelConfig {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CloudModelConfig>
  return cloudProviders.some((provider) => provider.id === item.providerId)
    && typeof item.modelId === 'string' && item.modelId.length > 0 && item.modelId.length <= 200
    && typeof item.modelName === 'string' && item.modelName.length > 0 && item.modelName.length <= 240
}
