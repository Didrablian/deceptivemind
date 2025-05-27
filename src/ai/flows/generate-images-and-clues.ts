
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
  targetItemDescription: z.string().describe('The text description of the selected target image/object. This description should be simple and commonly known (e.g., "a red apple", "a wooden chair", "a blue ball").'),
  items: z.array(
    z.object({
      imageUrl: z.string().url().describe("The data URI of the generated image. Expected format: 'data:image/png;base64,<encoded_data>'."),
      text: z.string().describe('The text description of the generated image/object. Each description should be for a simple, common object and distinct from others (e.g., "a ripe banana", "a fluffy white cloud", "a vintage toy car"). Each description should be a short phrase. Avoid full sentences or questions.'),
    })
  ).length(4).describe('The list of generated images and their descriptions. All objects should be simple, commonly known, and distinct. There should be exactly 4 items.'),
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
The objects must be visually distinct and easily recognizable.
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
    let objectDescriptionsResponse;
    try {
        const descResult = await generateObjectDescriptionsPrompt({numberOfObjects: input.numberOfImages});
        objectDescriptionsResponse = descResult.output;
        if (!objectDescriptionsResponse || !objectDescriptionsResponse.objectDescriptions || objectDescriptionsResponse.objectDescriptions.length !== input.numberOfImages) {
            throw new Error('Failed to generate a valid list of object descriptions.');
        }
    } catch (e) {
        console.error("Error generating object descriptions, using fallback:", e);
        const fallbackDescriptions = ["a red apple", "a blue ball", "a yellow banana", "a green pear"];
        objectDescriptionsResponse = { objectDescriptions: fallbackDescriptions.slice(0, input.numberOfImages) };
    }
    
    const descriptions = objectDescriptionsResponse.objectDescriptions;

    // Generate images and clues based on these descriptions
    const imageGenAndCluePrompt = ai.definePrompt({
        name: 'imageGenAndCluePrompt',
        input: { schema: z.object({ objectDescriptions: z.array(z.string()) }) },
        output: { schema: GenerateImagesOutputSchema }, // Output schema is the main one for the flow
        prompt: `You are an assistant for a social deduction game.
You are given a list of {{objectDescriptions.length}} object descriptions:
{{#each objectDescriptions}}
- {{this}}
{{/each}}

Your tasks are:
1. For each description, generate an image using the 'googleai/gemini-2.0-flash-exp' model. The image should clearly depict the object.
   The output should be an array of objects, where each object contains the 'text' (original description) and 'imageUrl' (the generated image data URI).
   Example for one item: { "text": "a red apple", "imageUrl": "{{media prompt='a red apple' model='googleai/gemini-2.0-flash-exp' config='{\"responseModalities\": [\"TEXT\", \"IMAGE\"]}'}}" }

2. From the provided object descriptions, select one as the 'targetItemDescription'. This should be one of the exact descriptions from the input list.

3. Create a single, vague, one-word clue for a 'clueHolder'.
   - This clue MUST be a single word.
   - It must be related to the 'targetItemDescription'.
   - Crucially, this clue should also plausibly relate to 1-2 other objects from the provided descriptions to create ambiguity. Avoid direct synonyms.

Respond STRICTLY with a JSON object matching the output schema. Ensure 'items' is an array of objects with 'text' and 'imageUrl', 'targetItemDescription' is a string from the input descriptions, and 'clueHolderClue' is a single string (one word).

Input descriptions:
{{#each objectDescriptions as |desc|}}
- {{desc}}
{{/each}}

Output format (ensure imageUrl uses the media helper correctly for each item in the items array):
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
        config: {
            // Safety settings can be adjusted here if needed, e.g., for image generation
            // safetySettings: [{ category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' }]
        }
    });

    let finalOutput: GenerateImagesOutput | null = null;
    try {
        const result = await imageGenAndCluePrompt({ objectDescriptions: descriptions });
        finalOutput = result.output;

        if (!finalOutput || !finalOutput.items || finalOutput.items.length !== input.numberOfImages || !finalOutput.targetItemDescription || !finalOutput.clueHolderClue) {
            throw new Error('AI output for images and clues is malformed or incomplete.');
        }

        // Validate that all items have an imageUrl
        for (const item of finalOutput.items) {
            if (!item.imageUrl || !item.imageUrl.startsWith('data:image')) {
                console.warn(`Generated item "${item.text}" is missing a valid imageUrl. Will use placeholder.`);
                item.imageUrl = `https://placehold.co/300x300.png?text=${encodeURIComponent(item.text)}`; // Fallback placeholder
            }
             // Basic cleanup for descriptions from AI
            item.text = item.text.trim().replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '').replace(/\s+/g, ' ');
            if (item.text.length < 2 || item.text.length > 50 || item.text.includes('\n') || item.text.split(' ').length > 5) {
                 console.warn(`AI generated an invalid description: "${item.text}". Replacing with a generic one.`);
                 item.text = "Generated Object";
            }
        }
        finalOutput.targetItemDescription = finalOutput.targetItemDescription.trim().replace(/^[^a-zA-Z0-9\s'-]+|[^a-zA-Z0-9\s'-]+$/g, '').replace(/\s+/g, ' ');
        finalOutput.clueHolderClue = finalOutput.clueHolderClue.trim().split(' ')[0].replace(/^[^a-zA-Z0-9'-]+|[^a-zA-Z0-9'-]+$/g, '');


    } catch (e) {
        console.error("Error generating images/clues or parsing output, using fallback:", e);
        // Fallback logic
        const fallbackTargetDesc = descriptions[0] || "Fallback Object";
        finalOutput = {
            targetItemDescription: fallbackTargetDesc,
            items: descriptions.map(desc => ({
                text: desc,
                imageUrl: `https://placehold.co/300x300.png?text=${encodeURIComponent(desc)}` // Fallback placeholder
            })).slice(0, input.numberOfImages),
            clueHolderClue: "Abstract",
        };
         // Ensure items has the correct length for fallback
        while (finalOutput.items.length < input.numberOfImages) {
            const placeholderText = `Placeholder ${finalOutput.items.length + 1}`;
            finalOutput.items.push({
                text: placeholderText,
                imageUrl: `https://placehold.co/300x300.png?text=${encodeURIComponent(placeholderText)}`
            });
        }
    }
    
    // Ensure targetItemDescription is one of the item descriptions
    const targetExists = finalOutput.items.some(item => item.text.toLowerCase() === finalOutput!.targetItemDescription.toLowerCase());
    if (!targetExists) {
        console.warn(`Target description "${finalOutput.targetItemDescription}" not found in generated items. Selecting first item as target.`);
        if (finalOutput.items.length > 0) {
            finalOutput.targetItemDescription = finalOutput.items[0].text;
        } else {
            // This case should be rare due to fallback logic ensuring items array is populated
            finalOutput.targetItemDescription = "Fallback Target"; 
        }
    }


    return finalOutput!;
  }
);
