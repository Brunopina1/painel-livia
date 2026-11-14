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
      'https://googleapis.com',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'Api-Revision': '2026-05-20'
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          input: prompt
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

    const stepSaida = (data.steps || []).find(s => s.type === 'model_output');
    const blocoTexto = (stepSaida?.content || []).find(c => c.type === 'text');
    const textoGerado = blocoTexto?.text || data.output_text || '';

    if (!textoGerado) {
      return Response.json(
        { error: 'O Google respondeu sem texto gerado: ' + JSON.stringify(data).slice(0, 150) },
        { status: 502 }
      );
    }

    return Response.json(
      { candidates: [{ content: { parts: [{ text: textoGerado }] } }] },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      { error: 'Falha interna na função: ' + error.message },
      { status: 500 }
    );
  }
}
