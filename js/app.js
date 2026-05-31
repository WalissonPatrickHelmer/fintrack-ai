/**
 * FinTrack AI - Lógica Principal da Aplicação
 * Gerenciamento de Estado, Processamento PNL, Voz, OCR e Integração Sheets.
 */

// --- 1. ESTADO GLOBAL ---
let dados = JSON.parse(localStorage.getItem('ft_dados') || '[]');
let cfg = JSON.parse(localStorage.getItem('ft_cfg') || '{"url":""}');
let cats = JSON.parse(localStorage.getItem('ft_cats') || '["Alimentação","Transporte","Moradia","Saúde","Lazer","Educação","Energia","Água","Internet","Salário","Freelance","Investimento","Outros"]');

let currentTab = 'dashboard';
let currentType = 'Despesa'; // Tipo ativo no formulário
let voiceRecognition = null;
let recordingState = false;
let photoB64 = null;

// Instâncias Globais de Gráficos para evitar vazamento de canvas
let chartLineInst = null;
let chartPieInst = null;

// Inicialização automática ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    // Carrega data de hoje no formulário
    document.getElementById('m-data').value = obterDataHoje();
    
    // Inicializa campos de categoria
    atualizarDropdownsCategorias();
    
    // Tenta carregar configurações salvas
    if (cfg.url) {
        document.getElementById('cfg-url').value = cfg.url;
        atualizarSyncStatus(true, "Conectado");
        sincronizarComPlanilha();
    } else {
        atualizarSyncStatus(false, "Offline");
    }

    // Renderiza a dashboard inicial
    renderDash();

    // Configuração de Drag & Drop para Upload de Fotos OCR
    const ocrBox = document.querySelector('.ocr-box');
    ['dragenter', 'dragover'].forEach(eventName => {
        ocrBox.addEventListener(eventName, (e) => {
            e.preventDefault();
            ocrBox.classList.add('dragover');
        }, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        ocrBox.addEventListener(eventName, (e) => {
            e.preventDefault();
            ocrBox.classList.remove('dragover');
        }, false);
    });
    ocrBox.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            document.getElementById('photo-file').files = files;
            loadFoto({ target: { files: files } });
        }
    });
});

// --- 2. NAVEGAÇÃO E NOTIFICAÇÃO ---
function goTo(tabName) {
    currentTab = tabName;
    
    // Alterna classes de navegação ativa
    document.querySelectorAll('.nav .ni').forEach(item => item.classList.remove('active'));
    const navItem = document.getElementById(`nav-${tabName}`);
    if (navItem) navItem.classList.add('active');

    // Alterna visibilidade das páginas
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const pageItem = document.getElementById(`page-${tabName}`);
    if (pageItem) pageItem.classList.add('active');

    // Atualiza título da barra superior
    const titles = {
        'dashboard': '📊 Painel Analítico',
        'entrada': '✨ Nova Movimentação Inteligente',
        'transacoes': '📋 Lista Geral de Transações',
        'config': '⚙️ Configurações do Sistema'
    };
    document.getElementById('ptitle').textContent = titles[tabName] || 'FinTrack AI';

    // Roda renderizadores específicos
    if (tabName === 'dashboard') {
        renderDash();
    } else if (tabName === 'transacoes') {
        renderTransacoes();
    } else if (tabName === 'config') {
        renderCfg();
    }
}

function toast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show';
    if (isError) {
        el.style.borderColor = 'var(--r)';
        el.style.color = 'var(--r)';
    } else {
        el.style.borderColor = 'var(--g)';
        el.style.color = 'var(--g)';
    }
    
    setTimeout(() => {
        el.className = 'toast';
    }, 3500);
}

// --- 3. UTILITÁRIOS ---
function obterDataHoje() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
}

