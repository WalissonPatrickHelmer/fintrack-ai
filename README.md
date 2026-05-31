Aqui está uma descrição completa para o repositório:

---

**Nome do repositório:**
```
fintrack-ai
```

**Descrição curta (tagline):**
```
Sistema financeiro inteligente com IA — controle despesas e receitas por texto, voz ou foto, integrado ao Google Sheets
```

**README.md:**

---

# 💸 FinTrack AI

> Sistema financeiro pessoal inteligente, integrado ao Google Sheets e com análise por IA.

![HTML](https://img.shields.io/badge/HTML-E34F26?style=flat&logo=html5&logoColor=white)

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

![Google Sheets](https://img.shields.io/badge/Google_Sheets-34A853?style=flat&logo=google-sheets&logoColor=white)

![Claude AI](https://img.shields.io/badge/Claude_AI-D97757?style=flat&logo=anthropic&logoColor=white)

## 🚀 Funcionalidades

- **📝 Entrada por texto** — descreva naturalmente e a IA classifica automaticamente
- **🎤 Entrada por voz** — fale e o sistema transcreve e analisa
- **📸 Entrada por foto** — tire foto do cupom fiscal e o OCR extrai os dados
- **✏️ Entrada manual** — preencha os campos diretamente
- **📊 Dashboard** — gráficos de evolução mensal e gastos por categoria
- **🔗 Google Sheets** — todos os dados sincronizam automaticamente com a planilha
- **🏷️ Categorias personalizáveis** — adicione e remova categorias
- **📥 Exportar CSV** — exporte seus dados quando quiser
- **☁️ Limpar planilha** — apague os dados remotamente pelo app

## 🧠 Como a IA funciona

Você digita por exemplo:
```
Gastei 42 reais no supermercado
Recebi 1500 de freelance
Conta de luz 180 reais
Uber até o centro 25 reais
```
O sistema identifica automaticamente **tipo**, **categoria**, **valor** e **data** — sem precisar preencher nada.

## 🛠️ Stack

| Tecnologia | Uso |
|---|---|
| HTML + CSS + JS puro | Frontend completo sem frameworks |
| Chart.js | Gráficos do dashboard |
| Tesseract.js | OCR local para leitura de fotos |
| Web Speech API | Reconhecimento de voz |
| Google Apps Script | Backend / API REST |
| Google Sheets | Banco de dados |
| Claude AI (Anthropic) | Análise inteligente de texto e imagem |

## ⚙️ Como usar

**1. Clone o repositório**
```bash
git clone https://github.com/seuusuario/fintrack-ai.git
```

**2. Configure o Google Apps Script**

Na sua planilha do Google Sheets, vá em **Extensões → Apps Script** e cole o código do arquivo `codigo-apps-script.gs`. Publique como Web App com acesso **"Qualquer pessoa"**.

**3. Configure no app**

Abra o `index.html`, vá em **⚙️ Configurações** e cole a URL do Web App.

**4. Pronto!**

Abra o `index.html` no navegador ou acesse via GitHub Pages.

## 📁 Estrutura

```
fintrack-ai/
├── index.html              # App completo (frontend)
├── codigo-apps-script.gs   # Backend Google Apps Script
└── README.md
```

## 🗺️ Roadmap

- [ ] Sincronização bidirecional com o Sheets
- [ ] Metas mensais por categoria
- [ ] Relatório em PDF
- [ ] Login com Google
- [ ] Modo escuro / claro
- [ ] PWA para instalar no celular

## 📄 Licença

MIT — use, modifique e distribua à vontade.

---

*Desenvolvido com Claude AI da Anthropic*

---

Sobe o `index.html` e o `codigo-apps-script.gs` junto no repositório e fica completo. Quer que eu gere o arquivo `README.md` para baixar direto?
