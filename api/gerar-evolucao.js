import https from 'node:https';

// Função auxiliar usando o módulo HTTPS nativo do Node.js (evita o erro "fetch failed" na Vercel)
function fazerRequisicaoHTTPS(urlString, options = {}, bodyData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 25000 // 25 segundos de limite
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          text: data
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Tempo limite excedido ao conectar com o Google (Timeout).'));
    });

    req.on('error', (err) => {
      reject(new Error(`Falha de rede HTTPS: ${err.message} (Código: ${err.code || 'N/A'})`));
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const body = req.body || {};
  const prompt = body.prompt || body.texto || body.descricao || body.relato;

  if (!prompt) {
    return res.status(400).json({ error: 'Nenhum texto foi enviado para a IA processar.' });
  }

  const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const apiKey = rawKey.trim();

  if (!apiKey) {
    return res.status(500).json({
      error: 'Chave da API não encontrada nas configurações da Vercel (GEMINI_API_KEY).'
    });
  }

  try {
    // 1. Lista os modelos disponíveis na conta usando o cabeçalho oficial x-goog-api-key
    const listaRes = await fazerRequisicaoHTTPS(
      'https://googleapis.com',
      {
        method: 'GET',
        headers: {
          'x-goog-api-key': apiKey,
          'Accept': 'application/json'
        }
      }
    );

    let listaData;
    try {
      listaData = JSON.parse(listaRes.text);
    } catch (e) {
      return res.status(502).json({
        error: `O Google retornou formato inválido (Status ${listaRes.status}): ${listaRes.text.substring(0, 120)}`
      });
    }

    if (!listaRes.ok) {
      return res.status(listaRes.status).json({
        error: `Erro ao consultar modelos no Google: ${listaData.error?.message || 'Status ' + listaRes.status}`
      });
    }

    // 2. Filtra apenas modelos de texto compatíveis com generateContent
    let modelosDisponiveis = (listaData.models || [])
      .filter(m =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        !m.name.includes('embedding') &&
        !m.name.includes('aqa') &&
        !m.name.includes('imagen') &&
        !m.name.includes('veo')
      )
      .map(m => m.name.replace('models/', ''));

    // 3. Prioriza modelos da família "flash" mais recentes
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

    // 4. Tenta gerar o texto clínico estruturado
    let ultimoErro = '';
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    });

    for (const modelo of modelosDisponiveis) {
      try {
        const url = `https://googleapis.com/${modelo}:generateContent`;

        const response = await fazerRequisicaoHTTPS(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'x-goog-api-key': apiKey
            }
          },
          payload
        );

        let data;
        try {
          data = JSON.parse(response.text);
        } catch (e) {
          ultimoErro = `HTTP ${response.status} (${modelo}) retornou texto inválido.`;
          continue;
        }

        const candidato = data.candidates && data.candidates[0];
        const parte = candidato && candidato.content && candidato.content.parts && candidato.content.parts[0];

        if (response.ok && parte && parte.text) {
          return res.status(200).json({
            texto: parte.text,
            evolucao: parte.text,
            resultado: parte.text,
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
