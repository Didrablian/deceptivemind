
import {genkit} from 'genkit';
import openAI from 'genkitx-openai';
import {config} from 'dotenv';

config(); // Make sure environment variables are loaded

export const ai = genkit({
  plugins: [
    openAI({ 
      apiKey: process.env.OPENAI_API_KEY,
    }),
  ],
  // Default text model for Genkit's ai.generate() for text tasks
  model: 'openai/gpt-4o-mini', 
});