function formatarBRL(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mascaraValor(el) {
    let v = el.value.replace(/\D/g, '');
    v = (v / 100).toFixed(2) + '';
    v = v.replace(".", ",");
    v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    el.value = v;
}

function obterValorFloat(str) {
    if (!str) return 0;
    // Remove pontos de milhar, substitui vírgula por ponto decimal
    let limpo = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
}

function atualizarDropdownsCategorias() {
    const mCatSelect = document.getElementById('m-cat');
    const catFilter = document.getElementById('cat-filter');
    
    const optionsHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    
    if (mCatSelect) mCatSelect.innerHTML = optionsHTML;
    if (catFilter) {
        catFilter.innerHTML = '<option value="todos">Todas as Categorias</option>' + optionsHTML;
    }
}

function setStType(type) {
    currentType = type;
    const btnDespesa = document.getElementById('st-despesa');
    const btnReceita = document.getElementById('st-receita');
    
    if (type === 'Despesa') {
        btnDespesa.className = 'st-btn active despesa';
        btnReceita.className = 'st-btn';
    } else {
        btnDespesa.className = 'st-btn';
        btnReceita.className = 'st-btn active receita';
    }
}

// --- 4. MOTOR PNL LOCAL (PROCESSAMENTO DE LINGUAGEM NATURAL) ---
function PNL_Parser(texto) {
    const txt = texto.toLowerCase();
    let transacao = {
        tipo: 'Despesa',
        descricao: '',
        valor: 0,
        categoria: 'Outros',
        data: obterDataHoje()
    };

    // 1. Extração de Valor
    // Casos: "R$ 45,90", "45 reais", "45 reais e 50 centavos", "45.90", "1500"
    const regexBRL = /(?:r\$\s*|rs\s*)?([0-9]+(?:[\.,][0-9]{2})?)/i;
    const regexReais = /([0-9]+(?:[\.,][0-9]{2})?)\s*(?:reais|conto)/i;
    
    let valorEncontrado = 0;
    let matchReais = txt.match(regexReais);
    let matchBRL = txt.match(regexBRL);

    if (matchReais && matchReais[1]) {
        valorEncontrado = obterValorFloat(matchReais[1]);
    } else if (matchBRL && matchBRL[1]) {
        valorEncontrado = obterValorFloat(matchBRL[1]);
    } else {
        // Fallback para qualquer número no texto
        const matchNum = txt.match(/\b\d+(?:[\.,]\d{2})?\b/);
        if (matchNum) {
            valorEncontrado = obterValorFloat(matchNum[0]);
        }
    }
    transacao.valor = valorEncontrado;

    // 2. Extração do Tipo (Receita vs Despesa)
    const keywordsReceita = ['salario', 'salário', 'recebi', 'ganhei', 'freela', 'freelance', 'pix de', 'vendi', 'entrada', 'ted', 'doc', 'estorno', 'investimento', 'pro labore'];
    const ehReceita = keywordsReceita.some(kw => txt.includes(kw));
    transacao.tipo = ehReceita ? 'Receita' : 'Despesa';

    // 3. Extração da Categoria com base em dicionário semântico
    const dicionarioCategorias = {
        'Alimentação': ['ifood', 'mercado', 'almoço', 'almoco', 'janta', 'jantar', 'pizza', 'hambúrguer', 'hamburguer', 'restaurante', 'comida', 'padaria', 'supermercado', 'bh', 'lanchonete', 'café', 'cafe', 'pastel'],
        'Transporte': ['uber', '99', 'taxi', 'táxi', 'onibus', 'ônibus', 'passagem', 'combustivel', 'combustível', 'gasolina', 'abasteci', 'pedagio', 'pedágio', 'metro', 'metrô', 'estacionamento', 'oficina', 'óleo'],
        'Moradia': ['aluguel', 'condominio', 'condomínio', 'reforma', 'casa', 'móveis', 'imobiliária'],
        'Saúde': ['farmacia', 'farmácia', 'remedio', 'remédio', 'medico', 'médico', 'dentista', 'consulta', 'exame', 'hospital', 'drogaria'],
        'Lazer': ['steam', 'netflix', 'spotify', 'cinema', 'jogo', 'balada', 'cerveja', 'bar', 'viagem', 'shopping', 'ingresso', 'festa', 'show'],
        'Educação': ['curso', 'faculdade', 'escola', 'livro', 'mensalidade', 'udemy', 'material escolar', 'inscrição'],
        'Energia': ['cemig', 'luz', 'energia', 'eletricidade', 'conta de luz'],
        'Água': ['copasa', 'agua', 'água', 'saneamento', 'conta de água'],
        'Internet': ['internet', 'wifi', 'fibra', 'net', 'claro', 'vivo', 'tim', 'telefonia'],
        'Salário': ['salario', 'salário', 'mensal', 'pro-labore', 'holerite'],
        'Freelance': ['freela', 'freelance', 'bico', 'extra', 'job', 'projeto extra'],
        'Investimento': ['investimento', 'tesouro', 'ações', 'acao', 'poupança', 'poupanca', 'fundo', 'fii', 'cripto', 'bitcoin']
    };

    let categoriaEncontrada = ehReceita ? 'Freelance' : 'Outros';
    if (ehReceita && txt.includes('salario')) categoriaEncontrada = 'Salário';

    outerLoop:
    for (const [cat, kws] of Object.entries(dicionarioCategorias)) {
        for (const kw of kws) {
            if (txt.includes(kw)) {
                categoriaEncontrada = cat;
                break outerLoop;
            }
        }
    }
    
    // Verifica se a categoria extraída pertence às categorias ativas do usuário
    if (cats.includes(categoriaEncontrada)) {
        transacao.categoria = categoriaEncontrada;
    } else {
        transacao.categoria = 'Outros';
    }

    // 4. Extração de Datas Relativas
    if (txt.includes('ontem')) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        transacao.data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else if (txt.includes('anteontem')) {
        const d = new Date();
        d.setDate(d.getDate() - 2);
        transacao.data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
        // Tenta achar data no formato dd/mm ou dd/mm/aaaa
        const regexData = /(\d{2})\/(\d{2})(?:\/(\d{4}))?/;
        const matchData = txt.match(regexData);
        if (matchData) {
            const dia = matchData[1];
            const mes = matchData[2];
            const ano = matchData[3] || new Date().getFullYear();
            transacao.data = `${ano}-${mes}-${dia}`;
        }
    }

    // 5. Determinação da Descrição (Removendo valor, data e conectores do texto original)
    let desc = texto.replace(regexReais, '')
                    .replace(regexBRL, '')
                    .replace(/ontem|anteontem|hoje/gi, '')
                    .replace(/gastei|paguei|recebi|ganhei|comi|comprei/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();
    
    // Capitaliza primeira letra
    if (desc) {
        desc = desc.charAt(0).toUpperCase() + desc.slice(1);
    } else {
        desc = ehReceita ? 'Receita Identificada por IA' : 'Gasto Identificado por IA';
    }
    transacao.descricao = desc;

    return transacao;
}

function analisarTexto() {
    const input = document.getElementById('quick-input');
    const txt = input.value.trim();
    if (!txt) {
        toast("Por favor, digite alguma frase para processar.", true);
        return;
    }

    const t = PNL_Parser(txt);
    
    // Preenche o formulário manual com os dados detectados
    document.getElementById('m-desc').value = t.descricao;
    document.getElementById('m-valor').value = t.valor.toFixed(2).replace('.', ',');
    document.getElementById('m-cat').value = t.categoria;
    document.getElementById('m-data').value = t.data;
    setStType(t.tipo);

    toast("Frase interpretada! Confirme os dados abaixo.");
}

// --- 5. INTEGRAÇÃO WEB SPEECH (VOZ PARA TEXTO) ---
function toggleVoz() {
    const btn = document.getElementById('btn-record');
    const input = document.getElementById('quick-input');
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        toast("Seu navegador não suporta reconhecimento de voz. Use o Chrome ou Edge.", true);
        return;
    }

    if (recordingState) {
        // Desliga
        voiceRecognition.stop();
        recordingState = false;
        btn.classList.remove('recording');
        btn.innerHTML = '🎙️';
        toast("Gravação encerrada.");
    } else {
        // Liga
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.lang = 'pt-BR';
        voiceRecognition.interimResults = false;
        voiceRecognition.maxAlternatives = 1;

        voiceRecognition.onstart = () => {
            recordingState = true;
            btn.classList.add('recording');
            btn.innerHTML = '🛑';
            toast("Ouvindo... Fale sua receita ou despesa.");
        };

        voiceRecognition.onerror = (e) => {
            console.error("Erro no Speech:", e);
            toast("Erro ao ouvir. Tente novamente.", true);
            recordingState = false;
            btn.classList.remove('recording');
            btn.innerHTML = '🎙️';
        };

        voiceRecognition.onend = () => {
            recordingState = false;
            btn.classList.remove('recording');
            btn.innerHTML = '🎙️';
        };

        voiceRecognition.onresult = (event) => {
            const transcrito = event.results[0][0].transcript;
            input.value = transcrito;
            toast("Áudio transcrito com sucesso!");
            // Auto analisa após transcrever
            analisarTexto();
        };

        voiceRecognition.start();
    }
}

// --- 6. INTEGRAÇÃO OCR LOCAL (FOTO DE COMPROVANTES) ---
function loadFoto(e) {
    const file = e.target.files[0];
    if (!file) return;

    const imgPreview = document.getElementById('ocr-preview-img');
    const label = document.getElementById('ocr-text-label');
    const btnProcess = document.getElementById('btn-ocr-process');

    const reader = new FileReader();
    reader.onload = (event) => {
        imgPreview.src = event.target.result;
        imgPreview.style.display = 'block';
        label.style.display = 'none';
        btnProcess.removeAttribute('disabled');
        photoB64 = event.target.result;
        toast("Foto carregada. Clique em 'Ler Comprovante' para extrair os dados.");
    };
    reader.readAsDataURL(file);
}

function limparFoto() {
    const imgPreview = document.getElementById('ocr-preview-img');
    const label = document.getElementById('ocr-text-label');
    const btnProcess = document.getElementById('btn-ocr-process');
    const fileInput = document.getElementById('photo-file');

    fileInput.value = '';
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    label.style.display = 'block';
    btnProcess.setAttribute('disabled', 'true');
    document.getElementById('ocr-loading-text').style.display = 'none';
    photoB64 = null;
}

function analisarFoto() {
    if (!photoB64) return;

    const loadingText = document.getElementById('ocr-loading-text');
    const btnProcess = document.getElementById('btn-ocr-process');
    
    loadingText.style.display = 'block';
    btnProcess.setAttribute('disabled', 'true');

    // Executa o processamento OCR local usando o Tesseract.js (CDN importado no HTML)
    Tesseract.recognize(
        photoB64,
        'por', // Idioma Português
        { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
        console.log("OCR Extraído:", text);
        loadingText.style.display = 'none';
        btnProcess.removeAttribute('disabled');

        if (!text || text.trim().length < 5) {
            toast("Não foi possível extrair dados legíveis do comprovante.", true);
            return;
        }

        // Tenta sanitizar o texto da nota de forma simples
        // Procura palavras chaves e valores
        const linhas = text.split('\n');
        let valorTotal = 0;
        let estabelecimento = "";
        
        // Pega primeira linha útil como provável estabelecimento
        for(let l of linhas) {
            let limpa = l.trim();
            if (limpa.length > 3 && !limpa.match(/\d/) && !estabelecimento) {
                estabelecimento = limpa;
            }
            
            // Busca valores associados a total, pago, valor
            const matchTotal = limpa.toLowerCase().match(/(?:total|pago|valor|subtotal|dinheiro|pix|debito|débito)\s*(?:rs|r\$)?\s*([0-9]+[\.,][0-9]{2})/);
            if (matchTotal && matchTotal[1]) {
                const val = obterValorFloat(matchTotal[1]);
                if (val > valorTotal) valorTotal = val;
            }
        }

        // Se não achou valor pelas palavras chaves, busca o maior valor numérico decimal na nota
        if (valorTotal === 0) {
            const todosValores = text.match(/\b\d+[\.,]\d{2}\b/g);
            if (todosValores) {
                todosValores.forEach(v => {
                    const parsed = obterValorFloat(v);
                    if (parsed > valorTotal) valorTotal = parsed;
                });
            }
        }

        // Preenche os campos
        document.getElementById('m-desc').value = (estabelecimento ? estabelecimento : "Compra Cupom Fiscal").substring(0, 45);
        document.getElementById('m-valor').value = valorTotal > 0 ? valorTotal.toFixed(2).replace('.', ',') : "0,00";
        document.getElementById('m-cat').value = "Alimentação"; // Categoria provável padrão para cupom
        document.getElementById('m-data').value = obterDataHoje();
        setStType('Despesa');

        toast("OCR Finalizado! Dados sugeridos no formulário.");
        limparFoto();
    }).catch(err => {
        console.error("Erro OCR:", err);
        toast("Erro ao ler imagem localmente.", true);
        loadingText.style.display = 'none';
        btnProcess.removeAttribute('disabled');
    });
}

// --- 7. CRIAÇÃO DE TRANSAÇÕES E PERSISTÊNCIA ---
function cancelar() {
    document.getElementById('m-desc').value = '';
    document.getElementById('m-valor').value = '';
    document.getElementById('m-data').value = obterDataHoje();
    setStType('Despesa');
    document.getElementById('quick-input').value = '';
    toast("Campos limpos.");
}

async function salvarManual() {
    const desc = document.getElementById('m-desc').value.trim();
    const valorStr = document.getElementById('m-valor').value;
    const cat = document.getElementById('m-cat').value;
    const data = document.getElementById('m-data').value;
    const tipo = currentType;

    const valor = obterValorFloat(valorStr);

    if (!desc) {
        toast("Insira uma descrição válida.", true);
        return;
    }
    if (valor <= 0) {
        toast("Insira um valor maior que R$ 0,00.", true);
        return;
    }
    if (!data) {
        toast("Insira uma data válida.", true);
        return;
    }

    const transacao = {
        id: String(Date.now()), // ID baseado em timestamp único
        data: data,
        tipo: tipo,
        categoria: cat,
        descricao: desc,
        valor: valor
    };

    // Salva Localmente
    dados.unshift(transacao);
    localStorage.setItem('ft_dados', JSON.stringify(dados));
    
    // Tenta Sincronizar com Sheets Remoto de forma Assíncrona
    if (cfg.url) {
        toast("Salvando transação e enviando para o Sheets...");
        await enviarSheets(transacao, "add");
    } else {
        toast("Transação salva localmente (Modo Offline)!");
    }

    // Limpa campos
    cancelar();
    
    // Redireciona para Dashboard
    goTo('dashboard');
}

async function deletarTransacao(id) {
    if (!confirm("Tem certeza que deseja excluir esta transação?")) return;

    // Remove do estado local
    dados = dados.filter(t => t.id !== id);
    localStorage.setItem('ft_dados', JSON.stringify(dados));

    // Sincroniza exclusão no Sheets remoto
    if (cfg.url) {
        toast("Excluindo transação do Sheets...");
        await enviarSheets(null, "delete", id);
    } else {
        toast("Transação excluída localmente!");
    }

    // Recarrega visualizações
    if (currentTab === 'dashboard') {
        renderDash();
    } else if (currentTab === 'transacoes') {
        renderTransacoes();
    }
}

// --- 8. COMUNICAÇÃO HTTP COM GOOGLE SHEETS ---
async function enviarSheets(transacao, acao, idExclusao = null) {
    if (!cfg.url) return false;

    atualizarSyncStatus(true, "Aguardando...");
    
    try {
        let payload = {};
        if (acao === "clear") {
            payload = { action: "clear" };
        } else if (acao === "delete") {
            payload = { action: "delete", id: idExclusao };
        } else if (acao === "ping") {
            // O ping é enviado via GET para alinhar com o script do usuário
            const urlPing = cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'action=ping';
            const pingRes = await fetch(urlPing);
            const pingObj = await pingRes.json();
            if (pingObj.ok) {
                atualizarSyncStatus(true, "Sincronizado");
                return true;
            }
            return false;
        } else {
            // Ação padrão "add" - Objeto plano (flat structure) exigido pelo doPost do usuário
            payload = {
                action: "add",
                id: String(transacao.id),
                data: String(transacao.data),
                tipo: String(transacao.tipo),
                categoria: String(transacao.categoria),
                descricao: String(transacao.descricao || ""),
                valor: Number(transacao.valor)
            };
        }

        // Envia via POST JSON para o Web App Apps Script
        const response = await fetch(cfg.url, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain' // Evita requisição OPTIONS prévia e contorna limitações de CORS
            },
            body: JSON.stringify(payload)
        });

        const res = await response.json();
        if (res.ok) {
            atualizarSyncStatus(true, "Sincronizado");
            return true;
        } else {
            console.error("Erro no Apps Script:", res.erro);
            toast("Planilha respondeu com erro: " + (res.erro || "Erro de validação"), true);
            atualizarSyncStatus(true, "Erro de Sincronia");
            return false;
        }
    } catch (e) {
        console.error("Erro na comunicação Sheets:", e);
        atualizarSyncStatus(false, "Erro de Rede");
        return false;
    }
}

