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
  gameHistory: z
    .object({
      usedDescriptions: z.array(z.string()).default([]).describe('Previously used item descriptions in this lobby'),
      usedThemes: z.array(z.string()).default([]).describe('Previously used themes/categories in this lobby'),
      gameCount: z.number().default(0).describe('Number of games played in this lobby'),
      lastTheme: z.string().optional().describe('The theme context used in the previous game'),
    })
    .optional()
    .describe('History of previous games in this lobby to ensure uniqueness'),
});
export type GenerateImagesInput = z.infer<typeof GenerateImagesInputSchema>;

// Internal schema for the flow's direct output
const GenerateImagesFlowOutputSchema = z.object({
  targetItemDescription: z.string().min(1).describe('The text description of the selected target image/object. This description should be simple and commonly known (e.g., "a red apple", "a wooden chair", "a blue ball"). It MUST be one of the input object descriptions and not an empty string.'),
  items: z.array(
    z.object({
      imageUrl: z.string().url().describe("The direct OpenAI DALL-E image URL or a placeholder URL."),
      text: z.string().min(1).describe('The text description of the generated image/object. This MUST be the exact corresponding input description string and not an empty string.'),
    })
  ).min(1).describe('The list of generated images and their descriptions. Each "text" field must correspond to an input object description.'),
  clueHolderClue: z
    .string().min(1)
    .describe('A single, vague, one-word clue for the clue holder, related to the target object. This clue MUST be a single word and not an empty string. It should also plausibly relate to 2-3 other objects in the generated items list to create ambiguity.'),
  gameHistoryUpdate: z.object({
    usedDescriptions: z.array(z.string()).describe('Updated list including newly used descriptions'),
    usedThemes: z.array(z.string()).describe('Updated list including the theme used in this game'),
    gameCount: z.number().describe('Incremented game count'),
    lastTheme: z.string().describe('The theme used in this game'),
  }).describe('Updated game history to pass to the next game in this lobby'),
});
type GenerateImagesFlowOutput = z.infer<typeof GenerateImagesFlowOutputSchema>;

// Wrapper function to match AIGameDataOutput
export async function generateImagesAndClues(input: GenerateImagesInput): Promise<AIGameDataOutput & { gameHistoryUpdate?: any }> {
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
            clueHolderClue: "Default Clue",
            gameHistoryUpdate: flowResult?.gameHistoryUpdate
        };
    }
    
    return {
        targetItemDescription: flowResult.targetItemDescription,
        items: flowResult.items.map(item => ({ text: item.text, imageUrl: item.imageUrl })),
        clueHolderClue: flowResult.clueHolderClue,
        gameHistoryUpdate: flowResult.gameHistoryUpdate,
    };
}


