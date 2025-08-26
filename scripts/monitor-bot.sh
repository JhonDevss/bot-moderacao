#!/bin/bash

# 📊 Script de Monitoramento do Bot Discord
# Salve como: /root/monitor-bot.sh
# Permissão: chmod +x /root/monitor-bot.sh
# Execute: ./monitor-bot.sh

echo "🤖 === MONITOR DO BOT DISCORD ==="
echo "📅 Data: $(date)"
echo "=================================="

# Verificar se PM2 está rodando
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 não encontrado!"
    exit 1
fi

# Status do bot
echo "📊 STATUS DO BOT:"
pm2 status discord-bot

# Uso de recursos do servidor
echo ""
echo "💻 RECURSOS DO SERVIDOR:"
echo "CPU: $(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1"%"}')"
echo "RAM: $(free | grep Mem | awk '{printf("%.1f%% (%.1fGB/%.1fGB)\n", ($3/$2) * 100.0, $3/1048576, $2/1048576)}')"
echo "DISK: $(df -h / | awk 'NR==2{printf "%s/%s (%s usado)\n", $3,$2,$5}')"

# Logs recentes (últimas 5 linhas)
echo ""
echo "📋 LOGS RECENTES:"
pm2 logs discord-bot --lines 5 --nostream

# Uptime
echo ""
echo "⏰ UPTIME:"
pm2 show discord-bot | grep "uptime"

# Verificar se o bot está respondendo
echo ""
echo "🔍 VERIFICAÇÃO DE SAÚDE:"
if pm2 list | grep -q "online.*discord-bot"; then
    echo "✅ Bot está ONLINE"
else
    echo "❌ Bot está OFFLINE - Tentando reiniciar..."
    pm2 restart discord-bot
fi

echo "=================================="
echo "🔄 Para atualizar: ./update-bot.sh"
echo "📊 Para logs ao vivo: pm2 logs discord-bot"
