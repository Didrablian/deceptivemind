
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
  words: z.array(z.string()).describe('The list of generated words. All words should be simple, commonly known, and distinct from each other (e.g., "sun", "book", "Elon Musk"). Each word should be a single common noun, proper noun, or a very short common phrase (max 2 words like "ice cream"). Avoid full sentences or questions.'),
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
  prompt: `You are an assistant that generates words and clues for a social deduction game.
Your task is to:
1. Generate exactly {{numberOfWords}} distinct and unrelated words.
   - These words MUST be simple, common, and easily understandable by a general audience (e.g., 'apple', 'car', 'sun', 'book', 'NASA', 'coffee', 'ocean', 'dog', 'house').
   - Each word should be a single common noun, proper noun, or a very short common phrase (max 2 words, e.g., "ice cream"). Avoid sentences, questions, or complex descriptions for the words themselves.
   - Ensure the words are fresh and diverse. Do not repeat words from previous requests if possible.
2. Select one of these generated words as the 'targetWord'. This target word should also be simple and commonly known from the list you just generated.
3. Create an indirect clue for a 'helper'. This clue should be related to the 'targetWord', simple, avoid jargon, and not directly give away the targetWord. (e.g., if targetWord is 'NASA', clue could be 'related to rockets and space exploration').
4. Create another indirect clue for a 'clueHolder', different from the helper's clue. This clue should also be related to the 'targetWord', simple, avoid jargon, and distinct from the helper's clue.

Respond STRICTLY with a JSON object matching the output schema.
`,
});

const generateWordsAndCluesFlow = ai.defineFlow(
  {
    name: 'generateWordsAndCluesFlow',
    inputSchema: GenerateWordsAndCluesInputSchema,
    outputSchema: GenerateWordsAndCluesOutputSchema,
  },
  async (input: GenerateWordsAndCluesInput): Promise<GenerateWordsAndCluesOutput> => {
    let aiCallOutput: GenerateWordsAndCluesOutput | null = null;

    try {
      const result = await generateWordsAndCluesPrompt(input);
      aiCallOutput = result.output;
    } catch (e) {
      console.error("Error calling generateWordsAndCluesPrompt or parsing its output:", e);
      // aiCallOutput remains null, will trigger the fallback logic below
    }

    if (!aiCallOutput || !aiCallOutput.words || !aiCallOutput.targetWord || !aiCallOutput.helperClue || !aiCallOutput.clueHolderClue) {
      console.warn("AI output missing crucial fields or AI call failed. Using fallback.", aiCallOutput);
      const fallbackWords = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew", "kiwi"];
      const fallbackTarget = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
      return {
          words: fallbackWords,
          targetWord: fallbackTarget,
          helperClue: `A common fruit, often ${fallbackTarget === 'apple' ? 'red or green' : 'yellow and curved'}.`,
          clueHolderClue: `Think about what monkeys like, or what keeps the doctor away.`,
      };
    }

    // Cleanup individual words and the target word from aiCallOutput
    const cleanedWords = aiCallOutput.words.map(word =>
      word
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '') // Remove leading/trailing unwanted chars but keep spaces, hyphens, apostrophes internally
        .replace(/\s+/g, ' ') // Normalize multiple spaces to one
    ).filter(word => word.length > 1 && word.length < 30 && !word.includes('\n') && word.split(' ').length <= 3); // Sanity filter: length, no newlines, max 3 "sub-words"

    let finalTargetWord = aiCallOutput.targetWord
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '')
        .replace(/\s+/g, ' ');

    if (cleanedWords.length === 0) {
        console.error("AI generated an empty or invalid list of words after cleaning. Using secondary fallback.");
         const fallbackWords = ["cat", "dog", "sun", "moon", "star", "tree", "house", "car", "book"];
         finalTargetWord = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
         return {
             words: fallbackWords,
             targetWord: finalTargetWord,
             helperClue: "A common household pet.",
             clueHolderClue: "Man's best friend or a feline companion.",
         };
    }
    
    // Ensure targetWord is valid and from the cleaned list
    const targetExistsInCleaned = cleanedWords.some(w => w.toLowerCase() === finalTargetWord.toLowerCase());
    if (!targetExistsInCleaned || finalTargetWord.length < 1 || finalTargetWord.length > 30) {
        console.warn(`AI's targetWord "${aiCallOutput.targetWord}" (cleaned: "${finalTargetWord}") was not in its generated cleaned word list or was invalid. Falling back to the first cleaned word.`);
        finalTargetWord = cleanedWords[0]; 
    } else {
        // Ensure consistent casing if a match was found
        finalTargetWord = cleanedWords.find(w => w.toLowerCase() === finalTargetWord.toLowerCase()) || finalTargetWord;
    }
    
    // Ensure we have the correct number of words, supplementing if necessary after cleaning
    let finalWords = [...new Set(cleanedWords.filter(w => w.length > 0))]; // Ensure uniqueness and non-empty
    
    if (finalWords.length < (input.numberOfWords || 9)) {
        console.warn(`AI generated only ${finalWords.length} valid words after cleaning. Attempting to supplement.`);
        const needed = (input.numberOfWords || 9) - finalWords.length;
        // Ensure supplement words are distinct from existing finalWords
        const baseSupplement = ["cloud", "river", "mountain", "pencil", "phone", "game", "music", "light", "dream", "flower", "ocean", "star", "planet", "coffee", "tea"];
        const supplementToAdd = baseSupplement.filter(s => !finalWords.some(fw => fw.toLowerCase() === s.toLowerCase())).slice(0, needed);
        finalWords.push(...supplementToAdd);
    }
    // Ensure final list is exactly the required number, and target word is in it
    finalWords = finalWords.slice(0, (input.numberOfWords || 9));
    if (!finalWords.some(w => w.toLowerCase() === finalTargetWord.toLowerCase())) {
        if (finalWords.length > 0) {
            console.warn(`Target word "${finalTargetWord}" was not in the final list after supplementation. Replacing a word.`);
            finalWords[finalWords.length -1] = finalTargetWord; // Replace last word to ensure target is present
        } else { // Should be extremely rare, means all fallbacks failed
             console.error("Catastrophic failure in word generation, returning absolute minimum fallback.");
             finalWords = [finalTargetWord, "backup1", "backup2", "backup3", "backup4", "backup5", "backup6", "backup7", "backup8"].slice(0,9);
        }
    }


    return {
      words: finalWords,
      targetWord: finalTargetWord,
      helperClue: aiCallOutput.helperClue, // Use clues from original successful AI output
      clueHolderClue: aiCallOutput.clueHolderClue,
    };
  }
);
