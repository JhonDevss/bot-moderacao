const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, getVoiceConnection } = require('@discordjs/voice');
const playdl = require('play-dl');
const ytdl = require('ytdl-core');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Inicializar play-dl
(async () => {
  try {
    await playdl.setToken({
      useragent: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
    });
    console.log('[MUSIC] play-dl inicializado com sucesso');
  } catch (error) {
    console.log('[MUSIC] Erro ao inicializar play-dl:', error.message);
  }
})();

// Fila de músicas por guild
const queue = new Map();

// Sistema de loop: 0 = off, 1 = song, 2 = queue
const loopMode = new Map();

// Sistema de favoritos por usuário
const favorites = new Map();

// Função para criar stream com fallback
async function createStream(url) {
  console.log('[MUSIC] Tentando criar stream para:', url);
  
  // Validar se é uma URL do YouTube válida
  if (!url || typeof url !== 'string') {
    throw new Error('URL inválida');
  }
  
  // Verificar se é uma URL do YouTube válida
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/;
  if (!youtubeRegex.test(url)) {
    throw new Error('URL deve ser do YouTube');
  }
  
  // Tentar diferentes abordagens com play-dl
  try {
    console.log('[MUSIC] Tentando com play-dl...');
    
    // Primeiro, verificar se o vídeo existe
    const videoInfo = await playdl.video_info(url);
    if (!videoInfo || !videoInfo.video_details) {
      throw new Error('Vídeo não encontrado');
    }
    
    console.log('[MUSIC] Vídeo encontrado:', videoInfo.video_details.title);
    
    // Tentar criar o stream
    const streamInfo = await playdl.stream(url, { 
      quality: 2,
      discordPlayerCompatibility: true 
    });
    
    console.log('[MUSIC] Stream criado com play-dl, tipo:', streamInfo.type);
    return {
      stream: streamInfo.stream,
      type: streamInfo.type || playdl.StreamType.OPUS,
      source: 'play-dl'
    };
  } catch (error) {
    console.log('[MUSIC] play-dl falhou:', error.message);
    
    // Tentar com ytdl-core como fallback
    try {
      console.log('[MUSIC] Tentando fallback com ytdl-core...');
      
      if (!ytdl.validateURL(url)) {
        throw new Error('URL inválida para ytdl-core');
      }
      
      const stream = ytdl(url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
      });
      
      console.log('[MUSIC] Stream criado com ytdl-core');
      return {
        stream: stream,
        type: 'arbitrary',
        source: 'ytdl-core'
      };
    } catch (ytdlError) {
      console.log('[MUSIC] ytdl-core também falhou:', ytdlError.message);
      
      // Dar mensagens de erro mais específicas
      if (error.message.includes('Invalid URL') || error.message.includes('Vídeo não encontrado')) {
        throw new Error('URL do YouTube inválida ou vídeo não encontrado');
      } else if (error.message.includes('Sign in to confirm')) {
        throw new Error('Vídeo privado ou com restrição de idade');
      } else if (error.message.includes('unavailable')) {
        throw new Error('Vídeo não disponível');
      } else {
        throw new Error(`Erro ao processar vídeo: ${error.message}`);
      }
    }
  }
}

