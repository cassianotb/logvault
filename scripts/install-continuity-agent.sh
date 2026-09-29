#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="${1:?repositório ausente}"
env_file="${2:?arquivo de ambiente ausente}"
control_root="${3:?diretório de controle ausente}"
[[ $(id -u) -eq 0 ]] || { printf 'ERRO: instalação do agente exige root\n' >&2; exit 2; }
for value in "$repo_root" "$env_file" "$control_root"; do
  [[ "$value" == /* && "$value" != *[[:space:]]* ]] || { printf 'ERRO: caminho absoluto sem espaços é obrigatório\n' >&2; exit 2; }
done
command -v systemctl >/dev/null 2>&1 || { printf 'ERRO: systemd é obrigatório para o agente de continuidade\n' >&2; exit 2; }

install -d -m 0755 /usr/local/libexec
install -m 0755 "$repo_root/scripts/continuity-host-agent.sh" /usr/local/libexec/logvault-continuity-agent
install -d -m 0755 /etc/logvault
{
  printf 'LOGVAULT_REPO_ROOT=%q\n' "$repo_root"
  printf 'LOGVAULT_ENV_FILE=%q\n' "$env_file"
  printf 'LOGVAULT_CONTROL_ROOT=%q\n' "$control_root"
} >/etc/logvault/continuity-agent.conf
chmod 0600 /etc/logvault/continuity-agent.conf

sed "s|@CONTROL_ROOT@|$control_root|g" "$repo_root/infra/systemd/logvault-continuity-agent.path" \
  >/etc/systemd/system/logvault-continuity-agent.path
install -m 0644 "$repo_root/infra/systemd/logvault-continuity-agent.service" /etc/systemd/system/logvault-continuity-agent.service
systemctl daemon-reload
systemctl enable --now logvault-continuity-agent.path
