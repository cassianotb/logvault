#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
system_installer="$script_dir/scripts/install-argus.sh"
collector_installer="$script_dir/scripts/install-edge.sh"
dc_b_installer="$script_dir/scripts/install-dc-b.sh"
system_updater="$script_dir/scripts/update-argus.sh"

read_package_version() {
  local package_file="$script_dir/package.json" version=""
  if [[ -r "$package_file" ]]; then
    version="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$package_file" | head -n 1)"
  fi
  printf '%s' "${version:-desconhecida}"
}

logvault_version="${LOGVAULT_VERSION:-$(read_package_version)}"
logvault_build="${LOGVAULT_BUILD:-}"
if [[ -z "$logvault_build" ]] && command -v git >/dev/null 2>&1 && git -C "$script_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  logvault_build="$(git -C "$script_dir" describe --tags --always --dirty 2>/dev/null || true)"
fi

version_label() {
  printf 'Versão %s' "$logvault_version"
  if [[ -n "$logvault_build" && "$logvault_build" != "$logvault_version" && "$logvault_build" != "v$logvault_version" ]]; then
    printf '  •  build %s' "$logvault_build"
  fi
}

selected_index=0
requested_mode=""
dry_run="false"
preview="false"
disable_color="false"
force_color="false"
forwarded_args=()

usage() {
  cat <<'EOF'
Uso:
  sudo ./install.sh
  sudo ./install.sh system [opções do instalador do sistema]
  sudo ./install.sh collector
  sudo ./install.sh dc-b [opções do instalador do datacenter B]
  sudo ./install.sh update [opções de atualização]

Sem argumentos, abre o assistente interativo para escolher entre:
  system       painel, API, bancos de dados e serviços de ingestão
  collector    coletor local e sincronização segura com o LogVault
  dc-b         instala e sincroniza o servidor standby com o datacenter principal
  update       atualiza somente o Sistema LogVault instalado nesta VM

Opções do assistente:
  --color      força cores, inclusive em terminais identificados como básicos
  --no-color   desativa as cores mesmo em um terminal compatível
  --preview    exibe a interface uma vez, sem executar nenhuma ação
  --dry-run    mostra o instalador que seria chamado, sem executá-lo
  -v, --version exibe a versão do LogVault e encerra
  -h, --help   exibe esta ajuda

As opções adicionais após o perfil são encaminhadas ao instalador correspondente.
Use "./install.sh dc-b --help" para consultar o cadastro seguro do standby.
EOF
}

die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 2
}

shell_quote() {
  local value
  for value in "$@"; do printf '%q ' "$value"; done
  printf '\n'
}

while (($#)); do
  case "$1" in
    --color) force_color="true"; shift ;;
    --no-color) disable_color="true"; force_color="false"; shift ;;
    --preview) preview="true"; shift ;;
    --dry-run) dry_run="true"; shift ;;
    -v|--version) printf 'LogVault %s' "$logvault_version"; [[ -z "$logvault_build" ]] || printf ' (build %s)' "$logvault_build"; printf '\n'; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    system|collector|dc-b|update)
      requested_mode="$1"
      shift
      forwarded_args=("$@")
      break
      ;;
    *) die "opção ou perfil desconhecido: $1" ;;
  esac
done

color_enabled="false"
if [[ "$disable_color" != "true" ]]; then
  if [[ "$force_color" == "true" || -n "${FORCE_COLOR:-}" ]]; then
    color_enabled="true"
  elif [[ -z "${NO_COLOR:-}" && "${TERM:-dumb}" != "dumb" && -t 1 ]]; then
    color_enabled="true"
  fi
fi

if [[ "$color_enabled" == "true" ]]; then
  reset=$'\033[0m'
  bold=$'\033[1m'
  cyan=$'\033[38;2;54;215;255m'
  blue=$'\033[38;2;22;131;255m'
  blue_soft=$'\033[38;2;107;140;255m'
  text=$'\033[38;2;237;244;255m'
  muted=$'\033[38;2;142;162;189m'
  green=$'\033[38;2;42;196;154m'
  selected_bg=$'\033[48;2;18;47;81m'
