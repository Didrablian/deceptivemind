'use server';
/**
 * @fileOverview Generates a set of nine distinct words, selects one as the target word,
 * and creates indirect clues related to the target word for the clue holders and helper.
 *
 * - generateWordsAndClues - A function that generates words, clues, and assigns a target word.
 * - GenerateWordsAndCluesInput - The input type for the generateWordsAndClues function.
 * - GenerateWordsAndCluesOutput - The return type for the generateWordsAndClues function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateWordsAndCluesInputSchema = z.object({
  numberOfWords: z
    .number()
    .default(9)
    .describe('The number of distinct words to generate.'),
});
export type GenerateWordsAndCluesInput = z.infer<typeof GenerateWordsAndCluesInputSchema>;

const GenerateWordsAndCluesOutputSchema = z.object({
  targetWord: z.string().describe('The selected target word.'),
  words: z.array(z.string()).describe('The list of generated words.'),
  helperClue: z.string().describe('A clue for the helper, related to the target word.'),
  clueHolderClue: z
    .string()
    .describe('A clue for the clue holder, related to the target word.'),
});
export type GenerateWordsAndCluesOutput = z.infer<typeof GenerateWordsAndCluesOutputSchema>;

export async function generateWordsAndClues(input: GenerateWordsAndCluesInput): Promise<GenerateWordsAndCluesOutput> {
  return generateWordsAndCluesFlow(input);
}

const generateWordsAndCluesPrompt = ai.definePrompt({
  name: 'generateWordsAndCluesPrompt',
  input: {schema: GenerateWordsAndCluesInputSchema},
  output: {schema: GenerateWordsAndCluesOutputSchema},
  prompt: `Generate {{numberOfWords}} distinct words. Select one of these words as the target word. Create an indirect clue related to the target word for the helper. Create another indirect clue, different from the helper's, related to the target word, for the clue holder.

Words: {{words}}
Target Word: {{targetWord}}
Helper Clue: {{helperClue}}
Clue Holder Clue: {{clueHolderClue}}`,
});

const generateWordsAndCluesFlow = ai.defineFlow(
  {
    name: 'generateWordsAndCluesFlow',
    inputSchema: GenerateWordsAndCluesInputSchema,
    outputSchema: GenerateWordsAndCluesOutputSchema,
  },
  async input => {
    const numberOfWords = input.numberOfWords ?? 9;

    // Generate words using LLM
    const {text} = await ai.generate({
      prompt: `Generate ${numberOfWords} distinct and unrelated words. Return them as a comma separated list.`, //Simple prompt, no need for prompt object.
    });
    const words = text!.split(',').map(word => word.trim());

    // Select target word - for now just pick the first one
    const targetWord = words[0];

    const {output} = await generateWordsAndCluesPrompt({
      ...input,
      words,
      targetWord,
      helperClue: '', // These will be populated by the prompt, but need to exist.
      clueHolderClue: '', // These will be populated by the prompt, but need to exist.
    });

    return output!;
  }
);
