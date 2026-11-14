import { GoogleGenAI } from 'https://esm.sh';

export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = body.prompt;
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return Response.json(
        { error: 'Chave GEMINI_API_KEY não configurada na Vercel.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Usa a Interactions API oficial recomendada pelo Google para chaves AQ.
    const interaction = await ai.interactions.create({
      model: 'gemini-3.8-flash',
      input: prompt
    });

    const textoGerado = interaction.output_text;

    if (!textoGerado) {
      return Response.json(
        { error: 'Resposta sem texto: ' + JSON.stringify(interaction).slice(0, 150) },
        { status: 502 }
      );
    }

    return Response.json(
      { candidates: [{ content: { parts: [{ text: textoGerado }] } }] },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      { error: 'Erro SDK Gemini: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}
