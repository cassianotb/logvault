# Credenciais da cópia externa

Quando `ARGUS_BACKUP_REMOTE_TARGET` estiver configurado, coloque neste diretório:

- `argus_backup_ssh_key`: chave SSH privada exclusiva e sem senha;
- `argus_backup_known_hosts`: chave pública do servidor remoto obtida por canal confiável.

Não versione nem compartilhe a chave privada. O destino remoto deve existir e aceitar escrita somente pelo usuário dedicado ao LogVault.
