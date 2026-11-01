#  Sistema de Chat - Poefo Libraly

##  Estrutura do Firebase (RTDB)

O sistema de chat utiliza a seguinte estrutura no Firebase Realtime Database:

### Pastas principais do Chat:

```
/chat
├── {convId}/messages
│   ├── {msgId}
│   │   ├── userId: string
│   │   ├── userName: string
│   │   ├── text: string
│   │   ├── mediaUrl: string (opcional)
│   │   ├── mediaType: string (opcional)
│   │   └── timestamp: number
│   └── ...

/chat_metadata
├── {convId}
│   ├── title: string
│   ├── participants: array
│   ├── createdAt: number
│   ├── createdBy: string
│   ├── lastMessage: string
│   ├── lastTimestamp: number
│   └── avatar: string (opcional)

/chat_users
├── {userId}/conversations
│   ├── {convId}
│   │   ├── title: string
│   │   ├── participants: array
│   │   ├── lastMessage: string
│   │   ├── lastTimestamp: number
│   │   ├── unreadCount: number
│   │   └── avatar: string (opcional)
│   └── ...
├── ...
```

### Outras pastas necessárias:

```
/usuarios
├── {userId}
│   ├── nome_usuario: string
│   ├── nome_completo: string
│   ├── handle: string
│   ├── foto_perfil: string
│   ├── bio: string
│   └── ...

/chat_media (Storage)
├── {convId}/
│   ├── {userId}/img_*.jpg|png|webp
│   ├── {userId}/audio_*.webm|ogg|m4a
│   └── video_*.mp4
```

Áudios e imagens são enviados ao Firebase Storage; as mensagens guardam a URL e o tipo do arquivo para exibição ou reprodução. Os arquivos permanecem no Storage enquanto a mensagem existir; não há expiração automática configurada.

##  Regras do Firebase (Security Rules)

### Opção 1: Com Autenticação (Produção)
Cole as regras abaixo no console do Firebase > Realtime Database > Rules:

```json
{
  "rules": {
    "chat": {
      "$convId": {
        "messages": {
          ".read": "root.child('chat_metadata').child($convId).child('participants').hasChild(auth.uid)",
          ".write": "root.child('chat_metadata').child($convId).child('participants').hasChild(auth.uid)",
          "$msgId": {
            ".validate": "newData.hasChildren(['userId', 'userName', 'text', 'timestamp'])"
          }
        }
      }
    },
    "chat_metadata": {
      "$convId": {
        ".read": "root.child('chat_metadata').child($convId).child('participants').hasChild(auth.uid)",
        ".write": "!data.exists() || root.child('chat_metadata').child($convId).child('createdBy').val() === auth.uid"
      }
    },
    "chat_users": {
      "$userId": {
        "conversations": {
          ".read": "$userId === auth.uid",
          ".write": "$userId === auth.uid"
        }
      }
    },
    "usuarios": {
      "$userId": {
        ".read": true,
        ".write": "$userId === auth.uid"
      }
    },
    "follows": {
      "$userId": {
        ".read": true,
        ".write": "auth.uid !== null"
      }
    },
    "followers": {
      "$userId": {
        ".read": true,
        ".write": "auth.uid !== null"
      }
    },
    "followers_count": {
      ".read": true,
      ".write": false
    },
    "following_count": {
      ".read": true,
      ".write": false
    },
    ".read": false,
    ".write": false
  }
}
```

### Opção 2: Desenvolvimento (Sem Autenticação - USE TEMPORARIAMENTE)
Se está desenvolvendo e quer testar SEM autenticação, use estas regras:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

** AVISO**: Esta regra permite acesso a TODOS! Nunca use em produção!

### Opção 3: Desenvolvimento com Validação (Recomendado)
Regras mais seguras para desenvolvimento:

```json
{
  "rules": {
    "chat": {
      "$convId": {
        "messages": {
          ".read": true,
          ".write": true,
          "$msgId": {
            ".validate": "newData.hasChildren(['userId', 'userName', 'text', 'timestamp'])"
          }
        }
      }
    },
    "chat_metadata": {
      "$convId": {
        ".read": true,
        ".write": true
      }
    },
    "chat_users": {
      "$userId": {
        "conversations": {
          ".read": true,
          ".write": true
        }
      }
    },
    "usuarios": {
      ".read": true,
      ".write": true
    },
    "follows": {
      ".read": true,
      ".write": true
    },
    "followers": {
      ".read": true,
      ".write": true
    },
    "followers_count": {
      ".read": true,
      ".write": true
    },
    "following_count": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Como Mudar as Regras:

1. Acesse o [Firebase Console](https://console.firebase.google.com)
2. Vá para seu projeto "captu-libraly"
3. Clique em "Realtime Database" no menu esquerdo
4. Clique na aba "Rules"
5. Cole uma das regras acima
6. Clique em "Publish"    "follows": {
      "$userId": {
        ".read": true,
        ".write": "auth.uid !== null"
      }
    },
    "followers": {
      "$userId": {
        ".read": true,
        ".write": "auth.uid !== null"
      }
    },
    "followers_count": {
      ".read": true,
      ".write": false
    },
    "following_count": {
      ".read": true,
      ".write": false
    },
    ".read": false,
    ".write": false
  }
}
```

