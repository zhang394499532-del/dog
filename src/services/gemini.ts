async function getConfig() {
  const response = await fetch("/api/config");
  return await response.json();
}

async function callChat(messages: any[], config: any, model?: string): Promise<string> {
  const { key, url, model: defaultModel } = config.api.llm;
  
  // Normalize URL
  let baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  if (!baseUrl.endsWith('/v1')) {
    baseUrl += '/v1';
  }

  console.log(`Calling LLM API: ${baseUrl}/chat/completions with model ${model || defaultModel}`);

  // Clean messages to ensure image_url is formatted correctly for proxies
  const cleanedMessages = messages.map(msg => {
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((part: any) => {
          if (part.type === 'image_url' && part.image_url?.url) {
            let cleanUrl = part.image_url.url.trim();
            return {
              ...part,
              image_url: { url: cleanUrl }
            };
          }
          return part;
        })
      };
    }
    return msg;
  });

  console.log("Cleaned messages for LLM API:", JSON.stringify(cleanedMessages).substring(0, 1000) + "...");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout for LLM

  try {
    console.log(`Sending request to LLM API...`);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: model || defaultModel,
        messages: cleanedMessages,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`LLM API Response status: ${response.status}`);

    if (!response.ok) {
      const err = await response.text();
      console.error("LLM API Error:", err);
      throw new Error(`AI Error: ${err}`);
    }

    let data;
    try {
      data = await response.json();
      console.log("LLM API JSON parsed successfully");
    } catch (jsonErr) {
      const rawBody = await response.text();
      console.error("Failed to parse LLM API response as JSON. Raw body:", rawBody);
      throw new Error("AI 返回了非 JSON 格式的数据，请检查 API 配置或模型状态");
    }
    
    if (data.error) {
      console.error("LLM API returned an error in JSON:", data.error);
      throw new Error(`AI Error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const content = data.choices?.[0]?.message?.content || "";
    console.log(`LLM Content length: ${content.length}`);
    return content;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.error("LLM API Call timed out after 90s");
      throw new Error("AI 响应超时，请重试");
    }
    console.error("LLM API Call failed:", e);
    throw e;
  }
}

async function generateImage(prompt: string, config: any, base64Image?: string, retries = 0): Promise<string | null> {
  const { key, url, model: imageModel } = config.api.image;
  
  // Normalize URL
  let baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  
  const cleanPrompt = prompt
    .replace(/#+\s/g, "")
    .replace(/\*\*|\*/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim()
    .substring(0, 1000);

  const isGeminiImageModel = imageModel.includes('gemini-3.1-flash-image-preview');

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    try {
      let response;
      
      if (isGeminiImageModel) {
        // Use Gemini-specific generateContent endpoint as requested
        // Note: We assume the proxy handles the /v1beta path or we use the base URL
        const geminiUrl = baseUrl.includes('/v1') 
          ? baseUrl.replace('/v1', `/v1beta/models/${imageModel}:generateContent`)
          : `${baseUrl}/v1beta/models/${imageModel}:generateContent`;

        console.log(`Requesting Gemini Image Generation (Attempt ${i + 1}): ${geminiUrl}`);
        
        const parts: any[] = [{ text: cleanPrompt }];
        if (base64Image) {
          const base64Data = base64Image.split(',')[1] || base64Image;
          parts.push({
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          });
        }

        response = await fetch(geminiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key // Some proxies use this, others use Authorization
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ["IMAGE"]
            }
          }),
          signal: controller.signal
        });
        
        // If x-goog-api-key fails, try Authorization
        if (response.status === 401 || response.status === 403) {
          response = await fetch(geminiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${key}`
            },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                responseModalities: ["IMAGE"]
              }
            }),
            signal: controller.signal
          });
        }
      } else {
        // Standard OpenAI /v1/images/generations
        const oaiUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/images/generations` : `${baseUrl}/v1/images/generations`;
        console.log(`Requesting OpenAI-style Image Generation (Attempt ${i + 1}): ${oaiUrl}`);
        
        const body: any = {
          model: imageModel,
          prompt: cleanPrompt,
          n: 1,
          response_format: "b64_json"
        };
        
        // Some proxies support an 'image' field for image-to-image in /v1/images/generations
        if (base64Image) {
          body.image = base64Image;
        }

        response = await fetch(oaiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);
      console.log(`Image API Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Image API Error:`, errorText);
        if (i === retries) throw new Error(`图片生成失败 (${response.status}): ${errorText}`);
        await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
        continue;
      }

      const data = await response.json();
      
      // Handle Gemini response format
      if (isGeminiImageModel && data.candidates?.[0]?.content?.parts) {
        const imagePart = data.candidates[0].content.parts.find((p: any) => p.inlineData);
        if (imagePart) {
          return `data:image/png;base64,${imagePart.inlineData.data}`;
        }
      }

      // Handle OpenAI response format
      if (data.data?.[0]?.b64_json) {
        return `data:image/png;base64,${data.data[0].b64_json}`;
      } else if (data.data?.[0]?.url) {
        return data.data[0].url;
      }
      
      throw new Error("接口返回数据格式错误：缺少图片数据");
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error(`Image generation error:`, e);
      if (i === retries) throw e;
      await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
    }
  }
  return null;
}

// Step 2: Extract info from front packaging
export async function extractProductInfo(base64Image: string, productType: string, config: any): Promise<string> {
  const stepConfig = config.step2;
  
  const prompt = `这是一张${productType}产品的包装正面图。${stepConfig.prompt}`;
  
  return await callChat([
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: base64Image } }
      ]
    }
  ], config);
}

// Step 3: Generate Character Card Description & Poster
export async function generateCharacterCard(
  images: { front: string; side: string; back: string; kibble: string },
  extractedInfo: string,
  dims: { length: string; width: string; thickness: string; kibbleTraits: string },
  productType: string,
  config: any
): Promise<{ desc: string; posterImage: string | null; error?: string }> {
  const step3Config = config.step3;
  
  let prompt = `这是一组${productType}产品的多角度实拍图。\n${step3Config.prompt}`
    .replace("{{extractedInfo}}", extractedInfo)
    .replace("{{length}}", dims.length)
    .replace("{{width}}", dims.width)
    .replace("{{thickness}}", dims.thickness)
    .replace("{{kibbleTraits}}", dims.kibbleTraits);

  const content: any[] = [{ type: "text", text: prompt }];
  
  if (images.front) content.push({ type: "image_url", image_url: { url: images.front } });
  if (images.side) content.push({ type: "image_url", image_url: { url: images.side } });
  if (images.back) content.push({ type: "image_url", image_url: { url: images.back } });
  if (images.kibble) content.push({ type: "image_url", image_url: { url: images.kibble } });

  console.log("Step 2: Starting generateCharacterCard");
  const desc = await callChat([
    {
      role: "user",
      content
    }
  ], config);
  console.log("Step 2: LLM description generated");

  // Generate a beautiful marketing poster based on the description
  console.log("Step 2: Starting image generation for poster");
  const posterPrompt = `
    Create a professional, high-end marketing product poster for this ${productType}.
    The poster should be an "Infographic Spec Sheet" style.
    Include:
    1. A large, beautiful hero shot of the product.
    2. Small inset diagrams or icons showing dimensions: ${dims.length}x${dims.width}x${dims.thickness}cm.
    3. Visual details of the kibble (texture, shape).
    4. Key selling points from this description: ${desc.substring(0, 500)}.
    Style: Minimalist, clean, premium lighting, studio background.
    Layout: Professional graphic design, balanced composition.
  `;

  try {
    const posterImage = await generateImage(posterPrompt, config, images.front);
    console.log("Step 2: Image generation completed");
    return { desc, posterImage };
  } catch (e: any) {
    console.error("Poster generation failed", e);
    return { desc, posterImage: null, error: e.message };
  }
}

// Step 4: Generate Ad Copy
export async function generateAdCopy(
  images: { front: string | null; side: string | null; back: string | null; kibble: string | null },
  extractedInfo: string,
  cardDesc: string,
  styleId: string,
  durationId: string,
  productType: string,
  config: any,
  customStyle?: string
): Promise<string[]> {
  const stepConfig = config.step4;
  
  const selectedStyle = stepConfig.styles.find((s: any) => s.id === styleId);
  const selectedDuration = stepConfig.durations.find((d: any) => d.id === durationId);
  
  let selectedPrompt = selectedStyle?.prompt || "";
  if (styleId === 'custom' && customStyle) {
    selectedPrompt = `自定义风格：${customStyle}`;
  }
  const durationValue = selectedDuration?.value || durationId;

  // Prepare image parts
  const imageParts = [];
  if (images.front) imageParts.push({ type: "image_url", image_url: { url: images.front } });
  if (images.side) imageParts.push({ type: "image_url", image_url: { url: images.side } });
  if (images.back) imageParts.push({ type: "image_url", image_url: { url: images.back } });
  if (images.kibble) imageParts.push({ type: "image_url", image_url: { url: images.kibble } });

  const response = await callChat([
    {
      role: "user",
      content: [
        { 
          type: "text", 
          text: `请为这款${productType}生成3个不同侧重点的广告文案。
          
          **核心参考资料：**
          1. 产品包装提取信息：${extractedInfo}
          2. 产品细节与规格描述：${cardDesc}
          
          **生成要求：**
          - 风格：${selectedPrompt}
          - 时长：${durationValue}
          - 请务必结合产品包装上的文字信息（如成分、卖点、品牌名）以及上传的细节图（如颗粒形状、包装质感）来创作。
          - 文案应具有吸引力，符合所选风格。
          
          请以JSON数组格式输出，每个元素是一个包含"title"和"content"的对象。
          示例格式：[{"title": "...", "content": "..."}, {"title": "...", "content": "..."}, {"title": "...", "content": "..."}]` 
        },
        ...imageParts
      ]
    }
  ], config);

  try {
    const jsonStr = response.replace(/```json|```/g, "").trim();
    const options = JSON.parse(jsonStr);
    if (Array.isArray(options)) {
      return options.map((opt: any) => `### ${opt.title}\n\n${opt.content}`);
    }
    return [response];
  } catch (e) {
    console.error("Failed to parse ad copy options:", e);
    return [response];
  }
}

