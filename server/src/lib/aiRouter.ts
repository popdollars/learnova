export async function generateAIResponse(prompt: string, systemPrompt: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    try {
      console.log("[AI ROUTER] Trying Groq...");
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0]?.message?.content) return data.choices[0].message.content;
    } catch (error) { console.error("[AI ROUTER] Groq failed:", error); }
  }
  
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log("[AI ROUTER] Trying OpenRouter...");
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://learnova-one-psi.vercel.app", "X-Title": "Learnova" },
        body: JSON.stringify({ model: "meta-llama/llama-3-8b-instruct:free", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }] })
      });
      const data = await response.json();
      if (data.choices && data.choices[0]?.message?.content) return data.choices[0].message.content;
    } catch (error) { console.error("[AI ROUTER] OpenRouter failed:", error); }
  }
  
  throw new Error("All AI providers failed. Check API keys.");
}