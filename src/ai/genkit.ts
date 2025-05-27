
import {genkit} from 'genkit';
import {openai} from 'genkit/openai'; // Changed import path
import { config } from 'dotenv';

config(); // Make sure environment variables are loaded

export const ai = genkit({
  plugins: [
    openai({ // This function comes from 'genkit/openai' now
      apiKey: process.env.OPENAI_API_KEY,
      // organization: process.env.OPENAI_ORGANIZATION_ID, // Optional
    }),
  ],
  // Default text model for Genkit's ai.generate() for text tasks
  // Using gpt-4o-mini as it's fast and capable for these tasks.
  model: 'openai/gpt-4o-mini', 
});