### Regras do Firebase Storage

Cole as regras abaixo no console > Storage > Rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /chat_media/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.size < 52428800; // 50MB max
    }
    match /livros_json/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

##  Funcionalidades Implementadas

**Chat Direto**: Conversa entre dois usuários  
 **Chat em Grupo**: Selecione dois ou mais contatos e, opcionalmente, informe um nome para o grupo.
  **Mensagens de Texto**: Envio e recebimento de mensagens  
 **Imagens**: Upload e visualização de imagens  
 **Áudio**: Gravação e envio de mensagens de áudio  
 **Vídeo**: Suporte para upload de vídeos  
 **Busca**: Buscar conversas por nome  
 **Perfil do Usuário**: Visualizar perfil ao clicar no header  
 **Lista de Conversas**: Com último título e mensagem  
**Design Responsivo**: Desktop e Mobile (Instagram/X inspired)  
 **Modal de Nova Conversa/Grupo**: Seletor com fotos de perfil dos participantes

As Cloud Functions `indexNewConversation` e `syncConversationOnMessage` criam a conversa na lista de cada participante e mantêm as prévias e contagens de mensagens não lidas atualizadas. Faça o deploy das Functions para habilitar a sincronização entre participantes:

```shell
firebase deploy --only functions
```

##  Como Usar

### 1. **Abrir Chat**
Acesse `/Captu_library/html/chat.html`

### 2. **Iniciar Conversa Direta**
- Clique no avatar de um usuário em qualquer página
- Selecione "Mensagem"
- A conversa será aberta automaticamente

### 3. **Criar Grupo**
- Clique no ícone  (novo) no header de Mensagens
- Selecione usuários
- Clique em "Criar"

### 4. **Enviar Mensagens**
- Digite texto e envie
- Clique em para imagem
- Clique em para gravar áudio

### 5. **Ver Perfil do Destinatário**
- Clique no header (nome do usuário)
- Abre a página de visualização de perfil

##  Ajustes Necessários

### 1. **Definir usuário logado**
No `sessionStorage`, certifique-se de ter:
```javascript
sessionStorage.setItem('currentUserId', 'seu_user_id_firebase');
sessionStorage.setItem('currentUserName', 'Seu Nome');
sessionStorage.setItem('currentUserAvatar', 'url_da_avatar');
```

### 2. **Dados do banco**
Certifique-se de que `/usuarios` tem estrutura:
```json
{
  "userId1": {
    "nome_usuario": "usuario",
    "nome_completo": "Usuário Completo",
    "foto_perfil": "https://...",
    "bio": "Minha bio",
    "handle": "@usuario"
  }
}
```

### 3. **Permitir uploads**
Certifique-se de que as regras do Storage estão corretas para permitir uploads em `chat_media/`

##  Responsividade

- **Desktop**: Sidebar + Chat lado a lado
- **Mobile**: Sidebar se recolhe, use o hamburger (☰) para abrir
- **Tablet**: Modo intermediário

##  Limitações e Notas

1. **Máximo de upload**: 50MB por arquivo
2. **Tipos suportados**: Imagem (jpg, png, webp), Áudio (webm), Vídeo (mp4)
3. **Limite de conversas**: Sem limite (mas considere paginação se >1000)
4. **Tempo real**: Usa listeners do Firebase (pode ter latência)

##  Troubleshooting
### "Permission denied" ao enviar mensagem
- Verifique as regras do Firebase Realtime Database
- Certifique-se de que o usuário está autenticado
- Verifique se `sessionStorage.currentUserId` é válido

### Imagens/áudio não carregam
- Verifique as regras do Firebase Storage
- Confirme que o upload foi bem-sucedido
- Verifique a URL de download gerada

### Chat não carrega conversas
- Verifique se `/chat_users/{userId}/conversations` existe
- Confirme permissões de leitura
- Abra console > Network para ver erros

##  Referências

- [Firebase Realtime Database](https://firebase.google.com/docs/database)
- [Firebase Storage](https://firebase.google.com/docs/storage)
- [Firebase Security Rules](https://firebase.google.com/docs/database/security)

---

**Versão**: 1.0  
**Última atualização**: 20 de fevereiro de 2026  
**Status**:  Pronto para produção (com testes)
