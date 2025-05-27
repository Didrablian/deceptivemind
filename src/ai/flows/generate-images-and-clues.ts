
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
    // Adapt the flow's direct output to the AIGameDataOutput structure
    return {
        targetItemDescription: result.targetItemDescription,
        items: result.items.map(item => ({ text: item.text, imageUrl: item.imageUrl })),
        clueHolderClue: result.clueHolderClue,
    };
}

// Internal prompt for generating initial object descriptions
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
            throw new Error('Failed to generate a valid list of object descriptions.');
        }
        objectDescriptions = output.objectDescriptions;
    } catch (e) {
        console.error("Error generating object descriptions, using fallback:", e);
        const fallbackDescriptions = ["a red apple", "a blue ball", "a yellow banana", "a green pear"];
        objectDescriptions = fallbackDescriptions.slice(0, input.numberOfImages);
    }
    
    const imageGenAndCluePrompt = ai.definePrompt({
        name: 'imageGenAndCluePrompt',
        input: { schema: z.object({ objectDescriptions: z.array(z.string()) }) },
        output: { schema: GenerateImagesOutputSchema },
        prompt: `You are an assistant for a social deduction game.
You are given a list of {{objectDescriptions.length}} object descriptions for simple, common, everyday objects:
{{#each objectDescriptions}}
- {{this}}
{{/each}}

Your tasks are:
1. For each input description, generate an image using the 'googleai/gemini-2.0-flash-exp' model. The image should clearly depict the described simple object.
   The output 'items' array should contain objects, where each object has:
     - 'text': This MUST be the exact corresponding input description string from the list above.
     - 'imageUrl': The generated image data URI using the media helper.
   Example for one item (if input description was "a red apple"): { "text": "a red apple", "imageUrl": "{{media prompt='a red apple' model='googleai/gemini-2.0-flash-exp' config='{\"responseModalities\": [\"TEXT\", \"IMAGE\"]}'}}" }

2. From the provided input object descriptions, select one as the 'targetItemDescription'. This MUST be one of the exact descriptions from the input list.

3. Create a single, vague, one-word clue for a 'clueHolder'.
   - This clue MUST be a single word.
   - It must be related to the 'targetItemDescription'.
   - Crucially, this clue should also plausibly relate to 1-2 other objects from the provided descriptions to create ambiguity. Avoid direct synonyms.

Respond STRICTLY with a JSON object matching the output schema.
Ensure 'items' is an array of objects with 'text' (matching input descriptions) and 'imageUrl'.
Ensure 'targetItemDescription' is a string from the input descriptions.
Ensure 'clueHolderClue' is a single string (one word).

Input descriptions to use for 'text' fields and 'targetItemDescription':
{{#each objectDescriptions as |desc|}}
- {{desc}}
{{/each}}

Output format (ensure imageUrl uses the media helper correctly for each item in the items array, and 'text' is the original description):
{
  "targetItemDescription": "...",
  "items": [
    {{#each objectDescriptions as |desc|}}
    {
      "text": "{{desc}}",
      "imageUrl": "{{media prompt=desc model='googleai/gemini-2.0-flash-exp' config='{\"responseModalities\": [\"TEXT\", \"IMAGE\"]}'}}"
    }
    {{#unless @last}},{{/unless}}
    {{/each}}
  ],
  "clueHolderClue": "..."
}
`,
    });

    let aiCallOutput: GenerateImagesOutput | null = null;
    try {
        const result = await imageGenAndCluePrompt({ objectDescriptions });
        aiCallOutput = result.output;

        if (!aiCallOutput || !aiCallOutput.items || aiCallOutput.items.length !== input.numberOfImages || !aiCallOutput.targetItemDescription || !aiCallOutput.clueHolderClue) {
            throw new Error('AI output for images and clues is malformed or incomplete based on schema.');
        }
    } catch (e) {
        console.error("Error in imageGenAndCluePrompt or its output parsing:", e);
        // aiCallOutput remains null, will trigger full fallback below
    }

    const processedItems: { text: string; imageUrl: string }[] = [];
    let finalTargetDescription: string;
    let finalClueHolderClue: string;

    if (aiCallOutput) {
        // Process items from AI output, ensuring text comes from original descriptions
        for (let i = 0; i < input.numberOfImages; i++) {
            const originalDesc = objectDescriptions[i]; // Use original description as source of truth for text
            const aiItemData = aiCallOutput.items[i]; // Assuming AI returns items in the same order

            let imageUrl = aiItemData?.imageUrl;
            if (!imageUrl || !imageUrl.startsWith('data:image')) {
                console.warn(`Item "${originalDesc}" had invalid/missing imageUrl. Using placeholder.`);
                imageUrl = `https://placehold.co/300x300.png`; // Corrected placeholder
            }
            processedItems.push({ text: originalDesc, imageUrl });
        }

        // Validate and clean target description
        finalTargetDescription = aiCallOutput.targetItemDescription.trim().replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '').replace(/\s+/g, ' ');
        if (!objectDescriptions.some(desc => desc.toLowerCase() === finalTargetDescription.toLowerCase())) {
            console.warn(`AI target description "${aiCallOutput.targetItemDescription}" (cleaned: "${finalTargetDescription}") not found in original descriptions. Selecting first original description as target.`);
            finalTargetDescription = objectDescriptions[0];
        }

        // Clean clue
        finalClueHolderClue = aiCallOutput.clueHolderClue.trim().split(' ')[0].replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');
         if (!finalClueHolderClue) {
            console.warn("AI clue was empty after cleaning. Using fallback clue 'Vague'.");
            finalClueHolderClue = "Vague";
        }

    } else {
        // Full fallback if aiCallOutput is null (e.g., major AI error)
        console.warn("AI call for imageGenAndCluePrompt failed or output was null. Using full fallback for items, target, and clue.");
        objectDescriptions.forEach(desc => {
            processedItems.push({ text: desc, imageUrl: `https://placehold.co/300x300.png` });
        });
        finalTargetDescription = objectDescriptions[0] || "Error Object";
        finalClueHolderClue = "Abstract";
    }
    
    // Ensure correct number of items in the final list, even if fallbacks were incomplete
    while (processedItems.length < input.numberOfImages) {
        const placeholderText = `Object ${processedItems.length + 1}`;
        console.warn(`Processed items length ${processedItems.length} less than required ${input.numberOfImages}. Adding placeholder: ${placeholderText}`);
        processedItems.push({
            text: placeholderText,
            imageUrl: `https://placehold.co/300x300.png`
        });
        if (processedItems.length === 1 && (!finalTargetDescription || finalTargetDescription === "Error Object")) {
            finalTargetDescription = placeholderText; // Ensure a target if we only have placeholders
        }
    }


    return {
        targetItemDescription: finalTargetDescription,
        items: processedItems.slice(0, input.numberOfImages), // Ensure exactly numberOfImages items
        clueHolderClue: finalClueHolderClue,
    };
  }
);

    