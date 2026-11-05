#  Como eu organizei o chat do Poefo Libraly

##  Como eu organizo os dados no Firebase (RTDB)

Eu organizo as conversas nesta estrutura do Firebase Realtime Database:

### Estrutura principal que eu uso no chat:

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
│   ├── bookClub: { id, titulo, autor, link_capa, link_acesso } | null
│   ├── createdAt: number
│   ├── createdBy: string
│   ├── lastMessage: string
│   ├── lastTimestamp: number
│   ├── lastMessageSenderId: string (opcional)
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

/presence
├── {userId}/connections/{connectionId}: true
```

### Outras estruturas que eu uso:

```
/usuarios
├── {userId}
│   ├── nome_usuario: string
│   ├── nome_completo: string
│   ├── handle: string
│   ├── foto_perfil: string
│   ├── bio: string
│   └── ...
```

Eu uso Firebase Authentication para o login e mantenho como identificador de perfil a chave existente em `/usuarios`, preservando conversas, publicações e progresso. Guardo o UID autenticado no campo `authUid` do perfil. Nas regras do Realtime Database, valido essa associação e restrinjo gravações administrativas a contas autorizadas: autenticar alguém, por si só, não concede essas permissões.

```text
/chat_media (Storage)
├── {convId}/
│   ├── {authUid}/img_*.jpg|png|webp
│   ├── {authUid}/audio_*.webm|ogg|m4a
│   └── video_*.mp4
```

Eu envio áudios e imagens ao Firebase Storage e guardo na mensagem a URL e o tipo de arquivo para exibir ou reproduzir a mídia. Os arquivos ficam no Storage de forma independente e não configurei expiração automática.

Eu permito vincular um livro do catálogo a conversas e grupos em `chat_metadata/{convId}/bookClub`. O cartão do clube de leitura aparece para os participantes e pode ser alterado ou removido. Também disponibilizo o player de áudio na própria mensagem. Depois da primeira interação do usuário, reproduzo o som das mensagens recebidas na aba aberta, sem depender da permissão para notificações do sistema. Mantenho `lastMessageSenderId` pela Cloud Function para não tocar o alerta das mensagens que o próprio usuário enviou.

Eu permito que cada pessoa apague as próprias mensagens pelo botão de lixeira na conversa. A Cloud Function `deleteChatMessage` valida a conta autenticada, a participação na conversa e a autoria antes de remover o registro. Quando apago a mensagem mais recente, atualizo a prévia e o horário da conversa com a última mensagem restante, sem alterar os contadores de não lidas. A remoção da mensagem não apaga o arquivo de mídia correspondente do Storage.

Para disponibilizar essa ação, publico a função com `firebase deploy --only functions:deleteChatMessage`. A página do chat também carrega o SDK de Cloud Functions usado para chamar essa validação no servidor.

Eu mantenho a caixa de composição no fluxo flexível do chat, com os botões de imagem, áudio e envio sem encolher em telas estreitas. No celular, reduzo os espaçamentos e respeito a área segura inferior do dispositivo.

Eu acompanho cada conexão ativa em `presence/{userId}/connections`. O Firebase remove a conexão automaticamente quando o dispositivo desconecta; o cabeçalho mostra o estado real do contato ou quantas pessoas estão online no grupo. Eu removo os listeners da conversa anterior antes de abrir outra para que mensagens e estados de presença não vazem entre conversas.

Para permitir a leitura do status e limitar cada pessoa às próprias conexões, eu mesclo estas regras dentro de `rules` no Console do Firebase, preservando as outras regras existentes:

```json
{
  "presence": {
    "$profileId": {
      ".read": "auth != null",
      "connections": {
        "$connectionId": {
          ".write": "auth != null && root.child('usuarios').child($profileId).child('authUid').val() == auth.uid"
        }
      }
    }
  }
}
```

### Regras que eu uso no Firebase Storage para mídias do chat

No Console do Firebase, eu abro **Storage > Rules** e adiciono ou mesclo o bloco abaixo dentro de `match /b/{bucket}/o`. Preservo as regras existentes para os outros arquivos do Storage:

```javascript
match /chat_media/{conversationId}/{authUid}/{fileName} {
  allow create: if request.auth != null
    && request.auth.uid == authUid
    && request.resource.size <= 20 * 1024 * 1024
    && request.resource.contentType != null
    && (
      request.resource.contentType.matches('image/.*')
      || request.resource.contentType.matches('audio/.*')
    );
  allow read: if request.auth != null && request.auth.uid == authUid;
  allow update, delete: if false;
}
```

No caminho de upload, uso o UID do Firebase Authentication, não a chave antiga do perfil. Compartilho na mensagem a URL de download da mídia; por isso, considero essa URL privada, pois quem a obtiver poderá acessar o arquivo. Mantenho essas regras do Storage separadas das regras do Realtime Database para mensagens e conversas.

##  Como configuro as regras do Firebase (Security Rules)

### Opção 1: Como configuro a autenticação em produção
No Console do Firebase, eu colo as regras abaixo em Realtime Database > Rules:

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

### Opção 2: Como testo temporariamente sem autenticação
Quando estou desenvolvendo e preciso testar sem autenticação, uso estas regras apenas temporariamente:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

**Aviso:** com estas regras, eu libero o acesso a todos. Nunca as uso em produção.

### Opção 3: Como valido regras durante o desenvolvimento
Para desenvolver com mais segurança, uso estas regras:

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

## Como eu publico as regras

1. Eu acesso o [Firebase Console](https://console.firebase.google.com).
2. Abro o projeto `captu-libraly`.
3. No menu, seleciono **Realtime Database**.
4. Abro a aba **Rules**.
5. Colo as regras que escolhi.
6. Clico em **Publish**.

```json
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

