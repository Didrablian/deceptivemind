
'use server';
/**
 * @fileOverview Generates a set of distinct images of common objects using OpenAI, selects one as the target,
 * and creates an indirect clue related to the target object for the clue holder.
 * Objects and clues should be simple, common, and easily understandable.
 *
 * - generateImagesAndClues - A function that generates images, a clue, and assigns a target.
 * - GenerateImagesInput - The input type for the generateImagesAndClues function.
 * - GenerateImagesFlowOutput (internal) - The output type for the Genkit flow.
 * - AIGameDataOutput (external) - The unified output type for the game context.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import OpenAI from 'openai';
import type { AIGameDataOutput } from '@/lib/types';

const GenerateImagesInputSchema = z.object({
  numberOfImages: z
    .number()
    .default(4)
    .describe('The number of distinct images of common objects to generate.'),
});
export type GenerateImagesInput = z.infer<typeof GenerateImagesInputSchema>;

// Internal schema for the flow's direct output
const GenerateImagesFlowOutputSchema = z.object({
  targetItemDescription: z.string().min(1).describe('The text description of the selected target image/object. This description should be simple and commonly known (e.g., "a red apple", "a wooden chair", "a blue ball"). It MUST be one of the input object descriptions and not an empty string.'),
  items: z.array(
    z.object({
      imageUrl: z.string().url().describe("The data URI of the generated image. Expected format: 'data:image/png;base64,<encoded_data>' or a placeholder URL."),
      text: z.string().min(1).describe('The text description of the generated image/object. This MUST be the exact corresponding input description string and not an empty string.'),
    })
  ).min(1).describe('The list of generated images and their descriptions. Each "text" field must correspond to an input object description.'),
  clueHolderClue: z
    .string().min(1)
    .describe('A single, vague, one-word clue for the clue holder, related to the target object. This clue MUST be a single word and not an empty string. It should also plausibly relate to 2-3 other objects in the generated items list to create ambiguity.'),
});
type GenerateImagesFlowOutput = z.infer<typeof GenerateImagesFlowOutputSchema>;

// Wrapper function to match AIGameDataOutput
export async function generateImagesAndClues(input: GenerateImagesInput): Promise<AIGameDataOutput> {
    const flowResult = await generateImagesAndCluesFlow(input);

    // Basic validation on critical fields of flowResult before returning
    const defaultItems = Array(input.numberOfImages).fill(null).map((_, i) => ({
        text: `Default Item ${i + 1}`,
        imageUrl: 'https://placehold.co/300x300.png'
    }));

    if (!flowResult || !flowResult.items || flowResult.items.length === 0 || flowResult.items.some(item => !item.text || item.text.trim() === "" || !item.imageUrl) || !flowResult.targetItemDescription || flowResult.targetItemDescription.trim() === "" || !flowResult.clueHolderClue || flowResult.clueHolderClue.trim() === "") {
        console.error("[generateImagesAndClues wrapper] Flow returned incomplete or malformed critical data:", flowResult);
        return {
            targetItemDescription: defaultItems[0]?.text || "Default Target",
            items: defaultItems,
            clueHolderClue: "Default Clue"
        };
    }
    
    return {
        targetItemDescription: flowResult.targetItemDescription,
        items: flowResult.items.map(item => ({ text: item.text, imageUrl: item.imageUrl })),
        clueHolderClue: flowResult.clueHolderClue,
    };
}


// Prompt for generating initial object descriptions
const generateObjectDescriptionsPrompt = ai.definePrompt({
    name: 'generateObjectDescriptionsPrompt',
    input: { schema: z.object({ numberOfObjects: z.number() }) },
    output: { schema: z.object({ objectDescriptions: z.array(z.string().min(1)).min(1) }) },
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
    input: { schema: z.object({ objectDescriptions: z.array(z.string().min(1)) }) },
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
    outputSchema: GenerateImagesFlowOutputSchema, // Use internal schema
  },
  async (input: GenerateImagesInput): Promise<GenerateImagesFlowOutput> => {
    const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_ORGANIZATION_ID, // Added optional organization ID
    });
    let objectDescriptions: string[];
    const placeholderUrl = 'https://placehold.co/300x300.png';
    const defaultFallbackDescriptions = ["a red apple", "a blue ball", "a yellow banana", "a green pear"];

    // Step 1: Generate Object Descriptions using Genkit (OpenAI text model)
    try {
        console.log('[generateImagesAndCluesFlow] Generating object descriptions...');
        const descResult = await generateObjectDescriptionsPrompt({numberOfObjects: input.numberOfImages});
        const output = descResult.output;
        if (!output || !output.objectDescriptions || output.objectDescriptions.length === 0 || output.objectDescriptions.some(d => d.trim() === "")) {
            console.warn('[generateImagesAndCluesFlow] AI failed to generate a valid list of object descriptions. Using fallback.');
            throw new Error('Fallback to default descriptions due to AI failure in generating descriptions.');
        }
        objectDescriptions = output.objectDescriptions.map(desc => desc.trim().replace(/\.$/, '')).filter(d => d.trim() !== "");
         if (objectDescriptions.length === 0) { // If all descriptions became empty after cleaning
            console.warn(`[generateImagesAndCluesFlow] All AI generated descriptions were invalid after cleaning. Using full fallback.`);
            throw new Error('All AI generated descriptions were invalid.');
         }
         if (objectDescriptions.length < input.numberOfImages) {
            console.warn(`[generateImagesAndCluesFlow] AI generated insufficient valid descriptions. Supplementing. Have: ${objectDescriptions.length}, Need: ${input.numberOfImages}`);
            const needed = input.numberOfImages - objectDescriptions.length;
            objectDescriptions.push(...defaultFallbackDescriptions.slice(0, needed).filter(d => !objectDescriptions.includes(d)));
        }
        objectDescriptions = objectDescriptions.slice(0, input.numberOfImages);


    } catch (e) {
        console.error("[generateImagesAndCluesFlow] Error generating object descriptions, using fallback:", e);
        objectDescriptions = defaultFallbackDescriptions.slice(0, input.numberOfImages);
    }

    // Step 2: Generate Images using OpenAI SDK (e.g., DALL-E 3 or gpt-image-1)
    const generatedItems: { text: string; imageUrl: string }[] = [];
    console.log('[generateImagesAndCluesFlow] Generating images for descriptions:', objectDescriptions);

    for (const description of objectDescriptions) {
        let imageUrl = placeholderUrl; 
        const itemText = description.trim() === "" ? `Fallback Item ${generatedItems.length + 1}` : description;

        try {
            console.log(`[generateImagesAndCluesFlow] Attempting to generate image for: "${itemText}" using OpenAI SDK`);
            const imageResponse = await openai.images.generate({
                model: "gpt-image-1", // Or "dall-e-3" based on your preference/access
                prompt: itemText, // Using the simple description as the prompt
                n: 1,
                size: "1024x1024", // DALL-E 3 supports 1024x1024, 1024x1792 or 1792x1024
                response_format: "b64_json",
            });

            if (imageResponse.data && imageResponse.data[0] && imageResponse.data[0].b64_json) {
                imageUrl = `data:image/png;base64,${imageResponse.data[0].b64_json}`;
                console.log(`[generateImagesAndCluesFlow] Successfully generated image for: "${itemText}"`);
            } else {
                console.warn(`[generateImagesAndCluesFlow] Failed to generate valid image data from OpenAI for "${itemText}". Response:`, imageResponse);
            }
        } catch (imgError) {
            console.error(`[generateImagesAndCluesFlow] Error during OpenAI image generation for "${itemText}":`, imgError);
        }
        generatedItems.push({ text: itemText, imageUrl: imageUrl });
    }
    
    // Ensure we have the correct number of items
    while (generatedItems.length < input.numberOfImages) {
        const fallbackDesc = defaultFallbackDescriptions[generatedItems.length % defaultFallbackDescriptions.length] || `Fallback Object ${generatedItems.length + 1}`;
        console.warn(`[generateImagesAndCluesFlow] Adding placeholder for missing item ${generatedItems.length +1}. Description: ${fallbackDesc}`);
        generatedItems.push({ text: fallbackDesc, imageUrl: placeholderUrl });
    }
    generatedItems.length = input.numberOfImages; // Ensure exactly the number of items requested.


    // Step 3: Select Target and Generate Clue using Genkit (OpenAI text model)
    let targetAndClueResult: { targetItemDescription: string; clueHolderClue: string; };
    const descriptionsForCluePrompt = generatedItems.map(item => item.text).filter(text => text && text.trim() !== "");
    
    if (descriptionsForCluePrompt.length === 0) {
        console.error("[generateImagesAndCluesFlow] No valid descriptions available for clue prompt. Using hard fallbacks.");
        targetAndClueResult = {
            targetItemDescription: generatedItems[0]?.text || defaultFallbackDescriptions[0] || "Error Object",
            clueHolderClue: "Abstract",
        };
    } else {
        try {
            console.log('[generateImagesAndCluesFlow] Selecting target and generating clue for descriptions:', descriptionsForCluePrompt);
            const llmResult = await selectTargetAndCluePrompt({ objectDescriptions: descriptionsForCluePrompt });
            
            if (!llmResult.output) {
                throw new Error('LLM result output is null');
            }
            
            targetAndClueResult = llmResult.output;

            if (!targetAndClueResult || !targetAndClueResult.targetItemDescription || targetAndClueResult.targetItemDescription.trim() === "" || !targetAndClueResult.clueHolderClue || targetAndClueResult.clueHolderClue.trim() === "") {
                console.warn("[generateImagesAndCluesFlow] AI output for target/clue is malformed or contains empty strings. Using fallback.", targetAndClueResult);
                throw new Error('AI output for target/clue is malformed.');
            }
            
            targetAndClueResult.clueHolderClue = targetAndClueResult.clueHolderClue.trim().split(' ')[0].replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
            if (!targetAndClueResult.clueHolderClue) {
                targetAndClueResult.clueHolderClue = "Vague";
            }

            const cleanedTarget = targetAndClueResult.targetItemDescription.trim().replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '').replace(/\s+/g, ' ');
            const matchedDesc = descriptionsForCluePrompt.find(desc => desc.toLowerCase() === cleanedTarget.toLowerCase());
            if (!matchedDesc) {
                console.warn(`[generateImagesAndCluesFlow] AI target description "${targetAndClueResult.targetItemDescription}" not in generated item descriptions. Selecting first description as target.`);
                targetAndClueResult.targetItemDescription = descriptionsForCluePrompt[0];
            } else {
                targetAndClueResult.targetItemDescription = matchedDesc;
            }

        } catch (tcError) {
            console.error("[generateImagesAndCluesFlow] Error in selectTargetAndCluePrompt or its output parsing:", tcError);
            const fallbackTargetDesc = descriptionsForCluePrompt[0] || generatedItems[0]?.text || defaultFallbackDescriptions[0] || "Error Object";
            targetAndClueResult = {
                targetItemDescription: fallbackTargetDesc.trim() === "" ? "Default Target Fallback" : fallbackTargetDesc,
                clueHolderClue: "Abstract",
            };
        }
    }
    
    // Final processing for output schema
    let finalItemsArray = generatedItems.map(item => ({
        ...item,
        text: (item.text && item.text.trim() !== "") ? item.text : `Unnamed Item ${Math.random().toString(36).substring(7)}`
    })).slice(0, input.numberOfImages); 

    let finalTargetDesc = (targetAndClueResult.targetItemDescription && targetAndClueResult.targetItemDescription.trim() !== "") 
                            ? targetAndClueResult.targetItemDescription 
                            : (finalItemsArray[0]?.text || "Default Target Final");
    if (finalTargetDesc.trim() === "") finalTargetDesc = "Default Target Fallback";
    
    let finalClue = (targetAndClueResult.clueHolderClue && targetAndClueResult.clueHolderClue.trim() !== "")
                        ? targetAndClueResult.clueHolderClue.split(' ')[0] // ensure single word
                        : "Mystery";
    if (finalClue.trim() === "") finalClue = "Mystery";

    if (finalItemsArray.length === 0 && input.numberOfImages > 0) {
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