// Step 5: Generate Storyboard Prompt & Image
export async function generateStoryboard(
  frontImage: string,
  cardDesc: string,
  adCopy: string,
  productType: string,
  config: any
): Promise<{ prompt: string; imageBase64: string | null; error?: string }> {
  const stepConfig = config.step5;

  // 1. Generate the grid prompt
  const activeGrid = stepConfig.activeGrid;
  const gridConfig = stepConfig.grids[activeGrid];
  
  let prompt = `### **任务目标：基于广告文案生成分镜脚本**

**核心指令：** 
你必须严格根据以下提供的【广告文案】来设计分镜脚本。**【广告文案】的内容具有最高优先级**，所有的视觉画面、动作描述和情节走向都必须紧扣文案中的每一个关键点。

**【广告文案】（核心参考）：**
${adCopy}

---

**产品细节描述：**
${cardDesc}

---

**分镜布局与风格要求：**
${gridConfig.prompt}
`;

  if (stepConfig.visualStyle) prompt += `\n**视觉风格补充：** ${stepConfig.visualStyle}`;
  if (stepConfig.composition) prompt += `\n**构图要求补充：** ${stepConfig.composition}`;

  const storyboardPrompt = await callChat([
    {
      role: "user",
      content: [
        { type: "text", text: prompt }
      ]
    }
  ], config);

  // 2. Generate the image
  try {
    const imageBase64 = await generateImage(storyboardPrompt, config, frontImage);
    return { prompt: storyboardPrompt, imageBase64 };
  } catch (e: any) {
    console.error("Storyboard image generation failed", e);
    return { prompt: storyboardPrompt, imageBase64: null, error: e.message };
  }
}
