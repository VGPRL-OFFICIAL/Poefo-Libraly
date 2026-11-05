# Como organizei o chat do Poefo Libraly

## Como organizei os dados no Firebase (RTDB)

Organizei as conversas nesta estrutura do Firebase Realtime Database:

### Estrutura principal do chat

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

### Outras estruturas relacionadas

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

Usei Firebase Authentication para o login e mantive como identificador de perfil a chave existente em `/usuarios`, preservando conversas, publicações e progresso. Guardei o UID autenticado no campo `authUid` do perfil. Nas regras do Realtime Database, validei essa associação e restringi gravações administrativas a contas autorizadas: autenticar alguém, por si só, não concedeu essas permissões.

```text
/chat_media (Storage)
├── {convId}/
│   ├── {authUid}/img_*.jpg|png|webp
│   ├── {authUid}/audio_*.webm|ogg|m4a
│   └── video_*.mp4
```

Enviei áudios e imagens ao Firebase Storage e guardei na mensagem a URL e o tipo de arquivo para exibir ou reproduzir a mídia. Os arquivos ficaram no Storage de forma independente e não configurei expiração automática.

Implementei a vinculação de livros do catálogo a conversas e grupos em `chat_metadata/{convId}/bookClub`. O cartão do clube de leitura passou a aparecer para os participantes, com opções para alterá-lo ou removê-lo. Também disponibilizei o player de áudio na própria mensagem. Após a primeira interação, o som das mensagens recebidas passou a tocar na aba aberta, sem depender da permissão para notificações do sistema. Mantive `lastMessageSenderId` atualizado pela Cloud Function para evitar o alerta das mensagens enviadas pela própria pessoa.

Implementei a exclusão das próprias mensagens pelo botão de lixeira na conversa. Antes de remover um registro, a Cloud Function `deleteChatMessage` validou a conta autenticada, a participação na conversa e a autoria. Ao apagar a mensagem mais recente, atualizei a prévia e o horário da conversa com base na última mensagem restante, sem alterar os contadores de não lidas. A exclusão da mensagem não removeu o arquivo de mídia correspondente do Storage.

Publiquei essa função com `firebase deploy --only functions:deleteChatMessage`. A página do chat também carregou o SDK de Cloud Functions usado para chamar a validação no servidor.

Adaptei a caixa de composição ao fluxo flexível do chat, mantendo os botões de imagem, áudio e envio sem encolher em telas estreitas. No celular, reduzi os espaçamentos e respeitei a área segura inferior do dispositivo.

Removi conversas diretas duplicadas pelo mesmo par de participantes ao montar o histórico. Enquanto uma conversa permanecia aberta, mantive sua posição na lista mesmo quando chegava uma mensagem; nas demais, atualizei a prévia, movi a conversa para o topo e preservei o contador de não lidas até que fosse aberta.

Configurei notificações push com dados para que o service worker pudesse exibi-las mesmo com o chat fechado. Cada conversa passou a usar uma notificação do sistema, atualizada em vez de duplicada; ao tocar nela, a pessoa abria a conversa correspondente. O botão de sino passou a ativar as notificações, solicitar permissão e validar o token FCM. Depois da ativação, o botão alternava o som sem desligar os avisos visuais. Salvei essa preferência no perfil e apliquei o modo silencioso na página aberta e em segundo plano.

Solicitei a permissão do navegador somente quando a pessoa ativava o botão de sino no chat. Em seguida, salvei o token FCM no perfil, registrei o listener para a aba aberta e mantive o service worker para receber push em segundo plano. Também carreguei o listener de primeiro plano nas outras páginas que usavam a configuração Firebase, permitindo que uma aba aberta fora do chat exibisse a notificação do sistema. Usei o envio HTTP v1 do Firebase Admin SDK e removi tokens expirados para evitar o acúmulo de registros inválidos.

Para habilitar as notificações com a página fechada, ativei o botão de sino e permiti notificações para o site nas configurações do navegador. Quando o navegador não gerou um token push, configurei a chave pública Web Push em **Firebase Console > Configurações do projeto > Cloud Messaging > Certificados Web Push** e substituí `COLOQUE_SUA_PUBLIC_VAPID_KEY_AQUI` pela chave pública em `scripts/firebase-config.js` e `html/chat.html`. Sem permissão do navegador ou token FCM válido, não foi possível entregar notificações em segundo plano.

Publiquei o controle de modo silencioso e o envio de push com:

```shell
firebase deploy --only functions:setChatSilentMode,functions:notifyNewMessage
```

Também publiquei o service worker e a interface do chat nos Hosting configurados.

Registrei cada conexão ativa em `presence/{userId}/connections`. O Firebase removeu a conexão automaticamente quando o dispositivo desconectou; o cabeçalho mostrou o estado do contato ou quantas pessoas estavam online no grupo. Removi os listeners da conversa anterior antes de abrir outra para evitar que mensagens e estados de presença vazassem entre conversas.

Para permitir a leitura do status e limitar cada pessoa às próprias conexões, mesclei estas regras em `rules` no Console do Firebase e preservei as demais regras existentes:

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

### Regras configuradas no Firebase Storage para mídias do chat

No Console do Firebase, abri **Storage > Rules** e adicionei ou mesclei o bloco abaixo dentro de `match /b/{bucket}/o`. Preservei as regras existentes para os outros arquivos do Storage:

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

