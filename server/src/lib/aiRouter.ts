
export async function generateAIResponse(
  prompt: string,
  systemPrompt: string
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  // PRIMARY: GROQ
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
            model: "openai/gpt-oss-20b",
            messages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }

      const answer = data.choices?.[0]?.message?.content;

      if (answer) {
        console.log("[AI ROUTER] Groq succeeded.");
        return answer;
      }

      throw new Error("Empty response from Groq.");
    } catch (error) {
      console.error("[AI ROUTER] Groq failed:", error);
    }
  }

  // FALLBACK: OPENROUTER
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
        throw new Error(data.error?.message || `HTTP ${response.status}`);
      }

      const answer = data.choices?.[0]?.message?.content;

      if (answer) {
        console.log("[AI ROUTER] OpenRouter succeeded.");
        return answer;
      }

      throw new Error("Empty response from OpenRouter.");
    } catch (error) {
      console.error("[AI ROUTER] OpenRouter failed:", error);
    }
  }

  throw new Error("All AI providers failed.");
}

