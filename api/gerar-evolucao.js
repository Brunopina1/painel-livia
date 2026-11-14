export async function POST(request) {
  try {
    const body = await request.json();
    const prompt = body.prompt;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: 'Chave GEMINI_API_KEY não encontrada nas variáveis da Vercel.' },
        { status: 500 }
      );
    }

    const response = await fetch(
      'https://googleapis.com',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: data.error?.message || `Erro HTTP ${response.status} no Google Gemini` },
        { status: response.status }
      );
    }

    return Response.json(data, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: 'Falha interna na função: ' + error.message },
      { status: 500 }
    );
  }
}