async function sincronizarComPlanilha() {
    if (!cfg.url) return;

    atualizarSyncStatus(true, "Sincronizando...");
    
    try {
        // Envia ?action=read exigido pelo doGet do usuário
        const urlRead = cfg.url + (cfg.url.includes('?') ? '&' : '?') + 'action=read';
        const res = await fetch(urlRead);
        const obj = await res.json();
        
        if (obj.ok) {
            const dadosSheets = obj.data || [];
            
            // Trata e limpa os campos de dados para evitar formatações de data incompatíveis
            const transacoesTratadas = dadosSheets.map(t => {
                let dataStr = String(t.data);
                // Corta strings de data ISO "yyyy-MM-ddT00:00:00.000Z" enviadas pelo Google Planilhas
                if (dataStr.includes('T')) {
                    dataStr = dataStr.split('T')[0];
                }
                return {
                    id: String(t.id),
                    data: dataStr,
                    tipo: String(t.tipo),
                    categoria: String(t.categoria),
                    descricao: String(t.descricao || ""),
                    valor: Number(t.valor) || 0
                };
            });
            
            // Mescla dados remotos e locais sem duplicados usando ID único
            const mapaTransacoes = new Map();
            dados.forEach(t => mapaTransacoes.set(t.id, t));
            transacoesTratadas.forEach(t => mapaTransacoes.set(t.id, t));
            
            dados = Array.from(mapaTransacoes.values());
            dados.sort((a,b) => new Date(b.data) - new Date(a.data));
            
            localStorage.setItem('ft_dados', JSON.stringify(dados));
            atualizarSyncStatus(true, "Sincronizado");
            toast("Sincronização bidirecional concluída!");
            
            if (currentTab === 'dashboard') renderDash();
            if (currentTab === 'transacoes') renderTransacoes();
        } else {
            console.error("Planilha retornou erro de leitura:", obj.erro);
            atualizarSyncStatus(true, "Erro de Leitura");
        }
    } catch (e) {
        console.error("Erro de sincronismo bidirecional:", e);
        atualizarSyncStatus(false, "Erro de Rede");
    }
}

