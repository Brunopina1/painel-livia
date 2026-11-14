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

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
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

    const textoBruto = await response.text();
    let data;
    try {
      data = JSON.parse(textoBruto);
    } catch {
      return Response.json(
        { error: `Resposta inválida do Google (HTTP ${response.status}): ${textoBruto.slice(0, 150)}` },
        { status: 502 }
      );
    }

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
