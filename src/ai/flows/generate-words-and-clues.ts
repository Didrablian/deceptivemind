
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
  targetWord: z.string().describe('The selected target word. This word should be simple and commonly known (e.g., "NASA", "apple", "car").'),
  words: z.array(z.string()).describe('The list of generated words. All words should be simple, commonly known, and distinct from each other (e.g., "sun", "book", "Elon Musk").'),
  helperClue: z.string().describe('A simple, indirect clue for the helper, related to the target word. Avoid jargon. Think of concepts like "space travel" for "NASA", or "electric cars" for "Elon Musk". Ensure this clue is distinct from the clue holder clue.'),
  clueHolderClue: z
    .string()
    .describe('A simple, indirect clue for the clue holder, related to the target word, and different from the helper clue. Avoid jargon. Ensure this clue is distinct from the helper clue.'),
});
export type GenerateWordsAndCluesOutput = z.infer<typeof GenerateWordsAndCluesOutputSchema>;

export async function generateWordsAndClues(input: GenerateWordsAndCluesInput): Promise<GenerateWordsAndCluesOutput> {
  return generateWordsAndCluesFlow(input);
}

const generateWordsAndCluesPrompt = ai.definePrompt({
  name: 'generateWordsAndCluesPrompt',
  input: {schema: GenerateWordsAndCluesInputSchema},
  output: {schema: GenerateWordsAndCluesOutputSchema},
  prompt: `Generate {{numberOfWords}} distinct and unrelated words. These words should be simple, common, and easily understandable by a general audience (e.g., 'apple', 'car', 'sun', 'book', 'NASA', 'coffee', 'ocean'). Generate a fresh and diverse set of words each time.
Select one of these words as the target word.
Create an indirect clue related to the target word for the helper. The clue should be simple and avoid jargon. For example, if the target word is 'NASA', a clue could be 'related to rockets and space exploration'. If the target is 'Musk', a clue could be 'associated with electric vehicles and space'.
Create another indirect clue, different from the helper's, related to the target word, for the clue holder. This clue should also be simple and avoid jargon.

Make sure the helper clue and clue holder clue are substantially different and offer unique perspectives if possible.

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
      prompt: `Generate ${numberOfWords} distinct and unrelated words. The words should be simple, common, and easily understandable by a general audience (e.g., 'house', 'tree', 'water', 'friend', 'moon', 'company', 'inventor'). Generate a fresh and diverse set of words each time. Return them as a comma separated list.`,
    });
    const words = text!.split(',').map(word => word.trim());

    // Select target word - for now just pick the first one generated if AI doesn't specify in structured output later
    const targetWord = words.length > 0 ? words[0] : "default_target"; // Fallback if words list is empty

    const {output} = await generateWordsAndCluesPrompt({
      ...input,
      words, // Pass the generated words to the main prompt
      targetWord, // Pass an initial target, it might be refined by the prompt
      helperClue: '', // These will be populated by the prompt, but need to exist.
      clueHolderClue: '', // These will be populated by the prompt, but need to exist.
    });

    // Ensure the output has the target word from the list (or the one LLM picked)
    // And ensure the words list in the output matches the generated/selected ones
    if (output) {
        if (!output.words || output.words.length === 0 || !output.words.includes(output.targetWord)){
            // If AI output is problematic with words/target, try to fix it.
            output.words = words;
            if (words.length > 0 && !words.includes(output.targetWord)) {
                output.targetWord = words[0]; // Fallback if AI's targetWord is weird or not in its own list
            } else if (words.length === 0 && output.targetWord === "default_target") {
                 output.targetWord = "ErrorWord"; // Indicate a problem if no words were generated
            }
        }
    } else {
        // If the entire output is null, this is a bigger issue.
        // For now, we'll return a structured error or default, but ideally, this would be handled by retries or alerts.
        return {
            targetWord: "Error - No AI Output",
            words: words.length > 0 ? words : ["Error"],
            helperClue: "Error - No AI Output",
            clueHolderClue: "Error - No AI Output",
        };
    }

    return output!;
  }
);
