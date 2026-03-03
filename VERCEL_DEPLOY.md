# Guia de Deploy - GitLab + Vercel

## 🚀 Resumo Rápido

1. Push no GitLab
2. Conectar Vercel ao GitLab
3. Pronto! Deploy automático

---

## 📋 Passo 1: Publicar no GitLab

### 1.1 Criar repositório (primeira vez)

No terminal dentro da pasta `site_completo/`:

```bash
git init
git add .
git commit -m "Projeto inicial"
git branch -M main
```

### 1.2 Criar repositório no GitLab

1. Acesse https://gitlab.com
2. Clique **"New project"** → **"Create blank project"**
3. Nome: `site-graos`
4. Visibilidade: **Private** (recomendado)
5. Clique **"Create project"**

### 1.3 Fazer push

Copie os comandos que o GitLab mostra e execute:

```bash
git remote add origin https://gitlab.com/seu-usuario/site-graos.git
git push -u origin main
```

✅ **Repositório criado no GitLab!**

---

## 🔗 Passo 2: Deploy no Vercel

### 2.1 Acessar Vercel

1. Acesse https://vercel.com
2. Clique em **"Sign up"** (ou Login se já tem conta)
3. **"Continue with GitLab"**
4. Autorize Vercel a acessar sua conta GitLab

### 2.2 Importar projeto

1. Clique em **"Add New..."** → **"Project"**
2. Em **"GitLab"**, localize `site-graos`
3. Clique em **"Import"**

### 2.3 Configurar Build

Na tela de configuração:

- **Framework Preset:** `Vite`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm ci`

Clique em **"Deploy"** 

⏳ Espere alguns minutos para o primeiro deploy...

### 2.4 Seu link está pronto!

Vercel vai gerar uma URL:
```
https://site-graos.vercel.app
```

(Você pode renomear depois se quiser)

---

## 🔧 Configurar Variáveis de Ambiente

Na aplicação React, atualize a URL da API:

1. No Vercel, vá para **Settings** → **Environment Variables**
2. Adicione:
   ```
   VITE_API_URL = https://receive-worked-extend-gauge.trycloudflare.com
   ```

No seu código React (`src/`), use:
```javascript
const API_URL = process.env.VITE_API_URL || 'https://receive-worked-extend-gauge.trycloudflare.com';

// Exemplo: Login
fetch(`${API_URL}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user, password })
});
```

---

## ♻️ Fazer Atualizações

Toda vez que fizer mudanças:

```bash
git add .
git commit -m "Descrição das mudanças"
git push origin main
```

**Vercel automaticamente:**
- ✅ Faz o build
- ✅ Detecta erros
- ✅ Publica a nova versão

---

## 📱 Compartilhar com Usuários

Link para seus usuários acessarem:
```
https://site-graos.vercel.app
```

A aplicação chama o backend automaticamente via JavaScript!

---

## ✨ Você está pronto!

**Próximos passos:**
1. Fazer primeiro push no GitLab
2. Conectar no Vercel
3. Compartilhar link com usuários
4. Tudo automático!

Dúvidas? 📞
- [Docs Vercel](https://vercel.com/docs)
- [Docs GitLab](https://docs.gitlab.com)
