import { Brain } from "lucide-react";
import { DeepSeek, XAI, Gemini, MetaAI, OpenAI, Anthropic, MoonshotAi } from '@/assets/icons';

export const getProviderIcon = (provider: string) => {
  const iconMap: Record<string, JSX.Element>  = {
    'openai': <OpenAI size={14} />,
    'anthropic': <Anthropic size={14} />,
    'xai': <XAI size={14} />,
    'deepseek': <DeepSeek size={14} />,
    'google': <Gemini size={14} />,
    'moonshotai': <MoonshotAi size={14} />,
    'meta': <MetaAI size={14} />,
  };

  return iconMap[provider.toLowerCase()] || <Brain size={12} />; // fallback icon
};
