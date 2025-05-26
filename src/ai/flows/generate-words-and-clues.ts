
'use server';
/**
 * @fileOverview Generates a set of nine distinct words, selects one as the target word,
 * and creates indirect clues related to the target word for the clue holders and helper.
 * Words and clues should be simple, common, and easily understandable.
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
  targetWord: z.string().describe('The selected target word. This word should be simple and commonly known.'),
  words: z.array(z.string()).describe('The list of generated words. All words should be simple and commonly known.'),
  helperClue: z.string().describe('A simple, indirect clue for the helper, related to the target word. Avoid jargon. Think of concepts like "space travel" for "NASA", or "electric cars" for "Elon Musk".'),
  clueHolderClue: z
    .string()
    .describe('A simple, indirect clue for the clue holder, related to the target word, and different from the helper clue. Avoid jargon.'),
});
export type GenerateWordsAndCluesOutput = z.infer<typeof GenerateWordsAndCluesOutputSchema>;

export async function generateWordsAndClues(input: GenerateWordsAndCluesInput): Promise<GenerateWordsAndCluesOutput> {
  return generateWordsAndCluesFlow(input);
}

const generateWordsAndCluesPrompt = ai.definePrompt({
  name: 'generateWordsAndCluesPrompt',
  input: {schema: GenerateWordsAndCluesInputSchema},
  output: {schema: GenerateWordsAndCluesOutputSchema},
  prompt: `Generate {{numberOfWords}} distinct words. These words should be simple, common, and easily understandable by a general audience (e.g., 'apple', 'car', 'sun', 'book').
Select one of these words as the target word.
Create an indirect clue related to the target word for the helper. The clue should be simple and avoid jargon. For example, if the target word is 'NASA', a clue could be 'related to rockets and space exploration'. If the target is 'Musk', a clue could be 'associated with electric vehicles and space'.
Create another indirect clue, different from the helper's, related to the target word, for the clue holder. This clue should also be simple and avoid jargon.

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
      prompt: `Generate ${numberOfWords} distinct and unrelated words. The words should be simple, common, and easily understandable by a general audience (e.g., 'house', 'tree', 'water', 'friend'). Return them as a comma separated list.`,
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

    // Ensure the output has the target word from the list (or the one LLM picked)
    // And ensure the words list in the output matches the generated/selected ones
    if (output) {
        if (!output.words || output.words.length === 0 || !output.words.includes(output.targetWord)){
            // If AI output is problematic with words/target, try to fix it.
            output.words = words;
            if (!words.includes(output.targetWord) && words.length > 0) {
                output.targetWord = words[0]; // Fallback if AI's targetWord is weird
            }
        }
    }


    return output!;
  }
);

