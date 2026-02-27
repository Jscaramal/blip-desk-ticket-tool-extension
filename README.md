# 🎫 Desk Ticket Helper

<div align="center">

**[🇧🇷 Português Brasileiro](#português-brasileiro) | [🇬🇧 English](#english)**

Uma extensão de navegador poderosa para gerenciar tickets no Blip Desk com eficiência.

![Chrome](https://img.shields.io/badge/Chrome-Compatible-brightgreen)
![Manifest v3](https://img.shields.io/badge/Manifest-v3-blue)
![Version](https://img.shields.io/badge/Version-0.2.0-blue)

</div>

---

## Português Brasileiro

### 📋 O que é?

O **Desk Ticket Helper** é uma extensão de navegador que automatiza tarefas repetitivas ao trabalhar com tickets no **Blip Desk**. A ferramenta permite:

- ✅ **Criar tickets em lote** através da plataforma 0mn.io
- ✅ **Fechar múltiplos tickets** capturados no Desk automaticamente
- ✅ **Integração perfeita** com o fluxo de trabalho Blip
- ✅ **Configuração segura** com API Key

### 🚀 Como Instalar para Desenvolvimento

#### Pré-requisitos
- Google Chrome ou navegador compatível com Manifest v3
- Git (opcional, mas recomendado)

#### Passos para Instalar

1. **Clone ou baixe o repositório**
   ```bash
   git clone https://github.com/seu-usuario/deskTicketExtension.git
   cd deskTicketExtension
   ```

2. **Abra a página de extensões do Chrome**
   - Digite na barra de endereço: `chrome://extensions/`
   - Ou vá em **Menu** → **Mais ferramentas** → **Extensões**

3. **Ative o Modo de Desenvolvedor**
   - No canto superior direito, ative a opção **"Modo de desenvolvedor"**

4. **Carregue a extensão**
   - Clique em **"Carregar extensão sem empacotamento"**
   - Selecione a pasta do projeto

5. **Configure a extensão**
   - Clique no ícone da extensão na barra de ferramentas
   - Insira sua **API Key** e o nome do **Bot** (ex: scarathuhmg)
   - Clique em **"Salvar"**

6. **Comece a usar!**
   - Acesse qualquer página do Blip (https://blip.ai)
   - A extensão funcionará automaticamente

### 🛠️ Desenvolvimento

**Estrutura do Projeto:**
- `manifest.json` - Configuração da extensão
- `popup.html` / `popup.css` / `popup.js` - Interface da extensão
- `content.js` - Script injetado nas páginas do Blip
- `background.js` - Service worker de fundo

**Fazer alterações:**
1. Edite os arquivos conforme necessário
2. Na página `chrome://extensions/`, clique no botão **"Atualizar"** 
3. Recarregue a página do Blip para ver as mudanças

---

## English

### 📋 What is it?

**Desk Ticket Helper** is a browser extension that automates repetitive tasks when working with tickets in **Blip Desk**. The tool allows you to:

- ✅ **Create tickets in bulk** through the 0mn.io platform
- ✅ **Close multiple tickets** captured in Desk automatically
- ✅ **Seamless integration** with Blip workflow
- ✅ **Secure configuration** with API Key

### 🚀 How to Install for Development

#### Prerequisites
- Google Chrome or compatible browser with Manifest v3 support
- Git (optional, but recommended)

#### Installation Steps

1. **Clone or download the repository**
   ```bash
   git clone https://github.com/your-username/deskTicketExtension.git
   cd deskTicketExtension
   ```

2. **Open Chrome Extensions page**
   - Type in address bar: `chrome://extensions/`
   - Or go to **Menu** → **More tools** → **Extensions**

3. **Enable Developer Mode**
   - In the top right corner, toggle **"Developer mode"** ON

4. **Load the extension**
   - Click **"Load unpacked"**
   - Select the project folder

5. **Configure the extension**
   - Click the extension icon in the toolbar
   - Enter your **API Key** and **Bot** name (ex: scarathuhmg)
   - Click **"Save"**

6. **Start using!**
   - Access any Blip page (https://blip.ai)
   - The extension will work automatically

### 🛠️ Development

**Project Structure:**
- `manifest.json` - Extension configuration
- `popup.html` / `popup.css` / `popup.js` - Extension UI
- `content.js` - Script injected into Blip pages
- `background.js` - Background service worker

**Making changes:**
1. Edit files as needed
2. On `chrome://extensions/`, click the **"Refresh"** button
3. Reload the Blip page to see changes

---

<div align="center">

**Made with ❤️ for the Blip community**

</div>