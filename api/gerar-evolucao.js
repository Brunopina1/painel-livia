export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { prompt } = req.body;
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave da API da Groq não configurada na Vercel.' });
  }

  try {
    // A Groq usa o formato compatível com OpenAI
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // Modelo que substituiu o Llama 3.3 descontinuado [citation:2][citation:7]
        messages: [
          { role: 'system', content: 'Você é um assistente especialista em Terapia Ocupacional.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2 // Valor baixo para o texto ficar mais fiel ao prompt e menos "criativo"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erro na API da Groq' });
    }

    // A resposta da Groq vem no formato choices[0].message.content
    const textoGerado = data.choices[0].message.content;
    
    // Retornamos no mesmo formato que o painel espera (candidates...)
    return res.status(200).json({ 
      candidates: [{ content: { parts: [{ text: textoGerado }] } }] 
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
