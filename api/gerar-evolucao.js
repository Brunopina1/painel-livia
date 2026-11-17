export default async function handler(req, res) {
  // Permite apenas requisições POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // Aceita diferentes nomes de campo enviados pelo painel.html
  const body = req.body || {};
  const prompt = body.prompt || body.texto || body.descricao || body.relato;

  if (!prompt) {
    return res.status(400).json({ error: 'Nenhum texto foi enviado para a IA processar.' });
  }

  // Busca a chave configurada nas variáveis de ambiente da Vercel
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ 
      error: 'Chave da API não encontrada nas configurações da Vercel (GEMINI_API_KEY).' 
    });
  }

  try {
    // 1. Consulta a API do Google para listar os modelos ativos na sua conta
    const listaRes = await fetch('https://googleapis.com', {
      method: 'GET',
      headers: { 'x-goog-api-key': apiKey }
    });

    const listaData = await listaRes.json();

    if (!listaRes.ok) {
      return res.status(listaRes.status).json({
        error: `Erro ao consultar modelos no Google: ${listaData.error?.message || 'Status ' + listaRes.status}`
      });
    }

    // 2. Filtra apenas modelos que geram texto (generateContent) e evita modelos experimentais pesados
    let modelosDisponiveis = (listaData.models || [])
      .filter(m => 
        m.supportedGenerationMethods?.includes('generateContent') &&
        !m.name.includes('embedding') &&
        !m.name.includes('aqa') &&
        !m.name.includes('imagen') &&
        !m.name.includes('veo')
      )
      .map(m => m.name.replace('models/', ''));

    // 3. Ordena para priorizar os modelos da família "flash" (mais rápidos e ideais para texto)
    modelosDisponiveis.sort((a, b) => {
      const aFlash = a.includes('flash') ? 0 : 1;
      const bFlash = b.includes('flash') ? 0 : 1;
      if (aFlash !== bFlash) return aFlash - bFlash;
      return b.localeCompare(a); // Coloca as versões numéricas mais novas primeiro
    });

    if (modelosDisponiveis.length === 0) {
      return res.status(500).json({ 
        error: 'Nenhum modelo compatível com geração de texto foi encontrado nesta conta.' 
      });
    }

    // 4. Tenta gerar a evolução usando os modelos descobertos (até encontrar o primeiro que aceite)
    let ultimoErro = '';

    for (const modelo of modelosDisponiveis) {
      try {
        const url = `https://googleapis.com/${modelo}:generateContent`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const data = await response.json();

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const respostaGerada = data.candidates[0].content.parts[0].text;
          
          // Retorna múltiplos formatos de chave para garantir compatibilidade com seu painel.html
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
