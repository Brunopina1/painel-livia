export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const body = req.body || {};
  const prompt = body.prompt || body.texto || body.descricao || body.relato;

  if (!prompt) {
    return res.status(400).json({ error: 'Nenhum texto foi enviado para a IA processar.' });
  }

  // .trim() remove espaços ou quebras de linha acidentais ao colar a chave na Vercel
  const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const apiKey = rawKey.trim();

  if (!apiKey) {
    return res.status(500).json({ 
      error: 'Chave da API não encontrada nas configurações da Vercel (GEMINI_API_KEY).' 
    });
  }

  try {
    // 1. Consulta os modelos passando a chave na URL (mais seguro contra bloqueio de headers)
    const listaRes = await fetch(
      `https://googleapis.com{encodeURIComponent(apiKey)}`,
      { method: 'GET' }
    );

    const listaTexto = await listaRes.text();
    let listaData;

    try {
      listaData = JSON.parse(listaTexto);
    } catch (e) {
      return res.status(502).json({
        error: `O Google retornou HTML em vez de JSON (Status ${listaRes.status}). Início do retorno: ${listaTexto.substring(0, 120)}`
      });
    }

    if (!listaRes.ok) {
      return res.status(listaRes.status).json({
        error: `Erro ao consultar modelos no Google: ${listaData.error?.message || 'Status ' + listaRes.status}`
      });
    }

    // 2. Filtra apenas modelos que geram texto
    let modelosDisponiveis = (listaData.models || [])
      .filter(m => 
        m.supportedGenerationMethods?.includes('generateContent') &&
        !m.name.includes('embedding') &&
        !m.name.includes('aqa') &&
        !m.name.includes('imagen') &&
        !m.name.includes('veo')
      )
      .map(m => m.name.replace('models/', ''));

    // 3. Prioriza modelos "flash" mais recentes
    modelosDisponiveis.sort((a, b) => {
      const aFlash = a.includes('flash') ? 0 : 1;
      const bFlash = b.includes('flash') ? 0 : 1;
      if (aFlash !== bFlash) return aFlash - bFlash;
      return b.localeCompare(a);
    });

    if (modelosDisponiveis.length === 0) {
      return res.status(500).json({ 
        error: 'Nenhum modelo compatível com geração de texto foi encontrado nesta conta.' 
      });
    }

    // 4. Tenta gerar a evolução
    let ultimoErro = '';

    for (const modelo of modelosDisponiveis) {
      try {
        const url = `https://googleapis.com{modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const respTexto = await response.text();
        let data;

        try {
          data = JSON.parse(respTexto);
        } catch (e) {
          ultimoErro = `HTTP ${response.status} (${modelo}) retornou HTML: ${respTexto.substring(0, 100)}`;
          continue;
        }

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const respostaGerada = data.candidates[0].content.parts[0].text;
          
          return res.status(200).json({
            texto: respostaGerada,
            evolucao: respostaGerada,
            resultado: respostaGerada,
            modeloUtilizado: modelo
          });
        }

        ultimoErro = `HTTP ${response.status} no modelo ${modelo}: ${data.error?.message || 'Erro desconhecido'}`;
      } catch (err) {
        ultimoErro = `Falha na requisição (${modelo}): ${err.message}`;
      }
    }

    return res.status(500).json({
      error: `Nenhum modelo aceitou a requisição. Último retorno: ${ultimoErro}`
    });

  } catch (error) {
    return res.status(500).json({
      error: `Erro interno no servidor da Vercel: ${error.message}`
    });
  }
}