No caminho de upload, usei o UID do Firebase Authentication, não a chave antiga do perfil. Compartilhei a URL de download da mídia na mensagem e, por isso, considerei essa URL privada: quem a obtivesse poderia acessar o arquivo. Mantive essas regras do Storage separadas das regras do Realtime Database para mensagens e conversas.

## Como configurei as regras do Firebase (Security Rules)

### Opção 1: Autenticação em produção
No Console do Firebase, publiquei as regras abaixo em **Realtime Database > Rules**:

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

### Opção 2: Testes temporários sem autenticação
Durante o desenvolvimento, usei estas regras apenas para testes sem autenticação:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```


**Aviso:** estas regras liberaram o acesso a todos e não foram usadas em produção.

### Opção 3: Validação durante o desenvolvimento
Para validar as regras durante o desenvolvimento, usei esta configuração:

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

## Como publiquei as regras


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

### Regras publicadas no Firebase Storage

No Console do Firebase, publiquei as regras abaixo em **Storage > Rules**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /chat_media/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.size < 52428800; // limite de envio: 50 MB
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

## O que implementei

- Implementei conversas diretas entre duas pessoas e grupos com vários participantes.
- Enviei e recebi mensagens de texto, imagens, áudios e vídeos.
- Incluí busca por conversas e acesso ao perfil pelo cabeçalho do chat.
- Exibi na lista o título e a última mensagem de cada conversa.
- Adaptei o layout para desktop, tablet e celular.
- Usei um modal para iniciar conversas e selecionar participantes.

Com as Cloud Functions `indexNewConversation` e `syncConversationOnMessage`, criei a conversa na lista de cada participante e mantive atualizadas as prévias e as contagens de mensagens não lidas. Habilitei a sincronização com o deploy das Functions:

```shell
firebase deploy --only functions
```

Nas conversas diretas, gerei o título e a foto de cada item a partir do perfil da outra pessoa, sem reutilizar a identidade de quem criou a conversa. Quando uma mensagem chegava, atualizava a prévia, a posição da conversa e a contagem de não lidas; a notificação aparecia apenas quando a conversa não estava aberta.

## Como usei o chat

### 1. **Como abri o chat**
Acessei `/Poefo_library/html/chat.html`.

### 2. **Como iniciei uma conversa direta**
- Cliquei no avatar de alguém em uma página.
- Selecionei **Mensagem**.
- O chat abriu a conversa.

### 3. **Como criei um grupo**
- Cliquei no ícone de nova conversa no cabeçalho de Mensagens.
- Selecionei os participantes.
- Cliquei em **Criar**.

### 4. **Como enviei mensagens**
- Digitei e enviei uma mensagem de texto.
- Selecionei o controle de imagem para anexar uma imagem.
- Selecionei o controle de áudio para gravar e enviar uma mensagem de voz.

### 5. **Como abri o perfil de alguém**
- Cliquei no nome da pessoa no cabeçalho.
- O chat abriu a página de visualização do perfil.

## Como configurei o chat

### 1. **Como identifiquei a pessoa conectada**
Mantive os dados da sessão no `sessionStorage`:
```javascript
sessionStorage.setItem('currentUserId', 'seu_user_id_firebase');
sessionStorage.setItem('currentUserName', 'Seu Nome');
sessionStorage.setItem('currentUserAvatar', 'url_da_avatar');
```

### 2. **Como organizei o perfil no banco**
Mantive `/usuarios` com esta estrutura:
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

### 3. **Como habilitei uploads**
Configurei as regras do Storage para permitir uploads em `chat_media/`.

## Como adaptei o layout a cada tela

- **Desktop**: Exibi a lista de conversas e o chat lado a lado.
- **Celular**: Recolhi a lista e permiti abri-la pelo botão de menu (☰).
- **Tablet**: Usei um layout intermediário.

## Limites que configurei

1. **Tamanho máximo**: aceitei arquivos de até 50 MB.
2. **Formatos documentados**: aceitei imagens (jpg, png, webp), áudio (webm) e vídeo (mp4).
3. **Conversas**: não impus um limite; para mais de 1.000, recomendei considerar paginação.
4. **Atualizações em tempo real**: usei listeners do Firebase, sujeitos a latência.

## Como investiguei problemas
### Se recebi "Permission denied" ao enviar mensagem
- Conferi as regras do Firebase Realtime Database.
- Confirmei que a pessoa estava autenticada.
- Verifiquei se `sessionStorage.currentUserId` continha o ID correto do perfil.

### Se imagens ou áudios não carregarem
- Conferi as regras do Firebase Storage.
- Confirmei que o upload havia terminado com sucesso.
- Verifiquei a URL de download gerada.

### Se o chat não carregar as conversas
- Conferi se `/chat_users/{userId}/conversations` existia.
- Confirmei as permissões de leitura.
- Verifiquei erros na aba **Network** do console do navegador.

## Documentação consultada

- [Firebase Realtime Database](https://firebase.google.com/docs/database)
- [Firebase Storage](https://firebase.google.com/docs/storage)
- [Firebase Security Rules](https://firebase.google.com/docs/database/security)

---

**Versão**: 1.0  
**Última atualização**: 20 de fevereiro de 2026  
**Status**: Considerei o chat pronto para produção após concluir os testes do projeto.
