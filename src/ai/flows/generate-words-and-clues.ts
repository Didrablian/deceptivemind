
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
import type { AIGameDataOutput } from '@/lib/types';

const GenerateWordsAndCluesInputSchema = z.object({
  numberOfWords: z
    .number()
    .default(9)
    .describe('The number of distinct words to generate.'),
});
export type GenerateWordsAndCluesInput = z.infer<typeof GenerateWordsAndCluesInputSchema>;

const GenerateWordsAndCluesOutputSchema = z.object({
  targetWord: z.string().min(1).describe('The selected target word. This word should be simple and commonly known (e.g., "NASA", "apple", "car") and not an empty string.'),
  words: z.array(z.string().min(1)).min(1).describe('The list of generated words. All words should be simple, commonly known, and distinct from each other (e.g., "sun", "book", "Elon Musk"). Each word should be a single common noun, proper noun, or a very short common phrase (max 2 words like "ice cream"). Avoid full sentences or questions. Each word must not be an empty string. The list should contain exactly the number of words specified in the input.'),
  clueHolderClue: z
    .string().min(1)
    .describe('A single, vague, one-word clue for the clue holder, related to the target word. This clue MUST be a single word and not an empty string. It should also plausibly relate to 2-3 other words in the generated words list to create ambiguity.'),
});
export type GenerateWordsAndCluesOutput = z.infer<typeof GenerateWordsAndCluesOutputSchema>;


export async function generateWordsAndClues(input: GenerateWordsAndCluesInput): Promise<AIGameDataOutput> {
    const result = await generateWordsAndCluesFlow(input);
    // Convert GenerateWordsAndCluesOutput to AIGameDataOutput
    return {
        targetItemDescription: result.targetWord,
        items: result.words.map(word => ({ text: word })), // No imageUrl for words
        clueHolderClue: result.clueHolderClue,
    };
}

