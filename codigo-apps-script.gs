/**
 * FinTrack AI - Backend Google Apps Script
 * Sincronização direta do aplicativo web com o Google Sheets.
 * 
 * COMO CONFIGURAR:
 * 1. Crie uma planilha no Google Sheets.
 * 2. Acesse Extensões -> Apps Script.
 * 3. Cole este código e clique em Salvar.
 * 4. Clique em Implantar -> Nova implantação.
 * 5. Escolha "App da Web".
 * 6. Em "Executar como", selecione "Eu".
 * 7. Em "Quem tem acesso", selecione "Qualquer pessoa" (isso é necessário para que a API funcione).
 * 8. Copie a URL do Web App gerada e cole nas configurações do FinTrack AI.
 */

const NOME_PLANILHA = "FinTrack_Dados";

// Inicializa a planilha e garante que os cabeçalhos existem
function obterOuCriarPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(NOME_PLANILHA);
  if (!sheet) {
    sheet = ss.insertSheet(NOME_PLANILHA);
    // Cria o cabeçalho
    sheet.appendRow(["ID", "Data", "Tipo", "Categoria", "Descrição", "Valor"]);
    // Estiliza o cabeçalho
    sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#1A2235").setFontColor("#F0F4FF");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Retorna todas as transações (GET)
function doGet(e) {
  const origem = e.parameter.origin || "*";
  try {
    const sheet = obterOuCriarPlanilha();
    const range = sheet.getDataRange();
    const valores = range.getValues();
    
    const transacoes = [];
    // Começa na linha 2 para pular o cabeçalho
    for (let i = 1; i < valores.length; i++) {
      const linha = valores[i];
      if (!linha[0]) continue; // Pula linhas vazias
      
      // Formata a data de forma legível
      let dataStr = "";
      if (linha[1] instanceof Date) {
        dataStr = Utilities.formatDate(linha[1], Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        dataStr = String(linha[1]);
      }
      
      transacoes.push({
        id: String(linha[0]),
        data: dataStr,
        tipo: String(linha[2]),
        categoria: String(linha[3]),
        descricao: String(linha[4]),
        valor: Number(linha[5])
      });
    }
    
    return criarRespostaJSON({ status: "success", data: transacoes });
  } catch (erro) {
    return criarRespostaJSON({ status: "error", message: erro.toString() });
  }
}

// Executa ações de gravação, exclusão e limpeza (POST)
function doPost(e) {
  try {
    let dadosReq;
    if (e.postData && e.postData.contents) {
      dadosReq = JSON.parse(e.postData.contents);
    } else {
      dadosReq = e.parameter;
    }
    
    const acao = dadosReq.acao;
    const sheet = obterOuCriarPlanilha();
    
    if (acao === "ping") {
      return criarRespostaJSON({ status: "success", message: "Conexão com Google Sheets ativa!" });
    }
    
    if (acao === "add") {
      const t = dadosReq.transacao;
      if (!t || !t.id || !t.data || !t.tipo || !t.categoria || t.valor === undefined) {
        return criarRespostaJSON({ status: "error", message: "Dados da transação incompletos." });
      }
      
      // Salva na planilha: [ID, Data, Tipo, Categoria, Descrição, Valor]
      sheet.appendRow([
        String(t.id),
        String(t.data),
        String(t.tipo),
        String(t.categoria),
        String(t.descricao || ""),
        Number(t.valor)
      ]);
      
      return criarRespostaJSON({ status: "success", message: "Transação adicionada com sucesso!" });
    }
    
    if (acao === "delete") {
      const id = String(dadosReq.id);
      if (!id) {
        return criarRespostaJSON({ status: "error", message: "ID não fornecido para exclusão." });
      }
      
      const range = sheet.getDataRange();
      const valores = range.getValues();
      let excluida = false;
      
      // Percorre de baixo para cima para evitar problemas ao deletar linhas
      for (let i = valores.length - 1; i >= 1; i--) {
        if (String(valores[i][0]) === id) {
          sheet.deleteRow(i + 1); // +1 porque as linhas começam em 1 no Sheets
          excluida = true;
          break;
        }
      }
      
      if (excluida) {
        return criarRespostaJSON({ status: "success", message: "Transação deletada da planilha." });
      } else {
        return criarRespostaJSON({ status: "error", message: "Transação com ID não encontrada na planilha." });
      }
    }
    
    if (acao === "clear") {
      const totalLinhas = sheet.getLastRow();
      if (totalLinhas > 1) {
        sheet.deleteRows(2, totalLinhas - 1);
      }
      return criarRespostaJSON({ status: "success", message: "Todas as transações foram apagadas do Sheets." });
    }
    
    return criarRespostaJSON({ status: "error", message: "Ação desconhecida ou inválida." });
    
  } catch (erro) {
    return criarRespostaJSON({ status: "error", message: erro.toString() });
  }
}

// Função auxiliar para retornar saídas JSON prontas com CORS habilitado
function criarRespostaJSON(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