### Regras que eu publico no Firebase Storage

No Console do Firebase, eu colo as regras abaixo em **Storage > Rules**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /chat_media/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.size < 52428800; // Eu limito o envio a 50 MB
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

##  O que eu implementei

- Eu permito conversas diretas entre duas pessoas e grupos com vários participantes.
- Eu envio e recebo mensagens de texto, imagens, áudios e vídeos.
- Eu ofereço busca por conversas e acesso ao perfil pelo cabeçalho do chat.
- Eu mostro na lista o título e a última mensagem de cada conversa.
- Eu adapto o layout para desktop, tablet e celular.
- Eu uso um modal para iniciar conversas e selecionar participantes.

Com as Cloud Functions `indexNewConversation` e `syncConversationOnMessage`, crio a conversa na lista de cada participante e mantenho as prévias e as contagens de mensagens não lidas atualizadas. Para habilitar a sincronização, faço o deploy das Functions:

```shell
firebase deploy --only functions
```

##  Como eu uso o chat

### 1. **Como eu abro o chat**
Eu acesso `/Poefo_library/html/chat.html`.

### 2. **Como eu inicio uma conversa direta**
- Eu clico no avatar de alguém em qualquer página.
- Eu seleciono **Mensagem**.
- O chat abre a conversa para mim.

### 3. **Como eu crio um grupo**
- Eu clico no ícone de nova conversa no cabeçalho de Mensagens.
- Eu seleciono os participantes.
- Eu clico em **Criar**.

### 4. **Como eu envio mensagens**
- Eu digito uma mensagem de texto e envio.
- Eu seleciono o controle de imagem para anexar uma imagem.
- Eu seleciono o controle de áudio para gravar e enviar uma mensagem de voz.

### 5. **Como eu abro o perfil de alguém**
- Eu clico no nome da pessoa no cabeçalho.
- O chat abre a página de visualização do perfil.

##  Como eu configuro o chat

### 1. **Como eu identifico a pessoa conectada**
Eu mantenho os dados da sessão no `sessionStorage`:
```javascript
sessionStorage.setItem('currentUserId', 'seu_user_id_firebase');
sessionStorage.setItem('currentUserName', 'Seu Nome');
sessionStorage.setItem('currentUserAvatar', 'url_da_avatar');
```

### 2. **Como eu organizo o perfil no banco**
Eu mantenho `/usuarios` com esta estrutura:
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

### 3. **Como eu habilito uploads**
Eu configuro as regras do Storage para permitir os uploads em `chat_media/`.

##  Como eu adapto o layout a cada tela

- **Desktop**: Eu mostro a lista de conversas e o chat lado a lado.
- **Celular**: Eu recolho a lista e permito abri-la pelo botão de menu (☰).
- **Tablet**: Eu uso um layout intermediário.

##  Limites que eu configurei

1. **Tamanho máximo**: Eu aceito arquivos de até 50 MB.
2. **Formatos documentados**: Eu aceito imagens (jpg, png, webp), áudio (webm) e vídeo (mp4).
3. **Conversas**: Eu não imponho um limite; para mais de 1.000, recomendo considerar paginação.
4. **Atualizações em tempo real**: Eu uso listeners do Firebase, que podem apresentar latência.

##  Como eu investigo problemas
### Se eu receber "Permission denied" ao enviar mensagem
- Eu confiro as regras do Firebase Realtime Database.
- Eu confirmo que a pessoa está autenticada.
- Eu verifico se `sessionStorage.currentUserId` contém o ID correto do perfil.

### Se imagens ou áudios não carregarem
- Eu confiro as regras do Firebase Storage.
- Eu confirmo que o upload terminou com sucesso.
- Eu verifico a URL de download gerada.

### Se o chat não carregar as conversas
- Eu confiro se `/chat_users/{userId}/conversations` existe.
- Eu confirmo as permissões de leitura.
- Eu verifico erros na aba **Network** do console do navegador.

##  Documentação que eu consulto

- [Firebase Realtime Database](https://firebase.google.com/docs/database)
- [Firebase Storage](https://firebase.google.com/docs/storage)
- [Firebase Security Rules](https://firebase.google.com/docs/database/security)

---

**Versão**: 1.0  
**Última atualização**: 20 de fevereiro de 2026  
**Status**: Eu considero o chat pronto para produção após concluir os testes do projeto.
