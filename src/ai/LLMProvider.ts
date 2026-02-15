import { LLMConnector } from './AgentBrain';

/**
 * LLM提供者 - 管理与大语言模型的连接
 * Manages connections to Large Language Models for AI agent decision making
 *
 * 支持多种LLM提供者: OpenAI, Anthropic, ZhipuAI(智谱), 本地模型等
 */

/** LLM提供者配置 */
export interface LLMProviderConfig {
  provider: 'openai' | 'anthropic' | 'zhipu' | 'local' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/** OpenAI兼容的LLM连接器 */
export class OpenAIConnector implements LLMConnector {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  async query(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7,
      }),
    });

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content || '[]';
  }

  getModel(): string {
    return `${this.config.provider}/${this.config.model}`;
  }
}

/** Anthropic Claude 连接器 */
export class AnthropicConnector implements LLMConnector {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  async query(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://api.anthropic.com/v1';

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens || 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json() as {
      content: Array<{ text: string }>;
    };
    return data.content[0]?.text || '[]';
  }

  getModel(): string {
    return `anthropic/${this.config.model}`;
  }
}

/** 智谱AI GLM 连接器 */
export class ZhipuConnector implements LLMConnector {
  private config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.config = config;
  }

  async query(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: '你是EchoWorld商业世界中的AI智能体。请根据当前状态做出决策，只返回JSON数组格式的行动列表，不要返回其他内容。',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[ZhipuAI] API error ${response.status}: ${errText}`);
      return '[]';
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content || '[]';
  }

  getModel(): string {
    return `zhipu/${this.config.model}`;
  }
}

/** 创建LLM连接器工厂 */
export function createLLMConnector(config: LLMProviderConfig): LLMConnector {
  switch (config.provider) {
    case 'openai':
    case 'local':
    case 'custom':
      return new OpenAIConnector(config);
    case 'anthropic':
      return new AnthropicConnector(config);
    case 'zhipu':
      return new ZhipuConnector(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}
