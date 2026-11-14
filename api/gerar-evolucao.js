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

    // 1. Consulta os modelos exatamente liberados para esta chave
    const listRes = await fetch(
      'https://googleapis.com',
      { headers: { 'x-goog-api-key': apiKey } }
    );

    const listText = await listRes.text();
    let listData;
    try {
      listData = JSON.parse(listText);
    } catch {
      return Response.json(
        { error: `Chave rejeitada pelo endpoint AI Studio (HTTP ${listRes.status}). Use uma chave criada no Google AI Studio (://google.com).` },
        { status: 502 }
      );
    }

    if (!listRes.ok) {
      return Response.json(
        { error: listData.error?.message || `Erro HTTP ${listRes.status} ao listar modelos` },
        { status: listRes.status }
      );
    }

    // 2. Filtra apenas modelos que suportam generateContent
    const modelosDisponiveis = (listData.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name); // ex: "models/gemini-3.8-flash"

    if (modelosDisponiveis.length === 0) {
      return Response.json(
        { error: 'Nenhum modelo generateContent habilitado nesta chave.' },
        { status: 404 }
      );
    }

    // Prioriza modelos flash mais recentes disponíveis na conta
    const modeloEscolhido =
      modelosDisponiveis.find(n => n.includes('3.8-flash')) ||
      modelosDisponiveis.find(n => n.includes('flash')) ||
      modelosDisponiveis;

    // 3. Gera o texto usando o modelo exato confirmado pela conta
    const response = await fetch(
      `https://googleapis.com{modeloEscolhido}:generateContent`,
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
        { error: `Erro no modelo ${modeloEscolhido} (HTTP ${response.status}). Modelos da sua conta: ${modelosDisponiveis.join(', ')}` },
        { status: 502 }
      );
    }

    if (!response.ok) {
      return Response.json(
        { error: `[${modeloEscolhido}] ${data.error?.message || response.status} | Disponíveis: ${modelosDisponiveis.join(', ')}` },
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