function atualizarSyncStatus(online, rotulo) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    
    el.textContent = `Planilha: ${rotulo}`;
    if (online && rotulo === "Sincronizado") {
        el.className = "sync-badge online";
    } else if (online && (rotulo === "Sincronizando..." || rotulo === "Aguardando...")) {
        el.className = "sync-badge offline";
        el.style.backgroundColor = "rgba(90, 141, 238, 0.1)";
        el.style.color = "var(--t2)";
    } else {
        el.className = "sync-badge offline";
    }
}

async function testarConexao() {
    if (!cfg.url) {
        toast("Por favor, cole a URL do Web App antes de testar.", true);
        return;
    }
    
    toast("Testando conexão remota...");
    const sucesso = await enviarSheets(null, "ping");
    if (sucesso) {
        toast("Conexão estabelecida com o Sheets com sucesso!");
        sincronizarComPlanilha();
    } else {
        toast("Falha na conexão. Verifique se publicou como Web App de acesso público.", true);
    }
}

function abrirSheets() {
    if (cfg.url) {
        // Monta link aproximado ou abre em nova aba
        window.open(cfg.url, '_blank');
    } else {
        toast("Configure a URL do Web App para poder acessá-lo.", true);
    }
}

// --- 9. RENDERIZAÇÃO DA DASHBOARD & CHART.JS ---
function renderDash() {
    // 1. Filtragem de dados do mês atual para KPIs realistas
    const dHoje = new Date();
    const anoAtual = dHoje.getFullYear();
    const mesAtual = dHoje.getMonth(); // 0-11
    
    let totalReceitas = 0;
    let totalDespesas = 0;
    let saldoTotal = 0; // Acumulado geral independente de mês

    dados.forEach(t => {
        const valor = Number(t.valor);
        const tDate = new Date(t.data + 'T00:00:00'); // Trata timezone local
        
        // Saldo Acumulado Histórico
        if (t.tipo === 'Receita') {
            saldoTotal += valor;
        } else {
            saldoTotal -= valor;
        }

        // KPIs Mensais
        if (tDate.getFullYear() === anoAtual && tDate.getMonth() === mesAtual) {
            if (t.tipo === 'Receita') {
                totalReceitas += valor;
            } else {
                totalDespesas += valor;
            }
        }
    });

    // Atualiza KPIs visuais na tela
    document.getElementById('kpi-saldo').textContent = formatarBRL(saldoTotal);
    document.getElementById('kpi-saldo').className = saldoTotal >= 0 ? 'kv g' : 'kv r';
    
    document.getElementById('kpi-receitas').textContent = formatarBRL(totalReceitas);
    document.getElementById('kpi-despesas').textContent = formatarBRL(totalDespesas);
    document.getElementById('kpi-count').textContent = dados.length;

    // Atualiza legendas dos subtítulos dos KPIs
    const mesesNomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    document.getElementById('kpi-receitas-sub').textContent = `Total ganho em ${mesesNomes[mesAtual]}`;
    document.getElementById('kpi-despesas-sub').textContent = `Total gasto em ${mesesNomes[mesAtual]}`;

    // 2. Renderização das Últimas Transações (limite 5)
    const recentTbody = document.getElementById('dash-recent-tbody');
    const ultimas5 = dados.slice(0, 5);
    
    if (ultimas5.length === 0) {
        recentTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:1.5rem">Nenhuma transação lançada ainda. Adicione na aba acima!</td></tr>`;
    } else {
        recentTbody.innerHTML = ultimas5.map(t => `
            <tr>
                <td>${t.data.split('-').reverse().join('/')}</td>
                <td>${t.descricao}</td>
                <td><span style="background:var(--s2);padding:.2rem .4rem;border-radius:4px;font-size:.7rem">${t.categoria}</span></td>
                <td><span class="${t.tipo === 'Receita' ? 'kv g' : 'kv r'}" style="font-size:.85rem">${t.tipo === 'Receita' ? '+' : '-'} ${formatarBRL(t.valor)}</span></td>
                <td>
                    <button class="cat-del" onclick="deletarTransacao('${t.id}')" title="Excluir Transação">🗑️</button>
                </td>
            </tr>
        `).join('');
    }

    // 3. Renderização dos Gráficos Dinâmicos
    renderizarGraficoEvolucao();
    renderizarGraficoCategorias();
}