function playSong(guild, song, interaction) {
  const serverQueue = queue.get(guild.id);
  const loop = loopMode.get(guild.id) || 0;
  
  console.log('[MUSIC] playSong chamada:', song && song.title, song && song.url);
  
  if (!song || !song.url || typeof song.url !== 'string' || song.url === 'undefined') {
    console.log('[MUSIC] URL inválida ou música não encontrada:', song?.url);
    if (serverQueue && serverQueue.songs.length === 0) {
      serverQueue.connection.destroy();
      queue.delete(guild.id);
      loopMode.delete(guild.id);
    }
    if (interaction && interaction.editReply) {
      interaction.editReply({ embeds: [{ title: 'Erro', description: 'URL da música é inválida.', color: 0xFF0000 }] });
    }
    return;
  }

  // Verificação adicional para URLs do YouTube
  if (!song.url.startsWith('http')) {
    console.log('[MUSIC] URL não começa com http:', song.url);
    if (serverQueue && serverQueue.songs.length === 0) {
      serverQueue.connection.destroy();
      queue.delete(guild.id);
      loopMode.delete(guild.id);
    }
    if (interaction && interaction.editReply) {
      interaction.editReply({ embeds: [{ title: 'Erro', description: 'URL da música é inválida.', color: 0xFF0000 }] });
    }
    return;
  }

  console.log('[MUSIC] Tentando criar stream para:', song.url);
  
  createStream(song.url).then(({ stream, type, source }) => {
    console.log('[MUSIC] Stream criado com sucesso usando:', source, 'tipo:', type);
    const resource = createAudioResource(stream, { inputType: type });
    
    // Adicionar handler de erro para o resource
    resource.playStream.on('error', (error) => {
      console.log('[MUSIC] Erro no stream:', error.message);
      console.log('[MUSIC] Tentando próxima música...');
      
      // Tentar próxima música automaticamente
      if (serverQueue && serverQueue.songs.length > 1) {
        serverQueue.songs.shift();
        setTimeout(() => {
          playSong(guild, serverQueue.songs[0], interaction);
        }, 1000);
      } else if (serverQueue) {
        serverQueue.connection.destroy();
        queue.delete(guild.id);
        loopMode.delete(guild.id);
      }
    });
    
    serverQueue.player.play(resource);
    serverQueue.nowPlaying = song;
    console.log('[MUSIC] player.play chamado');

    // Update now playing message
    updateNowPlayingMessage(guild, song);

    serverQueue.player.once(AudioPlayerStatus.Playing, () => {
      console.log('[MUSIC] player está tocando áudio');
    });

    // Adicionar handler de erro para o player
    serverQueue.player.once('error', (error) => {
      console.log('[MUSIC] AudioPlayer erro:', error.message);
      // Tentar próxima música
      if (serverQueue && serverQueue.songs.length > 1) {
        serverQueue.songs.shift();
        setTimeout(() => {
          playSong(guild, serverQueue.songs[0], interaction);
        }, 1000);
      } else if (serverQueue) {
        serverQueue.connection.destroy();
        queue.delete(guild.id);
        loopMode.delete(guild.id);
      }
    });

    serverQueue.player.once(AudioPlayerStatus.Idle, () => {
      console.log('[MUSIC] player ficou idle, próxima música');
      
      if (loop === 1) {
        // Loop da música atual
        playSong(guild, song, interaction);
        return;
      }
      
      serverQueue.songs.shift();
      
      if (loop === 2 && serverQueue.songs.length === 0 && serverQueue.originalQueue) {
        // Loop da queue - restaura a queue original
        serverQueue.songs = [...serverQueue.originalQueue];
      }
      
      if (serverQueue.songs.length > 0) {
        playSong(guild, serverQueue.songs[0], interaction);
      } else {
        serverQueue.connection.destroy();
        queue.delete(guild.id);
        loopMode.delete(guild.id);
      }
    });

  }).catch((err) => {
    console.log('[MUSIC] Erro ao criar stream:', err.message);
    console.log('[MUSIC] URL que causou erro:', song.url);
    if (interaction && interaction.editReply) {
      interaction.editReply({ embeds: [{ title: 'Erro', description: `Não foi possível tocar esta música: ${err.message}`, color: 0xFF0000 }] });
    }
    
    // Tentar próxima música se houver
    if (serverQueue && serverQueue.songs.length > 1) {
      console.log('[MUSIC] Pulando para próxima música devido ao erro...');
      serverQueue.songs.shift(); // Remove a música com erro
      setTimeout(() => {
        playSong(guild, serverQueue.songs[0], interaction);
      }, 1000);
    } else if (serverQueue) {
      serverQueue.connection.destroy();
      queue.delete(guild.id);
      loopMode.delete(guild.id);
    }
  });
}

