
'use server';
/**
 * @fileOverview Generates a set of nine distinct words, selects one as the target word,
 * and creates an indirect clue related to the target word for the clue holder.
 * Words and clues should be simple, common, and easily understandable.
 *
 * - generateWordsAndClues - A function that generates words, a clue, and assigns a target word.
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
  clueHolderClue: z
    .string()
    .describe('A single, vague, one-word clue for the clue holder, related to the target word. This clue MUST be a single word. It should also plausibly relate to 2-3 other words in the generated words list to create ambiguity.'),
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
   - These words MUST be simple, common, and easily understandable by a general audience (e.g., 'apple', 'car', 'sun', 'book', 'NASA', 'coffee', 'ocean', 'dog', 'house', 'Elon Musk').
   - Each word should be a single common noun, proper noun, or a very short common phrase (max 2 words, e.g., "ice cream"). Avoid sentences, questions, or complex descriptions for the words themselves.
   - Ensure the words are fresh and diverse. Do not repeat words from previous requests if possible.
2. Select one of these generated words as the 'targetWord'. This target word should also be simple and commonly known from the list you just generated.
3. Create a single, vague, one-word clue for a 'clueHolder'.
   - This clue MUST be a single word.
   - It must be related to the 'targetWord'.
   - Crucially, this clue should also plausibly relate to 2-3 other words in the generated 'words' list to create ambiguity and act as red herrings.
   - Avoid direct synonyms of the targetWord for the clue. For example, if target is 'car', clue could be 'metal' (relates to car, but also maybe 'robot', 'bridge', 'statue' if they are in the list).

Respond STRICTLY with a JSON object matching the output schema. Ensure 'words' is an array of strings, 'targetWord' is a string, and 'clueHolderClue' is a single string (one word).
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
    
    if (!aiCallOutput || !aiCallOutput.words || !aiCallOutput.targetWord || !aiCallOutput.clueHolderClue) {
      console.warn("AI output missing crucial fields or AI call failed. Using fallback.", aiCallOutput);
      const fallbackWords = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew", "kiwi"];
      const fallbackTarget = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
      return {
          words: fallbackWords,
          targetWord: fallbackTarget,
          clueHolderClue: "Fruit", // Simple fallback clue
      };
    }

    // Cleanup individual words and the target word from aiCallOutput
    const cleanedWords = aiCallOutput.words.map(word =>
      word
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '') 
        .replace(/\s+/g, ' ') 
    ).filter(word => word.length > 1 && word.length < 30 && !word.includes('\n') && word.split(' ').length <= 3); 

    let finalTargetWord = aiCallOutput.targetWord
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '')
        .replace(/\s+/g, ' ');

    let finalClueHolderClue = aiCallOutput.clueHolderClue
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '')
        .replace(/\s+/g, ' ');
     // Ensure clue is a single word
    if (finalClueHolderClue.split(' ').length > 1) {
        console.warn(`AI generated a multi-word clueHolderClue "${aiCallOutput.clueHolderClue}". Taking the first word: "${finalClueHolderClue.split(' ')[0]}"`);
        finalClueHolderClue = finalClueHolderClue.split(' ')[0];
    }


    if (cleanedWords.length === 0) {
        console.error("AI generated an empty or invalid list of words after cleaning. Using secondary fallback.");
         const fallbackWords = ["cat", "dog", "sun", "moon", "star", "tree", "house", "car", "book"];
         finalTargetWord = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
         return {
             words: fallbackWords,
             targetWord: finalTargetWord,
             clueHolderClue: "Common",
         };
    }
    
    const targetExistsInCleaned = cleanedWords.some(w => w.toLowerCase() === finalTargetWord.toLowerCase());
    if (!targetExistsInCleaned || finalTargetWord.length < 1 || finalTargetWord.length > 30) {
        console.warn(`AI's targetWord "${aiCallOutput.targetWord}" (cleaned: "${finalTargetWord}") was not in its generated cleaned word list or was invalid. Falling back to the first cleaned word.`);
        finalTargetWord = cleanedWords[0]; 
    } else {
        finalTargetWord = cleanedWords.find(w => w.toLowerCase() === finalTargetWord.toLowerCase()) || finalTargetWord;
    }
    
    let finalWords = [...new Set(cleanedWords.filter(w => w.length > 0))]; 
    
    if (finalWords.length < (input.numberOfWords || 9)) {
        console.warn(`AI generated only ${finalWords.length} valid words after cleaning. Attempting to supplement.`);
        const needed = (input.numberOfWords || 9) - finalWords.length;
        const baseSupplement = ["cloud", "river", "mountain", "pencil", "phone", "game", "music", "light", "dream", "flower", "ocean", "star", "planet", "coffee", "tea"];
        const supplementToAdd = baseSupplement.filter(s => !finalWords.some(fw => fw.toLowerCase() === s.toLowerCase())).slice(0, needed);
        finalWords.push(...supplementToAdd);
    }
    finalWords = finalWords.slice(0, (input.numberOfWords || 9));
    if (!finalWords.some(w => w.toLowerCase() === finalTargetWord.toLowerCase())) {
        if (finalWords.length > 0) {
            console.warn(`Target word "${finalTargetWord}" was not in the final list after supplementation. Replacing a word.`);
            finalWords[finalWords.length -1] = finalTargetWord; 
        } else { 
             console.error("Catastrophic failure in word generation, returning absolute minimum fallback.");
             finalWords = [finalTargetWord, "backup1", "backup2", "backup3", "backup4", "backup5", "backup6", "backup7", "backup8"].slice(0,9);
        }
    }

    return {
      words: finalWords,
      targetWord: finalTargetWord,
      clueHolderClue: finalClueHolderClue,
    };
  }
);

    