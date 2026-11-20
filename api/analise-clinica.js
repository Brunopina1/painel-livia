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
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: 'Você é um Diretor Clínico e Terapeuta Ocupacional Sênior, especialista em supervisão de casos clínicos, gestão de qualidade terapêutica e raciocínio clínico baseado em evidências.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erro na API da Groq' });
    }

    const textoGerado = data.choices[0].message.content;
    return res.status(200).json({ 
      candidates: [{ content: { parts: [{ text: textoGerado }] } }] 
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
