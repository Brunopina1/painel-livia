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

    // 1. Tenta primeiro a Interactions API oficial (modelo gemini-4-hydrogen da documentação)
    const intRes = await fetch(
      'https://googleapis.com',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
          'Api-Revision': '2026-05-20'
        },
        body: JSON.stringify({
          model: 'gemini-4-hydrogen',
          input: prompt
        })
      }
    );

    const intText = await intRes.text();
    let intData = null;
    try { intData = JSON.parse(intText); } catch {}

    if (intRes.ok && intData) {
      const stepSaida = (intData.steps || []).find(s => s.type === 'model_output');
      const blocoTexto = (stepSaida?.content || []).find(c => c.type === 'text');
      const textoGerado = blocoTexto?.text || intData.output_text || '';
      if (textoGerado) {
        return Response.json(
          { candidates: [{ content: { parts: [{ text: textoGerado }] } }] },
          { status: 200 }
        );
      }
    }

    // 2. Fallback automático para modelos ativos no endpoint generateContent
    const modelos = ['gemini-4-hydrogen', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.0-flash'];
    let ultimoErro = intData?.error?.message || `HTTP ${intRes.status}`;

    for (const modelo of modelos) {
      const res = await fetch(
        `https://googleapis.com{modelo}:generateContent`,
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

      const raw = await res.text();
      let data = null;
      try { data = JSON.parse(raw); } catch {}

      if (res.ok && data?.candidates?.?.content?.parts?.?.text) {
        return Response.json(data, { status: 200 });
      }

      if (data?.error?.message) {
        ultimoErro = `[${modelo}] ${data.error.message}`;
      }
    }

    return Response.json(
      { error: `Nenhum modelo aceitou a requisição. Último retorno: ${ultimoErro}` },
      { status: 400 }
    );
  } catch (error) {
    return Response.json(
      { error: 'Falha interna na função: ' + error.message },
      { status: 500 }
    );
  }
}
