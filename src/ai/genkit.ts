
import {genkit} from 'genkit';
import {openai} from 'genkit/openai'; // Attempting to import from main genkit package
import { config } from 'dotenv';

config(); // Make sure environment variables are loaded

export const ai = genkit({
  plugins: [
    openai({ // This function now comes from 'genkit/openai'
      apiKey: process.env.OPENAI_API_KEY,
    }),
  ],
  // Default text model for Genkit's ai.generate() for text tasks
  model: 'openai/gpt-4o-mini', 
});