else
  reset=""; bold=""; cyan=""; blue=""; blue_soft=""; text=""; muted=""; green=""; selected_bg=""
fi

terminal_columns() {
  local columns="80"
  if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then columns="$(tput cols 2>/dev/null || printf 80)"; fi
  [[ "$columns" =~ ^[0-9]+$ ]] || columns=80
  printf '%s' "$columns"
}

print_large_logo() {
  printf '%b%s%b\n' "$cyan$bold"      ' _      ___   ____ __     ___   _   _ _   _____' "$reset"
  printf '%b%s%b\n' "$cyan$bold"      '| |    / _ \ / ___|\ \   / / \ | | | | | |_   _|' "$reset"
  printf '%b%s%b\n' "$blue$bold"      '| |   | | | | |  _  \ \ / / _ \| | | | |   | |' "$reset"
  printf '%b%s%b\n' "$blue$bold"      '| |___| |_| | |_| |  \ V / ___ \ |_| | |___| |' "$reset"
  printf '%b%s%b\n' "$blue_soft$bold" '|_____|\___/ \____|   \_/_/   \_\___/|_____|_|' "$reset"
}

print_compact_logo() {
  printf '%bLOG%b%bVAULT%b\n' "$cyan$bold" "$reset" "$blue$bold" "$reset"
}

render_header() {
  local columns
  columns="$(terminal_columns)"
  if (( columns >= 66 )); then print_large_logo; else print_compact_logo; fi
  printf '%bL O G   I N T E L L I G E N C E%b\n' "$muted" "$reset"
  printf '%b%s%b\n' "$muted" "$(version_label)" "$reset"
  printf '%b──────────────────────────────────────────────────────────────%b\n' "$blue_soft" "$reset"
  printf '%bAssistente de instalação%b\n\n' "$text$bold" "$reset"
}

render_option() {
  local index="$1" number="$2" title="$3" description="$4"
  if (( selected_index == index )); then
    if [[ "$color_enabled" == "true" ]]; then
      printf '%b%b  › %s  %-49s%b\n' "$selected_bg" "$text$bold" "$number" "$title" "$reset"
      printf '%b%b       %-49s%b\n' "$selected_bg" "$muted" "$description" "$reset"
    else
      printf '> %s  %s\n' "$number" "$title"
      printf '     %s\n' "$description"
    fi
  else
    printf '%b  %s  %s%b\n' "$muted" "$number" "$title" "$reset"
    printf '%b     %s%b\n' "$muted" "$description" "$reset"
  fi
  printf '\n'
}

render_menu() {
  render_header
  printf '%bO que deseja fazer neste servidor?%b\n\n' "$text" "$reset"
  render_option 0 1 'Sistema LogVault' 'Painel, API, bancos, proxy e HTTPS automático'
  render_option 1 2 'Coletor local' 'Coleta e envio seguro de registros para o LogVault'
  render_option 2 3 'Datacenter B' 'Instala a VM standby e sincroniza os bancos com o DC-A'
  render_option 3 4 'Atualizar LogVault' 'Atualiza o sistema preservando configurações e dados'
  printf '%b  0  Sair%b\n\n' "$muted" "$reset"
  printf '%b↑/↓ navegar  •  Enter selecionar  •  0 sair%b\n' "$muted" "$reset"
}

clear_terminal() {
  if [[ -t 1 ]]; then printf '\033[2J\033[H'; fi
}

choose_mode() {
  local key="" suffix=""
  [[ -t 0 && -t 1 ]] || die "sem terminal interativo; informe 'system', 'collector', 'dc-b' ou 'update'"
  while true; do
    clear_terminal
    render_menu
    IFS= read -rsn1 key || exit 0
    if [[ "$key" == $'\033' ]]; then
      suffix=""
      IFS= read -rsn2 -t 0.15 suffix || true
      key+="$suffix"
    fi
    case "$key" in
      $'\033[A') selected_index=$(( (selected_index + 3) % 4 )) ;;
      $'\033[B') selected_index=$(( (selected_index + 1) % 4 )) ;;
      1) requested_mode="system"; return ;;
      2) requested_mode="collector"; return ;;
      3) requested_mode="dc-b"; return ;;
      4) requested_mode="update"; return ;;
      0|q|Q) clear_terminal; printf 'Instalação cancelada.\n'; exit 0 ;;
      '')
        case "$selected_index" in
          0) requested_mode="system" ;;
          1) requested_mode="collector" ;;
          2) requested_mode="dc-b" ;;
          3) requested_mode="update" ;;
        esac
        return
        ;;
    esac
  done
}