function renderizarGraficoEvolucao() {
    const ctx = document.getElementById('chart-line').getContext('2d');
    
    // Destrói gráfico existente para evitar leaks de lixo visual
    if (chartLineInst) chartLineInst.destroy();

    // Agrupa dados dos últimos 6 meses de forma dinâmica
    const mesesLabels = [];
    const receitasMes = [];
    const despesasMes = [];

    const d = new Date();
    const mesesNomesAbrev = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

    // Cria os últimos 6 meses ordenados
    for (let i = 5; i >= 0; i--) {
        const tempDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
        mesesLabels.push(`${mesesNomesAbrev[tempDate.getMonth()]}/${String(tempDate.getFullYear()).slice(-2)}`);
        
        let rec = 0;
        let desp = 0;
        
        dados.forEach(t => {
            const tDate = new Date(t.data + 'T00:00:00');
            if (tDate.getFullYear() === tempDate.getFullYear() && tDate.getMonth() === tempDate.getMonth()) {
                if (t.tipo === 'Receita') rec += Number(t.valor);
                else desp += Number(t.valor);
            }
        });
        
        receitasMes.push(rec);
        despesasMes.push(desp);
    }

    // Configuração e Renderização do Chart.js
    chartLineInst = new Chart(ctx, {
        type: 'line',
        data: {
            labels: mesesLabels,
            datasets: [
                {
                    label: 'Receitas',
                    data: receitasMes,
                    borderColor: '#00D68F',
                    backgroundColor: 'rgba(0, 214, 143, 0.05)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                },
                {
                    label: 'Despesas',
                    data: despesasMes,
                    borderColor: '#FF6B6B',
                    backgroundColor: 'rgba(255, 107, 107, 0.05)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#8B9EC4', font: { family: 'Space Grotesk' } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#8B9EC4', font: { family: 'Space Grotesk' } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: {
                        color: '#8B9EC4',
                        font: { family: 'Space Grotesk' },
                        callback: (v) => 'R$ ' + v
                    }
                }
            }
        }
    });
}

