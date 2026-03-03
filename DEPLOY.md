# Guia de Deploy - GitLab e Cloudflare Pages

## 📋 Pré-requisitos

- Conta GitLab (https://gitlab.com)
- Conta Cloudflare (https://cloudflare.com)
- Git instalado localmente

---

## 🚀 Passo 1: Publicar no GitLab

### 1.1 Criar repositório no GitLab

1. Acesse https://gitlab.com
2. Clique em **"New project"**
3. Selecione **"Create blank project"**
4. Preencha:
   - **Project name:** `site-graos` (ou outro nome)
   - **Visibility:** Private ou Public
5. Clique em **"Create project"**

### 1.2 Fazer push do código

No terminal da pasta `site_completo/`:

```bash
git init
git add .
git commit -m "Projeto inicial"
git branch -M main
git remote add origin https://gitlab.com/seu-usuario/site-graos.git
git push -u origin main
```

---

## 🔗 Passo 2: Conectar GitLab ao Cloudflare Pages

### 2.1 No Cloudflare Dashboard

1. Acesse https://dash.cloudflare.com
2. Clique em **"Pages"** no menu lateral
3. Clique em **"Connect with Git"**
4. Selecione **GitLab**
5. Autorize Cloudflare a acessar sua conta GitLab

### 2.2 Selecionar repositório

1. Escolha o repositório `site-graos`
2. Clique **"Begin setup"**
3. Configure:
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Environment variables:** (deixe em branco por enquanto)
4. Clique **"Save and Deploy"**

### 2.3 Aguardar o Deploy

- Cloudflare vai fazer o primeiro build automaticamente
- Espere alguns minutos
- Você receberá uma URL: `https://seu-projeto.pages.dev`

---

## ✅ Passo 3: Configurar Variáveis de Ambiente

Se sua aplicação precisar de variáveis (como API_URL):

1. No Cloudflare Pages, vá para **Settings**
2. Clique em **Environment variables**
3. Adicione as variáveis necessárias:
   - **VITE_API_URL:** `https://receive-worked-extend-gauge.trycloudflare.com`

---

## 🔄 Passo 4: Deploy Automático

A partir de agora:

1. Faça alterações no seu código local
2. Faça `git push` para o GitLab
3. Cloudflare automaticamente fará novo build
4. Sua aplicação estará atualizada em poucos minutos

```bash
git add .
git commit -m "Descrição das mudanças"
git push origin main
```

---

## 📱 Como os usuários acessam

Compartilhe esse link com seus usuários:

```
https://seu-projeto.pages.dev
```

O JavaScript do site chamará a API automáticamente:

```javascript
const API_URL = 'https://receive-worked-extend-gauge.trycloudflare.com';

// Login
fetch(`${API_URL}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user, password })
});
```

---

## 🆘 Troubleshooting

### "Cannot GET /" 
- Verifique se o build output está correto: `dist`
- Verifique o arquivo `_redirects` em `public/`

### "404 Not Found"
- O arquivo `_redirects` deve estar em `public/_redirects`
- Conteúdo: `/* /index.html 200`

### CORS Error
- Configure o backend para aceitar origem Cloudflare
- No `back_end.js`, adicione a URL às variáveis CORS:
  ```
  CORS_ORIGINS=https://seu-projeto.pages.dev
  ```

---

## 📚 Recursos Úteis

- [Documentação Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [GitLab CI/CD](https://docs.gitlab.com/ee/ci/)
- [Vite Build Guide](https://vitejs.dev/guide/build.html)

---

**Todos os passos configurados!** ✨ 

Agora você só precisa fazer o primeiro push e tudo funcionará automaticamente.