// Prompt for generating initial object descriptions
const generateObjectDescriptionsPrompt = ai.definePrompt({
    name: 'generateObjectDescriptionsPrompt',
    input: { schema: z.object({ 
        numberOfObjects: z.number(),
        gameHistory: z.object({
            usedDescriptions: z.array(z.string()).default([]),
            usedThemes: z.array(z.string()).default([]),
            gameCount: z.number().default(0),
            lastTheme: z.string().optional(),
        }).optional(),
        currentTheme: z.string().describe('The theme context for this game'),
    }) },
    output: { schema: z.object({ 
        objectDescriptions: z.array(z.string().min(1)).min(1),
        themeUsed: z.string().describe('The main theme/category used for this set'),
    }) },
    prompt: `Generate exactly {{numberOfObjects}} distinct descriptions for a strategic social deduction game.

GAME CONTEXT & THEME: {{currentTheme}}

{{#if gameHistory}}
AVOID THESE PREVIOUSLY USED ITEMS: {{gameHistory.usedDescriptions}}
AVOID REPEATING THESE THEMES: {{gameHistory.usedThemes}}
GAME COUNT: {{gameHistory.gameCount}} (use this to adjust complexity)
{{#if gameHistory.lastTheme}}LAST GAME'S THEME: {{gameHistory.lastTheme}} (choose something different){{/if}}
{{/if}}

REQUIREMENTS:
- Each description should be 2-5 words following the {{currentTheme}} theme
- Items should have STRATEGIC OVERLAPS within the theme - multiple items should share sub-categories
- Make items visually distinct but thematically connected to {{currentTheme}}
- Avoid overly complex or abstract concepts
- NO DUPLICATES from the previously used items list above

STRATEGIC OVERLAP EXAMPLES FOR {{currentTheme}}:
- If theme is "Technology": include "Elon Musk's Tesla" + "Steve Jobs' iPhone" + "Mark Zuckerberg's laptop" (tech leaders)
- If theme is "Food & Brands": include "McDonald's burger" + "KFC chicken" + "Starbucks coffee" (fast food chains)  
- If theme is "Entertainment": include "Taylor Swift microphone" + "Netflix red logo" + "Disney castle" (entertainment brands)
- If theme is "Nature & Animals": include "golden retriever" + "tabby cat" + "blue whale" (animals)

Create engaging, memorable items that make the guessing game challenging and fun!
Each description MUST NOT be an empty string and MUST be completely different from previously used items.

Respond with JSON: {"objectDescriptions": ["item1", "item2", "item3", "item4"], "themeUsed": "your_theme_name"}`
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

// Prompt for generating alternative descriptions when images fail
const generateAlternativeDescriptionsPrompt = ai.definePrompt({
    name: 'generateAlternativeDescriptionsPrompt', 
    input: { schema: z.object({ 
        failedDescriptions: z.array(z.string()),
        existingDescriptions: z.array(z.string()),
        numberOfAlternatives: z.number()
    }) },
    output: { schema: z.object({ alternativeDescriptions: z.array(z.string().min(1)).min(1) }) },
    prompt: `Generate {{numberOfAlternatives}} NEW alternative descriptions to replace these failed ones: {{failedDescriptions}}

AVOID these existing descriptions: {{existingDescriptions}}

REQUIREMENTS:
- Each description should be 2-5 words, simple and visual
- Mix interesting items: celebrities, brands, everyday objects, places, concepts
- Make items visually distinct and easy to generate as images
- Avoid duplicating themes already covered in existing descriptions
- Each description MUST NOT be an empty string

Examples of good alternatives:
- "golden retriever puppy"
- "Amazon delivery box" 
- "Taylor Swift microphone"
- "Netflix red logo"
- "McDonald's french fries"
- "white Tesla car"

Respond with JSON: {"alternativeDescriptions": ["alt1", "alt2", "alt3"]}`
});

const generateImagesAndCluesFlow = ai.defineFlow(
  {
    name: 'generateImagesAndCluesFlow',
    inputSchema: GenerateImagesInputSchema,
    outputSchema: GenerateImagesFlowOutputSchema, // Use internal schema
  },
  async (input: GenerateImagesInput): Promise<GenerateImagesFlowOutput> => {
    // Debug environment variables
    console.log('🔧 [DEBUG] Environment Check:');
    console.log('🔧 [DEBUG] OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
    console.log('🔧 [DEBUG] OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);
    console.log('🔧 [DEBUG] OPENAI_API_KEY starts with sk-:', process.env.OPENAI_API_KEY?.startsWith('sk-') || false);
    
    const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_ORGANIZATION_ID, // Added optional organization ID
    });
    
    console.log('🔧 [DEBUG] OpenAI client created successfully');
    
    let objectDescriptions: string[];
    const placeholderUrl = 'https://placehold.co/300x300.png';

    // Step 0: Select Theme Based on Game History
    const gameHistory = input.gameHistory || {
        usedDescriptions: [],
        usedThemes: [],
        gameCount: 0,
        lastTheme: undefined,
    };
    
    const availableThemes = [
        "Technology & Innovation",
        "Food & Restaurant Brands", 
        "Entertainment & Media",
        "Nature & Animals",
        "Sports & Fitness",
        "Travel & Places",
        "Fashion & Lifestyle",
        "Space & Science",
        "Music & Arts",
        "Vehicles & Transportation",
        "Home & Furniture",
        "Books & Education"
    ];
    
    // Filter out recently used themes
    const unusedThemes = availableThemes.filter(theme => 
        !gameHistory.usedThemes.includes(theme) && theme !== gameHistory.lastTheme
    );
    
    // Select theme based on game count and available options
    let selectedTheme: string;
    if (unusedThemes.length > 0) {
        // Randomly select from unused themes
        selectedTheme = unusedThemes[Math.floor(Math.random() * unusedThemes.length)];
    } else {
        // All themes used, reset and pick randomly (but avoid last theme)
        const resetThemes = availableThemes.filter(theme => theme !== gameHistory.lastTheme);
        selectedTheme = resetThemes[Math.floor(Math.random() * resetThemes.length)];
        console.log('🔄 [THEME] All themes used, resetting theme pool');
    }
    
    console.log(`🎯 [THEME] Selected theme: "${selectedTheme}" (Game #${gameHistory.gameCount + 1})`);
    console.log(`🚫 [THEME] Avoiding ${gameHistory.usedDescriptions.length} previously used items`);
    console.log(`📚 [THEME] Previously used themes:`, gameHistory.usedThemes);

    // Step 1: Generate Object Descriptions using Genkit (OpenAI text model)
    try {
        console.log('[generateImagesAndCluesFlow] Generating object descriptions...');
        const descResult = await generateObjectDescriptionsPrompt({
            numberOfObjects: input.numberOfImages,
            gameHistory: input.gameHistory,
            currentTheme: selectedTheme
        });
        const output = descResult.output;
        if (!output || !output.objectDescriptions || output.objectDescriptions.length === 0 || output.objectDescriptions.some(d => d.trim() === "")) {
            console.warn('[generateImagesAndCluesFlow] AI failed to generate valid object descriptions. Retrying...');
            throw new Error('AI failed to generate valid descriptions');
        }
        objectDescriptions = output.objectDescriptions.map(desc => desc.trim().replace(/\.$/, '')).filter(d => d.trim() !== "");
         if (objectDescriptions.length === 0) {
            console.warn(`[generateImagesAndCluesFlow] All AI generated descriptions were invalid after cleaning. Retrying...`);
            throw new Error('All AI generated descriptions were invalid.');
         }
         if (objectDescriptions.length < input.numberOfImages) {
            console.warn(`[generateImagesAndCluesFlow] AI generated insufficient valid descriptions (${objectDescriptions.length}/${input.numberOfImages}). Retrying...`);
            throw new Error('Insufficient valid descriptions generated');
        }
        objectDescriptions = objectDescriptions.slice(0, input.numberOfImages);

    } catch (e) {
        console.error("[generateImagesAndCluesFlow] Error generating object descriptions:", e);
        // Retry once with simpler prompt if the advanced one fails
        try {
            console.log('[generateImagesAndCluesFlow] Retrying with simpler prompt...');
            const retryResult = await generateObjectDescriptionsPrompt({
                numberOfObjects: input.numberOfImages,
                gameHistory: input.gameHistory,
                currentTheme: selectedTheme
            });
            if (retryResult.output?.objectDescriptions && retryResult.output.objectDescriptions.length >= input.numberOfImages) {
                objectDescriptions = retryResult.output.objectDescriptions.slice(0, input.numberOfImages);
                console.log('[generateImagesAndCluesFlow] Retry successful!');
            } else {
                throw new Error('Retry also failed');
            }
        } catch (retryError) {
            console.error("[generateImagesAndCluesFlow] Retry also failed. Cannot proceed without descriptions.");
            throw new Error('Critical failure: Could not generate any object descriptions');
        }
    }

    // Step 2: Generate Images using OpenAI SDK (DALL-E 2 for speed)
    const generatedItems: { text: string; imageUrl: string }[] = [];
    console.log('[generateImagesAndCluesFlow] Generating images for descriptions:', objectDescriptions);

    // Generate all images concurrently for better performance
    const imageGenerationPromises = objectDescriptions.map(async (description, index) => {
        // Add small delay to avoid hitting rate limits (stagger requests)
        await new Promise(resolve => setTimeout(resolve, index * 200)); // 200ms delay between each request
        
        const itemText = description.trim() === "" ? `Fallback Item ${index + 1}` : description;
        let imageUrl = placeholderUrl;
        let retryCount = 0;
        const maxRetries = 2;

        while (retryCount <= maxRetries) {
            try {
                console.log(`🎨 [IMAGE-GEN] Attempt ${retryCount + 1}/${maxRetries + 1} - Generating image for: "${itemText}"`);
                console.log(`🎨 [IMAGE-GEN] Using model: dall-e-2, size: 512x512`);
                console.log(`🎨 [IMAGE-GEN] Enhanced Dixit-style prompt for: "${itemText}"`);
                
                const imageResponse = await openai.images.generate({
                    model: "dall-e-2", // Using DALL-E 2 for faster generation
                    prompt: `A dreamy, surreal, whimsical illustration of ${itemText} in the style of Dixit board game artwork. Fantastical, fairy-tale like, with rich colors, ethereal lighting, and magical atmosphere. Imaginative and poetic interpretation with mysterious, storybook quality.`, // Dixit-inspired prompt
                    n: 1,
                    size: "512x512", // DALL-E 2 supports 256x256, 512x512, 1024x1024
                    response_format: "url", // Get direct URLs instead of base64
                });

                console.log(`🎨 [IMAGE-GEN] API Response received for "${itemText}"`);
                console.log(`🎨 [IMAGE-GEN] Response data length:`, imageResponse.data?.length || 0);
                console.log(`🎨 [IMAGE-GEN] Has URL:`, !!imageResponse.data?.[0]?.url);
                
                if (imageResponse.data && imageResponse.data[0] && imageResponse.data[0].url) {
                    imageUrl = imageResponse.data[0].url;
                    console.log(`✅ [IMAGE-GEN] SUCCESS! Generated image for: "${itemText}" - URL: ${imageUrl}`);
                    break; // Success, exit retry loop
                } else {
                    console.log(`❌ [IMAGE-GEN] No image URL returned for "${itemText}"`);
                    throw new Error(`No image URL returned for "${itemText}"`);
                }
            } catch (imgError) {
                console.error(`❌ [IMAGE-GEN] Attempt ${retryCount + 1} FAILED for "${itemText}"`);
                console.error(`❌ [IMAGE-GEN] Error type:`, imgError?.constructor?.name || 'Unknown');
                console.error(`❌ [IMAGE-GEN] Error message:`, (imgError as Error)?.message || 'No message');
                
                if (imgError instanceof Error) {
                    if ('response' in imgError) {
                        const response = (imgError as any).response;
                        console.error(`❌ [IMAGE-GEN] HTTP Status:`, response?.status);
                        console.error(`❌ [IMAGE-GEN] Response data:`, response?.data);
                    }
                    if ('code' in imgError) {
                        console.error(`❌ [IMAGE-GEN] Error code:`, (imgError as any).code);
                    }
                }
                
                retryCount++;
                if (retryCount > maxRetries) {
                    console.error(`💀 [IMAGE-GEN] ALL RETRIES FAILED for "${itemText}". Using placeholder.`);
                } else {
                    console.log(`🔄 [IMAGE-GEN] Retrying in a moment... (${retryCount}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay before retry
                }
            }
        }

        return { text: itemText, imageUrl };
    });

    // Wait for all image generation to complete
    console.log(`🎨 [IMAGE-GEN] Waiting for all ${imageGenerationPromises.length} images to generate...`);
    const results = await Promise.all(imageGenerationPromises);
    generatedItems.push(...results);
    
    // Log results summary
    const successfulImages = generatedItems.filter(item => !item.imageUrl.includes('placehold.co')).length;
    const placeholderImages = generatedItems.filter(item => item.imageUrl.includes('placehold.co')).length;
    console.log(`📊 [IMAGE-GEN] INITIAL SUMMARY:`);
    console.log(`📊 [IMAGE-GEN] ✅ Successfully generated: ${successfulImages}/${generatedItems.length} images`);
    console.log(`📊 [IMAGE-GEN] 🖼️  Using placeholders: ${placeholderImages}/${generatedItems.length} images`);
    
    if (successfulImages === 0) {
        console.error(`💀 [IMAGE-GEN] CRITICAL: NO IMAGES WERE GENERATED! All are placeholders.`);
    } else if (placeholderImages > 0) {
        console.warn(`⚠️  [IMAGE-GEN] WARNING: Some images failed to generate. Trying AI-generated alternatives...`);
        
        // Get failed descriptions and successful ones
        const failedItems = generatedItems
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.imageUrl.includes('placehold.co'));
        
        const successfulDescriptions = generatedItems
            .filter(item => !item.imageUrl.includes('placehold.co'))
            .map(item => item.text);
        
        const failedDescriptions = failedItems.map(({ item }) => item.text);
        
        console.log(`🔄 [AI-ALT] Generating AI alternatives for ${failedItems.length} failed images...`);
        console.log(`🔄 [AI-ALT] Failed descriptions:`, failedDescriptions);
        console.log(`🔄 [AI-ALT] Successful descriptions to avoid:`, successfulDescriptions);
        
        // Generate AI alternatives
        try {
            const alternativesResult = await generateAlternativeDescriptionsPrompt({
                failedDescriptions,
                existingDescriptions: successfulDescriptions,
                numberOfAlternatives: failedItems.length
            });
            
            if (alternativesResult.output?.alternativeDescriptions && alternativesResult.output.alternativeDescriptions.length >= failedItems.length) {
                const alternatives = alternativesResult.output.alternativeDescriptions;
                console.log(`✅ [AI-ALT] Generated alternatives:`, alternatives);
                
                // Try generating images for each alternative
                for (let i = 0; i < failedItems.length; i++) {
                    const { index: failedIndex } = failedItems[i];
                    const alternativeDesc = alternatives[i];
                    
                    console.log(`🔄 [AI-ALT] Trying alternative "${alternativeDesc}" for failed index ${failedIndex}`);
                    
                    let retryCount = 0;
                    const maxRetries = 2;
                    let newImageUrl = placeholderUrl;
                    
                    while (retryCount <= maxRetries && newImageUrl.includes('placehold.co')) {
                        try {
                            console.log(`🎨 [AI-ALT] Attempt ${retryCount + 1}/${maxRetries + 1} for: "${alternativeDesc}"`);
                            
                            const imageResponse = await openai.images.generate({
                                model: "dall-e-2",
                                prompt: `A dreamy, surreal, whimsical illustration of ${alternativeDesc} in the style of Dixit board game artwork. Fantastical, fairy-tale like, with rich colors, ethereal lighting, and magical atmosphere. Imaginative and poetic interpretation with mysterious, storybook quality.`,
                                n: 1,
                                size: "512x512",
                                response_format: "url",
                            });
                            
                            if (imageResponse.data && imageResponse.data[0] && imageResponse.data[0].url) {
                                newImageUrl = imageResponse.data[0].url;
                                generatedItems[failedIndex] = { text: alternativeDesc, imageUrl: newImageUrl };
                                console.log(`✅ [AI-ALT] SUCCESS! "${alternativeDesc}" - URL: ${newImageUrl}`);
                                break;
                            }
                        } catch (error) {
                            console.error(`❌ [AI-ALT] Attempt ${retryCount + 1} failed for "${alternativeDesc}":`, (error as Error)?.message);
                            retryCount++;
                            if (retryCount <= maxRetries) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                            }
                        }
                    }
                    
                    if (newImageUrl.includes('placehold.co')) {
                        console.error(`💀 [AI-ALT] Alternative attempts also failed for index ${failedIndex}. Keeping original failed item.`);
                    }
                }
            } else {
                console.error(`❌ [AI-ALT] Failed to generate enough alternatives. Expected ${failedItems.length}, got ${alternativesResult.output?.alternativeDescriptions?.length || 0}`);
            }
        } catch (altError) {
            console.error(`❌ [AI-ALT] Error generating alternatives:`, altError);
            console.log(`🔄 [AI-ALT] Falling back to simple retry attempts...`);
            
            // Simple retry with different prompts as last resort
            for (const { index: failedIndex, item } of failedItems) {
                const simplifiedPrompt = `simple ${item.text.split(' ').slice(-1)[0]}`;
                console.log(`🔄 [AI-ALT] Last resort: trying simplified prompt "${simplifiedPrompt}" for index ${failedIndex}`);
                
                try {
                    const imageResponse = await openai.images.generate({
                        model: "dall-e-2",
                        prompt: `A dreamy, surreal, whimsical illustration of ${simplifiedPrompt} in Dixit board game style. Fantastical and magical atmosphere.`,
                        n: 1,
                        size: "512x512",
                        response_format: "url",
                    });
                    
                    if (imageResponse.data?.[0]?.url) {
                        generatedItems[failedIndex] = { 
                            text: item.text, // Keep original text
                            imageUrl: imageResponse.data[0].url 
                        };
                        console.log(`✅ [AI-ALT] Last resort SUCCESS for index ${failedIndex}`);
                    }
                } catch (lastError) {
                    console.error(`❌ [AI-ALT] Last resort also failed for index ${failedIndex}`);
                }
            }
        }
        
        // Final summary after alternatives
        const finalSuccessful = generatedItems.filter(item => !item.imageUrl.includes('placehold.co')).length;
        const finalPlaceholders = generatedItems.filter(item => item.imageUrl.includes('placehold.co')).length;
        console.log(`📊 [IMAGE-GEN] FINAL SUMMARY AFTER ALTERNATIVES:`);
        console.log(`📊 [IMAGE-GEN] ✅ Successfully generated: ${finalSuccessful}/${generatedItems.length} images`);
        console.log(`📊 [IMAGE-GEN] 🖼️  Using placeholders: ${finalPlaceholders}/${generatedItems.length} images`);
        
        if (finalSuccessful === generatedItems.length) {
            console.log(`🎉 [IMAGE-GEN] PERFECT: All images now successfully generated with alternatives!`);
        }
    } else {
        console.log(`🎉 [IMAGE-GEN] PERFECT: All images generated successfully!`);
    }
    
    // Ensure we have the correct number of items
    while (generatedItems.length < input.numberOfImages) {
        const fallbackDesc = `Fallback Object ${generatedItems.length + 1}`;
        console.warn(`[generateImagesAndCluesFlow] Adding placeholder for missing item ${generatedItems.length + 1}. Description: ${fallbackDesc}`);
        generatedItems.push({ text: fallbackDesc, imageUrl: placeholderUrl });
    }
    generatedItems.length = input.numberOfImages; // Ensure exactly the number of items requested.

    // Step 3: Select Target and Generate Clue using Genkit (OpenAI text model)
    let targetAndClueResult: { targetItemDescription: string; clueHolderClue: string; };
    const descriptionsForCluePrompt = generatedItems.map(item => item.text).filter(text => text && text.trim() !== "");
    
    if (descriptionsForCluePrompt.length === 0) {
        console.error("[generateImagesAndCluesFlow] No valid descriptions available for clue prompt. Using hard fallbacks.");
        targetAndClueResult = {
            targetItemDescription: generatedItems[0]?.text || "Error Object",
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
            const fallbackTargetDesc = descriptionsForCluePrompt[0] || generatedItems[0]?.text || "Error Object";
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
            text: `Fallback Item ${i+1}`,
            imageUrl: placeholderUrl
        }));
        if (!finalItemsArray.some(item => item.text === finalTargetDesc)) {
            finalTargetDesc = finalItemsArray[0]?.text || "Default Target Final";
        }
    }

    // Update game history
    const updatedGameHistory = {
        usedDescriptions: [...gameHistory.usedDescriptions, ...finalItemsArray.map(item => item.text)],
        usedThemes: [...gameHistory.usedThemes, selectedTheme],
        gameCount: gameHistory.gameCount + 1,
        lastTheme: selectedTheme,
    };

    return {
        targetItemDescription: finalTargetDesc,
        items: finalItemsArray,
        clueHolderClue: finalClue,
        gameHistoryUpdate: updatedGameHistory,
    };
  }
);