function renderizarGraficoCategorias() {
    const ctx = document.getElementById('chart-pie').getContext('2d');
    
    if (chartPieInst) chartPieInst.destroy();

    // Filtra apenas despesas do mês atual
    const dHoje = new Date();
    const ano = dHoje.getFullYear();
    const mes = dHoje.getMonth();

    const mapaCategorias = {};
    let totalMes = 0;

    dados.forEach(t => {
        const tDate = new Date(t.data + 'T00:00:00');
        if (t.tipo === 'Despesa' && tDate.getFullYear() === ano && tDate.getMonth() === mes) {
            const valor = Number(t.valor);
            mapaCategorias[t.categoria] = (mapaCategorias[t.categoria] || 0) + valor;
            totalMes += valor;
        }
    });

    const labels = Object.keys(mapaCategorias);
    const dataValues = Object.values(mapaCategorias);

    if (labels.length === 0) {
        // Estado Vazio para o Gráfico
        chartPieInst = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Nenhuma despesa no mês'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(255,255,255,0.04)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#4A5A7A' } }
                }
            }
        });
        return;
    }

    const coresPredefinidas = [
        '#FF6B6B', '#FFB547', '#5A8DEE', '#9B5DE5', 
        '#F15BB5', '#00F5D4', '#00BBF9', '#EE9B00', 
        '#94D2BD', '#CA6702', '#0A9396', '#AE2012'
    ];

    chartPieInst = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: coresPredefinidas.slice(0, labels.length),
                borderColor: '#0A0E1A',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#8B9EC4',
                        font: { family: 'Space Grotesk', size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const val = context.raw;
                            const pct = ((val / totalMes) * 100).toFixed(1);
                            return ` ${context.label}: R$ ${val.toFixed(2)} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// --- 10. ABA TRANSAÇÕES (FILTROS E BUSCA) ---
function renderTransacoes() {
    // Popula categorias ativas no filtro da página de transações
    atualizarDropdownsCategorias();
    filtrarTransacoes();
}

function filtrarTransacoes() {
    const query = document.getElementById('search-filter').value.toLowerCase().trim();
    const typeF = document.getElementById('type-filter').value;
    const catF = document.getElementById('cat-filter').value;

    const tbody = document.getElementById('transacoes-tbody');
    
    // Aplica filtros sequenciais
    let filtrados = dados.filter(t => {
        const correspondeBusca = t.descricao.toLowerCase().includes(query) || t.categoria.toLowerCase().includes(query);
        const correspondeTipo = typeF === 'todos' || t.tipo === typeF;
        const correspondeCat = catF === 'todos' || t.categoria === catF;
        
        return correspondeBusca && correspondeTipo && correspondeCat;
    });

    // Atualiza contagem visível
    document.getElementById('table-count-label').textContent = `Lançamentos Cadastrados (${filtrados.length})`;

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:1.5rem">Nenhuma transação corresponde aos filtros selecionados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(t => `
        <tr>
            <td>${t.data.split('-').reverse().join('/')}</td>
            <td>
                <span class="bd ${t.tipo === 'Receita' ? 'bd-r' : 'bd-d'}">
                    ${t.tipo}
                </span>
            </td>
            <td><span style="background:var(--s2);padding:.2rem .4rem;border-radius:4px;font-size:.7rem">${t.categoria}</span></td>
            <td>${t.descricao}</td>
            <td><strong class="${t.tipo === 'Receita' ? 'kv g' : 'kv r'}" style="font-size:.85rem">${t.tipo === 'Receita' ? '+' : '-'} ${formatarBRL(t.valor)}</strong></td>
            <td>
                <button class="cat-del" onclick="deletarTransacao('${t.id}')" title="Excluir Registro">Excluir 🗑️</button>
            </td>
        </tr>
    `).join('');
}

function exportarCSV() {
    if (dados.length === 0) {
        toast("Nenhuma transação para exportar.", true);
        return;
    }

    // Monta cabeçalhos do CSV
    let csv = "ID;Data;Tipo;Categoria;Descricao;Valor\n";
    dados.forEach(t => {
        csv += `${t.id};${t.data};${t.tipo};${t.categoria};${t.descricao};${t.valor}\n`;
    });

    // Download do arquivo
    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `FinTrack_Export_${obterDataHoje()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Arquivo CSV exportado com sucesso!");
}

// --- 11. ABA CONFIGURAÇÕES (GERENCIADOR E REDE) ---
function renderCfg() {
    renderizarListaCategoriasConfig();
}

function renderizarListaCategoriasConfig() {
    const container = document.getElementById('categories-list-container');
    if (!container) return;

    if (cats.length === 0) {
        container.innerHTML = `<div style="font-size:.8rem;color:var(--t3);text-align:center">Nenhuma categoria configurada.</div>`;
        return;
    }

    container.innerHTML = cats.map((c, i) => `
        <div class="cat-item">
            <span style="font-size:.85rem">${c}</span>
            <button class="cat-del" onclick="delCat(${i})" title="Remover Categoria">Remover ✕</button>
        </div>
    `).join('');
}

function addCat() {
    const input = document.getElementById('new-cat-input');
    const valor = input.value.trim();

    if (!valor) {
        toast("Digite o nome da categoria.", true);
        return;
    }
    if (cats.some(c => c.toLowerCase() === valor.toLowerCase())) {
        toast("Esta categoria já existe.", true);
        return;
    }

    cats.push(valor);
    localStorage.setItem('ft_cats', JSON.stringify(cats));
    input.value = '';
    
    renderizarListaCategoriasConfig();
    atualizarDropdownsCategorias();
    toast("Categoria adicionada!");
}

function delCat(i) {
    if (cats.length <= 1) {
        toast("O sistema necessita de ao menos uma categoria cadastrada.", true);
        return;
    }
    
    const catRemovida = cats[i];
    if (!confirm(`Deseja mesmo remover a categoria "${catRemovida}"?`)) return;

    cats.splice(i, 1);
    localStorage.setItem('ft_cats', JSON.stringify(cats));
    
    renderizarListaCategoriasConfig();
    atualizarDropdownsCategorias();
    toast("Categoria removida.");
}

function salvarCfg() {
    const url = document.getElementById('cfg-url').value.trim();
    
    cfg.url = url;
    localStorage.setItem('ft_cfg', JSON.stringify(cfg));
    
    if (url) {
        atualizarSyncStatus(true, "Salvo");
        toast("Configurações salvas! Sincronizando...");
        sincronizarComPlanilha();
    } else {
        atualizarSyncStatus(false, "Offline");
        toast("URL limpa. O aplicativo funcionará em modo Offline.");
    }
}

function limpar() {
    if (!confirm("Isso apagará permanentemente TODAS as transações cadastradas no banco local do seu navegador. Continuar?")) return;
    
    dados = [];
    localStorage.removeItem('ft_dados');
    toast("Banco de dados local limpo!");
    goTo('dashboard');
}

async function limparSheets() {
    if (!cfg.url) {
        toast("Configure a URL do Web App antes de tentar limpar os dados remotos.", true);
        return;
    }
    
    if (!confirm("ATENÇÃO: Isso apagará permanentemente todas as transações cadastradas na sua Planilha Google vinculada de forma irreversível. Continuar?")) return;

    toast("Limpando planilha remota...");
    const sucesso = await enviarSheets(null, "clear");
    if (sucesso) {
        toast("Todas as linhas da planilha foram removidas!");
        sincronizarComPlanilha();
    } else {
        toast("Erro ao limpar dados no Google Sheets.", true);
    }
}