#!/bin/bash

# 🔄 Script de Atualização Automática do Bot Discord
# Salve como: /root/update-bot.sh
# Permissão: chmod +x /root/update-bot.sh

echo "🚀 Iniciando atualização do bot..."

# Navegar para o diretório do projeto
cd /root/bot-moderacao

# Fazer backup do database antes da atualização
echo "💾 Fazendo backup do database..."
cp database/bot.sqlite database/backup-$(date +%Y%m%d-%H%M%S).sqlite

# Parar o bot
echo "⏸️  Parando o bot..."
pm2 stop discord-bot

# Atualizar código do GitHub
echo "📥 Baixando atualizações..."
git pull origin main

# Instalar novas dependências (se houver)
echo "📦 Instalando dependências..."
npm install

# Compilar TypeScript
echo "🔨 Compilando TypeScript..."
npm run build

# Reiniciar o bot
echo "🔄 Reiniciando o bot..."
pm2 restart discord-bot

# Verificar status
echo "✅ Verificando status..."
pm2 status

# Mostrar logs recentes
echo "📋 Logs recentes:"
pm2 logs discord-bot --lines 10

echo "🎉 Atualização concluída!"
echo "📊 Para monitorar: pm2 logs discord-bot"
