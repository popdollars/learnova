
export async function generateAIResponse(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  const errors: string[] = [];

  // 1. GROQ
  if (process.env.GROQ_API_KEY) {
    try {
      console.log("[AI ROUTER] Trying Groq...");

      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || `Groq HTTP ${response.status}`
        );
      }

      const answer = data.choices?.[0]?.message?.content;

      if (answer) {
        console.log("[AI ROUTER] Groq succeeded.");
        return answer;
      }

      throw new Error("Groq returned an empty response.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      errors.push(`Groq: ${message}`);
      console.error("[AI ROUTER] Groq failed:", message);
    }
  }

  // 2. OPENROUTER FALLBACK
  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log("[AI ROUTER] Trying OpenRouter...");

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://learnova-one-psi.vercel.app",
            "X-Title": "Learnova",
          },
          body: JSON.stringify({
            model: "openrouter/free",
            messages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error?.message || `OpenRouter HTTP ${response.status}`
        );
      }

      const answer = data.choices?.[0]?.message?.content;

      if (answer) {
        console.log("[AI ROUTER] OpenRouter succeeded.");
        return answer;
      }

      throw new Error("OpenRouter returned an empty response.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      errors.push(`OpenRouter: ${message}`);
      console.error("[AI ROUTER] OpenRouter failed:", message);
    }
  }

  throw new Error(
    `All AI providers failed. ${errors.join(" | ") || "No API keys configured."}`
  );
}