confirm_mode() {
  local answer=""
  clear_terminal
  render_header
  if [[ "$requested_mode" == "system" ]]; then
    printf '%bPerfil selecionado%b\n' "$blue$bold" "$reset"
    printf '%bSistema LogVault%b\n' "$text$bold" "$reset"
    printf '%bPainel, API, bancos de dados e serviços de ingestão.%b\n\n' "$muted" "$reset"
  elif [[ "$requested_mode" == "collector" ]]; then
    printf '%bPerfil selecionado%b\n' "$blue$bold" "$reset"
    printf '%bColetor local%b\n' "$text$bold" "$reset"
    printf '%bColeta e envio seguro de registros para o LogVault.%b\n\n' "$muted" "$reset"
  elif [[ "$requested_mode" == "dc-b" ]]; then
    printf '%bPerfil selecionado%b\n' "$blue$bold" "$reset"
    printf '%bDatacenter B%b\n' "$text$bold" "$reset"
    printf '%bInstala a VM standby e sincroniza os bancos com o DC-A.%b\n\n' "$muted" "$reset"
  else
    printf '%bAção selecionada%b\n' "$blue$bold" "$reset"
    printf '%bAtualizar LogVault%b\n' "$text$bold" "$reset"
    printf '%bAtualiza somente o sistema principal, preservando configurações e dados.%b\n\n' "$muted" "$reset"
  fi
  printf 'Confirmar e continuar? [S/n]: '
  IFS= read -r answer
  case "$answer" in
    n|N|nao|não|NAO|NÃO)
      if [[ "$disable_color" == "true" ]]; then exec bash "$0" --no-color
      elif [[ "$force_color" == "true" ]]; then exec bash "$0" --color
      else exec bash "$0"
      fi
      ;;
  esac
}

run_installer() {
  local command=()
  if [[ "$requested_mode" == "system" ]]; then
    [[ -r "$system_installer" ]] || die "instalador do sistema não encontrado: $system_installer"
    command=(bash "$system_installer" configure "${forwarded_args[@]}")
  elif [[ "$requested_mode" == "collector" ]]; then
    [[ -r "$collector_installer" ]] || die "instalador do coletor não encontrado: $collector_installer"
    command=(sh "$collector_installer" "${forwarded_args[@]}")
  elif [[ "$requested_mode" == "dc-b" ]]; then
    [[ -r "$dc_b_installer" ]] || die "instalador do DC-B não encontrado: $dc_b_installer"
    command=(bash "$dc_b_installer" install "${forwarded_args[@]}")
  else
    [[ -r "$system_updater" ]] || die "atualizador do sistema não encontrado: $system_updater"
    command=(bash "$system_updater" "${forwarded_args[@]}")
  fi

  if [[ "$dry_run" == "true" ]]; then
    printf '%bComando que seria executado:%b\n' "$green$bold" "$reset"
    shell_quote "${command[@]}"
    return
  fi

  if [[ "$requested_mode" == "update" ]]; then
    printf '%b● Iniciando atualização...%b\n\n' "$green$bold" "$reset"
  else
    printf '%b● Iniciando instalação...%b\n\n' "$green$bold" "$reset"
  fi
  exec "${command[@]}"
}

if [[ "$preview" == "true" ]]; then
  render_menu
  exit 0
fi

interactive_selection="false"
if [[ -z "$requested_mode" ]]; then
  interactive_selection="true"
  choose_mode
fi

if [[ "$interactive_selection" == "true" ]]; then confirm_mode; fi
run_installer