const generateWordsAndCluesPrompt = ai.definePrompt({
  name: 'generateWordsAndCluesPrompt',
  input: {schema: GenerateWordsAndCluesInputSchema},
  output: {schema: GenerateWordsAndCluesOutputSchema},
  prompt: `You are an assistant that generates words and clues for a social deduction game.
Your task is to:
1. Generate exactly {{numberOfWords}} distinct and unrelated words.
   - These words MUST be simple, common, and easily understandable by a general audience (e.g., 'apple', 'car', 'sun', 'book', 'NASA', 'coffee', 'ocean', 'dog', 'house', 'Elon Musk').
   - Each word should be a single common noun, proper noun, or a very short common phrase (max 2 words, e.g., "ice cream"). Avoid sentences, questions, or complex descriptions for the words themselves. Each word must not be an empty string.
   - Ensure the words are fresh and diverse. Do not repeat words from previous requests if possible.
2. Select one of these generated words as the 'targetWord'. This target word should also be simple and commonly known from the list you just generated and must not be an empty string.
3. Create a single, vague, one-word clue for a 'clueHolder'.
   - This clue MUST be a single word and not an empty string.
   - It must be related to the 'targetWord'.
   - Crucially, this clue should also plausibly relate to 2-3 other words in the generated 'words' list to create ambiguity and act as red herrings.
   - Avoid direct synonyms of the targetWord for the clue. For example, if target is 'car', clue could be 'metal' (relates to car, but also maybe 'robot', 'bridge', 'statue' if they are in the list).

Respond STRICTLY with a JSON object matching the output schema. Ensure 'words' is an array of non-empty strings, 'targetWord' is a non-empty string, and 'clueHolderClue' is a single non-empty string (one word).
Ensure the 'words' array contains exactly {{numberOfWords}} items.
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
    const fallbackWordsList = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew", "kiwi", "cat", "dog", "sun", "moon", "star", "tree", "house", "car", "book", "cloud", "river", "mountain", "pencil", "phone", "game", "music", "light", "dream", "flower", "ocean", "star", "planet", "coffee", "tea"];

    try {
      const result = await generateWordsAndCluesPrompt(input);
      aiCallOutput = result.output;
    } catch (e) {
      console.error("[generateWordsAndCluesFlow] Error calling generateWordsAndCluesPrompt or parsing its output:", e);
    }
    
    if (!aiCallOutput || !aiCallOutput.words || aiCallOutput.words.length === 0 || !aiCallOutput.targetWord || aiCallOutput.targetWord.trim() === "" || !aiCallOutput.clueHolderClue || aiCallOutput.clueHolderClue.trim() === "") {
      console.warn("[generateWordsAndCluesFlow] AI output missing crucial fields, is empty, or AI call failed. Using fallback.", aiCallOutput);
      const numberOfWords = input.numberOfWords || 9;
      let words = shuffleArray(fallbackWordsList).slice(0, numberOfWords);
      if (words.length < numberOfWords) { // Ensure enough words
          words = [...words, ...fallbackWordsList.slice(words.length, numberOfWords)];
      }
      const targetWord = words[Math.floor(Math.random() * words.length)];
      return {
          words: words,
          targetWord: targetWord,
          clueHolderClue: "Abstract", // Ensure fallback clue is a single word
      };
    }

    // Clean up words, targetWord, and clueHolderClue
    const cleanedWords = aiCallOutput.words.map(word =>
      word
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '') // Remove leading/trailing non-alphanumeric, keep internal spaces/hyphens
        .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    ).filter(word => word.length > 1 && word.length < 30 && !word.includes('\n') && word.split(' ').length <= 3 && word.trim() !== "");

    let finalTargetWord = aiCallOutput.targetWord
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '')
        .replace(/\s+/g, ' ');
    if (finalTargetWord.trim() === "") finalTargetWord = "DefaultTarget";

    let finalClueHolderClue = aiCallOutput.clueHolderClue
        .trim()
        .replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '')
        .replace(/\s+/g, ' ');
    if (finalClueHolderClue.split(' ').length > 1) { // Ensure it's a single word
        finalClueHolderClue = finalClueHolderClue.split(' ')[0];
    }
    if (finalClueHolderClue.trim() === "") finalClueHolderClue = "Mystery";


    if (cleanedWords.length === 0) {
        console.error("[generateWordsAndCluesFlow] AI generated an empty or invalid list of words after cleaning. Using secondary fallback.");
         const numberOfWords = input.numberOfWords || 9;
         let words = shuffleArray(fallbackWordsList).slice(0, numberOfWords);
         if (words.length < numberOfWords) {
             words = [...words, ...fallbackWordsList.slice(words.length, numberOfWords)];
         }
         finalTargetWord = words[Math.floor(Math.random() * words.length)];
         return {
             words: words,
             targetWord: finalTargetWord,
             clueHolderClue: "Common", // Ensure fallback clue is a single word
         };
    }
    
    // Ensure target word exists in the cleaned list, if not, pick the first one
    const targetExistsInCleaned = cleanedWords.some(w => w.toLowerCase() === finalTargetWord.toLowerCase());
    if (!targetExistsInCleaned || finalTargetWord.length < 1 || finalTargetWord.length > 30) {
        finalTargetWord = cleanedWords[0]; // Fallback to the first cleaned word if target is invalid or not found
    } else {
        // Use the exact casing from cleanedWords if there's a match
        finalTargetWord = cleanedWords.find(w => w.toLowerCase() === finalTargetWord.toLowerCase()) || finalTargetWord;
    }
     if (finalTargetWord.trim() === "") finalTargetWord = cleanedWords[0] || "FallbackWord"; // Final check for empty target
    
    let finalWords = [...new Set(cleanedWords.filter(w => w.length > 0))]; // Deduplicate and filter empty strings
    
    // Ensure the list has the desired number of words
    const desiredWordCount = input.numberOfWords || 9;
    if (finalWords.length < desiredWordCount) {
        const needed = desiredWordCount - finalWords.length;
        const baseSupplement = shuffleArray(fallbackWordsList);
        // Add words from fallback list that are not already in finalWords
        const supplementToAdd = baseSupplement.filter(s => !finalWords.some(fw => fw.toLowerCase() === s.toLowerCase())).slice(0, needed);
        finalWords.push(...supplementToAdd);
    }
    // Trim to exact count if too many were generated/supplemented
    finalWords = finalWords.slice(0, desiredWordCount);

    // Ensure target word is definitely in the list. If not, replace the last word.
    if (!finalWords.some(w => w.toLowerCase() === finalTargetWord.toLowerCase())) {
        if (finalWords.length > 0) {
            finalWords[finalWords.length -1] = finalTargetWord; // Replace last word
        } else { // Should not happen if cleanedWords had items, but defensive
             finalWords = Array(desiredWordCount -1).fill(null).map((_,i) => fallbackWordsList[i % fallbackWordsList.length]);
             finalWords.push(finalTargetWord);
             finalWords = finalWords.slice(0, desiredWordCount);
        }
    }
     // Ensure all final words are non-empty (last resort check)
    finalWords = finalWords.map(w => w.trim() === "" ? fallbackWordsList[Math.floor(Math.random() * fallbackWordsList.length)] : w);


    return {
      words: finalWords,
      targetWord: finalTargetWord,
      clueHolderClue: finalClueHolderClue,
    };
  }
);

// Helper function to shuffle an array
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}
    
