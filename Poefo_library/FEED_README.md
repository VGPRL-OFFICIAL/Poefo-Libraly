# Feed Poefo

## Seguir e deixar de seguir

O botão de seguimento consulta o estado com a Cloud Function autenticada `getFollowStatus` e altera a relação por `toggleFollow`. As funções validam que o perfil do solicitante está vinculado ao UID autenticado e atualizam os registros `follows`, `followers` e seus contadores. O cliente não deve gravar diretamente nesses caminhos.

As páginas de perfil calculam os totais reais contando os vínculos `true` em `follows/{profileId}` (pessoas que o perfil segue) e `followers/{profileId}` (pessoas que seguem o perfil); os campos de contador antigos não são usados como fonte. As regras de leitura desses dois caminhos precisam estar publicadas para exibir os totais. Se a leitura for negada, o perfil mostra `—` em vez de um total incorreto.

Para permitir que o feed e os perfis leiam os relacionamentos, mescle este bloco dentro de `"rules"` no Firebase Console > Realtime Database > Rules:

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

Não apague as outras regras. Remova permissões de gravação mais amplas, como `".write": true` no nível raiz ou em qualquer ancestral desses caminhos: no Realtime Database, uma permissão concedida por um nó pai prevalece sobre a negação nos filhos. A Cloud Function usa Admin SDK e continua podendo atualizar esses dados.

## Compartilhar e excluir publicações

O menu de três pontos permite enviar uma publicação a uma conversa ou excluí-la se ela pertencer ao usuário atual. A exclusão é feita pela Cloud Function `deleteFeedPost`, que confere o autor antes de alterar `livros_json/posts.json` no bucket `captu-libraly.firebasestorage.app`. Não é necessário liberar gravação do arquivo `posts.json` para os clientes.

Depois de publicar as regras de leitura, implante as funções:

```shell
firebase deploy --only functions
```

O deploy deve ser feito no projeto Firebase `captu-libraly`. Se a função de exclusão registrar erro de permissão no Cloud Storage, conceda à conta de serviço de runtime das Functions a função IAM **Storage Object Admin** apenas no bucket `captu-libraly.firebasestorage.app`.
