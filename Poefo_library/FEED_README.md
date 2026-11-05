# Como organizei o feed do Poefo

## Como implementei o seguimento

Consultei o estado do seguimento pela Cloud Function autenticada `getFollowStatus` e alterei a relação com `toggleFollow`. Nas duas funções, validei o vínculo entre o perfil solicitante e o UID autenticado. A função atualizou as relações em `follows` e `followers`; o cliente não gravou diretamente nesses caminhos.

Nas páginas de perfil, contei as relações `true` em `follows/{profileId}` para mostrar quem o perfil seguia e em `followers/{profileId}` para mostrar quem o seguia. Não usei os contadores antigos como fonte. Para exibir os totais, publiquei regras de leitura para esses caminhos; quando o Firebase negou a leitura, mostrei `—` em vez de um número incorreto.

Para permitir a leitura dessas relações pelo feed e pelos perfis, mesclei o bloco abaixo em `"rules"`, no **Firebase Console > Realtime Database > Rules**:

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

Preservei as outras regras e removi permissões de gravação amplas, como `".write": true` na raiz ou em um nó ancestral. Nas regras adotadas, a permissão concedida em um nó pai prevaleceu sobre a negação nos filhos. Como atualizei essas relações pela Cloud Function com Admin SDK, não precisei liberar gravação para o cliente.

## Como compartilhei e excluí publicações

No menu de três pontos, pude enviar uma publicação a uma conversa ou excluí-la quando pertencia ao usuário atual. Fiz a exclusão pela Cloud Function `deleteFeedPost`, que conferiu a autoria antes de alterar `livros_json/posts.json` no bucket `captu-libraly.firebasestorage.app`. Por isso, não liberei a gravação desse arquivo para os clientes.

Depois de publicar as regras de leitura, implantei as funções com: 

```shell
firebase deploy --only functions
```


Fiz o deploy no projeto Firebase `captu-libraly`. Se a função de exclusão registrasse um erro de permissão no Cloud Storage, concederia à conta de serviço de runtime das Functions a função IAM **Storage Object Admin** somente no bucket `captu-libraly.firebasestorage.app`.
