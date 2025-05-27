
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
      imageUrl: z.string().url().describe("The data URI of the generated image. Expected format: 'data:image/png;base64,<encoded_data>'."),
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
    output: { schema: z.object({ objectDescriptions: z.array(z.string()).length(4) }) },
    prompt: `Generate exactly {{numberOfObjects}} distinct descriptions of simple, common, everyday objects.
Each description should be 2-4 words long (e.g., "a red apple", "a blue bicycle", "a yellow pencil", "a green plant").
The objects MUST be visually distinct, easily recognizable, and common knowledge. Avoid niche or complex items.
Respond STRICTLY with a JSON object containing a single key "objectDescriptions" which is an array of these strings.
Example response: {"objectDescriptions": ["a fluffy cat", "a steaming coffee cup", "a worn leather book", "a shiny silver key"]}`
});

// Prompt for selecting target and generating clue, given the descriptions
const selectTargetAndCluePrompt = ai.definePrompt({
    name: 'selectTargetAndCluePrompt',
    input: { schema: z.object({ objectDescriptions: z.array(z.string()) }) },
    output: { schema: z.object({
        targetItemDescription: z.string().describe("The selected target object description. MUST be one of the provided objectDescriptions."),
        clueHolderClue: z.string().describe("A single, vague, one-word clue for the clue holder, related to the target object. This clue MUST be a single word. It should also plausibly relate to 1-2 other objects from the provided descriptions to create ambiguity.")
    }) },
    prompt: `You are an assistant for a social deduction game.
You are given a list of {{objectDescriptions.length}} object descriptions for simple, common, everyday objects:
{{#each objectDescriptions}}
- {{this}}
{{/each}}

Your tasks are:
1. From the provided input object descriptions, select one as the 'targetItemDescription'. This MUST be one ofthe exact descriptions from the input list.
2. Create a single, vague, one-word clue for a 'clueHolder'.
   - This clue MUST be a single word.
   - It must be related to the 'targetItemDescription'.
   - Crucially, this clue should also plausibly relate to 1-2 other objects from the provided descriptions to create ambiguity. Avoid direct synonyms.

Respond STRICTLY with a JSON object matching the output schema.
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
    try {
        const descResult = await generateObjectDescriptionsPrompt({numberOfObjects: input.numberOfImages});
        const output = descResult.output;
        if (!output || !output.objectDescriptions || output.objectDescriptions.length !== input.numberOfImages) {
            console.warn('Failed to generate a valid list of object descriptions from AI. Using fallback.');
            throw new Error('Fallback to default descriptions.');
        }
        objectDescriptions = output.objectDescriptions;
    } catch (e) {
        console.error("Error generating object descriptions, using fallback:", e);
        const fallbackDescriptions = ["a red apple", "a blue ball", "a yellow banana", "a green pear"];
        objectDescriptions = fallbackDescriptions.slice(0, input.numberOfImages);
    }

    // Step 2: Generate Images Programmatically
    const generatedItems: { text: string; imageUrl: string }[] = [];
    for (const description of objectDescriptions) {
        try {
            console.log(`Attempting to generate image for: ${description}`);
            const imageResult = await ai.generate({
                model: 'googleai/gemini-2.0-flash-exp',
                prompt: `Generate a clear, simple image of: ${description}. The object should be the main focus, on a plain background if possible.`,
                config: {
                    responseModalities: ['TEXT', 'IMAGE'],
                },
            });
            if (imageResult.media && imageResult.media.url && imageResult.media.url.startsWith('data:image')) {
                generatedItems.push({ text: description, imageUrl: imageResult.media.url });
                console.log(`Successfully generated image for: ${description}`);
            } else {
                console.warn(`Failed to generate valid image for "${description}". Received:`, imageResult.media);
                generatedItems.push({ text: description, imageUrl: `https://placehold.co/300x300.png` });
            }
        } catch (imgError) {
            console.error(`Error generating image for "${description}":`, imgError);
            generatedItems.push({ text: description, imageUrl: `https://placehold.co/300x300.png` });
        }
    }
     // Ensure correct number of items even if some generations failed
    while (generatedItems.length < input.numberOfImages && generatedItems.length < objectDescriptions.length) {
        const desc = objectDescriptions[generatedItems.length];
         console.warn(`Image generation loop didn't produce enough items. Adding placeholder for "${desc}".`);
        generatedItems.push({ text: desc, imageUrl: `https://placehold.co/300x300.png` });
    }
     while (generatedItems.length < input.numberOfImages) {
        const placeholderText = `Fallback Object ${generatedItems.length + 1}`;
        console.warn(`Still not enough items after initial loop. Adding generic placeholder: ${placeholderText}`);
         objectDescriptions.push(placeholderText); // Add to descriptions so it can be selected as target
        generatedItems.push({ text: placeholderText, imageUrl: `https://placehold.co/300x300.png` });
    }


    // Step 3: Select Target and Generate Clue
    let targetAndClueResult: { targetItemDescription: string; clueHolderClue: string; } | null = null;
    try {
        const llmResult = await selectTargetAndCluePrompt({ objectDescriptions });
        targetAndClueResult = llmResult.output;

        if (!targetAndClueResult || !targetAndClueResult.targetItemDescription || !targetAndClueResult.clueHolderClue) {
            throw new Error('AI output for target/clue is malformed or incomplete.');
        }
         // Clean clue
        targetAndClueResult.clueHolderClue = targetAndClueResult.clueHolderClue.trim().split(' ')[0].replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
        if (!targetAndClueResult.clueHolderClue) {
            console.warn("AI clue was empty after cleaning for target/clue prompt. Using fallback 'Vague'.");
            targetAndClueResult.clueHolderClue = "Vague";
        }
        // Validate target description
        const cleanedTarget = targetAndClueResult.targetItemDescription.trim().replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '').replace(/\s+/g, ' ');
        if (!objectDescriptions.some(desc => desc.toLowerCase() === cleanedTarget.toLowerCase())) {
            console.warn(`AI target description "${targetAndClueResult.targetItemDescription}" (cleaned: "${cleanedTarget}") not in original descriptions. Selecting first description as target.`);
            targetAndClueResult.targetItemDescription = objectDescriptions[0];
        } else {
            targetAndClueResult.targetItemDescription = cleanedTarget;
        }

    } catch (tcError) {
        console.error("Error in selectTargetAndCluePrompt or its output parsing:", tcError);
        // Fallback for target and clue
        targetAndClueResult = {
            targetItemDescription: objectDescriptions[0] || "Error Object",
            clueHolderClue: "Abstract",
        };
    }
    
    // Ensure the target description exists in our generated items (it should, as it's from objectDescriptions)
    // And mark the target item
    const finalItems = generatedItems.map(item => ({
        ...item,
        isTarget: item.text.toLowerCase() === targetAndClueResult!.targetItemDescription.toLowerCase(),
    }));

    // Verify at least one item is target, if not, fallback
    if (!finalItems.some(item => item.isTarget) && finalItems.length > 0) {
        console.warn("No target item was marked after processing. Defaulting to first item as target.");
        finalItems[0].isTarget = true;
        targetAndClueResult!.targetItemDescription = finalItems[0].text;
    }


    return {
        targetItemDescription: targetAndClueResult!.targetItemDescription,
        items: finalItems.slice(0, input.numberOfImages), // Ensure exactly numberOfImages items
        clueHolderClue: targetAndClueResult!.clueHolderClue,
    };
  }
);

