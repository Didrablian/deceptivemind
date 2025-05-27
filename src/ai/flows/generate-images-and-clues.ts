
'use server';
/**
 * @fileOverview Generates a set of distinct images of common objects, selects one as the target,
 * and creates an indirect clue related to the target object for the clue holder.
 * Objects and clues should be simple, common, and easily understandable.
 *
 * - generateImagesAndClues - A function that generates images, a clue, and assigns a target.
 * - GenerateImagesInput - The input type for the generateImagesAndClues function.
 * - GenerateImagesOutput - The return type for the generateImagesAndClues function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import type { AIGameDataOutput } from '@/lib/types'; // Using the unified output type

const GenerateImagesInputSchema = z.object({
  numberOfImages: z
    .number()
    .default(4)
    .describe('The number of distinct images of common objects to generate.'),
});
export type GenerateImagesInput = z.infer<typeof GenerateImagesInputSchema>;

// This schema is for the final output of the main flow, including generated images
const GenerateImagesOutputSchema = z.object({
  targetItemDescription: z.string().describe('The text description of the selected target image/object. This description should be simple and commonly known (e.g., "a red apple", "a wooden chair", "a blue ball"). It MUST be one of the input object descriptions.'),
  items: z.array(
    z.object({
      imageUrl: z.string().url().describe("The data URI of the generated image. Expected format: 'data:image/png;base64,<encoded_data>' or a placeholder URL."),
      text: z.string().describe('The text description of the generated image/object. This MUST be the exact corresponding input description string.'),
    })
  ).length(4).describe('The list of generated images and their descriptions. Each "text" field must correspond to an input object description. There should be exactly 4 items.'),
  clueHolderClue: z
    .string()
    .describe('A single, vague, one-word clue for the clue holder, related to the target object. This clue MUST be a single word. It should also plausibly relate to 2-3 other objects in the generated items list to create ambiguity.'),
});
export type GenerateImagesOutput = z.infer<typeof GenerateImagesOutputSchema>;


export async function generateImagesAndClues(input: GenerateImagesInput): Promise<AIGameDataOutput> {
    const result = await generateImagesAndCluesFlow(input);

    if (!result || !result.items || result.items.length === 0 || !result.targetItemDescription || result.targetItemDescription.trim() === "" || !result.clueHolderClue || result.clueHolderClue.trim() === "") {
        console.error("[generateImagesAndClues wrapper] Flow returned incomplete or empty critical data:", result);
        // Return a default, fully-formed AIGameDataOutput to prevent GameContext from erroring.
        const defaultItems = Array(input.numberOfImages || 4).fill(null).map((_, i) => ({
            text: `Default Item ${i + 1}`,
            imageUrl: 'https://placehold.co/300x300.png'
        }));
        return {
            targetItemDescription: defaultItems[0]?.text || "Default Target",
            items: defaultItems,
            clueHolderClue: "Default Clue"
        };
    }

    return {
        targetItemDescription: result.targetItemDescription,
        items: result.items.map(item => ({ text: item.text, imageUrl: item.imageUrl })),
        clueHolderClue: result.clueHolderClue,
    };
}

// Prompt for generating initial object descriptions
const generateObjectDescriptionsPrompt = ai.definePrompt({
    name: 'generateObjectDescriptionsPrompt',
    input: { schema: z.object({ numberOfObjects: z.number() }) },
    output: { schema: z.object({ objectDescriptions: z.array(z.string().min(1)).length(4) }) }, // Ensure strings are not empty
    prompt: `Generate exactly {{numberOfObjects}} distinct descriptions of simple, common, everyday objects.
Each description should be 2-4 words long (e.g., "a red apple", "a blue bicycle", "a yellow pencil", "a green plant").
The objects MUST be visually distinct, easily recognizable, and common knowledge. Avoid niche or complex items.
Focus on tangible, singular items. Each description MUST NOT be an empty string.
Respond STRICTLY with a JSON object containing a single key "objectDescriptions" which is an array of these non-empty strings.
Example response: {"objectDescriptions": ["a fluffy cat", "a steaming coffee cup", "a worn leather book", "a shiny silver key"]}`
});

// Prompt for selecting target and generating clue, given the descriptions
const selectTargetAndCluePrompt = ai.definePrompt({
    name: 'selectTargetAndCluePrompt',
    input: { schema: z.object({ objectDescriptions: z.array(z.string().min(1)) }) }, // Ensure input descriptions are not empty
    output: { schema: z.object({
        targetItemDescription: z.string().min(1).describe("The selected target object description. MUST be one of the provided objectDescriptions and not an empty string."),
        clueHolderClue: z.string().min(1).describe("A single, vague, one-word clue for the clue holder, related to the target object. This clue MUST be a single word and not an empty string. It should also plausibly relate to 1-2 other objects from the provided descriptions to create ambiguity.")
    }) },
    prompt: `You are an assistant for a social deduction game.
You are given a list of {{objectDescriptions.length}} object descriptions for simple, common, everyday objects:
{{#each objectDescriptions}}
- {{this}}
{{/each}}

Your tasks are:
1. From the provided input object descriptions, select one as the 'targetItemDescription'. This MUST be one of the exact descriptions from the input list and must not be an empty string.
2. Create a single, vague, one-word clue for a 'clueHolder'.
   - This clue MUST be a single word and not an empty string.
   - It must be related to the 'targetItemDescription'.
   - Crucially, this clue should also plausibly relate to 1-2 other objects from the provided descriptions to create ambiguity. Avoid direct synonyms.

Respond STRICTLY with a JSON object matching the output schema. Ensure all string fields are non-empty.
Example for input: {"objectDescriptions": ["a red apple", "a blue ball", "a green pear"]}
Example output: {"targetItemDescription": "a red apple", "clueHolderClue": "Round"}
`
});


const generateImagesAndCluesFlow = ai.defineFlow(
  {
    name: 'generateImagesAndCluesFlow',
    inputSchema: GenerateImagesInputSchema,
    outputSchema: GenerateImagesOutputSchema,
  },
  async (input: GenerateImagesInput): Promise<GenerateImagesOutput> => {
    let objectDescriptions: string[];
    const placeholderUrl = `https://placehold.co/300x300.png`;
    const defaultFallbackDescriptions = ["a red apple", "a blue ball", "a yellow banana", "a green pear"];

    try {
        const descResult = await generateObjectDescriptionsPrompt({numberOfObjects: input.numberOfImages});
        const output = descResult.output;
        if (!output || !output.objectDescriptions || output.objectDescriptions.length !== input.numberOfImages || output.objectDescriptions.some(d => d.trim() === "")) {
            console.warn('[generateImagesAndCluesFlow] AI failed to generate a valid list of object descriptions. Using fallback.');
            throw new Error('Fallback to default descriptions due to AI failure in generating descriptions.');
        }
        objectDescriptions = output.objectDescriptions.map(desc => desc.trim().replace(/\.$/, '')).filter(d => d.trim() !== "");
        if (objectDescriptions.length < input.numberOfImages) {
            console.warn(`[generateImagesAndCluesFlow] AI generated insufficient valid descriptions. Supplementing. Have: ${objectDescriptions.length}, Need: ${input.numberOfImages}`);
            const needed = input.numberOfImages - objectDescriptions.length;
            objectDescriptions.push(...defaultFallbackDescriptions.slice(0, needed));
        }

    } catch (e) {
        console.error("[generateImagesAndCluesFlow] Error generating object descriptions, using fallback:", e);
        objectDescriptions = defaultFallbackDescriptions.slice(0, input.numberOfImages);
    }

    // Step 2: Generate Images Programmatically
    const generatedItems: { text: string; imageUrl: string }[] = [];

    for (const description of objectDescriptions) {
        let imageUrl = placeholderUrl; 
        const itemText = description.trim() === "" ? `Fallback Item ${generatedItems.length + 1}` : description;
        try {
            console.log(`[generateImagesAndCluesFlow] Attempting to generate image for: "${itemText}"`);
            const imageResult = await ai.generate({
                model: 'googleai/gemini-2.0-flash-exp', 
                prompt: itemText, 
                config: {
                    responseModalities: ['TEXT', 'IMAGE'], 
                },
            });
            console.log(`[generateImagesAndCluesFlow] Raw imageResult for "${itemText}":`, JSON.stringify(imageResult, null, 2));

            if (imageResult.media && imageResult.media.url && imageResult.media.url.startsWith('data:image')) {
                imageUrl = imageResult.media.url;
                console.log(`[generateImagesAndCluesFlow] Successfully generated image for: "${itemText}"`);
            } else {
                console.warn(`[generateImagesAndCluesFlow] Failed to generate valid image data URI for "${itemText}". Media object:`, imageResult.media ? JSON.stringify(imageResult.media) : 'Not present');
            }
        } catch (imgError) {
            console.error(`[generateImagesAndCluesFlow] Error during image generation for "${itemText}":`, imgError);
        }
        generatedItems.push({ text: itemText, imageUrl: imageUrl });
    }
    
    while (generatedItems.length < input.numberOfImages) {
        const fallbackDesc = defaultFallbackDescriptions[generatedItems.length % defaultFallbackDescriptions.length] || `Fallback Object ${generatedItems.length + 1}`;
        console.warn(`[generateImagesAndCluesFlow] Adding placeholder for missing item ${generatedItems.length +1}. Description: ${fallbackDesc}`);
        generatedItems.push({ text: fallbackDesc, imageUrl: placeholderUrl });
    }


    // Step 3: Select Target and Generate Clue
    let targetAndClueResult: { targetItemDescription: string; clueHolderClue: string; };
    try {
        const descriptionsForCluePrompt = generatedItems.map(item => item.text).filter(text => text.trim() !== "");
        if (descriptionsForCluePrompt.length === 0) {
            console.error("[generateImagesAndCluesFlow] No valid descriptions available for clue prompt. Using hard fallbacks.");
            throw new Error("No valid descriptions for clue prompt.");
        }

        const llmResult = await selectTargetAndCluePrompt({ objectDescriptions: descriptionsForCluePrompt });
        targetAndClueResult = llmResult.output;

        if (!targetAndClueResult || !targetAndClueResult.targetItemDescription || targetAndClueResult.targetItemDescription.trim() === "" || !targetAndClueResult.clueHolderClue || targetAndClueResult.clueHolderClue.trim() === "") {
            throw new Error('AI output for target/clue is malformed, incomplete, or contains empty strings.');
        }
        
        targetAndClueResult.clueHolderClue = targetAndClueResult.clueHolderClue.trim().split(' ')[0].replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
        if (!targetAndClueResult.clueHolderClue) {
            console.warn("[generateImagesAndCluesFlow] AI clue was empty after cleaning for target/clue prompt. Using fallback 'Vague'.");
            targetAndClueResult.clueHolderClue = "Vague";
        }

        const cleanedTarget = targetAndClueResult.targetItemDescription.trim().replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '').replace(/\s+/g, ' ');
        if (!descriptionsForCluePrompt.some(desc => desc.toLowerCase() === cleanedTarget.toLowerCase())) {
            console.warn(`[generateImagesAndCluesFlow] AI target description "${targetAndClueResult.targetItemDescription}" (cleaned: "${cleanedTarget}") not in generated item descriptions. Selecting first description as target.`);
            targetAndClueResult.targetItemDescription = descriptionsForCluePrompt[0];
        } else {
            const matchedDesc = descriptionsForCluePrompt.find(desc => desc.toLowerCase() === cleanedTarget.toLowerCase());
            targetAndClueResult.targetItemDescription = matchedDesc || cleanedTarget; // Use original casing if matched
        }

    } catch (tcError) {
        console.error("[generateImagesAndCluesFlow] Error in selectTargetAndCluePrompt or its output parsing, or preceding logic:", tcError);
        const fallbackTargetDesc = generatedItems[0]?.text || defaultFallbackDescriptions[0] || "Error Object";
        targetAndClueResult = {
            targetItemDescription: fallbackTargetDesc.trim() === "" ? "Default Target Fallback" : fallbackTargetDesc,
            clueHolderClue: "Abstract",
        };
    }
    
    let finalItemsArray = generatedItems.map(item => ({
        ...item,
        text: (item.text && item.text.trim() !== "") ? item.text : `Unnamed Item ${Math.random().toString(36).substring(7)}`
    })).slice(0, input.numberOfImages);


    // Final check for empty critical strings before returning
    let finalTargetDesc = (targetAndClueResult.targetItemDescription && targetAndClueResult.targetItemDescription.trim() !== "") 
                            ? targetAndClueResult.targetItemDescription 
                            : (finalItemsArray[0]?.text || "Default Target Final");
    
    let finalClue = (targetAndClueResult.clueHolderClue && targetAndClueResult.clueHolderClue.trim() !== "")
                        ? targetAndClueResult.clueHolderClue
                        : "Mystery";

    if (finalItemsArray.length === 0 && input.numberOfImages > 0) { // Ensure items array is not empty if it's expected
        console.warn(`[generateImagesAndCluesFlow] Final items array is empty. Re-populating with fallbacks.`);
        finalItemsArray = Array(input.numberOfImages).fill(null).map((_,i) => ({
            text: defaultFallbackDescriptions[i % defaultFallbackDescriptions.length] || `Fallback Item ${i+1}`,
            imageUrl: placeholderUrl
        }));
        if (!finalItemsArray.some(item => item.text === finalTargetDesc)) {
            finalTargetDesc = finalItemsArray[0]?.text || "Default Target Final";
        }
    }


    return {
        targetItemDescription: finalTargetDesc,
        items: finalItemsArray,
        clueHolderClue: finalClue,
    };
  }
);