function updateNowPlayingMessage(guild, song) {
  const serverQueue = queue.get(guild.id);
  if (!serverQueue || !serverQueue.textChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('🎵 Tocando Agora')
    .setDescription(`**${song.title}**`)
    .setColor(0x00FF99)
    .setURL(song.url)
    .setFooter({ text: `${serverQueue.songs.length} música(s) na fila` });

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('music_pause')
        .setEmoji('⏸️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_skip')
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_stop')
        .setEmoji('⏹️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('music_loop')
        .setEmoji('🔁')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('music_queue')
        .setEmoji('📄')
        .setStyle(ButtonStyle.Secondary)
    );

  serverQueue.textChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Função utilitária para verificar canal de voz
async function checkVoiceChannel(interaction) {
  let member = interaction.member;
  
  // Se o membro não está completamente carregado, busca-lo
  if (!member || !member.voice) {
    try {
      member = await interaction.guild.members.fetch(interaction.user.id);
    } catch (error) {
      console.error('[MUSIC] Erro ao buscar membro:', error);
      return { error: 'Erro ao verificar seu status de voz. Tente novamente.' };
    }
  }

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    return { error: 'Você precisa estar em um canal de voz para usar comandos de música!' };
  }

  // Verificar se o bot já está em um canal de voz diferente
  const serverQueue = queue.get(interaction.guild.id);
  if (serverQueue && serverQueue.voiceChannel && serverQueue.voiceChannel.id !== voiceChannel.id) {
    return { error: `Eu já estou tocando música no canal <#${serverQueue.voiceChannel.id}>!` };
  }

  const permissions = voiceChannel.permissionsFor(interaction.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return { error: 'Preciso de permissão para entrar e falar no canal de voz!' };
  }

  return { voiceChannel, member };
}

module.exports = {
  queue,
  loopMode,
  favorites,
  
  async executePlay(interaction, query) {
    // Verificar canal de voz usando função utilitária
    const voiceCheck = await checkVoiceChannel(interaction);
    if (voiceCheck.error) {
      return interaction.reply({ content: voiceCheck.error, ephemeral: true });
    }

    const voiceChannel = voiceCheck.voiceChannel;

    await interaction.deferReply();

    try {
      let songs = [];
      
      // Se for uma URL do YouTube
      if (typeof query === 'string' && query.startsWith('http')) {
        if (query.includes('playlist')) {
          // Playlist
          const playlist = await playdl.playlist_info(query);
          const videos = await playlist.all_videos();
          
          for (const video of videos.slice(0, 50)) { // Limita a 50 músicas
            songs.push({
              title: video.title || 'Título não disponível',
              url: video.url,
              duration: video.durationRaw || 'Duração desconhecida',
              thumbnail: video.thumbnails?.[0]?.url,
              requester: interaction.user.tag
            });
          }
          
          if (songs.length === 0) throw new Error('Playlist vazia ou inacessível.');
          
        } else {
          // Vídeo único
          const info = await playdl.video_info(query);
          let videoUrl = info.video_details.url;
          
          // Se não conseguir a URL do video_details, construir manualmente
          if (!videoUrl) {
            videoUrl = `https://www.youtube.com/watch?v=${info.video_details.id}`;
          }
          
          // Verificação adicional para garantir que temos uma URL válida
          if (!videoUrl || videoUrl === 'undefined') {
            throw new Error('Não foi possível obter URL válida do vídeo.');
          }
          
          songs.push({
            title: info.video_details.title || 'Título não disponível',
            url: videoUrl,
            duration: info.video_details.durationRaw || 'Duração desconhecida',
            thumbnail: info.video_details.thumbnails?.[0]?.url,
            requester: interaction.user.tag
          });
        }
      } else {
        // Busca pelo nome
        console.log('[MUSIC] Buscando por:', query);
        
        const results = await playdl.search(query, { 
          limit: 5,
          source: { youtube: "video" }
        });
        
        console.log('[MUSIC] Resultados encontrados:', results.length);
        
        if (!results || results.length === 0) {
          throw new Error('Nenhum resultado encontrado para sua busca.');
        }
        
        const firstResult = results[0];
        console.log('[MUSIC] Primeiro resultado:', firstResult.title, firstResult.url);
        
        let videoUrl = firstResult.url;
        
        // Verificação final da URL
        if (!videoUrl || videoUrl === 'undefined' || typeof videoUrl !== 'string') {
          throw new Error('URL do resultado da busca é inválida.');
        }
        
        // Garantir que a URL tem o formato correto
        if (!videoUrl.startsWith('http')) {
          if (firstResult.id) {
            videoUrl = `https://www.youtube.com/watch?v=${firstResult.id}`;
          } else {
            throw new Error('Não foi possível construir URL válida do vídeo.');
          }
        }
        
        console.log('[MUSIC] URL final:', videoUrl);
        
        songs.push({
          title: firstResult.title || 'Título não disponível',
          url: videoUrl,
          duration: firstResult.durationRaw || 'Duração desconhecida',
          thumbnail: firstResult.thumbnails?.[0]?.url,
          requester: interaction.user.tag
        });
      }

      let serverQueue = queue.get(interaction.guild.id);
      
      if (!serverQueue) {
        const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        const queueData = {
          textChannel: interaction.channel,
          voiceChannel,
          connection,
          player,
          songs: songs,
          volume: 50,
          nowPlaying: null,
          originalQueue: [...songs]
        };

        queue.set(interaction.guild.id, queueData);
        connection.subscribe(player);
        
        playSong(interaction.guild, songs[0], interaction);
        
        if (songs.length === 1) {
          await interaction.editReply(`🎵 Tocando: **${songs[0].title}**`);
        } else {
          await interaction.editReply(`🎵 Adicionadas **${songs.length}** músicas à fila! Tocando: **${songs[0].title}**`);
        }
      } else {
        serverQueue.songs.push(...songs);
        serverQueue.originalQueue = [...serverQueue.songs];
        
        if (songs.length === 1) {
          await interaction.editReply(`➕ Adicionado à fila: **${songs[0].title}** (Posição #${serverQueue.songs.length})`);
        } else {
          await interaction.editReply(`➕ Adicionadas **${songs.length}** músicas à fila!`);
        }
      }
      
    } catch (err) {
      console.error('[MUSIC] Erro no executePlay:', err);
      await interaction.editReply({ 
        embeds: [{ 
          title: 'Erro', 
          description: err.message || 'Ocorreu um erro ao executar o comando.', 
          color: 0xFF0000 
        }] 
      });
    }
  },

  skip(interaction) {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply({ content: 'Não há músicas na fila.', ephemeral: true });
    
    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }
    
    serverQueue.player.stop();
    interaction.reply('⏭️ Música pulada!');
  },

  stop(interaction) {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply({ content: 'Não há músicas para parar.', ephemeral: true });
    
    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }
    
    serverQueue.songs = [];
    serverQueue.player.stop();
    serverQueue.connection.destroy();
    queue.delete(interaction.guild.id);
    loopMode.delete(interaction.guild.id);
    interaction.reply('⏹️ Música parada e fila limpa!');
  },

  pause(interaction) {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply({ content: 'Não há músicas tocando.', ephemeral: true });
    
    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }
    
    if (serverQueue.player.state.status === AudioPlayerStatus.Playing) {
      serverQueue.player.pause();
      interaction.reply('⏸️ Música pausada!');
    } else {
      interaction.reply({ content: 'A música não está tocando.', ephemeral: true });
    }
  },

  resume(interaction) {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply({ content: 'Não há músicas para retomar.', ephemeral: true });
    
    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }
    
    if (serverQueue.player.state.status === AudioPlayerStatus.Paused) {
      serverQueue.player.unpause();
      interaction.reply('▶️ Música retomada!');
    } else {
      interaction.reply({ content: 'A música não está pausada.', ephemeral: true });
    }
  },

  getQueue(guildId) {
    return queue.get(guildId);
  },

  shuffleQueue(interaction) {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue || serverQueue.songs.length <= 1) {
      return interaction.reply({ content: 'Não há músicas suficientes na fila para embaralhar.', ephemeral: true });
    }

    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }

    const currentSong = serverQueue.songs.shift();
    serverQueue.songs = shuffleArray(serverQueue.songs);
    serverQueue.songs.unshift(currentSong);
    
    interaction.reply('🔀 Fila embaralhada!');
  },

  setLoop(interaction, mode) {
    if (![0, 1, 2].includes(mode)) {
      return interaction.reply({ content: 'Modo de loop inválido. Use 0 (desligado), 1 (música) ou 2 (fila).', ephemeral: true });
    }

    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) {
      return interaction.reply({ content: 'Não há músicas tocando.', ephemeral: true });
    }

    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }

    loopMode.set(interaction.guild.id, mode);
    
    const modes = ['desligado', 'música atual', 'fila completa'];
    interaction.reply(`🔁 Loop ${modes[mode]}!`);
  },

  removeFromQueue(interaction, position) {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply({ content: 'Não há músicas na fila.', ephemeral: true });
    
    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }
    
    if (position < 1 || position > serverQueue.songs.length) {
      return interaction.reply({ content: 'Posição inválida.', ephemeral: true });
    }

    const removedSong = serverQueue.songs.splice(position - 1, 1)[0];
    interaction.reply(`🗑️ Removido da fila: **${removedSong.title}**`);
  },

  moveInQueue(interaction, from, to) {
    const serverQueue = queue.get(interaction.guild.id);
    if (!serverQueue) return interaction.reply({ content: 'Não há músicas na fila.', ephemeral: true });
    
    // Verificar se o usuário está no mesmo canal de voz que o bot
    if (interaction.member.voice.channel?.id !== serverQueue.voiceChannel?.id) {
      return interaction.reply({ 
        content: 'Você precisa estar no mesmo canal de voz que o bot!', 
        ephemeral: true 
      });
    }
    
    if (from < 1 || from > serverQueue.songs.length || to < 1 || to > serverQueue.songs.length) {
      return interaction.reply({ content: 'Posição inválida.', ephemeral: true });
    }

    const song = serverQueue.songs.splice(from - 1, 1)[0];
    serverQueue.songs.splice(to - 1, 0, song);
    
    interaction.reply(`📝 Movido **${song.title}** da posição ${from} para ${to}!`);
  }
};
