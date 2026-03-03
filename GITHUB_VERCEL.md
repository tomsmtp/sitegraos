# Deploy: GitHub + Vercel

## 📋 Passo 1: Criar Repositório no GitHub

1. Acesse https://github.com
2. Faça login (ou crie conta se não tem)
3. Clique em **"+"** (canto superior direito)
4. Selecione **"New repository"**
5. Configure:
   - **Repository name:** `site-graos`
   - **Description:** `Site de Gestão de Grãos`
   - **Visibility:** `Private` (recomendado)
   - **NÃO** inicialize com README (você já tem)
6. Clique **"Create repository"**

---

## 🔄 Passo 2: Fazer Push para GitHub

No terminal (pasta `site_completo/`):

```bash
cd c:\Users\ailton.leme\Desktop\BACK_END_SITE_GRAOS\site_completo

# Remover origin anterior (Agroterenas)
git remote remove origin

# Adicionar novo origin (GitHub)
git remote add origin https://github.com/seu-usuario/site-graos.git

# Fazer push
git branch -M main
git push -u origin main
```

**Procure pelos comandos exatos que o GitHub mostra após criar o repositório.**

---

## 🚀 Passo 3: Conectar ao Vercel

1. Acesse https://vercel.com
2. Faça login ou Sign up com GitHub
3. Clique **"Add New..."** → **"Project"**
4. Selecione **"site-graos"** (seu repositório GitHub)
5. Configure:
   - **Framework:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
6. Clique **"Deploy"**

**Pronto!** Você receberá uma URL: `https://sitegraos.vercel.app`

---

## ♻️ Futuras Atualizações

```bash
# Você faz mudanças localmente
git add .
git commit -m "Minhas alterações"

# Push para GitHub
git push origin main

# Vercel automaticamente faz novo deploy!
```

---

## 🔗 Estrutura Final

```
GitHub (seu código)
    ↓
Vercel (publica automaticamente)
    ↓
https://sitegraos.vercel.app (seu site)
    ↓
API Backend (Agroterenas/Cloudflare)
```

---

**Dúvidas?** 📞
- [GitHub Docs](https://docs.github.com)
- [Vercel Docs](https://vercel.com/docs)
