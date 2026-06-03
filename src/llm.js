// src/llm.js
import { GoogleGenAI } from '@google/genai';

export function getConfig(env = process.env) {
  return {
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  };
}

// Strip a leading/trailing ```json … ``` fence some models add despite responseMimeType:'application/json'.
// Pure + exported so the parse-defensive path is unit-testable without a network call.
export function stripFence(text) {
  const t = (text ?? '').trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

// Returns { model, generateJson(prompt, schema?) -> parsed JSON object }.
export function makeClient(config = getConfig()) {
  if (!config.apiKey) throw new Error('GEMINI_API_KEY is not set');
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  return {
    model: config.model,
    async generateJson(prompt, schema) {
      const call = () => ai.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          ...(schema ? { responseSchema: schema } : {}),
        },
      });
      // Parse defensively: strip a stray code fence, and retry ONCE if the first
      // response isn't valid JSON (flash models occasionally fence or truncate).
      let text = stripFence((await call()).text);
      try {
        return JSON.parse(text);
      } catch {
        text = stripFence((await call()).text);
        try {
          return JSON.parse(text);
        } catch {
          throw new Error(`Gemini returned non-JSON after retry: ${text.slice(0, 200)}`);
        }
      }
    },
  };
}
