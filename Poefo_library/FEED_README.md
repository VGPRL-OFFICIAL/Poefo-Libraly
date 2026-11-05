# Como eu organizei o feed do Poefo

## Como eu implementei o seguimento

Eu consulto o estado do seguimento pela Cloud Function autenticada `getFollowStatus` e altero a relação com `toggleFollow`. Nas duas funções, valido o vínculo entre o perfil solicitante e o UID autenticado. A função atualiza as relações em `follows` e `followers`; o cliente não grava diretamente nesses caminhos.

Nas páginas de perfil, conto as relações `true` em `follows/{profileId}` para mostrar quem o perfil segue e em `followers/{profileId}` para mostrar quem segue o perfil. Não uso os contadores antigos como fonte. Para exibir os totais, publico regras de leitura para esses caminhos; se o Firebase negar a leitura, mostro `—` em vez de um número incorreto.

Para permitir que o feed e os perfis leiam essas relações, eu mesclo o bloco abaixo dentro de `"rules"` em Firebase Console > Realtime Database > Rules:

```json
"follows": {
  "$profileId": {
    ".read": true,
    ".write": false
  }
},
"followers": {
  "$profileId": {
    ".read": true,
    ".write": false
  }
},
"followers_count": {
  "$profileId": {
    ".read": true,
    ".write": false
  }
},
"following_count": {
  "$profileId": {
    ".read": true,
    ".write": false
  }
}
```

Eu preservo as outras regras e removo permissões de gravação amplas, como `".write": true` na raiz ou em um nó ancestral. No Realtime Database, uma permissão concedida em um nó pai prevalece sobre a negação nos filhos. Como atualizo essas relações pela Cloud Function com Admin SDK, não preciso liberar gravação para o cliente.

## Como eu compartilho e excluo publicações

No menu de três pontos, posso enviar uma publicação a uma conversa ou excluí-la quando ela pertence ao usuário atual. Faço a exclusão pela Cloud Function `deleteFeedPost`, que confere a autoria antes de alterar `livros_json/posts.json` no bucket `captu-libraly.firebasestorage.app`. Por isso, não libero a gravação desse arquivo para os clientes.

Depois que publico as regras de leitura, implanto as funções com:

```shell
firebase deploy --only functions
```

Faço o deploy no projeto Firebase `captu-libraly`. Se a função de exclusão registrar um erro de permissão no Cloud Storage, concedo à conta de serviço de runtime das Functions a função IAM **Storage Object Admin** somente no bucket `captu-libraly.firebasestorage.app`.
