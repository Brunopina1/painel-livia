import https from 'node:https';

function fazerRequisicaoHTTPS(urlString, options = {}, bodyData = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 25000
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
      reject(new Error(`Falha de rede HTTPS: ${err.message}`));
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

  // Detecta automaticamente se a chave é do Vertex AI Express (AQ.) ou AI Studio (AIza)
  const isChaveAQ = apiKey.startsWith('AQ.');

  // Lista de modelos ativos para testar em ordem de prioridade
  const modelos = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ];

  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  let ultimoErro = '';

  for (const modelo of modelos) {
    try {
      // Chaves AQ. usam o endpoint ://googleapis.com (Vertex AI Express)
      // Chaves AIza usam o endpoint ://googleapis.com (AI Studio)
      const url = isChaveAQ
        ? `https://://googleapis.com/v1/publishers/google/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`
        : `https://://googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const response = await fazerRequisicaoHTTPS(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        },
        payload
      );

      let data;
      try {
        data = JSON.parse(response.text);
      } catch (e) {
        ultimoErro = `HTTP ${response.status} (${modelo}) retornou HTML em vez de JSON.`;
        continue;
      }

      const candidato = data.candidates && data.candidates;
      const parte = candidato && candidato.content && candidato.content.parts && candidato.content.parts;

      if (response.ok && parte && parte.text) {
        return res.status(200).json({
          texto: parte.text,
          evolucao: parte.text,
          resultado: parte.text,
          modeloUtilizado: modelo
        });
      }

      ultimoErro = `HTTP ${response.status} (${modelo}): ${data.error?.message || 'Erro desconhecido'}`;
    } catch (err) {
      ultimoErro = `Falha na requisição (${modelo}): ${err.message}`;
    }
  }

  return res.status(500).json({
    error: `Nenhum modelo aceitou a requisição. Último retorno: ${ultimoErro}`
  });
}
